import React from 'react';

function iconFor(name, isDir) {
  if (isDir) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      </svg>
    );
  }
  const isPy = name.endsWith('.py');
  const isIpynb = name.endsWith('.ipynb');
  const isMd = name.endsWith('.md');
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      {isPy ? (
        <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M12 11v6" /><circle cx="12" cy="8" r="1" fill="currentColor" /></>
      ) : isIpynb ? (
        <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 12l4 4 4-4" /><path d="M12 4v12" /></>
      ) : isMd ? (
        <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 15l2-2 2 2 2-2 2 2" /></>
      ) : (
        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
      )}
    </svg>
  );
}

export default function FileBrowser({ files, currentPath, onNavigate, onOpen }) {
  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <span className="file-browser-title">Files</span>
      </div>
      <div className="file-browser-path" title={currentPath}>{currentPath}</div>
      <div className="file-browser-list">
        {currentPath !== '.' && (
          <div className="file-browser-item" onClick={() => onNavigate('..')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            <span className="file-browser-name">..</span>
          </div>
        )}
        {files.map((f, i) => (
          <div key={i} className="file-browser-item"
               onClick={() => f.isDir ? onNavigate(f.name) : onOpen?.(f.name)}>
            {iconFor(f.name, f.isDir)}
            <span className="file-browser-name">{f.name}</span>
          </div>
        ))}
        {files.length === 0 && (
          <div className="file-browser-empty">Empty directory</div>
        )}
      </div>
    </div>
  );
}
