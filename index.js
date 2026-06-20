const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { default: open } = require('open');
const pythonBridge = require('./src/server/python-bridge');
const { streamChat } = require('./src/server/llm');
const { PROVIDERS } = require('./src/providers');

let execCounter = 0;
let agentCellCounter = 0;
let notebookCells = [];

function startServer(port) {
    const app = express();
    const server = http.createServer(app);

    app.use(express.static(path.join(__dirname, 'public')));

    const wss = new WebSocketServer({ server });

    // Periodic ping to prevent proxy timeouts from killing idle connections
    const keepaliveInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.readyState === 1) ws.ping();
        });
    }, 25000);

    pythonBridge.start();

    function handleFsList(ws, msg) {
        const requested = msg.path || '.';
        const resolved = path.resolve(process.cwd(), requested);
        if (!resolved.startsWith(process.cwd())) {
            ws.send(JSON.stringify({ type: 'fs:list', path: requested, files: [] }));
            return;
        }
        try {
            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            const files = entries
                .filter(e => !e.name.startsWith('.'))
                .map(e => ({
                    name: e.name,
                    isDir: e.isDirectory(),
                    size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : 0,
                }))
                .sort((a, b) => {
                    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            ws.send(JSON.stringify({ type: 'fs:list', path: requested, files }));
        } catch {
            ws.send(JSON.stringify({ type: 'fs:list', path: requested, files: [] }));
        }
    }

    async function handleCellExecute(ws, msg) {
        execCounter++;
        const cellId = msg.cellId;
        const code = msg.code || '';
        const count = execCounter;

        const onOutput = (token) => {
            ws.send(JSON.stringify({
                type: 'cell:output',
                cellId,
                token,
                stream: true,
                executionCount: count,
            }));
        };

        try {
            const result = await pythonBridge.execute(code, onOutput);
            ws.send(JSON.stringify({
                type: 'cell:output',
                cellId,
                output: result.output,
                executionCount: count,
                error: result.error,
                images: result.images || [],
                done: true,
            }));
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'cell:output',
                cellId,
                output: `Error: ${err.message}`,
                executionCount: count,
                error: true,
                done: true,
            }));
        }
    }

    function readFileSafe(filePath) {
        const resolved = path.resolve(process.cwd(), filePath);
        if (!resolved.startsWith(process.cwd())) {
            return { error: 'Access denied' };
        }
        try {
            const content = fs.readFileSync(resolved, 'utf-8');
            return { content };
        } catch (err) {
            return { error: err.message };
        }
    }

    function makeToolExecutor(ws) {
        return async function executeTool(name, args) {
            switch (name) {
                case 'run_cell': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: `Running ${args.cellId}...` }));
                    ws.send(JSON.stringify({ type: 'cell:started', cellId: args.cellId }));
                    const cell = notebookCells.find(c => c.id === args.cellId);
                    if (!cell) return { error: `Cell ${args.cellId} not found` };
                    if (cell.type === 'markdown') {
                        ws.send(JSON.stringify({ type: 'agent:status', status: 'Contemplating...' }));
                        return { error: "Cannot execute markdown cells. Please use code cells for execution." };
                    }
                    const onRunOutput = (token) => {
                        ws.send(JSON.stringify({
                            type: 'cell:output',
                            cellId: args.cellId,
                            token,
                            stream: true,
                            executionCount: 0,
                        }));
                    };
                    const result = await pythonBridge.execute(cell.content || '', onRunOutput);
                    cell.output = result.output;
                    cell.error = result.error || null;
                    cell.executionCount = null;
                    ws.send(JSON.stringify({
                        type: 'cell:output',
                        cellId: args.cellId,
                        output: result.output,
                        executionCount: 0,
                        error: result.error || false,
                        images: result.images || [],
                        done: true,
                    }));
                    ws.send(JSON.stringify({ type: 'agent:status', status: 'Contemplating...' }));
                    const toolOutput = result.output || (result.error ? '' : 'Success');
                    return { output: toolOutput, error: result.error };
                }

                case 'create_cell': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: 'Creating cell...' }));
                    const content = (args.content || '').trim();
                    const existing = notebookCells.find(c => c.content === '' && c.id.startsWith('agent_cell_'));
                    if (existing) {
                        existing.content = content;
                        existing.type = args.type || 'code';
                        return { cellId: existing.id, type: existing.type };
                    }
                    const cellId = `agent_cell_${++agentCellCounter}`;
                    const newCell = { id: cellId, type: args.type || 'code', content, output: null, executionCount: null, error: null };
                    notebookCells.push(newCell);
                    ws.send(JSON.stringify({
                        type: 'cell:add',
                        cellId,
                        cellType: newCell.type,
                        content,
                        index: args.index,
                    }));
                    return { cellId, type: newCell.type };
                }

                case 'edit_cell': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: `Editing ${args.cellId}...` }));
                    const content = (args.content || '').trim();
                    const cell = notebookCells.find(c => c.id === args.cellId);
                    if (cell) cell.content = content;
                    ws.send(JSON.stringify({
                        type: 'cell:update',
                        cellId: args.cellId,
                        content,
                    }));
                    return { cellId: args.cellId, updated: true };
                }

                case 'delete_cell': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: `Deleting ${args.cellId}...` }));
                    notebookCells = notebookCells.filter(c => c.id !== args.cellId);
                    ws.send(JSON.stringify({
                        type: 'cell:delete',
                        cellId: args.cellId,
                    }));
                    return { cellId: args.cellId, deleted: true };
                }

                case 'list_files': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: 'Browsing files...' }));
                    const requested = args.path || '.';
                    const resolved = path.resolve(process.cwd(), requested);
                    if (!resolved.startsWith(process.cwd())) {
                        return { error: 'Access denied', files: [] };
                    }
                    try {
                        const entries = fs.readdirSync(resolved, { withFileTypes: true });
                        const files = entries
                            .filter(e => !e.name.startsWith('.'))
                            .map(e => ({
                                name: e.name,
                                isDir: e.isDirectory(),
                                size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : 0,
                            }))
                            .sort((a, b) => {
                                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                                return a.name.localeCompare(b.name);
                            });
                        return { path: requested, files };
                    } catch {
                        return { path: requested, files: [], error: 'Failed to list directory' };
                    }
                }

                case 'read_file': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: 'Reading file...' }));
                    const result = readFileSafe(args.path);
                    return result;
                }

                case 'get_cells': {
                    ws.send(JSON.stringify({ type: 'agent:status', status: 'Inspecting notebook...' }));
                    return { cells: notebookCells.map(c => ({ id: c.id, type: c.type, content: c.content, output: c.output, error: c.error })) };
                }

                default:
                    return { error: `Unknown tool: ${name}` };
            }
        };
    }

    async function handleAgentMessage(ws, msg) {
        const providerId = msg.provider || 'openrouter';
        const provider = PROVIDERS[providerId];
        if (!provider) {
            ws.send(JSON.stringify({
                type: 'agent:reply',
                done: true,
                error: `Unknown provider: ${providerId}`,
            }));
            return;
        }

        const apiKey = process.env[provider.envKey];
        if (!apiKey) {
            ws.send(JSON.stringify({
                type: 'agent:reply',
                done: true,
                error: `${provider.envKey} not set. Add it to environment variables.`,
            }));
            return;
        }

        const history = msg.history || [];
        const userText = msg.text || '';

        // Sync server-side cell state
        if (msg.cells) {
            notebookCells = msg.cells.map(c => ({ ...c }));
        }

        const requestAbortControllers = new Map();
        const executeTool = makeToolExecutor(ws, requestAbortControllers);

        let baseUrl = provider.baseUrl;
        if (providerId === 'cloudflare') {
            const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
            baseUrl = baseUrl.replace('{CLOUDFLARE_ACCOUNT_ID}', accountId);
        }

        const sendStatus = (status) => {
            ws.send(JSON.stringify({ type: 'agent:status', status }));
        };

        // Create abort controller for this request
        const abortController = new AbortController();
        ws._abortController = abortController;

        try {
            const stream = streamChat(userText, history, msg.model, apiKey, executeTool, baseUrl, sendStatus, abortController.signal);
            for await (const token of stream) {
                if (abortController.signal.aborted) break;
                ws.send(JSON.stringify({
                    type: 'agent:reply',
                    token,
                    done: false,
                }));
            }
            if (abortController.signal.aborted) {
                ws.send(JSON.stringify({
                    type: 'agent:reply',
                    done: true,
                    error: 'Generation cancelled',
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'agent:reply',
                    done: true,
                }));
            }
        } catch (err) {
            if (err.name === 'AbortError' || abortController.signal.aborted) {
                ws.send(JSON.stringify({
                    type: 'agent:reply',
                    done: true,
                    error: 'Generation cancelled',
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'agent:reply',
                    token: `Error: ${err.message}`,
                    done: true,
                    error: true,
                }));
            }
        }
    }

    wss.on('connection', (ws) => {
        console.log('Client connected');

        // Send provider availability status
        const providerStatus = {};
        for (const [id, p] of Object.entries(PROVIDERS)) {
            providerStatus[id] = !!process.env[p.envKey];
        }
        ws.send(JSON.stringify({ type: 'providers:status', providers: providerStatus }));

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }

            switch (msg.type) {
                case 'cell:execute':
                    handleCellExecute(ws, msg);
                    break;

                case 'agent:message':
                    handleAgentMessage(ws, msg);
                    break;

                case 'fs:list':
                    handleFsList(ws, msg);
                    break;

                case 'kernel:interrupt':
                    pythonBridge.interrupt();
                    ws.send(JSON.stringify({ type: 'kernel:status', status: 'interrupted' }));
                    break;

                case 'kernel:restart':
                    pythonBridge.restart();
                    ws.send(JSON.stringify({ type: 'kernel:status', status: 'restarted' }));
                    break;

                case 'agent:cancel':
                    if (ws._abortController) {
                        ws._abortController.abort();
                    }
                    break;

                default:
                    break;
            }
        });

        ws.on('close', () => console.log('Client disconnected'));
    });

    server.listen(port, async () => {
        const url = `http://localhost:${port}`;
        console.log(`Web UI running at: ${url}`);
        console.log('Press Ctrl+C to stop.');

        await open(url);
    });
}

module.exports = { startServer };
