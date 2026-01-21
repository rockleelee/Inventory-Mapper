import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import {
    CellData,
    GridConfig,
    ViewportState,
    PointerData,
    GestureState,
    DragState,
    CrossGridDragState,
    getColumnLabel,
    getCellKey,
    cellHasContent,
    getMaterialColor,
    getCombinedCode,
} from '../types';

interface CanvasGridProps {
    config: GridConfig;
    cells: Map<string, CellData>;
    onCellTap: (row: number, col: number) => void;
    highlightedCode?: string | null;
    // Cross-grid drag support
    externalDragState?: CrossGridDragState | null;
    onDragStart?: (cell: CellData, row: number, col: number) => void;
    onDragMove?: (x: number, y: number) => void;
    onDragEnd?: () => void;
    onCrossGridDrop?: (cell: CellData, targetRow: number, targetCol: number) => void;
    canvasId?: string;
}

export interface CanvasGridHandle {
    checkDropTarget: (x: number, y: number) => { row: number; col: number } | null;
}

interface VerticalGroup {
    col: number;
    startRow: number;
    endRow: number;
}

const LONG_PRESS_DURATION = 500; // ms
const TAP_THRESHOLD = 10; // pixels
const PINCH_THRESHOLD = 10; // pixels
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export const CanvasGrid = forwardRef<CanvasGridHandle, CanvasGridProps>(({
    config,
    cells,
    onCellTap,
    highlightedCode,
    externalDragState,
    onDragStart,
    onDragMove,
    onDragEnd,
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Viewport state
    const [viewport, setViewport] = useState<ViewportState>({
        offsetX: 0,
        offsetY: 0,
        scale: 1,
    });

    // Gesture tracking
    const pointersRef = useRef<Map<number, PointerData>>(new Map());
    const gestureStateRef = useRef<GestureState>('idle');
    const longPressTimerRef = useRef<number | null>(null);
    const initialPinchDistanceRef = useRef<number>(0);
    const initialScaleRef = useRef<number>(1);
    const initialPinchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Drag state
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

    // Convert screen coordinates to grid cell
    const screenToGrid = useCallback((screenX: number, screenY: number): { row: number; col: number } | null => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return null;

        const x = (screenX - rect.left - viewport.offsetX) / viewport.scale;
        const y = (screenY - rect.top - viewport.offsetY) / viewport.scale;

        // Check if in header area
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

    // Get distance between two pointers
    const getPointerDistance = (p1: PointerData, p2: PointerData): number => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    };

    // Get center between two pointers
    const getPointerCenter = (p1: PointerData, p2: PointerData): { x: number; y: number } => {
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
        };
    };

    // Clear long press timer
    const clearLongPressTimer = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    // Detect vertical groups - SPATIAL ONLY (not based on material code)
    // Groups cells that are vertically adjacent in the same column, regardless of content
    const detectVerticalGroups = useCallback((): VerticalGroup[] => {
        const groups: VerticalGroup[] = [];

        // Group cells by column
        const cellsByCol = new Map<number, number[]>(); // col -> sorted row numbers
        cells.forEach((cell) => {
            if (!cellHasContent(cell)) return;
            const rows = cellsByCol.get(cell.col) || [];
            rows.push(cell.row);
            cellsByCol.set(cell.col, rows);
        });

        // Process each column to find consecutive groups
        cellsByCol.forEach((rows, col) => {
            if (rows.length < 2) return;

            // Sort rows
            rows.sort((a, b) => a - b);

            let groupStart = rows[0];
            let lastRow = rows[0];

            for (let i = 1; i < rows.length; i++) {
                const currentRow = rows[i];

                if (currentRow === lastRow + 1) {
                    // Continue group (adjacent)
                    lastRow = currentRow;
                } else {
                    // End current group if it has 2+ cells
                    if (lastRow > groupStart) {
                        groups.push({
                            col,
                            startRow: groupStart,
                            endRow: lastRow,
                        });
                    }
                    // Start new group
                    groupStart = currentRow;
                    lastRow = currentRow;
                }
            }

            // Don't forget last group
            if (lastRow > groupStart) {
                groups.push({
                    col,
                    startRow: groupStart,
                    endRow: lastRow,
                });
            }
        });

        return groups;
    }, [cells]);

    // Handle pointer down
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
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

        const pointerCount = pointersRef.current.size;

        if (pointerCount === 1) {
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
                            gestureStateRef.current = 'longPress';

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

                                // Notify parent for cross-grid drag coordination
                                onDragStart?.(cell, gridPos.row, gridPos.col);

                                if (navigator.vibrate) {
                                    navigator.vibrate(50);
                                }
                            }
                        }
                    }
                }, LONG_PRESS_DURATION);
            }
        } else if (pointerCount === 2) {
            clearLongPressTimer();
            gestureStateRef.current = 'zooming';

            const pointers = Array.from(pointersRef.current.values());
            initialPinchDistanceRef.current = getPointerDistance(pointers[0], pointers[1]);
            initialScaleRef.current = viewport.scale;
            initialPinchCenterRef.current = getPointerCenter(pointers[0], pointers[1]);
        }
    }, [screenToGrid, cells, viewport.scale]);

    // Handle pointer move
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const pointer = pointersRef.current.get(e.pointerId);
        if (!pointer) return;

        pointer.x = e.clientX;
        pointer.y = e.clientY;

        const pointerCount = pointersRef.current.size;

        if (pointerCount === 1) {
            if (gestureStateRef.current === 'dragging') {
                setDragState(prev => ({
                    ...prev,
                    currentX: e.clientX,
                    currentY: e.clientY,
                }));
                // Notify parent for cross-grid coordination
                onDragMove?.(e.clientX, e.clientY);
            } else if (gestureStateRef.current !== 'longPress') {
                const dx = pointer.x - pointer.startX;
                const dy = pointer.y - pointer.startY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > TAP_THRESHOLD) {
                    clearLongPressTimer();
                    gestureStateRef.current = 'panning';

                    /* 
                     * RESTORE MAIN GRID CONFIGURATION:
                     * Disable custom panning to allow native browser scrolling.
                     * The canvas is now full-size, so we scroll the container instead.
                     */
                    // setViewport(prev => ({
                    //     ...prev,
                    //     offsetX: prev.offsetX + e.movementX,
                    //     offsetY: prev.offsetY + e.movementY,
                    // }));
                }
            }
        } else if (pointerCount === 2 && gestureStateRef.current === 'zooming') {
            const pointers = Array.from(pointersRef.current.values());
            const currentDistance = getPointerDistance(pointers[0], pointers[1]);
            const center = getPointerCenter(pointers[0], pointers[1]);

            if (Math.abs(currentDistance - initialPinchDistanceRef.current) > PINCH_THRESHOLD) {
                const scaleFactor = currentDistance / initialPinchDistanceRef.current;
                let newScale = initialScaleRef.current * scaleFactor;
                newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const cx = center.x - rect.left;
                    const cy = center.y - rect.top;

                    const scaleRatio = newScale / viewport.scale;

                    setViewport(prev => ({
                        offsetX: cx - (cx - prev.offsetX) * scaleRatio,
                        offsetY: cy - (cy - prev.offsetY) * scaleRatio,
                        scale: newScale,
                    }));
                }
            }
        }
    }, [viewport.scale]);

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
                /* 
                 * REFACTOR: REMOVE LOCAL DROP
                 * We rely solely on the parent (App.tsx) handling onDragEnd 
                 * to ensure single-source-of-truth and correct layering priority.
                 */
                // if (targetPos && dragState.sourceCell) {
                //     onCellDrop(...)
                // }
                // If targetPos is null, dragEnd callback will handle cross-grid scenario

                setDragState({
                    isDragging: false,
                    sourceCell: null,
                    sourceRow: -1,
                    sourceCol: -1,
                    currentX: 0,
                    currentY: 0,
                });

                // Notify parent that drag ended
                onDragEnd?.();
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
        } else if (pointersRef.current.size === 1) {
            const remaining = Array.from(pointersRef.current.values())[0];
            remaining.startX = remaining.x;
            remaining.startY = remaining.y;
            gestureStateRef.current = 'panning';
        }
    }, [screenToGrid, onCellTap, dragState]);

    // Handle pointer cancel
    const handlePointerCancel = useCallback((e: React.PointerEvent) => {
        pointersRef.current.delete(e.pointerId);
        clearLongPressTimer();

        if (pointersRef.current.size === 0) {
            gestureStateRef.current = 'idle';
            setDragState({
                isDragging: false,
                sourceCell: null,
                sourceRow: -1,
                sourceCol: -1,
                currentX: 0,
                currentY: 0,
            });
        }
    }, []);

    // Handle wheel zoom
    const handleWheel = useCallback((_e: React.WheelEvent) => {
        // RESTORE MAIN GRID CONFIGURATION:
        // Allow native browser scrolling by NOT calling preventDefault()
        // and NOT performing custom zoom/pan.

        /* 
        e.preventDefault();

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        let newScale = viewport.scale * delta;
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const scaleRatio = newScale / viewport.scale;

        setViewport({
            offsetX: cx - (cx - viewport.offsetX) * scaleRatio,
            offsetY: cy - (cy - viewport.offsetY) * scaleRatio,
            scale: newScale,
        });
        */
    }, [viewport]);

    // Draw the grid
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const { width, height } = canvas;
        const { offsetX, offsetY, scale } = viewport;
        const { cellWidth, cellHeight, headerHeight, rowHeaderWidth, rows, cols } = config;

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Calculate visible range
        const startCol = Math.max(0, Math.floor(-offsetX / scale / cellWidth) - 1);
        const endCol = Math.min(cols, Math.ceil((width - offsetX) / scale / cellWidth) + 1);
        const startRow = Math.max(0, Math.floor(-offsetY / scale / cellHeight) - 1);
        const endRow = Math.min(rows, Math.ceil((height - offsetY) / scale / cellHeight) + 1);

        // Draw cells background
        ctx.fillStyle = '#16213e';
        ctx.fillRect(rowHeaderWidth, headerHeight, cols * cellWidth, rows * cellHeight);

        // Draw grid lines
        ctx.strokeStyle = '#0f3460';
        ctx.lineWidth = 1;

        // Vertical lines
        for (let col = startCol; col <= endCol; col++) {
            const x = rowHeaderWidth + col * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, headerHeight);
            ctx.lineTo(x, headerHeight + rows * cellHeight);
            ctx.stroke();
        }

        // Horizontal lines
        for (let row = startRow; row <= endRow; row++) {
            const y = headerHeight + row * cellHeight;
            ctx.beginPath();
            ctx.moveTo(rowHeaderWidth, y);
            ctx.lineTo(rowHeaderWidth + cols * cellWidth, y);
            ctx.stroke();
        }

        // Draw cells with content
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                const key = getCellKey(row, col);
                const cell = cells.get(key);

                if (cell && cellHasContent(cell)) {
                    const x = rowHeaderWidth + col * cellWidth;
                    const y = headerHeight + row * cellHeight;

                    // Get dynamic color from code1
                    const materialColor = getMaterialColor(cell.code1);

                    // Cell background with darker shade of prefix color
                    ctx.fillStyle = materialColor.background;
                    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

                    // Left color indicator bar
                    ctx.fillStyle = materialColor.primary;
                    ctx.fillRect(x + 1, y + 1, 4, cellHeight - 2);

                    const padding = 8;
                    const fontSize = Math.min(14, cellHeight * 0.32);

                    // Top-left: Prefix + Number (e.g., S5, F5, Si10) with prefix color
                    const combinedLabel = cell.code1 + cell.code2;
                    if (combinedLabel) {
                        ctx.fillStyle = materialColor.primary;
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = 'left';
                        ctx.fillText(combinedLabel, x + padding, y + cellHeight * 0.3);
                    }

                    // Top-right: Suffix (e.g., PIM, STEEL) in white
                    if (cell.code3) {
                        ctx.fillStyle = '#e8e8e8';
                        ctx.font = `${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = 'right';
                        ctx.fillText(cell.code3, x + cellWidth - padding, y + cellHeight * 0.3);
                    }

                    // Bottom: Quantity value (centered)
                    if (cell.quantity > 0) {
                        ctx.fillStyle = '#c0c0c0';
                        ctx.font = `${Math.min(13, cellHeight * 0.28)}px Inter, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText(String(cell.quantity), x + cellWidth / 2, y + cellHeight * 0.72);
                    }

                    // Note indicator (small triangle in corner)
                    if (cell.note) {
                        ctx.fillStyle = '#ffc107';
                        ctx.beginPath();
                        ctx.moveTo(x + cellWidth - 1, y + 1);
                        ctx.lineTo(x + cellWidth - 10, y + 1);
                        ctx.lineTo(x + cellWidth - 1, y + 10);
                        ctx.closePath();
                        ctx.fill();
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

        // Draw vertical grouping frames (SPATIAL ONLY - any adjacent cells in same column)
        const groups = detectVerticalGroups();
        for (const group of groups) {
            const x = rowHeaderWidth + group.col * cellWidth;
            const y = headerHeight + group.startRow * cellHeight;
            const groupHeight = (group.endRow - group.startRow + 1) * cellHeight;

            ctx.strokeStyle = '#FFD600'; // Yellow outline
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, cellWidth, groupHeight);
        }

        ctx.restore();

        // Draw fixed column headers
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, headerHeight * scale + offsetY);

        ctx.save();
        ctx.translate(offsetX, 0);
        ctx.scale(scale, 1);

        ctx.fillStyle = '#2d3561';
        ctx.fillRect(rowHeaderWidth, 0, cols * cellWidth, headerHeight * scale);

        ctx.strokeStyle = '#0f3460';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#a0a0a0';
        ctx.font = `${12 * scale}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let col = startCol; col < endCol; col++) {
            const x = rowHeaderWidth + col * cellWidth + cellWidth / 2;
            ctx.fillText(getColumnLabel(col), x, headerHeight * scale / 2);
        }

        ctx.restore();

        // Draw fixed row headers
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, rowHeaderWidth * scale + offsetX, height);

        ctx.save();
        ctx.translate(0, offsetY);
        ctx.scale(1, scale);

        ctx.fillStyle = '#2d3561';
        ctx.fillRect(0, headerHeight, rowHeaderWidth * scale, rows * cellHeight);

        ctx.fillStyle = '#a0a0a0';
        ctx.font = `${12}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let row = startRow; row < endRow; row++) {
            const y = headerHeight + row * cellHeight + cellHeight / 2;
            ctx.fillText(String(row + 1), rowHeaderWidth * scale / 2, y);
        }

        ctx.restore();

        // Draw corner cell
        ctx.fillStyle = '#1a1a2e';
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
            ctx.shadowBlur = 10;
            ctx.fillRect(
                dx - (cellWidth * scale) / 2,
                dy - (cellHeight * scale) / 2,
                cellWidth * scale,
                cellHeight * scale
            );

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${14 * scale}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(getCombinedCode(dragState.sourceCell), dx, dy - 5 * scale);

            ctx.font = `${12 * scale}px Inter, sans-serif`;
            ctx.fillText(String(dragState.sourceCell.quantity), dx, dy + 10 * scale);

            ctx.restore();

            // Highlight target cell
            const targetPos = screenToGrid(dragState.currentX, dragState.currentY);
            if (targetPos) {
                ctx.save();
                ctx.translate(offsetX, offsetY);
                ctx.scale(scale, scale);

                const tx = rowHeaderWidth + targetPos.col * cellWidth;
                const ty = headerHeight + targetPos.row * cellHeight;

                ctx.strokeStyle = '#4ECDC4';
                ctx.lineWidth = 3;
                ctx.strokeRect(tx, ty, cellWidth, cellHeight);

                ctx.restore();
            }

            // Draw external drag preview (from other grid)
            if (externalDragState?.isDragging && externalDragState.sourceCell) {
                // Highlight valid drop target under cursor
                const targetPos = screenToGrid(externalDragState.currentX, externalDragState.currentY);
                if (targetPos) {
                    ctx.save();
                    ctx.translate(offsetX, offsetY);
                    ctx.scale(scale, scale);

                    const tx = rowHeaderWidth + targetPos.col * cellWidth;
                    const ty = headerHeight + targetPos.row * cellHeight;

                    // Green indicator for valid drop
                    ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
                    ctx.fillRect(tx, ty, cellWidth, cellHeight);

                    ctx.strokeStyle = '#4ECDC4';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(tx, ty, cellWidth, cellHeight);

                    ctx.restore();
                }

                // Draw floating cell preview
                const rect = canvas.getBoundingClientRect();
                // Check if cursor is roughly over this canvas
                if (externalDragState.currentX >= rect.left &&
                    externalDragState.currentX <= rect.right &&
                    externalDragState.currentY >= rect.top &&
                    externalDragState.currentY <= rect.bottom) {

                    const dx = externalDragState.currentX - rect.left;
                    const dy = externalDragState.currentY - rect.top;

                    const dragColor = getMaterialColor(externalDragState.sourceCell.code1);

                    ctx.save();
                    ctx.globalAlpha = 0.8;

                    ctx.fillStyle = dragColor.primary;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 10;
                    ctx.fillRect(
                        dx - (cellWidth * scale) / 2,
                        dy - (cellHeight * scale) / 2,
                        cellWidth * scale,
                        cellHeight * scale
                    );

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${14 * scale}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(getCombinedCode(externalDragState.sourceCell), dx, dy - 5 * scale);

                    ctx.font = `${12 * scale}px Inter, sans-serif`;
                    ctx.fillText(String(externalDragState.sourceCell.quantity), dx, dy + 10 * scale);

                    ctx.restore();
                }
            }
        }
    }, [viewport, config, cells, dragState, externalDragState, screenToGrid, detectVerticalGroups, highlightedCode, highlightAlpha]);

    // Resize canvas to full grid size (Restore Main Grid Configuration)
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        // Calculate full logical size
        const totalWidth = config.cols * config.cellWidth + config.rowHeaderWidth;
        const totalHeight = config.rows * config.cellHeight + config.headerHeight;

        const updateSize = () => {
            const dpr = window.devicePixelRatio || 1;
            const scaledWidth = totalWidth * viewport.scale;
            const scaledHeight = totalHeight * viewport.scale;

            canvas.width = scaledWidth * dpr;
            canvas.height = scaledHeight * dpr;

            canvas.style.width = `${scaledWidth}px`;
            canvas.style.height = `${scaledHeight}px`;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(dpr, dpr);
            }

            draw();
        };

        // Initial size
        updateSize();

        // Listen for container resize just to redraw if needed (though canvas size is fixed to grid)
        const resizeObserver = new ResizeObserver(() => {
            // We don't resize the canvas to the container anymore
            // But we might want to redraw
            draw();
        });

        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [config, viewport.scale, draw]); // depend on config and scale

    // Expose functionality to parent via ref
    useImperativeHandle(ref, () => ({
        checkDropTarget: (x: number, y: number) => {
            return screenToGrid(x, y);
        }
    }), [screenToGrid]);

    // Redraw on state change
    useEffect(() => {
        draw();
    }, [draw]);

    // Animation loop for smooth drag
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

    return (
        <div
            ref={containerRef}
            className="canvas-container"
            style={{
                flex: 1,
                overflow: 'auto', // Allow native scrolling
                touchAction: 'pan-x pan-y', // Allow browser handling of scrolling
                backgroundColor: '#1a1a2e', // Match theme
            }}
        >
            <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onWheel={handleWheel}
                style={{
                    display: 'block',
                    cursor: dragState.isDragging ? 'grabbing' : 'default',
                    // Allow browser to handle scrolling/panning
                    touchAction: 'pan-x pan-y',
                }}
            />
        </div>
    );
});

CanvasGrid.displayName = 'CanvasGrid';

export default CanvasGrid;
