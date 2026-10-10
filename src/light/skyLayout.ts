// Where things sit in the Home sky (docs/light.md L6), shared by the 3D scene and its flat 2D version
// (so this module has no three.js). Directions are (off, el): `off` = azimuth in radians from straight
// ahead (positive = right), `el` = elevation above the horizon. Each juz is a thread of 20-odd stars
// climbing the sky, juz 1 on the right and later juz to the left (as a mushaf's pages run); a juz's
// first page is low, its last high. Khatm circles hang above as small rings.
import { rng } from './noise';

export const JUZ_STEP = 0.16; // radians between juz threads (≈ 9°)
export const LOOK_MAX = 15 * JUZ_STEP; // how far the view turns either way
export const CIRCLE_EL = 0.65;
export const CIRCLE_R = 0.058;

export interface Spot { off: number; el: number }

export const juzOff = (j: number) => (15.5 - j) * JUZ_STEP;

/** One spot per page (index 1…604), from the juz of each page. */
export function pageSpots(juzOfPage: number[], seed = 5): Spot[] {
  const r = rng(seed);
  const byJuz = new Map<number, number[]>();
  for (let p = 1; p < juzOfPage.length; p++) byJuz.set(juzOfPage[p], [...(byJuz.get(juzOfPage[p]) ?? []), p]);
  const out: Spot[] = [{ off: 0, el: 0 }];
  for (const [j, pages] of byJuz) {
    const n = pages.length;
    pages.forEach((p, k) => {
      out[p] = {
        off: juzOff(j) + Math.sin(k * 0.9 + j * 2.1) * 0.035 + (r() - 0.5) * 0.03,
        el: 0.1 + (k / Math.max(1, n - 1)) * 0.4 + (r() - 0.5) * 0.035,
      };
    });
  }
  return out;
}

/** The centre of circle i of n, spread around the direction the view opens at. */
export const circleSpot = (i: number, n: number, around: number): Spot => ({
  off: Math.min(LOOK_MAX, Math.max(-LOOK_MAX, around + (i - (n - 1) / 2) * 0.3)),
  el: CIRCLE_EL + (i % 2 ? -0.03 : 0.02),
});

/** Juz j's star on a circle ring (juz 1 at the top, clockwise), as an offset from the ring centre. */
export function ringOffset(j: number): { dx: number; dy: number } {
  const a = ((j - 0.5) / 30) * Math.PI * 2 - Math.PI / 2;
  return { dx: CIRCLE_R * Math.cos(a), dy: -CIRCLE_R * Math.sin(a) };
}

/** Brightness 0.5…1 (how recently this month) and size factor 1…1.6 (how many days). */
export function starLook(days: number, last: number, today: number): { bright: number; size: number; warm: number } {
  const ago = Math.max(0, today - last);
  return {
    bright: 0.5 + 0.5 * Math.max(0, 1 - ago / 30),
    size: 1 + Math.min(days - 1, 5) * 0.12,
    warm: Math.min(1, (days - 1) / 3),
  };
}
