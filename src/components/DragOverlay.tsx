import React from 'react';
import ReactDOM from 'react-dom';
import { CrossGridDragState, getCombinedCode, getMaterialColor } from '../types';

interface DragOverlayProps {
    dragState: CrossGridDragState;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ dragState }) => {
    // Only render if we are currently dragging a valid cell
    if (!dragState.isDragging || !dragState.sourceCell) {
        return null;
    }

    const { currentX, currentY, sourceCell } = dragState;
    const materialColor = getMaterialColor(sourceCell.code1);
    const combinedCode = getCombinedCode(sourceCell);

    // Hardcode dimensions to match CSS variables loosely for the preview
    // In a real app we might pass zoom scale, but fixed size is often better for a floating thumb
    const width = 100;
    const height = 50;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        // Use CSS transform for hardware-accelerated movement
        // Translate by center of element to match cursor
        transform: `translate(${currentX - width / 2}px, ${currentY - height / 2}px)`,
        backgroundColor: materialColor.primary,
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
        pointerEvents: 'none', // Critical: do not block drop targets beneath!
        zIndex: 9999,
        opacity: 0.9,
        fontFamily: 'Inter, sans-serif',
    };

    const preview = (
        <div style={style}>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{combinedCode}</div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>{sourceCell.quantity > 0 ? sourceCell.quantity : ''}</div>
        </div>
    );

    return ReactDOM.createPortal(preview, document.body);
};

export default DragOverlay;
