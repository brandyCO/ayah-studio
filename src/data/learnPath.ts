// The Learn path (owner decision 2026-11-10): one path through the surahs, each surah a unit
// ("Surah 67 · Al-Mulk"), long surahs in parts. A unit's steps are its chunks (the learner's chunk
// size: 1, 2 or 3 ayat, half a page or a page), each a lesson (src/ui/lesson.ts: listen, practise,
// from memory, link to what came before), then the whole surah recited from memory: the surah's tree is
// full grown. Thirsty trees come back as review steps at the top of the path. Progress lives on the
// surah's tree (src/data/garden.ts); this module only keeps where the path starts and builds the steps.
import { ayahPlaces, nextChunk, thirstyTrees, tree, type ChunkSize, CHUNK_SIZES } from './garden';
import { allDays } from './journey';
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

/** new: a chunk lesson · whole: tasmi' of the surah · page: page memory of a page finished here ·
 *  similar: the ayat learned since the last one that resemble others · chest: Light for the steps before it. */
export type StepKind = 'new' | 'whole' | 'page' | 'similar' | 'chest';
export interface PathStep {
  kind: StepKind;
  s: number;
  /** Ayat [from, to] (the whole surah for 'whole'; the ayat it covers for 'similar'; the chunk before a chest). */
  range: [number, number];
  state: 'done' | 'current' | 'locked';
  /** Mushaf page ('page'). */
  p?: number;
}
/** Light in a path chest. */
export const PATH_CHEST = 15;
/** A chest after every this many lessons of a surah. */
export const CHEST_EVERY = 4;
/** Light for passing a juz checkpoint. */
export const GATE_LIGHT = 50;
export const chestId = (s: number, a: number) => `lc:${s}:${a}`;

/** Claimed on any day (journey `cl`, synced). */
export function claimedEver(id: string): boolean {
  for (const d of Object.values(allDays())) if (d.cl?.includes(id)) return true;
  return false;
}

// Pages recited whole on the page memory screen (the path's page steps), and similar-ayat steps seen.
const PKEY = 'learnPageTasmi', SKEY = 'learnSimilar';
const readSet = (k: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(k) ?? '[]') as string[]); } catch { return new Set(); } };
const addTo = (k: string, v: string) => {
  const set = readSet(k); set.add(v);
  try { localStorage.setItem(k, JSON.stringify([...set])); } catch { /* full */ }
  window.dispatchEvent(new Event('garden-changed'));
};
export const pageRecited = (p: number) => readSet(PKEY).has(String(p));
export const markPageRecited = (p: number) => addTo(PKEY, String(p));
export const similarSeen = (s: number, a: number, b: number) => readSet(SKEY).has(`${s}:${a}-${b}`);
export const markSimilarSeen = (s: number, a: number, b: number) => addTo(SKEY, `${s}:${a}-${b}`);

let simKeys: Promise<Set<string>> | null = null;
/** "s:a" of every ayah that has similar ayat elsewhere (public/data/similar.json). */
export function loadSimilarKeys(): Promise<Set<string>> {
  simKeys ??= fetch(`${import.meta.env.BASE_URL}data/similar.json`).then((r) => (r.ok ? r.json() : {})).then((d: object) => new Set(Object.keys(d))).catch(() => { simKeys = null; return new Set<string>(); });
  return simKeys;
}

/** The surahs with text on a mushaf page. */
export function pageSurahs(mushaf: Mushaf, p: number): number[] {
  const out = new Set<number>();
  for (const line of mushaf.pages[p - 1]?.lines ?? []) {
    if (line[0] === 'h' || line[0] === 'b') continue;
    for (const [su] of line as [number, number, string][]) out.add(su);
  }
  return [...out];
}
const placesMemo = new Map<number, { page: number; half: number }[]>();
const placesOf = (mushaf: Mushaf, s: number) => { let v = placesMemo.get(s); if (!v) { v = ayahPlaces(mushaf, s); placesMemo.set(s, v); } return v; };

/** What the path needs to place page steps (the surah on a page coming last in path order holds its step)
 *  and similar-ayat steps. */
export interface PathCtx { rank: Map<number, number>; similar: Set<string> }
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
  const places = typeof size === 'number' ? [] : placesOf(mushaf, m.n);
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

/** The units of one surah: its chunk steps (with page, similar-ayat and chest steps between them) in parts
 *  of PART_STEPS, then the whole-surah step. */
export function unitsOf(m: SurahMeta, mushaf: Mushaf, open: boolean, ctx?: PathCtx): PathUnit[] {
  const tr = tree(m.n);
  const learned = tr?.learned ?? 0;
  const full = !!tr?.full;
  const s = m.n;
  const places = ctx ? placesOf(mushaf, s) : [];
  const steps: PathStep[] = [];
  const tail: PathStep[] = []; // after the whole-surah step
  let lessons = 0, simFrom = 1;
  const chunks = chunksOf(m, mushaf);
  /** Pages whose last ayah of this surah falls in a..b and whose step this surah holds. */
  const pagesEnding = (a: number, b: number) => {
    const out: number[] = [];
    for (let x = a; x <= b; x++) {
      const p = places[x - 1]?.page;
      if (!p || (x < m.ayahs && places[x]?.page === p)) continue;
      const last = Math.max(...pageSurahs(mushaf, p).map((su) => ctx!.rank.get(su) ?? -1));
      if (ctx!.rank.get(s) === last) out.push(p);
    }
    return out;
  };
  for (const range of chunks) {
    steps.push({ kind: 'new', s, range, state: 'locked' });
    lessons++;
    if (!ctx) continue;
    const pages = pagesEnding(range[0], range[1]);
    const end = range[1] === m.ayahs;
    if (pages.length || end) {
      let any = false;
      for (let x = simFrom; x <= range[1] && !any; x++) any = ctx.similar.has(`${s}:${x}`);
      if (any) steps.push({ kind: 'similar', s, range: [simFrom, range[1]], state: 'locked' });
      simFrom = range[1] + 1;
    }
    for (const p of pages) (end ? tail : steps).push({ kind: 'page', s, range: [range[0], range[1]], p, state: 'locked' });
    if (lessons % CHEST_EVERY === 0 && !end) steps.push({ kind: 'chest', s, range, state: 'locked' });
  }
  steps.push({ kind: 'whole', s, range: [1, m.ayahs], state: 'locked' });
  const tailAt = steps.length;
  steps.push(...tail);
  let current = !open;
  for (const [k, st] of steps.entries()) {
    // A grown surah counts everything before its tasmi' as done; only the page steps after it stay open.
    const done = (full && k < tailAt) || (st.kind === 'new' ? st.range[1] <= learned
      : st.kind === 'whole' ? full
        : st.kind === 'page' ? pageRecited(st.p!)
          : st.kind === 'similar' ? similarSeen(s, st.range[0], st.range[1])
            : claimedEver(chestId(s, st.range[1])));
    if (done) st.state = 'done';
    else if (!current) { st.state = 'current'; current = true; }
  }
  // Parts share the lessons evenly; the extra steps stay with the lesson before them.
  const of = Math.max(1, Math.ceil(lessons / PART_STEPS));
  const per = Math.ceil(lessons / of);
  const units: PathUnit[] = Array.from({ length: of }, (_, k) => ({ s, part: k + 1, of, steps: [], last: k === of - 1 }));
  let seen = 0;
  for (const st of steps) {
    if (st.kind === 'new') seen++;
    units[Math.min(of - 1, Math.floor((Math.max(1, seen) - 1) / per))].steps.push(st);
  }
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
