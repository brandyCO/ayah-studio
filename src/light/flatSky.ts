// The Home sky's flat 2D version (reduced motion, battery saver, no WebGL, slow GPU): the same
// stars, threads and circles as a still picture over a gradient sky and soft cloud bands. It only
// redraws when the viewer pans. No three.js.
import { rng } from './noise';
import { ringOffset, type Spot } from './skyLayout';

export interface FlatStar { spot: Spot; bright: number; size: number; warm: number; lit: boolean; next?: Spot }
export interface FlatCircle { spot: Spot; stars: { status: 'free' | 'taken' | 'done'; color: string }[] }

/** Screen position of a sky spot in the flat view looking at azimuth `look`. */
export function flatProject(s: Spot, look: number, W: number, H: number) {
  const k = (H * 0.66) / 0.95;
  return { x: W / 2 + (s.off - look) * k, y: H * 0.66 - s.el * k };
}

function glow(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, a: number) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  x.globalAlpha = a;
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = 1;
}

export function paintSkyFlat(canvas: HTMLCanvasElement, look: number, stars: FlatStar[], circles: FlatCircle[], seed = 9) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const x = canvas.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hz = H * 0.66;
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#04071c');
  sky.addColorStop(0.6, '#0f1540');
  sky.addColorStop(1, '#3a3466');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, hz + 2);
  // Background dust drifts with the view, slower than the stars (depth).
  const r = rng(seed);
  for (let i = 0; i < Math.round((W * hz) / 700); i++) {
    const sx = ((r() * W * 3 - look * 120) % W + W) % W, sy = Math.pow(r(), 1.3) * hz * 0.97, s = 0.3 + r() ** 3 * 1.1;
    x.globalAlpha = (0.2 + 0.4 * r()) * Math.min(1, (hz - sy) / (hz * 0.2));
    x.fillStyle = '#fff6e6';
    x.beginPath();
    x.arc(sx, sy, s, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  // Threads, then stars.
  x.strokeStyle = 'rgba(255,226,176,0.22)';
  x.lineWidth = 1;
  for (const s of stars) {
    if (!s.next) continue;
    const a = flatProject(s.spot, look, W, H), b = flatProject(s.next, look, W, H);
    x.beginPath();
    x.moveTo(a.x, a.y);
    x.lineTo(b.x, b.y);
    x.stroke();
  }
  for (const s of stars) {
    const p = flatProject(s.spot, look, W, H);
    if (p.x < -20 || p.x > W + 20) continue;
    if (!s.lit) {
      x.globalAlpha = 0.16;
      x.fillStyle = '#c9c3e6';
      x.beginPath();
      x.arc(p.x, p.y, 0.9, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 1;
      continue;
    }
    const c = s.warm > 0.5 ? 'rgba(255,213,138,1)' : 'rgba(255,246,230,1)';
    glow(x, p.x, p.y, 9 * s.size, c, 0.5 * s.bright);
    glow(x, p.x, p.y, 2.6 * s.size, c, s.bright);
  }
  for (const ci of circles) {
    for (let j = 1; j <= 30; j++) {
      const o = ringOffset(j), st = ci.stars[j - 1]?.status ?? 'free';
      const p = flatProject({ off: ci.spot.off + o.dx / Math.cos(ci.spot.el), el: ci.spot.el + o.dy }, look, W, H);
      if (st === 'free') glow(x, p.x, p.y, 3, 'rgba(201,195,230,1)', 0.35);
      else glow(x, p.x, p.y, st === 'done' ? 7 : 5.5, st === 'done' ? 'rgba(255,246,230,1)' : ci.stars[j - 1].color, st === 'done' ? 1 : 0.85);
    }
  }
  // Cloud sea: layered soft bands.
  const sea = x.createLinearGradient(0, hz, 0, H);
  sea.addColorStop(0, '#2c2a58');
  sea.addColorStop(0.45, '#262b5a');
  sea.addColorStop(1, '#0b1030');
  x.fillStyle = sea;
  x.fillRect(0, hz, W, H - hz);
  const rc = rng(seed + 1);
  for (let i = 0; i < 24; i++) {
    const cy = hz + Math.pow(rc(), 1.6) * (H - hz), cx = ((rc() * W * 2 - look * 260) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
    const cw = W * (0.25 + rc() * 0.5) * (1 + (cy - hz) / (H - hz));
    x.save();
    x.translate(cx, cy);
    x.scale(1, 0.18);
    glow(x, 0, 0, cw, 'rgba(109,103,153,0.9)', 0.3 + 0.3 * rc());
    x.restore();
  }
  glow(x, W * 0.3, hz + 6, W * 0.5, 'rgba(184,138,142,0.6)', 0.3);
  // Noor, low and to the side.
  glow(x, W * 0.74, H * 0.8, 60, 'rgba(255,201,119,0.55)', 0.8);
  glow(x, W * 0.74, H * 0.8, 12, 'rgba(255,244,220,1)', 1);
}
