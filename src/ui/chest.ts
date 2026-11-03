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
import { rewardPalette } from './theme';

export type ChestTier = 0 | 1 | 2 | 3 | 4;
export type ChestState = 'locked' | 'ready' | 'open';

export const chestTier = (light: number): ChestTier => (light >= 100 ? 4 : light >= 50 ? 3 : light >= 25 ? 2 : light >= 15 ? 1 : 0);

interface Mat { body: [string, string]; dark: string; metal: [string, string]; line: string; star?: boolean; gems?: boolean; glow?: boolean; planks?: boolean }
const MATS: Mat[] = [
  { body: ['#b77a45', '#8a5530'], dark: '#5e3a20', metal: ['#a7adb4', '#6f757c'], line: '#6b4224', planks: true },
  { body: ['#a8582f', '#7b3c1d'], dark: '#4e2512', metal: ['#f7d27a', '#b9862c'], line: '#5d2d16', planks: true },
  { body: ['#6b3a22', '#432214'], dark: '#2a140b', metal: ['#ffe08a', '#c4902c'], line: '#2f170c', star: true },
  { body: ['#13906a', '#07533d'], dark: '#043427', metal: ['#ffe39a', '#c8952f'], line: '#05402f', star: true, gems: true },
  { body: ['#fbf4df', '#dccb98'], dark: '#b59f62', metal: ['#fff0b8', '#d9a73c'], line: '#c2ad73', star: true, gems: true, glow: true },
];

let uid = 0;
function star(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const d = i % 2 ? r : R;
    pts.push(`${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** The chest picture (viewBox 80 × 76). The lid is its own group (`.ck-lid`) so it can open. */
export function chestArt(tier: ChestTier): SVGSVGElement {
  const m = MATS[tier];
  const P = rewardPalette();
  const id = `ck${++uid}`;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 80 76');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('ck-art');
  const planks = m.planks ? '<path d="M12 46H68M12 55H68" stroke="' + m.line + '" stroke-opacity=".55" stroke-width="1.2"/>' : '';
  const lidPlank = m.planks ? '<path d="M14 25H66" stroke="' + m.line + '" stroke-opacity=".5" stroke-width="1.1"/>' : '';
  const gem = (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${c}" stroke="${m.metal[1]}" stroke-width=".8"/><circle cx="${x - .6}" cy="${y - .7}" r=".6" fill="#fff" fill-opacity=".8"/>`;
  el.innerHTML = `
    <defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.body[0]}"/><stop offset="1" stop-color="${m.body[1]}"/></linearGradient>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.metal[0]}"/><stop offset="1" stop-color="${m.metal[1]}"/></linearGradient>
      <radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.core}"/><stop offset=".45" stop-color="${P.hi}" stop-opacity=".8"/><stop offset="1" stop-color="${P.n3}" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="ck-aura">${m.glow ? Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30} 40 40)" d="M40 40L37.5 2H42.5Z" fill="${P.hi}" opacity="${i % 2 ? .18 : .32}"/>`).join('') : ''}<circle cx="40" cy="40" r="34" fill="url(#${id}g)" opacity=".5"/></g>
    <ellipse class="ck-shadow" cx="40" cy="71" rx="27" ry="3.6" fill="#000" fill-opacity=".22"/>
    <g class="ck-box">
      <ellipse class="ck-mouth" cx="40" cy="37" rx="27" ry="6" fill="url(#${id}g)"/>
      <rect x="11" y="36" width="58" height="32" rx="4" fill="url(#${id}b)" stroke="${m.dark}" stroke-width="1.6"/>
      ${planks}
      <rect x="11" y="36" width="58" height="4" fill="${m.dark}" fill-opacity=".35"/>
      <rect x="18" y="36" width="6" height="32" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".6"/>
      <rect x="56" y="36" width="6" height="32" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".6"/>
      ${tier >= 1 ? `<path d="M11 61V68H18M69 61V68H62" fill="none" stroke="url(#${id}m)" stroke-width="3" stroke-linejoin="round"/>` : ''}
      ${m.gems ? gem(21, 56, '#e0475b') + gem(59, 56, '#3cc7e6') : ''}
      <path d="M33.5 37H46.5V47Q46.5 51 40 53Q33.5 51 33.5 47Z" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".8"/>
      <circle cx="40" cy="43" r="2" fill="${m.dark}"/><path d="M39.2 43.8L38.6 48H41.4L40.8 43.8Z" fill="${m.dark}"/>
    </g>
    <g class="ck-lid">
      <path d="M10 37V27Q10 13 40 13Q70 13 70 27V37Z" fill="url(#${id}b)" stroke="${m.dark}" stroke-width="1.6" stroke-linejoin="round"/>
      ${lidPlank}
      <path d="M14 22Q22 16.5 40 16Q58 16.5 66 22" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/>
      <path d="M18 37V18.2Q20.5 16.6 24 15.9V37Z" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".6"/>
      <path d="M62 37V18.2Q59.5 16.6 56 15.9V37Z" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".6"/>
      <rect x="9" y="33.5" width="62" height="4.5" rx="1.6" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".6"/>
      ${m.star ? `<polygon class="ck-star" points="${star(40, 24.5, 7.4, 5.4)}" fill="url(#${id}m)" stroke="${m.metal[1]}" stroke-width=".6"/><circle cx="40" cy="24.5" r="2.2" fill="${m.glow ? P.core : m.dark}"/>` : ''}
      ${m.gems ? gem(21, 26, '#3cc7e6') + gem(59, 26, '#e0475b') : ''}
    </g>
    ${m.glow || tier >= 2 ? `<g class="ck-glints" fill="#fff">${[[16, 12], [66, 16], [70, 44], [9, 50]].map(([x, y], i) => `<path style="--i:${i}" d="M${x} ${y - 3}L${x + .8} ${y - .8}L${x + 3} ${y}L${x + .8} ${y + .8}L${x} ${y + 3}L${x - .8} ${y + .8}L${x - 3} ${y}L${x - .8} ${y - .8}Z"/>`).join('')}</g>` : ''}`;
  return el as SVGSVGElement;
}

/** A goal's chest: the picture, its state and the Light it holds. `onOpen` runs when a ready chest is tapped. */
export function chest(light: number, state: ChestState, label: string, onOpen?: (el: HTMLElement) => void): HTMLElement {
  const tier = chestTier(light);
  const art = chestArt(tier);
  const amount = h('span', { class: 'ck-amt' }, `✦ ${light}`);
  if (state === 'ready' && onOpen) {
    const b: HTMLButtonElement = h('button', { class: `chest t${tier} ready`, type: 'button', 'aria-label': label, onclick: () => onOpen(b) }, art, amount);
    return b;
  }
  return h('span', { class: `chest t${tier} ${state}`, role: 'img', 'aria-label': label }, art, amount);
}
