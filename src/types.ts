// Core cell data structure
export interface CellData {
    row: number;
    col: number;
    code1: string;     // Material Code 1 (e.g., "S", "Si", "F")
    code2: string;     // Material Code 2 (e.g., "5", "10")
    code3: string;     // Material Code 3 (optional, e.g., "PIM")
    quantity: number;
    note: string;
    // Color is derived from code1, NOT stored
}

// Grid position type
export interface GridPosition {
    row: number;
    col: number;
}

// Viewport state for pan/zoom
export interface ViewportState {
    offsetX: number;
    offsetY: number;
    scale: number;
}

// Touch/pointer tracking
export interface PointerData {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    startTime: number;
}

// Gesture state
export type GestureState =
    | 'idle'
    | 'panning'
    | 'zooming'
    | 'longPress'
    | 'dragging';

// Material summary for aggregation
export interface MaterialSummary {
    code1: string;
    code2: string;
    code3: string;
    combinedCode: string;
    totalQuantity: number;
    cellCount: number;
}

// Editor modal state
export interface EditorState {
    isOpen: boolean;
    cell: CellData | null;
    row: number;
    col: number;
}

// Drag state
export interface DragState {
    isDragging: boolean;
    sourceCell: CellData | null;
    sourceRow: number;
    sourceCol: number;
    currentX: number;
    currentY: number;
}

// Grid configuration
export interface GridConfig {
    rows: number;
    cols: number;
    cellWidth: number;
    cellHeight: number;
    headerHeight: number;
    rowHeaderWidth: number;
}

// Default grid configuration
export const DEFAULT_GRID_CONFIG: GridConfig = {
    rows: 50,
    cols: 100,
    cellWidth: 80,
    cellHeight: 40,
    headerHeight: 30,
    rowHeaderWidth: 50,
};

// Material Color Map - colors determined by Code1 only
export const MATERIAL_COLOR_MAP: Record<string, { primary: string; background: string }> = {
    S: { primary: "#00FF66", background: "#0B3A2E" },
    F: { primary: "#FF3B3B", background: "#3A0B0B" },
    SI: { primary: "#FFD600", background: "#3A330B" },
    V: { primary: "#FF66CC", background: "#3A0B2A" },
    SH: { primary: "#0B7A3B", background: "#062F1A" },
    SP: { primary: "#FFC700", background: "#3A2F00" },
    SJ: { primary: "#FF8C00", background: "#3A1F00" },
    SW: { primary: "#2EE6C5", background: "#0B3A33" },
    SK: { primary: "#2EE6C5", background: "#0B3A33" },
    B: { primary: "#4DA6FF", background: "#0B1F3A" },
    TR: { primary: "#CFCFCF", background: "#2E2E2E" },
    P: { primary: "#CFCFCF", background: "#2E2E2E" }
};

// Get material color from Code1
export function getMaterialColor(code1: string): { primary: string; background: string } {
    return MATERIAL_COLOR_MAP[code1] || { primary: "#888888", background: "#2E2E2E" };
}

// Get combined material code display
export function getCombinedCode(cell: CellData): string {
    let code = cell.code1 + cell.code2;
    if (cell.code3) code += " " + cell.code3;
    return code;
}

// Get combined code for grouping (code1 + code2 only)
export function getGroupingCode(cell: CellData): string {
    return cell.code1 + cell.code2;
}

// List of all available Code1 options for dropdown
export const CODE1_OPTIONS = ['S', 'F', 'SI', 'V', 'SH', 'SP', 'SJ', 'SW', 'SK', 'B', 'TR', 'P'];

// List of Code2 numeric options for dropdown
export const CODE2_OPTIONS = ['1', '2.5', '5', '10', '18', '20', '25', '50'];

// Get column letter (A, B, C, ..., Z, AA, AB, ...)
export function getColumnLabel(col: number): string {
    let label = '';
    let n = col;
    while (n >= 0) {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    }
    return label;
}

// Create empty cell data
export function createEmptyCell(row: number, col: number): CellData {
    return {
        row,
        col,
        code1: '',
        code2: '',
        code3: '',
        quantity: 0,
        note: '',
    };
}

// Check if cell has content
export function cellHasContent(cell: CellData | null | undefined): boolean {
    if (!cell) return false;
    return cell.code1 !== '' || cell.quantity > 0 || cell.note !== '';
}

// Generate unique cell key
export function getCellKey(row: number, col: number): string {
    return `${row}-${col}`;
}
