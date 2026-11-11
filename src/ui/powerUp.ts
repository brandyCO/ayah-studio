// The character powers up (owner request 2026-11-11, "like Duolingo's streak where the character is on fire, a Dragon
// Ball scene"; our own look): after the daily streak moment, the user's own character crouches while light gathers
// into it, then an aura of flame-light erupts around it (flat two-tone tongues like the reward art), it rises off the
// ground and the streak number slams in over speed lines. The aura grows with the streak in five levels — Glowing,
// Burning, Blazing, Radiant, Like the dawn — each with more layers, tongues, lightning, rising stones and finally gold
// and dawn colours. Only for people with a character. Every moving part is an HTML layer moved by the compositor
// (translate / scale / opacity); reduced motion → the end picture. A tap skips to the end, a second closes.
import { h } from './dom';
import { actor as makeActor, poseClass } from './actor';
import { holdPage, reduced } from './juice';
import { sfx } from './sfx';
import { sparks, type Sparks } from './sparks';
import { rewardPalette } from './theme';
import { t } from '../i18n';
import { mt, type MomentKey } from '../i18n/moments';
import { fpsStart } from '../fps';
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
export function powerUp(days: number, o: PowerUpOpts = {}): Promise<void> | null {
  const me = makeActor('pu-actor');
  if (!me) return null;
  const level = o.custom ? Math.max(1, Math.min(5, o.custom.aura)) : powerLevel(days);
  const T = tones(level);
  const still = reduced();
  const r = rng(days * 31 + level);
  const name = mt(`pu.l${level}` as MomentKey);
  const newLevel = level > 1 && days === LEVELS[level - 1];

  const figs = [blaze(level, me.el, days * 31 + level)];
  const buddy = o.friend ? makeActor('pu-actor', o.friend.code) : null;
  if (buddy) figs.push(blaze(level, buddy.el, days * 17 + 5));
  const body = figs[0].querySelector('.pu-body')!;
  const stage = h('div', { class: `pu-stage${buddy ? ' duo' : ''}` },
    h('span', { class: 'pu-ground' }, h('i', { class: 'pu-glow' }), h('i', { class: 'pu-wave' }), h('i', { class: 'pu-wave w2' })),
    level >= 4 ? h('span', { class: 'pu-rays' }) : '',
    ...figs);
  const num = h('b', { class: 'pu-num' }, String(days));
  const ok = h('button', { class: 'cel-ok pu-ok' }, t('sm.continue'));
  const nextAt = LEVELS[level];
  const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
  const shake = h('div', { class: 'pu-shake' },
    h('p', { class: 'pu-kick' }, o.custom ? o.custom.kicker : o.friend ? mt('pu.friend', { name: o.friend.name }) : newLevel ? mt('pu.up') : mt('pu.kicker')),
    stage,
    h('div', { class: 'pu-count' }, h('span', { class: 'pu-lines', 'aria-hidden': 'true' }), num, h('span', { class: 'pu-label' }, o.custom ? o.custom.label : o.friend ? mt('pu.friendDays') : t(days === 1 ? 'me.day' : 'me.days'))),
    o.custom ? '' : h('p', { class: 'pu-level' }, mt('pu.level', { n: level, name })),
    h('p', { class: 'pu-sub' }, o.custom ? o.custom.sub : nextAt ? mt('pu.next', { n: nextAt - days, name: mt(`pu.l${level + 1}` as MomentKey) }) : mt('pu.max')),
    ok);
  const label = o.custom ? `${o.custom.kicker} · ${o.custom.label} ${days}` : `${mt('pu.level', { n: level, name })} · ${days} ${t(days === 1 ? 'me.day' : 'me.days')}`;
  const el = h('div', { class: `cel pu pu-l${level}${still ? ' still lit slam done' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label,
    style: `--pu-a:${T.mid[0]};--pu-b:${T.out[0]};--pu-c:${T.inn[0]};--pu-core:${T.core}` },
    h('span', { class: 'pu-sky', 'aria-hidden': 'true' }),
    h('span', { class: 'cel-flash pu-flash', 'aria-hidden': 'true' }),
    canvas,
    shake);

  return new Promise((resolve) => {
    const frames = still ? null : fpsStart('Power up');
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    let fx: Sparks | null = null;
    let closed = false, ended = still;
    const close = () => {
      if (closed) return;
      closed = true;
      frames?.();
      timers.forEach(clearTimeout);
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      holdPage(false);
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const centre = (node: Element) => {
      const a = node.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      return [a.left + a.width / 2 - c.left, a.top + a.height / 2 - c.top] as const;
    };
    const jolt = (px: number, ms: number) => {
      if (still) return;
      const k: Keyframe[] = [];
      for (let i = 0; i <= 8; i++) { const f = 1 - i / 8; k.push({ translate: i === 8 ? '0 0' : `${((r() - 0.5) * 2 * px * f).toFixed(1)}px ${((r() - 0.5) * 2 * px * f).toFixed(1)}px` }); }
      shake.animate(k, { duration: ms, easing: 'linear' });
    };
    // The end picture at once (a tap during the build-up).
    const finish = () => {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
      el.classList.remove('charging');
      el.classList.add('go', 'lit', 'slam', 'done', 'skip');
      poseClass(me.el, 'cheer', true);
      me.face('star', 0);
      fx?.motes(true);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    ok.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    el.addEventListener('click', () => { if (ended) close(); else finish(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    holdPage(true);
    ok.focus({ preventScroll: true });
    if (still) { poseClass(me.el, 'cheer', true); me.face('star', 0); return; }

    // Higher levels take a little longer to charge, so the eruption is bigger.
    const charge = [0, 800, 1000, 1250, 1400, 1550][level];
    // 1. Charge: the character crouches and trembles, light streams into it, the ground hums.
    later(260, () => {
      el.classList.add('go', 'charging');
      me.face('calm', 0);
      sfx.rare(charge);
      for (let i = 0; i < 3; i++) later(i * (charge / 3), () => sfx.strain(0.3 + i * 0.3, Math.min(4, level - 1)));
    });
    // 2. Ignite: a flash, the aura erupts with a shockwave, arms up, the screen jolts.
    later(260 + charge, () => {
      const [x, y] = centre(body);
      el.classList.remove('charging');
      el.classList.add('lit');
      fx = sparks(canvas, T.spark);
      fx.burst(x, y, 60 + level * 30, 0.9 + level * 0.15);
      if (level >= 4) later(220, () => fx?.burst(x, y - 30, 80, 1.3));
      sfx.open(level >= 4 ? 2 : level >= 3 ? 1 : 0, Math.min(4, level - 1));
      poseClass(me.el, 'cheer', true);
      me.face('star', 0);
      jolt(6 + level * 2.5, 520);
    });
    // 3. The streak number slams in over speed lines.
    later(260 + charge + 650, () => {
      const [x, y] = centre(num);
      el.classList.add('slam');
      later(170, () => { fx?.burst(x, y, 36 + level * 6, 0.7); jolt(4 + level, 300); sfx.pop(4, level >= 3); });
    });
    // 4. It settles, floating in its aura; the level and the next one appear.
    later(260 + charge + 1300, () => {
      ended = true;
      el.classList.add('done');
      fx?.motes(true);
      sfx.shimmer();
    });
  });
}
