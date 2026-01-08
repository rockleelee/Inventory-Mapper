import React, { useState, useEffect, useRef } from 'react';
import {
    CellData,
    CODE1_OPTIONS,
    CODE2_OPTIONS,
    MATERIAL_COLOR_MAP,
    getMaterialColor,
    getColumnLabel,
} from '../types';

interface CellEditorProps {
    isOpen: boolean;
    row: number;
    col: number;
    cell: CellData | null;
    onSave: (cell: CellData) => void;
    onDelete: (row: number, col: number) => void;
    onClose: () => void;
}

// Calculator state - clear separate states as required
interface CalculatorState {
    firstOperand: string;        // First number as string
    secondOperand: string;       // Second number as string
    operator: '+' | '-' | null;  // Current operator
    isEnteringSecondOperand: boolean;  // Are we typing the second number?
    result: string | null;       // Result after pressing =
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

    // Calculator state with clear separation
    const [calc, setCalc] = useState<CalculatorState>({
        firstOperand: '0',
        secondOperand: '',
        operator: null,
        isEnteringSecondOperand: false,
        result: null,
    });

    const code3InputRef = useRef<HTMLInputElement>(null);
    const quantityInputRef = useRef<HTMLInputElement>(null);

    // Initialize form when cell changes
    useEffect(() => {
        if (isOpen) {
            if (cell) {
                setCode1(cell.code1);
                setCode2(cell.code2);
                setCode3(cell.code3);
                setNote(cell.note);
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

    // Build display value showing full expression
    const getDisplayValue = (): string => {
        // If we have a result, show it
        if (calc.result !== null) {
            return calc.result;
        }

        // Build expression string
        let display = calc.firstOperand || '0';

        if (calc.operator) {
            display += ' ' + calc.operator;
            if (calc.secondOperand) {
                display += ' ' + calc.secondOperand;
            }
        }

        return display;
    };

    // Get the final quantity value for saving
    const getFinalQuantity = (): number => {
        if (calc.result !== null) {
            return parseFloat(calc.result) || 0;
        }
        // If there's a pending operation, calculate it first
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

        const newCell: CellData = {
            row,
            col,
            code1: code1.toUpperCase().trim(),
            code2: code2.trim(),
            code3: code3.toUpperCase().trim(),
            quantity: finalQuantity,
            note: note.trim(),
        };

        onSave(newCell);
        onClose();
    };

    const handleDelete = () => {
        onDelete(row, col);
        onClose();
    };

    // Handle typing in the quantity input
    const handleQuantityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;

        // If result is showing, start fresh
        if (calc.result !== null) {
            // Only keep numeric characters
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

        // Extract the part we're currently editing
        // The display shows "firstOperand" or "firstOperand + secondOperand"
        // We need to parse what the user is editing

        if (calc.isEnteringSecondOperand) {
            // User is editing second operand - extract it from the end
            const parts = inputValue.split(/\s*[+\-]\s*/);
            const newSecondOperand = parts[parts.length - 1]?.replace(/[^0-9.]/g, '') || '';
            setCalc(prev => ({
                ...prev,
                secondOperand: newSecondOperand,
            }));
        } else if (calc.operator) {
            // We have an operator but haven't started typing second operand yet
            const parts = inputValue.split(/\s*[+\-]\s*/);
            const newSecondOperand = parts[parts.length - 1]?.replace(/[^0-9.]/g, '') || '';
            if (newSecondOperand) {
                setCalc(prev => ({
                    ...prev,
                    secondOperand: newSecondOperand,
                    isEnteringSecondOperand: true,
                }));
            }
        } else {
            // Editing first operand only
            const numericOnly = inputValue.replace(/[^0-9.]/g, '');
            setCalc(prev => ({
                ...prev,
                firstOperand: numericOnly || '0',
            }));
        }
    };

    // Handle operator button press (+ or -)
    const handleOperator = (op: '+' | '-') => {
        // If we have a result, use it as first operand
        if (calc.result !== null) {
            setCalc({
                firstOperand: calc.result,
                secondOperand: '',
                operator: op,
                isEnteringSecondOperand: false,
                result: null,
            });
            return;
        }

        // If we already have a complete expression, calculate first
        if (calc.operator && calc.secondOperand) {
            const first = parseFloat(calc.firstOperand) || 0;
            const second = parseFloat(calc.secondOperand) || 0;
            let result = 0;
            if (calc.operator === '+') result = first + second;
            if (calc.operator === '-') result = first - second;

            setCalc({
                firstOperand: String(result),
                secondOperand: '',
                operator: op,
                isEnteringSecondOperand: false,
                result: null,
            });
            return;
        }

        // Just set the operator, keep first operand, wait for second
        setCalc(prev => ({
            ...prev,
            operator: op,
            secondOperand: '',
            isEnteringSecondOperand: false,
        }));

        // Focus the input to continue typing
        setTimeout(() => quantityInputRef.current?.focus(), 0);
    };

    // Handle equals button press
    const handleEquals = () => {
        // Need both operands and an operator to calculate
        if (!calc.operator || !calc.secondOperand) {
            return;
        }

        const first = parseFloat(calc.firstOperand) || 0;
        const second = parseFloat(calc.secondOperand) || 0;
        let result = 0;

        if (calc.operator === '+') {
            result = first + second;
        } else if (calc.operator === '-') {
            result = first - second;
        }

        // Set result and reset for next calculation
        setCalc({
            firstOperand: String(result),
            secondOperand: '',
            operator: null,
            isEnteringSecondOperand: false,
            result: String(result),
        });
    };

    // Handle direct keyboard input for digits
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const key = e.key;

        // Handle operator keys
        if (key === '+' || key === '-') {
            e.preventDefault();
            handleOperator(key as '+' | '-');
            return;
        }

        // Handle equals
        if (key === '=' || key === 'Enter') {
            e.preventDefault();
            handleEquals();
            return;
        }

        // Allow only numeric input, backspace, delete, arrows
        if (!/^[0-9.]$/.test(key) &&
            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(key)) {
            e.preventDefault();
            return;
        }

        // If result is showing and user types a digit, start fresh
        if (calc.result !== null && /^[0-9.]$/.test(key)) {
            e.preventDefault();
            setCalc({
                firstOperand: key === '.' ? '0.' : key,
                secondOperand: '',
                operator: null,
                isEnteringSecondOperand: false,
                result: null,
            });
            return;
        }

        // If we have an operator and no second operand yet, start second operand
        if (calc.operator && !calc.isEnteringSecondOperand && /^[0-9.]$/.test(key)) {
            e.preventDefault();
            setCalc(prev => ({
                ...prev,
                secondOperand: key === '.' ? '0.' : key,
                isEnteringSecondOperand: true,
            }));
            return;
        }

        // Continue entering current operand
        if (/^[0-9.]$/.test(key)) {
            e.preventDefault();
            if (calc.isEnteringSecondOperand) {
                setCalc(prev => ({
                    ...prev,
                    secondOperand: prev.secondOperand + key,
                }));
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

    // Get preview color based on selected code1
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
                            {/* Code 1 - Prefix Dropdown */}
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

                            {/* Code 2 - Size/Number Dropdown */}
                            <div className="code-input-wrapper code2-wrapper">
                                <select
                                    value={code2}
                                    onChange={(e) => setCode2(e.target.value)}
                                    className="code2-select"
                                >
                                    <option value="">—</option>
                                    {CODE2_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Code 3 - Suffix Text Input */}
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
                                value={getDisplayValue()}
                                onChange={handleQuantityInput}
                                onKeyDown={handleKeyDown}
                                placeholder="0"
                                className="quantity-display"
                            />
                            <button
                                className="quantity-btn"
                                onClick={() => handleOperator('+')}
                                type="button"
                            >
                                +
                            </button>
                            <button
                                className="quantity-btn"
                                onClick={() => handleOperator('-')}
                                type="button"
                            >
                                −
                            </button>
                            <button
                                className="quantity-btn"
                                onClick={handleEquals}
                                type="button"
                            >
                                =
                            </button>
                        </div>
                    </div>

                    {/* Note Section - Always Visible */}
                    <div className="form-group">
                        <label>NOTE</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Additional notes..."
                            rows={4}
                            className="note-textarea"
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
