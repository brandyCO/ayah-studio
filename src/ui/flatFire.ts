// The streak flame (owner 2026-11-11, after Duolingo's streak animation, in our own design): smooth, no outline —
// a light outer flame with a deeper flame inside and a white drop, soft gradients, rounded tips, in the theme's
// colours. drawFire() is shared by the streak moment (streakMoment.ts) and the character power-up, where the
// character stands inside one big flame (owner: "not surrounded by flames, he is in it"); a swirl of flame spirals
// round it on the leap, and bursts throw little flames, sparks and rings (flatFireCore.ts, in a worker).

import { rewardPalette } from './theme';
import { drawFire, FireBits, type Aura, type FireLook, type FlatPalette, type Shape } from './flatFireCore';

export { drawFire, flamePath, type Aura, type FireLook, type FlatPalette, type Shape } from './flatFireCore';

/** The power-up's palette: the theme's flame, the same as the streak moment's; the level shows in its size and burst. */
export function flatPalette(_level: number): FlatPalette {
  const look = themeFire();
  return { outer: look.bottom, inner: look.inTop, core: look.core, spark: look.top, look };
}

/** In the theme's colours (owner 2026-11-11: "relative to the theme colour"), like the Me tab's flame. */
export function themeFire(): FireLook {
  const p = rewardPalette();
  return { rim: p.n3, top: p.n2, bottom: p.n3, inTop: p.n1, inBottom: p.n2, core: '#ffffff' };
}

type Cmd = { t: 'burst'; a: [number, number, number, number, boolean] } | { t: 'sparks'; a: [number, number, number, number] }
  | { t: 'ring'; a: [number, number, number] } | { t: 'swirl'; a: [number, number] };

let worker: Worker | null | undefined;
let nextId = 0;
function fireWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof OffscreenCanvas === 'function' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype)
      worker = new Worker(new URL('./flatFireWorker.ts', import.meta.url), { type: 'module' });
  } catch { worker = null; }
  return worker;
}

export class FlatFire {
  private dpr: number;
  private sharp: number;
  /** Each aura's big flame, drawn once at full sharpness and moved only by transforms (no repaint per frame). */
  private statics: { a: Aura; back: HTMLElement; front: HTMLElement; h: number }[] = [];
  private t = 0;
  private dt = 0;
  auras: Aura[] = [];
  /** The flying bits: in a worker when it can draw there, else on the page. */
  private local: FireBits | null = null;
  private id = ++nextId;
  private w: Worker | null;

  constructor(private cb: HTMLCanvasElement, private cf: HTMLCanvasElement, private pal: FlatPalette, lite = false) {
    // The bits are soft shapes with no outline: 1.5× keeps them smooth and the full-screen canvases light.
    this.dpr = Math.min(lite ? 1.1 : 1.5, window.devicePixelRatio || 1);
    this.sharp = Math.min(lite ? 1.5 : 2.5, window.devicePixelRatio || 1);
    const r = cb.getBoundingClientRect();
    this.w = fireWorker();
    if (this.w) {
      try {
        const b = cb.transferControlToOffscreen(), f = cf.transferControlToOffscreen();
        this.w.postMessage({ t: 'init', id: this.id, b, f, pal, dpr: this.dpr, w: r.width, h: r.height }, [b, f]);
      } catch { this.w = null; }
    }
    if (!this.w) this.local = new FireBits(cb, cf, pal, this.dpr, r.width, r.height);
  }

  resize() {
    const r = this.cb.getBoundingClientRect();
    if (this.w) this.w.postMessage({ t: 'resize', id: this.id, w: r.width, h: r.height });
    else this.local!.resize(r.width, r.height);
  }

  private send(c: Cmd) {
    if (this.w) this.w.postMessage({ t: 'cmd', id: this.id, c });
    else if (c.t === 'burst') this.local!.burst(...c.a);
    else if (c.t === 'sparks') this.local!.sparks(...c.a);
    else if (c.t === 'ring') this.local!.ring(...c.a);
    else this.local!.swirl(...c.a);
  }

  /** Flame shards thrown out from (x, y), a few sparks with them. `flat` keeps them low (a landing). */
  burst(x: number, y: number, n: number, speed: number, flat = false) { this.send({ t: 'burst', a: [x, y, n, speed, flat] }); }
  sparks(x: number, y: number, n: number, speed: number) { this.send({ t: 'sparks', a: [x, y, n, speed] }); }
  /** A flat ring on the ground that opens out and thins. */
  ring(x: number, y: number, size: number) { this.send({ t: 'ring', a: [x, y, size] }); }
  /** Two ribbons of flame spiralling up round a character from its feet to above its head, `dur` seconds. */
  swirl(a: Aura, dur: number) { this.send({ t: 'swirl', a: [this.auras.indexOf(a), dur] }); }

  /** Ends the worker's part (the page removes the canvases). */
  stop() { this.w?.postMessage({ t: 'stop', id: this.id }); }

  aura(a: Omit<Aura, 'lift' | 'heat'>): Aura {
    const x = { ...a, lift: 0, heat: 0 };
    this.auras.push(x);
    this.statics.push(this.staticFlame(x));
    return x;
  }

  /** The big flame for one aura at its resting size, drawn once into its own canvas behind the character (and its
   *  low, fading base again in front of the feet). The sway, breath, growth and lift are transforms on these, so
   *  the compositor moves them and nothing is repainted per frame (60 fps on slow phones). Drops rise off the tip
   *  as CSS animations inside the back layer. */
  private staticFlame(a: Aura) {
    const R = a.w * 0.6, S: Shape = { w: R, h: a.h * 1.18, lean: a.w * 0.06, bump: a.h * 0.42, sq: 1 };
    const baseY = a.foot + a.w * 0.06;
    const left = a.cx - a.w * 0.8, top = baseY - S.h - 30, wd = a.w * 1.6, ht = S.h + 30 + R * 0.5;
    const d = this.sharp;
    const layer = (cls: string, paint: (c: CanvasRenderingContext2D) => void) => {
      const box = document.createElement('div');
      box.className = `ff-flame ${cls}`;
      box.style.cssText = `left:${left}px;top:${top}px;width:${wd}px;height:${ht}px;transform-origin:${a.cx - left}px ${baseY - top}px;opacity:0`;
      const cv = document.createElement('canvas');
      cv.width = Math.round(wd * d); cv.height = Math.round(ht * d);
      const c = cv.getContext('2d')!;
      c.setTransform(d, 0, 0, d, -left * d, -top * d);
      c.lineJoin = 'round';
      paint(c);
      box.append(cv);
      return box;
    };
    const back = layer('ff-back', (c) => drawFire(c, a.cx, baseY, S, this.pal.look, 0));
    // Drops pinching off the tip, each looping on its own timing.
    const drops = document.createElement('div');
    drops.className = 'ff-drops';
    drops.style.setProperty('--ff-rim', this.pal.look.rim);
    for (let i = 0; i < 9; i++) {
      const u = (i / 8 - 0.5) * 1.5, r = a.w * (0.08 + ((i * 7) % 5) * 0.012);
      const dot = document.createElement('i');
      dot.style.cssText = `left:${a.cx - left + u * a.w * 0.45 - r / 2}px;top:${baseY - top - a.h * (0.78 + 0.42 * (1 - Math.abs(u))) - r / 2}px;`
        + `width:${r}px;height:${r}px;--dx:${((i * 37) % 11) - 5}px;--rise:${-90 - ((i * 53) % 60)}px;`
        + `animation-duration:${0.5 + ((i * 29) % 7) * 0.05}s;animation-delay:${-((i * 0.137) % 0.6).toFixed(3)}s`;
      drops.append(dot);
    }
    back.append(drops);
    // In front, only low down: the flame's base closes over the feet, fading in from the knees, so the character
    // stands in the fire rather than in front of it.
    const front = layer('ff-front', (c) => {
      const foot = a.foot, y1 = foot - a.h * 0.2, n = 6;
      for (let i = 0; i < n; i++) {
        const y0 = y1 + ((foot - y1) * i) / n;
        c.save();
        c.beginPath(); c.rect(a.cx - a.w * 2, y0, a.w * 4, i === n - 1 ? a.h : (foot - y1) / n + 0.5); c.clip();
        c.globalAlpha = ((i + 1) / n) ** 1.4;
        drawFire(c, a.cx, baseY, S, this.pal.look, 0);
        c.restore();
      }
    });
    this.cb.after(back);
    this.cf.after(front);
    return { a, back, front, h: S.h };
  }

  step(dt: number) { this.t += dt; this.dt += dt; }

  draw() {
    // The big flames: transforms only.
    const t = this.t;
    for (const f of this.statics) {
      const heat = Math.min(1.25, f.a.heat);
      if (heat < 0.3) { f.back.style.opacity = '0'; f.front.style.opacity = '0'; continue; }
      const fl = 1 + 0.04 * Math.sin(t * 5.2) + 0.02 * Math.sin(t * 13);
      const sx = Math.min(1, 0.55 + heat * 0.45), sy = Math.min(1.15, heat) * fl;
      const skew = Math.atan((Math.sin(t * 2.1) * f.a.w * 0.05) / f.h);
      const tf = `translate(0px,${f.a.lift.toFixed(2)}px) skewX(${skew.toFixed(4)}rad) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
      f.back.style.transform = tf; f.front.style.transform = tf;
      f.back.style.opacity = '1';
      f.front.style.opacity = Math.min(1, (heat - 0.3) / 0.4).toFixed(3);
    }
    const auras = this.auras.map((a) => ({ ...a }));
    if (this.w) this.w.postMessage({ t: 'frame', id: this.id, dt: this.dt, auras });
    else { this.local!.step(this.dt); this.local!.draw(auras); }
    this.dt = 0;
  }
}
