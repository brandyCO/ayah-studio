// The opening show (owner pick 2026-11-13, "the character arrives"; rebuilt the same day to Duolingo-level craft):
// the app icon comes alive. The white end-of-ayah marker pops in with a shockwave, shivers and squashes as
// something gathers inside, and the user's character launches out of it (stretching as it flies, a wow face, the
// head lagging on a spring), lands with a squash and settles, waves; a twinkle marks a spot, the gold Light star
// swoops in on an arc with a trail and slams into the icon's place with a flash, a ring and a burst of stars, the
// character looks up at it and cheers with two hops and star eyes, "ayah studio" pops in letter by letter, and the
// whole picture flies forward into the app (≈ 3.1 s). Same picture as the launcher icon (make-character-icons.py).
//
// Every motion is a function of time sampled into Web Animations keyframes (transform / opacity only), so it runs
// on the compositor while the app starts underneath, and the whole show can be seeked to any moment (preview
// renders). Faces, poses and sounds follow the same clock. Loaded as its own chunk (src/ui/opening.ts).
import './opening.css';
import { actor, myFigureCode, poseClass } from './actor';
import { h } from './dom';
import { DEFAULT, encode, normalize } from './figure';
import { sfx } from './sfx';

export interface OpColours { top: string; bottom: string; glow: string; edge: string; face: string }

/** Length of the show (ms). */
export const SHOW_MS = 3200;

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
/** Seeded random numbers, the same every launch (so every launch and every preview frame is the same). */
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

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
const whiteStar = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${STAR}" fill="#fff"/></svg>`;

interface Pose { x?: number; y?: number; r?: number; s?: number; sx?: number; sy?: number; o?: number }

// ---- The clock: every moment of the show (ms) ----
const POP = 110, GATHER = 560, LAUNCH = 770, APEX = 1040, LAND = 1200, WAVE = 1330, WAVE_END = 1950;
const HINT = 1580, FLY = 1720, HIT = 2000, HOP = 2030, HOP_LAND = 2280, HOP2 = 2330, HOP2_LAND = 2490, NAME = 2090, OUT = 2760;

/** The character's height above its resting place (stage units, 512 = the icon's size). */
function charY(t: number) {
  const H = 430, A = 250;
  let y = 0;
  if (t < LAUNCH) y = H;
  else if (t < APEX) { const p = seg(t, LAUNCH, APEX); y = H - (H + A) * (1 - (1 - p) ** 2); }
  else if (t < LAND) { const p = seg(t, APEX, LAND); y = -A + A * p * p; }
  if (t > HOP && t < HOP_LAND) { const p = seg(t, HOP, HOP_LAND); y -= 36 * 4 * p * (1 - p); }
  if (t > HOP2 && t < HOP2_LAND) { const p = seg(t, HOP2, HOP2_LAND); y -= 13 * 4 * p * (1 - p); }
  return y;
}
const waveEnv = (t: number) => seg(t, WAVE, WAVE + 110) * (1 - seg(t, WAVE_END - 110, WAVE_END));
const lookUp = (t: number) => eio(seg(t, FLY - 60, FLY + 70)) * (1 - eio(seg(t, HIT + 20, HIT + 140)));

/** The head on a spring behind the body (follow-through): its offset from where the body would put it. */
function headLag() {
  const K = (TAU * 4.2) ** 2, D = 2 * 0.3 * TAU * 4.2;
  const out = new Float32Array(SHOW_MS + 1);
  let p = charY(0), v = 0;
  for (let ms = 0; ms <= SHOW_MS; ms++) {
    const b = charY(ms);
    for (let k = 0; k < 4; k++) { const a = -K * (p - b) - D * v; v += a * 0.00025; p += v * 0.00025; } // 0.25 ms steps
    out[ms] = cl((p - b) * 0.55, -13, 13);
  }
  return out;
}

/** The Light star's flight: from off screen at the top right, curling left and down into the icon's place. */
function starAt(t: number): Pose {
  if (t < FLY) return { o: 0 };
  const s = seg(t, FLY, HIT), p = 0.3 * s + 0.7 * s * s;
  const P0 = [600, -150], C = [110, -170], P1 = [404, 92];
  const bx = (1 - p) ** 2 * P0[0] + 2 * (1 - p) * p * C[0] + p * p * P1[0];
  const by = (1 - p) ** 2 * P0[1] + 2 * (1 - p) * p * C[1] + p * p * P1[1];
  const q = imp(t, HIT, 2.9, 0.3);
  const idle = seg(t, 2280, 2560);
  return {
    x: bx - P1[0], y: by - P1[1] + idle * 4 * Math.sin(TAU * (t - 2280) / 1300),
    r: -620 * (1 - p) + 12 * q + idle * 6 * Math.sin(TAU * (t - 2280) / 1700),
    s: 0.45 + 0.55 * p, sx: 1 + 0.42 * q, sy: 1 - 0.34 * q, o: 1,
  };
}

/** Sounds on the clock (live only): shaped noise and soft thuds, never music (src/ui/sfx.ts). */
export const SOUNDS: [number, () => void][] = [
  [POP, () => sfx.pop(0)],
  [GATHER, () => sfx.gather(LAUNCH - GATHER)],
  [LAUNCH, () => sfx.leap()],
  [LAND, () => sfx.land()],
  [FLY, () => sfx.whoosh()],
  [HIT, () => sfx.pop(4, true)],
  [HOP_LAND, () => sfx.land()],
];
const FACES: [number, string | null][] = [[0, null], [LAUNCH, 'wow'], [LAND + 60, 'happy'], [FLY - 60, 'wow'], [HIT, 'star'], [2560, 'happy']];
const POSES: [number, string | null][] = [[0, null], [WAVE - 10, 'waving'], [WAVE_END, null], [HIT - 5, 'cheer']];
const last = <T>(list: [number, T][], t: number) => { let v = list[0][1]; for (const [at, x] of list) if (t >= at) v = x; return v; };

export interface Show { seek(ms: number): void; length: number }

/** Plays the show inside the opening overlay `box`; `end` is called when it is over. `manual`: paused at 0 and
 *  moved only by `seek` (preview renders), silent. */
export function show(box: HTMLElement, c: OpColours, end: () => void, manual = false): Show {
  box.style.setProperty('--op-edge', c.edge);
  const stage = h('div', { class: 'op-stage' });
  box.append(stage);
  const S = stage.getBoundingClientRect().width || 360, u = S / 512;
  const anims: Animation[] = [];
  /** Samples `f` into keyframes (`fps` a second) for one element, over the whole show. */
  const track = (el: Element, f: (t: number) => Pose, fps = 60) => {
    const n = Math.max(2, Math.round(SHOW_MS / 1000 * fps)), kf: Keyframe[] = [];
    for (let i = 0; i <= n; i++) {
      const p = f(i * SHOW_MS / n), s = p.s ?? 1;
      kf.push({
        transform: `translate(${((p.x ?? 0) * u).toFixed(2)}px,${((p.y ?? 0) * u).toFixed(2)}px) rotate(${(p.r ?? 0).toFixed(2)}deg) scale(${(s * (p.sx ?? 1)).toFixed(4)},${(s * (p.sy ?? 1)).toFixed(4)})`,
        opacity: cl(p.o ?? 1),
      });
    }
    anims.push(el.animate(kf, { duration: SHOW_MS, fill: 'both' }));
  };
  /** An element centred on (cx, cy) in stage units, `w` × `ht` units big. */
  const put = (cls: string, cx: number, cy: number, w: number, html = '', ht = w, parent: Element = stage) => {
    const e = h('span', { class: cls, style: `left:${(cx - w / 2) / 5.12}%;top:${(cy - ht / 2) / 5.12}%;width:${w / 5.12}%;height:${ht / 5.12}%` });
    if (html) e.innerHTML = html;
    parent.append(e);
    return e;
  };
  const rand = rng(7);

  // Light behind everything: a soft glow and slow rays turning round the marker.
  const breathe = (t: number) => 0.035 * Math.sin(TAU * t / 1900);
  const gathering = (t: number) => (t < LAUNCH ? eio(seg(t, GATHER, LAUNCH)) : 1 - spring(t, LAUNCH, 3.2, 0.28));
  const hitGlow = (t: number) => (t > HIT ? Math.exp(-(t - HIT) / 420) * seg(t, HIT, HIT + 50) : 0);
  track(put('op-glow', 256, 250, 760), (t) => ({ s: 0.55 + 0.45 * eo3(seg(t, 60, 700)) + breathe(t) + 0.12 * hitGlow(t), o: 0.9 * seg(t, 60, 420) }), 30);
  track(put('op-rays', 256, 244, 1200), (t) => ({
    r: t * 0.011, s: 0.6 + 0.4 * eo3(seg(t, POP, 800)) + 0.08 * hitGlow(t),
    o: 0.3 * seg(t, 140, 700) + 0.14 * cl(gathering(t)) + 0.45 * hitGlow(t),
  }), 30);
  // Motes of light drifting up the whole time.
  for (let i = 0; i < 14; i++) {
    const x0 = -60 + rand() * 632, y0 = 120 + rand() * 640, sp = 34 + rand() * 50, sz = 5 + rand() * 9, ph = rand() * TAU, a = 0.18 + rand() * 0.35;
    const m = put('op-mote', x0, y0, sz);
    track(m, (t) => ({ x: 9 * Math.sin(ph + t / 700), y: -sp * t / 1000, o: a * seg(t, 150 + i * 30, 700 + i * 30) }), 12);
  }
  // A shockwave as the marker lands.
  track(put('op-ring', 256, 244, 330), (t) => ({ s: 0.62 + 0.95 * eo3(seg(t, POP + 60, POP + 620)), o: t < POP + 60 ? 0 : 0.75 * (1 - seg(t, POP + 60, POP + 620)) ** 1.4 }), 30);

  // The icon: the marker, a glow gathering in its face, and the character inside, all squashing together.
  const icon = h('div', { class: 'op-icon' });
  stage.append(icon);
  icon.insertAdjacentHTML('beforeend', `<svg class="op-marker" viewBox="0 0 512 512" aria-hidden="true">`
    + `<path d="${rosette(272)}" fill="${c.edge}" stroke="${c.edge}" stroke-width="34" stroke-linejoin="round" transform="translate(0 14)"/>`
    + `<path d="${rosette(272)}" fill="#fff" stroke="#fff" stroke-width="34" stroke-linejoin="round"/>`
    + `<path d="${rosette(222)}" fill="${c.face}" stroke="${c.face}" stroke-width="26" stroke-linejoin="round"/></svg>`);
  const faceGlow = h('span', { class: 'op-faceglow' });
  faceGlow.innerHTML = `<svg viewBox="0 0 512 512" width="100%" height="100%"><defs><radialGradient id="op-fg" cx=".5" cy=".62" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff6d8"/><stop offset="1" stop-color="${c.glow}"/></radialGradient></defs><path d="${rosette(222)}" fill="url(#op-fg)" stroke="url(#op-fg)" stroke-width="26" stroke-linejoin="round"/></svg>`;
  icon.append(faceGlow);
  // The character is seen only above the marker's middle and inside its lower half: it comes up out of it.
  // Below YC it is cut to the marker's face; above, arms may reach out over the rim (it pops out of the frame).
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
  pit.insertAdjacentHTML('beforeend', `<svg class="op-lip" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="op-lip" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="430"><stop offset="0" stop-color="${c.edge}" stop-opacity="0"/><stop offset="1" stop-color="${c.edge}" stop-opacity=".42"/></linearGradient></defs><path d="${rosette(244)}" fill="url(#op-lip)"/></svg>`);
  track(icon, (t) => {
    const a = spring(t, POP, 2.1, 0.33), k = cl(gathering(t), -1, 1);
    const shiver = t > GATHER && t < LAUNCH ? 1.8 * Math.sin(t * 0.11) * seg(t, GATHER, LAUNCH) : 0;
    const d = 0.06 * imp(t, LAND, 3.4, 0.3) + 0.045 * imp(t, HIT, 3.4, 0.3) + 0.03 * imp(t, HOP_LAND, 3.4, 0.35);
    return {
      s: Math.max(0, a), r: -26 * (1 - spring(t, POP, 1.6, 0.42)) + shiver,
      sx: 1 + 0.07 * k + 0.7 * d, sy: 1 - 0.12 * k - d, o: seg(t, POP, POP + 60),
    };
  });
  track(faceGlow, (t) => ({ o: 0.85 * (t < LAUNCH ? eio(seg(t, GATHER, LAUNCH)) : 1 - seg(t, LAUNCH, 1060)) + 0.45 * hitGlow(t) }), 30);

  // The character and its parts (the builder's own layers, src/ui/actor.ts).
  const a = actor('op-actor', myFigureCode() ?? encode(normalize({ ...DEFAULT, face: 1 })));
  const lag = headLag();
  if (a) {
    who.append(a.el);
    track(who, (t) => {
      const y = charY(t), v = (charY(t - 8) - charY(t + 8)) / 16; // units/ms, up is positive
      const air = (t > LAUNCH && t < LAND) || (t > HOP && t < HOP_LAND) || (t > HOP2 && t < HOP2_LAND);
      const st = air ? cl(Math.abs(v) / 2.6) * 0.24 : 0;
      const crouch = 0.1 * eio(seg(t, HIT - 40, HOP)) * (1 - seg(t, HOP, HOP + 40));
      const q = 0.21 * imp(t, LAND, 3, 0.32) + 0.13 * imp(t, HOP_LAND, 3.2, 0.35) + 0.06 * imp(t, HOP2_LAND, 3.4, 0.4) + crouch;
      const wave = waveEnv(t) * 2.2 * Math.sin(TAU * (t - WAVE) / 420);
      return { y, r: -7 * Math.sin(Math.PI * seg(t, LAUNCH, LAND)) + wave, sx: 1 - 0.55 * st + 0.75 * q, sy: 1 + st - q };
    });
    const head = a.el.querySelector('.fg-hd'), arm = a.el.querySelector('.fg-wa');
    if (head) track(head, (t) => {
      const g = lookUp(t), e = waveEnv(t);
      return { y: lag[Math.round(cl(t, 0, SHOW_MS))] - 3 * g, r: 7 * g + e * 3.5 * Math.sin(TAU * (t - WAVE) / 420 + 0.9) + 4 * Math.sin(Math.PI * seg(t, HOP, HOP_LAND)) };
    });
    if (arm) track(arm, (t) => ({ r: waveEnv(t) * 16 * Math.sin(TAU * (t - WAVE) / 400) - 3 }));
  }

  // Twinkles: two round the marker as it lands, one marking where the star will land, two after.
  const twinkle = (x: number, y: number, size: number, from: number, len: number) =>
    track(put('op-tw', x, y, size, whiteStar), (t) => { const p = seg(t, from, from + len); return { s: Math.sin(Math.PI * p), r: 90 * p, o: p > 0 && p < 1 ? 1 : 0 }; }, 40);
  twinkle(100, 104, 34, 300, 520); twinkle(446, 318, 26, 420, 520);
  twinkle(404, 92, 46, HINT, 230);
  twinkle(96, 96, 30, 2200, 560); twinkle(440, 304, 24, 2420, 560); twinkle(70, 300, 20, 2560, 500);

  // Sparkles out of the marker as the character launches.
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, ang = -Math.PI / 2 + side * (0.5 + (i >> 1) * 0.22) + (rand() - 0.5) * 0.12, sp = 380 + rand() * 280, sz = 10 + rand() * 10;
    const dot = put(`op-dot${i % 3 ? '' : ' gold'}`, 256 + side * 60, 330, sz);
    stage.insertBefore(dot, icon); // they come out from behind the marker
    track(dot, (t) => {
      const age = t - LAUNCH - 20, life = 520; if (age <= 0) return { o: 0, s: 0 };
      const tau = age / 1000, d = (1 - Math.exp(-3.4 * tau)) / 3.4, p = age / life;
      return { x: Math.cos(ang) * sp * d, y: Math.sin(ang) * sp * d + 260 * tau * tau, s: 1 - p * p, o: p < 1 ? 1 - cl((p - 0.6) / 0.4) : 0 };
    }, 40);
  }

  // The Light star: a trail of ghosts, the star itself, then a flash, a ring and a burst at the hit.
  for (let k = 3; k >= 1; k--) {
    track(put('op-star op-ghost', 404, 92, 78, whiteStar), (t) => {
      const p = starAt(t - 26 * k);
      return { ...p, s: (p.s ?? 1) * (1 - 0.13 * k), sx: 1, sy: 1, o: t - 26 * k < FLY ? 0 : (0.55 - 0.13 * k) * (1 - seg(t, HIT, HIT + 90)) };
    });
  }
  track(put('op-flash', 404, 92, 820), (t) => ({ s: 0.5 + 0.55 * eo3(seg(t, HIT, HIT + 480)), o: t < HIT ? 0 : 0.75 * seg(t, HIT, HIT + 45) * (1 - eo3(seg(t, HIT + 45, HIT + 520))) }), 40);
  track(put('op-ring op-ring2', 404, 92, 150), (t) => ({ s: 0.25 + 2.7 * eo3(seg(t, HIT, HIT + 520)), o: t < HIT ? 0 : 0.95 * (1 - seg(t, HIT, HIT + 520)) ** 1.3 }), 40);
  track(put('op-star', 404, 92, 78, goldStar('op-gold')), starAt);
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * TAU + (rand() - 0.5) * 0.3, sp = 380 + rand() * 420, life = 620 + rand() * 360, spin = (rand() - 0.5) * 900;
    const isStar = i % 3 === 0, sz = isStar ? 24 + rand() * 12 : 9 + rand() * 9;
    const el = put(isStar ? 'op-bit' : `op-dot${i % 2 ? ' gold' : ''}`, 404, 92, sz, isStar ? goldStar(`op-b${i}`) : '');
    track(el, (t) => {
      const age = t - HIT; if (age <= 0) return { o: 0, s: 0 };
      const tau = age / 1000, d = (1 - Math.exp(-3.2 * tau)) / 3.2, p = age / life;
      return { x: Math.cos(ang) * sp * d, y: Math.sin(ang) * sp * d + 300 * tau * tau, r: spin * tau, s: Math.max(0, 1 - p * p), o: p < 1 ? 1 - cl((p - 0.65) / 0.35) : 0 };
    }, 40);
  }

  // The name, popping in letter by letter with a chunky edge.
  const name = h('div', { class: 'op-name', style: `top:${590 / 5.12}%;font-size:${(S * 0.125).toFixed(1)}px` });
  stage.append(name);
  let li = 0;
  for (const ch of 'ayah studio') {
    const sp = h('span', {}, ch);
    name.append(sp);
    if (ch === ' ') continue;
    const at = NAME + li++ * 34;
    track(sp, (t) => { const q = spring(t, at, 2.5, 0.36); return { y: 40 * (1 - q), s: 0.3 + 0.7 * q, r: -12 * (1 - q), o: seg(t, at, at + 70) }; }, 40);
  }

  // The way out: the picture flies forward and the app shows through.
  track(stage, (t) => ({ s: 1 + 0.22 * seg(t, OUT, SHOW_MS) ** 2, y: -10 * eio(seg(t, OUT, SHOW_MS)) }));
  anims.push(box.animate([{ opacity: 1 }, { opacity: 1, offset: OUT / SHOW_MS }, { opacity: 0 }], { duration: SHOW_MS, fill: 'both', easing: 'ease-in' }));

  // Faces and poses on the same clock.
  let face: string | null | undefined, pose: string | null | undefined;
  const state = (t: number) => {
    if (!a) return;
    const f = last(FACES, t), p = last(POSES, t);
    if (f !== face) {
      face = f;
      a.el.querySelectorAll('svg.fg').forEach((e) => { for (const x of [...e.classList]) if (x.startsWith('xp-')) e.classList.remove(x); if (f) e.classList.add(`xp-${f}`); });
    }
    if (p !== pose) {
      if (pose) poseClass(a.el, pose, false);
      pose = p;
      if (p) poseClass(a.el, p, true);
    }
  };
  state(0);
  const clock = anims[anims.length - 1];
  if (manual) {
    const seek = (ms: number) => {
      for (const x of box.getAnimations({ subtree: true })) { x.pause(); x.currentTime = ms; }
      state(ms);
    };
    seek(0);
    return { seek, length: SHOW_MS };
  }
  let heard = -1;
  const tick = () => {
    if (!box.isConnected) return;
    const t = Number(clock.currentTime ?? 0);
    state(t);
    for (const [at, play] of SOUNDS) if (at > heard && at <= t && t - at < 160) play();
    heard = t;
    if (t >= SHOW_MS) { end(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  clock.addEventListener('finish', end);
  return { seek: () => {}, length: SHOW_MS };
}
