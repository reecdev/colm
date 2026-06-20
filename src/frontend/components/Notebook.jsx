import React from 'react';
import Cell from './Cell';

export default function Notebook({ cells, activeCellId, runningCellId, onCellSelect, onCellUpdate, onCellExecute, onCellDelete, onCellAdd, onCellInterrupt }) {
  return (
    <div className="notebook">
      {cells.map((cell, i) => (
        <Cell
          key={cell.id}
          cell={cell}
          selected={cell.id === activeCellId}
          isRunning={cell.id === runningCellId}
          index={i}
          onSelect={() => onCellSelect(cell.id)}
          onUpdate={(content, type) => onCellUpdate(cell.id, content, type)}
          onExecute={() => onCellExecute(cell.id)}
          onDelete={() => onCellDelete(cell.id)}
          onInterrupt={onCellInterrupt}
          onAddBefore={(type) => onCellAdd(type, i)}
          onAddAfter={(type) => onCellAdd(type, i + 1)}
        />
      ))}
      {cells.length === 0 && (
        <div className="notebook-empty">
          <p>No cells yet. Add one above or ask the AI to create one.</p>
        </div>
      )}
    </div>
  );
}
