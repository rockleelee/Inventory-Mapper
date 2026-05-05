import React, { useState, useEffect, useRef } from 'react';
import {
    CellData,
    CODE1_OPTIONS,
    CODE2_OPTIONS,
    MATERIAL_COLOR_MAP,
    getMaterialColor,
    getColumnLabel,
} from '../types';
import { saveImage, loadImage, deleteImage } from '../storage';

interface CellEditorProps {
    isOpen: boolean;
    row: number;
    col: number;
    cell: CellData | null;
    onSave: (cell: CellData) => void;
    onDelete: (row: number, col: number) => void;
    onClose: () => void;
}



function generateId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    const [code1, setCode1] = useState('');
    const [code2, setCode2] = useState('');
    const [code3, setCode3] = useState('');
    const [note, setNote] = useState('');
    const [isBoundary, setIsBoundary] = useState(false);
    const [isStockHold, setIsStockHold] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Calculator state
    const [expression, setExpression] = useState('');
    const [currentValue, setCurrentValue] = useState('0');
    const [lastInputType, setLastInputType] = useState<'number' | 'operator'>('number');

    // Calculation history: array of step strings like ["4000", "+2000", "+500", "=6500"]
    const [calcHistory, setCalcHistory] = useState<string[]>([]);

    // Image state
    const [imageId, setImageId] = useState<string | undefined>(undefined);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(false);

    const code3InputRef = useRef<HTMLInputElement>(null);
    const quantityInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize form when cell changes
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => setIsReady(true), 250);
            if (cell) {
                setCode1(cell.code1);
                setCode2(cell.code2);
                setCode3(cell.code3);
                setNote(cell.note);
                setIsBoundary(cell.isBoundary || false);
                setIsStockHold(cell.isStockHold || false);
                setCalcHistory(cell.calcHistory || []);
                setImageId(cell.imageId);
                setExpression('');
                setCurrentValue(cell.quantity > 0 ? String(cell.quantity) : '0');
                setLastInputType('number');
            } else {
                setCode1('');
                setCode2('');
                setCode3('');
                setNote('');
                setIsBoundary(false);
                setIsStockHold(false);
                setCalcHistory([]);
                setImageId(undefined);
                setImagePreviewUrl(null);
                setExpression('');
                setCurrentValue('0');
                setLastInputType('number');
            }
            return () => clearTimeout(timer);
        } else {
            setIsReady(false);
        }
    }, [isOpen, cell]);

    // Load image from IndexedDB when imageId changes
    useEffect(() => {
        if (!imageId) {
            setImagePreviewUrl(null);
            return;
        }
        setImageLoading(true);
        loadImage(imageId).then((url) => {
            setImagePreviewUrl(url);
            setImageLoading(false);
        }).catch(() => {
            setImagePreviewUrl(null);
            setImageLoading(false);
        });
    }, [imageId]);

    function evaluateExpression(expr: string): number {
        try {
            const sanitized = expr.replace(/[^0-9+\-.]/g, '');
            if (!sanitized) return 0;
            return new Function('return ' + sanitized)() || 0;
        } catch {
            return 0;
        }
    }

    const handleSave = () => {
        const fullExpr = expression + (currentValue || '0');
        const finalQuantity = evaluateExpression(fullExpr);
        let finalHistory = [...calcHistory];
        
        if (expression) {
            finalHistory = [...finalHistory, fullExpr.trim(), `=${finalQuantity}`];
        }

        const newCell: CellData = {
            row,
            col,
            code1: code1.toUpperCase().trim(),
            code2: code2.trim(),
            code3: code3.toUpperCase().trim(),
            quantity: finalQuantity,
            note: note.trim(),
            calcHistory: finalHistory.length > 0 ? finalHistory : undefined,
            imageId,
            isBoundary,
            isStockHold,
        };

        onSave(newCell);
        onClose();
    };

    const handleDelete = async () => {
        // Delete image too if exists
        if (imageId) {
            try { await deleteImage(imageId); } catch { /* silent */ }
        }
        onDelete(row, col);
        onClose();
    };

    const handleQuantityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val.startsWith(expression)) {
            const remainder = val.slice(expression.length).replace(/[^0-9.]/g, '');
            setCurrentValue(remainder);
            if (remainder === '' && expression !== '') {
                setLastInputType('operator');
            } else {
                setLastInputType('number');
            }
        } else {
            setCurrentValue(val.replace(/[^0-9.]/g, ''));
            setExpression('');
            setLastInputType('number');
        }
    };

    const handleOperator = (op: '+' | '-') => {
        if (lastInputType === 'operator') return;

        setExpression(prev => prev + (currentValue || '0') + ` ${op} `);
        setCurrentValue('');
        setLastInputType('operator');
        quantityInputRef.current?.focus();
    };

    const handleEquals = () => {
        if (lastInputType === 'operator') return;

        const fullExpr = expression + (currentValue || '0');
        const result = evaluateExpression(fullExpr);
        
        if (expression) {
            setCalcHistory(prev => [...prev, fullExpr.trim(), `=${result}`]);
        }
        
        setExpression('');
        setCurrentValue(String(result));
        setLastInputType('number');
        quantityInputRef.current?.focus();
    };

    const handleQuickNumber = (num: string) => {
        if (lastInputType === 'operator') {
            setCurrentValue(num);
            setLastInputType('number');
        } else {
            if (currentValue === '0' || currentValue === '') {
                setCurrentValue(num);
            } else {
                setExpression(prev => prev + currentValue + ' + ');
                setCurrentValue(num);
            }
            setLastInputType('number');
        }
        quantityInputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === '=') {
            e.preventDefault();
            handleEquals();
        } else if (e.key === '+' || e.key === '-') {
            e.preventDefault();
            handleOperator(e.key as '+' | '-');
        } else if (e.key === 'Backspace') {
            if (currentValue === '' && expression !== '') {
                e.preventDefault();
                const parts = expression.trim().split(/\s+/);
                if (parts.length >= 2) {
                    parts.pop(); // remove operator
                    const val = parts.pop(); // get value
                    const newExpr = parts.length > 0 ? parts.join(' ') + ' ' : '';
                    setExpression(newExpr);
                    setCurrentValue(val || '');
                    setLastInputType('number');
                } else {
                    setExpression('');
                    setCurrentValue(parts[0] || '');
                    setLastInputType('number');
                }
            }
        }
    };

    // Handle image file selection
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            // Delete old image if replacing
            if (imageId) {
                try { await deleteImage(imageId); } catch { /* silent */ }
            }
            const newId = generateId();
            await saveImage(newId, dataUrl);
            setImageId(newId);
            setImagePreviewUrl(dataUrl);
        };
        reader.readAsDataURL(file);

        // Reset input so same file can be re-selected
        e.target.value = '';
    };

    const handleRemoveImage = async () => {
        if (imageId) {
            try { await deleteImage(imageId); } catch { /* silent */ }
        }
        setImageId(undefined);
        setImagePreviewUrl(null);
    };

    const previewColor = getMaterialColor(code1);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="cell-editor">
                <div className="editor-header">
                    <h2>Cell {getColumnLabel(col)}{row + 1}</h2>
                    <div className="editor-header-actions">
                        <button className="cancel-btn" onClick={onClose}>Cancel</button>
                        <button className="save-btn" onClick={handleSave}>Save</button>
                    </div>
                </div>

                <div className="editor-content" style={{ pointerEvents: isReady ? 'auto' : 'none' }}>
                    {/* Material Code Section */}
                    <div className="form-group">
                        <label>MATERIAL CODE</label>
                        <div className="material-code-inputs">
                            <div className="code-input-wrapper code1-wrapper">
                                <select
                                    value={code1}
                                    onChange={(e) => setCode1(e.target.value)}
                                    className="code1-select"
                                    style={{
                                        backgroundColor: code1 ? previewColor.primary : undefined,
                                        color: code1 ? '#000' : undefined,
                                    }}
                                >
                                    <option value="">—</option>
                                    {CODE1_OPTIONS.map((opt) => {
                                        const optColor = MATERIAL_COLOR_MAP[opt];
                                        return (
                                            <option
                                                key={opt}
                                                value={opt}
                                                style={{
                                                    backgroundColor: optColor?.primary,
                                                    color: '#000',
                                                }}
                                            >
                                                {opt}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div className="code-input-wrapper code2-wrapper">
                                <select
                                    value={code2}
                                    onChange={(e) => setCode2(e.target.value)}
                                    className="code2-select"
                                >
                                    <option value="">—</option>
                                    {CODE2_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="code-input-wrapper code3-wrapper">
                                <input
                                    ref={code3InputRef}
                                    type="text"
                                    value={code3}
                                    onChange={(e) => setCode3(e.target.value.toUpperCase())}
                                    placeholder="SUFFIX"
                                    className="code3-input"
                                    maxLength={10}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Quantity Section with Calculator */}
                    <div className="form-group">
                        <label>QUANTITY</label>
                        <div className="quantity-input">
                            <input
                                ref={quantityInputRef}
                                type="text"
                                inputMode="numeric"
                                enterKeyHint="done"
                                value={expression + currentValue}
                                onChange={handleQuantityInput}
                                onKeyDown={handleKeyDown}
                                placeholder="0"
                                className="quantity-display"
                            />
                            <button className="quantity-btn" onClick={() => handleOperator('+')} type="button">+</button>
                            <button className="quantity-btn" onClick={() => handleOperator('-')} type="button">−</button>
                            <button className="quantity-btn" onClick={handleEquals} type="button">=</button>
                        </div>

                        {/* Quick Number Buttons */}
                        <div className="quick-number-row">
                            <button type="button" className="quantity-btn quick-num-btn" onClick={() => handleQuickNumber('500')}>500</button>
                            <button type="button" className="quantity-btn quick-num-btn" onClick={() => handleQuickNumber('1000')}>1000</button>
                        </div>

                        {/* Calculation History Panel */}
                        {calcHistory.length > 0 && (
                            <div className="calc-history-panel">
                                <div className="calc-history-label">History</div>
                                <div className="calc-history-steps">
                                    {calcHistory.map((step, i) => (
                                        <span
                                            key={i}
                                            className={`calc-history-step ${step.startsWith('=') ? 'calc-result' : step.startsWith('+') || step.startsWith('-') ? 'calc-op' : 'calc-base'}`}
                                        >
                                            {step}
                                        </span>
                                    ))}
                                </div>
                                <button
                                    className="calc-history-clear"
                                    type="button"
                                    onClick={() => {
                                        setCalcHistory([]);
                                        setExpression('');
                                        setCurrentValue('0');
                                        setLastInputType('number');
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Note Section */}
                    <div className="form-group">
                        <label>NOTE</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Additional notes..."
                            rows={3}
                            className="note-textarea"
                        />
                    </div>

                    {/* Boundary & Stock Hold Marker Section */}
                    <div className="form-group checkbox-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal', color: 'var(--text-primary)', fontSize: 'var(--font-size-md)' }}>
                            <input
                                type="checkbox"
                                checked={isBoundary}
                                onChange={(e) => setIsBoundary(e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                            />
                            Mark as Boundary / Divider Cell
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal', color: 'var(--text-primary)', fontSize: 'var(--font-size-md)' }}>
                            <input
                                type="checkbox"
                                checked={isStockHold}
                                onChange={(e) => setIsStockHold(e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                            />
                            Mark as Stock Hold Cell
                        </label>
                    </div>

                    {/* Image Section */}
                    <div className="form-group image-section">
                        <label>IMAGE</label>

                        {imageLoading && (
                            <div className="image-loading">Loading image...</div>
                        )}

                        {imagePreviewUrl && !imageLoading && (
                            <div className="image-preview-wrapper">
                                <img
                                    src={imagePreviewUrl}
                                    alt="Cell attachment"
                                    className="image-preview"
                                />
                                <button
                                    type="button"
                                    className="image-remove-btn"
                                    onClick={handleRemoveImage}
                                    title="Remove image"
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        <button
                            type="button"
                            className="image-add-btn"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {imagePreviewUrl ? '🔄 Replace Image' : '📷 Add Image'}
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImageSelect}
                        />
                    </div>
                </div>

                <div className="editor-actions">
                    {cell && (
                        <button className="delete-btn" onClick={handleDelete}>
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CellEditor;
