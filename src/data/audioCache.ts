// Recitation audio kept on this device: the MP3 bytes each reel downloaded (only the slice covering
// its ayat, ~1 MB a minute), so a reel opened before also works offline and opens faster. Oldest
// entries are dropped beyond MAX_ENTRIES.
import { keepNewest, tx } from './db';

const MAX_ENTRIES = 150;

interface Entry {
  key: string;
  bytes: Uint8Array;
  used: number;
}

async function store(key: string, bytes: Uint8Array) {
  try {
    // A copy: a view would store its whole underlying buffer.
    await tx('audio', 'readwrite', (s) => s.put({ key, bytes: bytes.slice(), used: Date.now() } satisfies Entry));
    await keepNewest('audio', MAX_ENTRIES);
  } catch (e) {
    console.warn('Audio not kept for offline use', e);
  }
}

/** The bytes for `key` from the device if kept before, else from `load()` (then kept). */
export async function cachedBytes(key: string, load: () => Promise<Uint8Array>): Promise<Uint8Array> {
  try {
    const hit = await tx<Entry | undefined>('audio', 'readonly', (s) => s.get(key));
    if (hit?.bytes) return hit.bytes;
  } catch {
    /* no storage: download */
  }
  const bytes = await load();
  void store(key, bytes);
  return bytes;
}
