import { openDB, IDBPDatabase } from 'idb';
import { CellData, getCellKey } from './types';

const DB_NAME = 'inventory-mapper-db';
const DB_VERSION = 4; // Bumped for image store
const STORE_NAME = 'cells';
const BUFFER_STORE_NAME = 'bufferCells';
const IMAGE_STORE_NAME = 'images';

interface InventoryDB {
    cells: {
        key: string;
        value: CellData & { key: string };
        indexes: { 'by-code1': string };
    };
    bufferCells: {
        key: string;
        value: CellData & { key: string };
        indexes: { 'by-code1': string };
    };
    images: {
        key: string;
        value: { id: string; dataUrl: string };
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

            // Add buffer cells store (version 3+)
            if (!db.objectStoreNames.contains(BUFFER_STORE_NAME)) {
                const bufferStore = db.createObjectStore(BUFFER_STORE_NAME, { keyPath: 'key' });
                bufferStore.createIndex('by-code1', 'code1');
            }

            // Add images store (version 4+)
            if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
                db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' });
            }
        },
    });

    return dbInstance;
}

// ========== IMAGE FUNCTIONS ==========

export async function saveImage(id: string, dataUrl: string): Promise<void> {
    const db = await getDB();
    await db.put(IMAGE_STORE_NAME, { id, dataUrl });
}

export async function loadImage(id: string): Promise<string | null> {
    const db = await getDB();
    const record = await db.get(IMAGE_STORE_NAME, id);
    return record?.dataUrl ?? null;
}

export async function deleteImage(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(IMAGE_STORE_NAME, id);
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

// ========== BUFFER GRID FUNCTIONS ==========

// Save a single buffer cell
export async function saveBufferCell(cell: CellData): Promise<void> {
    const db = await getDB();
    const key = getCellKey(cell.row, cell.col);
    await db.put(BUFFER_STORE_NAME, { ...cell, key });
}

// Save multiple buffer cells
export async function saveBufferCells(cells: CellData[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(BUFFER_STORE_NAME, 'readwrite');

    await Promise.all([
        ...cells.map(cell => {
            const key = getCellKey(cell.row, cell.col);
            return tx.store.put({ ...cell, key });
        }),
        tx.done,
    ]);
}

// Load all buffer cells
export async function loadAllBufferCells(): Promise<Map<string, CellData>> {
    const db = await getDB();
    const rawCells = await db.getAll(BUFFER_STORE_NAME);
    const cellMap = new Map<string, CellData>();

    for (const rawCell of rawCells) {
        const cell = migrateCellData(rawCell as unknown as LegacyCellData | CellData);
        const key = getCellKey(cell.row, cell.col);
        cellMap.set(key, cell);
    }

    return cellMap;
}

// Delete a buffer cell
export async function deleteBufferCell(row: number, col: number): Promise<void> {
    const db = await getDB();
    const key = getCellKey(row, col);
    await db.delete(BUFFER_STORE_NAME, key);
}

// Clear all buffer cells
export async function clearAllBufferCells(): Promise<void> {
    const db = await getDB();
    await db.clear(BUFFER_STORE_NAME);
}

// ========== EXPORT / IMPORT ==========

// Export for backup (returns all cells including buffer as JSON)
export async function exportData(): Promise<string> {
    const db = await getDB();
    const cells = await db.getAll(STORE_NAME);
    const bufferCells = await db.getAll(BUFFER_STORE_NAME);

    const processCell = async (cell: any) => {
        if (cell.imageId) {
            const dataUrl = await loadImage(cell.imageId);
            if (dataUrl) {
                const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
                if (match) {
                    return {
                        ...cell,
                        image: {
                            name: `image_${cell.row}_${cell.col}`,
                            type: match[1],
                            data: match[2]
                        }
                    };
                } else {
                    return { ...cell, image: { dataUrl } };
                }
            }
        }
        return cell;
    };

    const exportCells = await Promise.all(cells.map(processCell));
    const exportBufferCells = await Promise.all(bufferCells.map(processCell));

    return JSON.stringify({ cells: exportCells, bufferCells: exportBufferCells }, null, 2);
}

// Import from backup
export async function importData(jsonData: string): Promise<void> {
    const parsed = JSON.parse(jsonData);

    let rawCells: any[];
    let rawBufferCells: any[] = [];
    let rawImages: { id: string; dataUrl: string }[] = [];

    if (Array.isArray(parsed)) {
        rawCells = parsed;
    } else {
        rawCells = parsed.cells || [];
        rawBufferCells = parsed.bufferCells || [];
        rawImages = parsed.images || [];
    }

    const db = await getDB();
    const imageTx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    const imagePromises: Promise<any>[] = [];

    const extractImage = (raw: any) => {
        const cell = raw.data ? { ...raw.data } : { ...raw };
        const imageObj = raw.image || cell.image;

        if (imageObj) {
            let dataUrl = imageObj.dataUrl;
            if (!dataUrl && imageObj.data) {
                dataUrl = `data:${imageObj.type || 'image/jpeg'};base64,${imageObj.data}`;
            }

            if (dataUrl) {
                if (!cell.imageId) {
                    cell.imageId = Math.random().toString(36).slice(2) + Date.now().toString(36);
                }
                imagePromises.push(imageTx.store.put({ id: cell.imageId, dataUrl }));
            }
            delete cell.image;
        }
        return cell;
    };

    const cells: CellData[] = rawCells.map((raw: any) => migrateCellData(extractImage(raw)));
    const bufferCells: CellData[] = rawBufferCells.map((raw: any) => migrateCellData(extractImage(raw)));

    if (rawImages.length > 0) {
        for (const img of rawImages) {
            imagePromises.push(imageTx.store.put(img));
        }
    }
    
    if (imagePromises.length > 0) {
        imagePromises.push(imageTx.done);
        await Promise.all(imagePromises);
    }

    await clearAllCells();
    await saveCells(cells);

    await clearAllBufferCells();
    await saveBufferCells(bufferCells);
}

