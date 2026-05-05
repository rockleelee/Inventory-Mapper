import React, { useRef, useEffect, useCallback, useState, forwardRef, memo } from 'react';
import {
    CellData,
    BUFFER_GRID_CONFIG,
    getCellKey,
    cellHasContent,
    getMaterialColor,
    getCombinedCode,
    MaterialSummary,
} from '../types';

interface BufferGridPanelProps {
    bufferCells: Map<string, CellData>;
    highlightedCode: string | null;
    onCellSingleTap: (row: number, col: number) => void;
    onCellDoubleTap: (row: number, col: number) => void;
    onSummaryItemClick: (combinedCode: string) => void;
    onLongPress?: (row: number, col: number, screenX: number, screenY: number, isBuffer: boolean) => void;
}

export interface BufferGridPanelHandle {
    clearSelection: () => void;
}

const TAP_THRESHOLD = 10;
const LONG_PRESS_DURATION = 500;

// Panel position persistence
const PANEL_POSITION_KEY = 'buffer-panel-position';
const DEFAULT_POSITION = { x: 20, y: 100 };

function loadPanelPosition(): { x: number; y: number } {
    try {
        const saved = localStorage.getItem(PANEL_POSITION_KEY);
        if (saved) return JSON.parse(saved);
    } catch { }
    return DEFAULT_POSITION;
}

function savePanelPosition(pos: { x: number; y: number }) {
    try {
        localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(pos));
    } catch { }
}

const GridCell = memo(({ 
    row, col, cell, isHighlighted 
}: { 
    row: number, col: number, cell?: CellData, isHighlighted: boolean 
}) => {
    const hasContent = cell && cellHasContent(cell);
    const materialColor = hasContent ? getMaterialColor(cell.code1) : null;
    const isBoundary = cell?.isBoundary;
    
    return (
        <div 
            className={`grid-cell ${hasContent ? 'has-content' : ''} ${isHighlighted ? 'highlighted' : ''} ${isBoundary ? 'boundary-cell' : ''} ${cell?.isStockHold ? 'stock-hold-cell' : ''}`}
            data-row={row} 
            data-col={col}
            style={{ 
                gridRow: row + 2, 
                gridColumn: col + 2, 
                backgroundColor: materialColor ? materialColor.background : undefined 
            }}
        >
            {hasContent && materialColor && (
                <>
                    <div className="cell-indicator" style={{ backgroundColor: materialColor.primary }} />
                    <div className="cell-code" style={{ color: materialColor.primary, fontSize: 11, left: 6, top: '40%' }}>
                        {cell.code1}{cell.code2}
                    </div>
                    {cell.quantity > 0 && <div className="cell-quantity" style={{ fontSize: 10, top: '72%' }}>{cell.quantity}</div>}
                </>
            )}
        </div>
    );
}, (prev, next) => {
    if (prev.isHighlighted !== next.isHighlighted) return false;
    const p = prev.cell;
    const n = next.cell;
    if (!!p !== !!n) return false;
    if (!p && !n) return true;
    if (p!.code1 !== n!.code1) return false;
    if (p!.code2 !== n!.code2) return false;
    if (p!.code3 !== n!.code3) return false;
    if (p!.quantity !== n!.quantity) return false;
    if (p!.note !== n!.note) return false;
    if (p!.isBoundary !== n!.isBoundary) return false;
    if (p!.isStockHold !== n!.isStockHold) return false;
    return true;
});

export const BufferGridPanel = forwardRef<BufferGridPanelHandle, BufferGridPanelProps>(({
    bufferCells,
    highlightedCode,
    onCellSingleTap,
    onCellDoubleTap,
    onSummaryItemClick,
    onLongPress,
}, ref) => {
    const config = BUFFER_GRID_CONFIG;
    const panelRef = useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => ({
        clearSelection: () => {
            // Buffer grid currently relies on global single tap selection for actions
        }
    }), []);

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [panelPosition, setPanelPosition] = useState(loadPanelPosition);
    const [isDraggingPanel, setIsDraggingPanel] = useState(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Compute summary from buffer cells
    const summaries = React.useMemo(() => {
        const materialMap = new Map<string, MaterialSummary>();

        bufferCells.forEach((cell) => {
            if (!cellHasContent(cell) || !cell.code1) return;

            const combinedCode = getCombinedCode(cell);
            const existing = materialMap.get(combinedCode);

            if (existing) {
                existing.totalQuantity += cell.quantity;
                existing.cellCount += 1;
            } else {
                materialMap.set(combinedCode, {
                    code1: cell.code1,
                    code2: cell.code2,
                    code3: cell.code3,
                    combinedCode,
                    totalQuantity: cell.quantity,
                    cellCount: 1,
                });
            }
        });

        return Array.from(materialMap.values()).sort((a, b) =>
            a.combinedCode.localeCompare(b.combinedCode)
        );
    }, [bufferCells]);

    const totalQuantity = React.useMemo(() => {
        return summaries.reduce((sum, s) => sum + s.totalQuantity, 0);
    }, [summaries]);

    // Panel dragging handlers
    const handlePanelDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        dragOffsetRef.current = {
            x: clientX - panelPosition.x,
            y: clientY - panelPosition.y,
        };
        setIsDraggingPanel(true);
    }, [panelPosition]);

    useEffect(() => {
        if (!isDraggingPanel) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

            const newPos = {
                x: Math.max(0, clientX - dragOffsetRef.current.x),
                y: Math.max(0, clientY - dragOffsetRef.current.y),
            };
            setPanelPosition(newPos);
        };

        const handleEnd = () => {
            setIsDraggingPanel(false);
            savePanelPosition(panelPosition);
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchmove', handleMove);
        document.addEventListener('touchend', handleEnd);

        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
        };
    }, [isDraggingPanel, panelPosition]);

    // Pointer event tracking logic for cells
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
        if (pointerDataRef.current.id !== -1) return;
        
        const pos = getCellPosFromEvent(e);
        if (!pos) return;

        pointerDataRef.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startTime: Date.now(),
            timer: window.setTimeout(() => {
                const state = pointerDataRef.current;
                state.timer = null;
                if (state.id !== -1) {
                    if (navigator.vibrate) navigator.vibrate(40);
                    onLongPress?.(pos.row, pos.col, e.clientX, e.clientY, true);
                    state.id = -1; // reset tracking
                }
            }, LONG_PRESS_DURATION)
        };
        e.preventDefault();
    }, [onLongPress]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const state = pointerDataRef.current;
        if (state.id !== e.pointerId) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > TAP_THRESHOLD) {
            if (state.timer !== null) {
                window.clearTimeout(state.timer);
                state.timer = null;
            }
        }
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        const state = pointerDataRef.current;
        if (state.id !== e.pointerId) return;

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

        state.id = -1;
    }, [onCellSingleTap, onCellDoubleTap]);

    const handlePointerCancel = useCallback(() => {
        const state = pointerDataRef.current;
        if (state.timer !== null) window.clearTimeout(state.timer);
        state.id = -1;
        state.timer = null;
    }, []);

    const gridWidth = config.cols * config.cellWidth + config.rowHeaderWidth;
    const gridHeight = config.rows * config.cellHeight + config.headerHeight;

    const gridElements = [];
    
    // Top-left corner
    gridElements.push(
        <div key="header-corner" style={{ 
            gridRow: 1, gridColumn: 1, backgroundColor: '#12192a', 
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
                backgroundColor: '#1a2235', color: '#6b7280', 
                fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                backgroundColor: '#1a2235', color: '#6b7280', 
                fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            const cell = bufferCells.get(key);
            const isHighlighted = highlightedCode ? (cell && getCombinedCode(cell) === highlightedCode) : false;

            gridElements.push(
                <GridCell 
                    key={key} 
                    row={r} 
                    col={c} 
                    cell={cell} 
                    isHighlighted={isHighlighted || false} 
                />
            );
        }
    }

    return (
        <div
            ref={panelRef}
            className={`buffer-panel ${isCollapsed ? 'collapsed' : ''}`}
            style={{
                left: panelPosition.x,
                top: panelPosition.y,
            }}
        >
            <div
                className="buffer-panel-header"
                onMouseDown={handlePanelDragStart}
                onTouchStart={handlePanelDragStart}
            >
                <span className="buffer-panel-title">📦 Buffer</span>
                <div className="buffer-panel-stats">
                    {summaries.length} types • {totalQuantity} total
                </div>
                <button
                    className="buffer-panel-toggle"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsCollapsed(!isCollapsed);
                    }}
                >
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>

            {!isCollapsed && (
                <div className="buffer-panel-content">
                    <div
                        className="buffer-grid-wrapper"
                        style={{
                            width: Math.min(gridWidth + 20, 350),
                            height: Math.min(gridHeight + 20, 250),
                        }}
                    >
                        <div 
                            className="buffer-grid-container"
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

                    {summaries.length > 0 && (
                        <div className="buffer-summary">
                            {summaries.map((summary) => {
                                const color = getMaterialColor(summary.code1);
                                return (
                                    <div
                                        key={summary.combinedCode}
                                        className="buffer-summary-item"
                                        onClick={() => onSummaryItemClick?.(summary.combinedCode)}
                                    >
                                        <div
                                            className="buffer-summary-indicator"
                                            style={{ backgroundColor: color.primary }}
                                        />
                                        <span
                                            className="buffer-summary-code"
                                            style={{ color: color.primary }}
                                        >
                                            {summary.combinedCode}
                                        </span>
                                        <span className="buffer-summary-qty">
                                            {summary.totalQuantity}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

BufferGridPanel.displayName = 'BufferGridPanel';

export default BufferGridPanel;
