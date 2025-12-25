// Core cell data structure
export interface CellData {
    row: number;
    col: number;
    materialCode: string;
    quantity: number;
    color: string;
    note: string;
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
    materialCode: string;
    totalQuantity: number;
    color: string;
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

// Default color palette for materials
export const MATERIAL_COLORS = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#96CEB4', // Green
    '#FFEAA7', // Yellow
    '#DDA0DD', // Plum
    '#98D8C8', // Mint
    '#F7DC6F', // Gold
    '#BB8FCE', // Purple
    '#85C1E9', // Sky
    '#F8B500', // Amber
    '#00CED1', // Dark Cyan
];

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
        materialCode: '',
        quantity: 0,
        color: '',
        note: '',
    };
}

// Check if cell has content
export function cellHasContent(cell: CellData | null | undefined): boolean {
    if (!cell) return false;
    return cell.materialCode !== '' || cell.quantity > 0 || cell.note !== '';
}

// Generate unique cell key
export function getCellKey(row: number, col: number): string {
    return `${row}-${col}`;
}
