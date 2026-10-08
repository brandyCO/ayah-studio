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
  /** Where the reciter's voice really starts in the base reel's audio (seconds; `voiceOnset`), or null
   *  when it could not be told from the audio. Unset until measured. */
  onset?: number | null;
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

/** Silence always kept next to a word when audio is trimmed: between ayat, and at the reel's ends. */
export const MIN_SILENCE = 0.15;
export const MIN_EDGE = 0.05;
/** Kept before the reciter's voice at the very start of the reel (owner decision 2026-10-08). */
export const MIN_LEAD = 0.1;

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
  /** Per ayah: seconds of silence added before it (≥ 0; the first ayah's entry is ignored). */
  gaps?: number[];
  /** Per ayah: seconds of silence trimmed from the start and end of its audio (clamped so no word is cut). */
  trims?: [number, number][];
  /** Per ayah: seconds its text stays after its last word (null: the default hold). */
  holds?: (number | null)[];
}

/** Extra seconds the pacing adds to a reel of n ayat (for the length estimate). */
export const pacingExtra = (o: Pacing, n: number) => o.intro + Math.max(0, n - 1) * o.pause + o.outro;

/**
 * Each ayah's audio before trimming (base reel seconds): the recording is cut in the middle of the
 * pause between ayat, the first ayah starts with the lead-in and the last ends with the tail.
 */
export function audioSpans(base: ReelPlan): [number, number][] {
  const A = base.ayat, n = A.length;
  const cut = A.map((_, i) => (i === 0 ? 0 : Math.min(A[i].start, Math.max(A[i - 1].last, (A[i - 1].last + A[i].start) / 2))));
  return A.map((_, i) => [cut[i], i + 1 < n ? cut[i + 1] : base.duration]);
}

/** Where the recitation starts sounding: the voice found in the audio, else the first word's timing. */
export const voiceStart = (base: ReelPlan) => base.onset ?? base.ayat[0].start;

/** The most that can be trimmed from the start and end of ayah i's audio: silence only, never a word.
 *  At the very start: up to MIN_LEAD before the voice heard in the audio (the timings can be off by
 *  a few tenths of a second either way). */
export function trimLimits(base: ReelPlan, i: number): [number, number] {
  const A = base.ayat, n = A.length;
  const [a, b] = audioSpans(base)[i];
  return [
    Math.max(0, i === 0 ? voiceStart(base) - a - MIN_LEAD : A[i].start - a - MIN_SILENCE),
    Math.max(0, b - A[i].last - (i === n - 1 ? MIN_EDGE : MIN_SILENCE)),
  ];
}

/**
 * The reel as edited: each ayah's audio keeps its words and loses only the silence trimmed from its
 * start and end; the ayat follow each other with `pause` (+ the ayah's own gap) seconds of silence
 * added before each; the intro card goes before and the closing card after. Every time in the plan
 * moves with its ayah; `pieces` say where the base audio goes.
 */
export function arrangeReel(base: ReelPlan, o: Pacing): ReelPlan {
  const n = base.ayat.length;
  const A = base.ayat;
  const spans = audioSpans(base);
  const pieces: AudioPiece[] = [];
  spans.forEach(([a, b], i) => {
    const [maxHead, maxTail] = trimLimits(base, i);
    const head = Math.min(Math.max(0, o.trims?.[i]?.[0] ?? 0), maxHead);
    const tail = Math.min(Math.max(0, o.trims?.[i]?.[1] ?? 0), maxTail);
    const prev = pieces[i - 1];
    const at = i === 0 ? o.intro : prev.at + (prev.to - prev.from) + Math.max(0, o.pause + (o.gaps?.[i] ?? 0));
    pieces.push({ from: a + head, to: b - tail, at });
  });
  const lastP = pieces[n - 1];
  const duration = lastP.at + (lastP.to - lastP.from) + o.outro;
  const ayat = A.map((a, i): PlannedAyah => {
    const d0 = pieces[i].at - pieces[i].from;
    // Never before the ayah's own audio (the first ayah may be trimmed past an early word timing).
    const sh = (x: number) => Math.max(pieces[i].at, x + d0);
    return {
      ...a, start: sh(a.start), end: 0, last: sh(a.last),
      wordStart: a.wordStart?.map(sh) ?? null,
      seq: a.seq?.map(([w, s, e]): Recited => [w, sh(s), sh(e)]) ?? null,
    };
  });
  holdEnds(ayat, duration - o.outro, o.hold, o.holds);
  return { ...base, duration, ayat, intro: o.intro, outro: o.outro, pieces };
}

/**
 * Where the voice starts near `timed` (the first word's timing), from the audio itself: 10 ms
 * loudness windows compared with the loudest moment of the next 3 s. If the audio is already
 * sounding at `timed`, walk back to the last 60 ms of quiet; if it is quiet, walk forward (≤ 0.8 s)
 * to the first 30 ms of sound. Null when nothing clear is found.
 */
export function voiceOnset(data: Float32Array, rate: number, timed: number): number | null {
  const win = Math.max(1, Math.round(rate * 0.01));
  const n = Math.floor(data.length / win);
  if (n < 10) return null;
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = i * win; k < (i + 1) * win; k++) sum += data[k] * data[k];
    rms[i] = Math.sqrt(sum / win);
  }
  const ti = Math.min(n - 1, Math.max(0, Math.round(timed / 0.01)));
  let peak = 0;
  for (let i = ti; i < Math.min(n, ti + 300); i++) peak = Math.max(peak, rms[i]);
  if (peak < 1e-4) return null;
  const loud = (i: number) => rms[i] > peak * 0.06; // about −24 dB under the loudest moment
  if (loud(ti)) {
    let first = ti, quiet = 0;
    for (let i = ti - 1; i >= Math.max(0, ti - 150); i--) {
      if (loud(i)) { first = i; quiet = 0; } else if (++quiet >= 6) return first * 0.01;
    }
    return first <= 1 ? 0 : null; // sound right from the start, or no clear gap
  }
  for (let i = ti; i < Math.min(n - 2, ti + 80); i++) if (loud(i) && loud(i + 1) && loud(i + 2)) return i * 0.01;
  return null;
}
