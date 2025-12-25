import React, { useState, useEffect, useCallback } from 'react';
import { CanvasGrid } from './components/CanvasGrid';
import { CellEditor } from './components/CellEditor';
import { SummaryPanel } from './components/SummaryPanel';
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
    saveCell,
    deleteCell,
    clearAllCells,
    exportData,
    importData,
} from './storage';

const App: React.FC = () => {
    const [cells, setCells] = useState<Map<string, CellData>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [summaryExpanded, setSummaryExpanded] = useState(false);

    // Editor state
    const [editorState, setEditorState] = useState<EditorState>({
        isOpen: false,
        cell: null,
        row: 0,
        col: 0,
    });

    // Load cells from storage on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const loadedCells = await loadAllCells();
                setCells(loadedCells);
            } catch (error) {
                console.error('Failed to load cells:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    // Handle cell tap - open editor
    const handleCellTap = useCallback((row: number, col: number) => {
        const key = getCellKey(row, col);
        const cell = cells.get(key) || null;

        setEditorState({
            isOpen: true,
            cell,
            row,
            col,
        });
    }, [cells]);

    // Handle cell save
    const handleCellSave = useCallback(async (cell: CellData) => {
        const key = getCellKey(cell.row, cell.col);

        // Update local state
        setCells((prev: Map<string, CellData>) => {
            const next = new Map(prev);
            if (cellHasContent(cell)) {
                next.set(key, cell);
            } else {
                next.delete(key);
            }
            return next;
        });

        // Persist to storage
        try {
            if (cellHasContent(cell)) {
                await saveCell(cell);
            } else {
                await deleteCell(cell.row, cell.col);
            }
        } catch (error) {
            console.error('Failed to save cell:', error);
        }
    }, []);

    // Handle cell delete
    const handleCellDelete = useCallback(async (row: number, col: number) => {
        const key = getCellKey(row, col);

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
    }, []);

    // Handle cell drop (drag and drop)
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

            // If target has content, swap
            if (targetCell && cellHasContent(targetCell)) {
                // Swap cells
                const newSource: CellData = {
                    ...targetCell,
                    row: sourceRow,
                    col: sourceCol,
                };
                const newTarget: CellData = {
                    ...sourceCell,
                    row: targetRow,
                    col: targetCol,
                };

                next.set(sourceKey, newSource);
                next.set(targetKey, newTarget);

                // Persist both
                saveCell(newSource).catch(console.error);
                saveCell(newTarget).catch(console.error);
            } else {
                // Move cell
                const newTarget: CellData = {
                    ...sourceCell,
                    row: targetRow,
                    col: targetCol,
                };

                next.delete(sourceKey);
                next.set(targetKey, newTarget);

                // Persist
                deleteCell(sourceRow, sourceCol).catch(console.error);
                saveCell(newTarget).catch(console.error);
            }

            return next;
        });
    }, []);

    // Close editor
    const handleEditorClose = useCallback(() => {
        setEditorState((prev: EditorState) => ({
            ...prev,
            isOpen: false,
        }));
    }, []);

    // Clear all data
    const handleClearAll = useCallback(async () => {
        try {
            await clearAllCells();
            setCells(new Map());
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
            const loadedCells = await loadAllCells();
            setCells(loadedCells);
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
                />

                <SummaryPanel
                    cells={cells}
                    isExpanded={summaryExpanded}
                    onToggle={() => setSummaryExpanded(!summaryExpanded)}
                />
            </div>

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
