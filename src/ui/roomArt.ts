// The room's pieces and seasons, drawn flat two-tone like the rest of the reward art, in the room's own
// 320×200 coordinates (src/ui/room.ts): the window at x 26–102, the flame frame at 120–164, the shelves at
// 190–306, the floor from y 146, the rug round x 130. `still` leaves out the small SVG animations.
import type { Slot } from '../data/roomItems';
import { circlePath, edge, mix, shine, starPath, two } from './flat';

/** The part of the room each place takes, for the shop's tiles (x, y, w, h). */
export const SLOT_BOX: Record<Slot, [number, number, number, number]> = {
  plant: [-4, 96, 50, 96], side: [226, 120, 94, 74], rug: [36, 150, 188, 38], curtain: [8, 10, 112, 100], hang: [99, 0, 24, 44],
};

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

function side(id: string, night: boolean, still: boolean): string {
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
    return `<path d="${legs}" stroke="#7a5230" stroke-width="4" stroke-linecap="round"/>${edge(top, '#6e4a22', 3)}${two(top, '#c99a6a', '#a8784a', 0, -2)}
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
