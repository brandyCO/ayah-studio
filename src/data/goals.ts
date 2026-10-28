// Daily goals (Me tab): pages read, ayat memorised, reels made, dhikr on the tasbih counter and the
// morning adhkar. The user picks which goals are on and how many (localStorage `goals`, this
// device). Progress comes from the journey (journey.ts) and the reading log; when every goal that
// is on has been met, the day is marked (it counts toward goal badges and the weekly summary).
import { markGoalsMet, todayRec } from './journey';
import { dayKey, readLog } from './readLog';

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

export interface Goals {
  pages: number;
  memorise: number;
  reels: number;
  dhikr: Partial<Record<DhikrId, number>>;
  adhkar: boolean;
}
const DEFAULT: Goals = { pages: 2, memorise: 0, reels: 0, dhikr: { subhan: 33 }, adhkar: true };

export function goals(): Goals {
  try {
    const v = JSON.parse(localStorage.getItem('goals') ?? 'null');
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
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}
export function setGoals(g: Goals) {
  try {
    localStorage.setItem('goals', JSON.stringify(g));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('journey-changed'));
}

export interface GoalProgress {
  id: string;
  kind: 'pages' | 'memorise' | 'reels' | 'dhikr' | 'adhkar';
  dhikr?: DhikrId;
  done: number;
  target: number;
}

/** Today's goals that are on, with progress. */
export function todayGoals(now = new Date()): GoalProgress[] {
  const g = goals();
  const d = todayRec(now);
  const out: GoalProgress[] = [];
  if (g.pages) out.push({ id: 'pages', kind: 'pages', done: readLog()[dayKey(now)]?.length ?? 0, target: g.pages });
  if (g.memorise) out.push({ id: 'memorise', kind: 'memorise', done: d.m ?? 0, target: g.memorise });
  if (g.reels) out.push({ id: 'reels', kind: 'reels', done: d.r ?? 0, target: g.reels });
  for (const { id } of DHIKR) {
    const n = g.dhikr[id];
    if (n) out.push({ id: `dhikr:${id}`, kind: 'dhikr', dhikr: id, done: d.dk?.[id] ?? 0, target: n });
  }
  if (g.adhkar) out.push({ id: 'adhkar', kind: 'adhkar', done: d.ad ? 1 : 0, target: 1 });
  return out;
}

/** Marks the day when every goal is met; true when that just happened. */
export function checkGoals(now = new Date()): boolean {
  const list = todayGoals(now);
  if (!list.length || todayRec(now).g) return false;
  if (list.every((x) => x.done >= x.target)) { markGoalsMet(now); return true; }
  return false;
}
