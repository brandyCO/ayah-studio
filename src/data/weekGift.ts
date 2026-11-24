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
import { shopAdd } from './garden';
import type { Reveal } from './reveal';

export interface Prize { light?: number; freeze?: true; room?: string; piece?: string; frame?: string; opens?: Reveal }
/** The first week: Light, a freeze, the shop, a palm for the room, a lantern to hold, more Light, the big chest. */
export const FIRST_WEEK: Prize[] = [
  { light: 50 }, { freeze: true }, { light: 100, opens: 'shop' }, { room: 'palm', opens: 'room' },
  { piece: 'hold:5', opens: 'wardrobe' }, { light: 150 }, { light: 300, frame: 'fr:2' },
];
/** Saturday → Friday, every week after the first. */
export const WEEK: Prize[] = [
  { light: 20 }, { light: 25 }, { freeze: true }, { light: 30 }, { light: 35 }, { light: 40 }, { light: 150 },
];
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
export function giftsOn(daysOpened: number): boolean {
  const s = load();
  if (s.from || s.got) return true;
  if (daysOpened > 2) save({ got: 7, last: null, from: today(), wfrom: today(), old: true });
  else save({ ...s, from: today() });
  return true;
}

export type TileState = 'got' | 'today' | 'later' | 'missed' | 'none';
export interface GiftView { first: boolean; prizes: Prize[]; states: TileState[]; ready: boolean; /** the tile to claim */ at: number }
/** The first week stays on screen through the day its seventh tile is taken, then the weekly calendar. */
const inFirst = (s: State) => s.got < 7 || s.last === today();

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
export function claimGift(): { day: number; first: boolean; prize: Prize } | null {
  const s = load();
  const v = giftView();
  if (!v.ready) return null;
  const t = today();
  const p = v.prizes[v.at];
  const id = v.first ? `wg:0:${v.at + 1}` : `wg:${saturday()}:${v.at}`;
  claimGoal(id, p.light ?? 0);
  if (p.freeze) shopAdd(`fz:${id}`, 0);
  if (p.room) shopAdd(`rm:${p.room}`, 0);
  if (p.piece) shopAdd(`fg:${p.piece}`, 0);
  if (p.frame) shopAdd(p.frame, 0);
  if (v.first) save({ ...s, got: v.at + 1, last: t, ...(v.at === 6 ? { wfrom: addDays(t, 1) } : {}) });
  else {
    const wk = saturday();
    save({ ...s, wk, taken: [...(s.wk === wk ? s.taken ?? [] : []), v.at], last: t });
  }
  return { day: v.at + 1, first: v.first, prize: p };
}
