// Profile effects (owner request 2026-11-24, "for all items without any exception"): a scene that plays over a
// player's whole profile card, like Discord's profile effects, in our own Islamic style (docs/item-art.md). A 240 × 400
// card; pieces drawn once, moved by CSS transform / opacity only. Kept mostly to the edges, top and bottom, so the
// character and the name in the middle stay clear. Stills in lists, `html.lite` and with reduced motion.
import { f, khatam, star } from './art';
import { stage } from './deco';
import type { Piece } from './frames';
import { GOLD_OL, bigFanous, bigMoon, cloudBank, halo, id, mote, tw } from './hq';
import { gemHQ, leafHQ, solid, sphere } from './hqframes';

export type FxRar = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
/** Every profile effect: rarity, English and Arabic names (other languages: extra `fx.{n}`; prices: data/shop.ts FX_PRICES). */
export const FX: Record<number, { r: FxRar; en: string; ar: string }> = {
  1: { r: 'common', en: 'Rising light', ar: 'نور صاعد' },
  2: { r: 'rare', en: 'Gold dust', ar: 'غبار الذهب' },
  3: { r: 'rare', en: 'Jasmine fall', ar: 'تساقط الياسمين' },
  4: { r: 'epic', en: 'Rain of mercy', ar: 'مطر الرحمة' },
  5: { r: 'epic', en: 'Rising lanterns', ar: 'فوانيس صاعدة' },
  6: { r: 'epic', en: 'Starfall', ar: 'شهب الليل' },
  7: { r: 'legendary', en: 'Golden lattice', ar: 'المشربية الذهبية' },
  8: { r: 'legendary', en: 'Aurora veil', ar: 'ستار الشفق' },
  9: { r: 'legendary', en: 'Rose garden', ar: 'حديقة الورد' },
  10: { r: 'mythic', en: 'Night of Qadr', ar: 'ليلة القدر' },
  11: { r: 'mythic', en: 'Lantern festival', ar: 'مهرجان الفوانيس' },
  12: { r: 'mythic', en: 'Celestial orbit', ar: 'المدار السماوي' },
};
export const FX_IDS = Object.keys(FX).map(Number);
export const FX_W = 240, FX_H = 400;

const back = (svg: string, box?: [number, number, number, number], extra: Partial<Piece> = {}): Piece => ({ z: 'back', svg, box, ...extra });
const front = (svg: string, box?: [number, number, number, number], extra: Partial<Piece> = {}): Piece => ({ z: 'front', svg, box, ...extra });
const up = (x: number, y: number, r: number, d: number, c?: string): Piece => ({ ...mote(x, y, r, d, c), z: 'front' });
/** A soft mask fading a scene out towards its edges (no hard rectangle). */
/** Fades a layer into the two top corners, leaving the middle (the player's avatar) clear. */
const corners = (inner: string) => {
  const m = id('fx');
  return `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="640" height="800"><ellipse cx="0" cy="30" rx="110" ry="200" fill="url(#mFade)"/><ellipse cx="240" cy="30" rx="110" ry="200" fill="url(#mFade)"/></mask></defs><g mask="url(#${m})">${inner}</g>`;
};
const fade = (cx: number, cy: number, rx: number, ry: number, inner: string) => {
  const m = id('fx');
  return `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="640" height="800"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#mFade)"/></mask></defs><g mask="url(#${m})">${inner}</g>`;
};
const streak = (L: number, w: number, c = 'url(#mBeam)') => `<path d="M0 0L${L} ${L * .4}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" transform="rotate(180 ${L / 2} ${L * .2})"/><circle cx="${L}" cy="${L * .4}" r="${w * .9}" fill="#fff"/><circle cx="${L}" cy="${L * .4}" r="${w * 2.6}" fill="url(#mHalo)" opacity=".8"/>`;
const shooting = (x: number, y: number, L: number, d: number): Piece => front(streak(L, L / 18), [x, y, L + 8, L * .4 + 8], { anim: 'shoot', delay: d });
const petal = (x: number, y: number, d: number, grad = 'mPearl', ol = '#8a6a8a'): Piece =>
  front(`<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<path d="M0 0C-3.4 -3.4 -3.4 -10 0 -11.4C3.4 -10 3.4 -3.4 0 0Z" fill="url(#${grad})" stroke="${ol}" stroke-width=".9" transform="rotate(${a})"/>`).join('')}<circle r="2.2" fill="url(#mGold)"/></g>`,
    [x - 13, y - 13, 26, 26], { anim: 'fall', delay: d, origin: [x, y] });
const rosePetal = (x: number, y: number, d: number): Piece =>
  front(`<g transform="translate(${x} ${y})">${solid('M0 -8C6 -8 8 -2 8 0C8 5 3 8 0 8C-3 5 -5 0 0 -8Z', 'mRose', '#7a0a34', 1.2, 1.4)}</g>`, [x - 11, y - 11, 22, 22], { anim: 'fall', delay: d, origin: [x, y] });
const drop = (x: number, y: number, d: number): Piece =>
  front(`<path d="M${x} ${y}L${x - 3} ${y + 22}" stroke="#cfe6ff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/><circle cx="${x - 3}" cy="${y + 22}" r="1.5" fill="#fff"/>`, [x - 6, y - 2, 8, 28], { anim: 'rain', delay: d });
const stars = (n: number, s: number, h: number) => Array.from({ length: n }, (_, k) => `<circle cx="${(k * 61 + s * 23) % 240}" cy="${(k * 47 + s * 31) % h}" r="${k % 6 ? .9 : 1.7}" fill="#fff"/>`).join('');
/** A firework burst of light (gold or teal), drawn once and opened by `burst`. */
const firework = (x: number, y: number, R: number, c1: string, c2: string, d: number): Piece => {
  const arms = Array.from({ length: 16 }, (_, k) => { const a = (k * 22.5 * Math.PI) / 180; const r1 = R * .35, r2 = R * (k % 2 ? .8 : 1);
    return `<path d="M${f(x + r1 * Math.cos(a))} ${f(y + r1 * Math.sin(a))}L${f(x + r2 * Math.cos(a))} ${f(y + r2 * Math.sin(a))}" stroke="${k % 2 ? c2 : c1}" stroke-width="2.4" stroke-linecap="round"/><circle cx="${f(x + r2 * Math.cos(a))}" cy="${f(y + r2 * Math.sin(a))}" r="2.2" fill="#fff"/>`; }).join('');
  return front(`<g filter="url(#b5)" opacity=".8">${arms}</g>${arms}<circle cx="${x}" cy="${y}" r="${R * .3}" fill="url(#mHalo)"/>`, [x - R - 8, y - R - 8, 2 * R + 16, 2 * R + 16], { anim: 'burst', delay: d, origin: [x, y] });
};

export function effectPieces(n: number): Piece[] {
  switch (n) {
    case 1: // light dust drifting up from the bottom of the card
      return [back(`<g filter="url(#b10)"><ellipse cx="120" cy="420" rx="150" ry="60" fill="url(#mHalo)"/></g>`, [-50, 330, 340, 160], { anim: 'pulse', origin: [120, 410] }),
        ...[24, 60, 98, 142, 180, 216, 40, 120, 200].map((x, k) => up(x, 380 - (k % 3) * 30, 2 + (k % 3) * .5, k * .45))];
    case 2: { // gold dust: flecks sparkling all round the edge, a warm glow in the corners
      const fleck = (x: number, y: number, d: number) => front(`<g transform="translate(${x} ${y}) rotate(${(x * 7) % 90})"><circle r="11" fill="url(#mHalo)"/>${solid(star(0, 0, 7, 4, .35), 'mGold', GOLD_OL, 1, 1.4)}<circle cx="-1.6" cy="-1.6" r="1.3" fill="#fff"/></g>`, [x - 12, y - 12, 24, 24], { anim: 'fall', delay: d, origin: [x, y] });
      return [back(`<g filter="url(#b10)">${halo(0, 0, 90)}${halo(240, 400, 90)}</g>`, [-110, -110, 460, 620], { anim: 'pulse' }),
        fleck(30, 10, 0), fleck(90, 0, .8), fleck(170, 20, 1.6), fleck(220, 0, 2.4), fleck(60, 40, 3.2), fleck(200, 60, 1.2),
        ...[[20, 90], [220, 130], [16, 250], [224, 300], [120, 20], [40, 370], [200, 380], [110, 390]].map(([x, y], k) => tw(x, y, 5 + (k % 3) * 2, (k * .5) % 2))];
    }
    case 3: // jasmine falling past the card, a few petals resting at the bottom
      return [petal(40, 10, 0), petal(110, 0, .6), petal(180, 20, 1.2), petal(220, 70, 1.8), petal(20, 90, 2.4), petal(140, 50, 3), petal(80, 120, 3.5),
        front(`<g filter="url(#ds)">${[[30, 392, 0], [70, 396, 40], [190, 394, 20], [214, 388, 60]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(.9)">${[0, 72, 144, 216, 288].map((b) => `<path d="M0 0C-3.4 -3.4 -3.4 -10 0 -11.4C3.4 -10 3.4 -3.4 0 0Z" fill="url(#mPearl)" stroke="#8a6a8a" stroke-width=".9" transform="rotate(${b})"/>`).join('')}<circle r="2.2" fill="url(#mGold)"/></g>`).join('')}</g>`, [10, 370, 220, 34]),
        tw(200, 30, 6, 0), tw(36, 220, 5, 1.4), tw(212, 300, 5, .7)];
    case 4: { // rain of mercy: soft clouds along the top, gentle rain, a rainbow of light and green shoots at the bottom
      const sprout = (x: number, s: number) => `<g transform="translate(${x} 400) scale(${s})"><path d="M0 0C0 -10 0 -18 2 -26" stroke="#0a4a22" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M0 0C0 -10 0 -18 2 -26" stroke="#4ac85a" stroke-width="1.8" fill="none" stroke-linecap="round"/>${leafHQ(2, -22, -140, 16, 6)}${leafHQ(2, -18, -40, 14, 5)}</g>`;
      return [back(`<g filter="url(#b10)" opacity=".5">${fade(120, 120, 200, 150, '<path d="M-40 260A160 160 0 0 1 280 260" stroke="#ff9a9a" stroke-width="7" fill="none"/><path d="M-30 260A150 150 0 0 1 270 260" stroke="#ffe08a" stroke-width="7" fill="none"/><path d="M-20 260A140 140 0 0 1 260 260" stroke="#8ae8b0" stroke-width="7" fill="none"/><path d="M-10 260A130 130 0 0 1 250 260" stroke="#8ab8ff" stroke-width="7" fill="none"/>')}</g>`, [-80, 60, 400, 220], { anim: 'pulse' }),
        ...[[20, 30, 0], [60, 50, .5], [100, 24, 1], [140, 44, 1.5], [180, 30, .25], [220, 52, .75], [40, 70, 1.25], [200, 76, 1.75], [120, 64, .4], [80, 86, 1.1], [160, 90, 1.6]].map(([x, y, d]) => drop(x, y, d)),
        front(`<g transform="translate(0 -4) scale(1 -1)">${cloudBank([[-6, -14, 26], [30, -22, 32], [64, -14, 24], [92, -8, 16]], 0, '#e6f0ff')}</g>`, [-40, -10, 150, 60], { anim: 'bob' }),
        front(`<g transform="translate(0 -4) scale(1 -1)">${cloudBank([[150, -8, 16], [178, -16, 26], [210, -22, 32], [246, -14, 24]], 0, '#e6f0ff')}</g>`, [124, -10, 150, 60], { anim: 'bob', delay: 2 }),
        front(`<g filter="url(#ds)">${sprout(24, 1.1)}${sprout(52, .8)}${sprout(196, .9)}${sprout(220, 1.2)}</g>`, [0, 360, 240, 42], { anim: 'bloom', origin: [120, 400] })];
    }
    case 5: // lanterns rising out of a warm glow
      return [back(`<g filter="url(#b10)"><ellipse cx="120" cy="420" rx="170" ry="90" fill="url(#mHalo)"/></g>`, [-70, 300, 380, 220], { anim: 'pulse', origin: [120, 400] }),
        ...[[34, 380, 0, .46], [140, 424, 1.3, .34], [200, 392, 2.6, .46], [76, 424, 2, .34], [160, 424, .7, .36], [222, 414, 3.3, .3]].map(([x, y, d, s]) => { const k = s / .3;
          return front(`<g transform="translate(${x} ${y - 40 * k}) scale(${s})" filter="url(#ds)">${bigFanous(['mRedG', 'mAmberG', 'mTealG'])}</g><circle cx="${x}" cy="${y}" r="${16 * k}" fill="url(#mHalo)" filter="url(#b5)"/>`, [x - 22 * k, y - 44 * k, 44 * k, 70 * k], { anim: 'float', delay: d * 2 }); }),
        tw(40, 300, 5, 0), tw(210, 280, 5, 1.6), tw(120, 340, 4, .8)];
    case 6: // starfall: a night band across the top, stars, shooting stars crossing it
      return [back(fade(120, -40, 250, 130, `<rect x="-100" y="-120" width="440" height="300" fill="url(#mNight)" opacity=".6"/><g filter="url(#neb)" opacity=".3"><rect x="-100" y="-120" width="440" height="300" fill="#fff"/></g>`), [-100, -120, 440, 300]),
        back(stars(26, 1, 170), [0, 0, 240, 170], { anim: 'pulse' }), back(stars(20, 2, 170), [0, 0, 240, 170], { anim: 'pulse', delay: 1 }),
        shooting(150, 10, 70, 0), shooting(60, 60, 54, 1), shooting(190, 110, 48, 2), shooting(110, 30, 60, 3),
        tw(30, 40, 8, 0), tw(214, 70, 7, 1), tw(90, 120, 6, 1.6), tw(28, 340, 6, .4), tw(210, 360, 6, 1.2)];
    case 7: { // golden lattice over the card with rays from the top
      const lat = Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, k) => `<path d="${khatam(k * 60 - 30 + (r % 2) * 30, 10 + r * 56, 22)}" fill="none" stroke="url(#mGold)" stroke-width="2.2"/>`).join('')).join('');
      const rays = Array.from({ length: 9 }, (_, k) => `<path d="M120 -20L${-80 + k * 50} 420L${-60 + k * 50} 420Z" fill="url(#mBeam)" opacity=".28"/>`).join('');
      return [back(fade(120, 120, 220, 300, `<g filter="url(#b5)">${rays}</g>`), [-100, -40, 440, 480], { anim: 'pulse', origin: [120, -20] }),
        front(corners(`<g opacity=".55" filter="url(#bloom)">${lat}</g>`), [-40, -40, 320, 260], { anim: 'pulse', delay: 1 }),
        front(corners(`<g filter="url(#ds)">${lat}</g>`), [-40, -40, 320, 260], { anim: 'pulse' }),
        front(`<g filter="url(#ds)">${solid(khatam(120, 8, 16), 'mGold', GOLD_OL, 2, 2.4)}${gemHQ(120, 8, 6, 'mRuby')}</g>`, [96, -14, 48, 46], { anim: 'bob' }),
        tw(40, 40, 8, 0), tw(200, 60, 9, 1), tw(30, 300, 7, 3), tw(210, 340, 6, .5), up(60, 380, 2.2, 0), up(180, 380, 2.2, 2)];
    }
    case 8: { // aurora veils hanging along the top, crystal stars resting at the bottom
      const cur = (y: number, a: number, w: number) => `<path d="M-40 ${y}C20 ${y - a} 70 ${y + a} 120 ${y - a * .4}C170 ${y - a * 1.4} 220 ${y + a * .6} 280 ${y - a * .6}" stroke="url(#mAurora2)" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
      const curtain = (y: number) => `<g filter="url(#b5)">${cur(y, 34, 40)}${cur(y + 6, 30, 22)}</g><g filter="url(#b10)">${cur(y + 30, 26, 60)}</g>`;
      return [back(fade(120, 0, 200, 90, curtain(0)), [-80, -110, 400, 230], { anim: 'bob' }),
        back(fade(120, -10, 170, 70, `<g opacity=".8">${curtain(-14)}</g>`), [-80, -100, 400, 190], { anim: 'bob', delay: 2 }),
        front(corners(`<g opacity=".7">${curtain(30)}</g>`), [-80, -60, 400, 220], { anim: 'bob', delay: 1 }),
        back(stars(18, 3, 160), [0, 0, 240, 160], { anim: 'pulse', delay: .5 }),
        front(`<g filter="url(#ds)">${[[28, 384, 11], [66, 392, 7], [176, 392, 8], [214, 382, 12]].map(([x, y, r]) => solid(star(x, y, r, 6, .45), 'mCrystal', '#3a4a9a', 1.4, 1.8)).join('')}</g>`, [4, 358, 232, 46], { anim: 'pulse' }),
        tw(30, 30, 7, 0), tw(210, 40, 6, .9), up(80, 380, 1.8, 0, '#b8fff0'), up(170, 386, 1.8, 2, '#e8c8ff')];
    }
    case 9: { // roses climbing the lower corners, petals drifting down
      const roseHQ = (x: number, y: number, r: number) => `${sphere(x, y, r, 'mRose', '#7a0a34')}<path d="M${f(x - r * .5)} ${y}C${f(x - r * .5)} ${f(y - r * .6)} ${f(x + r * .5)} ${f(y - r * .6)} ${f(x + r * .45)} ${f(y + r * .1)}M${f(x - r * .25)} ${f(y + r * .1)}C${f(x - r * .2)} ${f(y - r * .3)} ${f(x + r * .25)} ${f(y - r * .25)} ${f(x + r * .2)} ${f(y + r * .2)}" stroke="#7a0a34" stroke-width="1.6" fill="none" opacity=".75"/>`;
      const vine = (s: number) => `<g transform="${s < 0 ? 'translate(240 0) scale(-1 1)' : ''}"><path d="M6 400C0 340 14 290 40 250" stroke="#0a4a22" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M6 400C0 340 14 290 40 250" stroke="#3ab84a" stroke-width="3.4" fill="none" stroke-linecap="round"/>${leafHQ(8, 330, 200, 22, 8)}${leafHQ(20, 290, 230, 20, 8)}${leafHQ(34, 262, 280, 18, 7)}${leafHQ(30, 380, 330, 24, 9)}${roseHQ(40, 248, 13)}${roseHQ(16, 356, 18)}${roseHQ(44, 384, 14)}</g>`;
      return [back(`<g filter="url(#b10)">${halo(30, 360, 70, 'mHaloR')}${halo(210, 360, 70, 'mHaloR')}</g>`, [-60, 270, 360, 180], { anim: 'pulse' }),
        front(`<g filter="url(#ds)">${vine(1)}</g>`, [-8, 230, 80, 172], { anim: 'bloom', origin: [6, 400] }),
        front(`<g filter="url(#ds)">${vine(-1)}</g>`, [168, 230, 80, 172], { anim: 'bloom', delay: 2, origin: [234, 400] }),
        rosePetal(60, 10, 0), rosePetal(150, 0, .9), rosePetal(210, 40, 1.8), rosePetal(100, 60, 2.7), rosePetal(30, 120, 3.4),
        tw(200, 30, 6, 0), tw(120, 20, 5, 1.2)];
    }
    case 10: { // the Night of Qadr over the whole card: nebula sky, beams, moon, clouds at the bottom, shooting stars
      const beam = (x: number, w: number, s2: number) => `<path d="M${x - w} -24L${x + w} -24L${f(x + w * 2.6 + s2 * 400)} 420L${f(x - w * 2.6 + s2 * 400)} 420Z" fill="url(#mBeam)"/>`;
      return [back(fade(120, -40, 260, 130, `<rect x="-100" y="-120" width="440" height="420" fill="url(#mSky)" opacity=".45"/><g filter="url(#neb)" opacity=".35"><rect x="-100" y="-120" width="440" height="420" fill="#fff"/></g>`), [-100, -120, 440, 420]),
        back(stars(30, 1, 260), [0, 0, 240, 260], { anim: 'pulse' }), back(stars(24, 2, 260), [0, 0, 240, 260], { anim: 'pulse', delay: 1 }),
        back(fade(120, 160, 220, 300, `<g filter="url(#b5)" opacity=".28">${beam(120, 20, 0)}${beam(50, 12, -.12)}${beam(190, 12, .12)}</g>`), [-100, -40, 440, 480], { anim: 'pulse', origin: [120, -24] }),
        back(`<g filter="url(#b10)">${halo(196, 50, 52)}</g><g filter="url(#bloom)">${bigMoon(196, 50, 30, -14, -10, 26)}</g>`, [136, -10, 120, 120], { anim: 'bob' }),
        shooting(40, 30, 54, 0), shooting(150, 140, 44, 2),
        front(`<g filter="url(#ds)">${cloudBank([[6, 378, 22], [40, 360, 32], [82, 372, 24], [124, 380, 18]], 402, '#ffe9a8')}</g>`, [-24, 320, 172, 86], { anim: 'bob' }),
        front(`<g filter="url(#ds)">${cloudBank([[128, 382, 18], [162, 362, 30], [202, 356, 34], [238, 372, 22]], 404, '#ffe9a8')}</g>`, [100, 314, 166, 92], { anim: 'bob', delay: 2 }),
        ...[30, 80, 130, 180, 220].map((x, k) => up(x, 340, 2.4, k * .8)),
        tw(40, 120, 8, 0), tw(200, 200, 7, 1), tw(100, 40, 6, 2), tw(150, 260, 6, 3)];
    }
    case 11: { // lantern festival: a garland of fanous along the top swaying, string lights, fireworks of light, motes
      const garland = `<path d="M-20 10Q60 40 120 18Q180 40 260 10" stroke="${GOLD_OL}" stroke-width="3.4" fill="none"/><path d="M-20 10Q60 40 120 18Q180 40 260 10" stroke="url(#mGold)" stroke-width="1.6" fill="none"/>`;
      const bulbs = [[10, 18], [36, 27], [84, 30], [156, 30], [204, 27], [230, 18], [120, 20]].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="7" fill="url(#mHalo)"/><circle cx="${x}" cy="${y}" r="2.6" fill="${k % 2 ? '#ffe08a' : '#8af0e0'}"/>`).join('');
      const hang = (x: number, y: number, s: number, g: [string, string, string], d: number) => front(`<path d="M${x} ${y - 30}V${y}" stroke="${GOLD_OL}" stroke-width="1.6"/><g transform="translate(${x} ${y}) scale(${s})" filter="url(#ds)">${bigFanous(g)}</g><circle cx="${x}" cy="${y + 40 * s}" r="${30 * s}" fill="url(#mHalo)" opacity=".7"/>`, [x - 50 * s - 4, y - 32, 100 * s + 8, 32 + 150 * s], { anim: 'sway', delay: d, origin: [x, y - 30] });
      return [back(`<g filter="url(#b10)"><ellipse cx="120" cy="10" rx="170" ry="70" fill="url(#mHalo)" opacity=".7"/></g>`, [-70, -80, 380, 180], { anim: 'pulse' }),
        firework(30, 190, 30, '#ffd36b', '#ff9ad0', 0), firework(212, 170, 34, '#8af0e0', '#ffe08a', 1), firework(206, 300, 24, '#ffd36b', '#b8a0ff', 1.5),
        front(`${garland}<g filter="url(#b2)">${bulbs}</g>${bulbs}`, [-24, 0, 288, 44], { anim: 'pulse' }),
        hang(26, 38, .5, ['mRedG', 'mAmberG', 'mTealG'], 0), hang(214, 38, .5, ['mTealG', 'mAmberG', 'mRedG'], 1), hang(62, 40, .34, ['mVioletG', 'mAmberG', 'mTealG'], 2), hang(178, 40, .34, ['mAmberG', 'mRedG', 'mTealG'], 3),
        back(`<g filter="url(#b10)"><ellipse cx="120" cy="430" rx="170" ry="80" fill="url(#mHalo)"/></g>`, [-70, 330, 380, 190], { anim: 'pulse', delay: 1 }),
        ...[20, 64, 110, 156, 200, 230].map((x, k) => up(x, 384 - (k % 2) * 20, 2.2, k * .6, k % 2 ? '#8af0e0' : '#fff1a8')),
        tw(20, 90, 7, 0), tw(224, 210, 7, 1.4), tw(30, 300, 6, .7), tw(214, 330, 6, 2)];
    }
    case 12: { // celestial orbit: a ringed planet, gems orbiting the card's centre on a tilted ring, a nebula behind
      const planet = `${sphere(212, 30, 22, 'mVioletG', '#2a0a5a')}<g filter="url(#b2)" opacity=".5"><ellipse cx="212" cy="30" rx="40" ry="9" fill="none" stroke="#fff" stroke-width="3" transform="rotate(-18 212 30)"/></g><path d="M174 39A40 9 -18 0 0 250 21" stroke="${GOLD_OL}" stroke-width="5" fill="none"/><path d="M174 39A40 9 -18 0 0 250 21" stroke="url(#mGold)" stroke-width="2.8" fill="none"/>`;
      const ring = (k: number, r: number, g: string) => { const a = (k * Math.PI) / 3; return gemHQ(Math.round(120 + 100 * Math.cos(a)), Math.round(140 + 100 * Math.sin(a)), r, g); };
      const gems = [0, 1, 2, 3, 4, 5].map((k) => ring(k, k % 2 ? 6 : 8, ['mRuby', 'mSapph', 'mEmerald'][k % 3])).join('');
      return [back(fade(120, 200, 200, 230, `<rect x="-100" y="-40" width="440" height="480" fill="url(#mSky)" opacity=".18"/><g filter="url(#neb)" opacity=".22"><rect x="-100" y="-40" width="440" height="480" fill="#fff"/></g>`), [-100, -40, 440, 480], { anim: 'pulse' }),
        back(stars(30, 4, 400), [0, 0, 240, 400], { anim: 'pulse', delay: 1 }),
        back(`<g filter="url(#b5)" opacity=".7"><circle cx="120" cy="140" r="100" fill="none" stroke="url(#mAurora2)" stroke-width="5"/></g><circle cx="120" cy="140" r="100" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="2 8" opacity=".6"/>`, [0, 20, 240, 240], { anim: 'orbitSlow', origin: [120, 140] }),
        front(`<g filter="url(#ds)">${gems}</g>`, [6, 26, 228, 228], { anim: 'orbit', origin: [120, 140] }),
        back(`<g filter="url(#b10)">${halo(212, 30, 46, 'mHaloB')}</g><g filter="url(#ds)">${planet}</g>`, [150, -30, 120, 120], { anim: 'bob' }),
        front(`<g filter="url(#ds)">${sphere(34, 360, 14, 'mCobalt', '#0a1f6a')}${sphere(58, 380, 7, 'mPearl', '#6a5a8a')}</g>`, [14, 340, 56, 52], { anim: 'bob', delay: 2 }),
        shooting(40, 20, 50, 1), tw(30, 120, 7, 0), tw(214, 300, 7, 1.2), tw(120, 20, 6, 2.4), up(90, 390, 2, 0, '#c8e4ff'), up(170, 390, 2, 2, '#e8c8ff')];
    }
  }
  return [];
}

/** A profile effect at `width` px over a 240 × 400 card, laid over the whole card like Discord's (it never takes a tap);
 *  `live` moves it. */
export function effectLayer(n: number, width: number, live = false): HTMLElement | null {
  if (!FX[n]) return null;
  const el = stage(effectPieces(n), `fx${n}`, width, FX_W, FX_H, live);
  el.classList.add('dk-fx');
  el.setAttribute('aria-hidden', 'true');
  return el;
}
