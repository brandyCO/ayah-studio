// Can this device show the 3D light scenes? Checked without loading three.js, so any screen can ask.
// Flat 2D fallback for: reduced motion, battery saver (low and not charging), no WebGL, or a device
// that already proved too slow (the fps watchdog in engine.ts saves the step it ended on).

export type Quality = 'high' | 'medium' | 'low' | 'flat';
export const QUALITIES: Quality[] = ['high', 'medium', 'low', 'flat'];

const KEY = 'lightQuality';

/** The step the last scene ended on (default: medium; a fast device steps up on its own). */
export function savedQuality(): Quality {
  try {
    const q = localStorage.getItem(KEY) as Quality | null;
    if (q && QUALITIES.includes(q)) return q;
  } catch { /* storage blocked */ }
  return 'medium';
}

export function saveQuality(q: Quality | null) {
  try {
    if (q) localStorage.setItem(KEY, q);
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let gl: boolean | null = null;
export function hasWebGL(): boolean {
  if (gl === null) {
    try {
      const c = document.createElement('canvas');
      const x = c.getContext('webgl2') ?? c.getContext('webgl');
      gl = !!x;
      (x as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      gl = false;
    }
  }
  return gl;
}

interface BatteryLike { level: number; charging: boolean }

/** Battery saver: below 20 % and not charging (where the browser tells). */
async function lowBattery(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return false;
    const b = await nav.getBattery();
    return !b.charging && b.level < 0.2;
  } catch {
    return false;
  }
}

/** 3D at the saved step, or the flat 2D version. */
export async function lightQuality(): Promise<Quality> {
  if (reducedMotion() || !hasWebGL() || (await lowBattery())) return 'flat';
  return savedQuality();
}
