// Learn tab: the juz gardens (owner request 2026-11-02). One garden per juz, a grid seen at an angle.
// Each surah is a tree the learner plants from the seed store (the first seed of every surah is
// free) and grows by memorising it chunk by chunk:
//   New   the next chunk (1, 2 or 3 ayat, half a page or a page: the learner's choice)
//   Link  everything learned so far, from ayah 1, recited from memory
//   Whole the whole surah from memory in one go: only then is the tree full grown
// A full tree gets thirsty after 1, 3, 7, 14 and 30 days, then every 30 days, and is watered by
// reciting the surah again. A tree still growing gets thirsty after 3 days without a lesson.
// Light (src/data/journey.ts) earned here buys rarer varieties of a surah's tree and decorations;
// the wallet is all the Light earned minus what was spent here and in the Ranks shop, never below 0.
//
// Kept on this device (localStorage `garden`) and, when signed in, synced as one document merged per
// tree / decoration / purchase (the newest change wins; purchases are never undone).
import { stats } from './journey';
import type { Mushaf } from './mushaf';

export type ChunkSize = 1 | 2 | 3 | 'half' | 'page';
export const CHUNK_SIZES: ChunkSize[] = [1, 2, 3, 'half', 'page'];

export interface Tree {
  /** Surah. */
  s: number;
  /** Grid cell in its juz garden; -1 when kept in the store (not planted). */
  x: number;
  y: number;
  /** Variety: 0 = the free seed, 1–3 bought. */
  v: number;
  chunk: ChunkSize;
  /** Ayat memorised from ayah 1 (always a run from the start). */
  learned: number;
  /** Ayat recited together from ayah 1 (the Link step). */
  linked: number;
  /** When the whole surah was first recited from memory (ms). */
  full?: number;
  /** Review step: index into WATER_DAYS (a full tree). */
  step: number;
  /** Last watered, or last lesson (ms). */
  water: number;
  planted: number;
  /** Last change (ms), for merging devices. */
  at: number;
}

export interface Deco { id: string; k: DecoKind; juz: number; x: number; y: number; at: number; gone?: 1 }

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'prize';
export type DecoKind = 'lamp' | 'flowers' | 'stones' | 'bench' | 'pond' | 'fountain' | 'arch' | 'pavilion' | 'moongate' | 'starwell'
  | 'goldfountain' | 'winnerarch' | 'silvergate' | 'silverlamps' | 'bronzebench' | 'bronzelantern';
export const DECOS: { k: DecoKind; rarity: Rarity; price: number; place?: 1 | 2 | 3 }[] = [
  { k: 'flowers', rarity: 'common', price: 30 },
  { k: 'stones', rarity: 'common', price: 30 },
  { k: 'lamp', rarity: 'common', price: 30 },
  { k: 'bench', rarity: 'common', price: 30 },
  { k: 'pond', rarity: 'rare', price: 120 },
  { k: 'fountain', rarity: 'rare', price: 120 },
  { k: 'arch', rarity: 'epic', price: 300 },
  { k: 'pavilion', rarity: 'epic', price: 300 },
  { k: 'moongate', rarity: 'legendary', price: 800 },
  { k: 'starwell', rarity: 'legendary', price: 800 },
  // Ranks prizes (owner decision 2026-11-09): won only by finishing a week #1, #2 or #3, never sold.
  { k: 'goldfountain', rarity: 'prize', price: 0, place: 1 },
  { k: 'winnerarch', rarity: 'prize', price: 0, place: 1 },
  { k: 'silvergate', rarity: 'prize', price: 0, place: 2 },
  { k: 'silverlamps', rarity: 'prize', price: 0, place: 2 },
  { k: 'bronzebench', rarity: 'prize', price: 0, place: 3 },
  { k: 'bronzelantern', rarity: 'prize', price: 0, place: 3 },
];
/** Tree varieties: 0 free; the others bought per surah. */
export const VARIETIES: { v: number; rarity: Rarity; price: number }[] = [
  { v: 0, rarity: 'common', price: 0 },
  { v: 1, rarity: 'common', price: 40 },
  { v: 2, rarity: 'rare', price: 80 },
  { v: 3, rarity: 'legendary', price: 120 },
];

/** Light for each step (the Me tab's Light; each id is claimed once). */
export const LIGHT = { new: 5, link: 5, whole: 30, water: 10 } as const;
/** Days a full tree stays watered, by review step; after the last, every 30 days. */
export const WATER_DAYS = [1, 3, 7, 14, 30];
/** Days a growing tree stays watered without a lesson. */
export const GROWING_DAYS = 3;
const DAY = 86_400_000;

interface State {
  trees: Record<string, Tree>;
  decos: Record<string, Deco>;
  /** Purchases: id → Light paid ('v:{s}:{v}' a variety, 'd:{id}' a decoration). */
  owned: Record<string, number>;
  /** The garden last looked at. */
  juz?: number;
}

const KEY = 'garden';
let cache: State | null = null;

function blank(): State { return { trees: {}, decos: {}, owned: {} }; }
const isChunk = (c: unknown): c is ChunkSize => CHUNK_SIZES.includes(c as ChunkSize);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function cleanTree(s: number, r: unknown): Tree | null {
  if (!r || typeof r !== 'object' || s < 1 || s > 114) return null;
  const o = r as Record<string, unknown>;
  return {
    s, x: Math.round(num(o.x, -1)), y: Math.round(num(o.y, -1)), v: Math.min(3, Math.max(0, Math.round(num(o.v)))),
    chunk: isChunk(o.chunk) ? o.chunk : 1,
    learned: Math.max(0, Math.round(num(o.learned))), linked: Math.max(0, Math.round(num(o.linked))),
    full: num(o.full) > 0 ? num(o.full) : undefined,
    step: Math.min(WATER_DAYS.length, Math.max(0, Math.round(num(o.step)))),
    water: num(o.water), planted: num(o.planted), at: num(o.at),
  };
}
function cleanDeco(id: string, r: unknown): Deco | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (!DECOS.some((d) => d.k === o.k)) return null;
  return { id, k: o.k as DecoKind, juz: Math.round(num(o.juz, 30)), x: Math.round(num(o.x, -1)), y: Math.round(num(o.y, -1)), at: num(o.at), ...(o.gone ? { gone: 1 as const } : {}) };
}
function clean(raw: unknown): State {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries((o.trees as object) ?? {})) { const t = cleanTree(Number(k), v); if (t) s.trees[k] = t; }
  for (const [k, v] of Object.entries((o.decos as object) ?? {})) { const d = cleanDeco(k, v); if (d) s.decos[k] = d; }
  for (const [k, v] of Object.entries((o.owned as object) ?? {})) if (typeof v === 'number' && v >= 0 && /^(v:\d+:\d|d:[\w-]+|s:[\w:.-]+)$/.test(k)) s.owned[k] = v;
  if (typeof o.juz === 'number' && o.juz >= 1 && o.juz <= 30) s.juz = o.juz;
  return s;
}

function load(): State {
  if (cache) return cache;
  try { cache = clean(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { cache = blank(); }
  return cache;
}
function save(quiet = false) {
  try { localStorage.setItem(KEY, JSON.stringify(load())); } catch { /* full or private */ }
  if (!quiet) window.dispatchEvent(new Event('garden-changed'));
}

// --- reading ---
export const trees = (): Readonly<Tree>[] => Object.values(load().trees);
export const tree = (s: number): Readonly<Tree> | null => load().trees[s] ?? null;
export const decos = (juz: number): Readonly<Deco>[] => Object.values(load().decos).filter((d) => d.juz === juz && !d.gone);
/** Decorations bought and not yet placed in any garden. */
/** Ranks prize pieces kept (one a week won): the week and the place, newest first. */
export const prizeWins = (): { week: string; place: 1 | 2 | 3 }[] => Object.values(load().decos)
  .map((d) => ({ m: /^prize-(.+)-[a-z]+$/.exec(d.id), place: DECOS.find((x) => x.k === d.k)?.place }))
  .filter((x): x is { m: RegExpExecArray; place: 1 | 2 | 3 } => !!x.m && !!x.place)
  .map((x) => ({ week: x.m[1], place: x.place })).sort((a, b) => (a.week < b.week ? 1 : -1));
export const unplacedDecos = (): Readonly<Deco>[] => Object.values(load().decos).filter((d) => !d.gone && d.x < 0);
export const ownsVariety = (s: number, v: number) => v === 0 || load().owned[`v:${s}:${v}`] !== undefined;
export const spent = () => Object.values(load().owned).reduce((a, b) => a + b, 0);
/** Light to spend: everything earned (all devices) minus what was spent here and in the Ranks shop. */
export const wallet = () => Math.max(0, stats('all').light - spent());
// The Ranks shop (src/data/shop.ts) keeps its purchases here too (`s:…` ids), so they sync and merge
// like the garden's: a purchase counts once, freezes kept and used are ids that only ever get added.
export const shopHas = (id: string) => load().owned[`s:${id}`] !== undefined;
export const shopIds = (prefix: string) => Object.keys(load().owned).filter((k) => k.startsWith(`s:${prefix}`)).map((k) => k.slice(2));
/** Records a purchase or a won thing (price 0); false when already there. */
export function shopAdd(id: string, price: number): boolean {
  if (shopHas(id)) return false;
  load().owned[`s:${id}`] = Math.max(0, Math.round(price));
  save();
  return true;
}
export const lastJuz = () => load().juz ?? 30;
export function setLastJuz(j: number) { load().juz = j; save(true); }

export type Stage = 0 | 1 | 2 | 3 | 4;
/** Seed → sapling → small → medium → full grown (only after the whole surah from memory). */
export function stageOf(t: Readonly<Tree>, ayahs: number): Stage {
  if (t.full) return 4;
  if (t.learned <= 0) return 0;
  const p = t.learned / ayahs;
  return p < 1 / 3 ? 1 : p < 2 / 3 ? 2 : 3;
}

/** When the tree gets thirsty (ms), or null for a seed nobody has started. */
export function dueAt(t: Readonly<Tree>): number | null {
  if (t.full) return t.water + (WATER_DAYS[t.step] ?? 30) * DAY;
  if (t.learned > 0) return t.water + GROWING_DAYS * DAY;
  return null;
}
export const thirsty = (t: Readonly<Tree>, now = Date.now()) => { const d = dueAt(t); return d !== null && now >= d; };
/** Thirsty trees, the longest waiting first. */
export const thirstyTrees = (now = Date.now()) => trees().filter((t) => started(t) && thirsty(t, now)).sort((a, b) => dueAt(a)! - dueAt(b)!);

/** A surah whose learning has begun (the path makes its tree at the first lesson). */
export const started = (t: Readonly<Tree>) => t.learned > 0 || !!t.full;

// --- writing ---
/** The surah's tree, made (not placed anywhere) when its first lesson opens. */
export function ensureTree(s: number, chunk: ChunkSize): Readonly<Tree> {
  const st = load();
  if (st.trees[s]) return st.trees[s];
  const now = Date.now();
  st.trees[s] = { s, x: -1, y: -1, v: 0, chunk, learned: 0, linked: 0, step: 0, water: now, planted: now, at: now };
  save();
  return st.trees[s];
}
function touch(t: Tree) { t.at = Date.now(); }

/** Plants (or moves) a surah's tree at a free cell of its garden. */
export function plant(s: number, x: number, y: number) {
  const st = load();
  const now = Date.now();
  const t = st.trees[s] ?? { s, x: -1, y: -1, v: 0, chunk: 1, learned: 0, linked: 0, step: 0, water: now, planted: now, at: now };
  t.x = x; t.y = y;
  touch(t);
  st.trees[s] = t;
  save();
}
/** Back to the store: the progress stays with the surah. */
export function unplant(s: number) {
  const t = load().trees[s];
  if (!t) return;
  t.x = -1; t.y = -1;
  touch(t);
  save();
}
export function setChunk(s: number, c: ChunkSize) {
  const t = load().trees[s];
  if (!t || t.chunk === c) return;
  t.chunk = c;
  touch(t);
  save();
}
export function setVariety(s: number, v: number) {
  const t = load().trees[s];
  if (!t || !ownsVariety(s, v)) return;
  t.v = v;
  touch(t);
  save();
}

/** Buys a variety (true when paid or owned already). */
export function buyVariety(s: number, v: number): boolean {
  const def = VARIETIES.find((x) => x.v === v);
  if (!def || ownsVariety(s, v)) return !!def;
  if (wallet() < def.price) return false;
  load().owned[`v:${s}:${v}`] = def.price;
  const t = load().trees[s];
  if (t) { t.v = v; touch(t); }
  save();
  return true;
}
/** Buys a decoration; it waits unplaced until dragged into a garden. */
export function buyDeco(k: DecoKind): Deco | null {
  const def = DECOS.find((d) => d.k === k);
  if (!def || def.place || wallet() < def.price) return null;
  const id = `${k}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const st = load();
  st.owned[`d:${id}`] = def.price;
  const d: Deco = { id, k, juz: 0, x: -1, y: -1, at: Date.now() };
  st.decos[id] = d;
  save();
  return d;
}
/** Gives a Ranks prize decoration for finishing week `week` at `place` (1–3), once per week on every device:
 *  the place's prize not owned yet (else its first). It waits unplaced, like a bought one. */
export function grantPrizeDeco(week: string, place: number): Deco | null {
  const kinds = DECOS.filter((d) => d.place === place).map((d) => d.k);
  if (!kinds.length || !/^[\w.-]+$/.test(week)) return null;
  const st = load();
  const key = `s:prize:${week}`;
  if (st.owned[key] !== undefined) return null;
  const have = new Set(Object.values(st.decos).map((d) => d.k));
  const k = kinds.find((x) => !have.has(x)) ?? kinds[0];
  const id = `prize-${week}-${k}`;
  st.owned[key] = 0;
  const d: Deco = { id, k, juz: 0, x: -1, y: -1, at: Date.now() };
  st.decos[id] = d;
  save();
  return d;
}
export function placeDeco(id: string, juz: number, x: number, y: number) {
  const d = load().decos[id];
  if (!d) return;
  Object.assign(d, { juz, x, y, at: Date.now() });
  save();
}
/** Takes a decoration out of the garden (kept, to place again). */
export function storeDeco(id: string) {
  const d = load().decos[id];
  if (!d) return;
  Object.assign(d, { x: -1, y: -1, at: Date.now() });
  save();
}

/** A New chunk recited from memory: ayat 1..to are learned. */
export function learnTo(s: number, to: number) {
  const t = load().trees[s];
  if (!t || to <= t.learned) return;
  t.learned = to;
  t.water = Date.now();
  touch(t);
  save();
}
/** Everything learned so far recited together from ayah 1. */
export function linkTo(s: number, to: number) {
  const t = load().trees[s];
  if (!t) return;
  t.linked = Math.max(t.linked, Math.min(to, t.learned));
  t.water = Date.now();
  touch(t);
  save();
}
/** The whole surah from memory: the tree is full grown (or, already full, watered: when it was thirsty
 *  the next watering moves further away after a smooth recitation and closer after a few slips). */
export function reciteWhole(s: number, ayahs: number, smooth: boolean) {
  const t = load().trees[s];
  if (!t) return;
  const now = Date.now();
  const due = thirsty(t, now);
  t.learned = t.linked = ayahs;
  if (!t.full) { t.full = now; t.step = 0; }
  else if (due) t.step = smooth ? Math.min(WATER_DAYS.length, t.step + 1) : Math.max(0, t.step - 1);
  t.water = now;
  touch(t);
  save();
}

// --- the surah's chunks ---
/** Each ayah's page and half page (lines 1–8 or 9–15) in the Madinah mushaf. */
export function ayahPlaces(m: Mushaf, s: number): { page: number; half: number }[] {
  const out: { page: number; half: number }[] = [];
  for (let p = m.surahStartPage(s); p <= m.pages.length; p++) {
    const lines = m.pages[p - 1].lines;
    let past = false;
    lines.forEach((line, li) => {
      if (line[0] === 'h' || line[0] === 'b') return;
      for (const [su, a] of line as [number, number, string][]) {
        if (su > s) past = true;
        if (su === s && !out[a - 1]) out[a - 1] = { page: p, half: li < 8 ? 0 : 1 };
      }
    });
    if (past) break;
  }
  return out;
}

/** The next chunk to learn after `learned` ayat: [from, to], or null when every ayah is learned. */
export function nextChunk(learned: number, ayahs: number, size: ChunkSize, places: { page: number; half: number }[]): [number, number] | null {
  if (learned >= ayahs) return null;
  const from = learned + 1;
  if (typeof size === 'number') return [from, Math.min(ayahs, learned + size)];
  const key = (a: number) => (size === 'page' ? `${places[a - 1]?.page}` : `${places[a - 1]?.page}.${places[a - 1]?.half}`);
  let to = from;
  while (to < ayahs && key(to + 1) === key(from)) to++;
  return [from, to];
}

// --- which juz each surah starts in ---
let juzMemo: number[] | null = null;
/** Juz of each surah (index s − 1): the juz of the page holding ayah 1. */
export async function surahJuz(): Promise<number[]> {
  if (juzMemo) return juzMemo;
  const { loadMushaf } = await import('./mushaf');
  const m = await loadMushaf();
  juzMemo = Array.from({ length: 114 }, (_, i) => m.pages[m.pageOf(i + 1, 1) - 1].juz);
  return juzMemo;
}
/** Side of a juz garden's square grid. */
export const gridSize = (surahs: number) => Math.min(8, Math.max(5, Math.ceil(Math.sqrt(surahs * 1.75))));

// --- sync (src/cloud/sync.ts) ---
export function gardenRecord(): State | null {
  const s = load();
  return Object.keys(s.trees).length || Object.keys(s.owned).length ? { trees: s.trees, decos: s.decos, owned: s.owned } : null;
}
/** Merges another device's garden: per tree and decoration the newest change wins; purchases add up. */
export function mergeGarden(remote: unknown): boolean {
  const r = clean(remote);
  const st = load();
  let changed = false;
  for (const [k, t] of Object.entries(r.trees)) {
    const mine = st.trees[k];
    if (!mine || t.at > mine.at) {
      // Progress never goes back because of an older device: keep the larger learned counts.
      st.trees[k] = mine ? { ...t, learned: Math.max(t.learned, mine.learned), linked: Math.max(t.linked, mine.linked), full: t.full ?? mine.full } : t;
      changed = true;
    }
  }
  for (const [k, d] of Object.entries(r.decos)) if (!st.decos[k] || d.at > st.decos[k].at) { st.decos[k] = d; changed = true; }
  for (const [k, v] of Object.entries(r.owned)) if (st.owned[k] === undefined) { st.owned[k] = v; changed = true; }
  if (changed) save();
  return changed;
}
export const _resetGarden = () => { cache = null; };
