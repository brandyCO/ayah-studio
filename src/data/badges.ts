// Milestone badges (Me tab): 23 families, each in five tiers — Bronze, Silver, Gold, Platinum, Diamond — for
// everything the app can check: reading, listening, Learn, du'a and dhikr, goals, Ranks, reels and sharing.
// Each shows its progress until it is earned; earned badges keep the day (journey.ts `badges`, synced with
// the account, so they follow every device). Counts come from the synced journey (`totals`, `lifetime()`),
// the Learn garden and page memory (synced as account data) and the Ranks answers kept on the device.
// Names and goals: src/i18n/badges.ts (loaded with the screens that show them).
import { badgeClaimed, earnBadges, earnedBadges, lifetime, streak, totals } from './journey';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'emerald';
export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type BadgeIcon = 'flame' | 'page' | 'book' | 'mushaf' | 'juz' | 'beads' | 'reel' | 'target' | 'listen' | 'heart'
  | 'cave' | 'clock' | 'sprout' | 'tree' | 'drop' | 'sun' | 'lantern' | 'moon' | 'calendar' | 'shield' | 'trophy' | 'crown' | 'share' | 'layers' | 'flag';

export type BadgeGroup = 'read' | 'listen' | 'learn' | 'dua' | 'goals' | 'ranks' | 'create';
export interface BadgeDef {
  /** `{family}-{tier 0..4}`. */
  id: string;
  fam: string;
  tier: BadgeTier;
  /** 0 bronze … 4 diamond. */
  step: number;
  icon: BadgeIcon;
  group: BadgeGroup;
  need: number;
  have: () => number;
}

const json = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const life = (k: string) => () => lifetime()[k] ?? 0;
const tot = (k: keyof ReturnType<typeof totals>) => () => totals()[k];
/** Learn: full-grown trees (the garden, synced as account data). */
const trees = () => Object.values<{ full?: number }>(json('garden')?.trees ?? {}).filter((t) => t?.full).length;
/** Page memory: pages held strong now (box ≥ 4 and revised within its interval, as `level()` counts it). */
const DAYS = [1, 2, 4, 8, 16, 30];
const strong = () => {
  const now = Date.now();
  return Object.values<{ b: number; at: number }>(json('pageStrength') ?? {}).filter((r) => {
    if (!r || !(r.b > 0)) return false;
    const days = DAYS[Math.max(0, r.b - 1)], since = (now - r.at) / 86_400_000;
    return (r.b / 6) * (since <= days ? 1 : Math.max(0.2, 1 - (since - days) / (2 * days))) >= 0.6;
  }).length;
};
/** Ranks, from the answers kept on this device (src/together/ranks.ts `rankCache`). */
const ranks = () => json('rankCache')?.v ?? {};
const prizes = (): { place: number | null; tier: number }[] => (Array.isArray(ranks().prizes) ? ranks().prizes : []);
/** Highest league reached (1 Star … 4 Sun), and 5 once a week was won in Sun. */
const league = () => (prizes().some((p) => p.place === 1 && p.tier === 4) ? 5 : Math.max(0, ranks().status?.bestTier ?? 0, ...prizes().map((p) => p.tier)));
const top3 = () => prizes().filter((p) => p.place).length;
const wins = () => Math.max(ranks().status?.wins ?? 0, prizes().filter((p) => p.place === 1).length);

// family, icon, group, count, Bronze / Silver / Gold / Platinum / Diamond
const FAMILIES: [string, BadgeIcon, BadgeGroup, () => number, number[]][] = [
  ['streak', 'flame', 'read', () => streak().best, [7, 30, 100, 180, 365]],
  ['pages', 'page', 'read', tot('pages'), [10, 100, 604, 2000, 6040]],
  ['surahs', 'book', 'read', tot('surahs'), [1, 10, 30, 60, 114]],
  ['juz', 'juz', 'read', tot('juz'), [1, 5, 10, 20, 30]],
  ['kahf', 'cave', 'read', life('kf'), [1, 4, 12, 26, 52]],
  ['listen', 'listen', 'listen', () => Math.floor(totals().listen / 3600), [1, 10, 50, 200, 500]],
  ['lessons', 'target', 'learn', life('ls'), [1, 25, 100, 300, 1000]],
  ['memo', 'heart', 'learn', tot('memorised'), [10, 100, 500, 1500, 6236]],
  ['trees', 'tree', 'learn', trees, [1, 5, 15, 38, 114]],
  ['water', 'drop', 'learn', life('wa'), [5, 25, 100, 300, 1000]],
  ['strong', 'layers', 'learn', strong, [1, 10, 50, 200, 604]],
  ['dhikr', 'beads', 'dua', tot('dhikr'), [1000, 10000, 50000, 100000, 500000]],
  ['adhkar', 'sun', 'dua', life('ad'), [7, 30, 100, 365, 1000]],
  ['lanterns', 'lantern', 'dua', life('lt'), [10, 100, 500, 1500, 5000]],
  ['nights', 'moon', 'dua', life('nt'), [7, 30, 100, 180, 365]],
  ['fullday', 'mushaf', 'dua', life('fd'), [1, 7, 30, 100, 365]],
  ['goals', 'calendar', 'goals', life('gd'), [7, 30, 100, 180, 365]],
  ['weeks', 'flag', 'goals', life('gw'), [1, 4, 12, 26, 52]],
  ['league', 'shield', 'ranks', league, [1, 2, 3, 4, 5]],
  ['top3', 'trophy', 'ranks', top3, [1, 3, 10, 25, 50]],
  ['wins', 'crown', 'ranks', wins, [1, 2, 5, 10, 25]],
  ['reels', 'reel', 'create', tot('reels'), [1, 10, 50, 150, 500]],
  ['shares', 'share', 'create', tot('shares'), [1, 10, 50, 150, 500]],
];

export const BADGES: BadgeDef[] = FAMILIES.flatMap(([fam, icon, group, have, needs]) =>
  needs.map((need, step) => ({ id: `${fam}-${step}`, fam, tier: TIERS[step], step, icon, group, need, have })));

export interface BadgeState { def: BadgeDef; have: number; earned?: string }

/** The badge's reward was claimed. */
export const badgeDone = (id: string) => badgeClaimed(id);

export function badgeStates(): BadgeState[] {
  const got = earnedBadges();
  const memo = new Map<() => number, number>();
  return BADGES.map((def) => {
    if (!memo.has(def.have)) memo.set(def.have, def.have());
    return { def, have: Math.min(def.need, memo.get(def.have)!), earned: got[def.id] };
  });
}

/** Earns every badge whose goal is now met; returns the new ones. */
export function checkBadges(): BadgeDef[] {
  const got = earnedBadges();
  const memo = new Map<() => number, number>();
  const val = (b: BadgeDef) => { if (!memo.has(b.have)) memo.set(b.have, b.have()); return memo.get(b.have)!; };
  const ready = BADGES.filter((b) => !got[b.id] && val(b) >= b.need);
  if (!ready.length) return [];
  const fresh = earnBadges(ready.map((b) => b.id));
  return BADGES.filter((b) => fresh.includes(b.id));
}
