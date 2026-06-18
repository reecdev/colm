import React, { useState, useRef, useEffect } from 'react';

const FREE_MODELS = [
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B' },
  { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder' },
  { id: 'openrouter/owl-alpha', label: 'Owl Alpha (agent-optimized)' },
  { id: 'nex-agi/nex-n2-pro:free', label: 'Nex N2 Pro' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B' },
];

const THEMES = ['light', 'dark', 'midnight', 'catppuccin'];

export default function Toolbar({
  onAddCell, onRunAll, onDownload, onImport, connected, theme, onThemeChange,
  model, onModelChange, activeCellId, cells, onCutCell, onCopyCell, onPasteCell,
  onMoveCellUp, onMoveCellDown, onDeleteCell, onClearOutputs, canPaste,
  onRunSelected, onRunAbove, onRunBelow,
  showFileBrowser, showChatSidebar, onToggleFileBrowser, onToggleChatSidebar,
  onKernelInterrupt, onKernelRestart,
}) {
  const [notebookName, setNotebookName] = useState('Untitled notebook');
  const [activeMenu, setActiveMenu] = useState(null);
  const [customInput, setCustomInput] = useState('');
  const importRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleModelSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setActiveMenu('agent');
    } else {
      onModelChange(val);
      setActiveMenu(null);
    }
  };

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onModelChange(customInput.trim());
      setCustomInput('');
      setActiveMenu(null);
    }
  };

  const handleCustomKey = (e) => {
    if (e.key === 'Enter') {
      handleCustomSubmit();
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      setActiveMenu(null);
    }
    e.target.value = '';
  };

  const hasSelection = activeCellId && cells.some(c => c.id === activeCellId);
  const idx = hasSelection ? cells.findIndex(c => c.id === activeCellId) : -1;
  const canMoveUp = idx > 0;
  const canMoveDown = idx < cells.length - 1;
  const hasAbove = hasSelection && idx > 0;
  const hasBelow = hasSelection && idx < cells.length - 1;

  const action = (fn) => () => { fn(); setActiveMenu(null); };

  return (
    <div className="toolbar" ref={menuRef}>
      <div className="toolbar-title-row">
        <input
          className="notebook-name-input"
          value={notebookName}
          onChange={(e) => setNotebookName(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="toolbar-menu-row">
        <div className="toolbar-menu-left">
          <div className="menu-item-wrapper">
            <div className={`menu-item ${activeMenu === 'file' ? 'active' : ''}`}
                 onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}>
              File
            </div>
            {activeMenu === 'file' && (
              <div className="menu-dropdown">
                <div className="menu-dropdown-item" onClick={() => { importRef.current?.click(); }}>
                  Import .ipynb
                </div>
                <div className="menu-dropdown-item" onClick={() => { onDownload(); setActiveMenu(null); }}>
                  Download .ipynb
                </div>
                <input ref={importRef} type="file" accept=".ipynb" onChange={handleImportFile} style={{ display: 'none' }} />
              </div>
            )}
          </div>
          <div className="menu-item-wrapper">
            <div className={`menu-item ${activeMenu === 'edit' ? 'active' : ''}`}
                 onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}>
              Edit
            </div>
            {activeMenu === 'edit' && (
              <div className="menu-dropdown">
                <div className="menu-dropdown-item" onClick={action(onCutCell)} disabled={!hasSelection}>
                  Cut cell
                </div>
                <div className="menu-dropdown-item" onClick={action(onCopyCell)} disabled={!hasSelection}>
                  Copy cell
                </div>
                <div className="menu-dropdown-item" onClick={action(onPasteCell)} disabled={!canPaste}>
                  Paste cell
                </div>
                <div className="menu-dropdown-divider" />
                <div className="menu-dropdown-item" onClick={action(onMoveCellUp)} disabled={!hasSelection || !canMoveUp}>
                  Move up
                </div>
                <div className="menu-dropdown-item" onClick={action(onMoveCellDown)} disabled={!hasSelection || !canMoveDown}>
                  Move down
                </div>
                <div className="menu-dropdown-divider" />
                <div className="menu-dropdown-item" onClick={action(onDeleteCell)} disabled={!hasSelection}>
                  Delete cell
                </div>
              </div>
            )}
          </div>
          <div className="menu-item-wrapper">
            <div className={`menu-item ${activeMenu === 'run' ? 'active' : ''}`}
                 onClick={() => setActiveMenu(activeMenu === 'run' ? null : 'run')}>
              Run
            </div>
            {activeMenu === 'run' && (
              <div className="menu-dropdown">
                <div className="menu-dropdown-item" onClick={action(onRunSelected)} disabled={!hasSelection}>
                  Run selected cell
                </div>
                <div className="menu-dropdown-item" onClick={action(onRunAll)}>
                  Run All
                </div>
                <div className="menu-dropdown-item" onClick={action(onRunAbove)} disabled={!hasAbove}>
                  Run All Above
                </div>
                <div className="menu-dropdown-item" onClick={action(onRunBelow)} disabled={!hasBelow}>
                  Run All Below
                </div>
                <div className="menu-dropdown-divider" />
                <div className="menu-dropdown-item" onClick={action(onClearOutputs)}>
                  Clear all outputs
                </div>
              </div>
            )}
          </div>
          <div className="menu-item-wrapper">
            <div className={`menu-item ${activeMenu === 'kernel' ? 'active' : ''}`}
                 onClick={() => setActiveMenu(activeMenu === 'kernel' ? null : 'kernel')}>
              Kernel
            </div>
            {activeMenu === 'kernel' && (
              <div className="menu-dropdown">
                <div className="menu-dropdown-item" onClick={action(onKernelInterrupt)}>
                  Interrupt
                </div>
                <div className="menu-dropdown-divider" />
                <div className="menu-dropdown-item" onClick={action(onKernelRestart)}>
                  Restart
                </div>
              </div>
            )}
          </div>
          <div className="menu-item-wrapper">
            <div className={`menu-item ${activeMenu === 'view' ? 'active' : ''}`}
                 onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}>
              View
            </div>
            {activeMenu === 'view' && (
              <div className="menu-dropdown">
                <div className="menu-dropdown-label">Theme</div>
                {THEMES.map(t => (
                  <div key={t} className={`menu-dropdown-item ${t === theme ? 'checked' : ''}`}
                       onClick={() => { onThemeChange(t); setActiveMenu(null); }}>
                    {t === theme && <span className="menu-checkmark">✓ </span>}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </div>
                ))}
                <div className="menu-dropdown-divider" />
                <div className="menu-dropdown-item" onClick={() => { onToggleFileBrowser(); setActiveMenu(null); }}>
                  {showFileBrowser ? '✓ ' : '  '}File Browser
                </div>
                <div className="menu-dropdown-item" onClick={() => { onToggleChatSidebar(); setActiveMenu(null); }}>
                  {showChatSidebar ? '✓ ' : '  '}Chat Sidebar
                </div>
              </div>
            )}
          </div>
          <div className="menu-item-wrapper">
            <div className={`menu-item ${activeMenu === 'agent' ? 'active' : ''}`}
                 onClick={() => setActiveMenu(activeMenu === 'agent' ? null : 'agent')}>
              Agent
            </div>
            {activeMenu === 'agent' && (
              <div className="menu-dropdown menu-dropdown-wide">
                <div className="menu-dropdown-label">Model</div>
                <select className="menu-dropdown-select" value={model} onChange={handleModelSelect}>
                  {FREE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>

                <div className="menu-dropdown-label">Custom model ID</div>
                <div className="menu-dropdown-row">
                  <input
                    className="menu-dropdown-input"
                    placeholder="e.g. cohere/north-mini-code:free"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={handleCustomKey}
                  />
                  <button className="menu-dropdown-btn" onClick={handleCustomSubmit}>Set</button>
                </div>

                <div className="menu-dropdown-current">
                  Current: <code>{model}</code>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-menu-right">
          <button className="toolbar-act-btn" onClick={() => onAddCell('code')}>+ Code</button>
          <button className="toolbar-act-btn" onClick={() => onAddCell('markdown')}>+ Markdown</button>
          <button className="toolbar-act-btn" onClick={onRunAll}>▶ Run All</button>
          <a href="https://github.com/reecdev/colm" target="_blank" rel="noopener noreferrer" className="toolbar-github" title="GitHub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
