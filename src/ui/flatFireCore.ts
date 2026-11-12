// The power-up's flying bits (flatFire.ts): shards, sparks, rings and the swirl, drawn on two canvases (behind and in
// front of the character). No DOM here, so it runs in a worker on OffscreenCanvases (flatFireWorker.ts) and the
// page's frames never wait for it; the same code runs on the page where workers cannot draw.

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Canvas = HTMLCanvasElement | OffscreenCanvas;

/** The flame's shape: base half-width `w`, tip height `h`, tip `lean`, left bump height `bump`, vertical squash `sq`. */
export interface Shape { w: number; h: number; lean: number; bump: number; sq: number }

/** Adds the flame outline (standing on (x, y), growing up) to the path. */
export function flamePath(c: Ctx2D, x: number, y: number, s: Shape) {
  // One soft teardrop (owner 2026-11-11: no spiky top): a round base rising to a single rounded tip that leans a
  // little right; `bump` only swells the left shoulder, it never makes a second point.
  const R = s.w, sq = s.sq, lean = s.lean;
  const H = Math.max(s.h, R * 1.05), up = (v: number) => y + v * sq;
  const cy = up(-R), rise = H - R;
  const Tx = x + R * 0.12 + lean, Ty = up(-H);
  const sh = Math.min(R * 0.22, s.bump * 0.18);
  c.moveTo(x + R, cy);
  c.bezierCurveTo(x + R, cy - rise * 0.55 * sq, Tx + R * 0.32, Ty + rise * 0.28 * sq, Tx, Ty);
  c.bezierCurveTo(Tx - R * 0.42, Ty + rise * 0.3 * sq, x - R - sh, cy - rise * 0.42 * sq, x - R, cy);
  c.ellipse(x, cy, R, R * sq, 0, Math.PI, 0, true);
  c.closePath();
}

/** The flame's colours: a light outer flame and a deeper inner one, each a soft vertical gradient, and the drop. */
export interface FireLook { rim: string; top: string; bottom: string; inTop: string; inBottom: string; core: string }

/** The whole flame standing on (x, y): no outline, smooth and rounded (owner: "smooth like Duolingo"). A light outer
 *  flame, a deeper inner flame low inside it, a round white drop. `drop` 0 hides the drop (a character stands there).
 *  `part` draws only the outer flame, or only the inner flame + drop (the Me flame moves them as separate layers). */
export function drawFire(c: Ctx2D, x: number, y: number, s: Shape, look: FireLook, drop = 1, part: 'all' | 'outer' | 'inner' = 'all') {
  const soft = Math.min(s.w * 0.22, Math.max(s.h, s.w) * 0.2);
  const fill = (sh: Shape, yy: number, top: string, bottom: string, round: number) => {
    const g = c.createLinearGradient(0, yy - sh.h * sh.sq, 0, yy);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.beginPath(); flamePath(c, x, yy, sh);
    c.fillStyle = g; c.strokeStyle = g; c.lineWidth = round; c.lineJoin = 'round';
    c.fill(); c.stroke();
  };
  const base = y - soft * 0.5 * s.sq;
  if (part !== 'inner') fill(s, base, look.top, look.bottom, soft);
  if (part === 'outer') return;
  const inner: Shape = { w: s.w * 0.7, h: Math.max(s.w * 0.75, s.h * 0.68), lean: s.lean * 0.55, bump: s.bump * 0.5, sq: s.sq };
  fill(inner, base - s.w * 0.08 * s.sq, look.inTop, look.inBottom, soft * 0.75);
  if (drop > 0) {
    const r = s.w * 0.3 * drop, cx = x + s.lean * 0.1, cy = base - s.w * 0.62 * s.sq;
    c.fillStyle = look.core;
    c.beginPath();
    c.moveTo(cx, cy - r * 1.75 * s.sq);
    c.bezierCurveTo(cx + r * 0.35, cy - r * 1.25 * s.sq, cx + r, cy - r * 0.7 * s.sq, cx + r, cy);
    c.ellipse(cx, cy, r, r * s.sq, 0, 0, Math.PI);
    c.bezierCurveTo(cx - r, cy - r * 0.7 * s.sq, cx - r * 0.35, cy - r * 1.25 * s.sq, cx, cy - r * 1.75 * s.sq);
    c.fill();
  }
}

export interface FlatPalette { outer: string; inner: string; core: string; spark: string; look: FireLook }

/** One character's fire: set its place and heat every frame. */
export interface Aura { cx: number; foot: number; w: number; h: number; lift: number; heat: number }

interface Bit {
  kind: 'drop' | 'shard' | 'spark' | 'ring';
  x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; rot: number; front: boolean;
}

const TAU = Math.PI * 2;
const MAX_BITS = 260;

export class FireBits {
  private bx: Ctx2D;
  private fx: Ctx2D;
  private t = 0;
  private bits: Bit[] = [];
  private swirls: { i: number; at: number; dur: number; ph: number }[] = [];
  private auras: Aura[] = [];
  private dirty = false;

  constructor(private cb: Canvas, private cf: Canvas, private pal: FlatPalette, private dpr: number, w: number, h: number) {
    this.bx = cb.getContext('2d') as Ctx2D;
    this.fx = cf.getContext('2d') as Ctx2D;
    this.resize(w, h);
  }

  resize(w: number, h: number) {
    for (const c of [this.cb, this.cf]) { c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr); }
    this.dirty = true;
  }

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
  swirl(i: number, dur: number) { for (const ph of [0, Math.PI]) this.swirls.push({ i, at: this.t, dur, ph }); }

  /** A flat ring on the ground that opens out and thins. */
  ring(x: number, y: number, size: number) {
    this.bits.push({ kind: 'ring', x, y, vx: 0, vy: 0, r: size, life: 0, max: 0.55, rot: 0, front: false });
  }

  step(dt: number) {
    this.t += dt;
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

  /** Draws this frame with the auras where they stand now; while nothing flies the canvases are left alone. */
  draw(auras: Aura[]) {
    this.auras = auras;
    if (!this.bits.length && !this.swirls.length) {
      if (this.dirty) { for (const [c, cv] of [[this.bx, this.cb], [this.fx, this.cf]] as const) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); } this.dirty = false; }
      return;
    }
    this.dirty = true;
    const d = this.dpr;
    for (const [c, cv] of [[this.bx, this.cb], [this.fx, this.cf]] as const) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(d, 0, 0, d, 0, 0);
      c.lineJoin = 'round';
    }
    for (const b of this.bits) if (b.kind === 'ring') this.drawBit(this.bx, b);
    for (const b of this.bits) if (b.kind === 'drop' || (b.kind === 'shard' && !b.front)) this.drawBit(this.bx, b);
    for (const b of this.bits) if ((b.kind === 'shard' && b.front) || b.kind === 'spark') this.drawBit(this.fx, b);
    for (const w of this.swirls) this.drawSwirl(w);
    this.swirls = this.swirls.filter((w) => this.t - w.at < w.dur + 0.25);
  }

  private drawSwirl(sw: { i: number; at: number; dur: number; ph: number }) {
    const a = this.auras[sw.i], p = this.pal;
    if (!a) return;
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
    for (const [col, k] of [[p.outer, 1], [p.outer, 0.5]] as const) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(...L[0]);
      for (let i = 0; i <= n; i++) c.lineTo(L[0][0] + (L[i][0] - L[0][0]), L[i][1]);
      for (let i = n; i >= 0; i--) { const mx = (L[i][0] + R[i][0]) / 2, my = (L[i][1] + R[i][1]) / 2; c.lineTo(mx + (R[i][0] - mx) * k, my + (R[i][1] - my) * k); }
      c.closePath();
      c.fill();
    }
    if (u <= 1) { const h0 = at(head), h1 = at(head - 0.03); c.save(); c.translate(h0.x, h0.y); c.rotate(Math.atan2(h0.x - h1.x, -(h0.y - h1.y)));
      // A soft round head (a pointed one read as horns on the flame).
      const hk = Math.max(0, Math.min(1, (1 - u) / 0.35)); // the head melts into the flame as it arrives
      c.fillStyle = p.outer; c.beginPath(); c.arc(0, 0, a.w * 0.11 * hk, 0, TAU); c.fill();
      c.fillStyle = p.inner; c.beginPath(); c.arc(0, a.w * 0.02, a.w * 0.055 * hk, 0, TAU); c.fill(); c.restore(); }
  }

  private drawBit(c: Ctx2D, b: Bit) {
    const f = b.life / b.max, p = this.pal;
    if (b.kind === 'ring') {
      c.globalAlpha = 1 - f;
      c.strokeStyle = p.outer;
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
    // Drops: round sparks of the rim colour. Shards: tiny streak flames, tilted the way they fly.
    if (b.kind === 'drop') { c.fillStyle = p.look.rim; c.beginPath(); c.arc(b.x, b.y, r * 0.55, 0, TAU); c.fill(); return; }
    c.save();
    c.translate(b.x, b.y);
    c.rotate(Math.atan2(b.vx, -b.vy) * 0.6);
    drawFire(c, 0, r * 0.4, { w: r * 0.55, h: r * 1.7, lean: r * 0.1, bump: r * 0.5, sq: 1 }, p.look, 0);
    c.restore();
  }
}

/** A four-point sparkle. */
function star(c: Ctx2D, x: number, y: number, r: number, rot: number) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4, rr = i % 2 ? r * 0.32 : r;
    const px = x + Math.sin(a) * rr, py = y - Math.cos(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}
