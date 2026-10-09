// Quran.com QDC recitations: per reciter and surah, one full-surah MP3 plus verse and word timings.
// api.qurancdn.com is the documented host; api.quran.com serves the same API (also with CORS).
import type { VerseTiming } from '../engine/words';
import { keepNewest, tx } from './db';

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

/** Network first (then kept on the device); the copy kept before when offline. */
async function fetchJson(path: string): Promise<AudioFilesResponse> {
  try {
    const data = await fetchNetwork(path);
    void tx('timings', 'readwrite', (s) => s.put({ key: path, data, used: Date.now() }))
      .then(() => keepNewest('timings', MAX_KEPT))
      .catch((e) => console.warn('Timings not kept for offline use', e));
    return data;
  } catch (e) {
    const kept = await tx<{ data: AudioFilesResponse } | undefined>('timings', 'readonly', (s) => s.get(path)).catch(() => undefined);
    if (kept?.data) return kept.data;
    throw e;
  }
}

/** Audio URL and timings of one surah for one reciter (cached in memory and kept on the device). */
export function qdcSurah(reciterId: number, surah: number): Promise<QdcSurah> {
  const key = `${reciterId}/${surah}`;
  if (!cache.has(key)) {
    const p = fetchJson(`/api/qdc/audio/reciters/${reciterId}/audio_files?chapter=${surah}&segments=true`).then((d) => {
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
