// Ranks count by the Islamic day (owner decision 2026-11-12: "Friday is the last day and the end is not midnight but
// Maghrib … each at their time zone"). From Maghrib the next day has begun, so the ranked week runs Saturday → Friday
// and ends at the player's own Friday Maghrib (supabase/migrations/20261112300000_maghrib_week.sql).
//
// The journey and the reading log keep local calendar days, so an Islamic day K is put together from them: what was
// done on local day K-1 after its Maghrib, plus local day K up to its Maghrib. What a day held at its Maghrib is kept
// (`rankSnap`): taken by a timer at Maghrib while the app is open, else when it opens again (nothing is counted while
// it is closed). Maghrib comes from the prayer settings (Me → Prayer times); without a location, 18:00 local.
import { addDays, allDays } from './journey';
import { dayKey, readLogAll } from './readLog';

const FALLBACK_H = 18;
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
type Times = { sig: string; at: Record<string, number> };
let times: Times | null = null;
const load = (): Times => {
  if (times) return times;
  try { times = JSON.parse(localStorage.getItem('maghribAt') ?? 'null') as Times | null; } catch { /* ignore */ }
  return (times ??= { sig: '', at: {} });
};
const save = () => { try { localStorage.setItem('maghribAt', JSON.stringify(times)); } catch { /* ignore */ } };

/** Maghrib on a local day (from the prayer times worked out ahead, else 18:00). */
export function maghribOf(day: string): Date {
  const v = load().at[day];
  if (v) return new Date(v);
  const d = parse(day);
  d.setHours(FALLBACK_H, 0, 0, 0);
  return d;
}

/** Works out Maghrib for the days around today from the prayer settings (kept until they change). */
export async function refreshMaghrib(now = new Date()) {
  try {
    const { prayerDay, prayerSettings } = await import('./prayer');
    const s = prayerSettings();
    const t = load();
    const sig = s.lat == null ? '' : `${s.lat},${s.lng},${s.method}`;
    if (t.sig !== sig) { t.sig = sig; t.at = {}; }
    if (!sig) { save(); return; }
    const today = dayKey(now);
    for (let i = -2; i <= 8; i++) {
      const k = addDays(today, i);
      if (t.at[k]) continue;
      const p = await prayerDay(parse(k));
      if (p) t.at[k] = p[4].getTime();
    }
    for (const k of Object.keys(t.at)) if (k < addDays(today, -4)) delete t.at[k];
    save();
  } catch { /* the times stay as they were */ }
}

/** The Islamic day it is now: after today's Maghrib, tomorrow. */
export function rankDay(now = new Date()): string {
  const k = dayKey(now);
  return now >= maghribOf(k) ? addDays(k, 1) : k;
}
/** The Friday (a local date) whose Maghrib ends the ranked week holding Islamic day `k`. */
export const weekFriday = (k = rankDay()) => addDays(k, (5 - parse(k).getDay() + 7) % 7);
/** When this ranked week ends: this week's Friday Maghrib, on this phone's clock. */
export const weekEndAt = (now = new Date()) => maghribOf(weekFriday(rankDay(now)));
/** Minutes east of UTC (leagues and rivals are made of people on clocks within 2 hours). */
export const utcOff = (now = new Date()) => -now.getTimezoneOffset();
/** Islamic Friday: from Thursday's Maghrib to Friday's. */
export const isRankFriday = (now = new Date()) => parse(rankDay(now)).getDay() === 5;

// --- what a local day held at its Maghrib ---
export type Tot = Record<string, number>;
let snaps: Record<string, Tot> | null = null;
const loadSnaps = () => {
  if (snaps) return snaps;
  try { snaps = JSON.parse(localStorage.getItem('rankSnap') ?? '{}') as Record<string, Tot>; } catch { snaps = {}; }
  return snaps!;
};
function keep(day: string, t: Tot) {
  const s = loadSnaps();
  if (s[day]) return s[day];
  s[day] = t;
  for (const k of Object.keys(s)) if (k < addDays(day, -9)) delete s[k]; // a whole week back (weekly goals)
  try { localStorage.setItem('rankSnap', JSON.stringify(s)); } catch { /* ignore */ }
  return t;
}
/** Islamic day `k` from local days: local k-1 after its Maghrib + local k up to its Maghrib (or so far). */
export function islamicTotals(k: string, local: (day: string) => Tot, now = new Date()): Tot {
  const prev = addDays(k, -1);
  const a = local(prev), b = local(k);
  const sp = loadSnaps()[prev] ?? keep(prev, a);
  const sk = now >= maghribOf(k) ? (loadSnaps()[k] ?? keep(k, b)) : b;
  const out: Tot = {};
  for (const f of Object.keys(b)) out[f] = Math.max(0, (a[f] ?? 0) - (sp[f] ?? 0)) + (sk[f] ?? 0);
  return out;
}

/** What a local day holds, for Ranks and the weekly goals (all devices combined). */
export function dayTotals(k: string) {
  const d = allDays()[k];
  // Adhkar sessions said in full (morning, evening, the du'a moments) and dhikr counted: kept for friend challenges and
  // duels, never in the league score; the server limits how fast they may grow.
  const adhkar = (d?.ad ? 1 : 0) + (d?.am ? 1 : 0) + (d?.dm?.length ?? 0);
  const dhikr = Object.values(d?.dk ?? {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  return {
    pages: readLogAll()[k]?.length ?? 0, listen: Math.floor(d?.l ?? 0), surahs: d?.s?.length ?? 0, reels: d?.r ?? 0,
    lessons: d?.ls ?? 0, flawless: d?.lf ?? 0, adhkar, dhikr, nights: d?.dm?.includes('sleep') ? 1 : 0,
  };
}
export type DayTotals = ReturnType<typeof dayTotals>;

/** One week everywhere (owner decision 2026-11-13, F9): the week's totals by Islamic days, from its Saturday (begun at
 *  Friday's Maghrib) to now; it ends at this week's Friday Maghrib, like Ranks. */
export function weekTotals(now = new Date()): { week: string; end: Date; tot: DayTotals } {
  const k = rankDay(now), week = rankWeek(k);
  const tot = Object.fromEntries(Object.keys(dayTotals(k)).map((f) => [f, 0])) as DayTotals;
  for (let d = week; d <= k; d = addDays(d, 1)) {
    const v = islamicTotals(d, dayTotals, now) as DayTotals;
    for (const f of Object.keys(tot) as (keyof DayTotals)[]) tot[f] += v[f] ?? 0;
  }
  return { week, end: weekEndAt(now), tot };
}

let timer = 0;
/** Takes the Maghrib snapshot on time while the app is open, and any that are due when it opens again. */
export function watchMaghrib(local: (day: string) => Tot) {
  const due = () => {
    const now = new Date(), today = dayKey(now);
    for (const k of [addDays(today, -1), today]) if (now >= maghribOf(k) && !loadSnaps()[k]) keep(k, local(k));
    clearTimeout(timer);
    const next = maghribOf(today) > now ? maghribOf(today) : maghribOf(addDays(today, 1));
    timer = window.setTimeout(due, Math.min(2 ** 31 - 1, Math.max(1000, next.getTime() - now.getTime() + 500)));
  };
  void refreshMaghrib().then(due);
  due();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) due(); });
}

/** The ranked week holding Islamic day `k` (its first day, a Saturday; the bridge week of 9 November began on Monday). */
export function rankWeek(k = rankDay()): string {
  if (k >= '2026-11-09' && k <= '2026-11-13') return '2026-11-09';
  if (k < '2026-11-09') { const d = parse(k).getDay(); return addDays(k, -((d + 6) % 7)); }
  return addDays(k, -((parse(k).getDay() + 1) % 7));
}
