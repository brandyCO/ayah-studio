// Seven days of gifts (owner request 2026-11-24, "a 7 days of a week popup where each day gives something, like many
// of the 4X games"). Two kinds of week:
// - The first week is the user's own: Day 1 … Day 7, one tile taken on each day the app is opened, a missed day never
//   resets it (the next tile just waits). Its tiles also open the shop, the room and the wardrobe (data/reveal.ts).
// - Every week after it runs Saturday → Friday (owner: "starts on Saturday, last prize on Friday, as Friday is the most
//   important day"): a tile per weekday, smaller prizes, Friday's the biggest chest. A day not opened fades (missed);
//   Friday's is always there. A week joined midway shows its earlier days as not counted.
// Prizes are credited once each (Light as a journey claim, pieces as shop entries), so two phones never double them.
// State in localStorage `weekGift` (synced like every key).
import { addDays, claimGoal } from './journey';
import { dayKey } from './readLog';
import { shopAdd, shopHas } from './garden';
import type { Reveal } from './reveal';

export interface Prize {
  light?: number; freeze?: true; room?: string; piece?: string; frame?: string; opens?: Reveal;
  /** All five Learn lamps lit again. */ lamps?: true;
  /** The next n chests on Me hold double Light. */ boost?: number;
  /** Friday's chest: with all six days before it taken, the week's Jumu'ah piece and a streak freeze. */ jumuah?: true;
}
/** The first week: Light, a freeze, the shop, a palm for the room, a lantern to hold, more Light, the big chest. */
export const FIRST_WEEK: Prize[] = [
  { light: 50 }, { freeze: true }, { light: 100, opens: 'shop' }, { room: 'palm', opens: 'room' },
  { piece: 'hold:5', opens: 'wardrobe' }, { light: 150 }, { light: 300, frame: 'fr:2' },
];
/** Saturday → Friday, every week after the first (owner 2026-11-24: things people need, no freezes or repairs here). */
export const WEEK: Prize[] = [
  { light: 20 }, { lamps: true }, { light: 30 }, { boost: 3 }, { light: 40 }, { lamps: true }, { light: 150, jumuah: true },
];

// --- the Jumu'ah collection (owner request 2026-11-24): pieces won only from Friday's chest, one a week in turn, so a
// missed one comes back when the turn comes round. Friday's chest holds it when the six days before were all taken.
export const JUMUAH = ['fr:20', 'fr:21', 'fr:22', 'fr:23', 'fr:24', 'fr:25'];
const weekIndex = (sat: string) => Math.round((Date.parse(`${sat}T12:00Z`) - Date.parse('2026-11-21T12:00Z')) / 6048e5);
/** This week's Jumu'ah piece (the week starting on Saturday `sat`). */
export const jumuahPiece = (sat = saturday()) => JUMUAH[((weekIndex(sat) % JUMUAH.length) + JUMUAH.length) % JUMUAH.length];
/** Weeks until a Jumu'ah piece is in Friday's chest again (0 = this week), −1 if it is not one. */
export function jumuahIn(id: string, sat = saturday()): number {
  for (let i = 0; i < JUMUAH.length; i++) if (jumuahPiece(addDays(sat, i * 7)) === id) return i;
  return -1;
}
/** Light instead of the piece when it is already owned. */
export const JUMUAH_OWNED_LIGHT = 100;
/** Lanterns lit on Friday's chest this week: the days Saturday → Thursday taken. */
export function lanternsLit(): number {
  const s = load();
  return s.wk === saturday() ? (s.taken ?? []).filter((i) => i < 6).length : 0;
}
/** Lanterns this week asks for: Saturday → Thursday, less the days before the calendar began for this user. */
export function lanternsNeed(): number {
  const from = load().wfrom ?? today(), wk = saturday();
  return Array.from({ length: 6 }, (_, i) => addDays(wk, i)).filter((d) => d >= from).length;
}
const fullWeek = () => { const n = lanternsNeed(); return n > 0 && lanternsLit() >= n; };

// --- Double Light: the next n chests on Me hold double (localStorage `lightBoost`, this device). ---
const BKEY = 'lightBoost';
export function boostsLeft(): number { try { return Math.max(0, Number(localStorage.getItem(BKEY)) || 0); } catch { return 0; } }
function setBoosts(n: number) { try { localStorage.setItem(BKEY, String(Math.max(0, n))); } catch { /* ignore */ } }
/** Takes one boost for a chest being opened: 2 when one was left, else 1. */
export function useBoost(): 1 | 2 { const n = boostsLeft(); if (!n) return 1; setBoosts(n - 1); return 2; }
const KEY = 'weekGift';
/** got: first-week tiles taken; last: the day of the last tile; wk/taken: this Saturday's week and its weekdays taken;
 *  wfrom: the first day the weekly calendar counted (the day after the first week ended); old: never had a first week. */
interface State { got: number; last: string | null; from?: string; wk?: string; taken?: number[]; wfrom?: string; old?: true }

function load(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null;
    if (v && Number.isInteger(v.got)) return { ...v, got: Math.max(0, Math.min(7, v.got)), last: v.last ?? null };
  } catch { /* fresh */ }
  return { got: 0, last: null };
}
function save(s: State) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private */ }
  window.dispatchEvent(new Event('weekgift-changed'));
}
const today = () => dayKey(new Date());
/** Saturday 0 … Friday 6. */
export const weekday = (d = new Date()) => (d.getDay() + 1) % 7;
const saturday = (d = new Date()) => addDays(dayKey(d), -weekday(d));

/** Sets the calendar up the first time it is looked at: a new user starts the first week; people who used the app
 *  before it came in (more than two days opened) go straight to the weekly calendar. Always true (everyone has it). */
export function giftsOn(daysOpened: number, waiting = false): boolean {
  const s = load();
  if (s.from || s.got) return true;
  // Signed in on a new phone: the account's own calendar (and its days) has not arrived yet. Deciding now started a
  // second first week here, which the sync then mixed with the account's (owner report 2026-11-25: all seven tiles
  // shown as taken on a fresh install). Wait for the first sync.
  if (waiting) return false;
  if (daysOpened > 2) save({ got: 7, last: null, from: today(), wfrom: today(), old: true });
  else save({ ...s, from: today() });
  return true;
}

export type TileState = 'got' | 'today' | 'later' | 'missed' | 'none';
export interface GiftView { first: boolean; prizes: Prize[]; states: TileState[]; ready: boolean; /** the tile to claim */ at: number }
/** The first week stays on screen through the day its seventh tile is taken, then the weekly calendar. */
const inFirst = (s: State) => !s.old && (s.got < 7 || s.last === today());

export function giftView(): GiftView {
  const s = load();
  const t = today();
  if (inFirst(s)) {
    const ready = s.got < 7 && s.last !== t;
    const states = FIRST_WEEK.map((_, i): TileState => i < s.got ? 'got' : ready && i === s.got ? 'today' : 'later');
    return { first: true, prizes: FIRST_WEEK, states, ready, at: s.got };
  }
  const wk = saturday();
  const taken = s.wk === wk ? s.taken ?? [] : [];
  const from = s.wfrom ?? t;
  const now = weekday();
  const states = WEEK.map((_, i): TileState => {
    const day = addDays(wk, i);
    if (taken.includes(i)) return 'got';
    if (day < from) return 'none';
    return i === now ? 'today' : i < now ? 'missed' : 'later';
  });
  return { first: false, prizes: WEEK, states, ready: states[now] === 'today', at: now };
}

/** Takes today's gift: credits it and marks its tile. Null when today's is already taken. */
export function claimGift(): { day: number; first: boolean; prize: Prize; light: number; piece: string | null; full: boolean } | null {
  const s = load();
  const v = giftView();
  if (!v.ready) return null;
  const t = today();
  const p = v.prizes[v.at];
  const id = v.first ? `wg:0:${v.at + 1}` : `wg:${saturday()}:${v.at}`;
  let light = p.light ?? 0;
  let piece: string | null = null;
  const full = !!p.jumuah && fullWeek();
  if (full) {
    piece = jumuahPiece();
    if (shopHas(piece)) { light += JUMUAH_OWNED_LIGHT; piece = null; } else shopAdd(piece, 0);
    shopAdd(`fz:${id}`, 0); // the big prize (owner 2026-11-24): a streak freeze, only from a full week
  }
  claimGoal(id, light);
  if (p.lamps) void import('./learnLamps').then((m) => m.giftLamps());
  if (p.boost) setBoosts(boostsLeft() + p.boost);
  if (p.freeze) shopAdd(`fz:${id}`, 0);
  if (p.room) shopAdd(`rm:${p.room}`, 0);
  if (p.piece) shopAdd(`fg:${p.piece}`, 0);
  if (p.frame) shopAdd(p.frame, 0);
  if (v.first) save({ ...s, got: v.at + 1, last: t, ...(v.at === 6 ? { wfrom: addDays(t, 1) } : {}) });
  else {
    const wk = saturday();
    save({ ...s, wk, taken: [...(s.wk === wk ? s.taken ?? [] : []), v.at], last: t });
  }
  return { day: v.at + 1, first: v.first, prize: p, light, piece, full };
}
