// Calm text effects (rule 7: respectful only — no bounce, shake, glitch, distort or spin). Each one
// draws a block of lines for a timed text item: it comes in after `start` and leaves before `end`.
// Long durations, soft easing; ink reveal and light sweep run right-to-left for Arabic.
import { W } from './layout';

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

function fillLines(ctx: CanvasRenderingContext2D, b: TextBlock, top: number, only?: number) {
  b.lines.forEach((line, i) => {
    if (only === undefined || only === i) ctx.fillText(line, W / 2, top + b.size * b.lh * (i + 0.5));
  });
}

/**
 * Draws line i clipped to the span [d0, d1] measured from its reading start (right edge for RTL).
 * `shift` moves the clip (not the text) right, for drawing the text's shadow only.
 */
function fillSpan(ctx: CanvasRenderingContext2D, b: TextBlock, top: number, i: number, width: number, d0: number, d1: number, shift = 0) {
  const start = b.dir === 'rtl' ? W / 2 + width / 2 : W / 2 - width / 2;
  const x0 = b.dir === 'rtl' ? start - d1 : start + d0;
  const y = top + b.size * b.lh * (i + 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + shift, y - b.size * 1.2, Math.abs(d1 - d0), b.size * 2.4);
  ctx.clip();
  fillLines(ctx, b, top, i);
  ctx.restore();
}

/** Draw a text block for item g at time t with effect fx. The caller sets the legibility shadow. */
export function drawText(ctx: CanvasRenderingContext2D, fx: TextEffect, g: { start: number; end: number }, t: number, b: TextBlock) {
  const d = Math.max(0.001, g.end - g.start);
  const [enter, exit] = SPEC[fx] ?? SPEC.fade;
  const age = t - g.start;
  const p = easeOut(clamp01(age / Math.min(enter, d * 0.4)));
  const q = smooth(clamp01((g.end - t) / Math.min(exit, d * 0.25)));
  const k = Math.min(1, d / 1.5); // less motion for short items
  const px = pxScale(ctx);
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

  ctx.save();
  ctx.direction = b.dir;
  ctx.font = `${b.size}px ${b.font}`;
  ctx.fillStyle = b.color;
  ctx.globalAlpha = alpha * b.opacity;
  const blockH = b.lines.length * b.size * b.lh;
  if (scale !== 1) {
    const cy = b.top + blockH / 2;
    ctx.translate(W / 2, cy);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -cy);
  }
  const top = b.top + dy;
  if (blur > 0.05) ctx.filter = `blur(${(blur * px).toFixed(2)}px)`;

  if (glow > 0.01) {
    // A soft halo in the text colour under the text, then the text itself.
    ctx.save();
    ctx.shadowColor = rgba(b.color, Math.min(1, glow));
    ctx.shadowBlur = 28 * px;
    fillLines(ctx, b, top);
    ctx.restore();
  }

  if (stagger) {
    // Lines come in one after another, each with a gentle rise.
    const step = Math.min(0.35, (d * 0.3) / b.lines.length);
    const win = Math.min(enter, d * 0.4);
    b.lines.forEach((_, i) => {
      const pi = easeOut(clamp01((age - i * step) / win));
      ctx.globalAlpha = Math.min(pi, q) * b.opacity;
      fillLines(ctx, b, top + (1 - pi) * 20 * k, i);
    });
  } else if (ink !== null && ink < 1) {
    // Ink reveal: lines are written in reading order with a soft leading edge.
    const E = 110, N = 8;
    const widths = b.lines.map((l) => ctx.measureText(l).width);
    const total = widths.reduce((s, w) => s + w + E, 0);
    let at = ink * total;
    const base = alpha * b.opacity;
    b.lines.forEach((_, i) => {
      const span = widths[i] + E;
      const f = Math.min(at, span);
      at -= span;
      if (f <= 0) return;
      ctx.globalAlpha = base;
      if (f - E > 0) fillSpan(ctx, b, top, i, widths[i], -80, f - E);
      for (let s = 0; s < N; s++) {
        ctx.globalAlpha = base * (1 - (s + 0.5) / N);
        fillSpan(ctx, b, top, i, widths[i], f - E + (s * E) / N, f - E + ((s + 1) * E) / N);
      }
    });
  } else {
    fillLines(ctx, b, top);
  }

  if (sweep !== null && sweep > 0 && sweep < 1) {
    // Light sweep: a soft band of light passes once along each line in reading order. Only the halo
    // is drawn (the text goes off-frame and its shadow lands on the letters), so letters never double.
    const B = 150, N = 10, OFF = 4000;
    ctx.filter = 'none';
    ctx.shadowColor = 'rgba(255,248,230,0.95)';
    ctx.shadowBlur = 20 * px;
    ctx.shadowOffsetX = OFF * px;
    ctx.translate(-OFF, 0);
    b.lines.forEach((l, i) => {
      const w = ctx.measureText(l).width;
      const c = sweep! * (w + 2 * B) - B;
      for (let s = 0; s < N; s++) {
        ctx.globalAlpha = alpha * b.opacity * Math.sin(Math.PI * ((s + 0.5) / N));
        fillSpan(ctx, b, top, i, w, c - B + 2 * B * (s / N), c - B + 2 * B * ((s + 1) / N), OFF);
      }
    });
  }
  ctx.restore();
}
