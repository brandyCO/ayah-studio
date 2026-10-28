// Milestone badges (Me tab): each one has a goal and shows its progress until it is earned. Earned
// badges keep the day they were earned (journey.ts `badges`). Computed from this device's journey.
import { earnBadges, earnedBadges, pagesEver, stats, streak, totals } from './journey';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'emerald';
export type BadgeIcon = 'flame' | 'page' | 'book' | 'mushaf' | 'juz' | 'beads' | 'reel' | 'target' | 'listen' | 'heart';

export interface BadgeDef {
  id: string;
  tier: BadgeTier;
  icon: BadgeIcon;
  /** i18n key of the name; `{n}` filled with `need`. */
  name: string;
  /** i18n key of the goal. */
  goal: string;
  need: number;
  have: () => number;
}

const best = () => streak().best;
const goalDays = () => stats('all').goalDays;

export const BADGES: BadgeDef[] = [
  { id: 'streak7', tier: 'bronze', icon: 'flame', name: 'bd.streak7', goal: 'bd.gStreak', need: 7, have: best },
  { id: 'streak30', tier: 'silver', icon: 'flame', name: 'bd.streak30', goal: 'bd.gStreak', need: 30, have: best },
  { id: 'streak100', tier: 'gold', icon: 'flame', name: 'bd.streak100', goal: 'bd.gStreak', need: 100, have: best },
  { id: 'streak180', tier: 'gold', icon: 'flame', name: 'bd.streak180', goal: 'bd.gStreak', need: 180, have: best },
  { id: 'streak365', tier: 'emerald', icon: 'flame', name: 'bd.streak365', goal: 'bd.gStreak', need: 365, have: best },
  { id: 'page1', tier: 'bronze', icon: 'page', name: 'bd.page1', goal: 'bd.gPages', need: 1, have: () => totals().pages },
  { id: 'pages100', tier: 'silver', icon: 'page', name: 'bd.pages100', goal: 'bd.gPages', need: 100, have: () => totals().pages },
  { id: 'surah1', tier: 'bronze', icon: 'book', name: 'bd.surah1', goal: 'bd.gSurahs', need: 1, have: () => totals().surahs },
  { id: 'surahs10', tier: 'silver', icon: 'book', name: 'bd.surahs10', goal: 'bd.gSurahs', need: 10, have: () => totals().surahs },
  { id: 'juz1', tier: 'silver', icon: 'juz', name: 'bd.juz1', goal: 'bd.gJuz', need: 1, have: () => totals().juz },
  { id: 'khatm', tier: 'emerald', icon: 'mushaf', name: 'bd.khatm', goal: 'bd.gKhatm', need: 604, have: pagesEver },
  { id: 'memo10', tier: 'bronze', icon: 'heart', name: 'bd.memo10', goal: 'bd.gMemo', need: 10, have: () => totals().memorised },
  { id: 'memo100', tier: 'gold', icon: 'heart', name: 'bd.memo100', goal: 'bd.gMemo', need: 100, have: () => totals().memorised },
  { id: 'dhikr1k', tier: 'bronze', icon: 'beads', name: 'bd.dhikr1k', goal: 'bd.gDhikr', need: 1000, have: () => totals().dhikr },
  { id: 'dhikr10k', tier: 'gold', icon: 'beads', name: 'bd.dhikr10k', goal: 'bd.gDhikr', need: 10000, have: () => totals().dhikr },
  { id: 'listen10h', tier: 'silver', icon: 'listen', name: 'bd.listen10h', goal: 'bd.gListen', need: 600, have: () => Math.floor(totals().listen / 60) },
  { id: 'reel1', tier: 'bronze', icon: 'reel', name: 'bd.reel1', goal: 'bd.gReels', need: 1, have: () => totals().reels },
  { id: 'reels10', tier: 'silver', icon: 'reel', name: 'bd.reels10', goal: 'bd.gReels', need: 10, have: () => totals().reels },
  { id: 'goals7', tier: 'silver', icon: 'target', name: 'bd.goals7', goal: 'bd.gGoals', need: 7, have: goalDays },
  { id: 'goals30', tier: 'gold', icon: 'target', name: 'bd.goals30', goal: 'bd.gGoals', need: 30, have: goalDays },
];

export interface BadgeState { def: BadgeDef; have: number; earned?: string }

export function badgeStates(): BadgeState[] {
  const got = earnedBadges();
  return BADGES.map((def) => ({ def, have: Math.min(def.need, def.have()), earned: got[def.id] }));
}

/** Earns every badge whose goal is now met; returns the new ones. */
export function checkBadges(): BadgeDef[] {
  const got = earnedBadges();
  const ready = BADGES.filter((b) => !got[b.id] && b.have() >= b.need);
  const fresh = earnBadges(ready.map((b) => b.id));
  return BADGES.filter((b) => fresh.includes(b.id));
}
