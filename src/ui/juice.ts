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

/** A damped spring from `from` to `to`, sampled at 60 fps until it settles. */
export function springValues(o: { from?: number; to?: number; v0?: number; stiffness?: number; damping?: number } = {}): number[] {
  const to = o.to ?? 1, k = o.stiffness ?? 320, c = o.damping ?? 16;
  let x = o.from ?? 0, v = o.v0 ?? 0;
  const out = [x];
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    for (let s = 0; s < 4; s++) { const a = -k * (x - to) - c * v; v += a * (dt / 4); x += v * (dt / 4); }
    out.push(x);
    if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.02) break;
  }
  out[out.length - 1] = to;
  return out;
}

/** Plays a spring on `el`: `frame(v)` turns each value into a keyframe. */
export function spring(el: Element, frame: (v: number) => Keyframe, o: Parameters<typeof springValues>[0] & { delay?: number } = {}): Animation | null {
  if (reduced()) return null;
  const vs = springValues(o);
  return el.animate(vs.map(frame), { duration: (vs.length - 1) * (1000 / 60), delay: o.delay ?? 0, easing: 'linear' });
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
  const body = h('span', { class: 'nr-body' }, halo, core);
  const el = h('span', { class: `noor-sprite ${cls}`, 'aria-hidden': 'true' }, h('span', { class: 'nr-trail' }, h('i', {}), h('i', {}), h('i', {})), body);
  let level = 0;
  const flare = (k: number) => {
    if (reduced()) return;
    halo.animate([{ transform: `scale(${1 + k})`, opacity: 1 }, { transform: 'scale(1)', opacity: 0.75 + level * 0.25 }], { duration: 520, easing: 'ease-out' });
  };
  return {
    el,
    hop(s = 1) {
      // Crouch, leap, stretch on the way up, squash on landing: a little jump of joy.
      spring(body, (v) => ({ transform: `translateY(${-v * (14 + 8 * s)}px) scale(${1 - v * 0.12}, ${1 + v * 0.16})` }), { from: 0, to: 0, v0: 9 + 3 * s, stiffness: 260, damping: 13 });
      flare(0.5 + 0.25 * s);
    },
    cheer() {
      if (reduced()) return;
      // A happy loop round its spot, then a bright flare.
      body.animate(Array.from({ length: 13 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return { transform: `translate(${Math.sin(a) * 18}px, ${-Math.abs(Math.sin(a / 2)) * 26 + (1 - Math.cos(a)) * 4}px) scale(${1 + 0.25 * Math.sin(a / 2)})` };
      }), { duration: 900, easing: 'cubic-bezier(.4, 0, .3, 1)' });
      setTimeout(() => flare(1.4), 700);
    },
    lean(dx) { if (!reduced()) body.animate([{ translate: '0 0' }, { translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 600, easing: 'ease-in-out' }); },
    glow(l) { level = Math.max(0, Math.min(1, l)); el.style.setProperty('--nr', String(level)); },
  };
}
