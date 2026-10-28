// The streak flame (Me tab): a living fire drawn in SVG and moved by CSS only (three layered tongues
// flickering at their own pace, a breathing glow, embers rising). It grows with the streak:
// tier 1 (1–6 days) warm orange, 2 (7–29) brighter gold with more embers, 3 (30+) a white-hot core.
// Tier 0 = the flame is out: a dim ember with a thin curl of smoke. Reduced motion → a still flame.
let uid = 0;

export type FlameTier = 0 | 1 | 2 | 3;
export const flameTier = (days: number, lit: boolean): FlameTier =>
  !lit && days === 0 ? 0 : days >= 30 ? 3 : days >= 7 ? 2 : 1;

const OUTER = 'M50 6C58 30 84 46 84 86C84 114 68 132 50 132C32 132 16 114 16 88C16 66 28 54 34 38C38 52 42 58 47 60C44 42 44 24 50 6Z';
const MID = 'M50 38C56 58 73 70 73 96C73 117 63 128 50 128C37 128 27 117 27 98C27 84 35 76 40 65C43 75 46 80 50 82C48 69 47 54 50 38Z';
const CORE = 'M50 74C55 88 63 96 63 108C63 120 57 127 50 127C43 127 37 120 37 110C37 100 45 91 50 74Z';

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
        <path class="fl-outer" d="${OUTER}" fill="url(#${id}o)"/>
        <path class="fl-mid" d="${MID}" fill="url(#${id}m)"/>
        <path class="fl-core" d="${CORE}" fill="url(#${id}c)"/>
      </svg>`;
  return el;
}
