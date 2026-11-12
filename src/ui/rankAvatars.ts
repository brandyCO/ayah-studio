// Ranks avatars (owner decision 2026-11-09: no photos, so nothing to moderate and no faces), drawn here.
// 0–23 free: 12 symbols on two sets of colours. 24–31 from the shop: gold on night. 32–35 the Sun tier's
// (cannot be bought): white on gold with rays. 36–39 champions, for weeks won at #1: gold on emerald.
// Frames: 0 the tier's ring, 1 glow, 2 emerald double, 3 stars (shop); 4 sun crown (Sun tier); 5 / 6 / 7
// gold / silver / bronze laurel (a week won at #1 / #2 / #3). A private player gets a plain disc.
// Weekly prizes (rank_prize_item): 40–51 jewels for a week's #1; frames 8 pearls, 9 crescent crown,
// 10 mosaic, 11 aurora, 12 lanterns, 13 rosette for its #2 and #3.
import { h } from './dom';
import { bustMarkup, parse } from './figure';
import { circlePath, edge, mix, shine, two } from './flat';

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
export const FRAMES = 20;
export const TIER_RING = ['#c47a4c', '#a9b0f2', '#5fcfc0', '#e891aa', '#f2c14e']; // Dar al-Arqam clay, Hijrah night, Badr water, Al-Khandaq dusk, Fath Makkah gold
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
export function avatar(i: number | null | undefined, tier = 0, size = 36, frame = 0, figure?: string | null): HTMLElement {
  const svg = el('svg', { viewBox: '-4 -4 48 48', width: String(size), height: String(size), 'aria-hidden': 'true', overflow: 'visible' });
  const priv = i === null || i === undefined;
  const fig = priv ? null : parse(figure);
  if (fig) {
    // A character from the builder: head and shoulders in the disc, inside the same frame.
    const g = el('g', {});
    g.innerHTML = bustMarkup(fig);
    svg.append(g);
    const f = Math.max(0, Math.min(FRAMES - 1, frame | 0));
    drawFrame(svg, f, tier);
    return h('span', { class: `rk-av f${f}${tier === 4 || f === 1 || f === 4 || f === 5 || f >= 8 ? ' glow' : ''}` }, svg as unknown as Node, glintLayer(size));
  }
  const n = priv ? 0 : Math.max(0, Math.min(AVATARS - 1, i | 0));
  const f = priv ? 0 : Math.max(0, Math.min(FRAMES - 1, frame | 0));
  const L = look(n);
  // The disc in two tones like the characters, the light from the top left.
  const disc = el('g', {});
  disc.innerHTML = two(circlePath(20, 20, 17), priv ? '#8a8f94' : L.a, priv ? '#5d6166' : L.b, -3, -3) + shine('M8.6 15.5A12.5 12.5 0 0 1 15.5 8.6', 1.6, .3);
  svg.append(disc);
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
  else {
    // The symbol raised off the disc: a soft shade under it, then the ink.
    svg.append(el('path', { d: SYMBOLS[L.sym], fill: 'none', stroke: 'rgba(0,0,0,.3)', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(8.4 8.8)' }));
    svg.append(el('path', { d: SYMBOLS[L.sym], fill: 'none', stroke: L.ink, 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(8 8)' }));
  }
  drawFrame(svg, f, tier);
  return h('span', { class: `rk-av f${f}${tier === 4 || f === 1 || f === 4 || f === 5 || f >= 8 || n >= 40 ? ' glow' : ''}` }, svg as unknown as Node, glintLayer(size));
}

// Frames, drawn like jewellery in the characters' flat two-tone style: a metal rim with its deep edge under
// it, a light bevel on the top left and shade on the bottom right; the rare ones (4+) carry a slow moving
// glint (`.rk-glint`, still with reduced motion).
const METAL: Record<string, [string, string, string, string]> = {
  // base, shade, edge, light
  gold: ['#ffcf55', '#d39a26', '#7d5710', '#fff3c2'],
  silver: ['#dfe6ee', '#9eabb8', '#4f5a66', '#ffffff'],
  bronze: ['#eb9a5c', '#b4642f', '#6a3517', '#ffd6b0'],
  emerald: ['#1fbf8f', '#0b7a5c', '#033a29', '#9ff5da'],
  night: ['#3b4a8a', '#24306a', '#0e1433', '#8fa3ff'],
  pearl: ['#fbf6ee', '#d8ccb8', '#8b7d66', '#ffffff'],
};
const P2 = (r: number, a: number) => `${(20 + r * Math.cos(a)).toFixed(2)} ${(20 + r * Math.sin(a)).toFixed(2)}`;
const arc = (r: number, a1: number, a2: number) => `M${P2(r, a1)}A${r} ${r} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${P2(r, a2)}`;
const ringD = (r: number, w: number) => `${circlePath(20, 20, r + w / 2)}${circlePath(20, 20, r - w / 2)}`;
/** A metal band of radius r and width w. */
function rim(r: number, w: number, [base, shade, ed, light]: [string, string, string, string]): string {
  return `<path d="${ringD(r, w)}" fill="${ed}" fill-rule="evenodd" transform="translate(.25 1)"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="${base}" stroke-width="${w}"/>
    <path d="${arc(r + w * .1, -0.15, Math.PI * 0.95)}" fill="none" stroke="${shade}" stroke-width="${w * .55}" stroke-linecap="round"/>
    <path d="${arc(r - w * .05, Math.PI * 1.08, Math.PI * 1.55)}" fill="none" stroke="${light}" stroke-width="${w * .32}" stroke-linecap="round" opacity=".9"/>
    <circle cx="20" cy="20" r="${r - w / 2 + .2}" fill="none" stroke="${ed}" stroke-width=".55" opacity=".55"/>`;
}
const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };
// The glint is not drawn in the frame's SVG: an SVG animation is repainted by the main thread every frame (it kept
// Ranks ~70 % busy on a mid-range phone). drawFrame() notes it here and avatar() lays it over the frame as its own
// layer, which the graphics chip turns.
let glintAt: [number, number] | null = null;
const glint = (r: number, w: number) => { if (!still()) glintAt = [r, w]; return ''; };
function glintLayer(size: number): HTMLElement | null {
  if (!glintAt) return null;
  const [r, w] = glintAt;
  const svg = el('svg', { viewBox: '-4 -4 48 48', width: String(size), height: String(size), overflow: 'visible' });
  svg.innerHTML = `<path d="${arc(r, -Math.PI * .62, -Math.PI * .4)}" fill="none" stroke="#fff" stroke-width="${w * .5}" stroke-linecap="round" opacity=".85"/>`;
  return h('span', { class: 'rk-glint', 'aria-hidden': 'true' }, svg as unknown as Node);
}
const gemAt = (x: number, y: number, r: number, c: string, d: string, ed = '#7d5710') =>
  `<circle cx="${(x + .2).toFixed(2)}" cy="${(y + .5).toFixed(2)}" r="${r + .5}" fill="${ed}"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r + .5}" fill="#ffcf55"/>${two(circlePath(x, y, r), c, d, -r * .35, -r * .35)}<circle cx="${(x - r * .35).toFixed(2)}" cy="${(y - r * .4).toFixed(2)}" r="${(r * .32).toFixed(2)}" fill="#fff" opacity=".9"/>`;
const starD = (x: number, y: number, R: number, k = 4) => {
  const pts: string[] = [];
  for (let i = 0; i < k * 2; i++) { const a = (i * Math.PI) / k - Math.PI / 2, d = i % 2 ? R * .42 : R; pts.push(`${(x + d * Math.cos(a)).toFixed(2)} ${(y + d * Math.sin(a)).toFixed(2)}`); }
  return `M${pts.join('L')}Z`;
};
const metalStar = (x: number, y: number, R: number, m = METAL.gold, k = 4) => `${edge(starD(x, y, R, k), m[2], .7)}${two(starD(x, y, R, k), m[3], m[0], -R * .2, -R * .2)}`;

function frameArt(f: number, tier: number): string {
  const tc = TIER_RING[Math.max(0, Math.min(4, tier))];
  const tierM: [string, string, string, string] = [tc, mix(tc, .28), mix(tc, .58), mix(tc, -.6)];
  const G = METAL.gold;
  switch (f) {
    case 0: return rim(18.6, 2.8, tierM);
    case 1: // glow: a gold band with eight studs, a soft halo outside
      return `<circle cx="20" cy="20" r="21.6" fill="none" stroke="#fff0b0" stroke-width="2.4" opacity=".3"/>${rim(18.6, 3, G)}
        ${Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; return `<circle cx="${(20 + Math.cos(a) * 18.6 + .15).toFixed(2)}" cy="${(20 + Math.sin(a) * 18.6 + .4).toFixed(2)}" r="1.05" fill="${G[2]}"/><circle cx="${(20 + Math.cos(a) * 18.6).toFixed(2)}" cy="${(20 + Math.sin(a) * 18.6).toFixed(2)}" r=".95" fill="${G[3]}"/>`; }).join('')}`;
    case 2: // emerald: a deep green band with a gold inner line and four gems
      return `${rim(18.8, 3.4, METAL.emerald)}<circle cx="20" cy="20" r="16.9" fill="none" stroke="#ffcf55" stroke-width=".7"/>
        ${[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 - Math.PI / 2; return gemAt(20 + Math.cos(a) * 18.8, 20 + Math.sin(a) * 18.8, 1.5, k % 2 ? '#6fe0f5' : '#ff6b7d', k % 2 ? '#1f9cc0' : '#c32a43'); }).join('')}`;
    case 3: // stars: a night band strewn with gold stars
      return `${rim(18.6, 3.2, METAL.night)}${Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2 - Math.PI / 2; return metalStar(20 + Math.cos(a) * 18.6, 20 + Math.sin(a) * 18.6, k % 2 ? 1.6 : 2.4); }).join('')}`;
    case 4: // sun crown: rays behind a gold band
      return `${Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2 - Math.PI / 2, L = k % 2 ? 22.6 : 24.4, w = .13;
          const d = `M${P2(19.5, a - w)}L${P2(L, a)}L${P2(19.5, a + w)}Z`; return `${edge(d, G[2], .7)}${two(d, k % 2 ? G[0] : G[3], G[1], -.5, -.5)}`; }).join('')}
        ${rim(18.6, 3, G)}${glint(18.6, 3)}${gemAt(20, 1.4, 1.6, '#ff8a3d', '#c4541a')}`;
    case 5: case 6: case 7: { // laurel: gold / silver / bronze branches meeting under the disc, a gem at the knot
      const m = [G, METAL.silver, METAL.bronze][f - 5];
      let leaves = '';
      for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
        const deg = 90 + side * (24 + k * 18.5), a = (deg * Math.PI) / 180;
        const x = 20 + Math.cos(a) * 21, y = 20 + Math.sin(a) * 21;
        const rot = `rotate(${(deg - side * 38).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`;
        leaves += `<g transform="${rot}"><ellipse cx="${(x + .3).toFixed(2)}" cy="${(y + .7).toFixed(2)}" rx="1.75" ry="3.3" fill="${m[2]}"/><ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="1.7" ry="3.2" fill="${m[1]}"/><ellipse cx="${(x - .35).toFixed(2)}" cy="${(y - .35).toFixed(2)}" rx="1.25" ry="2.7" fill="${m[0]}"/><path d="M${x.toFixed(2)} ${(y - 2.4).toFixed(2)}V${(y + 2.4).toFixed(2)}" stroke="${m[3]}" stroke-width=".4" opacity=".8"/></g>`;
      }
      return `${leaves}${rim(18.4, 2.6, m)}${glint(18.4, 2.6)}${gemAt(20, 40.4, 1.9, f === 5 ? '#ff6b7d' : f === 6 ? '#6fe0f5' : '#7be38f', f === 5 ? '#c32a43' : f === 6 ? '#1f9cc0' : '#2e9a4a', m[2])}
        ${metalStar(20, -1.2, 2.4, m)}`;
    }
    case 8: // pearls on a fine gold band
      return `${rim(18.6, 1.4, G)}${Array.from({ length: 20 }, (_, k) => { const a = (k / 20) * Math.PI * 2, x = 20 + Math.cos(a) * 19.4, y = 20 + Math.sin(a) * 19.4;
          return `<circle cx="${(x + .2).toFixed(2)}" cy="${(y + .55).toFixed(2)}" r="1.6" fill="${METAL.pearl[2]}" opacity=".7"/>${two(circlePath(x, y, 1.55), METAL.pearl[0], METAL.pearl[1], -.5, -.5)}<circle cx="${(x - .5).toFixed(2)}" cy="${(y - .55).toFixed(2)}" r=".45" fill="#fff"/>`; }).join('')}${glint(19.4, 2.4)}`;
    case 9: { // crescent crown: a gold band, a crescent and star rising over it, two side gems
      const moon = 'M22.4 -4.4a5.4 5.4 0 1 0 0 9.8a4.2 4.2 0 1 1 0 -9.8z';
      return `<circle cx="20" cy="0.6" r="6.4" fill="#fff6da" opacity=".35"/>${rim(18.6, 3, G)}${glint(18.6, 3)}
        ${edge(moon, G[2], .9)}${two(moon, G[3], G[0], -.9, -.9)}${metalStar(23.4, .6, 2, G)}
        ${gemAt(20 + Math.cos(Math.PI * .82) * 18.6, 20 + Math.sin(Math.PI * .82) * 18.6, 1.3, '#a78bfa', '#6d4fd6')}${gemAt(20 + Math.cos(Math.PI * .18) * 18.6, 20 + Math.sin(Math.PI * .18) * 18.6, 1.3, '#a78bfa', '#6d4fd6')}`;
    }
    case 10: { // mosaic: tiles in turquoise, gold and red set in a gold band
      const C = ['#2fc9b0', '#ffcf55', '#ef5a6f'], D = ['#11806f', '#d39a26', '#a92a3e'];
      let t = '';
      for (let k = 0; k < 15; k++) {
        const a1 = (k / 15) * Math.PI * 2 + .05, a2 = ((k + 1) / 15) * Math.PI * 2 - .05, r1 = 17.2, r2 = 21;
        const d = `M${P2(r1, a1)}L${P2(r2, a1)}A${r2} ${r2} 0 0 1 ${P2(r2, a2)}L${P2(r1, a2)}A${r1} ${r1} 0 0 0 ${P2(r1, a1)}Z`;
        t += two(d, C[k % 3], D[k % 3], -.5, -.6);
      }
      return `<path d="${ringD(19.1, 4.6)}" fill="${G[2]}" fill-rule="evenodd" transform="translate(.25 1)"/><path d="${ringD(19.1, 4.6)}" fill="${G[1]}" fill-rule="evenodd"/>${t}
        <circle cx="20" cy="20" r="16.8" fill="none" stroke="${G[0]}" stroke-width=".8"/><circle cx="20" cy="20" r="21.4" fill="none" stroke="${G[0]}" stroke-width=".8"/>${glint(19.1, 3)}`;
    }
    case 11: { // aurora: a band of shifting light
      const gid = `rkf${++uid}`;
      return `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3dd1ad"/><stop offset=".5" stop-color="#8f6ae0"/><stop offset="1" stop-color="#f58da0"/></linearGradient></defs>
        <circle cx="20" cy="20" r="22" fill="none" stroke="url(#${gid})" stroke-width="2" opacity=".3"/>
        <path d="${ringD(18.8, 3.4)}" fill="#1a1440" fill-rule="evenodd" transform="translate(.25 1)"/><circle cx="20" cy="20" r="18.8" fill="none" stroke="url(#${gid})" stroke-width="3.4"/>
        <path d="${arc(18.9, Math.PI * 1.08, Math.PI * 1.55)}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>${glint(18.8, 3.4)}
        ${[[3, 6], [37, 9], [38, 30], [2, 33]].map(([x, y], i) => `<path d="${starD(x, y, i % 2 ? 1.4 : 2)}" fill="#fff" opacity=".9"/>`).join('')}`;
    }
    case 12: { // lanterns: four small glowing lanterns hung on a gold band
      const lantern = (x: number, y: number) => {
        const body = `M${x - 1.9} ${y - 1.6}H${x + 1.9}Q${x + 2.8} ${y + .4} ${x + 1.9} ${y + 2.4}H${x - 1.9}Q${x - 2.8} ${y + .4} ${x - 1.9} ${y - 1.6}Z`;
        return `<circle cx="${x}" cy="${y + .4}" r="4.2" fill="#ffcf55" opacity=".25"/>${edge(`M${x - 1.3} ${y - 3}H${x + 1.3}L${x + 1.9} ${y - 1.6}H${x - 1.9}Z`, G[2], .5)}${two(`M${x - 1.3} ${y - 3}H${x + 1.3}L${x + 1.9} ${y - 1.6}H${x - 1.9}Z`, G[0], G[1], -.3, -.3)}
          ${edge(body, G[2], .6)}${two(body, '#fff2c4', '#f3c873', -.5, -.4)}<path d="M${x} ${y - .6}c.9 1 1 1.7 1 2.2a1 1 0 0 1-2 0c0-.5.1-1.2 1-2.2z" fill="#ff9a2e"/>`;
      };
      return `${rim(18.4, 2.4, G)}${glint(18.4, 2.4)}${[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; return lantern(20 + Math.cos(a) * 19.6, 20 + Math.sin(a) * 19.6); }).join('')}`;
    }
    case 13: { // rosette: gold petals and turquoise points round an emerald band
      let p = '';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2, w = Math.PI / 12, b = a + Math.PI / 8;
        const d1 = `M${P2(19, a - w)}Q${P2(23.2, a - w * .6)} ${P2(25, a)}Q${P2(23.2, a + w * .6)} ${P2(19, a + w)}Z`;
        const d2 = `M${P2(19, b - w * .6)}L${P2(22.6, b)}L${P2(19, b + w * .6)}Z`;
        p += `${edge(d1, G[2], .7)}${two(d1, G[0], G[1], -.5, -.5)}${edge(d2, '#03463a', .6)}${two(d2, '#3ee0c0', '#11806f', -.4, -.4)}`;
      }
      return `${p}${rim(18.6, 2.8, METAL.emerald)}${glint(18.6, 2.8)}`;
    }
    // Frames 14–19 (owner request 2026-11-12, "make Light way more valuable"): limited frames sold for Light, one a week.
    case 14: { // ruby crown: a ruby band, gold crown points along its top, gems between
      const R: [string, string, string, string] = ['#e8435f', '#a91f3a', '#540818', '#ffc2cc'];
      let pts = '';
      for (let k = -2; k <= 2; k++) {
        const a = -Math.PI / 2 + k * .36, tip = k === 0 ? 26.2 : 24.2, w = .12;
        const d = `M${P2(19.6, a - w)}L${P2(tip, a)}L${P2(19.6, a + w)}Z`;
        pts += `${edge(d, G[2], .7)}${two(d, G[3], G[0], -.4, -.4)}<circle cx="${P2(tip + .6, a).split(' ')[0]}" cy="${P2(tip + .6, a).split(' ')[1]}" r="${k === 0 ? 1.2 : .8}" fill="#fff6c9"/>`;
      }
      return `${pts}${rim(18.6, 3.2, R)}${glint(18.6, 3.2)}${[1, 3, 5, 7].map((k) => { const a = (k / 8) * Math.PI * 2; return gemAt(20 + Math.cos(a) * 18.6, 20 + Math.sin(a) * 18.6, 1.2, '#ffd36b', '#d39a26'); }).join('')}`;
    }
    case 15: { // sapphire halo: a deep blue band, a double halo of light and four cut diamonds
      const S: [string, string, string, string] = ['#3c7cf0', '#1f4fb8', '#0b1f55', '#bcd4ff'];
      const cut = (x: number, y: number, r: number) => { const d = `M${x} ${y - r}L${x + r * .8} ${y}L${x} ${y + r}L${x - r * .8} ${y}Z`; return `${edge(d, '#0b1f55', .6)}${two(d, '#eaf3ff', '#8fb5ff', -.3, -.3)}`; };
      return `<circle cx="20" cy="20" r="22.4" fill="none" stroke="#9cc0ff" stroke-width="1" opacity=".45"/><circle cx="20" cy="20" r="23.8" fill="none" stroke="#9cc0ff" stroke-width=".6" opacity=".25"/>
        ${rim(18.6, 3.4, S)}<circle cx="20" cy="20" r="16.7" fill="none" stroke="#e6eefc" stroke-width=".6"/>${glint(18.6, 3.4)}
        ${[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 - Math.PI / 2; return cut(20 + Math.cos(a) * 18.6, 20 + Math.sin(a) * 18.6, 2.6); }).join('')}`;
    }
    case 16: { // rose garden: small roses and leaves round a silver band
      const rose = (x: number, y: number) => `<circle cx="${(x + .2).toFixed(2)}" cy="${(y + .5).toFixed(2)}" r="2.1" fill="#7a1534"/>${two(circlePath(x, y, 2), '#ff8fb0', '#d94a77', -.5, -.5)}
        <path d="M${(x - .9).toFixed(2)} ${y.toFixed(2)}a.9 .9 0 1 1 1.8 0a.6 .6 0 1 1 -1.2 0" fill="none" stroke="#a82352" stroke-width=".45"/>`;
      const leaf = (x: number, y: number, a: number) => `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx=".9" ry="1.8" fill="#3aa86b" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
      let p = '';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2, b = a + Math.PI / 8;
        p += leaf(20 + Math.cos(b) * 19.4, 20 + Math.sin(b) * 19.4, b) + rose(20 + Math.cos(a) * 19.2, 20 + Math.sin(a) * 19.2);
      }
      return `${rim(18.6, 2.2, METAL.silver)}${glint(18.6, 2.2)}${p}`;
    }
    case 17: { // dawn: a rose-gold band with a small rising sun and pearls
      const RG: [string, string, string, string] = ['#f4b39a', '#cf7c62', '#6f3324', '#fff0e6'];
      const sun = `M${P2(4.2, Math.PI)}A4.2 4.2 0 0 1 ${P2(4.2, 0)}Z`;
      let rays = '';
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k + .5) * (Math.PI / 7); rays += `<path d="M${(20 + Math.cos(a) * 5.2).toFixed(2)} ${(1 + Math.sin(a) * 5.2).toFixed(2)}L${(20 + Math.cos(a) * 7.4).toFixed(2)} ${(1 + Math.sin(a) * 7.4).toFixed(2)}" stroke="#ffd36b" stroke-width=".8" stroke-linecap="round"/>`; }
      return `<circle cx="20" cy="1" r="8" fill="#ffd9a8" opacity=".35"/>${rays}<g transform="translate(16 -3)">${edge(sun, '#c4541a', .7)}${two(sun, '#ffe38a', '#ff9a3d', -.4, -.4)}</g>
        ${rim(18.6, 3, RG)}${glint(18.6, 3)}${[2, 4, 6, 8, 10].map((k) => { const a = (k / 12) * Math.PI * 2 - Math.PI / 2; const x = 20 + Math.cos(a) * 18.6, y = 20 + Math.sin(a) * 18.6;
          return `${two(circlePath(x, y, 1.2), METAL.pearl[0], METAL.pearl[1], -.4, -.4)}<circle cx="${(x - .4).toFixed(2)}" cy="${(y - .4).toFixed(2)}" r=".35" fill="#fff"/>`; }).join('')}`;
    }
    case 18: { // jade arches: a jade band with six gold mihrab arches standing on it
      const J: [string, string, string, string] = ['#5fcf9f', '#2f9a6c', '#0f4a31', '#d4fbe8'];
      let a6 = '';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2, deg = (a * 180) / Math.PI + 90;
        const x = 20 + Math.cos(a) * 21.4, y = 20 + Math.sin(a) * 21.4;
        const d = `M${(x - 1.7).toFixed(2)} ${(y + 1.6).toFixed(2)}V${(y - .2).toFixed(2)}Q${(x - 1.7).toFixed(2)} ${(y - 2.2).toFixed(2)} ${x.toFixed(2)} ${(y - 2.9).toFixed(2)}Q${(x + 1.7).toFixed(2)} ${(y - 2.2).toFixed(2)} ${(x + 1.7).toFixed(2)} ${(y - .2).toFixed(2)}V${(y + 1.6).toFixed(2)}Z`;
        a6 += `<g transform="rotate(${deg.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})">${edge(d, G[2], .6)}${two(d, G[0], G[1], -.3, -.3)}<path d="M${(x - .8).toFixed(2)} ${(y + 1.6).toFixed(2)}V${(y - .1).toFixed(2)}Q${x.toFixed(2)} ${(y - 1.5).toFixed(2)} ${(x + .8).toFixed(2)} ${(y - .1).toFixed(2)}V${(y + 1.6).toFixed(2)}Z" fill="#0f4a31"/></g>`;
      }
      return `${a6}${rim(18.6, 3.2, J)}${glint(18.6, 3.2)}`;
    }
    case 19: { // diamond: a white-gold band set all round with cut stones that catch the light
      let st = '';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 - Math.PI / 2, x = 20 + Math.cos(a) * 18.8, y = 20 + Math.sin(a) * 18.8, r = k % 3 ? 1.5 : 2.2;
        const d = `M${x.toFixed(2)} ${(y - r).toFixed(2)}L${(x + r).toFixed(2)} ${y.toFixed(2)}L${x.toFixed(2)} ${(y + r).toFixed(2)}L${(x - r).toFixed(2)} ${y.toFixed(2)}Z`;
        st += `${edge(d, '#4f5a66', .55)}${two(d, '#ffffff', '#b9e6ff', -.3, -.3)}<path d="M${(x - r * .5).toFixed(2)} ${y.toFixed(2)}H${(x + r * .5).toFixed(2)}" stroke="#7cc7f2" stroke-width=".3"/>`;
      }
      return `<circle cx="20" cy="20" r="22.6" fill="none" stroke="#dff4ff" stroke-width="1.2" opacity=".35"/>${rim(18.8, 2.6, METAL.silver)}${glint(18.8, 2.6)}${st}`;
    }
    default: return rim(18.6, 2.8, tierM);
  }
}
function drawFrame(svg: Element, f: number, tier: number) {
  glintAt = null;
  const g = el('g', { class: `rk-frame${f >= 4 ? ' rare' : ''}` });
  g.innerHTML = frameArt(f, tier);
  svg.append(g);
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

/** A trophy cup in gold, silver or bronze (place 1–3), or a rising arrow for a week that only moved up.
 *  Flat two-tone like the characters: a chunky cup with handles, a star, and the place on the plinth. */
const CUPS: [string, string, string, string][] = [
  // base, shade, edge, light
  ['#ffd25e', '#e09a1f', '#a8650e', '#fff3c2'],
  ['#eef2f6', '#aab5c3', '#6f7b8a', '#ffffff'],
  ['#f2a76a', '#c26d36', '#7f4220', '#ffd9b8'],
];
export function trophy(place: number | null, size = 28): HTMLElement {
  const svg = el('svg', { viewBox: '0 0 48 48', width: String(size), height: String(size), 'aria-hidden': 'true' });
  if (place) {
    const [b, sh, ed, li] = CUPS[Math.max(0, Math.min(2, place - 1))];
    const cup = 'M12 6H36V16Q36 29 24 30.5Q12 29 12 16Z';
    const plinth = 'M12 37.5Q12 36 13.5 36H34.5Q36 36 36 37.5V43Q36 44.5 34.5 44.5H13.5Q12 44.5 12 43Z';
    svg.innerHTML = `
      <path d="M13 10H7.5Q6 10 6 12V13.5Q6 21 14 22.5M35 10H40.5Q42 10 42 12V13.5Q42 21 34 22.5" fill="none" stroke="${ed}" stroke-width="4.4" stroke-linecap="round" transform="translate(0 1.5)"/>
      <path d="M13 10H7.5Q6 10 6 12V13.5Q6 21 14 22.5M35 10H40.5Q42 10 42 12V13.5Q42 21 34 22.5" fill="none" stroke="${sh}" stroke-width="4.4" stroke-linecap="round"/>
      <path d="M13 10H8.5Q7 10 7 12V13Q7 19.5 13.5 21" fill="none" stroke="${b}" stroke-width="2" stroke-linecap="round" opacity=".9"/>
      ${two('M20.5 29H27.5L28.5 36H19.5Z', b, sh, -1.5, 0)}
      ${edge(cup, ed, 2)}${two(cup, b, sh, -3, -2.5)}
      <rect x="10.5" y="6.2" width="27" height="3.6" rx="1.8" fill="${sh}"/><rect x="10.5" y="4.8" width="27" height="3.6" rx="1.8" fill="${li}"/>
      ${shine('M15.5 12.5V17.5Q16 22 19 25', 2.2, .55)}
      <path d="M24 10.6L26.1 14.9L30.8 15.5L27.4 18.8L28.2 23.4L24 21.2L19.8 23.4L20.6 18.8L17.2 15.5L21.9 14.9Z" fill="${li}"/>
      ${edge(plinth, ed, 2.4)}${two(plinth, b, sh, -2, -2)}
      <rect x="16.5" y="36.6" width="15" height="6.8" rx="2" fill="${ed}"/>
      <text x="24" y="42.3" text-anchor="middle" font-size="7.6" font-weight="900" font-family="Nunito, system-ui, sans-serif" fill="${li}">${place}</text>`;
  } else {
    const arrow = 'M24 6L39 22H30.5V40Q30.5 42 28.5 42H19.5Q17.5 42 17.5 40V22H9Z';
    svg.innerHTML = `${edge(arrow, '#0a5a46', 2)}${two(arrow, '#5fe0bf', '#1fa486', -3, -3)}${shine('M21 37V24', 2.4, .45)}`;
  }
  return h('span', { class: 'rk-trophy-ic' }, svg as unknown as Node);
}
