import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'nineteen_space_face_db';
const DB_VERSION = 1;
const STORE_NAME = 'face_descriptors';

export interface StoredFaceDescriptor {
  siswaId: string;
  name: string;
  kelas?: string;
  nis?: string;
  descriptor: string; // Comma-separated Float32Array string
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'siswaId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveFaceDescriptorLocal(entry: StoredFaceDescriptor): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, entry);
  } catch (err) {
    console.error('[FaceDB] Error saving local descriptor:', err);
  }
}

export async function getFaceDescriptorLocal(siswaId: string): Promise<StoredFaceDescriptor | undefined> {
  try {
    const db = await getDB();
    return await db.get(STORE_NAME, siswaId);
  } catch (err) {
    console.error('[FaceDB] Error getting local descriptor:', err);
    return undefined;
  }
}

export async function getAllFaceDescriptorsLocal(): Promise<StoredFaceDescriptor[]> {
  try {
    const db = await getDB();
    return await db.getAll(STORE_NAME);
  } catch (err) {
    console.error('[FaceDB] Error getting all local descriptors:', err);
    return [];
  }
}

export async function clearFaceDescriptorsLocal(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (err) {
    console.error('[FaceDB] Error clearing local descriptors:', err);
  }
}
