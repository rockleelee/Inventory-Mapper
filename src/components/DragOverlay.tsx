import { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import { CellData, getCombinedCode, getMaterialColor } from '../types';

export interface DragOverlayHandle {
    updatePosition: (x: number, y: number) => void;
    show: (cell: CellData, x: number, y: number) => void;
    hide: () => void;
}

interface DragOverlayProps {
    zoomLevel?: number;
    cellWidth: number;
    cellHeight: number;
}

export const DragOverlay = forwardRef<DragOverlayHandle, DragOverlayProps>(({
    zoomLevel = 1,
    cellWidth,
    cellHeight
}, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    const [cell, setCell] = useState<CellData | null>(null);
    const elementRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
        updatePosition: (x: number, y: number) => {
            if (elementRef.current) {
                elementRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
        },
        show: (dragCell: CellData, startX: number, startY: number) => {
            setCell(dragCell);
            setIsVisible(true);
            // Wait for render to apply initial position
            requestAnimationFrame(() => {
                if (elementRef.current) {
                    elementRef.current.style.transform = `translate(${startX}px, ${startY}px)`;
                }
            });
        },
        hide: () => {
            setIsVisible(false);
            setCell(null);
        }
    }));

    if (!isVisible || !cell) return null;

    const color = getMaterialColor(cell.code1);
    const combinedCode = getCombinedCode(cell);

    // Calculate size based on zoom
    const width = cellWidth * zoomLevel;
    const height = cellHeight * zoomLevel;

    return (
        <div
            ref={elementRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: color.primary,
                opacity: 0.8,
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                // Centering the drag preview on the cursor
                marginTop: `-${height / 2}px`,
                marginLeft: `-${width / 2}px`,
                border: '2px solid rgba(255,255,255,0.5)',
                willChange: 'transform',
            }}
        >
            <span style={{
                color: '#fff',
                fontSize: `${14 * zoomLevel}px`,
                fontWeight: 'bold',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                fontFamily: 'Inter, sans-serif'
            }}>
                {combinedCode}
            </span>
            <span style={{
                color: '#eee',
                fontSize: `${12 * zoomLevel}px`,
                fontFamily: 'Inter, sans-serif'
            }}>
                {cell.quantity}
            </span>
        </div>
    );
});

DragOverlay.displayName = 'DragOverlay';
