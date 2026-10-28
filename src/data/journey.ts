// Your journey (Me tab): the daily streak, the weekly streak, the free weekly streak freeze and the
// stats (pages, ayat, minutes listened, surahs finished, reels made). This device only
// (localStorage `journey`); pages per day come from the reading log (readLog.ts).
//
// Honest counting: a page counts only after it has been open on screen for the reading time the
// user picked (default 1½ min, timer paused while the app is hidden); swiping past does not count.
// A surah is finished when every one of its pages has been read (counted) since its last finish,
// all within 60 days. Minutes listened = recitation actually played in the player.
//
// Streak: a day is lit when the app is opened. A missed day is covered by the week's free freeze
// (one per calendar week, Monday first, used by itself). When the missed days cannot all be
// covered, the flame goes out; `lost` keeps what was lost for a friend to relight it (later).
import { dayKey, readLog } from './readLog';
import type { Mushaf } from './mushaf';

const KEY = 'journey';
const KEEP_DAYS = 400;
const DAY = 86_400_000;
const FINISH_WINDOW = 60 * DAY;

interface DayRec {
  /** Opened the app. */
  o?: 1;
  /** Ayat read (ayat starting on the pages counted). */
  ay?: number;
  /** Seconds of recitation listened to. */
  l?: number;
  /** Reels exported. */
  r?: number;
  /** Surahs finished. */
  s?: number[];
  /** Juz finished. */
  j?: number[];
  /** Dhikr counted, by id (tasbih counter). */
  dk?: Record<string, number>;
  /** Ayat memorised (marked by the user). */
  m?: number;
  /** Morning adhkar done (marked by the user). */
  ad?: 1;
  /** Every daily goal was met. */
  g?: 1;
}
export interface Totals { pages: number; ayat: number; listen: number; surahs: number; reels: number; dhikr: number; juz: number; memorised: number }
interface State {
  days: Record<string, DayRec>;
  frozen: string[];
  revived: string[];
  totals: Totals;
  /** Page → when it was last counted (ms). */
  pageLast: Record<number, number>;
  /** Surah → when it was last finished (ms). */
  finished: Record<number, number>;
  /** Juz → when it was last finished (ms). */
  juzDone: Record<number, number>;
  /** Badge id → the day it was earned. */
  badges: Record<string, string>;
  /** The flame that went out: its length and the days missed. */
  lost?: { n: number; days: string[]; at: string };
  best: number;
}

const empty = (): State => ({
  days: {}, frozen: [], revived: [], pageLast: {}, finished: {}, juzDone: {}, badges: {}, best: 0,
  totals: { pages: 0, ayat: 0, listen: 0, surahs: 0, reels: 0, dhikr: 0, juz: 0, memorised: 0 },
});

let cache: State | null = null;
function load(): State {
  if (cache) return cache;
  const s = empty();
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object') {
      const isDay = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
      if (v.days && typeof v.days === 'object') for (const [k, d] of Object.entries(v.days)) if (isDay(k) && d && typeof d === 'object') s.days[k] = d as DayRec;
      if (Array.isArray(v.frozen)) s.frozen = v.frozen.filter(isDay);
      if (Array.isArray(v.revived)) s.revived = v.revived.filter(isDay);
      if (v.totals && typeof v.totals === 'object') for (const k of Object.keys(s.totals) as (keyof Totals)[]) {
        const n = Number(v.totals[k]);
        if (Number.isFinite(n) && n >= 0) s.totals[k] = n;
      }
      if (v.pageLast && typeof v.pageLast === 'object') s.pageLast = v.pageLast;
      if (v.finished && typeof v.finished === 'object') s.finished = v.finished;
      if (v.juzDone && typeof v.juzDone === 'object') s.juzDone = v.juzDone;
      if (v.badges && typeof v.badges === 'object') s.badges = v.badges;
      if (v.lost && Array.isArray(v.lost.days)) s.lost = v.lost;
      if (Number.isFinite(v.best)) s.best = v.best;
    }
  } catch {
    /* ignore */
  }
  return (cache = s);
}
function save() {
  const s = load();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('journey-changed'));
}
const today = (now = new Date()) => load().days[dayKey(now)] ??= {};
/** Today's record (read only). */
export const todayRec = (now = new Date()): Readonly<DayRec> => load().days[dayKey(now)] ?? {};
export const totals = (): Readonly<Totals> => load().totals;
/** Distinct pages ever counted on this device. */
export const pagesEver = () => Object.keys(load().pageLast).length;
export const earnedBadges = (): Readonly<Record<string, string>> => load().badges;
/** Records newly earned badges; returns their ids. */
export function earnBadges(ids: string[], now = new Date()): string[] {
  const s = load();
  const fresh = ids.filter((id) => !s.badges[id]);
  if (!fresh.length) return [];
  for (const id of fresh) s.badges[id] = dayKey(now);
  save();
  return fresh;
}
/** All days (read only), for summaries. */
export const allDays = (): Readonly<Record<string, Readonly<DayRec>>> => load().days;

// --- days and weeks ---
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k: string, n: number) => { const d = parse(k); d.setDate(d.getDate() + n); return dayKey(d); };
/** The Monday of the week holding day `k`. */
export const weekOf = (k: string) => { const d = parse(k); return addDays(k, -((d.getDay() + 6) % 7)); };

function covered(s = load()): Set<string> {
  const out = new Set(s.frozen.concat(s.revived));
  for (const [k, d] of Object.entries(s.days)) if (d.o) out.add(k);
  return out;
}

/** Marks today as opened; first settles any missed days (the weekly freeze, or the flame goes out). */
export function recordOpen(now = new Date()) {
  const s = load();
  const k = dayKey(now);
  if (s.days[k]?.o) return;
  const cov = covered(s);
  let last = '';
  for (const d of cov) if (d < k && d > last) last = d;
  if (last) {
    const gap: string[] = [];
    for (let d = addDays(last, 1); d < k && gap.length < 400; d = addDays(d, 1)) gap.push(d);
    if (gap.length) {
      const frozenWeeks = new Set(s.frozen.map(weekOf));
      const ok = gap.every((d) => {
        const w = weekOf(d);
        if (frozenWeeks.has(w)) return false;
        frozenWeeks.add(w);
        return true;
      });
      if (ok) s.frozen.push(...gap);
      else {
        const n = streakOn(last, cov);
        if (n >= 2) s.lost = { n, days: gap, at: k };
      }
    }
  }
  today(now).o = 1;
  const cutoff = addDays(k, -KEEP_DAYS);
  for (const d of Object.keys(s.days)) if (d < cutoff) delete s.days[d];
  s.frozen = s.frozen.filter((d) => d >= cutoff);
  s.revived = s.revived.filter((d) => d >= cutoff);
  if (s.lost && s.lost.at < addDays(k, -2)) delete s.lost; // a friend can relight it for 2 days
  s.best = Math.max(s.best, streakOn(k, covered(s)));
  save();
}

/** Consecutive covered days ending on day `k` (0 when `k` is not covered). */
function streakOn(k: string, cov: Set<string>): number {
  let n = 0;
  for (let d = k; cov.has(d) && n < 5000; d = addDays(d, -1)) n++;
  return n;
}

export interface Streak {
  /** Days in a row, today included when lit (else up to yesterday). */
  days: number;
  litToday: boolean;
  /** Weeks in a row with at least WEEK_DAYS lit days (this week counts once it has them). */
  weeks: number;
  best: number;
  /** This week's freeze: still free, or the day it covered. */
  freeze: { free: boolean; day?: string };
  /** Monday → Sunday of this week: lit, frozen, revived, today (not yet), or missed / to come. */
  week: { day: string; state: 'lit' | 'frozen' | 'revived' | 'today' | 'missed' | 'future' }[];
  lost?: { n: number; days: string[] };
}
export const WEEK_DAYS = 3;

export function streak(now = new Date()): Streak {
  const s = load();
  const k = dayKey(now);
  const cov = covered(s);
  const litToday = cov.has(k);
  const days = streakOn(litToday ? k : addDays(k, -1), cov);
  const wk = weekOf(k);
  const litIn = (w: string) => { let n = 0; for (let i = 0; i < 7; i++) if (cov.has(addDays(w, i))) n++; return n; };
  let weeks = litIn(wk) >= WEEK_DAYS ? 1 : 0;
  for (let w = addDays(wk, -7); litIn(w) >= WEEK_DAYS && weeks < 1000; w = addDays(w, -7)) weeks++;
  const frozenHere = s.frozen.find((d) => weekOf(d) === wk);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(wk, i);
    const state = s.frozen.includes(day) ? 'frozen' as const
      : s.revived.includes(day) ? 'revived' as const
        : cov.has(day) ? 'lit' as const
          : day === k ? 'today' as const : day < k ? 'missed' as const : 'future' as const;
    return { day, state };
  });
  return {
    days, litToday, weeks, best: Math.max(s.best, days),
    freeze: { free: !frozenHere, day: frozenHere }, week,
    lost: s.lost && days < s.lost.n ? { n: s.lost.n, days: s.lost.days } : undefined,
  };
}

// --- counting ---
const surahPagesCache = new WeakMap<Mushaf, { pages: Map<number, number[]>; onPage: Map<number, number[]>; juz: Map<number, number[]> }>();
function surahPages(m: Mushaf) {
  let c = surahPagesCache.get(m);
  if (c) return c;
  const pages = new Map<number, number[]>(); // surah → its pages
  const onPage = new Map<number, number[]>(); // page → ayat starting on it (count) · surahs on it
  const juz = new Map<number, number[]>(); // juz → its pages
  const ayat = new Map<number, number>();
  m.pages.forEach((pg, i) => {
    const p = i + 1;
    juz.set(pg.juz, [...(juz.get(pg.juz) ?? []), p]);
    const here = new Set<number>();
    for (const line of pg.lines) {
      if (line[0] === 'h' || line[0] === 'b') continue;
      for (const seg of line as [number, number, string][]) {
        here.add(seg[0]);
        if (m.segStart.get(seg) === 1) ayat.set(p, (ayat.get(p) ?? 0) + 1);
      }
    }
    for (const su of here) pages.set(su, [...(pages.get(su) ?? []), p]);
    onPage.set(p, [ayat.get(p) ?? 0, ...here]);
  });
  c = { pages, onPage, juz };
  surahPagesCache.set(m, c);
  return c;
}

/** A page was read (open for the reading time). Call after logging it in the reading log. */
export function countPage(m: Mushaf, page: number, now = new Date()) {
  const s = load();
  const { pages, onPage, juz } = surahPages(m);
  const [ay, ...surahs] = onPage.get(page) ?? [0];
  const t = now.getTime();
  const d = today(now);
  d.ay = (d.ay ?? 0) + ay;
  s.totals.pages++;
  s.totals.ayat += ay;
  s.pageLast[page] = t;
  for (const su of surahs) {
    const since = Math.max(s.finished[su] ?? 0, t - FINISH_WINDOW);
    if ((pages.get(su) ?? []).every((p) => (s.pageLast[p] ?? 0) > since)) {
      s.finished[su] = t;
      d.s = [...(d.s ?? []), su];
      s.totals.surahs++;
    }
  }
  const jz = m.pages[page - 1]?.juz;
  if (jz) {
    const since = Math.max(s.juzDone[jz] ?? 0, t - FINISH_WINDOW);
    if ((juz.get(jz) ?? []).every((p) => (s.pageLast[p] ?? 0) > since)) {
      s.juzDone[jz] = t;
      d.j = [...(d.j ?? []), jz];
      s.totals.juz++;
    }
  }
  save();
}

/** Dhikr counted on the tasbih counter (`n` more of `id`). */
export function addDhikr(id: string, n = 1, now = new Date()) {
  const d = today(now);
  d.dk = { ...(d.dk ?? {}), [id]: Math.max(0, (d.dk?.[id] ?? 0) + n) };
  load().totals.dhikr = Math.max(0, load().totals.dhikr + n);
  save();
}

/** Ayat memorised today (marked by the user; `n` may be negative to correct). */
export function addMemorised(n: number, now = new Date()) {
  const d = today(now);
  const next = Math.max(0, (d.m ?? 0) + n);
  load().totals.memorised = Math.max(0, load().totals.memorised + next - (d.m ?? 0));
  d.m = next;
  save();
}

/** The morning adhkar done today (or not). */
export function setAdhkar(done: boolean, now = new Date()) {
  const d = today(now);
  if (done) d.ad = 1; else delete d.ad;
  save();
}

/** Marks today as a day every goal was met (set once, never taken back). */
export function markGoalsMet(now = new Date()) {
  const d = today(now);
  if (d.g) return;
  d.g = 1;
  save();
}

/** Seconds of recitation listened to. */
export function addListen(sec: number, now = new Date()) {
  if (!(sec > 0)) return;
  const d = today(now);
  d.l = Math.round(((d.l ?? 0) + sec) * 10) / 10;
  load().totals.listen = Math.round((load().totals.listen + sec) * 10) / 10;
  save();
}

/** A reel was exported. */
export function reelMade(now = new Date()) {
  const d = today(now);
  d.r = (d.r ?? 0) + 1;
  load().totals.reels++;
  save();
}

export type Period = 'week' | 'month' | 'all';
export interface Stats extends Totals { surahList: number[]; goalDays: number; litDays: number }

/** Stats for this week (from Monday), this month, or all time on this device. */
export function stats(period: Period, now = new Date()): Stats {
  const s = load();
  const k = dayKey(now);
  if (period === 'all') {
    const surahList = [...new Set(Object.values(s.days).flatMap((d) => d.s ?? []))];
    const vals = Object.values(s.days);
    return { ...s.totals, surahList, goalDays: vals.filter((d) => d.g).length, litDays: vals.filter((d) => d.o).length };
  }
  const from = period === 'week' ? weekOf(k) : `${k.slice(0, 8)}01`;
  const out: Stats = { pages: 0, ayat: 0, listen: 0, surahs: 0, reels: 0, dhikr: 0, juz: 0, memorised: 0, surahList: [], goalDays: 0, litDays: 0 };
  for (const [d, pages] of Object.entries(readLog())) if (d >= from && d <= k) out.pages += pages.length;
  for (const [d, r] of Object.entries(s.days)) {
    if (d < from || d > k) continue;
    out.ayat += r.ay ?? 0;
    out.listen += r.l ?? 0;
    out.reels += r.r ?? 0;
    out.juz += r.j?.length ?? 0;
    out.memorised += r.m ?? 0;
    for (const n of Object.values(r.dk ?? {})) out.dhikr += n;
    if (r.g) out.goalDays++;
    if (r.o) out.litDays++;
    for (const su of r.s ?? []) { out.surahs++; if (!out.surahList.includes(su)) out.surahList.push(su); }
  }
  return out;
}

// --- the reading time a page needs to count ---
export const PAGE_TIMES = [60, 90, 120, 180, 240] as const;
export function pageSeconds(): number {
  try {
    const v = Number(localStorage.getItem('pageSeconds'));
    return (PAGE_TIMES as readonly number[]).includes(v) ? v : 90;
  } catch {
    return 90;
  }
}
export function setPageSeconds(sec: number) {
  try {
    localStorage.setItem('pageSeconds', String(sec));
  } catch {
    /* ignore */
  }
}

/** A friend relit the flame: the missed days count as covered again. */
export function revive(days: string[]) {
  const s = load();
  for (const d of days) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !s.revived.includes(d)) s.revived.push(d);
  delete s.lost;
  s.best = Math.max(s.best, streakOn(dayKey(), covered(s)));
  save();
}

/** For tests: forget the cached state. */
export const _reset = () => { cache = null; };
