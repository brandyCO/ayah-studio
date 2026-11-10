// How well each Madinah mushaf page is held from memory (Learn tab: page memory), this device only
// (localStorage `pageStrength`). A page tasmi' or a lesson covering the page moves it up a box when
// recited cleanly, keeps it with a few slips and drops it to box 1 when it was not there yet — the
// Leitner boxes of the revision lamps (1/2/4/8/16/30 days). Strength fades as a page goes unrevised.
const KEY = 'pageStrength';
const DAYS = [1, 2, 4, 8, 16, 30];
const DAY = 86_400_000;
interface Rec { b: number; at: number; n: number }
type Store = Record<string, Rec>;

function load(): Store {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v as Store : {}; } catch { return {}; }
}
function save(v: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event('pages-changed'));
}

/** A page was recited: 2 cleanly, 1 with a few slips, 0 not yet. */
export function recordPage(p: number, result: 0 | 1 | 2, now = Date.now()) {
  const v = load();
  const r = v[p] ?? { b: 0, at: now, n: 0 };
  r.b = result === 2 ? Math.min(DAYS.length, r.b + 1) : result === 1 ? Math.max(1, r.b) : 1;
  r.at = now;
  r.n++;
  v[p] = r;
  save(v);
}
export function recordPages(pages: number[], result: 0 | 1 | 2) {
  const now = Date.now();
  for (const p of new Set(pages)) recordPage(p, result, now);
}

export type Level = 'none' | 'weak' | 'fair' | 'strong';
/** 0..1: how firmly the page is held today (0 = never recited here). */
export function strength(p: number, now = Date.now()): number {
  const r = load()[p];
  if (!r) return 0;
  const days = DAYS[Math.max(0, r.b - 1)];
  const since = (now - r.at) / DAY;
  const base = r.b / DAYS.length;
  return Math.max(0.05, Math.min(1, base * (since <= days ? 1 : Math.max(0.2, 1 - (since - days) / (2 * days)))));
}
export function level(p: number, now = Date.now()): Level {
  if (!load()[p]) return 'none';
  const x = strength(p, now);
  return x >= 0.6 ? 'strong' : x >= 0.3 ? 'fair' : 'weak';
}
/** Due for a revision: past its box's interval. */
export function due(p: number, now = Date.now()): boolean {
  const r = load()[p];
  return !!r && (now - r.at) / DAY >= DAYS[Math.max(0, r.b - 1)];
}
export const pagesHeld = () => Object.keys(load()).map(Number);
