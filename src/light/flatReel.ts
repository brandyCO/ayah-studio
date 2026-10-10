// The light reel backgrounds as flat 2D pictures, for devices without WebGL: the same palettes, a
// few soft glows that drift slowly. Pure in t (no three.js), drawn in the reel's 1080×1920 units.
import { rng } from './noise';

type Ctx = CanvasRenderingContext2D;
const W = 1080, H = 1920;

function vgrad(x: Ctx, stops: [number, string][], y0 = 0, y1 = H) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  x.fillStyle = g;
  x.fillRect(0, y0, W, y1 - y0);
}

function glow(x: Ctx, cx: number, cy: number, r: number, color: string, a: number, sy = 1) {
  x.save();
  x.translate(cx, cy);
  x.scale(1, sy);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = a;
  x.fillStyle = g;
  x.fillRect(-r, -r, r * 2, r * 2);
  x.restore();
}

function stars(x: Ctx, seed: number, n: number, maxY: number, t: number) {
  const r = rng(seed);
  x.fillStyle = '#fff6e6';
  for (let i = 0; i < n; i++) {
    const sx = r() * W, sy = r() * maxY, s = 1 + r() ** 3 * 3, ph = r() * 6.28;
    x.globalAlpha = (0.35 + 0.5 * r()) * (0.7 + 0.3 * Math.sin(t * 0.5 + ph));
    x.fillRect(sx, sy, s, s);
  }
  x.globalAlpha = 1;
}

export function paintLightFlat(x: Ctx, id: string, t: number) {
  const r = rng(7);
  const drift = (k: number) => Math.sin(t * 0.05 + k) * 40;
  switch (id) {
    case 'dawn':
      vgrad(x, [[0, '#1a2350'], [0.4, '#6a5a8c'], [0.55, '#e8a898'], [0.6, '#e8bfae'], [1, '#4a3e6c']]);
      glow(x, W * 0.6, H * 0.55, 600, 'rgba(255,216,160,0.9)', 0.6, 0.5);
      for (let i = 0; i < 14; i++) glow(x, r() * W + drift(i), H * (0.62 + r() * 0.38), 300 + r() * 300, 'rgba(232,191,174,0.9)', 0.35, 0.22);
      break;
    case 'stars':
      vgrad(x, [[0, '#04061a'], [0.6, '#0c1238'], [1, '#1e1e48']]);
      stars(x, 3, 700, H * 0.8, t);
      for (let i = 0; i < 6; i++) glow(x, W * (0.1 + i * 0.16), H * (0.75 - i * 0.12), 220, i % 2 ? 'rgba(231,154,168,0.6)' : 'rgba(138,118,208,0.6)', 0.18);
      break;
    case 'aurora':
      vgrad(x, [[0, '#04071c'], [0.45, '#0d1336'], [0.62, '#26254f']], 0, H * 0.62);
      vgrad(x, [[0, '#2a2852'], [1, '#05081a']], H * 0.62, H);
      stars(x, 4, 400, H * 0.55, t);
      for (let i = 0; i < 7; i++) glow(x, W * (0.1 + i * 0.14) + drift(i), H * 0.5, 260, i % 2 ? 'rgba(231,154,168,0.8)' : 'rgba(255,207,138,0.7)', 0.35, 1.8);
      break;
    case 'lanterns':
      vgrad(x, [[0, '#0b1030'], [0.45, '#1f2456'], [0.6, '#6a4a6e']], 0, H * 0.6);
      vgrad(x, [[0, '#4a3a62'], [1, '#0a0d26']], H * 0.6, H);
      glow(x, W * 0.55, H * 0.6, 520, 'rgba(232,166,160,0.8)', 0.5, 0.5);
      for (let i = 0; i < 40; i++) {
        const lx = r() * W, ly = H * 0.6 - ((r() * H * 0.55 + t * 12 * (0.6 + r())) % (H * 0.55)), s = 10 + r() * 22;
        glow(x, lx, ly, s * 3, 'rgba(255,184,92,0.9)', 0.7);
        x.fillStyle = '#ffd58a';
        x.globalAlpha = 0.9;
        x.fillRect(lx - s * 0.35, ly - s * 0.5, s * 0.7, s);
        glow(x, lx, H * 1.2 - ly, s * 2.5, 'rgba(255,184,92,0.6)', 0.35, 1.6);
      }
      x.globalAlpha = 1;
      break;
    default: // rays
      vgrad(x, [[0, '#26334f'], [0.5, '#6f7494'], [0.8, '#d9bc9c'], [1, '#c4b1b8']]);
      x.save();
      x.globalCompositeOperation = 'screen';
      for (let i = 0; i < 9; i++) {
        const a = -0.2 + i * 0.09 + Math.sin(t * 0.05 + i) * 0.02;
        x.save();
        x.translate(W * 0.1, -100);
        x.rotate(-a);
        const g = x.createLinearGradient(0, 0, 0, H * 1.2);
        g.addColorStop(0, 'rgba(255,241,200,0.35)');
        g.addColorStop(1, 'rgba(255,241,200,0)');
        x.fillStyle = g;
        x.fillRect(-30 - r() * 60, 0, 60 + r() * 120, H * 1.2);
        x.restore();
      }
      x.restore();
      for (let i = 0; i < 10; i++) glow(x, r() * W + drift(i), H * (0.5 + r() * 0.5), 400, 'rgba(242,226,204,0.9)', 0.35, 0.3);
  }
}
