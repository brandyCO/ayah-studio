// The streak flame (Me tab, friends, widgets page, relight, season): the same smooth flame as the streak moment
// and the power-up (owner 2026-11-12: "put the new streak flame in the streak card, stop using the old flame") —
// one soft teardrop with no outline, a light outer flame, a deeper inner flame and a white drop, in the theme's
// colours (drawFire() / themeFire()). Drawn once on two canvases (outer flame; inner flame + drop) and moved by CSS
// only (a gentle sway, the inner flame flickering, a breathing glow, embers rising), so it never repaints.
// It grows with the streak: tier 1 (1–6 days), 2 (7–29) brighter glow, more embers, 3 (30+) a bigger white drop.
// Tier 0 = the flame is out: the same flame in grey with a thin curl of smoke. Reduced motion → a still flame.
import { drawFire, type FireLook, type Shape } from './flatFireCore';
import { restOffscreen } from './offscreen';
import { rewardPalette } from './theme';

let uid = 0;

export type FlameTier = 0 | 1 | 2 | 3;
export const flameTier = (days: number, lit: boolean): FlameTier =>
  !lit && days === 0 ? 0 : days >= 30 ? 3 : days >= 7 ? 2 : 1;

/** The flame in its 100 × 140 box: the streak moment's proportions, standing on the box's foot. */
const SHAPE: Shape = { w: 40, h: 104, lean: 5.5, bump: 31, sq: 1 };
const FOOT = 135;

const grey = (): FireLook => {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark
    ? { rim: '#4a524f', top: '#5b6461', bottom: '#4a524f', inTop: '#737c79', inBottom: '#646d6a', core: '#8b9491' }
    : { rim: '#c9c9c9', top: '#d6d6d6', bottom: '#c4c4c4', inTop: '#e9e9e9', inBottom: '#dedede', core: '#f6f6f6' };
};

function layer(size: number, look: FireLook, part: 'outer' | 'inner', drop: number): HTMLCanvasElement {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const k = (size / 140) * dpr;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(100 * k)); cv.height = Math.max(1, Math.round(140 * k));
  const c = cv.getContext('2d');
  if (c) { c.scale(k, k); drawFire(c, 50, FOOT, SHAPE, look, drop, part); }
  return cv;
}

/** The flame; `size` is its height in CSS px. */
export function flame(tier: FlameTier, size = 140, still = false): HTMLElement {
  const id = `fl${++uid}`;
  const el = document.createElement('span');
  el.className = `flame flame-t${tier}${still ? ' still' : ''}`;
  el.style.setProperty('--fl-h', `${size}px`);
  el.setAttribute('aria-hidden', 'true');
  const sv = (inner: string, defs = '') => `<svg viewBox="0 0 100 140" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>`;
  const embers = tier === 0 ? '' : Array.from({ length: tier === 1 ? 4 : tier === 2 ? 7 : 10 }, (_, i) => {
    const cx = 36 + ((i * 37) % 28), cy = 104, r = 1.1 + (i % 3) * 0.5;
    return `<i class="fl-ember" style="left:${cx - r}%;top:${((cy - r) / 1.4).toFixed(3)}%;width:${2 * r}%;height:${((2 * r) / 1.4).toFixed(3)}%;--d:${(i * 0.53) % 2.6}s;--xu:${((i * 29) % 21) - 10}"></i>`;
  }).join('');
  if (tier === 0) {
    el.innerHTML = `<span class="fl-smoke">${sv('<path d="M51 30C45 22 57 15 50 7C46 2 53 -3 50 -8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>')}</span>`;
    const look = grey();
    const body = document.createElement('span'); body.className = 'fl-body';
    body.append(layer(size, look, 'outer', 0));
    const mid = document.createElement('span'); mid.className = 'fl-mid';
    mid.append(layer(size, look, 'inner', 0.85));
    body.append(mid);
    el.append(body);
    return el;
  }
  const p = rewardPalette();
  const look: FireLook = { rim: p.n3, top: p.n2, bottom: p.n3, inTop: p.n1, inBottom: p.n2, core: '#ffffff' };
  el.innerHTML = `<span class="fl-glow">${sv(`<ellipse cx="50" cy="94" rx="62" ry="58" fill="url(#${id}g)"/>`,
      `<radialGradient id="${id}g" cx="50%" cy="70%" r="55%"><stop offset="0" style="stop-color:var(--fl-glow)" stop-opacity=".6"/><stop offset=".45" style="stop-color:var(--fl-glow)" stop-opacity=".22"/><stop offset="1" style="stop-color:var(--fl-glow)" stop-opacity="0"/></radialGradient>`)}</span>
    <span class="fl-embers">${embers}</span>`;
  const body = document.createElement('span'); body.className = 'fl-body';
  body.append(layer(size, look, 'outer', 0));
  const mid = document.createElement('span'); mid.className = 'fl-mid';
  mid.append(layer(size, look, 'inner', tier === 3 ? 1.18 : 1));
  body.append(mid);
  el.append(body);
  if (!still) restOffscreen(el);
  return el;
}
