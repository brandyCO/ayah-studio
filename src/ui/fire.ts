// Living fire for the streak power-up (owner 2026-11-11: "the feel of fire and jumping up", like Duolingo's streak
// moment, in our own look). A small particle fire on two canvases: one behind the characters and the number, one in
// front of the characters (fainter), so they stand inside the flames and stay visible. Each particle is a soft round
// sprite drawn additively; it is born hot (white-yellow) at its emitter, rises with buoyancy and a little turbulence,
// cools through orange and red and fades out. Emitters are ellipses (a body), lines (the ground, the top of a
// number) and bursts (ignition, a landing). Pure drawing, no DOM work per frame.

export type Palette = readonly string[];
/** Fire colours from hottest to coolest, per power level (1–3 orange fire, 4 gold, 5 dawn rose and gold). */
export function firePalette(level: number): Palette {
  if (level >= 5) return ['#ffe6c8', '#ffd0a0', '#ffd27a', '#ffa86b', '#ff7a8f', '#d9488a', '#6b1650'];
  if (level === 4) return ['#fff0b8', '#ffe07a', '#ffd84a', '#ffb21f', '#ff8a10', '#d0580a', '#6a2604'];
  return ['#ffe9a0', '#ffd25a', '#ffaa2a', '#ff8f1f', '#f25c12', '#c8300c', '#5a1206'];
}

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; seed: number; front: boolean; ember: boolean }
export interface Emitter {
  kind: 'body' | 'line';
  /** Centre x, y and size (css px). For a body: the ellipse the flames rise from; for a line: its width (h unused). */
  x: number; y: number; w: number; h: number;
  /** Flames a second at heat 1. */
  rate: number;
  /** 0 off … 1 normal … 2 a flare. */
  heat: number;
  /** Share of this emitter's flames drawn in front. */
  front: number;
  acc: number;
}

const MAX = 1100;

export class Fire {
  private parts: P[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private bx: CanvasRenderingContext2D;
  private fx: CanvasRenderingContext2D;
  private dpr: number;
  private w = 0;
  private h = 0;
  private t = 0;
  emitters: Emitter[] = [];

  constructor(private back: HTMLCanvasElement, private front: HTMLCanvasElement, palette: Palette, lite = false) {
    // Fire is soft: one canvas pixel per CSS pixel looks the same and costs a fraction on 3× screens.
    this.dpr = lite ? 0.75 : 1;
    this.bx = back.getContext('2d')!;
    this.fx = front.getContext('2d')!;
    for (const c of palette) this.sprites.push(sprite(c));
    this.resize();
  }

  resize() {
    const r = this.back.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    for (const c of [this.back, this.front]) { c.width = Math.round(r.width * this.dpr); c.height = Math.round(r.height * this.dpr); }
  }

  emitter(e: Omit<Emitter, 'acc'>): Emitter { const x = { ...e, acc: 0 }; this.emitters.push(x); return x; }

  /** A burst of `n` flames from (x, y), thrown outwards (`spread` px/s), `up` lifting them. Some are embers. */
  burst(x: number, y: number, n: number, spread: number, up = 0.4, ring = false) {
    for (let i = 0; i < n && this.parts.length < MAX; i++) {
      const a = ring ? (Math.random() < 0.5 ? Math.PI : 0) + (Math.random() - 0.5) * 0.7 : Math.random() * Math.PI * 2;
      const s = spread * (0.35 + Math.random() * 0.75);
      const ember = Math.random() < 0.3;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * (ring ? 0.25 : 1) - spread * up, life: 0,
        max: ember ? 0.9 + Math.random() * 0.9 : 0.35 + Math.random() * 0.45, r: ember ? 1.6 + Math.random() * 2.2 : 14 + Math.random() * 26,
        seed: Math.random() * 100, front: Math.random() < 0.12, ember });
    }
  }

  /** Embers drifting up from (x, y) within width w. */
  embers(x: number, y: number, w: number, n: number) {
    for (let i = 0; i < n && this.parts.length < MAX; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * w, y, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 140, life: 0,
        max: 1 + Math.random() * 1.4, r: 1.4 + Math.random() * 2, seed: Math.random() * 100, front: Math.random() < 0.4, ember: true });
    }
  }

  step(dt: number) {
    this.t += dt;
    for (const e of this.emitters) {
      if (e.heat <= 0.01) continue;
      e.acc += e.rate * e.heat * dt;
      while (e.acc >= 1 && this.parts.length < MAX) {
        e.acc -= 1;
        this.spawn(e);
      }
      if (e.acc > 4) e.acc = 0;
    }
    const t = this.t;
    let j = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      // Buoyancy, drag and a little sideways turbulence.
      p.vy -= (p.ember ? 60 : 240) * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - (p.ember ? 0.6 : 1.4) * dt;
      p.vx += Math.sin(p.y * 0.035 + t * 7 + p.seed) * (p.ember ? 260 : 150) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.parts[j++] = p;
    }
    this.parts.length = j;
  }

  private spawn(e: Emitter) {
    let x: number, y: number, vx: number, edge = 1;
    if (e.kind === 'body') {
      // Mostly round the edges of the ellipse (the outline burns), some inside.
      const a = Math.random() * Math.PI * 2;
      const k = Math.random() < 0.7 ? 0.8 + Math.random() * 0.25 : Math.random() * 0.8;
      x = e.x + Math.cos(a) * e.w / 2 * k;
      y = e.y + Math.sin(a) * e.h / 2 * k;
      // Flames lean in towards the middle as they rise: the aura narrows into tongues over the head.
      vx = (e.x - x) * (0.8 + Math.random() * 0.8);
      edge = Math.abs(Math.cos(a)) * k;
    } else {
      x = e.x + (Math.random() - 0.5) * e.w;
      y = e.y;
      vx = (Math.random() - 0.5) * 30;
    }
    const big = e.kind === 'body' ? e.w : Math.max(50, e.w * 0.35);
    const ember = Math.random() < 0.025;
    this.parts.push({ x, y, vx, vy: -(e.kind === 'body' ? 160 : 110) * (0.7 + Math.random() * 0.6) * Math.min(1.5, 0.5 + e.heat * 0.5), life: 0,
      max: ember ? 1.1 + Math.random() : (0.5 + Math.random() * 0.4) * Math.min(1.4, 0.8 + e.heat * 0.25),
      r: ember ? 1.5 + Math.random() * 2 : big * (0.17 + Math.random() * 0.15) * Math.min(1.35, 0.75 + e.heat * 0.3),
      seed: Math.random() * 100, front: edge > 0.5 && Math.random() < e.front, ember });
  }

  draw() {
    const d = this.dpr;
    for (const [c, cv] of [[this.bx, this.back], [this.fx, this.front]] as const) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(d, 0, 0, d, 0, 0);
      c.globalCompositeOperation = 'lighter';
    }
    const n = this.sprites.length;
    for (const p of this.parts) {
      const f = p.life / p.max;
      const c = p.front ? this.fx : this.bx;
      if (p.ember) {
        c.globalAlpha = (1 - f) * (0.6 + 0.4 * Math.sin(p.seed + this.t * 30));
        const s = this.sprites[1];
        const r = p.r * 2.4;
        c.drawImage(s, p.x - r, p.y - r, r * 2, r * 2);
        continue;
      }
      // Hot and small at birth, swelling and cooling, then shrinking away as smoke would.
      const idx = Math.min(n - 1, Math.floor(f * 1.05 * n * (0.55 + f * 0.6)));
      // Flames narrow and stretch as they rise, like tongues.
      const grow = f < 0.2 ? 0.6 + f * 2 : 1 - (f - 0.2) * 0.8;
      const r = p.r * grow;
      const tall = 1.5 + f * 1.2;
      const a = (f < 0.06 ? f / 0.06 : 1) * (1 - f) ** 1.1;
      c.globalAlpha = Math.min(1, a * (p.front ? 0.26 : 0.6) * Math.min(1, p.r / 12));
      c.drawImage(this.sprites[idx], p.x - r, p.y - r * tall * 0.7, r * 2, r * tall);
    }
    this.bx.globalAlpha = 1; this.fx.globalAlpha = 1;
  }

  get count() { return this.parts.length; }
  get size() { return [this.w, this.h] as const; }
}

/** A soft round blob of one colour (bright centre, feathered edge). */
function sprite(color: string): HTMLCanvasElement {
  // A soft teardrop: a round body with a narrower tip above it.
  const W = 64, H = 96;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const blob = (cx: number, cy: number, r: number, a: number) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hexA(color, a));
    g.addColorStop(0.4, hexA(color, a * 0.7));
    g.addColorStop(0.75, hexA(color, a * 0.2));
    g.addColorStop(1, hexA(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  };
  blob(W / 2, H * 0.66, W / 2, 1);
  blob(W / 2, H * 0.4, W * 0.32, 0.6);
  blob(W / 2, H * 0.2, W * 0.18, 0.4);
  return c;
}
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
