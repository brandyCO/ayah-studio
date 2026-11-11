// A milestone badge in the app's 2.5D reward style (flat two-tone shapes lit from the top left, a chunky edge
// underneath, soft white shines; `flat.ts`). Each tier is a richer object than the one before, not a recolour:
//   Bronze   a copper coin
//   Silver   a coin on a silver khatam star with studs, short navy ribbon tails
//   Gold     a sunburst of rays behind a gold star, emerald ribbons, laurel branches, sparkles
//   Platinum a pleated violet rosette, a star set with amethysts, silver laurels, a jewelled crown
//   Diamond  light beams, a star of cut ice, a faceted diamond holding the icon, white-gold crown with
//            three stones, ice laurels, sapphire ribbons, twinkling glints
// Locked badges are drawn in grey. SVG + CSS only.
import type { BadgeIcon, BadgeTier } from '../data/badges';
import { circlePath, edge, shine, starPath, two } from './flat';
import { restOffscreen } from './offscreen';

/** How far up the five steps a tier sits. */
const RANK: Record<BadgeTier, number> = { bronze: 0, silver: 1, gold: 2, emerald: 2, platinum: 3, diamond: 4 };

// [base, shade, edge]
type Tone = [string, string, string];
interface Look { metal: Tone; disc: Tone; icon: string; ribbon?: Tone; leaf?: Tone; gem?: Tone; ray?: [string, string] }
const LOOKS: Look[] = [
  { metal: ['#e7a266', '#b8723a', '#6e3f1c'], disc: ['#9a4426', '#74301a', '#4a1d0e'], icon: '#ffe0bf' },
  { metal: ['#e3eaf1', '#a9b6c3', '#55606b'], disc: ['#356aa3', '#244c7a', '#16324f'], icon: '#f6faff', ribbon: ['#4a86c8', '#2f5f96', '#1d3d63'] },
  { metal: ['#ffd25a', '#dc9f28', '#7d5710'], disc: ['#12795a', '#0b5a42', '#063c2b'], icon: '#fff3c8', ribbon: ['#18a57c', '#0e7a5b', '#075039'],
    leaf: ['#ffd25a', '#d89a22', '#7d5710'], gem: ['#ff5a6e', '#c4243a', '#6e0f1c'], ray: ['#ffe58f', '#ffc53d'] },
  { metal: ['#f1f3fb', '#b7bdd8', '#4a4f72'], disc: ['#6a4ad0', '#4b32a0', '#2c1d63'], icon: '#f6f2ff', ribbon: ['#8a6af0', '#6345c8', '#3a2680'],
    leaf: ['#eef1fb', '#b2b9d6', '#4a4f72'], gem: ['#c4a2ff', '#8452e8', '#3b1a80'], ray: ['#d9ccff', '#b49cf5'] },
  { metal: ['#fff3cf', '#e8c56c', '#8a6a1e'], disc: ['#e4f8ff', '#98d8f2', '#1f5f8f'], icon: '#1a4cb8', ribbon: ['#ffe08a', '#e0ac3e', '#8a6a1e'],
    leaf: ['#e6f8ff', '#9ad6ef', '#2a6a98'], gem: ['#ffffff', '#a8e6fb', '#2a6a98'], ray: ['#c9f3ff', '#9fe3fb'] },
];

const ICONS: Record<BadgeIcon, string> = {
  flame: '<path d="M12 2.5c1.2 3.2 4.6 5.2 4.6 9.6a4.6 4.6 0 0 1-9.2 0c0-2.3 1.1-3.6 2.2-4.6.1 2 1 3.2 2.2 3.4-1-3.1-.2-5.8.2-8.4z"/>',
  page: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 11h6M9.5 14h6M9.5 17h4"/>',
  book: '<path d="M3.5 5.5c3-1.2 6-1.2 8.5.8 2.5-2 5.5-2 8.5-.8v13c-3-1.1-6-1.1-8.5.9-2.5-2-5.5-2-8.5-.9z"/><path d="M12 6.3v13"/>',
  mushaf: '<path d="M5 3.5h12.5a1.5 1.5 0 0 1 1.5 1.5v15.5H6.5A1.5 1.5 0 0 1 5 19z"/><path d="M12 7.5l1.3 2.2 2.2 1.3-2.2 1.3-1.3 2.2-1.3-2.2-2.2-1.3 2.2-1.3z"/>',
  juz: '<path d="M12 3.5l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  beads: '<path d="M12 16.2v2.3M10.4 21.2l1.6-2.7 1.6 2.7"/>' +
    Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + Math.PI / 2;
      return `<circle cx="${(12 + 6 * Math.cos(a)).toFixed(2)}" cy="${(9.6 + 6 * Math.sin(a)).toFixed(2)}" r="1.45" class="bd-fill"/>`;
    }).join(''),
  reel: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M10 9.2l5 2.8-5 2.8z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" class="bd-fill"/>',
  listen: '<path d="M4 14.5V12a8 8 0 0 1 16 0v2.5"/><rect x="3.5" y="14" width="4" height="6.5" rx="1.2"/><rect x="16.5" y="14" width="4" height="6.5" rx="1.2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.2C19.5 15.4 12 20 12 20z"/>',
  cave: '<path d="M3 20.5h18"/><path d="M5 20.5V12a7 7 0 0 1 14 0v8.5"/><path d="M9 20.5v-6a3 3 0 0 1 6 0v6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.4 2.2"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4 2.6-6.5 7-6.5 0 4.2-2.8 6.5-7 6.5z"/><path d="M12 15.5c0-3.3-2.2-5.4-6-5.4 0 3.5 2.3 5.4 6 5.4z"/>',
  tree: '<path d="M12 21v-5.5"/><path d="M12 3.5c3.6 0 6.2 2.6 6.2 5.8 0 3.4-2.8 6.2-6.2 6.2s-6.2-2.8-6.2-6.2c0-3.2 2.6-5.8 6.2-5.8z"/><path d="M9 21h6"/>',
  drop: '<path d="M12 3.5c3 4.2 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 3-6.6 6-10.8z"/><path d="M9.2 14.6a3 3 0 0 0 2.6 2.8"/>',
  sun: '<circle cx="12" cy="13.5" r="4.2"/><path d="M12 4v2.2M4.5 13.5H6.7M17.3 13.5h2.2M6.6 8.1l1.5 1.5M17.4 8.1l-1.5 1.5M3.5 20.5h17"/>',
  lantern: '<path d="M10 3.5h4M12 3.5v2"/><path d="M8.5 7.5h7l1 2.5v6.5l-1 2.5h-7l-1-2.5V10z"/><path d="M12 11c1 1.2 1.3 2 1.3 2.6a1.3 1.3 0 0 1-2.6 0c0-.6.3-1.4 1.3-2.6z" class="bd-fill"/>',
  moon: '<path d="M15.5 3.8A8.5 8.5 0 1 0 20.2 15 7 7 0 0 1 15.5 3.8z"/><path d="M18.5 5.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" class="bd-fill"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M8.8 14.6l2.2 2.2 4.3-4.3"/>',
  shield: '<path d="M12 3.2l7.5 2.8v5.6c0 4.7-3.2 8-7.5 9.4-4.3-1.4-7.5-4.7-7.5-9.4V6z"/><path d="M12 8.2l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" class="bd-fill"/>',
  trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3.2 4M16.5 6h3a3 3 0 0 1-3.2 4"/><path d="M12 13.5v3.5M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  crown: '<path d="M4 17.5L3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4.5 20.5h15"/>',
  share: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.8l6.6-4M8.7 13.2l6.6 4"/>',
  layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z"/><path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5"/>',
  flag: '<path d="M5.5 21V3.5"/><path d="M5.5 4.5h11l-2.2 3.6 2.2 3.6h-11"/>',
};

const C = 46; // medallion centre (x 50), leaving room below for the ribbons
const f = (n: number) => n.toFixed(2);
const pt = (r: number, a: number, cx = 50, cy = C) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
const poly = (p: (readonly [number, number])[]) => `M${p.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
const up = -Math.PI / 2;

/** A four-point sparkle. */
const sparkle = (x: number, y: number, s: number, o = 1) =>
  `<path d="M${f(x)} ${f(y - s)}Q${f(x + s * .16)} ${f(y - s * .16)} ${f(x + s)} ${f(y)}Q${f(x + s * .16)} ${f(y + s * .16)} ${f(x)} ${f(y + s)}Q${f(x - s * .16)} ${f(y + s * .16)} ${f(x - s)} ${f(y)}Q${f(x - s * .16)} ${f(y - s * .16)} ${f(x)} ${f(y - s)}Z" fill="#fff" opacity="${o}"/>`;

/** Sunburst: k rays alternating light / deeper, from r0 to r1. */
function rays(k: number, r0: number, r1: number, [a, b]: [string, string], w = 0.5) {
  return Array.from({ length: k }, (_, i) => {
    const t = (i / k) * Math.PI * 2 + up, h = (Math.PI / k) * w;
    return `<path d="${poly([pt(r0, t - h * 1.6), pt(r1, t - h * .25), pt(r1, t + h * .25), pt(r0, t + h * 1.6)])}" fill="${i % 2 ? b : a}"/>`;
  }).join('');
}

/** Ribbon tails below the medallion, notched at the ends. */
function ribbons([b, s, e]: Tone, long: boolean): string {
  const L = long ? 1 : 0.62;
  const tail = (sx: number) => {
    const x0 = 50 + sx * 8, y0 = C + 18, x1 = 50 + sx * (8 + 16 * L), y1 = C + 18 + 38 * L;
    const n = 6 * L;
    return `M${f(x0 - sx * 7)} ${f(y0)}L${f(x0 + sx * 6)} ${f(y0 - 2)}L${f(x1 + sx * 6)} ${f(y1 - n)}L${f(x1 + sx * 1)} ${f(y1 - n * .1)}L${f(x1 - sx * 5)} ${f(y1 + n * .55)}Z`;
  };
  return [-1, 1].map((sx) => { const d = tail(sx); return `${edge(d, e, 2)}${two(d, b, s, sx * 1.6, -1.6)}`; }).join('');
}

/** Laurel branches either side: a curved stem with leaves in pairs along it, each a lens in two tones. */
function laurels([b, s, e]: Tone, R: number, k: number): string {
  let out = '';
  for (const sx of [-1, 1]) {
    const t0 = Math.PI / 2 + sx * 0.3, t1 = Math.PI / 2 + sx * 1.95;
        for (let i = 0; i < k; i++) {
      const t = t0 + (t1 - t0) * ((i + .5) / k);
      const [x, y] = pt(R, t);
      const tang = t + sx * Math.PI / 2; // along the stem, towards its tip
      for (const side of [-1, 1]) {
        const dir = tang + side * 0.62 * sx, len = 9 - i * .45, wid = 3.4 - i * .14;
        const [tx, ty] = [x + Math.cos(dir) * len, y + Math.sin(dir) * len];
        const nx = -Math.sin(dir) * wid, ny = Math.cos(dir) * wid;
        const mx = (x + tx) / 2, my = (y + ty) / 2;
        const d = `M${f(x)} ${f(y)}Q${f(mx + nx)} ${f(my + ny)} ${f(tx)} ${f(ty)}Q${f(mx - nx)} ${f(my - ny)} ${f(x)} ${f(y)}Z`;
        out += `${edge(d, e, 1.3)}${two(d, b, s, -.9, -.9)}`;
      }
    }
  }
  return out;
}

/** A sunburst disc: wedges alternating light / deeper, with a scalloped rim. */
function sunburst(k: number, R: number, [a, b2]: [string, string], rim: string): string {
  const ros = starPath(50, C, R, R - 3.5, k);
  return `${edge(ros, rim, 3)}<path d="${ros}" fill="${b2}"/>` + Array.from({ length: k }, (_, i) =>
    i % 2 ? '' : `<path d="${poly([[50, C], pt(R, (i / k) * Math.PI * 2 + up), pt(R, ((i + 1) / k) * Math.PI * 2 + up)])}" fill="${a}"/>`).join('');
}

/** A crown on top of the medallion; `stones` gems set in it. */
function crown(m: Tone, gem: Tone, y: number, w: number, stones: number): string {
  const h = w * .5, x0 = 50 - w / 2, x1 = 50 + w / 2;
  const d = `M${f(x0)} ${f(y)}L${f(x0 - w * .06)} ${f(y - h)}L${f(50 - w * .25)} ${f(y - h * .52)}L50 ${f(y - h * 1.18)}L${f(50 + w * .25)} ${f(y - h * .52)}L${f(x1 + w * .06)} ${f(y - h)}L${f(x1)} ${f(y)}Z`;
  const band = `M${f(x0 - 1)} ${f(y - 3.4)}H${f(x1 + 1)}V${f(y + 1.2)}H${f(x0 - 1)}Z`;
  const gx = stones === 3 ? [50 - w * .3, 50, 50 + w * .3] : [50];
  return `${edge(d, m[2], 2)}${two(d, m[0], m[1], -1.4, -1.4)}${two(band, m[1], m[2], 0, -1)}` +
    [[x0 - w * .06, y - h], [50, y - h * 1.18], [x1 + w * .06, y - h]].map(([x, yy]) => `<circle cx="${f(x)}" cy="${f(yy)}" r="1.9" fill="${m[0]}"/>`).join('') +
    gx.map((x, i) => { const r = i === (gx.length - 1) / 2 ? 2.8 : 2.1; return `<circle cx="${f(x)}" cy="${f(y - 1.2)}" r="${r}" fill="${gem[2]}"/>${two(circlePath(x, y - 1.6, r), gem[0], gem[1], -.7, -.7)}<circle cx="${f(x - r * .35)}" cy="${f(y - 1.6 - r * .4)}" r="${f(r * .3)}" fill="#fff" opacity=".9"/>`; }).join('');
}

/** A faceted cut stone (octagon with a table) in two tones per facet. */
function cutStone(r: number, [b, s, e]: Tone): string {
  const v = Array.from({ length: 8 }, (_, i) => pt(r, (i / 8) * Math.PI * 2 + up + Math.PI / 8));
  const t = Array.from({ length: 8 }, (_, i) => pt(r * .58, (i / 8) * Math.PI * 2 + up + Math.PI / 8));
  const tones = ['#ffffff', b, '#e8f9ff', s, b, s, '#ffffff', b];
  return `${edge(poly(v), '#2f7fb8', 2)}${v.map((a, i) => { const j = (i + 1) % 8; return `<path d="${poly([a, v[j], t[j], t[i]])}" fill="${tones[i]}"/>`; }).join('')}
    ${two(poly(t), '#e9f9ff', b, -1.4, -1.4)}`;
}

/** The icon raised on the disc: a darker line under it, the light line on top. */
function iconOn(ic: BadgeIcon, r: number, colour: string, under: string): string {
  const sc = r / 26;
  const g = (stroke: string, dx: number, dy: number, w: number) => `<g transform="translate(${f(50 - 16 * sc + dx)} ${f(C - 16 * sc + dy)}) scale(${f(1.333 * sc)})" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="--bd-ic:${stroke}">${ICONS[ic]}</g>`;
  return g(under, .3, 1.1, 2.3) + g(colour, 0, 0, 2);
}

/** A two-tone disc with a rim (metal) and its face (enamel / stone). */
function disc(r: number, m: Tone, d: Tone, rim = 4): string {
  return `${edge(circlePath(50, C, r), m[2], 3)}${two(circlePath(50, C, r), m[0], m[1], -2, -2)}
    ${two(circlePath(50, C, r - rim), d[1], d[0], 1.4, 1.4)}
    ${shine(`M${f(50 - (r - rim) * .74)} ${f(C - (r - rim) * .22)}A${f((r - rim) * .8)} ${f((r - rim) * .8)} 0 0 1 ${f(50 - (r - rim) * .1)} ${f(C - (r - rim) * .8)}`, 2.2, .35)}`;
}

/** Studs or gems on a star's points. */
function studsOn(R: number, k: number, g: Tone, s: number, phase = 0): string {
  return Array.from({ length: k }, (_, i) => {
    const [x, y] = pt(R, (i / k) * Math.PI * 2 + up + phase);
    return `<circle cx="${f(x)}" cy="${f(y + .9)}" r="${s}" fill="${g[2]}"/>${two(circlePath(x, y, s), g[0], g[1], -.6, -.6)}<circle cx="${f(x - s * .35)}" cy="${f(y - s * .38)}" r="${f(s * .3)}" fill="#fff" opacity=".85"/>`;
  }).join('');
}

function draw(rank: number, ic: BadgeIcon, id: string): string {
  const L = LOOKS[rank];
  const m = L.metal;
  let s = '';
  switch (rank) {
    case 0: // Bronze: a coin
      s += disc(27, m, L.disc, 4.5);
      s += `<circle cx="50" cy="${C}" r="24.2" fill="none" stroke="${m[2]}" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="1.2 1.6"/>`;
      s += iconOn(ic, 20, L.icon, L.disc[2]);
      break;
    case 1: { // Silver: the coin on a khatam star, studs, short ribbons
      const star = starPath(50, C, 40, 31);
      s += ribbons(L.ribbon!, false);
      s += `${edge(star, m[2], 3.4)}${two(star, m[0], m[1], -2.6, -2.6)}`;
      s += studsOn(34.5, 8, [ '#ffffff', '#c7d1db', '#55606b'], 1.9);
      s += disc(24, m, L.disc, 3.6);
      s += iconOn(ic, 18.5, L.icon, L.disc[2]);
      break;
    }
    case 2: { // Gold: sunburst, star, laurels, ribbons
      s += sunburst(32, 47, ['#ffb547', '#f08e1a'], '#8a4c06');
      s += ribbons(L.ribbon!, true);
      const star = starPath(50, C, 38, 29.5);
      s += `${edge(star, m[2], 3.4)}${two(star, m[0], m[1], -2.6, -2.6)}`;
      s += laurels(['#4fd19b', '#1f9a6a', '#0b5a3c'], 41, 5);
      s += studsOn(33, 8, L.gem!, 2.1);
      s += disc(23.5, m, L.disc, 3.6);
      s += iconOn(ic, 18, L.icon, L.disc[2]);
      s += sparkle(17, 15, 4.2) + sparkle(84, 24, 3) + sparkle(80, 74, 2.4, .85);
      break;
    }
    case 3: { // Platinum: rosette, star with amethysts, laurels, crown
      s += ribbons(L.ribbon!, true);
      const ros = starPath(50, C, 44, 40, 24);
      s += `${edge(ros, '#3a2680', 3)}${two(ros, '#b8a2ff', '#8a6ae8', -2, -2)}`;
      s += Array.from({ length: 24 }, (_, i) => i % 2 ? '' : `<path d="${poly([[50, C], pt(42, (i / 24) * Math.PI * 2 + up), pt(42, ((i + 1) / 24) * Math.PI * 2 + up)])}" fill="#d7caff" opacity=".55"/>`).join('');
      const star = starPath(50, C, 37, 28.5), star2 = starPath(50, C, 31, 24, 8);
      s += `${edge(star, m[2], 3.4)}${two(star, m[0], m[1], -2.6, -2.6)}`;
      s += laurels(L.leaf!, 41, 6);
      s += `<g transform="rotate(22.5 50 ${C})">${two(star2, '#ffffff', '#cfd4ea', -1.6, -1.6)}</g>`;
      s += studsOn(32.5, 8, L.gem!, 2.4);
      s += disc(22.5, m, L.disc, 3.4);
      s += iconOn(ic, 17, L.icon, L.disc[2]);
      s += crown(m, L.gem!, C - 31, 26, 3);
      s += sparkle(14, 20, 4.6) + sparkle(87, 30, 3.4) + sparkle(84, 78, 2.6, .9) + sparkle(16, 70, 2.2, .8);
      break;
    }
    default: { // Diamond: beams, ice star, cut diamond, crown with three stones
      s += `<circle cx="50" cy="${C}" r="50" fill="url(#${id}g)"/>`;
      s += rays(12, 18, 54, ['#e4fbff', '#bfefff'], .7);
      s += ribbons(L.ribbon!, true);
      const ros = starPath(50, C, 44.5, 39, 16);
      s += sunburst(32, 47, ['#2a63d6', '#1b44a6'], '#0b2266');
      s += studsOn(43.5, 16, ['#ffffff', '#cbeefc', '#2a6a98'], 1.6, Math.PI / 16);
      // A star of cut ice: each point split into a lit and a shaded half.
      const R = 37, r = 27;
      const v = Array.from({ length: 16 }, (_, i) => pt(i % 2 ? r : R, (i * Math.PI) / 8 + up));
      s += edge(poly(v), '#0f3b80', 3);
      s += v.map((a, i) => { const b = v[(i + 1) % 16]; return `<path d="${poly([[50, C], a, b])}" fill="${['#ffffff', '#a9e3fa', '#e3f8ff', '#6cc4ee'][i % 4]}"/>`; }).join('');
      s += laurels(L.leaf!, 42, 6);
      s += cutStone(24, ['#9fdcf7', '#4fb0e6', '#1f5f8f']);
      s += iconOn(ic, 19, L.icon, '#ffffff');
      s += crown(m, ['#ffffff', '#a8e6fb', '#2a6a98'], C - 32, 26, 3);
      s += sparkle(11, 16, 5.4) + sparkle(89, 26, 4) + sparkle(88, 80, 3.2) + sparkle(12, 76, 2.8) + sparkle(70, 6, 2.4, .9);
    }
  }
  return s;
}

// Each tier fills more of the box than the one before.
const SCALE = [0.78, 0.86, 0.94, 1, 1];
let uid = 0;

export function badgeArt(tier: BadgeTier, ic: BadgeIcon, earned: boolean, size = 72): HTMLElement {
  const rank = RANK[tier];
  const id = `bd${++uid}`;
  const el = document.createElement('span');
  el.className = `badge-art t-${tier}${earned ? ' earned' : ' locked'}`;
  el.style.width = el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');
  const k = SCALE[rank], tx = 50 - 50 * k, ty = 50 - 50 * k + (1 - k) * 4;
  el.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%">
    <defs><radialGradient id="${id}g"><stop offset="0" stop-color="#bff0ff" stop-opacity=".9"/><stop offset=".55" stop-color="#9fe3fb" stop-opacity=".35"/><stop offset="1" stop-color="#9fe3fb" stop-opacity="0"/></radialGradient></defs>
    <g transform="translate(${f(tx)} ${f(ty)}) scale(${k})">${draw(rank, ic, id)}</g>
  </svg>${earned ? '<span class="bd-shine-l"><i class="bd-shine"></i></span>' : ''}${earned && rank === 4 ? GLINTS.map(([x, y, d]) => `<i class="bd-glint" style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join('') : ''}`;
  if (earned) { (el.querySelector('.bd-shine-l') as HTMLElement).style.cssText = shineMask(rank, k, tx, ty); restOffscreen(el); }
  return el;
}

/** Where the diamond's glints sit (as % of the box). */
const GLINTS = [[24, 22, 0], [76, 30, 1.3], [66, 70, 2.4], [30, 60, 3.3], [50, 12, 2]];

// Speed (owner 2026-11-10, "60fps, every animation"): the passing shine is an HTML layer over the drawing,
// cut to the medallion by a mask, so the compositor slides it across without repainting the badge.
const masks = new Map<number, string>();
function shineMask(rank: number, k: number, tx: number, ty: number): string {
  let m = masks.get(rank);
  if (!m) {
    const r = [27, 40, 38, 37, 37][rank];
    const u = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g transform='translate(${f(tx)} ${f(ty)}) scale(${k})'><path d='${rank === 0 ? circlePath(50, C, r) : starPath(50, C, r, r * .77)}'/></g></svg>`)}")`;
    m = `-webkit-mask:${u} center/100% 100% no-repeat;mask:${u} center/100% 100% no-repeat`;
    masks.set(rank, m);
  }
  return m;
}
