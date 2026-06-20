import React, { useState, useEffect, useRef, useCallback } from 'react';
import Notebook from './components/Notebook';
import ChatSidebar from './components/ChatSidebar';
import Toolbar from './components/Toolbar';
import FileBrowser from './components/FileBrowser';
import { PROVIDERS } from '../providers.js';

let cellCounter = 0;
function generateCellId() {
  return `cell_${++cellCounter}`;
}

function createCell(type = 'code', content = '') {
  return { id: generateCellId(), type, content, output: null, executionCount: null, error: null };
}

function parseIpynb(json) {
  if (!json.cells || !Array.isArray(json.cells)) return null;
  const cells = [];
  for (const c of json.cells) {
    const source = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
    const type = c.cell_type === 'markdown' ? 'markdown' : 'code';
    let output = null;
    let error = null;
    if (c.outputs && c.outputs.length > 0) {
      const last = c.outputs[c.outputs.length - 1];
      if (last.output_type === 'error') {
        output = (last.traceback || []).join('\n') || last.evalue || '';
        error = true;
      } else if (last.text) {
        output = Array.isArray(last.text) ? last.text.join('') : last.text;
      }
    }
    cells.push({ id: generateCellId(), type, content: source, output, executionCount: c.execution_count || null, error });
  }
  return cells;
}

export default function App() {
  const [cells, setCells] = useState([]);
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState('nvidia/nemotron-3-nano-30b-a3b:free');
  const [provider, setProvider] = useState('openrouter');
  const [providerStatus, setProviderStatus] = useState({});
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [activeCellId, setActiveCellId] = useState(null);
  const [files, setFiles] = useState([]);
  const [fsPath, setFsPath] = useState('.');
  const [showFileBrowser, setShowFileBrowser] = useState(true);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const wsRef = useRef(null);
  const streamingRef = useRef('');
  const clipboardRef = useRef(null);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [runningCellId, setRunningCellId] = useState(null);
  const cellDoneCallbacks = useRef({});

  // Reset model when provider changes
  useEffect(() => {
    const p = PROVIDERS[provider];
    if (p) setModel(p.defaultModel);
  }, [provider]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const send = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  const requestFileList = useCallback((path) => {
    send('fs:list', { path });
  }, [send]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      requestFileList('.');
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'notebook:state':
          setCells(msg.cells);
          break;
        case 'cell:output':
          if (msg.stream) {
            setCells(prev => prev.map(c =>
              c.id === msg.cellId
                ? { ...c, output: (c.output || '') + msg.token, executionCount: msg.executionCount, error: false, images: [] }
                : c
            ));
          } else {
            setCells(prev => prev.map(c =>
              c.id === msg.cellId
                ? { ...c, output: msg.output, executionCount: msg.executionCount, error: msg.error === true, images: msg.images || [] }
                : c
            ));
          }
          break;
        case 'agent:reply':
          if (msg.done) {
            let content;
            let error;
            if (msg.error === 'Generation cancelled') {
              content = '*Cancelled*';
              error = null;
            } else {
              content = (streamingRef.current + (msg.token || '')).trim();
              error = msg.error;
            }
            setMessages(prev => [...prev, { role: 'assistant', content, ...(error ? { error } : {}) }]);
            streamingRef.current = '';
            setStreamingMessage('');
            setIsThinking(false);
            setAgentStatus('');
          } else {
            const token = msg.token || '';
            if (!streamingRef.current && token) {
              streamingRef.current += token.trimStart();
              setAgentStatus('');
            } else {
              streamingRef.current += token;
            }
            setStreamingMessage(streamingRef.current);
            if (token) setIsThinking(false);
          }
          break;
        case 'agent:action':
          break;
        case 'agent:status':
          setAgentStatus(msg.status || '');
          break;
        case 'cell:add':
          setCells(prev => {
            let idx;
            if (msg.index !== undefined && msg.index !== null) {
              idx = Math.min(msg.index, prev.length);
            } else {
              idx = prev.length;
            }
            const newCell = { id: msg.cellId, type: msg.cellType || 'code', content: msg.content || '', output: null, executionCount: null, error: null };
            const copy = [...prev];
            copy.splice(idx, 0, newCell);
            return copy;
          });
          break;
        case 'cell:update':
          setCells(prev => prev.map(c => c.id === msg.cellId ? { ...c, content: msg.content !== undefined ? msg.content : c.content } : c));
          break;
        case 'cell:delete':
          setCells(prev => {
            const next = prev.filter(c => c.id !== msg.cellId);
            return next;
          });
          if (activeCellId === msg.cellId) setActiveCellId(null);
          break;
        case 'kernel:status':
          if (msg.status === 'restarted') {
            setCells(prev => prev.map(c => ({ ...c, output: null, executionCount: null, error: null })));
          }
          break;
        case 'providers:status':
          setProviderStatus(msg.providers || {});
          break;
        case 'fs:list':
          setFiles(msg.files || []);
          setFsPath(msg.path || '.');
          break;
      }
    };

    return () => ws.close();
  }, []);

  const handleCellUpdate = useCallback((cellId, content, type) => {
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, content, type: type || c.type } : c));
    send('cell:update', { cellId, content, type });
  }, [send]);

  const handleCellDelete = useCallback((cellId) => {
    setCells(prev => {
      const next = prev.filter(c => c.id !== cellId);
      return next;
    });
    if (activeCellId === cellId) setActiveCellId(null);
    send('cell:delete', { cellId });
  }, [send, activeCellId]);

  const handleCellAdd = useCallback((type = 'code', index) => {
    const newCell = createCell(type);
    setCells(prev => {
      const idx = index ?? prev.length;
      const copy = [...prev];
      copy.splice(idx, 0, newCell);
      return copy;
    });
    setActiveCellId(newCell.id);
    send('cell:add', { type, index });
  }, [send]);

    const handleCellExecute = useCallback(async (cellId) => {
      const cell = cells.find(c => c.id === cellId);
      if (!cell) return;

      setRunningCellId(cellId);
      setCells(prev => prev.map(c =>
        c.id === cellId ? { ...c, output: null, executionCount: null, error: null } : c
      ));
      send('cell:execute', { cellId, code: cell.content });
    }, [cells, send]);

    const handleRunAll = useCallback(async () => {
      if (!cells.length) return;

      let runningCount = 0;
      const runNext = async (index) => {
        if (index >= cells.length) {
          setRunningCellId(null);
          return;
        }

        const cell = cells[index];
        if (cell.type === 'code' && cell.content.trim()) {
          setRunningCellId(cell.id);
          setCells(prev => prev.map(c =>
            c.id === cell.id ? { ...c, output: null, executionCount: null, error: null } : c
          ));
          send('cell:execute', { cellId: cell.id, code: cell.content });

          // Wait for this cell to complete before running the next
          await new Promise(resolve => {
            const check = () => {
              const c = cells.find(c => c.id === cell.id);
              if (c && (c.output !== null || c.error === true)) {
                resolve();
              } else {
                setTimeout(check, 100);
              }
            };
            check();
          });

          // Small delay between cells
          setTimeout(() => {
            runNext(index + 1);
          }, 500);
        } else {
          runNext(index + 1);
        }
      };

      runNext(0);
    }, [cells, send]);

  const handleRunSelected = useCallback(() => {
    if (activeCellId) handleCellExecute(activeCellId);
  }, [activeCellId, handleCellExecute]);

  const handleRunAbove = useCallback(() => {
    const idx = cells.findIndex(c => c.id === activeCellId);
    if (idx <= 0) return;
    for (let i = 0; i < idx; i++) {
      const c = cells[i];
      if (c.type === 'code' && c.content.trim()) {
        send('cell:execute', { cellId: c.id, code: c.content });
      }
    }
  }, [cells, activeCellId, send]);

  const handleRunBelow = useCallback(() => {
    const idx = cells.findIndex(c => c.id === activeCellId);
    if (idx < 0 || idx >= cells.length - 1) return;
    for (let i = idx; i < cells.length; i++) {
      const c = cells[i];
      if (c.type === 'code' && c.content.trim()) {
        send('cell:execute', { cellId: c.id, code: c.content });
      }
    }
  }, [cells, activeCellId, send]);

  const handleAgentMessage = useCallback((text) => {
    setIsThinking(true);
    setAgentStatus('Contemplating...');
    setMessages(prev => {
      const next = [...prev, { role: 'user', content: text }];
      send('agent:message', { text, model, provider, history: next, cells });
      return next;
    });
  }, [send, model, provider, cells]);

  const handleCancel = useCallback(() => {
    send('agent:cancel');
  }, [send]);

  const handleDownload = useCallback(() => {
    const nb = {
      nbformat: 4, nbformat_minor: 5,
      cells: cells.map(c => ({
        cell_type: c.type,
        source: c.content.split('\n').map(l => l + '\n'),
        metadata: {},
        ...(c.output ? { outputs: [{ output_type: 'stream', name: c.error ? 'stderr' : 'stdout', text: [c.output] }] } : {}),
      })),
      metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
    };
    const blob = new Blob([JSON.stringify(nb, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notebook.ipynb';
    a.click();
    URL.revokeObjectURL(url);
  }, [cells]);

  const handleImport = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const parsed = parseIpynb(json);
        if (parsed) setCells(parsed);
      } catch (err) {
        console.error('Failed to import .ipynb:', err);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleCutCell = useCallback(() => {
    const cell = cells.find(c => c.id === activeCellId);
    if (!cell) return;
    clipboardRef.current = { ...cell };
    handleCellDelete(cell.id);
  }, [cells, activeCellId, handleCellDelete]);

  const handleCopyCell = useCallback(() => {
    const cell = cells.find(c => c.id === activeCellId);
    if (!cell) return;
    clipboardRef.current = { ...cell, id: undefined };
  }, [cells, activeCellId]);

  const handlePasteCell = useCallback(() => {
    if (!clipboardRef.current) return;
    const newCell = createCell(clipboardRef.current.type, clipboardRef.current.content);
    const idx = activeCellId ? cells.findIndex(c => c.id === activeCellId) + 1 : cells.length;
    setCells(prev => {
      const copy = [...prev];
      copy.splice(idx, 0, newCell);
      return copy;
    });
    setActiveCellId(newCell.id);
  }, [cells, activeCellId]);

  const handleMoveCellUp = useCallback(() => {
    const idx = cells.findIndex(c => c.id === activeCellId);
    if (idx <= 0) return;
    setCells(prev => {
      const copy = [...prev];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  }, [cells, activeCellId]);

  const handleMoveCellDown = useCallback(() => {
    const idx = cells.findIndex(c => c.id === activeCellId);
    if (idx < 0 || idx >= cells.length - 1) return;
    setCells(prev => {
      const copy = [...prev];
      [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
      return copy;
    });
  }, [cells, activeCellId]);

  const handleClearOutputs = useCallback(() => {
    setCells(prev => prev.map(c => ({ ...c, output: null, executionCount: null, error: null })));
  }, []);

  const handleFsNavigate = useCallback((name) => {
    const next = name === '..' ? fsPath.split('/').slice(0, -1).join('/') || '.' : (fsPath === '.' ? name : `${fsPath}/${name}`);
    requestFileList(next);
  }, [fsPath, requestFileList]);

  return (
    <div className="app">
      <Toolbar
        onAddCell={handleCellAdd}
        onRunAll={handleRunAll}
        onRunSelected={handleRunSelected}
        onRunAbove={handleRunAbove}
        onRunBelow={handleRunBelow}
        onDownload={handleDownload}
        onImport={handleImport}
        connected={connected}
        theme={theme}
        onThemeChange={setTheme}
        model={model}
        onModelChange={setModel}
        provider={provider}
        providerStatus={providerStatus}
        onProviderChange={setProvider}
        activeCellId={activeCellId}
        cells={cells}
        onCutCell={handleCutCell}
        onCopyCell={handleCopyCell}
        onPasteCell={handlePasteCell}
        onMoveCellUp={handleMoveCellUp}
        onMoveCellDown={handleMoveCellDown}
        onDeleteCell={() => { const id = activeCellId; if (id) handleCellDelete(id); }}
        onClearOutputs={handleClearOutputs}
        canPaste={clipboardRef.current !== null}
        showFileBrowser={showFileBrowser}
        showChatSidebar={showChatSidebar}
        onToggleFileBrowser={() => setShowFileBrowser(v => !v)}
        onToggleChatSidebar={() => setShowChatSidebar(v => !v)}
        onKernelInterrupt={() => send('kernel:interrupt')}
        onKernelRestart={() => send('kernel:restart')}
      />
      <div className="main">
        {showFileBrowser && (
          <FileBrowser
            files={files}
            currentPath={fsPath}
            onNavigate={handleFsNavigate}
          />
        )}
        <Notebook
          cells={cells}
          activeCellId={activeCellId}
          runningCellId={runningCellId}
          onCellSelect={setActiveCellId}
          onCellUpdate={handleCellUpdate}
          onCellExecute={handleCellExecute}
          onCellDelete={handleCellDelete}
          onCellAdd={handleCellAdd}
          onCellInterrupt={() => send('kernel:interrupt')}
        />
        {showChatSidebar && (
          <ChatSidebar
            messages={messages}
            streamingMessage={streamingMessage}
            isThinking={isThinking}
            onSend={handleAgentMessage}
            onCancel={handleCancel}
            agentStatus={agentStatus}
          />
        )}
      </div>
    </div>
  );
}
