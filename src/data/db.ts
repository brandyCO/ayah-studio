// The app's local database (IndexedDB, this device only): the media library, reel drafts and the
// recitation audio kept for offline use.
const NAME = 'ayah-studio';
const VERSION = 2;

export type StoreName = 'media' | 'drafts' | 'audio';

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
