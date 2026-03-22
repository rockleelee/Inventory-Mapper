import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasGrid, CanvasGridHandle } from './components/CanvasGrid';
import SummaryPanel from './components/SummaryPanel';
import BufferGridPanel, { BufferGridPanelHandle } from './components/BufferGridPanel';
import CellEditor from './components/CellEditor';
import CellActionMenu from './components/CellActionMenu';
import { Toolbar } from './components/Toolbar';
import DragOverlay from './components/DragOverlay';
import {
    CellData,
    EditorState,
    DEFAULT_GRID_CONFIG,
    BUFFER_GRID_CONFIG,
    getCellKey,
    cellHasContent,
    CrossGridDragState,
    GridType,
} from './types';
import {
    loadAllCells,
    loadAllBufferCells,
    saveCell,
    saveBufferCell,
    deleteCell,
    deleteBufferCell,
    clearAllCells,
    clearAllBufferCells,
    exportData,
    importData,
} from './storage';

// ───────────────────────────────────────────────────────────────────────────────
// Action menu state
// ───────────────────────────────────────────────────────────────────────────────
interface ActionMenuState {
    visible: boolean;
    x: number;
    y: number;
    row: number;
    col: number;
    isBuffer: boolean;
}

const App: React.FC = () => {
    const [cells, setCells] = useState<Map<string, CellData>>(new Map());
    const [bufferCells, setBufferCells] = useState<Map<string, CellData>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [summaryExpanded, setSummaryExpanded] = useState(false);

    const [highlightedCode, setHighlightedCode] = useState<string | null>(null);
    const [bufferHighlightedCode, setBufferHighlightedCode] = useState<string | null>(null);

    const [editorState, setEditorState] = useState<EditorState & { isBuffer?: boolean }>({
        isOpen: false,
        cell: null,
        row: 0,
        col: 0,
        isBuffer: false,
    });

    // Action menu state
    const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

    // In-memory clipboard (array for multi-cell copy)
    const clipboardRef = useRef<CellData[]>([]);
    const [hasClipboard, setHasClipboard] = useState(false);

    // Refs for cross-grid hit testing
    const mainGridRef = React.useRef<CanvasGridHandle>(null);
    const bufferGridRef = React.useRef<BufferGridPanelHandle>(null);

    // Cross-grid drag state
    const [crossGridDragState, setCrossGridDragState] = useState<CrossGridDragState>({
        isDragging: false,
        sourceCell: null,
        sourceRow: -1,
        sourceCol: -1,
        currentX: 0,
        currentY: 0,
        sourceGrid: null,
    });

    // Load cells from storage on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const [loadedCells, loadedBufferCells] = await Promise.all([
                    loadAllCells(),
                    loadAllBufferCells(),
                ]);
                setCells(loadedCells);
                setBufferCells(loadedBufferCells);
            } catch (error) {
                console.error('Failed to load cells:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Auto-clear highlights
    useEffect(() => {
        if (highlightedCode) {
            const timer = setTimeout(() => setHighlightedCode(null), 1600);
            return () => clearTimeout(timer);
        }
    }, [highlightedCode]);

    useEffect(() => {
        if (bufferHighlightedCode) {
            const timer = setTimeout(() => setBufferHighlightedCode(null), 1600);
            return () => clearTimeout(timer);
        }
    }, [bufferHighlightedCode]);

    // ── Cell tap → open editor ────────────────────────────────────────────────
    const handleCellTap = useCallback((row: number, col: number) => {
        const key = getCellKey(row, col);
        const cell = cells.get(key) || null;
        setEditorState({ isOpen: true, cell, row, col, isBuffer: false });
    }, [cells]);

    const handleBufferCellTap = useCallback((row: number, col: number) => {
        const key = getCellKey(row, col);
        const cell = bufferCells.get(key) || null;
        setEditorState({ isOpen: true, cell, row, col, isBuffer: true });
    }, [bufferCells]);

    // ── Long-press → show action menu ────────────────────────────────────────
    const handleLongPress = useCallback((
        row: number,
        col: number,
        screenX: number,
        screenY: number,
        isBuffer = false
    ) => {
        setActionMenu({ visible: true, x: screenX, y: screenY, row, col, isBuffer });
    }, []);

    // ── Cell save ─────────────────────────────────────────────────────────────
    const handleCellSave = useCallback(async (cell: CellData) => {
        const key = getCellKey(cell.row, cell.col);
        const isBuffer = editorState.isBuffer;

        if (isBuffer) {
            setBufferCells((prev) => {
                const next = new Map(prev);
                if (cellHasContent(cell)) next.set(key, cell);
                else next.delete(key);
                return next;
            });
            try {
                if (cellHasContent(cell)) await saveBufferCell(cell);
                else await deleteBufferCell(cell.row, cell.col);
            } catch (error) { console.error('Failed to save buffer cell:', error); }
        } else {
            setCells((prev) => {
                const next = new Map(prev);
                if (cellHasContent(cell)) next.set(key, cell);
                else next.delete(key);
                return next;
            });
            try {
                if (cellHasContent(cell)) await saveCell(cell);
                else await deleteCell(cell.row, cell.col);
            } catch (error) { console.error('Failed to save cell:', error); }
        }
    }, [editorState.isBuffer]);

    // ── Cell delete ───────────────────────────────────────────────────────────
    const handleCellDelete = useCallback(async (row: number, col: number) => {
        const key = getCellKey(row, col);
        const isBuffer = editorState.isBuffer;

        if (isBuffer) {
            setBufferCells((prev) => { const n = new Map(prev); n.delete(key); return n; });
            try { await deleteBufferCell(row, col); } catch (error) { console.error(error); }
        } else {
            setCells((prev) => { const n = new Map(prev); n.delete(key); return n; });
            try { await deleteCell(row, col); } catch (error) { console.error(error); }
        }
    }, [editorState.isBuffer]);

    // ── Summary highlights ────────────────────────────────────────────────────
    const handleSummaryItemClick = useCallback((combinedCode: string) => {
        setHighlightedCode(combinedCode);
    }, []);

    const handleBufferSummaryItemClick = useCallback((combinedCode: string) => {
        setBufferHighlightedCode(combinedCode);
    }, []);

    // ── Cross-grid drag ───────────────────────────────────────────────────────
    const handleDragStart = useCallback((cell: CellData, row: number, col: number, sourceGrid: GridType) => {
        setCrossGridDragState(prev => ({
            ...prev,
            isDragging: true,
            sourceCell: cell,
            sourceRow: row,
            sourceCol: col,
            sourceGrid,
            dropHandled: false,
        }));
    }, []);

    const handleDragMove = useCallback((x: number, y: number) => {
        setCrossGridDragState(prev => ({ ...prev, currentX: x, currentY: y }));
    }, []);

    const handleCrossGridDrop = useCallback(async (
        sourceGrid: GridType,
        targetGrid: GridType,
        cell: CellData,
        targetRow: number,
        targetCol: number
    ) => {
        console.log(`[CrossGridDrop] src=${sourceGrid} target=${targetGrid} cell=${cell.code1} targetLoc=${targetRow},${targetCol}`);
        const targetKey = getCellKey(targetRow, targetCol);

        let targetCellExisting: CellData | undefined;
        if (targetGrid === 'main') targetCellExisting = cells.get(targetKey);
        else targetCellExisting = bufferCells.get(targetKey);

        const newTargetCell: CellData = { ...cell, row: targetRow, col: targetCol };
        let newSourceCell: CellData | null = null;

        if (targetCellExisting && cellHasContent(targetCellExisting)) {
            newSourceCell = { ...targetCellExisting, row: cell.row, col: cell.col };
        }

        console.log(`[CrossGridDrop] Existing Target Cell:`, targetCellExisting);

        if (sourceGrid === targetGrid) {
            const isMain = sourceGrid === 'main';
            if (isMain) {
                setCells(prev => {
                    const next = new Map(prev);
                    next.set(targetKey, newTargetCell);
                    if (newSourceCell) next.set(getCellKey(cell.row, cell.col), newSourceCell);
                    else if (getCellKey(cell.row, cell.col) !== targetKey) next.delete(getCellKey(cell.row, cell.col));
                    return next;
                });
                await saveCell(newTargetCell);
                if (newSourceCell) await saveCell(newSourceCell);
                else if (getCellKey(cell.row, cell.col) !== targetKey) await deleteCell(cell.row, cell.col);
            } else {
                setBufferCells(prev => {
                    const next = new Map(prev);
                    next.set(targetKey, newTargetCell);
                    if (newSourceCell) next.set(getCellKey(cell.row, cell.col), newSourceCell);
                    else if (getCellKey(cell.row, cell.col) !== targetKey) next.delete(getCellKey(cell.row, cell.col));
                    return next;
                });
                await saveBufferCell(newTargetCell);
                if (newSourceCell) await saveBufferCell(newSourceCell);
                else if (getCellKey(cell.row, cell.col) !== targetKey) await deleteBufferCell(cell.row, cell.col);
            }
        } else {
            // Cross-grid
            console.log(`[CrossGridDrop] Updating maps for cross grid! Target is ${targetGrid}`);
            if (targetGrid === 'main') {
                setCells(prev => { const n = new Map(prev); n.set(targetKey, newTargetCell); return n; });
                await saveCell(newTargetCell);
            } else {
                setBufferCells(prev => { const n = new Map(prev); n.set(targetKey, newTargetCell); return n; });
                await saveBufferCell(newTargetCell);
            }
            if (sourceGrid === 'main') {
                setCells(prev => {
                    const n = new Map(prev);
                    if (newSourceCell) n.set(getCellKey(cell.row, cell.col), newSourceCell);
                    else n.delete(getCellKey(cell.row, cell.col));
                    return n;
                });
                if (newSourceCell) await saveCell(newSourceCell);
                else await deleteCell(cell.row, cell.col);
            } else {
                setBufferCells(prev => {
                    const n = new Map(prev);
                    if (newSourceCell) n.set(getCellKey(cell.row, cell.col), newSourceCell);
                    else n.delete(getCellKey(cell.row, cell.col));
                    return n;
                });
                if (newSourceCell) await saveBufferCell(newSourceCell);
                else await deleteBufferCell(cell.row, cell.col);
            }
        }
    }, [cells, bufferCells]);

    const handleDragEnd = useCallback(() => {
        const { isDragging, sourceCell, sourceGrid, currentX, currentY, dropHandled } = crossGridDragState;
        console.log(`[DragEnd] isDragging=${isDragging} srcGrid=${sourceGrid} currentX=${currentX} currentY=${currentY} handled=${dropHandled}`);
        
        if (dropHandled) return;

        if (isDragging && sourceCell && sourceGrid) {
            const bufferDrop = bufferGridRef.current?.checkDropTarget(currentX ?? 0, currentY ?? 0);
            console.log(`[DragEnd] bufferDrop evaluated:`, bufferDrop);
            
            if (bufferDrop) {
                handleCrossGridDrop(sourceGrid, 'buffer', sourceCell, bufferDrop.row, bufferDrop.col);
            } else {
                const mainDrop = mainGridRef.current?.checkDropTarget(currentX ?? 0, currentY ?? 0);
                console.log(`[DragEnd] mainDrop evaluated:`, mainDrop);
                
                if (mainDrop) {
                    handleCrossGridDrop(sourceGrid, 'main', sourceCell, mainDrop.row, mainDrop.col);
                }
            }
        }

        setCrossGridDragState({
            isDragging: false,
            sourceCell: null,
            sourceRow: -1,
            sourceCol: -1,
            currentX: 0,
            currentY: 0,
            sourceGrid: null,
            dropHandled: true,
        });
    }, [crossGridDragState, handleCrossGridDrop]);

    // ── ACTION MENU CALLBACKS ────────────────────────────────────────────────

    // Get cells involved in action (selected cells or the single long-pressed cell)
    const getActionCells = useCallback((isBuffer: boolean): CellData[] => {
        const selectedKeys = mainGridRef.current?.getSelectedCells() ?? [];
        if (selectedKeys.length > 0 && !isBuffer) {
            const result: CellData[] = [];
            selectedKeys.forEach(key => {
                const c = cells.get(key);
                if (c && cellHasContent(c)) result.push(c);
            });
            if (result.length > 0) return result;
        }
        return [];
    }, [cells]);

    const handleActionCopy = useCallback(() => {
        if (!actionMenu) return;
        const { row, col, isBuffer } = actionMenu;

        // Try multi-selection first
        const multiCells = getActionCells(isBuffer);
        if (multiCells.length > 0) {
            clipboardRef.current = multiCells.map(c => ({ ...c }));
        } else {
            // Single cell
            const map = isBuffer ? bufferCells : cells;
            const cell = map.get(getCellKey(row, col));
            if (cell && cellHasContent(cell)) {
                clipboardRef.current = [{ ...cell }];
            } else {
                clipboardRef.current = [];
            }
        }
        setHasClipboard(clipboardRef.current.length > 0);
        mainGridRef.current?.clearSelection();
    }, [actionMenu, cells, bufferCells, getActionCells]);

    const handleActionMoveToBuffer = useCallback(async () => {
        if (!actionMenu) return;
        const { row, col, isBuffer } = actionMenu;
        
        console.log(`[MoveToBuffer/Cut] Triggered for row=${row} col=${col} isBuffer=${isBuffer}`);

        const multiCells = getActionCells(isBuffer);
        const cellsToMove = multiCells.length > 0 ? multiCells : (() => {
            const map = isBuffer ? bufferCells : cells;
            const c = map.get(getCellKey(row, col));
            return c && cellHasContent(c) ? [c] : [];
        })();

        console.log(`[MoveToBuffer/Cut] cells count:`, cellsToMove.length, cellsToMove);

        if (cellsToMove.length === 0) return;

        if (isBuffer) {
            // "Cut" behavior: copy to clipboard, delete from buffer
            clipboardRef.current = cellsToMove.map(c => ({ ...c }));
            setHasClipboard(true);
            
            for (const cell of cellsToMove) {
                const key = getCellKey(cell.row, cell.col);
                setBufferCells(prev => { const n = new Map(prev); n.delete(key); return n; });
                try { await deleteBufferCell(cell.row, cell.col); } catch { /* silent */ }
            }
            bufferGridRef.current?.clearSelection();
            return;
        }

        // Find empty buffer slots (Move to Buffer from Main)
        const bufferConfig = BUFFER_GRID_CONFIG;
        const usedSlots = new Set(Array.from(bufferCells.keys()));

        for (const srcCell of cellsToMove) {
            // Find first empty buffer slot
            let placed = false;
            outer: for (let r = 0; r < bufferConfig.rows; r++) {
                for (let c = 0; c < bufferConfig.cols; c++) {
                    const bKey = getCellKey(r, c);
                    if (!usedSlots.has(bKey)) {
                        const bufCell: CellData = { ...srcCell, row: r, col: c };
                        setBufferCells(prev => { const n = new Map(prev); n.set(bKey, bufCell); return n; });
                        try { await saveBufferCell(bufCell); } catch { /* silent */ }
                        usedSlots.add(bKey);
                        placed = true;
                        break outer;
                    }
                }
            }
            if (!placed) break; // buffer full

            // Remove from main grid
            const srcKey = getCellKey(srcCell.row, srcCell.col);
            setCells(prev => { const n = new Map(prev); n.delete(srcKey); return n; });
            try { await deleteCell(srcCell.row, srcCell.col); } catch { /* silent */ }
        }

        mainGridRef.current?.clearSelection();
    }, [actionMenu, cells, bufferCells, getActionCells]);

    const handleActionPaste = useCallback(async () => {
        if (!actionMenu || clipboardRef.current.length === 0) return;
        const { row, col, isBuffer } = actionMenu;

        const clipboard = clipboardRef.current;

        if (clipboard.length === 1) {
            // Single paste at target position
            const src = clipboard[0];
            const targetCell: CellData = { ...src, row, col };
            if (isBuffer) {
                const key = getCellKey(row, col);
                setBufferCells(prev => { const n = new Map(prev); n.set(key, targetCell); return n; });
                try { await saveBufferCell(targetCell); } catch { /* silent */ }
            } else {
                const key = getCellKey(row, col);
                setCells(prev => { const n = new Map(prev); n.set(key, targetCell); return n; });
                try { await saveCell(targetCell); } catch { /* silent */ }
            }
        } else {
            // Multi-paste: place cells relative to first cell's origin, offset to target
            const originRow = clipboard[0].row;
            const originCol = clipboard[0].col;
            for (const src of clipboard) {
                const dr = src.row - originRow;
                const dc = src.col - originCol;
                const targetCell: CellData = { ...src, row: row + dr, col: col + dc };
                const key = getCellKey(targetCell.row, targetCell.col);
                if (isBuffer) {
                    setBufferCells(prev => { const n = new Map(prev); n.set(key, targetCell); return n; });
                    try { await saveBufferCell(targetCell); } catch { /* silent */ }
                } else {
                    setCells(prev => { const n = new Map(prev); n.set(key, targetCell); return n; });
                    try { await saveCell(targetCell); } catch { /* silent */ }
                }
            }
        }
    }, [actionMenu]);

    // ── Editor close ──────────────────────────────────────────────────────────
    const handleEditorClose = useCallback(() => {
        setEditorState(prev => ({ ...prev, isOpen: false }));
    }, []);

    // ── Clear all ─────────────────────────────────────────────────────────────
    const handleClearAll = useCallback(async () => {
        try {
            await Promise.all([clearAllCells(), clearAllBufferCells()]);
            setCells(new Map());
            setBufferCells(new Map());
        } catch (error) { console.error('Failed to clear cells:', error); }
    }, []);

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = useCallback(async () => {
        try {
            const data = await exportData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventory-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export:', error);
            alert('Failed to export data');
        }
    }, []);

    // ── Import ────────────────────────────────────────────────────────────────
    const handleImport = useCallback(async (jsonData: string) => {
        try {
            await importData(jsonData);
            const [loadedCells, loadedBufferCells] = await Promise.all([
                loadAllCells(),
                loadAllBufferCells(),
            ]);
            setCells(loadedCells);
            setBufferCells(loadedBufferCells);
            alert('Data imported successfully');
        } catch (error) {
            console.error('Failed to import:', error);
            alert('Failed to import data. Make sure the file is valid JSON.');
        }
    }, []);

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
                <p>Loading inventory...</p>
            </div>
        );
    }

    // Count selected cells for action menu label
    const selectedCount = actionMenu && !actionMenu.isBuffer
        ? (mainGridRef.current?.getSelectedCells().length ?? 1)
        : 1;

    // Check if action menu source cell has content
    const actionCellHasContent = (() => {
        if (!actionMenu) return false;
        const map = actionMenu.isBuffer ? bufferCells : cells;
        const cell = map.get(getCellKey(actionMenu.row, actionMenu.col));
        return cell ? cellHasContent(cell) : false;
    })();

    return (
        <div className="app-container">
            <Toolbar
                onClearAll={handleClearAll}
                onExport={handleExport}
                onImport={handleImport}
            />

            <div className="main-content">
                <CanvasGrid
                    ref={mainGridRef}
                    config={DEFAULT_GRID_CONFIG}
                    cells={cells}
                    onCellTap={handleCellTap}
                    highlightedCode={highlightedCode}
                    externalDragState={crossGridDragState}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onLongPress={(row, col, x, y) => handleLongPress(row, col, x, y, false)}
                />

                <SummaryPanel
                    cells={cells}
                    isExpanded={summaryExpanded}
                    onToggle={() => setSummaryExpanded(!summaryExpanded)}
                    onItemClick={handleSummaryItemClick}
                />
            </div>

            <BufferGridPanel
                ref={bufferGridRef}
                bufferCells={bufferCells}
                highlightedCode={bufferHighlightedCode}
                onCellTap={handleBufferCellTap}
                onSummaryItemClick={handleBufferSummaryItemClick}
                externalDragState={crossGridDragState}
                onDragStart={(cell, row, col) => handleDragStart(cell, row, col, 'buffer')}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onLongPress={(row, col, x, y, isBuffer) => handleLongPress(row, col, x, y, isBuffer)}
            />

            <CellEditor
                isOpen={editorState.isOpen}
                row={editorState.row}
                col={editorState.col}
                cell={editorState.cell}
                onSave={handleCellSave}
                onDelete={handleCellDelete}
                onClose={handleEditorClose}
            />

            {actionMenu?.visible && (
                <CellActionMenu
                    x={actionMenu.x}
                    y={actionMenu.y}
                    selectedCount={selectedCount}
                    hasClipboard={hasClipboard}
                    hasContent={actionCellHasContent}
                    onMoveToBuffer={handleActionMoveToBuffer}
                    onCopy={handleActionCopy}
                    onPaste={handleActionPaste}
                    onClose={() => setActionMenu(null)}
                    isBuffer={actionMenu.isBuffer}
                />
            )}
            
            <DragOverlay dragState={crossGridDragState} />
        </div>
    );
};

export default App;
