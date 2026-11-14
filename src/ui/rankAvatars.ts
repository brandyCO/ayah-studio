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
import { circlePath, edge, mix, shine, two } from './flat';

export const AVATARS = 52;
export const FRAMES = 20;
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
type Kind = 'free' | 'shop' | 'sun' | 'champ' | 'jewel';
function look(n: number): { a: string; b: string; sym: number; kind: Kind } {
  if (n >= 40) { const [a, b] = JEWELS[n - 40]; return { a, b, sym: [1, 2, 0, 3, 7, 10, 8, 11, 5, 4, 6, 9][n - 40], kind: 'jewel' }; }
  if (n < 24) { const hh = (n * 47 + (n >= 12 ? 23 : 0)) % 360; return { a: `hsl(${hh} 48% 40%)`, b: `hsl(${(hh + 30) % 360} 52% 24%)`, sym: n % 12, kind: 'free' }; }
  if (n < 32) { const hh = 200 + (n - 24) * 18; return { a: `hsl(${hh} 52% 26%)`, b: `hsl(${hh + 20} 56% 10%)`, sym: [0, 1, 2, 3, 7, 8, 10, 11][n - 24], kind: 'shop' }; }
  if (n < 36) return { a: '#ffd25e', b: '#e08a12', sym: [10, 2, 1, 7][n - 32], kind: 'sun' };
  return { a: '#14805f', b: '#03271d', sym: [2, 0, 8, 1][n - 36], kind: 'champ' };
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
function twoIn(d: string, base: string, shade: string, dx: number, dy: number): string {
  const id = `rkc${++uid}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${shade}"/><g clip-path="url(#${id})"><path d="${d}" fill="${base}" transform="translate(${dx} ${dy})"/></g>`;
}
function emblem(sym: number, k: Ink, scale: number): string {
  const g = GLYPHS[sym];
  const body = g.line
    ? `<path d="${g.d}" fill="none" stroke="${k.edge}" stroke-width="2.8" stroke-linecap="round" transform="translate(0 1)"/><path d="${g.d}" fill="none" stroke="${k.shade}" stroke-width="2.8" stroke-linecap="round"/><path d="${g.d}" fill="none" stroke="${k.base}" stroke-width="1.7" stroke-linecap="round" transform="translate(-.25 -.35)"/>`
    : `${edge(g.d, k.edge, 1)}${twoIn(g.d, k.base, k.shade, -.7, -.7)}`;
  return `<g transform="translate(20 20) scale(${scale}) translate(-12 -12)">${body}${g.extra?.(k) ?? ''}</g>`;
}
const INK_WHITE: Ink = { base: '#ffffff', shade: '#d7dde6', edge: 'rgba(0,0,0,.32)', light: '#fff6da' };
const INK_GOLD: Ink = { base: '#ffd766', shade: '#d9951f', edge: '#5a3a06', light: '#fff3c2' };
const D2 = (r: number, a: number) => `${(20 + r * Math.cos(a)).toFixed(2)} ${(20 + r * Math.sin(a)).toFixed(2)}`;
const beads = (r: number, n: number, c: string, rr = .7, off = 0) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 + off; return `<circle cx="${D2(r, a).split(' ')[0]}" cy="${D2(r, a).split(' ')[1]}" r="${rr}" fill="${c}"/>`; }).join('');
/** The girih: two interlaced squares and a ring, faint, behind the emblem. */
const girih = (c: string, o: number, r = 14.6) => `<g fill="none" stroke="${c}" stroke-width=".7" opacity="${o}"><path d="M${D2(r, -Math.PI / 4)}L${D2(r, Math.PI / 4)}L${D2(r, Math.PI * .75)}L${D2(r, -Math.PI * .75)}Z"/><path d="M${D2(r, 0)}L${D2(r, Math.PI / 2)}L${D2(r, Math.PI)}L${D2(r, -Math.PI / 2)}Z"/><circle cx="20" cy="20" r="${(r * .62).toFixed(2)}"/></g>`;

/** The medallion behind the emblem, by kind. */
function medallion(L: ReturnType<typeof look>): string {
  const disc = twoIn(circlePath(20, 20, 17), L.a, L.b, -3, -3);
  const gloss = shine('M8.6 15.5A12.5 12.5 0 0 1 15.5 8.6', 1.6, .3);
  switch (L.kind) {
    case 'free':
      return `${disc}<circle cx="20" cy="20" r="14.4" fill="none" stroke="#fff" stroke-width=".6" opacity=".22"/>${gloss}${emblem(L.sym, INK_WHITE, .9)}`;
    case 'shop': {
      // Night enamel: a gold khatam, a ring of gold beads, a few stars, the emblem in raised gold.
      let st = '';
      for (const [x, y, r] of [[11, 12, 1], [29.5, 13, .8], [12.5, 28.5, .7], [28, 29, 1.1], [20, 7.5, .6]] as const) st += `<path d="${starD(x, y, r * 1.6)}" fill="#fff3c2" opacity=".8"/>`;
      return `${disc}${girih('#ffcf55', .3)}${beads(15.2, 24, '#ffcf55', .45)}${st}${gloss}${emblem(L.sym, INK_GOLD, .82)}`;
    }
    case 'sun': {
      // A sunburst: sixteen wedges in two golds, a glowing centre, the emblem in white.
      let w = '';
      for (let k = 0; k < 16; k++) { const a1 = (k / 16) * Math.PI * 2, a2 = ((k + 1) / 16) * Math.PI * 2; w += `<path d="M20 20L${D2(17, a1)}A17 17 0 0 1 ${D2(17, a2)}Z" fill="${k % 2 ? '#ffc23d' : '#ffe08a'}"/>`; }
      return `${disc}<g opacity=".9">${w}</g><circle cx="20" cy="20" r="10.5" fill="#fff3c2" opacity=".75"/>${beads(15.4, 16, '#fff', .55, Math.PI / 16)}${gloss}${emblem(L.sym, { base: '#ffd23f', shade: '#f08a12', edge: '#8a4206', light: '#fff3c2' }, .8)}`;
    }
    case 'champ':
      // Emerald and gold: a gold khatam filled faintly, a double bead ring, the emblem in raised gold.
      return `${disc}<path d="M${D2(15, -Math.PI / 4)}L${D2(15, Math.PI / 4)}L${D2(15, Math.PI * .75)}L${D2(15, -Math.PI * .75)}ZM${D2(15, 0)}L${D2(15, Math.PI / 2)}L${D2(15, Math.PI)}L${D2(15, -Math.PI / 2)}Z" fill="#ffcf55" opacity=".12"/>${girih('#ffcf55', .45, 15)}${beads(16, 8, '#ffcf55', 1, Math.PI / 8)}${gloss}${emblem(L.sym, INK_GOLD, .78)}`;
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
        <ellipse cx="13" cy="10.8" rx="4.4" ry="2" fill="#fff" opacity=".4" transform="rotate(-35 13 10.8)"/>${emblem(L.sym, ink, .64)}
        <path d="${starD(29.5, 9.5, 3)}" fill="#fff"/><path d="${starD(10, 29, 1.8)}" fill="#fff" opacity=".85"/>`;
    }
  }
}
const n40Ink = (a: string): Ink => (/^#(fbf6ee|cfe6f2|dfe4f0)$/i.test(a) ? { base: '#d9a53a', shade: '#a8721a', edge: '#5a3a06', light: '#fff3c2' } : INK_GOLD);

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
};
const FR_NAMES: Record<number, [string, string]> = {
  1: ['Golden glow', 'الوهج الذهبي'], 2: ['Emerald setting', 'إطار الزمرد'], 3: ['Starry night', 'ليلة النجوم'], 4: ['Sun crown', 'تاج الشمس'],
  5: ['Gold laurel', 'إكليل الذهب'], 6: ['Silver laurel', 'إكليل الفضة'], 7: ['Bronze laurel', 'إكليل البرونز'], 8: ['String of pearls', 'عقد اللؤلؤ'],
  9: ['Crescent crown', 'تاج الهلال'], 10: ['Mosaic', 'الفسيفساء'], 11: ['Aurora', 'الشفق'], 12: ['Lantern ring', 'حلقة الفوانيس'], 13: ['Rosette', 'الوردة'],
};
/** A name for avatar n or frame n, or null where there is none (the free ones; limited frames have their own). */
export function lookName(kind: 'avatar' | 'frame', n: number, ar = false): string | null {
  const v = (kind === 'avatar' ? AV_NAMES : FR_NAMES)[n];
  if (!v) return null;
  return ar ? v[1] : tr('extra', `${kind === 'avatar' ? 'av' : 'fr'}.${n}`) ?? v[0];
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
  const disc = el('g', {});
  disc.innerHTML = priv
    ? `${twoIn(circlePath(20, 20, 17), '#8a8f94', '#5d6166', -3, -3)}${shine('M8.6 15.5A12.5 12.5 0 0 1 15.5 8.6', 1.6, .3)}<circle cx="20" cy="20" r="3" fill="rgba(255,255,255,.7)"/>`
    : medallion(L);
  svg.append(disc);
  drawFrame(svg, f, tier);
  return h('span', { class: `rk-av f${f}${tier === 4 || f === 1 || f === 4 || f === 5 || f >= 8 || n >= 32 ? ' glow' : ''}` }, svg as unknown as Node, glintLayer(size));
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
