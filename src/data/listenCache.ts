// Recitations listened to are kept on this device (owner report 2026-11-11: "each time the user plays the same
// surah, it loads again"). While a surah plays from the network, its file (or, for everyayah reciters, each
// ayah's file) is downloaded once more in the background into Cache Storage `listen-audio`; the next time it
// plays from the phone, offline too (keptAudio.ts finds it like a favourite's download). The newest files are
// kept up to LIMIT bytes; the least recently played go first. Favourites' downloads are never touched here.
import { forgetKept } from './keptAudio';

export const LISTEN_CACHE = 'listen-audio';
const KEY = 'listenKept'; // url → [bytes, last played (ms)]
const LIMIT = 800e6;

type Index = Record<string, [number, number]>;
const read = (): Index => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const write = (v: Index) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage full or blocked */ }
};

/** A kept file was played again: it moves to the back of the queue for removal. */
export function touchListened(url: string) {
  const ix = read();
  if (!ix[url]) return;
  ix[url][1] = Date.now();
  write(ix);
}

/** Bytes kept from listening. */
export const listenedBytes = () => Object.values(read()).reduce((n, [b]) => n + b, 0);

const queue: string[] = [];
let running = false;

/** Keep `url` on this device (in the background, one file at a time). Safe to call often. */
export function keepListened(url: string) {
  if (typeof caches === 'undefined' || !url.startsWith('http') || read()[url] || queue.includes(url)) return;
  queue.push(url);
  if (!running) void run();
}

async function run() {
  running = true;
  try {
    while (queue.length) {
      const url = queue.shift()!;
      if (!navigator.onLine) { queue.length = 0; break; }
      try {
        if (await caches.match(url)) continue; // a favourite's download already has it
        const res = await fetch(url);
        if (!res.ok) continue;
        // mp3quran sends a surah a reciter lacks from another reciter's folder: never keep that.
        if (!url.includes('archive.org/') && res.url && res.url.slice(0, res.url.lastIndexOf('/')) !== url.slice(0, url.lastIndexOf('/'))) continue;
        const blob = await res.blob();
        if (blob.size < 1000) continue;
        const cache = await caches.open(LISTEN_CACHE);
        await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) } }));
        const ix = read();
        ix[url] = [blob.size, Date.now()];
        write(ix);
        await trim(cache);
      } catch { /* offline, storage full or refused: tried again the next time it plays */ }
    }
  } finally {
    running = false;
  }
}

async function trim(cache: Cache) {
  const ix = read();
  let total = Object.values(ix).reduce((n, [b]) => n + b, 0);
  if (total <= LIMIT) return;
  for (const [url, [b]] of Object.entries(ix).sort((x, y) => x[1][1] - y[1][1])) {
    if (total <= LIMIT) break;
    await cache.delete(url).catch(() => false);
    delete ix[url];
    total -= b;
  }
  write(ix);
  forgetKept();
}

/** Me → Settings: remove everything kept from listening. */
export async function clearListened() {
  queue.length = 0;
  await caches.delete(LISTEN_CACHE).catch(() => false);
  write({});
  forgetKept();
}
