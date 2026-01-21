import React, { useState, useEffect, useCallback } from 'react';
import { CanvasGrid } from './components/CanvasGrid';
import { CellEditor } from './components/CellEditor';
import { SummaryPanel } from './components/SummaryPanel';
import { BufferGridPanel } from './components/BufferGridPanel';
import { Toolbar } from './components/Toolbar';
import {
    CellData,
    EditorState,
    DEFAULT_GRID_CONFIG,
    getCellKey,
    cellHasContent,
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

    // Handle main grid cell drop (drag and drop within main grid)
    const handleCellDrop = useCallback(async (
        sourceRow: number,
        sourceCol: number,
        targetRow: number,
        targetCol: number
    ) => {
        if (sourceRow === targetRow && sourceCol === targetCol) return;

        const sourceKey = getCellKey(sourceRow, sourceCol);
        const targetKey = getCellKey(targetRow, targetCol);

        setCells((prev: Map<string, CellData>) => {
            const next = new Map(prev);
            const sourceCell = prev.get(sourceKey);
            const targetCell = prev.get(targetKey);

            if (!sourceCell) return prev;

            if (targetCell && cellHasContent(targetCell)) {
                // Swap cells
                const newSource: CellData = { ...targetCell, row: sourceRow, col: sourceCol };
                const newTarget: CellData = { ...sourceCell, row: targetRow, col: targetCol };

                next.set(sourceKey, newSource);
                next.set(targetKey, newTarget);

                saveCell(newSource).catch(console.error);
                saveCell(newTarget).catch(console.error);
            } else {
                // Move cell
                const newTarget: CellData = { ...sourceCell, row: targetRow, col: targetCol };

                next.delete(sourceKey);
                next.set(targetKey, newTarget);

                deleteCell(sourceRow, sourceCol).catch(console.error);
                saveCell(newTarget).catch(console.error);
            }

            return next;
        });
    }, []);

    // Handle buffer grid cell drop (drag and drop within buffer grid)
    const handleBufferCellDrop = useCallback(async (
        sourceRow: number,
        sourceCol: number,
        targetRow: number,
        targetCol: number
    ) => {
        if (sourceRow === targetRow && sourceCol === targetCol) return;

        const sourceKey = getCellKey(sourceRow, sourceCol);
        const targetKey = getCellKey(targetRow, targetCol);

        setBufferCells((prev: Map<string, CellData>) => {
            const next = new Map(prev);
            const sourceCell = prev.get(sourceKey);
            const targetCell = prev.get(targetKey);

            if (!sourceCell) return prev;

            if (targetCell && cellHasContent(targetCell)) {
                // Swap cells
                const newSource: CellData = { ...targetCell, row: sourceRow, col: sourceCol };
                const newTarget: CellData = { ...sourceCell, row: targetRow, col: targetCol };

                next.set(sourceKey, newSource);
                next.set(targetKey, newTarget);

                saveBufferCell(newSource).catch(console.error);
                saveBufferCell(newTarget).catch(console.error);
            } else {
                // Move cell
                const newTarget: CellData = { ...sourceCell, row: targetRow, col: targetCol };

                next.delete(sourceKey);
                next.set(targetKey, newTarget);

                deleteBufferCell(sourceRow, sourceCol).catch(console.error);
                saveBufferCell(newTarget).catch(console.error);
            }

            return next;
        });
    }, []);

    // Handle summary item click - highlight matching cells
    const handleSummaryItemClick = useCallback((combinedCode: string) => {
        setHighlightedCode(combinedCode);
    }, []);

    // Handle buffer summary item click - highlight matching buffer cells
    const handleBufferSummaryItemClick = useCallback((combinedCode: string) => {
        setBufferHighlightedCode(combinedCode);
    }, []);

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
                    config={DEFAULT_GRID_CONFIG}
                    cells={cells}
                    onCellTap={handleCellTap}
                    onCellDrop={handleCellDrop}
                    highlightedCode={highlightedCode}
                />

                <SummaryPanel
                    cells={cells}
                    isExpanded={summaryExpanded}
                    onToggle={() => setSummaryExpanded(!summaryExpanded)}
                    onItemClick={handleSummaryItemClick}
                />
            </div>

            <BufferGridPanel
                cells={bufferCells}
                highlightedCode={bufferHighlightedCode}
                onCellTap={handleBufferCellTap}
                onCellDrop={handleBufferCellDrop}
                onSummaryItemClick={handleBufferSummaryItemClick}
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
