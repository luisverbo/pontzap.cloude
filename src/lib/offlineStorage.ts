import { openDB, IDBPDatabase } from 'idb';

interface PendingClockRecord {
  id: string;
  employee_id: string;
  location_id: string;
  type: 'entry' | 'lunch_out' | 'lunch_in' | 'exit';
  timestamp: string;
  method: 'qr' | 'gps';
  latitude?: number;
  longitude?: number;
  synced: boolean;
  created_at: string;
}

const DB_NAME = 'pontzap-offline';
const STORE_NAME = 'pendingClockRecords';

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('by-synced', 'synced');
      }
    },
  });

  return dbInstance;
}

export async function savePendingClockRecord(record: Omit<PendingClockRecord, 'id' | 'synced' | 'created_at'>): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const fullRecord: PendingClockRecord = {
    ...record,
    id,
    synced: false,
    created_at: new Date().toISOString(),
  };
  await db.put(STORE_NAME, fullRecord);
  return id;
}

export async function getPendingClockRecords(): Promise<PendingClockRecord[]> {
  const db = await getDB();
  const allRecords = await db.getAll(STORE_NAME) as PendingClockRecord[];
  return allRecords.filter(record => !record.synced);
}

export async function markRecordAsSynced(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, id) as PendingClockRecord | undefined;
  if (record) {
    record.synced = true;
    await db.put(STORE_NAME, record);
  }
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function clearSyncedRecords(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const allRecords = await store.getAll() as PendingClockRecord[];
  
  for (const record of allRecords) {
    if (record.synced) {
      await store.delete(record.id);
    }
  }
  
  await tx.done;
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function addOnlineListener(callback: () => void): () => void {
  window.addEventListener('online', callback);
  return () => window.removeEventListener('online', callback);
}

export function addOfflineListener(callback: () => void): () => void {
  window.addEventListener('offline', callback);
  return () => window.removeEventListener('offline', callback);
}
