// The app's local database (IndexedDB, this device only): the media library, reel drafts and the
// recitation audio and timings kept for offline use, and the reflections journal.
const NAME = 'ayah-studio';
const VERSION = 4;

export type StoreName = 'media' | 'drafts' | 'audio' | 'timings' | 'reflections';

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'key' }).createIndex('used', 'used');
        if (!d.objectStoreNames.contains('timings')) d.createObjectStore('timings', { keyPath: 'key' }).createIndex('used', 'used');
        if (!d.objectStoreNames.contains('reflections')) d.createObjectStore('reflections', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        // Another tab with a newer version wants to upgrade: let it.
        req.result.onversionchange = () => { req.result.close(); dbp = null; };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close the app in other tabs to update its storage'));
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

/** One request in its own transaction; resolves when the transaction has committed. */
export async function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error ?? req?.error);
    t.onabort = () => reject(t.error ?? new Error('Storage transaction aborted'));
  });
}

/** Drops the least recently used entries of a store with a `used` index beyond `max`. */
export async function keepNewest(store: 'audio' | 'timings', max: number) {
  const count = await tx<number>(store, 'readonly', (s) => s.count());
  if (count <= max) return;
  let extra = count - max;
  await tx(store, 'readwrite', (s) => {
    const req = s.index('used').openKeyCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c || extra-- <= 0) return;
      s.delete(c.primaryKey);
      c.continue();
    };
  });
}
