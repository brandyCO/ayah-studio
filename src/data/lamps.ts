// Revision lamps (docs/together.md T5a): pages the user has memorised, each with a Leitner box
// (intervals 1/2/4/8/16 days) and the day it was last revised. "Revised today" moves a page up a
// box, "needs work" returns it to box 1. Kept on this device (localStorage) and synced with the
// account as one document (`user_docs` kind `lamp`, id `pages`), merged per page: the newest change
// wins, removals travel as dated tombstones (kept 120 days). A change fires `lamps-changed`.
export const INTERVALS = [1, 2, 4, 8, 16]; // days per box (1–5)
const DAY = 86_400_000;
const KEY = 'lamps';
const TOMBSTONE_DAYS = 120;

export interface Lamp {
  box: number; // 1–5
  at: number; // last revised (ms)
  since: number; // memorised (ms)
  changed: number; // last change of this entry (ms), for merging
  off?: boolean; // removed (tombstone)
}
export type Lamps = Record<number, Lamp>; // by page (1–604)

const valid = (p: number, l: unknown): l is Lamp => {
  const x = l as Lamp;
  return Number.isInteger(p) && p >= 1 && p <= 604 && !!x && typeof x === 'object' && Number.isInteger(x.box) && x.box >= 1 && x.box <= 5
    && [x.at, x.since, x.changed].every((n) => typeof n === 'number' && Number.isFinite(n));
};

let cache: Lamps | null = null;
/** Every entry, removed ones included (for syncing). */
export function lampRecords(): Lamps {
  if (cache) return cache;
  const out: Lamps = {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (v && typeof v === 'object') for (const [k, l] of Object.entries(v)) if (valid(Number(k), l)) out[Number(k)] = l;
  } catch {
    /* ignore */
  }
  return (cache = out);
}
/** Memorised pages. */
export const lamps = (): Lamps => Object.fromEntries(Object.entries(lampRecords()).filter(([, l]) => !l.off));

function save(all: Lamps, notify = true) {
  const cutoff = Date.now() - TOMBSTONE_DAYS * DAY;
  for (const [k, l] of Object.entries(all)) if (l.off && l.changed < cutoff) delete all[Number(k)];
  cache = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  if (notify) window.dispatchEvent(new Event('lamps-changed'));
}

/** How bright a lamp is now: 1 just revised → 0.15 when long overdue; `due` once its interval passed. */
export function glow(l: Lamp, now = Date.now()) {
  const f = (now - l.at) / (INTERVALS[l.box - 1] * DAY);
  return { light: Math.max(0.15, 1 - 0.85 * Math.min(1, f / 2)), due: f >= 1, nextIn: Math.max(0, INTERVALS[l.box - 1] * DAY - (now - l.at)) };
}

/** Marks pages as memorised (pages already memorised keep their schedule). */
export function memorise(pages: number[]) {
  const all = { ...lampRecords() };
  const now = Date.now();
  for (const p of pages) if (!all[p] || all[p].off) all[p] = { box: 1, at: now, since: now, changed: now };
  save(all);
}
/** Revised today: up one box (or back to box 1 when it needed work). */
export function revise(page: number, ok: boolean) {
  const all = { ...lampRecords() };
  const l = all[page];
  const now = Date.now();
  all[page] = l && !l.off
    ? { ...l, box: ok ? Math.min(5, l.box + 1) : 1, at: now, changed: now }
    : { box: 1, at: now, since: now, changed: now };
  save(all);
}
export function forget(pages: number[]) {
  const all = { ...lampRecords() };
  const now = Date.now();
  for (const p of pages) if (all[p] && !all[p].off) all[p] = { ...all[p], off: true, changed: now };
  save(all);
}

/** Merges the synced document (another device's lamps) into this device's: newest change per page wins. */
export function mergeLamps(remote: unknown) {
  if (!remote || typeof remote !== 'object') return;
  const all = { ...lampRecords() };
  let changed = false;
  for (const [k, l] of Object.entries(remote as Record<string, unknown>)) {
    const p = Number(k);
    if (!valid(p, l)) continue;
    if (!all[p] || all[p].changed < l.changed) {
      all[p] = { box: l.box, at: l.at, since: l.since, changed: l.changed, ...(l.off ? { off: true } : {}) };
      changed = true;
    }
  }
  if (changed) save(all);
}
