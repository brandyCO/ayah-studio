// Journeys: a reading plan with a clear end — Khatm in 30 days, Khatm in 6 months, Juz 'Amma in 30 days.
// One at a time (localStorage `journeyPlan`, a synced preference: it follows the account). Progress = the plan's pages counted as read
// (the honest page count of the Me tab) since the plan started; today's portion = what is left over the
// days left, so a missed day simply spreads out. Al-Kahf on Fridays is a separate gentle reminder.
import { dayKey } from './readLog';
import { pageReadSince } from './journey';
import type { Mushaf } from './mushaf';
import { seedPrefTime, touchPref } from '../ui/prefs';

export type JourneyId = 'khatm30' | 'khatm180' | 'amma30';
export const JOURNEYS: { id: JourneyId; days: number }[] = [
  { id: 'khatm30', days: 30 },
  { id: 'amma30', days: 30 },
  { id: 'khatm180', days: 180 },
];
interface Plan { id: JourneyId; start: string; startMs: number; done?: string }
const KEY = 'journeyPlan';

export function currentPlan(): Plan | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Plan | null;
    return v && JOURNEYS.some((j) => j.id === v.id) && typeof v.startMs === 'number' ? v : null;
  } catch { return null; }
}
export function startJourney(id: JourneyId | null) {
  try {
    if (!id) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ id, start: dayKey(), startMs: Date.now() } satisfies Plan));
  } catch { /* ignore */ }
  touchPref('journeyPlan');
  window.dispatchEvent(new Event('journey-changed'));
}
// A plan started before plans were synced: its start is when it was chosen.
seedPrefTime('journeyPlan', currentPlan()?.startMs ?? 0);

/** The plan's pages, in reading order. */
export function planPages(m: Mushaf, id: JourneyId): number[] {
  if (id === 'amma30') return m.pages.map((p, i) => (p.juz === 30 ? i + 1 : 0)).filter(Boolean);
  return Array.from({ length: m.pages.length }, (_, i) => i + 1);
}

export interface JourneyState {
  id: JourneyId;
  total: number;
  read: number;
  day: number; // day of the plan, from 1
  days: number;
  today: number; // pages for today (0 when done)
  next: number | null; // the first unread page
  done: boolean;
}
const parse = (k: string) => { const [y, mo, d] = k.split('-').map(Number); return new Date(y, mo - 1, d); };

export function journeyState(m: Mushaf, now = new Date()): JourneyState | null {
  const p = currentPlan();
  if (!p) return null;
  const def = JOURNEYS.find((j) => j.id === p.id)!;
  const pages = planPages(m, p.id);
  const unread = pages.filter((pg) => !pageReadSince(pg, p.startMs));
  const day = Math.max(1, Math.round((parse(dayKey(now)).getTime() - parse(p.start).getTime()) / 86_400_000) + 1);
  const daysLeft = Math.max(1, def.days - day + 1);
  // Pages read today count towards today's portion (so it goes down as you read).
  const todayStart = parse(dayKey(now)).getTime();
  const readToday = pages.filter((pg) => pageReadSince(pg, Math.max(p.startMs, todayStart))).length;
  const portion = Math.ceil((unread.length + readToday) / daysLeft);
  return {
    id: p.id, total: pages.length, read: pages.length - unread.length, day, days: def.days,
    today: unread.length ? Math.max(0, portion - readToday) : 0, next: unread[0] ?? null, done: !unread.length,
  };
}

/** Al-Kahf (18) on Fridays: its first page, or null on other days / once read this Friday. */
export function kahfToday(m: Mushaf, now = new Date()): number | null {
  if (now.getDay() !== 5) return null;
  const first = m.pageOf(18, 1);
  const last = m.pageOf(19, 1) - 1;
  const since = parse(dayKey(now)).getTime();
  for (let p = first; p <= last; p++) if (!pageReadSince(p, since)) return p;
  return null;
}
