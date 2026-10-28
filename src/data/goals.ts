// Daily goals (Me tab): pages read, ayat memorised, reels made, dhikr on the tasbih counter, the
// morning adhkar and up to 5 goals of the user's own (a name they write, done once or a number of
// times, every day or on chosen weekdays). The user starts from a pace (Gentle / Steady / Devoted)
// and can change anything (localStorage `goals`, this device). Once a week `goalTip()` may suggest
// one step up (a goal met on ≥ 5 of the last 7 days) or down (met on ≤ 1 while the app was used on
// ≥ 3); goals never change by themselves. Progress comes from the journey (journey.ts) and the reading log; when every goal that
// is on has been met, the day is marked (it counts toward goal badges and the weekly summary).
import { addDays, allDays, markGoalsMet, todayRec } from './journey';
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
  custom: CustomGoal[];
  /** The pace picked at the start (null = not picked yet). */
  pace: Pace | null;
  /** The day the goals last changed (suggestions wait a week after a change). */
  since: string;
  /** When they last changed (ms), so the newest wins between the user's devices. */
  at: number;
}
export type Pace = 'gentle' | 'steady' | 'devoted';
const DEFAULT: Goals = { pages: 2, memorise: 0, reels: 0, dhikr: { subhan: 33 }, adhkar: true, custom: [], pace: null, since: '', at: 0 };
export const PACES: Record<Pace, Pick<Goals, 'pages' | 'memorise' | 'reels' | 'dhikr' | 'adhkar'>> = {
  gentle: { pages: 1, memorise: 0, reels: 0, dhikr: { subhan: 33 }, adhkar: false },
  steady: { pages: 2, memorise: 1, reels: 0, dhikr: { subhan: 100 }, adhkar: true },
  devoted: { pages: 5, memorise: 3, reels: 0, dhikr: { subhan: 100, istighfar: 100, tahleel: 100 }, adhkar: true },
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
      custom: Array.isArray(v.custom) ? v.custom.filter((c: CustomGoal) => c && typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim())
        .slice(0, CUSTOM_MAX).map((c: CustomGoal) => ({
          id: c.id, name: c.name.trim().slice(0, 40), target: pick(c.target, CUSTOM_TIMES, 1),
          days: Array.isArray(c.days) ? c.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
        })) : [],
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
  kind: 'pages' | 'memorise' | 'reels' | 'dhikr' | 'adhkar' | 'custom';
  dhikr?: DhikrId;
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
  if (g.adhkar) out.push({ id: 'adhkar', kind: 'adhkar', done: d.ad ? 1 : 0, target: 1 });
  const wd = now.getDay();
  for (const c of g.custom) if (!c.days.length || c.days.includes(wd)) out.push({ id: `c:${c.id}`, kind: 'custom', custom: c, done: d.cu?.[c.id] ?? 0, target: c.target });
  return out;
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
