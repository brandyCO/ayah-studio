// Reward chests (Me → today's goals, the adhkar session): each goal shows the chest it opens, sized by the
// Light inside. Five chests, all drawn here in SVG, each its own material and weight:
//   0 wood      ≤ 10 Light   plain planks, iron straps
//   1 brass     ≤ 20         warm wood, brass straps and corners
//   2 cedar     ≤ 45         dark cedar, gold, an eight-pointed star on the lid
//   3 emerald   ≤ 99         emerald lacquer, gold, the star and small gems
//   4 light     100+         pearl and gold, the star glowing, light breathing out of the seam
// States: locked (resting, softly breathing, a little muted), ready (shakes now and then and the lid
// lifts a crack with light behind it, heavier chests shake harder and more slowly), open (claimed:
// lid up, quiet). The amount inside is always shown: never a random prize.
import { h } from './dom';
import { circlePath, edge, shine, starPath, two } from './flat';
import { rewardPalette } from './theme';

export type ChestTier = 0 | 1 | 2 | 3 | 4;
export type ChestState = 'locked' | 'ready' | 'open';

export const chestTier = (light: number): ChestTier => (light >= 100 ? 4 : light >= 50 ? 3 : light >= 25 ? 2 : light >= 15 ? 1 : 0);

// Each material: body base / shade, its deep edge, metal base / shade, plank lines.
interface Mat { body: [string, string]; edge: string; metal: [string, string]; line: string; star?: boolean; gems?: boolean; glow?: boolean; planks?: boolean }
const MATS: Mat[] = [
  { body: ['#c98a52', '#9a6033'], edge: '#5e3a20', metal: ['#c3c9cf', '#868d95'], line: '#7a4a26', planks: true },
  { body: ['#bd6a3a', '#8a4421'], edge: '#4e2512', metal: ['#ffd877', '#cf9530'], line: '#6a3216', planks: true },
  { body: ['#7c4428', '#542b17'], edge: '#2a140b', metal: ['#ffe08a', '#d39a2e'], line: '#3a1d0e', star: true },
  { body: ['#19a67b', '#0b6b4e'], edge: '#043427', metal: ['#ffe39a', '#d6a033'], line: '#075a41', star: true, gems: true },
  { body: ['#fff8e6', '#e6d3a0'], edge: '#b59f62', metal: ['#fff0b8', '#e2ad3f'], line: '#cdb67a', star: true, gems: true, glow: true },
];

let uid = 0;
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

/** The chest picture (viewBox 80 × 76), in the characters' flat two-tone style. The lid is its own group
 *  (`.ck-lid`) so it can open; the shapes keep their places so the moment's cracks line up. */
export function chestArt(tier: ChestTier): SVGSVGElement {
  const m = MATS[tier];
  const P = rewardPalette();
  const id = `ck${++uid}`;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 80 76');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('ck-art');
  const [mb, ms] = m.metal;
  const box = rr(11, 36, 58, 31, 5);
  const lid = 'M10 37V27Q10 13 40 13Q70 13 70 27V37Z';
  const lock = 'M33.5 36H46.5V47Q46.5 51.5 40 53.5Q33.5 51.5 33.5 47Z';
  const planks = m.planks ? `<path d="M12 46.5H68M12 56H68" stroke="${m.line}" stroke-opacity=".5" stroke-width="1.6"/>` +
    [[14.5, 42], [14.5, 51], [65.5, 42], [65.5, 51]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="${m.edge}" opacity=".5"/>`).join('') : '';
  const lidPlank = m.planks ? `<path d="M13 25.5H67" stroke="${m.line}" stroke-opacity=".45" stroke-width="1.5"/>` : '';
  const gem = (x: number, y: number, c: string, d: string) =>
    `${two(circlePath(x, y, 2.6), c, d, -0.8, -0.8)}<circle cx="${x - .9}" cy="${y - .9}" r=".8" fill="#fff" opacity=".9"/>`;
  const plate = (x: number, y: number, w: number, h: number) => two(rr(x, y, w, h, 1.4), mb, ms, -1.2, -1.2);
  el.innerHTML = `
    <defs>
      <radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.core}"/><stop offset=".45" stop-color="${P.hi}" stop-opacity=".8"/><stop offset="1" stop-color="${P.n3}" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="ck-aura">${m.glow ? Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30} 40 40)" d="M40 40L37.5 2H42.5Z" fill="${P.hi}" opacity="${i % 2 ? .18 : .32}"/>`).join('') : ''}<circle cx="40" cy="40" r="34" fill="url(#${id}g)" opacity=".5"/></g>
    <ellipse class="ck-shadow" cx="40" cy="71.5" rx="28" ry="3.8" fill="#000" fill-opacity=".2"/>
    <g class="ck-box">
      <ellipse class="ck-mouth" cx="40" cy="37" rx="27" ry="6" fill="url(#${id}g)"/>
      ${edge(box, m.edge, 3)}
      ${two(box, m.body[0], m.body[1], -3, -3)}
      ${planks}
      <rect x="11" y="36" width="58" height="4.5" fill="${m.edge}" fill-opacity=".38"/>
      ${plate(18, 36, 6, 31)}${plate(56, 36, 6, 31)}
      ${tier >= 1 ? two('M11 58H17.5V67H16Q11 67 11 62Z', mb, ms, -1, -1) + two('M69 58H62.5V67H64Q69 67 69 62Z', mb, ms, -1, -1) : ''}
      ${m.gems ? gem(21, 56, '#ff6b7d', '#c32a43') + gem(59, 56, '#6fe0f5', '#1f9cc0') : ''}
      ${edge(lock, m.edge, 1.6)}${two(lock, mb, ms, -1.6, -1.6)}
      <circle cx="40" cy="43" r="2.2" fill="${m.edge}"/><path d="M39.1 43.8L38.5 48.4H41.5L40.9 43.8Z" fill="${m.edge}"/>
      ${shine('M14.5 59V46', 2.2, .3)}
    </g>
    <g class="ck-lid">
      ${two(lid, m.body[0], m.body[1], -3, -3)}
      ${lidPlank}
      ${shine('M15 21.5Q22 16.8 36 16.2', 2.4, .4)}
      ${two('M18 37V18.2Q20.5 16.6 24 15.9V37Z', mb, ms, -1.2, -1.2)}
      ${two('M62 37V18.2Q59.5 16.6 56 15.9V37Z', mb, ms, -1.2, -1.2)}
      ${edge(rr(9, 33, 62, 5, 2), m.edge, 1.4)}${two(rr(9, 33, 62, 5, 2), mb, ms, -1, -1.2)}
      ${m.star ? `<g class="ck-star">${edge(starPath(40, 24.5, 7.8, 5.6), m.edge, 1.2)}${two(starPath(40, 24.5, 7.8, 5.6), mb, ms, -1.4, -1.4)}</g><circle cx="40" cy="24.5" r="2.3" fill="${m.glow ? P.core : m.edge}"/>` : ''}
      ${m.gems ? gem(21, 26, '#6fe0f5', '#1f9cc0') + gem(59, 26, '#ff6b7d', '#c32a43') : ''}
    </g>
    ${m.glow || tier >= 2 ? `<g class="ck-glints" fill="#fff">${[[16, 12], [66, 16], [70, 44], [9, 50]].map(([x, y], i) => `<path style="--i:${i}" d="M${x} ${y - 3}L${x + .8} ${y - .8}L${x + 3} ${y}L${x + .8} ${y + .8}L${x} ${y + 3}L${x - .8} ${y + .8}L${x - 3} ${y}L${x - .8} ${y - .8}Z"/>`).join('')}</g>` : ''}`;
  return el as SVGSVGElement;
}

// A ready chest shakes for ever: pause it while it is off screen, so a long Me page stays smooth.
let seen: IntersectionObserver | null = null;
// A ready chest on screen will likely be tapped: load the opening moment and its sounds while the phone is idle.
let preloaded = false;
function preload() {
  if (preloaded) return;
  preloaded = true;
  const go = () => { void import('./celebrate'); void import('./sfx').then((m) => m.warmSounds()); };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 800);
}
function watch(el: HTMLElement) {
  if (typeof IntersectionObserver === 'undefined') return;
  seen ??= new IntersectionObserver((es) => {
    for (const e of es) {
      e.target.classList.toggle('off', !e.isIntersecting);
      if (e.isIntersecting) preload();
    }
  });
  seen.observe(el);
}

/** A goal's chest: the picture, its state and the Light it holds. `onOpen` runs when a ready chest is tapped. */
export function chest(light: number, state: ChestState, label: string, onOpen?: (el: HTMLElement) => void): HTMLElement {
  const tier = chestTier(light);
  const art = chestArt(tier);
  const amount = h('span', { class: 'ck-amt' }, `✦ ${light}`);
  if (state === 'ready' && onOpen) {
    const b: HTMLButtonElement = h('button', { class: `chest t${tier} ready`, type: 'button', 'aria-label': label, onclick: () => onOpen(b) }, art, amount);
    watch(b);
    return b;
  }
  return h('span', { class: `chest t${tier} ${state}`, role: 'img', 'aria-label': label }, art, amount);
}
