// Each surah its own theme on the Learn path (owner decision 2026-11-23, after Duolingo's unit colours): a
// deep colour for its banner, its current step and its Continue button, and, where the surah's name is a
// concrete picture (cave, dawn, fig, star, sand dunes…), a soft white motif of that name in the banner. The
// motif comes from the name only, never from an interpretation of the ayat; no figures (people, animals).
// Other surahs carry one of four geometric patterns.
import { mix } from './flat';

type Motif = 'arch' | 'dawn' | 'peaks' | 'storm' | 'honey' | 'night' | 'cave' | 'lamp' | 'web' | 'ornament' | 'smoke'
  | 'dunes' | 'rooms' | 'wind' | 'star' | 'moon' | 'rows' | 'pen' | 'stairs' | 'stars' | 'city' | 'sun' | 'fig' | 'time' | 'rope'
  | 'g0' | 'g1' | 'g2' | 'g3';

// [motif, colour] for the surahs whose name is a picture.
const NAMED: Record<number, [Motif, string]> = {
  1: ['arch', '#17a273'], 7: ['peaks', '#4d6f8f'], 13: ['storm', '#3f5378'], 15: ['peaks', '#8a5a3c'], 16: ['honey', '#b97a12'],
  17: ['night', '#2e3a8c'], 18: ['cave', '#1f6f78'], 24: ['lamp', '#a3790c'], 29: ['web', '#56627a'], 37: ['rows', '#6a52a8'],
  43: ['ornament', '#a8780e'], 44: ['smoke', '#655f80'], 46: ['dunes', '#bf6a32'], 49: ['rooms', '#8b5a3c'], 51: ['wind', '#2f84ad'],
  52: ['peaks', '#5e6b52'], 53: ['star', '#2b3a5e'], 54: ['moon', '#3d4f8f'], 61: ['rows', '#7a4fa0'], 68: ['pen', '#4a5d4e'],
  70: ['stairs', '#8d5fa8'], 77: ['wind', '#36789e'], 85: ['stars', '#283a6e'], 86: ['star', '#2f3656'], 89: ['dawn', '#cf6a2a'],
  90: ['city', '#a8573d'], 91: ['sun', '#c97a0e'], 92: ['night', '#2b3175'], 93: ['sun', '#c98a12'], 95: ['fig', '#7d4a8c'],
  97: ['night', '#352d7a'], 103: ['time', '#b9772a'], 111: ['rope', '#946338'], 113: ['dawn', '#c9602e'],
};
/** Deep colours for the other surahs (white text stays readable on each). */
const DEEP = ['#178a64', '#1f7fa8', '#6c4fc7', '#c2572f', '#2f6fbf', '#b8436a', '#3d8a3d', '#8a5a2b',
  '#4a5fb0', '#a0478f', '#0f8a83', '#c0682a', '#5a6cc4', '#6f8a22', '#9b3f4f', '#2c7f6e'];

export interface SurahTheme { c: string; e: string; m: Motif }
export function surahTheme(s: number): SurahTheme {
  const named = NAMED[s];
  const c = named ? named[1] : DEEP[(s * 5) % DEEP.length];
  return { c, e: mix(c, 0.32), m: named ? named[0] : (`g${s % 4}` as Motif) };
}
/** The theme as CSS variables (the path's hue tokens). */
export const themeVars = (s: number) => { const t = surahTheme(s); return `--hc:${t.c};--he:${t.e}`; };

const W = 'fill="#fff"';
const L = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"';
const dots = (pts: number[][], r = 1.8) => pts.map(([x, y, k]) => `<circle cx="${x}" cy="${y}" r="${k ?? r}" ${W}/>`).join('');
const geo = (k: number) => {
  if (k === 0) { // eight-pointed stars in a lattice
    const st = (x: number, y: number) => `<path d="M${x} ${y - 13}L${x + 4} ${y - 4}L${x + 13} ${y}L${x + 4} ${y + 4}L${x} ${y + 13}L${x - 4} ${y + 4}L${x - 13} ${y}L${x - 4} ${y - 4}Z" ${L} stroke-width="2"/>`;
    return st(40, 30) + st(84, 30) + st(62, 62) + st(106, 62) + st(40, 94) + st(84, 94);
  }
  if (k === 1) { // hexagons
    const hx = (x: number, y: number) => `<path d="M${x} ${y - 14}L${x + 12} ${y - 7}V${y + 7}L${x} ${y + 14}L${x - 12} ${y + 7}V${y - 7}Z" ${L} stroke-width="2"/>`;
    return hx(50, 30) + hx(74, 30) + hx(98, 30) + hx(62, 51) + hx(86, 51) + hx(110, 51) + hx(74, 72) + hx(98, 72) + hx(86, 93);
  }
  if (k === 2) return `<g ${L} stroke-width="2"><circle cx="86" cy="58" r="44"/><circle cx="86" cy="58" r="32"/><circle cx="86" cy="58" r="20"/></g>` + dots([[86, 14, 3], [130, 58, 3], [86, 102, 3], [42, 58, 3]]);
  return `<g ${L} stroke-width="2">${[0, 1, 2, 3].map((i) => `<path d="M${40 + i * 22} 10L${62 + i * 22} 58L${40 + i * 22} 106L${18 + i * 22} 58Z"/>`).join('')}</g>`;
};
function motifSvg(m: Motif): string {
  switch (m) {
    case 'arch': return `<path d="M50 116V58Q50 20 84 8Q118 20 118 58V116" ${L} stroke-width="6"/><path d="M64 116V62Q64 36 84 26Q104 36 104 62V116Z" ${W} opacity=".35"/>`;
    case 'dawn': return `<circle cx="84" cy="92" r="34" ${W} opacity=".35"/><circle cx="84" cy="92" r="20" ${W} opacity=".6"/><path d="M0 96Q50 84 130 94V130H0Z" fill="#000" opacity=".18"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M84 50V36" ${L} stroke-width="4" transform="rotate(${-60 + i * 30} 84 92)"/>`).join('')}`;
    case 'peaks': return `<path d="M10 116L48 50L68 80L90 34L130 116Z" ${W} opacity=".45"/><path d="M90 34L80 52L90 48L98 54Z M48 50L41 62L48 59L54 64Z" ${W}/>`;
    case 'storm': return `<path d="M44 52Q40 30 62 28Q72 12 92 20Q114 16 116 38Q130 44 122 58H48Q34 58 44 52Z" ${W} opacity=".5"/><path d="M86 62L74 86H86L78 110L102 78H90L98 62Z" ${W}/>`;
    case 'honey': { const hx = (x: number, y: number, o: number) => `<path d="M${x} ${y - 13}L${x + 11} ${y - 6.5}V${y + 6.5}L${x} ${y + 13}L${x - 11} ${y + 6.5}V${y - 6.5}Z" ${W} opacity="${o}"/>`; return hx(70, 30, .55) + hx(93, 30, .35) + hx(58, 52, .35) + hx(81, 52, .6) + hx(104, 52, .4) + hx(70, 74, .45) + hx(93, 74, .3) + hx(81, 96, .4); }
    case 'night': return `<path d="M92 22a26 26 0 1 0 22 40a20 20 0 1 1 -22 -40z" ${W} opacity=".8"/>` + dots([[40, 24], [58, 50, 1.4], [32, 70, 2.2], [112, 92, 1.6], [70, 96], [120, 20, 1.4]]);
    case 'cave': return `<path d="M20 120Q24 36 80 30Q128 36 130 120Z" ${W} opacity=".35"/><path d="M52 120Q56 70 82 68Q106 72 106 120Z" fill="#000" opacity=".35"/>` + dots([[34, 20], [64, 12, 1.4], [104, 16], [122, 34, 1.4]]);
    case 'lamp': return `<path d="M84 8V26" ${L} stroke-width="3"/><path d="M70 30H98L106 58Q84 80 62 58Z" ${W} opacity=".75"/><circle cx="84" cy="54" r="30" ${W} opacity=".2"/><path d="M74 86H94L90 96H78Z" ${W} opacity=".6"/>`;
    case 'web': return `<g ${L} stroke-width="1.8">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M84 56L${(84 + 60 * Math.cos(i * Math.PI / 4)).toFixed(1)} ${(56 + 60 * Math.sin(i * Math.PI / 4)).toFixed(1)}"/>`).join('')}${[16, 30, 44].map((r) => `<path d="${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i ? 'L' : 'M'}${(84 + r * Math.cos(i * Math.PI / 4)).toFixed(1)} ${(56 + r * Math.sin(i * Math.PI / 4)).toFixed(1)}`).join('')}"/>`).join('')}</g>`;
    case 'ornament': return `<g ${L} stroke-width="2.4"><path d="M84 8C104 28 104 48 84 58C64 48 64 28 84 8Z"/><path d="M84 58C104 68 104 88 84 108C64 88 64 68 84 58Z"/><path d="M40 58C60 38 80 38 84 58C80 78 60 78 40 58Z"/><path d="M128 58C108 38 88 38 84 58C88 78 108 78 128 58Z"/></g><circle cx="84" cy="58" r="6" ${W}/>`;
    case 'smoke': return `<g ${L} stroke-width="5" opacity=".7"><path d="M70 116Q54 96 72 80Q90 64 74 44Q62 30 78 14"/><path d="M98 116Q84 100 100 86Q116 70 102 52"/></g>`;
    case 'dunes': return `<circle cx="96" cy="30" r="14" ${W} opacity=".6"/><path d="M0 92Q40 62 80 84Q110 100 130 80V130H0Z" ${W} opacity=".3"/><path d="M20 110Q60 86 96 102Q116 110 130 102V130H20Z" ${W} opacity=".45"/>`;
    case 'rooms': return [0, 1, 2].map((i) => `<path d="M${46 + i * 28} 112V60Q${46 + i * 28} 42 ${58 + i * 28} 36Q${70 + i * 28} 42 ${70 + i * 28} 60V112" ${L} stroke-width="3.5"/>`).join('');
    case 'wind': return `<g ${L} stroke-width="4"><path d="M30 40H92Q108 40 106 26Q102 14 90 20"/><path d="M20 62H112Q128 62 126 78Q122 90 110 84"/><path d="M40 84H80Q94 84 92 96"/></g>`;
    case 'star': return `<path d="M84 18L92 46L120 54L92 62L84 90L76 62L48 54L76 46Z" ${W} opacity=".85"/>` + dots([[40, 28], [120, 100, 1.4], [46, 96, 2], [118, 18, 1.4]]);
    case 'moon': return `<circle cx="84" cy="56" r="34" ${W} opacity=".7"/><circle cx="72" cy="46" r="6" fill="#000" opacity=".08"/><circle cx="96" cy="68" r="8" fill="#000" opacity=".08"/>` + dots([[34, 24], [128, 100, 1.4], [40, 96]]);
    case 'rows': return `<g ${L} stroke-width="5">${[24, 44, 64, 84, 104].map((y, i) => `<path d="M${40 + (i % 2) * 8} ${y}H${126 - (i % 2) * 8}" stroke-dasharray="10 8"/>`).join('')}</g>`;
    case 'pen': return `<path d="M54 102L104 22L114 28L64 108L50 116Z" ${W} opacity=".75"/><path d="M40 112Q70 100 100 112" ${L} stroke-width="3"/>`;
    case 'stairs': return `<path d="M40 116V96H62V76H84V56H106V36H128V116Z" ${W} opacity=".4"/><path d="M40 96H62V76H84V56H106V36H128" ${L} stroke-width="3"/>`;
    case 'stars': { const p = [[46, 28], [70, 44], [92, 30], [110, 52], [96, 80], [66, 82], [50, 104]]; return `<path d="M${p.map(([x, y]) => `${x} ${y}`).join('L')}" ${L} stroke-width="1.6" opacity=".7"/>` + dots(p.map(([x, y], i) => [x, y, i % 3 ? 2.4 : 3.6])); }
    case 'city': return `<path d="M30 116V78H46V62H58V86H70V48Q78 34 86 48V86H98V70H112V92H124V116Z" ${W} opacity=".45"/>` + dots([[78, 26, 1.6], [44, 30], [116, 40, 1.4]]);
    case 'sun': return `<circle cx="84" cy="56" r="22" ${W} opacity=".75"/>${Array.from({ length: 12 }, (_, i) => `<path d="M84 22V12" ${L} stroke-width="4" transform="rotate(${i * 30} 84 56)"/>`).join('')}`;
    case 'fig': return `<path d="M80 30Q108 44 104 76Q100 102 78 102Q56 100 56 74Q56 48 80 30Z" ${W} opacity=".55"/><path d="M80 30L78 18" ${L} stroke-width="4"/><path d="M92 26Q110 14 122 28Q108 40 92 26Z" ${W} opacity=".8"/>`;
    case 'time': return `<path d="M56 14H112M56 106H112M62 14Q62 50 84 60Q62 70 62 106M106 14Q106 50 84 60Q106 70 106 106" ${L} stroke-width="4"/><path d="M70 98Q84 82 98 98Z" ${W} opacity=".75"/>`;
    case 'rope': return `<g ${L} stroke-width="6" opacity=".7"><path d="M40 20Q60 30 52 48Q44 66 64 76Q84 86 76 104"/><path d="M60 14Q80 24 72 42Q64 60 84 70Q104 80 96 98" opacity=".7"/></g>`;
    default: return geo(Number(m.slice(1)));
  }
}
/** The banner's motif: white shapes the banner shows faintly behind its text. */
export function motifEl(s: number): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 130 120');
  el.setAttribute('class', 'lp-motif');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = motifSvg(surahTheme(s).m);
  return el;
}
