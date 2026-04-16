import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

interface CellActionMenuProps {
    x: number;
    y: number;
    selectedCount: number;
    hasClipboard: boolean;
    hasContent: boolean; // whether source cell has content (for copy/move)
    onMoveToBuffer: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onClose: () => void;
    isBuffer?: boolean;
}

export const CellActionMenu: React.FC<CellActionMenuProps> = ({
    x,
    y,
    selectedCount,
    hasClipboard,
    hasContent,
    onMoveToBuffer,
    onCopy,
    onPaste,
    onClose,
    isBuffer,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Close on outside click
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Close on Escape
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        // Small timeout so the triggering pointerup doesn't immediately close
        const timer = setTimeout(() => {
            document.addEventListener('pointerdown', handleClick);
            document.addEventListener('keydown', handleKey);
        }, 50);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('pointerdown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    // Adjust position to keep menu on screen
    const menuWidth = 190;
    const menuHeight = 140;
    const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

    const label = selectedCount > 1 ? `${selectedCount} cells` : 'Cell';

    const menu = (
        <div
            ref={menuRef}
            className="cell-action-menu"
            style={{ left: adjustedX, top: adjustedY }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="cell-action-menu-header">{label}</div>
            <button
                className="cell-action-item"
                disabled={!hasContent}
                onClick={() => { onMoveToBuffer(); onClose(); }}
            >
                <span className="cell-action-icon">{isBuffer ? '↖️' : '📦'}</span>
                {isBuffer ? 'Move to Main Grid' : 'Move to Buffer'}
            </button>
            <button
                className="cell-action-item"
                disabled={!hasContent}
                onClick={() => { onCopy(); onClose(); }}
            >
                <span className="cell-action-icon">📋</span>
                Copy
            </button>
            <button
                className={`cell-action-item ${!hasClipboard ? 'disabled' : ''}`}
                disabled={!hasClipboard}
                onClick={() => { if (hasClipboard) { onPaste(); onClose(); } }}
            >
                <span className="cell-action-icon">📌</span>
                Paste
            </button>
        </div>
    );

    return ReactDOM.createPortal(menu, document.body);
};

export default CellActionMenu;
