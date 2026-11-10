// Things for "Your room" on Me (owner pick 2026-11-10, round 3): plants, a side piece, rugs, curtains and a hanging
// lantern, bought with Light or — the metal lanterns — won by a week in a league's top 3. One piece per place in the
// room; what is bought is kept for good (`rm:{id}` in the shop's owned list, synced with the garden), what stands in
// the room is this device's choice (localStorage `roomLook`). Never money, nothing random.
import { prizeWins, shopAdd, shopHas, wallet } from './garden';

export type Slot = 'plant' | 'side' | 'rug' | 'curtain' | 'hang';
export const SLOTS: Slot[] = ['plant', 'side', 'rug', 'curtain', 'hang'];
export type Rarity = 'common' | 'rare' | 'epic' | 'prize';
export interface RoomItem { id: string; slot: Slot; r: Rarity; price?: number; win?: 1 | 2 | 3 }

export const ROOM_ITEMS: RoomItem[] = [
  { id: 'fern', slot: 'plant', r: 'common', price: 60 },
  { id: 'palm', slot: 'plant', r: 'common', price: 100 },
  { id: 'jasmine', slot: 'plant', r: 'rare', price: 150 },
  { id: 'olive', slot: 'plant', r: 'epic', price: 250 },
  { id: 'dates', slot: 'side', r: 'common', price: 70 },
  { id: 'tea', slot: 'side', r: 'common', price: 90 },
  { id: 'rehal', slot: 'side', r: 'rare', price: 120 },
  { id: 'incense', slot: 'side', r: 'epic', price: 180 },
  { id: 'kilim', slot: 'rug', r: 'common', price: 90 },
  { id: 'prayer', slot: 'rug', r: 'rare', price: 120 },
  { id: 'persian', slot: 'rug', r: 'rare', price: 150 },
  { id: 'royal', slot: 'rug', r: 'epic', price: 300 },
  { id: 'sheer', slot: 'curtain', r: 'common', price: 70 },
  { id: 'velvet', slot: 'curtain', r: 'rare', price: 160 },
  { id: 'brass', slot: 'hang', r: 'rare', price: 140 },
  { id: 'glass', slot: 'hang', r: 'epic', price: 260 },
  { id: 'bronze', slot: 'hang', r: 'prize', win: 3 },
  { id: 'silver', slot: 'hang', r: 'prize', win: 2 },
  { id: 'gold', slot: 'hang', r: 'prize', win: 1 },
];
export const roomItem = (id: string) => ROOM_ITEMS.find((i) => i.id === id) ?? null;

/** The best league place won so far (from the prize pieces kept), or null. */
const bestPlace = () => prizeWins().reduce<number | null>((b, w) => (b === null || w.place < b ? w.place : b), null);
export function ownsRoom(it: RoomItem): boolean {
  if (it.win) { const b = bestPlace(); return b !== null && b <= it.win; }
  return shopHas(`rm:${it.id}`);
}
export function buyRoom(it: RoomItem): boolean {
  if (!it.price || it.win || ownsRoom(it) || wallet() < it.price) return false;
  if (!shopAdd(`rm:${it.id}`, it.price)) return false;
  setRoomLook(it.slot, it.id);
  return true;
}

const KEY = 'roomLook';
export function roomLook(): Partial<Record<Slot, string>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Record<Slot, string>>;
    const out: Partial<Record<Slot, string>> = {};
    for (const s of SLOTS) { const it = v[s] ? roomItem(v[s]!) : null; if (it && it.slot === s && ownsRoom(it)) out[s] = it.id; }
    return out;
  } catch { return {}; }
}
export function setRoomLook(slot: Slot, id: string | null) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, string>;
    if (id) v[slot] = id; else delete v[slot];
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch { /* storage blocked */ }
}
