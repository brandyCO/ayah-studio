// Touches: calm finishing effects, each a pure function of t (preview = export). They only change
// the background or add soft light; nothing here moves, bends or shakes the Quran text (rule 7).
// - ripple: the background seen through slowly moving water (drawn before the scrim and the text)
// - caustics: faint moving water light over the frame (light only)
// - bloom, bokeh, leak, mist, rain: on the background, under the scrim
// - motes, snow: small soft lights drifting in front of the background, behind the text
import { H, W } from './layout';

export type Touch = 'ripple' | 'caustics' | 'motes' | 'bokeh' | 'bloom' | 'leak' | 'mist' | 'rain' | 'snow';
export const TOUCHES: Touch[] = ['ripple', 'caustics', 'motes', 'bokeh', 'bloom', 'leak', 'mist', 'rain', 'snow'];
export const MAX_TOUCHES = 4;
export const validTouches = (v: unknown): Touch[] | null =>
  Array.isArray(v) && v.every((x) => TOUCHES.includes(x as Touch)) ? [...new Set(v as Touch[])].slice(0, MAX_TOUCHES) : null;

let copy: HTMLCanvasElement | OffscreenCanvas | null = null;
const scratch = (w: number, h: number) => {
  if (!copy || copy.width !== w || copy.height !== h) {
    copy = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  return copy;
};

/** Shift of a row (or column) at frame position p (0–1080…), in frame units, at time t. */
const wave = (p: number, t: number, a: number, b: number) =>
  Math.sin(p * a + t * 1.1) * 0.62 + Math.sin(p * b - t * 0.7 + 1.7) * 0.38;

/** The background (everything drawn so far) through moving water. `amount` 0–1 fades it. */
export function ripple(ctx: CanvasRenderingContext2D, t: number, amount = 1) {
  if (amount < 0.02) return;
  const c = ctx.canvas;
  const cw = c.width, ch = c.height;
  const k = cw / W; // device pixels per frame unit
  const amp = 6 * amount * k; // 6 frame units each way at full amount
  const m = Math.ceil(amp) + 1; // margin kept so a shifted strip never shows an edge
  const s = scratch(cw, ch);
  const sx = s.getContext('2d') as CanvasRenderingContext2D;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  // Rows sway sideways.
  sx.clearRect(0, 0, cw, ch);
  sx.drawImage(c, 0, 0);
  const rh = Math.max(2, Math.round(ch / 360));
  for (let y = 0; y < ch; y += rh) {
    const dx = amp * wave(y / k, t, 0.021, 0.047);
    ctx.drawImage(s, m + dx, y, cw - 2 * m, rh, 0, y, cw, rh);
  }
  // Columns rise and fall.
  sx.clearRect(0, 0, cw, ch);
  sx.drawImage(c, 0, 0);
  const cwid = Math.max(2, Math.round(cw / 270));
  for (let x = 0; x < cw; x += cwid) {
    const dy = amp * 0.8 * wave(x / k, t * 0.9 + 3, 0.017, 0.039);
    ctx.drawImage(s, x, m + dy, cwid, ch - 2 * m, x, 0, cwid, ch);
  }
  ctx.restore();
}

// A seamless 256 px caustics tile: bright thin lines where a sum of waves crosses zero.
let tile: HTMLCanvasElement | null = null;
function causticsTile() {
  if (tile) return tile;
  const N = 256;
  tile = document.createElement('canvas');
  tile.width = tile.height = N;
  const g = tile.getContext('2d')!;
  const img = g.createImageData(N, N);
  // Integer frequencies keep the tile seamless.
  const waves = [[1, 2, 0.3], [3, -1, 1.9], [2, 3, 4.1], [-2, 1, 2.6], [4, 1, 5.2], [1, -4, 0.9]];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const [a, b, ph] of waves) v += Math.cos(2 * Math.PI * ((a * x + b * y) / N) + ph);
      const l = Math.exp(-v * v * 2.2); // 1 on the lines, soft falloff
      const i = (y * N + x) * 4;
      img.data[i] = 205 * l;
      img.data[i + 1] = 238 * l;
      img.data[i + 2] = 255 * l;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tile;
}

/** Faint water light over the frame (added light only). */
export function caustics(ctx: CanvasRenderingContext2D, t: number, amount = 1) {
  if (amount < 0.02) return;
  const tl = causticsTile();
  const pat = ctx.createPattern(tl, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Two layers drifting in different directions; where they meet the light gathers, as in water.
  const layers: [number, number, number, number][] = [
    [3.2, 14, 9, 0.06],
    [2.3, -11, 7, 0.045],
  ];
  for (const [scale, vx, vy, a] of layers) {
    ctx.save();
    ctx.globalAlpha = a * amount;
    const ox = (t * vx) % (256 * scale), oy = (t * vy) % (256 * scale);
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = pat;
    ctx.fillRect(-ox / scale - 256, -oy / scale - 256, W / scale + 512, H / scale + 512);
    ctx.restore();
  }
  ctx.restore();
}

// --- shared helpers ---
const mk = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });
/** A soft round light (white core fading out), drawn once and reused. */
let dotSprite: HTMLCanvasElement | null = null;
function dot() {
  if (dotSprite) return dotSprite;
  dotSprite = mk(64, 64);
  const g = dotSprite.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return dotSprite;
}
/** A soft-edged disc (out-of-focus light). */
let discSprite: HTMLCanvasElement | null = null;
function disc() {
  if (discSprite) return discSprite;
  discSprite = mk(128, 128);
  const g = discSprite.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.75, 'rgba(255,255,255,0.45)');
  r.addColorStop(0.9, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return discSprite;
}
/** Seeded random numbers: the same particles every frame and every export. */
function seeded(seed: number) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}
const wrap = (v: number, n: number) => ((v % n) + n) % n;
const memo = new Map<string, number[][]>();
function particles(key: string, n: number, seed: number, fields: number) {
  let list = memo.get(key);
  if (!list) {
    const r = seeded(seed);
    list = Array.from({ length: n }, () => Array.from({ length: fields }, r));
    memo.set(key, list);
  }
  return list;
}

/** Bright parts of the background glow softly (a blurred copy added on top). */
let bloomSmall: HTMLCanvasElement | OffscreenCanvas | null = null;
export function bloom(ctx: CanvasRenderingContext2D) {
  const c = ctx.canvas;
  const w = Math.max(8, Math.round(c.width / 8)), h = Math.max(8, Math.round(c.height / 8));
  if (!bloomSmall || bloomSmall.width !== w || bloomSmall.height !== h) bloomSmall = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : mk(w, h);
  const s = bloomSmall.getContext('2d') as CanvasRenderingContext2D;
  s.globalCompositeOperation = 'copy';
  s.drawImage(c, 0, 0, w, h);
  // Keep only the light parts: multiplying the picture by itself twice (x³) darkens the rest.
  s.globalCompositeOperation = 'multiply';
  s.drawImage(bloomSmall, 0, 0);
  s.drawImage(bloomSmall, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bloomSmall, 0, 0, c.width, c.height);
  ctx.restore();
}

/** Large soft out-of-focus lights drifting slowly upwards. */
export function bokeh(ctx: CanvasRenderingContext2D, t: number) {
  const img = disc();
  const tints = ['255,214,150', '255,240,215', '190,225,255'];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [x, y, r, sp, ph, tint] of particles('bokeh', 16, 11, 6)) {
    const size = 60 + r * 150;
    const py = wrap(y * (H + 400) - t * (6 + sp * 10), H + 400) - 200;
    const px = x * W + Math.sin(t * 0.2 + ph * 6) * 30;
    ctx.globalAlpha = 0.16 + 0.12 * Math.sin(t * 0.5 + ph * 6.3) ** 2;
    ctx.drawImage(tinted(img, tints[Math.floor(tint * tints.length) % tints.length]), px - size / 2, py - size / 2, size, size);
  }
  ctx.restore();
}
const tintCache = new Map<string, HTMLCanvasElement>();
function tinted(src: HTMLCanvasElement, rgb: string) {
  const key = `${src.width}:${rgb}`;
  let c = tintCache.get(key);
  if (!c) {
    c = mk(src.width, src.height);
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${rgb})`;
    g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}

/** A warm light leak drifting slowly along one side. */
export function leak(ctx: CanvasRenderingContext2D, t: number) {
  const x = W * (0.5 + 0.55 * Math.sin(t * 0.13));
  const y = H * (0.25 + 0.2 * Math.sin(t * 0.09 + 1));
  const r = W * 0.9;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,170,90,0.32)');
  g.addColorStop(0.4, 'rgba(255,120,80,0.14)');
  g.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Soft mist rolling slowly across the lower part of the frame. */
export function mist(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [x, y, r, sp] of particles('mist', 7, 23, 4)) {
    const cx = wrap(x * (W + 1200) + t * (12 + sp * 14), W + 1200) - 600;
    const cy = H * (0.55 + y * 0.45);
    const rad = 380 + r * 420;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(225,232,240,0.13)');
    g.addColorStop(1, 'rgba(225,232,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

/** Fine, soft rain falling slightly slanted. */
export function rain(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(220,232,245,1)';
  ctx.lineCap = 'round';
  for (const [x, y, sp, len, a] of particles('rain', 140, 37, 5)) {
    const v = 900 + sp * 700;
    const L = 40 + len * 70;
    const py = wrap(y * (H + 200) + t * v, H + 200) - 100;
    const px = wrap(x * (W + 100) + py * 0.12, W + 100) - 50;
    ctx.globalAlpha = 0.07 + a * 0.12;
    ctx.lineWidth = 1.5 + a * 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + L * 0.12, py + L);
    ctx.stroke();
  }
  ctx.restore();
}

/** Small glowing specks drifting and twinkling (like dust in a sunbeam). */
export function motes(ctx: CanvasRenderingContext2D, t: number) {
  const img = tinted(dot(), '255,236,200');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, sp, ph] of particles('motes', 70, 5, 5)) {
    const size = 10 + r * 26;
    const px = wrap(x * W + Math.sin(t * 0.3 + ph * 9) * 40 + t * (4 + sp * 6), W);
    const py = wrap(y * H - t * (8 + sp * 14), H);
    ctx.globalAlpha = (0.25 + 0.45 * Math.sin(t * (0.6 + sp) + ph * 6.3) ** 2) * (0.5 + r * 0.5);
    ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
  }
  ctx.restore();
}

/** Gentle snow, swaying as it falls. */
export function snow(ctx: CanvasRenderingContext2D, t: number) {
  const img = dot();
  ctx.save();
  for (const [x, y, r, sp, ph] of particles('snow', 110, 71, 5)) {
    const size = 8 + r * 18;
    const v = 30 + sp * 50 + r * 30;
    const py = wrap(y * (H + 60) + t * v, H + 60) - 30;
    const px = wrap(x * W + Math.sin(t * (0.4 + sp * 0.5) + ph * 6.3) * 35, W);
    ctx.globalAlpha = 0.45 + r * 0.45;
    ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
  }
  ctx.restore();
}
