// Starter footage (owner request 2026-11-19): Create opens the full studio at once, already holding a
// beautiful nature video from Pixabay. A small pool of clips is kept ready on the phone (in My media,
// like any Pixabay download), so a new reel never waits and never shows a plain mock-up. Each new reel
// takes a different clip; the pool is topped up quietly afterwards.
import { FOOTAGE } from '../engine/styles';
import { isBackground } from '../engine/backgrounds';
import { downloadHit, searchStock, stockEnabled, stockId, stockSources, type StockHit } from './stock';
import { loadLibrary } from './library';

const POOL = 'starterClips'; // ids ready on this device, oldest first
const USED = 'starterUsed'; // ids already given to a reel (most recent last, ≤ 40)
const POOL_SIZE = 2;
// Calm nature only (rule 4): no people; the proxy also filters people out by tags.
const QUERIES = FOOTAGE.filter((f) => f.id !== 'night').map((f) => f.q);

const read = (k: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
};
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

interface Conn { saveData?: boolean; type?: string }
const conn = () => (navigator as Navigator & { connection?: Conn }).connection;

/** Clips still in the library (the user may have removed one from My media). */
async function ready(): Promise<string[]> {
  await loadLibrary();
  const pool = read(POOL).filter((id) => isBackground(id));
  write(POOL, pool);
  return pool;
}

let filling: Promise<string | null> | null = null;
/** Downloads one more clip into the pool (one at a time). Resolves with its id, or null. */
export function fillStarter(force = false): Promise<string | null> {
  if (!stockEnabled() || (!force && conn()?.saveData)) return Promise.resolve(null);
  filling ??= (async () => {
    const pool = await ready();
    if (pool.length >= POOL_SIZE && !force) return null;
    const used = new Set([...read(USED), ...pool]);
    const src = await stockSources();
    const source = src.pixabay ? 'pixabay' : src.pexels ? 'pexels' : null;
    if (!source) return null;
    // A different kind of nature each time, starting from where the last one left off.
    const start = Number(localStorage.getItem('starterQ') ?? '0') || 0;
    for (let k = 0; k < QUERIES.length; k++) {
      const qi = (start + k) % QUERIES.length;
      const page = await searchStock({ source, type: 'video', q: QUERIES[qi], page: 1 }).catch(() => null);
      const hits = (page?.hits ?? []).filter((x: StockHit) => (x.duration ?? 0) >= 8 && !used.has(stockId(x))).slice(0, 8);
      if (!hits.length) continue;
      // Portrait clips fill the 9:16 frame best; otherwise any of the first few.
      const tall = hits.filter((x) => x.height > x.width);
      const list = tall.length ? tall : hits;
      const hit = list[Math.floor(Math.random() * Math.min(list.length, 5))];
      try { localStorage.setItem('starterQ', String(qi + 1)); } catch { /* ignore */ }
      const id = await downloadHit(hit);
      write(POOL, [...read(POOL).filter((x) => x !== id), id]);
      return id;
    }
    return null;
  })().catch(() => null).finally(() => { filling = null; });
  return filling;
}

/** A clip for a new reel: one from the pool at once (taken out of it), else null. Tops up the pool. */
export async function takeStarter(): Promise<string | null> {
  const pool = await ready();
  const id = pool.shift() ?? null;
  write(POOL, pool);
  if (id) write(USED, [...read(USED).filter((x) => x !== id), id].slice(-40));
  window.setTimeout(() => void fillStarter(), 4000); // the next reel's clip, once this one has opened
  return id;
}

/** The clip being downloaded right now for a reel that opened before any was ready. */
export async function waitStarter(): Promise<string | null> {
  const id = await fillStarter(true);
  if (!id) return null;
  return takeStarter().then((x) => x ?? id);
}

/** Called once after start (main.ts, 20 s in): keeps the pool ready, quietly. */
export function warmStarter() {
  if (!stockEnabled()) return;
  // On mobile data only for people who already make reels (~5–10 MB once).
  const c = conn();
  const wifi = c?.type ? c.type === 'wifi' || c.type === 'ethernet' : !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let maker = false;
  try { maker = localStorage.getItem('studioUsed') === '1'; } catch { /* ignore */ }
  if (!wifi && !maker) return;
  const go = () => void fillStarter();
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 }); else go();
}
