// Motion helpers for the reward moments (chests, celebrate.ts, the streak and Ranks moments), so they
// feel alive like a good game: spring physics (overshoot, then settle), squash and stretch on every
// landing and tap, counters that tick with a little pop, and Noor — the app's light companion (no face,
// no body, feeling shown only by light) — who watches, hops when you tap and carries the Light home.
// Everything runs on WAAPI transforms + opacity (compositor only), so it stays smooth on old phones.
import { h } from './dom';
import './juice.css';

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Old-phone mode (src/lite.ts sets `html.lite`): fewer sparks, the same moments. */
export const lite = () => document.documentElement.classList.contains('lite');

/** Named feels, so every moment in the app moves with the same character (motion engine 2026-11-19, Duolingo's
 *  principles in our own style: anticipation, overshoot, squash and stretch, follow-through, settle).
 *  snappy: buttons, chips, ticks. bouncy: things landing, popping in. jelly: squash on impact. heavy: big chests,
 *  emblems (slow, weighty). gentle: calm pieces (cards, rows), a small overshoot only. */
export const FEEL = {
  snappy: { stiffness: 620, damping: 22 },
  bouncy: { stiffness: 320, damping: 14 },
  jelly: { stiffness: 420, damping: 11 },
  heavy: { stiffness: 220, damping: 15 },
  gentle: { stiffness: 260, damping: 22 },
} as const;
export type Feel = keyof typeof FEEL;
type SpringOpts = { from?: number; to?: number; v0?: number; stiffness?: number; damping?: number; feel?: Feel };

const memo = new Map<string, number[]>();
/** A damped spring from `from` to `to`, sampled at 60 fps until it settles (the same spring is simulated once). */
export function springValues(o: SpringOpts = {}): number[] {
  const f = o.feel ? FEEL[o.feel] : null;
  const to = o.to ?? 1, k = o.stiffness ?? f?.stiffness ?? 320, c = o.damping ?? f?.damping ?? 16;
  const from = o.from ?? 0, v0 = o.v0 ?? 0;
  const key = `${from},${to},${v0},${k},${c}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let x = from, v = v0;
  const out = [x];
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    for (let s = 0; s < 4; s++) { const a = -k * (x - to) - c * v; v += a * (dt / 4); x += v * (dt / 4); }
    out.push(x);
    if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.02) break;
  }
  out[out.length - 1] = to;
  if (memo.size > 200) memo.clear();
  memo.set(key, out);
  return out;
}

// Every scripted move is noted per element as it starts (Element.animate is wrapped once, here), so taking an
// element over never asks the browser for its animations: getAnimations() and getComputedStyle() bring every style on
// the page up to date first (20-40 ms at a time on a slow phone, measured in the chest's taps).
const mine = new WeakMap<Element, Set<Animation>>();
/** Every scripted move still playing (for `holdPage`: document.getAnimations() would restyle the whole page). */
const running = new Set<Animation>();
if (typeof Element !== 'undefined' && !(Element.prototype.animate as { noted?: boolean }).noted) {
  const native = Element.prototype.animate;
  const noted = function (this: Element, k: Keyframe[] | PropertyIndexedKeyframes | null, o?: number | KeyframeAnimationOptions) {
    const a = native.call(this, k, o);
    let set = mine.get(this);
    if (!set) mine.set(this, set = new Set());
    set.add(a);
    running.add(a);
    a.addEventListener('finish', () => running.delete(a));
    a.addEventListener('cancel', () => running.delete(a));
    const fill = typeof o === 'object' ? o.fill : undefined;
    // A move that holds its last frame (fill forwards / both) still shows, so it stays noted until it is cancelled.
    if (fill !== 'forwards' && fill !== 'both') a.addEventListener('finish', () => set!.delete(a));
    a.addEventListener('cancel', () => set!.delete(a));
    return a;
  } as typeof native & { noted?: boolean };
  noted.noted = true;
  Element.prototype.animate = noted;
}

/** Stops the moves scripts left on `el` (CSS loops are left alone). One element, one motion: two moves on the same
 *  element, or a move on top of a CSS loop, send all of its motion to the main thread (the chest lag on slow
 *  phones). A new move takes over from the last; in replace mode the picture is the same. */
export function own(el: Element) {
  const set = mine.get(el);
  if (!set?.size) return;
  for (const a of [...set]) a.cancel();
}

/** Takes over `el` from wherever its last scripted move has got to: returns the pose it shows now (to start the
 *  next move from, so nothing jumps) and stops that move. */
export function takeOver(el: Element): string {
  const set = mine.get(el);
  if (!set?.size) return 'none';
  const t = getComputedStyle(el).transform;
  own(el);
  return t && t !== 'none' ? t : 'none';
}

/** Plays a spring on `el`: `frame(v)` turns each value into a keyframe; earlier scripted moves on it stop (`own`). */
export function spring(el: Element, frame: (v: number) => Keyframe, o: SpringOpts & { delay?: number; fill?: FillMode; keep?: boolean } = {}): Animation | null {
  if (reduced()) return null;
  const vs = springValues(o);
  if (!o.keep) own(el);
  const a = el.animate(vs.map(frame), { duration: (vs.length - 1) * (1000 / 60), delay: o.delay ?? 0, easing: 'linear', fill: o.fill ?? 'none' });
  return a;
}

/** Squash and stretch: a jelly wobble that settles (a landing, a tap, an impact). */
export const squash = (el: Element, amount = 0.2, o: { stiffness?: number; damping?: number; delay?: number } = {}) =>
  spring(el, (d) => ({ transform: `scale(${1 + amount * d}, ${1 - amount * d})` }), { from: 1, to: 0, stiffness: 420, damping: 11, ...o });

/** Pops in from nothing with an overshoot. */
export const popIn = (el: Element, o: { stiffness?: number; damping?: number; delay?: number } = {}) =>
  spring(el, (v) => ({ transform: `scale(${Math.max(0, v)})`, opacity: Math.min(1, v * 2) }), { from: 0, to: 1, stiffness: 300, damping: 14, ...o });

/** A quick bump (a counter step, a chip receiving light). */
export const bump = (el: Element, amount = 0.22) =>
  spring(el, (d) => ({ transform: `scale(${1 + amount * d})` }), { from: 1, to: 0, stiffness: 600, damping: 18 });

/** Falls in from above, stretched by its speed, hits, squashes flat, rebounds a little and settles with a jelly
 *  wobble (an emblem, a chest, a prize landing). `height` px of fall; `onLand` at the impact (sound, vibration). */
export function drop(el: Element, o: { height?: number; delay?: number; squash?: number; onLand?: () => void; fill?: FillMode } = {}): Animation | null {
  if (reduced()) return null;
  const h0 = o.height ?? 220, sq = o.squash ?? 0.26, fall = Math.round(10 + Math.sqrt(h0) * 0.5);
  const out: Keyframe[] = [];
  for (let i = 0; i <= fall; i++) {
    const p = i / fall, y = -h0 * (1 - p * p), st = 1 + 0.16 * p * p;
    out.push({ transform: `translateY(${y.toFixed(1)}px) scale(${(1 / st).toFixed(3)}, ${st.toFixed(3)})`, opacity: Math.min(1, p * 3) });
  }
  const d = springValues({ from: 1, to: 0, stiffness: 380, damping: 9 });
  const y = springValues({ from: 0, to: 0, v0: -h0 * 2.1, stiffness: 260, damping: 15 });
  const n = Math.max(d.length, y.length);
  for (let i = 1; i < n; i++) {
    const dd = d[Math.min(i, d.length - 1)] * sq, yy = y[Math.min(i, y.length - 1)];
    out.push({ transform: `translateY(${yy.toFixed(1)}px) scale(${(1 + dd).toFixed(3)}, ${(1 - dd).toFixed(3)})`, opacity: 1 });
  }
  own(el);
  if (o.onLand) setTimeout(o.onLand, (o.delay ?? 0) + fall * (1000 / 60));
  return el.animate(out, { duration: (out.length - 1) * (1000 / 60), delay: o.delay ?? 0, easing: 'linear', fill: o.fill ?? 'both' });
}

/** Rises into place from `dy` px below with an overshoot (rows, cards, text coming in). */
export const rise = (el: Element, dy = 28, o: { delay?: number; feel?: Feel; scale0?: number } = {}) =>
  spring(el, (v) => ({ transform: `translateY(${(dy * v).toFixed(1)}px) scale(${(1 + ((o.scale0 ?? 1) - 1) * v).toFixed(3)})`, opacity: Math.min(1, Math.max(0, 1 - v * 1.4)) }),
    { from: 1, to: 0, feel: o.feel ?? 'gentle', delay: o.delay, fill: 'backwards' });

/** Plays `move` on each element one after another, `gap` ms apart (a list coming in, prizes in a row). */
export function stagger<T extends Element>(els: Iterable<T>, move: (el: T, delay: number, i: number) => void, gap = 55, start = 0) {
  let i = 0;
  for (const el of els) { move(el, start + i * gap, i); i++; }
}

/** A decaying wobble (a shake that settles: "not yet", a locked thing). `deg` the first swing. */
export const wobble = (el: Element, deg = 8) =>
  spring(el, (v) => ({ transform: `rotate(${(deg * v).toFixed(2)}deg)` }), { from: 0, to: 0, v0: deg * 30, stiffness: 520, damping: 9 });

/** Anticipation then release: a small crouch the opposite way before `then` plays (a leap, a throw). */
export function anticipate(el: Element, then: () => void, ms = 110) {
  if (reduced()) { then(); return; }
  own(el);
  el.animate([{ transform: 'none' }, { transform: 'translateY(3px) scale(1.06, .92)' }], { duration: ms, easing: 'cubic-bezier(.3, 0, .6, 1)' });
  setTimeout(then, ms);
}

/** Counts `el` from `from` to `n` (eased), popping a little on each new value; `prefix` e.g. '+'. */
export function tick(el: HTMLElement, n: number, o: { from?: number; ms?: number; prefix?: string; fmt?: (v: number) => string; onPop?: () => void } = {}) {
  const from = o.from ?? 0, ms = o.ms ?? 900, pre = o.prefix ?? '', fmt = o.fmt ?? String;
  if (reduced()) { el.textContent = pre + fmt(n); return; }
  const t0 = performance.now();
  let shown = NaN, lastPop = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    const v = Math.round(from + (n - from) * (1 - (1 - p) ** 3));
    if (v !== shown) {
      shown = v;
      el.textContent = pre + fmt(v);
      if (now - lastPop > 70 || p >= 1) { lastPop = now; bump(el, p >= 1 ? 0.35 : 0.14); o.onPop?.(); }
    }
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** How many rewards were claimed in a row (each within 2 minutes of the last), this one included. */
export function combo(): number {
  try {
    const now = Date.now();
    const raw = JSON.parse(sessionStorage.getItem('celCombo') || '{}') as { n?: number; at?: number };
    const n = raw.at && now - raw.at < 120_000 ? (raw.n ?? 0) + 1 : 1;
    sessionStorage.setItem('celCombo', JSON.stringify({ n, at: now }));
    return n;
  } catch { return 1; }
}

export interface Noor { el: HTMLElement; hop(strength?: number): void; cheer(): void; lean(dx: number): void; glow(level: number): void }

/** Noor: a small floating light that breathes, hops and brightens. Place `el` absolutely. */
export function noor(cls = ''): Noor {
  const halo = h('span', { class: 'nr-halo' });
  const core = h('span', { class: 'nr-core' });
  // One motion per layer: the CSS bob on `nr-body`, hops / cheers / leans on `nr-hop` inside it; the halo's CSS
  // breath inside `nr-flare`, which flares.
  const flareEl = h('span', { class: 'nr-flare' }, halo);
  const hopEl = h('span', { class: 'nr-hop' }, flareEl, core);
  const body = h('span', { class: 'nr-body' }, hopEl);
  const el = h('span', { class: `noor-sprite ${cls}`, 'aria-hidden': 'true' }, h('span', { class: 'nr-trail' }, h('i', {}), h('i', {}), h('i', {})), body);
  let level = 0;
  const flare = (k: number) => {
    if (reduced()) return;
    own(flareEl);
    flareEl.animate([{ transform: `scale(${1 + k})`, opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, easing: 'ease-out' });
  };
  return {
    el,
    hop(s = 1) {
      // Crouch, leap, stretch on the way up, squash on landing: a little jump of joy.
      spring(hopEl, (v) => ({ transform: `translateY(${-v * (14 + 8 * s)}px) scale(${1 - v * 0.12}, ${1 + v * 0.16})` }), { from: 0, to: 0, v0: 9 + 3 * s, stiffness: 260, damping: 13 });
      flare(0.5 + 0.25 * s);
    },
    cheer() {
      if (reduced()) return;
      // A happy loop round its spot, then a bright flare.
      own(hopEl);
      hopEl.animate(Array.from({ length: 13 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return { transform: `translate(${Math.sin(a) * 18}px, ${-Math.abs(Math.sin(a / 2)) * 26 + (1 - Math.cos(a)) * 4}px) scale(${1 + 0.25 * Math.sin(a / 2)})` };
      }), { duration: 900, easing: 'cubic-bezier(.4, 0, .3, 1)' });
      setTimeout(() => flare(1.4), 700);
    },
    lean(dx) { if (!reduced()) { own(hopEl); hopEl.animate([{ translate: '0 0' }, { translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 600, easing: 'ease-in-out' }); } },
    glow(l) { level = Math.max(0, Math.min(1, l)); el.style.setProperty('--nr', String(level)); },
  };
}

/** While a full-screen moment plays, the screen behind it is skipped (`content-visibility: hidden` once the
 *  moment's opaque sky has faded in: not styled, laid out or drawn, its CSS animations stop, its size is kept), so
 *  a phone only draws the moment. Animations started from script on the page are paused. Released as the moment
 *  starts to fade out. Counted, so two moments in a row hand over cleanly. */
let held = 0, coverT = 0, covered: Element[] = [];
// Each element of the page is skipped by a class of its own: a class on <html> with `body > :not(.cel)` made the
// browser restyle the whole document twice (~90 ms on a slow phone, once covering and once uncovering).
const cover = () => {
  for (const c of document.body.children)
    if (!c.classList.contains('cel') && !c.classList.contains('lt-fly-layer')) { c.classList.add('cel-off'); covered.push(c); }
};
/** Shows the page behind a moment again before the moment ends (while it stands still): its restyle happens then. */
export function uncover() {
  clearTimeout(coverT);
  if (!covered.length) return;
  for (const c of covered) c.classList.remove('cel-off');
  covered = [];
  for (const a of paused) try { a.play(); } catch { /* removed meanwhile */ }
  paused = [];
}
let paused: Animation[] = [];
export function holdPage(on: boolean) {
  held = Math.max(0, held + (on ? 1 : -1));
  clearTimeout(coverT);
  // Once the sky covers the screen (not in the moment's first frames, which are busy enough).
  if (held > 0) coverT = window.setTimeout(() => {
    if (held <= 0 || covered.length) return;
    for (const a of running) {
      const el = (a.effect as KeyframeEffect | null)?.target;
      if (a.playState !== 'running' || !el || el.closest('.cel, .lt-fly-layer')) continue;
      a.pause(); paused.push(a);
    }
    cover();
  }, 340);
  else uncover();
}
