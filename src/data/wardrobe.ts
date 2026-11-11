// The wardrobe's earned pieces (owner request 2026-11-10): streak pieces once a streak reaches 7 / 30 / 100 / 365
// days (the best streak counts, so a flame that went out keeps what it earned), seasonal pieces while their season
// is on (Ramadan, Eid al-Fitr 1–3 Shawwal, Dhul Hijjah 1–9, Eid al-Adha 10–13; Umm al-Qura calendar), kept for good
// once given. Weekly prize pieces come from Ranks (`grantPiece` on the prize's claim). Owned = `fg:{slot}:{value}`
// in the shop's owned list (synced with the garden), never bought.
import { WARDROBE, type How } from '../ui/figure';
import { shopAdd, shopHas } from './garden';
import { streak } from './journey';

const STREAK: Partial<Record<How, number>> = { s7: 7, s30: 30, s100: 100, s365: 365 };

export function hijri(d: Date): { month: number; day: number } | null {
  try {
    const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric' }).formatToParts(d);
    const n = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? '', 10);
    const v = { month: n('month'), day: n('day') };
    return Number.isInteger(v.month) && Number.isInteger(v.day) ? v : null;
  } catch { return null; }
}
/** The season on now, if any. */
export function seasonNow(d = new Date()): How | null {
  const h = hijri(d);
  if (!h) return null;
  if (h.month === 9) return 'ramadan';
  if (h.month === 10 && h.day <= 3) return 'fitr';
  if (h.month === 12 && h.day <= 9) return 'hajj';
  if (h.month === 12 && h.day <= 13) return 'adha';
  return null;
}

export const ownsPiece = (id: string) => shopHas(`fg:${id}`);
/** Pieces earned by now and not given yet (streaks reached, the season on). */
export function earnedPieces(now = new Date()): string[] {
  const best = Math.max(streak(now).best, streak(now).days);
  const season = seasonNow(now);
  const qadr = season === 'ramadan' && (hijri(now)?.day ?? 0) >= 21;
  return Object.entries(WARDROBE).filter(([id, p]) => {
    if (ownsPiece(id)) return false;
    const n = STREAK[p.how];
    return n ? best >= n : p.how === season || (p.how === 'qadr' && qadr);
  }).map(([id]) => id);
}
/** Gives a piece (a claim, a prize); false when it was already there. */
export const grantPiece = (id: string) => shopAdd(`fg:${id}`, 0);
/** How far a streak piece is (days so far / days needed), for the builder's locked tiles. */
export function streakNeed(how: How): number | null { return STREAK[how] ?? null; }
