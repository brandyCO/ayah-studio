// Favourite reciters (owner request 2026-10-31): a reciter starred in a picker can have their recitation
// downloaded and kept on this device, so the Listen tab and reels of those surahs never wait for the
// network. When starring, the user picks how much (whole Quran / Juz 'Amma / this surah / chosen surahs /
// nothing, with the size shown). Files go into the reciter's own cache (keptAudio.ts), exactly as served:
// Quran.com and mp3quran full-surah MP3s (with the timings they are read by), or everyayah's per-ayah files
// (with the aligned word times). Only on Wi-Fi (like the whole-mushaf download), while the app is open,
// one surah at a time; it carries on later where it stopped. This device only.
import { alignedWords } from './alignedWords';
import { forgetKept, keptCache } from './keptAudio';
import { mp3quranSizes, mp3quranSurah } from './mp3quran';
import { idle, unmetered } from './mushafDownload';
import { pinQdc } from './qdc';
import { loadMeta } from './quran';
import { covers, everyayahUrl, reciterById, RECITERS, type Reciter } from './reciters';

const WANT = 'favReciters'; // reciter id → surahs to keep ([] = a favourite with nothing to download)
const KEPT = 'favKept'; // reciter id → surahs kept + bytes

type Want = Record<string, number[]>;
type Kept = Record<string, { s: number[]; bytes: number }>;

const read = <T,>(k: string): T => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? '{}');
    return v && typeof v === 'object' ? v : ({} as T);
  } catch {
    return {} as T;
  }
};
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ }
};

export const favouriteIds = (): number[] => Object.keys(read<Want>(WANT)).map(Number).filter((id) => RECITERS.some((r) => r.id === id));
export const isFavourite = (id: number) => String(id) in read<Want>(WANT);
export const wantedSurahs = (id: number): number[] => read<Want>(WANT)[id] ?? [];
/** Favourites first, in the list's own order otherwise. */
export const favouritesFirst = (list: Reciter[]) => [...list.filter((r) => isFavourite(r.id)), ...list.filter((r) => !isFavourite(r.id))];

/** Every surah this reciter has a recording of. */
export const allSurahs = (r: Reciter) => Array.from({ length: 114 }, (_, i) => i + 1).filter((s) => covers(r, s));

export interface KeptInfo { kept: number; wanted: number; bytes: number; waiting: boolean; running: boolean }
export function keptInfo(id: number): KeptInfo {
  const want = wantedSurahs(id);
  const k = read<Kept>(KEPT)[id];
  const have = new Set(k?.s ?? []);
  return {
    kept: want.filter((s) => have.has(s)).length, wanted: want.length, bytes: k?.bytes ?? 0,
    waiting: !unmetered() || !navigator.onLine, running: busy === id,
  };
}

/** Star a reciter and keep `surahs` (added to what is wanted already); null = no longer a favourite,
 *  everything kept for it is deleted. */
export async function setFavourite(id: number, surahs: number[] | null, replace = false) {
  const want = read<Want>(WANT);
  if (surahs === null) {
    delete want[id];
    write(WANT, want);
    const kept = read<Kept>(KEPT);
    delete kept[id];
    write(KEPT, kept);
    stopFor = id;
    await caches.delete(keptCache(id)).catch(() => {});
    forgetKept();
  } else {
    want[id] = [...new Set([...(replace ? [] : want[id] ?? []), ...surahs])].sort((a, b) => a - b);
    write(WANT, want);
    if (surahs.length) void navigator.storage?.persist?.().catch(() => false);
  }
  changed();
  keepFavourites();
}

const changed = () => window.dispatchEvent(new Event('favourites-changed'));

// Size estimates: the recording's own size for mp3quran, else pages × ~66 s a page (≈ 11 h for the whole
// Quran; twice that for a Mujawwad recording) × the bitrate (everyayah's folder name; 128 kbps otherwise).
const START = [1, 2, 50, 76, 106, 128, 151, 177, 187, 207, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 331, 341, 349, 359, 366, 376, 385, 396, 404, 411, 414, 417, 428, 434, 440, 445, 452, 458, 467, 477, 483, 489, 496, 498, 502, 506, 511, 515, 518, 520, 523, 525, 528, 531, 534, 537, 542, 545, 548, 551, 553, 554, 555, 557, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 584, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604, 605];
const pages = (s: number) => Math.max(0.4, START[s] - START[s - 1]);
export async function estimateBytes(r: Reciter, surahs: number[]): Promise<number> {
  if (r.mp3quran) {
    const sizes = await mp3quranSizes(r).catch(() => ({} as Record<string, number>));
    return surahs.reduce((sum, s) => sum + (sizes[s] ?? 0), 0);
  }
  const kbps = Number(/(\d+)kbps/.exec(r.qdc === false ? r.everyayah ?? '' : '')?.[1] ?? 128);
  const perPage = 66 * (r.style === 'Mujawwad' ? 2 : 1);
  return surahs.reduce((sum, s) => sum + pages(s), 0) * perPage * kbps * 125;
}

// The background download.
let busy = 0; // reciter id being downloaded
let stopFor = 0;
let started = false;
const failed = new Set<string>(); // `${id}/${surah}` that failed this session (tried again next session)

/** Start (or resume) keeping the favourites' surahs. Safe to call often. */
export function keepFavourites() {
  if (!started) {
    started = true;
    const go = () => keepFavourites();
    (navigator as Navigator & { connection?: EventTarget }).connection?.addEventListener?.('change', go);
    window.addEventListener('online', go);
    document.addEventListener('visibilitychange', go);
  }
  if (busy || !ready()) return;
  void run();
}

const ready = () => document.visibilityState === 'visible' && navigator.onLine && unmetered();

function nextJob(): [Reciter, number] | null {
  const kept = read<Kept>(KEPT);
  for (const id of favouriteIds()) {
    const have = new Set(kept[id]?.s ?? []);
    const s = wantedSurahs(id).find((x) => !have.has(x) && !failed.has(`${id}/${x}`));
    if (s) return [reciterById(id), s];
  }
  return null;
}

async function run() {
  try {
    for (let job = nextJob(); job && ready(); job = nextJob()) {
      const [r, s] = job;
      busy = r.id;
      stopFor = 0;
      changed();
      await idle();
      try {
        const bytes = await keepSurah(r, s);
        if (stopFor === r.id || !isFavourite(r.id)) continue;
        const kept = read<Kept>(KEPT);
        const k = kept[r.id] ?? { s: [], bytes: 0 };
        if (!k.s.includes(s)) { k.s.push(s); k.bytes += bytes; }
        kept[r.id] = k;
        write(KEPT, kept);
      } catch (e) {
        if ((e as Error).message !== 'paused') failed.add(`${r.id}/${s}`);
      }
      changed();
    }
  } finally {
    busy = 0;
    changed();
  }
}

/** Downloads one surah of a reciter into its cache; returns the bytes added. */
async function keepSurah(r: Reciter, s: number): Promise<number> {
  const cache = await caches.open(keptCache(r.id));
  let urls: string[];
  if (r.qdc !== false) urls = [await pinQdc(r.id, s)];
  else if (r.mp3quran) urls = [(await mp3quranSurah(r, s)).audioUrl];
  else {
    const meta = await loadMeta();
    await alignedWords(r, s); // the word times, kept for offline reels
    urls = Array.from({ length: meta[s - 1].ayahs }, (_, i) => everyayahUrl(r, s, i + 1));
  }
  let bytes = 0;
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      if (stopFor === r.id || !ready()) throw new Error('paused');
      const hit = await cache.match(url);
      if (hit) { bytes += Number(hit.headers.get('Content-Length')) || 0; continue; }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // mp3quran sends a surah a reciter lacks from another reciter's folder: never keep that.
      if (res.url && res.url.slice(0, res.url.lastIndexOf('/')) !== url.slice(0, url.lastIndexOf('/'))) throw new Error('redirected');
      const blob = await res.blob();
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) } }));
      bytes += blob.size;
    }
  };
  await Promise.all([worker(), worker(), worker()].slice(0, urls.length > 1 ? 3 : 1));
  return bytes;
}

/** Space this device says is free (bytes), if it can tell. */
export async function freeSpace(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.quota !== undefined && e.usage !== undefined ? e.quota - e.usage : null;
  } catch {
    return null;
  }
}
