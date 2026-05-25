import type { NarratorSession } from '@/lib/types';

const DB = 'narrator';
const FILES_STORE = 'files';
const SESSIONS_STORE = 'sessions';

export interface SavedSession {
  id: string;
  name: string;
  style: string;
  slideCount: number;
  createdAt: number;
  session: NarratorSession;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (oldVersion === 0) {
        db.createObjectStore(FILES_STORE);
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      } else if (oldVersion === 1) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePptx(buf: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    tx.objectStore(FILES_STORE).put(buf, 'pptx');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPptx(): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).get('pptx');
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session: NarratorSession): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();
  const record: SavedSession = {
    id,
    name: session.name,
    style: session.style,
    slideCount: session.slides.length,
    createdAt: Date.now(),
    session,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).add(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSessions(): Promise<SavedSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SESSIONS_STORE, 'readonly').objectStore(SESSIONS_STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as SavedSession[]);
      all.sort((a, b) => b.createdAt - a.createdAt);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSession(id: string): Promise<SavedSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SESSIONS_STORE, 'readonly').objectStore(SESSIONS_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
