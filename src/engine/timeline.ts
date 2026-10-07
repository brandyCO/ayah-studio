// Timeline derived from the recitation: each ayah's text is on screen exactly while its audio plays.
// Long ayat are split into pages whose durations are proportional to their word counts.
import type { SurahMeta } from '../data/quran';
import { reference } from '../data/quran';
import type { Reciter } from '../data/reciters';
import { paginate, type Page } from './layout';

export const LEAD_IN = 0.4;
export const GAP = 0.25;
export const TAIL = 0.8;

export interface TimedPage extends Page {
  start: number;
  end: number;
}

export interface TimedAyah {
  ayah: number;
  ref: string; // e.g. "Al-Baqara · 2:255"
  start: number;
  end: number;
  pages: TimedPage[];
}

export interface Timeline {
  duration: number;
  surah: SurahMeta;
  reciter: Reciter;
  ayat: TimedAyah[];
}

export function buildTimeline(
  surah: SurahMeta,
  reciter: Reciter,
  firstAyah: number,
  arabic: string[],
  english: string[],
  durations: number[],
  showTranslation: boolean,
): Timeline {
  const ctx = document.createElement('canvas').getContext('2d')!;
  let t = LEAD_IN;
  const ayat = arabic.map((text, i) => {
    const start = t;
    const end = start + durations[i];
    t = end + GAP;
    const pages = paginate(ctx, text, showTranslation ? english[i] : null, showTranslation);
    const total = pages.reduce((s, p) => s + p.words, 0);
    let ps = start;
    const timed = pages.map((p) => {
      const pe = ps + ((end - start) * p.words) / total;
      const tp = { ...p, start: ps, end: pe };
      ps = pe;
      return tp;
    });
    timed[timed.length - 1].end = end;
    const ayah = firstAyah + i;
    return { ayah, ref: reference(surah, ayah), start, end, pages: timed };
  });
  return { duration: t - GAP + TAIL, surah, reciter, ayat };
}

/** Offsets (seconds) at which each ayah's audio starts. */
export const audioOffsets = (tl: Timeline) => tl.ayat.map((a) => a.start);
