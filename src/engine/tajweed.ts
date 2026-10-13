// Tajweed colours (optional): which of the ayah's own letters each tajweed rule covers, from
// public/data/tajweed.json (scripts/fetch-tajweed.mjs). Only colours change; the text, its shapes and
// its place on screen never do (rules 1 and 7). Pure: no I/O.

/** Per word index: [start, end) character ranges inside that word, with the rule's colour. */
export type AyahTajweed = Record<number, [number, number, string][]>;

/** Rule code → colour (legible over the scrim) and the group it belongs to in the legend. */
export const TAJWEED: Record<string, { color: string; group: TajweedGroup }> = {
  h: { color: '#a7b0ba', group: 'silent' }, // hamzat al-wasl
  l: { color: '#a7b0ba', group: 'silent' }, // lam shamsiyyah
  s: { color: '#a7b0ba', group: 'silent' }, // silent letter
  n: { color: '#e9c46a', group: 'madd2' }, // natural madd (2)
  p: { color: '#ffa94d', group: 'madd246' }, // permissible madd (2, 4, 6)
  o: { color: '#ff7b7b', group: 'madd45' }, // obligatory madd (4, 5)
  x: { color: '#ff4f6d', group: 'madd6' }, // necessary madd (6)
  q: { color: '#6cb8ff', group: 'qalqalah' },
  u: { color: '#5fd68f', group: 'ghunnah' }, // ghunnah
  k: { color: '#5fd68f', group: 'ghunnah' }, // ikhfa
  f: { color: '#5fd68f', group: 'ghunnah' }, // ikhfa shafawi
  g: { color: '#5fd68f', group: 'ghunnah' }, // idgham with ghunnah
  a: { color: '#5fd68f', group: 'ghunnah' }, // idgham shafawi
  i: { color: '#62d9cf', group: 'iqlab' },
  w: { color: '#b8a8f0', group: 'idgham' }, // idgham without ghunnah
  j: { color: '#b8a8f0', group: 'idgham' }, // idgham mutajanisayn
  m: { color: '#b8a8f0', group: 'idgham' }, // idgham mutaqaribayn
};
export type TajweedGroup = 'silent' | 'madd2' | 'madd246' | 'madd45' | 'madd6' | 'qalqalah' | 'ghunnah' | 'iqlab' | 'idgham';
/** The legend, in the order a teacher would read it. */
export const TAJWEED_LEGEND: { group: TajweedGroup; color: string }[] = (['madd6', 'madd45', 'madd246', 'madd2', 'ghunnah', 'iqlab', 'qalqalah', 'idgham', 'silent'] as const)
  .map((group) => ({ group, color: Object.values(TAJWEED).find((r) => r.group === group)!.color }));

/** "w:start-endCODE,…" (one ayah of tajweed.json) → ranges per word. */
export function parseTajweed(entry: string | undefined): AyahTajweed | null {
  if (!entry) return null;
  const out: AyahTajweed = {};
  for (const x of entry.split(',')) {
    const m = /^(\d+):(\d+)-(\d+)([a-z])$/.exec(x);
    const r = m && TAJWEED[m[4]];
    if (!m || !r) continue;
    (out[+m[1]] ??= []).push([+m[2], +m[3], r.color]);
  }
  return out;
}

/** A word on a line with its coloured ranges: drawn again over its place, clipped to each range. */
export interface TajweedWord {
  before: string; // the words before it on the line, joined with spaces
  word: string;
  spans: [number, number, string][];
}

/** The coloured words of an event's lines (words first..last laid out `counts` per line). */
export function tajweedLines(words: string[], first: number, counts: number[] | undefined, tj: AyahTajweed | null | undefined): TajweedWord[][] | null {
  if (!tj || !counts) return null;
  let at = first;
  return counts.map((n) => {
    const line: TajweedWord[] = [];
    for (let k = 0; k < n; k++) {
      const spans = tj[at + k];
      if (spans?.length) line.push({ before: words.slice(at, at + k).join(' '), word: words[at + k], spans });
    }
    at += n;
    return line;
  });
}
