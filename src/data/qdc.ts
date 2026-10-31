// Quran.com QDC recitations: per reciter and surah, one full-surah MP3 plus verse and word timings.
// api.qurancdn.com is the documented host; api.quran.com serves the same API (also with CORS).
import type { VerseTiming } from '../engine/words';
import { keepNewest, tx } from './db';
import { keptCache } from './keptAudio';

const HOSTS = ['https://api.qurancdn.com', 'https://api.quran.com'];

export interface QdcSurah {
  audioUrl: string;
  /** Recording length in seconds (approximate), if given. */
  duration: number | null;
  timings: Map<string, VerseTiming>;
}

interface AudioFilesResponse {
  audio_files: { audio_url: string; duration?: number | null; verse_timings: VerseTiming[] }[];
}

const cache = new Map<string, Promise<QdcSurah>>();
/** Timings kept on this device (IndexedDB) so reels opened before also work offline, in the app too. */
const MAX_KEPT = 120; // room for the Kids space's 38 surahs too

async function fetchNetwork(path: string): Promise<AudioFilesResponse> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** A copy kept within this time is used as it is (timings rarely change): no network call. */
const FRESH_MS = 3 * 24 * 3600 * 1000;

/** The copy kept on the device while fresh; else network first (then kept), the old copy when offline. */
async function fetchJson(path: string): Promise<AudioFilesResponse> {
  const pin = await pinned(path);
  if (pin) return pin;
  const kept = await tx<{ data: AudioFilesResponse; used: number; fetched?: number } | undefined>('timings', 'readonly', (s) => s.get(path)).catch(() => undefined);
  if (kept?.data && Date.now() - (kept.fetched ?? 0) < FRESH_MS) return kept.data;
  try {
    const data = await fetchNetwork(path);
    void tx('timings', 'readwrite', (s) => s.put({ key: path, data, used: Date.now(), fetched: Date.now() }))
      .then(() => keepNewest('timings', MAX_KEPT))
      .catch((e) => console.warn('Timings not kept for offline use', e));
    return data;
  } catch (e) {
    if (kept?.data) return kept.data;
    throw e;
  }
}

const pathOf = (reciterId: number, surah: number) => `/api/qdc/audio/reciters/${reciterId}/audio_files?chapter=${surah}&segments=true`;
/** A favourite reciter's timings are kept with their audio (in its own cache, never trimmed), so the
 *  timings always match the kept recording and need no network. */
const pinUrl = (path: string) => `https://kept.invalid${path}`;
async function pinned(path: string): Promise<AudioFilesResponse | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    const res = await caches.match(pinUrl(path));
    return res ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}
/** Keeps this surah's timings for a favourite reciter; returns its audio URL. */
export async function pinQdc(reciterId: number, surah: number): Promise<string> {
  const path = pathOf(reciterId, surah);
  const d = await fetchJson(path);
  const url = d.audio_files?.[0]?.audio_url;
  if (!url) throw new Error('No recording for this surah');
  await (await caches.open(keptCache(reciterId))).put(pinUrl(path), new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } }));
  return url;
}

/** Audio URL and timings of one surah for one reciter (cached in memory and kept on the device). */
export function qdcSurah(reciterId: number, surah: number): Promise<QdcSurah> {
  const key = `${reciterId}/${surah}`;
  if (!cache.has(key)) {
    const p = fetchJson(pathOf(reciterId, surah)).then((d) => {
      const f = d.audio_files?.[0];
      if (!f?.audio_url || !Array.isArray(f.verse_timings)) throw new Error('No recording for this surah');
      return {
        audioUrl: f.audio_url,
        duration: f.duration ? f.duration / 1000 : null,
        timings: new Map(f.verse_timings.map((v) => [v.verse_key, v])),
      };
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}
