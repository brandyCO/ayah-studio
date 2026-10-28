// Rewards waiting to be claimed on the Me screen: today's goals that are met, every goal met, and
// earned badges. Nothing plays by itself (reading is never interrupted); the Me tab shows a dot and
// each reward has a Claim button that plays its animation (src/ui/celebrate.ts).
import { BADGES, type BadgeDef } from './badges';
import { todayGoals, type GoalProgress } from './goals';
import { badgeClaimed, earnedBadges, goalClaimed } from './journey';

export type Pending =
  | { kind: 'goal'; goal: GoalProgress }
  | { kind: 'all' }
  | { kind: 'badge'; badge: BadgeDef };

export function pendingRewards(now = new Date()): Pending[] {
  const out: Pending[] = [];
  const list = todayGoals(now);
  for (const g of list) if (g.done >= g.target && !goalClaimed(g.id, now)) out.push({ kind: 'goal', goal: g });
  if (list.length > 1 && list.every((g) => g.done >= g.target) && !goalClaimed('all', now)) out.push({ kind: 'all' });
  const got = earnedBadges();
  for (const b of BADGES) if (got[b.id] && !badgeClaimed(b.id)) out.push({ kind: 'badge', badge: b });
  return out;
}

/** Which animation a badge gets: the streak flame, the grand rosette, or the medallion. */
export const badgeMoment = (b: BadgeDef): 'flame' | 'rosette' | 'medal' =>
  b.icon === 'flame' ? 'flame'
    : ['surah1', 'surahs10', 'juz1', 'khatm', 'memo100', 'dhikr10k'].includes(b.id) ? 'rosette' : 'medal';
