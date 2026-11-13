// Things for "Your room" on Me (owner pick 2026-11-10, round 3): plants, a side piece, rugs, curtains and a hanging
// lantern, bought with Light or — the metal lanterns — won by a week in a league's top 3. One piece per place in the
// room; what is bought is kept for good (`rm:{id}` in the shop's owned list, synced with the garden), what stands in
// the room is this device's choice (localStorage `roomLook`). Never money, nothing random.
import { prizeWins, shopAdd, shopHas, wallet } from './garden';
import { streak } from './journey';
import { limitedNow, thisWeek } from './limited';

// Round 5 (owner request 2026-11-11): the room itself (wall, floor, the view from the window), floor seating and a
// cat, more pieces (a dallah, a bookcase with a mushaf on its rehal, a desk lamp that lights at night, a prayer
// corner, a mashrabiya screen, a sprout that grows with the streak).
export type Slot = 'wall' | 'floor' | 'view' | 'plant' | 'side' | 'seat' | 'rug' | 'curtain' | 'hang' | 'pet';
export const SLOTS: Slot[] = ['wall', 'floor', 'view', 'plant', 'side', 'seat', 'rug', 'curtain', 'hang', 'pet'];
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'prize';
export interface RoomItem { id: string; slot: Slot; r: Rarity; price?: number; win?: 1 | 2 | 3; /** Sold one week at a time, in turn (src/data/limited.ts). */ limited?: true }

export const ROOM_ITEMS: RoomItem[] = [
  { id: 'zellige', slot: 'wall', r: 'rare', price: 160 },
  { id: 'panels', slot: 'wall', r: 'common', price: 100 },
  { id: 'arches', slot: 'wall', r: 'epic', price: 240 },
  { id: 'terracotta', slot: 'floor', r: 'common', price: 90 },
  { id: 'marble', slot: 'floor', r: 'rare', price: 170 },
  { id: 'mosaic', slot: 'floor', r: 'epic', price: 260 },
  { id: 'desert', slot: 'view', r: 'common', price: 100 },
  { id: 'sea', slot: 'view', r: 'common', price: 100 },
  { id: 'mountains', slot: 'view', r: 'rare', price: 150 },
  { id: 'city', slot: 'view', r: 'epic', price: 250 },
  { id: 'sprout', slot: 'plant', r: 'common', price: 40 },
  { id: 'fern', slot: 'plant', r: 'common', price: 60 },
  { id: 'palm', slot: 'plant', r: 'common', price: 100 },
  { id: 'jasmine', slot: 'plant', r: 'rare', price: 150 },
  { id: 'olive', slot: 'plant', r: 'epic', price: 250 },
  { id: 'dates', slot: 'side', r: 'common', price: 70 },
  { id: 'tea', slot: 'side', r: 'common', price: 90 },
  { id: 'rehal', slot: 'side', r: 'rare', price: 120 },
  { id: 'incense', slot: 'side', r: 'epic', price: 180 },
  { id: 'lamp', slot: 'side', r: 'common', price: 80 },
  { id: 'dallah', slot: 'side', r: 'rare', price: 140 },
  { id: 'books', slot: 'side', r: 'rare', price: 160 },
  { id: 'corner', slot: 'side', r: 'epic', price: 220 },
  { id: 'cushions', slot: 'seat', r: 'common', price: 70 },
  { id: 'pouf', slot: 'seat', r: 'common', price: 80 },
  { id: 'majlis', slot: 'seat', r: 'rare', price: 180 },
  { id: 'kilim', slot: 'rug', r: 'common', price: 90 },
  { id: 'prayer', slot: 'rug', r: 'rare', price: 120 },
  { id: 'persian', slot: 'rug', r: 'rare', price: 150 },
  { id: 'royal', slot: 'rug', r: 'epic', price: 300 },
  { id: 'sheer', slot: 'curtain', r: 'common', price: 70 },
  { id: 'velvet', slot: 'curtain', r: 'rare', price: 160 },
  { id: 'mashrabiya', slot: 'curtain', r: 'epic', price: 240 },
  { id: 'brass', slot: 'hang', r: 'rare', price: 140 },
  { id: 'glass', slot: 'hang', r: 'epic', price: 260 },
  { id: 'bronze', slot: 'hang', r: 'prize', win: 3 },
  { id: 'silver', slot: 'hang', r: 'prize', win: 2 },
  { id: 'gold', slot: 'hang', r: 'prize', win: 1 },
  // Legendary (owner request 2026-11-12, "make Light way more valuable"): sold for Light one week at a time.
  { id: 'madinah', slot: 'view', r: 'legendary', price: 2500, limited: true },
  { id: 'chandelier', slot: 'hang', r: 'legendary', price: 1500, limited: true },
  { id: 'fountain', slot: 'side', r: 'legendary', price: 1200, limited: true },
  { id: 'silk', slot: 'rug', r: 'legendary', price: 1200, limited: true },
  { id: 'medallion', slot: 'wall', r: 'legendary', price: 1000, limited: true },
  { id: 'brocade', slot: 'curtain', r: 'legendary', price: 1000, limited: true },
  { id: 'ginger', slot: 'pet', r: 'rare', price: 200 },
  { id: 'tabby', slot: 'pet', r: 'rare', price: 200 },
  { id: 'snow', slot: 'pet', r: 'epic', price: 280 },
  { id: 'ink', slot: 'pet', r: 'epic', price: 280 },
];
export const roomItem = (id: string) => ROOM_ITEMS.find((i) => i.id === id) ?? null;

/** The best league place won so far (from the prize pieces kept), or null. */
const bestPlace = () => prizeWins().reduce<number | null>((b, w) => (b === null || w.place < b ? w.place : b), null);
/** Everyone starts with these (F20): a sprout that grows with the streak and a kilim, so a new room is not bare. */
export const STARTER: Partial<Record<Slot, string>> = { plant: 'sprout', rug: 'kilim' };
export function ownsRoom(it: RoomItem): boolean {
  if (STARTER[it.slot] === it.id) return true;
  if (it.win) { const b = bestPlace(); return b !== null && b <= it.win; }
  return shopHas(`rm:${it.id}`);
}
export function buyRoom(it: RoomItem): boolean {
  if (!it.price || it.win || ownsRoom(it) || wallet() < it.price) return false;
  if (it.limited && limitedNow(thisWeek()) !== `rm:${it.id}`) return false;
  if (!shopAdd(`rm:${it.id}`, it.price)) return false;
  setRoomLook(it.slot, it.id);
  return true;
}

const KEY = 'roomLook';
export function roomLook(): Partial<Record<Slot, string>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Record<Slot, string>>;
    const out: Partial<Record<Slot, string>> = {};
    for (const s of SLOTS) {
      // A place never chosen holds its starter piece; '' means the user took it out.
      const id = s in v ? v[s] : STARTER[s];
      const it = id ? roomItem(id) : null;
      if (it && it.slot === s && ownsRoom(it)) out[s] = it.id;
    }
    return out;
  } catch { return {}; }
}
export function setRoomLook(slot: Slot, id: string | null) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, string>;
    v[slot] = id ?? '';
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event('room-look')); } catch { /* ignore */ }
}

/** A room as a short code others can visit (round 5): `slot:id` for what stands there, `b:` the best streak,
 *  `c:` the trophy places (e.g. `c:123`). Only ids from this list are written or read. */
export function roomCode(look: Partial<Record<Slot, string>>, best: number, cups: number[]): string {
  const parts = SLOTS.filter((s) => look[s]).map((s) => `${s}:${look[s]}`);
  parts.push(`b:${Math.max(0, Math.min(9999, Math.floor(best)))}`);
  if (cups.length) parts.push(`c:${cups.slice(0, 5).join('')}`);
  return parts.join(',');
}
export function readRoomCode(code: string | null | undefined): { look: Partial<Record<Slot, string>>; best: number; cups: number[] } | null {
  if (!code || !/^[a-z0-9:,]{0,240}$/.test(code)) return null;
  const look: Partial<Record<Slot, string>> = {};
  let best = 0, cups: number[] = [];
  for (const p of code.split(',')) {
    const [k, v] = p.split(':');
    if (k === 'b') best = Number(v) || 0;
    else if (k === 'c') cups = [...(v ?? '')].map(Number).filter((n) => n >= 1 && n <= 3);
    else { const it = roomItem(v ?? ''); if (it && it.slot === k) look[k as Slot] = it.id; }
  }
  return { look, best, cups };
}
/** This device's room as a code, for friends' visits. */
export function myRoomCode(): string {
  const st = streak();
  return roomCode(roomLook(), Math.max(st.best, st.days), prizeWins().slice(0, 5).map((w) => w.place));
}
