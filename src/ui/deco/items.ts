// Shop items beyond frames at the approved illustrated level (docs/item-art.md): held items, outfits, room pieces and
// profile effects, one per rarity as the examples the owner asked for (2026-11-24, "normal to mythic"). Same pieces as
// the frames: drawn once, moved by CSS transform / opacity. Items sit in a 240 box; profile effects in 240 × 400.
import { f, khatam, star } from './art';
import type { Piece } from './frames';
import { CLOUD_OL, GOLD_OL, bigFanous, bigMoon, cloudBank, halo, id, mote, tw } from './hq';
import { P, at, gemHQ, leafHQ, solid, sphere } from './hqframes';

const back = (svg: string, box?: [number, number, number, number], extra: Partial<Piece> = {}): Piece => ({ z: 'back', svg, box, ...extra });
const front = (svg: string, box?: [number, number, number, number], extra: Partial<Piece> = {}): Piece => ({ z: 'front', svg, box, ...extra });
const glow = (grad: string, r: number, x = 120, y = 130): Piece => back(`<g filter="url(#b10)">${halo(x, y, r, grad)}</g>`, [x - r - 24, y - r - 24, 2 * r + 48, 2 * r + 48], { anim: 'pulse', origin: [x, y] });
const floor = (w = 70, y = 216) => back(`<ellipse cx="120" cy="${y}" rx="${w}" ry="${w * .16}" fill="#000" opacity=".35" filter="url(#b5)"/>`);
const smoke = (x: number, y: number, d: number): Piece => back(`<path d="M${x} ${y}C${x - 8} ${y - 10} ${x + 8} ${y - 20} ${x} ${y - 30}C${x - 8} ${y - 40} ${x + 6} ${y - 48} ${x} ${y - 56}" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".5" filter="url(#b2)"/>`, [x - 14, y - 60, 28, 64], { anim: 'rise', delay: d });

export type ItemKey = `${'hold' | 'outfit' | 'room' | 'fx'}:${'common' | 'rare' | 'epic' | 'legendary' | 'mythic'}`;

/** A cloak on a gold hanger: body colour, lining, trim. */
function cloak(body: string, bodyOl: string, lining: string, trim: string, trimOl: string): string {
  const d = 'M120 52C92 56 64 62 52 78L28 226Q120 240 212 226L188 78C176 62 148 56 120 52Z';
  return `<path d="M120 18C112 18 110 30 120 34" stroke="${GOLD_OL}" stroke-width="4.4" fill="none" stroke-linecap="round"/><path d="M120 18C112 18 110 30 120 34" stroke="url(#mGold)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  ${solid('M120 34L54 66Q50 72 58 72H182Q190 72 186 66Z', 'mWood', '#4a2408', 1.6, 2)}
  ${solid(d, body, bodyOl, 4, 3.2)}
  ${solid('M110 58L94 228H146L130 58Z', lining, bodyOl, 2, 2)}
  <path d="M110 58L94 228M130 58L146 228" stroke="${trimOl}" stroke-width="9" stroke-linecap="round"/><path d="M110 58L94 228M130 58L146 228" stroke="url(#${trim})" stroke-width="5.6" stroke-linecap="round"/>
  <path d="M30 224Q120 238 210 224" stroke="${trimOl}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M30 224Q120 238 210 224" stroke="url(#${trim})" stroke-width="5.6" fill="none" stroke-linecap="round"/>
  <path d="M70 90L48 206" stroke="#fff" stroke-width="3.4" opacity=".35" stroke-linecap="round" filter="url(#b2)"/><path d="M84 80C96 72 108 66 116 62" stroke="#fff" stroke-width="2.6" opacity=".6" fill="none" stroke-linecap="round"/>`;
}

export function itemPieces(key: ItemKey): Piece[] {
  switch (key) {
    // ── Held items ─────────────────────────────────────────────────────────────
    case 'hold:common': { // misbaha: 33 wooden beads, a gold divider and a tassel
      const beads = Array.from({ length: 33 }, (_, k) => { const a = (k / 33) * Math.PI * 2 - Math.PI / 2; return sphere(120 + Math.cos(a) * 62, 104 + Math.sin(a) * 50, 6.2, k % 11 === 0 ? 'mGold' : 'mWood', '#3a1a06'); }).join('');
      return [floor(60), front(`<g filter="url(#ds)">${beads}<path d="M120 154V176" stroke="#3a1a06" stroke-width="3"/>${sphere(120, 166, 7, 'mGold', GOLD_OL)}${solid('M112 176H128L134 214H106Z', 'mRuby', '#5a0420', 2, 2.2)}<path d="M112 186L110 212M120 186V212M128 186L130 212" stroke="#5a0420" stroke-width="1.2" opacity=".6"/></g>`), tw(184, 60, 6, 0)];
    }
    case 'hold:rare': { // a bowl of dates in blue glaze
      const date = (x: number, y: number, a: number) => `<g transform="translate(${x} ${y}) rotate(${a})">${solid('M-13 0C-13 -8 -6 -10 0 -10C6 -10 13 -8 13 0C13 8 6 10 0 10C-6 10 -13 8 -13 0Z', 'mBronze', '#3a1406', 2, 2)}<path d="M-8 -4C-4 -7 2 -7 6 -5" stroke="#fff" stroke-width="1.6" opacity=".6" fill="none"/></g>`;
      return [glow('mHaloB', 70, 120, 140), floor(74),
        front(`<g filter="url(#ds)">${date(84, 118, -20)}${date(108, 108, 10)}${date(134, 110, -6)}${date(158, 120, 24)}${date(98, 128, 30)}${date(122, 124, -14)}${date(146, 130, 8)}${leafHQ(150, 104, -40, 34, 9)}
          ${solid('M44 132H196C196 176 164 204 120 204C76 204 44 176 44 132Z', 'mCobalt', '#0a1a5a', 4, 3)}${solid('M40 126H200V138H40Z', 'mGlaze', '#0a1a5a', 1.6, 2.4)}
          ${[70, 100, 140, 170].map((x) => `<path d="${star(x, 166, 7, 8, .5)}" fill="#fff" opacity=".85"/>`).join('')}<path d="M60 150C64 170 78 186 96 194" stroke="#fff" stroke-width="3" opacity=".45" fill="none" stroke-linecap="round"/>${solid('M100 204H140L136 214H104Z', 'mCobalt', '#0a1a5a', 1, 2)}</g>`),
        tw(190, 90, 7, 0), tw(52, 104, 5, 1.4)];
    }
    case 'hold:epic': // a lit fanous swinging, its light breathing
      return [glow('mHalo', 96, 120, 140), floor(50, 226),
        front(`<g transform="translate(120 4) scale(1.42)" filter="url(#ds)">${bigFanous(['mRedG', 'mAmberG', 'mTealG'])}</g>`, [70, 0, 100, 202], { anim: 'sway', origin: [120, 4] }),
        tw(58, 80, 7, 0), tw(186, 120, 6, 1.3), mote(80, 210, 2.2, 0), mote(160, 214, 2, 2)];
    case 'hold:legendary': { // a gold mabkhara with incense smoke curling up
      const body = `${solid('M84 214H156L148 200H92Z', 'mGoldD', GOLD_OL, 1.6, 2.4)}${solid('M96 200H144L136 150H104Z', 'mGold', GOLD_OL, 3, 2.8)}
        ${solid('M76 150H164L156 120H84Z', 'mGold', GOLD_OL, 3, 2.8)}${[96, 112, 128, 144].map((x) => `<path d="M${x - 4} 144V128Q${x} 122 ${x + 4} 128V144Z" fill="#5a2406"/>`).join('')}
        ${solid('M88 120C88 92 104 78 120 74C136 78 152 92 152 120Z', 'mGold', GOLD_OL, 3, 2.8)}${[100, 120, 140].map((x) => `<path d="${star(x, 104, 5, 8, .5)}" fill="#5a2406"/>`).join('')}
        ${solid('M114 74L120 56L126 74Z', 'mGold', GOLD_OL, 1.4, 2)}${sphere(120, 54, 5, 'mRuby', '#5a0420')}${gemHQ(120, 176, 8, 'mRuby')}`;
      return [glow('mHalo', 104, 120, 120), floor(64), smoke(110, 70, 0), smoke(130, 64, 1.3), smoke(120, 70, 2.6),
        front(`<g filter="url(#bloom)"><g filter="url(#ds)">${body}</g></g>`), tw(60, 70, 8, 0), tw(184, 100, 7, 1), tw(70, 170, 5, 2), tw(180, 180, 5, 3), mote(70, 210, 2, .5), mote(170, 210, 2, 2.5)];
    }
    case 'hold:mythic': { // a carved rahl holding a closed book that gives off light, a khatam halo turning behind
      const rahl = `${solid('M66 216L174 136L184 146L76 226Z', 'mWood', '#3a1606', 2.4, 2.6)}${solid('M174 216L66 136L56 146L164 226Z', 'mWood', '#3a1606', 2.4, 2.6)}<path d="M100 172L140 172" stroke="#3a1606" stroke-width="3"/>`;
      const book = `${solid('M58 132L120 150L182 132L176 104L120 120L64 104Z', 'mEmerald', '#05301e', 2.4, 2.8)}${solid('M64 104L120 120L176 104L170 96L120 110L70 96Z', 'mPearl', '#6a5a8a', 1.4, 2)}<path d="${khatam(91, 120, 8)}" fill="url(#mGold)" stroke="${GOLD_OL}" stroke-width="1.2"/><path d="${khatam(149, 120, 8)}" fill="url(#mGold)" stroke="${GOLD_OL}" stroke-width="1.2"/><path d="M120 120V150" stroke="${GOLD_OL}" stroke-width="2"/>`;
      const rays = Array.from({ length: 16 }, (_, k) => `<path d="M120 100L${P(...at(150, k * 22.5 - 4, 120, 100))}L${P(...at(150, k * 22.5 + 4, 120, 100))}Z" fill="#ffe7a0" opacity=".16"/>`).join('');
      return [back(`<g filter="url(#b5)">${rays}</g>`, [-30, -50, 300, 300], { anim: 'orbitSlow', origin: [120, 100] }),
        back(`<g filter="url(#b10)">${halo(120, 100, 110, 'mHaloV')}</g>`, [-14, -34, 268, 268], { anim: 'pulse', origin: [120, 100] }),
        back(`<path d="${khatam(120, 100, 64)}" fill="none" stroke="url(#mGold)" stroke-width="3"/><path d="${khatam(120, 100, 56)}" fill="none" stroke="#fff3c0" stroke-width="1.2" opacity=".7"/>`, [50, 30, 140, 140], { anim: 'orbit', origin: [120, 100] }),
        floor(70, 226), front(`<g filter="url(#ds)">${rahl}</g>`),
        back(`<g filter="url(#b10)">${halo(120, 100, 50)}</g>`, [46, 26, 148, 148], { anim: 'pulse', delay: 1, origin: [120, 100] }),
        front(`<g filter="url(#bloom)"><g filter="url(#ds)">${book}</g></g>`, [40, 80, 160, 80], { anim: 'bob' }),
        tw(40, 40, 9, 0), tw(200, 50, 8, 1), tw(210, 170, 6, 2), tw(28, 160, 6, 3), tw(120, 14, 7, 1.6),
        mote(60, 220, 2.4, 0), mote(100, 226, 2, 1), mote(140, 224, 2.6, 2), mote(180, 222, 2, 3)];
    }
    // ── Outfits ───────────────────────────────────────────────────────────────
    case 'outfit:common': // a white kufi
      return [floor(70, 190), front(`<g filter="url(#ds)">${solid('M52 168C52 112 84 84 120 84C156 84 188 112 188 168Z', 'mPearl', '#5a4a7a', 4, 3)}${solid('M48 160H192V178H48Z', 'mGlaze', '#5a4a7a', 1.6, 2.4)}
        ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 9 - r }, (_, k) => `<circle cx="${f(72 + r * 6 + k * 12)}" cy="${f(150 - r * 14)}" r="1.8" fill="#8a7aa8" opacity=".6"/>`).join('')).join('')}<path d="M70 132C78 108 98 94 116 92" stroke="#fff" stroke-width="4" opacity=".8" fill="none" stroke-linecap="round"/></g>`), tw(184, 100, 6, 0)];
    case 'outfit:rare': { // an embroidered teal vest
      const d = 'M120 60L84 56C70 60 62 72 60 90L58 214H112L120 100L128 214H182L180 90C178 72 170 60 156 56Z';
      return [glow('mHaloT', 80), floor(70, 222), front(`<g filter="url(#ds)">${solid('M120 30C112 30 110 42 120 46', 'mGold', GOLD_OL, 1, 1)}${solid('M120 46L60 72Q56 78 64 78H176Q184 78 180 72Z', 'mWood', '#4a2408', 1.6, 2)}${solid(d, 'mTealG', '#063a3a', 3.4, 3)}
        <path d="M84 56C92 80 108 92 120 100M156 56C148 80 132 92 120 100M112 100L112 214M128 100L128 214" stroke="url(#mGold)" stroke-width="3" fill="none"/>
        ${[80, 160].map((x) => `<path d="M${x - 14} 160C${x - 6} 150 ${x + 6} 150 ${x + 14} 160C${x + 6} 170 ${x - 6} 170 ${x - 14} 160Z" fill="none" stroke="url(#mGold)" stroke-width="2.4"/><path d="${star(x, 160, 5, 8, .5)}" fill="url(#mGold)"/>`).join('')}
        ${[112, 136, 160, 184].map((y) => sphere(108, y, 3, 'mGold', GOLD_OL)).join('')}</g>`), tw(190, 70, 6, 0), tw(46, 130, 5, 1.3)];
    }
    case 'outfit:epic': // a navy night bisht with gold trim, swaying
      return [glow('mHaloB', 96), floor(84, 232), front(`<g filter="url(#ds)">${cloak('mNightB', '#0a0a3a', 'mCobalt', 'mGold', GOLD_OL)}</g>`, undefined, { anim: 'sway', origin: [120, 18] }), tw(200, 60, 7, 0), tw(36, 110, 6, 1.4), tw(206, 190, 5, 2.4)];
    case 'outfit:legendary': // a royal gold bisht, glowing trim, sparkles
      return [glow('mHalo', 116), floor(84, 232), front(`<g filter="url(#bloom)"><g filter="url(#ds)">${cloak('mGold', GOLD_OL, 'mRuby', 'mPearl', '#6a5a8a')}</g></g>`, undefined, { anim: 'sway', origin: [120, 18] }),
        front(`<g filter="url(#ds)">${gemHQ(108, 96, 6, 'mRuby')}${gemHQ(132, 96, 6, 'mRuby')}<path d="M108 96Q120 104 132 96" stroke="url(#mPearl)" stroke-width="2.4" fill="none"/></g>`, [90, 80, 60, 32], { anim: 'sway', origin: [120, 18] }),
        tw(204, 50, 9, 0), tw(30, 90, 7, 1), tw(214, 170, 6, 2), tw(26, 200, 6, 3), mote(60, 226, 2.2, 0), mote(180, 226, 2.2, 2)];
    case 'outfit:mythic': { // a starlight cloak: the night sky inside it, stars twinkling in the cloth, aurora trim
      const d = 'M120 52C92 56 64 62 52 78L28 226Q120 240 212 226L188 78C176 62 148 56 120 52Z', c = id('sc');
      const starsIn = (s: number) => Array.from({ length: 26 }, (_, k) => { const x = 40 + ((k * 61 + s * 29) % 160), y = 80 + ((k * 37 + s * 17) % 140); return `<circle cx="${x}" cy="${y}" r="${k % 6 ? 1 : 2}" fill="#fff"/>`; }).join('');
      return [back(`<g filter="url(#b10)">${halo(120, 130, 120, 'mHaloV')}</g>`, [-24, -14, 288, 288], { anim: 'pulse', origin: [120, 130] }), floor(84, 234),
        front(`<g filter="url(#ds)">${cloak('mVioletG', '#1a0a4a', 'mNightB', 'mAurora2', '#1a0a4a')}</g><defs><clipPath id="${c}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c})"><g filter="url(#neb)" opacity=".85"><rect x="0" y="40" width="240" height="200" fill="#fff"/></g></g>`, undefined, { anim: 'sway', origin: [120, 18] }),
        front(`<defs><clipPath id="${c}b"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c}b)">${starsIn(1)}</g>`, undefined, { anim: 'pulse' }),
        front(`<defs><clipPath id="${c}c"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c}c)">${starsIn(2)}</g>`, undefined, { anim: 'pulse', delay: 1 }),
        tw(200, 40, 9, 0, '#e8dcff'), tw(30, 80, 7, 1, '#e8dcff'), tw(220, 160, 7, 2, '#e8dcff'), tw(20, 200, 6, 3, '#e8dcff'), tw(120, 10, 6, 1.5, '#e8dcff'),
        mote(50, 226, 2.4, 0, '#e8dcff'), mote(100, 232, 2, 1, '#e8dcff'), mote(150, 230, 2.4, 2, '#e8dcff'), mote(194, 226, 2, 3, '#e8dcff')];
    }
    // ── Room pieces ───────────────────────────────────────────────────────────
    case 'room:common': // a majlis floor cushion with tassels
      return [floor(96, 206), front(`<g filter="url(#ds)">${solid('M30 196C26 170 40 150 70 148H170C200 150 214 170 210 196C206 210 190 214 170 214H70C50 214 34 210 30 196Z', 'mRedG', '#5a0420', 4, 3)}
        <path d="M44 180H196" stroke="url(#mGold)" stroke-width="4"/><path d="M44 180H196" stroke="${GOLD_OL}" stroke-width="1" opacity=".5"/>${[70, 100, 140, 170].map((x) => `<path d="${star(x, 166, 6, 8, .5)}" fill="url(#mGold)"/>`).join('')}
        ${[[28, 196], [212, 196]].map(([x, y]) => `${sphere(x, y, 5, 'mGold', GOLD_OL)}${solid(`M${x - 5} ${y + 4}H${x + 5}L${x + 7} ${y + 22}H${x - 7}Z`, 'mGold', GOLD_OL, 1, 1.6)}`).join('')}<path d="M50 160C70 152 100 150 130 150" stroke="#fff" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round"/></g>`)];
    case 'room:rare': { // a potted palm in a blue pot
      const fronds = [[-160, 70], [-130, 76], [-95, 72], [-60, 74], [-25, 68], [-185, 56], [5, 56]].map(([a, L]) => leafHQ(120, 96, a, L, 13)).join('');
      return [floor(60, 222), front(`<g filter="url(#ds)"><path d="M120 170C118 140 120 116 120 96" stroke="#3a1a06" stroke-width="9"/><path d="M120 170C118 140 120 116 120 96" stroke="url(#mWood)" stroke-width="5"/>${fronds}
        ${solid('M78 164H162L150 220H90Z', 'mCobalt', '#0a1a5a', 3, 2.8)}${solid('M72 156H168V170H72Z', 'mGlaze', '#0a1a5a', 1.4, 2.4)}<path d="M92 176L98 214" stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round"/>${[104, 120, 136].map((x) => `<path d="${star(x, 194, 6, 8, .5)}" fill="#fff" opacity=".85"/>`).join('')}</g>`), tw(190, 60, 6, 0)];
    }
    case 'room:epic': { // an arched mashrabiya window with moonlight pouring in
      const lattice = Array.from({ length: 6 }, (_, r) => Array.from({ length: 5 }, (_, k) => `<path d="${khatam(76 + k * 22, 82 + r * 24, 8)}" fill="none" stroke="#3a1a06" stroke-width="2.4"/>`).join('')).join('');
      return [glow('mHaloB', 96, 120, 120), back(`<path d="M70 40L30 236H210L170 40Z" fill="url(#mBeam)" opacity=".45" filter="url(#b5)"/>`, undefined, { anim: 'pulse', origin: [120, 40] }),
        front(`<g filter="url(#ds)">${solid('M52 214V100C52 58 84 28 120 18C156 28 188 58 188 100V214Z', 'mWood', '#3a1606', 3.4, 3)}<path d="M64 206V102C64 68 90 44 120 34C150 44 176 68 176 102V206Z" fill="#1a1050"/>
          <path d="M64 206V102C64 68 90 44 120 34C150 44 176 68 176 102V206Z" fill="url(#mHaloB)" opacity=".7"/>${bigMoon(146, 70, 13, -6, -4, 11)}<g clip-path="none">${lattice}</g>${solid('M44 208H196V224H44Z', 'mWood', '#3a1606', 1.6, 2.6)}</g>`), tw(146, 50, 6, 0, '#e8f6ff'), tw(90, 90, 4, 1.4, '#e8f6ff')];
    }
    case 'room:legendary': { // a tiered marble fountain with water arcing and sparkling
      const water = `<path d="M120 60C100 60 86 78 82 102M120 60C140 60 154 78 158 102M120 110C96 112 70 130 64 158M120 110C144 112 170 130 176 158" stroke="#bffaf2" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/><path d="M120 60C100 60 86 78 82 102M120 60C140 60 154 78 158 102" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      return [glow('mHaloT', 110, 120, 140), floor(90, 222),
        front(`<g filter="url(#ds)">${solid('M30 172H210C206 202 170 216 120 216C70 216 34 202 30 172Z', 'mGlaze', '#2a3a5a', 3, 3)}${solid('M36 166H204V178H36Z', 'mWater', '#0a4a5a', 1.4, 2)}
          ${solid('M112 112H128V170H112Z', 'mGlaze', '#2a3a5a', 1.6, 2.4)}${solid('M74 104H166C162 120 144 128 120 128C96 128 78 120 74 104Z', 'mGlaze', '#2a3a5a', 2.4, 2.6)}${solid('M78 100H162V108H78Z', 'mWater', '#0a4a5a', 1, 1.6)}
          ${solid('M116 62H124V102H116Z', 'mGlaze', '#2a3a5a', 1, 2)}${sphere(120, 58, 7, 'mGold', GOLD_OL)}${[60, 100, 140, 180].map((x) => `<path d="${star(x, 196, 6, 8, .5)}" fill="url(#mTealG)" stroke="#0a4a5a" stroke-width="1"/>`).join('')}</g>`),
        front(`<g filter="url(#b2)">${water}</g>${water}`, undefined, { anim: 'pulse', origin: [120, 110] }),
        tw(84, 104, 5, 0, '#e0fffa'), tw(158, 104, 5, 1, '#e0fffa'), tw(64, 160, 6, 2, '#e0fffa'), tw(176, 160, 6, 3, '#e0fffa'), tw(200, 60, 7, .5), mote(90, 170, 1.8, 0, '#c8fff6'), mote(150, 170, 1.8, 2, '#c8fff6')];
    }
    case 'room:mythic': { // a golden arch opening onto the night: moon, falling stars, a floating lantern, light pouring in
      const arch = solid('M10 236V110C10 50 60 10 120 -4C180 10 230 50 230 110V236H204V112C204 66 168 34 120 22C72 34 36 66 36 112V236Z', 'mGold', GOLD_OL, 3.4, 3);
      return [back(`<path d="M36 236V112C36 66 72 34 120 22C168 34 204 66 204 112V236Z" fill="#120a3a"/><g filter="url(#neb)" opacity=".9"><path d="M36 236V112C36 66 72 34 120 22C168 34 204 66 204 112V236Z" fill="#fff"/></g>${Array.from({ length: 30 }, (_, k) => `<circle cx="${50 + ((k * 61) % 140)}" cy="${40 + ((k * 43) % 170)}" r="${k % 5 ? .9 : 1.6}" fill="#fff"/>`).join('')}`, [0, -10, 240, 250]),
        back(`<g filter="url(#b10)">${halo(160, 70, 50)}</g><g filter="url(#bloom)">${bigMoon(160, 70, 26, -12, -8, 22)}</g>`, [100, 10, 120, 120], { anim: 'bob' }),
        front(`<path d="M0 0L40 16" stroke="url(#mBeam)" stroke-width="3" stroke-linecap="round" transform="rotate(180 20 8)"/><circle cx="40" cy="16" r="2.4" fill="#fff"/>`, [70, 50, 46, 22], { anim: 'shoot' }),
        front(`<path d="M0 0L30 12" stroke="url(#mBeam)" stroke-width="2.4" stroke-linecap="round" transform="rotate(180 15 6)"/><circle cx="30" cy="12" r="2" fill="#fff"/>`, [120, 120, 36, 18], { anim: 'shoot', delay: 2 }),
        front(`<g filter="url(#ds)">${arch}${[[23, 140], [217, 140], [120, 8]].map(([x, y]) => `${solid(khatam(x, y, 9), 'mGold', GOLD_OL, 1.4, 1.8)}${sphere(x, y, 3.4, 'mTealG', '#0a3a4a')}`).join('')}${solid('M0 226H240V244H0Z', 'mGold', GOLD_OL, 2, 2.6)}</g>`, [-8, -14, 256, 262]),
        front(`<g transform="translate(74 70) scale(.55)" filter="url(#ds)">${bigFanous(['mTealG', 'mAmberG', 'mRedG'])}</g>`, [54, 68, 40, 80], { anim: 'bob', delay: 1 }),
        front(`<g filter="url(#b10)">${halo(74, 120, 26)}</g>`, [40, 86, 68, 68], { anim: 'pulse', origin: [74, 120] }),
        tw(120, -2, 9, 0), tw(20, 60, 6, 1), tw(220, 60, 6, 2), mote(70, 220, 2.2, 0), mote(120, 224, 2, 1.3), mote(170, 220, 2.2, 2.6)];
    }
    // ── Profile effects (whole card, 240 × 400) ───────────────────────────────
    case 'fx:common': // dust of light drifting up
      return [40, 80, 120, 160, 200, 60, 140, 180].map((x, k) => ({ ...mote(x, 380 - (k % 3) * 40, 1.8 + (k % 3) * .4, k * .5), z: 'front' as const }));
    case 'fx:rare': { // jasmine petals falling
      const petal = (x: number, y: number, d: number): Piece => front(`<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<path d="M0 0C-3 -3 -3 -9 0 -10C3 -9 3 -3 0 0Z" fill="url(#mPearl)" stroke="#8a6a8a" stroke-width=".8" transform="rotate(${a})"/>`).join('')}<circle r="2" fill="url(#mGold)"/></g>`, [x - 12, y - 12, 24, 24], { anim: 'fall', delay: d, origin: [x, y] });
      return [petal(60, 10, 0), petal(150, 0, .7), petal(210, 30, 1.4), petal(30, 60, 2.1), petal(120, 40, 2.8), petal(190, 90, 3.4), tw(200, 30, 5, 0), tw(40, 200, 4, 2)];
    }
    case 'fx:epic': // lanterns rising out of a warm glow at the bottom
      return [back(`<g filter="url(#b10)"><ellipse cx="120" cy="420" rx="160" ry="90" fill="url(#mHalo)"/></g>`, [-60, 300, 360, 220], { anim: 'pulse', origin: [120, 400] }),
        ...[[50, 380, 0, .3], [130, 400, 1.3, .36], [200, 390, 2.6, .28], [90, 420, 2, .22]].map(([x, y, d, s]) => front(`<g transform="translate(${x} ${y - 40}) scale(${s})">${bigFanous(['mRedG', 'mAmberG', 'mTealG'])}</g><circle cx="${x}" cy="${y}" r="16" fill="url(#mHalo)" filter="url(#b5)"/>`, [x - 22, y - 44, 44, 70], { anim: 'rise', delay: d })),
        tw(40, 300, 5, 0), tw(210, 280, 5, 1.6)];
    case 'fx:legendary': { // a golden geometric lattice shimmering over the card, rays from the top
      const lat = Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, k) => `<path d="${khatam(30 + k * 60 + (r % 2) * 30, 20 + r * 60, 24)}" fill="none" stroke="url(#mGold)" stroke-width="2"/>`).join('')).join('');
      const rays = Array.from({ length: 9 }, (_, k) => `<path d="M120 -20L${-80 + k * 50} 420L${-60 + k * 50} 420Z" fill="url(#mBeam)" opacity=".3"/>`).join('');
      return [back(`<g filter="url(#b5)">${rays}</g>`, [-80, -20, 400, 440], { anim: 'pulse', origin: [120, -20] }),
        front(`<g opacity=".7" filter="url(#bloom)">${lat}</g>`, [0, -10, 240, 290], { anim: 'pulse', delay: 1 }),
        front(`<g filter="url(#b5)" opacity=".9">${lat}</g>`, [0, -10, 240, 290], { anim: 'pulse' }),
        tw(40, 40, 8, 0), tw(200, 60, 9, 1), tw(120, 140, 6, 2), tw(30, 300, 7, 3), tw(210, 340, 6, .5), mote(60, 380, 2, 0), mote(180, 380, 2, 2)];
    }
    case 'fx:mythic': { // the Night of Qadr over the whole card: nebula sky, beams, moon, clouds rising at the bottom, shooting stars
      const beam = (x: number, w: number, s2: number) => `<path d="M${x - w} -24L${x + w} -24L${f(x + w * 2.6 + s2 * 400)} 420L${f(x - w * 2.6 + s2 * 400)} 420Z" fill="url(#mBeam)"/>`;
      const stars = (s: number) => Array.from({ length: 30 }, (_, k) => `<circle cx="${(k * 61 + s * 23) % 240}" cy="${(k * 47 + s * 31) % 260}" r="${k % 6 ? .9 : 1.6}" fill="#fff"/>`).join('');
      return [back(`<rect x="0" y="0" width="240" height="280" fill="url(#mSky)" opacity=".4"/><g filter="url(#neb)" opacity=".45"><rect x="0" y="0" width="240" height="260" fill="#fff"/></g>`, [0, 0, 240, 280]),
        back(stars(1), [0, 0, 240, 260], { anim: 'pulse' }), back(stars(2), [0, 0, 240, 260], { anim: 'pulse', delay: 1 }),
        back(`<g filter="url(#b5)" opacity=".6">${beam(120, 20, 0)}${beam(50, 12, -.12)}${beam(190, 12, .12)}</g>`, [-80, -30, 400, 450], { anim: 'pulse', origin: [120, -24] }),
        back(`<g filter="url(#b10)">${halo(196, 50, 48)}</g><g filter="url(#bloom)">${bigMoon(196, 50, 28, -13, -9, 24)}</g>`, [140, 0, 100, 100], { anim: 'bob' }),
        front(`<path d="M0 0L50 20" stroke="url(#mBeam)" stroke-width="3" stroke-linecap="round" transform="rotate(180 25 10)"/><circle cx="50" cy="20" r="2.6" fill="#fff"/>`, [40, 30, 56, 28], { anim: 'shoot' }),
        front(`<path d="M0 0L40 16" stroke="url(#mBeam)" stroke-width="2.6" stroke-linecap="round" transform="rotate(180 20 8)"/><circle cx="40" cy="16" r="2.2" fill="#fff"/>`, [150, 140, 46, 24], { anim: 'shoot', delay: 2 }),
        front(`<g filter="url(#ds)">${cloudBank([[10, 376, 22], [44, 360, 30], [84, 372, 24], [124, 378, 18]], 400, '#ffe9a8')}</g>`, [-20, 320, 170, 84], { anim: 'bob' }),
        front(`<g filter="url(#ds)">${cloudBank([[130, 380, 18], [164, 362, 28], [202, 356, 32], [236, 372, 22]], 402, '#ffe9a8')}</g>`, [104, 316, 150, 90], { anim: 'bob', delay: 2 }),
        ...[30, 80, 130, 180, 220].map((x, k) => ({ ...mote(x, 340, 2.4, k * .8), z: 'front' as const })),
        tw(40, 120, 8, 0), tw(200, 200, 7, 1), tw(100, 40, 6, 2), tw(150, 260, 6, 3)];
    }
  }
  return [];
}
export const ITEM_BOX: Record<string, [number, number]> = { fx: [240, 400] };
