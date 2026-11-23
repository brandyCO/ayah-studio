// The Hifz badge (owner decision 2026-11-23): one per surah, earned by reciting the whole surah from memory and
// kept alive by review. Five tiers, each a richer object in the reward art's flat two-tone style (`flat.ts`):
//   Bronze    a coin with a dotted rim
//   Silver    the khatam star with studs
//   Gold      a sunburst between two green laurel branches
//   Platinum  a violet rosette of petals under a small crown
//   Diamond   a sapphire star round a cut stone, crowned
// The surah's number sits in the middle, a "HIFZ" ribbon below. A badge due for review is dusty (its colours
// faded towards grey, a few specks); one not earned yet is a quiet slate outline of the Bronze coin.
// Also the juz checkpoint's gate (an arch with a hanging lantern), which replaced the garden's gate.
import { circlePath, edge, mix, shine, starPath, two } from './flat';

export type HifzState = '' | 'due' | 'locked';
/** Each tier's metal: light, base, shade, deep edge. */
export const HIFZ_C = [
  ['#ffd9b5', '#e09a5c', '#b06a30', '#5e3414'],
  ['#ffffff', '#dfe6ee', '#a3b1bf', '#46525e'],
  ['#fff3b0', '#f7c53c', '#cf8f10', '#5e3d04'],
  ['#f4efff', '#c2b0f6', '#7d62d8', '#2e2266'],
  ['#e6f7ff', '#7ccdfd', '#2483d6', '#0b3561'],
];
const SLATE = ['#e6ebef', '#c3ccd4', '#9aa6b1', '#56616c'];
const DUST = '#9c917c';

const dusty = (c: string[]) => c.map((x, i) => mixTo(x, DUST, i === 3 ? 0.35 : 0.55));
function mixTo(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

const rot = (d: string, deg: number) => `<g transform="rotate(${deg} 60 58)">${d}</g>`;

function inner(s: number, tier: number, state: HifzState): string {
  const cx = 60, cy = 58;
  const c = state === 'locked' ? SLATE : state === 'due' ? dusty(HIFZ_C[tier]) : HIFZ_C[tier];
  const t = state === 'locked' ? 0 : tier;
  let back = '';
  const crown = `${edge('M45 13L50 3L60 10L70 3L75 13Z', c[3], 2)}${two('M45 13L50 3L60 10L70 3L75 13Z', state ? c[1] : '#ffd34d', state ? c[2] : '#d99a12', -1, -1)}`;
  if (t === 0) {
    back = `${edge(circlePath(cx, cy, 44), c[3], 4)}${two(circlePath(cx, cy, 44), c[1], c[2], -3, -3)}<circle cx="${cx}" cy="${cy}" r="35" fill="none" stroke="${c[2]}" stroke-width="3" stroke-dasharray="1.5 4.5" stroke-linecap="round"/>`;
  } else if (t === 1) {
    const st = starPath(cx, cy, 50, 39, 8);
    back = `${edge(st, c[3], 4)}${two(st, c[1], c[2], -3, -3)}` + Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI * i) / 4 - Math.PI / 2;
      return `<circle cx="${(cx + 41 * Math.cos(a)).toFixed(1)}" cy="${(cy + 41 * Math.sin(a)).toFixed(1)}" r="3" fill="${c[0]}"/>`;
    }).join('');
  } else if (t === 2) {
    const sun = starPath(cx, cy, 56, 42, 16);
    const leaf = (x: number, y: number, r: number) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.4" fill="${state ? mix(c[2], 0.1) : '#4fb84f'}" transform="rotate(${r} ${x} ${y})"/>`;
    const branch = (side: number) => `<path d="M${60 + side * 46} 92Q${60 + side * 56} 60 ${60 + side * 40} 26" stroke="${state ? c[3] : '#2f7a35'}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
      [38, 52, 66, 80].map((y, i) => leaf(60 + side * (49 + (i === 0 ? -4 : i === 3 ? -2 : 1)), y, side * (i * 12 - 40))).join('');
    back = `${edge(sun, c[3], 3)}${two(sun, c[2], mix(c[2], 0.18), -2, -2)}${branch(-1)}${branch(1)}${edge(circlePath(cx, cy, 40), c[3], 3)}${two(circlePath(cx, cy, 40), c[1], c[2], -3, -3)}`;
  } else if (t === 3) {
    const petal = 'M60 58C70 44 70 30 60 14C50 30 50 44 60 58Z';
    back = Array.from({ length: 12 }, (_, i) => rot(`${edge(petal, c[3], 2)}${two(petal, i % 2 ? c[1] : c[0], c[2], -1.5, -1.5)}`, i * 30)).join('') +
      crown + `${edge(circlePath(cx, cy, 33), c[3], 3)}${two(circlePath(cx, cy, 33), c[2], c[3], -2.5, -2.5)}`;
  } else {
    const st = starPath(cx, cy, 52, 40, 8), rays = starPath(cx, cy, 58, 34, 16);
    back = `<path d="${rays}" fill="${c[1]}" opacity=".5" transform="rotate(11.25 ${cx} ${cy})"/>${edge(st, c[3], 4)}${two(st, c[2], mix(c[2], 0.2), -3, -3)}` + crown;
  }
  const num = `<text x="${cx}" y="${cy + (s > 99 ? 6 : 7)}" text-anchor="middle" font-family="Nunito, ui-rounded, system-ui, sans-serif" font-weight="900" font-size="${s > 99 ? 17 : 20}" fill="${c[3]}">${s}</text>`;
  const core = t === 4
    ? `${edge(`M${cx} ${cy - 27}L${cx + 25} ${cy - 5}L${cx} ${cy + 27}L${cx - 25} ${cy - 5}Z`, c[3], 2.5)}${two(`M${cx} ${cy - 27}L${cx + 25} ${cy - 5}L${cx} ${cy + 27}L${cx - 25} ${cy - 5}Z`, c[0], c[1], -2, -2)}<path d="M${cx - 25} ${cy - 5}H${cx + 25}M${cx} ${cy - 27}L${cx - 9} ${cy - 5}L${cx} ${cy + 27}L${cx + 9} ${cy - 5}Z" stroke="${c[1]}" stroke-width="1.4" fill="none"/>${num.replace(`y="${cy + (s > 99 ? 6 : 7)}"`, `y="${cy + 3}"`).replace(/font-size="\d+"/, `font-size="${s > 99 ? 12 : 14}"`)}`
    : `${edge(circlePath(cx, cy, 24), c[3], 2.5)}${two(circlePath(cx, cy, 24), c[0], mix(c[0], 0.08), -2, -2)}${num}`;
  const ribbon = `${edge('M36 100H84L80 110L84 120H36L40 110Z', c[3], 2)}${two('M36 100H84L80 110L84 120H36L40 110Z', c[2], c[3], -1, -1)}<text x="60" y="114" text-anchor="middle" font-family="Nunito, ui-rounded, system-ui, sans-serif" font-weight="900" font-size="9" letter-spacing="1.2" fill="${c[0]}">HIFZ</text>`;
  const gloss = state === 'locked' ? '' : shine(`M${cx - 30} ${cy - 16}Q${cx - 22} ${cy - 31} ${cx - 6} ${cy - 36}`, 4, 0.45);
  const specks = state === 'due' ? `<g fill="#7d7464" opacity=".65"><circle cx="40" cy="38" r="2.2"/><circle cx="80" cy="48" r="1.8"/><circle cx="56" cy="80" r="1.6"/><circle cx="74" cy="28" r="1.4"/><circle cx="44" cy="66" r="1.2"/><circle cx="86" cy="76" r="1.5"/></g>` : '';
  return back + core + gloss + ribbon + specks;
}

const cache = new Map<string, string>();
let inst = 0;
/** Each copy gets its own clip ids: a cached picture used twice must not point at another copy's clips. */
const own = (m: string) => { const k = ++inst; return m.replace(/\bft(\d+)/g, `ft$1x${k}`); };
/** A surah's Hifz badge (viewBox 120 × 128) as a still picture, `size` px wide. */
export function hifzBadge(s: number, tier: number, size = 72, state: HifzState = ''): HTMLElement {
  const key = `${s}:${tier}:${state}`;
  let markup = cache.get(key);
  if (!markup) { markup = inner(s, tier, state); if (cache.size > 300) cache.clear(); cache.set(key, markup); }
  const el = document.createElement('span');
  el.className = `hz-badge t${tier}${state ? ` ${state}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="-4 -4 128 132" width="${size}" height="${Math.round((size * 132) / 128)}">${own(markup)}</svg>`;
  return el;
}

/** The juz checkpoint's gate: a pointed arch in jade and gold with a lantern hanging in it (viewBox 120). */
export function juzGateArt(n: number, state: 'done' | 'current' | 'locked', size = 120): HTMLElement {
  const lit = state === 'done';
  const jade = state === 'locked' ? ['#c9d2cd', '#a3b0a9', '#5f6d66'] : ['#3fc29a', '#16906c', '#0a4f3b'];
  const gold = state === 'locked' ? ['#dde2df', '#b5bdb8'] : ['#ffd86a', '#cf9518'];
  const arch = 'M14 112V50Q14 18 60 6Q106 18 106 50V112H86V54Q86 34 60 26Q34 34 34 54V112Z';
  const lamp = `<path d="M60 26V44" stroke="${gold[1]}" stroke-width="2"/>${edge('M52 46H68L72 60Q60 72 48 60Z', jade[2], 2)}${two('M52 46H68L72 60Q60 72 48 60Z', gold[0], gold[1], -1.5, -1.5)}` +
    (lit ? `<circle cx="60" cy="57" r="16" fill="#ffe9a0" opacity=".45"/><circle cx="60" cy="57" r="5" fill="#fffbe6"/>` : `<circle cx="60" cy="57" r="3.5" fill="${jade[2]}" opacity=".5"/>`);
  const el = document.createElement('span');
  el.className = `hz-gate ${state}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 120 124" width="${size}" height="${Math.round((size * 124) / 120)}">${edge(arch, jade[2], 4)}${two(arch, jade[0], jade[1], -3, -3)}` +
    `<path d="M14 50Q14 18 60 6Q106 18 106 50" stroke="${gold[0]}" stroke-width="4" fill="none"/>${lamp}` +
    `${edge('M6 112H114V120H6Z', jade[2], 2)}${two('M6 112H114V120H6Z', gold[0], gold[1], -1, -1)}` +
    `<text x="60" y="100" text-anchor="middle" font-family="Nunito, ui-rounded, system-ui, sans-serif" font-weight="900" font-size="15" fill="${lit ? gold[0] : jade[2]}">${n}</text></svg>`;
  return el;
}

/** Hifz badges on a profile: sent among the best badges (`rank_set_badges`) as `hz{surah}-{tier}` (the best two) and
 *  `hzc{count}-0` (how many surahs are held), so no new column is needed; older apps skip ids they don't know. */
export function hifzIds(all: { s: number; tier: number }[]): string[] {
  if (!all.length) return [];
  const best = [...all].sort((a, b) => b.tier - a.tier || b.s - a.s).slice(0, 2);
  return [...best.map((x) => `hz${x.s}-${x.tier}`), `hzc${Math.min(114, all.length)}-0`];
}
export function parseHifz(ids: readonly string[] | undefined): { list: { s: number; tier: number }[]; count: number } {
  const list: { s: number; tier: number }[] = [];
  let count = 0;
  for (const id of ids ?? []) {
    const m = /^hz(\d{1,3})-([0-4])$/.exec(id), c = /^hzc(\d{1,3})-0$/.exec(id);
    if (m && +m[1] >= 1 && +m[1] <= 114) list.push({ s: +m[1], tier: +m[2] });
    if (c) count = Math.min(114, +c[1]);
  }
  return { list, count: Math.max(count, list.length) };
}
