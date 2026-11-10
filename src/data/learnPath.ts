// The Learn path (owner decision 2026-11-10): one path through the surahs, each surah a unit
// ("Surah 67 · Al-Mulk"), long surahs in parts. A unit's steps are its chunks (the learner's chunk
// size: 1, 2 or 3 ayat, half a page or a page), each a lesson (src/ui/lesson.ts: listen, practise,
// from memory, link to what came before), then the whole surah recited from memory: the surah's tree is
// full grown. Thirsty trees come back as review steps at the top of the path. Progress lives on the
// surah's tree (src/data/garden.ts); this module only keeps where the path starts and builds the steps.
import { ayahPlaces, nextChunk, thirstyTrees, tree, type ChunkSize, CHUNK_SIZES } from './garden';
import type { Mushaf } from './mushaf';
import type { SurahMeta } from './quran';

export type Start = { kind: 'amma' } | { kind: 'surah'; s: number } | { kind: 'juz'; j: number };
interface Saved { start: Start; chunk: ChunkSize; at: number }

const KEY = 'learnPath';
/** Most steps in one part of a long surah (parts share the steps evenly). */
export const PART_STEPS = 9;

function read(): Saved | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (!o || typeof o !== 'object' || !o.start) return null;
    const st = o.start;
    const ok = st.kind === 'amma' || (st.kind === 'surah' && st.s >= 1 && st.s <= 114) || (st.kind === 'juz' && st.j >= 1 && st.j <= 30);
    if (!ok) return null;
    return { start: st, chunk: CHUNK_SIZES.includes(o.chunk) ? o.chunk : 1, at: Number(o.at) || 0 };
  } catch { return null; }
}
export const pathSet = () => read() !== null;
export const pathStart = (): Start => read()?.start ?? { kind: 'amma' };
export const pathChunk = (): ChunkSize => read()?.chunk ?? 1;
export function setPath(start: Start, chunk: ChunkSize) {
  try { localStorage.setItem(KEY, JSON.stringify({ start, chunk, at: Date.now() })); } catch { /* full or private */ }
}

/** The surahs in path order. Juz 'Amma: Al-Fatiha, then An-Nas back to An-Naba, then on backwards
 *  (the way children and many adults memorise). A chosen surah or juz: from there forwards to An-Nas,
 *  then the surahs before it, nearest first. */
export function pathOrder(start: Start, juzOf: number[]): number[] {
  const all = Array.from({ length: 114 }, (_, i) => i + 1);
  if (start.kind === 'amma') return [1, ...all.slice(1).reverse()];
  const s = start.kind === 'surah' ? start.s : (all.find((x) => juzOf[x - 1] === start.j) ?? all.find((x) => juzOf[x - 1] >= start.j) ?? 114);
  return [...all.slice(s - 1), ...all.slice(0, s - 1).reverse()];
}

export type StepKind = 'new' | 'whole';
export interface PathStep {
  kind: StepKind;
  s: number;
  /** Ayat [from, to] (the whole surah for 'whole'). */
  range: [number, number];
  state: 'done' | 'current' | 'locked';
}
export interface PathUnit {
  s: number;
  /** Part k of `of` (long surahs); 1 of 1 otherwise. */
  part: number;
  of: number;
  steps: PathStep[];
  /** The last part holds the tree at its end. */
  last: boolean;
}

/** A surah's chunks with its tree's chunk size (the path's for a surah not started). */
export function chunksOf(m: SurahMeta, mushaf: Mushaf): [number, number][] {
  const size = tree(m.n)?.chunk ?? pathChunk();
  const places = typeof size === 'number' ? [] : ayahPlaces(mushaf, m.n);
  const out: [number, number][] = [];
  let at = 0;
  for (;;) {
    const c = nextChunk(at, m.ayahs, size, places);
    if (!c) break;
    out.push(c);
    at = c[1];
  }
  return out;
}

/** The units of one surah: its chunk steps in parts of PART_STEPS, then the whole-surah step. */
export function unitsOf(m: SurahMeta, mushaf: Mushaf, open: boolean): PathUnit[] {
  const tr = tree(m.n);
  const learned = tr?.learned ?? 0;
  const full = !!tr?.full;
  const steps: PathStep[] = chunksOf(m, mushaf).map((range) => ({ kind: 'new' as const, s: m.n, range, state: 'locked' as const }));
  steps.push({ kind: 'whole', s: m.n, range: [1, m.ayahs], state: 'locked' });
  let current = !open;
  for (const st of steps) {
    const done = full || (st.kind === 'new' && st.range[1] <= learned);
    if (done) st.state = 'done';
    else if (!current) { st.state = 'current'; current = true; }
  }
  const of = Math.max(1, Math.ceil(steps.length / PART_STEPS));
  const per = Math.ceil(steps.length / of);
  const units: PathUnit[] = [];
  for (let k = 0; k < of; k++) units.push({ s: m.n, part: k + 1, of, steps: steps.slice(k * per, (k + 1) * per), last: k === of - 1 });
  return units;
}

/** Surahs in path order with where the path stands: index of the first surah not full grown. */
export function pathPosition(order: number[]): number {
  const i = order.findIndex((s) => !tree(s)?.full);
  return i < 0 ? order.length : i;
}

/** Review steps: thirsty trees, the longest waiting first (at most 3 on the path at once). */
export const reviewSteps = () => thirstyTrees().slice(0, 3);

// --- "Already know some?": a quick tasmi' of each picked surah, one after another ---
const QKEY = 'learnQuick';
export function startQuick(list: number[]) { try { sessionStorage.setItem(QKEY, JSON.stringify(list)); } catch { /* ignore */ } }
/** The surah after `s` in the quick tasmi' list (and drops `s`), or 0 at the end. */
export function nextQuick(s: number): number {
  try {
    const list = (JSON.parse(sessionStorage.getItem(QKEY) ?? '[]') as number[]).filter((x) => x !== s);
    sessionStorage.setItem(QKEY, JSON.stringify(list));
    return list[0] ?? 0;
  } catch { return 0; }
}

/** After a lesson: the tree that grew plays its growing moment once on the path. */
export function noteGrowth(s: number, from: number) { try { sessionStorage.setItem('gardenGrow', `${s}:${from}`); } catch { /* ignore */ } }
export function takeGrowth(): { s: number; from: number } | null {
  try {
    const [s, from] = (sessionStorage.getItem('gardenGrow') ?? '').split(':').map(Number);
    sessionStorage.removeItem('gardenGrow');
    return s >= 1 && s <= 114 ? { s, from } : null;
  } catch { return null; }
}
