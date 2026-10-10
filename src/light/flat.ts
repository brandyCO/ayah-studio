// Flat 2D versions of the light scenes (reduced motion, battery saver, no WebGL, slow GPU): the same
// palette as a still picture — gradient sky, seeded stars, soft cloud bands, glows. No three.js.
import { rng } from './noise';

function glow(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, a: number) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  x.globalAlpha = a;
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = 1;
}

/** Night sky over a cloud sea, with a crescent and Noor (`glow` brightens Noor). */
export function paintNightFlat(canvas: HTMLCanvasElement, seed = 1, noorGlow = 0) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const x = canvas.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hz = H * 0.66; // horizon
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#070b24');
  sky.addColorStop(0.55, '#141c48');
  sky.addColorStop(1, '#3a3466');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, hz + 2);
  const r = rng(seed);
  for (let i = 0; i < Math.round((W * hz) / 900); i++) {
    const sx = r() * W, sy = Math.pow(r(), 1.3) * hz * 0.95, s = 0.4 + r() ** 3 * 1.4;
    x.globalAlpha = (0.3 + 0.6 * r()) * Math.min(1, (hz - sy) / (hz * 0.25));
    x.fillStyle = '#fff6e6';
    x.beginPath();
    x.arc(sx, sy, s, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  // Crescent high on the left (above the text), with its glow; cut on its own small canvas.
  const mx = W * 0.2, my = H * 0.13, mr = Math.min(W, H) * 0.035;
  glow(x, mx, my, mr * 7, 'rgba(255,233,196,0.5)', 0.5);
  const m = document.createElement('canvas');
  m.width = m.height = Math.ceil(mr * 2 * dpr) + 4;
  const mc = m.getContext('2d')!;
  mc.scale(dpr, dpr);
  mc.fillStyle = '#fff1d6';
  mc.beginPath();
  mc.arc(mr + 1, mr + 1, mr, 0, Math.PI * 2);
  mc.fill();
  mc.globalCompositeOperation = 'destination-out';
  mc.beginPath();
  mc.arc(mr + 1 + mr * 0.42, mr + 1 - mr * 0.22, mr * 0.93, 0, Math.PI * 2);
  mc.fill();
  x.drawImage(m, mx - mr - 1, my - mr - 1, m.width / dpr, m.height / dpr);
  // Cloud sea: layered soft bands, lighter towards the moon.
  const sea = x.createLinearGradient(0, hz, 0, H);
  sea.addColorStop(0, '#2c2a58');
  sea.addColorStop(0.4, '#262b5a');
  sea.addColorStop(1, '#0d1233');
  x.fillStyle = sea;
  x.fillRect(0, hz, W, H - hz);
  for (let i = 0; i < 26; i++) {
    const cy = hz + Math.pow(r(), 1.6) * (H - hz), cx = r() * W, cw = W * (0.25 + r() * 0.5) * (1 + (cy - hz) / (H - hz));
    x.save();
    x.translate(cx, cy);
    x.scale(1, 0.18);
    glow(x, 0, 0, cw, 'rgba(109,103,153,0.9)', 0.35 + 0.3 * r());
    x.restore();
  }
  glow(x, W * 0.35, hz + 6, W * 0.5, 'rgba(184,138,142,0.6)', 0.35);
  // Noor: low and to the side, never over the text.
  const nx = W * 0.72, ny = H * 0.8;
  glow(x, nx, ny, 70 * (1 + noorGlow * 0.5), 'rgba(255,201,119,0.55)', 0.8);
  glow(x, nx, ny, 14 * (1 + noorGlow * 0.4), 'rgba(255,244,220,1)', 1);
}
