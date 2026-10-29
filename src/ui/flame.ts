// The streak flame (Me tab, widget): a bold, rounded, symmetrical streak icon rather than a realistic
// fire (a chunky teardrop flame, a lighter inner flame, a bright core and a glossy
// highlight), drawn in SVG and moved by CSS only (a gentle sway, the inner flames flickering, a
// breathing glow, embers rising). It grows with the streak:
// tier 1 (1–6 days) warm orange, 2 (7–29) brighter gold with more embers, 3 (30+) a white-hot core.
// Tier 0 = the flame is out: a dim ember with a thin curl of smoke. Reduced motion → a still flame.
let uid = 0;

export type FlameTier = 0 | 1 | 2 | 3;
export const flameTier = (days: number, lit: boolean): FlameTier =>
  !lit && days === 0 ? 0 : days >= 30 ? 3 : days >= 7 ? 2 : 1;

const OUTER = 'M50 4C55 20 61 33 63 46C70 43 77 39 82 32C86 47 88 66 88 90C88 116 71 134 50 134C29 134 12 116 12 90C12 66 14 47 18 32C23 39 30 43 37 46C39 33 45 20 50 4Z';
const MID = 'M50 52C56 70 73 86 73 106C73 121 63 130 50 130C37 130 27 121 27 106C27 86 44 70 50 52Z';
const CORE = 'M50 90C55 100 63 106 63 116C63 123 57 127 50 127C43 127 37 123 37 116C37 106 45 100 50 90Z';
const SHINE = 'M24 102C22 90 23 74 27 62';

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
        <defs><radialGradient id="${id}e" cx="50%" cy="60%" r="50%"><stop offset="0" style="stop-color:var(--rw-n1)" stop-opacity=".9"/><stop offset="1" style="stop-color:var(--rw-deep)" stop-opacity="0"/></radialGradient></defs>
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
