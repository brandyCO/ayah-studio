// Daily goals (Me tab): pages read, ayat memorised, reels made, dhikr on the tasbih counter, the
// morning adhkar and up to 5 goals of the user's own (a name they write, done once or a number of
// times, every day or on chosen weekdays). The user starts from a pace (Gentle / Steady / Devoted)
// and can change anything (localStorage `goals`, this device). Once a week `goalTip()` may suggest
// one step up (a goal met on ≥ 5 of the last 7 days) or down (met on ≤ 1 while the app was used on
// ≥ 3); goals never change by themselves. Progress comes from the journey (journey.ts) and the reading log; when every goal that
// is on has been met, the day is marked (it counts toward goal badges and the weekly summary).
import { ADHKAR_TOTAL, eveningOpen, finishedCount, type AdhkarPeriod } from './adhkar';
import { addDays, allDays, markGoalsMet, todayRec } from './journey';
import { rankDay, rankWeek, weekEndAt, weekTotals } from './rankDay';
import { dayKey, readLogAll } from './readLog';

/** The dhikr on the tasbih counter. Short fixed phrases only; never altered. */
export const DHIKR = [
  { id: 'subhan', ar: 'سُبْحَانَ اللَّهِ', key: 'dk.subhan' },
  { id: 'hamd', ar: 'الْحَمْدُ لِلَّهِ', key: 'dk.hamd' },
  { id: 'takbir', ar: 'اللَّهُ أَكْبَرُ', key: 'dk.takbir' },
  { id: 'tahleel', ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ', key: 'dk.tahleel' },
  { id: 'istighfar', ar: 'أَسْتَغْفِرُ اللَّهَ', key: 'dk.istighfar' },
  { id: 'hawqala', ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', key: 'dk.hawqala' },
] as const;
export type DhikrId = (typeof DHIKR)[number]['id'];

export const PAGE_GOALS = [0, 1, 2, 5, 10, 20] as const;
export const MEMO_GOALS = [0, 1, 3, 5, 10] as const;
export const REEL_GOALS = [0, 1, 2, 3] as const;
export const DHIKR_GOALS = [0, 33, 100, 300, 1000] as const;

// Weekly goals (owner request 2026-11-09): reset at Friday Maghrib, one week everywhere like Ranks (F9, 2026-11-13).
export const WEEK_PAGES = [0, 7, 14, 25, 50, 100] as const;
/** Minutes of recitation listened to. */
export const WEEK_LISTEN = [0, 30, 60, 120, 300] as const;
export const WEEK_SURAHS = [0, 1, 2, 3, 5] as const;
export const WEEK_REELS = [0, 1, 3, 5, 7] as const;
export const WEEK_NIGHTS = [0, 3, 5, 7] as const;
/** Du'a lanterns a day (of 7: waking, after the five prayers, sleep). */
export const DUA_GOALS = [0, 1, 3, 5, 7] as const;
/** Learn lessons passed a day (optional, off by default). */
export const LESSON_GOALS = [0, 1, 2, 3] as const;
export const LANTERNS = ['wake', 'salah:fajr', 'salah:dhuhr', 'salah:asr', 'salah:maghrib', 'salah:isha', 'sleep'];
/** Lanterns lit on a day. */
export const litCount = (d?: { dm?: string[] }) => (d?.dm ?? []).filter((k) => LANTERNS.includes(k)).length;
export interface WeekGoals { pages: number; listen: number; surahs: number; reels: number; nights: number }

export const CUSTOM_MAX = 5;
export const CUSTOM_TIMES = [1, 2, 3, 5, 7, 10, 20] as const;
export interface CustomGoal {
  id: string;
  /** The user's own words, ≤ 40 characters; shown only to them. */
  name: string;
  /** Times a day (1 = done once). */
  target: number;
  /** Weekdays it is on (0 = Sunday); empty = every day. */
  days: number[];
}
export interface Goals {
  pages: number;
  memorise: number;
  reels: number;
  dhikr: Partial<Record<DhikrId, number>>;
  adhkar: boolean;
  /** Du'a lanterns to light a day (0 = off). */
  duas: number;
  /** Learn lessons or tasmi' to pass a day (0 = off). */
  lessons: number;
  custom: CustomGoal[];
  weekly: WeekGoals;
  /** The pace picked at the start (null = not picked yet). */
  pace: Pace | null;
  /** The day the goals last changed (suggestions wait a week after a change). */
  since: string;
  /** When they last changed (ms), so the newest wins between the user's devices. */
  at: number;
}
export type Pace = 'gentle' | 'steady' | 'devoted';
const WEEK_DEFAULT: WeekGoals = { pages: 14, listen: 60, surahs: 1, reels: 0, nights: 3 };
const DEFAULT: Goals = { pages: 2, memorise: 0, reels: 0, dhikr: { subhan: 33 }, adhkar: true, duas: 3, lessons: 0, custom: [], weekly: WEEK_DEFAULT, pace: null, since: '', at: 0 };
export const PACES: Record<Pace, Pick<Goals, 'pages' | 'memorise' | 'reels' | 'dhikr' | 'adhkar' | 'duas' | 'weekly'>> = {
  gentle: { pages: 1, memorise: 0, reels: 0, dhikr: { subhan: 33 }, adhkar: false, duas: 1, weekly: { pages: 7, listen: 30, surahs: 0, reels: 0, nights: 0 } },
  steady: { pages: 2, memorise: 1, reels: 0, dhikr: { subhan: 100 }, adhkar: true, duas: 3, weekly: WEEK_DEFAULT },
  devoted: { pages: 5, memorise: 3, reels: 0, dhikr: { subhan: 100, istighfar: 100, tahleel: 100 }, adhkar: true, duas: 5, weekly: { pages: 50, listen: 120, surahs: 2, reels: 1, nights: 7 } },
};

let memo: { raw: string | null; g: Goals } | null = null;
/** The goals (parsed once per change; callers get their own copy). */
export function goals(): Goals {
  let raw: string | null = null;
  try { raw = localStorage.getItem('goals'); } catch { /* ignore */ }
  if (memo?.raw !== raw || !memo) memo = { raw, g: parseGoals(raw) };
  return structuredClone(memo.g);
}
function parseGoals(raw: string | null): Goals {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') return structuredClone(DEFAULT);
    const pick = (x: unknown, list: readonly number[], d: number) => (list.includes(Number(x)) ? Number(x) : d);
    const dhikr: Goals['dhikr'] = {};
    for (const { id } of DHIKR) {
      const n = pick(v.dhikr?.[id], DHIKR_GOALS, 0);
      if (n) dhikr[id] = n;
    }
    return {
      pages: pick(v.pages, PAGE_GOALS, DEFAULT.pages),
      memorise: pick(v.memorise, MEMO_GOALS, 0),
      reels: pick(v.reels, REEL_GOALS, 0),
      dhikr,
      adhkar: v.adhkar !== false,
      // Goals saved before the du'a moments: a gentle start (one lantern on a gentle pace, else three).
      duas: pick(v.duas, DUA_GOALS, v.pace === 'gentle' ? 1 : 3),
      lessons: pick(v.lessons, LESSON_GOALS, 0),
      custom: Array.isArray(v.custom) ? v.custom.filter((c: CustomGoal) => c && typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim())
        .slice(0, CUSTOM_MAX).map((c: CustomGoal) => ({
          id: c.id, name: c.name.trim().slice(0, 40), target: pick(c.target, CUSTOM_TIMES, 1),
          days: Array.isArray(c.days) ? c.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
        })) : [],
      weekly: {
        pages: pick(v.weekly?.pages, WEEK_PAGES, WEEK_DEFAULT.pages),
        listen: pick(v.weekly?.listen, WEEK_LISTEN, WEEK_DEFAULT.listen),
        surahs: pick(v.weekly?.surahs, WEEK_SURAHS, WEEK_DEFAULT.surahs),
        reels: pick(v.weekly?.reels, WEEK_REELS, WEEK_DEFAULT.reels),
        nights: pick(v.weekly?.nights, WEEK_NIGHTS, 0),
      },
      pace: v.pace === 'gentle' || v.pace === 'steady' || v.pace === 'devoted' ? v.pace : 'steady',
      since: typeof v.since === 'string' ? v.since : '',
      at: Number.isFinite(v.at) ? v.at : 0,
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}
export function setGoals(g: Goals) {
  try {
    g.since = dayKey();
    g.at = Date.now();
    g.pace ??= 'steady';
    localStorage.setItem('goals', JSON.stringify(g));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('journey-changed'));
}

export interface GoalProgress {
  id: string;
  kind: 'pages' | 'memorise' | 'reels' | 'dhikr' | 'adhkar' | 'custom' | 'listen' | 'surahs' | 'duas' | 'nights' | 'lessons';
  /** A weekly goal: the Saturday its week starts (the bridge week of 9 November began on Monday). */
  week?: string;
  dhikr?: DhikrId;
  /** Adhkar: morning ('s') or evening ('m'). */
  period?: AdhkarPeriod;
  /** A goal of the user's own: its id and name. */
  custom?: CustomGoal;
  done: number;
  target: number;
}

/** Today's goals that are on, with progress. */
export function todayGoals(now = new Date()): GoalProgress[] {
  const g = goals();
  const d = todayRec(now);
  const out: GoalProgress[] = [];
  if (g.pages) out.push({ id: 'pages', kind: 'pages', done: readLogAll()[dayKey(now)]?.length ?? 0, target: g.pages });
  if (g.memorise) out.push({ id: 'memorise', kind: 'memorise', done: d.m ?? 0, target: g.memorise });
  if (g.reels) out.push({ id: 'reels', kind: 'reels', done: d.r ?? 0, target: g.reels });
  for (const { id } of DHIKR) {
    const n = g.dhikr[id];
    if (n) out.push({ id: `dhikr:${id}`, kind: 'dhikr', dhikr: id, done: d.dk?.[id] ?? 0, target: n });
  }
  if (g.adhkar) {
    // Done = adhkar said in full in the app's session; the evening ones appear from Asr.
    out.push({ id: 'adhkar', kind: 'adhkar', period: 's', done: d.ad ? ADHKAR_TOTAL.s : Math.min(ADHKAR_TOTAL.s - 1, finishedCount('s')), target: ADHKAR_TOTAL.s });
    if (d.am || eveningOpen(now)) out.push({ id: 'adhkarM', kind: 'adhkar', period: 'm', done: d.am ? ADHKAR_TOTAL.m : Math.min(ADHKAR_TOTAL.m - 1, finishedCount('m')), target: ADHKAR_TOTAL.m });
  }
  if (g.duas) out.push({ id: 'duas', kind: 'duas', done: litCount(d), target: g.duas });
  if (g.lessons) out.push({ id: 'lessons', kind: 'lessons', done: d.ls ?? 0, target: g.lessons });
  const wd = now.getDay();
  for (const c of g.custom) if (!c.days.length || c.days.includes(wd)) out.push({ id: `c:${c.id}`, kind: 'custom', custom: c, done: d.cu?.[c.id] ?? 0, target: c.target });
  return out;
}

/** This week's goals that are on, with progress: the week runs Saturday → Friday by Islamic days and ends at Friday
 *  Maghrib, like Ranks (F9). Ids carry the week, so each week's claim is new. */
export function weekGoals(now = new Date()): GoalProgress[] {
  const w = goals().weekly;
  const { week: wk, tot } = weekTotals(now);
  const out: GoalProgress[] = [];
  const add = (kind: GoalProgress['kind'], done: number, target: number) => {
    if (target) out.push({ id: `w:${wk}:${kind}`, kind, week: wk, done, target });
  };
  add('pages', tot.pages, w.pages);
  add('listen', Math.floor(tot.listen / 60), w.listen);
  add('surahs', tot.surahs, w.surahs);
  add('reels', tot.reels, w.reels);
  add('nights', tot.nights, w.nights);
  return out;
}
/** Id of the reward for every weekly goal met. */
export const weekAllId = (now = new Date()) => `w:${rankWeek(rankDay(now))}:all`;
/** A weekly reward claimed on any day of its week (local days, Friday evening before it to the Saturday after). */
export function weekClaimed(id: string, now = new Date()): boolean {
  const wk = rankWeek(rankDay(now));
  const days = allDays();
  for (let i = -1; i <= 8; i++) if (days[addDays(wk, i)]?.cl?.includes(id)) return true;
  return false;
}
/** When the day's goals start again (local midnight) and the week's (this week's Friday Maghrib). */
export function resetsAt(now = new Date()): { day: Date; week: Date } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { day, week: weekEndAt(now) };
}

/** The flame's rule: one goal met (or one counted page) lights the day; with no goals, opening does. */
export function anyGoalMet(now = new Date()): boolean {
  const list = todayGoals(now);
  return !list.length || (readLogAll()[dayKey(now)]?.length ?? 0) > 0 || list.some((x) => x.done >= x.target);
}

/** Marks the day when every goal is met; true when that just happened. */
export function checkGoals(now = new Date()): boolean {
  const list = todayGoals(now);
  if (!list.length || todayRec(now).g) return false;
  if (list.every((x) => x.done >= x.target)) { markGoalsMet(now); return true; }
  return false;
}

/** Picks a starting pace (keeps the user's own goals). */
export function choosePace(p: Pace) {
  const g = goals();
  setGoals({ ...g, ...structuredClone(PACES[p]), pace: p });
}

export interface GoalTip { key: string; kind: 'pages' | 'memorise' | 'dhikr'; dhikr?: DhikrId; from: number; to: number; up: boolean }

/** At most one gentle suggestion a week: a goal met nearly every day → a step up; one rarely met → a step down. */
export function goalTip(now = new Date()): GoalTip | null {
  const g = goals();
  const today = dayKey(now);
  if (!g.since || g.since > addDays(today, -7)) return null;
  const days = allDays();
  const log = readLogAll();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i));
  const used = last7.filter((k) => days[k]?.o).length;
  const step = (list: readonly number[], cur: number, up: boolean) => {
    const i = list.indexOf(cur);
    const j = up ? i + 1 : i - 1;
    return j >= 1 && j < list.length ? list[j] : null;
  };
  const cands: { kind: GoalTip['kind']; dhikr?: DhikrId; cur: number; list: readonly number[]; met: number }[] = [];
  if (g.pages) cands.push({ kind: 'pages', cur: g.pages, list: PAGE_GOALS, met: last7.filter((k) => (log[k]?.length ?? 0) >= g.pages).length });
  if (g.memorise) cands.push({ kind: 'memorise', cur: g.memorise, list: MEMO_GOALS, met: last7.filter((k) => (days[k]?.m ?? 0) >= g.memorise).length });
  for (const { id } of DHIKR) {
    const n = g.dhikr[id];
    if (n) cands.push({ kind: 'dhikr', dhikr: id, cur: n, list: DHIKR_GOALS, met: last7.filter((k) => (days[k]?.dk?.[id] ?? 0) >= n).length });
  }
  let dismissed: string[] = [];
  try { dismissed = JSON.parse(localStorage.getItem('goalTips') ?? '[]'); } catch { /* ignore */ }
  for (const c of cands) {
    const up = c.met >= 5;
    const down = c.met <= 1 && used >= 3;
    if (!up && !down) continue;
    const to = step(c.list, c.cur, up);
    if (to === null) continue;
    const key = `${c.kind}${c.dhikr ? `:${c.dhikr}` : ''}:${c.cur}>${to}:${g.since}`;
    if (dismissed.includes(key)) continue;
    return { key, kind: c.kind, dhikr: c.dhikr, from: c.cur, to, up };
  }
  return null;
}
export function acceptTip(tip: GoalTip) {
  const g = goals();
  if (tip.kind === 'pages') g.pages = tip.to;
  else if (tip.kind === 'memorise') g.memorise = tip.to;
  else if (tip.dhikr) g.dhikr[tip.dhikr] = tip.to;
  setGoals(g);
}
export function dismissTip(tip: GoalTip) {
  try {
    const v: string[] = JSON.parse(localStorage.getItem('goalTips') ?? '[]');
    localStorage.setItem('goalTips', JSON.stringify([...v, tip.key].slice(-30)));
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('journey-changed'));
}
/** True until the user picked a pace (or saved any goals). */
export const needsPace = () => { try { return localStorage.getItem('goals') === null; } catch { return false; } };

/** The raw goals for the cloud (null until the user chose any). */
export const goalsRecord = (): Goals | null => (needsPace() ? null : goals());
/** Another device's goals: the most recently changed set wins. */
export function mergeGoals(remote: unknown): boolean {
  if (!remote || typeof remote !== 'object') return false;
  const at = Number((remote as Goals).at);
  if (!Number.isFinite(at) || at <= goals().at || (needsPace() && at <= 0)) return false;
  const g = parseGoals(JSON.stringify(remote));
  try { localStorage.setItem('goals', JSON.stringify(g)); } catch { return false; }
  window.dispatchEvent(new Event('journey-changed'));
  return true;
}

// --- Light (Noor): what a claimed reward adds. Private to the user: no leaderboard, never called
// reward or hasanat. A goal the user writes earns a fixed amount, so it cannot be inflated. ---
const DHIKR_LIGHT: Record<number, number> = { 33: 5, 100: 10, 300: 20, 1000: 40 };
/** Light for a met goal. */
export function lightFor(g: Pick<GoalProgress, 'kind' | 'target' | 'week'>): number {
  if (g.week) {
    switch (g.kind) {
      case 'pages': return 3 * g.target;
      case 'listen': return Math.round(g.target / 2);
      case 'surahs': return 40 * g.target;
      case 'nights': return 15 * g.target;
      default: return 10 * g.target;
    }
  }
  switch (g.kind) {
    case 'pages': return 10 * g.target;
    case 'memorise': return 15 * g.target;
    case 'reels': return 10 * g.target;
    case 'dhikr': return DHIKR_LIGHT[g.target] ?? 5;
    case 'adhkar': return 20;
    case 'duas': return 8 * g.target;
    case 'lessons': return 15 * g.target;
    default: return 10;
  }
}
/** Every goal met: a bonus on top. */
export const ALL_LIGHT = 20;
/** Every weekly goal met. */
export const WEEK_ALL_LIGHT = 50;
/** Light for a badge, by its tier. */
export const BADGE_LIGHT: Record<string, number> = { bronze: 25, silver: 50, gold: 100, platinum: 200, diamond: 400, emerald: 200 };
/** The most Light today's goals can give (for the week's lantern). */
export function dayLightMax(now = new Date()): number {
  const list = todayGoals(now);
  return list.reduce((a, g) => a + lightFor(g), 0) + (list.length > 1 ? ALL_LIGHT : 0);
}

