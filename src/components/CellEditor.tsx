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

interface CalculatorState {
    firstOperand: string;
    secondOperand: string;
    operator: '+' | '-' | null;
    isEnteringSecondOperand: boolean;
    result: string | null;
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

    // Calculator state
    const [calc, setCalc] = useState<CalculatorState>({
        firstOperand: '0',
        secondOperand: '',
        operator: null,
        isEnteringSecondOperand: false,
        result: null,
    });

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
            if (cell) {
                setCode1(cell.code1);
                setCode2(cell.code2);
                setCode3(cell.code3);
                setNote(cell.note);
                setCalcHistory(cell.calcHistory || []);
                setImageId(cell.imageId);
                setCalc({
                    firstOperand: cell.quantity > 0 ? String(cell.quantity) : '0',
                    secondOperand: '',
                    operator: null,
                    isEnteringSecondOperand: false,
                    result: null,
                });
            } else {
                setCode1('');
                setCode2('');
                setCode3('');
                setNote('');
                setCalcHistory([]);
                setImageId(undefined);
                setImagePreviewUrl(null);
                setCalc({
                    firstOperand: '0',
                    secondOperand: '',
                    operator: null,
                    isEnteringSecondOperand: false,
                    result: null,
                });
            }
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

    // Build display value showing full expression
    const getDisplayValue = (): string => {
        if (calc.result !== null) return calc.result;
        let display = calc.firstOperand || '0';
        if (calc.operator) {
            display += ' ' + calc.operator;
            if (calc.secondOperand) display += ' ' + calc.secondOperand;
        }
        return display;
    };

    // Get the final quantity value for saving
    const getFinalQuantity = (): number => {
        if (calc.result !== null) return parseFloat(calc.result) || 0;
        if (calc.operator && calc.secondOperand) {
            const first = parseFloat(calc.firstOperand) || 0;
            const second = parseFloat(calc.secondOperand) || 0;
            if (calc.operator === '+') return first + second;
            if (calc.operator === '-') return first - second;
        }
        return parseFloat(calc.firstOperand) || 0;
    };

    const handleSave = () => {
        const finalQuantity = getFinalQuantity();
        // If there's a pending expression, finalize it into history before saving
        let finalHistory = [...calcHistory];
        if (calc.operator && calc.secondOperand && calc.result === null) {
            const result = finalQuantity;
            finalHistory = [...finalHistory, `${calc.operator}${calc.secondOperand}`, `=${result}`];
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

    // Handle typing in the quantity input
    const handleQuantityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        if (calc.result !== null) {
            const numericOnly = inputValue.replace(/[^0-9.]/g, '');
            setCalc({
                firstOperand: numericOnly || '0',
                secondOperand: '',
                operator: null,
                isEnteringSecondOperand: false,
                result: null,
            });
            return;
        }
        if (calc.isEnteringSecondOperand) {
            const parts = inputValue.split(/\s*[+\-]\s*/);
            const newSecondOperand = parts[parts.length - 1]?.replace(/[^0-9.]/g, '') || '';
            setCalc(prev => ({ ...prev, secondOperand: newSecondOperand }));
        } else if (calc.operator) {
            const parts = inputValue.split(/\s*[+\-]\s*/);
            const newSecondOperand = parts[parts.length - 1]?.replace(/[^0-9.]/g, '') || '';
            if (newSecondOperand) {
                setCalc(prev => ({ ...prev, secondOperand: newSecondOperand, isEnteringSecondOperand: true }));
            }
        } else {
            const numericOnly = inputValue.replace(/[^0-9.]/g, '');
            setCalc(prev => ({ ...prev, firstOperand: numericOnly || '0' }));
        }
    };

    // Handle operator button press
    const handleOperator = (op: '+' | '-') => {
        if (calc.result !== null) {
            // Push result as first entry if history is fresh
            const newHistory = calcHistory.length === 0
                ? [calc.result, `${op}`]
                : [...calcHistory, `${op}`];
            setCalcHistory(newHistory);
            setCalc({
                firstOperand: calc.result,
                secondOperand: '',
                operator: op,
                isEnteringSecondOperand: false,
                result: null,
            });
            return;
        }
        if (calc.operator && calc.secondOperand) {
            const first = parseFloat(calc.firstOperand) || 0;
            const second = parseFloat(calc.secondOperand) || 0;
            let result = 0;
            if (calc.operator === '+') result = first + second;
            if (calc.operator === '-') result = first - second;
            setCalcHistory(prev => [...prev, `${calc.operator}${calc.secondOperand}`]);
            setCalc({
                firstOperand: String(result),
                secondOperand: '',
                operator: op,
                isEnteringSecondOperand: false,
                result: null,
            });
            return;
        }
        // Record first operand in history if not yet
        if (calcHistory.length === 0) {
            setCalcHistory([calc.firstOperand]);
        }
        setCalc(prev => ({
            ...prev,
            operator: op,
            secondOperand: '',
            isEnteringSecondOperand: false,
        }));
        quantityInputRef.current?.focus();
    };

    // Handle equals button press
    const handleEquals = () => {
        if (!calc.operator || !calc.secondOperand) return;

        const first = parseFloat(calc.firstOperand) || 0;
        const second = parseFloat(calc.secondOperand) || 0;
        let result = 0;
        if (calc.operator === '+') result = first + second;
        else if (calc.operator === '-') result = first - second;

        // Append step + result to history
        const newHistory = [
            ...(calcHistory.length === 0 ? [calc.firstOperand] : calcHistory),
            `${calc.operator}${calc.secondOperand}`,
            `=${result}`,
        ];
        setCalcHistory(newHistory);

        setCalc({
            firstOperand: String(result),
            secondOperand: '',
            operator: null,
            isEnteringSecondOperand: false,
            result: String(result),
        });

        quantityInputRef.current?.focus();
    };

    // Handle quick number buttons
    const handleQuickNumber = (num: string) => {
        if (calc.result !== null) {
            setCalc({
                firstOperand: num,
                secondOperand: '',
                operator: null,
                isEnteringSecondOperand: false,
                result: null,
            });
            setCalcHistory([]);
            quantityInputRef.current?.focus();
            return;
        }
        if (calc.operator) {
            setCalc(prev => ({ ...prev, secondOperand: num, isEnteringSecondOperand: true }));
            quantityInputRef.current?.focus();
            return;
        }
        setCalc({
            firstOperand: num,
            secondOperand: '',
            operator: null,
            isEnteringSecondOperand: false,
            result: null,
        });
        setCalcHistory([]);
        quantityInputRef.current?.focus();
    };

    // Handle keydown
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const key = e.key;
        if (key === '+' || key === '-') {
            e.preventDefault();
            handleOperator(key as '+' | '-');
            return;
        }
        if (key === '=' || key === 'Enter') {
            e.preventDefault();
            handleEquals();
            return;
        }
        if (!/^[0-9.]$/.test(key) &&
            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(key)) {
            e.preventDefault();
            return;
        }
        if (calc.result !== null && /^[0-9.]$/.test(key)) {
            e.preventDefault();
            setCalc({
                firstOperand: key === '.' ? '0.' : key,
                secondOperand: '',
                operator: null,
                isEnteringSecondOperand: false,
                result: null,
            });
            setCalcHistory([]);
            return;
        }
        if (calc.operator && !calc.isEnteringSecondOperand && /^[0-9.]$/.test(key)) {
            e.preventDefault();
            setCalc(prev => ({
                ...prev,
                secondOperand: key === '.' ? '0.' : key,
                isEnteringSecondOperand: true,
            }));
            return;
        }
        if (/^[0-9.]$/.test(key)) {
            e.preventDefault();
            if (calc.isEnteringSecondOperand) {
                setCalc(prev => ({ ...prev, secondOperand: prev.secondOperand + key }));
            } else {
                setCalc(prev => ({
                    ...prev,
                    firstOperand: prev.firstOperand === '0' && key !== '.'
                        ? key
                        : prev.firstOperand + key,
                }));
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

                <div className="editor-content">
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
                                value={getDisplayValue()}
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
                                        setCalc({
                                            firstOperand: '0',
                                            secondOperand: '',
                                            operator: null,
                                            isEnteringSecondOperand: false,
                                            result: null,
                                        });
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
