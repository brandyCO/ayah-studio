// The streak flame (Me tab, widget): a bold, rounded streak icon rather than a realistic fire (a
// chunky outer flame with a curl on its left, a lighter inner flame, a bright core and a glossy
// highlight), drawn in SVG and moved by CSS only (a gentle sway, the inner flames flickering, a
// breathing glow, embers rising). It grows with the streak:
// tier 1 (1–6 days) warm orange, 2 (7–29) brighter gold with more embers, 3 (30+) a white-hot core.
// Tier 0 = the flame is out: a dim ember with a thin curl of smoke. Reduced motion → a still flame.
let uid = 0;

export type FlameTier = 0 | 1 | 2 | 3;
export const flameTier = (days: number, lit: boolean): FlameTier =>
  !lit && days === 0 ? 0 : days >= 30 ? 3 : days >= 7 ? 2 : 1;

const OUTER = 'M54 8C62 28 88 46 88 86C88 114 71 133 50 133C29 133 12 116 12 92C12 74 20 62 30 52C30 63 34 71 41 75C38 50 44 28 54 8Z';
const MID = 'M51 58C60 76 73 87 73 104C73 119 63 128 50 128C37 128 27 119 27 106C27 94 35 86 41 78C43 85 46 89 51 91C48 81 47 70 51 58Z';
const CORE = 'M50 92C56 101 62 107 62 115C62 122 57 126 50 126C43 126 38 122 38 116C38 108 45 102 50 92Z';
const SHINE = 'M24 98C22 86 26 76 33 68';

/** The flame; `size` is its height in CSS px. */
export function flame(tier: FlameTier, size = 140, still = false): HTMLElement {
  const id = `fl${++uid}`;
  const el = document.createElement('span');
  el.className = `flame flame-t${tier}${still ? ' still' : ''}`;
  el.style.setProperty('--fl-h', `${size}px`);
  el.setAttribute('aria-hidden', 'true');
  const embers = tier === 0 ? '' : Array.from({ length: tier === 1 ? 4 : tier === 2 ? 7 : 10 }, (_, i) =>
    `<circle class="fl-ember" cx="${36 + ((i * 37) % 28)}" cy="104" r="${1.1 + (i % 3) * 0.5}" style="--d:${(i * 0.53) % 2.6}s;--x:${((i * 29) % 21) - 10}px"/>`).join('');
  el.innerHTML = tier === 0
    ? `<svg viewBox="0 0 100 140" width="100%" height="100%">
        <defs><radialGradient id="${id}e" cx="50%" cy="60%" r="50%"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".9"/><stop offset="1" stop-color="#7a2a10" stop-opacity="0"/></radialGradient></defs>
        <path class="fl-smoke" d="M50 118C44 104 58 96 50 82C44 70 56 62 50 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        <ellipse cx="50" cy="128" rx="20" ry="7" fill="#3a302b"/>
        <ellipse class="fl-coal" cx="50" cy="125" rx="12" ry="5" fill="url(#${id}e)"/>
      </svg>`
    : `<svg viewBox="0 0 100 140" width="100%" height="100%">
        <defs>
          <radialGradient id="${id}g" cx="50%" cy="70%" r="55%"><stop offset="0" style="stop-color:var(--fl-glow)" stop-opacity=".6"/><stop offset=".45" style="stop-color:var(--fl-glow)" stop-opacity=".22"/><stop offset="1" style="stop-color:var(--fl-glow)" stop-opacity="0"/></radialGradient>
          <linearGradient id="${id}o" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--fl-o1)"/><stop offset="1" style="stop-color:var(--fl-o2)"/></linearGradient>
          <linearGradient id="${id}m" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--fl-m1)"/><stop offset="1" style="stop-color:var(--fl-m2)"/></linearGradient>
          <linearGradient id="${id}c" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--fl-c1)"/><stop offset="1" style="stop-color:var(--fl-c2)"/></linearGradient>
        </defs>
        <ellipse class="fl-glow" cx="50" cy="94" rx="62" ry="58" fill="url(#${id}g)"/>
        <g class="fl-embers" style="fill:var(--fl-m2)">${embers}</g>
        <g class="fl-body">
          <path class="fl-outer" d="${OUTER}" fill="url(#${id}o)" style="stroke:var(--fl-o1)" stroke-width="3" stroke-linejoin="round"/>
          <path class="fl-mid" d="${MID}" fill="url(#${id}m)"/>
          <path class="fl-core" d="${CORE}" fill="url(#${id}c)"/>
          <path class="fl-shine" d="${SHINE}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
        </g>
      </svg>`;
  return el;
}
