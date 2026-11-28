// Reward moments (Me tab, played only when the user taps Claim, never over reading). Five calm,
// light-filled animations in SVG + CSS, each ending on its own still picture:
//   lantern  a daily goal met: a paper lantern rises, opens into warm light, gold motes drift up
//   star     every goal met today: gold lines draw the eight-pointed khatam star, which fills with light
//   flame    a streak milestone: the flame rises, rings of light pulse out, the days count up, the badge drops in
//   hifz     a surah's Hifz badge (Bronze → Diamond, hifzBadge.ts), staged like the badges below
//   medal / rosette / khatm  a badge: each tier its own moment (badgeStage(): Bronze tossed like a coin,
//            Silver locked into a khatam star, Gold rising over a sunburst, Platinum dropping into blooming
//            petals, Diamond condensed from light); a rosette (a surah, a juz…) also has the character cheering,
//            the Khatm a breathing halo, an outer ring of petals and the date under the title
// Polish: the Claim button lifts into a seed of light that flies to the centre, gathers and bursts
// (flash, light sweep, sparks on a canvas, src/ui/sparks.ts); the moment unfolds from that burst with
// overshoot, a second beat when it lands, then slow motes rising. A light vibration on each beat, no sound. Tap the button (or anywhere once it has played) to close; Esc too.
// chest     a goal's (or a Ranks prize's) chest: it drops in and waits; the user taps it open (3–5 taps:
//           each one jolts it, cracks it and lets more light out of the seam), it bursts open and what
//           was won comes out one by one (`loot`: Light, a trophy, a freeze, an avatar…). Never random:
//           the chest holds exactly what was earned, and it says so before it is opened.
// A tier-up (owner request 2026-11-23, "the new badge replacing the old one"): the badge it had before comes
// out of the seed first, shudders as cracks of light run through it and shatters into shards of its old metal;
// the new tier is born out of that light with its own entrance. Transform / opacity only.
// Reduced motion: the still final picture, faded in.
import type { BadgeDef } from '../data/badges';
import { locale, t, type Key } from '../i18n';
import { h } from './dom';
import { badgeArt } from './badge';
import { TIERS } from '../data/badges';
import { hifzBadge } from './hifzBadge';
import { badgeGoal, badgeName } from '../i18n/badges';
import { flame } from './flame';
import { sparks, type Sparks } from './sparks';
import { chestArt, chestTier } from './chest';
import { rewardPalette, rgba } from './theme';
import './cel.css';
import './celebrate.css';
import { actor as makeActor } from './actor';
import { freezeArt, svgOf } from './flat';
import { edge, two } from './roomHQ';
import { flare, warmFlare, type Rarity } from './flare';
import { bump, combo, drop, holdPage, uncover, noor as makeNoor, own, popIn, squash, takeOver, tick as tickNum } from './juice';
import { sfx, warmSounds } from './sfx';
import { warmGesture } from './rig';
import { mt, type MomentKey } from '../i18n/moments';
import { fpsStart } from '../fps';

/** The theme's reward colours, read when a moment starts (so a theme change shows at once). */
let P = rewardPalette();

export type Moment =
  | { kind: 'lantern' | 'star'; title: string; sub: string; kicker?: string; stats?: MomentStat[] }
  /** `up`: what taps upgrade the chest to on the way (×2, ×3, ×4; owner 2026-11-24, "like Brawl Stars"). Decided by the
   *  caller before the moment, so what is credited is what was shown; the loot's Light already includes it. */
  | { kind: 'chest'; title: string; sub: string; kicker?: string; loot?: Loot[]; up?: number }
  | { kind: 'flame'; badge: BadgeDef; days: number }
  | { kind: 'rosette' | 'medal' | 'khatm'; badge: BadgeDef }
  /** A Hifz badge earned (step 0) or climbed to `step` from `from`. */
  | { kind: 'hifz'; s: number; step: number; from?: number; title: string; sub: string; kicker?: string; stats?: MomentStat[] };

/** A line under a moment's title (a Learn lesson: the time it took, flawless, a lamp lit again). */
export interface MomentStat { text: string; icon?: 'time' | 'flawless' | 'lamp' }

/** What a chest holds, shown one by one as it opens. Without `loot` a chest holds the Light it was given. */
export type Loot =
  | { kind: 'light'; n: number }
  | { kind: 'freeze' }
  | { kind: 'item'; art: Node; label: string; rare?: boolean };

const NS = 'http://www.w3.org/2000/svg';
const STAT_ICONS = {
  time: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 9v4l3 2M10 3h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  flawless: '<path d="M12 2l2.6 6.4L21 9l-5 4.4L17.6 20 12 16.6 6.4 20 8 13.4 3 9l6.4-.6z" fill="currentColor"/>',
  lamp: '<path d="M12 3c2.4 2.7 3.4 4.7 3.4 6.8a3.4 3.4 0 0 1-6.8 0C8.6 7.7 9.6 5.7 12 3z" fill="currentColor"/><path d="M7 15h10l-1 6H8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
};
function statIcon(k: keyof typeof STAT_ICONS): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = STAT_ICONS[k];
  return el;
}
const svg = (box: number, inner: string) => {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${box} ${box}`);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
};
// Speed (owner 2026-11-10, "60fps, every animation"): the parts that keep moving for the whole moment — the
// lantern's sway, the rosette's turning ring, the Khatm halo, the medal's rays — are lifted out of the drawing
// into HTML layers (each an SVG copy with the same view-box, stacked in order), which the compositor moves
// without repainting the picture.
const LIFT = ['cel-lantern'];
const isMotes = (k: Element) => k.tagName === 'g' && k.children.length > 0 && [...k.children].every((c) => c.classList.contains('cel-mote'));
function lift(el: SVGSVGElement): Element {
  const kids = [...el.children];
  if (!kids.some((k) => isMotes(k) || LIFT.some((c) => k.classList.contains(c)))) return el;
  const vb = el.viewBox.baseVal.width || 200;
  const box = h('span', { class: 'cel-svgs', 'aria-hidden': 'true' });
  let run: Element[] = [];
  const copy = (nodes: Element[]) => {
    const c = el.cloneNode(false) as SVGSVGElement;
    c.append(...nodes);
    return c;
  };
  const flush = () => { if (run.length) box.append(copy(run)); run = []; };
  for (const k of kids) {
    // Rising motes become small HTML lights (same place, size and colour), each moved by the compositor.
    if (isMotes(k)) {
      flush();
      const fill = k.getAttribute('fill') ?? '#fff';
      box.append(h('span', { class: 'cel-motes', style: `--vb:${vb}` }, ...[...k.children].map((m) => {
        const cx = +m.getAttribute('cx')!, cy = +m.getAttribute('cy')!, r = +m.getAttribute('r')!;
        const st = (m as SVGElement).style;
        return h('i', { class: 'cel-mote', style: `left:${((cx - r) / vb) * 100}%;top:${((cy - r) / vb) * 100}%;width:${(2 * r / vb) * 100}%;height:${(2 * r / vb) * 100}%;background:${fill};--d:${st.getPropertyValue('--d')};--yu:${parseFloat(st.getPropertyValue('--y'))}` });
      })));
      continue;
    }
    const c = LIFT.find((x) => k.classList.contains(x));
    if (!c) { run.push(k); continue; }
    flush();
    k.classList.remove(c);
    box.append(h('span', { class: `cel-ly ${c}` }, copy([k])));
  }
  flush();
  return box;
}
const motes = (n: number, cx: number, cy: number, spread: number) => Array.from({ length: n }, (_, i) =>
  `<circle class="cel-mote" cx="${cx + (((i * 37) % (spread * 2)) - spread)}" cy="${cy}" r="${1.6 + (i % 3) * 0.8}" style="--d:${(0.9 + ((i * 0.13) % 0.9)).toFixed(2)}s;--y:${-70 - ((i * 23) % 60)}px"/>`).join('');

function starPoints(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const square = (cx: number, cy: number, r: number, rot: number) => Array.from({ length: 4 }, (_, i) => {
  const a = ((i * 90 + rot) * Math.PI) / 180;
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

function lanternArt() {
  return lift(svg(200, `
    <defs>
      <radialGradient id="celG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.core}" stop-opacity=".95"/><stop offset=".4" stop-color="${P.n3}" stop-opacity=".45"/><stop offset="1" stop-color="${P.n1}" stop-opacity="0"/></radialGradient>
      <linearGradient id="celL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.n1}"/><stop offset=".5" stop-color="${P.hi}"/><stop offset="1" stop-color="${P.n1}"/></linearGradient>
    </defs>
    <circle class="cel-burst" cx="100" cy="104" r="92" fill="url(#celG)"/>
    <g class="cel-lantern">
      <path d="M100 22V44" stroke="${P.n3}" stroke-width="2" stroke-linecap="round"/>
      <path d="M86 44H114L110 54H90Z" fill="${P.deep2}"/>
      <path d="M80 54C72 80 72 128 80 154H120C128 128 128 80 120 54Z" fill="url(#celL)"/>
      <path d="M91 54C86 84 86 124 91 154M109 54C114 84 114 124 109 154M100 54V154" fill="none" stroke="${P.deep}" stroke-opacity=".35" stroke-width="1.5"/>
      <ellipse class="cel-core" cx="100" cy="104" rx="13" ry="28" fill="${P.core}"/>
      <path d="M90 154H110L106 162H94Z" fill="${P.deep2}"/>
      <path d="M100 162V178" stroke="${P.n3}" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g fill="${P.n3}">${motes(14, 100, 104, 46)}</g>`));
}

function starArt() {
  const sq1 = square(100, 100, 74, 45);
  const sq2 = square(100, 100, 74, 0);
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    return `<line class="cel-draw" pathLength="1" style="--d:${(0.9 + i * 0.05).toFixed(2)}s" x1="${(100 + 26 * Math.cos(a)).toFixed(1)}" y1="${(100 + 26 * Math.sin(a)).toFixed(1)}" x2="${(100 + 52 * Math.cos(a)).toFixed(1)}" y2="${(100 + 52 * Math.sin(a)).toFixed(1)}"/>`;
  }).join('');
  return lift(svg(200, `
    <defs>
      <radialGradient id="celS" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${P.core}"/><stop offset=".55" stop-color="${P.n3}"/><stop offset="1" stop-color="${P.n1}"/></radialGradient>
      <radialGradient id="celSg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${P.n3}" stop-opacity=".55"/><stop offset="1" stop-color="${P.n3}" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="cel-burst" cx="100" cy="100" r="98" fill="url(#celSg)"/>
    <g fill="none" stroke="${P.n3}" stroke-width="2.2" stroke-linejoin="round">
      <circle class="cel-draw" pathLength="1" style="--d:0s" cx="100" cy="100" r="86" stroke-opacity=".55"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.15s" points="${sq1}"/>
      <polygon class="cel-draw" pathLength="1" style="--d:.4s" points="${sq2}"/>
      ${rays}
    </g>
    <polygon class="cel-fill" points="${starPoints(100, 100, 50, 38)}" fill="url(#celS)" stroke="${P.hi}" stroke-width="1.5"/>
    <circle class="cel-fill" cx="100" cy="100" r="16" fill="${P.core}"/>
    <g fill="${P.n3}">${motes(12, 100, 100, 60)}</g>`));
}

// The badge moment (owner 2026-11-12: "each animation unique relative to its tier, and 60fps"): one flat
// backdrop per tier, in that tier's own metal, every moving part an HTML layer holding a still drawing that
// only transform / opacity move (nothing animates inside an SVG):
//   Bronze    the coin is tossed: it flips through the air, lands with a squash and a ring of dust
//   Silver    two silver squares turn in from opposite sides and lock into the khatam star; studs light round it
//   Gold      a sunburst unfolds and turns, laurel branches sweep up either side, the badge rises like the sun
//   Platinum  two rings of violet petals bloom in turn, a pillar of light comes down, the badge drops into it
//   Diamond   light beams wheel in, a point of light condenses into the badge, diamonds circle it, glints twinkle
// The Khatm adds a breathing halo and an outer ring of petals.
const TIER_C = [
  ['#ffe0c2', '#e7a266', '#b8723a', '#6e3f1c'],
  ['#ffffff', '#e3eaf1', '#a9b6c3', '#55606b'],
  ['#fff1b8', '#ffd25a', '#dc9f28', '#7d5710'],
  ['#f3eeff', '#c4b0ff', '#8a6ae8', '#3a2680'],
  ['#ffffff', '#cff4ff', '#7fd0f2', '#1f5f8f'],
];
const bmLayer = (cls: string, inner: string, turn = '') => {
  const art = svgOf('0 0 200 200', inner);
  return h('span', { class: `bm-l ${cls}`, 'aria-hidden': 'true' }, turn ? h('span', { class: `bm-l ${turn}` }, art) : art);
};
const ring = (n: number, r: number, f: (x: number, y: number, a: number, i: number) => string) =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return f(100 + r * Math.cos(a), 100 + r * Math.sin(a), a, i); }).join('');
const petals = (n: number, len: number, w: number, c: string[], phase = 0) => {
  const d = `M100 100C${100 + w} ${100 - len * .3} ${100 + w} ${100 - len * .7} 100 ${100 - len}C${100 - w} ${100 - len * .7} ${100 - w} ${100 - len * .3} 100 100Z`;
  return Array.from({ length: n }, (_, i) => `<g transform="rotate(${(i * 360) / n + phase} 100 100)">${two(d, c[0], c[1], -1.5, -1.5)}</g>`).join('');
};
function branch(sx: number, c: string[]) {
  let out = '';
  for (let i = 0; i < 7; i++) {
    const t = Math.PI / 2 + sx * (0.42 + i * 0.25);
    const x = 100 + 84 * Math.cos(t), y = 100 + 84 * Math.sin(t);
    const tang = t + sx * Math.PI / 2;
    for (const side of [-1, 1]) {
      const dir = tang + side * 0.6 * sx, len = 22 - i * 1.3, wid = 7.5 - i * .45;
      const tx = x + Math.cos(dir) * len, ty = y + Math.sin(dir) * len;
      const nx = -Math.sin(dir) * wid, ny = Math.cos(dir) * wid, mx = (x + tx) / 2, my = (y + ty) / 2;
      const d = `M${x.toFixed(1)} ${y.toFixed(1)}Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Z`;
      out += edge(d, c[3], 2) + two(d, c[1], c[2], -1.2, -1.2);
    }
  }
  return out;
}
const dots = (cls: string, n: number, r: number, extra = '') => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return h('i', { class: cls, style: `left:${(50 + r * Math.cos(a)).toFixed(1)}%;top:${(50 + r * Math.sin(a)).toFixed(1)}%;--i:${i}${extra}` });
});

/** The backdrop layers of a badge moment, by tier (0 Bronze … 4 Diamond); the badge sits between them. */
function badgeStage(step: number, khatm: boolean, badge: Node): Node[] {
  const c = TIER_C[step];
  const back: Node[] = [], front: Node[] = [];
  if (khatm) {
    back.push(bmLayer('bm-halo', `<circle cx="100" cy="100" r="99" fill="none" stroke="${c[1]}" stroke-width="5" opacity=".45"/><circle cx="100" cy="100" r="108" fill="none" stroke="${c[0]}" stroke-width="1.6" opacity=".5"/>`),
      bmLayer('bm-outer', petals(24, 128, 9, [c[1], c[2]], 7.5).replace(/<g /g, '<g opacity=".38" '), 'bm-turn-slow'));
  }
  switch (step) {
    case 0:
      back.push(bmLayer('bm-glow', `<circle cx="100" cy="100" r="74" fill="${c[1]}" opacity=".16"/><circle cx="100" cy="100" r="54" fill="${c[1]}" opacity=".2"/>`),
        bmLayer('bm-dust', `<ellipse cx="100" cy="164" rx="62" ry="12" fill="none" stroke="${c[0]}" stroke-width="3" opacity=".6"/>`));
      break;
    case 1: {
      const sq = (rot: number, col: string[]) => { const d = `M${100 - 56} ${100 - 56}H${100 + 56}V${100 + 56}H${100 - 56}Z`; return `<g transform="rotate(${rot} 100 100)" opacity=".38">${edge(d, col[3], 3)}${two(d, col[1], col[2], -2.5, -2.5)}</g>`; };
      back.push(bmLayer('bm-sqa', sq(0, c)), bmLayer('bm-sqb', sq(45, c)),
        h('span', { class: 'bm-l bm-studs', 'aria-hidden': 'true' }, ...dots('bm-stud', 8, 39.6)),
        h('span', { class: 'bm-l bm-ripple', 'aria-hidden': 'true' }, h('i', {})));
      break;
    }
    case 2: {
      const wedges = ring(24, 0, (_x, _y, a, i) => {
        const w = Math.PI / 24, p = (r: number, t: number) => `${(100 + r * Math.cos(t)).toFixed(1)} ${(100 + r * Math.sin(t)).toFixed(1)}`;
        return `<path d="M${p(26, a - w * .5)}L${p(104, a - w * .9)}L${p(104, a + w * .9)}L${p(26, a + w * .5)}Z" fill="${i % 2 ? c[2] : c[0]}" opacity="${i % 2 ? .3 : .42}"/>`;
      });
      back.push(bmLayer('bm-sun', wedges, 'bm-turn'),
        bmLayer('bm-lau l', branch(1, ['#bff5d8', '#4fd19b', '#1f9a6a', '#0b5a3c'])),
        bmLayer('bm-lau r', branch(-1, ['#bff5d8', '#4fd19b', '#1f9a6a', '#0b5a3c'])));
      break;
    }
    case 3:
      back.push(bmLayer('bm-pa', petals(12, 100, 15, [c[1], c[2]]), 'bm-turn-slow'),
        bmLayer('bm-pb', petals(12, 76, 12, [c[0], c[1]], 15)),
        bmLayer('bm-pillar', `<rect x="72" y="-120" width="56" height="230" rx="28" fill="#fff" opacity=".18"/><rect x="88" y="-120" width="24" height="230" rx="12" fill="#fff" opacity=".32"/>`),
        h('span', { class: 'bm-l bm-rings', 'aria-hidden': 'true' }, h('i', {}), h('i', {})));
      break;
    default: {
      const beams = ring(8, 0, (_x, _y, a, i) => {
        const p = (r: number, t: number) => `${(100 + r * Math.cos(t)).toFixed(1)} ${(100 + r * Math.sin(t)).toFixed(1)}`;
        return `<path d="M${p(10, a - .12)}L${p(150, a - .05)}L${p(150, a + .05)}L${p(10, a + .12)}Z" fill="${i % 2 ? c[1] : '#fff'}" opacity="${i % 2 ? .28 : .4}"/>`;
      });
      const gems = ring(12, 90, (x, y, a) => {
        const d = `M${x.toFixed(1)} ${(y - 7).toFixed(1)}L${(x + 4.5).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y + 7).toFixed(1)}L${(x - 4.5).toFixed(1)} ${y.toFixed(1)}Z`;
        return `<g transform="rotate(${((a * 180) / Math.PI + 90).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${edge(d, c[3], 1.5)}${two(d, c[0], c[2], -1.2, -1.2)}</g>`;
      });
      back.push(bmLayer('bm-beams', beams, 'bm-turn'), bmLayer('bm-orbit', gems, 'bm-turn-back'));
      front.push(h('span', { class: 'bm-l bm-core', 'aria-hidden': 'true' }),
        h('span', { class: 'bm-l bm-glints', 'aria-hidden': 'true' }, ...[[22, 24, 0], [80, 30, .7], [70, 76, 1.4], [26, 70, 2.1], [52, 8, 1.1], [90, 58, 1.8]].map(([x, y, d]) =>
          h('i', { class: 'bm-glint', style: `left:${x}%;top:${y}%;--d:${d}s` }))));
    }
  }
  return [...back, h('span', { class: `cel-badge bm-badge s${step}` }, badge), ...front];
}
/** Colours for a badge moment's sparks, in its tier's metal. */
const tierSparks = (step: number) => TIER_C[step].slice(0, 3).map((x) => rgba(x, 1)).concat(step === 2 ? [rgba('#4fd19b', 1)] : []);

/** Cracks drawn over the chest (same viewBox as `chestArt`), lit one by one as it is tapped. */
const CRACKS = ['M27 40l3 5.5-2.2 4.5 3.6 5.5 -1.6 4', 'M53 38.5l-2.4 6.5 3 3.6-2.2 6.4', 'M15 29l5.5 2.6 3.6-2.2', 'M64 45l-4.8 3 2 4.6-3.8 4', 'M41 15.5l-1.4 4.6 2.8 2.8-1.8 3.6', 'M33 60l3.4-3.2 3.6 2.6 3.2-3.4'];
/** How many taps each chest tier may take to open (least, most); the exact number is hidden and random. */
const CHEST_TAPS: [number, number][] = [[3, 5], [3, 5], [4, 6], [4, 7], [5, 8]];

function crackArt() {
  const el = svg(80, `<path class="seam" d="M12 37.2H68"/>${CRACKS.map((d) => `<path d="${d}" pathLength="1"/>`).join('')}`);
  el.setAttribute('viewBox', '0 0 80 76');
  el.classList.add('cel-crack');
  return el;
}

/** Sizes of the badge on its stage, by tier. */
const BADGE_PX = [250, 176, 150, 146, 146];
/** The badge it had before a tier-up, with the cracks that run through it and the shards it breaks into. */
function oldBadge(art: Node, step: number) {
  const c = TIER_C[step];
  // Each crack its own layer, so lighting one fades a layer instead of repainting the drawing.
  const ks = ['M100 46l-9 26 14 12-11 22 8 18', 'M64 92l22 6 8 18-12 20', 'M138 82l-18 14 4 20 16 14', 'M78 140l20-10 22 6'].map((d) =>
    h('span', { class: 'bm-l bm-crack' }, svgOf('0 0 200 200', `<path d="${d}" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`)));
  const wrap = h('span', { class: 'cel-badge bm-old', 'aria-hidden': 'true' }, art, ...ks);
  // Twelve shards scattered over the badge's face, each flying out from where it sat.
  let seed = step * 97 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shards = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.4, r = 8 + rnd() * 18;
    const x = 50 + r * Math.cos(a), y = 50 + r * Math.sin(a);
    const pts = [0, 1, 2].map((k) => `${Math.round(50 + 50 * Math.cos(a + k * 2.1 + rnd()))}% ${Math.round(50 + 50 * Math.sin(a + k * 2.1 + rnd()))}%`).join(',');
    const el = h('i', { class: 'bm-shard', style: `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${(9 + rnd() * 8).toFixed(1)}%;clip-path:polygon(${pts});background:linear-gradient(${Math.round(rnd() * 360)}deg,${c[0]},${c[1]} 45%,${c[2]})` });
    return { el, dx: Math.cos(a) * (90 + rnd() * 80), dy: Math.sin(a) * (90 + rnd() * 80) + 30, rot: (rnd() - 0.5) * 540 };
  });
  const shardLayer = h('span', { class: 'bm-l bm-shards', 'aria-hidden': 'true' }, ...shards.map((x) => x.el));
  return {
    wrap, shardLayer,
    /** Comes out of the burst, shudders while the cracks run through it, then breaks. Returns when it broke (ms). */
    play(later: (ms: number, f: () => void) => void, onBreak: () => void): number {
      wrap.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.1)', offset: .6 }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 380, easing: 'cubic-bezier(.2,1,.4,1)', fill: 'both' });
      [430, 560, 680, 780].forEach((ms, i) => later(ms, () => {
        ks[i]?.animate([{ opacity: 0 }, { opacity: .95 }], { duration: 90, fill: 'forwards' });
        wrap.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${i % 2 ? 7 : -7}deg) scale(${1 - i * 0.015})` }, { transform: 'rotate(0deg)' }], { duration: 110, easing: 'ease-out', composite: 'add' });
        sfx.tap(0.35 + i * 0.15, Math.min(4, step + 1));
        vibrate([6 + i * 3]);
      }));
      later(880, () => {
        wrap.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.18)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
        shards.forEach((x) => x.el.animate([
          { opacity: 1, transform: 'translate(0,0) rotate(0deg) scale(1)' },
          { opacity: 1, transform: `translate(${x.dx * .7}px,${x.dy * .7 - 30}px) rotate(${x.rot * .7}deg) scale(.9)`, offset: .55 },
          { opacity: 0, transform: `translate(${x.dx}px,${x.dy + 40}px) rotate(${x.rot}deg) scale(.5)` },
        ], { duration: 720, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' }));
        sfx.pop(2);
        vibrate([18, 30, 10]);
        onBreak();
      });
      return 920;
    },
  };
}

function vibrate(p: number[]) {
  try { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(p); } catch { /* ignore */ }
}

/** Plays a reward moment over the screen; resolves when it is closed. */
export function celebrate(m: Moment, from?: Element | null, light = 0): Promise<void> {
  P = rewardPalette();
  // Old-phone mode keeps the moment: it is a few SVG shapes moved by CSS, cheap to draw.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = h('div', { class: 'cel-stage' });
  let kicker = '', title = '', sub = '';
  let count: HTMLElement | null = null;
  let old: ReturnType<typeof oldBadge> | null = null;
  const stats = m.kind === 'lantern' || m.kind === 'star' || m.kind === 'hifz' ? m.stats ?? [] : [];
  // A chest: dropped in, then tapped open (a bigger one takes more taps), then what it holds comes out.
  const tier = chestTier(light);
  const isChest = m.kind === 'chest';
  const loot: Loot[] = m.kind === 'chest' ? (m.loot ?? (light > 0 ? [{ kind: 'light', n: light }] : [])) : [];
  // Rewards claimed one after another make a combo ("3 in a row"); from the third, the moment gets shorter:
  // one tap fewer, a quicker drop-in and prizes that come out faster (feel pass, owner request 2026-11-10).
  const streakN = combo();
  const roll = streakN >= 3;
  // A rare prize (a jewel avatar, a rare frame) or the biggest chest gets a bigger moment: the light gathers
  // in slow motion before it bursts, a double burst, a rising swell, and the rare card lands with its own ring.
  const epic = loot.some((l) => l.kind === 'item' && l.rare) ? 2 : tier >= 4 ? 1 : 0;
  // How it gives way is never the same twice (owner request 2026-11-11, "engaging, with uncertainty"): each
  // chest has a hidden strength within its tier's range, each tap cracks it by an uneven amount (quick taps
  // a little more), and it may lift its lid and slam shut again once before it gives. What is inside never
  // changes and is always shown afterwards; only the opening is uncertain.
  const [lo, hi] = CHEST_TAPS[tier];
  const up = m.kind === 'chest' ? Math.max(1, Math.min(4, Math.round(m.up ?? 1))) : 1;
  const least = Math.max(2, lo - (roll ? 1 : 0), up), most = Math.max(least + 1, hi - (roll ? 1 : 0));
  const need = least + Math.random() * (most - least);
  const almostAt = most >= 4 && Math.random() < (tier >= 2 ? 0.85 : 0.55) ? 0.5 + Math.random() * 0.3 : 2;
  const jolt = isChest ? h('div', { class: 'cel-chest-jolt' }, chestArt(tier), crackArt()) : null;
  // Upgrades: on some of the taps before it can open (picked at random), the chest flares and its badge climbs
  // ×2 → ×3 → ×4; when it opens, the extra chests drop in beside it.
  const upAt = new Set<number>();
  while (upAt.size < up - 1) upAt.add(1 + Math.floor(Math.random() * (least - 1)));
  const upAura = up > 1 ? h('span', { class: 'cel-up-aura', 'aria-hidden': 'true' }) : null;
  const upBadge = up > 1 ? h('span', { class: `cel-up${still ? ` u${up} on` : ''}`, 'aria-hidden': 'true' }, still ? `×${up}` : '') : null;
  // The idle nudge (CSS) on its own layer around the jolt (taps, squashes): one motion per layer, so the graphics
  // chip moves both (motion engine pass 2026-11-19; the chest lagged on slow phones).
  const chestBox = isChest ? h('div', { class: `cel-chest-box${still && up > 1 ? ` u${up}` : ''}` }, upAura ?? '', h('div', { class: 'cel-chest-nudge' }, jolt!), upBadge ?? '') : null;
  const hit = isChest ? h('button', { class: 'cel-chest-hit', 'aria-label': t('cel.tapOpen') }) : null;
  const tapLine = h('span', {}, t('cel.tapOpen'));
  // The Light inside counts up when it lands; the other prizes carry their own picture and name.
  let lootLight: HTMLElement | null = null;
  const lootCards = loot.map((l) => {
    let art: Node, label: Node | string;
    if (l.kind === 'light') {
      lootLight = h('b', { style: `--digits:${String(l.n).length + 1.2}ch` }, `+${still ? l.n : 0}`);
      art = h('span', { class: 'cel-orb' });
      label = h('span', {}, lootLight, ` ${t('me.light')}`);
    } else if (l.kind === 'freeze') { art = freezeArt(); label = t('cel.freeze'); } else { art = l.art; label = l.label; }
    const rare = l.kind === 'item' && l.rare;
    return h('div', { class: `cel-loot-it${rare ? ' rare' : ''}`, ...(rare ? { 'data-rare': t('cel.rare') } : {}) }, h('span', { class: 'cel-loot-art' }, art), h('span', { class: 'cel-loot-lb' }, label));
  });
  const slot = isChest ? h('div', { class: 'cel-slot' },
    h('p', { class: 'cel-tap', 'aria-hidden': 'true' }, tapLine),
    h('div', { class: 'cel-loot' }, ...lootCards)) : null;
  if (m.kind === 'chest') {
    stage.append(h('span', { class: 'cel-chest-rays', 'aria-hidden': 'true' }, h('i', {})), h('span', { class: 'cel-chest-beam', 'aria-hidden': 'true' }), chestBox!, hit!);
    kicker = m.kicker ?? t('cel.goal');
    title = m.title; sub = m.sub;
  } else if (m.kind === 'lantern' || m.kind === 'star') {
    stage.append(m.kind === 'lantern' ? lanternArt() : starArt());
    kicker = m.kicker ?? t(m.kind === 'lantern' ? 'cel.goal' : 'cel.all');
    title = m.title; sub = m.sub;
  } else if (m.kind === 'hifz') {
    kicker = m.kicker ?? t('cel.big');
    title = m.title; sub = m.sub;
    stage.classList.add('bm');
    stage.style.cssText = TIER_C[m.step].map((x, i) => `--b${i}:${x}`).join(';');
    stage.append(...badgeStage(m.step, false, hifzBadge(m.s, m.step, 168)));
    if (m.from != null && m.from >= 0 && m.from < m.step && !still) old = oldBadge(hifzBadge(m.s, m.from, 168), m.from);
  } else {
    const b = (m as Exclude<Moment, { kind: 'lantern' | 'star' | 'chest' | 'hifz' }>).badge;
    title = badgeName(b);
    sub = badgeGoal(b);
    if (m.kind === 'flame') {
      kicker = t('cel.streak');
      count = h('b', { class: 'cel-num' }, String(still ? m.days : 0));
      stage.append(
        h('span', { class: 'cel-rings' }, h('i', {}), h('i', {}), h('i', {})),
        h('span', { class: 'cel-fl' }, flame(m.days >= 30 ? 3 : 2, 150, still)),
        h('span', { class: 'cel-count' }, count, h('span', {}, t('me.days'))),
        h('span', { class: `cel-badge small bm-badge s${b.step}` }, badgeArt(b.tier, b.icon, true, 64)));
    } else {
      kicker = t(m.kind === 'medal' ? 'cel.badge' : 'cel.big');
      if (m.kind === 'khatm') title = t('cel.khatm');
      if (m.kind === 'khatm') sub = t('cel.khatmSub', { date: new Intl.DateTimeFormat(locale(), { dateStyle: 'long' }).format(new Date()) });
      stage.classList.add('bm');
      stage.style.cssText = TIER_C[b.step].map((x, i) => `--b${i}:${x}`).join(';');
      stage.append(...badgeStage(b.step, m.kind === 'khatm', badgeArt(b.tier, b.icon, true, BADGE_PX[b.step] - (m.kind === 'khatm' ? 10 : 0))));
      // A tier above Bronze replaces the one before it (the Khatm is a badge of its own).
      if (b.step > 0 && m.kind !== 'khatm' && !still) old = oldBadge(badgeArt(TIERS[b.step - 1], b.icon, true, BADGE_PX[b.step - 1]), b.step - 1);
    }
  }
  // Sparks in the theme's colours: its neon stops, its brightest stop lifted, a near-white core.
  const isBadge = m.kind === 'medal' || m.kind === 'rosette' || m.kind === 'khatm' || m.kind === 'hifz';
  const bstep = m.kind === 'hifz' ? m.step : 'badge' in m ? m.badge.step : 0;
  // A tier-up: the new tier's stage waits aside while the old badge breaks; the old one (and its shards) stand in.
  const newParts: Node[] = old ? [...stage.childNodes] : [];
  if (old) stage.replaceChildren(old.shardLayer, old.wrap);
  const sparkColors = isBadge ? tierSparks(bstep) : [rgba(P.n1, 1), rgba(P.n3, 1), rgba(P.hi, 1), rgba(P.core, 1), ...(m.kind === 'flame' ? [rgba(P.n2, 1)] : [])];
  // The Light this claim adds: a small pill that counts up once the moment lands.
  const lightNum = light > 0 && !isChest ? h('b', {}, String(still ? light : 0)) : null;
  const lightPill = lightNum ? h('p', { class: 'cel-light' }, '✦ ', lightNum, ` ${t('me.light')}`) : null;
  // Counters tick up with a little pop on each step (and a tiny tick sound).
  const countUp = (num: HTMLElement | null, n: number) => { if (num) tickNum(num, n, { prefix: '+', onPop: sfx.tick }); };
  const countLight = () => countUp(lightNum, light);
  if (lightNum && still) lightNum.textContent = `+${light}`;
  const comboPill = h('p', { class: 'cel-combo' }, streakN >= 2 ? t('cel.combo', { n: streakN }) : '');
  // Noor watches the chest, hops with each tap and cheers when it opens.
  const nr = isChest && !still ? makeNoor('cel-noor') : null;
  if (nr) stage.append(nr.el);
  // The user's own character (when they made one) stands beside the chest, watches and cheers.
  // The character also cheers the big milestones: a first surah, a juz, ten surahs, the Khatm (round 3).
  const me = (isChest || m.kind === 'rosette' || m.kind === 'khatm' || (m.kind === 'hifz' && m.step === 0)) && !still ? makeActor(`cel-actor${isChest ? '' : ' big'}`) : null;
  if (me) stage.append(me.el);
  return new Promise((resolve) => {
    const frames = still ? null : fpsStart(isChest ? `Chest · ${['wood','brass','cedar','emerald','pearl'][tier]}` : `Moment · ${m.kind}`);
    const ok = h('button', { class: 'cel-ok' }, t('cel.ok'));
    const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
    const el = h('div', { class: `cel cel-${m.kind}${isBadge ? ` bm-t${bstep}` : ''}${still ? ' still go' : ''}${still && isChest ? ' opened revealed' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${kicker}: ${title}` },
      h('span', { class: 'cel-flash', 'aria-hidden': 'true' }),
      h('span', { class: 'cel-sweep', 'aria-hidden': 'true' }),
      stage,
      slot ?? '',
      canvas,
      h('div', { class: 'cel-text' }, h('p', { class: 'cel-kicker' }, kicker), h('h2', {}, title), h('p', { class: 'cel-sub' }, sub)),
      stats.length ? h('div', { class: 'cel-stats' }, ...stats.map((x, i) => h('span', { class: `cel-stat ${x.icon ?? ''}`, style: `--i:${i}` }, x.icon ? statIcon(x.icon) : '', x.text))) : '',
      comboPill,
      lightPill ?? '',
      ok);
    const opened = performance.now();
    const timers = new Map<number, () => void>();
    const later = (ms: number, f: () => void) => { const id = window.setTimeout(() => { timers.delete(id); f(); }, ms); timers.set(id, f); };
    // A tap during the opening plays the rest of it at once: the pending beats run now, the animations jump to their end.
    let skipped = false;
    const skip = () => {
      skipped = true;
      for (let n = 0; n < 8 && timers.size; n++) {
        const due = [...timers]; timers.clear();
        for (const [id, f] of due) { clearTimeout(id); f(); }
      }
      for (const a of el.getAnimations({ subtree: true })) {
        if (a.effect?.getComputedTiming().iterations !== Infinity) try { a.finish(); } catch { /* still pending */ }
      }
    };
    let fx: Sparks | null = null;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      frames?.();
      timers.forEach((_, id) => clearTimeout(id));
      timers.clear();
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      holdPage(false);
      const lightCard = lootLight ? (lootLight as HTMLElement).closest('.cel-loot-it') : null;
      if (light > 0 && !still) { flyLight(lightCard ?? stage, tier); sfx.whoosh(); }
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

    // The chest is opened by hand: each tap jolts it, cracks it and lets more light out of the seam.
    let taps = 0, ready = false, isOpen = false, revealed = false, revealedAt = 0;
    const showCombo = () => {
      if (streakN < 2 || still) return;
      popIn(comboPill, { delay: 120 });
      setTimeout(() => {
        const r = comboPill.getBoundingClientRect(), k = canvasBox();
        fx?.burst(r.left + r.width / 2 - k.left, r.top + r.height / 2 - k.top, 18, 0.5);
        sfx.shimmer();
      }, 260);
    };
    const lootTimers: number[] = [];
    let kb: DOMRect | null = null, sb: DOMRect | null = null, cb: DOMRect | null = null;
    const canvasBox = () => kb ??= canvas.getBoundingClientRect();
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      revealedAt = performance.now();
      lootTimers.forEach(clearTimeout);
      lootCards.forEach((c) => { own(c); c.classList.add('in', 'landed'); });
      if (lootLight) (lootLight as HTMLElement).textContent = `+${(loot.find((l) => l.kind === 'light') as { n: number }).n}`;
      el.classList.add('revealed');
      fx?.motes(true);
      sfx.shimmer();
      nr?.glow(1);
      showCombo();
      ok.focus({ preventScroll: true });
      // While the user reads what they won, the page behind is brought back (its restyle done now, in a still
      // moment, not at Continue, where it held up the fade and the Light flying home).
      later(1400, () => { if (done) return; if ('requestIdleCallback' in window) requestIdleCallback(() => { if (!done) uncover(); }, { timeout: 600 }); else uncover(); });
    };
    const land = (i: number) => {
      const c = lootCards[i];
      c.classList.add('landed');
      const r = cardAt[i] ?? c.getBoundingClientRect(), k = canvasBox();
      fx?.burst(r.left + r.width / 2 - k.left, r.top + 32 - k.top, 22 + tier * 4, 0.55);
      squash(c.querySelector('.cel-loot-art')!, 0.3);
      const l = loot[i];
      const isRare = l.kind === 'item' && !!l.rare;
      sfx.pop(i, isRare);
      nr?.hop(isRare ? 1.2 : 0.6);
      if (i > 0 || isRare) me?.hop(isRare ? 0.9 : 0.35);
      if (isRare) {
        c.classList.add('rare-in');
        fx?.burst(r.left + r.width / 2 - k.left, r.top + 32 - k.top, 40, 0.8);
      }
      if (l.kind === 'light') countUp(lootLight, l.n);
    };
    const GAP = roll ? 420 : 650;
    let cardAt: DOMRect[] = [];
    const pour = () => {
      // One prize after another: out of the chest's mouth in an arc, landing on its card.
      // Every box read once, before anything moves (read per prize, each one restyled the moment).
      const s = sb ?? stage.getBoundingClientRect();
      cardAt = lootCards.map((c) => c.getBoundingClientRect());
      const mx = s.left + s.width / 2, my = s.top + s.height * 0.42;
      lootCards.forEach((c, i) => lootTimers.push(window.setTimeout(() => {
        c.classList.add('in');
        const r = cardAt[i];
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
        c.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: 0 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 110}px) scale(1.35)`, opacity: 1, offset: 0.55 },
          { transform: 'scale(.9)', offset: 0.86 },
          { transform: 'none' },
        ], { duration: 780, easing: 'cubic-bezier(.3, 0, .3, 1)' });
        vibrate([8]);
        lootTimers.push(window.setTimeout(() => land(i), 700));
      }, i * GAP)));
      lootTimers.push(window.setTimeout(reveal, lootCards.length * GAP + (roll ? 300 : 500)));
    };
    const openChest = () => {
      const b = cb ??= chestBox!.getBoundingClientRect(), k = canvasBox(), s0 = sb ??= stage.getBoundingClientRect();
      // The burst is spread over four frames (2026-11-26, Marwan: "the last opening reveal frames lag a bit"): it all
      // used to start in one task, ~165 ms at 6× CPU, so the best moment of the chest began with a dropped frame.
      // 1. The chest itself: it pops open, its sound, the sparks (drawn off the main thread).
      own(jolt!);
      // Released from the crouch: it stretches up, then wobbles and settles.
      squash(jolt!, -0.3, { stiffness: 300, damping: 10 });
      sfx.open(epic, tier);
      chestBox!.classList.add('open');
      stage.classList.add('opened');
      el.classList.add('opened');
      el.classList.remove('charging');
      if (epic) el.classList.add('epic');
      fx?.burst(b.left + b.width / 2 - k.left, b.top + b.height * 0.42 - k.top, 60 + tier * 24 + epic * 40, 0.95 + tier * 0.1 + epic * 0.15);
      // 2. The flare under it (bitmaps drawn while it waited).
      requestAnimationFrame(() => {
        if (done) return;
        flare(stage, Math.min(4, tier + (epic ? 1 : 0)) as Rarity, { x: b.left + b.width / 2 - s0.left, y: b.top + b.height * 0.42 - s0.top, size: s0.width * 1.5, under: true, hold: 0 });
        // 3. Its sparkles (flare.ts, the next frame), then 4. the character and Noor cheer.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (done) return;
          nr?.cheer();
          me?.cheer(epic ? 3000 : 2200);
          if (epic) me?.face('star', 3000);
        }));
      });
      if (epic) later(260, () => fx?.burst(b.left + b.width / 2 - k.left, b.top + b.height * 0.42 - k.top, 50 + epic * 20, 1.1));
      const extra = up > 1 ? 480 + (up - 1) * 300 : 0;
      if (up > 1) later(380, () => twins(s0, k));
      later((roll ? 400 : 650 + epic * 250) + extra, pour);
    };
    const paths = jolt ? [...jolt.querySelectorAll<SVGPathElement>('.cel-crack path:not(.seam)')] : [];
    let force = 0, lastTap = 0, almostDone = false, strainT = 0, hint = '';
    const setHint = (k: MomentKey) => {
      if (k === hint) return;
      hint = k;
      tapLine.textContent = mt(k);
      bump(tapLine, 0.25);
    };
    // Between taps it strains on its own, harder the more it has given way: it is alive, and close.
    const strain = () => {
      clearTimeout(strainT);
      if (isOpen) return;
      const p = Math.min(1, force / need);
      strainT = window.setTimeout(() => {
        if (isOpen || !el.isConnected) return;
        const a = 1.5 + p * 5;
        if (art) own(art);
        art?.animate([{ rotate: '0deg' }, { rotate: `${-a}deg` }, { rotate: `${a}deg` }, { rotate: `${-a * 0.6}deg` }, { rotate: `${a * 0.3}deg` }, { rotate: '0deg' }], { duration: 300 + p * 120, easing: 'ease-in-out' });
        if (p > 0.35) {
          if (lid) own(lid);
          lid?.animate([{ translate: '0 0' }, { translate: `0 ${-(2 + p * 4).toFixed(1)}%`, offset: 0.3 }, { translate: '0 0' }], { duration: 260 });
          sfx.strain(p, tier);
        }
        strain();
      }, 900 + Math.random() * 900 - p * 400);
    };
    const art = jolt?.querySelector<HTMLElement>('.ck-art');
    const lid = jolt?.querySelector<SVGElement>('.ck-lid');
    const mouth = jolt?.querySelector<SVGElement>('.ck-mouth');
    const crackOn = [epic ? chestBox : null, mouth, jolt?.querySelector<SVGElement>('.cel-crack .seam')].filter((n): n is HTMLDivElement | SVGElement => !!n);
    const beam = stage.querySelector<HTMLElement>('.cel-chest-beam');
    // Almost: the lid flies up, light floods out, and it slams shut again.
    // Positions are read in the tap before anything changes (a read after a change makes the phone redo every style).
    const almost = (b: DOMRect, k: DOMRect) => {
      sfx.almost(tier);
      setHint('cel.tapAlmost');
      el.classList.add('almost');
      if (lid) own(lid);
      if (mouth) own(mouth);
      if (beam) own(beam);
      lid?.animate([
        { translate: '0 0', rotate: '0deg' },
        { translate: '0 -16%', rotate: '-11deg', offset: 0.3 },
        { translate: '0 -18%', rotate: '-13deg', offset: 0.5 },
        { translate: '0 0', rotate: '0deg', offset: 0.78 },
        { translate: '0 -2%', rotate: '1deg', offset: 0.88 },
        { translate: '0 0', rotate: '0deg' },
      ], { duration: 620, easing: 'cubic-bezier(.3, 0, .5, 1)' });
      mouth?.animate([{ opacity: 0.4 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.55 }, { opacity: 0.6, offset: 0.78 }, { opacity: 0.6 }], { duration: 620 });
      beam?.animate([{ opacity: 0, scale: '1 .3' }, { opacity: 0.55, scale: '1 .8', offset: 0.35 }, { opacity: 0.4, scale: '1 .7', offset: 0.6 }, { opacity: 0, scale: '1 .2', offset: 0.8 }, { opacity: 0 }], { duration: 620 });
      fx?.burst(b.left + b.width / 2 - k.left, b.top + b.height * 0.4 - k.top, 30 + tier * 8, 0.75);
      nr?.glow(1);
      me?.hop(0.9);
      me?.face('wow', 1100);
      later(470, () => {
        // Slammed shut: the whole chest squashes and the room shakes a little.
        squash(jolt!, 0.32, { stiffness: 420, damping: 12 });
        own(stage);
        stage.animate([{ translate: '0 0' }, { translate: '-4px 2px' }, { translate: '3px -1px' }, { translate: '-1px 0' }, { translate: '0 0' }], { duration: 240 });
        const b2 = cb ??= chestBox!.getBoundingClientRect(), k2 = canvasBox();
        fx?.burst(b2.left + b2.width / 2 - k2.left, b2.bottom - b2.height * 0.14 - k2.top, 14, 0.4);
        el.classList.remove('almost');
      });
    };
    let level = 1;
    const upgrade = (b: DOMRect, k: DOMRect) => {
      level++;
      upBadge!.textContent = `×${level}`;
      upBadge!.className = `cel-up u${level} on`;
      chestBox!.classList.remove(`u${level - 1}`);
      chestBox!.classList.add(`u${level}`);
      own(upBadge!);
      upBadge!.animate([{ scale: '0', rotate: '-30deg' }, { scale: '1.6', rotate: '8deg', offset: 0.45 }, { scale: '.9', rotate: '-3deg', offset: 0.7 }, { scale: '1', rotate: '0deg' }], { duration: 520, easing: 'ease-out' });
      own(upAura!);
      upAura!.animate([{ scale: '.4', opacity: 0 }, { scale: '1.35', opacity: 1, offset: 0.3 }, { scale: '1', opacity: 0.85 }], { duration: 700, easing: 'ease-out' });
      const cx = b.left + b.width / 2 - k.left, cy = b.top + b.height * 0.45 - k.top;
      fx?.burst(cx, cy, 40 + level * 20, 0.9 + level * 0.15);
      later(140, () => fx?.burst(cx, cy, 24 + level * 10, 1.1));
      sfx.rare(260 + level * 90);
      later(120, () => sfx.shimmer());
      vibrate(level >= 4 ? [30, 60, 30, 60, 40] : [24, 50, 24]);
      me?.face('wow', 1200);
      me?.hop(1);
      nr?.cheer();
      hint = '';
      tapLine.textContent = `×${level}!`;
      bump(tapLine, 0.5);
    };
    // The extra chests (one for each step up) drop in beside it and burst open one after another.
    const TWIN_AT = [[0.96, 0.7], [0.04, 0.7], [0.5, -0.06]];
    const twins = (s: DOMRect, k: DOMRect) => {
      for (let i = 0; i < up - 1; i++) {
        const [fx0, fy0] = TWIN_AT[i];
        const tj = h('div', { class: 'cel-chest-jolt' }, chestArt(tier));
        const box = h('div', { class: `cel-chest-box cel-twin u${up}`, style: `left:${(fx0 - 0.27) * 100}%;top:${(fy0 - 0.27) * 100}%` }, tj);
        later(i * 300, () => {
          stage.append(box);
          tj.animate([
            { transform: 'translateY(-160%) scale(.7, 1.3)', opacity: 0 },
            { transform: 'translateY(6%) scale(1.28, .74)', opacity: 1, offset: 0.55 },
            { transform: 'translateY(-6%) scale(.92, 1.08)', offset: 0.78 },
            { transform: 'none' },
          ], { duration: 560, easing: 'cubic-bezier(.4, 0, .6, 1)' });
          sfx.whoosh();
          later(330, () => {
            box.classList.add('open');
            const x = s.left + s.width * fx0 - k.left, y = s.top + s.height * fy0 - k.top;
            fx?.burst(x, y, 50, 0.95);
            sfx.open(1, tier);
            vibrate([18, 40, 18]);
            me?.hop(0.6);
          });
        });
      }
    };
    const tapChest = (x: number | null, y: number | null) => {
      if (isOpen) return;
      // Where the chest has got to, read first, while nothing has changed since the last frame (read after the
      // changes below, it made the browser restyle the moment mid-tap).
      const pose0 = takeOver(jolt!);
      taps++;
      const now = performance.now();
      // Uneven: some taps crack it a lot, some barely; quick taps in a row a little more.
      let w = 0.4 + Math.random() * 1.2;
      if (now - lastTap < 380) w *= 1.2;
      lastTap = now;
      force += w;
      // Never open before its least, always by its most.
      if (taps < least) force = Math.min(force, need * (0.6 + 0.3 * taps / least));
      if (taps >= most) force = Math.max(force, need);
      let p = Math.min(1, force / need);
      const doAlmost = !almostDone && p >= almostAt && taps < most;
      if (doAlmost) { almostDone = true; force = Math.min(force, need * 0.9); p = force / need; }
      const done = p >= 1;
      sfx.tap(p, tier);
      nr?.hop(p);
      if (taps === 1) me?.lean(1); else me?.hop(0.25 + 0.35 * p);
      nr?.glow(p);
      if (taps === 1) el.classList.add('tapped');
      const b = cb ??= chestBox!.getBoundingClientRect(), k = canvasBox();
      const on = x != null && y != null && x > b.left && x < b.right && y > b.top && y < b.bottom;
      fx?.burst((on ? x! : b.left + b.width / 2) - k.left, (on ? y! : b.top + b.height * 0.45) - k.top, 12 + Math.round(p * 30), 0.45 + p * 0.4);
      // It pushes back harder as it gives way: a bigger jolt and a quicker rebound.
      const a = (5 + tier) * (0.6 + 0.6 * p) * (0.85 + Math.random() * 0.3);
      const side = Math.random() < 0.5 ? -1 : 1;
      // From wherever the last jolt has got to, so a quick tap never jumps (and one move at a time on the layer).
      jolt!.animate([
        { transform: pose0 },
        { transform: 'translateY(5px) scale(1.1, .88)', offset: 0.14 },
        { transform: `translateY(${-10 - p * 16}px) rotate(${-a * side}deg) scale(.95, 1.07)`, offset: 0.4 },
        { transform: `translateY(-3px) rotate(${a * 0.8 * side}deg)`, offset: 0.62 },
        { transform: `rotate(${-a * 0.35 * side}deg)`, offset: 0.82 },
        { transform: 'none' },
      ], { duration: 440 + tier * 30 - p * 60, easing: 'ease-out' });
      if (!doAlmost && lid) own(lid);
      if (!doAlmost) lid?.animate([{ translate: '0 0', rotate: '0deg' }, { translate: `0 ${((-2 - p * 7) / 0.76).toFixed(2)}%`, rotate: `${-2 - p * 5}deg`, offset: 0.4 }, { translate: '0 0', rotate: '0deg' }], { duration: 420 });
      const lit = done ? paths.length : Math.min(paths.length - 1, Math.ceil(p * paths.length));
      paths.forEach((q, i) => q.classList.toggle('on', i < lit));
      // Only on what reads it: set on the stage, the change restyled every node of the character too.
      for (const n of crackOn) n.style.setProperty('--crack', String(p));
      if (upAt.has(taps)) upgrade(b, k);
      if (doAlmost) { almost(b, k); strain(); return; }
      if (!done) { setHint(p >= 0.62 ? 'cel.tapNear' : 'cel.tapMore'); strain(); return; }
      clearTimeout(strainT);
      // Anticipation: it crouches, gathering itself, for a breath before it bursts.
      isOpen = true;
      own(jolt!);
      const pose = pose0;
      // A rare prize: the light gathers in slow motion first (the screen dims, the seam blazes, a swell rises).
      const hold = epic ? 560 + epic * 220 : 170;
      if (epic) { el.classList.add('charging'); sfx.rare(hold); }
      jolt!.animate(epic
        ? [{ transform: pose }, { transform: 'translateY(6px) scale(1.08, .9)', offset: 0.3 }, { transform: 'translate(-2px, 9px) scale(1.14, .84)', offset: 0.55 }, { transform: 'translate(2px, 10px) scale(1.16, .82)', offset: 0.75 }, { transform: 'translateY(11px) scale(1.18, .8)' }]
        : [{ transform: pose }, { transform: 'translateY(9px) scale(1.16, .8)' }], { duration: hold, easing: 'cubic-bezier(.3, 0, .7, 1)', fill: 'forwards' });
      later(hold + 10, openChest);
    };
    hit?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit.click(); } });

    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => {
      if (e.target === ok) return;
      if (isChest && !still) {
        if (!isOpen) { if (ready) tapChest(e.detail ? e.clientX : null, e.detail ? e.clientY : null); return; }
        if (!revealed) { reveal(); return; }
        if (performance.now() - revealedAt > 700) close();
        return;
      }
      if (performance.now() - opened > 2000 || skipped) close();
      else skip();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    // Read before the moment is added: the page's layout is still clean, so this costs nothing.
    const r = still ? undefined : from?.getBoundingClientRect();
    // The stage's parts (the chest, the character: ~450 drawn nodes) come in one at a time while the seed of light
    // flies, which the graphics chip moves on its own: on a slow phone the moment no longer opens with one long
    // stall of styling and laying out everything at once.
    const parts = still ? [] : [...stage.children];
    for (const c of parts) { c.classList.add('cel-wait'); c.remove(); }
    document.body.append(el);
    holdPage(true);
    if (still && isChest) lootCards.forEach((c) => c.classList.add('in', 'landed'));
    if (still) { (isChest ? hit! : ok).focus({ preventScroll: true }); return; }

    // 1. A seed of light: the Claim button lifts, becomes a glowing orb and flies to the centre,
    //    gathers itself (anticipation) and bursts — then the moment unfolds from that burst.
    const has = !!(r && r.width);
    // A badge comes in quicker than a chest (owner 2026-11-20: "a little lag when I pressed on claiming the badge"):
    // the seed flies in ~0.38 s and bursts ~0.2 s later, so the badge itself shows ~0.3 s sooner.
    const quick = isBadge || m.kind === 'flame';
    const FLY = (has ? (quick ? 380 : 560) : 360) * (roll ? 0.65 : 1);
    const GATHER = quick ? 180 : roll ? 200 : 300;
    const T = FLY + (quick ? 280 : roll ? 300 : 420);
    // The first layout of the moment happens in the next frame, not in the tap that claimed it (on a slow phone the
    // two together were one long stall). The boxes read there are kept, so no later beat has to ask for them again.
    requestAnimationFrame(() => {
      if (done) return;
      const box = stage.getBoundingClientRect();
      kb = canvas.getBoundingClientRect();
      sb = box;
      fx = sparks(canvas, sparkColors);
      if (!isChest) ok.focus({ preventScroll: true });
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const seed = h('span', { class: 'cel-seed', 'aria-hidden': 'true' });
      stage.append(seed);
      const dx = has ? r!.left + r!.width / 2 - cx : 0;
      const dy = has ? r!.top + r!.height / 2 - cy : 40;
      seed.animate([
        { transform: has ? `translate(${dx}px, ${dy}px) scale(${r!.width / 48}, ${r!.height / 48})` : `translate(0, ${dy}px) scale(.2)`, opacity: 0.9, offset: 0 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - (has ? 70 : 0)}px) scale(.8)`, opacity: 1, offset: (FLY * 0.55) / T },
        { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)', offset: FLY / T },
        { transform: 'translate(0, 0) scale(.62)', filter: 'brightness(1.6)', offset: (FLY + GATHER) / T },
        { transform: 'translate(0, 0) scale(2.6)', filter: 'brightness(2)', opacity: 0, offset: 1 },
      ], { duration: T, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'forwards' }).finished.then(() => seed.remove(), () => {});
      // One part a task, in their order, under the seed.
      const step = Math.max(40, Math.min(110, (FLY * 0.7) / Math.max(1, parts.length)));
      parts.forEach((c, i) => later(step * (i + 1), () => stage.insertBefore(c, seed.isConnected ? seed : null)));
      // The sound engine and the character's cheer are made ready in the gaps too, not at the moment they play.
      later(step * (parts.length + 0.5), warmSounds);
      if (me) later(step * (parts.length + 1), () => warmGesture('cheer'));
      // The flare's pictures are drawn into bitmaps now, so the burst only has to start them moving.
      const rar = (isChest ? Math.min(4, tier + (epic ? 1 : 0)) : isBadge ? bstep : m.kind === 'flame' ? (m.days >= 30 ? 3 : 2) : m.kind === 'star' ? 2 : 1) as Rarity;
      later(step * (parts.length + 1.5), () => warmFlare(rar, box.width * 1.5));
    });
    vibrate([8]);
    const BURST = FLY + GATHER;

    // 2. The burst: a soft flash, light sweeping across, sparks flying out, the moment playing.
    later(BURST, () => {
      fx ??= sparks(canvas, sparkColors);
      const big = m.kind === 'rosette' || m.kind === 'khatm' || m.kind === 'star' || m.kind === 'flame' || (m.kind === 'chest' && tier >= 2);
      for (const c of parts) if (!c.isConnected) stage.append(c);
      const sb0 = sb ??= stage.getBoundingClientRect();
      const cr = canvasBox();
      if (chestBox) cb = chestBox.getBoundingClientRect();
      if (isChest) hit!.focus({ preventScroll: true });
      el.classList.add('go');
      fx.burst(sb0.left + sb0.width / 2 - cr.left, sb0.top + sb0.height / 2 - cr.top, big ? 90 : 60, big ? 1.15 : 0.9);
      if (!isBadge) vibrate(m.kind === 'lantern' ? [18] : [22]);
      // A tier-up: the old badge first; when it breaks, the new tier's stage comes in and its own beats start then.
      const up = old ? old.play(later, () => {
        stage.prepend(...newParts);
        const k = canvasBox();
        fx?.burst(sb0.left + sb0.width / 2 - k.left, sb0.top + sb0.height / 2 - k.top, 70, 1.05);
        // The flash and the sweep again, in the new metal: the moment of the upgrade.
        for (const c of el.querySelectorAll<HTMLElement>('.cel-flash, .cel-sweep')) for (const a of c.getAnimations()) { a.cancel(); a.play(); }
      }) : 0;
      const at0 = (f: () => void) => (up ? later(up, f) : f());
      // The illustrated flare of the moment's rarity (flare.ts); the chest has its own when it opens.
      if (!isChest) {
        const rar = (isBadge ? bstep : m.kind === 'flame' ? (m.days >= 30 ? 3 : 2) : m.kind === 'star' ? 2 : 1) as Rarity;
        at0(() => flare(stage, rar, { size: sb0.width * 1.5, under: true, hold: rar >= 3 ? 0 : 2600 }));
      }
      if (bstep >= 3) at0(() => {
        el.classList.add('epic');
        later(280, () => fx?.burst(sb0.left + sb0.width / 2 - cr.left, sb0.top + sb0.height / 2 - cr.top, 70 + (bstep - 3) * 50, 1.25 + (bstep - 3) * 0.2));
        if (bstep === 4) later(620, () => fx?.burst(sb0.left + sb0.width / 2 - cr.left, sb0.top + sb0.height / 2 - cr.top, 60, 1.4));
      });
      // A chest drops in, lands with a squash and a thud, then waits for the user's taps.
      if (isChest) {
        // Falls (stretched by its speed), squashes flat on the ground and settles with a jelly wobble: one
        // simulated spring on the box (motion engine `drop`), the thud at the impact.
        drop(chestBox!, { height: 260, squash: 0.26, fill: 'none' });
        if (nr) popIn(nr.el, { delay: 520 });
        later(Math.round(10 + Math.sqrt(260) * 0.5) * (1000 / 60), () => {
          sfx.land();
          me?.hop(0.2);
          const b = cb ?? chestBox!.getBoundingClientRect(), k = canvasBox();
          fx?.burst(b.left + b.width / 2 - k.left, b.bottom - b.height * 0.12 - k.top, 16, 0.4);
        });
        later(roll ? 420 : 620, () => { ready = true; });
        return;
      }
      if (me) later(260 + up, () => me.cheer(m.kind === 'khatm' ? 3400 : 2400));
      // A badge's own beats, by tier: when the coin lands, the star locks, the sun is up, the petals open,
      // the light condenses (the CSS timings in cel.css).
      if (isBadge) {
        const st = bstep;
        const at = [[[760, () => { vibrate([22]); sfx.land(); }]],
          [[780, () => { vibrate([10, 40, 12]); sfx.tap(0.6, 1); }], [1150, () => sfx.pop(2)]],
          [[300, () => sfx.whoosh()], [900, () => { vibrate([18]); sfx.shimmer(); }]],
          [[250, () => vibrate([12])], [550, () => vibrate([12])], [1150, () => { vibrate([24, 90, 14]); sfx.open(0, 3); }]],
          [[0, () => sfx.rare(900)], [1000, () => { vibrate([30, 80, 20, 80, 12]); sfx.open(2, 4); }]]][st] as [number, () => void][];
        for (const [ms, f] of at) later(up + ms * (roll ? 0.6 : 1), f);
      }
      // A second beat when the badge lands / the star fills / the lantern opens.
      const badgeBeat = isBadge ? [900, 1000, 1150, 1450, 1250][bstep] + (m.kind === 'khatm' ? 500 : 0) : 0;
      const beat = (isBadge ? badgeBeat : m.kind === 'flame' ? 1400 : 900) * (roll ? 0.6 : 1) + up;
      later(beat, () => {
        const b2 = sb0;
        fx?.burst(b2.left + b2.width / 2 - cr.left, b2.top + b2.height / 2 - cr.top, big ? 46 : 30, 0.7);
        sfx.shimmer();
        showCombo();
        if (m.kind === 'khatm') me?.cheer(2600);
      });
      later(beat + 300, () => fx?.motes(true));
      later(beat + 150, countLight);
      if (count && m.kind === 'flame') {
        const target = m.days;
        const t0 = performance.now() + 350;
        const tick = (now: number) => {
          const p = Math.min(1, Math.max(0, (now - t0) / 1000));
          count!.textContent = String(Math.round(target * (1 - (1 - p) ** 3)));
          if (p < 1 && !done) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
  });
}

/** The Light just claimed flies from the moment up into the Light counter (when one is on screen), which bumps. */
export function flyLight(from: Element, tier: number) {
  const chip = [...document.querySelectorAll<HTMLElement>('.lt-chip')].find((c) => c.getClientRects().length);
  if (!chip) return;
  const a = from.getBoundingClientRect();
  const b = chip.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height * 0.45;
  const x1 = b.left + 14, y1 = b.top + b.height / 2;
  const lite = document.documentElement.classList.contains('lite');
  const n = lite ? 4 + tier * 2 : 6 + tier * 3;
  // All the lights fly on one canvas over the page (one draw call each a frame, no DOM nodes to lay out).
  const dpr = Math.min(lite ? 1.5 : 2, window.devicePixelRatio || 1);
  const cv = h('canvas', { class: 'lt-fly-layer', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  document.body.append(cv);
  const g = cv.getContext('2d')!;
  const spr = document.createElement('canvas');
  spr.width = spr.height = 48;
  const sg = spr.getContext('2d')!;
  const grad = sg.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, P.core); grad.addColorStop(0.3, rgba(P.n3, 0.95)); grad.addColorStop(0.65, rgba(P.n2, 0.35)); grad.addColorStop(1, rgba(P.n2, 0));
  sg.fillStyle = grad; sg.fillRect(0, 0, 48, 48);
  const dots = Array.from({ length: n }, (_, i) => {
    const sx = x0 + Math.cos(i * 2.4) * (18 + (i % 4) * 10), sy = y0 + Math.sin(i * 2.4) * (18 + (i % 4) * 10);
    return { i, sx, sy, mx: (sx + x1) / 2 + (i % 2 ? 60 : -60), my: Math.min(sy, y1) - 40, dur: 820 + i * 45, size: i === 0 ? 34 : 20, done: false };
  });
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const t0 = performance.now();
  const frame = (now: number) => {
    g.clearRect(0, 0, cv.width, cv.height);
    let left = 0;
    for (const d of dots) {
      if (d.done) continue;
      const p = Math.min(1, (now - t0) / d.dur);
      let x: number, y: number, s: number, o: number;
      if (p < 0.25) { const k = ease(p / 0.25); x = x0 + (d.sx - x0) * k; y = y0 + (d.sy - y0) * k; s = 0.3 + 0.9 * k; o = k; }
      else {
        const k = ease((p - 0.25) / 0.75), u = 1 - k;
        x = u * u * d.sx + 2 * u * k * d.mx + k * k * x1; y = u * u * d.sy + 2 * u * k * d.my + k * k * y1;
        s = 1.2 - 0.7 * k; o = 1 - 0.1 * k;
      }
      const w = d.size * s * dpr;
      g.globalAlpha = o;
      g.drawImage(spr, x * dpr - w / 2, y * dpr - w / 2, w, w);
      if (p >= 1) {
        d.done = true;
        if (d.i % 2 === 0 || d.i === n - 1) { bump(chip, d.i === n - 1 ? 0.3 : 0.14); sfx.tick(); }
        if (d.i === n - 1) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
      } else left++;
    }
    if (left) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}
