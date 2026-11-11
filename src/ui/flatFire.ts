// Cartoon fire for the streak power-up (owner 2026-11-11: "similar to Duolingo, the feel of fire and jumping up"; the
// glowing particle fire before it was rejected). Flat, chunky shapes in the app's character style: every flame is a
// solid teardrop tongue with a darker rim, laid in three layers (outer, middle, hot core), tips swaying and licking up.
// Tongues pinch off as little drops that rise and shrink; bursts throw flame shards, four-point sparks and rings.
// Two canvases: behind the character (the big silhouette) and in front of it (low tongues at its feet, so it stands
// inside the fire and its face stays clear). No glow, no blur: solid fills only, so it stays crisp and cheap.

export interface FlatPalette { edge: string; outer: string; mid: string; inner: string; core: string; spark: string }
/** Per power level: 1–3 orange, 4 gold, 5 dawn rose and gold. */
export function flatPalette(level: number): FlatPalette {
  if (level >= 5) return { edge: '#a3245e', outer: '#ff4f86', mid: '#ff9562', inner: '#ffcf5c', core: '#fff3d6', spark: '#ffe9a8' };
  if (level === 4) return { edge: '#b86200', outer: '#ffa600', mid: '#ffc81a', inner: '#ffe766', core: '#fffbe2', spark: '#fff3a0' };
  return { edge: '#c2330a', outer: '#ff5a00', mid: '#ff9500', inner: '#ffd23f', core: '#fff4c2', spark: '#ffe27a' };
}

/** One character's fire: set its place and heat every frame. */
export interface Aura { cx: number; foot: number; w: number; h: number; lift: number; heat: number }

interface Tongue { u: number; ph: number; sp: number; k: number }
interface Bit {
  kind: 'drop' | 'shard' | 'spark' | 'ring';
  x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; rot: number; front: boolean;
}

const TAU = Math.PI * 2;
const MAX_BITS = 260;

export class FlatFire {
  private bx: CanvasRenderingContext2D;
  private fx: CanvasRenderingContext2D;
  private dpr: number;
  private t = 0;
  private bits: Bit[] = [];
  private back: Tongue[] = [];
  private front: Tongue[] = [];
  private dropAcc: number[] = [];
  auras: Aura[] = [];

  constructor(private cb: HTMLCanvasElement, private cf: HTMLCanvasElement, private pal: FlatPalette, lite = false) {
    this.dpr = Math.min(lite ? 1.25 : 2, window.devicePixelRatio || 1);
    this.bx = cb.getContext('2d')!;
    this.fx = cf.getContext('2d')!;
    // Tongues across the body, the middle ones tallest; each flickers at its own speed.
    const n = 9;
    for (let i = 0; i < n; i++) this.back.push({ u: -1 + (2 * i) / (n - 1), ph: Math.random() * TAU, sp: 5 + Math.random() * 4, k: 0.85 + Math.random() * 0.3 });
    for (let i = 0; i < 5; i++) this.front.push({ u: -1 + (2 * i) / 4 + (Math.random() - 0.5) * 0.2, ph: Math.random() * TAU, sp: 6 + Math.random() * 5, k: 0.6 + Math.random() * 0.8 });
    this.resize();
  }

  resize() {
    const r = this.cb.getBoundingClientRect();
    for (const c of [this.cb, this.cf]) { c.width = Math.round(r.width * this.dpr); c.height = Math.round(r.height * this.dpr); }
  }

  aura(a: Omit<Aura, 'lift' | 'heat'>): Aura { const x = { ...a, lift: 0, heat: 0 }; this.auras.push(x); this.dropAcc.push(0); return x; }

  /** Flame shards thrown out from (x, y), a few sparks with them. `flat` keeps them low (a landing). */
  burst(x: number, y: number, n: number, speed: number, flat = false) {
    for (let i = 0; i < n && this.bits.length < MAX_BITS; i++) {
      const a = flat ? (Math.random() < 0.5 ? Math.PI : 0) + (Math.random() - 0.5) * 0.9 : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const s = speed * (0.45 + Math.random() * 0.75);
      this.bits.push({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * (flat ? 0.35 : 1) - (flat ? speed * 0.25 : 0),
        r: 9 + Math.random() * 13, life: 0, max: 0.45 + Math.random() * 0.4, rot: 0, front: Math.random() < 0.35 });
    }
    this.sparks(x, y, Math.round(n / 3), speed * 1.1);
  }

  sparks(x: number, y: number, n: number, speed: number) {
    for (let i = 0; i < n && this.bits.length < MAX_BITS; i++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      this.bits.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.2, r: 6 + Math.random() * 9,
        life: 0, max: 0.5 + Math.random() * 0.45, rot: Math.random() * TAU, front: true });
    }
  }

  /** A flat ring on the ground that opens out and thins. */
  ring(x: number, y: number, size: number) {
    this.bits.push({ kind: 'ring', x, y, vx: 0, vy: 0, r: size, life: 0, max: 0.55, rot: 0, front: false });
  }

  step(dt: number) {
    this.t += dt;
    // Tips pinch off as drops while burning.
    this.auras.forEach((a, i) => {
      if (a.heat < 0.3) return;
      this.dropAcc[i] += dt * 9 * a.heat;
      while (this.dropAcc[i] >= 1 && this.bits.length < MAX_BITS) {
        this.dropAcc[i] -= 1;
        const u = (Math.random() - 0.5) * 1.5;
        const top = a.foot + a.lift - a.h * (0.75 + 0.45 * (1 - Math.abs(u))) * Math.min(1.3, a.heat);
        this.bits.push({ kind: 'drop', x: a.cx + u * a.w * 0.45, y: top, vx: (Math.random() - 0.5) * 30, vy: -140 - Math.random() * 120,
          r: a.w * (0.07 + Math.random() * 0.06), life: 0, max: 0.4 + Math.random() * 0.35, rot: 0, front: false });
      }
    });
    let j = 0;
    for (const b of this.bits) {
      b.life += dt;
      if (b.life >= b.max) continue;
      if (b.kind === 'shard') { b.vx *= 1 - 3 * dt; b.vy = b.vy * (1 - 3 * dt) - 260 * dt; }
      else if (b.kind === 'spark') { b.vx *= 1 - 2.5 * dt; b.vy = b.vy * (1 - 2.5 * dt) + 80 * dt; b.rot += dt * 4; }
      else if (b.kind === 'drop') b.vx += Math.sin(this.t * 9 + b.r) * 60 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      this.bits[j++] = b;
    }
    this.bits.length = j;
  }

  draw() {
    const d = this.dpr;
    for (const [c, cv] of [[this.bx, this.cb], [this.fx, this.cf]] as const) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(d, 0, 0, d, 0, 0);
      c.lineJoin = 'round';
    }
    const p = this.pal;
    for (const b of this.bits) if (b.kind === 'ring') this.drawBit(this.bx, b);
    for (const a of this.auras) {
      if (a.heat < 0.3) continue;
      // Behind: the tall silhouette. Rim first (every tongue a little larger in the dark colour), then the layers.
      this.layer(this.bx, a, this.back, 1, p.edge, 3.5);
      this.layer(this.bx, a, this.back, 1, p.outer, 0);
      this.layer(this.bx, a, this.back, 0.74, p.mid, 0);
      this.layer(this.bx, a, this.back, 0.5, p.inner, 0);
      this.layer(this.bx, a, this.back, 0.28, p.core, 0);
    }
    for (const b of this.bits) if (b.kind === 'drop' || (b.kind === 'shard' && !b.front)) this.drawBit(this.bx, b);
    for (const a of this.auras) {
      if (a.heat < 0.02) continue;
      // In front: low tongues round the feet.
      this.feet(this.fx, a, p.edge, 1, 3);
      this.feet(this.fx, a, p.outer, 1, 0);
      this.feet(this.fx, a, p.mid, 0.66, 0);
      this.feet(this.fx, a, p.inner, 0.38, 0);
    }
    for (const b of this.bits) if ((b.kind === 'shard' && b.front) || b.kind === 'spark') this.drawBit(this.fx, b);
  }

  private layer(c: CanvasRenderingContext2D, a: Aura, ts: Tongue[], k: number, color: string, grow: number) {
    const t = this.t, heat = Math.min(1.25, a.heat);
    const H = a.h * heat, foot = a.foot + a.lift;
    c.fillStyle = color;
    c.beginPath();
    for (const g of ts) {
      const au = Math.abs(g.u);
      const flick = 1 + 0.16 * Math.sin(t * g.sp + g.ph) + 0.08 * Math.sin(t * g.sp * 2.3 + g.ph * 1.7);
      const len = H * (0.5 + 0.42 * (1 - au * au)) * g.k * flick * k;
      const r = a.w * (0.24 - 0.07 * au) * Math.max(0.5, Math.min(1.2, heat)) * (0.55 + 0.45 * k);
      const bx = a.cx + g.u * a.w * 0.44;
      const by = foot - a.h * (0.08 + 0.12 * (1 - au)) - r * 0.3;
      // Outer tongues lean out, then the tips curl back in, swaying.
      const sway = (Math.sin(t * g.sp * 0.6 + g.ph) * 0.35 + g.u * 0.25) * r;
      tongue(c, bx, by, r + grow, len + grow * 1.6, sway);
    }
    // A solid body joining the tongues' bases, so the silhouette has no holes.
    const r0 = a.w * 0.5 * Math.max(0.5, Math.min(1.15, heat)) * (0.6 + 0.4 * k);
    c.ellipse(a.cx, foot - a.h * 0.32, r0 + grow, a.h * 0.32 * k + grow, 0, 0, TAU);
    c.fill();
  }

  private feet(c: CanvasRenderingContext2D, a: Aura, color: string, k: number, grow: number) {
    const t = this.t, heat = Math.min(1.4, a.heat);
    const foot = a.foot + a.lift;
    c.fillStyle = color;
    c.beginPath();
    for (const g of this.front) {
      const flick = 1 + 0.22 * Math.sin(t * g.sp + g.ph);
      const len = a.h * 0.3 * heat * g.k * flick * k * (1 - 0.35 * Math.abs(g.u));
      const r = a.w * 0.12 * Math.max(0.5, heat) * (0.5 + 0.5 * k);
      tongue(c, a.cx + g.u * a.w * 0.48, foot + r * 0.2, r + grow, len + grow * 1.6, Math.sin(t * g.sp * 0.7 + g.ph) * r * 0.5);
    }
    c.fill();
  }

  private drawBit(c: CanvasRenderingContext2D, b: Bit) {
    const f = b.life / b.max, p = this.pal;
    if (b.kind === 'ring') {
      c.globalAlpha = 1 - f;
      c.strokeStyle = p.mid;
      c.lineWidth = 10 * (1 - f) + 1;
      c.beginPath();
      c.ellipse(b.x, b.y, b.r * (0.2 + f * 1.3), b.r * 0.28 * (0.2 + f * 1.3), 0, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
      return;
    }
    // Pop in, hold, shrink away: cartoon timing.
    const s = f < 0.15 ? 0.4 + (f / 0.15) * 0.75 : f < 0.3 ? 1.15 - ((f - 0.15) / 0.15) * 0.15 : 1 - ((f - 0.3) / 0.7) ** 1.6;
    const r = b.r * Math.max(0, s);
    if (r < 0.5) return;
    if (b.kind === 'spark') {
      c.fillStyle = f < 0.5 ? p.core : p.spark;
      star(c, b.x, b.y, r, b.rot);
      c.fill();
      return;
    }
    // Drops and shards: a little flame pointing the way it flies (drops point up).
    const ang = b.kind === 'drop' ? 0 : Math.atan2(b.vx, -b.vy);
    c.save();
    c.translate(b.x, b.y);
    c.rotate(ang);
    c.beginPath(); tongue(c, 0, 0, r + 2, r * 2.4 + 3, 0); c.fillStyle = p.edge; c.fill();
    c.beginPath(); tongue(c, 0, 0, r, r * 2.4, 0); c.fillStyle = b.kind === 'drop' ? p.outer : p.mid; c.fill();
    c.beginPath(); tongue(c, 0, r * 0.25, r * 0.5, r * 1.2, 0); c.fillStyle = p.inner; c.fill();
    c.restore();
  }
}

/** A flame tongue: a round base at (x, y), radius r, rising `len` to a tip that sways sideways. Adds to the path. */
function tongue(c: CanvasRenderingContext2D, x: number, y: number, r: number, len: number, sway: number) {
  const tx = x + sway, ty = y - len;
  c.moveTo(tx, ty);
  c.bezierCurveTo(tx + r * 0.25, ty + len * 0.3, x + r * 1.05, y - len * 0.25, x + r, y);
  c.arc(x, y, r, 0, Math.PI);
  c.bezierCurveTo(x - r * 1.05, y - len * 0.25, tx - r * 0.15, ty + len * 0.38, tx, ty);
  c.closePath();
}

/** A four-point sparkle. */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4, rr = i % 2 ? r * 0.32 : r;
    const px = x + Math.sin(a) * rr, py = y - Math.cos(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}
