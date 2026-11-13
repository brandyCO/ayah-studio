// Practice (Learn): about three minutes on what slips most — the surah holding the most weak words
// (exercises on them, `#/learn/{s}/practice`), else the page that most needs a revision (`#/learn/page/P`).
// Nothing here blocks or costs a lamp: practising is always free.
import { weakCounts, weakWords } from './weakWords';
import { tree } from './garden';
import { due, pagesHeld, strength } from './pageMemory';

export type PracticeTarget = { kind: 'words'; s: number; n: number; href: string } | { kind: 'page'; p: number; href: string };

/** The best thing to practise now, or null when nothing needs it. */
export function practiceTarget(skip?: number): PracticeTarget | null {
  let best = 0, bs = 0;
  for (const [s, n] of weakCounts()) {
    if (s === skip) continue;
    const t = tree(s);
    if (!t || (t.learned <= 0 && !t.full)) continue;
    if (n > best) { best = n; bs = s; }
  }
  if (bs) return { kind: 'words', s: bs, n: best, href: `#/learn/${bs}/practice` };
  const now = Date.now();
  const pages = pagesHeld().filter((p) => due(p, now)).sort((a, b) => strength(a, now) - strength(b, now));
  if (pages.length) return { kind: 'page', p: pages[0], href: `#/learn/page/${pages[0]}` };
  return null;
}

/** The ayat to practise in surah s: a window of ≤ 4 ayat around its weak words, inside what was learned. */
export function practiceRange(s: number, ayahs: number): [number, number] {
  const t = tree(s);
  const top = t?.full ? ayahs : Math.max(1, Math.min(ayahs, t?.learned ?? ayahs));
  const ws = weakWords(s, 1, top).map(([a]) => a);
  if (!ws.length) return [1, Math.min(top, 4)];
  const counts = new Map<number, number>();
  for (const a of ws) counts.set(a, (counts.get(a) ?? 0) + 1);
  // the 4-ayah window holding the most weak words
  let bestA = ws[0], bestN = -1;
  for (const a of new Set(ws)) {
    let n = 0;
    for (let x = a; x < a + 4; x++) n += counts.get(x) ?? 0;
    if (n > bestN) { bestN = n; bestA = a; }
  }
  return [bestA, Math.min(top, bestA + 3)];
}
