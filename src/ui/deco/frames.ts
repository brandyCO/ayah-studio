// The 20 avatar frames as Discord-style decorations (owner decision 2026-11-24). Each frame is a list of pieces:
// back pieces sit behind the avatar, front pieces over it. A piece is drawn once into a picture; moving pieces are
// moved by CSS (transform / opacity only, see deco.css), so they cost the phone almost nothing.
import { HQ_DEFS, hqPieces } from './hq';
import { hqFrame } from './hqframes';
import { DEFS, OL, at, cloud, f, fanous, flower5, gem, khatam, leaf, ring, rose, sparkleD, star } from './art';

export type Anim = 'tw' | 'sway' | 'pulse' | 'orbit' | 'orbitSlow' | 'bob' | 'drift' | 'fall' | 'bloom' | 'flag' | 'pop' | 'rise' | 'burst' | 'orbitRev' | 'shoot';
export interface Piece {
  z: 'back' | 'front';
  /** Markup in the 240 box. */
  svg: string;
  /** Part of the 240 box the piece covers (x, y, w, h); the whole box when left out. */
  box?: [number, number, number, number];
  anim?: Anim;
  /** Seconds the animation is ahead (so pieces don't move in step). */
  delay?: number;
  /** Turning point in the 240 box (sway, orbit, bloom). */
  origin?: [number, number];
}

const TIER_RING = ['#c47a4c', '#a9b0f2', '#5fcfc0', '#e891aa', '#f2c14e'];
const tw = (x: number, y: number, R: number, delay: number, c = '#fff'): Piece =>
  ({ z: 'front', svg: sparkleD(x, y, R, c), box: [x - R - 2, y - R - 2, 2 * R + 4, 2 * R + 4], anim: 'tw', delay, origin: [x, y] });
const glow = (grad: string, r = 112): Piece => ({ z: 'back', svg: `<circle cx="120" cy="120" r="${r}" fill="url(#${grad})"/>`, anim: 'pulse', origin: [120, 120] });
const sparkles = (pts: [number, number, number][], c = '#fff') => pts.map(([x, y, R], i) => tw(x, y, R, i * .55, i % 2 ? '#ffe680' : c));

function tierGrad(c: string): string {
  return `<defs><linearGradient id="gTier" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".75"/></linearGradient></defs>`;
}

function laurel(metal: string, ribbon: string): Piece[] {
  let leaves = '';
  for (const side of [-1, 1]) for (let k = 0; k < 8; k++) {
    const deg = 90 + side * (28 + k * 16), [x, y] = at(92, deg);
    leaves += leaf(x, y, deg + 180 + side * (-60), .95, metal, '#fff');
  }
  const bow = `<path d="M120 206L96 222L100 196Z M120 206L144 222L140 196Z" fill="url(#${ribbon})" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M120 206L104 236L114 234L120 214L126 234L136 236Z" fill="url(#${ribbon})" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="120" cy="206" r="7" fill="url(#${metal})" stroke="${OL}" stroke-width="2.4"/>`;
  return [
    glow(metal === 'gGold' ? 'gGlow' : 'gGlowV', 110),
    { z: 'front', svg: `${ring(84, 7, metal)}${leaves}${bow}` },
    { z: 'front', svg: `<path d="${star(120, 26, 15, 5, .45)}" fill="url(#${metal})" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/><path d="M114 20L118 16" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`, box: [100, 6, 40, 40], anim: 'bob' },
    ...sparkles([[34, 70, 6], [206, 74, 5], [40, 168, 4], [200, 170, 6]]),
  ];
}

function crescentD(cx: number, cy: number, R: number) {
  // horns up: a big circle minus a smaller one shifted up
  return `M${cx - R} ${cy}A${R} ${R} 0 0 0 ${cx + R} ${cy}A${R} ${R * .42} 0 0 1 ${cx - R} ${cy}Z`;
}

function archD(out: number, top: number) {
  // a pointed mihrab arch round the avatar, from the bottom corners up to the point
  return `M${120 - out} 232V120C${120 - out} 70 ${120 - out * .45} 40 120 ${top}C${120 + out * .45} 40 ${120 + out} 70 ${120 + out} 120V232`;
}

export function framePieces(fr: number, tier = 0): Piece[] {
  const hq = hqFrame(fr, tier) ?? hqPieces(fr);
  if (hq) return hq;
  switch (fr) {
    case 0: { // the tier's ring: clean and glossy
      return [{ z: 'front', svg: `${tierGrad(TIER_RING[Math.max(0, Math.min(4, tier))])}${ring(84, 8, 'gTier')}` }, tw(186, 52, 6, 0), tw(48, 186, 4, 1.2)];
    }
    case 1: { // glow: a gold ring with eight studs and a breathing halo
      const studs = Array.from({ length: 8 }, (_, k) => { const [x, y] = at(84, k * 45 + 22.5); return `<circle cx="${f(x)}" cy="${f(y)}" r="5.4" fill="${OL}"/><circle cx="${f(x)}" cy="${f(y)}" r="3.8" fill="url(#gGold)"/><circle cx="${f(x - 1.2)}" cy="${f(y - 1.2)}" r="1.2" fill="#fff"/>`; }).join('');
      return [glow('gGlow', 118), { z: 'front', svg: `${ring(84, 9, 'gGold')}${studs}` }, ...sparkles([[200, 48, 7], [38, 64, 5], [204, 190, 5]])];
    }
    case 2: { // emerald: a green ring, four cut gems and two sprigs of leaves
      const gems = [0, 90, 180, 270].map((d, k) => { const [x, y] = at(84, d - 90); return gem(x, y, 7, k % 2 ? 'gTeal' : 'gRuby'); }).join('');
      const sprig = (x: number, y: number, a: number) => `${leaf(x, y, a, 1)}${leaf(x, y, a - 40, .8)}${leaf(x, y, a + 40, .8)}`;
      return [glow('gGlowG', 112), { z: 'front', svg: `${ring(84, 10, 'gEmerald')}${sprig(54, 186, 150)}${sprig(186, 54, -30)}${gems}` },
        ...[0, 90, 180, 270].map((d, k) => { const [x, y] = at(84, d - 90); return tw(x + 5, y - 5, 5, k * .5); })];
    }
    case 3: { // stars: a night ring, a crescent on its edge and stars going round
      const orbit = Array.from({ length: 8 }, (_, k) => { const [x, y] = at(100, k * 45); return `<path d="${star(x, y, k % 2 ? 6 : 10, 4, .32)}" fill="url(#gGold)" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>`; }).join('');
      const dots = Array.from({ length: 16 }, (_, k) => { const [x, y] = at(84, k * 22.5); return `<circle cx="${f(x)}" cy="${f(y)}" r="${k % 2 ? 1 : 1.8}" fill="#ffe680"/>`; }).join('');
      return [glow('gGlowV', 116), { z: 'back', svg: orbit, anim: 'orbit', origin: [120, 120] },
        { z: 'front', svg: `${ring(84, 10, 'gNight', '#b8b0ff')}${dots}` },
        { z: 'front', svg: `<g filter="url(#sh)"><path d="M198 14C178 12 160 26 158 46C156 66 172 82 192 82C180 76 172 62 174 48C176 32 186 20 198 14Z" fill="url(#gMoon)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/></g><path d="M186 22C176 30 170 42 172 54" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`, box: [150, 6, 56, 84], anim: 'bob' },
        ...sparkles([[214, 100, 5], [28, 120, 4], [60, 30, 5]])];
    }
    case 4: { // sun crown: turning rays, a gold ring and a sun at the top
      const rays = Array.from({ length: 16 }, (_, k) => { const a = k * 22.5, L = k % 2 ? 108 : 118, [x1, y1] = at(84, a - 5), [x2, y2] = at(L, a), [x3, y3] = at(84, a + 5); return `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>`; }).join('');
      return [glow('gGlow', 118), { z: 'back', svg: rays, anim: 'orbitSlow', origin: [120, 120] },
        { z: 'front', svg: `${ring(84, 10, 'gGold')}<circle cx="120" cy="30" r="17" fill="${OL}"/><circle cx="120" cy="30" r="14" fill="url(#gGold)"/><circle cx="114" cy="24" r="4" fill="#fff" opacity=".9"/>` },
        ...sparkles([[150, 24, 6], [40, 60, 5], [210, 150, 5]])];
    }
    case 5: return laurel('gGold', 'gRed');
    case 6: return laurel('gSilver', 'gBlue');
    case 7: return laurel('gBronze', 'gEmerald');
    case 8: { // pearls: a strand round the avatar and a pearl drop that swings
      const pearls = Array.from({ length: 28 }, (_, k) => { const [x, y] = at(88, k * (360 / 28)); return `<circle cx="${f(x)}" cy="${f(y + 1.5)}" r="6.4" fill="${OL}"/><circle cx="${f(x)}" cy="${f(y)}" r="5.6" fill="url(#gPearl)" stroke="${OL}" stroke-width="1.4"/><circle cx="${f(x - 1.8)}" cy="${f(y - 1.8)}" r="1.6" fill="#fff"/>`; }).join('');
      return [glow('gGlowV', 112), { z: 'front', svg: `${ring(82, 5, 'gGold')}${pearls}` },
        { z: 'front', svg: `<path d="M120 214V226" stroke="${OL}" stroke-width="3"/><path d="M120 214V226" stroke="#ffd45a" stroke-width="1.4"/><path d="M120 224C130 234 130 238 120 238C110 238 110 234 120 224Z" fill="url(#gPearl)" stroke="${OL}" stroke-width="2.4"/><circle cx="116" cy="232" r="2" fill="#fff"/>`, box: [104, 208, 32, 32], anim: 'sway', origin: [120, 214] },
        ...sparkles([[62, 46, 5], [196, 62, 6], [40, 150, 4], [200, 186, 5]])];
    }
    case 9: { // crescent crown: a gold crescent sitting on top, horns up, with a star that swings
      return [glow('gGlow', 112),
        { z: 'front', box: [0, -30, 240, 270], svg: `${ring(84, 9, 'gGold')}<g filter="url(#sh)"><path d="${crescentD(120, 14, 40)}" fill="url(#gMoon)" stroke="${OL}" stroke-width="3.2" stroke-linejoin="round"/></g><path d="M88 26C98 42 118 48 136 44" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>${gem(120, 38, 6, 'gTeal')}${gem(36, 120, 5, 'gRuby')}${gem(204, 120, 5, 'gRuby')}` },
        { z: 'front', svg: `<path d="${star(120, -12, 11, 5, .45)}" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>`, box: [104, -28, 32, 32], anim: 'bob' },
        ...sparkles([[170, 20, 6], [70, 18, 5], [210, 170, 5]])];
    }
    case 10: { // mosaic: zellige stars round the ring that light up in turn
      const cols = ['gTeal', 'gGold', 'gRuby', 'gBlue'];
      return [glow('gGlowB', 110), { z: 'front', svg: `${ring(84, 9, 'gGold')}` },
        ...Array.from({ length: 12 }, (_, k): Piece => { const [x, y] = at(90, k * 30 - 90); return { z: 'front', svg: `<path d="${khatam(x, y, 11)}" fill="url(#${cols[k % 4]})" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/><path d="${khatam(x, y, 4.5)}" fill="#fff" opacity=".85"/>`, box: [x - 14, y - 14, 28, 28], anim: 'pop', delay: (k / 12) * 4, origin: [x, y] }; })];
    }
    case 11: { // aurora: ribbons of light flowing behind, stars
      const wave = (y: number, amp: number, w: number) => { let d = `M-60 ${y}`; for (let k = 0; k < 13; k++) { const x = -60 + k * 35; d += `Q${x + 17.5} ${y + (k % 2 ? amp : -amp)} ${x + 35} ${y}`; } return `<path d="${d}" stroke="url(#gAurora)" stroke-width="${w}" fill="none" stroke-linecap="round" opacity=".85"/>`; };
      return [{ z: 'back', svg: `<defs><linearGradient id="af" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff"/><stop offset=".75" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="am"><rect x="-10" y="0" width="260" height="240" fill="url(#af)"/></mask></defs><g mask="url(#am)">${wave(50, 14, 16)}${wave(78, 10, 10)}${wave(176, 12, 12)}</g>`, anim: 'bob' },
        { z: 'back', svg: `<circle cx="120" cy="120" r="112" fill="url(#gGlowB)"/>`, anim: 'pulse', origin: [120, 120] },
        { z: 'front', svg: ring(84, 8, 'gBlue', '#d8f0ff') },
        ...sparkles([[200, 40, 7], [36, 50, 5], [214, 140, 4], [30, 190, 6], [170, 214, 4]])];
    }
    case 12: { // lanterns: a string of flags overhead and stained-glass fanous lanterns, one in front
      const cols = ['gRed', 'gGold', 'gTeal', 'gViolet'];
      let flags = '';
      for (let i = 0; i < 9; i++) {
        const t = (i + .5) / 9, x = (1 - t) ** 2 * 14 + 2 * (1 - t) * t * 120 + t * t * 226, y = (1 - t) ** 2 * 74 + 2 * (1 - t) * t * -6 + t * t * 74;
        flags += `<path d="M${f(x - 9)} ${f(y)}L${f(x + 9)} ${f(y)}L${f(x)} ${f(y + 20)}Z" fill="url(#${cols[i % 4]})" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/><path d="${khatam(x, y + 7, 3)}" fill="#fff" opacity=".85"/>`;
      }
      const rope = 'M14 74Q120 -6 226 74';
      return [
        { z: 'back', svg: `<circle cx="26" cy="126" r="34" fill="url(#gGlow)"/><g transform="translate(26 118) scale(1.05)">${fanous(['gTeal', 'gGlass', 'gViolet'])}</g>`, box: [-10, 70, 72, 100], anim: 'sway', delay: 1.2, origin: [26, 76] },
        { z: 'front', svg: `<path d="${rope}" stroke="${OL}" stroke-width="5" fill="none"/><path d="${rope}" stroke="url(#gGold)" stroke-width="2.6" fill="none"/>${flags}` },
        { z: 'front', svg: `<circle cx="196" cy="198" r="44" fill="url(#gGlow)"/><g transform="translate(196 186) scale(1.45)">${fanous()}</g>`, box: [150, 120, 92, 120], anim: 'sway', origin: [196, 128] },
        ...sparkles([[30, 200, 5], [214, 110, 5], [60, 214, 4]])];
    }
    case 13: { // rosette: a turning rosette of gold and turquoise petals behind the avatar
      const petals = Array.from({ length: 16 }, (_, k) => { const a = k * 22.5; return `<path d="M120 120C${f(at(70, a - 8)[0])} ${f(at(70, a - 8)[1])} ${f(at(112, a - 4)[0])} ${f(at(112, a - 4)[1])} ${f(at(116, a)[0])} ${f(at(116, a)[1])}C${f(at(112, a + 4)[0])} ${f(at(112, a + 4)[1])} ${f(at(70, a + 8)[0])} ${f(at(70, a + 8)[1])} 120 120Z" fill="url(#${k % 2 ? 'gTeal' : 'gGold'})" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>`; }).join('');
      const pts = Array.from({ length: 8 }, (_, k) => { const [x, y] = at(84, k * 45); return `<path d="${khatam(x, y, 6)}" fill="url(#gGold)" stroke="${OL}" stroke-width="1.6"/>`; }).join('');
      return [{ z: 'back', svg: petals, anim: 'orbitSlow', origin: [120, 120] }, { z: 'front', svg: `${ring(84, 9, 'gEmerald')}${pts}` }, ...sparkles([[206, 40, 6], [34, 200, 5]])];
    }
    case 14: { // ruby crown: a gold crown with rubies on a ruby ring
      const crown = `<g filter="url(#sh)"><path d="M80 50L76 16L98 34L120 6L142 34L164 16L160 50Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M78 44H162V58H78Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/></g>
        ${gem(120, 51, 5, 'gRuby')}${gem(98, 51, 4, 'gTeal')}${gem(142, 51, 4, 'gTeal')}${[76, 120, 164].map((x, k) => `<circle cx="${x}" cy="${[16, 6, 16][k]}" r="4" fill="url(#gRuby)" stroke="${OL}" stroke-width="1.8"/>`).join('')}
        <path d="M86 46L90 22" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
      return [glow('gGlowR', 114), { z: 'front', svg: `${ring(84, 10, 'gRuby', '#ffd0dc')}${gem(36, 120, 5, 'gRuby')}${gem(204, 120, 5, 'gRuby')}${gem(120, 204, 6, 'gRuby')}` },
        { z: 'front', svg: crown, box: [70, 0, 100, 64], anim: 'bob' }, ...sparkles([[170, 10, 6], [60, 26, 5], [206, 180, 5]])];
    }
    case 15: { // sapphire halo: blue ring with cut crystals going round
      const crystals = [0, 90, 180, 270].map((d) => { const [x, y] = at(100, d); return `<path d="M${f(x)} ${f(y - 13)}L${f(x + 8)} ${f(y)}L${f(x)} ${f(y + 13)}L${f(x - 8)} ${f(y)}Z" fill="url(#gCrystal)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${f(x)} ${f(y - 13)}L${f(x + 3)} ${f(y)}L${f(x)} ${f(y + 13)}Z" fill="url(#gPrism)" opacity=".55"/>`; }).join('');
      return [glow('gGlowB', 118), { z: 'back', svg: crystals, anim: 'orbitSlow', origin: [120, 120] },
        { z: 'front', svg: `${ring(84, 11, 'gBlue', '#e0f2ff')}<circle cx="120" cy="120" r="${84 + 8.5}" fill="none" stroke="#bfe0ff" stroke-width="1.4" opacity=".8"/>${[45, 135, 225, 315].map((d) => { const [x, y] = at(84, d); return gem(x, y, 5, 'gCrystal'); }).join('')}` },
        ...sparkles([[204, 50, 7], [30, 70, 5], [200, 200, 5], [44, 200, 4]], '#e0f2ff')];
    }
    case 16: { // rose garden: vines, roses and jasmine wrapping the ring, petals falling
      const vineA = 'M18 214C24 170 20 134 40 98C52 76 62 64 82 52', vineB = 'M222 28C216 70 222 104 206 140C196 162 184 178 164 194';
      const vine = (d: string) => `<path d="${d}" stroke="${OL}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#3fbf5a" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
      const leaves = `${leaf(22, 182, -120)}${leaf(26, 150, -50, .9)}${leaf(36, 118, -140)}${leaf(54, 84, -30, .85)}${leaf(218, 60, 50)}${leaf(216, 96, 130, .9)}${leaf(208, 128, 40)}${leaf(194, 160, 140, .85)}`;
      const bloomAt = (x: number, y: number, s: number, d: number, kind: 'rose' | 'jasmine'): Piece =>
        ({ z: 'front', svg: `<g transform="translate(${x} ${y}) scale(${s})">${kind === 'rose' ? rose() : flower5()}</g>`, box: [x - 24 * s, y - 24 * s, 48 * s, 48 * s], anim: 'bloom', delay: d, origin: [x, y] });
      const petals: Piece[] = [[60, 0], [150, 1.3], [210, 2.6], [100, 3.4]].map(([x, d]) => ({ z: 'front', svg: `<path d="M${x} 6C${x - 5} 2 ${x - 4} -6 ${x} -8C${x + 4} -6 ${x + 5} 2 ${x} 6Z" fill="url(#gRose)" stroke="${OL}" stroke-width="1.4"/>`, box: [x - 8, -10, 16, 18], anim: 'fall', delay: d }));
      return [{ z: 'front', svg: `${vine(vineA)}${vine(vineB)}${leaves}` },
        bloomAt(30, 200, 1.3, 0, 'rose'), bloomAt(46, 106, 1, 1.3, 'jasmine'), bloomAt(86, 48, 1.1, 2.6, 'rose'), bloomAt(216, 40, 1.15, .8, 'jasmine'), bloomAt(212, 118, 1.1, 2, 'rose'), bloomAt(162, 196, 1, 3.2, 'jasmine'),
        ...petals];
    }
    case 17: { // dawn: a sun rising behind, turning rays, pink clouds drifting in front
      const rays = Array.from({ length: 12 }, (_, k) => { const a = k * 30, [x1, y1] = at(40, a - 7), [x2, y2] = at(130, a), [x3, y3] = at(40, a + 7); return `<path d="M${f(x1 + 60)} ${f(y1 + 60)}L${f(x2 + 60)} ${f(y2 + 60)}L${f(x3 + 60)} ${f(y3 + 60)}Z" fill="#ffd0a0" opacity=".35"/>`; }).join('');
      const clouds = [24, 84, 150, 212].map((x, i) => cloud(x, 220 - (i % 2) * 8, .72 + (i % 3) * .1, 'gDawnCloud')).join('');
      return [{ z: 'back', svg: rays, anim: 'orbitSlow', origin: [180, 180] },
        { z: 'back', svg: `<circle cx="180" cy="180" r="70" fill="url(#gGlow)"/><circle cx="184" cy="184" r="40" fill="${OL}"/><circle cx="184" cy="184" r="37" fill="url(#gGold)"/><circle cx="172" cy="170" r="9" fill="#fff" opacity=".8"/>`, anim: 'pulse', origin: [184, 184] },
        { z: 'front', svg: ring(84, 8, 'gRoseGold', '#fff6f0') },
        { z: 'front', svg: clouds, box: [0, 180, 240, 60], anim: 'bob' },
        ...sparkles([[40, 40, 6], [200, 40, 5], [24, 140, 4]], '#ffe8f0')];
    }
    case 18: { // jade arches: a jade mihrab arch round the avatar with two fanous lanterns
      const d = archD(104, 4);
      return [{ z: 'back', svg: `<path d="${d}" fill="none" stroke="${OL}" stroke-width="20"/><path d="${d}" fill="none" stroke="url(#gJade)" stroke-width="14"/><path d="${archD(97, 14)}" fill="none" stroke="url(#gGold)" stroke-width="2"/><path d="M24 104C26 70 50 44 86 22" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>` },
        { z: 'front', svg: `${ring(84, 7, 'gGold')}<path d="M8 226H232V238H8Z" fill="url(#gJade)" stroke="${OL}" stroke-width="3"/>${gem(120, 8, 6, 'gRuby')}` },
        { z: 'front', svg: `<g transform="translate(16 100) scale(.85)">${fanous(['gTeal', 'gGlass', 'gRed'])}</g>`, box: [-2, 60, 36, 80], anim: 'sway', origin: [16, 66] },
        { z: 'front', svg: `<g transform="translate(224 100) scale(.85)">${fanous(['gRed', 'gGlass', 'gTeal'])}</g>`, box: [206, 60, 36, 80], anim: 'sway', delay: 2, origin: [224, 66] },
        ...sparkles([[120, 8, 9], [60, 30, 4], [180, 30, 4]])];
    }
    case 19: { // diamond: a crystal mihrab with a prism edge and a jewel at the point
      const d = archD(104, 2);
      return [glow('gGlowB', 120),
        { z: 'back', svg: `<path d="${d}" fill="none" stroke="${OL}" stroke-width="20"/><path d="${d}" fill="none" stroke="url(#gCrystal)" stroke-width="14"/><path d="M22 120C22 74 48 44 92 18" stroke="url(#gPrism)" stroke-width="3" fill="none"/><path d="${archD(98, 12)}" fill="none" stroke="#fff" stroke-width="1.4" opacity=".8"/>` },
        { z: 'front', svg: `${ring(84, 6, 'gCrystal')}<path d="M8 226H232V238H8Z" fill="url(#gCrystal)" stroke="${OL}" stroke-width="3"/><g filter="url(#sh)"><path d="M120 -10L134 6L120 26L106 6Z" fill="url(#gCrystal)" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/><path d="M120 -10L126 6L120 26Z" fill="url(#gPrism)" opacity=".6"/></g>` },
        ...sparkles([[120, 6, 11], [26, 100, 6], [214, 140, 5], [60, 34, 4], [180, 34, 5], [214, 220, 4]], '#e0f2ff')];
    }
    case 20: { // JUMU'AH · kiswah: a black band embroidered in gold, a gold medallion on top, a gold tassel swaying below
      const emb = Array.from({ length: 16 }, (_, k) => { const a = k * 22.5; const [x, y] = at(84, a); return `<path d="M-5 0Q-2.5 -5 0 0Q2.5 5 5 0" transform="translate(${f(x)} ${f(y)}) rotate(${a + 90})" stroke="url(#gGold)" stroke-width="1.8" fill="none"/>`; }).join('');
      return [glow('gGlow', 116),
        { z: 'front', svg: `${ring(84, 20, 'gKiswah', '#8a8696')}<circle cx="120" cy="120" r="${84 + 8}" fill="none" stroke="url(#gGold)" stroke-width="2.4"/><circle cx="120" cy="120" r="${84 - 8}" fill="none" stroke="url(#gGold)" stroke-width="2.4"/>${emb}` },
        { z: 'front', svg: `<g filter="url(#sh)"><circle cx="120" cy="30" r="24" fill="url(#gGold)" stroke="${OL}" stroke-width="3.4"/><path d="${khatam(120, 30, 18)}" fill="url(#gKiswah)" stroke="${OL}" stroke-width="1.6"/><path d="${khatam(120, 30, 9)}" fill="url(#gGold)"/><circle cx="113" cy="22" r="3" fill="#fff" opacity=".8"/></g>` },
        { z: 'front', svg: `<g filter="url(#sh)"><path d="M120 204V222" stroke="url(#gGold)" stroke-width="3"/><circle cx="120" cy="224" r="6" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4"/><path d="M113 228L111 250H129L127 228Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/><path d="M115 232V248M120 232V248M125 232V248" stroke="#a8600a" stroke-width="1.2"/></g>`, box: [104, 200, 32, 54], anim: 'sway', origin: [120, 204] },
        ...sparkles([[120, 10, 8], [40, 60, 5], [204, 66, 6], [210, 186, 4]])];
    }
    case 21: { // JUMU'AH · domes: a teal band, a big gold dome rising at the top between two slim minarets
      const min = (x: number) => `<g filter="url(#sh)"><path d="M${x - 6} 110V40H${x + 6}V110Z" fill="url(#gTeal)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path d="M${x - 9} 42H${x + 9}V48H${x - 9}Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4"/><path d="M${x - 6} 40L${x} 18L${x + 6} 40Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/><path d="M${x} 18V10" stroke="url(#gGold)" stroke-width="2"/><circle cx="${x}" cy="9" r="2" fill="#ffe680"/></g>`;
      return [glow('gGlowG', 116), ...motes([44, 96, 150, 200], '#b8fff2'),
        { z: 'back', svg: `${min(26)}${min(214)}` },
        { z: 'front', svg: `${ring(84, 11, 'gTeal', '#d8fff8')}${Array.from({ length: 12 }, (_, k) => { const [x, y] = at(84, k * 30 + 15); return `<path d="${star(x, y, 4, 8, .55)}" fill="url(#gGold)"/>`; }).join('')}` },
        { z: 'front', svg: `<g filter="url(#sh)"><path d="M86 48Q86 6 120 -4Q154 6 154 48Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3.6" stroke-linejoin="round"/><path d="M80 46H160V56H80Z" fill="url(#gTeal)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path d="M98 40Q98 14 116 4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/><path d="M120 -4V-16" stroke="url(#gGold)" stroke-width="3"/><path d="${crescentD(120, -22, 7)}" fill="url(#gMoon)" stroke="${OL}" stroke-width="1.6"/></g>`, box: [0, -34, 240, 274] },
        ...sparkles([[166, 6, 7], [70, 16, 5], [214, 140, 4]])];
    }
    case 22: { // JUMU'AH · iznik: a white glazed band painted with cobalt tulips and coral buds that bloom outward
      const tulip = (deg: number, i: number): Piece => { const [x, y] = at(104, deg); return { z: 'front', svg: `<g transform="translate(${f(x)} ${f(y)}) rotate(${deg + 90}) scale(1.5)" filter="url(#sh)"><path d="M0 14V2" stroke="url(#gLeaf)" stroke-width="3"/><path d="M0 2C-9 0 -11 -10 -8 -18L-3 -11L0 -20L3 -11L8 -18C11 -10 9 0 0 2Z" fill="url(#gCobalt)" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/><path d="M-3 -6C-3 -10 -1 -13 0 -14" stroke="#fff" stroke-width="1.6" fill="none" opacity=".8"/></g>`, box: [x - 26, y - 26, 52, 52], anim: 'pop', delay: i * .5, origin: [x, y] }; };
      const buds = Array.from({ length: 6 }, (_, k) => { const [x, y] = at(84, k * 60 + 30); return `<circle cx="${f(x)}" cy="${f(y)}" r="4.4" fill="url(#gCoral)" stroke="${OL}" stroke-width="1.6"/>`; }).join('');
      return [glow('gGlowB', 114),
        { z: 'front', svg: `${ring(84, 13, 'gGlaze')}<circle cx="120" cy="120" r="${84 + 5}" fill="none" stroke="url(#gCobalt)" stroke-width="2"/><circle cx="120" cy="120" r="${84 - 5}" fill="none" stroke="url(#gCobalt)" stroke-width="2"/>${buds}` },
        ...[0, 60, 120, 180, 240, 300].map((d, i) => tulip(d - 90, i)),
        ...sparkles([[200, 26, 6], [36, 200, 5]], '#e0ecff')];
    }
    case 23: { // JUMU'AH · maghrib: a sunset band, the sun setting behind a masjid's dome and minaret at the top, rays turning
      const rays = Array.from({ length: 12 }, (_, k) => `<path d="M120 120L${at(150, k * 30 - 4).map(f).join(' ')}L${at(150, k * 30 + 4).map(f).join(' ')}Z" fill="#ffcf6b" opacity=".1"/>`).join('');
      return [
        { z: 'back', svg: rays, box: [-30, -30, 300, 300], anim: 'orbitSlow', origin: [120, 120] },
        { z: 'back', svg: `<circle cx="120" cy="120" r="116" fill="url(#gGlow)"/>`, anim: 'pulse', origin: [120, 120] },
        { z: 'front', svg: ring(84, 12, 'gSunset', '#fff0c8') },
        { z: 'front', svg: `<g filter="url(#sh)"><circle cx="120" cy="30" r="28" fill="url(#gSun)" stroke="${OL}" stroke-width="3.4"/><path d="M84 52V40H92V14L96 4L100 14V40H104Q104 22 122 18Q140 22 140 40H156V52Z" fill="#3a1a4a" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/><path d="M122 18V10" stroke="#3a1a4a" stroke-width="2.4"/><path d="${crescentD(122, 6, 5)}" fill="url(#gMoon)"/><path d="M80 52H160" stroke="${OL}" stroke-width="3" stroke-linecap="round"/></g>` },
        { z: 'front', svg: `<path d="M0 0Q4 -4 8 0Q12 -4 16 0" stroke="#3a1a4a" stroke-width="2.2" fill="none" stroke-linecap="round" transform="translate(176 40)"/><path d="M0 0Q3 -3 6 0Q9 -3 12 0" stroke="#3a1a4a" stroke-width="2" fill="none" stroke-linecap="round" transform="translate(196 58)"/>`, box: [170, 30, 44, 36], anim: 'drift' },
        ...sparkles([[40, 50, 6], [206, 170, 5], [30, 170, 4]], '#ffe0c0')];
    }
    case 24: { // JUMU'AH · khatam: a gold band set with eight turquoise eight-pointed stars, the ring of stars turning slowly
      const stars = Array.from({ length: 8 }, (_, k) => { const [x, y] = at(92, k * 45 - 90); return `<g filter="url(#sh)"><path d="${khatam(x, y, 13)}" fill="url(#gTeal)" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/><path d="${khatam(x, y, 6)}" fill="url(#gGold)"/><circle cx="${f(x - 4)}" cy="${f(y - 5)}" r="2" fill="#fff" opacity=".9"/></g>`; }).join('');
      return [glow('gGlow', 118),
        { z: 'back', svg: `<path d="${khatam(120, 120, 112)}" fill="none" stroke="url(#gGold)" stroke-width="3" opacity=".7"/>`, box: [4, 4, 232, 232], anim: 'orbitRev', origin: [120, 120] },
        { z: 'front', svg: ring(84, 11, 'gGold') },
        { z: 'front', svg: stars, box: [8, 8, 224, 224], anim: 'orbitSlow', origin: [120, 120] },
        ...sparkles([[200, 20, 7], [30, 40, 5], [214, 210, 5], [24, 200, 4]])];
    }
    case 25: { // JUMU'AH · pearl and rose: a pearl band with rose enamel lozenges in silver filigree, a pearl strand swinging below
      const lz = Array.from({ length: 6 }, (_, k) => { const a = k * 60 - 90; const [x, y] = at(86, a); return `<g transform="translate(${f(x)} ${f(y)}) rotate(${a + 90})" filter="url(#sh)"><path d="M0 -13L9 0L0 13L-9 0Z" fill="url(#gSilver)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/><path d="M0 -8L5.5 0L0 8L-5.5 0Z" fill="url(#gRose)"/><circle cx="-1.6" cy="-3" r="1.4" fill="#fff"/></g>`; }).join('');
      const pearls = Array.from({ length: 30 }, (_, k) => { const [x, y] = at(84, k * 12 + 6); return k % 5 === 2 ? '' : `<circle cx="${f(x)}" cy="${f(y)}" r="3.4" fill="url(#gPearl)" stroke="${OL}" stroke-width="1"/>`; }).join('');
      const strand = Array.from({ length: 7 }, (_, k) => { const x = 92 + k * 9.3, y = 214 + Math.sin((k / 6) * Math.PI) * 18; return `<circle cx="${f(x)}" cy="${f(y)}" r="${k === 3 ? 6 : 3.6}" fill="url(#gPearl)" stroke="${OL}" stroke-width="1.4"/>`; }).join('');
      return [glow('gGlowR', 114),
        { z: 'front', svg: `${ring(84, 10, 'gRoseGold')}${pearls}${lz}` },
        { z: 'front', svg: `<g filter="url(#sh)">${strand}</g>`, box: [84, 204, 72, 44], anim: 'sway', origin: [120, 206] },
        { z: 'front', svg: `<path d="M0 -6C4 -6 6 -2 6 0C6 4 2 6 0 6C-2 4 -4 0 0 -6Z" fill="url(#gRose)" stroke="${OL}" stroke-width="1.4" transform="translate(196 40)"/>`, box: [186, 30, 20, 20], anim: 'fall', delay: 0, origin: [196, 40] },
        { z: 'front', svg: `<path d="M0 -6C4 -6 6 -2 6 0C6 4 2 6 0 6C-2 4 -4 0 0 -6Z" fill="url(#gRose)" stroke="${OL}" stroke-width="1.4" transform="translate(44 60)"/>`, box: [34, 50, 20, 20], anim: 'fall', delay: 2, origin: [44, 60] },
        ...sparkles([[120, 14, 7], [210, 120, 5], [30, 120, 4]])];
    }
  }
  return premiumPieces(fr);
}

/** Rising specks of light (mythic touch). */
const motes = (xs: number[], c = '#fff3b0'): Piece[] => xs.map((x, i) => ({ z: 'back', svg: `<circle cx="${x}" cy="230" r="9" fill="url(#gGlow)"/><circle cx="${x}" cy="230" r="2.6" fill="${c}"/>`, box: [x - 10, 220, 20, 20], anim: 'rise', delay: (i * 1.37) % 4 }));

// Legendary and mythic decorations (owner request 2026-11-24, "premium legendary and more mythic ones that make users
// die to own it"). Ids 26+ (20–25 are the Jumu'ah collection).
function premiumPieces(fr: number): Piece[] {
  switch (fr) {
    case 26: { // MYTHIC · Laylat al-Qadr: a night sky disc, beams of light coming down, a turning gold khatam, clouds in front
      const beams = [70, 120, 170].map((x, i) => `<path d="M${x - 10} -20L${x + 10} -20L${x + 26} 240L${x - 26} 240Z" fill="#fff3b0" opacity="${[.18, .26, .18][i]}"/>`).join('');
      const kh = `<path d="${khatam(120, 120, 118)}" fill="none" stroke="url(#gGold)" stroke-width="5"/><path d="${khatam(120, 120, 118)}" fill="none" stroke="${OL}" stroke-width="1.4" opacity=".6"/>`;
      return [
        { z: 'back', svg: `<circle cx="120" cy="120" r="116" fill="url(#gGlowV)"/>`, anim: 'pulse', origin: [120, 120] },
        { z: 'back', svg: kh, box: [-4, -4, 248, 248], anim: 'orbitSlow', origin: [120, 120] },
        { z: 'back', svg: beams, anim: 'pulse', delay: 1, origin: [120, 0] },
        { z: 'front', svg: `${ring(84, 10, 'gNight', '#b8b0ff')}${Array.from({ length: 24 }, (_, k) => { const [x, y] = at(84, k * 15); return `<circle cx="${f(x)}" cy="${f(y)}" r="${k % 3 ? 1.2 : 2.2}" fill="#ffe680"/>`; }).join('')}` },
        { z: 'front', svg: `<g filter="url(#sh)"><path d="M222 0C196 2 178 22 180 46C182 68 202 84 226 82C210 74 200 58 202 42C204 22 214 8 222 0Z" fill="url(#gMoon)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/></g>${gem(208, 64, 5, 'gTeal')}<path d="M210 10C200 18 194 30 194 42" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`, box: [174, -6, 60, 96], anim: 'bob' },
        { z: 'front', svg: [10, 80, 150, 220].map((x, i) => cloud(x, 224 - (i % 2) * 6, .8, 'gCloud')).join(''), box: [-40, 196, 320, 44], anim: 'bob', delay: 2 },
        ...motes([40, 90, 150, 200]),
        ...sparkles([[30, 40, 8], [210, 30, 6], [220, 110, 7], [20, 130, 5], [196, 180, 6]], '#fff')];
    }
    case 27: { // MYTHIC · Gates of light: golden double gates opening behind, light pouring out, vines of jasmine
      const rays = Array.from({ length: 12 }, (_, k) => { const a = k * 30, [x1, y1] = at(60, a - 6), [x2, y2] = at(150, a), [x3, y3] = at(60, a + 6); return `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z" fill="#fff6c8" opacity=".4"/>`; }).join('');
      const door = (x: number, flip: number) => `<g transform="translate(${x} 0) scale(${flip} 1)"><path d="M0 232V96C0 60 24 34 54 22V232Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
        ${[60, 100, 140, 180].map((y) => `<path d="${khatam(28, y, 9)}" fill="#fff3b0" stroke="${OL}" stroke-width="1.6"/>`).join('')}<path d="M8 220V100C8 74 22 52 40 40" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/></g>`;
      return [
        { z: 'back', svg: rays, anim: 'orbitSlow', origin: [120, 120] },
        { z: 'back', svg: `<circle cx="120" cy="120" r="110" fill="url(#gGlow)"/>`, anim: 'pulse', origin: [120, 120] },
        { z: 'back', svg: `${door(6, 1)}${door(234, -1)}<path d="M6 232H234V240H6Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3"/>` },
        { z: 'front', svg: `${ring(84, 8, 'gGold')}${leaf(34, 220, -100)}${leaf(206, 220, -80)}${leaf(46, 206, -40, .8)}${leaf(194, 206, -140, .8)}` },
        ...[[30, 200, 0], [210, 200, 1.4], [120, 20, 2.6]].map(([x, y, d]): Piece => ({ z: 'front', svg: `<g transform="translate(${x} ${y}) scale(1.2)">${flower5()}</g>`, box: [x - 26, y - 26, 52, 52], anim: 'bloom', delay: d, origin: [x, y] })),
        ...motes([60, 120, 180], '#fff'),
        ...sparkles([[60, 40, 7], [180, 40, 7], [12, 120, 5], [228, 120, 5]])];
    }
    case 28: { // MYTHIC · Celestial orbit: a galaxy turning behind, two orbits of light at different speeds
      const swirl = Array.from({ length: 4 }, (_, k) => `<path d="M120 120C${f(at(60, k * 90)[0])} ${f(at(60, k * 90)[1])} ${f(at(110, k * 90 + 40)[0])} ${f(at(110, k * 90 + 40)[1])} ${f(at(118, k * 90 + 80)[0])} ${f(at(118, k * 90 + 80)[1])}" stroke="url(#gViolet)" stroke-width="14" fill="none" stroke-linecap="round" opacity=".55"/>`).join('');
      const orb = (r: number, d: number, g: string, s: number) => { const [x, y] = at(r, d); return `<circle cx="${f(x)}" cy="${f(y)}" r="${s * 2.2}" fill="url(#gGlowB)"/><circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="url(#${g})" stroke="${OL}" stroke-width="2"/><circle cx="${f(x - s * .35)}" cy="${f(y - s * .35)}" r="${f(s * .3)}" fill="#fff"/>`; };
      return [
        { z: 'back', svg: `<circle cx="120" cy="120" r="118" fill="url(#gGlowV)"/>${swirl}`, anim: 'orbitSlow', origin: [120, 120] },
        { z: 'back', svg: `<circle cx="120" cy="120" r="104" fill="none" stroke="#b8b0ff" stroke-width="1.2" stroke-dasharray="2 6"/>${[0, 90, 180, 270].map((d, k) => orb(104, d, ['gGold', 'gTeal', 'gRose', 'gBlue'][k], k % 2 ? 6 : 9)).join('')}`, box: [0, 0, 240, 240], anim: 'orbit', origin: [120, 120] },
        { z: 'front', svg: `${ring(84, 9, 'gViolet', '#e6d8ff')}` },
        { z: 'front', svg: `${[45, 135, 225, 315].map((d) => orb(96, d, 'gPearl', 4)).join('')}`, anim: 'orbitRev', origin: [120, 120] },
        ...sparkles([[20, 30, 7], [220, 40, 6], [226, 200, 7], [14, 206, 5], [120, 6, 6]], '#e6d8ff')];
    }
    case 29: { // LEGENDARY · Golden masjid: domes and minarets rising behind, a crescent on the dome, stars
      const minaret = (x: number) => `<path d="M${x - 7} 232V96H${x + 7}V232Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3"/><path d="M${x - 10} 96H${x + 10}V90H${x - 10}Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4"/><path d="M${x - 7} 90C${x - 7} 76 ${x} 64 ${x} 56C${x} 64 ${x + 7} 76 ${x + 7} 90Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${x - 3} 110V220" stroke="#fff" stroke-width="2" opacity=".6"/>`;
      return [
        { z: 'back', svg: `<circle cx="120" cy="120" r="114" fill="url(#gGlow)"/>`, anim: 'pulse', origin: [120, 120] },
        { z: 'back', svg: `${minaret(18)}${minaret(222)}<path d="M26 130C26 50 70 6 120 -8C170 6 214 50 214 130Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3.4" stroke-linejoin="round"/><path d="M48 80C60 44 86 18 112 6" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".75"/>${[[60, 70], [180, 70], [120, 20]].map(([x, y]) => `<path d="${khatam(x, y, 7)}" fill="#fff3b0" stroke="${OL}" stroke-width="1.4"/>`).join('')}`, box: [0, -30, 240, 270] },
        { z: 'front', svg: `${ring(84, 8, 'gGold')}<path d="M0 222H240V240H0Z" fill="url(#gGold)" stroke="${OL}" stroke-width="3"/>${[30, 70, 110, 150, 190].map((x) => `<path d="M${x} 240V230C${x} 224 ${x + 10} 224 ${x + 10} 230V240Z" fill="${OL}"/>`).join('')}` },
        { z: 'back', svg: `<path d="M120 -8V-18" stroke="${OL}" stroke-width="3"/><path d="M129 -44C116 -44 108 -34 108 -26C108 -16 116 -8 129 -8C122 -12 118 -18 118 -26C118 -34 122 -40 129 -44Z" fill="url(#gMoon)" stroke="${OL}" stroke-width="2.6"/>`, box: [100, -50, 40, 46], anim: 'bob' },
        ...motes([50, 190]),
        ...sparkles([[56, 20, 6], [186, 20, 6], [18, 40, 5], [222, 40, 5]])];
    }
    case 30: { // LEGENDARY · Eid fireworks: bursts of colour going off behind, bunting and gold stars
      const burst = (x: number, y: number, R: number, g: string) => `${Array.from({ length: 12 }, (_, k) => { const a = (k * 30 * Math.PI) / 180; return `<path d="M${f(x + Math.cos(a) * R * .3)} ${f(y + Math.sin(a) * R * .3)}L${f(x + Math.cos(a) * R)} ${f(y + Math.sin(a) * R)}" stroke="url(#${g})" stroke-width="4" stroke-linecap="round"/><circle cx="${f(x + Math.cos(a) * R)}" cy="${f(y + Math.sin(a) * R)}" r="3" fill="#fff"/>`; }).join('')}`;
      const fw: Piece[] = [[44, 44, 36, 'gRed', 0], [196, 50, 40, 'gTeal', .7], [30, 170, 28, 'gViolet', 1.4], [210, 176, 32, 'gGold', 1.0], [120, 14, 26, 'gRose', 1.7]].map(([x, y, R, g, d]) => ({ z: 'back', svg: burst(x as number, y as number, R as number, g as string), box: [(x as number) - (R as number) - 4, (y as number) - (R as number) - 4, 2 * (R as number) + 8, 2 * (R as number) + 8], anim: 'burst', delay: d as number, origin: [x as number, y as number] }));
      const cols = ['gRed', 'gGold', 'gTeal', 'gViolet'];
      let flags = '';
      for (let i = 0; i < 11; i++) { const [x, y] = at(92, 200 + i * 14); flags += `<path d="M${f(x - 8)} ${f(y)}L${f(x + 8)} ${f(y)}L${f(x)} ${f(y + 16)}Z" fill="url(#${cols[i % 4]})" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round" transform="rotate(${200 + i * 14 + 90} ${f(x)} ${f(y)})"/>`; }
      return [...fw, { z: 'front', svg: `${ring(84, 9, 'gGold')}${flags}` }, ...sparkles([[120, 226, 7], [70, 214, 5], [170, 214, 5]])];
    }
    case 31: { // LEGENDARY · Oasis: two palms leaning in, water shimmering below, a low sun
      const palm = (x: number, flip: number) => `<g transform="translate(${x} 0) scale(${flip} 1)"><path d="M4 236C6 180 10 120 20 64" stroke="${OL}" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M4 236C6 180 10 120 20 64" stroke="#c8833a" stroke-width="7" fill="none" stroke-linecap="round"/>
        ${[[-60, 1.3], [-20, 1.2], [20, 1.25], [60, 1.1], [-100, 1], [100, 1]].map(([a, s]) => leaf(20, 64, a - 90 + 30 + (a > 0 ? 40 : 0), s * 1.35)).join('')}<circle cx="16" cy="74" r="5" fill="#a5521a" stroke="${OL}" stroke-width="1.6"/><circle cx="24" cy="76" r="5" fill="#a5521a" stroke="${OL}" stroke-width="1.6"/></g>`;
      return [
        { z: 'back', svg: `<circle cx="120" cy="150" r="104" fill="url(#gGlow)"/><circle cx="120" cy="170" r="54" fill="${OL}"/><circle cx="120" cy="170" r="51" fill="url(#gGold)"/>`, anim: 'pulse', origin: [120, 170] },
        { z: 'front', svg: `${ring(84, 8, 'gTeal', '#d8fff8')}` },
        { z: 'front', svg: `${palm(0, 1)}${palm(240, -1)}`, box: [-20, 0, 280, 240] },
        { z: 'front', svg: `<path d="M10 222C50 212 190 212 230 222C200 236 40 236 10 222Z" fill="url(#gTeal)" stroke="${OL}" stroke-width="3"/><path d="M40 222H80M120 226H170M90 230H110" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`, box: [4, 206, 232, 34], anim: 'bob' },
        ...sparkles([[90, 224, 5], [160, 222, 4], [200, 40, 6], [40, 30, 5]])];
    }
  }
  return [];
}

/** The decoration ids that exist: the 20 frames and the premium ones. */
export const DECO_IDS = Array.from({ length: 32 }, (_, i) => i);
export const PREMIUM: Record<number, { r: 'legendary' | 'mythic'; name: string }> = {
  26: { r: 'mythic', name: 'Laylat al-Qadr' }, 27: { r: 'mythic', name: 'Gates of light' }, 28: { r: 'mythic', name: 'Celestial orbit' },
  29: { r: 'legendary', name: 'Golden masjid' }, 30: { r: 'legendary', name: 'Eid fireworks' }, 31: { r: 'legendary', name: 'Oasis' },
};

/** One piece as a standalone SVG image (its own defs, cropped to its box). */
export function pieceSvg(p: Piece): string {
  const [x, y, w, h] = p.box ?? [0, 0, 240, 240];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" overflow="visible">${DEFS}${HQ_DEFS}${p.svg}</svg>`;
}
