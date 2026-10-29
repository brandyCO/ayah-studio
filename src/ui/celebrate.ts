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
// Reduced motion: the still final picture, faded in.
import type { BadgeDef } from '../data/badges';
import { locale, t, type Key } from '../i18n';
import { h } from './dom';
import { badgeArt } from './badge';
import { flame } from './flame';
import { sparks, type Sparks } from './sparks';
import { rewardPalette, rgba } from './theme';

/** The theme's reward colours, read when a moment starts (so a theme change shows at once). */
let P = rewardPalette();

export type Moment =
  | { kind: 'lantern' | 'star'; title: string; sub: string }
  | { kind: 'flame'; badge: BadgeDef; days: number }
  | { kind: 'rosette' | 'medal' | 'khatm'; badge: BadgeDef };

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
  if (m.kind === 'lantern' || m.kind === 'star') {
    stage.append(m.kind === 'lantern' ? lanternArt() : starArt());
    kicker = t(m.kind === 'lantern' ? 'cel.goal' : 'cel.all');
    title = m.title; sub = m.sub;
  } else {
    const b = (m as Exclude<Moment, { kind: 'lantern' | 'star' }>).badge;
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
  const lightNum = light > 0 ? h('b', {}, String(still ? light : 0)) : null;
  const lightPill = lightNum ? h('p', { class: 'cel-light' }, '✦ ', lightNum, ` ${t('me.light')}`) : null;
  const countLight = () => {
    if (!lightNum) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      lightNum.textContent = `+${Math.round(light * (1 - (1 - p) ** 3))}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (lightNum && still) lightNum.textContent = `+${light}`;
  return new Promise((resolve) => {
    const ok = h('button', { class: 'cel-ok' }, t('cel.ok'));
    const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
    const el = h('div', { class: `cel cel-${m.kind}${still ? ' still go' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${kicker}: ${title}` },
      h('span', { class: 'cel-flash', 'aria-hidden': 'true' }),
      h('span', { class: 'cel-sweep', 'aria-hidden': 'true' }),
      stage,
      canvas,
      h('div', { class: 'cel-text' }, h('p', { class: 'cel-kicker' }, kicker), h('h2', {}, title), h('p', { class: 'cel-sub' }, sub)),
      lightPill ?? '',
      ok);
    const opened = performance.now();
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    let fx: Sparks | null = null;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target !== ok && performance.now() - opened > 2000) close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    ok.focus({ preventScroll: true });
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
    const FLY = has ? 560 : 360;
    const T = FLY + 420;
    seed.animate([
      { transform: has ? `translate(${dx}px, ${dy}px) scale(${r!.width / 48}, ${r!.height / 48})` : `translate(0, ${dy}px) scale(.2)`, opacity: 0.9, offset: 0 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - (has ? 70 : 0)}px) scale(.8)`, opacity: 1, offset: (FLY * 0.55) / T },
      { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)', offset: FLY / T },
      { transform: 'translate(0, 0) scale(.62)', filter: 'brightness(1.6)', offset: (FLY + 300) / T },
      { transform: 'translate(0, 0) scale(2.6)', filter: 'brightness(2)', opacity: 0, offset: 1 },
    ], { duration: T, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'forwards' });
    vibrate([8]);
    const BURST = FLY + 300;

    // 2. The burst: a soft flash, light sweeping across, sparks flying out, the moment playing.
    later(BURST, () => {
      el.classList.add('go');
      fx = sparks(canvas, sparkColors);
      const big = m.kind === 'rosette' || m.kind === 'khatm' || m.kind === 'star' || m.kind === 'flame';
      const sb = stage.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      fx.burst(sb.left + sb.width / 2 - cr.left, sb.top + sb.height / 2 - cr.top, big ? 90 : 60, big ? 1.15 : 0.9);
      vibrate(m.kind === 'lantern' ? [18] : m.kind === 'rosette' || m.kind === 'khatm' ? [24, 90, 14] : [22]);
      // A second beat when the badge lands / the star fills / the lantern opens.
      const beat = m.kind === 'khatm' ? 2200 : m.kind === 'rosette' ? 1500 : m.kind === 'flame' ? 1400 : m.kind === 'medal' ? 700 : 900;
      later(beat, () => {
        const b2 = stage.getBoundingClientRect();
        fx?.burst(b2.left + b2.width / 2 - cr.left, b2.top + b2.height / 2 - cr.top, big ? 46 : 30, 0.7);
        vibrate([14]);
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
