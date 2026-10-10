// The Kids space's lantern path as data (docs/kids.md K3, docs/light.md L7): the order of the
// surahs, each stop's state (learned / next / just lit) and the wave layout, read by both the 2D
// path (src/ui/kids.ts) and the 3D one (src/ui/kidsSky.ts + src/light/scenes/kidsPath.ts), plus the
// small constellation a learned surah gains (one star per ayah). No drawing here, no three.js.
import { KIDS_SURAHS } from './kids';

export { KIDS_SURAHS };

/** The path's state: per stop (path order) learned or not, the next one to learn, the one just lit. */
export interface KidsPathState {
  surahs: number[];
  lit: boolean[];
  /** Index of the first unlearned stop, -1 when all are lit. */
  next: number;
  /** Index of the stop lit just before coming back to the path (it blooms once), -1: none. */
  bloom: number;
  /** The stop to open the path at: the one just lit, else the next, else the last. */
  focus: number;
}

export function kidsPathState(learned: Record<number, number>, bloomSurah: number): KidsPathState {
  const surahs = KIDS_SURAHS;
  const lit = surahs.map((n) => !!learned[n]);
  const next = lit.indexOf(false);
  const bloom = bloomSurah && learned[bloomSurah] ? surahs.indexOf(bloomSurah) : -1;
  return { surahs, lit, next, bloom, focus: bloom >= 0 ? bloom : next >= 0 ? next : surahs.length - 1 };
}

/** The gentle wave of the path: stop i's sideways place, −1 … 1. */
export const wave = (i: number) => Math.sin(i * 0.95);

/** 2D layout: x in % of the width, y in px from the top of the path. */
export const PATH_STEP = 112; // px between lanterns
const PATH_TOP = 64;
export const pathPoint = (i: number) => ({ x: 50 + 26 * wave(i), y: PATH_TOP + i * PATH_STEP });
export const pathHeight = (count: number) => pathPoint(count - 1).y + 80;
/** The side away from the label (the label sits on the side with more room): −1 left, 1 right. */
export const outerSide = (i: number) => (wave(i) < 0 ? -1 : 1);

/** Remembers that a lantern was just lit, so the path can bloom it once when the child returns. */
export function bloomNext(s: number) {
  try {
    sessionStorage.setItem('kidsBloom', String(s));
  } catch {
    /* ignore */
  }
}
export function takeBloom(): number {
  try {
    const v = Number(sessionStorage.getItem('kidsBloom'));
    sessionStorage.removeItem('kidsBloom');
    return v;
  } catch {
    return 0;
  }
}

/**
 * A learned surah's constellation: one star per ayah, ayah 1 in the middle and the rest spread
 * outwards (a sunflower pattern, loosened), about one unit apart; each star joins the nearest star
 * before it, so the lines grow outwards in ayah order like a constellation's. Same surah → same shape
 * (seeded by the surah number). Units: 1 ≈ the distance between two neighbouring stars.
 */
export function constellation(surah: number, ayahs: number): { stars: { x: number; y: number }[]; links: [number, number][] } {
  let s = (surah * 2654435761) >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const turn = r() * Math.PI * 2;
  const stars: { x: number; y: number }[] = [];
  const links: [number, number][] = [];
  for (let k = 0; k < ayahs; k++) {
    const rad = 0.85 * Math.sqrt(k + 0.3), a = k * 2.39996 + turn;
    const p = { x: rad * Math.cos(a) + (r() - 0.5) * 0.5, y: rad * Math.sin(a) + (r() - 0.5) * 0.5 };
    let best = -1, bd = Infinity;
    for (let j = 0; j < k; j++) {
      const d = (stars[j].x - p.x) ** 2 + (stars[j].y - p.y) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) links.push([best, k]);
    stars.push(p);
  }
  return { stars, links };
}
