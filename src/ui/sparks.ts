// Light particles for the reward moments (celebrate.ts): a burst of glowing sparks and four-point
// glints that fly out, slow down and drift with a little gravity, twinkling as they fade, then a
// few slow motes rising. One canvas, pre-drawn sprites, device pixel ratio aware; stops by itself.

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; spr: number; star: boolean; tw: number; g: number }

function sprite(color: string, px: number, star: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d')!;
  const r = px / 2;
  if (star) {
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rad = i % 2 ? r * 0.16 : r;
      x.lineTo(r + rad * Math.cos(a), r + rad * Math.sin(a));
    }
    x.closePath();
    x.fill();
  } else {
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.2, color);
    g.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.35)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, px, px);
  }
  return c;
}

export interface Sparks { burst(x: number, y: number, n: number, power?: number): void; motes(on: boolean): void; stop(): void }

/** Starts the particle layer on `canvas` (sized to its box) with these colours (rgba(…, 1) strings). */
export function sparks(canvas: HTMLCanvasElement, colors: string[]): Sparks {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ctx = canvas.getContext('2d')!;
  const fit = () => {
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  };
  fit();
  const sprites = colors.flatMap((c) => [sprite(c, 64, false), sprite(c, 64, true)]);
  const ps: P[] = [];
  let mote = false;
  let lastMote = 0;
  let raf = 0;
  let last = performance.now();
  let stopped = false;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (canvas.width !== Math.round(canvas.clientWidth * dpr)) fit();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    if (mote && now - lastMote > 140) {
      lastMote = now;
      const w = canvas.clientWidth;
      ps.push({ x: rand(w * 0.2, w * 0.8), y: canvas.clientHeight * rand(0.45, 0.62), vx: rand(-6, 6), vy: rand(-26, -14), life: 0, max: rand(2.6, 4), size: rand(5, 10), spr: Math.floor(rand(0, colors.length)) * 2, star: false, tw: rand(0, 6), g: -2 });
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) { ps.splice(i, 1); continue; }
      const drag = Math.pow(p.star ? 0.2 : 0.12, dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const fade = k < 0.08 ? k / 0.08 : Math.pow(1 - k, 1.4);
      const twinkle = p.star ? 0.65 + 0.35 * Math.sin(p.tw + p.life * 14) : 1;
      const s = p.size * (p.star ? 1 - k * 0.4 : 1 - k * 0.6) * dpr;
      ctx.globalAlpha = Math.max(0, fade * twinkle);
      ctx.drawImage(sprites[p.spr + (p.star ? 1 : 0)], p.x * dpr - s / 2, p.y * dpr - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    if (!stopped && (ps.length || mote)) raf = requestAnimationFrame(frame);
    else raf = 0;
  };
  const kick = () => { if (!raf && !stopped) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  return {
    burst(x, y, n, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const star = i % 4 === 0;
        const v = rand(140, 420) * power * (star ? 0.8 : 1);
        ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(40, 120) * power, life: 0, max: rand(1.1, 2.1), size: star ? rand(16, 28) : rand(6, 14),
          spr: Math.floor(rand(0, colors.length)) * 2, star, tw: rand(0, 6), g: rand(120, 220) });
      }
      kick();
    },
    motes(on) { mote = on; if (on) kick(); },
    stop() { stopped = true; cancelAnimationFrame(raf); },
  };
}
