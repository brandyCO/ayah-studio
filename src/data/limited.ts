// This week's limited piece (owner request 2026-11-12, "make Light way more valuable"): twelve pieces sold for Light one
// week at a time, in turn — six frames and six legendary room pieces — so each comes back only after twelve weeks.
import { addDays, weekOf } from './journey';
import { dayKey } from './readLog';

export const LIMITED = ['fr:14', 'rm:madinah', 'fr:15', 'rm:chandelier', 'fr:16', 'rm:fountain', 'fr:17', 'rm:silk', 'fr:18', 'rm:medallion', 'fr:19', 'rm:brocade'];
const index = (week: string) => Math.round((Date.parse(`${week}T12:00Z`) - Date.parse('2026-11-09T12:00Z')) / 6048e5);
/** The Monday of this week on this device. */
export const thisWeek = () => weekOf(dayKey());
export const limitedNow = (week: string) => LIMITED[((index(week) % LIMITED.length) + LIMITED.length) % LIMITED.length];
/** Weeks until a limited piece is sold again (0 = this week), −1 for a piece that is not limited. */
export function limitedIn(id: string, week: string): number {
  for (let i = 0; i < LIMITED.length; i++) if (limitedNow(addDays(week, i * 7)) === id) return i;
  return -1;
}
