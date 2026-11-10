// Reward moments (Me tab, played only when the user taps Claim, never over reading). Five calm,
// light-filled animations in SVG + CSS, each ending on its own still picture:
//   lantern  a daily goal met: a paper lantern rises, opens into warm light, gold motes drift up
//   star     every goal met today: gold lines draw the eight-pointed khatam star, which fills with light
//   flame    a streak milestone: the flame rises, rings of light pulse out, the days count up, the badge drops in
//   rosette  a big milestone (a surah, a juz, a Khatm, 10,000 dhikr…): a twelve-petal rosette unfolds like a
//            mosque window, the badge settles in its centre
//   khatm    reading every page of the mushaf: the rosette doubled (an outer ring of 24 petals opening after
//            the 12), a slow halo that stays, the date under the title; the longest and grandest
//   medal    other badges: soft rays turn slowly behind the badge as it settles
// Polish: the Claim button lifts into a seed of light that flies to the centre, gathers and bursts
// (flash, light sweep, sparks on a canvas, src/ui/sparks.ts); the moment unfolds from that burst with
// overshoot, a second beat when it lands, then slow motes rising. A light vibration on each beat, no sound. Tap the button (or anywhere once it has played) to close; Esc too.
// chest     a goal's (or a Ranks prize's) chest: it drops in and waits; the user taps it open (3–5 taps:
//           each one jolts it, cracks it and lets more light out of the seam), it bursts open and what
//           was won comes out one by one (`loot`: Light, a trophy, a freeze, an avatar…). Never random:
//           the chest holds exactly what was earned, and it says so before it is opened.
// Reduced motion: the still final picture, faded in.
import type { BadgeDef } from '../data/badges';
import { locale, t, type Key } from '../i18n';
import { h } from './dom';
import { badgeArt } from './badge';
import { flame } from './flame';
import { sparks, type Sparks } from './sparks';
import { chestArt, chestTier } from './chest';
import { rewardPalette, rgba } from './theme';
import './cel.css';
import './celebrate.css';
import { actor as makeActor } from './actor';
import { freezeArt } from './flat';
import { bump, combo, noor as makeNoor, popIn, squash, tick as tickNum } from './juice';
import { sfx } from './sfx';

/** The theme's reward colours, read when a moment starts (so a theme change shows at once). */
let P = rewardPalette();

export type Moment =
  | { kind: 'lantern' | 'star'; title: string; sub: string; kicker?: string }
  | { kind: 'chest'; title: string; sub: string; kicker?: string; loot?: Loot[] }
  | { kind: 'flame'; badge: BadgeDef; days: number }
  | { kind: 'rosette' | 'medal' | 'khatm'; badge: BadgeDef };

/** What a chest holds, shown one by one as it opens. Without `loot` a chest holds the Light it was given. */
export type Loot =
  | { kind: 'light'; n: number }
  | { kind: 'freeze' }
  | { kind: 'item'; art: Node; label: string; rare?: boolean };

const NS = 'http://www.w3.org/2000/svg';
const svg = (box: number, inner: string) => {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${box} ${box}`);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
};
const motes = (n: number, cx: number, cy: number, spread: number) => Array.from({ length: n }, (_, i) =>
  `<circle class="cel-mote" cx="${cx + (((i * 37) % (spread * 2)) - spread)}" cy="${cy}" r="${1.6 + (i % 3) * 0.8}" style="--d:${(0.9 + ((i * 0.13) % 0.9)).toFixed(2)}s;--y:${-70 - ((i * 23) % 60)}px"/>`).join('');

function starPoints(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const square = (cx: number, cy: number, r: number, rot: number) => Array.from({ length: 4 }, (_, i) => {
  const a = ((i * 90 + rot) * Math.PI) / 180;
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

function lanternArt() {
  return svg(200, `
    <defs>
      <radialGradient id="celG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.core}" stop-opacity=".95"/><stop offset=".4" stop-color="${P.n3}" stop-opacity=".45"/><stop offset="1" stop-color="${P.n1}" stop-opacity="0"/></radialGradient>
      <linearGradient id="celL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.n1}"/><stop offset=".5" stop-color="${P.hi}"/><stop offset="1" stop-color="${P.n1}"/></linearGradient>
    </defs>
    <circle class="cel-burst" cx="100" cy="104" r="92" fill="url(#celG)"/>
    <g class="cel-lantern">
      <path d="M100 22V44" stroke="${P.n3}" stroke-width="2" stroke-linecap="round"/>
      <path d="M86 44H114L110 54H90Z" fill="${P.deep2}"/>
      <path d="M80 54C72 80 72 128 80 154H120C128 128 128 80 120 54Z" fill="url(#celL)"/>
      <path d="M91 54C86 84 86 124 91 154M109 54C114 84 114 124 109 154M100 54V154" fill="none" stroke="${P.deep}" stroke-opacity=".35" stroke-width="1.5"/>
      <ellipse class="cel-core" cx="100" cy="104" rx="13" ry="28" fill="${P.core}"/>
      <path d="M90 154H110L106 162H94Z" fill="${P.deep2}"/>
      <path d="M100 162V178" stroke="${P.n3}" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g fill="${P.n3}">${motes(14, 100, 104, 46)}</g>`);
}

function starArt() {
  const sq1 = square(100, 100, 74, 45);
  const sq2 = square(100, 100, 74, 0);
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    return `<line class="cel-draw" pathLength="1" style="--d:${(0.9 + i * 0.05).toFixed(2)}s" x1="${(100 + 26 * Math.cos(a)).toFixed(1)}" y1="${(100 + 26 * Math.sin(a)).toFixed(1)}" x2="${(100 + 52 * Math.cos(a)).toFixed(1)}" y2="${(100 + 52 * Math.sin(a)).toFixed(1)}"/>`;
  }).join('');
  return svg(200, `
    <defs>
      <radialGradient id="celS" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${P.core}"/><stop offset=".55" stop-color="${P.n3}"/><stop offset="1" stop-color="${P.n1}"/></radialGradient>
      <radialGradient id="celSg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.n3}" stop-opacity=".55"/><stop offset="1" stop-color="${P.n3}" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="cel-burst" cx="100" cy="100" r="98" fill="url(#celSg)"/>
    <g fill="none" stroke="${P.n3}" stroke-width="2.2" stroke-linejoin="round">
      <circle class="cel-draw" pathLength="1" style="--d:0s" cx="100" cy="100" r="86" stroke-opacity=".55"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.15s" points="${sq1}"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.4s" points="${sq2}"/>
      ${rays}
    </g>
    <polygon class="cel-fill" points="${starPoints(100, 100, 50, 38)}" fill="url(#celS)" stroke="${P.hi}" stroke-width="1.5"/>
    <circle class="cel-fill" cx="100" cy="100" r="16" fill="${P.core}"/>
    <g fill="${P.n3}">${motes(12, 100, 100, 60)}</g>`);
}

function rosetteArt(khatm = false) {
  const outer = khatm ? Array.from({ length: 24 }, (_, i) =>
    `<g transform="rotate(${i * 15 + 7.5} 120 120)"><path class="cel-petal outer" style="--d:${(0.9 + i * 0.035).toFixed(2)}s" d="M120 120C127 92 128 40 120 6C112 40 113 92 120 120Z"/></g>`).join('') : '';
  const petals = Array.from({ length: 12 }, (_, i) =>
    `<g transform="rotate(${i * 30} 120 120)"><path class="cel-petal" style="--d:${(i * 0.06).toFixed(2)}s" d="M120 120C134 92 134 56 120 22C106 56 106 92 120 120Z"/></g>`).join('');
  const dots = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    return `<circle cx="${(120 + 108 * Math.cos(a)).toFixed(1)}" cy="${(120 + 108 * Math.sin(a)).toFixed(1)}" r="2"/>`;
  }).join('');
  return svg(240, `
    <defs>
      <linearGradient id="celP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.hi}" stop-opacity=".95"/><stop offset="1" stop-color="${P.n1}" stop-opacity=".55"/></linearGradient>
      <radialGradient id="celPg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.hi}" stop-opacity=".55"/><stop offset=".6" stop-color="${P.n3}" stop-opacity=".18"/><stop offset="1" stop-color="${P.n3}" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="cel-burst" cx="120" cy="120" r="118" fill="url(#celPg)"/>
    ${khatm ? '<circle class="cel-halo" cx="120" cy="120" r="70" fill="none" stroke="${P.hi}" stroke-width="10" stroke-opacity=".25"/>' : ''}
    <g class="cel-ring" fill="${P.n3}" opacity=".7">${dots}</g>
    ${khatm ? `<g fill="url(#celP)" stroke="${P.n3}" stroke-width=".8" opacity=".6">${outer}</g>` : ''}
    <g fill="url(#celP)" stroke="${P.n3}" stroke-width="1.2">${petals}</g>
    <g fill="none" stroke="${P.n3}" stroke-width="2" stroke-linejoin="round">
      <polygon class="cel-draw" pathLength="1" style="--d:.7s" points="${square(120, 120, 98, 45)}"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.85s" points="${square(120, 120, 98, 0)}"/>
      <circle class="cel-draw" pathLength="1" style="--d:1s" cx="120" cy="120" r="62"/>
    </g>
    <g fill="${P.n3}">${motes(16, 120, 120, 80)}</g>`);
}

function raysArt() {
  const rays = Array.from({ length: 16 }, (_, i) =>
    `<path transform="rotate(${i * 22.5} 100 100)" d="M100 100L95 6H105Z" opacity="${i % 2 ? 0.35 : 0.6}"/>`).join('');
  return svg(200, `
    <defs><radialGradient id="celR" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.n3}" stop-opacity=".9"/><stop offset="1" stop-color="${P.n3}" stop-opacity="0"/></radialGradient></defs>
    <g class="cel-rays" fill="url(#celR)">${rays}</g>
    <g fill="${P.n3}">${motes(10, 100, 100, 50)}</g>`);
}

/** Cracks drawn over the chest (same viewBox as `chestArt`), lit one by one as it is tapped. */
const CRACKS = ['M27 40l3 5.5-2.2 4.5 3.6 5.5 -1.6 4', 'M53 38.5l-2.4 6.5 3 3.6-2.2 6.4', 'M15 29l5.5 2.6 3.6-2.2', 'M64 45l-4.8 3 2 4.6-3.8 4', 'M41 15.5l-1.4 4.6 2.8 2.8-1.8 3.6', 'M33 60l3.4-3.2 3.6 2.6 3.2-3.4'];
function crackArt() {
  const el = svg(80, `<path class="seam" d="M12 37.2H68"/>${CRACKS.map((d) => `<path d="${d}" pathLength="1"/>`).join('')}`);
  el.setAttribute('viewBox', '0 0 80 76');
  el.classList.add('cel-crack');
  return el;
}

function vibrate(p: number[]) {
  try { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(p); } catch { /* ignore */ }
}

/** Plays a reward moment over the screen; resolves when it is closed. */
export function celebrate(m: Moment, from?: Element | null, light = 0): Promise<void> {
  P = rewardPalette();
  // Old-phone mode keeps the moment: it is a few SVG shapes moved by CSS, cheap to draw.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = h('div', { class: 'cel-stage' });
  let kicker = '', title = '', sub = '';
  let count: HTMLElement | null = null;
  // A chest: dropped in, then tapped open (a bigger one takes more taps), then what it holds comes out.
  const tier = chestTier(light);
  const isChest = m.kind === 'chest';
  const loot: Loot[] = m.kind === 'chest' ? (m.loot ?? (light > 0 ? [{ kind: 'light', n: light }] : [])) : [];
  // Rewards claimed one after another make a combo ("3 in a row"); from the third, the moment gets shorter:
  // one tap fewer, a quicker drop-in and prizes that come out faster (feel pass, owner request 2026-11-10).
  const streakN = combo();
  const roll = streakN >= 3;
  // A rare prize (a jewel avatar, a rare frame) or the biggest chest gets a bigger moment: the light gathers
  // in slow motion before it bursts, a double burst, a rising swell, and the rare card lands with its own ring.
  const epic = loot.some((l) => l.kind === 'item' && l.rare) ? 2 : tier >= 4 ? 1 : 0;
  const TAPS = Math.max(2, (tier >= 4 ? 5 : tier >= 2 ? 4 : 3) - (roll ? 1 : 0));
  const jolt = isChest ? h('div', { class: 'cel-chest-jolt' }, chestArt(tier), crackArt()) : null;
  const chestBox = isChest ? h('div', { class: 'cel-chest-box' }, jolt!) : null;
  const hit = isChest ? h('button', { class: 'cel-chest-hit', 'aria-label': t('cel.tapOpen') }) : null;
  const dots = Array.from({ length: isChest ? TAPS : 0 }, () => h('i', {}));
  // The Light inside counts up when it lands; the other prizes carry their own picture and name.
  let lootLight: HTMLElement | null = null;
  const lootCards = loot.map((l) => {
    let art: Node, label: Node | string;
    if (l.kind === 'light') {
      lootLight = h('b', {}, `+${still ? l.n : 0}`);
      art = h('span', { class: 'cel-orb' });
      label = h('span', {}, lootLight, ` ${t('me.light')}`);
    } else if (l.kind === 'freeze') { art = freezeArt(); label = t('cel.freeze'); } else { art = l.art; label = l.label; }
    const rare = l.kind === 'item' && l.rare;
    return h('div', { class: `cel-loot-it${rare ? ' rare' : ''}`, ...(rare ? { 'data-rare': t('cel.rare') } : {}) }, h('span', { class: 'cel-loot-art' }, art), h('span', { class: 'cel-loot-lb' }, label));
  });
  const slot = isChest ? h('div', { class: 'cel-slot' },
    h('p', { class: 'cel-tap', 'aria-hidden': 'true' }, t('cel.tapOpen'), h('span', { class: 'cel-dots' }, ...dots)),
    h('div', { class: 'cel-loot' }, ...lootCards)) : null;
  if (m.kind === 'chest') {
    stage.append(h('span', { class: 'cel-chest-rays', 'aria-hidden': 'true' }), h('span', { class: 'cel-chest-beam', 'aria-hidden': 'true' }), chestBox!, hit!);
    kicker = m.kicker ?? t('cel.goal');
    title = m.title; sub = m.sub;
  } else if (m.kind === 'lantern' || m.kind === 'star') {
    stage.append(m.kind === 'lantern' ? lanternArt() : starArt());
    kicker = m.kicker ?? t(m.kind === 'lantern' ? 'cel.goal' : 'cel.all');
    title = m.title; sub = m.sub;
  } else {
    const b = (m as Exclude<Moment, { kind: 'lantern' | 'star' | 'chest' }>).badge;
    title = t(b.name as Key, { n: b.need });
    sub = t(b.goal as Key, { n: b.need });
    if (m.kind === 'flame') {
      kicker = t('cel.streak');
      count = h('b', { class: 'cel-num' }, String(still ? m.days : 0));
      stage.append(
        h('span', { class: 'cel-rings' }, h('i', {}), h('i', {}), h('i', {})),
        h('span', { class: 'cel-fl' }, flame(m.days >= 30 ? 3 : 2, 150, still)),
        h('span', { class: 'cel-count' }, count, h('span', {}, t('me.days'))),
        h('span', { class: 'cel-badge small' }, badgeArt(b.tier, b.icon, true, 64)));
    } else {
      kicker = t(m.kind === 'medal' ? 'cel.badge' : 'cel.big');
      if (m.kind === 'khatm') title = t('cel.khatm');
      if (m.kind === 'khatm') sub = t('cel.khatmSub', { date: new Intl.DateTimeFormat(locale(), { dateStyle: 'long' }).format(new Date()) });
      stage.append(m.kind === 'medal' ? raysArt() : rosetteArt(m.kind === 'khatm'),
        h('span', { class: 'cel-badge' }, badgeArt(b.tier, b.icon, true, m.kind === 'medal' ? 120 : 104)));
    }
  }
  // Sparks in the theme's colours: its neon stops, its brightest stop lifted, a near-white core.
  const sparkColors = [rgba(P.n1, 1), rgba(P.n3, 1), rgba(P.hi, 1), rgba(P.core, 1), ...(m.kind === 'flame' ? [rgba(P.n2, 1)] : [])];
  // The Light this claim adds: a small pill that counts up once the moment lands.
  const lightNum = light > 0 && !isChest ? h('b', {}, String(still ? light : 0)) : null;
  const lightPill = lightNum ? h('p', { class: 'cel-light' }, '✦ ', lightNum, ` ${t('me.light')}`) : null;
  // Counters tick up with a little pop on each step (and a tiny tick sound).
  const countUp = (num: HTMLElement | null, n: number) => { if (num) tickNum(num, n, { prefix: '+', onPop: sfx.tick }); };
  const countLight = () => countUp(lightNum, light);
  if (lightNum && still) lightNum.textContent = `+${light}`;
  const comboPill = h('p', { class: 'cel-combo' }, streakN >= 2 ? t('cel.combo', { n: streakN }) : '');
  // Noor watches the chest, hops with each tap and cheers when it opens.
  const nr = isChest && !still ? makeNoor('cel-noor') : null;
  if (nr) stage.append(nr.el);
  // The user's own character (when they made one) stands beside the chest, watches and cheers.
  const me = isChest && !still ? makeActor('cel-actor') : null;
  if (me) stage.append(me.el);
  return new Promise((resolve) => {
    const ok = h('button', { class: 'cel-ok' }, t('cel.ok'));
    const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
    const el = h('div', { class: `cel cel-${m.kind}${still ? ' still go' : ''}${still && isChest ? ' opened revealed' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${kicker}: ${title}` },
      h('span', { class: 'cel-flash', 'aria-hidden': 'true' }),
      h('span', { class: 'cel-sweep', 'aria-hidden': 'true' }),
      stage,
      slot ?? '',
      canvas,
      h('div', { class: 'cel-text' }, h('p', { class: 'cel-kicker' }, kicker), h('h2', {}, title), h('p', { class: 'cel-sub' }, sub)),
      comboPill,
      lightPill ?? '',
      ok);
    const opened = performance.now();
    const timers = new Map<number, () => void>();
    const later = (ms: number, f: () => void) => { const id = window.setTimeout(() => { timers.delete(id); f(); }, ms); timers.set(id, f); };
    // A tap during the opening plays the rest of it at once: the pending beats run now, the animations jump to their end.
    let skipped = false;
    const skip = () => {
      skipped = true;
      for (let n = 0; n < 8 && timers.size; n++) {
        const due = [...timers]; timers.clear();
        for (const [id, f] of due) { clearTimeout(id); f(); }
      }
      for (const a of el.getAnimations({ subtree: true })) {
        if (a.effect?.getComputedTiming().iterations !== Infinity) try { a.finish(); } catch { /* still pending */ }
      }
    };
    let fx: Sparks | null = null;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      timers.forEach((_, id) => clearTimeout(id));
      timers.clear();
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      const lightCard = lootLight ? (lootLight as HTMLElement).closest('.cel-loot-it') : null;
      if (light > 0 && !still) { flyLight(lightCard ?? stage, tier); sfx.whoosh(); }
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

    // The chest is opened by hand: each tap jolts it, cracks it and lets more light out of the seam.
    let taps = 0, ready = false, isOpen = false, revealed = false, revealedAt = 0;
    const showCombo = () => {
      if (streakN < 2 || still) return;
      popIn(comboPill, { delay: 120 });
      setTimeout(() => {
        const r = comboPill.getBoundingClientRect(), k = canvasBox();
        fx?.burst(r.left + r.width / 2 - k.left, r.top + r.height / 2 - k.top, 18, 0.5);
        sfx.shimmer();
      }, 260);
    };
    const lootTimers: number[] = [];
    const canvasBox = () => canvas.getBoundingClientRect();
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      revealedAt = performance.now();
      lootTimers.forEach(clearTimeout);
      lootCards.forEach((c) => { c.getAnimations().forEach((a) => a.finish()); c.classList.add('in', 'landed'); });
      if (lootLight) (lootLight as HTMLElement).textContent = `+${(loot.find((l) => l.kind === 'light') as { n: number }).n}`;
      el.classList.add('revealed');
      fx?.motes(true);
      sfx.shimmer();
      nr?.glow(1);
      showCombo();
      ok.focus({ preventScroll: true });
    };
    const land = (i: number) => {
      const c = lootCards[i];
      c.classList.add('landed');
      const r = c.getBoundingClientRect(), k = canvasBox();
      fx?.burst(r.left + r.width / 2 - k.left, r.top + 32 - k.top, 22 + tier * 4, 0.55);
      squash(c.querySelector('.cel-loot-art')!, 0.3);
      const l = loot[i];
      const isRare = l.kind === 'item' && !!l.rare;
      sfx.pop(i, isRare);
      nr?.hop(isRare ? 1.2 : 0.6);
      if (i > 0 || isRare) me?.hop(isRare ? 0.9 : 0.35);
      if (isRare) {
        c.classList.add('rare-in');
        fx?.burst(r.left + r.width / 2 - k.left, r.top + 32 - k.top, 40, 0.8);
      }
      if (l.kind === 'light') countUp(lootLight, l.n);
    };
    const GAP = roll ? 420 : 650;
    const pour = () => {
      // One prize after another: out of the chest's mouth in an arc, landing on its card.
      const s = stage.getBoundingClientRect();
      const mx = s.left + s.width / 2, my = s.top + s.height * 0.42;
      lootCards.forEach((c, i) => lootTimers.push(window.setTimeout(() => {
        c.classList.add('in');
        const r = c.getBoundingClientRect();
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
        c.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: 0 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 110}px) scale(1.35)`, opacity: 1, offset: 0.55 },
          { transform: 'scale(.9)', offset: 0.86 },
          { transform: 'none' },
        ], { duration: 780, easing: 'cubic-bezier(.3, 0, .3, 1)' });
        vibrate([8]);
        lootTimers.push(window.setTimeout(() => land(i), 700));
      }, i * GAP)));
      lootTimers.push(window.setTimeout(reveal, lootCards.length * GAP + (roll ? 300 : 500)));
    };
    const openChest = () => {
      const b = chestBox!.getBoundingClientRect(), k = canvasBox();
      jolt!.getAnimations().forEach((a) => a.cancel());
      // Released from the crouch: it stretches up, then wobbles and settles.
      squash(jolt!, -0.3, { stiffness: 300, damping: 10 });
      sfx.open(epic);
      nr?.cheer();
      me?.cheer(epic ? 3000 : 2200);
      chestBox!.classList.add('open');
      stage.classList.add('opened');
      el.classList.add('opened');
      el.classList.remove('charging');
      if (epic) el.classList.add('epic');
      fx?.burst(b.left + b.width / 2 - k.left, b.top + b.height * 0.42 - k.top, 60 + tier * 24 + epic * 40, 0.95 + tier * 0.1 + epic * 0.15);
      if (epic) later(260, () => fx?.burst(b.left + b.width / 2 - k.left, b.top + b.height * 0.42 - k.top, 50 + epic * 20, 1.1));
      later(roll ? 400 : 650 + epic * 250, pour);
    };
    const paths = jolt ? [...jolt.querySelectorAll<SVGPathElement>('.cel-crack path:not(.seam)')] : [];
    const tapChest = (x: number | null, y: number | null) => {
      if (taps >= TAPS) return;
      taps++;
      sfx.tap(taps, TAPS);
      nr?.hop(taps / TAPS);
      if (taps === 1) me?.lean(1); else me?.hop(0.25 + (0.35 * taps) / TAPS);
      nr?.glow(taps / TAPS);
      el.classList.add('tapped');
      const b = chestBox!.getBoundingClientRect(), k = canvasBox();
      const on = x != null && y != null && x > b.left && x < b.right && y > b.top && y < b.bottom;
      fx?.burst((on ? x! : b.left + b.width / 2) - k.left, (on ? y! : b.top + b.height * 0.45) - k.top, 12 + taps * 7, 0.45 + taps * 0.09);
      const a = (5 + tier) * (0.6 + (0.5 * taps) / TAPS);
      jolt!.animate([
        { transform: 'none' },
        { transform: 'translateY(5px) scale(1.1, .88)', offset: 0.14 },
        { transform: `translateY(${-10 - taps * 4}px) rotate(${-a}deg) scale(.95, 1.07)`, offset: 0.4 },
        { transform: `translateY(-3px) rotate(${a * 0.8}deg)`, offset: 0.62 },
        { transform: `rotate(${-a * 0.35}deg)`, offset: 0.82 },
        { transform: 'none' },
      ], { duration: 440 + tier * 30, easing: 'ease-out' });
      jolt!.querySelector('.ck-lid')?.animate([{ transform: 'none' }, { transform: `translateY(${-2 - taps * 1.5}px) rotate(${-2 - taps}deg)`, offset: 0.4 }, { transform: 'none' }], { duration: 420 });
      const lit = Math.ceil((taps / TAPS) * paths.length);
      paths.forEach((p, i) => p.classList.toggle('on', i < lit));
      stage.style.setProperty('--crack', String(taps / TAPS));
      dots[taps - 1]?.classList.add('on');
      if (taps >= TAPS) {
        // Anticipation: it crouches, gathering itself, for a breath before it bursts.
        isOpen = true;
        jolt!.getAnimations().forEach((a) => a.cancel());
        // A rare prize: the light gathers in slow motion first (the screen dims, the seam blazes, a swell rises).
        const hold = epic ? 560 + epic * 220 : 170;
        if (epic) { el.classList.add('charging'); sfx.rare(hold); }
        jolt!.animate(epic
          ? [{ transform: 'none' }, { transform: 'translateY(6px) scale(1.08, .9)', offset: 0.3 }, { transform: 'translate(-2px, 9px) scale(1.14, .84)', offset: 0.55 }, { transform: 'translate(2px, 10px) scale(1.16, .82)', offset: 0.75 }, { transform: 'translateY(11px) scale(1.18, .8)' }]
          : [{ transform: 'none' }, { transform: 'translateY(9px) scale(1.16, .8)' }], { duration: hold, easing: 'cubic-bezier(.3, 0, .7, 1)', fill: 'forwards' });
        if (!epic) vibrate([8]);
        later(hold + 10, openChest);
        return;
      }
    };
    hit?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit.click(); } });

    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => {
      if (e.target === ok) return;
      if (isChest && !still) {
        if (!isOpen) { if (ready) tapChest(e.detail ? e.clientX : null, e.detail ? e.clientY : null); return; }
        if (!revealed) { reveal(); return; }
        if (performance.now() - revealedAt > 700) close();
        return;
      }
      if (performance.now() - opened > 2000 || skipped) close();
      else skip();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    if (still && isChest) lootCards.forEach((c) => c.classList.add('in', 'landed'));
    (isChest && !still ? hit! : ok).focus({ preventScroll: true });
    if (still) return;

    // 1. A seed of light: the Claim button lifts, becomes a glowing orb and flies to the centre,
    //    gathers itself (anticipation) and bursts — then the moment unfolds from that burst.
    const box = stage.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const seed = h('span', { class: 'cel-seed', 'aria-hidden': 'true' });
    stage.append(seed);
    const r = from?.getBoundingClientRect();
    const has = !!(r && r.width);
    const dx = has ? r!.left + r!.width / 2 - cx : 0;
    const dy = has ? r!.top + r!.height / 2 - cy : 40;
    const FLY = (has ? 560 : 360) * (roll ? 0.65 : 1);
    const T = FLY + (roll ? 300 : 420);
    seed.animate([
      { transform: has ? `translate(${dx}px, ${dy}px) scale(${r!.width / 48}, ${r!.height / 48})` : `translate(0, ${dy}px) scale(.2)`, opacity: 0.9, offset: 0 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - (has ? 70 : 0)}px) scale(.8)`, opacity: 1, offset: (FLY * 0.55) / T },
      { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)', offset: FLY / T },
      { transform: 'translate(0, 0) scale(.62)', filter: 'brightness(1.6)', offset: (FLY + (roll ? 200 : 300)) / T },
      { transform: 'translate(0, 0) scale(2.6)', filter: 'brightness(2)', opacity: 0, offset: 1 },
    ], { duration: T, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'forwards' });
    vibrate([8]);
    const BURST = FLY + (roll ? 200 : 300);

    // 2. The burst: a soft flash, light sweeping across, sparks flying out, the moment playing.
    later(BURST, () => {
      el.classList.add('go');
      fx = sparks(canvas, sparkColors);
      const big = m.kind === 'rosette' || m.kind === 'khatm' || m.kind === 'star' || m.kind === 'flame' || (m.kind === 'chest' && tier >= 2);
      const sb = stage.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      fx.burst(sb.left + sb.width / 2 - cr.left, sb.top + sb.height / 2 - cr.top, big ? 90 : 60, big ? 1.15 : 0.9);
      vibrate(m.kind === 'lantern' ? [18] : m.kind === 'rosette' || m.kind === 'khatm' ? [24, 90, 14] : [22]);
      // A chest drops in, lands with a squash and a thud, then waits for the user's taps.
      if (isChest) {
        chestBox!.animate([{ transform: 'translateY(-260px) scale(.9, 1.1)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }],
          { duration: 360, easing: 'cubic-bezier(.55, 0, 1, .45)' });
        if (nr) popIn(nr.el, { delay: 520 });
        later(360, () => {
          squash(jolt!, 0.26);
          sfx.land();
          me?.hop(0.2);
          const b = chestBox!.getBoundingClientRect(), k = canvasBox();
          fx?.burst(b.left + b.width / 2 - k.left, b.bottom - b.height * 0.12 - k.top, 16, 0.4);
        });
        later(roll ? 420 : 620, () => { ready = true; });
        return;
      }
      // A second beat when the badge lands / the star fills / the lantern opens.
      const beat = (m.kind === 'khatm' ? 2200 : m.kind === 'rosette' ? 1500 : m.kind === 'flame' ? 1400 : m.kind === 'medal' ? 700 : 900) * (roll ? 0.6 : 1);
      later(beat, () => {
        const b2 = stage.getBoundingClientRect();
        fx?.burst(b2.left + b2.width / 2 - cr.left, b2.top + b2.height / 2 - cr.top, big ? 46 : 30, 0.7);
        sfx.shimmer();
        showCombo();
      });
      later(beat + 300, () => fx?.motes(true));
      later(beat + 150, countLight);
      if (count && m.kind === 'flame') {
        const target = m.days;
        const t0 = performance.now() + 350;
        const tick = (now: number) => {
          const p = Math.min(1, Math.max(0, (now - t0) / 1000));
          count!.textContent = String(Math.round(target * (1 - (1 - p) ** 3)));
          if (p < 1 && !done) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
  });
}

/** The Light just claimed flies from the moment up into the Light counter (when one is on screen), which bumps. */
function flyLight(from: Element, tier: number) {
  const chip = [...document.querySelectorAll<HTMLElement>('.lt-chip')].find((c) => c.getClientRects().length);
  if (!chip) return;
  const a = from.getBoundingClientRect();
  const b = chip.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height * 0.45;
  const x1 = b.left + 14, y1 = b.top + b.height / 2;
  const lite = document.documentElement.classList.contains('lite');
  const n = lite ? 4 + tier * 2 : 6 + tier * 3;
  // All the lights fly on one canvas over the page (one draw call each a frame, no DOM nodes to lay out).
  const dpr = Math.min(lite ? 1.5 : 2, window.devicePixelRatio || 1);
  const cv = h('canvas', { class: 'lt-fly-layer', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  document.body.append(cv);
  const g = cv.getContext('2d')!;
  const spr = document.createElement('canvas');
  spr.width = spr.height = 48;
  const sg = spr.getContext('2d')!;
  const grad = sg.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, P.core); grad.addColorStop(0.3, rgba(P.n3, 0.95)); grad.addColorStop(0.65, rgba(P.n2, 0.35)); grad.addColorStop(1, rgba(P.n2, 0));
  sg.fillStyle = grad; sg.fillRect(0, 0, 48, 48);
  const dots = Array.from({ length: n }, (_, i) => {
    const sx = x0 + Math.cos(i * 2.4) * (18 + (i % 4) * 10), sy = y0 + Math.sin(i * 2.4) * (18 + (i % 4) * 10);
    return { i, sx, sy, mx: (sx + x1) / 2 + (i % 2 ? 60 : -60), my: Math.min(sy, y1) - 40, dur: 820 + i * 45, size: i === 0 ? 34 : 20, done: false };
  });
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const t0 = performance.now();
  const frame = (now: number) => {
    g.clearRect(0, 0, cv.width, cv.height);
    let left = 0;
    for (const d of dots) {
      if (d.done) continue;
      const p = Math.min(1, (now - t0) / d.dur);
      let x: number, y: number, s: number, o: number;
      if (p < 0.25) { const k = ease(p / 0.25); x = x0 + (d.sx - x0) * k; y = y0 + (d.sy - y0) * k; s = 0.3 + 0.9 * k; o = k; }
      else {
        const k = ease((p - 0.25) / 0.75), u = 1 - k;
        x = u * u * d.sx + 2 * u * k * d.mx + k * k * x1; y = u * u * d.sy + 2 * u * k * d.my + k * k * y1;
        s = 1.2 - 0.7 * k; o = 1 - 0.1 * k;
      }
      const w = d.size * s * dpr;
      g.globalAlpha = o;
      g.drawImage(spr, x * dpr - w / 2, y * dpr - w / 2, w, w);
      if (p >= 1) {
        d.done = true;
        if (d.i % 2 === 0 || d.i === n - 1) { bump(chip, d.i === n - 1 ? 0.3 : 0.14); sfx.tick(); }
        if (d.i === n - 1) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
      } else left++;
    }
    if (left) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}
