// The character powers up (owner request 2026-11-11, "like Duolingo's streak where the character is on fire"; our own
// look): the user's character stands inside the smooth streak flame (flatFire.ts), crouches, leaps as the flame
// swirls round it, lands and the streak number slams in. Five levels by streak (Glowing … Like the dawn). Played on
// fire days after the streak moment, for a friend streak (both characters in the flame) and on a level up. Only for
// people with a character; reduced motion → the end picture. A tap skips to the end, a second closes.
// blazingPair() is the same flame at rest round two friends (Ranks cards and profiles).
import { h } from './dom';
import { actor as makeActor, poseClass } from './actor';
import { holdPage, lite, reduced } from './juice';
import { sfx } from './sfx';
import { FlatFire, flatPalette } from './flatFire';
import { rewardPalette } from './theme';
import { t } from '../i18n';
import { mt, type MomentKey } from '../i18n/moments';
import { fpsStart } from '../fps';
import './streakFire.css';
import { flame, type FlameTier } from './flame';
import './cel.css';
import './powerUp.css';

let fireIds = 0;

/** Streak days at which each power level starts. */
export const LEVELS: readonly number[] = [1, 7, 30, 100, 365];
export const powerLevel = (days: number) => LEVELS.reduce((l, d, i) => (days >= d ? i + 1 : l), 1);

/** The gradient map that lights a character from inside the flame (the power-up's own, at rest): dark → the flame's
 *  deep colour, light → its pale core, blended with the character's colours by `k`. One per palette, shared. */
function insideFilter(k: number): string {
  const fp = rewardPalette();
  const id = `pu-inside-${[fp.deep2, fp.n3, fp.core].join('').replace(/#/g, '')}-${Math.round(k * 100)}`;
  if (document.getElementById(id)) return id;
  const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const stops = [fp.deep2, fp.n3, fp.n2, fp.hi, fp.core].map(ch);
  const tv = (i: number) => stops.map((c) => c[i].toFixed(3)).join(' ');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0');
  svg.innerHTML = `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".3 .59 .11 0 0 .3 .59 .11 0 0 .3 .59 .11 0 0 0 0 0 1 0" result="g"/>`
    + `<feComponentTransfer in="g" result="m"><feFuncR type="table" tableValues="${tv(0)}"/><feFuncG type="table" tableValues="${tv(1)}"/><feFuncB type="table" tableValues="${tv(2)}"/></feComponentTransfer>`
    + `<feComposite in="m" in2="SourceGraphic" operator="arithmetic" k1="0" k2="${k.toFixed(2)}" k3="${(1 - k).toFixed(2)}" k4="0"/></filter>`;
  document.body.append(svg);
  return id;
}

/** One character standing inside the smooth streak flame (the same flame as the streak card and the power-up,
 *  owner 2026-11-12: "the same flame that we use all the time … the character is inside the flame"): the flame
 *  sways behind it, its base closes over the feet in front, and the character is lit in the flame's colours.
 *  `px` is about the picture's height on screen, so the flame is drawn sharp. */
function inFlame(level: number, fig: HTMLElement, px: number): HTMLElement {
  const tier: FlameTier = level >= 3 ? 3 : level >= 2 ? 2 : 1;
  const size = Math.round(px * 1.2);
  const body = h('span', { class: 'pu-body' }, fig);
  body.style.filter = `url(#${insideFilter(0.72)})`;
  return h('span', { class: 'pu-fig' },
    h('span', { class: 'pu-flame', 'aria-hidden': 'true' }, flame(tier, size)),
    body,
    h('span', { class: 'pu-flame pu-flame-front', 'aria-hidden': 'true' }, flame(tier, size)));
}

/** Two friends' characters side by side, both inside the flame while both earned XP today (friend cards and
 *  profiles on Ranks). */
export function blazingPair(level: number, a: HTMLElement, b: HTMLElement | null, on: boolean, px = 300): HTMLElement {
  const box = h('span', { class: `pu-mini${b ? ' duo' : ''}${on ? ' lit' : ''}` });
  const one = (el: HTMLElement) => (on ? inFlame(level, el, px) : h('span', { class: 'pu-fig' }, h('span', { class: 'pu-body' }, el)));
  box.append(one(a));
  if (b) box.append(one(b));
  return box;
}

/** Plays the power-up for a streak of `days`; resolves when it is closed. Null when there is no character. */
export interface PowerUpOpts {
  friend?: { code: string | null; name: string; /** The friend's lamp of Light (lampPill), shown by the name. */ lamp?: Node | '' };
  /** A custom moment (a level up): its own kicker, label beside the number and line under it, and the aura level. */
  custom?: { kicker: string; label: string; sub: string; aura: number };
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const outCubic = (x: number) => 1 - (1 - clamp(x)) ** 3;
const inQuad = (x: number) => clamp(x) ** 2;
/** A damped spring settling from 1 to 0 over time `s` seconds (`f` wobbles a second). */
const wobble = (s: number, f = 3, k = 7) => (s < 0 ? 0 : Math.exp(-k * s) * Math.cos(Math.PI * 2 * f * s));

// The moment's beats (ms): stand, crouch, leap, catch fire at the top, fall and land, the number slams in.
const B = { crouch: 320, leap: 900, ignite: 1180, fall: 1520, land: 1760, slam: 1960, flip: 2480, done: 2900 };
const APEX = -0.24;

/** The character's jump at time `t` ms: height (share of the stage, negative is up), squash/stretch and tremble. */
function pose(t: number, delay: number) {
  t -= delay;
  let y = 0, sx = 1, sy = 1, tr = 0;
  if (t < B.crouch) {
    // Standing: breathing a little.
    sy = 1 + 0.012 * Math.sin(t / 140);
  } else if (t < B.leap) {
    // Crouch: squashes down, trembling harder as it gathers.
    const e = outCubic((t - B.crouch) / 260);
    sy = 1 - 0.2 * e; sx = 1 + 0.13 * e; y = 0.015 * e;
    tr = clamp((t - B.crouch) / (B.leap - B.crouch)) * 3;
  } else if (t < B.ignite) {
    // Leap: shoots up stretched thin, rounding out on the way.
    const p = (t - B.leap) / (B.ignite - B.leap);
    y = APEX * outCubic(p);
    sy = 1.24 - 0.24 * outCubic(p); sx = 0.84 + 0.16 * outCubic(p);
  } else if (t < B.fall) {
    // Hangs at the top as the fire catches, a little jolt from the blast.
    const s = (t - B.ignite) / 1000;
    y = APEX - 0.02 * Math.sin(Math.min(1, s * 3) * Math.PI);
    sy = 1 + 0.1 * wobble(s, 4); sx = 1 - 0.07 * wobble(s, 4);
  } else if (t < B.land) {
    // Falls back down, speeding up, stretched a little.
    const p = (t - B.fall) / (B.land - B.fall);
    y = APEX * (1 - inQuad(p));
    sy = 1 + 0.08 * inQuad(p); sx = 1 - 0.05 * inQuad(p);
  } else if (t < B.done) {
    // Lands with a heavy squash that springs back.
    const s = (t - B.land) / 1000;
    sy = 1 - 0.22 * wobble(s, 3, 6); sx = 1 + 0.15 * wobble(s, 3, 6);
  } else {
    // Bouncing on the spot in its flames, every 1.3 s.
    const ph = ((t - B.done) % 1300) / 1300;
    if (ph < 0.08) { const e = ph / 0.08; sy = 1 - 0.1 * Math.sin(e * Math.PI); sx = 1 + 0.07 * Math.sin(e * Math.PI); }
    else if (ph < 0.42) { const p = (ph - 0.08) / 0.34; y = -0.09 * 4 * p * (1 - p); sy = 1 + 0.06 * (1 - Math.abs(2 * p - 1)); sx = 2 - sy; }
    else if (ph < 0.52) { const e = (ph - 0.42) / 0.1; sy = 1 - 0.12 * Math.sin(e * Math.PI); sx = 1 + 0.08 * Math.sin(e * Math.PI); }
  }
  return { y, sx, sy, tr };
}

/** How hot the fire round a character burns at time `t` ms (0 none … 1 burning … 2 a flare). */
function heat(t: number, level: number) {
  const k = 0.85 + level * 0.06;
  if (t < B.crouch) return 0.12;
  if (t < B.leap) return 0.12 + 0.4 * clamp((t - B.crouch) / (B.leap - B.crouch));
  if (t < B.ignite) return 0.6;
  if (t < B.land) return k * (1 + 1.1 * Math.exp(-(t - B.ignite) / 260));
  if (t < B.done) return k * (1 + 0.6 * Math.exp(-(t - B.land) / 300));
  return k * (0.92 + 0.12 * Math.sin(t / 170) + 0.06 * Math.sin(t / 53));
}

export function powerUp(days: number, o: PowerUpOpts = {}): Promise<void> | null {
  const me = makeActor('sf-actor');
  if (!me) return null;
  const level = o.custom ? Math.max(1, Math.min(5, o.custom.aura)) : powerLevel(days);
  const still = reduced();
  const name = mt(`pu.l${level}` as MomentKey);
  const newLevel = level > 1 && days === LEVELS[level - 1];
  const buddy = o.friend ? makeActor('sf-actor', o.friend.code) : null;
  const actors = buddy ? [me, buddy] : [me];

  const bodies = actors.map((a) => h('span', { class: 'sf-body' }, a.el));
  const rings = bodies.map(() => [h('i', { class: 'sf-ring' }), h('i', { class: 'sf-ring' })]);
  const figs = bodies.map((b, i) => h('span', { class: `sf-fig f${i}` }, ...rings[i], h('i', { class: 'sf-shadow' }), b));
  const stage = h('div', { class: `sf-stage${buddy ? ' duo' : ''}` }, ...figs);
  const back = h('canvas', { class: 'sf-cv sf-back', 'aria-hidden': 'true' });
  const front = h('canvas', { class: 'sf-cv sf-front', 'aria-hidden': 'true' });
  const prev = Math.max(0, days - 1);
  const numOld = h('span', { class: 'sf-n old' }, String(prev));
  const numNew = h('span', { class: 'sf-n new' }, String(days));
  const num = h('b', { class: 'sf-num' }, numOld, numNew);
  const ok = h('button', { class: 'cel-ok sf-ok' }, t('sm.continue'));
  const nextAt = LEVELS[level];
  const heatGlow = h('span', { class: 'sf-heat', 'aria-hidden': 'true' });
  const flash = h('span', { class: 'sf-flash', 'aria-hidden': 'true' });
  const text = h('div', { class: 'sf-text' },
    h('div', { class: 'sf-count' }, num, h('span', { class: 'sf-label' }, o.custom ? o.custom.label : o.friend ? mt('pu.friendDays') : t(days === 1 ? 'me.day' : 'me.days'))),
    o.custom ? '' : h('p', { class: 'sf-level' }, mt('pu.level', { n: level, name })),
    h('p', { class: 'sf-sub' }, o.custom ? o.custom.sub : nextAt ? mt('pu.next', { n: nextAt - days, name: mt(`pu.l${level + 1}` as MomentKey) }) : mt('pu.max')),
    ok);
  const label = o.custom ? `${o.custom.kicker} · ${o.custom.label} ${days}` : `${mt('pu.level', { n: level, name })} · ${days} ${t(days === 1 ? 'me.day' : 'me.days')}`;
  const shake = h('div', { class: 'sf-shake' },
    h('p', { class: 'sf-kick' }, o.custom ? o.custom.kicker : o.friend ? mt('pu.friend', { name: o.friend.name }) : newLevel ? mt('pu.up') : mt('pu.kicker'), o.friend?.lamp || ''),
    stage, text);
  // Inside the flame (owner: "his colour becomes as if he is inside the flame"): the character is lit by the fire
  // itself, not seen through it. A gradient map recolours him in the flame's own tones (dark → deep, light → the
  // flame's pale core), blended with his own colours by `k`.
  const fid = `pu-in-${++fireIds}`;
  const fp = rewardPalette();
  const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const stops = [fp.deep2, fp.n3, fp.n2, fp.hi, fp.core].map(ch);
  const tv = (i: number) => stops.map((c) => c[i].toFixed(3)).join(' ');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0');
  svg.innerHTML = `<filter id="${fid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".3 .59 .11 0 0 .3 .59 .11 0 0 .3 .59 .11 0 0 0 0 0 1 0" result="g"/>`
    + `<feComponentTransfer in="g" result="m"><feFuncR type="table" tableValues="${tv(0)}"/><feFuncG type="table" tableValues="${tv(1)}"/><feFuncB type="table" tableValues="${tv(2)}"/></feComponentTransfer>`
    + `<feComposite in="m" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0" k3="1" k4="0"/></filter>`;
  const mixer = svg.querySelector('feComposite')!;
  const inFire = (k: number) => {
    mixer.setAttribute('k2', k.toFixed(3));
    mixer.setAttribute('k3', (1 - k).toFixed(3));
    bodies.forEach((b) => { b.style.filter = `url(#${fid})`; });
  };
  const INSIDE = 0.8;
  const glowIn = () => {
    const t1 = performance.now();
    const step = () => { const u = Math.min(1, (performance.now() - t1) / 420); inFire(INSIDE * (1 - (1 - u) ** 3)); if (u < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const el = h('div', { class: `cel go sf sf-l${level}${still ? ' done slam' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    svg, h('span', { class: 'sf-sky', 'aria-hidden': 'true' }), heatGlow, back, shake, front, flash);

  return new Promise((resolve) => {
    const frames = still ? null : fpsStart('Power up');
    let closed = false, raf = 0, t0 = 0, skipped = false;
    const burns: number[] = [];
    let stopFire = () => {};
    const close = () => {
      if (closed) return;
      closed = true;
      frames?.();
      cancelAnimationFrame(raf);
      stopFire();
      burns.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      window.removeEventListener('resize', place);
      el.classList.add('out');
      holdPage(false);
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    ok.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    holdPage(true);
    ok.focus({ preventScroll: true });

    const fire = new FlatFire(back, front, flatPalette(level), lite());
    stopFire = () => fire.stop();
    // Where each character stands (read once, and again on a resize; the jump itself is drawn from the timeline).
    type Spot = { cx: number; foot: number; w: number; hgt: number; px: number };
    let spots: Spot[] = [];
    let numBox = { cx: 0, top: 0, w: 0 };
    const place = () => {
      fire.resize();
      const c = back.getBoundingClientRect();
      spots = figs.map((f) => {
        const r = f.getBoundingClientRect();
        return { cx: r.left + r.width / 2 - c.left, foot: r.bottom - c.top, w: r.width, hgt: r.height, px: stage.getBoundingClientRect().height };
      });
      const n = num.getBoundingClientRect();
      numBox = { cx: n.left + n.width / 2 - c.left, top: n.top - c.top + n.height * 0.18, w: n.width * 0.8 };
    };
    place();
    window.addEventListener('resize', place);
    const auras = spots.map((s) => fire.aura({ cx: s.cx, foot: s.foot, w: s.w, h: s.hgt }));

    const jolt = (px: number, ms: number) => {
      if (still) return;
      const k: Keyframe[] = [];
      for (let i = 0; i <= 8; i++) { const f = 1 - i / 8; k.push({ translate: i === 8 ? '0 0' : `${((Math.random() - 0.5) * 2 * px * f).toFixed(1)}px ${((Math.random() - 0.5) * 2 * px * f).toFixed(1)}px` }); }
      shake.animate(k, { duration: ms, easing: 'linear' });
    };
    const ring = (i: number, big: number) => {
      for (const [j, r] of rings[i].entries()) r.animate([{ opacity: 0.95, scale: '0.15 0.05' }, { opacity: 0, scale: `${big + j * 0.8} ${(big + j * 0.8) * 0.3}` }], { duration: 620 + j * 160, delay: j * 70, easing: 'cubic-bezier(.1,.7,.3,1)' });
    };
    const flashNow = () => flash.animate([{ opacity: 0.45 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' });
    const slamNum = () => {
      el.classList.add('slam');
      numOld.animate([{ scale: 3.2, opacity: 0 }, { scale: 0.86, opacity: 1, offset: 0.55 }, { scale: 1.07, offset: 0.78 }, { scale: 1, opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,0,.4,1)', fill: 'both' });
    };
    const flipNum = () => {
      el.classList.add('flip');
      numOld.animate([{ translate: '0 0', opacity: 1, scale: 1 }, { translate: '0 60%', opacity: 0, scale: 0.7 }], { duration: 260, easing: 'ease-in', fill: 'both' });
      numNew.animate([{ translate: '0 -40%', opacity: 0, scale: 1.9 }, { translate: '0 0', opacity: 1, scale: 0.9, offset: 0.6 }, { scale: 1.06, offset: 0.82 }, { translate: '0 0', opacity: 1, scale: 1 }], { duration: 420, easing: 'cubic-bezier(.3,0,.4,1)', fill: 'both' });
    };

    // The beats: each runs once (a tap jumps to the end, running only what sets the picture).
    const beats: { at: number; run: (skip: boolean) => void; done?: boolean }[] = [
      { at: B.crouch, run: (skip) => { if (!skip) { sfx.gather(B.leap - B.crouch); me.face('calm', 0); buddy?.face('calm', 0); } } },
      { at: B.leap, run: (skip) => { if (!skip) { sfx.leap(); spots.forEach((s) => { fire.burst(s.cx, s.foot, 8, 300, true); fire.ring(s.cx, s.foot, s.w * 0.9); }); auras.forEach((a) => fire.swirl(a, (B.ignite - B.leap) / 1000 + 0.12)); } } },
      { at: B.ignite, run: (skip) => {
        el.classList.add('lit');
        actors.forEach((a) => { poseClass(a.el, 'cheer', true); a.face('star', 0); });
        if (skip) { inFire(INSIDE); return; }
        glowIn();
        sfx.ignite(level);
        flashNow();
        jolt(10 + level * 3, 560);
        spots.forEach((s) => { const y = s.foot + APEX * s.px - s.hgt * 0.5; fire.burst(s.cx, y, 18 + level * 4, 560 + level * 40); });
        const burn = () => { if (closed) return; sfx.burn(2400, level); burns.push(window.setTimeout(burn, 2300)); };
        burns.push(window.setTimeout(burn, 500));
      } },
      { at: B.land, run: (skip) => { if (!skip) { sfx.slam(); jolt(8 + level * 2, 380); spots.forEach((s, i) => { ring(i, 3.2); fire.ring(s.cx, s.foot, s.w * 1.6); fire.burst(s.cx, s.foot, 14 + level * 2, 520, true); }); } } },
      { at: B.slam, run: (skip) => {
        if (skip) { el.classList.add('slam'); return; }
        slamNum();
        setTimeout(() => { fire.sparks(numBox.cx, numBox.top + 30, 14, 420); sfx.pop(4, true); jolt(6 + level, 260); }, 200);
      } },
      { at: B.flip, run: (skip) => {
        if (skip) { el.classList.add('flip'); return; }
        flipNum();
        setTimeout(() => { fire.burst(numBox.cx, numBox.top + 30, 12 + level * 2, 460); sfx.ignite(Math.max(1, level - 1)); jolt(8, 300); }, 160);
      } },
      { at: B.done, run: () => { el.classList.add('done'); } },
    ];
    const skipToEnd = () => {
      if (skipped) return;
      skipped = true;
      for (const b of beats) if (!b.done) { b.done = true; b.run(true); }
      el.classList.add('skip');
      t0 = performance.now() - B.done;
    };
    el.addEventListener('click', () => { if (el.classList.contains('done')) close(); else skipToEnd(); });

    const frame = (time: number) => {
      if (closed) return;
      if (!t0) t0 = time;
      const tt = time - t0;
      for (const b of beats) if (!b.done && tt >= b.at) { b.done = true; b.run(false); }
      spots.forEach((s, i) => {
        const p = pose(tt, i * 70);
        const tr = p.tr ? `${((Math.random() - 0.5) * 2 * p.tr).toFixed(1)}px` : '0px';
        bodies[i].style.transform = `translate(${tr}, ${(p.y * s.px).toFixed(1)}px) scale(${p.sx.toFixed(3)}, ${p.sy.toFixed(3)})`;
        const hgt = heat(tt - i * 70, level);
        const lift = p.y * s.px;
        // The fire rides with the character: a flicker at its feet while it gathers, then all round it.
        const a = auras[i];
        a.cx = s.cx; a.foot = s.foot; a.w = s.w; a.h = s.hgt; a.lift = lift;
        a.heat = tt < B.ignite ? Math.max(0, hgt - 0.12) * 0.5 : hgt;
        figs[i].style.setProperty('--sh', (1 - clamp(-lift / (s.hgt * 0.6)) * 0.7).toFixed(2));
      });
      heatGlow.style.opacity = Math.min(1, heat(tt, level) / 1.4).toFixed(2);
      fire.step(Math.min(0.05, (time - (last || time)) / 1000));
      last = time;
      fire.draw();
      raf = requestAnimationFrame(frame);
    };
    let last = 0;
    if (still) {
      // Reduced motion: the end picture, its fire still (drawn once).
      for (const b of beats) { b.done = true; b.run(true); }
      for (let i = 0; i < 70; i++) {
        auras.forEach((a) => { a.heat = 1; });
        fire.step(1 / 60);
      }
      fire.draw();
      heatGlow.style.opacity = '0.8';
      return;
    }
    raf = requestAnimationFrame(frame);
  });
}
