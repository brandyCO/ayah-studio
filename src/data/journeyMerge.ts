// Journeys only ever grow (owner report 2026-11-12). Loaded with the sync (cloud/syncDocs.ts), so none of it
// is in the first load.
import { journeyHooks as H, keptFrom, type DayRec, type Other, type State, type Totals } from './journey';
import { mergeOwnLog } from './readLog';

const isDay = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const union = <T,>(a: T[] = [], b: T[] = []) => [...new Set([...a, ...b])];
const maxNums = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};
type Log = Record<string, number[]>;
export type { Log, Other };

// --- journeys only ever grow (owner report 2026-11-12: a phone whose storage came back older or empty
// sent its emptier journey over the one on the server, and the streak, Light and goals showed 0) ---
// A device's days, claims and counts only ever go up, so two copies of the same device's journey are
// joined (flags and lists joined, counts the larger, a claim's Light the larger), never one put in place
// of the other. The one exception: ayat memorised (`m`) can be taken down by its device, so the device's
// own word is kept for a day both copies hold.
const DAY_FLAGS = ['o', 'f', 'g', 'ad', 'am'] as const;
const DAY_COUNTS = ['ay', 'l', 'r', 'ls', 'lm', 'sh'] as const;
function growDay(a: DayRec, b: DayRec, keepM: 'a' | 'b'): DayRec {
  const o: DayRec = { ...a };
  for (const f of DAY_FLAGS) if (b[f]) o[f] = 1;
  for (const f of DAY_COUNTS) if ((b[f] ?? 0) > (a[f] ?? 0)) o[f] = b[f];
  const m = keepM === 'a' ? a.m : b.m;
  if (m) o.m = m; else delete o.m;
  if (b.s) o.s = union(a.s, b.s);
  if (b.j) o.j = union(a.j, b.j);
  if (b.cl) o.cl = union(a.cl, b.cl);
  if (b.dm) o.dm = union(a.dm, b.dm).slice(0, 20);
  if (b.dk) o.dk = maxNums(a.dk ?? {}, b.dk);
  if (b.cu) o.cu = maxNums(a.cu ?? {}, b.cu);
  if (b.n) o.n = maxNums(a.n ?? {}, b.n);
  return o;
}
type Grown = Omit<State, 'settled' | 'lost'>;
/** `b` joined into `a` (a copy of `a` comes back). Days before `cutoff` are left out (dropped on purpose). */
function grow<T extends Grown>(a: T, b: Grown, keepM: 'a' | 'b', cutoff = ''): T {
  const o: T = { ...a, days: { ...a.days }, totals: { ...a.totals } };
  for (const [k, d] of Object.entries(b.days)) if (k >= cutoff) o.days[k] = o.days[k] ? growDay(o.days[k], d, keepM) : { ...d };
  for (const k of Object.keys(o.totals) as (keyof Totals)[]) {
    if (k === 'memorised') o.totals[k] = keepM === 'a' ? a.totals[k] || b.totals[k] : b.totals[k] || a.totals[k];
    else o.totals[k] = Math.max(a.totals[k], b.totals[k]);
  }
  o.frozen = union(a.frozen, b.frozen.filter((d) => d >= cutoff));
  o.revived = union(a.revived, b.revived.filter((d) => d >= cutoff));
  if (a.extra || b.extra) o.extra = union(a.extra ?? [], (b.extra ?? []).filter((d) => d >= cutoff));
  o.pageLast = maxNums(a.pageLast, b.pageLast);
  o.finished = maxNums(a.finished, b.finished);
  o.juzDone = maxNums(a.juzDone, b.juzDone);
  o.badges = { ...a.badges };
  for (const [id, d] of Object.entries(b.badges)) if (!o.badges[id] || d < o.badges[id]) o.badges[id] = d;
  o.claimed = { ...a.claimed, ...b.claimed };
  o.best = Math.max(a.best, b.best);
  if (a.past || b.past) o.past = maxNums(a.past ?? {}, b.past ?? {});
  return o;
}
/** True when `copy` holds something `remote` lacks (days from `from` on; with `top`, the fields beside the days). */
function holdsMore(copy: Grown, remote: Grown, from: string, to: string, top: boolean): boolean {
  for (const [k, d] of Object.entries(copy.days)) {
    if (k < from || k > to) continue;
    const r = remote.days[k];
    if (!r) return true;
    const g = growDay(r, d, 'a');
    delete g.m;
    const r2 = { ...r }; delete r2.m;
    if (JSON.stringify(sortDay(g)) !== JSON.stringify(sortDay(r2))) return true;
  }
  if (!top) return false;
  for (const k of Object.keys(copy.totals) as (keyof Totals)[]) if (k !== 'memorised' && copy.totals[k] > remote.totals[k]) return true;
  if (Object.keys(copy.badges).some((id) => !remote.badges[id]) || Object.keys(copy.claimed).some((id) => !remote.claimed[id])) return true;
  return copy.best > remote.best;
}
const sortDay = (d: DayRec) => Object.fromEntries(Object.entries(d).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) =>
  [k, Array.isArray(v) ? [...v].sort() : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1))) : v]));

/** Another device's journey arrived from the cloud. `changed`: it added anything here; `behind`: the
 *  copy kept here holds more than what arrived (that device's storage came back older or empty), so the
 *  cloud should be sent the joined copy (cloud/syncDocs.ts). */
export function mergeJourney(remote: unknown, device: string, part?: { from: string; to: string }): { changed: boolean; behind: boolean } {
  const o = H.clean(remote);
  if (!o || !device) return { changed: false, behind: false };
  const prev = H.others()[device];
  if (!prev) return { changed: H.putOther(device, o), behind: false };
  const head = (remote as { from?: unknown }).from;
  // What the row covers: one part (a month, or the page times), a head (its month on, and the totals,
  // badges and claims) or, from older app versions, the whole journey.
  const from = part ? part.from : isDay(head) ? head : '', to = part ? part.to : '9999';
  const merged = { ...grow(prev, o, 'b', keptFrom()), log: { ...prev.log } };
  for (const [k, p] of Object.entries(o.log)) merged.log[k] = merged.log[k] ? union(merged.log[k], p) : p;
  const behind = holdsMore(prev, o, from, to, !part)
    || Object.entries(prev.log).some(([k, p]) => k >= from && k <= to && p.some((x) => !o.log[k]?.includes(x)));
  return { changed: H.putOther(device, merged), behind };
}

/** This device's own journey as the cloud holds it: joined into the one here (the storage here came back
 *  older or empty; or another device sent back what it kept of it). True when anything was added. */
export function mergeOwnJourney(remote: unknown): boolean {
  const o = H.clean(remote);
  if (!o) return false;
  const s = H.own();
  const cut = keptFrom();
  const grown = grow(s, o, 'a', cut);
  const logged = mergeOwnLog(o.log);
  const bare = (x: State) => { const { settled: _s, lost: _l, ...rest } = x; return JSON.stringify(rest); };
  if (bare(grown) === bare(s)) return logged;
  Object.assign(s, grown);
  H.ownChanged();
  return true;
}

