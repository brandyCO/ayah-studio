// New users meet the shop, the room and the wardrobe one at a time (owner decision 2026-11-24, "simplify: new users
// meet too many systems at once"): the shop from the 3rd day the app was opened, the room from the 4th, the wardrobe
// from the 5th. Before that their doors stay out of sight (Light, pieces and the character are still earned and kept).
// The day each one appears, Me shows it once as "New for you" (localStorage `revealSeen`, synced like every key).
import { account } from '../cloud/auth';
import { allDays } from './journey';

export type Reveal = 'shop' | 'room' | 'wardrobe';
const ORDER: Reveal[] = ['shop', 'room', 'wardrobe'];
const FROM = 3;

/** Days of the first week passed: the days the app was opened, or (signed in) the days since the account was made,
 *  whichever is more (owner 2026-11-24: someone who signs in on a new phone is not new). */
export const daysOpened = () => Math.max(Object.values(allDays()).filter((r) => r.o).length, accountDays());
function accountDays(): number {
  const at = Date.parse(account()?.created ?? '');
  if (!Number.isFinite(at)) return 0;
  const a = new Date(at), now = new Date();
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(a)) / 864e5)) + 1;
}
function seen(): Reveal[] {
  try { const v = JSON.parse(localStorage.getItem('revealSeen') ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Whether this part of the app is shown yet. */
export const revealed = (k: Reveal): boolean => daysOpened() >= FROM + ORDER.indexOf(k) || seen().includes(k);

/** The part that just appeared and has not been introduced yet (at most one; everything once day 5 has passed). */
export function newReveal(): Reveal | null {
  const n = daysOpened();
  if (n > FROM + ORDER.length) return null; // people who used the app before this came in: nothing to introduce
  const s = seen();
  return ORDER.find((k) => n >= FROM + ORDER.indexOf(k) && !s.includes(k)) ?? null;
}
export function markRevealed(k: Reveal) {
  try { localStorage.setItem('revealSeen', JSON.stringify([...new Set([...seen(), k])])); } catch { /* ignore */ }
}
