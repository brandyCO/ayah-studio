// Word timing from QDC recitation segments, and timed text groups (pure: no DOM, runs in node too).
//
// Words are the space-separated tokens of our bundled text (the ayah-number glyph stays joined to
// the last word). QDC segments are [wordIndex, startMs, endMs] with wordIndex a 1-based Quran.com
// word position; public/data/word-map.json maps the few ayat where those positions differ from our
// spaces. The text itself is never changed: groups are ranges of whole words, and a group's text is
// those words joined with single spaces.

/** Our ayah text split into display words; `words.join(' ') === text`. */
export function displayWords(text: string): string[] {
  const words = text.split(' ').filter((w) => w.length > 0);
  // A token without letters (the ayah number after a regular space, as in 2:72) joins the word before.
  for (let i = words.length - 1; i > 0; i--) {
    if (/^[٠-٩]+$/.test(words[i])) words.splice(i - 1, 2, `${words[i - 1]} ${words[i]}`);
  }
  if (words.join(' ') !== text) throw new Error('Word split altered the ayah text');
  return words;
}

/** Parse a word-map entry ("0 1 2-3 4 4 …") into [firstWord, lastWord] per API word position. */
export function parseSpans(entry: string | undefined): [number, number][] | null {
  if (!entry) return null;
  return entry.split(' ').map((x) => {
    const [a, b] = x.split('-').map(Number);
    return [a, b ?? a];
  });
}

export interface VerseTiming {
  verse_key: string;
  timestamp_from: number; // ms
  timestamp_to: number; // ms
  segments?: unknown[];
}

/** Valid segments only: [index, start, end] with finite numbers, an index in range and end > start. */
export function validSegments(segments: unknown[] | undefined, apiWords = Infinity): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const s of segments ?? []) {
    if (!Array.isArray(s) || s.length < 3) continue; // e.g. [1] or [50, 6204868]
    const [i, a, b] = s as number[];
    if (!Number.isInteger(i) || i < 1 || i > apiWords || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    out.push([i, a, b]);
  }
  return out;
}

/** One recited word: [display word index, start, end] (seconds). */
export type Recited = [number, number, number];

export interface WordTiming {
  /** Per display word, seconds (file time). Non-decreasing: the first recitation in reading order. */
  start: number[];
  end: number[];
  /** Everything recited, in time order, repetitions included; missing words appear at their interpolated time. */
  seq: Recited[];
  /** End of the last recited word, repeats included (seconds). */
  last: number;
  stats: { valid: number; malformed: number; repeats: number; interpolated: number };
}

/**
 * Word timings for one ayah, or null when the segments give no usable timing (never guess sync).
 *
 * - Malformed segments are ignored; words without a valid segment are interpolated between their
 *   timed neighbours, so no word is ever dropped.
 * - Repetitions: `start` is each word's first recitation in reading order; `seq` keeps every
 *   recitation, so words the reciter goes back to are shown again.
 */
export function wordTimings(nWords: number, v: VerseTiming, spans: [number, number][] | null): WordTiming | null {
  const apiWords = spans ? spans.length : nWords;
  // Mislabelled segments are dropped like malformed ones (their words are interpolated instead):
  // - 1–3 segments jumping ahead over unrecited words and straight back ([34, 118, 36] in 2:282);
  // - 1–2 segments jumping back that the reading does not continue from ([44, 45, 22, 23, 48] in
  //   2:213). A real repetition goes back and carries on in order ([1…5, 1, 2, 3 …]).
  const all = validSegments(v.segments, apiWords);
  const segs: [number, number, number][] = [];
  let ahead = 0;
  for (let k = 0; k < all.length; k++) {
    const runEnd = (test: (i: number) => boolean, max: number) => {
      let m = k;
      while (m < all.length && m - k < max && test(all[m][0])) m++;
      return m;
    };
    if (all[k][0] > ahead + 2) {
      const m = runEnd((i) => i > ahead + 2, 3);
      if (m < all.length && all[m][0] <= ahead + 2) {
        k = m - 1;
        continue;
      }
    } else if (all[k][0] < ahead - 1) {
      const m = runEnd((i) => i < ahead - 1, 2);
      if (m < all.length && all[m][0] > all[m - 1][0] + 2) {
        k = m - 1;
        continue;
      }
    }
    segs.push(all[k]);
    ahead = Math.max(ahead, all[k][0]);
  }
  const from = v.timestamp_from / 1000, to = v.timestamp_to / 1000;
  if (nWords === 1 && !segs.length && to > from) {
    // One-word ayah (e.g. 2:1): the ayah's own timing is the word's timing.
    return { start: [from], end: [to], seq: [[0, from, to]], last: to, stats: { valid: 0, malformed: v.segments?.length ?? 0, repeats: 0, interpolated: 0 } };
  }
  if (!segs.length) return null;

  // Occurrences per display word. When API word i continues inside the display word where API word
  // i-1 ended (the API splits one of our words), the segment extends that occurrence.
  const span = (i: number): [number, number] => (spans ? spans[i - 1] : [i - 1, i - 1]);
  const occ: [number, number][][] = Array.from({ length: nWords }, () => []);
  const seq: Recited[] = [];
  let prevI = 0;
  let reached = -1, repeats = 0, last = 0;
  for (const [i, a, b] of segs) {
    const [f, l] = span(i);
    if (f < reached) repeats++;
    reached = Math.max(reached, l);
    last = Math.max(last, b / 1000);
    const joined = prevI === i - 1 && prevI >= 1 && span(prevI)[1] === f && occ[f].length > 0;
    for (let w = f; w <= l; w++) {
      if (w === f && joined) {
        occ[w][occ[w].length - 1][1] = b / 1000;
        for (let k = seq.length - 1; k >= 0; k--) if (seq[k][0] === w) { seq[k][2] = b / 1000; break; }
      } else {
        occ[w].push([a / 1000, b / 1000]);
        seq.push([w, a / 1000, b / 1000]);
      }
    }
    prevI = i;
  }

  // Forward pass: earliest occurrence starting at or after the previous word's start.
  const start: number[] = new Array(nWords).fill(NaN);
  const end: number[] = new Array(nWords).fill(NaN);
  let floor = -Infinity;
  for (let w = 0; w < nWords; w++) {
    const o = occ[w].find(([a]) => a >= floor);
    if (o) {
      start[w] = o[0];
      end[w] = o[1];
      floor = o[0];
    }
  }

  // Interpolate words without a valid segment between their neighbours.
  let interpolated = 0;
  for (let w = 0; w < nWords; w++) {
    if (!Number.isNaN(start[w])) continue;
    let k = w;
    while (k < nWords && Number.isNaN(start[k])) k++;
    const m = k - w;
    // Leading or trailing words borrow a short span inside the ayah's own boundaries.
    const lo = w > 0 ? end[w - 1] : Math.min(start[k], Math.max(from, start[k] - 0.4 * m));
    const hi = Math.max(lo, k < nWords ? start[k] : Math.max(last, Math.min(to, lo + 0.4 * m)));
    for (let j = 0; j < m; j++) {
      start[w + j] = lo + ((hi - lo) * j) / m;
      end[w + j] = lo + ((hi - lo) * (j + 1)) / m;
      seq.push([w + j, start[w + j], end[w + j]]);
    }
    interpolated += m;
    w = k - 1;
  }
  // Keep starts non-decreasing (out-of-order source data) so text never jumps backwards.
  for (let w = 1; w < nWords; w++) if (start[w] < start[w - 1]) start[w] = start[w - 1];
  for (let w = 0; w < nWords; w++) end[w] = Math.max(end[w], start[w]);
  last = Math.max(last, end[nWords - 1]);
  seq.sort((x, y) => x[1] - y[1]); // stable: equal starts keep reading order
  return {
    start,
    end,
    seq,
    last,
    stats: { valid: segs.length, malformed: (v.segments?.length ?? 0) - segs.length, repeats, interpolated },
  };
}

/** Earliest valid word start and latest valid word end of an ayah (seconds), or null. */
export function recitedSpan(v: VerseTiming): [number, number] | null {
  const segs = validSegments(v.segments);
  if (!segs.length) return v.timestamp_to > v.timestamp_from ? [v.timestamp_from / 1000, v.timestamp_to / 1000] : null;
  let a = Infinity, b = -Infinity;
  for (const [, s, e] of segs) {
    a = Math.min(a, s);
    b = Math.max(b, e);
  }
  return [a / 1000, b / 1000];
}

export const MIN_GROUP = 0.6; // seconds: shorter groups merge so text never flashes

export interface TextEvent {
  first: number; // word index (inclusive)
  last: number; // word index (inclusive)
  start: number;
  end: number;
}

/**
 * Text on screen over time. `units` split the words into groups (a line, half line, N words or a
 * page); each recited word shows its group, so when the reciter goes back the earlier group shows
 * again. An event lasts until the next one starts (the last until `end`). Events shorter than
 * MIN_GROUP merge with a neighbour whose words join them into one run, when `canMerge` allows it.
 */
export function timeEvents(
  units: [number, number][],
  seq: Recited[],
  end: number,
  canMerge: (first: number, last: number) => boolean = () => true,
  minDur = MIN_GROUP,
): TextEvent[] {
  const unitOf: number[] = [];
  let expect = 0;
  units.forEach(([f, l], u) => {
    if (f !== expect || l < f) throw new Error('Text groups must cover every word once, in order');
    for (let w = f; w <= l; w++) unitOf[w] = u;
    expect = l + 1;
  });

  const ev: TextEvent[] = [];
  for (const [w, start] of seq) {
    const [first, last] = units[unitOf[w]];
    const prev = ev[ev.length - 1];
    if (prev && prev.first === first && prev.last === last) continue;
    ev.push({ first, last, start, end: 0 });
  }
  ev.forEach((e, i) => (e.end = i + 1 < ev.length ? ev[i + 1].start : Math.max(end, e.start)));

  // Runs of words join only when they touch or overlap.
  const join = (a: TextEvent, b: TextEvent) =>
    a.first <= b.last + 1 && b.first <= a.last + 1 && canMerge(Math.min(a.first, b.first), Math.max(a.last, b.last));
  const merged = (a: TextEvent, b: TextEvent): TextEvent =>
    ({ first: Math.min(a.first, b.first), last: Math.max(a.last, b.last), start: a.start, end: b.end });
  for (let i = 0; i < ev.length; ) {
    const short = ev[i].end - ev[i].start < minDur;
    if (short && i + 1 < ev.length && join(ev[i], ev[i + 1])) ev.splice(i, 2, merged(ev[i], ev[i + 1]));
    else if (short && i > 0 && join(ev[i - 1], ev[i])) {
      ev.splice(i - 1, 2, merged(ev[i - 1], ev[i]));
      i--;
    } else i++;
  }
  // Neighbours that ended up showing the same words are one event.
  for (let i = ev.length - 1; i > 0; i--) {
    if (ev[i].first === ev[i - 1].first && ev[i].last === ev[i - 1].last) ev.splice(i - 1, 2, { ...ev[i - 1], end: ev[i].end });
  }
  // Rule 1: every word is shown at least once.
  const seen = new Array(expect).fill(false);
  for (const e of ev) for (let w = e.first; w <= e.last; w++) seen[w] = true;
  if (seen.some((x) => !x)) throw new Error('A word would never be shown');
  return ev;
}

/** English meaning per display word: Quran.com word meanings ("a|b|…" per API word) placed on the word holding each API word's first letter. */
export function wordMeanings(entry: string, spans: [number, number][] | null, nWords: number): string[] {
  const parts = entry.split('|');
  const out: string[][] = Array.from({ length: nWords }, () => []);
  parts.forEach((m, i) => out[spans ? spans[i][0] : i]?.push(m));
  if (parts.length !== (spans ? spans.length : nWords)) throw new Error('Word meanings do not match the ayah');
  return out.map((m) => m.join(' '));
}
