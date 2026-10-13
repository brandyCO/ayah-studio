// Series mode: a passage split into consecutive reels ("Part 2 of 6") of about the same length, never
// inside an ayah (rule 1), each at most MAX_AYAT ayat. Pure: no I/O.

/** Greedy parts: ayat from..until with their recited lengths (seconds; null = estimate by words). */
export function planSeries(from: number, lengths: number[], target: number, maxAyat: number): [number, number][] {
  const parts: [number, number][] = [];
  let a = 0;
  while (a < lengths.length) {
    let b = a, len = lengths[a];
    while (b + 1 < lengths.length && b + 1 - a + 1 <= maxAyat && len + lengths[b + 1] <= target) len += lengths[++b];
    parts.push([from + a, from + b]);
    a = b + 1;
  }
  return parts;
}

/** Seconds an ayah takes: its recited span (+ a breath) when timed, else ~0.55 s a word. */
export const ayahLength = (span: [number, number] | null, words: number) => (span ? span[1] - span[0] + 0.6 : words * 0.55 + 0.6);
