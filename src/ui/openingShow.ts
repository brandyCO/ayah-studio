// The opening show (owner pick 2026-11-13, "the character arrives"): the app icon comes alive. The white
// end-of-ayah marker pops in, the user's character springs up out of it and waves, the gold Light star swoops in
// and lands in the icon's place with a soft flash while the character hops, "ayah studio" rises in, and the picture
// flies forward into the app (2 s). Same picture as the launcher icon (make-character-icons.py).
//
// Every motion is a function of time sampled into Web Animations keyframes (transform / opacity only), so it runs
// on the compositor while the app starts underneath, and the show can be seeked to any moment (preview renders).
// Loaded as its own chunk (src/ui/opening.ts). Simplified 2026-11-14 for mid-range phones (see show()).
import './opening.css';
import { actor, myFigureCode, poseClass } from './actor';
import { h } from './dom';
import { DEFAULT, encode, normalize } from './figure';
import { sfx } from './sfx';

export interface OpColours { top: string; bottom: string; glow: string; edge: string; face: string }

/** Length of the show (ms). */
export const SHOW_MS = 2000;

const cl = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const seg = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const eo3 = (p: number) => 1 - (1 - p) ** 3;
const eio = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const TAU = Math.PI * 2;
/** A damped spring from 0 to 1 released at `at` ms (`f` Hz, damping ratio `z`); overshoots and settles. */
function spring(t: number, at: number, f: number, z: number) {
  if (t <= at) return 0;
  const e = (t - at) / 1000, w = TAU * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * e) * (Math.cos(wd * e) + (z * w / wd) * Math.sin(wd * e));
}
/** An impact at `at`: 0 before, rises to 1 in 40 ms, then swings both ways and dies out. */
function imp(t: number, at: number, f: number, z: number) {
  if (t <= at) return 0;
  const e = (t - at) / 1000, w = TAU * f;
  return Math.sin(Math.min(1, (t - at) / 40) * Math.PI / 2) * Math.exp(-z * w * e) * Math.cos(w * Math.sqrt(1 - z * z) * e);
}

/** The 16 points of the end-of-ayah rosette (two squares, one turned 45°) of side `s` round (cx, cy). */
function rosettePts(s: number, cx = 256, cy = 244) {
  const half = s / 2, r1 = half * Math.SQRT2, r2 = half / Math.cos(Math.PI / 8);
  return Array.from({ length: 16 }, (_, i) => {
    const a = (-90 + i * 22.5) * Math.PI / 180, r = i % 2 ? r2 : r1;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
}
const rosette = (s: number) => `M${rosettePts(s).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
const STAR = 'M12 1.5c.9 5 2.6 7.6 9.5 10.5-6.9 2.9-8.6 5.5-9.5 10.5-.9-5-2.6-7.6-9.5-10.5C9.4 9.1 11.1 6.5 12 1.5z';
const goldStar = (id: string) => '<svg viewBox="0 0 24 24" width="100%" height="100%">'
  + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a0"/><stop offset=".5" stop-color="#ffc62e"/><stop offset="1" stop-color="#ff9a12"/></linearGradient></defs>`
  + `<path d="${STAR}" fill="#d96f00" stroke="#d96f00" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 1.8)"/>`
  + `<path d="${STAR}" fill="url(#${id})" stroke="url(#${id})" stroke-width="1.6" stroke-linejoin="round"/>`
  + '<ellipse cx="9.3" cy="6.8" rx="1.25" ry="2.5" fill="#fff" opacity=".95" transform="rotate(35 9.3 6.8)"/></svg>';

interface Pose { x?: number; y?: number; r?: number; s?: number; sx?: number; sy?: number; o?: number }

// ---- The clock: every moment of the show (ms) ----
const POP = 90, RISE = 330, SETTLE = 640, FLY = 880, HIT = 1140, HOP = 1160, HOP_LAND = 1400, NAME = 1180, OUT = 1720;

/** The character's height above its resting place (stage units, 512 = the icon's size): it springs up out of the
 *  marker, and hops once when the star lands. */
function charY(t: number) {
  let y = 300 * (1 - spring(t, RISE, 2.6, 0.42));
  if (t > HOP && t < HOP_LAND) { const p = seg(t, HOP, HOP_LAND); y -= 34 * 4 * p * (1 - p); }
  return y;
}

/** The big soft lights as small pictures the GPU only scales (a CSS gradient is rastered at the phone's full
 *  pixel ratio). */
function baked(n: number, draw: (g: CanvasRenderingContext2D, r: number) => void) {
  const c = h('canvas', { width: String(n), height: String(n) }) as HTMLCanvasElement;
  const g = c.getContext('2d');
  if (g) draw(g, n / 2);
  return c;
}
const radial = (g: CanvasRenderingContext2D, r: number, stops: [number, string][]) => {
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, col] of stops) gr.addColorStop(at, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 2 * r, 2 * r);
};
const flashPic = () => baked(128, (g, r) => radial(g, r, [[0, 'rgba(255,252,230,.95)'], [0.4, 'rgba(255,236,160,.45)'], [1, 'rgba(255,236,160,0)']]));

/** The Light star's flight: from off screen at the top right, curling left and down into the icon's place. */
function starAt(t: number): Pose {
  if (t < FLY) return { o: 0 };
  const s = seg(t, FLY, HIT), p = 0.3 * s + 0.7 * s * s;
  const P0 = [600, -150], C = [110, -170], P1 = [404, 92];
  const bx = (1 - p) ** 2 * P0[0] + 2 * (1 - p) * p * C[0] + p * p * P1[0];
  const by = (1 - p) ** 2 * P0[1] + 2 * (1 - p) * p * C[1] + p * p * P1[1];
  const q = imp(t, HIT, 2.9, 0.3);
  return { x: bx - P1[0], y: by - P1[1], r: -540 * (1 - p) + 12 * q, s: 0.45 + 0.55 * p, sx: 1 + 0.4 * q, sy: 1 - 0.32 * q, o: 1 };
}

/** Sounds on the clock (live only): shaped noise and soft thuds, never music (src/ui/sfx.ts). */
export const SOUNDS: [number, () => void][] = [
  [POP, () => sfx.pop(0)],
  [RISE, () => sfx.leap()],
  [FLY, () => sfx.whoosh()],
  [HIT, () => sfx.pop(4, true)],
  [HOP_LAND, () => sfx.land()],
];

export interface Show { seek(ms: number): void; length: number }

/** Plays the show inside the opening overlay `box`; `end` is called when it is over. `manual`: paused at 0 and
 *  moved only by `seek` (preview renders), silent.
 *
 *  Kept to eight moving layers on purpose (owner report 2026-11-14, still lagging on the phone after the first
 *  pass): the earlier show had ~70 layers, light pictures several times the screen's size and an opacity
 *  animation on the whole overlay for its whole length, which made a mid-range phone's GPU draw the screen over
 *  and over every frame. Now no filters, nothing bigger than the stage but the soft flash, the face and pose set
 *  once before the first frame (a class change mid-show repaints every layer of the character), and the overlay
 *  fades only during its last 0.3 s. */
export function show(box: HTMLElement, c: OpColours, end: () => void, manual = false): Show {
  box.style.setProperty('--op-edge', c.edge);
  const stage = h('div', { class: 'op-stage' });
  box.append(stage);
  const S = stage.getBoundingClientRect().width || 360, u = S / 512;
  const anims: Animation[] = [];
  /** Samples `f` into keyframes over [from, to] ms (30 a second; the compositor eases between them). Outside that
   *  window the element holds its first / last pose. */
  const track = (el: Element, f: (t: number) => Pose, from = 0, to = SHOW_MS) => {
    const len = to - from, n = Math.max(2, Math.round(len / 1000 * 30)), kf: Keyframe[] = [];
    for (let i = 0; i <= n; i++) {
      const p = f(from + i * len / n), s = p.s ?? 1;
      kf.push({
        transform: `translate(${((p.x ?? 0) * u).toFixed(2)}px,${((p.y ?? 0) * u).toFixed(2)}px) rotate(${(p.r ?? 0).toFixed(2)}deg) scale(${(s * (p.sx ?? 1)).toFixed(4)},${(s * (p.sy ?? 1)).toFixed(4)})`,
        opacity: cl(p.o ?? 1),
      });
    }
    anims.push(el.animate(kf, { duration: len, delay: from, fill: 'both' }));
  };
  /** An element centred on (cx, cy) in stage units, `w` × `ht` units big. */
  const put = (cls: string, cx: number, cy: number, w: number, html = '', ht = w, parent: Element = stage) => {
    const e = h('span', { class: cls, style: `left:${(cx - w / 2) / 5.12}%;top:${(cy - ht / 2) / 5.12}%;width:${w / 5.12}%;height:${ht / 5.12}%` });
    if (html) e.innerHTML = html;
    parent.append(e);
    return e;
  };

  // The icon: the marker, with the character inside, squashing together.
  const icon = h('div', { class: 'op-icon' });
  stage.append(icon);
  icon.insertAdjacentHTML('beforeend', `<svg class="op-marker" viewBox="0 0 512 512" aria-hidden="true">`
    + `<path d="${rosette(272)}" fill="${c.edge}" stroke="${c.edge}" stroke-width="34" stroke-linejoin="round" transform="translate(0 14)"/>`
    + `<path d="${rosette(272)}" fill="#fff" stroke="#fff" stroke-width="34" stroke-linejoin="round"/>`
    + `<path d="${rosette(222)}" fill="${c.face}" stroke="${c.face}" stroke-width="26" stroke-linejoin="round"/></svg>`);
  // The character is seen only above the marker's middle and inside its lower half: it comes up out of it.
  const YC = 330, ro = rosettePts(244), lower: (readonly [number, number])[] = [];
  for (let i = 4; i < 12; i++) {
    const [x0, y0] = ro[i], [x1, y1] = ro[i + 1];
    if (y0 >= YC) lower.push(ro[i]);
    if ((y0 - YC) * (y1 - YC) < 0) lower.push([x0 + (x1 - x0) * (YC - y0) / (y1 - y0), YC]);
  }
  const pc = (x: number, y: number) => `${(x / 5.12).toFixed(2)}% ${(y / 5.12).toFixed(2)}%`;
  const pit = h('div', { class: 'op-pit', style: `clip-path:polygon(-40% -90%,140% -90%,${pc(716, YC)},${lower.map(([x, y]) => pc(x, y)).join(',')},${pc(-204, YC)})` });
  icon.append(pit);
  const who = put('op-char', 256, 30 + 616 / 2, 470, '', 616, pit);
  track(icon, (t) => {
    const a = spring(t, POP, 2.1, 0.36);
    const d = 0.05 * imp(t, SETTLE - 120, 3.4, 0.32) + 0.045 * imp(t, HIT, 3.4, 0.3) + 0.03 * imp(t, HOP_LAND, 3.4, 0.35);
    return { s: Math.max(0, a), r: -20 * (1 - spring(t, POP, 1.6, 0.42)), sx: 1 + 0.7 * d, sy: 1 - d, o: seg(t, POP, POP + 60) };
  }, 0, OUT);

  // The character (the builder's own layers, src/ui/actor.ts): happy and waving from the first frame.
  const a = actor('op-actor', myFigureCode() ?? encode(normalize({ ...DEFAULT, face: 1 })));
  if (a) {
    who.append(a.el);
    a.el.querySelectorAll('svg.fg').forEach((e) => e.classList.add('xp-happy'));
    poseClass(a.el, 'waving', true);
    track(who, (t) => {
      const y = charY(t), v = (charY(t - 8) - charY(t + 8)) / 16; // units/ms, up is positive
      const st = t > RISE && t < SETTLE ? cl(Math.abs(v) / 2.4) * 0.2 : 0;
      const q = 0.16 * imp(t, SETTLE - 120, 3, 0.34) + 0.12 * imp(t, HOP_LAND, 3.2, 0.36);
      return { y, sx: 1 - 0.5 * st + 0.7 * q, sy: 1 + st - q };
    }, RISE - 30, OUT);
    const arm = a.el.querySelector('.fg-wa');
    if (arm) track(arm, (t) => ({ r: 16 * Math.sin(TAU * (t - RISE) / 420) * seg(t, RISE, RISE + 120) - 3 }), RISE, OUT);
  }

  // The Light star lands in the icon's place with one soft flash.
  const flash = put('op-flash', 404, 92, 360);
  flash.append(flashPic());
  track(flash, (t) => ({ s: 0.5 + 0.55 * eo3(seg(t, HIT, HIT + 420)), o: 0.8 * seg(t, HIT, HIT + 40) * (1 - eo3(seg(t, HIT + 40, HIT + 460))) }), HIT, HIT + 470);
  track(put('op-star', 404, 92, 78, goldStar('op-gold')), starAt, FLY - 10, OUT);

  // The name rises in as one piece.
  const name = h('div', { class: 'op-name', style: `top:${590 / 5.12}%;font-size:${(S * 0.125).toFixed(1)}px` }, 'ayah studio');
  stage.append(name);
  track(name, (t) => { const q = spring(t, NAME, 2.2, 0.5); return { y: 36 * (1 - q), s: 0.8 + 0.2 * q, o: seg(t, NAME, NAME + 160) }; }, NAME, OUT);

  // The way out: the picture flies forward and the app shows through (only during the last moments, so the whole
  // overlay is not redrawn as one picture every frame of the show).
  track(stage, (t) => ({ s: 1 + 0.2 * seg(t, OUT, SHOW_MS) ** 2, y: -10 * eio(seg(t, OUT, SHOW_MS)) }), OUT, SHOW_MS);
  anims.push(box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SHOW_MS - OUT, delay: OUT, fill: 'forwards', easing: 'ease-in' }));

  const clock = anims[anims.length - 1];
  if (manual) {
    const seek = (ms: number) => { for (const x of box.getAnimations({ subtree: true })) { x.pause(); x.currentTime = ms; } };
    seek(0);
    return { seek, length: SHOW_MS };
  }
  let heard = -1;
  const tick = () => {
    if (!box.isConnected) return;
    const t = Number(clock.currentTime ?? 0);
    for (const [at, play] of SOUNDS) if (at > heard && at <= t && t - at < 160) play();
    heard = t;
    if (t >= SHOW_MS) { end(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  clock.addEventListener('finish', end);
  return { seek: () => {}, length: SHOW_MS };
}
