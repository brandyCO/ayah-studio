// Every avatar frame at the approved illustrated level (owner 2026-11-24, docs/item-art.md). Big shaded objects round
// and over the avatar (centre 120,120, radius 80 in the 240 box), back and front layers, glows and particles.
import { f, star, khatam } from './art';
import type { Piece } from './frames';
import { CLOUD_OL, GOLD_OL, bigFanous, bigMoon, cloudBank, halo, hangingStar, hqPieces, id, mote, tw, twinkle } from './hq';

export const P = (x: number, y: number) => `${f(x)} ${f(y)}`;
export const at = (r: number, deg: number, cx = 120, cy = 120): [number, number] => { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

/** A solid shaded object: hue-matched outline, gradient body, shadow on the bottom-right rim, rim light on the top-left. */
export function solid(d: string, grad: string, ol: string, k = 3, sw = 3.2, eo = false): string {
  const c = id('s'), rule = eo ? ' fill-rule="evenodd" clip-rule="evenodd"' : '';
  return `<defs><clipPath id="${c}"><path d="${d}"${rule}/></clipPath></defs>
  <path d="${d}" fill="${ol}" stroke="${ol}" stroke-width="${sw * 2}" stroke-linejoin="round"${rule}/>
  <g clip-path="url(#${c})"><path d="${d}" fill="${ol}" opacity=".55"${rule}/><path d="${d}" fill="url(#${grad})" transform="translate(${-k * .7} ${-k})"${rule}/>
  <path d="${d}" fill="none" stroke="#fff" stroke-width="${k * 1.1}" opacity=".7" transform="translate(${k * .8} ${k})" filter="url(#b2)"/></g>`;
}
/** Sun rays from (x, y) that fade out with distance (not grey on a dark page). */
export function rays(x: number, y: number, n: number, R: number, half: number, c = '#ffe08a', o = .5): string {
  const m = id('rf');
  return `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="640" height="640"><circle cx="${x}" cy="${y}" r="${R}" fill="url(#mFade)"/></mask></defs><g mask="url(#${m})" opacity="${o}">${Array.from({ length: n }, (_, k) => `<path d="M${P(x, y)}L${P(...at(R, (k * 360) / n - half, x, y))}L${P(...at(R, (k * 360) / n + half, x, y))}Z" fill="${c}"/>`).join('')}</g>`;
}
/** A shaded sphere (pearl, planet, bead). */
export function sphere(x: number, y: number, r: number, grad: string, ol: string): string {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 1.6)}" fill="${ol}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${grad})"/>
  <circle cx="${f(x + r * .25)}" cy="${f(y + r * .3)}" r="${f(r * .7)}" fill="${ol}" opacity=".25" filter="url(#b2)"/>
  <ellipse cx="${f(x - r * .35)}" cy="${f(y - r * .4)}" rx="${f(r * .32)}" ry="${f(r * .22)}" fill="#fff" opacity=".95" transform="rotate(-35 ${f(x - r * .35)} ${f(y - r * .4)})"/>`;
}
/** A faceted gem in a gold collet. */
export function gemHQ(x: number, y: number, r: number, grad: string): string {
  const oct = (R: number) => `M${Array.from({ length: 8 }, (_, k) => P(...at(R, k * 45 + 22.5, x, y))).join('L')}Z`;
  return `${solid(oct(r + 4), 'mGold', GOLD_OL, 1.6, 2)}<path d="${oct(r)}" fill="url(#${grad})" stroke="${GOLD_OL}" stroke-width="1.4"/>
  <path d="${oct(r * .5)}" fill="#fff" opacity=".28"/>${Array.from({ length: 8 }, (_, k) => `<path d="M${P(...at(r * .5, k * 45 + 22.5, x, y))}L${P(...at(r, k * 45 + 22.5, x, y))}" stroke="#fff" stroke-width=".8" opacity=".4"/>`).join('')}
  <path d="M${P(x - r * .55, y - r * .15)}L${P(x - r * .15, y - r * .6)}" stroke="#fff" stroke-width="${f(r * .28)}" stroke-linecap="round" opacity=".95"/>`;
}
/** A leaf shape from (x, y) pointing at angle a (deg), length L, width w. */
export const leafD = (x: number, y: number, a: number, L: number, w: number) => {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), q = (u: number, v: number) => P(x + u * c - v * s, y + u * s + v * c);
  return `M${q(0, 0)}C${q(L * .3, -w)} ${q(L * .75, -w * .8)} ${q(L, 0)}C${q(L * .75, w * .8)} ${q(L * .3, w)} ${q(0, 0)}Z`;
};
const leafVein = (x: number, y: number, a: number, L: number, c = '#fff') => { const r = (a * Math.PI) / 180; return `<path d="M${P(x + Math.cos(r) * L * .12, y + Math.sin(r) * L * .12)}L${P(x + Math.cos(r) * L * .85, y + Math.sin(r) * L * .85)}" stroke="${c}" stroke-width="1.3" opacity=".55" stroke-linecap="round"/>`; };
export const leafHQ = (x: number, y: number, a: number, L: number, w: number, grad = 'mLeaf', ol = '#0a4a22') => `${solid(leafD(x, y, a, L, w), grad, ol, 2, 2.2)}${leafVein(x, y, a, L)}`;
/** A wreath of leaves round the avatar from angle a0 to a1 (deg, clockwise), leaves pointing along it. */
function wreath(a0: number, a1: number, n: number, r: number, grad: string, ol: string, L = 22, w = 8): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1), dir = a1 > a0 ? 90 : -90, [x, y] = at(r, a);
    s += leafHQ(x, y, a + dir - (a1 > a0 ? 28 : -28), L, w, grad, ol) + leafHQ(x, y, a + dir + (a1 > a0 ? 28 : -28) + 180 - 180 + (a1 > a0 ? -0 : 0) + (a1 > a0 ? 56 : -56), L * .85, w * .9, grad, ol);
  }
  return s;
}
/** A ribbon bow at (x, y). */
export function bow(x: number, y: number, grad: string, ol: string, s = 1): string {
  const g = (d: string) => solid(d, grad, ol, 2, 2.4);
  return `<g transform="translate(${x} ${y}) scale(${s})">${g('M-4 4L-16 34L-8 30L-2 38L4 8Z')}${g('M4 4L16 34L8 30L2 38L-4 8Z')}${g('M0 0C-10 -14 -30 -14 -30 -2C-30 10 -12 8 0 2Z')}${g('M0 0C10 -14 30 -14 30 -2C30 10 12 8 0 2Z')}${g('M-6 -6H6V6H-6Z')}</g>`;
}
/** A glossy band round the avatar (the plain-ring frames). */
const band = (r: number, w: number, grad: string, ol: string) => solid(`M${P(120 - r - w / 2, 120)}A${r + w / 2} ${r + w / 2} 0 1 0 ${P(120 + r + w / 2, 120)}A${r + w / 2} ${r + w / 2} 0 1 0 ${P(120 - r - w / 2, 120)}ZM${P(120 - r + w / 2, 120)}A${r - w / 2} ${r - w / 2} 0 1 1 ${P(120 + r - w / 2, 120)}A${r - w / 2} ${r - w / 2} 0 1 1 ${P(120 - r + w / 2, 120)}Z`, grad, ol, 2, 2.4, true);
/** A five-point gold star with shading. */
export const goldStar = (x: number, y: number, R: number, k = 5) => solid(star(x, y, R, k, .5), 'mGold', GOLD_OL, R * .14, 2.2);
const tierGrad = (c: string) => { const g = id('tg'); return { g, d: `<defs><linearGradient id="${g}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".7"/></linearGradient></defs>` }; };
const TIER = ['#c47a4c', '#a9b0f2', '#5fcfc0', '#e891aa', '#f2c14e'];
const TIER_OL = ['#5a2a10', '#3a3a8a', '#0a5a52', '#8a2a4a', GOLD_OL];
const back = (svg: string, box?: [number, number, number, number], extra: Partial<Piece> = {}): Piece => ({ z: 'back', svg, box, ...extra });
const front = (svg: string, box?: [number, number, number, number], extra: Partial<Piece> = {}): Piece => ({ z: 'front', svg, box, ...extra });
const glowP = (grad: string, r = 118, x = 120, y = 120): Piece => back(`<g filter="url(#b10)">${halo(x, y, r, grad)}</g>`, [x - r - 24, y - r - 24, 2 * r + 48, 2 * r + 48], { anim: 'pulse', origin: [x, y] });

export function hqFrame(fr: number, tier = 0): Piece[] | null {
  switch (fr) {
    case 0: { const t = Math.max(0, Math.min(4, tier)), g = tierGrad(TIER[t]); return [front(`${g.d}${band(86, 9, g.g, TIER_OL[t])}`), tw(196, 50, 6, 0), tw(40, 190, 5, 1.2)]; }
    case 1: return [glowP('mHalo', 120), front(band(86, 8, 'mGold', GOLD_OL)), tw(200, 40, 9, 0), tw(30, 70, 6, .8), tw(210, 190, 6, 1.6), mote(60, 220, 2, 0), mote(180, 226, 2, 2)];
    case 2: return [glowP('mHaloG', 116), front(`${band(86, 8, 'mGold', GOLD_OL)}`),
      front(`${leafHQ(54, 196, 150, 30, 10, 'mEmerald', '#05402a')}${leafHQ(54, 196, 200, 26, 9, 'mEmerald', '#05402a')}${leafHQ(186, 196, 30, 30, 10, 'mEmerald', '#05402a')}${leafHQ(186, 196, -20, 26, 9, 'mEmerald', '#05402a')}${gemHQ(46, 120, 9, 'mEmerald')}${gemHQ(194, 120, 9, 'mEmerald')}`),
      front(`<path d="M120 12V26" stroke="${GOLD_OL}" stroke-width="3"/>${gemHQ(120, 36, 15, 'mEmerald')}`, [96, 6, 48, 56], { anim: 'sway', origin: [120, 12] }), tw(150, 18, 6, 0), tw(30, 160, 5, 1.4)];
    case 3: { const stars = [0, 72, 144, 216, 288].map((a) => goldStar(...at(100, a), 9)).join(''); return [glowP('mHaloV', 118), front(band(86, 8, 'mVioletG', '#2a1a6a')),
      front(stars, [0, 0, 240, 240], { anim: 'orbit', origin: [120, 120] }), front(`<g filter="url(#ds)">${bigMoon(196, 44, 26, -11, -8, 22)}</g>`, [160, 8, 72, 72], { anim: 'bob' }), tw(30, 40, 7, 0), tw(214, 200, 6, 1.1), tw(30, 200, 5, 2.2)]; }
    case 4: { const rays = Array.from({ length: 16 }, (_, k) => { const a = k * 22.5; return solid(`M${P(...at(84, a - 7))}L${P(...at(k % 2 ? 108 : 120, a))}L${P(...at(84, a + 7))}Z`, 'mSun', GOLD_OL, 1.6, 2); }).join('');
      return [glowP('mHalo', 120), back(rays, [-10, -10, 260, 260], { anim: 'orbitSlow', origin: [120, 120] }), front(band(86, 8, 'mGold', GOLD_OL)),
        front(`<g filter="url(#ds)">${sphere(120, 24, 15, 'mSun', GOLD_OL)}</g>`, [96, 0, 48, 50], { anim: 'bob' }), tw(40, 40, 7, 0), tw(200, 200, 6, 1.5)]; }
    case 5: case 6: case 7: {
      const m = (['mGold', 'mSilver', 'mBronze'] as const)[fr - 5], ol = [GOLD_OL, '#3a4458', '#5a2a10'][fr - 5], rib = (['mRuby', 'mSapph', 'mEmerald'] as const)[fr - 5], rol = ['#6a0420', '#0a1f6a', '#05402a'][fr - 5];
      return [fr === 5 ? glowP('mHalo', 116) : glowP(fr === 6 ? 'mHaloB' : 'mHaloR', 112),
        front(`${wreath(115, 255, 8, 92, m, ol)}${wreath(65, -75, 8, 92, m, ol)}`, [-10, -10, 260, 260]),
        front(bow(120, 206, rib, rol, 1), [86, 190, 68, 56]),
        front(goldStar(120, 22, 13), [100, 2, 40, 40], { anim: 'pop', origin: [120, 22] }), tw(200, 40, 6, 0), tw(36, 50, 5, 1.3)];
    }
    case 8: { const pearls = Array.from({ length: 26 }, (_, k) => sphere(...at(90, k * (360 / 26)), 6, 'mPearl', '#6a5a8a')).join('');
      return [glowP('mHaloV', 110), front(pearls),
        front(`<path d="M120 196V206" stroke="#8a7aa8" stroke-width="2"/>${solid('M120 204C130 216 134 226 134 232A14 14 0 0 1 106 232C106 226 110 216 120 204Z', 'mPearl', '#6a5a8a', 2.4, 2.4)}`, [102, 192, 36, 60], { anim: 'sway', origin: [120, 196] }), tw(200, 40, 7, 0), tw(36, 60, 5, 1)]; }
    case 9: return hqPieces(109);
    case 10: { const tiles = Array.from({ length: 16 }, (_, k) => { const a = k * 22.5; return solid(`M${P(...at(86, a - 9))}L${P(...at(116, a))}L${P(...at(86, a + 9))}L${P(...at(98, a))}Z`, ['mTealG', 'mCobalt', 'mAmberG', 'mRuby'][k % 4], '#1a1a4a', 1.4, 1.8); }).join('');
      return [glowP('mHaloT', 118), back(tiles, [-10, -10, 260, 260], { anim: 'orbitSlow', origin: [120, 120] }), front(`${band(86, 8, 'mGlaze', '#1a2a6a')}${[0, 90, 180, 270].map((a) => solid(khatam(...at(86, a - 90), 10), 'mTealG', '#0a3a4a', 1.4, 2)).join('')}`), tw(206, 30, 7, 0), tw(30, 210, 6, 1.2)];
    }
    case 11: { const cur = (y: number, a: number, grad: string, w: number) => `<path d="M-20 ${y}C30 ${y - a} 70 ${y + a} 120 ${y - a * .4}C170 ${y - a * 1.4} 210 ${y + a * .6} 260 ${y - a * .6}" stroke="url(#${grad})" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
      const fade = (cy: number, rx: number, ry: number, inner: string) => { const m = id('af'); return `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="640" height="640"><ellipse cx="120" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#mFade)"/></mask></defs><g mask="url(#${m})">${inner}</g>`; };
      return [back(fade(50, 170, 110, `<g filter="url(#b5)">${cur(40, 30, 'mAurora2', 34)}${cur(40, 30, 'mAurora2', 20)}</g><g filter="url(#b10)">${cur(60, 26, 'mAurora2', 50)}</g>`), [-60, -70, 360, 240], { anim: 'bob' }),
        back(fade(40, 150, 70, `<g filter="url(#b5)" opacity=".9">${cur(40, 22, 'mAurora2', 18)}</g>`), [-40, -40, 320, 160], { anim: 'bob', delay: 2 }),
        glowP('mHaloT', 114), front(band(86, 7, 'mSilver', '#3a4458')),
        front(`<g filter="url(#ds)">${[[40, 210, 9], [200, 214, 8], [120, 226, 6]].map(([x, y, r]) => solid(star(x, y, r, 6, .45), 'mCrystal', '#3a4a9a', 1.4, 1.8)).join('')}</g>`, [20, 190, 200, 50]),
        tw(30, 30, 7, 0), tw(210, 40, 6, .9), tw(206, 170, 6, 1.8), tw(40, 160, 5, 2.6), mote(80, 220, 1.8, 0, '#b8fff0'), mote(170, 226, 1.8, 2, '#e8c8ff')];
    }
    case 12: return hqPieces(112);
    case 13: { const petals = Array.from({ length: 16 }, (_, k) => solid(leafD(...at(78, k * 22.5), k * 22.5, 44, 13), k % 2 ? 'mGold' : 'mAmberG', GOLD_OL, 2, 2)).join('');
      return [glowP('mHalo', 120), back(petals, [-10, -10, 260, 260], { anim: 'orbitSlow', origin: [120, 120] }), front(band(86, 8, 'mGold', GOLD_OL)),
        front(`${solid('M100 196L84 246L98 238L106 250L116 200Z', 'mRuby', '#6a0420', 2, 2.4)}${solid('M140 196L156 246L142 238L134 250L124 200Z', 'mRuby', '#6a0420', 2, 2.4)}${gemHQ(120, 200, 12, 'mRuby')}`, [76, 180, 88, 74], { anim: 'sway', origin: [120, 196] }), tw(30, 40, 7, 0), tw(210, 40, 6, 1.3)]; }
    case 14: { const crown = `<g transform="rotate(-10 120 36)">${solid('M70 58L64 14L90 34L104 4L120 28L136 4L150 34L176 14L170 58Z', 'mGold', GOLD_OL, 3, 3)}${solid('M68 52H172V66H68Z', 'mGoldD', GOLD_OL, 2, 2.6)}${[[64, 14], [104, 4], [136, 4], [176, 14]].map(([x, y]) => sphere(x, y - 3, 5, 'mPearl', '#6a5a8a')).join('')}${gemHQ(120, 40, 9, 'mRuby')}${gemHQ(90, 46, 5.5, 'mSapph')}${gemHQ(150, 46, 5.5, 'mSapph')}${[84, 100, 140, 156].map((x) => sphere(x, 59, 3, 'mRuby', '#6a0420')).join('')}</g>`;
      return [glowP('mHaloR', 116), front(band(86, 8, 'mRuby', '#6a0420')), front(`<g filter="url(#ds)">${crown}</g>`, [50, -14, 140, 92], { anim: 'bob' }), tw(196, 20, 8, 0), tw(40, 40, 6, 1.2), tw(210, 190, 6, 2.2), mote(60, 220, 2, 0), mote(190, 220, 2, 2)]; }
    case 15: { const shard = (x: number, y: number, a: number, L: number, w: number) => { const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), q = (u: number, v: number) => P(x + u * c - v * s, y + u * s + v * c); return solid(`M${q(0, -w)}L${q(L * .8, -w * .8)}L${q(L, 0)}L${q(L * .8, w * .8)}L${q(0, w)}Z`, 'mSapph', '#0a1f6a', 2, 2.4) + `<path d="M${q(L * .1, 0)}L${q(L * .9, 0)}" stroke="#fff" stroke-width="1.4" opacity=".6"/>`; };
      return [glowP('mHaloB', 120), front(band(86, 7, 'mCrystal', '#2a3a8a')),
        front(`<g filter="url(#ds)">${shard(40, 236, -100, 54, 10)}${shard(30, 236, -125, 40, 8)}${shard(54, 236, -78, 36, 7)}${shard(200, 236, -80, 54, 10)}${shard(210, 236, -55, 40, 8)}${shard(186, 236, -102, 36, 7)}</g>`, [0, 160, 240, 84]),
        front(`<g filter="url(#ds)">${shard(120, 30, -90, 30, 7)}</g>`, [104, -6, 32, 40], { anim: 'bob' }), tw(40, 150, 7, 0), tw(204, 140, 7, 1), tw(120, 8, 6, 2), mote(70, 210, 2, 0, '#c8e4ff'), mote(170, 214, 2, 2, '#c8e4ff')]; }
    case 16: { const roseHQ = (x: number, y: number, r: number) => `${sphere(x, y, r, 'mRose', '#7a0a34')}<path d="M${P(x - r * .5, y)}C${P(x - r * .5, y - r * .6)} ${P(x + r * .5, y - r * .6)} ${P(x + r * .45, y + r * .1)}M${P(x - r * .25, y + r * .1)}C${P(x - r * .2, y - r * .3)} ${P(x + r * .25, y - r * .25)} ${P(x + r * .2, y + r * .2)}M${P(x - r * .7, y + r * .35)}C${P(x - r * .2, y + r * .75)} ${P(x + r * .4, y + r * .7)} ${P(x + r * .7, y + r * .3)}" stroke="#7a0a34" stroke-width="1.6" fill="none" opacity=".75"/>`;
      return [glowP('mHaloR', 112), back(`<path d="M30 220C10 150 30 70 90 30" stroke="#0a4a22" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M30 220C10 150 30 70 90 30" stroke="#3ab84a" stroke-width="3.4" fill="none" stroke-linecap="round"/>${leafHQ(22, 150, 190, 22, 8)}${leafHQ(36, 92, 220, 22, 8)}${leafHQ(62, 52, 250, 20, 7)}`),
        front(`<g filter="url(#ds)">${leafHQ(50, 214, 160, 30, 11)}${leafHQ(64, 222, 110, 28, 10)}${leafHQ(84, 206, 60, 26, 9)}${roseHQ(44, 196, 18)}${roseHQ(76, 214, 15)}${roseHQ(30, 226, 12)}</g>`, [0, 160, 120, 84]),
        front(`<g filter="url(#ds)">${leafHQ(196, 50, -30, 20, 8)}${roseHQ(196, 40, 12)}</g>`, [170, 14, 60, 56], { anim: 'bloom', origin: [196, 40] }),
        front(solid('M0 -7C6 -7 8 -2 8 0C8 5 3 8 0 8C-3 5 -5 0 0 -7Z', 'mRose', '#7a0a34', 1.4, 1.6).replace(/M0 -7/, 'M0 -7'), undefined, {}) && front(`<g transform="translate(206 70)">${solid('M0 -7C6 -7 8 -2 8 0C8 5 3 8 0 8C-3 5 -5 0 0 -7Z', 'mRose', '#7a0a34', 1.4, 1.6)}</g>`, [194, 58, 24, 24], { anim: 'fall', delay: 0, origin: [206, 70] }),
        front(`<g transform="translate(150 20)">${solid('M0 -7C6 -7 8 -2 8 0C8 5 3 8 0 8C-3 5 -5 0 0 -7Z', 'mRose', '#7a0a34', 1.4, 1.6)}</g>`, [138, 8, 24, 24], { anim: 'fall', delay: 2, origin: [150, 20] }), tw(210, 140, 6, .6), tw(120, 10, 5, 1.8)]; }
    case 17: { const r = rays(186, 150, 12, 170, 3.4, '#ffd68a', .6);
      return [back(r, [0, -40, 360, 360], { anim: 'orbitSlow', origin: [186, 150] }), back(`<g filter="url(#b10)">${halo(186, 150, 70)}</g>${sphere(186, 150, 40, 'mSun', '#a04a0a')}`, [120, 84, 132, 132], { anim: 'pulse', origin: [186, 150] }),
        front(`<g filter="url(#ds)">${cloudBank([[100, 228, 18], [130, 212, 24], [166, 204, 30], [204, 214, 26], [236, 228, 16]], 246, '#ffd0a0')}</g>`, [70, 166, 186, 86], { anim: 'bob' }),
        front(`<g filter="url(#ds)">${cloudBank([[6, 214, 16], [30, 200, 22], [58, 214, 16]], 232, '#ffd0a0')}</g>`, [-16, 172, 96, 66], { anim: 'bob', delay: 2 }), tw(40, 40, 7, 0), tw(70, 14, 5, 1.2), tw(150, 30, 5, 2.4)]; }
    case 18: { const arch = solid('M14 240V112C14 52 62 14 120 -6C178 14 226 52 226 112V240H200V112C200 66 164 38 120 22C76 38 40 66 40 112V240Z', 'mJade', '#0a4a36', 3, 3);
      return [glowP('mHaloG', 116), back(`<g filter="url(#ds)">${arch}${[[27, 150], [213, 150], [120, 6]].map(([x, y]) => solid(khatam(x, y, 7), 'mGold', GOLD_OL, 1.4, 1.8)).join('')}</g>`, [0, -14, 240, 260]),
        front(`<g transform="translate(46 34) scale(.46)" filter="url(#ds)">${bigFanous(['mTealG', 'mAmberG', 'mRedG'])}</g>`, [30, 32, 34, 66], { anim: 'sway', origin: [46, 34] }),
        front(`<g transform="translate(194 34) scale(.46)" filter="url(#ds)">${bigFanous(['mRedG', 'mAmberG', 'mTealG'])}</g>`, [178, 32, 34, 66], { anim: 'sway', delay: 2, origin: [194, 34] }), tw(120, 30, 7, 0), tw(20, 60, 5, 1.4), mote(80, 220, 2, 0), mote(160, 222, 2, 2)]; }
    case 19: { const arch = solid('M14 240V112C14 52 62 14 120 -6C178 14 226 52 226 112V240H202V112C202 66 166 38 120 22C74 38 38 66 38 112V240Z', 'mCrystal', '#3a4a9a', 3, 3);
      return [glowP('mHaloB', 120), back(`<g filter="url(#ds)">${arch}</g><path d="M20 140C20 80 60 30 110 8" stroke="#fff" stroke-width="3" fill="none" opacity=".8" filter="url(#b2)"/>`, [0, -14, 240, 260]),
        front(`<g filter="url(#ds)">${solid('M120 -6L138 14L120 42L102 14Z', 'mCrystal', '#3a4a9a', 2.4, 2.6)}<path d="M102 14H138M120 -6L114 14L120 42L126 14Z" stroke="#fff" stroke-width="1" fill="none" opacity=".6"/></g>`, [96, -12, 48, 60], { anim: 'bob' }),
        tw(120, -2, 10, 0, '#e8f6ff'), tw(30, 100, 7, 1, '#e8f6ff'), tw(210, 150, 7, 2, '#e8f6ff'), tw(60, 20, 5, 3, '#e8f6ff'), mote(70, 220, 2, 0, '#e0f0ff'), mote(170, 220, 2, 2, '#e0f0ff')]; }
    case 20: { const emb = Array.from({ length: 7 }, (_, k) => `<path d="${khatam(30 + k * 30, 38, 7)}" fill="none" stroke="url(#mGold)" stroke-width="1.6"/><circle cx="${45 + k * 30}" cy="38" r="2" fill="url(#mGold)"/>`).join('');
      const drape = solid('M0 20C40 10 80 6 120 6C160 6 200 10 240 20V244H206C206 170 176 112 120 112C64 112 34 170 34 244H0Z', 'mKiswah', '#000000', 3, 2.6);
      return [glowP('mHalo', 112, 120, 120), back(`<g filter="url(#ds)">${drape}</g>${[24, 52, 188, 216].map((x) => `<path d="M${x} 60V236" stroke="#000" stroke-width="2" opacity=".35"/><path d="M${x + 3} 60V236" stroke="#6a6878" stroke-width="1" opacity=".35"/>`).join('')}`, [-4, 0, 248, 250]),
        back(`${solid('M0 24C40 14 80 10 120 10C160 10 200 14 240 24V52C200 42 160 38 120 38C80 38 40 42 0 52Z', 'mGold', GOLD_OL, 2, 2.4)}<g transform="translate(0 0)">${emb}</g>`, [-4, 4, 248, 54]),
        front(`<g filter="url(#ds)">${solid(khatam(120, 30, 22), 'mGold', GOLD_OL, 2.4, 2.6)}${solid(khatam(120, 30, 12), 'mKiswah', '#000', 1.4, 1.4)}${sphere(120, 30, 5, 'mGold', GOLD_OL)}</g>`, [94, 4, 52, 52]),
        tw(200, 60, 7, 0), tw(40, 70, 6, 1.4), mote(60, 224, 2, 0), mote(180, 228, 2, 2)]; }
    case 21: { const minaret = (x: number) => `${solid(`M${x - 8} 244V70H${x + 8}V244Z`, 'mGold', GOLD_OL, 2, 2.6)}${solid(`M${x - 12} 72H${x + 12}V82H${x - 12}Z`, 'mTealG', '#0a4a4a', 1.4, 2)}${solid(`M${x - 8} 70C${x - 8} 54 ${x} 40 ${x} 30C${x} 40 ${x + 8} 54 ${x + 8} 70Z`, 'mGold', GOLD_OL, 1.6, 2.4)}${solid(`M${x - 12} 150H${x + 12}V158H${x - 12}Z`, 'mTealG', '#0a4a4a', 1.4, 2)}`;
      const dome = `${solid('M56 96C56 38 86 6 120 0C154 6 184 38 184 96Z', 'mGold', GOLD_OL, 3.4, 3)}${solid('M50 92H190V104H50Z', 'mTealG', '#0a4a4a', 1.6, 2.4)}${[78, 102, 138, 162].map((x) => `<path d="M${x} 58V86" stroke="${GOLD_OL}" stroke-width="1.4" opacity=".4"/>`).join('')}<path d="M120 0V-14" stroke="${GOLD_OL}" stroke-width="3"/>`;
      return [glowP('mHaloT', 118), back(`<g filter="url(#ds)">${minaret(20)}${minaret(220)}${dome}</g>`, [0, -20, 240, 264]),
        back(`<g filter="url(#ds)">${bigMoon(122, -24, 10, 5, -4, 8.6)}</g>`, [104, -40, 34, 32], { anim: 'bob' }), tw(60, 20, 6, 0), tw(180, 20, 6, 1.2), mote(70, 226, 2, 0, '#b8fff2'), mote(170, 226, 2, 2, '#b8fff2')]; }
    case 22: { const tulip = (x: number, y: number, a: number, s: number, grad: string, ol: string) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">${solid('M0 0C-4 -10 -2 -22 0 -32', 'mLeaf', '#0a4a22', 1, 1)}<path d="M0 0V-30" stroke="#0a4a22" stroke-width="4"/><path d="M0 0V-30" stroke="#3ab84a" stroke-width="2"/>${leafHQ(0, -6, -120, 22, 6)}${solid('M0 -28C-12 -30 -15 -44 -11 -56L-5 -46L0 -60L5 -46L11 -56C15 -44 12 -30 0 -28Z', grad, ol, 2, 2.4)}</g>`;
      return [glowP('mHaloB', 114), front(band(86, 9, 'mGlaze', '#1a2a6a')),
        front(`<g filter="url(#ds)">${tulip(40, 234, -28, 1.05, 'mCobalt', '#0a1a5a')}${tulip(58, 238, -8, .9, 'mRedG', '#7a0a2a')}${tulip(22, 232, -52, .8, 'mRedG', '#7a0a2a')}${tulip(200, 234, 28, 1.05, 'mCobalt', '#0a1a5a')}${tulip(182, 238, 8, .9, 'mRedG', '#7a0a2a')}${tulip(218, 232, 52, .8, 'mRedG', '#7a0a2a')}</g>`, [-10, 150, 260, 94], { anim: 'bob' }),
        front(`<g filter="url(#ds)">${tulip(120, 34, 0, .6, 'mCobalt', '#0a1a5a')}</g>`, [104, -6, 32, 44], { anim: 'bloom', origin: [120, 34] }), tw(200, 40, 7, 0, '#e0ecff'), tw(40, 50, 6, 1.2, '#e0ecff')]; }
    case 23: { const sky = `<circle cx="120" cy="120" r="116" fill="url(#mSunset)"/>`;
      const masjid = `<path d="M-6 244V206H24V170L30 156L36 170V206H70Q70 170 100 160Q130 170 130 206H150V188H160V180L164 172L168 180V188H178V206H246V244Z" fill="#2a1240" stroke="#14061e" stroke-width="2.4" stroke-linejoin="round"/>${[44, 100, 196, 220].map((x) => `<path d="M${x - 4} 228V218Q${x} 212 ${x + 4} 218V228Z" fill="#ffcf6b" opacity=".9"/>`).join('')}<path d="M100 160V150" stroke="#2a1240" stroke-width="2.4"/>`;
      return [back(`<g filter="url(#b5)">${sky}</g>`, [-10, -10, 260, 260]), back(`<g filter="url(#b10)">${halo(120, 196, 60)}</g>${sphere(120, 196, 32, 'mSun', '#a04a0a')}`, [70, 140, 100, 100], { anim: 'pulse', origin: [120, 196] }),
        front(`<g filter="url(#ds)">${masjid}</g>`, [-10, 140, 260, 108]),
        front(`<path d="M0 0Q5 -5 10 0Q15 -5 20 0" stroke="#2a1240" stroke-width="2.6" fill="none" stroke-linecap="round" transform="translate(170 40)"/><path d="M0 0Q4 -4 8 0Q12 -4 16 0" stroke="#2a1240" stroke-width="2.2" fill="none" stroke-linecap="round" transform="translate(194 60)"/>`, [164, 30, 56, 40], { anim: 'drift' }),
        tw(50, 40, 6, 0), tw(30, 90, 4, 1.4)]; }
    case 24: { const big = solid(khatam(120, 120, 118), 'mTealG', '#0a3a4a', 3, 3) + `<path d="${khatam(120, 120, 104)}" fill="none" stroke="url(#mGold)" stroke-width="3"/>`;
      const small = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => solid(khatam(...at(98, a), 10), 'mGold', GOLD_OL, 1.4, 2) + sphere(...at(98, a), 3.4, 'mTealG', '#0a3a4a')).join('');
      return [glowP('mHaloT', 120), back(`<g filter="url(#ds)">${big}</g>`, [-6, -6, 252, 252], { anim: 'orbitSlow', origin: [120, 120] }), front(band(86, 8, 'mGold', GOLD_OL)), front(small, [0, 0, 240, 240], { anim: 'orbitRev', origin: [120, 120] }), tw(214, 20, 8, 0), tw(26, 220, 7, 1.4)]; }
    case 25: { const pearls = Array.from({ length: 24 }, (_, k) => sphere(...at(90, k * 15), 5.4, 'mPearl', '#6a5a8a')).join('');
      const roseHQ = (x: number, y: number, r: number) => `${sphere(x, y, r, 'mRose', '#7a0a34')}<path d="M${P(x - r * .5, y)}C${P(x - r * .5, y - r * .6)} ${P(x + r * .5, y - r * .6)} ${P(x + r * .45, y + r * .1)}M${P(x - r * .7, y + r * .35)}C${P(x - r * .2, y + r * .75)} ${P(x + r * .4, y + r * .7)} ${P(x + r * .7, y + r * .3)}" stroke="#7a0a34" stroke-width="1.6" fill="none" opacity=".75"/>`;
      return [glowP('mHaloR', 114), front(pearls), front(`<g filter="url(#ds)">${leafHQ(96, 212, 170, 24, 9)}${leafHQ(144, 212, 10, 24, 9)}${roseHQ(104, 208, 13)}${roseHQ(136, 208, 13)}${roseHQ(120, 220, 15)}</g>`, [66, 186, 108, 56]),
        front(`<path d="M120 8V22" stroke="#8a7aa8" stroke-width="2"/>${solid('M120 20L130 34L120 48L110 34Z', 'mRoseGold', '#7a3a2a', 2, 2.2)}${sphere(120, 34, 4, 'mRose', '#7a0a34')}`, [104, 4, 32, 50], { anim: 'sway', origin: [120, 8] }), tw(200, 50, 7, 0), tw(40, 60, 6, 1.2)]; }
    case 26: return hqPieces(126);
    case 27: { const rr = rays(120, 120, 14, 170, 4, '#fff0b0', .6);
      const door = (x: number, flip: number) => `<g transform="translate(${x} 0) scale(${flip} 1)">${solid('M0 244V96C0 58 26 30 60 16V244Z', 'mGold', GOLD_OL, 3, 3)}${[56, 100, 144, 188].map((y) => solid(khatam(30, y, 12), 'mAmberG', GOLD_OL, 1.4, 1.8) + sphere(30, y, 3.6, 'mTealG', '#0a3a4a')).join('')}</g>`;
      const flower = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map((a) => `<g transform="rotate(${a})">${solid('M0 0C-8 -6 -7 -20 0 -22C7 -20 8 -6 0 0Z', 'mPearl', '#8a6a8a', 1.4, 1.6)}</g>`).join('')}${sphere(0, 0, 4.4, 'mGold', GOLD_OL)}</g>`;
      return [back(rr, [-60, -60, 360, 360], { anim: 'orbitSlow', origin: [120, 120] }), glowP('mHalo', 120),
        back(`<g filter="url(#ds)">${door(-2, 1)}${door(242, -1)}</g>`, [-8, 8, 256, 240]),
        front(`<g filter="url(#ds)">${leafHQ(34, 214, 200, 26, 9)}${leafHQ(206, 214, -20, 26, 9)}${flower(30, 206, 1.1)}${flower(210, 206, 1.1)}</g>`, [0, 176, 240, 60]),
        front(`<g filter="url(#ds)">${flower(120, 22, 1.25)}</g>`, [90, -8, 60, 60], { anim: 'bloom', origin: [120, 22] }), tw(60, 40, 8, 0), tw(180, 40, 8, 1.2), tw(120, 230, 6, 2.4), mote(80, 226, 2.2, 0, '#fff'), mote(160, 226, 2.2, 2, '#fff'), mote(120, 230, 1.8, 1, '#fff')]; }
    case 28: { const swirl = `<g filter="url(#b5)">${[0, 90, 180, 270].map((a) => `<path d="M120 120C${P(...at(70, a))} ${P(...at(118, a + 50))} ${P(...at(124, a + 100))}" stroke="${a % 180 ? '#7a5aff' : '#ff7ad8'}" stroke-width="20" fill="none" stroke-linecap="round" opacity=".55"/>`).join('')}</g>`;
      const planet = (x: number, y: number, r: number, g: string, ol: string, ringd = false) => `${ringd ? `<ellipse cx="${x}" cy="${y}" rx="${r * 1.9}" ry="${r * .55}" fill="none" stroke="${ol}" stroke-width="4.6" transform="rotate(-20 ${x} ${y})"/><ellipse cx="${x}" cy="${y}" rx="${r * 1.9}" ry="${r * .55}" fill="none" stroke="url(#mGold)" stroke-width="2.4" transform="rotate(-20 ${x} ${y})"/>` : ''}${sphere(x, y, r, g, ol)}`;
      return [back(`${halo(120, 120, 120, 'mHaloV')}${swirl}`, [-10, -10, 260, 260], { anim: 'orbitSlow', origin: [120, 120] }),
        back(`<circle cx="120" cy="120" r="104" fill="none" stroke="#c8b8ff" stroke-width="1.4" stroke-dasharray="3 7" opacity=".7"/>`),
        front(`<g filter="url(#ds)">${planet(...at(104, 200), 13, 'mAmberG', GOLD_OL, true)}${planet(...at(104, 20), 9, 'mTealG', '#0a3a4a')}${planet(...at(104, 110), 7, 'mRose', '#7a0a34')}${planet(...at(104, 290), 6, 'mSapph', '#0a1f6a')}</g>`, [-20, -20, 280, 280], { anim: 'orbit', origin: [120, 120] }),
        front(band(86, 7, 'mVioletG', '#2a1a6a')), tw(20, 30, 8, 0, '#e8dcff'), tw(224, 46, 6, 1, '#e8dcff'), tw(226, 206, 7, 2, '#e8dcff'), tw(14, 206, 5, 3, '#e8dcff'), mote(70, 226, 2, 0, '#e8dcff'), mote(170, 226, 2, 2, '#e8dcff')]; }
    case 29: { const minaret = (x: number) => `${solid(`M${x - 9} 244V64H${x + 9}V244Z`, 'mGold', GOLD_OL, 2, 2.6)}${solid(`M${x - 13} 66H${x + 13}V76H${x - 13}Z`, 'mGoldD', GOLD_OL, 1.4, 2)}${solid(`M${x - 9} 64C${x - 9} 46 ${x} 32 ${x} 20C${x} 32 ${x + 9} 46 ${x + 9} 64Z`, 'mGold', GOLD_OL, 1.6, 2.4)}${[120, 180].map((y) => solid(`M${x - 13} ${y}H${x + 13}V${y + 8}H${x - 13}Z`, 'mGoldD', GOLD_OL, 1.4, 2)).join('')}`;
      const hall = `${solid('M30 244V150H210V244Z', 'mGold', GOLD_OL, 2.4, 3)}${[52, 86, 154, 188].map((x) => `<path d="M${x - 10} 236V196Q${x} 180 ${x + 10} 196V236Z" fill="#5a2406"/><path d="M${x - 7} 232V198Q${x} 186 ${x + 7} 198V232Z" fill="url(#mFlame)" opacity=".85"/>`).join('')}`;
      const dome = `${solid('M40 120C40 50 80 8 120 -6C160 8 200 50 200 120Z', 'mGold', GOLD_OL, 4, 3.4)}${solid('M34 116H206V130H34Z', 'mGoldD', GOLD_OL, 1.6, 2.6)}<path d="M120 -6V-20" stroke="${GOLD_OL}" stroke-width="3"/>`;
      return [glowP('mHalo', 124), back(`<g filter="url(#ds)">${minaret(14)}${minaret(226)}${dome}${hall}</g>`, [-8, -24, 256, 270]),
        back(`<g filter="url(#ds)">${bigMoon(124, -32, 13, 6, -5, 11)}</g>`, [102, -52, 40, 40], { anim: 'bob' }),
        tw(60, 16, 7, 0), tw(180, 16, 7, 1.2), tw(14, 0, 5, 2.2), tw(226, 0, 5, 3), mote(70, 226, 2.2, 0), mote(120, 230, 2, 1.3), mote(170, 226, 2.2, 2.6)]; }
    case 30: { const burst = (x: number, y: number, R: number, c: string) => `<g filter="url(#b2)" opacity=".8">${Array.from({ length: 14 }, (_, k) => { const a = (k * 360) / 14; return `<path d="M${P(...at(R * .3, a, x, y))}L${P(...at(R, a, x, y))}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`; }).join('')}</g>${Array.from({ length: 14 }, (_, k) => { const a = (k * 360) / 14; return `<path d="M${P(...at(R * .35, a, x, y))}L${P(...at(R * .95, a, x, y))}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="${f(at(R, a, x, y)[0])}" cy="${f(at(R, a, x, y)[1])}" r="2.6" fill="#fff"/>`; }).join('')}`;
      const fw: Piece[] = ([[44, 44, 38, '#ff5a7a', 0], [198, 48, 42, '#5affd8', .7], [26, 168, 28, '#c88aff', 1.4], [214, 172, 32, '#ffd040', 1.0], [120, 6, 26, '#ff9a5a', 1.7]] as const).map(([x, y, R, c, d]) => back(burst(x, y, R, c), [x - R - 8, y - R - 8, 2 * R + 16, 2 * R + 16], { anim: 'burst', delay: d, origin: [x, y] }));
      const cols = ['mRedG', 'mAmberG', 'mTealG', 'mVioletG'];
      const flags = Array.from({ length: 9 }, (_, k) => { const x = 22 + k * 24.5, y = 196 + Math.sin((k / 8) * Math.PI) * 26; return solid(`M${P(x - 10, y)}L${P(x + 10, y)}L${P(x, y + 20)}Z`, cols[k % 4], '#2a0a3a', 1.6, 2); }).join('');
      return [...fw, glowP('mHalo', 110), front(`<path d="M6 192Q120 250 234 192" stroke="#2a0a3a" stroke-width="3" fill="none"/>${flags}`, [0, 180, 240, 64], { anim: 'bob' }),
        front(`<g transform="translate(26 92) scale(.42)" filter="url(#ds)">${bigFanous(['mRedG', 'mAmberG', 'mTealG'])}</g>`, [10, 90, 34, 62], { anim: 'sway', origin: [26, 92] }),
        front(`<g transform="translate(214 92) scale(.42)" filter="url(#ds)">${bigFanous(['mTealG', 'mAmberG', 'mVioletG'])}</g>`, [198, 90, 34, 62], { anim: 'sway', delay: 2, origin: [214, 92] }), tw(120, 236, 7, 0), tw(80, 20, 5, 1)]; }
    case 31: { const palm = (x: number, flip: number) => `<g transform="translate(${x} 0) scale(${flip} 1)">${Array.from({ length: 8 }, (_, k) => solid(`M${P(6 + k * 1.6, 244 - k * 22)}L${P(18 + k * 1.6, 244 - k * 22)}L${P(19 + k * 1.8, 222 - k * 22)}L${P(7 + k * 1.8, 222 - k * 22)}Z`, 'mWood', '#4a2408', 1.4, 2)).join('')}
        ${[[-150, 50], [-115, 54], [-75, 52], [-35, 46], [-185, 40], [10, 40]].map(([a, L]) => leafHQ(27, 66, a, L, 11)).join('')}${sphere(22, 74, 5.5, 'mBronze', '#4a2408')}${sphere(32, 76, 5.5, 'mBronze', '#4a2408')}</g>`;
      return [back(`<g filter="url(#b10)">${halo(120, 160, 90)}</g>${sphere(120, 170, 48, 'mSun', '#a04a0a')}`, [20, 60, 200, 200], { anim: 'pulse', origin: [120, 170] }),
        front(band(86, 7, 'mTealG', '#0a4a4a')),
        front(`<g filter="url(#ds)">${palm(-6, 1)}${palm(246, -1)}</g>`, [-30, 0, 300, 246]),
        front(`<g filter="url(#ds)">${solid('M4 222C50 208 190 208 236 222C206 240 34 240 4 222Z', 'mWater', '#0a4a5a', 2, 2.6)}</g><path d="M40 222H86M124 226H176M96 230H112" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>`, [-4, 200, 248, 44], { anim: 'bob' }),
        tw(90, 222, 5, 0), tw(160, 220, 5, 1.3), tw(120, 20, 7, 2), tw(196, 110, 5, 3)]; }
    case 32: { // MYTHIC · Celestial khatam: a huge star of light turning behind, an aurora veil, crystal shards orbiting
      const big = `<path d="${khatam(120, 120, 122)}" fill="url(#mHaloV)" opacity=".6"/><path d="${khatam(120, 120, 118)}" fill="none" stroke="url(#mAurora2)" stroke-width="5"/><path d="${khatam(120, 120, 108)}" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>`;
      const shards = [0, 60, 120, 180, 240, 300].map((a) => { const [x, y] = at(104, a); return `<g transform="rotate(${a + 90} ${f(x)} ${f(y)})">${solid(`M${P(x, y - 12)}L${P(x + 6, y)}L${P(x, y + 12)}L${P(x - 6, y)}Z`, 'mCrystal', '#3a4a9a', 1.4, 1.8)}</g>`; }).join('');
      return [glowP('mHaloV', 124), back(`<g filter="url(#bloom)">${big}</g>`, [-10, -10, 260, 260], { anim: 'orbitSlow', origin: [120, 120] }),
        back((() => { const m = id('af'); return `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="640" height="640"><ellipse cx="120" cy="30" rx="150" ry="70" fill="url(#mFade)"/></mask></defs><g mask="url(#${m})"><g filter="url(#b5)"><path d="M-20 60C40 0 90 80 130 20C170 -30 220 40 260 0" stroke="url(#mAurora2)" stroke-width="30" fill="none" opacity=".8"/></g></g>`; })(), [-30, -50, 300, 160], { anim: 'bob' }),
        front(band(86, 8, 'mCrystal', '#3a4a9a')), front(`<g filter="url(#ds)">${shards}</g>`, [-6, -6, 252, 252], { anim: 'orbit', origin: [120, 120] }),
        front(`<g filter="url(#bloom)"><g filter="url(#ds)">${solid(khatam(120, 20, 16), 'mCrystal', '#3a4a9a', 2, 2.4)}${sphere(120, 20, 5, 'mVioletG', '#2a1a6a')}</g></g>`, [96, -6, 48, 52], { anim: 'bob' }),
        tw(26, 40, 9, 0, '#e8dcff'), tw(214, 60, 7, 1, '#e8dcff'), tw(222, 196, 8, 2, '#e8dcff'), tw(18, 200, 6, 3, '#e8dcff'), mote(60, 226, 2.4, 0, '#e8dcff'), mote(120, 230, 2, 1.3, '#e8dcff'), mote(180, 226, 2.4, 2.6, '#e8dcff')];
    }
    case 33: { // MYTHIC · Eternal garden: an arch of flowering vines, roses and jasmine opening, a river of light below, petals drifting
      const vine = (flip: number) => `<g transform="translate(${flip < 0 ? 240 : 0} 0) scale(${flip} 1)"><path d="M28 236C10 170 20 90 70 40C90 22 108 14 120 12" stroke="#0a4a22" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M28 236C10 170 20 90 70 40C90 22 108 14 120 12" stroke="#3ab84a" stroke-width="4" fill="none" stroke-linecap="round"/>${[[18, 190, 200], [16, 140, 170], [26, 96, 220], [48, 60, 240], [84, 30, 260], [34, 110, 10], [60, 48, 40]].map(([x, y, a]) => leafHQ(x, y, a, 22, 8)).join('')}</g>`;
      const jas = (x: number, y: number, s2: number) => `<g transform="translate(${x} ${y}) scale(${s2})">${[0, 72, 144, 216, 288].map((a) => `<g transform="rotate(${a})">${solid('M0 0C-6 -5 -6 -16 0 -18C6 -16 6 -5 0 0Z', 'mPearl', '#8a6a8a', 1.2, 1.4)}</g>`).join('')}${sphere(0, 0, 3.6, 'mGold', GOLD_OL)}</g>`;
      const roseHQ = (x: number, y: number, r: number) => `${sphere(x, y, r, 'mRose', '#7a0a34')}<path d="M${P(x - r * .5, y)}C${P(x - r * .5, y - r * .6)} ${P(x + r * .5, y - r * .6)} ${P(x + r * .45, y + r * .1)}M${P(x - r * .7, y + r * .35)}C${P(x - r * .2, y + r * .75)} ${P(x + r * .4, y + r * .7)} ${P(x + r * .7, y + r * .3)}" stroke="#7a0a34" stroke-width="1.6" fill="none" opacity=".75"/>`;
      const petal = (x: number, y: number, d: number): Piece => front(`<g transform="translate(${x} ${y})">${solid('M0 -6C5 -6 7 -2 7 0C7 4 3 7 0 7C-3 4 -4 0 0 -6Z', 'mRose', '#7a0a34', 1.2, 1.4)}</g>`, [x - 10, y - 10, 20, 20], { anim: 'fall', delay: d, origin: [x, y] });
      return [glowP('mHaloG', 124), back(`<g filter="url(#ds)">${vine(1)}${vine(-1)}</g>`, [-4, 0, 248, 244]),
        front(`<g filter="url(#ds)">${roseHQ(22, 150, 12)}${roseHQ(218, 120, 12)}${roseHQ(56, 52, 10)}</g>`, [0, 30, 240, 140]),
        ...[[26, 104, 0], [214, 170, 1.3], [180, 46, 2.6], [120, 10, 2]].map(([x, y, d]) => front(`<g filter="url(#ds)">${jas(x, y, 1.1)}</g>`, [x - 24, y - 24, 48, 48], { anim: 'bloom', delay: d, origin: [x, y] })),
        front(`<g filter="url(#b5)"><path d="M0 226C60 214 180 214 240 226V244H0Z" fill="url(#mWater)"/></g><path d="M0 226C60 214 180 214 240 226" stroke="#e0fffa" stroke-width="2.4" fill="none" opacity=".9"/><path d="M40 232H90M140 234H200" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`, [-6, 206, 252, 42], { anim: 'bob' }),
        petal(196, 70, 0), petal(60, 20, 1.3), petal(150, 10, 2.6), tw(90, 230, 5, 0), tw(170, 232, 5, 1.5), tw(30, 60, 7, 2), mote(70, 226, 2.2, .5, '#e0ffe8'), mote(170, 226, 2.2, 2.5, '#e0ffe8')];
    }
    case 34: { // MYTHIC · Zamzam of light: arcs of glowing water rising round the avatar into a crystal basin, drops of light
      const arc = (side: number) => `<path d="M${120 + side * 30} 236C${120 + side * 120} 200 ${120 + side * 120} 40 ${120 + side * 16} 8" stroke="#3ad8c8" stroke-width="10" fill="none" stroke-linecap="round" opacity=".55" filter="url(#b5)"/><path d="M${120 + side * 30} 236C${120 + side * 120} 200 ${120 + side * 120} 40 ${120 + side * 16} 8" stroke="#c8fff6" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      const drops = (k0: number) => Array.from({ length: 8 }, (_, k) => { const a = (k0 + k) * 40; const [x, y] = at(100, a); return `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="#3ad8c8" opacity=".5" filter="url(#b2)"/><path d="M${f(x)} ${f(y - 5)}C${f(x + 4)} ${f(y)} ${f(x + 4)} ${f(y + 4)} ${f(x)} ${f(y + 4)}C${f(x - 4)} ${f(y + 4)} ${f(x - 4)} ${f(y)} ${f(x)} ${f(y - 5)}Z" fill="#e0fffa"/>`; }).join('');
      return [glowP('mHaloT', 124), back(`${arc(1)}${arc(-1)}`, [-10, -4, 260, 248], { anim: 'pulse', origin: [120, 236] }),
        back(drops(0), [-6, -6, 252, 252], { anim: 'orbit', origin: [120, 120] }), front(band(86, 8, 'mWater', '#0a4a5a')),
        front(`<g filter="url(#ds)">${solid('M56 214H184C180 232 156 244 120 244C84 244 60 232 56 214Z', 'mCrystal', '#2a3a8a', 2.4, 2.6)}${solid('M50 208H190V218H50Z', 'mWater', '#0a4a5a', 1.4, 2)}</g>`, [40, 200, 160, 50]),
        front(`<g filter="url(#bloom)">${drops(0.5).split('</path>').join('')}</g>`, [-6, -6, 252, 252], { anim: 'orbitRev', origin: [120, 120] }),
        tw(120, 6, 9, 0, '#e0fffa'), tw(30, 120, 7, 1, '#e0fffa'), tw(210, 120, 7, 2, '#e0fffa'), mote(80, 210, 2.4, 0, '#c8fff6'), mote(160, 210, 2.4, 2, '#c8fff6'), mote(120, 214, 2, 1, '#c8fff6')];
    }
    case 35: { // LEGENDARY · Lantern bridge: five lanterns on a gold chain arching over the avatar, each swinging in its own time
      const xs = [26, 72, 120, 168, 214], glass: [string, string, string][] = [['mTealG', 'mAmberG', 'mVioletG'], ['mRedG', 'mAmberG', 'mTealG'], ['mAmberG', 'mRedG', 'mAmberG'], ['mTealG', 'mAmberG', 'mRedG'], ['mVioletG', 'mAmberG', 'mTealG']];
      const yAt = (x: number) => 30 - Math.sin(((x - 6) / 228) * Math.PI) * 26;
      return [glowP('mHalo', 120), back(`<path d="M-4 40Q120 -40 244 40" stroke="${GOLD_OL}" stroke-width="4" fill="none"/><path d="M-4 40Q120 -40 244 40" stroke="url(#mGold)" stroke-width="2" fill="none"/>`, [-10, -10, 260, 60]),
        ...xs.map((x, k) => front(`<g transform="translate(${x} ${f(yAt(x))}) scale(${k === 2 ? .5 : .4})" filter="url(#ds)">${bigFanous(glass[k])}</g><circle cx="${x}" cy="${f(yAt(x) + 34)}" r="14" fill="url(#mHalo)" filter="url(#b5)" opacity=".8"/>`, [x - 18, yAt(x) - 4, 36, 72], { anim: 'sway', delay: k * .8, origin: [x, yAt(x)] })),
        front(band(86, 8, 'mGold', GOLD_OL)), tw(50, 110, 6, 0), tw(190, 110, 6, 1.3), mote(60, 220, 2.2, 0), mote(120, 226, 2, 1.4), mote(180, 220, 2.2, 2.8)];
    }
    case 36: { // LEGENDARY · Desert night: golden dunes rolling in front, a crescent and the stars behind, a lone palm
      const starsS = Array.from({ length: 18 }, (_, k) => `<circle cx="${20 + ((k * 61) % 200)}" cy="${16 + ((k * 37) % 90)}" r="${k % 4 ? 1 : 1.8}" fill="#fff4c8"/>`).join('');
      return [back(`<circle cx="120" cy="120" r="120" fill="url(#mSky)"/>`, [-4, -4, 248, 248]), back(starsS, [0, 0, 240, 120], { anim: 'pulse' }),
        back(`<g filter="url(#b10)">${halo(56, 50, 40)}</g><g filter="url(#bloom)">${bigMoon(56, 50, 26, 12, -8, 22)}</g>`, [0, 0, 112, 104], { anim: 'bob' }),
        front(`<g filter="url(#ds)">${solid('M-10 214C40 186 90 196 130 212C170 194 210 190 250 206V250H-10Z', 'mSun', '#7a3a06', 3, 2.8)}${solid('M-10 230C50 210 120 224 160 236C190 222 220 220 250 228V250H-10Z', 'mGold', GOLD_OL, 3, 2.8)}<path d="M20 200C50 190 80 194 104 204" stroke="#fff3c0" stroke-width="2.4" fill="none" opacity=".7"/></g>`, [-14, 176, 268, 76]),
        front(`<g filter="url(#ds)"><path d="M206 214C206 190 204 168 198 150" stroke="#3a1a06" stroke-width="7" fill="none"/><path d="M206 214C206 190 204 168 198 150" stroke="url(#mWood)" stroke-width="3.6" fill="none"/>${[[-150, 30], [-115, 34], [-75, 32], [-35, 28], [-185, 24]].map(([a, L]) => leafHQ(198, 150, a, L, 8)).join('')}</g>`, [160, 110, 80, 108], { anim: 'sway', origin: [204, 214] }),
        front(band(86, 7, 'mGold', GOLD_OL)), tw(200, 40, 7, 0), tw(150, 20, 5, 1.2), tw(20, 120, 5, 2.4)];
    }
    case 37: { // LEGENDARY · Royal mashrabiya: a carved screen arch behind, light shining through it, gold inlay
      const lattice = Array.from({ length: 7 }, (_, r) => Array.from({ length: 9 }, (_, k) => `<path d="${khatam(16 + k * 26 + (r % 2) * 13, 30 + r * 30, 10)}" fill="none" stroke="#3a1606" stroke-width="3.6"/>`).join('')).join('');
      const m = id('ms');
      return [glowP('mHalo', 124), back(`<defs><clipPath id="${m}"><path d="M10 244V110C10 50 60 10 120 -4C180 10 230 50 230 110V244Z"/></clipPath></defs>${solid('M10 244V110C10 50 60 10 120 -4C180 10 230 50 230 110V244Z', 'mWood', '#3a1606', 3, 3)}<g clip-path="url(#${m})"><rect x="0" y="-10" width="240" height="260" fill="url(#mHalo)" opacity=".85"/>${lattice}</g><path d="M10 244V110C10 50 60 10 120 -4C180 10 230 50 230 110V244" stroke="url(#mGold)" stroke-width="5" fill="none"/>`, [0, -12, 240, 258]),
        front(`<g filter="url(#ds)">${gemHQ(120, 8, 10, 'mRuby')}${gemHQ(18, 130, 7, 'mEmerald')}${gemHQ(222, 130, 7, 'mEmerald')}</g>`, [0, -10, 240, 160]),
        front(band(86, 8, 'mGold', GOLD_OL)), tw(60, 40, 7, 0), tw(180, 40, 7, 1.2), mote(70, 226, 2.2, 0), mote(170, 226, 2.2, 2)];
    }
  }
  return null;
}
