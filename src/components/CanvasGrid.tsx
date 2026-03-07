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
    onDragMove?: (x: number, y: number) => void;
    onDragEnd?: () => void;
    onCrossGridDrop?: (cell: CellData, targetRow: number, targetCol: number) => void;
    // Long-press action menu
    onLongPress?: (row: number, col: number, screenX: number, screenY: number) => void;
    // Multi-cell selection change
    onSelectionChange?: (keys: string[]) => void;
    canvasId?: string;
}

export interface CanvasGridHandle {
    checkDropTarget: (x: number, y: number) => { row: number; col: number } | null;
    getSelectedCells: () => string[];
    clearSelection: () => void;
}

interface VerticalGroup {
    col: number;
    startRow: number;
    endRow: number;
}

const LONG_PRESS_DURATION = 500; // ms
const TAP_MAX_DURATION = 250;    // ms - max time for a quick tap
const TAP_THRESHOLD = 10;        // pixels
const PINCH_THRESHOLD = 10;      // pixels
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export const CanvasGrid = forwardRef<CanvasGridHandle, CanvasGridProps>(({
    config,
    cells,
    onCellTap,
    highlightedCode,
    externalDragState,
    onDragMove,
    onDragEnd,
    onLongPress,
    onSelectionChange,
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Viewport state
    const [viewport, setViewport] = useState<ViewportState>({
        offsetX: 0,
        offsetY: 0,
        scale: 1,
    });

    // Gesture tracking (all refs = no re-render on pointer move)
    const pointersRef = useRef<Map<number, PointerData>>(new Map());
    const gestureStateRef = useRef<GestureState>('idle');
    const longPressTimerRef = useRef<number | null>(null);
    const longPressGridPosRef = useRef<{ row: number; col: number } | null>(null);
    const initialPinchDistanceRef = useRef<number>(0);
    const initialScaleRef = useRef<number>(1);
    const initialPinchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Multi-cell selection (ref-based, no re-render on change)
    const selectedCellsRef = useRef<Set<string>>(new Set());
    // Selection rect during drag-select (ref-based)
    const selectionRectRef = useRef<{
        startRow: number; startCol: number;
        endRow: number; endCol: number;
        active: boolean;
    } | null>(null);

    // Drag state (React state - only updates when drag starts/ends)
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        sourceCell: null,
        sourceRow: -1,
        sourceCol: -1,
        currentX: 0,
        currentY: 0,
    });
    // Drag position ref for animation frame (avoids React state updates on every move)
    const dragPosRef = useRef({ x: 0, y: 0 });

    // Highlight animation state
    const [highlightAlpha, setHighlightAlpha] = useState(0.3);
    const highlightAnimationRef = useRef<number | null>(null);

    // Selection redraw trigger (just a counter flip, minimal renders)
    const [selectionVersion, setSelectionVersion] = useState(0);

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
        const duration = 1500;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = elapsed / duration;

            if (progress >= 1) {
                setHighlightAlpha(0.3);
                return;
            }
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

    // Detect vertical groups
    const detectVerticalGroups = useCallback((): VerticalGroup[] => {
        const groups: VerticalGroup[] = [];
        const cellsByCol = new Map<number, number[]>();
        cells.forEach((cell) => {
            if (!cellHasContent(cell)) return;
            const rows = cellsByCol.get(cell.col) || [];
            rows.push(cell.row);
            cellsByCol.set(cell.col, rows);
        });

        cellsByCol.forEach((rows, col) => {
            if (rows.length < 2) return;
            rows.sort((a, b) => a - b);

            let groupStart = rows[0];
            let lastRow = rows[0];

            for (let i = 1; i < rows.length; i++) {
                const currentRow = rows[i];
                if (currentRow === lastRow + 1) {
                    lastRow = currentRow;
                } else {
                    if (lastRow > groupStart) {
                        groups.push({ col, startRow: groupStart, endRow: lastRow });
                    }
                    groupStart = currentRow;
                    lastRow = currentRow;
                }
            }
            if (lastRow > groupStart) {
                groups.push({ col, startRow: groupStart, endRow: lastRow });
            }
        });

        return groups;
    }, [cells]);

    // ────────────────────────────────────────────────────────────────────────────
    // DRAW
    // ────────────────────────────────────────────────────────────────────────────
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const { width, height } = canvas;
        const { offsetX, offsetY, scale } = viewport;
        const { cellWidth, cellHeight, headerHeight, rowHeaderWidth, rows, cols } = config;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        const startCol = Math.max(0, Math.floor(-offsetX / scale / cellWidth) - 1);
        const endCol = Math.min(cols, Math.ceil((width - offsetX) / scale / cellWidth) + 1);
        const startRow = Math.max(0, Math.floor(-offsetY / scale / cellHeight) - 1);
        const endRow = Math.min(rows, Math.ceil((height - offsetY) / scale / cellHeight) + 1);

        // Cells background
        ctx.fillStyle = '#16213e';
        ctx.fillRect(rowHeaderWidth, headerHeight, cols * cellWidth, rows * cellHeight);

        // Grid lines
        ctx.strokeStyle = '#0f3460';
        ctx.lineWidth = 1;

        for (let col = startCol; col <= endCol; col++) {
            const x = rowHeaderWidth + col * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, headerHeight);
            ctx.lineTo(x, headerHeight + rows * cellHeight);
            ctx.stroke();
        }

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
                    const materialColor = getMaterialColor(cell.code1);

                    ctx.fillStyle = materialColor.background;
                    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

                    ctx.fillStyle = materialColor.primary;
                    ctx.fillRect(x + 1, y + 1, 4, cellHeight - 2);

                    const padding = 8;
                    const fontSize = Math.min(14, cellHeight * 0.32);

                    const combinedLabel = cell.code1 + cell.code2;
                    if (combinedLabel) {
                        ctx.fillStyle = materialColor.primary;
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = 'left';
                        ctx.fillText(combinedLabel, x + padding, y + cellHeight * 0.3);
                    }

                    if (cell.code3) {
                        ctx.fillStyle = '#e8e8e8';
                        ctx.font = `${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = 'right';
                        ctx.fillText(cell.code3, x + cellWidth - padding, y + cellHeight * 0.3);
                    }

                    if (cell.quantity > 0) {
                        ctx.fillStyle = '#c0c0c0';
                        ctx.font = `${Math.min(13, cellHeight * 0.28)}px Inter, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText(String(cell.quantity), x + cellWidth / 2, y + cellHeight * 0.72);
                    }

                    if (cell.note) {
                        ctx.fillStyle = '#ffc107';
                        ctx.beginPath();
                        ctx.moveTo(x + cellWidth - 1, y + 1);
                        ctx.lineTo(x + cellWidth - 10, y + 1);
                        ctx.lineTo(x + cellWidth - 1, y + 10);
                        ctx.closePath();
                        ctx.fill();
                    }

                    // Image indicator (small dot in bottom-right if cell has image)
                    if (cell.imageId) {
                        ctx.fillStyle = '#4fc3f7';
                        ctx.beginPath();
                        ctx.arc(x + cellWidth - 6, y + cellHeight - 6, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // Highlight overlay
                    if (highlightedCode) {
                        const cellCode = getCombinedCode(cell);
                        if (cellCode === highlightedCode) {
                            ctx.fillStyle = `rgba(255, 235, 59, ${highlightAlpha})`;
                            ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
                        }
                    }
                }

                // Selection overlay (blue tint)
                const key2 = getCellKey(row, col);
                if (selectedCellsRef.current.has(key2)) {
                    const x = rowHeaderWidth + col * cellWidth;
                    const y = headerHeight + row * cellHeight;
                    ctx.fillStyle = 'rgba(66, 165, 245, 0.35)';
                    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
                    ctx.strokeStyle = '#42a5f5';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
                }
            }
        }

        // Draw selection rectangle during drag-select
        const selRect = selectionRectRef.current;
        if (selRect && selRect.active) {
            const r1 = Math.min(selRect.startRow, selRect.endRow);
            const r2 = Math.max(selRect.startRow, selRect.endRow);
            const c1 = Math.min(selRect.startCol, selRect.endCol);
            const c2 = Math.max(selRect.startCol, selRect.endCol);

            const x = rowHeaderWidth + c1 * cellWidth;
            const y = headerHeight + r1 * cellHeight;
            const w = (c2 - c1 + 1) * cellWidth;
            const h = (r2 - r1 + 1) * cellHeight;

            ctx.fillStyle = 'rgba(66, 165, 245, 0.15)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#42a5f5';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }

        // Vertical grouping frames
        const groups = detectVerticalGroups();
        for (const group of groups) {
            const x = rowHeaderWidth + group.col * cellWidth;
            const y = headerHeight + group.startRow * cellHeight;
            const groupHeight = (group.endRow - group.startRow + 1) * cellHeight;

            ctx.strokeStyle = '#FFD600';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, cellWidth, groupHeight);
        }

        ctx.restore();

        // Fixed column headers
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

        // Fixed row headers
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

        // Corner cell
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, rowHeaderWidth * scale + offsetX, headerHeight * scale + offsetY);

        // ── Drag preview (local drag) ──────────────────────────────────────────
        if (dragState.isDragging && dragState.sourceCell) {
            const rect = canvas.getBoundingClientRect();
            const dx = dragPosRef.current.x - rect.left;
            const dy = dragPosRef.current.y - rect.top;
            const dragColor = getMaterialColor(dragState.sourceCell.code1);

            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = dragColor.primary;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.fillRect(dx - (cellWidth * scale) / 2, dy - (cellHeight * scale) / 2, cellWidth * scale, cellHeight * scale);

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
            const targetPos = screenToGrid(dragPosRef.current.x, dragPosRef.current.y);
            if (targetPos) {
                ctx.save();
                ctx.translate(offsetX, offsetY);
                ctx.scale(scale, scale);
                const tx = rowHeaderWidth + targetPos.col * cellWidth;
                const ty = headerHeight + targetPos.row * cellHeight;
                const targetKey = getCellKey(targetPos.row, targetPos.col);
                const targetOccupied = cells.has(targetKey);
                ctx.strokeStyle = targetOccupied ? '#ff5252' : '#4ECDC4';
                ctx.lineWidth = 3;
                ctx.strokeRect(tx, ty, cellWidth, cellHeight);
                ctx.restore();
            }
        }

        // ── External drag preview (from buffer grid) ────────────────────────────
        if (externalDragState?.isDragging && externalDragState.sourceCell) {
            const targetPos = screenToGrid(externalDragState.currentX, externalDragState.currentY);
            if (targetPos) {
                ctx.save();
                ctx.translate(offsetX, offsetY);
                ctx.scale(scale, scale);
                const tx = rowHeaderWidth + targetPos.col * cellWidth;
                const ty = headerHeight + targetPos.row * cellHeight;
                const targetKey = getCellKey(targetPos.row, targetPos.col);
                const targetOccupied = cells.has(targetKey);

                ctx.fillStyle = targetOccupied ? 'rgba(255,82,82,0.2)' : 'rgba(78, 205, 196, 0.3)';
                ctx.fillRect(tx, ty, cellWidth, cellHeight);
                ctx.strokeStyle = targetOccupied ? '#ff5252' : '#4ECDC4';
                ctx.lineWidth = 2;
                ctx.strokeRect(tx, ty, cellWidth, cellHeight);
                ctx.restore();
            }

            const rect = canvas.getBoundingClientRect();
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
                ctx.fillRect(dx - (cellWidth * scale) / 2, dy - (cellHeight * scale) / 2, cellWidth * scale, cellHeight * scale);
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
    }, [viewport, config, cells, dragState, externalDragState, screenToGrid, detectVerticalGroups, highlightedCode, highlightAlpha, selectionVersion]);

    // ────────────────────────────────────────────────────────────────────────────
    // POINTER HANDLERS
    // ────────────────────────────────────────────────────────────────────────────

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
            longPressGridPosRef.current = gridPos;

            if (gridPos) {
                longPressTimerRef.current = window.setTimeout(() => {
                    const currentPointer = pointersRef.current.get(e.pointerId);
                    if (!currentPointer || pointersRef.current.size !== 1) return;

                    const dx = currentPointer.x - currentPointer.startX;
                    const dy = currentPointer.y - currentPointer.startY;
                    if (Math.sqrt(dx * dx + dy * dy) >= TAP_THRESHOLD) return;

                    gestureStateRef.current = 'longPress';
                    const key = getCellKey(gridPos.row, gridPos.col);
                    const cell = cells.get(key);

                    if (cell && cellHasContent(cell)) {
                        // Long-press on filled cell: first show action menu
                        // But if shift-click was detected earlier, skip menu and do drag
                        onLongPress?.(gridPos.row, gridPos.col, currentPointer.x, currentPointer.y);
                        if (navigator.vibrate) navigator.vibrate(40);
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
    }, [screenToGrid, cells, viewport.scale, onLongPress]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const pointer = pointersRef.current.get(e.pointerId);
        if (!pointer) return;

        pointer.x = e.clientX;
        pointer.y = e.clientY;

        const pointerCount = pointersRef.current.size;

        if (pointerCount === 1) {
            if (gestureStateRef.current === 'dragging') {
                // Update drag position via ref (no React state — no re-render)
                dragPosRef.current = { x: e.clientX, y: e.clientY };
                onDragMove?.(e.clientX, e.clientY);

                // Update selection rect if in drag-select mode
                if (selectionRectRef.current?.active) {
                    const gridPos = screenToGrid(e.clientX, e.clientY);
                    if (gridPos) {
                        selectionRectRef.current.endRow = gridPos.row;
                        selectionRectRef.current.endCol = gridPos.col;
                    }
                } else {
                    // Cell drag — update React state only once per frame
                    setDragState(prev => ({ ...prev, currentX: e.clientX, currentY: e.clientY }));
                }
            } else if (gestureStateRef.current !== 'longPress') {
                const dx = pointer.x - pointer.startX;
                const dy = pointer.y - pointer.startY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > TAP_THRESHOLD) {
                    clearLongPressTimer();

                    // Check if we started on a filled cell, if so, we drag the cell. 
                    // Otherwise, if we started on an empty cell/header, we drag-select.
                    const gridPos = longPressGridPosRef.current;
                    if (gridPos) {
                        const key = getCellKey(gridPos.row, gridPos.col);
                        const cell = cells.get(key);
                        if (cell && cellHasContent(cell) && !e.shiftKey) {
                            gestureStateRef.current = 'dragging';
                            setDragState({
                                isDragging: true,
                                sourceCell: cell,
                                sourceRow: gridPos.row,
                                sourceCol: gridPos.col,
                                currentX: e.clientX,
                                currentY: e.clientY,
                            });
                            dragPosRef.current = { x: e.clientX, y: e.clientY };
                            // Notify app
                            onDragMove?.(e.clientX, e.clientY);
                            return; // skip selection and panning
                        } else {
                            // Start Drag Select!
                            gestureStateRef.current = 'dragging';
                            selectionRectRef.current = {
                                startRow: gridPos.row, startCol: gridPos.col,
                                endRow: gridPos.row, endCol: gridPos.col,
                                active: true,
                            };
                            return; // skip panning
                        }
                    }

                    // Defaults to panning
                    gestureStateRef.current = 'panning';
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
    }, [viewport.scale, screenToGrid, onDragMove]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (canvas) canvas.releasePointerCapture(e.pointerId);

        const pointer = pointersRef.current.get(e.pointerId);
        clearLongPressTimer();

        if (pointer && pointersRef.current.size === 1) {
            const dx = pointer.x - pointer.startX;
            const dy = pointer.y - pointer.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const duration = Date.now() - pointer.startTime;

            if (gestureStateRef.current === 'dragging') {
                if (selectionRectRef.current?.active) {
                    // Finalize selection rect → convert to selected cells set
                    const rect = selectionRectRef.current;
                    const r1 = Math.min(rect.startRow, rect.endRow);
                    const r2 = Math.max(rect.startRow, rect.endRow);
                    const c1 = Math.min(rect.startCol, rect.endCol);
                    const c2 = Math.max(rect.startCol, rect.endCol);

                    const newSelection = new Set<string>();
                    for (let r = r1; r <= r2; r++) {
                        for (let c = c1; c <= c2; c++) {
                            newSelection.add(getCellKey(r, c));
                        }
                    }
                    selectedCellsRef.current = newSelection;
                    selectionRectRef.current = null;
                    setSelectionVersion(v => v + 1);
                    onSelectionChange?.(Array.from(newSelection));
                } else {
                    // Cell drag ended
                    setDragState({
                        isDragging: false,
                        sourceCell: null,
                        sourceRow: -1,
                        sourceCol: -1,
                        currentX: 0,
                        currentY: 0,
                    });
                    onDragEnd?.();
                }
            } else if (gestureStateRef.current === 'idle' &&
                distance < TAP_THRESHOLD &&
                duration < TAP_MAX_DURATION) {
                // Clean tap: open editor
                const gridPos = screenToGrid(pointer.startX, pointer.startY);
                if (gridPos) {
                    // Shift-click: toggle selection
                    if (e.shiftKey) {
                        const key = getCellKey(gridPos.row, gridPos.col);
                        const next = new Set(selectedCellsRef.current);
                        if (next.has(key)) {
                            next.delete(key);
                        } else {
                            next.add(key);
                        }
                        selectedCellsRef.current = next;
                        setSelectionVersion(v => v + 1);
                        onSelectionChange?.(Array.from(next));
                    } else {
                        // Normal tap: clear selection and open editor
                        if (selectedCellsRef.current.size > 0) {
                            selectedCellsRef.current = new Set();
                            setSelectionVersion(v => v + 1);
                        }
                        onCellTap(gridPos.row, gridPos.col);
                    }
                }
            }
            // Long-press tap-up: nothing more to do (action menu already fired)
        }

        pointersRef.current.delete(e.pointerId);

        if (pointersRef.current.size === 0) {
            gestureStateRef.current = 'idle';
            selectionRectRef.current = null;
        } else if (pointersRef.current.size === 1) {
            const remaining = Array.from(pointersRef.current.values())[0];
            remaining.startX = remaining.x;
            remaining.startY = remaining.y;
            gestureStateRef.current = 'panning';
        }
    }, [screenToGrid, onCellTap, onDragEnd, onSelectionChange]);

    const handlePointerCancel = useCallback((e: React.PointerEvent) => {
        pointersRef.current.delete(e.pointerId);
        clearLongPressTimer();
        selectionRectRef.current = null;

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

    const handleWheel = useCallback((_e: React.WheelEvent) => {
        // Native scrolling; no custom zoom
    }, []);

    // ────────────────────────────────────────────────────────────────────────────
    // CANVAS SIZING
    // ────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

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
            if (ctx) ctx.scale(dpr, dpr);
            draw();
        };

        updateSize();

        const resizeObserver = new ResizeObserver(() => draw());
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [config, viewport.scale, draw]);

    // Expose to parent
    useImperativeHandle(ref, () => ({
        checkDropTarget: (x: number, y: number) => {
            return screenToGrid(x, y);
        },
        getSelectedCells: () => Array.from(selectedCellsRef.current),
        clearSelection: () => {
            selectedCellsRef.current = new Set();
            setSelectionVersion(v => v + 1);
        },
    }), [screenToGrid]);

    // Redraw on state change
    useEffect(() => {
        draw();
    }, [draw]);

    // Animation loop for smooth drag and selection rect
    useEffect(() => {
        const needsAnimation = dragState.isDragging || (selectionRectRef.current?.active ?? false);
        if (!needsAnimation) return;

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
                overflow: 'auto',
                touchAction: 'pan-x pan-y',
                backgroundColor: '#1a1a2e',
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
                    touchAction: 'none',
                }}
            />
        </div>
    );
});

CanvasGrid.displayName = 'CanvasGrid';

export default CanvasGrid;
