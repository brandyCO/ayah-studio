// The Light shop (owner decision 2026-11-09, "Light + trophies + shop"): Light from goals, badges and
// Ranks prizes buys streak freezes kept for later, avatars and frames. Some things can only be won:
// the Sun tier's avatars and frame, the laurel frames of a week's top 3, and the champion avatars for
// weeks won at #1 (the server checks those, rank_set_look). Never money, never a measure of reward.
import { shopAdd, shopHas, shopIds, wallet } from './garden';
import { revive } from './journey';

export const FREEZE_PRICE = 250;
export const FREEZE_MAX = 3;
/** What can only be won, and how. */
export type Win = 'sun' | 'p1' | 'p2' | 'p3' | 'w1' | 'w3' | 'w5' | 'w10';
export interface Item { id: string; kind: 'avatar' | 'frame' | 'icon'; ref: number | string; price?: number; win?: Win }
/** What the player has won so far (from rank_status). */
export interface Wins { bestTier: number; bestPlace: number | null; wins: number }

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const ITEMS: Item[] = [
  ...range(24, 31).map((n): Item => ({ id: `av:${n}`, kind: 'avatar', ref: n, price: 150 })),
  { id: 'fr:1', kind: 'frame', ref: 1, price: 200 },
  { id: 'fr:2', kind: 'frame', ref: 2, price: 250 },
  { id: 'fr:3', kind: 'frame', ref: 3, price: 400 },
  ...range(32, 35).map((n): Item => ({ id: `av:${n}`, kind: 'avatar', ref: n, win: 'sun' })),
  { id: 'fr:4', kind: 'frame', ref: 4, win: 'sun' },
  { id: 'fr:5', kind: 'frame', ref: 5, win: 'p1' },
  { id: 'fr:6', kind: 'frame', ref: 6, win: 'p2' },
  { id: 'fr:7', kind: 'frame', ref: 7, win: 'p3' },
  ...(['w1', 'w3', 'w5', 'w10'] as const).map((w, i): Item => ({ id: `av:${36 + i}`, kind: 'avatar', ref: 36 + i, win: w })),
  // App icons join here (bought or won) once their designs are in the app.
];

export const won = (w: Win, x: Wins) => w === 'sun' ? x.bestTier >= 4
  : w[0] === 'p' ? x.bestPlace !== null && x.bestPlace <= Number(w.slice(1))
    : x.wins >= Number(w.slice(1));
/** Owned: free (the first 24 avatars, the tier ring), bought, or won. */
export function owns(kind: 'avatar' | 'frame', ref: number, x: Wins): boolean {
  if (kind === 'avatar' ? ref < 24 : ref === 0) return true;
  const it = ITEMS.find((i) => i.kind === kind && i.ref === ref);
  if (!it) return false;
  return it.win ? won(it.win, x) : shopHas(it.id);
}
/** Light left to spend: all earned (every device) minus the garden's and the shop's purchases. */
export const lightLeft = wallet;
export function buy(it: Item): boolean {
  if (!it.price || it.win || shopHas(it.id) || lightLeft() < it.price) return false;
  return shopAdd(it.id, it.price);
}

// Streak freezes kept for later: `fz:…` (bought or won), `fu:…` (one used). A kept freeze covers one
// missed day of a flame that went out (Me → the lost flame), on top of the weekly and 30-day freezes.
export const bankedFreezes = () => Math.max(0, shopIds('fz:').length - shopIds('fu:').length);
export function buyFreeze(): boolean {
  if (bankedFreezes() >= FREEZE_MAX || lightLeft() < FREEZE_PRICE) return false;
  return shopAdd(`fz:${Date.now().toString(36)}`, FREEZE_PRICE);
}
/** A freeze won in Ranks (once per prize). */
export const keepFreeze = (id: string) => shopAdd(`fz:${id}`, 0);
/** Relights a flame that went out with kept freezes, one per missed day. */
export function useFreezes(days: string[]): boolean {
  if (!days.length || bankedFreezes() < days.length) return false;
  for (const d of days) shopAdd(`fu:${d}`, 0);
  revive(days);
  return true;
}
