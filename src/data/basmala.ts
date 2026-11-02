// The Bismillah before a surah, for recordings that start straight at ayah 1. Every surah but At-Tawbah opens
// with it; everyayah's ayah files leave it out (it is their 001001.mp3) and some full-surah recordings were
// published without it. public/data/basmala.json (scripts/audit-basmala.py: what each recording's first
// seconds were heard to say) names, per recording, the surahs that lack it and where the same reciter says
// it in his own voice: everyayah's 001001.mp3, or a span of one of his surah files. Only his own recitation is
// played (rule 3), and only in Listen; reels start at the ayah chosen.
import { mp3quranSurah } from './mp3quran';
import { qdcSurah } from './qdc';
import { everyayahUrl, wordsKey, type Reciter } from './reciters';

interface Entry {
  /** Surahs ("2-8,10") whose recording has no Bismillah of its own; "all" for per-ayah files. */
  missing: string;
  /** The reciter's own Bismillah: everyayah's file, or ms from..to of his recording of `surah`. */
  src: 'everyayah' | { surah: number; from: number; to: number };
}

let data: Promise<Record<string, Entry>> | null = null;
const load = () => {
  if (!data) {
    data = fetch('./data/basmala.json').then((r) => (r.ok ? r.json() : {}), () => ({}));
    data.then((d) => { if (!Object.keys(d).length) data = null; });
  }
  return data;
};

const keyOf = (r: Reciter) => (r.mp3quran ? wordsKey(r) : r.qdc === false ? String(r.id) : `qdc${r.id}`);

function listed(ranges: string, s: number): boolean {
  if (ranges === 'all') return true;
  return ranges.split(',').some((p) => {
    const [a, b = a] = p.split('-').map(Number);
    return s >= a && s <= b;
  });
}

export interface Basmala { url: string; from: number; to: number | null } // seconds; to null = the whole file

/** The Bismillah to play before this surah's recording, or null when the recording has its own (or none is due). */
export async function basmalaBefore(r: Reciter, s: number): Promise<Basmala | null> {
  if (s === 1 || s === 9) return null;
  const e = (await load())[keyOf(r)];
  if (!e || !listed(e.missing, s)) return null;
  if (e.src === 'everyayah') return r.everyayah ? { url: everyayahUrl(r, 1, 1), from: 0, to: null } : null;
  const { surah, from, to } = e.src;
  const q = r.mp3quran ? await mp3quranSurah(r, surah) : await qdcSurah(r.id, surah);
  return { url: q.audioUrl, from: from / 1000, to: to / 1000 };
}
