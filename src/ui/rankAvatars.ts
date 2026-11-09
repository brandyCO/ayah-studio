// Ranks avatars (owner decision 2026-11-09: no photos, so nothing to moderate and no faces): 24 drawn here,
// 12 symbols on two sets of colours, in a ring of the player's league tier. A private player gets a plain disc.
import { h } from './dom';

const SYMBOLS = [
  'M12 3v2M9 5h6l1.5 3v8L15 19H9l-1.5-3V8zM7.5 8h9M7.5 16h9', // lantern
  'M15 4a8 8 0 1 0 5 13A7 7 0 0 1 15 4z', // crescent
  'M7 7h10v10H7zM12 4.9l7.1 7.1-7.1 7.1-7.1-7.1z', // eight-pointed star
  'M12 21v-9M12 12c-2-3-5-3-7-2M12 12c2-3 5-3 7-2M12 12c-1-3-3-5-5-5M12 12c1-3 3-5 5-5', // palm
  'M3 17c3-5 6-6 9-4s5 1 9-3M3 20h18', // dune
  'M3 11c2-3 4-3 6 0s4 3 6 0 4-3 6 0M3 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0', // waves
  'M3 19l6-10 4 6 3-4 5 8z', // mountains
  'M5 19v-6a7 7 0 0 1 14 0v6zM12 6V3M3 19h18', // dome
  'M6 21V11a6 6 0 0 1 12 0v10M3 21h18M9.5 21v-7a2.5 2.5 0 0 1 5 0v7', // arch
  'M5 7l7 5 7-5M7 20l10-9M17 20L7 11', // book stand (rahl)
  'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', // sun
  'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z', // drop
];
export const AVATARS = 24;
const TIER_RING = ['#b07a43', '#c3c9d2', '#9cc2e8', '#eaa07a', '#f2c14e'];

const hue = (i: number) => (i * 47 + (i >= 12 ? 23 : 0)) % 360;
const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/** An avatar disc. `i` null = a private player. */
export function avatar(i: number | null | undefined, tier = 0, size = 36): HTMLElement {
  const svg = el('svg', { viewBox: '0 0 40 40', width: String(size), height: String(size), 'aria-hidden': 'true' });
  const priv = i === null || i === undefined;
  const n = priv ? 0 : Math.max(0, Math.min(AVATARS - 1, i | 0));
  const hh = hue(n);
  const g = el('linearGradient', { id: `rka${n}${priv ? 'p' : ''}`, x1: '0', y1: '0', x2: '1', y2: '1' });
  g.append(el('stop', { offset: '0', 'stop-color': priv ? '#8a8f94' : `hsl(${hh} 48% 40%)` }),
    el('stop', { offset: '1', 'stop-color': priv ? '#5d6166' : `hsl(${(hh + 30) % 360} 52% 24%)` }));
  const defs = el('defs', {});
  defs.append(g);
  svg.append(defs, el('circle', { cx: '20', cy: '20', r: '17', fill: `url(#${g.id})` }),
    el('circle', { cx: '20', cy: '20', r: '18.5', fill: 'none', stroke: TIER_RING[Math.max(0, Math.min(4, tier))], 'stroke-width': '2.4' }));
  if (!priv) {
    const sym = el('path', { d: SYMBOLS[n % 12], fill: 'none', stroke: '#fff', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(8 8)' });
    svg.append(sym);
  } else svg.append(el('circle', { cx: '20', cy: '20', r: '3', fill: 'rgba(255,255,255,.7)' }));
  return h('span', { class: `rk-av${tier === 4 ? ' sun' : ''}` }, svg as unknown as Node);
}
