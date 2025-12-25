import { openDB, IDBPDatabase } from 'idb';
import { CellData, getCellKey } from './types';

const DB_NAME = 'inventory-mapper-db';
const DB_VERSION = 1;
const STORE_NAME = 'cells';

interface InventoryDB {
    cells: {
        key: string;
        value: CellData;
        indexes: { 'by-material': string };
    };
}

let dbInstance: IDBPDatabase<InventoryDB> | null = null;

async function getDB(): Promise<IDBPDatabase<InventoryDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<InventoryDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('by-material', 'materialCode');
        },
    });

    return dbInstance;
}

// Save a single cell
export async function saveCell(cell: CellData): Promise<void> {
    const db = await getDB();
    const key = getCellKey(cell.row, cell.col);
    await db.put(STORE_NAME, { ...cell, key } as CellData & { key: string });
}

// Save multiple cells
export async function saveCells(cells: CellData[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');

    await Promise.all([
        ...cells.map(cell => {
            const key = getCellKey(cell.row, cell.col);
            return tx.store.put({ ...cell, key } as CellData & { key: string });
        }),
        tx.done,
    ]);
}

// Load all cells
export async function loadAllCells(): Promise<Map<string, CellData>> {
    const db = await getDB();
    const cells = await db.getAll(STORE_NAME);
    const cellMap = new Map<string, CellData>();

    for (const cell of cells) {
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

// Get cells by material code
export async function getCellsByMaterial(materialCode: string): Promise<CellData[]> {
    const db = await getDB();
    return db.getAllFromIndex(STORE_NAME, 'by-material', materialCode);
}

// Export for backup (returns all cells as JSON)
export async function exportData(): Promise<string> {
    const db = await getDB();
    const cells = await db.getAll(STORE_NAME);
    return JSON.stringify(cells, null, 2);
}

// Import from backup
export async function importData(jsonData: string): Promise<void> {
    const cells: CellData[] = JSON.parse(jsonData);
    await clearAllCells();
    await saveCells(cells);
}
