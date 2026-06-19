import React, { useRef, useEffect } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';

export default function Cell({ cell, selected, onSelect, onUpdate, onExecute, onDelete }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      doc: cell.content,
      extensions: [
        basicSetup,
        python(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onUpdate(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { backgroundColor: 'var(--cell-bg)', height: 'auto' },
          '.cm-scroller': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '13px' },
          '.cm-gutters': { backgroundColor: 'var(--cell-gutter)', border: 'none' },
          '.cm-activeLineGutter': { backgroundColor: 'var(--cell-gutter-active)' },
          '.cm-activeLine': { backgroundColor: 'var(--cell-line-active)' },
          '.cm-cursor': { borderLeftColor: 'var(--text)' },
          '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--primary)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'var(--selection) !important',
          },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (viewRef.current) {
      const current = viewRef.current.state.doc.toString();
      if (current !== cell.content) {
        if (cell.content.startsWith(current)) {
          const delta = cell.content.slice(current.length);
          if (delta) {
            viewRef.current.dispatch({
              changes: { from: current.length, insert: delta },
            });
          }
        } else {
          viewRef.current.dispatch({
            changes: { from: 0, to: current.length, insert: cell.content },
          });
        }
      }
    }
  }, [cell.content]);

  return (
    <div className={`cell ${selected ? 'cell-selected' : ''}`} onClick={onSelect}>
      <div className="cell-header">
        <span className="cell-type-label">{cell.executionCount ? `[${cell.executionCount}]` : '   '} {cell.type}</span>
        <div className="cell-header-spacer" />
        {cell.type === 'code' && (
          <button className="cell-btn cell-btn-run" onClick={(e) => { e.stopPropagation(); onExecute(); }} title="Run cell">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>
        )}
        <button className="cell-btn cell-btn-del" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete cell">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="cell-editor" ref={editorRef} />

      {cell.output !== null && (
        <div className={`cell-output ${cell.error ? 'cell-output-error' : ''}`}>
          <pre>{cell.output}</pre>
          {cell.images && cell.images.length > 0 && (
            <div className="cell-output-images">
              {cell.images.map((b64, i) => (
                <img key={i} src={`data:image/png;base64,${b64}`} alt={`Plot ${i + 1}`} className="cell-output-image" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
