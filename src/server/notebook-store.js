let cells = [];
let executionCounter = 0;
let cellIdCounter = 0;

function generateId() {
    return `cell_${++cellIdCounter}`;
}

function createCell(type = 'code', content = '') {
    return {
        id: generateId(),
        type,
        content,
        output: null,
        executionCount: null,
        error: null,
    };
}

function init() {
    cells = [createCell('code', '')];
    executionCounter = 0;
    cellIdCounter = 0;
}

function getState() {
    return { cells };
}

function addCell({ type = 'code', index } = {}) {
    const cell = createCell(type);
    if (index !== undefined && index >= 0 && index <= cells.length) {
        cells.splice(index, 0, cell);
    } else {
        cells.push(cell);
    }
    return cell;
}

function updateCell(cellId, { content, type } = {}) {
    const cell = cells.find(c => c.id === cellId);
    if (!cell) return null;
    if (content !== undefined) cell.content = content;
    if (type !== undefined) cell.type = type;
    return cell;
}

function deleteCell(cellId) {
    const idx = cells.findIndex(c => c.id === cellId);
    if (idx === -1) return false;
    cells.splice(idx, 1);
    if (cells.length === 0) cells.push(createCell('code', ''));
    return true;
}

function executeCell(cellId) {
    const cell = cells.find(c => c.id === cellId);
    if (!cell) return null;
    executionCounter++;
    cell.executionCount = executionCounter;
    cell.output = null;
    cell.error = null;
    return cell;
}

function setCellOutput(cellId, output, isError = false) {
    const cell = cells.find(c => c.id === cellId);
    if (!cell) return;
    cell.output = output;
    cell.error = isError;
}

function clearOutputs() {
    for (const cell of cells) {
        cell.output = null;
        cell.executionCount = null;
        cell.error = null;
    }
}

function toIpynb() {
    return {
        nbformat: 4,
        nbformat_minor: 5,
        cells: cells.map(c => ({
            cell_type: c.type,
            source: c.content.split('\n').map(l => l + '\n'),
            metadata: {},
            ...(c.output ? { outputs: [{ output_type: 'stream', name: c.error ? 'stderr' : 'stdout', text: [c.output] }] } : {}),
        })),
        metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
    };
}

module.exports = {
    init, getState, addCell, updateCell, deleteCell,
    executeCell, setCellOutput, clearOutputs, toIpynb,
};
