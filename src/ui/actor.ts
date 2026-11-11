// The user's own character as an actor in the app's moments (owner request 2026-11-10): beside the chest it
// watches each tap and cheers when it bursts, it celebrates the streak, reacts to the Monday league result
// and waves from the streak card on Me. Only when the user has made a character (Ranks → Make your
// character); otherwise the moments stay as they were. Reduced motion: the character stands still.
// Speed (owner 2026-11-10, "it lags a little when I press the characters"): the whole-body moves (hop, lean, sink,
// stretch, the breathing bob) and the ground shadow run on HTML layers around the SVG (`layer()`), which the
// compositor moves without repainting anything; only the head, eyes and arms still move inside the drawing.
import { FIG_CODE, encode, figureSvg, normalize, parse, type Xp } from './figure';
import { h } from './dom';
import { reduced } from './juice';
import { sfx } from './sfx';
import './figure.css';

/** The character this device last saved (kept by setFigure in together/ranks.ts). */
export function myFigureCode(): string | null {
  try { const c = localStorage.getItem('rankFigure'); return c && FIG_CODE.test(c) ? c : null; } catch { return null; }
}

/** Keeps in this copy of the drawing only what `sel` matches (and the groups around it). */
function only(svg: SVGSVGElement, sel: string) {
  const bob = svg.querySelector('.fg-bob');
  if (!bob) return;
  const keep = [...bob.querySelectorAll(sel)];
  const walk = (n: Element) => {
    for (const c of [...n.children]) {
      if (keep.includes(c)) continue;
      if (keep.some((k) => c.contains(k))) walk(c); else c.remove();
    }
  };
  walk(bob);
}

/** Wraps the character's SVG in `root` in HTML layers: a ground shadow, a mover (hops, leans), a breathing layer,
 *  and the drawing cut into stacked copies — body, head (swaying on its own layer), raised arms, the waving arm —
 *  so every moving part is moved by the compositor without repainting. Same picture: each copy has the same
 *  view-box and the parts keep their order; the SVG's own shadow, bob, sway and wave are switched off by CSS. */
export function layer(root: Element) {
  const svg = root.querySelector<SVGSVGElement>('svg.fg');
  if (!svg || svg.parentElement?.classList.contains('fg-bb')) return;
  const kidHead = !!svg.querySelector('g[transform="translate(0 20)"] > .fg-head');
  const copy = (sel: string) => {
    const c = svg.cloneNode(true) as SVGSVGElement;
    c.removeAttribute('role'); c.removeAttribute('aria-label'); c.setAttribute('aria-hidden', 'true');
    only(c, sel);
    return c;
  };
  const head = copy('.fg-head');
  const up = copy('.fg-up, .fg-wv');
  up.querySelector('.fg-wave-arm')?.remove();
  const wave = copy('.fg-wave-arm');
  svg.querySelectorAll('.fg-head, .fg-up, .fg-wv').forEach((e) => e.remove());
  const lay = h('span', { class: `fg-lay${kidHead ? ' kid' : ''}` });
  const bb = h('span', { class: 'fg-bb' });
  svg.replaceWith(lay);
  bb.append(svg, h('span', { class: 'fg-hd' }, head), h('span', { class: 'fg-pt' }, up), h('span', { class: 'fg-wa' }, wave));
  lay.append(h('span', { class: 'fg-sh' }), h('span', { class: 'fg-mv' }, bb));
}

/** Sets a pose class (cheer, waving, sleepy) on the character: on every layer of a layered one. */
export function poseClass(root: Element, c: string, on: boolean) {
  root.querySelectorAll('svg.fg, .fg-lay').forEach((e) => e.classList.toggle(c, on));
}

// The mover's box is the drawing (200 × 262 view-box units), so view-box units become percentages.
const ux = (n: number) => `${(n / 2).toFixed(2)}%`;
const uy = (n: number) => `${(n / 2.62).toFixed(2)}%`;
const parts = (root: Element) => {
  const mv = root.querySelector<HTMLElement>('.fg-mv');
  return {
    svg: root.querySelector<SVGSVGElement>('svg.fg'),
    /** HTML mover (percent units) when layered, else the SVG group (view-box units). */
    act: (mv ?? root.querySelector<SVGGElement>('.fg-act')) as Element | null,
    tx: mv ? ux : (n: number) => `${n}px`,
    ty: mv ? uy : (n: number) => `${n}px`,
    head: (root.querySelector('.fg-hd') ?? root.querySelector('.fg-head')) as Element | null,
    eyes: root.querySelector<SVGGElement>('.fg-eyes'),
    shadow: (root.querySelector('.fg-sh') ?? root.querySelector('.fg-shadow')) as Element | null,
  };
};

/** A hop: crouch, stretch on the way up, squash on landing. */
export function hop(root: Element, height = 26, ms = 620, sound = true, quiet = true) {
  const { act, shadow, ty } = parts(root);
  if (!act || reduced()) return;
  // While a recitation plays the character only nods (it is listening), unless it is cheering a finished surah.
  if (quiet && document.documentElement.classList.contains('reciting')) { nod(root, 3); return; }
  act.animate([
    { transform: 'none' },
    { transform: `translateY(${ty(4)}) scale(1.08, .9)`, offset: 0.16 },
    { transform: `translateY(${ty(-height)}) scale(.94, 1.08)`, offset: 0.42, easing: 'cubic-bezier(.3, 0, .6, 1)' },
    { transform: `translateY(${ty(2)}) scale(1.12, .86)`, offset: 0.72 },
    { transform: `translateY(${ty(-3)}) scale(.98, 1.03)`, offset: 0.86 },
    { transform: 'none' },
  ], { duration: ms, easing: 'cubic-bezier(.3, .7, .4, 1)' });
  // `scale` only: the shadow's breathing loop animates `transform` and `opacity`, and a hop on the same properties
  // left that loop on the main processor for good (the podium kept Ranks ~15 % busy).
  shadow?.animate([{ scale: '1' }, { scale: '1.06', offset: 0.16 }, { scale: '.45', offset: 0.42 }, { scale: '1.1', offset: 0.72 }, { scale: '1' }], { duration: ms });
  if (sound) setTimeout(() => sfx.land(), ms * 0.7);
}
/** A little nod of the head. */
export function nod(root: Element, deg = 6) {
  const { head, ty } = parts(root);
  if (!head || reduced()) return;
  head.animate([{ rotate: '0deg', translate: '0 0' }, { rotate: `${-deg}deg`, translate: `0 ${ty(2)}`, offset: 0.35 }, { rotate: `${deg * 0.5}deg`, translate: '0 0', offset: 0.7 }, { rotate: '0deg', translate: '0 0' }], { duration: 560, easing: 'ease-in-out', composite: 'add' });
}
/** A glance to one side (eyes and head), then back. */
export function glance(root: Element, dir = Math.random() < 0.5 ? -1 : 1, ms = 1300) {
  const { eyes, head } = parts(root);
  if (reduced()) return;
  eyes?.animate([{ transform: 'none' }, { transform: `translateX(${dir * 4}px)`, offset: 0.2 }, { transform: `translateX(${dir * 4}px)`, offset: 0.7 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add' });
  head?.animate([{ rotate: '0deg' }, { rotate: `${dir * 4}deg`, offset: 0.25 }, { rotate: `${dir * 4}deg`, offset: 0.7 }, { rotate: '0deg' }], { duration: ms, easing: 'ease-in-out', composite: 'add' });
}
/** Sparkles bursting out of the middle of `box` (a positioned element). */
export function sparkle(box: HTMLElement, n = 14, at = 0.45) {
  if (reduced()) return;
  const w = box.clientWidth, hgt = box.clientHeight;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = Math.min(w, 280) * (0.25 + Math.random() * 0.25);
    const sp = h('span', { class: 'fb-spark', 'aria-hidden': 'true' });
    sp.style.cssText = `left:${w / 2 - 7}px;top:${hgt * at}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r * 0.8}px;animation-delay:${Math.random() * 120}ms;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}`;
    box.append(sp);
    setTimeout(() => sp.remove(), 1200);
  }
}

// Speed (old-phone pass, round 3): a character's idle loop (breathing, blinking, head sway) only runs while it is on
// screen; off screen its animations pause (`.fg-off`), so a page with several characters costs nothing for the
// ones scrolled away. One shared observer for all of them.
let watch: IntersectionObserver | null = null;
function rest(el: HTMLElement) {
  if (typeof IntersectionObserver === 'undefined') return;
  watch ??= new IntersectionObserver((es) => { for (const e of es) { e.target.classList.toggle('fg-off', !e.isIntersecting); if (!e.target.isConnected) watch!.unobserve(e.target); } });
  el.classList.add('fg-off');
  watch.observe(el);
}

export interface Actor {
  el: HTMLElement;
  /** A small hop (`k` 0–1 how big). */
  hop(k?: number): void;
  /** Arms up and two happy hops, with sparkles; the arms come down after `ms`. */
  cheer(ms?: number): void;
  /** Waves for `ms`. */
  wave(ms?: number): void;
  /** Leans towards `dir` (−1 left, 1 right) as if watching closely. */
  lean(dir: number): void;
  /** Sinks a little and looks down (a calm "not this time"), then stands up again. */
  sink(): void;
  nod(): void;
  glance(dir?: number): void;
  /** A long slow stretch, arms up (mornings). */
  stretch(): void;
  /** Shows an expression for `ms` (with a face; null = back to the face as built). */
  face(xp: Xp | null, ms?: number): void;
}

/** How the character looks on Me at this moment of the day (owner idea 2026-11-10, "reacts to your day"):
 *  after a page counted today it holds the mushaf; at night it sits by its lantern, and once the bedtime du'a
 *  is said it dozes; in the morning it stretches when it first appears. */
export type DayMode = 'morning' | 'reading' | 'night' | 'asleep' | 'day';
export function dayLook(code: string | null, o: { read: boolean; bedtime: boolean; now?: Date }): { code: string | null; mode: DayMode } {
  const f = parse(code);
  if (!f) return { code, mode: 'day' };
  const hr = (o.now ?? new Date()).getHours();
  const night = hr >= 21 || hr < 4;
  if (night) {
    const g = normalize({ ...f, pose: 1, hold: o.bedtime ? f.hold === 3 ? 0 : f.hold : 5 });
    return { code: encode(g), mode: o.bedtime ? 'asleep' : 'night' };
  }
  if (o.read && f.hold !== 2 && f.hold !== 3) return { code: encode(normalize({ ...f, hold: 2 })), mode: 'reading' };
  return { code, mode: hr >= 4 && hr < 10 ? 'morning' : 'day' };
}

// During a recitation the character sits and listens quietly (owner pick 2026-11-11): no sway, a slow calm breath,
// the head bowed a little, nothing moving to the words (html.reciting, set by the player). When a surah is recited
// to its end, every character on screen stands up happy.
const live = new Set<WeakRef<HTMLElement>>();
const acts = new WeakMap<HTMLElement, Actor>();
let heard = false;
function listenForSurahs() {
  if (heard || typeof WeakRef === 'undefined') return;
  heard = true;
  window.addEventListener('recitation-surah', () => {
    for (const r of live) {
      const el = r.deref();
      if (!el || !el.isConnected) { live.delete(r); continue; }
      if (el.classList.contains('fg-off')) continue;
      setTimeout(() => acts.get(el)?.cheer(2200), 300);
    }
  });
}

/** The character as an actor, or null when the user has not made one. `cls` places it. */
export function actor(cls = '', code: string | null = myFigureCode()): Actor | null {
  const f = parse(code);
  if (!f) return null;
  const el = h('span', { class: `fg-actor ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = figureSvg(f, { actor: true });
  layer(el);
  rest(el);
  let armsT = 0, faceT = 0;
  const face = (xp: Xp | null, ms = 1600) => {
    el.querySelectorAll('svg.fg').forEach((e) => { for (const c of [...e.classList]) if (c.startsWith('xp-')) e.classList.remove(c); if (xp) e.classList.add(`xp-${xp}`); });
    clearTimeout(faceT);
    if (xp && ms > 0) faceT = window.setTimeout(() => face(null), ms);
  };
  const pose = (c: 'cheer' | 'waving', ms: number) => {
    poseClass(el, 'cheer', false); poseClass(el, 'waving', false);
    poseClass(el, c, true);
    clearTimeout(armsT);
    armsT = window.setTimeout(() => poseClass(el, c, false), ms);
  };
  const api: Actor = {
    el,
    hop: (k = 0.5) => hop(el, 10 + 22 * k, 480 + 160 * k, false),
    cheer(ms = 1900) {
      if (reduced()) { poseClass(el, 'cheer', true); return; }
      pose('cheer', ms);
      hop(el, 34, 600, false, false);
      setTimeout(() => hop(el, 20, 500, false, false), 580);
      sparkle(el, 10, 0.3);
    },
    wave(ms = 2200) {
      if (reduced()) return;
      pose('waving', ms);
      nod(el, 3);
    },
    lean(dir) {
      const { act, tx } = parts(el);
      if (!act || reduced()) return;
      face('wow', 900);
      act.animate([{ translate: '0 0', rotate: '0deg' }, { translate: `${tx(dir * 5)} 0`, rotate: `${dir * 4}deg`, offset: 0.3 }, { translate: `${tx(dir * 5)} 0`, rotate: `${dir * 4}deg`, offset: 0.7 }, { translate: '0 0', rotate: '0deg' }], { duration: 700, easing: 'ease-in-out' });
    },
    sink() {
      const { act, head, ty } = parts(el);
      face('calm', 1800);
      if (!act || reduced()) return;
      act.animate([{ transform: 'none' }, { transform: `translateY(${ty(5)}) scale(1.03, .95)`, offset: 0.35 }, { transform: `translateY(${ty(5)}) scale(1.03, .95)`, offset: 0.65 }, { transform: 'none' }], { duration: 1600, easing: 'ease-in-out' });
      head?.animate([{ rotate: '0deg', translate: '0 0' }, { rotate: '-4deg', translate: `0 ${ty(4)}`, offset: 0.35 }, { rotate: '-4deg', translate: `0 ${ty(4)}`, offset: 0.65 }, { rotate: '0deg', translate: '0 0' }], { duration: 1600, easing: 'ease-in-out', composite: 'add' });
    },
    nod: () => nod(el),
    face,
    glance: (dir) => glance(el, dir),
    stretch() {
      const { act, ty } = parts(el);
      if (!act || reduced()) return;
      face('sleepy', 900);
      pose('cheer', 1700);
      act.animate([{ transform: 'none' }, { transform: `translateY(${ty(-6)}) scale(.97, 1.06)`, offset: 0.45 }, { transform: `translateY(${ty(-6)}) scale(.97, 1.06)`, offset: 0.7 }, { transform: `translateY(${ty(1)}) scale(1.03, .97)`, offset: 0.88 }, { transform: 'none' }], { duration: 1700, easing: 'ease-in-out' });
    },
  };
  acts.set(el, api);
  listenForSurahs();
  if (typeof WeakRef !== 'undefined') live.add(new WeakRef(el));
  return api;
}
