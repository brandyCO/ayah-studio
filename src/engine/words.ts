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

export interface WordTiming {
  /** Per display word, seconds (file time). Non-decreasing: the first recitation in reading order. */
  start: number[];
  end: number[];
  /** End of the last recited word, repeats included (seconds). */
  last: number;
  stats: { valid: number; malformed: number; repeats: number; interpolated: number };
}

/**
 * Word timings for one ayah, or null when the segments give no usable timing (never guess sync).
 *
 * - Malformed segments are ignored; words without a valid segment are interpolated between their
 *   timed neighbours, so no word is ever dropped.
 * - Repetitions: a word's time is its first recitation after the previous word's, so the display only
 *   moves forward. While the reciter goes back over earlier words, the current text stays on screen.
 */
export function wordTimings(nWords: number, v: VerseTiming, spans: [number, number][] | null): WordTiming | null {
  const apiWords = spans ? spans.length : nWords;
  const segs = validSegments(v.segments, apiWords);
  const from = v.timestamp_from / 1000, to = v.timestamp_to / 1000;
  if (nWords === 1 && !segs.length && to > from) {
    // One-word ayah (e.g. 2:1): the ayah's own timing is the word's timing.
    return { start: [from], end: [to], last: to, stats: { valid: 0, malformed: v.segments?.length ?? 0, repeats: 0, interpolated: 0 } };
  }
  if (!segs.length) return null;

  // Occurrences per display word. When API word i continues inside the display word where API word
  // i-1 ended (the API splits one of our words), the segment extends that occurrence.
  const span = (i: number): [number, number] => (spans ? spans[i - 1] : [i - 1, i - 1]);
  const occ: [number, number][][] = Array.from({ length: nWords }, () => []);
  let prevI = 0;
  let reached = -1, repeats = 0, last = 0;
  for (const [i, a, b] of segs) {
    const [f, l] = span(i);
    if (f < reached) repeats++;
    reached = Math.max(reached, l);
    last = Math.max(last, b / 1000);
    const joined = prevI === i - 1 && prevI >= 1 && span(prevI)[1] === f && occ[f].length > 0;
    for (let w = f; w <= l; w++) {
      if (w === f && joined) occ[w][occ[w].length - 1][1] = b / 1000;
      else occ[w].push([a / 1000, b / 1000]);
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
    }
    interpolated += m;
    w = k - 1;
  }
  // Keep starts non-decreasing (out-of-order source data) so text never jumps backwards.
  for (let w = 1; w < nWords; w++) if (start[w] < start[w - 1]) start[w] = start[w - 1];
  for (let w = 0; w < nWords; w++) end[w] = Math.max(end[w], start[w]);
  last = Math.max(last, end[nWords - 1]);
  return {
    start,
    end,
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

export interface Group {
  first: number; // word index (inclusive)
  last: number; // word index (inclusive)
  start: number;
  end: number;
}

/**
 * Time groups of consecutive words: a group appears when its first word starts and stays until the
 * next group starts (the last one until `end`). Groups shorter than MIN_GROUP merge with the next one
 * (the last with the one before) when `canMerge` allows the combined text.
 */
export function timeGroups(
  units: [number, number][],
  wordStart: number[],
  end: number,
  canMerge: (first: number, last: number) => boolean = () => true,
  minDur = MIN_GROUP,
): Group[] {
  let expect = 0;
  for (const [f, l] of units) {
    if (f !== expect || l < f) throw new Error('Text groups must cover every word once, in order');
    expect = l + 1;
  }
  if (expect !== wordStart.length) throw new Error('Text groups must cover every word once, in order');

  const g: Group[] = units.map(([first, last], i) => ({
    first,
    last,
    start: wordStart[first],
    end: i + 1 < units.length ? wordStart[units[i + 1][0]] : Math.max(end, wordStart[first]),
  }));
  for (let i = 0; i < g.length; ) {
    const short = g[i].end - g[i].start < minDur;
    if (short && i + 1 < g.length && canMerge(g[i].first, g[i + 1].last)) {
      g.splice(i, 2, { first: g[i].first, last: g[i + 1].last, start: g[i].start, end: g[i + 1].end });
    } else if (short && i + 1 === g.length && i > 0 && canMerge(g[i - 1].first, g[i].last)) {
      g.splice(i - 1, 2, { first: g[i - 1].first, last: g[i].last, start: g[i - 1].start, end: g[i].end });
      i--;
    } else i++;
  }
  return g;
}
