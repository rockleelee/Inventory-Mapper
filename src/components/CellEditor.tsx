import React, { useState, useEffect, useRef } from 'react';
import { CellData, MATERIAL_COLORS, getColumnLabel } from '../types';

interface CellEditorProps {
    isOpen: boolean;
    row: number;
    col: number;
    cell: CellData | null;
    onSave: (cell: CellData) => void;
    onDelete: (row: number, col: number) => void;
    onClose: () => void;
}

export const CellEditor: React.FC<CellEditorProps> = ({
    isOpen,
    row,
    col,
    cell,
    onSave,
    onDelete,
    onClose,
}) => {
    const [materialCode, setMaterialCode] = useState('');
    const [quantity, setQuantity] = useState<string>('');
    const [color, setColor] = useState('');
    const [note, setNote] = useState('');
    const [showNote, setShowNote] = useState(false);

    const materialInputRef = useRef<HTMLInputElement>(null);

    // Initialize form when cell changes
    useEffect(() => {
        if (isOpen) {
            if (cell) {
                setMaterialCode(cell.materialCode);
                setQuantity(cell.quantity > 0 ? String(cell.quantity) : '');
                setColor(cell.color);
                setNote(cell.note);
                setShowNote(!!cell.note);
            } else {
                setMaterialCode('');
                setQuantity('');
                setColor(MATERIAL_COLORS[0]);
                setNote('');
                setShowNote(false);
            }

            // Focus on material code input
            setTimeout(() => {
                materialInputRef.current?.focus();
                materialInputRef.current?.select();
            }, 100);
        }
    }, [isOpen, cell]);

    const handleSave = () => {
        const newCell: CellData = {
            row,
            col,
            materialCode: materialCode.toUpperCase().trim(),
            quantity: parseInt(quantity) || 0,
            color: color || MATERIAL_COLORS[0],
            note: note.trim(),
        };

        onSave(newCell);
        onClose();
    };

    const handleDelete = () => {
        if (confirm('Delete this cell content?')) {
            onDelete(row, col);
            onClose();
        }
    };

    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d+$/.test(value)) {
            setQuantity(value);
        }
    };

    const incrementQuantity = () => {
        setQuantity(prev => String((parseInt(prev) || 0) + 1));
    };

    const decrementQuantity = () => {
        setQuantity(prev => {
            const current = parseInt(prev) || 0;
            return current > 0 ? String(current - 1) : '0';
        });
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="cell-editor">
                <div className="editor-header">
                    <h2>Cell {getColumnLabel(col)}{row + 1}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="editor-content">
                    <div className="form-group">
                        <label>Material Code</label>
                        <input
                            ref={materialInputRef}
                            type="text"
                            value={materialCode}
                            onChange={(e) => setMaterialCode(e.target.value)}
                            placeholder="e.g. S5, M12, P3"
                            maxLength={10}
                            autoCapitalize="characters"
                        />
                    </div>

                    <div className="form-group">
                        <label>Quantity</label>
                        <div className="quantity-input">
                            <button
                                className="quantity-btn"
                                onClick={decrementQuantity}
                                type="button"
                            >
                                −
                            </button>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={quantity}
                                onChange={handleQuantityChange}
                                placeholder="0"
                            />
                            <button
                                className="quantity-btn"
                                onClick={incrementQuantity}
                                type="button"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Color</label>
                        <div className="color-picker">
                            {MATERIAL_COLORS.map((c) => (
                                <button
                                    key={c}
                                    className={`color-option ${color === c ? 'selected' : ''}`}
                                    style={{ backgroundColor: c }}
                                    onClick={() => setColor(c)}
                                    type="button"
                                />
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <button
                            className="toggle-note-btn"
                            onClick={() => setShowNote(!showNote)}
                            type="button"
                        >
                            {showNote ? '▼ Hide Note' : '► Add Note'}
                        </button>
                        {showNote && (
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Additional notes..."
                                rows={3}
                            />
                        )}
                    </div>
                </div>

                <div className="editor-actions">
                    {cell && (
                        <button className="delete-btn" onClick={handleDelete}>
                            Delete
                        </button>
                    )}
                    <div className="action-spacer" />
                    <button className="cancel-btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="save-btn" onClick={handleSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CellEditor;
