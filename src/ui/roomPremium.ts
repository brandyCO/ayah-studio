// Premium room pieces at the approved item-art level (owner request 2026-11-24, "new mythics and legendary ones for
// each type of item"; docs/item-art.md): shaded, lit, glowing. In the room's own 320×200 coordinates (roomArt.ts).
// Still pictures (no SVG animation): the room's light does the rest.
import { circlePath, mix, starPath } from './flat';
import { edge, two } from './roomHQ';

let uid = 0;
const gid = () => `rp${++uid}`;
/** A radial glow (inline gradient). */
const glow = (x: number, y: number, rx: number, ry: number, c: string, o = .6) => {
  const g = gid();
  return `<radialGradient id="${g}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`;
};
const lin = (stops: [number, string][], x2 = 0, y2 = 1) => {
  const g = gid();
  return { id: g, def: `<linearGradient id="${g}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>` };
};
const GOLD: [string, string] = ['#ffe08a', '#d49a24'];
const sparkle = (x: number, y: number, r: number, c = '#fff') => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;

/** Legendary side piece: a brass astrolabe on a carved stand, its rete of stars over the plate. */
export function astrolabe(night: boolean): string {
  const cx = 272, cy = 136, R = 30;
  const ring = circlePath(cx, cy, R), plate = circlePath(cx, cy, R - 5);
  const stand = 'M256 190L262 168H282L288 190Z', neck = 'M268 168V160H276V168Z', throne = `M${cx - 7} ${cy - R - 2}Q${cx} ${cy - R - 16} ${cx + 7} ${cy - R - 2}Z`;
  const lines = Array.from({ length: 12 }, (_, k) => { const a = (k * Math.PI) / 6; return `M${cx} ${cy}L${(cx + Math.cos(a) * (R - 5)).toFixed(1)} ${(cy + Math.sin(a) * (R - 5)).toFixed(1)}`; }).join('');
  const rete = `<path d="M${cx - 18} ${cy + 6}Q${cx} ${cy - 30} ${cx + 18} ${cy + 6}" fill="none" stroke="#ffe9a8" stroke-width="1.6"/><path d="${circlePath(cx, cy + 4, 15)}" fill="none" stroke="#ffe9a8" stroke-width="1.4"/>`
    + [[-14, -8], [10, -14], [16, 4], [-6, 16], [-18, 8], [4, -2]].map(([dx, dy]) => `<path d="${starPath(cx + dx, cy + dy, 2.6, 1.1, 4)}" fill="#fff6d0"/>`).join('');
  return `<g transform="translate(272 190) scale(.8) translate(-272 -190)">${night ? glow(cx, cy, 52, 46, '#ffd27a', .45) : glow(cx, cy, 44, 40, '#fff0b0', .35)}
    ${edge(stand, '#4a2408', 2)}${two(stand, '#9a5a24', '#6a3a14', -1, -1.5)}${edge(neck, '#4a2408', 1)}${two(neck, '#b8862e', '#8a5a12', -.6, 0)}
    ${edge(throne, '#7a3a06', 1.5)}${two(throne, GOLD[0], GOLD[1], -.8, -.8)}<path d="${circlePath(cx, cy - R - 9, 2.4)}" fill="#c0473a"/>
    ${edge(ring, '#7a3a06', 2.2)}${two(ring, GOLD[0], GOLD[1], -1.6, -1.6)}${two(plate, '#2a4f9a', '#1a3266', -1, -1)}
    <path d="${lines}" stroke="#8fb0ff" stroke-width=".6" opacity=".6"/>${rete}
    <path d="M${cx - R + 4} ${cy + 10}L${cx + R - 4} ${cy - 10}" stroke="${GOLD[1]}" stroke-width="3" stroke-linecap="round"/><path d="M${cx - R + 4} ${cy + 10}L${cx + R - 4} ${cy - 10}" stroke="${GOLD[0]}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="${circlePath(cx, cy, 2.6)}" fill="${GOLD[0]}" stroke="#7a3a06" stroke-width=".8"/>
    <path d="M${cx - 20} ${cy - 20}Q${cx - 8} ${cy - 30} ${cx + 6} ${cy - 28}" stroke="#fff" stroke-width="2" fill="none" opacity=".55" stroke-linecap="round"/>
    ${sparkle(cx + 22, cy - 22, 3.4)}${sparkle(cx - 24, cy + 18, 2.4, '#fff6d0')}</g>`;
}

/** Legendary hanging piece: a crescent lamp of gold and glass, lit from inside, a star held in its curve. */
export function hilal(night: boolean): string {
  const x = 111, y = 30;
  const outer = circlePath(x, y, 14), cut = circlePath(x + 7, y - 4, 12.4);
  const m = gid();
  const moon = `<mask id="${m}"><rect x="80" y="0" width="60" height="60" fill="#fff"/><path d="${cut}" fill="#000"/></mask>`;
  return `${glow(x, y, night ? 44 : 30, night ? 40 : 28, '#ffd27a', night ? .75 : .45)}
    <path d="M${x} 0V14" stroke="#7a3a06" stroke-width="1.6"/><path d="M${x} 0V14" stroke="${GOLD[0]}" stroke-width=".7"/>
    ${moon}<g mask="url(#${m})">${edge(outer, '#7a3a06', 1.6)}${two(outer, '#fff3c0', '#e8b84a', -1.4, -1.4)}<path d="M${x - 10} ${y - 4}Q${x - 9} ${y + 8} ${x + 2} ${y + 12}" stroke="#fff" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/></g>
    ${edge(starPath(x + 6, y - 2, 5, 2.2, 5), '#7a3a06', .8)}${two(starPath(x + 6, y - 2, 5, 2.2, 5), '#fffbe6', '#f2c94c', -.5, -.5)}
    ${sparkle(x - 14, y - 12, 2.6)}${sparkle(x + 16, y + 14, 2)}`;
}

/** Legendary wall: Andalusian plaster with interlaced arches over a dado of blue and green tiles. */
export function alhambra(night: boolean): string {
  const wall = night ? '#4a3f70' : '#f2e2c4', deep = night ? '#2e2852' : '#dcc29a', carve = night ? '#6a5c9a' : '#fff6e2';
  let g = `<rect width="320" height="146" fill="${wall}"/>`;
  // sebka lattice of interlaced pointed arches
  for (let x = -20; x < 340; x += 40) {
    g += `<path d="M${x} 96V54Q${x} 30 ${x + 20} 22Q${x + 40} 30 ${x + 40} 54V96" fill="none" stroke="${deep}" stroke-width="5"/><path d="M${x} 96V54Q${x} 30 ${x + 20} 22Q${x + 40} 30 ${x + 40} 54V96" fill="none" stroke="${carve}" stroke-width="2"/>`
      + `<path d="M${x + 20} 96V54Q${x + 20} 34 ${x + 40} 30Q${x + 60} 34 ${x + 60} 54V96" fill="none" stroke="${deep}" stroke-width="3" opacity=".7"/>`
      + `<path d="${starPath(x + 20, 46, 5, 2.4, 8)}" fill="${deep}"/><path d="${starPath(x + 20, 45.4, 3.6, 1.8, 8)}" fill="#d4a22a"/>`;
  }
  g += `<rect y="10" width="320" height="8" fill="${deep}"/><rect y="11" width="320" height="2" fill="#e0b04a"/>`;
  const tiles = ['#2f8ab0', '#2fa37a', '#f2c94c', '#1f5f9a'];
  g += `<rect y="98" width="320" height="48" fill="${night ? '#1f2a4a' : '#f6f0e4'}"/>`;
  for (let y = 102, r = 0; y < 144; y += 10, r++) for (let x = (r % 2) * 10; x < 330; x += 20) {
    const c = tiles[(Math.floor(x / 20) + r) % 4];
    g += `<path d="M${x} ${y}L${x + 5} ${y + 5}L${x} ${y + 10}L${x - 5} ${y + 5}Z" fill="${night ? mix(c, .35) : c}"/>`;
  }
  return g + `<rect y="96" width="320" height="4" fill="#b8862e"/><rect y="96" width="320" height="1.4" fill="#ffe08a"/>`;
}

/** Mythic wall: the night sky itself, khatam stars joined as constellations in gold, a great crescent medallion. */
export function cosmos(night: boolean): string {
  const sky = lin([[0, night ? '#0a0a2a' : '#1a1a52'], [.6, night ? '#1a1250' : '#2a1f6e'], [1, night ? '#2a1a5a' : '#3a2a7a']]);
  const neb = gid();
  let g = `<defs>${sky.def}<radialGradient id="${neb}"><stop offset="0" stop-color="#b48aff" stop-opacity=".45"/><stop offset="1" stop-color="#b48aff" stop-opacity="0"/></radialGradient></defs>`
    + `<rect width="320" height="146" fill="url(#${sky.id})"/><ellipse cx="230" cy="50" rx="110" ry="40" fill="url(#${neb})" transform="rotate(-14 230 50)"/>`
    + glow(70, 110, 90, 30, '#6fe0f5', .18);
  for (let k = 0; k < 70; k++) { const x = (k * 97) % 320, y = (k * 53) % 140, r = k % 9 ? .7 : 1.4; g += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${k % 3 ? .6 : .95}"/>`; }
  const con = [[150, 30], [176, 46], [204, 38], [232, 60], [262, 50], [290, 72]], con2 = [[190, 100], [216, 88], [246, 104], [270, 92]];
  for (const c of [con, con2]) {
    g += `<path d="M${c.map(([x, y]) => `${x} ${y}`).join('L')}" stroke="#e0b04a" stroke-width=".9" fill="none" opacity=".7"/>`;
    g += c.map(([x, y], i) => `${glow(x, y, 8, 8, '#ffe08a', .7)}<path d="${starPath(x, y, i % 2 ? 3.4 : 4.6, i % 2 ? 1.6 : 2.4, 8)}" fill="#ffe9a8"/>`).join('');
  }
  // the crescent medallion
  const mx = 300, my = 24, m = gid();
  g += `${glow(mx, my, 40, 40, '#ffe08a', .5)}<mask id="${m}"><rect x="260" y="-20" width="80" height="80" fill="#fff"/><path d="${circlePath(mx + 7, my - 5, 14)}" fill="#000"/></mask>`
    + `<g mask="url(#${m})">${edge(circlePath(mx, my, 16), '#7a3a06', 1.4)}${two(circlePath(mx, my, 16), '#fff3c0', '#e8b84a', -1.4, -1.4)}</g>`;
  return g + `<rect y="128" width="320" height="18" fill="#140c3a"/><path d="M0 130H320M0 144H320" stroke="#e0b04a" stroke-width="1.6"/>`
    + Array.from({ length: 20 }, (_, i) => `<path d="${starPath(8 + i * 16, 137, 3.6, 1.6, 8)}" fill="#ffe08a"/>`).join('');
}

/** Mythic view: the northern lights over the desert, ribbons of green and violet, a shooting star. */
export function auroraView(): string {
  const sky = lin([[0, '#06082a'], [.7, '#16205a'], [1, '#2a3a7a']]);
  const a1 = lin([[0, '#5affc8'], [.5, '#3ad0ff'], [1, '#b48aff']], 1, 0);
  let g = `<defs>${sky.def}${a1.def}</defs><rect x="30" y="30" width="72" height="76" fill="url(#${sky.id})"/>`;
  for (let k = 0; k < 24; k++) g += `<circle cx="${32 + (k * 29) % 70}" cy="${34 + (k * 17) % 40}" r="${k % 5 ? .5 : .9}" fill="#fff" opacity=".8"/>`;
  for (const [y, w, o] of [[54, 14, .25], [56, 7, .5], [50, 4, .7], [62, 10, .3]] as const)
    g += `<path d="M26 ${y + 6}Q46 ${y - 10} 64 ${y + 2}Q82 ${y + 12} 106 ${y - 6}" stroke="url(#${a1.id})" stroke-width="${w}" fill="none" opacity="${o}" stroke-linecap="round"/>`;
  g += `<path d="M84 38L70 44" stroke="#fff" stroke-width="1" opacity=".8" stroke-linecap="round"/><circle cx="84" cy="38" r="1.3" fill="#fff"/>`;
  g += `<path d="M30 88Q50 78 70 86Q86 80 102 84V106H30Z" fill="#2a2050"/><path d="M30 96Q56 86 80 96Q92 92 102 94V106H30Z" fill="#1a1438"/>`
    + `<path d="M30 88Q50 78 70 86Q86 80 102 84" stroke="#5affc8" stroke-width=".8" fill="none" opacity=".5"/>`;
  return `<g clip-path="url(#rmglass)">${g}</g>`;
}

/** Mythic rug: a rug of light, deep night blue woven with gold that glows, a khatam at its heart. */
export function nurRug(night: boolean): string {
  const shape = 'M40 168Q130 150 220 168Q130 192 40 168Z', inner = 'M60 168Q130 154 200 168Q130 186 60 168Z', inner2 = 'M80 168Q130 158 180 168Q130 181 80 168Z';
  const fringe = Array.from({ length: 22 }, (_, i) => `<path d="M${(40 + i * 8.6).toFixed(1)} ${(169 + Math.sin((i / 21) * Math.PI) * 13).toFixed(1)}l-2 3" stroke="#ffe08a" stroke-width="1"/>`).join('');
  const med = starPath(130, 168, 14, 8, 8);
  return `${glow(130, 168, 110, 30, '#ffd27a', night ? .55 : .35)}
    ${edge(shape, '#0a0a2a', 3)}${two(shape, '#2a2a7a', '#141450')}${fringe}
    <path d="${inner}" fill="none" stroke="#e0b04a" stroke-width="2.2"/><path d="${inner}" fill="none" stroke="#fff6c0" stroke-width=".8" opacity=".9"/>
    <path d="${inner2}" fill="none" stroke="#e0b04a" stroke-width="1.2" stroke-dasharray="3 2"/>
    ${glow(130, 168, 34, 12, '#ffe08a', .8)}<g transform="translate(130 168) scale(1 .42) translate(-130 -168)">${edge(med, '#7a3a06', 1.4)}${two(med, '#fff3c0', '#e0b04a', -1, -1)}<path d="${starPath(130, 168, 6, 3.2, 8)}" fill="#c0473a"/></g>
    ${[70, 190].map((x) => `<g transform="translate(${x} 168) scale(1 .42) translate(${-x} -168)"><path d="${starPath(x, 168, 7, 3.4, 8)}" fill="#ffe08a"/></g>`).join('')}
    <path d="M72 162Q130 152 188 162" stroke="#fffbe6" stroke-width="2.4" fill="none" opacity=".3"/>
    ${sparkle(96, 160, 2.6)}${sparkle(170, 176, 2.2)}${sparkle(140, 158, 1.8)}`;
}
/** The rug of light from above, for the shop's tile (viewBox 0 0 100 100). */
export function nurTop(): string {
  const R = 'M14 22H86V78H14Z', field = 'M21 29H79V71H21Z', big = starPath(50, 50, 16, 9.6, 8);
  return `${glow(50, 50, 50, 40, '#ffd27a', .5)}<g transform="rotate(-5 50 50)">${edge(R, '#0a0a2a', 2.4)}${two(R, '#e0b04a', '#b8862e', -1, -1)}${two(field, '#2a2a7a', '#141450', -1.4, -1.4)}
    <path d="M25 33H75V67H25Z" fill="none" stroke="#e0b04a" stroke-width="1.4"/>${glow(50, 50, 22, 22, '#ffe08a', .8)}${edge(big, '#7a3a06', .8)}${two(big, '#fff3c0', '#e0b04a', -.6, -.6)}<path d="${starPath(50, 50, 6.4, 3.4, 8)}" fill="#c0473a"/>
    ${[[30, 38], [70, 38], [30, 62], [70, 62]].map(([x, y]) => `<path d="${starPath(x, y, 3.6, 1.6, 8)}" fill="#ffe08a"/>`).join('')}
    ${sparkle(62, 34, 2.6)}${sparkle(36, 64, 2)}</g>`;
}
