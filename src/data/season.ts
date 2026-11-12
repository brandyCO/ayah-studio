// The Ramadan season (owner request 2026-11-11): a countdown to the first night of Ramadan, what the season
// unlocks, the Khatm tracker's numbers and the season's badges. Dates follow the Umm al-Qura calendar (Intl) with
// the user's ±1 day moon-sighting shift from Ramadan mode (data/ramadan.ts), whose records the tracker reads. No
// drawing here, so Me can show its small card without the season screen.
import { PAGES, ramadanData, ramadanNow, ramadanSettings, type RamadanData, type RamadanNow } from './ramadan';
import { allDays } from './journey';
import { dayKey, readLogAll } from './readLog';

const DAY = 86_400_000;

function hijriOf(d: Date): { year: number; month: number; day: number } | null {
  try {
    const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
    const n = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? '', 10);
    const v = { year: n('year'), month: n('month'), day: n('day') };
    return Object.values(v).every(Number.isInteger) ? v : null;
  } catch { return null; }
}

export interface SeasonState {
  /** 'soon' before Ramadan, 'open' during it, 'eid' on 1–3 Shawwal. */
  phase: 'soon' | 'open' | 'eid';
  now: RamadanNow;
  /** When the coming Ramadan begins: local midnight starting 1 Ramadan (Umm al-Qura + the user's shift). The
   *  sunset before it (the first taraweeh) is not guessed, so the countdown runs to 1 Ramadan 00:00 local. */
  start: Date | null;
  /** Hijri year of the coming (or current) Ramadan. */
  year: number;
}

let cache: { day: string; start: Date | null; year: number } | null = null;
/** Local midnight that begins 1 Ramadan next (with the user's shift), and its hijri year. */
export function nextRamadan(now = new Date()): { start: Date | null; year: number } {
  const key = `${now.toDateString()}|${ramadanSettings().shift}`;
  if (cache?.day === key) return cache;
  const shift = ramadanSettings().shift;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let found: { start: Date | null; year: number } = { start: null, year: 0 };
  for (let i = 1; i <= 360; i++) {
    const noon = new Date(base.getTime() + i * DAY);
    const h = hijriOf(new Date(noon.getTime() - shift * DAY));
    if (!h) break;
    if (h.month === 9 && h.day === 1) {
      found = { start: new Date(noon.getFullYear(), noon.getMonth(), noon.getDate()), year: h.year };
      break;
    }
  }
  cache = { day: key, ...found };
  return found;
}

export function seasonState(at = new Date()): SeasonState {
  const now = ramadanNow(at);
  if (now.day) return { phase: 'open', now, start: null, year: now.year };
  if (now.eid) return { phase: 'eid', now, start: null, year: now.year };
  const n = nextRamadan(at);
  return { phase: 'soon', now, start: n.start, year: n.year };
}

/** Days, hours, minutes and seconds until `start`. */
export function countdown(start: Date, at = Date.now()): { d: number; h: number; m: number; s: number; ms: number } {
  const ms = Math.max(0, start.getTime() - at);
  const t = Math.floor(ms / 1000);
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60, ms };
}
/** Whole days left (the day before = 1). */
export function daysLeft(start: Date, at = new Date()): number {
  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.round((start.getTime() - today.getTime()) / DAY);
}

// --- the Khatm tracker ---
/** First page of each juz in the Madinah mushaf (604 pages): juz 1 = 1–21, then 20 pages each, juz 30 = 582–604. */
export const juzStart = (j: number) => (j === 1 ? 1 : 20 * j - 18);
export const juzEnd = (j: number) => (j === 30 ? PAGES : juzStart(j + 1) - 1);
/** How much of each juz (0–1) is read in the current Khatm. */
export function juzFill(read: readonly number[]): number[] {
  const set = new Set(read);
  return Array.from({ length: 30 }, (_, i) => {
    const j = i + 1, a = juzStart(j), b = juzEnd(j);
    let n = 0;
    for (let p = a; p <= b; p++) if (set.has(p)) n++;
    return n / (b - a + 1);
  });
}

// --- the season's badges (shown on the season screen; earned only in Ramadan) ---
export type SeasonBadgeId = 'first' | 'ten' | 'khatm' | 'nights';
export interface SeasonBadge { id: SeasonBadgeId; have: number; need: number; earned: boolean }
export function seasonBadges(d: RamadanData = ramadanData()): SeasonBadge[] {
  const days = d.days.length;
  const nights = d.days.filter((x) => x >= 21).length;
  const pages = d.khatms * PAGES + d.read.length;
  const b = (id: SeasonBadgeId, have: number, need: number): SeasonBadge => ({ id, have: Math.min(have, need), need, earned: have >= need });
  return [b('first', Math.max(days, pages ? 1 : 0), 1), b('ten', days, 10), b('khatm', d.khatms, 1), b('nights', nights, 5)];
}

// --- the last ten nights (owner request 2026-11-12) ---
// Each of Ramadan's last ten days and nights has its own quest, checked from what the app already counts (pages after
// their reading time, recitation listened to, tasbih dhikr, the evening adhkar said in full). Night N = Ramadan day N
// (the local day, with the user's shift). The odd nights are marked and ask a little more. A kept night opens a chest
// (claim `qn:{year}:{n}`, the journey's claims, so it syncs and counts once); keeping 5 gives the Night of Qadr piece.
// Ranks XP on these days is raised by the server (rank_xp_mult: ×1.5, odd ×2), nothing is sent from here.
export type QuestTask = 'pages' | 'listen' | 'dhikr' | 'evening';
export interface QuestPart { k: QuestTask; need: number }
const q = (...p: [QuestTask, number][]): QuestPart[] => p.map(([k, need]) => ({ k, need }));
export const NIGHT_QUESTS: Record<number, QuestPart[]> = {
  21: q(['pages', 10], ['dhikr', 100]),
  22: q(['listen', 15]),
  23: q(['pages', 10], ['evening', 1]),
  24: q(['dhikr', 100]),
  25: q(['listen', 20], ['dhikr', 100]),
  26: q(['pages', 5]),
  27: q(['pages', 10], ['listen', 15], ['dhikr', 100]),
  28: q(['evening', 1]),
  29: q(['pages', 10], ['evening', 1]),
  30: q(['pages', 5]),
};
/** Light in a kept night's chest: 20, odd nights 40, the 27th 60. */
export const nightLight = (n: number) => (n === 27 ? 60 : n % 2 ? 40 : 20);
/** Nights to keep for the Night of Qadr piece. */
export const QADR_NIGHTS = 5;
export const nightClaimId = (year: number, n: number) => `qn:${year}:${n}`;

export interface NightState {
  n: number;
  odd: boolean;
  /** 'past' (gone), 'now' (tonight), 'soon' (to come). */
  when: 'past' | 'now' | 'soon';
  parts: (QuestPart & { have: number })[];
  done: boolean;
  claimed: boolean;
  light: number;
}

function haveOn(k: string, task: QuestTask): number {
  const d = allDays()[k];
  if (task === 'pages') return readLogAll()[k]?.length ?? 0;
  if (task === 'listen') return Math.floor((d?.l ?? 0) / 60);
  if (task === 'dhikr') return Object.values(d?.dk ?? {}).reduce((a, b) => a + b, 0);
  return d?.am ? 1 : 0;
}

/** The ten nights of this Ramadan (or the one just ended, on Eid), with each quest's progress. */
export function lastTen(at = new Date()): { year: number; tonight: number | null; length: number; nights: NightState[]; kept: number } {
  const now = ramadanNow(at);
  const year = now.year;
  // Which local day was Ramadan day N: today first, then back two weeks (in the preview every day is the preview's).
  const dayOf: Record<number, string> = {};
  for (let i = 0; i <= 14; i++) {
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() - i, 12);
    const r = ramadanNow(d);
    if (r.day && r.day >= 21 && r.year === year && !dayOf[r.day]) dayOf[r.day] = dayKey(d);
  }
  const claims = new Set<string>();
  for (const k of Object.values(dayOf)) for (const c of allDays()[k]?.cl ?? []) claims.add(c);
  const today = dayKey(at);
  for (const c of allDays()[today]?.cl ?? []) claims.add(c);
  const tonight = now.day && now.day >= 21 ? now.day : null;
  const length = now.day ? now.length : 30;
  const nights: NightState[] = [];
  for (let n = 21; n <= 30; n++) {
    const k = dayOf[n];
    const parts = NIGHT_QUESTS[n].map((p) => ({ ...p, have: k ? Math.min(p.need, haveOn(k, p.k)) : 0 }));
    const claimed = claims.has(nightClaimId(year, n));
    const when = tonight === n ? 'now' : (tonight && n < tonight) || now.eid ? 'past' : 'soon';
    nights.push({ n, odd: n % 2 === 1, when, parts, done: claimed || (!!k && parts.every((p) => p.have >= p.need)), claimed, light: nightLight(n) });
  }
  return { year, tonight, length, nights, kept: nights.filter((x) => x.done).length };
}
/** Last-ten nights kept this Ramadan (for the Night of Qadr piece). */
export const nightsKept = (at = new Date()) => lastTen(at).kept;

// --- the first-day teaser (owner: "send that to all new users … in the first day … after syncing their account") ---
const SEEN = 'seasonTeaser';
export const teaserSeen = () => { try { return !!localStorage.getItem(SEEN); } catch { return true; } };
export const setTeaserSeen = () => { try { localStorage.setItem(SEEN, String(Date.now())); } catch { /* ignore */ } };
