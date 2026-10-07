// Reel plan: which slice of the reciter's full-surah recording the reel plays, and when each ayah and
// word falls in reel time (pure: runs in node too). The same plan gives the length estimate shown
// while selecting, so the estimate equals the editor's length.
import { displayWords, parseSpans, recitedSpan, wordTimings, type Recited, type VerseTiming, type WordTiming } from './words';

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
  /** Reel seconds: end of its last recited word. */
  last: number;
  /** Reel-time first start of each display word, or null without word timings (Ayah mode only). */
  wordStart: number[] | null;
  /** Reel-time recitation of words in time order, repetitions included (null without word timings). */
  seq: Recited[] | null;
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
  /** Arranged (arrangeReel): seconds of intro card at the start and closing card at the end. */
  intro?: number;
  outro?: number;
  /** Arranged: where each stretch of the base reel's audio goes. */
  pieces?: AudioPiece[];
}

/** Base reel seconds from..to are played at reel second `at`. */
export interface AudioPiece {
  from: number;
  to: number;
  at: number;
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
 * Holds each ayah's text a little after its last word (or, with `hold`, until just before the next
 * ayah), clearing it before the next ayah starts. Text ends by `end` (the video's end or the closing
 * card). A last word whose timing runs past the next ayah's first word (seen in the data) is cut at that word.
 */
function holdEnds(ayat: PlannedAyah[], end: number, hold = false, holds: (number | null | undefined)[] = []) {
  ayat.forEach((a, i) => {
    const next = i + 1 < ayat.length ? ayat[i + 1].start : end;
    const limit = i + 1 < ayat.length ? next - CLEAR : end - 0.2;
    const own = holds[i];
    const want = own != null ? a.last + own : hold ? limit : a.last + HOLD;
    a.end = Math.min(next, Math.max(a.last, Math.min(want, limit)));
  });
}

/** Silence kept on each side when a pause between ayat is shortened. */
export const MIN_SILENCE = 0.15;

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
  const ayat = texts.map((text, i): PlannedAyah => {
    const key = `${surah}:${from + i}`;
    const v = timings.get(key)!;
    const n = displayWords(text).length;
    const wt = wordTimings(n, v, parseSpans(wordMap[key]));
    if (!wt) {
      const [a, b] = recitedSpan(v)!;
      const last = reel(Math.min(b, clip[1]));
      return { ayah: from + i, start: reel(Math.max(a, clip[0])), end: 0, last, wordStart: null, seq: null, stats: null };
    }
    const wordStart = wt.start.map((s) => Math.max(LEAD_IN, reel(s)));
    const last = reel(Math.min(wt.last, clip[1]));
    const seq = wt.seq.map(([w, a, b]): Recited => [w, Math.max(LEAD_IN, reel(a)), reel(b)]);
    return { ayah: from + i, start: Math.min(wordStart[0], seq[0][1]), end: 0, last, wordStart, seq, stats: wt.stats };
  });
  holdEnds(ayat, duration);
  return { source: 'qdc', duration, ayat, wordTimed: ayat.every((a) => a.wordStart), clip };
}

/** Plan for per-ayah clips (everyayah): no word timings, so Ayah mode only. */
export function planClipReel(from: number, durations: number[]): ReelPlan {
  let t = LEAD_IN;
  const offsets: number[] = [];
  const ayat = durations.map((d, i): PlannedAyah => {
    offsets.push(t);
    const a = { ayah: from + i, start: t, end: 0, last: t + d, wordStart: null, seq: null, stats: null };
    t += d + GAP;
    return a;
  });
  const duration = t - GAP + TAIL;
  holdEnds(ayat, duration);
  return { source: 'everyayah', duration, ayat, wordTimed: false, offsets };
}

export interface Pacing {
  pause: number; // seconds of silence added between ayat
  hold: boolean; // keep an ayah's text on screen until just before the next ayah
  intro: number; // seconds of intro card before the recitation
  outro: number; // seconds of closing card after it
  /** Per ayah: seconds added before it (negative shortens the reciter's own pause, never cutting a word). */
  gaps?: number[];
  /** Per ayah: seconds its text stays after its last word (null: the default hold). */
  holds?: (number | null)[];
}

/** Extra seconds the pacing adds to a reel of n ayat (for the length estimate). */
export const pacingExtra = (o: Pacing, n: number) => o.intro + Math.max(0, n - 1) * o.pause + o.outro;

/** Seconds the pause before ayah i (i ≥ 1) can shrink: its silence minus MIN_SILENCE each side. */
export const shrinkable = (A: { start: number; last: number }[], i: number) => Math.max(0, A[i].start - A[i - 1].last - 2 * MIN_SILENCE);

/**
 * The reel with its pacing: `pause` (+ the ayah's own `gaps` entry) seconds of silence are added
 * before each ayah — or, when negative, taken out of the reciter's own pause — cut in the middle of
 * that pause, never inside a word. The intro card goes before and the closing card after. Every time
 * in the plan moves with its ayah; `pieces` say where the base audio goes.
 */
export function arrangeReel(base: ReelPlan, o: Pacing): ReelPlan {
  const n = base.ayat.length;
  const A = base.ayat;
  // b[i]: cut between ayah i-1 and i (middle of the pause); r[i]: silence removed there; d[i]: shift of ayah i.
  const b = A.map((_, i) => (i === 0 ? 0 : Math.min(A[i].start, Math.max(A[i - 1].last, (A[i - 1].last + A[i].start) / 2))));
  const applied = A.map((_, i) => (i === 0 ? 0 : Math.max(o.pause + (o.gaps?.[i] ?? 0), -shrinkable(A, i))));
  const r = applied.map((x) => Math.max(0, -x));
  const d: number[] = [];
  applied.forEach((x, i) => d.push((i ? d[i - 1] : o.intro) + x));
  const pieces = A.map((_, i) => {
    const from = i === 0 ? 0 : b[i] + r[i] / 2;
    const to = i === n - 1 ? base.duration : b[i + 1] - r[i + 1] / 2;
    return { from, to, at: from + d[i] };
  });
  const duration = base.duration + d[n - 1] + o.outro;
  const ayat = A.map((a, i): PlannedAyah => {
    const d0 = d[i];
    const sh = (x: number) => x + d0;
    return {
      ...a, start: sh(a.start), end: 0, last: sh(a.last),
      wordStart: a.wordStart?.map(sh) ?? null,
      seq: a.seq?.map(([w, s, e]): Recited => [w, sh(s), sh(e)]) ?? null,
    };
  });
  holdEnds(ayat, duration - o.outro, o.hold, o.holds);
  return { ...base, duration, ayat, intro: o.intro, outro: o.outro, pieces };
}
