// Recitation audio kept on this device: the MP3 bytes each reel downloaded (only the slice covering
// its ayat, ~1 MB a minute), so a reel opened before also works offline and opens faster. The least
// recently used entries are dropped beyond MAX_ENTRIES or MAX_BYTES.
import { keepNewest, keepUnderBytes, tx } from './db';

const MAX_ENTRIES = 150;
const MAX_BYTES = 300 * 1024 * 1024;
const DAY = 24 * 3600 * 1000;
let trimmed = false;

interface Entry {
  key: string;
  bytes: Uint8Array;
  used: number;
  size?: number;
}
const sizeOf = (e: unknown) => (e as Entry).size ?? (e as Entry).bytes?.byteLength ?? 0;

async function store(key: string, bytes: Uint8Array) {
  try {
    // A copy: a view would store its whole underlying buffer.
    await tx('audio', 'readwrite', (s) => s.put({ key, bytes: bytes.slice(), used: Date.now(), size: bytes.byteLength } satisfies Entry));
    await keepNewest('audio', MAX_ENTRIES);
    // Reading every entry's size is not free: once per app session is enough.
    if (!trimmed) { trimmed = true; await keepUnderBytes('audio', MAX_BYTES, sizeOf); }
  } catch (e) {
    console.warn('Audio not kept for offline use', e);
  }
}

/** The bytes for `key` from the device if kept before, else from `load()` (then kept). */
export async function cachedBytes(key: string, load: () => Promise<Uint8Array>): Promise<Uint8Array> {
  try {
    const hit = await tx<Entry | undefined>('audio', 'readonly', (s) => s.get(key));
    if (hit?.bytes) {
      // Mark it as used (at most once a day: the entry is rewritten whole), so it is kept longer.
      if (Date.now() - hit.used > DAY) void tx('audio', 'readwrite', (s) => s.put({ ...hit, used: Date.now(), size: hit.bytes.byteLength })).catch(() => {});
      return hit.bytes;
    }
  } catch {
    /* no storage: download */
  }
  const bytes = await load();
  void store(key, bytes);
  return bytes;
}
