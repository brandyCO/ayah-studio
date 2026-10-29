// Scenes (backgrounds) fill the recitation exactly, and calm transitions between them (~1–2 s, soft
// easing). Scene boundaries partition [0, duration]; a transition is centred on its boundary.
import type { BackgroundMedia } from './backgrounds';
import { pxScale } from './effects';
import { H, W } from './layout';

/**
 * Single: one background · Per ayah: one scene per ayah (changes in the pause between ayat) ·
 * Even: equal shares · Custom: lengths set by dragging the dividers (fractions of the reel).
 */
export type SceneMode = 'single' | 'ayah' | 'even' | 'custom';
/** A video shorter than its scene: loop it, slow it down to fill the scene, or hold its last frame. */
export type ClipFit = 'loop' | 'slow' | 'hold';
/** How a scene's video is used: where it starts (seconds into the file) and how a short clip fills the scene. */
export interface Clip {
  in: number;
  fit: ClipFit;
  /** This scene's brightness (−1 darker … +1 brighter) and blur (0 … 1), set with sliders. */
  b?: number;
  blur?: number;
  /** Show the whole picture (for landscape footage): fitted inside the frame over a soft, blurred
   *  copy of itself that fills it, instead of cropped to fill the frame. */
  whole?: boolean;
}
export const BLUR_MAX = 24; // frame px at blur 1
export const CLIP_FITS: { value: ClipFit; label: string }[] = [
  { value: 'loop', label: 'Loop' },
  { value: 'slow', label: 'Slow down' },
  { value: 'hold', label: 'Freeze last frame' },
];
/** Slowest playback for "Slow down" (slower would look frozen); beyond it the slowed clip loops. */
export const MIN_RATE = 0.25;
export type Transition = 'crossfade' | 'blur' | 'black' | 'white' | 'zoom' | 'leak' | 'mist' | 'parallax' | 'wipe' | 'iris' | 'lightbloom' | 'clouddrift' | 'cut';

export const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'blur', label: 'Blur dissolve' },
  { value: 'black', label: 'Dip to black' },
  { value: 'white', label: 'Dip to white' },
  { value: 'zoom', label: 'Soft zoom-through' },
  { value: 'leak', label: 'Light leak' },
  { value: 'mist', label: 'Mist' },
  { value: 'parallax', label: 'Slow parallax' },
  { value: 'wipe', label: 'Soft wipe' },
  { value: 'iris', label: 'Soft iris' },
  { value: 'lightbloom', label: 'Light bloom' },
  { value: 'clouddrift', label: 'Drift through clouds' },
  { value: 'cut', label: 'Cut' },
];

/** Cloud puffs for "Drift through clouds": [x, y offset, radius (× W), vertical squash]. */
const CLOUDS: [number, number, number, number][] = [
  [0.15, 0.05, 0.5, 0.55], [0.6, -0.08, 0.6, 0.5], [0.95, 0.1, 0.5, 0.6], [0.35, 0.28, 0.55, 0.5], [0.8, 0.35, 0.45, 0.55],
  [0.05, 0.45, 0.45, 0.5], [0.5, 0.55, 0.65, 0.45], [0.25, -0.25, 0.5, 0.5], [0.75, -0.3, 0.55, 0.55], [0.45, 0.8, 0.5, 0.5],
];

/** Seconds per transition (shortened to half of a short neighbouring scene). */
const DUR: Record<Transition, number> = {
  crossfade: 1.2, blur: 1.4, black: 1.4, white: 1.4, zoom: 1.2, leak: 1.6, mist: 1.8, parallax: 1.6, wipe: 1.4, iris: 1.4, lightbloom: 1.8, clouddrift: 2, cut: 0,
};

export const MAX_SCENES = 10;
export const MIN_SCENE = 1; // seconds

/** Scene lengths in seconds from fractions: each at least MIN_SCENE (when the reel allows), summing to `duration`. */
export function sceneSeconds(fractions: number[], duration: number): number[] {
  const n = fractions.length;
  const total = fractions.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  let len = fractions.map((f) => (Math.max(0, f) / total) * duration);
  if (duration < n * MIN_SCENE) return len.map(() => duration / n);
  for (let pass = 0; pass < 4; pass++) {
    const short = len.map((l) => l < MIN_SCENE);
    if (!short.some(Boolean)) break;
    const need = len.reduce((a, l, i) => a + (short[i] ? MIN_SCENE - l : 0), 0);
    const spare = len.reduce((a, l, i) => a + (short[i] ? 0 : l - MIN_SCENE), 0);
    len = len.map((l, i) => (short[i] ? MIN_SCENE : l - ((l - MIN_SCENE) / spare) * need));
  }
  return len;
}

/**
 * Times a scene change can snap to: the middle of each pause between ayat and of each pause between
 * words (≥ 0.25 s) in the recitation — never inside a word.
 */
export function snapPoints(ayat: { start: number; last: number; seq: [number, number, number][] | null }[]): number[] {
  const out: number[] = [];
  ayat.forEach((a, i) => {
    if (i > 0 && a.start > ayat[i - 1].last) out.push((ayat[i - 1].last + a.start) / 2);
    // Against the furthest word end so far: timings of neighbouring words can overlap in the data.
    let reach = -Infinity;
    for (const [, st, e] of a.seq ?? []) {
      if (st - reach >= 0.25 && reach > -Infinity) out.push((reach + st) / 2);
      reach = Math.max(reach, e);
    }
  });
  return out.sort((x, y) => x - y);
}

/** reel seconds start..end; `entry` indexes the project's scene list. */
export interface Scene {
  start: number;
  end: number;
  entry: number;
}

/** Scene boundaries for the reel: they always add up to exactly its length. */
export function planScenes(mode: SceneMode, entries: number, duration: number, ayat: { start: number; last: number }[], lengths?: number[] | null): Scene[] {
  const bounds: number[] = [];
  const which: number[] = [0];
  if (mode === 'custom' && entries > 1) {
    const len = sceneSeconds(lengths?.length === entries ? lengths : new Array(entries).fill(1), duration);
    let at = 0;
    for (let k = 1; k < entries; k++) {
      bounds.push((at += len[k - 1]));
      which.push(k);
    }
  } else if (mode === 'ayah' && entries > 1) {
    // In the middle of the pause between ayat (never inside a word); cycles through the scenes.
    for (let i = 0; i + 1 < ayat.length; i++) {
      bounds.push(Math.min(ayat[i + 1].start, (ayat[i].last + ayat[i + 1].start) / 2));
      which.push((i + 1) % entries);
    }
  } else if (mode === 'even' && entries > 1) {
    for (let k = 1; k < entries; k++) {
      bounds.push((duration * k) / entries);
      which.push(k);
    }
  }
  const edges = [0, ...bounds, duration];
  return which.map((entry, i) => ({ start: edges[i], end: edges[i + 1], entry }));
}

/** A scene with the span it is visible (including its transitions) and their lengths. */
export interface SceneSpan extends Scene {
  from: number;
  to: number;
  tOut: number; // length of the transition into the next scene
}

export function sceneSpans(scenes: Scene[], tr: Transition): SceneSpan[] {
  const len = (s: Scene) => s.end - s.start;
  const d = scenes.map((s, i) => (i + 1 < scenes.length && tr !== 'cut' ? Math.min(DUR[tr] ?? 1.2, len(s) / 2, len(scenes[i + 1]) / 2) : 0));
  return scenes.map((s, i) => ({ ...s, from: s.start - (i ? d[i - 1] / 2 : 0), to: s.end + d[i] / 2, tOut: d[i] }));
}

/** The scene at t and, during a transition, the next one with its progress 0…1. */
export function scenesAt(spans: SceneSpan[], t: number): { a: SceneSpan; b: SceneSpan | null; p: number } {
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i], nx = spans[i + 1];
    if (t < s.to || !nx) return nx && s.tOut > 0 && t >= nx.from ? { a: s, b: nx, p: (t - nx.from) / s.tOut } : { a: s, b: null, p: 0 };
  }
  return { a: spans[spans.length - 1], b: null, p: 0 };
}

/** The usable start of a clip: within the video, leaving at least a tenth of a second. */
export const clipIn = (clip: Clip | null | undefined, duration: number) => Math.min(Math.max(0, clip?.in ?? 0), Math.max(0, duration - 0.1));

/** Slow motion for every background video (the recitation is never slowed): 1, 0.75 or 0.5. */
export const SLOWMO = [1, 0.75, 0.5] as const;
export type Slowmo = (typeof SLOWMO)[number];

/**
 * Video time of a scene's background at reel time t: it starts at the clip's in-point when the scene
 * first shows; a clip shorter than the scene loops from its in-point, slows down, or holds its last frame.
 * `speed` is the reel's slow motion (1 = as filmed).
 */
export function videoTime(s: SceneSpan, t: number, clip: Clip | null | undefined, duration: number, speed = 1): number {
  const lt = Math.max(0, t - s.from) * speed;
  const start = clipIn(clip, duration);
  const avail = Math.max(0.1, duration - start);
  const slot = (s.to - s.from) * speed; // video seconds the scene shows at this speed
  const fit = clip?.fit ?? 'loop';
  if (fit === 'hold' || (fit === 'loop' && avail >= slot)) return Math.min(start + lt, duration - 1 / 60);
  const rate = fit === 'slow' ? Math.max(MIN_RATE / speed, Math.min(1, avail / slot)) : 1;
  return start + ((lt * rate) % avail);
}

/** Make every video visible at t hold its frame (export: awaited; preview: fire and forget). */
/** Resolves true when a video's picture changed (null: no video to prepare). */
export function prepareScenes(spans: SceneSpan[], t: number, media: (BackgroundMedia | undefined)[], clips: (Clip | null)[], skipBusy = false, speed = 1): Promise<boolean> | null {
  const { a, b } = scenesAt(spans, t);
  const jobs: Promise<boolean>[] = [];
  for (const s of [a, b]) {
    const v = s && media[s.entry]?.video;
    if (v && !(skipBusy && v.isBusy)) jobs.push(v.prepare(videoTime(s, t, clips[s.entry], v.duration, speed)));
  }
  return jobs.length ? Promise.all(jobs).then((r) => r.some(Boolean)) : null;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom = 1, panY = 0, dx = 0) {
  const s = Math.max(W / sw, H / sh) * zoom;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) / 2 + dx, (H - dh) / 2 + panY, dw, dh);
}

/** Fitted inside the frame (whole picture), over a soft enlarged copy of itself that fills it.
 *  The soft copy is made by shrinking the picture to a few dozen pixels and stretching it back,
 *  so it costs little and is the same in the preview and the export. */
let tiny: HTMLCanvasElement | null = null;
function containSoft(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom = 1, panY = 0, dx = 0) {
  if (!tiny) tiny = document.createElement('canvas');
  const tw = Math.max(8, Math.round(W / 40)), th = Math.max(8, Math.round(H / 40));
  if (tiny.width !== tw || tiny.height !== th) { tiny.width = tw; tiny.height = th; }
  const g = tiny.getContext('2d')!;
  g.imageSmoothingQuality = 'medium';
  const k = Math.max(tw / sw, th / sh);
  g.drawImage(src, (tw - sw * k) / 2, (th - sh * k) / 2, sw * k, sh * k);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tiny, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const s = Math.min(W / sw, H / sh) * zoom;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) / 2 + dx, (H - dh) / 2 + panY, dw, dh);
}

interface Look {
  zoom?: number;
  dx?: number;
  dy?: number;
}

/** One scene's background (images get a slow Ken Burns over the scene). */
function drawScene(ctx: CanvasRenderingContext2D, s: SceneSpan, t: number, m: BackgroundMedia | undefined, o: Look = {}, adj?: Clip | null) {
  const blur = adj?.blur ?? 0;
  const zoom = (o.zoom ?? 1) * (blur > 0 ? 1 + (blur * BLUR_MAX * 3) / W : 1); // blurred edges stay outside the frame
  const dx = o.dx ?? 0, dy = o.dy ?? 0;
  const b = m?.bg;
  ctx.fillStyle = b?.kind === 'color' ? b.color : '#000';
  ctx.fillRect(0, 0, W, H);
  const prevFilter = ctx.filter;
  if (blur > 0 && b?.kind !== 'color') ctx.filter = `blur(${(blur * BLUR_MAX * pxScale(ctx)).toFixed(2)}px)`;
  if (b?.kind === 'image' && m!.image) {
    const p = clamp01((t - s.from) / Math.max(s.to - s.from, 1));
    const fill = adj?.whole ? containSoft : cover;
    fill(ctx, m!.image, m!.image.width, m!.image.height, (adj?.whole ? 1 + 0.04 * p : 1.04 + 0.08 * p) * zoom, (adj?.whole ? -10 : -30) * p + dy, dx);
  } else if (b?.kind === 'video' && m!.video) {
    const c = m!.video.canvas;
    (adj?.whole ? containSoft : cover)(ctx, c, c.width, c.height, zoom, dy, dx);
  } else if (b?.kind === 'color') {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, H * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.filter = prevFilter;
  const br = adj?.b ?? 0;
  if (Math.abs(br) > 0.005) {
    ctx.save();
    if (br < 0) ctx.fillStyle = `rgba(0,0,0,${(-br * 0.85).toFixed(3)})`;
    else { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,255,255,${(br * 0.45).toFixed(3)})`; }
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** Draws `paint` through a soft gradient mask (soft wipe / iris), via an offscreen layer. */
let layer: HTMLCanvasElement | null = null;
function masked(ctx: CanvasRenderingContext2D, paint: (c: CanvasRenderingContext2D) => void, mask: (c: CanvasRenderingContext2D) => CanvasGradient) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  if (!layer) layer = document.createElement('canvas');
  if (layer.width !== cw || layer.height !== ch) {
    layer.width = cw;
    layer.height = ch;
  }
  const l = layer.getContext('2d')!;
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, cw, ch);
  l.setTransform(ctx.getTransform());
  paint(l);
  l.globalCompositeOperation = 'destination-in';
  l.fillStyle = mask(l);
  l.fillRect(0, 0, W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/** The background for time t: the current scene, or a calm transition between two scenes. */
export function drawScenes(ctx: CanvasRenderingContext2D, t: number, spans: SceneSpan[], tr: Transition, media: (BackgroundMedia | undefined)[], clips?: (Clip | null)[]) {
  const { a, b, p: raw } = scenesAt(spans, t);
  const A = (o?: Look) => drawScene(ctx, a, t, media[a.entry], o, clips?.[a.entry]);
  if (!b) return A();
  const B = (o?: Look) => drawScene(ctx, b, t, media[b.entry], o, clips?.[b.entry]);
  const p = smooth(clamp01(raw));
  const px = pxScale(ctx);
  const over = (paint: () => void, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    paint();
    ctx.restore();
  };
  const bump = Math.sin(Math.PI * p); // 0 → 1 → 0 across the transition
  switch (tr) {
    case 'cut':
      return p < 0.5 ? A() : B();
    case 'blur':
      ctx.save();
      ctx.filter = `blur(${(p * 18 * px).toFixed(2)}px)`;
      A();
      ctx.filter = `blur(${((1 - p) * 18 * px).toFixed(2)}px)`;
      ctx.globalAlpha = p;
      B();
      ctx.restore();
      return;
    case 'black':
    case 'white': {
      // Through a calm colour: the first scene fades out into it, the next fades in from it.
      if (p < 0.5) A();
      else B();
      ctx.fillStyle = tr === 'black' ? `rgba(0,0,0,${bump.toFixed(3)})` : `rgba(246,241,231,${(0.9 * bump).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case 'zoom':
      A({ zoom: 1 + 0.15 * p });
      return over(() => B({ zoom: 1.08 - 0.08 * p }), p);
    case 'parallax':
      // Both layers move gently upwards at once, the next rising in from below.
      A({ zoom: 1 + 0.08 * p, dy: -70 * p });
      return over(() => B({ zoom: 1 + 0.08 * (1 - p), dy: 70 * (1 - p) }), p);
    case 'wipe': {
      // A feathered edge travels right to left (the reading direction of the Arabic).
      const F = 260, x = W + F - p * (W + 2 * F);
      A();
      return masked(ctx, (c) => drawScene(c, b, t, media[b.entry]), (c) => {
        const g = c.createLinearGradient(x - F, 0, x, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        return g;
      });
    }
    case 'iris': {
      // A soft circle opens from the centre.
      const F = 260, R = p * (Math.hypot(W / 2, H / 2) + F);
      A();
      return masked(ctx, (c) => drawScene(c, b, t, media[b.entry]), (c) => {
        const g = c.createRadialGradient(W / 2, H / 2, Math.max(0, R - F), W / 2, H / 2, Math.max(1, R));
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        return g;
      });
    }
    default:
      A();
      over(() => B(), p);
  }
  if (tr === 'leak') {
    // Warm light drifting across the frame, strongest mid-transition.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = W * (1.15 - 1.3 * p), cy = H * 0.32;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.75);
    g.addColorStop(0, `rgba(255,190,110,${(0.6 * bump).toFixed(3)})`);
    g.addColorStop(0.45, `rgba(255,130,70,${(0.25 * bump).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else if (tr === 'lightbloom') {
    // A warm glow swells over the change and settles (docs/light.md, L2).
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.8);
    g.addColorStop(0, `rgba(255,236,196,${(0.75 * bump).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(255,200,130,${(0.35 * bump).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,184,92,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else if (tr === 'clouddrift') {
    // Soft clouds rise past the view, thickest at the change, as if flying up through them.
    ctx.save();
    for (const [x, y0, r, sy] of CLOUDS) {
      const cy = H * (y0 + 0.9 - 1.8 * p);
      ctx.save();
      ctx.translate(W * x, cy);
      ctx.scale(1, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * r);
      g.addColorStop(0, `rgba(240,234,246,${(0.85 * bump).toFixed(3)})`);
      g.addColorStop(0.6, `rgba(225,216,238,${(0.45 * bump).toFixed(3)})`);
      g.addColorStop(1, 'rgba(225,216,238,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-W * r, -W * r, W * r * 2, W * r * 2);
      ctx.restore();
    }
    ctx.restore();
  } else if (tr === 'mist') {
    // Soft banks of mist pass through as the scenes change.
    ctx.save();
    for (const [x, y, r, v] of [[0.2, 0.3, 0.55, 1], [0.75, 0.5, 0.6, -1], [0.4, 0.75, 0.5, 1], [0.6, 0.15, 0.45, -1]]) {
      const cx = W * x + v * 120 * (p - 0.5), cy = H * y;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * r);
      g.addColorStop(0, `rgba(232,236,240,${(0.55 * bump).toFixed(3)})`);
      g.addColorStop(1, 'rgba(232,236,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
}
