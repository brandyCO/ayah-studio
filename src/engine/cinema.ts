// Cinematic touches (owner request 2026-10-13): light only, never motion on the Arabic (rule 7), and
// all of it a pure function of t and the reel's own audio, so preview = export.
//  - breath: the Arabic's soft halo swells with the reciter's loudness (an envelope of the audio)
//  - open / close: the background rises out of black and settles back into it; the text and the
//    reference stay as they are (rule 2)
//  - drift: the background moves slowly closer over the whole reel
//  - depth: the background softens while an ayah is on screen, as if the camera focused on the text
import { H, W } from './layout';

export interface Breath {
  rate: number; // values per second
  v: Float32Array; // 0..1
}

const RATE = 50;
const cache = new WeakMap<AudioBuffer, Breath>();

/** The recitation's loudness, 50 values a second, scaled so a full voice reads ≈ 1 and smoothed
 *  both ways (a swell rises with the voice and settles over ~0.4 s). Computed once per audio. */
export function breathOf(audio: AudioBuffer): Breath {
  const hit = cache.get(audio);
  if (hit) return hit;
  const d = audio.getChannelData(0);
  const win = Math.max(1, Math.round(audio.sampleRate / RATE));
  const n = Math.max(1, Math.floor(d.length / win));
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * win; k < (i + 1) * win; k += 4) s += d[k] * d[k];
    v[i] = Math.sqrt(s / (win / 4));
  }
  // A full voice = the 90th percentile of the louder half (silences and breaths don't count).
  const sorted = Float32Array.from(v).sort();
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;
  for (let i = 0; i < n; i++) v[i] = Math.min(1, v[i] / ref);
  // Smooth forwards then backwards (no lag either way).
  const a = 0.12;
  for (let i = 1; i < n; i++) v[i] = v[i - 1] + a * (v[i] - v[i - 1]);
  for (let i = n - 2; i >= 0; i--) v[i] = v[i + 1] + a * (v[i] - v[i + 1]);
  const b = { rate: RATE, v };
  cache.set(audio, b);
  return b;
}

export function breathAt(b: Breath | undefined, t: number): number {
  if (!b || t < 0) return 0;
  const x = t * b.rate, i = Math.floor(x);
  if (i >= b.v.length - 1) return b.v[b.v.length - 1] ?? 0;
  return b.v[i] + (b.v[i + 1] - b.v[i]) * (x - i);
}

const smooth = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export const OPEN = 1.4; // seconds the background takes to rise out of black
export const CLOSE = 1.6; // seconds it takes to settle back

/** Darkness over the background at t: 1 at the very start, 0 through the reel, ~0.85 at the end. */
export function shade(t: number, duration: number): number {
  const open = 1 - smooth(t / OPEN);
  const close = 0.85 * smooth((t - (duration - CLOSE)) / CLOSE);
  return Math.max(open, close);
}

/** The background's slow approach: 1 → 1.07 over the reel. */
export const drift = (t: number, duration: number) => 1 + 0.07 * smooth(t / Math.max(1, duration));

type Scratch = HTMLCanvasElement | OffscreenCanvas;
let small: Scratch | null = null, mid: Scratch | null = null;
const scratch = (c: Scratch | null, w: number, h: number): Scratch => {
  c ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
};
/** Softens what is drawn so far (the background) by `amount` 0..1: a downscaled copy laid over it.
 *  The copy is enlarged smoothly to 1/4 size first and only then stretched over the frame: the same
 *  soft look as one high-quality stretch at about half the cost per frame. */
export function soften(ctx: CanvasRenderingContext2D, amount: number) {
  if (amount < 0.02) return;
  const c = ctx.canvas;
  const w = Math.max(8, Math.round(c.width / 10)), h = Math.max(8, Math.round(c.height / 10));
  small = scratch(small, w, h);
  mid = scratch(mid, Math.round(c.width / 4), Math.round(c.height / 4));
  const s = small.getContext('2d') as CanvasRenderingContext2D;
  s.imageSmoothingQuality = 'high';
  s.drawImage(c, 0, 0, w, h);
  const m = mid.getContext('2d') as CanvasRenderingContext2D;
  m.imageSmoothingQuality = 'high';
  m.drawImage(small, 0, 0, mid.width, mid.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.55 * amount;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(mid, 0, 0, c.width, c.height);
  ctx.restore();
}

/** Black over the whole frame (in reel units). */
export function darken(ctx: CanvasRenderingContext2D, k: number) {
  if (k < 0.004) return;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${k.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
