// New users meet the shop, the room and the wardrobe one at a time (owner decision 2026-11-24, "simplify: new users
// meet too many systems at once"): the shop from the 3rd day the app was opened, the room from the 4th, the wardrobe
// from the 5th. Before that their doors stay out of sight (Light, pieces and the character are still earned and kept).
// The day each one appears, Me shows it once as "New for you" (localStorage `revealSeen`, synced like every key).
import { allDays } from './journey';

export type Reveal = 'shop' | 'room' | 'wardrobe';
const ORDER: Reveal[] = ['shop', 'room', 'wardrobe'];
const FROM = 3;

export const daysOpened = () => Object.values(allDays()).filter((r) => r.o).length;
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
