// Reward moments (Me tab, played only when the user taps Claim, never over reading). Five calm,
// light-filled animations in SVG + CSS, each ending on its own still picture:
//   lantern  a daily goal met: a paper lantern rises, opens into warm light, gold motes drift up
//   star     every goal met today: gold lines draw the eight-pointed khatam star, which fills with light
//   flame    a streak milestone: the flame rises, rings of light pulse out, the days count up, the badge drops in
//   rosette  a big milestone (a surah, a juz, a Khatm, 10,000 dhikr…): a twelve-petal rosette unfolds like a
//            mosque window, the badge settles in its centre
//   medal    other badges: soft rays turn slowly behind the badge as it settles
// A light vibration, no sound. Tap the button (or anywhere once it has played) to close; Esc too.
// Reduced motion: the still final picture, faded in.
import type { BadgeDef } from '../data/badges';
import { t, type Key } from '../i18n';
import { h } from './dom';
import { badgeArt } from './badge';
import { flame } from './flame';

export type Moment =
  | { kind: 'lantern' | 'star'; title: string; sub: string }
  | { kind: 'flame'; badge: BadgeDef; days: number }
  | { kind: 'rosette' | 'medal'; badge: BadgeDef };

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
      <radialGradient id="celG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff3c4" stop-opacity=".95"/><stop offset=".4" stop-color="#ffc35a" stop-opacity=".45"/><stop offset="1" stop-color="#ff9a2a" stop-opacity="0"/></radialGradient>
      <linearGradient id="celL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8862a"/><stop offset=".5" stop-color="#ffd27a"/><stop offset="1" stop-color="#e8862a"/></linearGradient>
    </defs>
    <circle class="cel-burst" cx="100" cy="104" r="92" fill="url(#celG)"/>
    <g class="cel-lantern">
      <path d="M100 22V44" stroke="#f3c56b" stroke-width="2" stroke-linecap="round"/>
      <path d="M86 44H114L110 54H90Z" fill="#b8742a"/>
      <path d="M80 54C72 80 72 128 80 154H120C128 128 128 80 120 54Z" fill="url(#celL)"/>
      <path d="M91 54C86 84 86 124 91 154M109 54C114 84 114 124 109 154M100 54V154" fill="none" stroke="#9a5a1c" stroke-opacity=".35" stroke-width="1.5"/>
      <ellipse class="cel-core" cx="100" cy="104" rx="13" ry="28" fill="#fff8dc"/>
      <path d="M90 154H110L106 162H94Z" fill="#b8742a"/>
      <path d="M100 162V178" stroke="#f3c56b" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g fill="#ffe08a">${motes(14, 100, 104, 46)}</g>`);
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
      <radialGradient id="celS" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fff6cf"/><stop offset=".55" stop-color="#ffcf63"/><stop offset="1" stop-color="#d9962c"/></radialGradient>
      <radialGradient id="celSg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd977" stop-opacity=".55"/><stop offset="1" stop-color="#ffd977" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="cel-burst" cx="100" cy="100" r="98" fill="url(#celSg)"/>
    <g fill="none" stroke="#f3c56b" stroke-width="2.2" stroke-linejoin="round">
      <circle class="cel-draw" pathLength="1" style="--d:0s" cx="100" cy="100" r="86" stroke-opacity=".55"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.15s" points="${sq1}"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.4s" points="${sq2}"/>
      ${rays}
    </g>
    <polygon class="cel-fill" points="${starPoints(100, 100, 50, 38)}" fill="url(#celS)" stroke="#fff1b8" stroke-width="1.5"/>
    <circle class="cel-fill" cx="100" cy="100" r="16" fill="#fffbe8"/>
    <g fill="#ffe08a">${motes(12, 100, 100, 60)}</g>`);
}

function rosetteArt() {
  const petals = Array.from({ length: 12 }, (_, i) =>
    `<g transform="rotate(${i * 30} 120 120)"><path class="cel-petal" style="--d:${(i * 0.06).toFixed(2)}s" d="M120 120C134 92 134 56 120 22C106 56 106 92 120 120Z"/></g>`).join('');
  const dots = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    return `<circle cx="${(120 + 108 * Math.cos(a)).toFixed(1)}" cy="${(120 + 108 * Math.sin(a)).toFixed(1)}" r="2"/>`;
  }).join('');
  return svg(240, `
    <defs>
      <linearGradient id="celP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c0" stop-opacity=".95"/><stop offset="1" stop-color="#2fbf9b" stop-opacity=".55"/></linearGradient>
      <radialGradient id="celPg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#bff5e4" stop-opacity=".55"/><stop offset=".6" stop-color="#ffd977" stop-opacity=".18"/><stop offset="1" stop-color="#ffd977" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="cel-burst" cx="120" cy="120" r="118" fill="url(#celPg)"/>
    <g class="cel-ring" fill="#f3c56b" opacity=".7">${dots}</g>
    <g fill="url(#celP)" stroke="#f3c56b" stroke-width="1.2">${petals}</g>
    <g fill="none" stroke="#f3c56b" stroke-width="2" stroke-linejoin="round">
      <polygon class="cel-draw" pathLength="1" style="--d:.7s" points="${square(120, 120, 98, 45)}"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.85s" points="${square(120, 120, 98, 0)}"/>
      <circle class="cel-draw" pathLength="1" style="--d:1s" cx="120" cy="120" r="62"/>
    </g>
    <g fill="#ffe08a">${motes(16, 120, 120, 80)}</g>`);
}

function raysArt() {
  const rays = Array.from({ length: 16 }, (_, i) =>
    `<path transform="rotate(${i * 22.5} 100 100)" d="M100 100L95 6H105Z" opacity="${i % 2 ? 0.35 : 0.6}"/>`).join('');
  return svg(200, `
    <defs><radialGradient id="celR" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe08a" stop-opacity=".9"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient></defs>
    <g class="cel-rays" fill="url(#celR)">${rays}</g>
    <g fill="#ffe08a">${motes(10, 100, 100, 50)}</g>`);
}

function vibrate(p: number[]) {
  try { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(p); } catch { /* ignore */ }
}

/** Plays a reward moment over the screen; resolves when it is closed. */
export function celebrate(m: Moment): Promise<void> {
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
      kicker = t(m.kind === 'rosette' ? 'cel.big' : 'cel.badge');
      stage.append(m.kind === 'rosette' ? rosetteArt() : raysArt(),
        h('span', { class: 'cel-badge' }, badgeArt(b.tier, b.icon, true, m.kind === 'rosette' ? 104 : 120)));
    }
  }
  return new Promise((resolve) => {
    const ok = h('button', { class: 'cel-ok' }, t('cel.ok'));
    const el = h('div', { class: `cel cel-${m.kind}${still ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${kicker}: ${title}` },
      stage,
      h('div', { class: 'cel-text' }, h('p', { class: 'cel-kicker' }, kicker), h('h2', {}, title), h('p', { class: 'cel-sub' }, sub)),
      ok);
    const opened = performance.now();
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 260);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target !== ok && performance.now() - opened > 1600) close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    ok.focus({ preventScroll: true });
    // Feel: a soft tap, then a fuller one as the light opens.
    vibrate(m.kind === 'lantern' ? [10, 900, 22] : m.kind === 'star' ? [10, 700, 14, 300, 26] : m.kind === 'rosette' ? [10, 500, 12, 500, 16, 400, 40] : [10, 800, 30]);
    if (count && !still && m.kind === 'flame') {
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
}
