import React, { useState, useEffect, useCallback } from 'react';
import { CanvasGrid, CanvasGridHandle } from './components/CanvasGrid';
import { CellEditor } from './components/CellEditor';
import { SummaryPanel } from './components/SummaryPanel';
import { BufferGridPanel, BufferGridPanelHandle } from './components/BufferGridPanel';
import { Toolbar } from './components/Toolbar';
import {
    CellData,
    EditorState,
    DEFAULT_GRID_CONFIG,
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

const App: React.FC = () => {
    const [cells, setCells] = useState<Map<string, CellData>>(new Map());
    const [bufferCells, setBufferCells] = useState<Map<string, CellData>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [summaryExpanded, setSummaryExpanded] = useState(false);

    // Highlight state for summary → grid interaction
    const [highlightedCode, setHighlightedCode] = useState<string | null>(null);
    const [bufferHighlightedCode, setBufferHighlightedCode] = useState<string | null>(null);

    // Editor state - tracks which grid is being edited
    const [editorState, setEditorState] = useState<EditorState & { isBuffer?: boolean }>({
        isOpen: false,
        cell: null,
        row: 0,
        col: 0,
        isBuffer: false,
    });

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

    // Auto-clear highlight after animation
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

    // Handle main grid cell tap - open editor
    const handleCellTap = useCallback((row: number, col: number) => {
        const key = getCellKey(row, col);
        const cell = cells.get(key) || null;

        setEditorState({
            isOpen: true,
            cell,
            row,
            col,
            isBuffer: false,
        });
    }, [cells]);

    // Handle buffer grid cell tap - open editor
    const handleBufferCellTap = useCallback((row: number, col: number) => {
        const key = getCellKey(row, col);
        const cell = bufferCells.get(key) || null;

        setEditorState({
            isOpen: true,
            cell,
            row,
            col,
            isBuffer: true,
        });
    }, [bufferCells]);

    // Handle cell save (main or buffer based on editor state)
    const handleCellSave = useCallback(async (cell: CellData) => {
        const key = getCellKey(cell.row, cell.col);
        const isBuffer = editorState.isBuffer;

        if (isBuffer) {
            // Update buffer grid
            setBufferCells((prev: Map<string, CellData>) => {
                const next = new Map(prev);
                if (cellHasContent(cell)) {
                    next.set(key, cell);
                } else {
                    next.delete(key);
                }
                return next;
            });

            try {
                if (cellHasContent(cell)) {
                    await saveBufferCell(cell);
                } else {
                    await deleteBufferCell(cell.row, cell.col);
                }
            } catch (error) {
                console.error('Failed to save buffer cell:', error);
            }
        } else {
            // Update main grid
            setCells((prev: Map<string, CellData>) => {
                const next = new Map(prev);
                if (cellHasContent(cell)) {
                    next.set(key, cell);
                } else {
                    next.delete(key);
                }
                return next;
            });

            try {
                if (cellHasContent(cell)) {
                    await saveCell(cell);
                } else {
                    await deleteCell(cell.row, cell.col);
                }
            } catch (error) {
                console.error('Failed to save cell:', error);
            }
        }
    }, [editorState.isBuffer]);

    // Handle cell delete
    const handleCellDelete = useCallback(async (row: number, col: number) => {
        const key = getCellKey(row, col);
        const isBuffer = editorState.isBuffer;

        if (isBuffer) {
            setBufferCells((prev: Map<string, CellData>) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });

            try {
                await deleteBufferCell(row, col);
            } catch (error) {
                console.error('Failed to delete buffer cell:', error);
            }
        } else {
            setCells((prev: Map<string, CellData>) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });

            try {
                await deleteCell(row, col);
            } catch (error) {
                console.error('Failed to delete cell:', error);
            }
        }
    }, [editorState.isBuffer]);

    // REFACTOR: handleCellDrop removed - relying on global handleDragEnd
    /* const handleCellDrop = ... */

    // REFACTOR: handleBufferCellDrop removed - relying on global handleDragEnd
    /* const handleBufferCellDrop = ... */

    // Handle summary item click - highlight matching cells
    const handleSummaryItemClick = useCallback((combinedCode: string) => {
        setHighlightedCode(combinedCode);
    }, []);

    // Handle buffer summary item click - highlight matching buffer cells
    const handleBufferSummaryItemClick = useCallback((combinedCode: string) => {
        setBufferHighlightedCode(combinedCode);
    }, []);

    // Cross-grid drag handlers
    const handleDragStart = useCallback((cell: CellData, row: number, col: number, sourceGrid: GridType) => {
        setCrossGridDragState(prev => ({
            ...prev,
            isDragging: true,
            sourceCell: cell,
            sourceRow: row,
            sourceCol: col,
            sourceGrid,
            dropHandled: false, // Init flag
        }));
    }, []);

    const handleDragMove = useCallback((x: number, y: number) => {
        setCrossGridDragState(prev => ({
            ...prev,
            currentX: x,
            currentY: y,
        }));
    }, []);

    const handleCrossGridDrop = useCallback(async (
        sourceGrid: GridType,
        targetGrid: GridType,
        cell: CellData,
        targetRow: number,
        targetCol: number
    ) => {
        // Global handler handles ALL drops now (Intra-grid AND Cross-grid)
        // if (sourceGrid === targetGrid) return; // REMOVED early return

        // Target key
        const targetKey = getCellKey(targetRow, targetCol);

        // 1. Check target cell content
        let targetCellExisting: CellData | undefined;
        if (targetGrid === 'main') {
            targetCellExisting = cells.get(targetKey);
        } else {
            targetCellExisting = bufferCells.get(targetKey);
        }

        // 2. Prepare new cells
        const newTargetCell: CellData = {
            ...cell,
            row: targetRow,
            col: targetCol
        };

        let newSourceCell: CellData | null = null;
        if (targetCellExisting && cellHasContent(targetCellExisting)) {
            // Swap: existing target goes to source
            newSourceCell = {
                ...targetCellExisting,
                row: cell.row,
                col: cell.col
            };
        }

        // 3. Update State & Storage logic

        // OPTIMIZATION: If Same Grid, do single update to avoid race/conflict
        if (sourceGrid === targetGrid) {
            const isMain = sourceGrid === 'main';
            if (isMain) {
                setCells(prev => {
                    const next = new Map(prev);
                    // Add new target
                    next.set(targetKey, newTargetCell);
                    // Remove or update source
                    if (newSourceCell) {
                        next.set(getCellKey(cell.row, cell.col), newSourceCell);
                    } else {
                        // Careful: if sourceKey == targetKey (drop on self), we already set it above.
                        // But if they are different keys:
                        if (getCellKey(cell.row, cell.col) !== targetKey) {
                            next.delete(getCellKey(cell.row, cell.col));
                        }
                    }
                    return next;
                });

                // Persistence
                await saveCell(newTargetCell);
                if (newSourceCell) {
                    await saveCell(newSourceCell);
                } else if (getCellKey(cell.row, cell.col) !== targetKey) {
                    await deleteCell(cell.row, cell.col);
                }

            } else {
                // Buffer Grid Same-Grid Move
                setBufferCells(prev => {
                    const next = new Map(prev);
                    next.set(targetKey, newTargetCell);
                    if (newSourceCell) {
                        next.set(getCellKey(cell.row, cell.col), newSourceCell);
                    } else if (getCellKey(cell.row, cell.col) !== targetKey) {
                        next.delete(getCellKey(cell.row, cell.col));
                    }
                    return next;
                });

                await saveBufferCell(newTargetCell);
                if (newSourceCell) {
                    await saveBufferCell(newSourceCell);
                } else if (getCellKey(cell.row, cell.col) !== targetKey) {
                    await deleteBufferCell(cell.row, cell.col);
                }
            }
        } else {
            // CROSS GRID LOGIC (Original logic, simplified)

            // Update Target Grid
            if (targetGrid === 'main') {
                setCells(prev => {
                    const next = new Map(prev);
                    next.set(targetKey, newTargetCell);
                    return next;
                });
                await saveCell(newTargetCell);
            } else {
                setBufferCells(prev => {
                    const next = new Map(prev);
                    next.set(targetKey, newTargetCell);
                    return next;
                });
                await saveBufferCell(newTargetCell);
            }

            // Update Source Grid (Remove original or set swapped)
            if (sourceGrid === 'main') {
                setCells(prev => {
                    const next = new Map(prev);
                    if (newSourceCell) {
                        next.set(getCellKey(cell.row, cell.col), newSourceCell);
                    } else {
                        next.delete(getCellKey(cell.row, cell.col));
                    }
                    return next;
                });

                if (newSourceCell) {
                    await saveCell(newSourceCell);
                } else {
                    await deleteCell(cell.row, cell.col);
                }
            } else {
                setBufferCells(prev => {
                    const next = new Map(prev);
                    if (newSourceCell) {
                        next.set(getCellKey(cell.row, cell.col), newSourceCell);
                    } else {
                        next.delete(getCellKey(cell.row, cell.col));
                    }
                    return next;
                });

                if (newSourceCell) {
                    await saveBufferCell(newSourceCell);
                } else {
                    await deleteBufferCell(cell.row, cell.col);
                }
            }
        }

    }, [cells, bufferCells]);

    const handleDragEnd = useCallback(() => {
        const { isDragging, sourceCell, sourceGrid, currentX, currentY, dropHandled } = crossGridDragState;

        // Prevent double drops
        if (dropHandled) return;

        if (isDragging && sourceCell && sourceGrid) {
            // Check drops
            // PRIORITY: Check Buffer Grid FIRST because it floats ON TOP of Main Grid
            const bufferDrop = bufferGridRef.current?.checkDropTarget(currentX, currentY);
            if (bufferDrop) {
                handleCrossGridDrop(sourceGrid, 'buffer', sourceCell, bufferDrop.row, bufferDrop.col);
            } else {
                // Only check Main Grid if not dropped on Buffer Grid
                const mainDrop = mainGridRef.current?.checkDropTarget(currentX, currentY);
                if (mainDrop) {
                    handleCrossGridDrop(sourceGrid, 'main', sourceCell, mainDrop.row, mainDrop.col);
                }
            }
        }

        // Reset state & set dropHandled to true (though we reset isDragging anyway)
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

    // Close editor
    const handleEditorClose = useCallback(() => {
        setEditorState((prev) => ({
            ...prev,
            isOpen: false,
        }));
    }, []);

    // Clear all data (main grid only)
    const handleClearAll = useCallback(async () => {
        try {
            await Promise.all([clearAllCells(), clearAllBufferCells()]);
            setCells(new Map());
            setBufferCells(new Map());
        } catch (error) {
            console.error('Failed to clear cells:', error);
        }
    }, []);

    // Export data
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

    // Import data
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
                    onDragStart={(cell, row, col) => handleDragStart(cell, row, col, 'main')}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
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
        </div>
    );
};

export default App;
