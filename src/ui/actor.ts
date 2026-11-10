// The user's own character as an actor in the app's moments (owner request 2026-11-10): beside the chest it
// watches each tap and cheers when it bursts, it celebrates the streak, reacts to the Monday league result
// and waves from the streak card on Me. Only when the user has made a character (Ranks → Make your
// character); otherwise the moments stay as they were. All WAAPI on the SVG groups, over the CSS idle loop
// (breathing, head sway, blink) from figure.css. Reduced motion: the character stands still.
import { encode, figureSvg, normalize, parse } from './figure';
import { h } from './dom';
import { reduced } from './juice';
import { sfx } from './sfx';
import './figure.css';

/** The character this device last saved (kept by setFigure in together/ranks.ts). */
export function myFigureCode(): string | null {
  try { const c = localStorage.getItem('rankFigure'); return c && /^[0-9a-z]{14}$/.test(c) ? c : null; } catch { return null; }
}

const parts = (root: Element) => ({
  svg: root.querySelector<SVGSVGElement>('svg.fg'),
  act: root.querySelector<SVGGElement>('.fg-act'),
  head: root.querySelector<SVGGElement>('.fg-head'),
  eyes: root.querySelector<SVGGElement>('.fg-eyes'),
  shadow: root.querySelector<SVGEllipseElement>('.fg-shadow'),
});

/** A hop: crouch, stretch on the way up, squash on landing. */
export function hop(root: Element, height = 26, ms = 620, sound = true) {
  const { act, shadow } = parts(root);
  if (!act || reduced()) return;
  act.animate([
    { transform: 'none' },
    { transform: 'translateY(4px) scale(1.08, .9)', offset: 0.16 },
    { transform: `translateY(${-height}px) scale(.94, 1.08)`, offset: 0.42, easing: 'cubic-bezier(.3, 0, .6, 1)' },
    { transform: 'translateY(2px) scale(1.12, .86)', offset: 0.72 },
    { transform: 'translateY(-3px) scale(.98, 1.03)', offset: 0.86 },
    { transform: 'none' },
  ], { duration: ms, easing: 'cubic-bezier(.3, .7, .4, 1)' });
  shadow?.animate([{ transform: 'none' }, { transform: 'scale(1.06)', offset: 0.16 }, { transform: 'scale(.6)', opacity: 0.14, offset: 0.42 }, { transform: 'scale(1.1)', offset: 0.72 }, { transform: 'none' }], { duration: ms });
  if (sound) setTimeout(() => sfx.land(), ms * 0.7);
}
/** A little nod of the head. */
export function nod(root: Element, deg = 6) {
  const { head } = parts(root);
  if (!head || reduced()) return;
  head.animate([{ transform: 'none' }, { transform: `rotate(${-deg}deg) translateY(2px)`, offset: 0.35 }, { transform: `rotate(${deg * 0.5}deg)`, offset: 0.7 }, { transform: 'none' }], { duration: 560, easing: 'ease-in-out', composite: 'add' });
}
/** A glance to one side (eyes and head), then back. */
export function glance(root: Element, dir = Math.random() < 0.5 ? -1 : 1, ms = 1300) {
  const { eyes, head } = parts(root);
  if (reduced()) return;
  eyes?.animate([{ transform: 'none' }, { transform: `translateX(${dir * 4}px)`, offset: 0.2 }, { transform: `translateX(${dir * 4}px)`, offset: 0.7 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add' });
  head?.animate([{ transform: 'none' }, { transform: `rotate(${dir * 4}deg)`, offset: 0.25 }, { transform: `rotate(${dir * 4}deg)`, offset: 0.7 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add' });
}
/** Sparkles bursting out of the middle of `box` (a positioned element). */
export function sparkle(box: HTMLElement, n = 14, at = 0.45) {
  if (reduced()) return;
  const w = box.clientWidth, hgt = box.clientHeight;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = Math.min(w, 280) * (0.25 + Math.random() * 0.25);
    const sp = h('span', { class: 'fb-spark', 'aria-hidden': 'true' });
    sp.style.cssText = `left:${w / 2 - 7}px;top:${hgt * at}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r * 0.8}px;animation-delay:${Math.random() * 120}ms;scale:${0.6 + Math.random() * 0.8}`;
    box.append(sp);
    setTimeout(() => sp.remove(), 1200);
  }
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

/** The character as an actor, or null when the user has not made one. `cls` places it. */
export function actor(cls = '', code: string | null = myFigureCode()): Actor | null {
  const f = parse(code);
  if (!f) return null;
  const el = h('span', { class: `fg-actor ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = figureSvg(f, { actor: true });
  const svg = el.querySelector('svg')!;
  let armsT = 0;
  const pose = (c: 'cheer' | 'waving', ms: number) => {
    svg.classList.remove('cheer', 'waving');
    svg.classList.add(c);
    clearTimeout(armsT);
    armsT = window.setTimeout(() => svg.classList.remove(c), ms);
  };
  return {
    el,
    hop: (k = 0.5) => hop(el, 10 + 22 * k, 480 + 160 * k, false),
    cheer(ms = 1900) {
      if (reduced()) { svg.classList.add('cheer'); return; }
      pose('cheer', ms);
      hop(el, 34, 600, false);
      setTimeout(() => hop(el, 20, 500, false), 580);
      sparkle(el, 10, 0.3);
    },
    wave(ms = 2200) {
      if (reduced()) return;
      pose('waving', ms);
      nod(el, 3);
    },
    lean(dir) {
      const { act } = parts(el);
      if (!act || reduced()) return;
      act.animate([{ transform: 'none' }, { transform: `translateX(${dir * 5}px) rotate(${dir * 4}deg)`, offset: 0.3 }, { transform: `translateX(${dir * 5}px) rotate(${dir * 4}deg)`, offset: 0.7 }, { transform: 'none' }], { duration: 700, easing: 'ease-in-out' });
    },
    sink() {
      const { act, head } = parts(el);
      if (!act || reduced()) return;
      act.animate([{ transform: 'none' }, { transform: 'translateY(5px) scale(1.03, .95)', offset: 0.35 }, { transform: 'translateY(5px) scale(1.03, .95)', offset: 0.65 }, { transform: 'none' }], { duration: 1600, easing: 'ease-in-out' });
      head?.animate([{ transform: 'none' }, { transform: 'rotate(-4deg) translateY(4px)', offset: 0.35 }, { transform: 'rotate(-4deg) translateY(4px)', offset: 0.65 }, { transform: 'none' }], { duration: 1600, easing: 'ease-in-out', composite: 'add' });
    },
    nod: () => nod(el),
    glance: (dir) => glance(el, dir),
    stretch() {
      const { act } = parts(el);
      if (!act || reduced()) return;
      pose('cheer', 1700);
      act.animate([{ transform: 'none' }, { transform: 'translateY(-6px) scale(.97, 1.06)', offset: 0.45 }, { transform: 'translateY(-6px) scale(.97, 1.06)', offset: 0.7 }, { transform: 'translateY(1px) scale(1.03, .97)', offset: 0.88 }, { transform: 'none' }], { duration: 1700, easing: 'ease-in-out' });
    },
  };
}
