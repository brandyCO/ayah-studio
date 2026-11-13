// "You wrote here today" / "You wrote here on 12 Oct": the reflection mark's label, kept out of the
// reflections sheet so the mushaf can show it without loading the sheet (first-load size).
import { locale, t as tr } from '../i18n';

const sameDay = (t: number, d = new Date()) => new Date(t).toDateString() === d.toDateString();
export const wroteHere = (t: number) => (sameDay(t)
  ? tr('rf.wroteToday')
  : tr('rf.wroteOn', { date: new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(t) }));
