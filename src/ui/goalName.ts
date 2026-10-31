// A goal's name as the Me screen shows it ("Read 5 pages", "Subhan Allah", a goal of the user's own),
// shared by Me and the goal notifications.
import { DHIKR, type GoalProgress } from '../data/goals';
import { t, type Key } from '../i18n';

export const goalText = (kind: string, n: number) =>
  t((n === 1 && ['pages', 'memorise', 'reels'].includes(kind) ? `goal.${kind}1` : `goal.${kind}`) as Key, { n });

export const goalLabel = (g: GoalProgress) => g.kind === 'dhikr'
  ? t(DHIKR.find((x) => x.id === g.dhikr)!.key as Key)
  : g.kind === 'custom' ? g.custom!.name
    : goalText(g.kind, g.target);
