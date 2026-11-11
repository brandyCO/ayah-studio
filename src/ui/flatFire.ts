// Cartoon fire for the streak power-up (owner 2026-11-11: "similar to Duolingo, the feel of fire and jumping up"; the
// glowing particle fire before it was rejected). Flat, chunky shapes in the app's character style: every flame is a
// solid teardrop tongue with a darker rim, laid in three layers (outer, middle, hot core), tips swaying and licking up.
// Tongues pinch off as little drops that rise and shrink; bursts throw flame shards, four-point sparks and rings.
// Two canvases: behind the character (the big silhouette) and in front of it (low tongues at its feet, so it stands
// inside the fire and its face stays clear). No glow, no blur: solid fills only, so it stays crisp and cheap.

export interface FlatPalette { edge: string; outer: string; mid: string; inner: string; core: string; spark: string }
/** Per power level: 1–3 orange, 4 gold, 5 dawn rose and gold. */
export function flatPalette(level: number): FlatPalette {
  // The streak moment's friendly flame (streakMoment.ts): a yellow rim, an orange then red heart, a cream core.
  if (level >= 5) return { edge: '#ffb3c9', outer: '#ffb3c9', mid: '#ff86a8', inner: '#ff4f86', core: '#fff1f5', spark: '#ffd6e2' };
  if (level === 4) return { edge: '#ffd84a', outer: '#ffd84a', mid: '#ffb21a', inner: '#ff8a00', core: '#fffbe2', spark: '#fff3a0' };
  return { edge: '#ffc21a', outer: '#ffc21a', mid: '#ff8a1f', inner: '#ff4f2e', core: '#fff6df', spark: '#ffe27a' };
}

/** The flame's shape: base half-width `w`, tip height `h`, tip `lean`, left bump height `bump`, vertical squash `sq`. */
export interface Shape { w: number; h: number; lean: number; bump: number; sq: number }

/** Adds the flame outline (standing on (x, y), growing up) to the path. */
export function flamePath(c: CanvasRenderingContext2D, x: number, y: number, s: Shape) {
  const { w, h: H, lean, bump } = s;
  const sy = s.sq;
  const P = (px: number, py: number) => [x + px, y + py * sy] as const;
  const T = P(lean, -H), R = P(w, -w * 0.95), B = P(0, 0), L = P(-w, -w * 0.95);
  const K = P(-w * 0.55 + lean * 0.25, -w * 0.95 - bump), N = P(-w * 0.12 + lean * 0.45, -w * 1.05 - bump * 0.35);
  c.moveTo(...T);
  c.bezierCurveTo(T[0] + w * 0.12, T[1] + (R[1] - T[1]) * 0.35, x + w, R[1] - (R[1] - T[1]) * 0.42, ...R);
  c.bezierCurveTo(x + w, y - w * 0.4 * sy, x + w * 0.56, y, ...B);
  c.bezierCurveTo(x - w * 0.56, y, x - w, y - w * 0.4 * sy, ...L);
  c.bezierCurveTo(x - w, L[1] - bump * 0.5 * sy, K[0] - w * 0.22, K[1] + bump * 0.25 * sy, ...K);
  c.bezierCurveTo(K[0] + w * 0.12, K[1] + bump * 0.35 * sy, N[0] - w * 0.06, N[1], ...N);
  c.bezierCurveTo(N[0] - w * 0.04, N[1] - (N[1] - T[1]) * 0.55, T[0] - w * 0.3, T[1] + (N[1] - T[1]) * 0.22, ...T);
  c.closePath();
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
  private front: Tongue[] = [];
  private dropAcc: number[] = [];
  auras: Aura[] = [];
  private swirls: { a: Aura; at: number; dur: number; ph: number }[] = [];

  constructor(private cb: HTMLCanvasElement, private cf: HTMLCanvasElement, private pal: FlatPalette, lite = false) {
    this.dpr = Math.min(lite ? 1.25 : 2, window.devicePixelRatio || 1);
    this.bx = cb.getContext('2d')!;
    this.fx = cf.getContext('2d')!;
    // Tongues across the body, the middle ones tallest; each flickers at its own speed.
    for (const u of [-0.85, 0.85, -0.35]) this.front.push({ u, ph: Math.random() * TAU, sp: 5 + Math.random() * 4, k: 0.75 + Math.random() * 0.5 });
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

  /** Two ribbons of flame spiralling up round a character from its feet to above its head, `dur` seconds. */
  swirl(a: Aura, dur: number) { for (const ph of [0, Math.PI]) this.swirls.push({ a, at: this.t, dur, ph }); }

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
      this.bigFlame(this.bx, a);
    }
    for (const b of this.bits) if (b.kind === 'drop' || (b.kind === 'shard' && !b.front)) this.drawBit(this.bx, b);
    for (const a of this.auras) {
      if (a.heat < 0.02) continue;
      // In front: low tongues round the feet.
      this.feet(this.fx, a, p.outer, 1, 0);
      this.feet(this.fx, a, p.inner, 0.5, 0);
    }
    for (const b of this.bits) if ((b.kind === 'shard' && b.front) || b.kind === 'spark') this.drawBit(this.fx, b);
    for (const w of this.swirls) this.drawSwirl(w);
    this.swirls = this.swirls.filter((w) => this.t - w.at < w.dur + 0.25);
  }

  /** The streak flame's own shape, big behind the character: yellow rim, red heart, swaying and breathing. */
  private bigFlame(c: CanvasRenderingContext2D, a: Aura) {
    const t = this.t, heat = Math.min(1.25, a.heat), p = this.pal;
    const foot = a.foot + a.lift;
    const fl = 1 + 0.05 * Math.sin(t * 5.2) + 0.025 * Math.sin(t * 13);
    const s: Shape = { w: a.w * 0.6 * Math.min(1.15, 0.7 + heat * 0.35), h: a.h * 1.22 * heat * fl, lean: a.w * 0.08 + Math.sin(t * 2.1) * a.w * 0.07,
      bump: a.h * 0.26 * heat * (1 + 0.1 * Math.sin(t * 4.3 + 1)), sq: 1 };
    const rr = Math.min(s.w, s.h) * 0.34;
    c.beginPath(); flamePath(c, a.cx, foot - rr * 0.4, s); round(c, p.outer, rr);
    const inner: Shape = { w: s.w * 0.62, h: s.h * 0.66, lean: s.lean * 0.6, bump: s.bump * 0.5, sq: 1 };
    c.beginPath(); flamePath(c, a.cx, foot - s.w * 0.1 - rr * 0.3, inner); round(c, p.inner, rr * 0.7);
  }

  private drawSwirl(sw: { a: Aura; at: number; dur: number; ph: number }) {
    const a = sw.a, p = this.pal;
    const u = (this.t - sw.at) / sw.dur;
    if (u < 0 || u > 1.25) return;
    const at = (v: number) => {
      const ang = sw.ph + v * Math.PI * 3.2;
      return { x: a.cx + Math.cos(ang) * a.w * (0.62 - 0.15 * v), y: a.foot + a.lift - v * a.h * 1.15, z: Math.sin(ang) };
    };
    const head = Math.min(1, u), tail = Math.max(0, head - 0.42);
    const n = 22, L: [number, number][] = [], R: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const v = tail + ((head - tail) * i) / n, q = at(v), q2 = at(v + 0.01);
      let nx = -(q2.y - q.y), ny = q2.x - q.x;
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const wd = a.w * 0.11 * (i / n) * (u > 1 ? Math.max(0, 1 - (u - 1) * 4) : 1);
      L.push([q.x + nx * wd, q.y + ny * wd]); R.push([q.x - nx * wd, q.y - ny * wd]);
    }
    const c = at(head).z > 0 ? this.fx : this.bx;
    for (const [col, k] of [[p.outer, 1], [p.mid, 0.5]] as const) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(...L[0]);
      for (let i = 0; i <= n; i++) c.lineTo(L[0][0] + (L[i][0] - L[0][0]), L[i][1]);
      for (let i = n; i >= 0; i--) { const mx = (L[i][0] + R[i][0]) / 2, my = (L[i][1] + R[i][1]) / 2; c.lineTo(mx + (R[i][0] - mx) * k, my + (R[i][1] - my) * k); }
      c.closePath();
      c.fill();
    }
    if (u <= 1) { const h0 = at(head), h1 = at(head - 0.03); c.save(); c.translate(h0.x, h0.y); c.rotate(Math.atan2(h0.x - h1.x, -(h0.y - h1.y)));
      c.beginPath(); tongue(c, 0, 0, a.w * 0.12, a.w * 0.34, 0); round(c, p.outer, 4);
      c.beginPath(); tongue(c, 0, 1, a.w * 0.06, a.w * 0.17, 0); round(c, p.inner, 2); c.restore(); }
  }

  private feet(c: CanvasRenderingContext2D, a: Aura, color: string, k: number, grow: number) {
    const t = this.t, heat = Math.min(1.4, a.heat);
    const foot = a.foot + a.lift;
    c.fillStyle = color;
    c.beginPath();
    for (const g of this.front) {
      const flick = 1 + 0.22 * Math.sin(t * g.sp + g.ph);
      const len = a.h * 0.46 * heat * g.k * flick * k * (1 - 0.35 * Math.abs(g.u));
      const r = a.w * 0.1 * Math.max(0.5, heat) * (0.5 + 0.5 * k);
      tongue(c, a.cx + g.u * a.w * 0.48, foot + r * 0.2, r + grow, len + grow * 1.6, Math.sin(t * g.sp * 0.7 + g.ph) * r * 0.5);
    }
    round(c, color, a.w * 0.1 * k);
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

/** Fills the path and strokes it in the same colour with round joins: every tip comes out soft and chubby. */
function round(c: CanvasRenderingContext2D, color: string, w: number) {
  c.fillStyle = color; c.fill();
  c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round'; c.stroke();
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
