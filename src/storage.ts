import { openDB, IDBPDatabase } from 'idb';
import { CellData, getCellKey } from './types';

const DB_NAME = 'inventory-mapper-db';
const DB_VERSION = 2; // Bumped version for migration
const STORE_NAME = 'cells';

interface InventoryDB {
    cells: {
        key: string;
        value: CellData & { key: string };
        indexes: { 'by-code1': string };
    };
}

// Legacy cell format (for migration)
interface LegacyCellData {
    row: number;
    col: number;
    materialCode: string;
    quantity: number;
    color: string;
    note: string;
}

// Parse legacy materialCode into code1/code2/code3
function parseLegacyMaterialCode(materialCode: string): { code1: string; code2: string; code3: string } {
    if (!materialCode) {
        return { code1: '', code2: '', code3: '' };
    }

    // Match pattern: letters at start (code1), numbers (code2), remaining (code3)
    const match = materialCode.match(/^([A-Za-z]+)(\d*)(.*)$/);
    if (match) {
        return {
            code1: match[1].toUpperCase(),
            code2: match[2] || '',
            code3: match[3]?.trim() || '',
        };
    }

    return { code1: materialCode, code2: '', code3: '' };
}

// Migrate legacy cell to new format
function migrateCellData(cell: LegacyCellData | CellData): CellData {
    // Check if already in new format
    if ('code1' in cell) {
        return cell as CellData;
    }

    // Migrate from legacy format
    const legacyCell = cell as LegacyCellData;
    const parsed = parseLegacyMaterialCode(legacyCell.materialCode);

    return {
        row: legacyCell.row,
        col: legacyCell.col,
        code1: parsed.code1,
        code2: parsed.code2,
        code3: parsed.code3,
        quantity: legacyCell.quantity,
        note: legacyCell.note,
    };
}

let dbInstance: IDBPDatabase<InventoryDB> | null = null;

async function getDB(): Promise<IDBPDatabase<InventoryDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<InventoryDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // Delete old store if it exists (migration)
            if (oldVersion < 2) {
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    // Note: We'll migrate data in loadAllCells
                }
            }

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('by-code1', 'code1');
            }
        },
    });

    return dbInstance;
}

// Save a single cell
export async function saveCell(cell: CellData): Promise<void> {
    const db = await getDB();
    const key = getCellKey(cell.row, cell.col);
    await db.put(STORE_NAME, { ...cell, key });
}

// Save multiple cells
export async function saveCells(cells: CellData[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');

    await Promise.all([
        ...cells.map(cell => {
            const key = getCellKey(cell.row, cell.col);
            return tx.store.put({ ...cell, key });
        }),
        tx.done,
    ]);
}

// Load all cells (with migration support)
export async function loadAllCells(): Promise<Map<string, CellData>> {
    const db = await getDB();
    const rawCells = await db.getAll(STORE_NAME);
    const cellMap = new Map<string, CellData>();

    for (const rawCell of rawCells) {
        // Migrate cell if needed
        const cell = migrateCellData(rawCell as unknown as LegacyCellData | CellData);
        const key = getCellKey(cell.row, cell.col);
        cellMap.set(key, cell);
    }

    return cellMap;
}

// Delete a cell
export async function deleteCell(row: number, col: number): Promise<void> {
    const db = await getDB();
    const key = getCellKey(row, col);
    await db.delete(STORE_NAME, key);
}

// Clear all cells
export async function clearAllCells(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE_NAME);
}

// Get cells by code1
export async function getCellsByCode1(code1: string): Promise<CellData[]> {
    const db = await getDB();
    const rawCells = await db.getAllFromIndex(STORE_NAME, 'by-code1', code1);
    return rawCells.map(cell => migrateCellData(cell as unknown as LegacyCellData | CellData));
}

// Export for backup (returns all cells as JSON)
export async function exportData(): Promise<string> {
    const db = await getDB();
    const cells = await db.getAll(STORE_NAME);
    return JSON.stringify(cells, null, 2);
}

// Import from backup
export async function importData(jsonData: string): Promise<void> {
    const rawCells = JSON.parse(jsonData);
    // Migrate any legacy cells during import
    const cells: CellData[] = rawCells.map((cell: LegacyCellData | CellData) => migrateCellData(cell));
    await clearAllCells();
    await saveCells(cells);
}
