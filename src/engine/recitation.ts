// Reel plan: which slice of the reciter's full-surah recording the reel plays, and when each ayah and
// word falls in reel time (pure: runs in node too). The same plan gives the length estimate shown
// while selecting, so the estimate equals the editor's length.
import { displayWords, parseSpans, recitedSpan, wordTimings, type VerseTiming, type WordTiming } from './words';

export const LEAD_IN = 0.4; // silence before the recitation starts
export const TAIL = 0.8; // after the recitation ends
const PRE_ROLL = 0.25; // audio kept before the first word
const POST_ROLL = 0.6; // audio kept after the last word (if the next ayah doesn't start sooner)
const HOLD = 0.6; // text stays after its ayah's last word…
const CLEAR = 0.15; // …but is gone this long before the next ayah starts
export const GAP = 0.25; // between per-ayah clips (everyayah fallback)

export interface PlannedAyah {
  ayah: number;
  /** Reel seconds: the ayah's text shows from start (its first word) until end (after a short hold). */
  start: number;
  end: number;
  /** Reel-time start of each display word, or null without word timings (Ayah mode only). */
  wordStart: number[] | null;
  stats: WordTiming['stats'] | null;
}

export interface ReelPlan {
  source: 'qdc' | 'everyayah';
  duration: number;
  ayat: PlannedAyah[];
  /** Every ayah has word timings, so all text modes are offered. */
  wordTimed: boolean;
  /** qdc: the slice of the surah recording (file seconds) placed at LEAD_IN. */
  clip?: [number, number];
  /** everyayah: reel offset of each ayah's clip. */
  offsets?: number[];
}

/** Slice of the surah recording covering ayat from..to, never reaching into the neighbouring ayat. */
export function clipBounds(timings: Map<string, VerseTiming>, surah: number, from: number, to: number): [number, number] | null {
  const first = timings.get(`${surah}:${from}`), last = timings.get(`${surah}:${to}`);
  const a = first && recitedSpan(first), b = last && recitedSpan(last);
  if (!a || !b) return null;
  for (let k = from; k <= to; k++) if (!timings.has(`${surah}:${k}`)) return null;
  const prev = timings.get(`${surah}:${from - 1}`), next = timings.get(`${surah}:${to + 1}`);
  const prevEnd = (prev && recitedSpan(prev)?.[1]) ?? 0;
  const nextStart = (next && recitedSpan(next)?.[0]) ?? Infinity;
  const start = Math.min(a[0], Math.max(0, prevEnd, a[0] - PRE_ROLL));
  const end = Math.max(b[1], Math.min(nextStart - 0.05, b[1] + POST_ROLL));
  return [start, end];
}

export const reelDuration = (clip: [number, number]) => LEAD_IN + (clip[1] - clip[0]) + TAIL;

/**
 * Holds each ayah's text a little after its last word, clearing it before the next ayah starts. A last
 * word whose timing runs past the next ayah's first word (seen in the data) is cut at that word.
 */
function holdEnds(ayat: PlannedAyah[], lastWord: number[], duration: number) {
  ayat.forEach((a, i) => {
    const next = i + 1 < ayat.length ? ayat[i + 1].start : duration;
    const limit = i + 1 < ayat.length ? next - CLEAR : duration - 0.2;
    a.end = Math.min(next, Math.max(lastWord[i], Math.min(lastWord[i] + HOLD, limit)));
  });
}

/**
 * Plan from QDC timings. `texts` are our ayah texts for from..to; `wordMap` is word-map.json's map.
 * Returns null when QDC has no usable timing for some ayah (the caller falls back to everyayah).
 */
export function planQdcReel(
  timings: Map<string, VerseTiming>,
  surah: number,
  from: number,
  texts: string[],
  wordMap: Record<string, string>,
): ReelPlan | null {
  const to = from + texts.length - 1;
  const clip = clipBounds(timings, surah, from, to);
  if (!clip) return null;
  const reel = (fileSec: number) => LEAD_IN + fileSec - clip[0];
  const duration = reelDuration(clip);
  const lastWord: number[] = [];
  const ayat = texts.map((text, i): PlannedAyah => {
    const key = `${surah}:${from + i}`;
    const v = timings.get(key)!;
    const n = displayWords(text).length;
    const wt = wordTimings(n, v, parseSpans(wordMap[key]));
    if (!wt) {
      const [a, b] = recitedSpan(v)!;
      lastWord.push(reel(Math.min(b, clip[1])));
      return { ayah: from + i, start: reel(Math.max(a, clip[0])), end: 0, wordStart: null, stats: null };
    }
    const wordStart = wt.start.map((s) => Math.max(LEAD_IN, reel(s)));
    lastWord.push(reel(Math.min(wt.last, clip[1])));
    return { ayah: from + i, start: wordStart[0], end: 0, wordStart, stats: wt.stats };
  });
  holdEnds(ayat, lastWord, duration);
  return { source: 'qdc', duration, ayat, wordTimed: ayat.every((a) => a.wordStart), clip };
}

/** Plan for per-ayah clips (everyayah): no word timings, so Ayah mode only. */
export function planClipReel(from: number, durations: number[]): ReelPlan {
  let t = LEAD_IN;
  const offsets: number[] = [];
  const lastWord: number[] = [];
  const ayat = durations.map((d, i): PlannedAyah => {
    offsets.push(t);
    lastWord.push(t + d);
    const a = { ayah: from + i, start: t, end: 0, wordStart: null, stats: null };
    t += d + GAP;
    return a;
  });
  const duration = t - GAP + TAIL;
  holdEnds(ayat, lastWord, duration);
  return { source: 'everyayah', duration, ayat, wordTimed: false, offsets };
}
