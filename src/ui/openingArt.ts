// The opening's drawing (src/ui/opening.ts), pure in t: the mark of public/icon.svg traced like a pen —
// the two squares of the end-of-ayah rosette one after the other, the inner ring, then the light at the
// centre is lit and blooms. Shared by the worker (drawn off the main thread, so the app starting up
// underneath cannot make it stutter) and the main-thread fallback.

export interface OpeningColours { line: string; ring: string }

/** Seconds: when the drawing is finished (nothing moves after it). */
export const ART_END = 2.7;

const ease = (p: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, p)))) / 2;
const span = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const backOut = (p: number) => { const c = 1.3; const q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

/** Points along the rounded square (512 units), clockwise from the top edge, as the SVG rect runs. */
function squarePoints(): [number, number][] {
  const x0 = 138, x1 = 374, r = 16.52, pts: [number, number][] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 1; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  };
  pts.push([x0 + r, x0], [x1 - r, x0]); corner(x1 - r, x0 + r, -Math.PI / 2);
  pts.push([x1, x1 - r]); corner(x1 - r, x1 - r, 0);
  pts.push([x0 + r, x1]); corner(x0 + r, x1 - r, Math.PI / 2);
  pts.push([x0, x0 + r]); corner(x0 + r, x0 + r, Math.PI);
  return pts;
}
const SQ = squarePoints();
const SQ_LEN: number[] = [0];
for (let i = 1; i < SQ.length; i++) SQ_LEN.push(SQ_LEN[i - 1] + Math.hypot(SQ[i][0] - SQ[i - 1][0], SQ[i][1] - SQ[i - 1][1]));

/** Draws the first p of a square's outline; returns the pen's tip. */
function tracedSquare(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, p: number): [number, number] {
  const want = p * SQ_LEN[SQ_LEN.length - 1];
  ctx.beginPath(); ctx.moveTo(SQ[0][0], SQ[0][1]);
  let tip = SQ[0];
  for (let i = 1; i < SQ.length; i++) {
    if (SQ_LEN[i] <= want) { ctx.lineTo(SQ[i][0], SQ[i][1]); tip = SQ[i]; continue; }
    const f = (want - SQ_LEN[i - 1]) / (SQ_LEN[i] - SQ_LEN[i - 1]);
    tip = [SQ[i - 1][0] + f * (SQ[i][0] - SQ[i - 1][0]), SQ[i - 1][1] + f * (SQ[i][1] - SQ[i - 1][1])];
    ctx.lineTo(tip[0], tip[1]);
    break;
  }
  if (p >= 1) ctx.closePath();
  ctx.stroke();
  return tip;
}

function penTip(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(0.35, `rgba(255,255,255,${0.35 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
}

/** The frame at t seconds. The context is set up in 512-unit mark space (0,0 = the mark's top left). */
export function drawOpening(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number, c: OpeningColours, dpr: number) {
  const C = 256;
  // the glow behind it all, blooming once the centre is lit
  const gp = span(t, 2.0, 2.6);
  if (gp > 0) {
    const sc = gp < 0.5 ? 0.4 + 0.72 * ease(gp * 2) : 1.12 - 0.12 * ease((gp - 0.5) * 2);
    const al = gp < 0.5 ? ease(gp * 2) : 1 - 0.15 * ease((gp - 0.5) * 2);
    const r = 146.32 * sc;
    const g = ctx.createRadialGradient(C, C, 0, C, C, r);
    ctx.globalAlpha = al;
    for (const [o, a] of [[0, 0.95], [0.22, 0.55], [0.6, 0.12], [1, 0]] as const) g.addColorStop(o, withAlpha(c.line, a));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = withAlpha(c.line, 0.55); ctx.shadowBlur = 12 * dpr; // the soft halo of the icon's lines (device pixels)
  ctx.strokeStyle = c.line; ctx.lineWidth = 12.98;
  const pa = ease(span(t, 0.15, 1.25)), pb = ease(span(t, 0.55, 1.65));
  const tips: [number, number, number][] = [];
  if (pa > 0) { const [x, y] = tracedSquare(ctx, pa); if (pa < 1) tips.push([x, y, 1]); }
  if (pb > 0) {
    ctx.save(); ctx.translate(C, C); ctx.rotate(Math.PI / 4); ctx.translate(-C, -C);
    const [x, y] = tracedSquare(ctx, pb);
    ctx.restore();
    if (pb < 1) { const a = Math.PI / 4, dx = x - C, dy = y - C; tips.push([C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a), 1]); }
  }
  const pr = ease(span(t, 1.35, 2.05));
  if (pr > 0) {
    ctx.strokeStyle = c.ring; ctx.lineWidth = 7.14; ctx.globalAlpha = 0.8;
    const a0 = -Math.PI / 2, a1 = a0 + pr * Math.PI * 2;
    ctx.beginPath(); ctx.arc(C, C, 77.88, a0, a1); ctx.stroke();
    ctx.globalAlpha = 1;
    if (pr < 1) tips.push([C + 77.88 * Math.cos(a1), C + 77.88 * Math.sin(a1), 0.7]);
  }
  ctx.shadowBlur = 0;
  for (const [x, y, a] of tips) penTip(ctx, x, y, a);
  // the light at the centre
  const cp = span(t, 1.95, 2.4);
  if (cp > 0) {
    const r = 25.96 * Math.max(0, backOut(cp));
    const g = ctx.createRadialGradient(C, C, 0, C, C, r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.55, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = Math.min(1, cp / 0.6);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** '#rrggbb' → rgba with alpha a. */
function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

/** Runs the drawing on a canvas (worker or main thread) from `start` (ms since the epoch). */
export function runOpening(canvas: HTMLCanvasElement | OffscreenCanvas, cssPx: number, markPx: number, dpr: number, c: OpeningColours, start: number) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  const unit = (markPx / 512) * dpr, off = ((cssPx - markPx) / 2) * dpr;
  const raf: (f: () => void) => void = typeof requestAnimationFrame === 'function'
    ? (f) => requestAnimationFrame(f) : (f) => setTimeout(f, 16);
  const now = () => performance.timeOrigin + performance.now();
  const frame = () => {
    const t = (now() - start) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(unit, 0, 0, unit, off, off);
    drawOpening(ctx, t, c, dpr);
    if (t < ART_END) raf(frame);
  };
  frame();
}
