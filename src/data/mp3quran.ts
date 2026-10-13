// mp3quran.net recitations: full-surah MP3s (CBR, Range-fetched like QDC's) cut into ayat at the pauses
// `scripts/verify-mp3quran.py` measured in the audio, for the surahs it verified. No word timings
// (Ayah mode only, rule 8). The cut points are bundled (public/data/mp3quran/{read}.json), so nothing
// is guessed at run time; a recording whose size changed since the check is refused. A cut the check
// could not place (no pause there: ayat joined in one breath, or a wrong time) is null, and a reel may
// not start, end or change ayah there (`UncheckedRange`).
import type { VerseTiming } from '../engine/words';
import { covers, type Reciter } from './reciters';

interface Checked {
  folder: string;
  surahs: Record<string, { size: number; c: (number | null)[] }>;
}

const files = new Map<number, Promise<Checked>>();

function checked(read: number): Promise<Checked> {
  if (!files.has(read)) {
    const p = fetch(`./data/mp3quran/${read}.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Checked>;
    });
    p.catch(() => files.delete(read));
    files.set(read, p);
  }
  return files.get(read)!;
}

const sizes = new Map<string, Promise<number | null>>();
/** The file's size now (null when it cannot be told, e.g. offline: the cached bytes are then used). */
function sizeOf(url: string): Promise<number | null> {
  if (!sizes.has(url)) {
    sizes.set(url, fetch(url, { method: 'HEAD' }).then((r) => {
      const n = Number(r.headers.get('Content-Length'));
      return r.ok && n > 0 ? n : null;
    }, () => null));
  }
  return sizes.get(url)!;
}

/** The selected ayat include a boundary the check could not verify. */
export class UncheckedRange extends Error {}

/** Whether ayat from..to of the surah can be cut from this reciter's verified recording. */
export async function mp3quranRange(r: Reciter, surah: number, from: number, to: number): Promise<boolean> {
  if (!r.mp3quran || !covers(r, surah)) return false;
  const c = (await checked(r.mp3quran.read)).surahs[String(surah)]?.c;
  return !!c && to < c.length && c.slice(from - 1, to + 1).every((x) => x !== null);
}

export interface Mp3QuranSurah {
  audioUrl: string;
  /** Per ayah: from the pause before it to the pause after it (ms, file time), as QDC-style timings without words. */
  timings: Map<string, VerseTiming>;
}

export async function mp3quranSurah(r: Reciter, surah: number): Promise<Mp3QuranSurah> {
  if (!r.mp3quran || !covers(r, surah)) throw new Error(`No verified recording of surah ${surah} for ${r.name}`);
  const data = await checked(r.mp3quran.read);
  const s = data.surahs[String(surah)];
  if (!s) throw new Error(`No verified recording of surah ${surah} for ${r.name}`);
  const audioUrl = `${data.folder}${String(surah).padStart(3, '0')}.mp3`;
  const size = await sizeOf(audioUrl);
  if (size !== null && size !== s.size) throw new Error(`The recording of surah ${surah} changed since it was checked`);
  const timings = new Map<string, VerseTiming>();
  for (let k = 1; k < s.c.length; k++) {
    const a = s.c[k - 1], b = s.c[k];
    if (a !== null && b !== null) timings.set(`${surah}:${k}`, { verse_key: `${surah}:${k}`, timestamp_from: a, timestamp_to: b });
  }
  return { audioUrl, timings };
}
