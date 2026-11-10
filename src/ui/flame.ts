// The streak flame (Me tab, widget): a chunky, rounded two-tone streak icon rather than a realistic
// fire (the main tip leaning a little right, a small bump on the left, a round base, one rounded inner
// drop low in the middle, no outline), drawn in SVG and moved by CSS only (a gentle sway, the inner
// drop flickering, a breathing glow, embers rising), in the theme's colours. It grows with the streak:
// tier 1 (1–6 days), 2 (7–29) brighter with more embers, 3 (30+) a white-hot inner drop.
// Tier 0 = the flame is out: a dim ember with a thin curl of smoke. Reduced motion → a still flame.
import { restOffscreen } from './offscreen';

let uid = 0;

export type FlameTier = 0 | 1 | 2 | 3;
export const flameTier = (days: number, lit: boolean): FlameTier =>
  !lit && days === 0 ? 0 : days >= 30 ? 3 : days >= 7 ? 2 : 1;

const OUTER = 'M62 6C70 26 92 46 92 88C92 116 73 134 50 134C27 134 8 116 8 90C8 72 14 58 22 46C25 54 29 59 35 61C36 42 44 22 62 6Z';
const MID = 'M51 66C57 80 72 92 72 108C72 121 62 129 50 129C38 129 28 121 28 108C28 92 44 80 51 66Z';

/** The flame; `size` is its height in CSS px. */
export function flame(tier: FlameTier, size = 140, still = false): HTMLElement {
  const id = `fl${++uid}`;
  const el = document.createElement('span');
  el.className = `flame flame-t${tier}${still ? ' still' : ''}`;
  el.style.setProperty('--fl-h', `${size}px`);
  el.setAttribute('aria-hidden', 'true');
  // Speed (owner 2026-11-10, "60fps, every animation"): the flame is a stack of SVGs with one view-box
  // (100 × 140) and each moving part — glow, embers, the swaying body, the flickering inner drop, smoke — is
  // an HTML layer the compositor moves without repainting the drawing. Same shapes, same motion.
  const sv = (inner: string, defs = '') => `<svg viewBox="0 0 100 140" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>`;
  const embers = tier === 0 ? '' : Array.from({ length: tier === 1 ? 4 : tier === 2 ? 7 : 10 }, (_, i) => {
    const cx = 36 + ((i * 37) % 28), cy = 104, r = 1.1 + (i % 3) * 0.5;
    return `<i class="fl-ember" style="left:${cx - r}%;top:${((cy - r) / 1.4).toFixed(3)}%;width:${2 * r}%;height:${((2 * r) / 1.4).toFixed(3)}%;--d:${(i * 0.53) % 2.6}s;--xu:${((i * 29) % 21) - 10}"></i>`;
  }).join('');
  el.innerHTML = tier === 0
    ? `${sv('', `<radialGradient id="${id}e" cx="50%" cy="60%" r="50%"><stop offset="0" style="stop-color:var(--rw-n1)" stop-opacity=".9"/><stop offset="1" style="stop-color:var(--rw-deep)" stop-opacity="0"/></radialGradient>`)}
      <span class="fl-smoke">${sv('<path d="M50 118C44 104 58 96 50 82C44 70 56 62 50 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>')}</span>
      ${sv('<ellipse cx="50" cy="128" rx="20" ry="7" fill="#3a302b"/>')}
      <span class="fl-coal">${sv(`<ellipse cx="50" cy="125" rx="12" ry="5" fill="url(#${id}e)"/>`)}</span>`
    : `<span class="fl-glow">${sv(`<ellipse cx="50" cy="94" rx="62" ry="58" fill="url(#${id}g)"/>`,
        `<radialGradient id="${id}g" cx="50%" cy="70%" r="55%"><stop offset="0" style="stop-color:var(--fl-glow)" stop-opacity=".6"/><stop offset=".45" style="stop-color:var(--fl-glow)" stop-opacity=".22"/><stop offset="1" style="stop-color:var(--fl-glow)" stop-opacity="0"/></radialGradient>
          <linearGradient id="${id}o" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--fl-o1)"/><stop offset="1" style="stop-color:var(--fl-o2)"/></linearGradient>
          <linearGradient id="${id}m" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--fl-m1)"/><stop offset="1" style="stop-color:var(--fl-m2)"/></linearGradient>`)}</span>
      <span class="fl-embers">${embers}</span>
      <span class="fl-body">${sv(`<path class="fl-outer" d="${OUTER}" fill="url(#${id}o)"/>`)}<span class="fl-mid">${sv(`<path d="${MID}" fill="url(#${id}m)"/>`)}</span></span>`;
  if (!still && tier > 0) restOffscreen(el);
  return el;
}
