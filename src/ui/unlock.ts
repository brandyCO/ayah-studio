// Unlock moments (owner "Yes", 2026-11-24, "after each unlock, is there an animation?"): on the day the shop, the room
// or the wardrobe first appears (src/data/reveal.ts), the user's own character walks up to it in the dark, and it comes
// alive: the stall's lanterns light one by one, the room's door swings open on warm light, the wardrobe's two doors
// open on the clothes waiting inside. Then Take a look / Later. Every moving part is its own layer moved by transform
// and opacity only (60 fps on a slow phone); the drawings are still SVG. Tap skips to the end; reduced motion shows it.
import './unlock.css';
import type { Reveal } from '../data/reveal';
import { fe } from '../i18n/front';
import { actor, sparkle } from './actor';
import { h, haptic } from './dom';
import { holdPage, noor, popIn, reduced } from './juice';
import { sfx } from './sfx';

const VB = 'viewBox="0 0 300 300" preserveAspectRatio="xMidYMax meet"';
const svg = (inner: string) => `<svg ${VB} aria-hidden="true">${inner}</svg>`;
const layer = (cls: string, inner: string) => {
  const el = h('span', { class: `ul-l ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = svg(inner);
  return el;
};
/** A flat two-tone shape: the shade, the base shifted up-left over it. */
const two = (d: string, base: string, shade: string) => `<path d="${d}" fill="${shade}"/><path d="${d}" fill="${base}" transform="translate(-2 -2)"/>`;

// ---------- The shop: a lantern-lit stall ----------
function shop() {
  const awn = (() => {
    let p = '';
    for (let i = 0; i < 8; i++) {
      const x = 34 + i * 29;
      p += `<path d="M${x} 62h29v34a14.5 14.5 0 0 1-29 0z" fill="${i % 2 ? '#fff4e4' : '#ff6b4a'}"/>`;
    }
    return `<path d="M34 62h232v6H34z" fill="#c8452b"/>${p}<path d="M34 96h232" stroke="rgba(0,0,0,.12)" stroke-width="3"/>`;
  })();
  const jars = [[70, '#3dd1ad'], [96, '#ffd25e'], [122, '#b38cff'], [178, '#ff8fb1'], [204, '#7cc8ff'], [230, '#ffd25e']]
    .map(([x, c]) => `<rect x="${x}" y="150" width="18" height="24" rx="6" fill="${c}"/><rect x="${(x as number) + 3}" y="146" width="12" height="6" rx="2" fill="#8a5226"/><path d="M${(x as number) + 5} 156v12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>`).join('');
  const body = `
    <path d="M150 8l7 13 15 2-11 10 3 15-14-7-14 7 3-15-11-10 15-2z" fill="#ffd25e"/>
    <rect x="94" y="30" width="112" height="28" rx="10" fill="#8a5226"/><rect x="92" y="28" width="112" height="28" rx="10" fill="#b8743a"/>
    <rect x="44" y="64" width="12" height="190" rx="4" fill="#8a5226"/><rect x="244" y="64" width="12" height="190" rx="4" fill="#8a5226"/>
    <rect x="56" y="110" width="188" height="84" rx="6" fill="#5b3a2a"/>
    <rect x="56" y="140" width="188" height="6" fill="#7a4e36"/><rect x="56" y="176" width="188" height="6" fill="#7a4e36"/>
    ${jars}
    <path d="M150 116l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#ffd25e"/>
    ${two('M36 196h228v58H36z', '#c98a4f', '#8a5226')}
    <rect x="34" y="192" width="232" height="10" rx="4" fill="#e0a86c"/>
    <path d="M60 218h60M180 218h60M60 236h180" stroke="#8a5226" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    ${awn}`;
  const sil = `<path d="M92 28h112v30H92zM34 62h232v52H34zM44 64h12v190H44zM244 64h12v190h-12zM56 110h188v84H56zM34 192h232v62H34z" fill="#1e1838"/><path d="M150 8l7 13 15 2-11 10 3 15-14-7-14 7 3-15-11-10 15-2z" fill="#1e1838"/>`;
  const lanterns = [90, 150, 210].map((x) => `<path d="M${x} 100v10" stroke="#5b3a2a" stroke-width="2"/><rect x="${x - 8}" y="110" width="16" height="22" rx="7" fill="#ffd978"/><rect x="${x - 9}" y="108" width="18" height="4" rx="2" fill="#8a5226"/><rect x="${x - 9}" y="130" width="18" height="4" rx="2" fill="#8a5226"/>`).join('');
  return {
    parts: [layer('ul-body', body), layer('ul-lamps', lanterns), layer('ul-sil', sil)],
    glows: [[30, 40], [50, 40], [70, 40]] as [number, number][],
  };
}

// ---------- The room: a door that opens on warm light ----------
function room() {
  const inside = `
    <path d="M100 262V122a50 50 0 0 1 100 0v140z" fill="#ffd9a0"/>
    <path d="M100 222h100v40H100z" fill="#f0b46e"/>
    <ellipse cx="150" cy="244" rx="40" ry="10" fill="#ff6b4a"/><ellipse cx="150" cy="244" rx="28" ry="6" fill="#ffd25e"/>
    <rect x="166" y="128" width="22" height="30" rx="4" fill="#7cc8ff"/><path d="M177 128v30M166 143h22" stroke="#fff" stroke-width="2"/>
    <path d="M118 196h20v28h-20z" fill="#3dd1ad"/><circle cx="128" cy="190" r="10" fill="#4caf2a"/>
    <path d="M150 104v12" stroke="#8a5226" stroke-width="2"/><rect x="143" y="116" width="14" height="18" rx="6" fill="#ffe28a"/>`;
  const wall = `
    ${two('M20 40h260v222H20z', '#f3e3c8', '#d9c09a')}
    <path d="M20 40h260v14H20z" fill="#c98a4f"/>
    <path d="M88 266V120a62 62 0 0 1 124 0v146z" fill="#8a5226"/><path d="M94 266V122a56 56 0 0 1 112 0v144z" fill="#b8743a"/>
    <rect x="80" y="262" width="140" height="10" rx="3" fill="#a87a4e"/>
    <path d="M150 64l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#ffd25e"/>
    <path d="M30 120h44v60H30zM226 120h44v60h-44z" fill="#2a3b66"/><path d="M52 120v60M30 150h44M248 120v60M226 150h44" stroke="#d9c09a" stroke-width="4"/>`;
  const hole = `<path d="M100 262V122a50 50 0 0 1 100 0v140z" fill="#2a2140"/>`;
  const door = `
    ${two('M100 262V122a50 50 0 0 1 100 0v140z', '#c98a4f', '#9c6434')}
    <path d="M112 252V134a38 38 0 0 1 76 0v118z" fill="none" stroke="#9c6434" stroke-width="4"/>
    <path d="M112 196h76" stroke="#9c6434" stroke-width="4"/>
    <circle cx="186" cy="200" r="6" fill="#ffd25e"/><circle cx="184" cy="198" r="2" fill="#fff" opacity=".7"/>`;
  const sil = `<path d="M20 40h260v222H20z" fill="#1e1838"/>`;
  return {
    parts: [layer('ul-body', wall), layer('ul-in', inside), layer('ul-hole', hole), layer('ul-door', door), layer('ul-sil', sil)],
    glows: [[50, 62]] as [number, number][],
  };
}

// ---------- The wardrobe: two doors on the clothes inside ----------
function wardrobe() {
  const clothes = [[96, '#3dd1ad'], [122, '#ff6b4a'], [148, '#b38cff'], [174, '#ffd25e'], [200, '#7cc8ff']]
    .map(([x, c]) => `<path d="M${x} 88v6" stroke="#8a5226" stroke-width="2"/><path d="M${(x as number) - 10} 98l10-6 10 6-2 10 4 74h-24l4-74z" fill="${c}"/><path d="M${(x as number) - 4} 104h8" stroke="#fff" stroke-width="2" opacity=".5"/>`).join('');
  const inside = `
    <path d="M78 64h144v188H78z" fill="#ffe7bf"/>
    <path d="M84 88h132" stroke="#c98a4f" stroke-width="4" stroke-linecap="round"/>
    ${clothes}
    <path d="M84 212h132v6H84z" fill="#c98a4f"/>
    <ellipse cx="112" cy="232" rx="14" ry="8" fill="#ff8fb1"/><ellipse cx="150" cy="230" rx="12" ry="10" fill="#4caf2a"/><circle cx="188" cy="230" r="10" fill="#ffd25e"/>`;
  const body = `
    <path d="M66 50h168v214H66z" fill="#8a5226"/>
    <path d="M60 30h180l-8 22H68z" fill="#b8743a"/><path d="M150 12l5 10 11 1-8 7 2 11-10-5-10 5 2-11-8-7 11-1z" fill="#ffd25e"/>
    <rect x="70" y="262" width="16" height="14" rx="3" fill="#5b3a2a"/><rect x="214" y="262" width="16" height="14" rx="3" fill="#5b3a2a"/>`;
  const leaf = (x: number, knob: number) => `
    ${two(`M${x} 64h72v188h-72z`, '#d9945a', '#a8683a')}
    <path d="M${x + 10} 76h52v76h-52zM${x + 10} 164h52v76h-52z" fill="none" stroke="#a8683a" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="${knob}" cy="158" r="5" fill="#ffd25e"/>`;
  const sil = `<path d="M60 12h180v264H60z" fill="#1e1838"/>`;
  return {
    parts: [layer('ul-body', body), layer('ul-in', inside), layer('ul-dl', leaf(78, 142)), layer('ul-dr', leaf(150, 158)), layer('ul-sil', sil)],
    glows: [[50, 52]] as [number, number][],
  };
}

const ART: Record<Reveal, () => { parts: HTMLElement[]; glows: [number, number][] }> = { shop, room, wardrobe };

/** Plays the moment for `k`; `go` opens it, `later` puts it off. */
export function playUnlock(k: Reveal, go: () => void, later: () => void) {
  if (document.querySelector('.ul')) return;
  const art = ART[k]();
  const glows = art.glows.map(([x, y]) => {
    const g = h('span', { class: 'ul-glow', 'aria-hidden': 'true' });
    g.style.cssText = `left:${x}%;top:${y}%`;
    return g;
  });
  const scene = h('div', { class: `ul-scene k-${k}` }, h('span', { class: 'ul-rays', 'aria-hidden': 'true' }), ...glows, ...art.parts);
  const who = actor('ul-actor');
  const light = who ? null : noor('ul-noor');
  const body = who?.el ?? light!.el;
  const stage = h('div', { class: 'ul-stage', 'aria-hidden': 'true' }, scene, body, h('span', { class: 'ul-floor' }));
  // Tomorrow's stop, when there is one (src/ui/coming.ts): something to come back for.
  const next = h('button', { class: 'ul-next', hidden: true, onclick: () => { d.close(); void import('./weekGifts').then((m) => m.openWeekGifts()); } });
  void import('./coming').then((m) => {
    const t = m.tomorrow();
    if (t) { next.textContent = fe('co.tomorrowIs', { what: m.stepTitle(t.id) }); next.hidden = false; }
  });
  const close = (then: () => void) => { haptic(10); d.close(); then(); };
  const card = h('div', { class: 'ul-card' },
    h('p', { class: 'ul-kicker' }, fe('rv.new')),
    h('h2', { class: 'ul-title' }, fe(`rv.${k}`)),
    h('p', { class: 'ul-text' }, fe(`rv.${k}Text`)),
    next,
    h('button', { class: 'primary brand-btn ul-go', onclick: () => close(go) }, fe('rv.open')),
    h('button', { class: 'chip ul-later', onclick: () => close(later) }, fe('rv.later')));
  const d = h('dialog', { class: `ul k-${k}`, 'aria-label': fe(`rv.${k}`) },
    h('div', { class: 'ul-sky', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), stage, card) as HTMLDialogElement;
  let timers: number[] = [];
  const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  const end = () => {
    timers.forEach(clearTimeout); timers = [];
    d.classList.add('up', 'lit', 'done');
    card.classList.add('in');
    for (const a of d.getAnimations({ subtree: true })) if (!a.effect || (a.effect as KeyframeEffect).getComputedTiming().iterations !== Infinity) a.finish();
    who?.face('happy', 0);
  };
  d.addEventListener('close', () => { timers.forEach(clearTimeout); holdPage(false); d.remove(); });
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(later); });
  stage.addEventListener('click', () => { if (!d.classList.contains('done')) end(); });
  window.addEventListener('hashchange', () => d.open && d.close(), { once: true });
  document.body.append(d);
  d.showModal();
  holdPage(true);
  if (reduced()) { end(); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('up')));
  popIn(scene, { delay: 120, stiffness: 160, damping: 15 });
  // The character walks in from the side, two small steps, and leans in to look.
  const rtl = document.documentElement.dir === 'rtl' ? -1 : 1;
  body.animate([{ translate: `${-130 * rtl}% 0`, opacity: 0 }, { translate: `${-110 * rtl}% 0`, opacity: 1, offset: 0.1 }, { translate: '0 0', opacity: 1 }],
    { duration: 1000, delay: 300, easing: 'cubic-bezier(.3, .6, .3, 1)', fill: 'backwards' });
  at(340, () => { sfx.whoosh(); who?.hop(0.25); light?.hop(0.4); });
  at(720, () => { who?.hop(0.25); light?.hop(0.4); });
  at(1340, () => { who?.lean(rtl); who?.face('wow', 900); light?.lean(12 * rtl); sfx.tap(0.4, 1); haptic(6); });
  // It comes alive.
  at(1680, () => {
    d.classList.add('lit');
    sfx.open(1, k === 'shop' ? 1 : k === 'room' ? 2 : 3);
    haptic(18);
    sparkle(scene, 16, 0.45);
    if (k === 'shop') scene.querySelectorAll<HTMLElement>('.ul-glow').forEach((g, i) => at(i * 140, () => { g.classList.add('on'); sfx.pop(i); }));
  });
  at(2000, () => { who?.cheer(1800); who?.face('happy', 2400); light?.cheer(); sfx.shimmer(); });
  at(2350, () => { card.classList.add('in'); popIn(card, { stiffness: 190, damping: 17 }); d.classList.add('done'); });
}

/** The piece as a still picture (the timeline in coming.ts), doors closed. */
export function miniArt(k: Reveal): HTMLElement {
  const parts = ART[k]().parts.filter((p) => !p.classList.contains('ul-sil') && !p.classList.contains('ul-hole'));
  return h('span', { class: `ul-mini k-${k}`, 'aria-hidden': 'true' }, ...parts);
}
