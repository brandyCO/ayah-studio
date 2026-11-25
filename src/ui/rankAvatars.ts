// Ranks avatars (owner decision 2026-11-09: no photos, so nothing to moderate and no faces), drawn here.
// 0–23 free: 12 symbols on two sets of colours. 24–31 from the shop: gold on night. 32–35 the Sun tier's
// (cannot be bought): white on gold with rays. 36–39 champions, for weeks won at #1: gold on emerald.
// Frames: 0 the tier's ring, 1 glow, 2 emerald double, 3 stars (shop); 4 sun crown (Sun tier); 5 / 6 / 7
// gold / silver / bronze laurel (a week won at #1 / #2 / #3). A private player gets a plain disc.
// Weekly prizes (rank_prize_item): 40–51 jewels for a week's #1; frames 8 pearls, 9 crescent crown,
// 10 mosaic, 11 aurora, 12 lanterns, 13 rosette for its #2 and #3.
import { h } from './dom';
import { tr } from '../i18n';
import { bustMarkup, parse } from './figure';
import { decorated } from './deco/deco';
import { circlePath, edge, mix, shine, starPath, two } from './flat';

export const AVATARS = 58;
export const FRAMES = 38;
export const TIER_RING = ['#c47a4c', '#a9b0f2', '#5fcfc0', '#e891aa', '#f2c14e']; // Dar al-Arqam clay, Hijrah night, Badr water, Al-Khandaq dusk, Fath Makkah gold
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
type Kind = 'free' | 'shop' | 'sun' | 'champ' | 'jewel' | 'prem';
function look(n: number): { a: string; b: string; sym: number; kind: Kind; n: number } {
  if (n >= 52) { const [a, b] = PREM_BG[n - 52]; return { a, b, sym: 0, kind: 'prem', n }; }
  if (n >= 40) { const [a, b] = JEWELS[n - 40]; return { a, b, sym: [1, 2, 0, 3, 7, 10, 8, 11, 5, 4, 6, 9][n - 40], kind: 'jewel', n }; }
  if (n < 24) { const hh = (n * 47 + (n >= 12 ? 23 : 0)) % 360; return { a: `hsl(${hh} 48% 40%)`, b: `hsl(${(hh + 30) % 360} 52% 24%)`, sym: n % 12, kind: 'free', n }; }
  if (n < 32) { const hh = 200 + (n - 24) * 18; return { a: `hsl(${hh} 52% 26%)`, b: `hsl(${hh + 20} 56% 10%)`, sym: [0, 1, 2, 3, 7, 8, 10, 11][n - 24], kind: 'shop', n }; }
  if (n < 36) return { a: '#ffd25e', b: '#e08a12', sym: [10, 2, 1, 7][n - 32], kind: 'sun', n };
  return { a: '#14805f', b: '#03271d', sym: [2, 0, 8, 1][n - 36], kind: 'champ', n };
}

// The emblems (owner request 2026-11-13, "make every item irresistible"): solid two-tone shapes in a 24 box
// (centre 12 12), raised off the medallion like enamel, with small warm details (a flame, dates, a sun).
type Glyph = { d: string; extra?: (ink: Ink) => string; line?: boolean };
type Ink = { base: string; shade: string; edge: string; light: string };
const flameD = 'M12 11.2c1.3 1.5 1.6 2.6 1.6 3.3a1.6 1.6 0 0 1-3.2 0c0-.7.3-1.8 1.6-3.3z';
const GLYPHS: Glyph[] = [
  { // lantern: a cap and ring, a glowing window with its flame
    d: 'M10.6 1.8h2.8v2h-2.8zM8.4 4.2h7.2l1.5 2.6H6.9zM7.4 7.3h9.2l1.4 2.8v5.4l-1.4 2.8H7.4L6 15.5v-5.4zM8.6 18.8h6.8l-.9 2.2H9.5z',
    extra: () => `<path d="M9.2 9.4h5.6v7.2H9.2z" fill="#ffe7a3"/><path d="M9.2 9.4h5.6v2H9.2z" fill="#fff6d6"/><path d="${flameD}" fill="#ff9a2e"/><path d="M12 13c.5.6.6 1 .6 1.3a.6.6 0 0 1-1.2 0c0-.3.1-.7.6-1.3z" fill="#fff2b8"/>`,
  },
  { // crescent with a star
    d: 'M14.6 2.4a9.6 9.6 0 1 0 7 15.8A8.1 8.1 0 0 1 14.6 2.4z',
    extra: (k) => `<path d="${starD(18.4, 7, 2.8)}" fill="${k.edge}" transform="translate(0 .7)"/><path d="${starD(18.4, 7, 2.8)}" fill="${k.light}"/>`,
  },
  { // eight-pointed star (khatam) with a heart
    d: 'M6.2 6.2h11.6v11.6H6.2zM12 3.8l8.2 8.2-8.2 8.2-8.2-8.2z',
    extra: (k) => `<circle cx="12" cy="12" r="3.2" fill="${k.edge}"/><circle cx="12" cy="12" r="1.7" fill="${k.light}"/>`,
  },
  { // palm with dates
    d: 'M11.1 21.6l.5-10h.8l.5 10zM12 11.5C9.5 8 6 7.8 3.2 9.6c3.2-.4 6 .5 8.8 1.9zM12 11.5C14.5 8 18 7.8 20.8 9.6c-3.2-.4-6 .5-8.8 1.9zM12 11.5C10.8 7.5 8.5 5 5.4 4.6c2.6 1.4 4.6 3.8 6.6 6.9zM12 11.5C13.2 7.5 15.5 5 18.6 4.6c-2.6 1.4-4.6 3.8-6.6 6.9zM12 11.5c-3 .2-5.6 2-6.6 5 1.6-2.2 4-3.6 6.6-5zM12 11.5c3 .2 5.6 2 6.6 5-1.6-2.2-4-3.6-6.6-5z',
    extra: () => `${[[10.9, 12.9], [13.1, 12.9], [12, 14]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#c0612a"/><circle cx="${x - .3}" cy="${y - .3}" r=".35" fill="#ffc28a"/>`).join('')}`,
  },
  { // dunes under a low sun
    d: 'M1.6 19.4c2.6-4.6 5.6-6.2 8.8-4.6 2.6 1.3 4.4 1 6.2-.6 1.8-1.6 3.4-2.4 5.8-2.2v9.2H1.6z',
    extra: (k) => `<circle cx="16.8" cy="7" r="3.4" fill="#ffc94d"/><circle cx="16" cy="6.2" r="1.2" fill="#fff3c2"/><path d="M1.6 21.2c3-2.6 7-3.6 11-2.4 3.4 1 6.4.6 9.8-.8v3.2z" fill="${k.shade}"/>`,
  },
  { // waves under a star
    d: 'M2 13.2c2-2.8 4-2.8 6 0s4 2.8 6 0 4-2.8 6 0M2 18.2c2-2.8 4-2.8 6 0s4 2.8 6 0 4-2.8 6 0', line: true,
    extra: (k) => `<path d="${starD(12, 6, 2.8)}" fill="${k.light}"/>`,
  },
  { // mountains with snow
    d: 'M1.4 20.4l6.8-11.6 3.6 5.8 3.1-4.7 7.7 10.5z',
    extra: () => `<path d="M8.2 8.8l2.2 3.6-1.2-.5-1 1-1-1-1.2.5z" fill="#fff"/><path d="M14.9 9.9l1.8 2.5-1-.3-.8.7-.8-.7-1 .3z" fill="#fff"/>`,
  },
  { // dome with its crescent finial
    d: 'M5 18.6v-5.2a7 7 0 0 1 14 0v5.2zM11.4 3.6h1.2v3.2h-1.2zM2.8 18.4h18.4v2.8H2.8z',
    extra: (k) => `<path d="M10.3 18.4v-2.8a1.7 1.7 0 0 1 3.4 0v2.8z" fill="${k.edge}"/><path d="M12.9 1.2a1.6 1.6 0 1 0 0 2.6 1.3 1.3 0 1 1 0-2.6z" fill="${k.light}"/>`,
  },
  { // mihrab arch
    d: 'M5.4 21V11.6C5.4 7.6 8.8 4.5 12 2.8c3.2 1.7 6.6 4.8 6.6 8.8V21zM2.8 19.6h18.4v2H2.8z',
    extra: (k) => `<path d="M8.8 20v-6.8c0-2.1 1.5-3.9 3.2-4.9 1.7 1 3.2 2.8 3.2 4.9V20z" fill="${k.edge}"/><circle cx="12" cy="13.8" r="1.4" fill="#ffd36b"/>`,
  },
  { // rahl with an open mushaf
    d: 'M6.6 20.6l10.2-9.4 1.3 1.4-10.2 9.4zM17.4 20.6L7.2 11.2l-1.3 1.4 10.2 9.4z',
    extra: () => `<path d="M12 12.6L3.8 8.4V6.6L12 10.8l8.2-4.2v1.8z" fill="#0f6b4f"/><path d="M12 10.8L4.6 7V5.4L12 9.2z" fill="#fffaf0"/><path d="M12 10.8l7.4-3.8V5.4L12 9.2z" fill="#efe4cc"/><path d="M12 9.2v1.6" stroke="#c9b48a" stroke-width=".4"/>`,
  },
  { // sun: a core and eight rays
    d: `${circlePath(12, 12, 4.8)}${Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2 - Math.PI / 2, w = .3; const P = (r: number, t: number) => `${(12 + r * Math.cos(t)).toFixed(2)} ${(12 + r * Math.sin(t)).toFixed(2)}`; return `M${P(6.2, a - w)}L${P(k % 2 ? 9.4 : 10.8, a)}L${P(6.2, a + w)}Z`; }).join('')}`,
    extra: (k) => `<circle cx="12" cy="12" r="2.6" fill="${k.light}" opacity=".85"/>`,
  },
  { // drop with its light
    d: 'M12 2.4c4.6 5.6 7.2 9.3 7.2 12.6a7.2 7.2 0 0 1-14.4 0c0-3.3 2.6-7 7.2-12.6z',
    extra: () => `<path d="M8.6 14.4a3.4 3.4 0 0 0 2.4 3.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".8"/>`,
  },
];
/** Like flat.ts's two(), but the shifted base is clipped to the shape where it stands (no spill past the edge). */
function twoIn(d: string, base: string, shade: string, dx: number, dy: number, lit = false): string {
  const id = `rkc${++uid}`;
  // `lit`: light from the top left over the base, deepening to the bottom right (item-art pass 2026-11-24).
  const g = lit ? `<linearGradient id="${id}l" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>` : '';
  return `${g}<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${shade}"/><g clip-path="url(#${id})"><path d="${d}" fill="${base}" transform="translate(${dx} ${dy})"/>${lit ? `<path d="${d}" fill="url(#${id}l)" transform="translate(${dx} ${dy})"/>` : ''}</g>`;
}
function emblem(sym: number, k: Ink, scale: number): string {
  const g = GLYPHS[sym];
  const body = g.line
    ? `<path d="${g.d}" fill="none" stroke="${k.edge}" stroke-width="2.8" stroke-linecap="round" transform="translate(0 1)"/><path d="${g.d}" fill="none" stroke="${k.shade}" stroke-width="2.8" stroke-linecap="round"/><path d="${g.d}" fill="none" stroke="${k.base}" stroke-width="1.7" stroke-linecap="round" transform="translate(-.25 -.35)"/>`
    : `${edge(g.d, k.edge, 1)}${twoIn(g.d, k.base, k.shade, -.7, -.7, true)}<path d="${g.d}" fill="none" stroke="${k.edge}" stroke-width=".55" stroke-linejoin="round" opacity=".7"/>`;
  // Item-art pass (2026-11-24): a soft light behind the emblem, so it glows off the enamel.
  const gid = `rkg${++uid}`;
  const halo = `<radialGradient id="${gid}"><stop offset="0" stop-color="${k.light}" stop-opacity=".7"/><stop offset=".55" stop-color="${k.light}" stop-opacity=".22"/><stop offset="1" stop-color="${k.light}" stop-opacity="0"/></radialGradient><circle cx="12" cy="12" r="13.5" fill="url(#${gid})"/>`;
  return `<g transform="translate(20 20) scale(${scale}) translate(-12 -12)">${halo}${body}${g.extra?.(k) ?? ''}</g>`;
}
const INK_WHITE: Ink = { base: '#ffffff', shade: '#d7dde6', edge: 'rgba(0,0,0,.32)', light: '#fff6da' };
const INK_GOLD: Ink = { base: '#ffd766', shade: '#d9951f', edge: '#5a3a06', light: '#fff3c2' };
const D2 = (r: number, a: number) => `${(20 + r * Math.cos(a)).toFixed(2)} ${(20 + r * Math.sin(a)).toFixed(2)}`;
const beads = (r: number, n: number, c: string, rr = .7, off = 0) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 + off; return `<circle cx="${D2(r, a).split(' ')[0]}" cy="${D2(r, a).split(' ')[1]}" r="${rr}" fill="${c}"/>`; }).join('');
/** The girih: two interlaced squares and a ring, faint, behind the emblem. */
const girih = (c: string, o: number, r = 14.6) => `<g fill="none" stroke="${c}" stroke-width=".7" opacity="${o}"><path d="M${D2(r, -Math.PI / 4)}L${D2(r, Math.PI / 4)}L${D2(r, Math.PI * .75)}L${D2(r, -Math.PI * .75)}Z"/><path d="M${D2(r, 0)}L${D2(r, Math.PI / 2)}L${D2(r, Math.PI)}L${D2(r, -Math.PI / 2)}Z"/><circle cx="20" cy="20" r="${(r * .62).toFixed(2)}"/></g>`;

/** The medallion behind the emblem, by kind. */
function medallion(L: ReturnType<typeof look>): string {
  // Item-art pass (2026-11-24): every medallion is lit like a polished disc and set in a bevelled rim.
  const id = `rkm${++uid}`;
  const rim = `<clipPath id="${id}"><circle cx="20" cy="20" r="17"/></clipPath>`
    + `<ellipse cx="17" cy="9.6" rx="12.5" ry="6" fill="#fff" opacity=".16" clip-path="url(#${id})"/>`
    + `<path d="M31.2 25.6A13.6 13.6 0 0 1 25.6 31.2" stroke="#000" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".22"/>`
    + `<circle cx="20" cy="20" r="16.3" fill="none" stroke="#000" stroke-width="1.4" opacity=".3"/><path d="M6.2 17.4A14 14 0 0 1 17.4 6.2" stroke="#fff" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".7"/>`
    + `<circle cx="20" cy="20" r="16.9" fill="none" stroke="#fff" stroke-width=".35" opacity=".4"/>`;
  return kindArt(L) + rim;
}
function kindArt(L: ReturnType<typeof look>): string {
  const disc = twoIn(circlePath(20, 20, 17), L.a, L.b, -3, -3, true);
  const gloss = shine('M8.6 15.5A12.5 12.5 0 0 1 15.5 8.6', 1.6, .3);
  switch (L.kind) {
    case 'free':
      return `${disc}<circle cx="20" cy="20" r="14.4" fill="none" stroke="#fff" stroke-width=".6" opacity=".22"/>${gloss}${emblem(L.sym, INK_WHITE, 1.02)}`;
    case 'shop': {
      // Night enamel: a gold khatam, a ring of gold beads, a few stars, the emblem in raised gold.
      let st = '';
      for (const [x, y, r] of [[11, 12, 1], [29.5, 13, .8], [12.5, 28.5, .7], [28, 29, 1.1], [20, 7.5, .6]] as const) st += `<path d="${starD(x, y, r * 1.6)}" fill="#fff3c2" opacity=".8"/>`;
      return `${disc}${girih('#ffcf55', .3)}${beads(15.2, 24, '#ffcf55', .45)}${st}${gloss}${emblem(L.sym, INK_GOLD, .94)}`;
    }
    case 'sun': {
      // A sunburst: sixteen wedges in two golds, a glowing centre, the emblem in white.
      let w = '';
      for (let k = 0; k < 16; k++) { const a1 = (k / 16) * Math.PI * 2, a2 = ((k + 1) / 16) * Math.PI * 2; w += `<path d="M20 20L${D2(17, a1)}A17 17 0 0 1 ${D2(17, a2)}Z" fill="${k % 2 ? '#ffc23d' : '#ffe08a'}"/>`; }
      return `${disc}<g opacity=".9">${w}</g><circle cx="20" cy="20" r="10.5" fill="#fff3c2" opacity=".75"/>${beads(15.4, 16, '#fff', .55, Math.PI / 16)}${gloss}${emblem(L.sym, { base: '#ffd23f', shade: '#f08a12', edge: '#8a4206', light: '#fff3c2' }, .9)}`;
    }
    case 'champ':
      // Emerald and gold: a gold khatam filled faintly, a double bead ring, the emblem in raised gold.
      return `${disc}<path d="M${D2(15, -Math.PI / 4)}L${D2(15, Math.PI / 4)}L${D2(15, Math.PI * .75)}L${D2(15, -Math.PI * .75)}ZM${D2(15, 0)}L${D2(15, Math.PI / 2)}L${D2(15, Math.PI)}L${D2(15, -Math.PI / 2)}Z" fill="#ffcf55" opacity=".12"/>${girih('#ffcf55', .45, 15)}${beads(16, 8, '#ffcf55', 1, Math.PI / 8)}${gloss}${emblem(L.sym, INK_GOLD, .88)}`;
    case 'jewel': {
      // A cut stone: a light table in the middle, sixteen facets round it in three tones, sparkles.
      const lt = mix(L.a, -.35), dk = mix(L.a, .25);
      let f = '';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8, b = a + Math.PI / 8, c = a + Math.PI / 4;
        f += `<path d="M${D2(9, a)}L${D2(17, b)}L${D2(9, c)}Z" fill="${k < 3 || k === 7 ? lt : dk}"/><path d="M${D2(9, a)}L${D2(17, a)}L${D2(17, b)}Z" fill="${k < 4 ? L.a : L.b}" opacity=".85"/><path d="M${D2(9, c)}L${D2(17, b)}L${D2(17, c)}Z" fill="${k > 1 && k < 6 ? L.b : L.a}" opacity=".7"/>`;
      }
      const table = Array.from({ length: 8 }, (_, k) => D2(9, (k / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8)).join('L');
      const ink = n40Ink(L.a);
      return `${disc}${f}<path d="M${table}Z" fill="${lt}"/><path d="M${table}Z" fill="${L.a}" opacity=".35"/>
        <path d="M${D2(9, -Math.PI * .875)}L${D2(9, -Math.PI * .625)}L${D2(6, -Math.PI * .75)}Z" fill="#fff" opacity=".55"/>
        <ellipse cx="13" cy="10.8" rx="4.4" ry="2" fill="#fff" opacity=".4" transform="rotate(-35 13 10.8)"/>${emblem(L.sym, ink, .7)}
        <path d="${starD(29.5, 9.5, 3)}" fill="#fff"/><path d="${starD(10, 29, 1.8)}" fill="#fff" opacity=".85"/>`;
    }
    case 'prem':
      return premium(L.n);
  }
}
const n40Ink = (a: string): Ink => (/^#(fbf6ee|cfe6f2|dfe4f0)$/i.test(a) ? { base: '#d9a53a', shade: '#a8721a', edge: '#5a3a06', light: '#fff3c2' } : INK_GOLD);

// --- Legendary (52–54) and mythic (55–57) avatars (item-art pass 2026-11-24, docs/item-art.md): whole little scenes
// in the disc, lit and outlined; glows are radial gradients. Twinkles (.rk-tw) move only on a live avatar.
const PREM_BG: [string, string][] = [['#6a2f80', '#1a0a2a'], ['#f2905e', '#3a1240'], ['#23946b', '#062a1e'],
  ['#3e2d96', '#0a0826'], ['#5b3fc4', '#0b0a2e'], ['#2f58bd', '#06102e']];
const rg = (x: number, y: number, r: number, c: string, o: number, ry = r) => {
  const id = `rkg${++uid}`;
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset=".5" stop-color="${c}" stop-opacity="${(o * .3).toFixed(3)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${ry}" fill="url(#${id})"/>`;
};
const tw = (x: number, y: number, r: number, c = '#fff', d = 0) => `<path class="rk-tw" style="animation-delay:-${d}s" d="${starD(x, y, r)}" fill="${c}"/>`;
const dots = (pts: number[][], c = '#fff') => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
const crescent = (x: number, y: number, r: number) => {
  const px = (x + r * .5).toFixed(2), t = (y - r * .866).toFixed(2), b = (y + r * .866).toFixed(2), r2 = (r * .78).toFixed(2);
  return `M${px} ${t}A${r} ${r} 0 1 0 ${px} ${b}A${r2} ${r2} 0 0 1 ${px} ${t}Z`;
};
const k8 = (x: number, y: number, R: number, r: number) => 'M' + Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 - Math.PI / 2, k = i % 2 ? r : R;
  return `${(x + Math.cos(a) * k).toFixed(2)} ${(y + Math.sin(a) * k).toFixed(2)}`;
}).join('L') + 'Z';
/** A fanous at (x, y) of height h: cap, glowing panes, base. */
function fanous(x: number, y: number, hgt: number, glass = ['#ff6b81', '#4fe0d0', '#ffd25e']): string {
  const k = hgt / 20, P = (dx: number, dy: number) => `${(x + dx * k).toFixed(2)} ${(y + dy * k).toFixed(2)}`;
  const body = `M${P(-5, -4)}L${P(5, -4)}L${P(6.4, 0)}L${P(5, 6)}L${P(-5, 6)}L${P(-6.4, 0)}Z`;
  return rg(x, y + k, 11 * k, '#ffd36b', .8)
    + `<path d="M${P(0, -10)}V${P(0, -8)}" stroke="#a8740f" stroke-width="${(.8 * k).toFixed(2)}"/>`
    + twoIn(`M${P(-3, -8)}L${P(3, -8)}L${P(5.4, -4)}L${P(-5.4, -4)}Z`, '#ffd766', '#b8780f', -.4 * k, -.4 * k, true)
    + twoIn(body, '#ffd766', '#b8780f', -.5 * k, -.5 * k, true)
    + [[-4.4, -2.6, -1.5], [-1.4, 1.4, 1.5], [1.6, 4.4, 1.5]].map(([a, b], i) => `<path d="M${P(a, -2.6)}L${P(b, -2.6)}L${P(b, 4.6)}L${P(a, 4.6)}Z" fill="${glass[i]}" opacity=".9"/>`).join('')
    + `<path d="M${P(-1.2, -1)}L${P(1.2, -1)}L${P(1.2, 3.4)}L${P(-1.2, 3.4)}Z" fill="#fff6d6"/>`
    + twoIn(`M${P(-4, 6)}L${P(4, 6)}L${P(2.4, 9)}L${P(-2.4, 9)}Z`, '#ffd766', '#b8780f', -.4 * k, -.4 * k, true)
    + `<path d="${body}" fill="none" stroke="#6a3c06" stroke-width="${(.45 * k).toFixed(2)}" stroke-linejoin="round"/>`;
}
function premium(n: number): string {
  const [a, b] = PREM_BG[n - 52];
  const cid = `rkp${++uid}`;
  const disc = twoIn(circlePath(20, 20, 17), a, b, -3, -3, true);
  let art = '';
  switch (n) {
    case 52: // Lantern of Andalus: a great fanous glowing under a horseshoe arch, stars round it.
      art = `<path d="M7 38V20a13 13.6 0 0 1 26 0v18h-3V20.6a10 10.6 0 0 0-20 0V38z" fill="#2a0c3a" opacity=".55"/>`
        + `<path d="M9.6 21a10.4 11 0 0 1 20.8 0" stroke="#ffcf55" stroke-width=".6" fill="none" opacity=".7"/>`
        + fanous(20, 20, 20) + tw(9.5, 11, 1.6, '#fff6d6') + tw(30.5, 12.5, 1.3, '#fff6d6', 1.2) + dots([[13, 7.5, .4], [27, 7, .35], [32.5, 22, .35]]);
      break;
    case 53: // Desert moonrise: a huge moon over the dunes, two palms dark against it.
      art = rg(20, 17, 15, '#fff1c8', .75) + `<circle cx="20" cy="17" r="8.4" fill="#fff4d8"/><circle cx="17.4" cy="14.6" r="1.6" fill="#f2dcb0" opacity=".7"/><circle cx="22.6" cy="19.6" r="1.1" fill="#f2dcb0" opacity=".6"/>`
        + `<path d="M3 27c5-4 10-4.6 15-2.4 5 2.2 10 1.6 19-2v16H3z" fill="#b8562f"/><path d="M3 31c6-3 12-2.6 18-.6 6 2 11 1 16-1v9H3z" fill="#7a2f22"/>`
        + `<path d="M28 27l.5-8.6h.6l.5 8.6zM28.8 18.4c-1.8-2.6-4.4-2.8-6.2-1.4 2.2-.2 4.2.5 6.2 1.4zm0 0c1.8-2.6 4.4-2.8 6.2-1.4-2.2-.2-4.2.5-6.2 1.4zm0 0c-.8-2.8-2.4-4.4-4.6-4.8 1.8 1 3.2 2.6 4.6 4.8zm0 0c.8-2.8 2.4-4.4 4.6-4.8-1.8 1-3.2 2.6-4.6 4.8z" fill="#3a1424"/>`
        + `<path d="M10 28.6l.4-6.4h.5l.4 6.4zM10.6 22.2c-1.4-2-3.4-2.2-4.8-1.1 1.7-.1 3.2.4 4.8 1.1zm0 0c1.4-2 3.4-2.2 4.8-1.1-1.7-.1-3.2.4-4.8 1.1zm0 0c-.6-2.1-1.8-3.4-3.5-3.7 1.4.8 2.4 2 3.5 3.7zm0 0c.6-2.1 1.8-3.4 3.5-3.7-1.4.8-2.4 2-3.5 3.7z" fill="#3a1424"/>`
        + tw(8, 10, 1.4, '#fff6d6', .4) + tw(31, 8.6, 1.1, '#fff6d6', 1.5);
      break;
    case 54: // Rose of Andalus: one great rose in layered petals, jasmine and leaves on a faint gold khatam.
      art = `<path d="${k8(20, 20, 15, 11)}" fill="none" stroke="#ffcf55" stroke-width=".6" opacity=".45"/>` + rg(20, 20, 13, '#ffd3e0', .55)
        + [[-1, 1], [1, 1]].map(([m]) => twoIn(`M20 22c${7 * m} -2 ${11 * m} 1 ${12 * m} 6c${-5 * m} 1 ${-9 * m} -1 ${-12 * m} -6z`, '#3fbf7a', '#14683e', -.4, -.4, true)).join('')
        + twoIn(circlePath(20, 19, 8), '#e8526a', '#8e1a32', -1, -1, true)
        + twoIn('M13.6 19.6c.6-4.4 3.4-6.6 6.4-6.6s5.8 2.2 6.4 6.6c-2-2.4-4-3.4-6.4-3.4s-4.4 1-6.4 3.4z', '#f27088', '#a82a40', -.4, -.4, true)
        + twoIn(circlePath(20, 19.6, 4.2), '#d93a54', '#7a1028', -.5, -.5, true)
        + `<path d="M17.6 19.4c1-1.6 3.8-1.6 4.8 0M18.4 21c.8.9 2.4.9 3.2 0" stroke="#7a1028" stroke-width=".55" fill="none" stroke-linecap="round"/>`
        + [[8.6, 12], [31, 13], [10, 29], [30.4, 28]].map(([x, y]) => [0, 1, 2, 3, 4].map((i) => { const t = (i / 5) * Math.PI * 2; return `<circle cx="${(x + Math.cos(t) * 1.3).toFixed(2)}" cy="${(y + Math.sin(t) * 1.3).toFixed(2)}" r=".95" fill="#fffdf6"/>`; }).join('') + `<circle cx="${x}" cy="${y}" r=".55" fill="#f2c14e"/>`).join('')
        + tw(27, 8, 1.3, '#fff6d6', .8);
      break;
    case 55: // Night of a thousand lanterns: lanterns rising over a city of domes under the moon.
      art = rg(28, 10, 7, '#fff2c4', .7) + `<path d="${crescent(28, 10, 3.6)}" fill="#ffe7a3"/>`
        + `<path d="M3 31h4v-5a3 3.4 0 0 1 6 0v5h2v-7.6a5 5.6 0 0 1 10 0V31h2v-5a3 3.4 0 0 1 6 0v5h4v8H3z" fill="#120a36"/><path d="M19.6 13.6h.8v4h-.8z" fill="#120a36"/>`
        + dots([[10, 29, .5], [20, 27, .6], [30, 29, .5], [16, 30, .4], [24, 30, .4]], '#ffd36b')
        + [[9, 18, 5], [14, 9.4, 3.6], [24, 19, 4], [31.6, 21, 3], [19.4, 7, 2.6], [6.6, 26, 2.6], [12, 23.4, 2.2]].map(([x, y, h]) => fanous(x, y, h * 1.4)).join('')
        + tw(6, 12, 1.1, '#fff6d6', .3) + tw(33, 15, 1, '#fff6d6', 1.4) + tw(25, 6, .9, '#fff', 2);
      break;
    case 56: // Celestial khatam: a great gold eight-pointed star in a nebula, two orbits of light round it.
      art = rg(12, 14, 11, '#ff7ac8', .55) + rg(28, 26, 10, '#4fe0d0', .45) + rg(20, 20, 12, '#fff2c4', .7)
        + dots([[8, 9, .35], [30, 8, .45], [33, 18, .3], [7, 24, .35], [12, 32, .3], [28, 33, .35], [24, 6, .3]])
        + `<ellipse cx="20" cy="20" rx="15" ry="5.6" fill="none" stroke="#ffcf55" stroke-width=".5" opacity=".7" transform="rotate(-24 20 20)"/><ellipse cx="20" cy="20" rx="14" ry="5" fill="none" stroke="#c9b8ff" stroke-width=".4" opacity=".6" transform="rotate(30 20 20)"/>`
        + `<path d="${k8(20, 20.8, 10.6, 7.6)}" fill="#6a3c06"/>` + twoIn(k8(20, 20, 10.6, 7.6), '#ffd766', '#c4820f', -.8, -.8, true)
        + `<path d="${k8(20, 20, 7.4, 5.4)}" fill="none" stroke="#fff3c2" stroke-width=".55"/>`
        + `<circle cx="20" cy="20" r="3.4" fill="#5a1f8e"/><circle cx="19.5" cy="19.5" r="2.5" fill="#a06aff"/><path d="M18.2 19.2l1-1" stroke="#fff" stroke-width=".7" stroke-linecap="round"/>`
        + `<circle cx="${(20 + 15 * Math.cos(-.3)).toFixed(2)}" cy="${(20 + 15 * Math.sin(-.3) * .37 - 2).toFixed(2)}" r=".9" fill="#fff6d6"/>`
        + tw(9, 12, 1.5, '#fff6d6', .2) + tw(31, 28, 1.3, '#cfe6ff', 1.1) + tw(29, 9.6, 1.1, '#ffe0f0', 1.9);
      break;
    default: // 57 Sea of light: a great crescent over a calm sea, a road of light on the water to the viewer.
      art = rg(20, 24, 16, '#9fd8ff', .45) + rg(17, 12, 10, '#fff2c4', .8) + `<path d="${crescent(17, 12, 7)}" fill="#ffe7a3"/><path d="${starD(25.4, 8.4, 1.8)}" fill="#fff"/>`
        + `<path d="M3 24h34v15H3z" fill="#0a1d52"/><path d="M3 24h34" stroke="#9fd8ff" stroke-width=".5" opacity=".8"/>`
        + Array.from({ length: 7 }, (_, i) => { const y = 25.4 + i * 1.7, w = 1.6 + i * 1.3; return `<path d="M${(17 - w).toFixed(2)} ${y.toFixed(2)}h${(2 * w).toFixed(2)}" stroke="#fff2c4" stroke-width="${(.45 + i * .1).toFixed(2)}" stroke-linecap="round" opacity="${(.9 - i * .07).toFixed(2)}"/>`; }).join('')
        + Array.from({ length: 6 }, (_, i) => `<path d="M${5 + i * 5.6} ${27 + (i % 3) * 2.6}h${2.4}" stroke="#7fb6ff" stroke-width=".4" stroke-linecap="round" opacity=".55"/>`).join('')
        + dots([[7, 9, .35], [31, 6, .4], [33, 16, .3], [6, 17, .3], [28, 13, .3]])
        + tw(9, 13, 1.3, '#fff6d6', .5) + tw(31.6, 10.6, 1.4, '#cfe6ff', 1.3) + tw(26, 30, 1, '#fff2c4', 2.1);
  }
  return `<clipPath id="${cid}"><circle cx="20" cy="20" r="17"/></clipPath>${disc}<g clip-path="url(#${cid})">${art}</g>`;
}

/** Names of the avatars and frames the shop sells or the weeks give (owner request 2026-11-13), English and Arabic. */
const AV_NAMES: Record<number, [string, string]> = {
  24: ['Night lantern', 'فانوس الليل'], 25: ['Midnight crescent', 'هلال منتصف الليل'], 26: ['Star of the night', 'نجمة الليل'],
  27: ['Night palm', 'نخلة الليل'], 28: ['Night dome', 'قبة الليل'], 29: ['Night mihrab', 'محراب الليل'], 30: ['Sun at midnight', 'شمس منتصف الليل'],
  31: ['Dew of the night', 'ندى الليل'], 32: ['Sunburst', 'شمس مشرقة'], 33: ['Star of the sun', 'نجمة الشمس'], 34: ['Golden crescent', 'الهلال الذهبي'],
  35: ['Golden dome', 'القبة الذهبية'], 36: ["Champion's star", 'نجمة البطل'], 37: ["Champion's lantern", 'فانوس البطل'], 38: ["Champion's mihrab", 'محراب البطل'],
  39: ["Champion's crescent", 'هلال البطل'], 40: ['Pearl crescent', 'هلال اللؤلؤ'], 41: ['Ruby star', 'نجمة الياقوت'], 42: ['Sapphire lantern', 'فانوس الياقوت الأزرق'],
  43: ['Emerald palm', 'نخلة الزمرد'], 44: ['Amethyst dome', 'قبة الجمشت'], 45: ['Topaz sun', 'شمس التوباز'], 46: ['Onyx mihrab', 'محراب الجزع'],
  47: ['Moonstone drop', 'قطرة حجر القمر'], 48: ['Coral waves', 'أمواج المرجان'], 49: ['Turquoise dunes', 'كثبان الفيروز'], 50: ['Diamond peaks', 'قمم الماس'],
  51: ['Garnet rahl', 'رحل العقيق'],
  // Legendary and mythic avatars (2026-11-24): Light only.
  52: ['Lantern of Andalus', 'فانوس الأندلس'], 53: ['Desert moonrise', 'شروق القمر في الصحراء'], 54: ['Rose of Andalus', 'وردة الأندلس'],
  55: ['A thousand lanterns', 'ألف فانوس'], 56: ['Celestial khatam', 'الخاتم السماوي'], 57: ['Sea of light', 'بحر النور'],
};
const FR_NAMES: Record<number, [string, string]> = {
  1: ['Golden glow', 'الوهج الذهبي'], 2: ['Emerald setting', 'إطار الزمرد'], 3: ['Starry night', 'ليلة النجوم'], 4: ['Sun crown', 'تاج الشمس'],
  5: ['Gold laurel', 'إكليل الذهب'], 6: ['Silver laurel', 'إكليل الفضة'], 7: ['Bronze laurel', 'إكليل البرونز'], 8: ['String of pearls', 'عقد اللؤلؤ'],
  9: ['Crescent crown', 'تاج الهلال'], 10: ['Mosaic', 'الفسيفساء'], 11: ['Aurora', 'الشفق'], 12: ['Lantern ring', 'حلقة الفوانيس'], 13: ['Rosette', 'الوردة'],
  // The Jumu'ah collection (2026-11-24): only from the calendar's Friday chest.
  20: ['Kiswah', 'الكسوة'], 21: ['Domes and minarets', 'القباب والمآذن'], 22: ['Iznik tulips', 'زهور إزنيق'], 23: ['Maghrib', 'المغرب'], 24: ['Khatam stars', 'نجوم الخاتم'], 25: ['Pearl and rose', 'اللؤلؤ والورد'],
  // Legendary and mythic decorations (2026-11-24): Light only, the finest in the shop.
  26: ['Laylat al-Qadr', 'ليلة القدر'], 27: ['Gates of light', 'أبواب النور'], 28: ['Celestial orbit', 'المدار السماوي'], 29: ['Golden masjid', 'المسجد الذهبي'], 30: ['Eid fireworks', 'ألعاب العيد النارية'], 31: ['Oasis', 'الواحة'], 32: ['Celestial khatam', 'الخاتم السماوي'], 33: ['Eternal garden', 'الحديقة الخالدة'], 34: ['Zamzam of light', 'زمزم النور'], 35: ['Lantern bridge', 'جسر الفوانيس'], 36: ['Desert night', 'ليل الصحراء'], 37: ['Royal mashrabiya', 'المشربية الملكية'],
};
/** A name for avatar n or frame n, or null where there is none (the free ones; limited frames have their own). */
export function lookName(kind: 'avatar' | 'frame', n: number, ar = false): string | null {
  const v = (kind === 'avatar' ? AV_NAMES : FR_NAMES)[n];
  if (!v) return null;
  return ar ? v[1] : tr('extra', `${kind === 'avatar' ? 'av' : 'fr'}.${n}`) ?? v[0];
}

/** An avatar disc with its frame. `i` null = a private player. The frame is a Discord-style decoration
 *  (`src/ui/deco/`): pieces drawn once as pictures around and over the disc; `live` moves them (only on Me, an open
 *  profile and the shop preview; lists stay still, and so does old-phone mode / reduced motion). */
const busts = new Map<string, string>();
export function avatar(i: number | null | undefined, tier = 0, size = 36, frame = 0, figure?: string | null, live = false): HTMLElement {
  const priv = i === null || i === undefined;
  const fig = priv ? null : parse(figure);
  const f = priv ? 0 : Math.max(0, Math.min(FRAMES - 1, frame | 0));
  let inner: HTMLElement;
  if (fig) {
    // A character from the builder: head and shoulders as one image (still vector), made once per look.
    let src = busts.get(figure!);
    if (!src) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 3 34 34" width="34" height="34">${bustMarkup(fig)}</svg>`;
      src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      if (busts.size > 300) busts.clear();
      busts.set(figure!, src);
    }
    inner = h('img', { src, alt: '', 'aria-hidden': 'true', draggable: 'false' });
  } else {
    const n = priv ? 0 : Math.max(0, Math.min(AVATARS - 1, i | 0));
    const svg = el('svg', { viewBox: '3 3 34 34', 'aria-hidden': 'true' });
    svg.innerHTML = priv
      ? `${twoIn(circlePath(20, 20, 17), '#8a8f94', '#5d6166', -3, -3)}${shine('M8.6 15.5A12.5 12.5 0 0 1 15.5 8.6', 1.6, .3)}<circle cx="20" cy="20" r="3" fill="rgba(255,255,255,.7)"/>`
      : medallion(look(n));
    inner = svg as unknown as HTMLElement;
  }
  const d = decorated(inner, f, tier, size, live);
  d.classList.add('rk-av', `f${f}`);
  return d;
}

const starD = (x: number, y: number, R: number, k = 4) => {
  const pts: string[] = [];
  for (let i = 0; i < k * 2; i++) { const a = (i * Math.PI) / k - Math.PI / 2, d = i % 2 ? R * .42 : R; pts.push(`${(x + d * Math.cos(a)).toFixed(2)} ${(y + d * Math.sin(a)).toFixed(2)}`); }
  return `M${pts.join('L')}Z`;
};

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
