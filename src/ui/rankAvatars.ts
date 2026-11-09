// Ranks avatars (owner decision 2026-11-09: no photos, so nothing to moderate and no faces), drawn here.
// 0–23 free: 12 symbols on two sets of colours. 24–31 from the shop: gold on night. 32–35 the Sun tier's
// (cannot be bought): white on gold with rays. 36–39 champions, for weeks won at #1: gold on emerald.
// Frames: 0 the tier's ring, 1 glow, 2 emerald double, 3 stars (shop); 4 sun crown (Sun tier); 5 / 6 / 7
// gold / silver / bronze laurel (a week won at #1 / #2 / #3). A private player gets a plain disc.
// Weekly prizes (rank_prize_item): 40–51 jewels for a week's #1; frames 8 pearls, 9 crescent crown,
// 10 mosaic, 11 aurora, 12 lanterns, 13 rosette for its #2 and #3.
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
export const AVATARS = 52;
export const FRAMES = 14;
export const TIER_RING = ['#b07a43', '#c3c9d2', '#9cc2e8', '#eaa07a', '#f2c14e'];
const GOLD = '#f2c14e';
const LAUREL = ['#f2c14e', '#cfd6de', '#d08a4e'];

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
let uid = 0;

/** Background stops, symbol and its colour for avatar n. */
const JEWELS: [string, string][] = [
  ['#fbf6ee', '#b9ad9c'], ['#e0475b', '#5c0a1c'], ['#4a7fe0', '#0b1f5c'], ['#2fbf83', '#053d2a'],
  ['#a46ae0', '#300b5c'], ['#f2b33d', '#6b3a05'], ['#4b4f5c', '#0c0d12'], ['#cfe6f2', '#7e8fd6'],
  ['#f58d78', '#7a2a1d'], ['#3fd0c9', '#0a4d55'], ['#dfe4f0', '#7b86a3'], ['#b3243a', '#3a0510'],
];
function look(n: number): { a: string; b: string; sym: number; ink: string; rays?: boolean; dots?: boolean; gem?: boolean } {
  if (n >= 40) { const [a, b] = JEWELS[n - 40]; return { a, b, sym: [1, 2, 0, 3, 7, 10, 8, 11, 5, 4, 6, 9][n - 40], ink: n === 40 || n === 47 || n === 50 ? '#8a6a1c' : '#fff6da', gem: true }; }
  if (n < 24) { const hh = (n * 47 + (n >= 12 ? 23 : 0)) % 360; return { a: `hsl(${hh} 48% 40%)`, b: `hsl(${(hh + 30) % 360} 52% 24%)`, sym: n % 12, ink: '#fff' }; }
  if (n < 32) { const hh = 200 + (n - 24) * 18; return { a: `hsl(${hh} 45% 22%)`, b: `hsl(${hh + 20} 50% 8%)`, sym: [0, 1, 2, 3, 7, 8, 10, 11][n - 24], ink: GOLD }; }
  if (n < 36) return { a: '#ffe08a', b: '#c47f10', sym: [10, 2, 1, 7][n - 32], ink: '#fff', rays: true };
  return { a: '#0f6b52', b: '#03231a', sym: [2, 0, 8, 1][n - 36], ink: GOLD, dots: true };
}

/** An avatar disc with its frame. `i` null = a private player. */
export function avatar(i: number | null | undefined, tier = 0, size = 36, frame = 0): HTMLElement {
  const svg = el('svg', { viewBox: '-4 -4 48 48', width: String(size), height: String(size), 'aria-hidden': 'true' });
  const priv = i === null || i === undefined;
  const n = priv ? 0 : Math.max(0, Math.min(AVATARS - 1, i | 0));
  const f = priv ? 0 : Math.max(0, Math.min(FRAMES - 1, frame | 0));
  const L = look(n);
  const id = `rka${++uid}`;
  const g = el('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' });
  g.append(el('stop', { offset: '0', 'stop-color': priv ? '#8a8f94' : L.a }), el('stop', { offset: '1', 'stop-color': priv ? '#5d6166' : L.b }));
  const defs = el('defs', {});
  defs.append(g);
  svg.append(defs, el('circle', { cx: '20', cy: '20', r: '17', fill: `url(#${id})` }));
  if (!priv && L.rays) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    svg.append(el('line', { x1: String(20 + Math.cos(a) * 9), y1: String(20 + Math.sin(a) * 9), x2: String(20 + Math.cos(a) * 16), y2: String(20 + Math.sin(a) * 16), stroke: 'rgba(255,255,255,.35)', 'stroke-width': '1' }));
  }
  if (!priv && L.dots) for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    svg.append(el('circle', { cx: String(20 + Math.cos(a) * 14), cy: String(20 + Math.sin(a) * 14), r: '0.9', fill: GOLD }));
  }
  if (!priv && L.gem) {
    // Facets and a glint: the disc reads as a cut stone.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      svg.append(el('line', { x1: String(20 + Math.cos(a) * 11), y1: String(20 + Math.sin(a) * 11), x2: String(20 + Math.cos(a) * 17), y2: String(20 + Math.sin(a) * 17), stroke: 'rgba(255,255,255,.22)', 'stroke-width': '0.8' }));
    }
    svg.append(el('ellipse', { cx: '13', cy: '11', rx: '5', ry: '2.6', fill: 'rgba(255,255,255,.35)', transform: 'rotate(-35 13 11)' }));
    star(svg, 29, 10, 2.4, 'rgba(255,255,255,.9)');
  }
  if (priv) svg.append(el('circle', { cx: '20', cy: '20', r: '3', fill: 'rgba(255,255,255,.7)' }));
  else svg.append(el('path', { d: SYMBOLS[L.sym], fill: 'none', stroke: L.ink, 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(8 8)' }));
  drawFrame(svg, f, tier);
  return h('span', { class: `rk-av f${f}${tier === 4 || f === 1 || f === 4 || f === 5 || f >= 8 || n >= 40 ? ' glow' : ''}` }, svg as unknown as Node);
}

function drawFrame(svg: Element, f: number, tier: number) {
  const ring = (r: number, stroke: string, w: number, extra: Record<string, string> = {}) =>
    svg.append(el('circle', { cx: '20', cy: '20', r: String(r), fill: 'none', stroke, 'stroke-width': String(w), ...extra }));
  const tc = TIER_RING[Math.max(0, Math.min(4, tier))];
  if (f === 0) ring(18.5, tc, 2.4);
  else if (f === 1) { ring(18.5, GOLD, 2.6); ring(20.6, 'rgba(242,193,78,.35)', 1.2); }
  else if (f === 2) { ring(18.2, '#3dd1ad', 1.6); ring(20.4, '#0a6e55', 1.6); }
  else if (f === 3) {
    ring(18.5, tc, 1.6, { 'stroke-dasharray': '2 2' });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      star(svg, 20 + Math.cos(a) * 19.5, 20 + Math.sin(a) * 19.5, 1.9, GOLD);
    }
  } else if (f === 4) {
    ring(18.5, GOLD, 2.4);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r1 = 20, r2 = k % 2 ? 22 : 23.5;
      svg.append(el('line', { x1: String(20 + Math.cos(a) * r1), y1: String(20 + Math.sin(a) * r1), x2: String(20 + Math.cos(a) * r2), y2: String(20 + Math.sin(a) * r2), stroke: GOLD, 'stroke-width': '1.4', 'stroke-linecap': 'round' }));
    }
  } else if (f === 8) {
    ring(18.4, '#e9e2d4', 1);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      svg.append(el('circle', { cx: String(20 + Math.cos(a) * 19.6), cy: String(20 + Math.sin(a) * 19.6), r: '1.55', fill: '#fbf6ee', stroke: '#c9bfae', 'stroke-width': '0.4' }));
    }
  } else if (f === 9) {
    ring(18.5, GOLD, 2.2);
    // A crescent and a star crowning the disc.
    svg.append(el('circle', { cx: '20', cy: '0.6', r: '5.2', fill: '#fff6da', opacity: '.55' }));
    svg.append(el('path', { d: 'M21.5 -3.6a4.6 4.6 0 1 0 0 8.4a3.6 3.6 0 1 1 0 -8.4z', fill: GOLD, stroke: '#b5821e', 'stroke-width': '0.4' }));
    star(svg, 22.6, 0.6, 1.5, GOLD);
  } else if (f === 10) {
    const C = 2 * Math.PI * 18.8, seg = C / 12;
    ['#3dd1ad', GOLD, '#e0475b'].forEach((c, i) => ring(18.8, c, 3, { 'stroke-dasharray': `${seg - 0.6} ${seg * 2 + 0.6}`, 'stroke-dashoffset': String(-seg * i) }));
    ring(21, 'rgba(242,193,78,.5)', 0.6);
  } else if (f === 11) {
    const gid = `rkf${++uid}`;
    const g = el('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' });
    g.append(el('stop', { offset: '0', 'stop-color': '#3dd1ad' }), el('stop', { offset: '.5', 'stop-color': '#8f6ae0' }), el('stop', { offset: '1', 'stop-color': '#f58da0' }));
    svg.querySelector('defs')?.append(g);
    ring(18.6, `url(#${gid})`, 2.8);
    ring(21.2, `url(#${gid})`, 0.9, { opacity: '.6' });
  } else if (f === 12) {
    ring(18.5, GOLD, 1.6);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = 20 + Math.cos(a) * 19.5, y = 20 + Math.sin(a) * 19.5;
      svg.append(el('path', { d: `M${x - 1.6} ${y - 1.4}h3.2l.8 1.4v1.6l-.8 1.4h-3.2l-.8-1.4v-1.6zM${x} ${y - 2.8}v1.4`, fill: '#ffd98a', stroke: '#b5821e', 'stroke-width': '0.5' }));
    }
  } else if (f === 13) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2, w = Math.PI / 14;
      const p = (r: number, t: number) => `${(20 + Math.cos(t) * r).toFixed(2)},${(20 + Math.sin(t) * r).toFixed(2)}`;
      svg.append(el('polygon', { points: `${p(19, a - w)} ${p(24.6, a)} ${p(19, a + w)}`, fill: GOLD }));
      const b = a + Math.PI / 8;
      svg.append(el('polygon', { points: `${p(19, b - w * 0.7)} ${p(22, b)} ${p(19, b + w * 0.7)}`, fill: '#3dd1ad' }));
    }
    ring(18.5, '#0f6b52', 2.2);
  } else {
    const c = LAUREL[f - 5];
    ring(18.5, c, 2);
    // Two branches of leaves round the lower part, meeting under the disc.
    for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
      const deg = 90 + side * (22 + k * 19);
      const a = (deg * Math.PI) / 180;
      const x = 20 + Math.cos(a) * 20.4, y = 20 + Math.sin(a) * 20.4;
      svg.append(el('ellipse', { cx: x.toFixed(2), cy: y.toFixed(2), rx: '1.3', ry: '2.8', fill: c,
        transform: `rotate(${(deg + 90 + side * 28).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})` }));
    }
  }
}
function star(svg: Element, x: number, y: number, r: number, fill: string) {
  const pts: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  svg.append(el('polygon', { points: pts.join(' '), fill }));
}

/** A trophy cup in gold, silver or bronze (place 1–3), or a rising arrow for a week that only moved up. */
export function trophy(place: number | null, size = 28): HTMLElement {
  const c = place ? ['#f2c14e', '#c9d1da', '#cd8549'][place - 1] : '#3dd1ad';
  const svg = el('svg', { viewBox: '0 0 24 24', width: String(size), height: String(size), 'aria-hidden': 'true' });
  if (place) {
    svg.append(
      el('path', { d: 'M7 3h10v4a5 5 0 0 1-10 0z', fill: c }),
      el('path', { d: 'M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3', fill: 'none', stroke: c, 'stroke-width': '1.6' }),
      el('path', { d: 'M10.5 12h3v4h-3zM8 17h8v3H8z', fill: c }),
      el('text', { x: '12', y: '8.6', 'text-anchor': 'middle', 'font-size': '5.5', 'font-weight': '800', fill: 'rgba(0,0,0,.45)' }));
    (svg.lastChild as Element).textContent = String(place);
  } else svg.append(el('path', { d: 'M12 4l6 7h-4v8h-4v-8H6z', fill: c }));
  return h('span', { class: 'rk-trophy-ic' }, svg as unknown as Node);
}
