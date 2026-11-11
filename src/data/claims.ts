// Rewards waiting to be claimed on the Me screen: today's goals that are met, every goal met, and
// earned badges. Nothing plays by itself (reading is never interrupted); the Me tab shows a dot and
// each reward has a Claim button that plays its animation (src/ui/celebrate.ts).
import type { BadgeDef } from './badges';
import { todayGoals, weekAllId, weekClaimed, weekGoals, type GoalProgress } from './goals';
import { badgeClaimed, earnedBadges, goalClaimed } from './journey';

export type Pending =
  | { kind: 'goal'; goal: GoalProgress }
  | { kind: 'all' }
  | { kind: 'weekAll' }
  /** An earned badge (`{family}-{tier}`) waiting for its Claim. */
  | { kind: 'badge'; id: string };

export function pendingRewards(now = new Date()): Pending[] {
  const out: Pending[] = [];
  const list = todayGoals(now);
  for (const g of list) if (g.done >= g.target && !goalClaimed(g.id, now)) out.push({ kind: 'goal', goal: g });
  if (list.length > 1 && list.every((g) => g.done >= g.target) && !goalClaimed('all', now)) out.push({ kind: 'all' });
  const wk = weekGoals(now);
  for (const g of wk) if (g.done >= g.target && !weekClaimed(g.id, now)) out.push({ kind: 'goal', goal: g });
  if (wk.length > 1 && wk.every((g) => g.done >= g.target) && !weekClaimed(weekAllId(now), now)) out.push({ kind: 'weekAll' });
  const got = earnedBadges();
  for (const id of Object.keys(got)) if (/^[a-z0-9]+-[0-4]$/.test(id) && !badgeClaimed(id)) out.push({ kind: 'badge', id });
  return out;
}

/** Which animation a badge gets: the streak flame, the Khatm, the grand rosette, or the medallion. */
export const badgeMoment = (b: BadgeDef): 'flame' | 'khatm' | 'rosette' | 'medal' =>
  b.fam === 'streak' ? 'flame'
    : b.step >= 2 || ['surahs', 'juz', 'trees'].includes(b.fam) ? 'rosette' : 'medal';
