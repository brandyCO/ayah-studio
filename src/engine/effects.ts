// Calm text effects (rule 7: respectful only — no bounce, shake, glitch, distort or spin). Each one
// draws a block of lines for a timed text item: it comes in after `start` and leaves before `end`.
// Long durations, soft easing; ink reveal and light sweep run right-to-left for Arabic.
import type { TajweedWord } from './tajweed';
import { W } from './layout';
import { blurredSprite, put, roundK, sprite, type Sprite } from './textCache';

export type TextEffect =
  | 'fade' | 'rise' | 'descend' | 'blur-in' | 'focus' | 'mist' | 'dissolve' | 'glow' | 'bloom'
  | 'sweep' | 'ink' | 'lines' | 'drift' | 'settle' | 'zoom' | 'push' | 'still';

export const TEXT_EFFECTS: { value: TextEffect; label: string }[] = [
  { value: 'rise', label: 'Gentle rise' },
  { value: 'fade', label: 'Fade' },
  { value: 'blur-in', label: 'Soft blur-in' },
  { value: 'focus', label: 'Focus pull' },
  { value: 'ink', label: 'Ink reveal' },
  { value: 'glow', label: 'Glow breathe' },
  { value: 'sweep', label: 'Light sweep' },
  { value: 'bloom', label: 'Soft bloom' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'mist', label: 'Mist' },
  { value: 'lines', label: 'Line by line' },
  { value: 'drift', label: 'Gentle drift' },
  { value: 'settle', label: 'Scale settle' },
  { value: 'zoom', label: 'Soft zoom' },
  { value: 'push', label: 'Slow push' },
  { value: 'descend', label: 'Descend' },
  { value: 'still', label: 'Still' },
];

/** Seconds to come in / go out (capped to a share of short items so text never flashes). */
const SPEC: Record<TextEffect, [number, number]> = {
  fade: [0.6, 0.35], rise: [0.6, 0.3], descend: [0.6, 0.3], 'blur-in': [0.8, 0.35], focus: [0.9, 0.35],
  mist: [1.1, 0.6], dissolve: [0.7, 0.6], glow: [0.7, 0.4], bloom: [0.6, 0.4], sweep: [0.6, 0.35],
  ink: [1.4, 0.35], lines: [0.5, 0.35], drift: [0.8, 0.4], settle: [0.9, 0.35], zoom: [0.9, 0.35],
  push: [0.7, 0.4], still: [0.12, 0.12],
};

export interface TextBlock {
  lines: string[];
  size: number;
  lh: number; // line height factor
  top: number;
  font: string; // e.g. '"UthmanicHafs", serif' (the size is added)
  dir: 'rtl' | 'ltr';
  color: string;
  opacity: number;
  /** Word highlight: the word being recited, drawn again over its place in `color` with a soft glow. */
  hl?: Highlight | null;
  /** 0..1: a soft halo that swells with the reciter's voice (cinema). Light only, no motion. */
  breath?: number;
  /** Tajweed colours: per line, words drawn again over their place, clipped to each coloured range. */
  tajweed?: TajweedWord[][] | null;
}

export interface Highlight {
  line: number; // index in lines
  before: string; // the words before it on that line (reading order), joined with spaces
  word: string;
  color: string;
  alpha: number; // 0…1: comes in softly when the word starts
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Device pixels per logical unit: blur and shadows ignore the canvas transform, so scale them. */
export const pxScale = (ctx: CanvasRenderingContext2D) => Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;

export function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}

/** Relative luminance (0 black … 1 white) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const v = parseInt(m[1], 16);
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/** Legibility shadow for a text colour: dark under light text, a soft light halo under dark text. */
export function setTextShadow(ctx: CanvasRenderingContext2D, color: string) {
  const dark = luminance(color) < 0.18;
  ctx.shadowColor = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14 * pxScale(ctx);
}

/** The lines of a block in paint coordinates (block top at y = 0). */
function fillLines(ctx: CanvasRenderingContext2D, b: TextBlock, only?: number) {
  b.lines.forEach((line, i) => {
    if (only === undefined || only === i) ctx.fillText(line, W / 2, b.size * b.lh * (i + 0.5));
  });
}

const blockKey = (b: TextBlock) => `${b.font}|${b.size}|${b.lh}|${b.dir}|${b.color}|${W}|${b.lines.join('\n')}`;

/**
 * Draw a text block for item g at time t with effect fx. The caller sets the legibility shadow
 * (ctx.shadowColor / shadowBlur); it is baked into the block's picture (textCache.ts) with the text,
 * so each frame only places pictures: no Arabic shaping and no shadow blur per frame.
 */
export function drawText(ctx: CanvasRenderingContext2D, fx: TextEffect, g: { start: number; end: number }, t: number, b: TextBlock) {
  const d = Math.max(0.001, g.end - g.start);
  const [enter, exit] = SPEC[fx] ?? SPEC.fade;
  const age = t - g.start;
  const p = easeOut(clamp01(age / Math.min(enter, d * 0.4)));
  const q = smooth(clamp01((g.end - t) / Math.min(exit, d * 0.25)));
  const k = Math.min(1, d / 1.5); // less motion for short items
  let alpha = Math.min(p, q), dy = 0, scale = 1, blur = 0, glow = 0;
  let ink: number | null = null, sweep: number | null = null, stagger = false;
  switch (fx) {
    case 'rise': dy = (1 - p) * 36 * k; break;
    case 'descend': dy = -(1 - p) * 30 * k; break;
    case 'blur-in': blur = (1 - p) * 10; break;
    case 'focus': blur = (1 - p) * 8; scale = 1 + 0.04 * (1 - p); break;
    case 'mist': blur = (1 - p) * 14 + (1 - q) * 10; dy = (1 - p) * 16 * k; break;
    case 'dissolve': blur = (1 - p) * 5 + (1 - q) * 8; break;
    case 'glow': glow = 0.5 + 0.25 * Math.sin((2 * Math.PI * age) / 3.4); break;
    case 'bloom': glow = 1 - easeOut(clamp01(age / Math.min(1.8, d * 0.6))); break;
    case 'sweep': sweep = clamp01((age - Math.min(enter, d * 0.4) * 0.5) / Math.min(1.8, d * 0.7)); break;
    case 'ink': ink = smooth(clamp01(age / Math.min(1.6, d * 0.6))); alpha = q; break;
    case 'lines': stagger = true; break;
    case 'drift': dy = 10 - 20 * clamp01(age / d); break;
    case 'settle': scale = 1 + 0.06 * (1 - p); break;
    case 'zoom': scale = 0.95 + 0.05 * p; break;
    case 'push': scale = 1 + 0.03 * clamp01(age / d); break;
  }
  if (alpha <= 0.001) return;

  const K = roundK(pxScale(ctx)); // device pixels per unit (before the effect's own scale)
  const font = `${b.size}px ${b.font}`;
  const lineH = b.size * b.lh;
  const blockH = b.lines.length * lineH;
  const pad = Math.round(b.size * 0.9 + 44); // marks above/below the lines + shadows and halos
  const key = blockKey(b);
  const shColor = ctx.shadowColor, shBlur = ctx.shadowBlur / (pxScale(ctx) || 1);
  const setup = (x: CanvasRenderingContext2D) => {
    x.direction = b.dir;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = b.color;
  };
  // The block with its legibility shadow (+ tajweed colours once they show). meta = line widths.
  const showTajweed = !!b.tajweed && (ink === null || ink >= 1);
  const base = sprite(`${key}|base|${shColor}|${shBlur}|${showTajweed ? JSON.stringify(b.tajweed) : ''}`, K, W, -pad, blockH + pad, (x, meta) => {
    setup(x);
    x.shadowColor = shColor;
    x.shadowBlur = shBlur * K;
    fillLines(x, b);
    for (const l of b.lines) meta.push(x.measureText(l).width);
    if (showTajweed) drawTajweed(x, b);
  });
  const widths = base.meta;
  // A halo in the text colour (glow, breath): the text drawn with a wide soft shadow of its own colour.
  const halo = () => sprite(`${key}|halo`, K, W, -pad, blockH + pad, (x) => {
    setup(x);
    x.shadowColor = rgba(b.color, 1);
    x.shadowBlur = 28 * K;
    fillLines(x, b);
  });

  ctx.save();
  ctx.shadowColor = 'transparent'; // the pictures carry their own shadows
  ctx.shadowBlur = 0;
  const A = alpha * b.opacity;
  if (scale !== 1) {
    const cy = b.top + blockH / 2;
    ctx.translate(W / 2, cy);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -cy);
  }
  const top = b.top + dy;

  if (b.breath && b.breath > 0.02) {
    // Breath: a halo in the text colour, as strong as the voice is loud.
    ctx.globalAlpha = A * Math.min(1, 0.55 * b.breath * 1.4);
    put(ctx, halo(), 0, top);
  }
  if (glow > 0.01) {
    ctx.globalAlpha = A * Math.min(1, glow);
    put(ctx, halo(), 0, top);
  }

  const band = (i: number) => ({ y0: lineH * (i + 0.5) - b.size * 1.2, y1: lineH * (i + 0.5) + b.size * 1.2 });
  /** Line i between d0 and d1 from its reading start (right edge for Arabic). */
  const span = (s: Sprite, i: number, d0: number, d1: number, yOff = 0) => {
    const w = widths[i] ?? 0;
    const start = b.dir === 'rtl' ? W / 2 + w / 2 : W / 2 - w / 2;
    const x0 = b.dir === 'rtl' ? start - d1 : start + d0;
    put(ctx, s, 0, top + yOff, { x0, x1: x0 + Math.abs(d1 - d0), ...band(i) });
  };

  if (blur > 0.05) {
    // Soft focus: the sharp picture and two blurred ones (made once), mixed by the amount of blur.
    const lv = [0, 6, 14];
    const i = blur >= lv[2] ? 1 : blur >= lv[1] ? 1 : 0;
    const f = clamp01((blur - lv[i]) / (lv[i + 1] - lv[i]));
    const pic = (n: number) => (lv[n] ? blurredSprite(key, base, lv[n]) : base);
    ctx.globalAlpha = A;
    mix(ctx, pic(i), pic(i + 1), f, top);
  } else if (stagger) {
    // Lines come in one after another, each with a gentle rise.
    const step = Math.min(0.35, (d * 0.3) / b.lines.length);
    const win = Math.min(enter, d * 0.4);
    b.lines.forEach((_, i) => {
      const pi = easeOut(clamp01((age - i * step) / win));
      ctx.globalAlpha = Math.min(pi, q) * b.opacity;
      if (ctx.globalAlpha > 0.001) put(ctx, base, 0, top + (1 - pi) * 20 * k, { x0: 0, x1: W, y0: lineH * i - (i ? 0 : pad), y1: lineH * (i + 1) + (i === b.lines.length - 1 ? pad : 0) });
    });
  } else if (ink !== null && ink < 1) {
    // Ink reveal: lines are written in reading order with a soft leading edge.
    const E = 110, N = 8;
    const total = widths.reduce((s, w) => s + w + E, 0);
    let at = ink * total;
    b.lines.forEach((_, i) => {
      const len = widths[i] + E;
      const f = Math.min(at, len);
      at -= len;
      if (f <= 0) return;
      ctx.globalAlpha = A;
      if (f - E > 0) span(base, i, -80, f - E);
      for (let s = 0; s < N; s++) {
        ctx.globalAlpha = A * (1 - (s + 0.5) / N);
        span(base, i, f - E + (s * E) / N, f - E + ((s + 1) * E) / N);
      }
    });
  } else {
    ctx.globalAlpha = A;
    put(ctx, base, 0, top);
  }

  if (b.hl && (ink === null || ink >= 1)) {
    // The recited word in the highlight colour, exactly over its place on the line: only its colour
    // changes (rule 7), with a soft glow in the same colour. One small picture per word.
    const hl = b.hl;
    const bd = band(hl.line);
    const s = sprite(`${key}|hl|${hl.line}|${hl.before}|${hl.word}|${hl.color}`, K, W, bd.y0 - 30, bd.y1 + 30, (x) => {
      setup(x);
      const lineW = x.measureText(b.lines[hl.line]).width;
      const pre = hl.before ? x.measureText(`${hl.before} `).width : 0;
      const hx = b.dir === 'rtl' ? W / 2 + lineW / 2 - pre : W / 2 - lineW / 2 + pre;
      x.textAlign = b.dir === 'rtl' ? 'right' : 'left';
      x.fillStyle = hl.color;
      x.shadowColor = rgba(hl.color, 0.55);
      x.shadowBlur = 18 * K;
      x.fillText(hl.word, hx, lineH * (hl.line + 0.5));
    });
    ctx.globalAlpha = A * hl.alpha;
    put(ctx, s, 0, top);
  }

  if (sweep !== null && sweep > 0 && sweep < 1) {
    // Light sweep: a soft band of light passes once along each line in reading order. Only the halo
    // is kept in its picture (the text is drawn off the picture and its shadow lands on the letters).
    const B = 150, N = 10, OFF = 4000;
    const light = sprite(`${key}|sweep`, K, W, -pad, blockH + pad, (x) => {
      setup(x);
      x.shadowColor = 'rgba(255,248,230,0.95)';
      x.shadowBlur = 20 * K;
      x.shadowOffsetX = OFF * K;
      x.translate(-OFF, 0);
      fillLines(x, b);
    });
    b.lines.forEach((_, i) => {
      const w = widths[i];
      const c = sweep! * (w + 2 * B) - B;
      for (let s = 0; s < N; s++) {
        ctx.globalAlpha = A * Math.sin(Math.PI * ((s + 0.5) / N));
        span(light, i, c - B + 2 * B * (s / N), c - B + 2 * B * ((s + 1) / N));
      }
    });
  }
  ctx.restore();
}

/** Two pictures of the same block mixed: (1 − f)·a + f·b, then drawn with the current alpha. The mix is
 *  made in a scratch layer with added light (exact for premultiplied pictures), so the text never
 *  looks thinner half-way. */
let mixLayer: HTMLCanvasElement | OffscreenCanvas | null = null;
function mix(ctx: CanvasRenderingContext2D, a: Sprite, b: Sprite, f: number, top: number) {
  if (f <= 0.01) return put(ctx, a, 0, top);
  if (f >= 0.99) return put(ctx, b, 0, top);
  const w = a.canvas.width, h = a.canvas.height;
  if (!mixLayer || mixLayer.width !== w || mixLayer.height !== h) {
    mixLayer = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h);
  }
  const m = mixLayer.getContext('2d') as CanvasRenderingContext2D;
  m.globalCompositeOperation = 'copy';
  m.globalAlpha = 1 - f;
  m.drawImage(a.canvas, 0, 0);
  m.globalCompositeOperation = 'lighter';
  m.globalAlpha = f;
  m.drawImage(b.canvas, 0, 0);
  put(ctx, { ...a, canvas: mixLayer }, 0, top);
}

/** Tajweed: the same word, same place, same shapes; only the colour of its ranges changes (rules 1, 7).
 *  A range's place inside the word is measured with a joiner after the prefix, so letters keep the
 *  joined forms they have in the word. Paint coordinates (block top at 0). */
function drawTajweed(ctx: CanvasRenderingContext2D, b: TextBlock) {
  ctx.save();
  ctx.textAlign = b.dir === 'rtl' ? 'right' : 'left';
  ctx.shadowColor = 'transparent';
  b.tajweed!.forEach((items, li) => {
    if (!items.length) return;
    const lineW = ctx.measureText(b.lines[li]).width;
    const y = b.size * b.lh * (li + 0.5);
    for (const it of items) {
      const pre = it.before ? ctx.measureText(`${it.before} `).width : 0;
      const chars = [...it.word];
      const wordW = ctx.measureText(it.word).width;
      const at = (k: number) => (k <= 0 ? 0 : k >= chars.length ? wordW : ctx.measureText(`${chars.slice(0, k).join('')}‍`).width);
      const x = b.dir === 'rtl' ? W / 2 + lineW / 2 - pre : W / 2 - lineW / 2 + pre;
      for (const [s, e, color] of it.spans) {
        const a0 = at(s), a1 = Math.max(a0 + 1, at(e));
        ctx.save();
        ctx.beginPath();
        const pad = b.size; // marks above / below the line
        if (b.dir === 'rtl') ctx.rect(x - a1, y - pad, a1 - a0, 2 * pad);
        else ctx.rect(x + a0, y - pad, a1 - a0, 2 * pad);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fillText(it.word, x, y);
        ctx.restore();
      }
    }
  });
  ctx.restore();
}
