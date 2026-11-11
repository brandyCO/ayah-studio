// The character powers up (owner request 2026-11-11, "like Duolingo's streak where the character is on fire, a Dragon
// Ball scene"; our own look): after the daily streak moment, the user's own character crouches while light gathers
// into it, then an aura of flame-light erupts around it (flat two-tone tongues like the reward art), it rises off the
// ground and the streak number slams in over speed lines. The aura grows with the streak in five levels — Glowing,
// Burning, Blazing, Radiant, Like the dawn — each with more layers, tongues, lightning, rising stones and finally gold
// and dawn colours. Only for people with a character. Every moving part is an HTML layer moved by the compositor
// (translate / scale / opacity); reduced motion → the end picture. A tap skips to the end, a second closes.
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
import { two } from './flat';
import './cel.css';
import './powerUp.css';

/** Streak days at which each power level starts. */
export const LEVELS: readonly number[] = [1, 7, 30, 100, 365];
export const powerLevel = (days: number) => LEVELS.reduce((l, d, i) => (days >= d ? i + 1 : l), 1);

interface Tones { out: [string, string]; mid: [string, string]; inn: [string, string]; core: string; spark: string[] }
function tones(level: number): Tones {
  if (level >= 5) return { out: ['#ff9fb2', '#e9688a'], mid: ['#ffc861', '#f59a2a'], inn: ['#fff4cf', '#ffe08a'], core: '#ffffff', spark: ['#ffd36b', '#ff9fb2', '#fff4cf', '#ffffff', '#c8b6ff'] };
  if (level === 4) return { out: ['#ffb02e', '#e07a12'], mid: ['#ffd35a', '#f5ad2a'], inn: ['#fff1b0', '#ffe27a'], core: '#ffffff', spark: ['#ffd35a', '#ffb02e', '#fff1b0', '#ffffff'] };
  const P = rewardPalette();
  return { out: [P.n1, P.deep2], mid: [P.n3, P.n2], inn: [P.hi, P.n3], core: P.core, spark: [P.n1, P.n2, P.n3, P.hi, P.core] };
}

/** Seeded random numbers (the same aura every time for the same level). */
const rng = (seed: number) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

/** An aura outline around the character (view-box 200 × 300, feet at y 272): an egg with flame tongues rising off
 *  its upper part, longer towards the top, each leaning a little and curling at the tip. */
function auraPath(seed: number, w: number, hgt: number, n: number, amp: number): string {
  const r = rng(seed);
  const cx = 100, cy = 276 - hgt / 2;
  const at = (a: number, k = 1) => [cx + (w / 2) * k * Math.cos(a), cy - (hgt / 2) * k * Math.sin(a)];
  const f = (p: number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  // Tongues over the upper part, from the lower right round the top to the lower left.
  const a0 = -0.42, a1 = Math.PI + 0.42;
  const step = (a1 - a0) / n;
  let d = `M${f(at(a0))}`;
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step, e = s + step, m = s + step * (0.45 + r() * 0.1);
    const up = Math.max(0.15, Math.sin(m));
    const len = amp * (0.55 + r() * 0.6) * (0.35 + up);
    const base = at(m);
    // Outward and upward, leaning with the side it grows from.
    const nx = Math.cos(m) * 0.55, ny = -Math.sin(m) * 0.35 - 0.9;
    const k = Math.hypot(nx, ny);
    const lean = (r() - 0.5) * 0.5 + Math.cos(m) * 0.25;
    const tip = [base[0] + (nx / k + lean) * len, base[1] + (ny / k) * len];
    const ps = at(s), pe = at(e);
    const c1 = [ps[0] + (tip[0] - ps[0]) * 0.25 + (nx / k) * len * 0.18, ps[1] + (tip[1] - ps[1]) * 0.55];
    const c2 = [pe[0] + (tip[0] - pe[0]) * 0.25 + (nx / k) * len * 0.12, pe[1] + (tip[1] - pe[1]) * 0.45];
    d += `Q${f(c1)} ${f(tip)}Q${f(c2)} ${f(pe)}`;
  }
  // Round the bottom, under the feet.
  d += `Q${f([cx - w * 0.44, 286])} ${f([cx, 288])}Q${f([cx + w * 0.44, 286])} ${f(at(a0))}Z`;
  return d;
}

/** One aura layer: two outlines of the same size that take turns (the tongues dance), each in two tones. */
function auraLayer(cls: string, seed: number, w: number, hgt: number, n: number, amp: number, [base, shade]: [string, string]) {
  const pic = (sd: number) => `<svg viewBox="0 0 200 300" aria-hidden="true">${two(auraPath(sd, w, hgt, n, amp), base, shade, -4, -3)}</svg>`;
  const el = h('span', { class: `pu-a ${cls}` });
  el.innerHTML = `<i class="pu-f1">${pic(seed)}</i><i class="pu-f2">${pic(seed + 77)}</i>`;
  return el;
}

/** A small flame tongue (rises off the aura and fades). */
const TONGUE = 'M10 0C13 8 20 14 20 22A10 10 0 0 1 0 22C0 14 7 8 10 0Z';
const BOLT = (r: () => number) => {
  let x = 0, y = 0;
  const pts = ['0 0'];
  for (let i = 0; i < 5; i++) { x += (i % 2 ? -1 : 1) * (5 + r() * 7); y += 7 + r() * 6; pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`); }
  return `M${pts.join('L')}`;
};

/** One character blazing: its aura layers, light gathering into it, lightning and stones (Blazing and up), the
 *  character itself, wisps in front and tongues rising. A 200 × 300 box; the moment and the friend cards use it. */
export function blaze(level: number, fig: HTMLElement, seed: number): HTMLElement {
  const T = tones(level);
  const r = rng(seed);
  const size = [0, 0.74, 0.86, 0.96, 1.01, 1.05][level];
  const layers: HTMLElement[] = [];
  layers.push(auraLayer('pu-out', 11 + level, 150 * size, 230 * size, 7 + level, 70 * size, T.out));
  if (level >= 2) layers.push(auraLayer('pu-mid', 23 + level, 124 * size, 200 * size, 6 + level, 54 * size, T.mid));
  layers.push(auraLayer('pu-inn', 37 + level, 96 * size, 168 * size, 5 + level, 34 * size, T.inn));
  const front = auraLayer('pu-front', 51 + level, 140 * size, 200 * size, 5 + level, 40 * size, T.inn);
  const tongues = h('span', { class: 'pu-tongues' });
  const nT = 6 + level * 3;
  for (let i = 0; i < nT; i++) {
    const side = i % 2 ? 1 : -1;
    const x = 50 + side * (8 + r() * 26 * size);
    const tg = h('i', { class: 'pu-t' });
    tg.innerHTML = `<svg viewBox="0 0 20 32" aria-hidden="true"><path d="${TONGUE}" fill="${i % 3 ? T.mid[0] : T.inn[0]}"/></svg>`;
    tg.style.cssText = `left:${x.toFixed(1)}%;top:${(30 + r() * 40).toFixed(1)}%;--s:${(0.6 + r() * 0.9).toFixed(2)};--d:${(r() * 1.4).toFixed(2)}s;--t:${(0.9 + r() * 0.7).toFixed(2)}s;--x:${(side * (4 + r() * 10)).toFixed(0)}px`;
    tongues.append(tg);
  }
  const extras: HTMLElement[] = [];
  if (level >= 3) {
    // Lightning crackling round the body.
    const bolts = h('span', { class: 'pu-bolts' });
    for (let i = 0; i < 4 + (level - 3) * 2; i++) {
      const b = h('i', {});
      b.innerHTML = `<svg viewBox="-16 -2 32 44" aria-hidden="true"><path d="${BOLT(r)}" fill="none" stroke="${T.core}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
      b.style.cssText = `left:${(20 + r() * 60).toFixed(1)}%;top:${(18 + r() * 55).toFixed(1)}%;rotate:${(r() * 60 - 30).toFixed(0)}deg;--d:${(r() * 1.6).toFixed(2)}s`;
      bolts.append(b);
    }
    // Stones lifting off the ground.
    const stones = h('span', { class: 'pu-stones' });
    for (let i = 0; i < 7; i++) {
      const s = h('i', {});
      s.style.cssText = `left:${(8 + r() * 84).toFixed(1)}%;--w:${(5 + r() * 9).toFixed(0)}px;--d:${(r() * 1.2).toFixed(2)}s;--t:${(2.4 + r() * 1.6).toFixed(2)}s;--h:${(-60 - r() * 120).toFixed(0)}px`;
      stones.append(s);
    }
    extras.push(bolts, stones);
  }
  // Light gathering into the character while it charges.
  const gather = h('span', { class: 'pu-gather' });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + r() * 0.3, d = 120 + r() * 80;
    const g = h('i', {});
    g.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--d:${(r() * 0.9).toFixed(2)}s;background:${[T.inn[0], T.mid[0], T.core][i % 3]}`;
    gather.append(g);
  }
  return h('span', { class: 'pu-fig', style: `--pu-a:${T.mid[0]};--pu-b:${T.out[0]};--pu-c:${T.inn[0]};--pu-core:${T.core}` },
    h('span', { class: 'pu-aura' }, ...layers), gather, ...extras, h('span', { class: 'pu-body' }, fig), h('span', { class: 'pu-aura pu-aura-front' }, front), tongues);
}

/** Two friends' characters standing side by side, both on fire (a card on Ranks; no moment). */
export function blazingPair(level: number, a: HTMLElement, b: HTMLElement | null, on: boolean): HTMLElement {
  const box = h('span', { class: `pu-mini${b ? ' duo' : ''}${on ? ' lit skip' : ''}` });
  box.append(on ? blaze(level, a, 7) : h('span', { class: 'pu-fig' }, h('span', { class: 'pu-body' }, a)));
  if (b) box.append(on ? blaze(level, b, 13) : h('span', { class: 'pu-fig' }, h('span', { class: 'pu-body' }, b)));
  return box;
}

/** Plays the power-up for a streak of `days`; resolves when it is closed. Null when there is no character. */
export interface PowerUpOpts {
  friend?: { code: string | null; name: string };
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
    h('p', { class: 'sf-kick' }, o.custom ? o.custom.kicker : o.friend ? mt('pu.friend', { name: o.friend.name }) : newLevel ? mt('pu.up') : mt('pu.kicker')),
    stage, text);
  const el = h('div', { class: `cel go sf sf-l${level}${still ? ' done slam' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('span', { class: 'sf-sky', 'aria-hidden': 'true' }), heatGlow, back, shake, front, flash);

  return new Promise((resolve) => {
    const frames = still ? null : fpsStart('Power up');
    let closed = false, raf = 0, t0 = 0, skipped = false;
    const burns: number[] = [];
    const close = () => {
      if (closed) return;
      closed = true;
      frames?.();
      cancelAnimationFrame(raf);
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
        if (skip) return;
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
