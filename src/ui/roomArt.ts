// The room's pieces and seasons, drawn flat two-tone like the rest of the reward art, in the room's own
// 320×200 coordinates (src/ui/room.ts): the window at x 26–102, the flame frame at 120–164, the shelves at
// 190–306, the floor from y 146, the rug round x 130. `still` leaves out the small SVG animations.
import type { Slot } from '../data/roomItems';
import { circlePath, edge, mix, shine, starPath, two } from './flat';

/** The part of the room each place takes, for the shop's tiles (x, y, w, h). */
export const SLOT_BOX: Record<Slot, [number, number, number, number]> = {
  plant: [-4, 96, 50, 96], side: [226, 108, 94, 86], rug: [36, 150, 188, 38], curtain: [8, 10, 112, 100], hang: [99, 0, 24, 44],
  wall: [150, 60, 120, 90], floor: [60, 146, 140, 54], view: [26, 26, 76, 78], seat: [34, 118, 70, 76], pet: [188, 146, 46, 46],
};
/** Living pieces read the day (round 5): the sprout grows with the streak. */
let growDays = 0;
export const setGrow = (days: number) => { growDays = days; };

const leaf = (x: number, y: number, len: number, ang: number, w = 0.32) => {
  const a = (ang * Math.PI) / 180, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const nx = -Math.sin(a) * len * w, ny = Math.cos(a) * len * w, mx = (x + ex) / 2, my = (y + ey) / 2;
  return `M${x} ${y}Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${x} ${y}Z`;
};
const pot = (c1: string, c2: string, rim: string) => {
  const body = 'M9 165H33L30 186H12Z', lip = 'M6 160H36V167H6Z';
  return `${edge(body, mix(c2, -0.35), 2)}${two(body, c1, c2)}${edge(lip, mix(c2, -0.35), 2)}${two(lip, rim, c2, 0, -1.5)}`;
};

function plant(id: string, still: boolean): string {
  if (id === 'sprout') return sprout(still);
  const sway = still ? '' : '<animateTransform attributeName="transform" type="rotate" values="-1.2 21 160;1.2 21 160;-1.2 21 160" dur="6s" repeatCount="indefinite"/>';
  if (id === 'fern') {
    const fr = [-150, -128, -106, -90, -72, -52, -30].map((a, i) => two(leaf(21, 160, 30 + (i % 3) * 6, a, 0.22), '#6fcf74', '#3f9f52', -1, -1)).join('');
    return `<g>${fr}${sway}</g>${pot('#d9774a', '#b85a33', '#e8915f')}`;
  }
  if (id === 'palm') {
    const trunk = 'M19 162Q16 140 21 112L25 112Q21 140 24 162Z';
    const fr = [-170, -140, -110, -70, -40, -10].map((a) => two(leaf(23, 112, 26, a, 0.18), '#4fbf6e', '#2f8f4f', -1, -1)).join('');
    return `<g>${two(trunk, '#b8875a', '#8f6236')}<path d="M18 150H25M18 138H24M19 126H24" stroke="#7a5230" stroke-width="1.4" opacity=".7"/>${fr}${sway}</g>${pot('#3d8fc8', '#2a6ea3', '#5aa9e0')}`;
  }
  if (id === 'jasmine') {
    const bush = [[21, 140, 15], [10, 150, 10], [32, 150, 10], [21, 128, 10]].map(([x, y, r]) => two(circlePath(x, y, r), '#5fb86a', '#3f8f4f', -1.5, -1.5)).join('');
    const fl = [[14, 136], [26, 132], [20, 146], [8, 152], [33, 147], [24, 122], [29, 141]].map(([x, y]) => `<path d="${starPath(x, y, 3, 1.3, 5)}" fill="#fff"/><path d="${circlePath(x, y, 0.9)}" fill="#ffe08a"/>`).join('');
    return `<g>${bush}${fl}${sway}</g>${pot('#f3e6cf', '#d9c4a0', '#fff6e4')}`;
  }
  // olive: a small twisting tree with silver-green leaves and dark olives
  const trunk = 'M19 162Q14 146 22 136Q27 128 20 118L24 117Q31 128 26 138Q20 148 24 162Z';
  const crown = [[20, 112, 13], [9, 120, 9], [32, 118, 10], [22, 100, 9]].map(([x, y, r]) => two(circlePath(x, y, r), '#9cc48a', '#6f9a63', -1.5, -1.5)).join('');
  const olives = [[12, 122], [27, 110], [33, 122], [19, 104], [24, 119]].map(([x, y]) => two(`M${x - 1.6} ${y}a1.6 2.2 0 1 0 3.2 0a1.6 2.2 0 1 0 -3.2 0z`, '#5b3f6e', '#3d2a4a', -.5, -.5)).join('');
  return `<g>${two(trunk, '#9a7a5a', '#735638')}${crown}${olives}${sway}</g>${pot('#c8643c', '#9e4a2a', '#de7f52')}`;
}

/** The sprout grows with the streak: two leaves, then four, a stem with leaves at 7 days, buds at 30, in flower at 100. */
function sprout(still: boolean): string {
  const d = growDays;
  const sway = still ? '' : '<animateTransform attributeName="transform" type="rotate" values="-1.6 21 160;1.6 21 160;-1.6 21 160" dur="5s" repeatCount="indefinite"/>';
  const h = d < 3 ? 10 : d < 7 ? 18 : d < 30 ? 34 : d < 100 ? 48 : 60;
  const top = 160 - h;
  let g = `<path d="M21 160Q19 ${160 - h / 2} 21 ${top}" stroke="#4f9a4a" stroke-width="${d < 7 ? 2 : 3}" fill="none" stroke-linecap="round"/>`;
  const pairs = d < 3 ? 1 : d < 7 ? 2 : d < 30 ? 3 : 4;
  for (let i = 0; i < pairs; i++) {
    const y = top + 4 + i * (h - 6) / pairs, len = 7 + i * 1.5 + (d >= 30 ? 3 : 0);
    g += two(leaf(21, y, len, -160 + i * 6, 0.34), '#7ed67a', '#4fa65a', -.8, -.8) + two(leaf(21, y + 2, len, -20 - i * 6, 0.34), '#7ed67a', '#4fa65a', -.8, -.8);
  }
  if (d >= 30) {
    const fl = d >= 100 ? [[21, top - 3], [11, top + 10], [31, top + 8], [14, top + 24], [29, top + 22]] : [[21, top - 2], [13, top + 10]];
    g += fl.map(([x, y]) => d >= 100
      ? `<path d="${starPath(x, y, 5, 2.4, 5)}" fill="#ff9ab8"/><path d="${circlePath(x, y, 1.6)}" fill="#ffe08a"/>`
      : `<path d="${circlePath(x, y, 2.6)}" fill="#ffb6c8"/>`).join('');
  }
  const soil = '<path d="M9 162Q21 157 33 162" stroke="#6a4a2a" stroke-width="3" fill="none" stroke-linecap="round"/>';
  return `<g>${g}${sway}</g>${soil}${pot('#e8d6b4', '#c9b289', '#f4e6c8')}`;
}

const steam = (x: number, y: number, night: boolean, still: boolean, n = 2) => still ? '' : Array.from({ length: n }, (_, i) =>
  `<path d="M${x + i * 4} ${y}Q${x - 3 + i * 4} ${y - 7} ${x + 1 + i * 4} ${y - 13}Q${x + 5 + i * 4} ${y - 19} ${x + i * 4} ${y - 25}" stroke="${night ? '#e6e0ff' : '#fff'}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0">`
  + `<animate attributeName="opacity" values="0;.6;0" dur="3.6s" begin="${i * 1.8}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 3;0 -5" dur="3.6s" begin="${i * 1.8}s" repeatCount="indefinite"/></path>`).join('');

function side(id: string, night: boolean, still: boolean): string {
  if (id === 'lamp') {
    // A low desk with a reading lamp, lit at night (a pool of warm light on the floor).
    const top = 'M238 156H310V162H238Z', legs = 'M244 162V188M304 162V188', shade = 'M262 128H292L298 142H256Z';
    const on = night ? `<path d="M256 142L236 192H318L298 142Z" fill="#ffe7a3" opacity=".22"/><ellipse cx="277" cy="190" rx="44" ry="7" fill="#ffd27a" opacity=".35"/><circle cx="277" cy="140" r="26" fill="url(#rmglow)"/>` : '';
    return `${on}<path d="${legs}" stroke="#6e4a22" stroke-width="4" stroke-linecap="round"/>${edge(top, '#5a3a1a', 2)}${two(top, '#b07a42', '#8a5a2a', 0, -1.5)}
      <path d="M277 142V154" stroke="#7a5a1a" stroke-width="3"/>${two('M268 152H286L284 156H270Z', '#e0b04a', '#b07f22', -.6, -.6)}
      ${edge(shade, '#8a5a12', 1.5)}${two(shade, night ? '#fff0b8' : '#f3e2b8', night ? '#ffd27a' : '#d9c08a', -1, -1)}
      ${two('M244 148H262V156H244Z', '#3a6fb0', '#2a4f80', -.5, -.5)}${two('M246 143H260V148H246Z', '#c0473a', '#8e2f26', -.5, -.5)}`;
  }
  if (id === 'dallah') {
    // A dallah on a round tray with small finjan cups, steam rising.
    const tray = 'M240 182Q274 172 308 182Q274 192 240 182Z';
    const body = 'M262 178Q258 164 266 156Q262 150 270 146H280Q288 150 284 156Q292 164 288 178Z';
    const lid = 'M268 146Q275 134 282 146Z', spout = 'M264 160Q252 152 248 140Q254 142 258 148Q262 154 268 158Z';
    const cup = (x: number) => `${two(`M${x - 5} 174H${x + 5}L${x + 3} 181H${x - 3}Z`, '#fff6e4', '#d9c4a0', -.5, -.5)}<path d="M${x - 4} 175H${x + 4}" stroke="#3dd1ad" stroke-width="1.2"/>`;
    return `${edge(tray, '#7a5a1a', 2)}${two(tray, '#e8c66a', '#c79a32')}${steam(250, 140, night, still)}${edge(spout, '#7a5a1a', 1)}${two(spout, '#f2c94c', '#cf9f22', -.6, -.6)}
      ${edge(body, '#7a5a1a', 1.5)}${two(body, '#f2c94c', '#cf9f22', -1.2, -1.2)}<path d="M262 166H288" stroke="#a8650e" stroke-width="1.6"/>
      ${two(lid, '#ffd970', '#e0a830', -.6, -.6)}<path d="M275 134V129" stroke="#e0a830" stroke-width="2"/><path d="${circlePath(275, 128, 2)}" fill="#ffe08a"/>
      <path d="M288 154Q298 160 290 172" stroke="#cf9f22" stroke-width="2.4" fill="none"/>${shine('M266 172Q264 162 270 156', 1.4, .55)}${cup(296)}${cup(250)}`;
  }
  if (id === 'books') {
    // A low bookcase, its top holding the mushaf open on a rehal.
    const box = 'M238 142H310V190H238Z';
    const spines = [[242, 9, '#c0473a'], [252, 7, '#2f8a5a'], [260, 10, '#3a6fb0'], [271, 8, '#e0a33a'], [280, 9, '#7a5cd0'], [290, 7, '#2a2d38'], [298, 9, '#1f8a5a']]
      .map(([x, w, c], i) => `${two(`M${x} ${i % 3 ? 150 : 152}H${(x as number) + (w as number)}V166H${x}Z`, c as string, mix(c as string, -0.25), -.6, -.4)}<path d="M${x} 158H${(x as number) + (w as number)}" stroke="#f2c94c" stroke-width="1" opacity=".8"/>`).join('');
    const low = [[242, 12, '#8e2f26'], [256, 8, '#c99a5c'], [266, 12, '#2a4f80'], [280, 10, '#1f6b45'], [292, 14, '#b07a42']]
      .map(([x, w, c]) => two(`M${x} 172H${(x as number) + (w as number)}V186H${x}Z`, c as string, mix(c as string, -0.25), -.6, -.4)).join('');
    const x1 = 'M262 140L286 126M286 140L262 126', book = 'M256 128Q265 121 274 128Q283 121 292 128L291 133Q283 127 274 133Q265 127 257 133Z';
    return `${edge(box, '#4a2f14', 3)}${two(box, '#9a6a3a', '#7a5028', 0, -2)}<path d="M240 168H308" stroke="#5a3a1a" stroke-width="3"/>${spines}${low}
      <path d="${x1}" stroke="#7a4a22" stroke-width="4" stroke-linecap="round"/>${edge(book, '#0f4a32', 1.5)}${two(book, '#1f8a5a', '#136e46', 0, -1)}
      <path d="M259 128Q266 123 273 128M275 128Q282 123 289 128" stroke="#fff6e0" stroke-width="2.4" fill="none"/>`;
  }
  if (id === 'corner') {
    // A prayer corner: a small mihrab niche on the wall, a prayer mat with a tasbih and a folded book stand.
    const niche = 'M256 146V132Q256 120 274 116Q292 120 292 132V146Z', inner = 'M261 146V134Q261 125 274 121Q287 125 287 134V146Z';
    const mat = 'M244 168L300 160L312 186L252 194Z', arch = 'M258 186Q256 176 266 170Q276 168 280 174L282 184Z';
    const beads = Array.from({ length: 11 }, (_, i) => { const a = (i / 11) * Math.PI * 2; return `<circle cx="${(294 + Math.cos(a) * 6).toFixed(1)}" cy="${(178 + Math.sin(a) * 4).toFixed(1)}" r="1.6" fill="#8e57e0"/>`; }).join('');
    return `${edge(niche, night ? '#2e2852' : '#c9a77c', 2)}${two(niche, night ? '#5b4a7a' : '#ead2ae', night ? '#463a62' : '#d9bc92', 0, -1)}<path d="${inner}" fill="${night ? '#2e2852' : '#c99a6a'}" opacity=".55"/>
      <path d="M274 124V128" stroke="#d4a22a" stroke-width="1.2"/>${night ? `<circle cx="274" cy="136" r="9" fill="url(#rmglow)"/>` : ''}<path d="M271 131H277L276 139H272Z" fill="#ffe9a8"/>
      ${edge(mat, '#13442c', 2)}${two(mat, '#2f8a5a', '#1f6b45', 0, -1)}<path d="${arch}" fill="none" stroke="#f3d27a" stroke-width="1.8"/><path d="M248 171L302 163" stroke="#f3d27a" stroke-width="1" stroke-dasharray="2 2"/>${beads}`;
  }
  if (id === 'dates') {
    const basket = 'M246 168H302Q300 186 274 187Q248 186 246 168Z';
    const dates = [[256, 166], [264, 163], [272, 166], [280, 162], [288, 166], [268, 159], [284, 158], [276, 157], [296, 167], [252, 168]]
      .map(([x, y]) => two(`M${x - 4} ${y}a4 2.6 0 1 0 8 0a4 2.6 0 1 0 -8 0z`, '#9a4a26', '#6e2f16', -1, -1)).join('');
    return `${dates}${edge(basket, '#6e4a22', 2)}${two(basket, '#e2b06a', '#c08a42')}<path d="M249 174H299M252 180H296" stroke="#a8733a" stroke-width="1.4" stroke-dasharray="3 2"/>${shine('M252 171H270', 1.4, .5)}`;
  }
  if (id === 'tea') {
    const top = 'M240 160Q274 150 308 160Q274 170 240 160Z';
    const legs = 'M250 163V186M298 163V186M274 168V188';
    const potB = 'M262 158Q262 142 274 142Q286 142 286 158Z';
    const glass = (x: number) => `${two(`M${x} 146H${x + 8}L${x + 7} 158H${x + 1}Z`, '#ffd0a0', '#e08a4a', -.5, -.5)}${shine(`M${x + 2} 149V155`, 1, .6)}`;
    return `${steam(248, 142, night, still)}<path d="${legs}" stroke="#7a5230" stroke-width="4" stroke-linecap="round"/>${edge(top, '#6e4a22', 3)}${two(top, '#c99a6a', '#a8784a', 0, -2)}
      ${edge(potB, '#7a5a1a', 1.5)}${two(potB, '#f2c94c', '#cf9f22', -1, -1)}<path d="M286 150Q295 146 297 140" stroke="#cf9f22" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="${circlePath(274, 140, 2.6)}" fill="#cf9f22"/>${shine('M266 154Q266 147 271 145', 1.4, .55)}${glass(246)}${glass(292)}`;
  }
  if (id === 'rehal') {
    const x1 = 'M252 186L290 146M296 186L258 146';
    const book = 'M246 150Q260 140 274 150Q288 140 302 150L300 158Q288 150 274 158Q260 150 248 158Z';
    return `<path d="${x1}" stroke="#7a4a22" stroke-width="7" stroke-linecap="round"/><path d="${x1}" stroke="#b07a42" stroke-width="4" stroke-linecap="round" transform="translate(-1 -1)"/>
      ${edge(book, '#0f4a32', 2)}${two(book, '#1f8a5a', '#136e46', 0, -1)}<path d="M250 150Q261 143 273 150M275 150Q287 143 298 150" stroke="#fff6e0" stroke-width="3.2" fill="none"/>
      <path d="M274 150V157" stroke="#d4a22a" stroke-width="1.4"/>`;
  }
  // incense: a gold mabkhara with soft smoke
  const base = 'M260 186H288L284 176H264Z', bowl = 'M258 176Q258 160 274 160Q290 160 290 176Z', lid = 'M266 160Q266 148 274 146Q282 148 282 160Z';
  const smoke = [0, 1, 2].map((i) => `<path d="M${272 + i * 3} 144Q${266 + i * 4} 132 ${276 + i * 2} 122Q${284} 112 ${276 + i * 3} 100" stroke="${night ? '#d9d2ff' : '#ffffff'}" stroke-width="${3 - i * 0.6}" fill="none" stroke-linecap="round" opacity="0">${still ? '' : `<animate attributeName="opacity" values="0;.55;0" dur="5s" begin="${i * 1.6}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 6;0 -6" dur="5s" begin="${i * 1.6}s" repeatCount="indefinite"/>`}</path>`).join('');
  return `${smoke}${edge(base, '#8a5a12', 2)}${two(base, '#e8b84a', '#c08a22')}${edge(bowl, '#8a5a12', 2)}${two(bowl, '#f2c94c', '#cf9f22')}
    <path d="M262 170H286" stroke="#a8650e" stroke-width="1.6" stroke-dasharray="2 3"/>${two(lid, '#ffd970', '#e0a830', -1, -1)}<path d="${circlePath(274, 145, 2.6)}" fill="#ffe9a8"/>${shine('M263 172Q263 165 270 163', 1.4, .55)}`;
}

/** The rug: the default or a bought one (shape always the same, so the character's place stays). */
export function rugArt(id: string | undefined, night: boolean): string {
  const shape = 'M40 168Q130 150 220 168Q130 192 40 168Z', inner = 'M66 168Q130 156 194 168Q130 184 66 168Z';
  const glow = night ? '<ellipse cx="128" cy="166" rx="80" ry="34" fill="url(#rmglow)"/>' : '';
  const P: Record<string, [string, string, string, string]> = {
    kilim: ['#e2b77a', '#c99a5a', '#8a6232', '#b23d55'], prayer: ['#2f8a5a', '#1f6b45', '#13442c', '#f3d27a'],
    persian: ['#3a5fb0', '#2a4790', '#1a2c5c', '#f0e2c0'], royal: ['#f4e6c4', '#e2cfa0', '#a07a35', '#d4a22a'],
  };
  const [c1, c2, ed, trim] = (id && P[id]) || ['#d9566a', '#b23d55', '#7a2f3f', '#ffd27a'];
  let pat = `<path d="${starPath(130, 168, 8, 3.6, 8)}" fill="${trim}" opacity=".9"/>`;
  if (id === 'kilim') pat = `<path d="M74 168L84 162L94 168L104 162L114 168L124 162L134 168L144 162L154 168L164 162L174 168L184 162" stroke="${trim}" stroke-width="2.4" fill="none" stroke-linejoin="round"/><path d="M84 172L94 176L104 172L114 176L124 172L134 176L144 172L154 176L164 172L174 176" stroke="#5a3a8a" stroke-width="1.8" fill="none"/>`;
  if (id === 'prayer') pat = `<path d="M100 172Q100 160 130 156Q160 160 160 172" stroke="${trim}" stroke-width="2.2" fill="none"/><path d="M112 172Q112 164 130 161Q148 164 148 172" stroke="${trim}" stroke-width="1.4" fill="none" opacity=".8"/><path d="${starPath(130, 165, 3.2, 1.4, 8)}" fill="${trim}"/>`;
  if (id === 'persian') pat = `<path d="M108 168L130 160L152 168L130 176Z" fill="${trim}" opacity=".9"/><path d="M118 168L130 164L142 168L130 172Z" fill="#b23d55"/>${[84, 96, 164, 176].map((x) => `<path d="${circlePath(x, 168, 2.2)}" fill="${trim}"/>`).join('')}`;
  if (id === 'royal') pat = `<path d="M54 168Q130 154 206 168Q130 188 54 168Z" fill="none" stroke="${trim}" stroke-width="1.6"/>${`<path d="${starPath(130, 168, 11, 5, 8)}" fill="${trim}"/><path d="${starPath(130, 168, 5, 2.4, 8)}" fill="#fff6dc"/>`}${[100, 160].map((x) => `<path d="${starPath(x, 168, 4, 1.8, 8)}" fill="${trim}" opacity=".85"/>`).join('')}`;
  return `${edge(shape, ed, 3)}${two(shape, c1, c2)}<path d="${inner}" fill="none" stroke="${trim}" stroke-width="2" stroke-dasharray="5 4" opacity=".9"/>${pat}${glow}`;
}

function curtain(id: string): string {
  if (id === 'mashrabiya') {
    // Turned-wood lattice shutters opened to the sides of the window.
    const panel = (x: number) => {
      const d = `M${x} 30H${x + 22}V104H${x}Z`;
      let g = '';
      for (let yy = 34; yy < 102; yy += 8) for (let xx = x + 3; xx < x + 21; xx += 6) g += `<path d="${circlePath(xx + 1.5, yy + 2, 2.1)}" fill="none" stroke="#e8c08a" stroke-width="1.1"/>`;
      return `${edge(d, '#4a2f14', 2)}${two(d, '#8a5a2a', '#6e4520', 0, -1)}<g clip-path="url(#rmmash${x})">${g}</g><clipPath id="rmmash${x}"><path d="M${x + 2} 32H${x + 20}V102H${x + 2}Z"/></clipPath>
        <path d="M${x} 30H${x + 22}M${x} 104H${x + 22}" stroke="#5a3a1a" stroke-width="2.4"/>${shine(`M${x + 3} 36V98`, 1.2, .3)}`;
    };
    const top = 'M18 20Q64 8 110 20V30H18Z';
    return `${panel(14)}${panel(92)}${edge(top, '#4a2f14', 2)}${two(top, '#9a6a3a', '#7a5028', 0, -1.5)}<path d="M28 26Q64 16 100 26" stroke="#e8c08a" stroke-width="1.4" fill="none" stroke-dasharray="3 2"/>`;
  }
  const L = 'M16 17H40Q33 56 39 106H16Z', R = 'M112 17H88Q95 56 89 106H112Z';
  const rod = `<path d="M10 16H118" stroke="#8a5a2a" stroke-width="3" stroke-linecap="round"/><path d="${circlePath(10, 16, 2.6)}${circlePath(118, 16, 2.6)}" fill="#d4a22a"/>`;
  if (id === 'sheer') {
    const folds = '<path d="M22 20Q20 60 23 104M30 20Q28 60 31 104M106 20Q108 60 105 104M98 20Q100 60 97 104" stroke="#fff" stroke-width="1.2" opacity=".5" fill="none"/>';
    return `<path d="${L}${R}" fill="#ffffff" opacity=".55"/>${folds}${rod}`;
  }
  const val = 'M12 15H116V27Q104 33 92 27Q80 33 64 27Q48 33 36 27Q24 33 12 27Z';
  const tie = (x: number) => `${two(`M${x - 6} 66H${x + 6}V71H${x - 6}Z`, '#f2c94c', '#cf9f22', 0, -1)}`;
  return `${edge(L, '#3a1030', 2)}${two(L, '#8e2a5e', '#6a1c46')}${edge(R, '#3a1030', 2)}${two(R, '#8e2a5e', '#6a1c46')}
    <path d="M24 22Q22 60 26 104M100 22Q102 60 98 104" stroke="#b44a82" stroke-width="2" opacity=".6" fill="none"/>${tie(29)}${tie(99)}${rod}
    ${edge(val, '#3a1030', 2)}${two(val, '#a8366e', '#7a2450', 0, -1.5)}<path d="M14 27Q24 33 36 27Q48 33 64 27Q80 33 92 27Q104 33 114 27" stroke="#f2c94c" stroke-width="1.6" fill="none"/>`;
}

function hang(id: string, night: boolean, still: boolean): string {
  const M: Record<string, [string, string, string]> = {
    brass: ['#d9a53a', '#b07f22', '#7a5212'], gold: ['#ffd25e', '#e09a1f', '#a8650e'],
    silver: ['#e8eef6', '#b8c4d4', '#6a7a90'], bronze: ['#e3a06a', '#b8743f', '#7a4a22'], glass: ['#d9a53a', '#b07f22', '#7a5212'],
  };
  const [m1, m2, md] = M[id] ?? M.brass;
  const x = 111, cap = `M${x - 7} 16L${x} 9L${x + 7} 16Z`, body = `M${x - 8} 17H${x + 8}L${x + 6} 34H${x - 6}Z`, foot = `M${x - 4} 35H${x + 4}L${x} 40Z`;
  const panes = id === 'glass'
    ? `<path d="M${x - 6} 19H${x - 1}V32H${x - 4.5}Z" fill="#3dd1ad"/><path d="M${x - 1} 19H${x + 1}V32H${x - 1}Z" fill="#ffe08a"/><path d="M${x + 1} 19H${x + 6}L${x + 4.5} 32H${x + 1}Z" fill="#ff7a9a"/>`
    : `<path d="M${x - 6} 19H${x + 6}L${x + 4.5} 32H${x - 4.5}Z" fill="#ffe9a8"/>`;
  const prize = id === 'gold' || id === 'silver' || id === 'bronze';
  const glowR = night ? 22 : 14;
  const glow = `<circle cx="${x}" cy="26" r="${glowR}" fill="url(#rmglow)" opacity="${night ? 1 : 0.7}">${still ? '' : '<animate attributeName="opacity" values=".7;1;.7" dur="3.2s" repeatCount="indefinite"/>'}</circle>`;
  const star = prize ? `${edge(starPath(x, 7, 4.5, 2, 8), md, 1)}${two(starPath(x, 7, 4.5, 2, 8), m1, m2, -.6, -.6)}` : '';
  const glint = prize && !still ? `<path d="${starPath(x + 6, 20, 3, 0.8, 4)}" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;.7;.8;.9;1" dur="4s" repeatCount="indefinite"/></path>` : '';
  return `<path d="M${x} 0V10" stroke="${md}" stroke-width="1.4"/>${glow}${edge(cap, md, 1.5)}${two(cap, m1, m2, -1, -1)}${panes}
    <path d="${body}" fill="none" stroke="${m2}" stroke-width="2.2"/><path d="M${x} 18V33M${x - 7} 25H${x + 7}" stroke="${m2}" stroke-width="1.2" opacity=".8"/>
    ${two(foot, m1, m2, -.6, -.6)}${star}${glint}`;
}

/** A piece in its place. */
export function itemArt(id: string, slot: Slot, night: boolean, still: boolean): string {
  if (slot === 'wall') return wallArt(id, night);
  if (slot === 'floor') return floorArt(id, night);
  if (slot === 'view') return viewArt(id, night ? 'night' : 'day');
  if (slot === 'seat') return seat(id);
  if (slot === 'pet') return cat(id, night, still);
  if (slot === 'plant') return plant(id, still);
  if (slot === 'side') return side(id, night, still);
  if (slot === 'curtain') return curtain(id);
  if (slot === 'hang') return hang(id, night, still);
  return rugArt(id, night);
}

const along = (t: number): [number, number] => {
  // the garland's line: two shallow dips across the top (M0 3 Q80 24 160 6 Q240 24 320 3)
  const [a, b, c, u] = t < 0.5 ? [[0, 3], [80, 24], [160, 6], t * 2] as const : [[160, 6], [240, 24], [320, 3], t * 2 - 1] as const;
  const k = 1 - u;
  return [k * k * a[0] + 2 * k * u * b[0] + u * u * c[0], k * k * a[1] + 2 * k * u * b[1] + u * u * c[1]];
};
/** The season's touches: Ramadan lanterns and a crescent in the window, Eid pennants and lights, Dhul Hijjah pennants. */
export function seasonArt(season: string | null, night: boolean, still: boolean): { top: string; window: string } {
  if (!season) return { top: '', window: '' };
  const line = '<path d="M0 3Q80 24 160 6Q240 24 320 3" stroke="#6a4a2a" stroke-width="1.2" fill="none" opacity=".8"/>';
  const n = 13, pts = Array.from({ length: n }, (_, i) => along((i + 0.5) / n));
  if (season === 'ramadan') {
    const cols: [string, string][] = [['#ffd25e', '#e09a1f'], ['#3dd1ad', '#1f9a7e'], ['#ff8a5c', '#d9603a']];
    const lamps = pts.map(([x, y], i) => {
      const [c1, c2] = cols[i % 3], b = `M${x - 4} ${y + 4}H${x + 4}L${x + 3} ${y + 13}H${x - 3}Z`;
      const tw = still ? '' : `<animate attributeName="opacity" values=".55;1;.55" dur="${2.6 + (i % 4) * 0.4}s" begin="${(i % 5) * 0.3}s" repeatCount="indefinite"/>`;
      return `<path d="M${x} ${y}V${y + 3}" stroke="#6a4a2a" stroke-width="1"/>${night ? `<circle cx="${x}" cy="${y + 9}" r="7" fill="url(#rmglow)">${tw}</circle>` : ''}
        <path d="M${x - 3.5} ${y + 4}L${x} ${y + 1.5}L${x + 3.5} ${y + 4}Z" fill="${c2}"/>${two(b, c1, c2, -.6, -.6)}<path d="M${x - 2} ${y + 6}H${x + 2}V${y + 11}H${x - 2}Z" fill="#fff6c9" opacity=".85"/>`;
    }).join('');
    const cres = `<path d="M45 33V42" stroke="#f2c94c" stroke-width=".9"/><path d="M40 50a7 7 0 1 0 10 -7a5.4 5.4 0 1 1 -10 7z" fill="#ffd25e"/><path d="${starPath(53, 45, 2.6, 1.1, 5)}" fill="#ffd25e"/>`;
    return { top: `${line}${lamps}`, window: cres };
  }
  const cols = season === 'hajj' ? ['#ffffff', '#3dbf7a'] : ['#ff7a8a', '#ffd25e', '#3dd1ad', '#8a7af0'];
  const flags = pts.map(([x, y], i) => `<path d="M${x - 5} ${y}L${x + 5} ${y + 0.5}L${x} ${y + 10}Z" fill="${cols[i % cols.length]}" stroke="${mix(cols[i % cols.length], -0.3)}" stroke-width=".6"/>`).join('');
  const lights = season === 'hajj' ? '' : Array.from({ length: 26 }, (_, i) => {
    const [x, y] = along((i + 0.25) / 26);
    const tw = still ? '' : `<animate attributeName="opacity" values=".35;1;.35" dur="${1.8 + (i % 5) * 0.35}s" begin="${(i % 7) * 0.25}s" repeatCount="indefinite"/>`;
    return `<circle cx="${x.toFixed(1)}" cy="${(y + 1.5).toFixed(1)}" r="1.4" fill="#fff4c4">${tw}</circle>`;
  }).join('');
  return { top: `${line}${flags}${lights}`, window: '' };
}

/** The wall (round 5): wood panels below a rail, a zellige dado, or plaster arches in relief. The window, frame and
 *  shelves are drawn over it. */
export function wallArt(id: string | undefined, night: boolean): string {
  const wall = night ? '#3b3466' : '#f3e2c7', wallSh = night ? '#2e2852' : '#e6cfac';
  if (id === 'panels') {
    const w1 = night ? '#5a4470' : '#b98a5a', w2 = night ? '#46365c' : '#9a6e44';
    let g = `<rect y="78" width="320" height="68" fill="${w2}"/><rect y="76" width="320" height="5" fill="${mix(w2, -0.25)}"/>`;
    for (let x = 4; x < 320; x += 40) g += `${two(`M${x} 86H${x + 32}V140H${x}Z`, w1, w2, -1.5, -1.5)}${shine(`M${x + 4} 90V134`, 1.2, .25)}`;
    return g + [24, 104, 184, 264].map((x) => `<path d="M${x} 0V76" stroke="${wallSh}" stroke-width="2" opacity=".6"/>`).join('');
  }
  if (id === 'zellige') {
    const cols = night ? ['#2f6f8a', '#3a8a6a', '#d9d2ff', '#26507a'] : ['#2f8ab0', '#2fa37a', '#ffffff', '#1f5f9a'];
    let g = `<rect y="92" width="320" height="54" fill="${cols[2]}"/>`;
    for (let y = 96, r = 0; y < 146; y += 12, r++) for (let x = (r % 2) * 6; x < 324; x += 12) {
      const c = cols[(Math.floor(x / 12) + r) % 2 ? 0 : 1];
      g += `<path d="${starPath(x, y + 4, 5.4, 2.6, 8)}" fill="${c}"/><path d="${circlePath(x, y + 4, 1.2)}" fill="${cols[3]}"/>`;
    }
    return g + `<rect y="88" width="320" height="5" fill="${cols[3]}"/><rect y="90" width="320" height="1.4" fill="#fff" opacity=".5"/>`;
  }
  if (id === 'arches') {
    let g = '';
    for (const x of [116, 196, 276]) {
      const d = `M${x - 30} 140V64Q${x - 30} 30 ${x} 24Q${x + 30} 30 ${x + 30} 64V140Z`;
      g += `<path d="${d}" fill="${wallSh}" opacity=".7"/><path d="${d}" fill="none" stroke="${mix(wall, 0.3)}" stroke-width="2"/><path d="M${x - 24} 66Q${x - 24} 38 ${x} 32Q${x + 24} 38 ${x + 24} 66" fill="none" stroke="${mix(wallSh, -0.1)}" stroke-width="1.4" stroke-dasharray="3 3"/>`;
    }
    return `<rect width="320" height="146" fill="${wall}"/>${g}<rect y="136" width="320" height="10" fill="${mix(wallSh, -0.08)}"/>`;
  }
  return [40, 120, 200, 280].map((x) => `<path d="M${x} 0V132" stroke="${wallSh}" stroke-width="10" opacity=".45"/>`).join('');
}
/** The floor (round 5): terracotta tiles, marble with soft veins, or a small mosaic. */
export function floorArt(id: string | undefined, night: boolean): string {
  const dim = (c: string) => (night ? mix(c, -0.35) : c);
  if (id === 'terracotta') {
    let g = `<rect y="146" width="320" height="54" fill="${dim('#d07a4a')}"/>`;
    for (let y = 146, r = 0; y < 200; y += 13, r++) for (let x = (r % 2) * 13; x < 330; x += 26) g += `<path d="M${x} ${y}H${x + 25}V${y + 12}H${x}Z" fill="${dim(r % 2 ? '#c66e3e' : '#dc8a56')}"/>`;
    return g;
  }
  if (id === 'marble') {
    let g = `<rect y="146" width="320" height="54" fill="${dim('#efeae2')}"/>`;
    for (let x = 0; x < 320; x += 40) g += `<path d="M${x} 146V200" stroke="${dim('#d6cfc3')}" stroke-width="1.2"/>`;
    g += `<path d="M0 172H320" stroke="${dim('#d6cfc3')}" stroke-width="1.2"/>`;
    g += [[10, 150, 60, 168], [90, 176, 150, 196], [200, 152, 250, 166], [260, 178, 316, 194]].map(([a, b, c, d]) => `<path d="M${a} ${b}Q${(a + c) / 2} ${b + 10} ${c} ${d}" stroke="${dim('#c4bcb0')}" stroke-width="1" fill="none" opacity=".8"/>`).join('');
    return g;
  }
  if (id === 'mosaic') {
    const cols = ['#2f8ab0', '#f2c94c', '#2fa37a', '#e9e2d0', '#c0473a'];
    let g = `<rect y="146" width="320" height="54" fill="${dim('#e9e2d0')}"/>`;
    for (let y = 148, r = 0; y < 200; y += 9, r++) for (let x = 2 + (r % 2) * 4.5; x < 320; x += 9) {
      const k = (Math.floor(x / 9) * 7 + r * 3) % 11;
      if (k < 5) g += `<path d="M${x} ${y}h7v7h-7z" fill="${dim(cols[k])}"/>`;
    }
    return g;
  }
  return '';
}
/** The view from the window (round 5), inside the glass: desert dunes, the sea, mountains, an old city of domes. */
export function viewArt(id: string | undefined, sky: string): string {
  if (!id) return '';
  const night = sky === 'night', dim = (c: string) => (night ? mix(c, -0.55) : sky === 'dusk' || sky === 'dawn' ? mix(c, -0.12) : c);
  let g = '';
  if (id === 'desert') g = `<path d="M30 84Q50 74 70 82Q86 76 100 80V104H30Z" fill="${dim('#f0c27a')}"/><path d="M30 92Q56 82 80 92Q92 88 100 90V104H30Z" fill="${dim('#e0a85a')}"/>`
    + `<path d="M74 82V70M74 74l-5 -3M74 72l5 -4M74 76l4 -1" stroke="${dim('#3f7a4a')}" stroke-width="1.6" stroke-linecap="round"/>`;
  if (id === 'sea') g = `<rect x="30" y="80" width="72" height="24" fill="${dim('#3a8fd0')}"/><path d="M30 80H102" stroke="${dim('#bfe6ff')}" stroke-width="1.4"/>`
    + [[40, 88], [62, 94], [84, 89], [50, 99], [76, 100]].map(([x, y]) => `<path d="M${x} ${y}q3 -2 6 0" stroke="${dim('#e6f6ff')}" stroke-width="1.2" fill="none"/>`).join('');
  if (id === 'mountains') g = `<path d="M30 92L46 64L58 80L72 56L88 78L100 70V104H30Z" fill="${dim('#7a8fb0')}"/><path d="M46 64L42 71L48 70ZM72 56L67 65L75 63Z" fill="${dim('#ffffff')}"/><path d="M30 96Q60 86 100 94V104H30Z" fill="${dim('#5fa06a')}"/>`;
  if (id === 'city') {
    const c1 = dim('#e8d2b0'), c2 = dim('#d4b88e');
    g = `<path d="M30 88H44V82H52V90H60V84H70V88H80V80H90V90H100V104H30Z" fill="${c2}"/>`
      + `<path d="M48 82a8 8 0 0 1 16 0Z" fill="${dim('#5fbfa0')}"/><path d="M56 74V70" stroke="${dim('#e0b04a')}" stroke-width="1.2"/>`
      + `<path d="M84 90V60H88V90Z" fill="${c1}"/><path d="M83 62H89L86 56Z" fill="${dim('#5fbfa0')}"/><path d="M83 70H89" stroke="${c2}" stroke-width="1.2"/>`
      + `<path d="M34 92a6 6 0 0 1 12 0Z" fill="${dim('#e0b04a')}"/><rect x="30" y="92" width="72" height="12" fill="${c1}"/>`
      + (night ? [[38, 96], [54, 97], [70, 96], [92, 97], [86, 74]].map(([x, y]) => `<rect x="${x}" y="${y}" width="2.4" height="3" fill="#ffd27a"/>`).join('') : '');
  }
  return `<g clip-path="url(#rmglass)">${g}</g>`;
}
/** Floor seating beside the rug (round 5): two floor cushions, a leather pouf, or a low majlis seat along the wall. */
function seat(id: string): string {
  if (id === 'pouf') {
    const d = 'M46 184Q44 166 68 164Q92 166 90 184Q68 192 46 184Z';
    return `${edge(d, '#6a3a1a', 2)}${two(d, '#c98a4a', '#a0662e')}<path d="M50 172Q68 166 86 172M68 165V190" stroke="#f3d6a8" stroke-width="1.4" fill="none" stroke-dasharray="2 2"/>${shine('M52 172Q58 167 66 167', 1.6, .45)}`;
  }
  if (id === 'majlis') {
    const back = 'M34 124H104V160H34Z', base = 'M30 156H108V176H30Z';
    return `${edge(back, '#4a1a2a', 2)}${two(back, '#a8366e', '#7a2450', 0, -1.5)}<path d="M38 132H100" stroke="#f2c94c" stroke-width="1.6" stroke-dasharray="4 3"/>
      ${edge(base, '#4a1a2a', 2)}${two(base, '#c0477e', '#8e2f5e', 0, -1.5)}<path d="M30 164H108" stroke="#f2c94c" stroke-width="2"/>
      ${two('M40 136H62V156H40Z', '#3dbfa0', '#24917a', -1, -1)}${two('M76 136H98V156H76Z', '#f2c94c', '#cf9f22', -1, -1)}`;
  }
  // Two square floor cushions, one leaning on the other, each with a button and corner tassels.
  const c = (x: number, y: number, w: number, hh: number, a: string, b: string) => {
    const d = `M${x + 4} ${y}Q${x + w / 2} ${y + 3} ${x + w - 4} ${y}Q${x + w + 2} ${y + hh / 2} ${x + w - 4} ${y + hh}Q${x + w / 2} ${y + hh - 3} ${x + 4} ${y + hh}Q${x - 2} ${y + hh / 2} ${x + 4} ${y}Z`;
    return `${edge(d, mix(b, -0.35), 2)}${two(d, a, b, -1.5, -1.5)}<path d="M${x + 7} ${y + 5}H${x + w - 7}V${y + hh - 5}H${x + 7}Z" fill="none" stroke="#f2c94c" stroke-width="1.2" stroke-dasharray="2 2"/>
      <path d="${circlePath(x + w / 2, y + hh / 2, 2)}" fill="#f2c94c"/><path d="M${x + 3} ${y + hh}l-3 4M${x + w - 3} ${y + hh}l3 4M${x + 3} ${y}l-3 -3M${x + w - 3} ${y}l3 -3" stroke="#f2c94c" stroke-width="1.6" stroke-linecap="round"/>`;
  };
  return `${c(60, 150, 30, 26, '#e0a33a', '#b8801f')}${c(42, 172, 40, 18, '#3a6fb0', '#2a4f80')}`;
}
/** A cat on the floor by the rug (round 5): sits and swishes its tail by day, sleeps curled up at night. */
function cat(id: string, night: boolean, still: boolean): string {
  const P: Record<string, [string, string, string, string]> = {
    ginger: ['#f0a050', '#c8732e', '#fff1dc', '#3a8a3a'], tabby: ['#a8a8b4', '#76768a', '#eeeef2', '#d9a52a'],
    snow: ['#f7f4ee', '#d2cbbd', '#ffffff', '#4aa8ff'], ink: ['#3a3846', '#1d1c26', '#5a586a', '#ffd25e'],
  };
  const [c1, c2, belly, eye] = P[id] ?? P.ginger;
  const stripes = id === 'ginger' || id === 'tabby' ? 1 : 0;
  if (night) {
    const body = 'M194 188Q192 172 210 170Q228 170 230 184Q228 192 210 192Q198 192 194 188Z';
    const breathe = still ? '' : '<animateTransform attributeName="transform" type="scale" values="1 1;1.02 1.04;1 1" dur="3.4s" repeatCount="indefinite" additive="sum"/>';
    return `<ellipse cx="212" cy="191" rx="20" ry="3" fill="#000" opacity=".2"/><g transform-origin="212 190">${edge(body, mix(c2, -0.3), 1.5)}${two(body, c1, c2, -1.2, -1.2)}
      <path d="M228 186Q236 190 226 192Q214 194 200 191" stroke="${c2}" stroke-width="4.4" fill="none" stroke-linecap="round"/>
      ${two(circlePath(200, 181, 7), c1, c2, -1, -1)}<path d="M195 176L193 169L199 174ZM203 175L206 169L206 176Z" fill="${c1}"/>
      <path d="M196 182q2 1.4 4 0M201 182q2 1.4 4 0" stroke="${mix(c2, -0.5)}" stroke-width="1" fill="none" stroke-linecap="round"/>
      ${stripes ? `<path d="M212 172q2 4 0 8M218 172q2 4 0 8M206 173q1 3 0 6" stroke="${c2}" stroke-width="1.6" fill="none"/>` : ''}${breathe}</g>
      ${still ? '' : `<text x="190" y="166" font-size="7" font-weight="900" fill="#e6e0ff" opacity="0" font-family="Nunito, system-ui">z<animate attributeName="opacity" values="0;.8;0" dur="3.4s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 2;-3 -5" dur="3.4s" repeatCount="indefinite"/></text>`}`;
  }
  const body = 'M200 190Q196 172 206 162Q212 158 218 162Q228 172 224 190Z';
  const tail = `<path d="M222 186Q236 184 234 170Q233 162 228 160" stroke="${c2}" stroke-width="4" fill="none" stroke-linecap="round">${still ? '' : '<animateTransform attributeName="transform" type="rotate" values="0 222 186;-12 222 186;4 222 186;0 222 186" dur="2.8s" repeatCount="indefinite"/>'}</path>`;
  const blink = still ? '' : '<animate attributeName="ry" values="2;2;.3;2;2" keyTimes="0;.9;.93;.96;1" dur="5s" repeatCount="indefinite"/>';
  return `<ellipse cx="212" cy="191" rx="16" ry="3" fill="#000" opacity=".2"/>${tail}${edge(body, mix(c2, -0.3), 1.5)}${two(body, c1, c2, -1.2, -1.2)}
    <path d="M207 176Q212 170 217 176V188H207Z" fill="${belly}" opacity=".85"/>${stripes ? `<path d="M201 176q4 1 6 -1M200 182q4 1 6 -1M223 176q-4 1 -6 -1M224 182q-4 1 -6 -1" stroke="${c2}" stroke-width="1.6" fill="none"/>` : ''}
    <path d="M204 189q2 -4 5 0M215 189q2 -4 5 0" stroke="${mix(c2, -0.2)}" stroke-width="1.4" fill="none"/>
    ${two(circlePath(212, 154, 9), c1, c2, -1.2, -1.2)}<path d="M204 150L203 141L210 147ZM214 147L221 141L220 150Z" fill="${c1}"/><path d="M205 148L204.6 144L208 147ZM216 147L219.6 144L219 148Z" fill="#ff9aa8"/>
    ${stripes ? `<path d="M209 146l1 4M212 145v4M215 146l-1 4" stroke="${c2}" stroke-width="1.3"/>` : ''}
    <ellipse cx="208.5" cy="154" rx="1.8" ry="2" fill="${eye}">${blink}</ellipse><ellipse cx="215.5" cy="154" rx="1.8" ry="2" fill="${eye}">${blink}</ellipse>
    <path d="M211 157.5l1 1l1 -1Z" fill="#ff8a9a"/><path d="M212 158.6q-1.4 1.6 -3 .6M212 158.6q1.4 1.6 3 .6" stroke="${mix(c2, -0.4)}" stroke-width=".8" fill="none"/>
    <path d="M203 157H197M203 159L197 160M221 157H227M221 159L227 160" stroke="${night ? '#999' : '#fff'}" stroke-width=".6" opacity=".7"/>`;
}
/** Special days (round 5): Jumu'ah (sunbeams through the window and a vase of white flowers), the odd nights of the
 *  last ten of Ramadan (a sky full of stars and soft light falling), the day of Arafah (warm light on the floor). */
export type Special = 'jumuah' | 'qadr' | 'arafah';
export function specialArt(sp: Special | null, night: boolean, still: boolean): { window: string; room: string } {
  if (!sp) return { window: '', room: '' };
  const beams = (c: string, o: number) => `<path d="M33 60L95 54L170 196H60Z" fill="${c}" opacity="${o}"/><path d="M50 58L72 56L118 196H84Z" fill="${c}" opacity="${o * .8}"/>`;
  const vase = `${two('M58 98Q54 92 58 86H70Q74 92 70 98Z', '#e8eef6', '#b8c4d4', -.6, -.6)}` + [[60, 80], [66, 78], [63, 74], [69, 83], [56, 84]].map(([x, y]) => `<path d="M64 86L${x} ${y}" stroke="#4f9a4a" stroke-width="1"/><path d="${starPath(x, y, 3.4, 1.6, 5)}" fill="#ffffff"/><path d="${circlePath(x, y, .9)}" fill="#ffe08a"/>`).join('');
  if (sp === 'jumuah') return { window: '', room: `${night ? '' : beams('#fff3c4', 0.16)}${vase}` };
  if (sp === 'arafah') return { window: '', room: beams('#ffd98a', 0.18) };
  // qadr
  const stars = Array.from({ length: 16 }, (_, i) => {
    const x = 36 + (i * 37) % 56, y = 38 + (i * 23) % 52;
    const tw = still ? '' : `<animate attributeName="opacity" values=".3;1;.3" dur="${2 + (i % 4) * .6}s" begin="${(i % 5) * .4}s" repeatCount="indefinite"/>`;
    return `<path d="${starPath(x, y, 1.8 + (i % 3) * .5, .7, 4)}" fill="#fff">${tw}</path>`;
  }).join('');
  const fall = still ? '' : Array.from({ length: 8 }, (_, i) => `<circle cx="${40 + i * 34}" cy="0" r="1.4" fill="#fff6d6" opacity="0"><animate attributeName="opacity" values="0;.8;0" dur="6s" begin="${i * .75}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 10;${(i % 2 ? 6 : -6)} 140" dur="6s" begin="${i * .75}s" repeatCount="indefinite"/></circle>`).join('');
  return { window: `<rect x="26" y="26" width="76" height="78" fill="#fff6d6" opacity=".12"/>${stars}`, room: `<path d="M33 60L95 54L170 196H60Z" fill="#e6e0ff" opacity=".1"/>${fall}` };
}
