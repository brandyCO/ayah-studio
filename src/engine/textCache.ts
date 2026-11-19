// Text layers (owner request 2026-11-19, "the studio lags"): shaping Arabic and drawing its soft
// shadow with `shadowBlur` every frame was the largest steady cost of the preview. Like a video
// editor's title layers, each block of text is now drawn once into a small picture (with its shadow,
// glow or blur baked in) and that picture is placed every frame: moving, scaling or fading it costs
// one GPU copy. The pictures are made at the screen's own pixel size, so the text stays as sharp as
// before, and the export uses the same pictures (preview = export).
import { gpuBlurred } from './gpu';

export type Layer = HTMLCanvasElement | OffscreenCanvas;
export interface Sprite {
  canvas: Layer;
  k: number; // pixels per frame unit
  y0: number; // the frame-unit row the picture's top stands for, relative to the paint origin
  h: number; // height in frame units
  w: number; // width in frame units
  /** Anything the painter measured (e.g. line widths), so it need not be measured again each frame. */
  meta: number[];
}

const mk = (w: number, h: number): Layer => {
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h });
  return new OffscreenCanvas(w, h);
};

// Least recently used first; trimmed to a pixel budget (about 40 MB of pictures).
const cache = new Map<string, Sprite>();
const BUDGET = 10e6;
let used = 0;
const px = (s: Sprite) => s.canvas.width * s.canvas.height;
function keep(key: string, s: Sprite) {
  cache.set(key, s);
  used += px(s);
  for (const [k, v] of cache) {
    if (used <= BUDGET || cache.size <= 4) break;
    cache.delete(k);
    used -= px(v);
    v.canvas.width = v.canvas.height = 0; // let the memory go at once (Safari keeps canvases long)
  }
}
function get(key: string) {
  const s = cache.get(key);
  if (s) { cache.delete(key); cache.set(key, s); } // most recently used last
  return s;
}

/** Device pixels per frame unit, rounded so that tiny changes (a pinch in progress) reuse pictures. */
export const roundK = (k: number) => Math.max(0.05, Math.round(k * 50) / 50);

/**
 * The picture for `key`: a band of the frame `w` units wide from y0 to y1 (paint coordinates), drawn
 * by `paint` with frame units as its coordinates. Made once, then reused.
 */
export function sprite(key: string, k: number, w: number, y0: number, y1: number, paint: (g: CanvasRenderingContext2D, meta: number[]) => void): Sprite {
  const full = `${key}|${k}|${w}|${y0}|${y1}`;
  const hit = get(full);
  if (hit) return hit;
  const cw = Math.max(1, Math.ceil(w * k)), ch = Math.max(1, Math.ceil((y1 - y0) * k));
  const canvas = mk(cw, ch);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.setTransform(k, 0, 0, k, 0, -y0 * k);
  const meta: number[] = [];
  paint(g, meta);
  const s: Sprite = { canvas, k, y0, h: ch / k, w: cw / k, meta };
  keep(full, s);
  return s;
}

/** A blurred copy of a picture (radius in frame units): on the GPU, else with the canvas filter, else
 *  by shrinking and enlarging it again (iPhone Safari has no canvas filter). Cached with it. */
export function blurredSprite(key: string, s: Sprite, radius: number): Sprite {
  const full = `${key}|blur${radius}|${s.k}|${s.canvas.width}x${s.canvas.height}`;
  const hit = get(full);
  if (hit) return hit;
  const r = radius * s.k;
  const canvas = mk(s.canvas.width, s.canvas.height);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const gpu = gpuBlurred(s.canvas, r);
  if (gpu) g.drawImage(gpu, 0, 0);
  else if (canFilter(g)) {
    g.filter = `blur(${r.toFixed(2)}px)`;
    g.drawImage(s.canvas, 0, 0);
  } else {
    // Shrink in halves to about the radius, then enlarge smoothly: a soft blur that costs little.
    let cur: Layer = s.canvas;
    let f = 1;
    while (f * 2 <= Math.max(1, r / 1.5) && cur.width > 8) {
      f *= 2;
      const n = mk(Math.max(1, Math.round(s.canvas.width / f)), Math.max(1, Math.round(s.canvas.height / f)));
      const x = n.getContext('2d') as CanvasRenderingContext2D;
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, canvas.width, canvas.height);
  }
  const b: Sprite = { ...s, canvas };
  keep(full, b);
  return b;
}

/** A blurred copy of a whole canvas for this frame only (radius in its pixels): GPU, else the canvas
 *  filter, else shrink-and-enlarge. The result must be drawn at once (it is reused next call). */
let fb: Layer | null = null;
const chain: Layer[] = [];
export function blurCanvas(src: Layer, r: number): Layer {
  if (r < 0.5) return src;
  const gpu = gpuBlurred(src, r);
  if (gpu) return gpu;
  if (!fb || fb.width !== src.width || fb.height !== src.height) fb = mk(src.width, src.height);
  const g = fb.getContext('2d') as CanvasRenderingContext2D;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'copy';
  if (canFilter(g)) {
    g.filter = `blur(${r.toFixed(2)}px)`;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    return fb;
  }
  let cur: Layer = src;
  let f = 1, i = 0;
  while (f * 2 <= Math.max(1, r / 1.5) && cur.width > 8) {
    f *= 2;
    const w = Math.max(1, Math.round(src.width / f)), h = Math.max(1, Math.round(src.height / f));
    if (!chain[i] || chain[i].width !== w || chain[i].height !== h) chain[i] = mk(w, h);
    const x = chain[i].getContext('2d') as CanvasRenderingContext2D;
    x.globalCompositeOperation = 'copy';
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, w, h);
    cur = chain[i++];
  }
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, src.width, src.height);
  return fb;
}

let filterOk: boolean | null = null;
function canFilter(g: CanvasRenderingContext2D) {
  if (filterOk === null) {
    // Safari accepts the property but ignores it: check that a blur really spreads a pixel.
    try {
      const c = mk(9, 9);
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      x.filter = 'blur(2px)';
      x.fillStyle = '#fff';
      x.fillRect(4, 4, 1, 1);
      filterOk = x.getImageData(1, 4, 1, 1).data[3] > 0;
    } catch { filterOk = false; }
  }
  return filterOk && 'filter' in g;
}

/** Places a picture with its paint origin at (x, y) in frame units: aligned to whole device pixels
 *  when nothing scales or turns it, so resting text is never softened by resampling. `src` selects
 *  a part of it (frame units, relative to the paint origin). */
export function put(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, src?: { x0: number; x1: number; y0: number; y1: number }) {
  let dx = x, dy = y + s.y0;
  const m = ctx.getTransform();
  if (m.b === 0 && m.c === 0 && Math.abs(m.a - s.k) < 1e-3 && Math.abs(m.a - m.d) < 1e-6) {
    // One sprite pixel per device pixel: snap the corner to the pixel grid.
    dx = (Math.round(m.a * dx + m.e) - m.e) / m.a;
    dy = (Math.round(m.d * dy + m.f) - m.f) / m.d;
  }
  if (!src) return ctx.drawImage(s.canvas, dx, dy, s.w, s.h);
  const sx0 = Math.max(0, src.x0), sx1 = Math.min(s.w, src.x1);
  const sy0 = Math.max(0, src.y0 - s.y0), sy1 = Math.min(s.h, src.y1 - s.y0);
  if (sx1 - sx0 <= 0 || sy1 - sy0 <= 0) return;
  ctx.drawImage(s.canvas, sx0 * s.k, sy0 * s.k, (sx1 - sx0) * s.k, (sy1 - sy0) * s.k, dx + sx0, dy + sy0, sx1 - sx0, sy1 - sy0);
}

/** Pictures in memory (Device check). */
export const textCacheInfo = () => ({ items: cache.size, megapixels: +(used / 1e6).toFixed(1) });
