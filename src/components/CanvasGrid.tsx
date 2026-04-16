import React, { useRef, useCallback, memo, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { CellData, GridConfig, getCellKey, cellHasContent, getMaterialColor, getCombinedCode } from '../types';

interface CanvasGridProps {
    config: GridConfig;
    cells: Map<string, CellData>;
    onCellSingleTap: (row: number, col: number) => void;
    onCellDoubleTap: (row: number, col: number) => void;
    highlightedCode?: string | null;
    onLongPress?: (row: number, col: number, screenX: number, screenY: number) => void;
    onSelectionChange?: (keys: string[]) => void;
}

export interface CanvasGridHandle {
    getSelectedCells: () => string[];
    clearSelection: () => void;
    toggleSelection: (key: string) => void;
}

const TAP_THRESHOLD = 10; // pixels
const LONG_PRESS_DURATION = 500; // ms

// Memoized single cell component
const GridCell = memo(({ 
    row, col, cell, isSelected, isHighlighted 
}: { 
    row: number, col: number, cell?: CellData, isSelected: boolean, isHighlighted: boolean 
}) => {
    const hasContent = cell && cellHasContent(cell);
    const materialColor = hasContent ? getMaterialColor(cell.code1) : null;
    const isBoundary = cell?.isBoundary;
    
    return (
        <div 
            className={`grid-cell ${hasContent ? 'has-content' : ''} ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${isBoundary ? 'boundary-cell' : ''}`}
            data-row={row} 
            data-col={col}
            style={{ 
                gridRow: row + 2, // +2 because 1 is header
                gridColumn: col + 2, // +2 because 1 is header
                backgroundColor: materialColor ? materialColor.background : undefined 
            }}
        >
            {hasContent && materialColor && (
                <>
                    <div className="cell-indicator" style={{ backgroundColor: materialColor.primary }} />
                    <div className="cell-code" style={{ color: materialColor.primary }}>
                        {cell.code1}{cell.code2}
                    </div>
                    {cell.code3 && <div className="cell-code3">{cell.code3}</div>}
                    {cell.quantity > 0 && <div className="cell-quantity">{cell.quantity}</div>}
                    {cell.note && <div className="cell-note-indicator" />}
                    {cell.imageId && <div className="cell-image-indicator" />}
                </>
            )}
        </div>
    );
}, (prev, next) => {
    // Fast comparison for React.memo
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isHighlighted !== next.isHighlighted) return false;
    
    // Quick checks
    const p = prev.cell;
    const n = next.cell;
    
    if (!!p !== !!n) return false;
    if (!p && !n) return true; // both undefined
    
    // Deepish compare data props
    if (p!.code1 !== n!.code1) return false;
    if (p!.code2 !== n!.code2) return false;
    if (p!.code3 !== n!.code3) return false;
    if (p!.quantity !== n!.quantity) return false;
    if (p!.note !== n!.note) return false;
    if (p!.imageId !== n!.imageId) return false;
    if (p!.isBoundary !== n!.isBoundary) return false;
    
    return true;
});

export const CanvasGrid = forwardRef<CanvasGridHandle, CanvasGridProps>(({
    config,
    cells,
    onCellSingleTap,
    onCellDoubleTap,
    highlightedCode,
    onLongPress,
    onSelectionChange,
}, ref) => {
    // Selection state
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    useImperativeHandle(ref, () => ({
        getSelectedCells: () => Array.from(selectedKeys),
        clearSelection: () => setSelectedKeys(new Set()),
        toggleSelection: (key: string) => {
            setSelectedKeys(prev => {
                const newSet = new Set(prev);
                if (newSet.has(key)) newSet.delete(key);
                else newSet.add(key);
                return newSet;
            });
        }
    }), [selectedKeys]);

    useEffect(() => {
        onSelectionChange?.(Array.from(selectedKeys));
    }, [selectedKeys, onSelectionChange]);

    // Pointer event tracking logic
    const pointerDataRef = useRef<{ id: number; startX: number; startY: number; startTime: number; timer: number | null }>({
        id: -1, startX: 0, startY: 0, startTime: 0, timer: null
    });
    const lastTapRef = useRef<{ row: number; col: number; time: number }>({ row: -1, col: -1, time: 0 });

    const getCellPosFromEvent = (e: React.PointerEvent | MouseEvent | TouchEvent): { row: number, col: number } | null => {
        const target = e.target as HTMLElement;
        const cellNode = target.closest('.grid-cell') as HTMLElement;
        if (!cellNode) return null;
        
        const row = parseInt(cellNode.getAttribute('data-row') ?? '', 10);
        const col = parseInt(cellNode.getAttribute('data-col') ?? '', 10);
        
        if (isNaN(row) || isNaN(col)) return null;
        return { row, col };
    };

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        // Only track primary pointer for gestures
        if (pointerDataRef.current.id !== -1) return;
        
        const pos = getCellPosFromEvent(e);
        if (!pos) return;

        // Save position directly for easy calculation
        pointerDataRef.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startTime: Date.now(),
            timer: window.setTimeout(() => {
                // Long press detected
                const state = pointerDataRef.current;
                state.timer = null;
                if (state.id !== -1) {
                    if (navigator.vibrate) navigator.vibrate(40);
                    
                    // Add this cell to selection if it wasn't already selected
                    const key = getCellKey(pos.row, pos.col);
                    if (!e.shiftKey) {
                        setSelectedKeys(new Set([key]));
                    } else {
                        setSelectedKeys(prev => {
                            const newSet = new Set(prev);
                            newSet.add(key);
                            return newSet;
                        });
                    }
                    
                    onLongPress?.(pos.row, pos.col, e.clientX, e.clientY);
                    state.id = -1; // reset tracking to ignore upcoming pointerup
                }
            }, LONG_PRESS_DURATION)
        };
        
        // Prevent default browser behaviors like text selection on long press
        e.preventDefault();
    }, [onLongPress]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const state = pointerDataRef.current;
        if (state.id !== e.pointerId) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > TAP_THRESHOLD) {
            // Cancel long press if moved significantly
            if (state.timer !== null) {
                window.clearTimeout(state.timer);
                state.timer = null;
            }
        }
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        const state = pointerDataRef.current;
        if (state.id !== e.pointerId) return; // May have been reset by long press

        if (state.timer !== null) {
            window.clearTimeout(state.timer);
            state.timer = null;
        }

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const duration = Date.now() - state.startTime;

        if (distance < TAP_THRESHOLD && duration < LONG_PRESS_DURATION) {
            const pos = getCellPosFromEvent(e);
            if (pos) {
                if (e.shiftKey) {
                    // Toggle selection
                    setSelectedKeys(prev => {
                        const newSet = new Set(prev);
                        const key = getCellKey(pos.row, pos.col);
                        if (newSet.has(key)) newSet.delete(key);
                        else newSet.add(key);
                        return newSet;
                    });
                } else {
                    const now = Date.now();
                    const lastTap = lastTapRef.current;
                    if (lastTap.row === pos.row && lastTap.col === pos.col && now - lastTap.time < 300) {
                        onCellDoubleTap(pos.row, pos.col);
                        lastTapRef.current = { row: -1, col: -1, time: 0 };
                    } else {
                        onCellSingleTap(pos.row, pos.col);
                        lastTapRef.current = { row: pos.row, col: pos.col, time: now };
                    }
                }
            }
        }

        state.id = -1;
    }, [onCellSingleTap, onCellDoubleTap]);

    const handlePointerCancel = useCallback(() => {
        const state = pointerDataRef.current;
        if (state.timer !== null) window.clearTimeout(state.timer);
        state.id = -1;
        state.timer = null;
    }, []);

    // Generate cell array - separate loops for headers vs active cells
    const gridElements = [];
    
    // Top-left corner
    gridElements.push(
        <div key="header-corner" style={{ 
            gridRow: 1, gridColumn: 1, backgroundColor: '#1a1a2e', 
            position: 'sticky', top: 0, left: 0, zIndex: 10 
        }} />
    );

    // Column headers
    for (let c = 0; c < config.cols; c++) {
        let colLabel = '';
        let n = c;
        while (n >= 0) {
            colLabel = String.fromCharCode(65 + (n % 26)) + colLabel;
            n = Math.floor(n / 26) - 1;
        }

        gridElements.push(
            <div key={`header-col-${c}`} style={{ 
                gridRow: 1, gridColumn: c + 2, 
                backgroundColor: '#2d3561', color: '#a0a0a0', 
                fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'sticky', top: 0, zIndex: 5
            }}>
                {colLabel}
            </div>
        );
    }

    // Row headers
    for (let r = 0; r < config.rows; r++) {
        gridElements.push(
            <div key={`header-row-${r}`} style={{ 
                gridRow: r + 2, gridColumn: 1, 
                backgroundColor: '#2d3561', color: '#a0a0a0', 
                fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'sticky', left: 0, zIndex: 5
            }}>
                {r + 1}
            </div>
        );
    }

    // Active Cells Data Loop
    for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
            const key = getCellKey(r, c);
            const cell = cells.get(key);
            const isSelected = selectedKeys.has(key);
            const isHighlighted = highlightedCode ? (cell && getCombinedCode(cell) === highlightedCode) : false;

            gridElements.push(
                <GridCell 
                    key={key} 
                    row={r} 
                    col={c} 
                    cell={cell} 
                    isSelected={isSelected} 
                    isHighlighted={isHighlighted || false} 
                />
            );
        }
    }

    return (
        <div className="grid-scroll-container">
            <div 
                className="grid-container"
                style={{
                    gridTemplateColumns: `${config.rowHeaderWidth}px repeat(${config.cols}, ${config.cellWidth}px)`,
                    gridTemplateRows: `${config.headerHeight}px repeat(${config.rows}, ${config.cellHeight}px)`
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onContextMenu={(e) => e.preventDefault()}
            >
                {gridElements}
            </div>
        </div>
    );
});

CanvasGrid.displayName = 'CanvasGrid';

export default CanvasGrid;
