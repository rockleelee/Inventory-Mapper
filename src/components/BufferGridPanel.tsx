import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
    CellData,
    ViewportState,
    PointerData,
    GestureState,
    DragState,
    BUFFER_GRID_CONFIG,
    getColumnLabel,
    getCellKey,
    cellHasContent,
    getMaterialColor,
    getCombinedCode,
    MaterialSummary,
} from '../types';

interface BufferGridPanelProps {
    cells: Map<string, CellData>;
    highlightedCode: string | null;
    onCellTap: (row: number, col: number) => void;
    onCellDrop: (sourceRow: number, sourceCol: number, targetRow: number, targetCol: number) => void;
    onCrossGridDrop?: (cell: CellData, targetRow: number, targetCol: number) => void;
    onDragToMainGrid?: (cell: CellData, screenX: number, screenY: number) => void;
    onSummaryItemClick?: (combinedCode: string) => void;
}

const LONG_PRESS_DURATION = 500;
const TAP_THRESHOLD = 10;

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

export const BufferGridPanel: React.FC<BufferGridPanelProps> = ({
    cells,
    highlightedCode,
    onCellTap,
    onCellDrop,
    onSummaryItemClick,
}) => {
    const config = BUFFER_GRID_CONFIG;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [panelPosition, setPanelPosition] = useState(loadPanelPosition);
    const [isDraggingPanel, setIsDraggingPanel] = useState(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Viewport state (no zoom for buffer grid, simpler)
    const [viewport, setViewport] = useState<ViewportState>({
        offsetX: 0,
        offsetY: 0,
        scale: 1,
    });

    // Gesture tracking
    const pointersRef = useRef<Map<number, PointerData>>(new Map());
    const gestureStateRef = useRef<GestureState>('idle');
    const longPressTimerRef = useRef<number | null>(null);

    // Drag state for cells
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        sourceCell: null,
        sourceRow: -1,
        sourceCol: -1,
        currentX: 0,
        currentY: 0,
    });

    // Highlight animation state
    const [highlightAlpha, setHighlightAlpha] = useState(0.3);
    const highlightAnimationRef = useRef<number | null>(null);

    // Compute summary from buffer cells
    const summaries = React.useMemo(() => {
        const materialMap = new Map<string, MaterialSummary>();

        cells.forEach((cell) => {
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
    }, [cells]);

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

    // Convert screen coordinates to grid cell
    const screenToGrid = useCallback((screenX: number, screenY: number): { row: number; col: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const x = (screenX - rect.left - viewport.offsetX) / viewport.scale;
        const y = (screenY - rect.top - viewport.offsetY) / viewport.scale;

        if (y < config.headerHeight || x < config.rowHeaderWidth) {
            return null;
        }

        const col = Math.floor((x - config.rowHeaderWidth) / config.cellWidth);
        const row = Math.floor((y - config.headerHeight) / config.cellHeight);

        if (row < 0 || row >= config.rows || col < 0 || col >= config.cols) {
            return null;
        }

        return { row, col };
    }, [viewport, config]);

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    // Handle pointer down on canvas
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.setPointerCapture(e.pointerId);

        const pointer: PointerData = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            startX: e.clientX,
            startY: e.clientY,
            startTime: Date.now(),
        };

        pointersRef.current.set(e.pointerId, pointer);

        if (pointersRef.current.size === 1) {
            gestureStateRef.current = 'idle';

            const gridPos = screenToGrid(e.clientX, e.clientY);
            if (gridPos) {
                longPressTimerRef.current = window.setTimeout(() => {
                    const currentPointer = pointersRef.current.get(e.pointerId);
                    if (currentPointer && pointersRef.current.size === 1) {
                        const dx = currentPointer.x - currentPointer.startX;
                        const dy = currentPointer.y - currentPointer.startY;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < TAP_THRESHOLD) {
                            const key = getCellKey(gridPos.row, gridPos.col);
                            const cell = cells.get(key);

                            if (cell && cellHasContent(cell)) {
                                gestureStateRef.current = 'dragging';
                                setDragState({
                                    isDragging: true,
                                    sourceCell: cell,
                                    sourceRow: gridPos.row,
                                    sourceCol: gridPos.col,
                                    currentX: e.clientX,
                                    currentY: e.clientY,
                                });

                                if (navigator.vibrate) {
                                    navigator.vibrate(50);
                                }
                            }
                        }
                    }
                }, LONG_PRESS_DURATION);
            }
        }
    }, [screenToGrid, cells]);

    // Handle pointer move
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const pointer = pointersRef.current.get(e.pointerId);
        if (!pointer) return;

        pointer.x = e.clientX;
        pointer.y = e.clientY;

        if (pointersRef.current.size === 1) {
            if (gestureStateRef.current === 'dragging') {
                setDragState(prev => ({
                    ...prev,
                    currentX: e.clientX,
                    currentY: e.clientY,
                }));
            } else if (gestureStateRef.current !== 'longPress') {
                const dx = pointer.x - pointer.startX;
                const dy = pointer.y - pointer.startY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > TAP_THRESHOLD) {
                    clearLongPressTimer();
                    gestureStateRef.current = 'panning';

                    setViewport(prev => ({
                        ...prev,
                        offsetX: prev.offsetX + e.movementX,
                        offsetY: prev.offsetY + e.movementY,
                    }));
                }
            }
        }
    }, []);

    // Handle pointer up
    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.releasePointerCapture(e.pointerId);
        }

        const pointer = pointersRef.current.get(e.pointerId);
        clearLongPressTimer();

        if (pointer && pointersRef.current.size === 1) {
            const dx = pointer.x - pointer.startX;
            const dy = pointer.y - pointer.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const duration = Date.now() - pointer.startTime;

            if (gestureStateRef.current === 'dragging') {
                const targetPos = screenToGrid(e.clientX, e.clientY);
                if (targetPos && dragState.sourceCell) {
                    onCellDrop(
                        dragState.sourceRow,
                        dragState.sourceCol,
                        targetPos.row,
                        targetPos.col
                    );
                }

                setDragState({
                    isDragging: false,
                    sourceCell: null,
                    sourceRow: -1,
                    sourceCol: -1,
                    currentX: 0,
                    currentY: 0,
                });
            } else if (gestureStateRef.current === 'idle' && distance < TAP_THRESHOLD && duration < LONG_PRESS_DURATION) {
                const gridPos = screenToGrid(pointer.startX, pointer.startY);
                if (gridPos) {
                    onCellTap(gridPos.row, gridPos.col);
                }
            }
        }

        pointersRef.current.delete(e.pointerId);

        if (pointersRef.current.size === 0) {
            gestureStateRef.current = 'idle';
        }
    }, [screenToGrid, onCellTap, onCellDrop, dragState]);

    // Highlight animation effect
    useEffect(() => {
        if (!highlightedCode) {
            setHighlightAlpha(0.3);
            if (highlightAnimationRef.current) {
                cancelAnimationFrame(highlightAnimationRef.current);
            }
            return;
        }

        let startTime: number | null = null;
        const duration = 1500; // 1.5 seconds

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = elapsed / duration;

            if (progress >= 1) {
                setHighlightAlpha(0.3);
                return;
            }

            // Pulsing effect: 0.2 -> 0.5 -> 0.2
            const pulse = Math.sin(progress * Math.PI * 3) * 0.15 + 0.35;
            setHighlightAlpha(pulse);

            highlightAnimationRef.current = requestAnimationFrame(animate);
        };

        highlightAnimationRef.current = requestAnimationFrame(animate);

        return () => {
            if (highlightAnimationRef.current) {
                cancelAnimationFrame(highlightAnimationRef.current);
            }
        };
    }, [highlightedCode]);

    // Draw the grid
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const { width, height } = canvas;
        const { offsetX, offsetY, scale } = viewport;
        const { cellWidth, cellHeight, headerHeight, rowHeaderWidth, rows, cols } = config;

        // Clear canvas - slightly darker background for buffer
        ctx.fillStyle = '#12192a';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Draw cells background
        ctx.fillStyle = '#141c2f';
        ctx.fillRect(rowHeaderWidth, headerHeight, cols * cellWidth, rows * cellHeight);

        // Draw grid lines
        ctx.strokeStyle = '#0a1225';
        ctx.lineWidth = 1;

        for (let col = 0; col <= cols; col++) {
            const x = rowHeaderWidth + col * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, headerHeight);
            ctx.lineTo(x, headerHeight + rows * cellHeight);
            ctx.stroke();
        }

        for (let row = 0; row <= rows; row++) {
            const y = headerHeight + row * cellHeight;
            ctx.beginPath();
            ctx.moveTo(rowHeaderWidth, y);
            ctx.lineTo(rowHeaderWidth + cols * cellWidth, y);
            ctx.stroke();
        }

        // Draw cells with content
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const key = getCellKey(row, col);
                const cell = cells.get(key);

                if (cell && cellHasContent(cell)) {
                    const x = rowHeaderWidth + col * cellWidth;
                    const y = headerHeight + row * cellHeight;

                    const materialColor = getMaterialColor(cell.code1);

                    ctx.fillStyle = materialColor.background;
                    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

                    ctx.fillStyle = materialColor.primary;
                    ctx.fillRect(x + 1, y + 1, 3, cellHeight - 2);

                    const padding = 6;
                    const fontSize = Math.min(11, cellHeight * 0.32);

                    const combinedLabel = cell.code1 + cell.code2;
                    if (combinedLabel) {
                        ctx.fillStyle = materialColor.primary;
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = 'left';
                        ctx.fillText(combinedLabel, x + padding, y + cellHeight * 0.35);
                    }

                    if (cell.quantity > 0) {
                        ctx.fillStyle = '#c0c0c0';
                        ctx.font = `${Math.min(10, cellHeight * 0.28)}px Inter, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText(String(cell.quantity), x + cellWidth / 2, y + cellHeight * 0.72);
                    }

                    // Highlight overlay if this cell matches highlighted code
                    if (highlightedCode) {
                        const cellCode = getCombinedCode(cell);
                        if (cellCode === highlightedCode) {
                            ctx.fillStyle = `rgba(255, 235, 59, ${highlightAlpha})`;
                            ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
                        }
                    }
                }
            }
        }

        ctx.restore();

        // Draw column headers
        ctx.fillStyle = '#1a2235';
        ctx.fillRect(offsetX + rowHeaderWidth * scale, 0, cols * cellWidth * scale, headerHeight * scale);

        ctx.save();
        ctx.translate(offsetX, 0);
        ctx.scale(scale, scale);

        ctx.fillStyle = '#6b7280';
        ctx.font = `${10}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let col = 0; col < cols; col++) {
            const x = rowHeaderWidth + col * cellWidth + cellWidth / 2;
            ctx.fillText(getColumnLabel(col), x, headerHeight / 2);
        }

        ctx.restore();

        // Draw row headers
        ctx.fillStyle = '#1a2235';
        ctx.fillRect(0, offsetY + headerHeight * scale, rowHeaderWidth * scale, rows * cellHeight * scale);

        ctx.save();
        ctx.translate(0, offsetY);
        ctx.scale(scale, scale);

        ctx.fillStyle = '#6b7280';
        ctx.font = `${10}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let row = 0; row < rows; row++) {
            const y = headerHeight + row * cellHeight + cellHeight / 2;
            ctx.fillText(String(row + 1), rowHeaderWidth / 2, y);
        }

        ctx.restore();

        // Draw corner
        ctx.fillStyle = '#12192a';
        ctx.fillRect(0, 0, rowHeaderWidth * scale + offsetX, headerHeight * scale + offsetY);

        // Draw drag preview
        if (dragState.isDragging && dragState.sourceCell) {
            const rect = canvas.getBoundingClientRect();
            const dx = dragState.currentX - rect.left;
            const dy = dragState.currentY - rect.top;

            const dragColor = getMaterialColor(dragState.sourceCell.code1);

            ctx.save();
            ctx.globalAlpha = 0.8;

            ctx.fillStyle = dragColor.primary;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillRect(
                dx - (cellWidth * scale) / 2,
                dy - (cellHeight * scale) / 2,
                cellWidth * scale,
                cellHeight * scale
            );

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(getCombinedCode(dragState.sourceCell), dx, dy);

            ctx.restore();
        }
    }, [viewport, config, cells, dragState, highlightedCode, highlightAlpha]);

    // Resize canvas
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                const dpr = window.devicePixelRatio || 1;
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.scale(dpr, dpr);
                }

                draw();
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [draw]);

    // Redraw on state change
    useEffect(() => {
        draw();
    }, [draw]);

    // Animation loop for drag
    useEffect(() => {
        if (!dragState.isDragging) return;

        let animationId: number;
        const animate = () => {
            draw();
            animationId = requestAnimationFrame(animate);
        };
        animationId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationId);
    }, [dragState.isDragging, draw]);

    const gridWidth = config.cols * config.cellWidth + config.rowHeaderWidth;
    const gridHeight = config.rows * config.cellHeight + config.headerHeight;

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
                        ref={containerRef}
                        className="buffer-grid-container"
                        style={{
                            width: Math.min(gridWidth, 350),
                            height: Math.min(gridHeight, 250),
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            style={{
                                display: 'block',
                                cursor: dragState.isDragging ? 'grabbing' : 'default',
                                touchAction: 'none',
                            }}
                        />
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
};

export default BufferGridPanel;
