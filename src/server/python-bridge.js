const { spawn } = require('child_process');
const path = require('path');

let pythonProcess = null;
let pendingResolve = null;
let pendingReject = null;
let buffer = '';

function start() {
    const scriptPath = path.join(__dirname, '..', '..', 'python', 'kernel_client.py');

    pythonProcess = spawn('python3', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    pythonProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const result = JSON.parse(line);
                if (pendingResolve) {
                    const resolve = pendingResolve;
                    pendingResolve = null;
                    resolve({
                        output: result.output || '',
                        error: result.error === true,
                        images: result.images || [],
                    });
                }
            } catch {
                // malformed JSON, skip
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error('[python:err]', data.toString());
    });

    pythonProcess.on('exit', (code) => {
        console.log(`Python process exited with code ${code}`);
        pythonProcess = null;
        if (pendingReject) {
            pendingReject(new Error('Python process exited'));
            pendingReject = null;
        }
    });

    pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err.message);
        pythonProcess = null;
        if (pendingReject) {
            pendingReject(err);
            pendingReject = null;
        }
    });
}

function execute(code) {
    return new Promise((resolve, reject) => {
        if (!pythonProcess) {
            reject(new Error('Python process not running'));
            return;
        }

        pendingResolve = resolve;
        pendingReject = reject;

        const msg = JSON.stringify({ type: 'execute', code }) + '\n';
        pythonProcess.stdin.write(msg);
    });
}

function interrupt() {
    if (pythonProcess) {
        pythonProcess.kill('SIGINT');
        if (pendingReject) {
            pendingReject(new Error('Execution interrupted'));
            pendingReject = null;
            pendingResolve = null;
        }
    }
}

function restart() {
    stop();
    start();
}

function stop() {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
    }
    if (pendingReject) {
        pendingReject(new Error('Kernel stopped'));
        pendingReject = null;
        pendingResolve = null;
    }
}

module.exports = { start, execute, interrupt, restart, stop };
