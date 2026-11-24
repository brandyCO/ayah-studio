// Illustrated decorations (owner feedback 2026-11-24: "Discord feels waaay more premium"). Instead of a ring with
// small things on it, each decoration is a few big illustrated objects that wrap the avatar and spill over it, shaded
// in 3–4 tones (base, shadow, highlight, rim light), hue-matched outlines and soft glows. Every piece is still one
// picture drawn once; filters (blur) cost nothing after that first draw.
import { f, star } from './art';
import type { Piece } from './frames';

let uid = 0;
export const id = (p: string) => `${p}${++uid}`;

/** Extra defs used by the illustrated pieces (each piece is its own SVG, so ids only need to be unique inside one). */
export const HQ_DEFS = `<defs>
<filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="b5" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="b10" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="ds" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0a0418" flood-opacity=".5"/></filter>
<linearGradient id="mGold" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff6c4"/><stop offset=".25" stop-color="#ffd85a"/><stop offset=".6" stop-color="#f5a623"/><stop offset="1" stop-color="#c46a08"/></linearGradient>
<linearGradient id="mGoldD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e08a10"/><stop offset="1" stop-color="#9a4a04"/></linearGradient>
<linearGradient id="mMoon" x1=".1" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fffbe8"/><stop offset=".3" stop-color="#ffeaa0"/><stop offset=".75" stop-color="#ffc847"/><stop offset="1" stop-color="#f29a1e"/></linearGradient>
<linearGradient id="mCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#eee6ff"/><stop offset="1" stop-color="#bfaef5"/></linearGradient>
<linearGradient id="mCloudS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a996ee"/><stop offset="1" stop-color="#7a62d6"/></linearGradient>
<linearGradient id="mNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b3bd6" stop-opacity="0"/><stop offset=".5" stop-color="#5a3ee0" stop-opacity=".55"/><stop offset="1" stop-color="#2a1a8a" stop-opacity=".85"/></linearGradient>
<linearGradient id="mBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d0" stop-opacity=".9"/><stop offset=".6" stop-color="#ffe08a" stop-opacity=".35"/><stop offset="1" stop-color="#ffd060" stop-opacity="0"/></linearGradient>
<radialGradient id="mHalo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4c0" stop-opacity=".95"/><stop offset=".35" stop-color="#ffc24a" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a1a" stop-opacity="0"/></radialGradient>
<radialGradient id="mHaloV" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f0e6ff" stop-opacity=".85"/><stop offset=".4" stop-color="#9a74ff" stop-opacity=".45"/><stop offset="1" stop-color="#4a24c0" stop-opacity="0"/></radialGradient>
<radialGradient id="mFlame" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff3a8"/><stop offset=".7" stop-color="#ffb43c"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
<linearGradient id="mRedG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a7a"/><stop offset=".45" stop-color="#ff3d5a"/><stop offset="1" stop-color="#9a0a3a"/></linearGradient>
<linearGradient id="mTealG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8fff0"/><stop offset=".45" stop-color="#22c9b4"/><stop offset="1" stop-color="#0a6a7a"/></linearGradient>
<linearGradient id="mAmberG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbd0"/><stop offset=".4" stop-color="#ffd040"/><stop offset="1" stop-color="#ff8a10"/></linearGradient>
<linearGradient id="mVioletG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8d8ff"/><stop offset=".45" stop-color="#9a5cff"/><stop offset="1" stop-color="#4a1aa8"/></linearGradient>
<linearGradient id="mSilver" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#e6ecf4"/><stop offset=".7" stop-color="#a8b4c6"/><stop offset="1" stop-color="#6a7890"/></linearGradient>
<linearGradient id="mBronze" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffe0c4"/><stop offset=".3" stop-color="#f0a46a"/><stop offset=".7" stop-color="#c06a32"/><stop offset="1" stop-color="#7a3a14"/></linearGradient>
<linearGradient id="mEmerald" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#c8ffe4"/><stop offset=".35" stop-color="#3ee0a0"/><stop offset=".75" stop-color="#0f9a6a"/><stop offset="1" stop-color="#05583c"/></linearGradient>
<linearGradient id="mRuby" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#ffd0d8"/><stop offset=".35" stop-color="#ff4a6a"/><stop offset=".75" stop-color="#c0123e"/><stop offset="1" stop-color="#6a0420"/></linearGradient>
<linearGradient id="mSapph" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#e0f0ff"/><stop offset=".35" stop-color="#5aa8ff"/><stop offset=".75" stop-color="#1a4ed0"/><stop offset="1" stop-color="#0a1f6a"/></linearGradient>
<linearGradient id="mPearl" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f6eefc"/><stop offset=".8" stop-color="#d8c8ea"/><stop offset="1" stop-color="#a890c8"/></linearGradient>
<linearGradient id="mRose" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#ffe0ea"/><stop offset=".35" stop-color="#ff7aa4"/><stop offset=".75" stop-color="#e0306a"/><stop offset="1" stop-color="#8a0a3a"/></linearGradient>
<linearGradient id="mLeaf" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#d8ffb0"/><stop offset=".35" stop-color="#6ee05a"/><stop offset=".75" stop-color="#1fa04a"/><stop offset="1" stop-color="#0a5a2a"/></linearGradient>
<linearGradient id="mJade" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#e0fff0"/><stop offset=".35" stop-color="#6ae0b0"/><stop offset=".75" stop-color="#1f9a72"/><stop offset="1" stop-color="#0a5a42"/></linearGradient>
<linearGradient id="mCrystal" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#dff4ff"/><stop offset=".55" stop-color="#9ad4ff"/><stop offset=".8" stop-color="#c8b0ff"/><stop offset="1" stop-color="#6a8ae0"/></linearGradient>
<linearGradient id="mGlaze" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f0f4fa"/><stop offset="1" stop-color="#b8c6dc"/></linearGradient>
<linearGradient id="mCobalt" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#a8c4ff"/><stop offset=".4" stop-color="#3a64e8"/><stop offset="1" stop-color="#132a80"/></linearGradient>
<linearGradient id="mKiswah" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#5a5868"/><stop offset=".3" stop-color="#26242e"/><stop offset=".8" stop-color="#0e0d12"/><stop offset="1" stop-color="#2a2832"/></linearGradient>
<linearGradient id="mSunset" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".3" stop-color="#ff9a4a"/><stop offset=".65" stop-color="#e2507a"/><stop offset="1" stop-color="#6a2ad0"/></linearGradient>
<linearGradient id="mSun" x1=".2" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd24a"/><stop offset=".8" stop-color="#ff8a1a"/><stop offset="1" stop-color="#e0560a"/></linearGradient>
<linearGradient id="mWood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8a868"/><stop offset=".5" stop-color="#b8743a"/><stop offset="1" stop-color="#7a4418"/></linearGradient>
<linearGradient id="mWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8fff6"/><stop offset=".4" stop-color="#3ad8c8"/><stop offset="1" stop-color="#0a7a8a"/></linearGradient>
<linearGradient id="mAur1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7affd0" stop-opacity="0"/><stop offset=".5" stop-color="#5affc0" stop-opacity=".9"/><stop offset="1" stop-color="#2a9aff" stop-opacity="0"/></linearGradient>
<linearGradient id="mAur2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c88aff" stop-opacity="0"/><stop offset=".5" stop-color="#d08aff" stop-opacity=".85"/><stop offset="1" stop-color="#ff7ab8" stop-opacity="0"/></linearGradient>
<radialGradient id="mHaloG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e0fff0" stop-opacity=".9"/><stop offset=".4" stop-color="#3ee0a0" stop-opacity=".45"/><stop offset="1" stop-color="#0a7a4a" stop-opacity="0"/></radialGradient>
<radialGradient id="mHaloB" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8f6ff" stop-opacity=".9"/><stop offset=".4" stop-color="#5ab0ff" stop-opacity=".45"/><stop offset="1" stop-color="#1a40c0" stop-opacity="0"/></radialGradient>
<radialGradient id="mHaloR" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe8ee" stop-opacity=".9"/><stop offset=".4" stop-color="#ff4a7a" stop-opacity=".45"/><stop offset="1" stop-color="#a00a3a" stop-opacity="0"/></radialGradient>
<radialGradient id="mHaloT" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e0fffa" stop-opacity=".9"/><stop offset=".4" stop-color="#2ad8c0" stop-opacity=".45"/><stop offset="1" stop-color="#0a6a7a" stop-opacity="0"/></radialGradient>
<filter id="paint" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.1"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="neb" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="5" seed="11"/><feColorMatrix values="0 0 0 0 .62  0 0 0 0 .42  0 0 0 0 1  0 0 0 2.2 -1"/><feComposite in2="SourceGraphic" operator="in"/><feGaussianBlur stdDeviation="1.5"/></filter>
<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="mNightB" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#5a6ad8"/><stop offset=".35" stop-color="#26307a"/><stop offset=".8" stop-color="#121848"/><stop offset="1" stop-color="#0a0c2a"/></linearGradient>
<linearGradient id="mAurora2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7affd8"/><stop offset=".5" stop-color="#7ab8ff"/><stop offset="1" stop-color="#d88aff"/></linearGradient>
<linearGradient id="mRoseGold" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#fff0e6"/><stop offset=".4" stop-color="#f7b49a"/><stop offset="1" stop-color="#b45a48"/></linearGradient>
<linearGradient id="mCloudD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8ccff"/><stop offset=".5" stop-color="#9a86e8"/><stop offset="1" stop-color="#5a44b8"/></linearGradient>
<radialGradient id="mSky" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="#3a2a9a"/><stop offset=".6" stop-color="#1e1460"/><stop offset="1" stop-color="#0e0a30" stop-opacity="0"/></radialGradient>
</defs>`;

export const GOLD_OL = '#7a3a06';
export const CLOUD_OL = '#4a2f9a';

/** A soft glow (blurred), for behind lit things. */
export const halo = (x: number, y: number, r: number, grad = 'mHalo') => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${grad})"/>`;

/** A glossy four-point sparkle with a blurred bloom. */
export const twinkle = (x: number, y: number, R: number, c = '#fff8d8') =>
  `<circle cx="${x}" cy="${y}" r="${f(R * .9)}" fill="${c}" opacity=".55" filter="url(#b2)"/><path d="${star(x, y, R, 4, .16)}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${f(R * .2)}" fill="#fff"/>`;
export const tw = (x: number, y: number, R: number, delay: number, c?: string): Piece =>
  ({ z: 'front', svg: twinkle(x, y, R, c), box: [x - R - 4, y - R - 4, 2 * R + 8, 2 * R + 8], anim: 'tw', delay, origin: [x, y] });

/** A rising mote of light. */
export const mote = (x: number, y: number, r: number, delay: number, c = '#fff1a8'): Piece =>
  ({ z: 'back', svg: `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="${c}" opacity=".45" filter="url(#b2)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`, box: [x - r * 4, y - r * 4, r * 8, r * 8], anim: 'rise', delay });

/** A cloud bank from puffs [cx, cy, r]: outline, body, shadow underside, top highlight, rim light; flat bottom at `base`. */
export function cloudBank(puffs: [number, number, number][], base: number, rim = '#ffe7a0'): string {
  const c = id('cc'), k = id('ck');
  const circles = (dx = 0, dy = 0, s = 1) => puffs.map(([x, y, r]) => `<circle cx="${f(x + dx * r)}" cy="${f(y + dy * r)}" r="${f(r * s)}"/>`).join('');
  const x0 = Math.min(...puffs.map(([x, , r]) => x - r)) - 6, x1 = Math.max(...puffs.map(([x, , r]) => x + r)) + 6;
  const top = Math.min(...puffs.map(([, y, r]) => y - r)) - 6;
  // the flat bottom runs between the first and the last puff's centres
  const bx0 = Math.min(...puffs.map(([x]) => x)), bx1 = Math.max(...puffs.map(([x]) => x));
  return `<defs><clipPath id="${k}"><rect x="${x0}" y="${top}" width="${x1 - x0}" height="${base - top}"/></clipPath><clipPath id="${c}">${circles()}</clipPath></defs>
  <g clip-path="url(#${k})">
    <g fill="${CLOUD_OL}">${puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 3.2}"/>`).join('')}<rect x="${bx0 - 3.2}" y="${base - 16}" width="${bx1 - bx0 + 6.4}" height="20"/></g>
    <rect x="${bx0}" y="${base - 16}" width="${bx1 - bx0}" height="16" fill="url(#mCloud)"/><rect x="${bx0}" y="${base - 16}" width="${bx1 - bx0}" height="16" fill="#8a74dc" opacity=".8"/>
    <g fill="url(#mCloud)">${circles()}</g>
    <g clip-path="url(#${c})">
      <g fill="url(#mCloudS)" opacity=".75">${circles(.05, .55, .95)}</g>
      <g fill="#ffffff" opacity=".9" filter="url(#b2)">${circles(-.18, -.38, .55)}</g>
      <g fill="none" stroke="${rim}" stroke-width="2.6" opacity=".9">${puffs.map(([x, y, r]) => `<path d="M${f(x - r * .8)} ${f(y - r * .45)}A${r} ${r} 0 0 1 ${f(x + r * .1)} ${f(y - r * .97)}"/>`).join('')}</g>
    </g>
  </g>
  <path d="M${bx0 - 1} ${base - 1.6}H${bx1 + 1}" stroke="${CLOUD_OL}" stroke-width="3.2" stroke-linecap="round"/>`;
}

/** A big shaded crescent: outer circle (cx, cy, R), cut by a circle moved by (dx, dy) of radius r2. */
export function bigMoon(cx: number, cy: number, R: number, dx: number, dy: number, r2: number): string {
  const c = id('mc');
  const d = `M${f(cx)} ${f(cy - R)}`;
  // crescent = outer circle minus inner circle (evenodd with the inner one clipped to the outer)
  const shape = `<circle cx="${cx}" cy="${cy}" r="${R}"/>`;
  const cut = `<circle cx="${cx + dx}" cy="${cy + dy}" r="${r2}"/>`;
  return `<defs><mask id="${c}"><rect x="-50" y="-50" width="400" height="400" fill="#000"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff"/><circle cx="${cx + dx}" cy="${cy + dy}" r="${r2}" fill="#000"/></mask>
    <mask id="${c}o"><rect x="-50" y="-50" width="400" height="400" fill="#000"/><circle cx="${cx}" cy="${cy}" r="${R + 3.4}" fill="#fff"/><circle cx="${cx + dx}" cy="${cy + dy}" r="${r2 - 3.4}" fill="#000"/></mask></defs>
  <g mask="url(#${c}o)"><rect x="${cx - R - 6}" y="${cy - R - 6}" width="${2 * R + 12}" height="${2 * R + 12}" fill="${GOLD_OL}"/></g>
  <g mask="url(#${c})">
    <g fill="url(#mMoon)">${shape}</g>
    <circle cx="${f(cx + dx * .55)}" cy="${f(cy + dy * .55 + R * .2)}" r="${f(r2 * 1.02)}" fill="#e88a14" opacity=".55" filter="url(#b5)"/>
    <ellipse cx="${f(cx - R * .38)}" cy="${f(cy + R * .1)}" rx="${f(R * .13)}" ry="${f(R * .1)}" fill="#e9a43a" opacity=".55"/><ellipse cx="${f(cx - R * .4)}" cy="${f(cy + R * .07)}" rx="${f(R * .1)}" ry="${f(R * .07)}" fill="#ffe9a8"/>
    <ellipse cx="${f(cx - R * .12)}" cy="${f(cy + R * .55)}" rx="${f(R * .09)}" ry="${f(R * .07)}" fill="#e9a43a" opacity=".55"/><ellipse cx="${f(cx - R * .13)}" cy="${f(cy + R * .53)}" rx="${f(R * .065)}" ry="${f(R * .045)}" fill="#ffe9a8"/>
    <ellipse cx="${f(cx - R * .55)}" cy="${f(cy - R * .3)}" rx="${f(R * .06)}" ry="${f(R * .05)}" fill="#e9a43a" opacity=".5"/>
    <path d="M${f(cx - R * .92)} ${f(cy + R * .2)}A${R * .95} ${R * .95} 0 0 1 ${f(cx - R * .2)} ${f(cy - R * .9)}" stroke="#fffef0" stroke-width="${f(R * .1)}" fill="none" stroke-linecap="round" opacity=".95" filter="url(#b2)"/>
    <path d="M${f(cx - R * .1)} ${f(cy + R * .97)}A${R} ${R} 0 0 0 ${f(cx + R * .7)} ${f(cy + R * .6)}" stroke="#fff3c0" stroke-width="${f(R * .06)}" fill="none" stroke-linecap="round" opacity=".8"/>
  </g>${d ? '' : ''}`;
}

/** A hanging star ornament on a thin gold chain from (x, 0) down to y. */
export function hangingStar(x: number, top: number, y: number, R: number): string {
  return `<path d="M${x} ${top}V${y - R * .8}" stroke="${GOLD_OL}" stroke-width="2.4"/><path d="M${x} ${top}V${y - R * .8}" stroke="#ffd85a" stroke-width="1.1"/>
  <g filter="url(#ds)"><path d="${star(x, y, R + 2.6, 5, .5)}" fill="${GOLD_OL}" stroke="${GOLD_OL}" stroke-width="2" stroke-linejoin="round"/><path d="${star(x, y, R, 5, .5)}" fill="url(#mGold)"/>
  <path d="${star(x + R * .08, y + R * .12, R * .62, 5, .5)}" fill="#e88a10" opacity=".45"/><path d="${star(x - R * .1, y - R * .12, R * .45, 5, .5)}" fill="#fff6c4" opacity=".9"/></g>`;
}

/** A big ornate fanous hanging from (0, 0) in its own coordinates, about 64 wide and 128 tall at scale 1. */
export function bigFanous(glass: [string, string, string]): string {
  const g = id('fg');
  return `<path d="M0 0V16" stroke="${GOLD_OL}" stroke-width="3.6"/><path d="M0 0V16" stroke="#ffd85a" stroke-width="1.6"/>
  <circle cx="0" cy="18" r="5" fill="none" stroke="${GOLD_OL}" stroke-width="4.4"/><circle cx="0" cy="18" r="5" fill="none" stroke="url(#mGold)" stroke-width="2.2"/>
  <g stroke="${GOLD_OL}" stroke-width="3" stroke-linejoin="round">
    <path d="M-4 22L4 22L6 28L-6 28Z" fill="url(#mGold)"/>
    <path d="M-20 44C-20 32 -10 27 0 27C10 27 20 32 20 44Z" fill="url(#mGold)"/>
    <path d="M-27 44H27L30 52H-30Z" fill="url(#mGoldD)"/>
    <path d="M-30 52H30L26 100H-26Z" fill="#3a1606"/>
  </g>
  <path d="M-14 40C-13 34 -8 31 -2 30" stroke="#fff6d0" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <g fill="#5a2406"><circle cx="-12" cy="38.5" r="1.8"/><circle cx="-4" cy="35" r="1.8"/><circle cx="4" cy="35" r="1.8"/><circle cx="12" cy="38.5" r="1.8"/></g>
  <defs><clipPath id="${g}"><path d="M-30 52H30L26 100H-26Z"/></clipPath></defs>
  <g clip-path="url(#${g})">
    <path d="M-30 52H-12V100H-26Z" fill="url(#${glass[0]})"/><path d="M-12 52H12V100H-12Z" fill="url(#${glass[1]})"/><path d="M12 52H30L26 100H12Z" fill="url(#${glass[2]})"/>
    <ellipse cx="0" cy="80" rx="20" ry="26" fill="url(#mFlame)" opacity=".9"/>
    <path d="M0 64C6 72 8 78 8 82A8 8 0 0 1 -8 82C-8 78 -6 72 0 64Z" fill="#fffbe8"/><path d="M0 72C3 77 4 80 4 82A4 4 0 0 1 -4 82C-4 80 -3 77 0 72Z" fill="#ffd040"/>
    <path d="M-26 56L-20 90" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/><path d="M-8 56V66" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
    <path d="M12 52H30L26 100H12Z" fill="#2a0a20" opacity=".22"/>
    ${[60, 76, 92].map((y) => `<path d="M-30 ${y}Q0 ${y + 4} 30 ${y}" stroke="${GOLD_OL}" stroke-width="1" fill="none" opacity=".35"/>`).join('')}
  </g>
  <g stroke="${GOLD_OL}" stroke-width="5" fill="none" stroke-linejoin="round"><path d="M-30 52H30L26 100H-26Z"/><path d="M-12 52V100M12 52V100"/></g>
  <g stroke="url(#mGold)" stroke-width="2.6" fill="none" stroke-linejoin="round"><path d="M-30 52H30L26 100H-26Z"/><path d="M-12 52V100M12 52V100"/></g>
  <g stroke="${GOLD_OL}" stroke-width="3" stroke-linejoin="round">
    <path d="M-28 100H28L24 108H-24Z" fill="url(#mGoldD)"/>
    <path d="M-24 108H24L10 122H-10Z" fill="url(#mGold)"/>
    <path d="M-5 122H5L3 128H-3Z" fill="url(#mGold)"/>
  </g>
  <circle cx="0" cy="132" r="4.6" fill="url(#mGold)" stroke="${GOLD_OL}" stroke-width="2.6"/><circle cx="-1.4" cy="130.6" r="1.4" fill="#fff"/>
  <path d="M-16 110L-8 118" stroke="#fff6d0" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
}

/** Painted texture and grain laid over a shape (drawn once, so free after the first paint). */
const paint = (shape: string, o = .35) => `<g opacity="${o}" filter="url(#paint)" style="mix-blend-mode:soft-light">${shape}</g><g opacity=".07" filter="url(#grain)">${shape}</g>`;

/** A cloud layer with painted texture. */
function paintedClouds(puffs: [number, number, number][], base: number, rim: string): string {
  const shape = puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `${cloudBank(puffs, base, rim)}<g>${paint(`<g fill="#fff">${shape}</g>`, .5)}</g>`;
}

/** Test ids 100+ while the illustrated style is reviewed. */
export function hqPieces(fr: number): Piece[] | null {
  switch (fr) {
    case 109: { // CRESCENT NIGHT: a big gold crescent over the top-left, stars hanging on chains, a cloud bank in front
      return [
        { z: 'back', svg: `<g filter="url(#b10)">${halo(120, 120, 118, 'mHaloV')}</g>`, box: [-20, -20, 280, 280], anim: 'pulse', origin: [120, 120] },
        { z: 'back', svg: `<g filter="url(#b10)">${halo(66, 66, 70)}</g>`, box: [-30, -30, 200, 200], anim: 'pulse', delay: 1, origin: [66, 66] },
        { z: 'front', svg: `<g filter="url(#ds)">${bigMoon(54, 56, 56, 26, -20, 48)}</g><g>${twinkle(90, 22, 6)}</g>`, box: [-6, -6, 150, 150], anim: 'bob' },
        { z: 'front', svg: hangingStar(160, -10, 30, 11), box: [140, -12, 40, 60], anim: 'sway', origin: [160, -10] },
        { z: 'front', svg: hangingStar(186, -10, 50, 9), box: [168, -12, 36, 76], anim: 'sway', delay: 1.3, origin: [186, -10] },
        { z: 'front', svg: hangingStar(210, -10, 22, 7.5), box: [194, -12, 32, 46], anim: 'sway', delay: 2.6, origin: [210, -10] },
        { z: 'front', svg: `<g filter="url(#ds)">${cloudBank([[150, 222, 22], [178, 206, 28], [210, 218, 22], [232, 230, 16], [128, 236, 14]], 246)}</g>`, box: [100, 170, 160, 82], anim: 'bob', delay: 2 },
        { z: 'front', svg: `<g filter="url(#ds)">${cloudBank([[10, 226, 16], [32, 216, 20], [56, 230, 14]], 244)}</g>`, box: [-12, 190, 90, 60], anim: 'bob', delay: 0.6 },
        tw(226, 120, 9, 0), tw(20, 160, 7, 1.1), tw(140, 14, 5, 2.2), tw(214, 168, 5, 3),
        mote(70, 210, 2.2, 0), mote(200, 120, 1.8, 1.6), mote(110, 230, 2, 2.8),
      ];
    }
    case 112: { // FANOUS FESTIVAL: a big lit fanous hanging over the right edge, a smaller one behind on the left, a garland of lights
      const bulbs = Array.from({ length: 7 }, (_, k) => { const x = 8 + k * 30, y = 8 + Math.sin((k / 6) * Math.PI) * 18; return [x, y] as const; });
      const garland = `<path d="M-6 4Q120 58 246 4" stroke="#3a1606" stroke-width="2.6" fill="none"/>${bulbs.map(([x, y], k) => `<circle cx="${f(x)}" cy="${f(y + 4)}" r="11" fill="${['#ffd040', '#ff5a7a', '#5affd8'][k % 3]}" opacity=".7" filter="url(#b5)"/><path d="M${f(x - 3)} ${f(y - 1)}H${f(x + 3)}V${f(y + 2)}H${f(x - 3)}Z" fill="${GOLD_OL}"/><ellipse cx="${f(x)}" cy="${f(y + 6)}" rx="5.4" ry="6.8" fill="${['#ffe680', '#ff8aa0', '#a0fff0'][k % 3]}" stroke="#3a1606" stroke-width="1.4"/><circle cx="${f(x - 1.4)}" cy="${f(y + 4.4)}" r="1.3" fill="#fff"/>`).join('')}`;
      return [
        { z: 'back', svg: `<g filter="url(#b10)">${halo(120, 130, 116)}</g>`, box: [-20, -20, 280, 280], anim: 'pulse', origin: [120, 130] },
        { z: 'back', svg: garland, box: [-10, -6, 260, 56] },
        { z: 'back', svg: `<g transform="translate(40 -6) scale(.62)" filter="url(#ds)">${bigFanous(['mTealG', 'mAmberG', 'mVioletG'])}</g>`, box: [14, -8, 52, 96], anim: 'sway', delay: 2, origin: [40, -6] },
        { z: 'front', svg: `<g filter="url(#b10)">${halo(200, 136, 44)}</g>`, box: [140, 76, 120, 120], anim: 'pulse', origin: [200, 136] },
        { z: 'front', svg: `<g transform="translate(200 -10) scale(1.02)" filter="url(#ds)">${bigFanous(['mRedG', 'mAmberG', 'mTealG'])}</g>`, box: [164, -12, 74, 154], anim: 'sway', origin: [200, -10] },
        tw(30, 150, 8, 0), tw(150, 228, 6, 1.4), tw(226, 196, 7, 2.6), tw(100, 10, 5, .8),
        mote(60, 220, 2.2, 0), mote(150, 214, 2, 1.3), mote(200, 222, 2.4, 2.4), mote(30, 200, 1.8, 3.2),
      ];
    }
    case 126: { // LAYLAT AL-QADR: beams of light from above, a moon behind, a deep cloud sea rolling over the bottom, rising light
      const beams = [[64, 14, -.14], [120, 18, 0], [176, 14, .14]].map(([x, w, s]) => `<path d="M${x - w} -24L${x + w} -24L${f(x + w * 2.4 + s * 260)} 250L${f(x - w * 2.4 + s * 260)} 250Z" fill="url(#mBeam)"/>`).join('');
      return [
        { z: 'back', svg: `<g filter="url(#b10)">${halo(120, 120, 120, 'mHaloV')}</g>`, box: [-24, -24, 288, 288], anim: 'pulse', origin: [120, 120] },
        { z: 'back', svg: `<g filter="url(#b5)" opacity=".75">${beams}</g>`, box: [-20, -30, 280, 290], anim: 'pulse', delay: 1, origin: [120, -24] },
        { z: 'back', svg: `<g filter="url(#b10)">${halo(196, 50, 50)}</g><g filter="url(#ds)">${bigMoon(196, 50, 38, -18, -12, 32)}</g>`, box: [140, -10, 110, 110], anim: 'bob', delay: 1.5 },
        { z: 'front', svg: `<rect x="-10" y="176" width="260" height="70" fill="url(#mNight)" filter="url(#b5)"/>`, box: [-20, 166, 280, 90] },
        { z: 'front', svg: `<g filter="url(#ds)">${cloudBank([[8, 218, 20], [36, 202, 26], [70, 214, 22], [100, 224, 16]], 244, '#ffe9a8')}</g>`, box: [-16, 170, 140, 80], anim: 'bob', delay: .4 },
        { z: 'front', svg: `<g filter="url(#ds)">${cloudBank([[136, 226, 16], [166, 208, 26], [200, 200, 30], [232, 216, 22]], 246, '#ffe9a8')}</g>`, box: [114, 164, 144, 88], anim: 'bob', delay: 2.4 },
        { z: 'front', svg: `<g filter="url(#ds)"><path d="M120 -12V8" stroke="${GOLD_OL}" stroke-width="2.6"/><path d="M120 -12V8" stroke="#ffd85a" stroke-width="1.2"/>${halo(120, 22, 22)}<path d="${star(120, 22, 15.5, 8, .76)}" fill="${GOLD_OL}"/><path d="${star(120, 22, 13, 8, .76)}" fill="url(#mGold)"/><path d="${star(120, 22, 7, 8, .76)}" fill="#fff6c4"/><path d="${star(122, 25, 9, 8, .76)}" fill="#e88a10" opacity=".3"/></g>`, box: [96, -14, 48, 62], anim: 'sway', origin: [120, -12] },
        tw(40, 60, 8, 0), tw(18, 130, 6, 1), tw(224, 130, 7, 2), tw(150, 8, 5, 3), tw(80, 20, 4, 2.5),
        mote(40, 230, 2.4, 0), mote(90, 236, 2, 1), mote(150, 234, 2.6, 2), mote(200, 236, 2, 3), mote(120, 230, 1.8, .5),
      ];
    }
    case 226: { // LAYLAT AL-QADR, max: painted night sky with nebula, a painted moon with bloom, three depths of cloud
      // moving at different paces, three beams breathing out of step, a turning khatam pendant, a shooting star, many lights
      const starsA = Array.from({ length: 22 }, (_, k) => { const a = k * 137.5, r = 40 + ((k * 53) % 76); const [x, y] = [120 + r * Math.cos(a), 120 + r * Math.sin(a)]; return `<circle cx="${f(x)}" cy="${f(y)}" r="${k % 5 ? .9 : 1.6}" fill="#fff"/>`; }).join('');
      const starsB = Array.from({ length: 22 }, (_, k) => { const a = k * 137.5 + 60, r = 44 + ((k * 37) % 72); const [x, y] = [120 + r * Math.cos(a), 120 + r * Math.sin(a)]; return `<circle cx="${f(x)}" cy="${f(y)}" r="${k % 4 ? .8 : 1.4}" fill="#fff4c8"/>`; }).join('');
      const beam = (x: number, w: number, s2: number) => `<path d="M${x - w} -24L${x + w} -24L${f(x + w * 2.6 + s2 * 260)} 250L${f(x - w * 2.6 + s2 * 260)} 250Z" fill="url(#mBeam)"/>`;
      const moon = `${bigMoon(190, 50, 40, -19, -13, 34)}`;
      const pend = `<path d="M120 -14V6" stroke="${GOLD_OL}" stroke-width="2.8"/><path d="M120 -14V6" stroke="#ffd85a" stroke-width="1.3"/>
        <path d="${star(120, 24, 17, 8, .76)}" fill="${GOLD_OL}"/><path d="${star(120, 24, 14.5, 8, .76)}" fill="url(#mGold)"/>
        <path d="${star(122, 27, 10, 8, .76)}" fill="#c46a08" opacity=".35"/><path d="${star(118.5, 21.5, 8, 8, .76)}" fill="#fff6c4" opacity=".95"/>
        <circle cx="120" cy="24" r="4" fill="url(#mTealG)" stroke="${GOLD_OL}" stroke-width="1.4"/><circle cx="118.8" cy="22.8" r="1.3" fill="#fff"/>
        <path d="M120 41L123 47L120 53L117 47Z" fill="url(#mGold)" stroke="${GOLD_OL}" stroke-width="1.4"/>`;
      return [
        { z: 'back', svg: `<circle cx="120" cy="120" r="122" fill="url(#mSky)"/><g filter="url(#neb)"><circle cx="120" cy="120" r="118" fill="#fff"/></g>`, box: [-6, -6, 252, 252] },
        { z: 'back', svg: starsA, anim: 'pulse' , origin: [120, 120] },
        { z: 'back', svg: starsB, anim: 'pulse', delay: 1, origin: [120, 120] },
        { z: 'back', svg: `<g filter="url(#b10)">${halo(120, 120, 124, 'mHaloV')}</g>`, box: [-30, -30, 300, 300], anim: 'pulse', delay: .5, origin: [120, 120] },
        { z: 'back', svg: `<g filter="url(#b5)" opacity=".7">${beam(120, 18, 0)}</g>`, box: [-30, -30, 300, 290], anim: 'pulse', origin: [120, -24] },
        { z: 'back', svg: `<g filter="url(#b5)" opacity=".55">${beam(60, 12, -.16)}</g>`, box: [-60, -30, 220, 290], anim: 'pulse', delay: .7, origin: [60, -24] },
        { z: 'back', svg: `<g filter="url(#b5)" opacity=".55">${beam(180, 12, .16)}</g>`, box: [80, -30, 220, 290], anim: 'pulse', delay: 1.4, origin: [180, -24] },
        { z: 'back', svg: `<g filter="url(#b10)">${halo(190, 50, 62)}</g><g filter="url(#bloom)"><g filter="url(#ds)">${moon}</g></g>${paint(`<g>${moon}</g>`, .45)}`, box: [120, -20, 130, 130], anim: 'bob', delay: 1.5 },
        { z: 'back', svg: `<g filter="url(#ds)">${paintedClouds([[20, 200, 18], [52, 188, 24], [88, 196, 20], [150, 194, 20], [186, 186, 24], [220, 198, 18]], 214, '#ffe9a8')}</g>`, box: [-10, 150, 260, 70], anim: 'bob', delay: 3 },
        { z: 'front', svg: `<rect x="-10" y="180" width="260" height="70" fill="url(#mNight)" filter="url(#b5)"/>`, box: [-20, 170, 280, 84] },
        { z: 'front', svg: `<g filter="url(#ds)">${paintedClouds([[4, 222, 20], [34, 206, 27], [70, 218, 22], [102, 230, 15]], 246, '#ffe9a8')}</g>`, box: [-20, 170, 140, 80], anim: 'bob', delay: .4 },
        { z: 'front', svg: `<g filter="url(#ds)">${paintedClouds([[136, 230, 15], [166, 212, 26], [202, 202, 31], [236, 218, 22]], 248, '#ffe9a8')}</g>`, box: [114, 164, 146, 88], anim: 'bob', delay: 2.4 },
        { z: 'front', svg: `<g filter="url(#b10)">${halo(120, 26, 30)}</g>`, box: [84, -10, 72, 72], anim: 'pulse', origin: [120, 26] },
        { z: 'front', svg: `<g filter="url(#bloom)"><g filter="url(#ds)">${pend}</g></g>`, box: [94, -16, 52, 74], anim: 'sway', origin: [120, -14] },
        { z: 'front', svg: `<path d="M0 0L46 18" stroke="url(#mBeam)" stroke-width="3" stroke-linecap="round" transform="rotate(180 23 9)"/><circle cx="46" cy="18" r="2.6" fill="#fff" filter="url(#b2)"/><circle cx="46" cy="18" r="1.4" fill="#fff"/>`, box: [10, 6, 50, 26], anim: 'shoot' },
        tw(36, 56, 9, 0), tw(16, 128, 6, 1), tw(226, 128, 8, 2), tw(150, 6, 5, 3), tw(78, 18, 4.5, 2.5), tw(206, 100, 4, .7), tw(56, 150, 4, 1.7), tw(232, 170, 5, 3.4),
        mote(40, 230, 2.6, 0), mote(90, 236, 2, 1), mote(150, 234, 2.8, 2), mote(200, 236, 2, 3), mote(120, 230, 1.8, .5), mote(66, 226, 1.6, 2.5), mote(178, 228, 1.8, 1.5), mote(226, 232, 1.6, 3.5),
      ];
    }
  }
  return null;
}
