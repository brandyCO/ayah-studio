// Characters for Ranks (owner request 2026-11-10): a person built from parts, drawn in code in the reward
// art style (flat shapes in two tones, light from the top left, a soft ground shadow). Faces are the user's
// choice and off by default (owner decision 2026-11-10). No photos, no real people.
// A character is 14 base-36 digits, one per slot (SLOTS); the server checks only the format and the prize
// outfit (rank_set_figure), the rest is ours to draw. Round 5 (owner request 2026-11-11, "optimise faces and hair…
// the expressions are basic"): 8 more slots (face details, age, hijab style, cloth pattern, accessory), written only
// when one is set, so a code is 14 digits as before or 22.

export const SLOTS = ['face', 'skin', 'body', 'hair', 'hairC', 'beard', 'head', 'headC', 'outfit', 'outC', 'glasses', 'hold', 'pose', 'bg',
  'eyes', 'brows', 'mouth', 'cheeks', 'age', 'wrap', 'pattern', 'acc'] as const;
/** The slots added in round 5 (digits 15–22). */
const EXTRA = 14;
export type Slot = (typeof SLOTS)[number];
export type Fig = Record<Slot, number>;

type Pair = [string, string];
const SKIN: Pair[] = [['#f6d5b8', '#d9a882'], ['#f0c39b', '#cf9a6e'], ['#e0a676', '#bf7c4f'], ['#c98b5b', '#9f6638'],
  ['#a8693f', '#7f4a26'], ['#8f5a39', '#6a3c22'], ['#6e4129', '#4c2916'], ['#4f2e1d', '#33190d']];
const HAIR: Pair[] = [['#2a1c14', '#140c07'], ['#4b2e1b', '#2a190d'], ['#7a4a26', '#4f2d13'], ['#b07a3e', '#7d5122'],
  ['#e0b46a', '#b08438'], ['#a3a9b1', '#6c727a'], ['#efece4', '#c3bfb4']];
const CLOTH: Pair[] = [['#f7f5ef', '#cfc6b4'], ['#efe2c6', '#c8b48c'], ['#d8b98c', '#a88656'], ['#9aa3b0', '#6b7482'],
  ['#2f3f6b', '#1b2645'], ['#2a2d38', '#15171e'], ['#2fb06a', '#1b7a47'], ['#4a8fe0', '#2a62b0'], ['#a83246', '#701c2c'], ['#7a5cd0', '#5038a0']];
const HEADC: Pair[] = [['#ffffff', '#c9bfae'], ['#22232b', '#0b0b10'], ['#2f3f6b', '#1b2645'], ['#2fb06a', '#1b7a47'],
  ['#a83246', '#701c2c'], ['#7a5cd0', '#5038a0'], ['#e08aa8', '#b45c7c'], ['#d8b98c', '#a88656']];
/** Disc colours behind the character (light, dark): 6 free, 2 bought. */
export const BG: Pair[] = [['#5b8cf0', '#2f5fc4'], ['#3fd0b4', '#13836f'], ['#a98af0', '#6142c4'], ['#ffc55a', '#d98a10'],
  ['#ff9aa8', '#d2566c'], ['#79d46a', '#3a9a2c'], ['#3b4a7a', '#121a36'], ['#ffe08a', '#c47f10'],
  // 8 aurora and 9 sun rays: weekly prize pieces (PIECES)
  ['#3dd1ad', '#5b3fc4'], ['#ffd25e', '#e0761f'],
  // 10 night garden (a 30-day streak), 11 Eid lights (Eid al-Adha), 12 Night of Qadr (the last ten nights of Ramadan)
  ['#33459a', '#0d1433'], ['#ff9a6b', '#b23a6e'], ['#4b3a9e', '#0c0a2c']];
export const SWATCH: Record<'skin' | 'hairC' | 'headC' | 'outC' | 'bg', Pair[]> = { skin: SKIN, hairC: HAIR, headC: HEADC, outC: CLOTH, bg: BG };

const MAN = 0, WOMAN = 1, BOY = 2, GIRL = 3;
const female = (b: number) => b === WOMAN || b === GIRL;
/** The choices each slot offers for a body (man, woman, boy, girl). */
export function options(slot: Slot, f: Fig): number[] {
  const b = f.body;
  const n = (k: number) => Array.from({ length: k }, (_, i) => i);
  switch (slot) {
    case 'face': return [0, 1];
    case 'skin': return n(SKIN.length);
    case 'body': return [MAN, WOMAN, BOY, GIRL];
    case 'hair': return b === WOMAN ? [] : b === GIRL ? [4, 5, 10, 11, 2, 9] : b === BOY ? [1, 6, 7, 8, 2, 3, 9] : [1, 6, 7, 8, 2, 3, 9, 0];
    case 'hairC': return n(HAIR.length);
    case 'beard': return b === MAN ? [0, 1, 2, 3] : [];
    case 'head': return b === MAN ? [0, 1, 7, 2, 3, 6] : b === BOY ? [0, 1, 7, 2, 6] : b === WOMAN ? [4, 5] : [0, 4, 6];
    case 'headC': return n(HEADC.length);
    case 'outfit': return [...(b === MAN ? [0, 1, 2, 12, 13, 14, 15, 6] : b === BOY ? [0, 1, 2, 12, 13, 14] : b === WOMAN ? [3, 4, 12, 13, 15, 16, 6] : [3, 2, 12, 13, 16]), 7, 8, 9, 10, 11];
    case 'outC': return n(CLOTH.length);
    case 'glasses': return [0, 1, 2, 3];
    case 'hold': return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    case 'pose': return [0, 1];
    case 'bg': return n(BG.length);
    // Round 5. The face slots keep their value while the face is off (the builder hides them then).
    case 'eyes': return [0, 1, 2, 3, 4];
    case 'brows': return [0, 1, 2, 3];
    case 'mouth': return [0, 1, 2, 3];
    case 'cheeks': return [0, 1, 2, 3, 4];
    case 'age': return [0, 1];
    case 'wrap': return f.head === 4 || f.head === 5 ? [0, 1, 2, 3] : [];
    case 'pattern': return PATTERNED.has(f.outfit) ? [0, 1, 2, 3, 4] : [];
    case 'acc': return [0, 1, 2, 3, 4];
  }
}
/** Outfits a pattern can go on (the earned robes and the champion's keep their own look). */
const PATTERNED = new Set([0, 1, 2, 3, 4, 12, 13, 14, 15, 16]);
/** Whether the head is covered so no hair shows (shemagh, turban, hijab, niqab). */
export const hairHidden = (f: Fig) => f.head >= 2 && f.head <= 5;
/** Whether the hair shows (not covered, not bald). */
export const hairShows = (f: Fig) => !hairHidden(f) && f.hair > 0 && options('hair', f).length > 0;

/** Parts bought with Light (`fg:{slot}:{value}` in the shop), and the one only a week at #1 gives. */
export const PRICE: Record<string, number> = { 'head:3': 150, 'outfit:1': 120, 'outfit:4': 120, 'hold:5': 100, 'bg:6': 80, 'bg:7': 120,
  'outfit:15': 120, 'pattern:4': 80, 'acc:1': 60 };
export const PRIZE = 'outfit:6';
/** Weekly prize pieces (owner request 2026-11-10): a league's top 3 win the week's piece, in turn, back after
 *  6 weeks (server: rank_prize_piece); never sold. Kept as `fg:{slot}:{value}` once claimed. */
export const PIECES = ['outfit:7', 'hold:6', 'glasses:3', 'bg:8', 'hold:7', 'bg:9'];
export const isPiece = (slot: string, v: number) => PIECES.includes(`${slot}:${v}`) || !!WARDROBE[`${slot}:${v}`];
/** The wardrobe (owner request 2026-11-10, "amazing, beautiful, premium and cute depending on the rarity"): pieces
 *  that are earned, never sold. How: a week in a league's top 3, a streak reached, or a season of the year (kept for
 *  good once earned; seasons come back every year). */
export type Rarity = 'cute' | 'rare' | 'epic' | 'legendary';
export type How = 'week' | 's7' | 's30' | 's100' | 's365' | 'ramadan' | 'qadr' | 'fitr' | 'hajj' | 'adha';
export const WARDROBE: Record<string, { r: Rarity; how: How }> = {
  'glasses:3': { r: 'cute', how: 'week' }, 'hold:7': { r: 'cute', how: 'week' }, 'hold:6': { r: 'rare', how: 'week' },
  'bg:8': { r: 'rare', how: 'week' }, 'bg:9': { r: 'epic', how: 'week' }, 'outfit:7': { r: 'epic', how: 'week' },
  'hold:8': { r: 'cute', how: 's7' }, 'bg:10': { r: 'rare', how: 's30' }, 'outfit:8': { r: 'epic', how: 's100' },
  'outfit:9': { r: 'legendary', how: 's365' },
  'hold:9': { r: 'rare', how: 'ramadan' }, 'outfit:10': { r: 'epic', how: 'fitr' }, 'outfit:11': { r: 'rare', how: 'hajj' },
  'bg:11': { r: 'epic', how: 'adha' },
  // The Ramadan season (2026-11-11): the Musaharati's suhoor drum, the iftar dates, the Night of Qadr sky.
  'hold:10': { r: 'epic', how: 'ramadan' }, 'hold:11': { r: 'cute', how: 'ramadan' }, 'bg:12': { r: 'legendary', how: 'qadr' },
  'outfit:6': { r: 'legendary', how: 'week' },
};
/** The week's piece (week 0 = 2026-11-09), as the server gives it. */
export function weekPiece(week: string): string {
  const k = Math.round((Date.parse(`${week}T12:00Z`) - Date.parse('2026-11-09T12:00Z')) / 6048e5);
  return PIECES[((k % 6) + 6) % 6];
}
/** A character wearing a piece: the given one (or the default) with it on. */
export function wearing(f: Fig | null, piece: string): Fig {
  const [slot, v] = piece.split(':');
  const g = { ...(f ?? DEFAULT), [slot]: Number(v) } as Fig;
  if (slot === 'hold' && g.pose === 1 && g.hold !== 3) g.pose = 0;
  return normalize(g);
}

/** Keeps every slot to what the body offers; a book stand needs sitting. */
export function normalize(f: Fig): Fig {
  const g = { ...f };
  for (const s of SLOTS) {
    const o = options(s, g);
    if (!o.length) g[s] = 0;
    else if (!o.includes(g[s])) g[s] = o[0];
  }
  if (g.hold === 3) g.pose = 1;
  return g;
}
export const DEFAULT: Fig = normalize({ face: 0, skin: 2, body: MAN, hair: 1, hairC: 0, beard: 1, head: 1, headC: 0, outfit: 0, outC: 0, glasses: 0, hold: 1, pose: 0, bg: 0,
  eyes: 0, brows: 0, mouth: 0, cheeks: 0, age: 0, wrap: 0, pattern: 0, acc: 0 });
/** 14 digits, or 22 when a round-5 slot is set (so a character made before stays the same code). */
export function encode(f: Fig): string {
  const all = SLOTS.map((s) => (f[s] ?? 0).toString(36)).join('');
  return /^0+$/.test(all.slice(EXTRA)) ? all.slice(0, EXTRA) : all;
}
/** A well-formed character code (14 or 22 base-36 digits). */
export const FIG_CODE = /^[0-9a-z]{14}(?:[0-9a-z]{8})?$/;
export function parse(code: string | null | undefined): Fig | null {
  if (!code || !FIG_CODE.test(code)) return null;
  const f = {} as Fig;
  SLOTS.forEach((s, i) => { f[s] = i < code.length ? parseInt(code[i], 36) : 0; });
  return normalize(f);
}
export function random(keepFace: number): Fig {
  const f = { ...DEFAULT, body: Math.floor(Math.random() * 4) } as Fig;
  for (const s of SLOTS) {
    if (s === 'body') continue;
    const o = options(s, f).filter((v) => !PRICE[`${s}:${v}`] && `${s}:${v}` !== PRIZE && !isPiece(s, v) && !(s === 'hold' && v === 3));
    if (o.length) f[s] = o[Math.floor(Math.random() * o.length)];
  }
  f.face = keepFace;
  if (Math.random() < 0.8) f.age = 0;
  if (Math.random() < 0.5) f.pattern = 0;
  if (Math.random() < 0.6) f.acc = 0;
  return normalize(f);
}

// --- drawing (viewBox 0 0 200 262; the ground at y 250) ---
let uid = 0;
/** A shape in two tones: the shade underneath, the base shifted up-left and clipped to the shape. */
function S(d: string, base: string, shade: string, dx = -6, dy = -5) {
  const id = `fg${++uid}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${shade}"/><path d="${d}" fill="${base}" transform="translate(${dx} ${dy})" clip-path="url(#${id})"/>`;
}
const circ = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const arm = (x1: number, y1: number, x2: number, y2: number, [base, shade]: Pair, w = 20) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${shade}" stroke-width="${w + 2}" stroke-linecap="round"/><path d="M${x1 - 2} ${y1 - 2}L${x2 - 2} ${y2 - 2}" stroke="${base}" stroke-width="${w - 3}" stroke-linecap="round"/>`;
const shine = (d: string, w = 4, o = 0.2) => `<path d="${d}" stroke="#fff" stroke-width="${w}" stroke-linecap="round" fill="none" opacity="${o}"/>`;

function robeBody(f: Fig): string {
  const c = CLOTH[f.outC];
  const sit = f.pose === 1;
  const hem = sit ? 214 : 240;
  let s = '';
  const robe = `M66 150Q100 140 134 150Q150 158 152 180L160 ${hem - 8}Q161 ${hem + 2} 150 ${hem + 2}H50Q39 ${hem + 2} 40 ${hem - 8}L48 180Q50 158 66 150Z`;
  if (f.outfit === 6 && female(f.body)) {
    // The champion's abaya: black with wide gold bands.
    if (sit) s += S('M40 224Q100 196 160 224Q166 240 150 242H50Q34 240 40 224Z', '#2a2d38', '#15171e');
    s += S(robe, '#2a2d38', '#15171e', -8, -4);
    s += `<path d="M100 156V${hem}M58 ${hem - 6}Q100 ${hem - 14} 142 ${hem - 6}" stroke="#f2c14e" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M100 156V${hem}" stroke="#fff2b8" stroke-width="1.6" opacity=".7"/>`;
    return s + shine('M58 168Q60 156 72 152', 4, 0.15);
  }
  if (f.outfit >= 8 && f.outfit <= 11) return s + robeOf(f, robe, hem, sit);
  if (f.outfit === 7) {
    // The robe of light (a weekly prize): deep emerald with gold borders, a row of small gold stars, a glow at the hem.
    const g: Pair = ['#16a37a', '#0a5a43'];
    if (sit) s += S('M40 224Q100 196 160 224Q166 240 150 242H50Q34 240 40 224Z', g[0], g[1]);
    s += S(robe, g[0], g[1], -8, -4);
    s += `<path d="M82 151L100 176L118 151M100 176V${hem}M52 ${hem - 6}Q100 ${hem - 15} 148 ${hem - 6}" stroke="#a8740f" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(1 2)"/>`
      + `<path d="M82 151L100 176L118 151M100 176V${hem}M52 ${hem - 6}Q100 ${hem - 15} 148 ${hem - 6}" stroke="#f2c14e" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M84 152L100 174M100 178V${hem - 4}" stroke="#fff2b8" stroke-width="1.6" opacity=".75" fill="none"/>`;
    for (const [x, y] of [[70, 196], [130, 196], [64, 216], [136, 216]]) {
      if (y > hem - 14) continue;
      const st = `M${x} ${y - 6}L${x + 1.8} ${y - 1.8}L${x + 6} ${y}L${x + 1.8} ${y + 1.8}L${x} ${y + 6}L${x - 1.8} ${y + 1.8}L${x - 6} ${y}L${x - 1.8} ${y - 1.8}Z`;
      s += `<path d="${st}" fill="#a8740f" transform="translate(.6 1)"/><path d="${st}" fill="#f2c14e"/>`;
    }
    return s + shine('M58 168Q60 156 72 152', 4, 0.22) + `<ellipse cx="100" cy="${hem}" rx="54" ry="5" fill="#ffe7a3" opacity=".25" class="fg-glow"/>`;
  }
  if (f.outfit >= 12) return s + ummah(f, robe, hem, sit);
  const outfit = f.outfit === 6 ? 0 : f.outfit;
  if (sit) s += S('M40 224Q100 196 160 224Q166 240 150 242H50Q34 240 40 224Z', outfit === 2 ? ['#33415c', '#212b3f'][0] : c[0], outfit === 2 ? '#212b3f' : c[1]);
  s += S(robe, c[0], c[1], -8, -4) + pattern(f, robe, c, hem);
  if (outfit === 3 || outfit === 4) s += `<path d="${robe}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2.5"/>`;
  s += shine('M58 168Q60 156 72 152', 4, 0.18);
  if (outfit === 0) s += `<path d="M100 150v42" stroke="${c[1]}" stroke-width="3" stroke-linecap="round"/>${[160, 172, 184].map((y) => `<circle cx="100" cy="${y}" r="2.6" fill="${c[1]}"/>`).join('')}`;
  if (outfit === 1) {
    // Kurta with a vest over it.
    const v: Pair = f.outC === 5 ? ['#efe2c6', '#c8b48c'] : ['#2a2d38', '#15171e'];
    s += S(`M66 151Q52 160 52 182L50 ${hem - 30}H90L94 154Z`, v[0], v[1], -3, -3) + S(`M134 151Q148 160 148 182L150 ${hem - 30}H110L106 154Z`, v[0], v[1], -3, -3);
    s += `<path d="M90 160V${hem - 34}M110 160V${hem - 34}" stroke="#f2c14e" stroke-width="2" opacity=".75"/>`;
  }
  if (outfit === 2) s += S('M76 186h48v16q0 8 -8 8h-32q-8 0 -8 -8z', c[1], c[1]) + `<path d="M90 152v20M110 152v20" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/><circle cx="90" cy="174" r="2.5" fill="#fff"/><circle cx="110" cy="174" r="2.5" fill="#fff"/>`;
  if (outfit === 3) s += `<path d="M100 156v${hem - 160}" stroke="${c[1]}" stroke-width="3" opacity=".9"/>`;
  if (outfit === 4) {
    // Embroidered abaya: a gold line and stitched dots down the front and round the hem.
    s += `<path d="M100 156v${hem - 160}M60 ${hem - 4}Q100 ${hem - 12} 140 ${hem - 4}" stroke="#c9a24a" stroke-width="3" fill="none" opacity=".95"/>`;
    for (let y = 164; y < hem - 8; y += 9) s += `<circle cx="94" cy="${y}" r="1.6" fill="#f2c14e"/><circle cx="106" cy="${y}" r="1.6" fill="#f2c14e"/>`;
  }
  if (f.outfit === 6) {
    // The champion's bisht: a dark cloak with gold edges over the thobe.
    s += S(`M64 151Q46 158 44 184L36 ${hem - 6}Q36 ${hem + 2} 46 ${hem + 2}H70L82 152Z`, '#3e2a1a', '#1f140b') + S(`M136 151Q154 158 156 184L164 ${hem - 6}Q164 ${hem + 2} 154 ${hem + 2}H130L118 152Z`, '#3e2a1a', '#1f140b');
    s += `<path d="M72 152L66 ${hem}M128 152L134 ${hem}" stroke="#f2c14e" stroke-width="4" stroke-linecap="round"/><path d="M76 152L72 ${hem}M124 152L128 ${hem}" stroke="#fff2b8" stroke-width="1.5" opacity=".7"/>`;
  }
  return s;
}

/** The whole body: what is carried on the back, the clothes, then what sits on the front (straps, a pocket). */
function body(f: Fig): string {
  return back(f) + robeBody(f) + front(f);
}

/** Clothes from around the Ummah (round 5): 12 Moroccan djellaba, 13 shalwar kameez, 14 baju koko with a sarong,
 *  15 West African boubou, 16 Malay baju kurung. Colours from the outfit colour, a pattern where it fits. */
function ummah(f: Fig, robe: string, hem: number, sit: boolean): string {
  const c = CLOTH[f.outC];
  const lap = 'M40 224Q100 196 160 224Q166 240 150 242H50Q34 240 40 224Z';
  const gold = '#d9b35a', goldD = '#a27a24';
  let s = '';
  switch (f.outfit) {
    case 12: {
      // Djellaba: a long hooded robe, the hood lying round the neck, a braided front with small knotted buttons.
      if (sit) s += S(lap, c[0], c[1]);
      s += S(robe, c[0], c[1], -8, -4) + pattern(f, robe, c, hem);
      s += `<path d="M100 160V${hem - 6}" stroke="${c[1]}" stroke-width="7" stroke-linecap="round"/><path d="M100 160V${hem - 6}" stroke="${gold}" stroke-width="2.4" stroke-dasharray="3 3"/>`;
      for (let y = 164; y < Math.min(214, hem - 20); y += 7) s += `<circle cx="100" cy="${y}" r="2.6" fill="${goldD}"/><circle cx="99.4" cy="${y - .6}" r="1.6" fill="${gold}"/>`;
      s += S(`M62 154Q100 186 138 154Q136 140 120 140Q100 152 80 140Q64 140 62 154Z`, c[0], c[1], -3, -4)
        + `<path d="M70 150Q100 174 130 150" stroke="${c[1]}" stroke-width="2" fill="none" opacity=".7"/>`;
      return s + shine('M58 172Q60 160 70 156', 4, 0.2);
    }
    case 13: {
      // Shalwar kameez: a long shirt split at the sides over gathered trousers; women add a dupatta over the shoulders.
      const pants: Pair = ['#f3efe4', '#cfc8b4'];
      if (sit) s += S(lap, pants[0], pants[1]);
      else s += S(`M56 ${hem - 34}H98L96 ${hem}H54Z`, pants[0], pants[1], -3, -2) + S(`M102 ${hem - 34}H144L146 ${hem}H104Z`, pants[0], pants[1], -3, -2)
        + `<path d="M56 ${hem - 4}H96M104 ${hem - 4}H146" stroke="${pants[1]}" stroke-width="2.4"/>`;
      const k = sit ? robe : `M66 150Q100 140 134 150Q150 158 152 180L158 ${hem - 26}Q130 ${hem - 18} 116 ${hem - 22}L100 ${hem - 30}L84 ${hem - 22}Q70 ${hem - 18} 42 ${hem - 26}L48 180Q50 158 66 150Z`;
      s += S(k, c[0], c[1], -8, -4) + pattern(f, k, c, sit ? hem : hem - 24);
      s += `<path d="M88 150Q100 158 112 150" stroke="${c[1]}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M100 154V188" stroke="${c[1]}" stroke-width="2.6"/>`
        + [164, 174, 184].map((y) => `<circle cx="100" cy="${y}" r="1.9" fill="${c[1]}"/>`).join('');
      if (female(f.body)) {
        const w = HEADC[f.headC];
        s += S('M58 150Q100 192 142 150L150 172Q100 214 50 172Z', w[0], w[1], -3, -3) + `<path d="M56 166Q100 204 144 166" stroke="${w[1]}" stroke-width="2" fill="none" opacity=".6"/>`;
      }
      return s + shine('M58 168Q60 156 72 152', 4, 0.18);
    }
    case 14: {
      // Baju koko: a collarless shirt with an embroidered placket over a checked sarong.
      const sar: Pair = c === CLOTH[4] ? ['#5b2a3a', '#3a1624'] : ['#2f3f6b', '#1b2645'];
      const top = sit ? hem - 18 : hem - 46;
      const sr = `M46 ${top - 6}H154L160 ${hem - 8}Q161 ${hem + 2} 150 ${hem + 2}H50Q39 ${hem + 2} 40 ${hem - 8}Z`;
      s += S(sr, sar[0], sar[1], -4, -3) + clipped(sr, Array.from({ length: 12 }, (_, i) => `<path d="M${40 + i * 11} ${top - 6}V${hem + 2}" stroke="#fff" stroke-width="${i % 3 ? 1.4 : 3.4}" opacity="${i % 3 ? .18 : .26}"/>`).join('')
        + Array.from({ length: 6 }, (_, i) => `<path d="M40 ${top + i * 10}H160" stroke="#fff" stroke-width="${i % 2 ? 1.4 : 3.4}" opacity="${i % 2 ? .15 : .24}"/>`).join(''));
      const shirt = `M66 150Q100 140 134 150Q150 158 152 180L156 ${top + 4}Q100 ${top + 12} 44 ${top + 4}L48 180Q50 158 66 150Z`;
      s += S(shirt, c[0], c[1], -8, -4) + pattern(f, shirt, c, top);
      s += S(`M94 150H106V${top + 2}H94Z`, gold, goldD, -1, -1) + `<path d="M100 154V${top}" stroke="#fff3c4" stroke-width="1.4" stroke-dasharray="2 3"/>`
        + [160, 170, 180].map((y) => `<path d="M95 ${y}l5 3l5 -3" stroke="${goldD}" stroke-width="1.4" fill="none"/>`).join('');
      return s + shine('M58 168Q60 156 72 152', 4, 0.18);
    }
    case 15: {
      // Boubou: a wide flowing robe, a large embroidered panel at the neck.
      const wide = `M62 150Q100 140 138 150Q170 160 176 190L170 ${hem - 6}Q168 ${hem + 2} 156 ${hem + 2}H44Q32 ${hem + 2} 30 ${hem - 6}L24 190Q30 160 62 150Z`;
      if (sit) s += S('M30 224Q100 192 170 224Q176 240 158 242H42Q24 240 30 224Z', c[0], c[1]);
      s += S(wide, c[0], c[1], -9, -4) + pattern(f, wide, c, hem);
      s += `<path d="M44 ${hem - 4}Q100 ${hem - 14} 156 ${hem - 4}" stroke="${c[1]}" stroke-width="2.4" fill="none" opacity=".7"/>`;
      const panel = 'M80 150Q100 166 120 150L122 198Q100 214 78 198Z';
      s += S(panel, c[1], c[1]) + `<path d="${panel}" fill="none" stroke="${gold}" stroke-width="2.6" stroke-linejoin="round"/>`
        + `<path d="M86 160Q100 172 114 160M88 172Q100 182 112 172" stroke="${gold}" stroke-width="1.8" fill="none"/>`
        + [[100, 190, 6], [90, 182, 3], [110, 182, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${gold}" stroke-width="1.8"/><circle cx="${x}" cy="${y}" r="${r * .35}" fill="${gold}"/>`).join('');
      return s + shine('M46 176Q50 160 64 154', 4, 0.2);
    }
    default: {
      // Baju kurung: a knee-length tunic with a round neck and a brooch, over a long skirt with a woven gold band.
      const sk2: Pair = [shade(c[0], -.12), shade(c[1], -.12)];
      if (sit) s += S(lap, sk2[0], sk2[1]);
      s += S(robe, sk2[0], sk2[1], -8, -4);
      s += clipped(robe, `<path d="M36 ${hem - 18}H164" stroke="${gold}" stroke-width="8" opacity=".9"/>`
        + Array.from({ length: 14 }, (_, i) => `<path d="M${40 + i * 9} ${hem - 22}l4.5 4l-4.5 4l-4.5 -4z" fill="${goldD}"/>`).join(''));
      const tunic = `M66 150Q100 140 134 150Q150 158 152 180L156 ${sit ? hem - 14 : hem - 40}Q100 ${sit ? hem - 4 : hem - 30} 44 ${sit ? hem - 14 : hem - 40}L48 180Q50 158 66 150Z`;
      s += S(tunic, c[0], c[1], -8, -4) + pattern(f, tunic, c, hem - 36);
      s += `<path d="M86 151Q100 162 114 151" stroke="${c[1]}" stroke-width="3" fill="none"/>`
        + [162, 172, 182].map((y) => `<circle cx="100" cy="${y}" r="2.6" fill="${goldD}"/><circle cx="99.5" cy="${y - .5}" r="1.6" fill="#fff0b8"/>`).join('');
      return s + shine('M58 168Q60 156 72 152', 4, 0.18);
    }
  }
}

/** A colour made lighter (k > 0) or darker (k < 0). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
/** Markup clipped to a shape. */
function clipped(d: string, inner: string): string {
  const id = `fg${++uid}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
}
/** A pattern woven or stitched on the cloth (round 5): 1 embroidered trim, 2 stripes, 3 ikat, 4 zellige stars. */
function pattern(f: Fig, d: string, c: Pair, hem: number): string {
  if (!f.pattern || !PATTERNED.has(f.outfit)) return '';
  const ink = c[1], light = shade(c[0], .45);
  let g = '';
  if (f.pattern === 1) {
    g += `<path d="M30 ${hem - 12}H170" stroke="#d9b35a" stroke-width="7"/><path d="M30 ${hem - 12}H170" stroke="#fff0b8" stroke-width="1.6" stroke-dasharray="4 4"/>`;
    for (let x = 34; x < 170; x += 10) g += `<path d="M${x} ${hem - 22}l4 -4l4 4l-4 4z" fill="#d9b35a"/>`;
    g += '<path d="M78 148Q100 166 122 148" stroke="#d9b35a" stroke-width="5" fill="none"/>';
  } else if (f.pattern === 2) {
    for (let x = 30; x < 172; x += 10) g += `<path d="M${x} 140V${hem + 4}" stroke="${x % 20 ? light : ink}" stroke-width="${x % 20 ? 1.6 : 3.4}" opacity=".45"/>`;
  } else if (f.pattern === 3) {
    // Ikat: rows of diamonds with feathered edges, in two colours.
    for (let y = 168, r = 0; y < hem + 10; y += 20, r++) for (let x = 28 + (r % 2) * 14; x < 176; x += 28) {
      const dm = (k: number) => `M${x} ${y - 9 * k}L${x + 7 * k} ${y}L${x} ${y + 9 * k}L${x - 7 * k} ${y}Z`;
      g += `<path d="${dm(1.25)}" fill="${ink}" opacity=".28"/><path d="${dm(1)}" fill="${ink}" opacity=".5"/><path d="${dm(.45)}" fill="${light}" opacity=".7"/>`;
    }
  } else {
    // Zellige: eight-pointed stars in a grid.
    for (let y = 166, r = 0; y < hem + 10; y += 22, r++) for (let x = 30 + (r % 2) * 11; x < 176; x += 22) {
      g += `<path d="M${x - 5} ${y - 5}h10v10h-10z" fill="${light}" opacity=".5" transform="rotate(45 ${x} ${y})"/><path d="M${x - 5} ${y - 5}h10v10h-10z" fill="${light}" opacity=".5"/><circle cx="${x}" cy="${y}" r="2.2" fill="${ink}" opacity=".7"/>`;
    }
  }
  return clipped(d, g);
}

/** What is carried on the back (round 5): a rolled prayer mat over the shoulder, a backpack. */
function back(f: Fig): string {
  if (f.acc === 2) {
    const roll = '<path d="M34 120L150 236" stroke="#6a1622" stroke-width="20" stroke-linecap="round"/><path d="M32 117L148 233" stroke="#b8323f" stroke-width="14" stroke-linecap="round"/>'
      + '<path d="M44 124l-6 6M52 132l-6 6" stroke="#f2c14e" stroke-width="2.6" stroke-linecap="round"/>';
    return roll + '<ellipse cx="33" cy="119" rx="10" ry="8" transform="rotate(45 33 119)" fill="#d65a62"/><path d="M33 119m-5 0a5 4 45 1 0 6 -3" stroke="#7a1c27" stroke-width="1.6" fill="none"/>';
  }
  if (f.acc === 4) return S('M54 148Q54 130 70 130H130Q146 130 146 148V214H54Z', '#f0864a', '#b8501f', -4, -4) + '<path d="M66 136H134" stroke="#ffd2a8" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>';
  return '';
}
/** What sits on the front (round 5): backpack straps, a siwak in a chest pocket. */
function front(f: Fig): string {
  if (f.acc === 4) return [84, 116].map((x) => `<path d="M${x} 148V194" stroke="#b8501f" stroke-width="8" stroke-linecap="round"/><path d="M${x - 1} 148V192" stroke="#f0864a" stroke-width="4" stroke-linecap="round"/><rect x="${x - 5}" y="176" width="10" height="7" rx="2" fill="#ffd2a8"/>`).join('');
  if (f.acc === 3) {
    const c = sleeve(f);
    return '<path d="M84.5 168L87.5 146" stroke="#8a6232" stroke-width="5" stroke-linecap="round"/><path d="M84 168L87 147" stroke="#c99a5c" stroke-width="3" stroke-linecap="round"/>'
      + '<path d="M86 147l-1 -4M87.5 147l.4 -4.4M89 147.5l1.6 -3.6" stroke="#f3e2be" stroke-width="1.4" stroke-linecap="round"/>'
      + S('M78 160H93V172Q93 176 89 176H82Q78 176 78 172Z', shade(c[0], -.06), c[1], -1, -2) + `<path d="M78 162H93" stroke="${c[1]}" stroke-width="1.6"/>`;
  }
  return '';
}

/** The wardrobe's robes (8 midnight, 9 dawn, 10 Eid best, 11 white of Dhul Hijjah), for every body. */
const ROBE: Record<number, Pair> = { 8: ['#34448f', '#1b2556'], 9: ['#fffaf0', '#ead9b6'], 11: ['#ffffff', '#dcdfe6'] };
const eidCloth = (f: Fig): Pair => female(f.body) ? ['#f6a8bf', '#d0708e'] : ['#f4ead2', '#d4c39b'];
const star4 = (x: number, y: number, r: number) => `M${x} ${y - r}L${x + r * .3} ${y - r * .3}L${x + r} ${y}L${x + r * .3} ${y + r * .3}L${x} ${y + r}L${x - r * .3} ${y + r * .3}L${x - r} ${y}L${x - r * .3} ${y - r * .3}Z`;
function robeOf(f: Fig, robe: string, hem: number, sit: boolean): string {
  const c = f.outfit === 10 ? eidCloth(f) : ROBE[f.outfit];
  const lap = 'M40 224Q100 196 160 224Q166 240 150 242H50Q34 240 40 224Z';
  let s = '';
  if (f.outfit === 9) {
    // The robe of dawn (365 days, legendary): a soft sunrise behind, pearl cloth, a rose-gold sunrise at the hem.
    const gid = `fg${++uid}`;
    s += `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="#fff6d6" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd98a" stop-opacity=".45"/><stop offset="1" stop-color="#ffb28a" stop-opacity="0"/></radialGradient></defs>`
      + `<circle class="fg-glow" cx="100" cy="176" r="98" fill="url(#${gid})"/>`
      + [[34, 150, 5], [168, 140, 6], [24, 214, 4], [178, 206, 4.5], [52, 108, 3.5], [150, 100, 3.5]].map(([x, y, r]) => `<path class="fg-twinkle" d="${star4(x, y, r)}" fill="#fff3c4"/>`).join('');
  }
  if (sit) s += S(lap, c[0], c[1]);
  s += S(robe, c[0], c[1], -8, -4);
  if (f.outfit === 8) {
    // The midnight robe (100 days, epic): navy scattered with silver stars, a crescent on the chest, silver edges.
    s += `<path d="M84 151L100 172L116 151" stroke="#c9d4ff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const [x, y, r] of [[66, 190, 4], [134, 186, 3.4], [78, 214, 3], [124, 220, 4.2], [96, 200, 2.4], [112, 236, 2.6], [60, 230, 2.4], [142, 232, 2.8]]) {
      if (y > hem - 8) continue;
      s += `<path d="${star4(x, y, r)}" fill="#e8eeff"/><circle cx="${x}" cy="${y}" r="${r * 1.8}" fill="#c9d4ff" opacity=".18"/>`;
    }
    s += `<path d="M112 166a8 8 0 1 0 0 14a6.4 6.4 0 1 1 0 -14z" fill="#f2d98a"/>`;
    s += `<path d="M52 ${hem - 6}Q100 ${hem - 15} 148 ${hem - 6}" stroke="#c9d4ff" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  if (f.outfit === 9) {
    const band = `M44 ${hem - 22}Q100 ${hem - 36} 156 ${hem - 22}L158 ${hem - 6}Q100 ${hem - 18} 42 ${hem - 6}Z`;
    s += S(band, '#ffb28a', '#e9806a', -2, -2) + `<path d="M46 ${hem - 12}Q100 ${hem - 25} 154 ${hem - 12}" stroke="#ffe0a8" stroke-width="3" fill="none" opacity=".9"/>`;
    s += `<path d="M82 151L100 176L118 151" stroke="#e8b24a" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M100 176V${hem - 30}" stroke="#e8b24a" stroke-width="4" stroke-linecap="round"/>`
      + `<circle cx="100" cy="186" r="7" fill="#ffd25e"/><circle cx="100" cy="186" r="3.4" fill="#fff6d0"/>`
      + Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<path d="M${100 + Math.cos(a) * 9} ${186 + Math.sin(a) * 9}L${100 + Math.cos(a) * 13} ${186 + Math.sin(a) * 13}" stroke="#ffd25e" stroke-width="2" stroke-linecap="round"/>`; }).join('');
    for (const [x, y] of [[64, 172], [138, 178], [128, 206], [70, 212]]) s += `<path d="${star4(x, y, 3.2)}" fill="#ffd25e" class="fg-twinkle"/>`;
  }
  if (f.outfit === 10) {
    if (female(f.body)) {
      // Eid best (epic): a rose abaya with a vine of small flowers down the front and gold at the hem.
      s += `<path d="M100 156V${hem}" stroke="#b85a78" stroke-width="2.4"/>`;
      for (let y = 166; y < hem - 10; y += 15) {
        for (const x of [91, 109]) s += [0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; return `<circle cx="${x + Math.cos(a) * 3.2}" cy="${y + Math.sin(a) * 3.2}" r="2.4" fill="#fff4f7"/>`; }).join('') + `<circle cx="${x}" cy="${y}" r="1.8" fill="#f2c14e"/>`;
      }
      s += `<path d="M52 ${hem - 6}Q100 ${hem - 15} 148 ${hem - 6}" stroke="#f2c14e" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    } else {
      // Eid best (epic): a cream thobe with a gold-embroidered collar, placket and cuffs, a small flower at the chest.
      s += `<path d="M84 150Q100 160 116 150" stroke="#c9a24a" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M100 156V196" stroke="#c9a24a" stroke-width="5" stroke-linecap="round"/>`;
      for (let y = 162; y < 196; y += 8) s += `<path d="M96 ${y}l4 3l4 -3" stroke="#fff3c4" stroke-width="1.4" fill="none"/>`;
      s += [0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; return `<circle cx="${124 + Math.cos(a) * 3.4}" cy="${170 + Math.sin(a) * 3.4}" r="2.6" fill="#f08aa8"/>`; }).join('') + '<circle cx="124" cy="170" r="2" fill="#ffe08a"/>';
    }
  }
  if (f.outfit === 11) {
    // The white of Dhul Hijjah (rare): plain white with soft folds, light gathering at the hem.
    s += `<path d="M78 160Q74 200 70 ${hem - 6}M122 160Q126 200 130 ${hem - 6}M100 156V${hem - 4}" stroke="#e3e6ee" stroke-width="3" fill="none" stroke-linecap="round"/>`
      + `<ellipse cx="100" cy="${hem}" rx="60" ry="6" fill="#fff8de" opacity=".45" class="fg-glow"/>`;
  }
  return s + shine('M58 168Q60 156 72 152', 4, f.outfit === 9 || f.outfit === 11 ? 0.5 : 0.22);
}

/** The sleeve colour: the outfit's, the champion's (white thobe / black abaya) or the robe of light's emerald. */
function sleeve(f: Fig): Pair {
  if (f.outfit === 7) return ['#16a37a', '#0a5a43'];
  if (f.outfit === 10) return eidCloth(f);
  if (ROBE[f.outfit]) return ROBE[f.outfit];
  return f.outfit === 6 && !female(f.body) ? CLOTH[0] : f.outfit === 6 ? ['#2a2d38', '#15171e'] : CLOTH[f.outC];
}

/** Draws a watch on the first hand drawn (the left one), at the wrist: above the hand, or below it for a raised arm. */
function withWatch(f: Fig, hand: (x: number, y: number) => string, dir = -1) {
  let first = f.acc === 1;
  return (x: number, y: number) => {
    const s = hand(x, y);
    if (!first) return s;
    first = false;
    const wy = y + dir * 11;
    return s + `<rect x="${x - 8}" y="${wy - 3.4}" width="16" height="6.8" rx="3.4" fill="#2a2d38"/><circle cx="${x}" cy="${wy}" r="4.6" fill="#c4860f"/><circle cx="${x}" cy="${wy}" r="3.2" fill="#fff8e6"/><path d="M${x} ${wy}v-2.2M${x} ${wy}h1.8" stroke="#2a2d38" stroke-width=".9" stroke-linecap="round"/>`;
  };
}

function holds(f: Fig): string {
  const k = sleeve(f);
  const sk = SKIN[f.skin];
  const hand = withWatch(f, (x: number, y: number) => S(circ(x, y, 10), sk[0], sk[1], -3, -3));
  const sit = f.pose === 1;
  let s = '';
  switch (f.hold) {
    case 0:
      return sit ? arm(68, 160, 64, 204, k) + arm(132, 160, 136, 204, k) + hand(62, 208) + hand(138, 208)
        : arm(66, 160, 58, 210, k) + arm(134, 160, 142, 210, k) + hand(57, 214) + hand(143, 214);
    case 1:
      s += arm(70, 160, 76, 204, k) + arm(130, 160, 126, 196, k);
      for (let i = 0; i < 15; i++) {
        const a = -Math.PI / 2 + (i / 15) * Math.PI * 2;
        const x = 126 + Math.cos(a) * 12, y = 220 + Math.sin(a) * 18;
        s += `<circle cx="${x + 1}" cy="${y + 1}" r="4" fill="#3b1f6e"/><circle cx="${x}" cy="${y}" r="4" fill="#8e57e0"/><circle cx="${x - 1.2}" cy="${y - 1.2}" r="1.4" fill="#e3d2ff"/>`;
      }
      return s + '<path d="M126 238v12M122 250h8" stroke="#e0a526" stroke-width="4" stroke-linecap="round"/>' + hand(76, 206) + hand(126, 200);
    case 2:
      s += arm(70, 160, 72, 196, k) + arm(130, 160, 128, 196, k);
      s += S('M62 184L100 194L138 184V214L100 224L62 214Z', '#17845c', '#0e5a3e', -2, -3) + '<path d="M67 186L100 195L133 186V210L100 219L67 210Z" fill="#fbf4df"/><path d="M100 195V219" stroke="#d8c79c" stroke-width="2.5"/>'
        + [0, 1, 2, 3].map((i) => `<path d="M72 ${192 + i * 6}L95 ${198 + i * 6}M105 ${198 + i * 6}L128 ${192 + i * 6}" stroke="#c4b285" stroke-width="2" stroke-linecap="round"/>`).join('') + '<path d="M96 186l4 -6l4 6" fill="#e0a526"/>';
      return s + hand(66, 206) + hand(134, 206);
    case 3:
      s += arm(70, 160, 76, 198, k) + arm(130, 160, 124, 198, k);
      s += '<path d="M76 236L124 204M124 236L76 204" stroke="#7a4a22" stroke-width="7" stroke-linecap="round"/><path d="M77 235L123 205M123 235L77 205" stroke="#b9773d" stroke-width="3" stroke-linecap="round"/>';
      s += S('M64 196L100 206L136 196V214L100 222L64 214Z', '#17845c', '#0e5a3e', -2, -3) + '<path d="M68 196L100 205L132 196V211L100 218L68 211Z" fill="#fbf4df"/><path d="M100 205V218" stroke="#d8c79c" stroke-width="2"/>';
      return s + hand(76, 202) + hand(124, 202);
    case 4: {
      s += arm(68, 160, 78, 184, k) + arm(132, 160, 122, 184, k);
      const palm = (x: number, m: number) => S(`M${x - 12 * m} 178Q${x - 14 * m} 194 ${x} 196Q${x + 8 * m} 194 ${x + 8 * m} 186L${x + 10 * m} 170Q${x + 2 * m} 168 ${x - 2 * m} 176Z`, sk[0], sk[1], -2 * m, -3);
      return s + palm(84, 1) + palm(116, -1) + '<path d="M88 172q12 -14 24 0" stroke="#ffe7a3" stroke-width="2" fill="none" opacity=".6" class="fg-glow"/>';
    }
    case 6: {
      // The golden lantern (a weekly prize): pierced gold with a star, a bright flame, a wide glow.
      s += arm(70, 160, 74, 204, k) + arm(130, 160, 140, 192, k);
      s += '<circle cx="142" cy="222" r="38" fill="#ffd36b" opacity=".22" class="fg-glow"/><circle cx="142" cy="222" r="22" fill="#fff0b0" opacity=".25" class="fg-glow"/>';
      s += '<path d="M142 192v12" stroke="#8a5a1c" stroke-width="3"/><circle cx="142" cy="190" r="4" fill="none" stroke="#c48a1c" stroke-width="2.6"/>';
      s += S('M128 204h28l-5 8h-18z', '#ffd25e', '#c4860f', -1, -1) + S('M130 212Q142 206 154 212L152 240H132Z', '#ffcf55', '#c98a12', -2, -2)
        + '<path d="M135 216Q142 212 149 216L147.5 236H136.5Z" fill="#fff6d0"/><path d="M142 219q6 7 0 14q-6 -7 0 -14z" fill="#ff9d2e"/><path d="M142 224q3 4 0 8q-3 -4 0 -8z" fill="#fff3c4"/>'
        + '<path d="M142 213l1.4 3 3 .4-2.2 2 .6 3-2.8-1.5-2.8 1.5.6-3-2.2-2 3-.4z" fill="#fff3c4" opacity=".9"/>'
        + S('M128 240h28l-4 7h-20z', '#ffd25e', '#c4860f', -1, -1);
      return s + hand(74, 206) + hand(142, 196);
    }
    case 7: {
      // A jar of light (a weekly prize): a glass jar held in both hands, small lights drifting inside.
      s += arm(70, 160, 80, 200, k) + arm(130, 160, 120, 200, k);
      s += '<circle cx="100" cy="214" r="34" fill="#bdf7e6" opacity=".2" class="fg-glow"/>';
      s += S('M84 196Q84 188 92 188H108Q116 188 116 196V232Q116 240 108 240H92Q84 240 84 232Z', '#dff8f2', '#a9dccf', -2, -2)
        + '<path d="M86 198Q86 191 93 191H107Q114 191 114 198V231Q114 238 107 238H93Q86 238 86 231Z" fill="#163a35" opacity=".85"/>'
        + S('M88 180H112V190H88Z', '#c98b5b', '#8a5a2c', -1, -1);
      for (const [x, y, r] of [[95, 205, 3], [106, 214, 3.6], [97, 226, 2.6], [108, 230, 2.2], [102, 199, 2]]) {
        s += `<circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="#ffe7a3" opacity=".25"/><circle cx="${x}" cy="${y}" r="${r}" fill="#fff3c4" class="fg-glow"/>`;
      }
      return s + shine('M89 200V228', 3, .45) + hand(80, 204) + hand(120, 204);
    }
    case 8: {
      // A crescent balloon (7 days, cute): a puffy golden moon with a little star, on a string from a raised hand.
      s += arm(70, 160, 74, 204, k) + arm(130, 160, 150, 128, k);
      s += '<path d="M152 122Q160 96 166 70" stroke="#e8e2d0" stroke-width="1.6" fill="none"/>';
      const moon = 'M176 26a26 26 0 1 0 6 46a20 20 0 1 1 -6 -46z';
      s += `<path d="${moon}" fill="#c98a12" transform="translate(1.5 2.5)"/>` + S(moon, '#ffd25e', '#e9a51e', -3, -3)
        + shine('M152 44Q154 34 162 30', 3.4, .6) + `<path d="${star4(184, 44, 6)}" fill="#fff3c4"/>`
        + '<ellipse cx="160" cy="58" rx="4" ry="2.6" fill="#ff9aa8" opacity=".5"/>';
      return s + hand(74, 206) + hand(152, 122);
    }
    case 9: {
      // A Ramadan fanous (rare): a pierced brass lantern with red, green, blue and gold glass, a warm light inside.
      s += arm(70, 160, 74, 204, k) + arm(130, 160, 140, 192, k);
      s += '<circle cx="142" cy="224" r="36" fill="#ffcf7a" opacity=".22" class="fg-glow"/><path d="M142 190v12" stroke="#7a4a1c" stroke-width="3"/><circle cx="142" cy="188" r="3.6" fill="none" stroke="#b9862c" stroke-width="2.4"/>';
      s += S('M132 202h20l6 9h-32z', '#e0a33a', '#9c6a1a', -1, -1);
      const panes: [string, string][] = [['#ff5d6c', '#c22a3e'], ['#3cc98a', '#1d8a5a'], ['#4aa8ff', '#2366c4'], ['#ffd25e', '#d39a26']];
      panes.forEach(([a, b], i) => { const x = 128 + i * 7.2; s += S(`M${x} 212h7.2v22h-7.2z`, a, b, -1, -1); });
      s += '<rect x="134" y="216" width="16" height="15" rx="3" fill="#fff3c4" opacity=".8"/><path d="M142 218q4 5 0 10q-4 -5 0 -10z" fill="#ff9d2e"/>';
      s += '<path d="M128 212v22M135.2 212v22M142.4 212v22M149.6 212v22M156.8 212v22M126 212h32M126 234h32" stroke="#b9862c" stroke-width="1.6"/>';
      s += S('M126 234h32l-5 8h-22z', '#e0a33a', '#9c6a1a', -1, -1) + S('M136 242h12l-2 5h-8z', '#e0a33a', '#9c6a1a', -1, -1);
      return s + hand(74, 206) + hand(142, 196);
    }
    case 10: {
      // The Musaharati's suhoor drum (epic, Ramadan): a red and gold baza on a strap at the hip, a stick raised to beat it.
      s += arm(70, 160, 66, 202, k) + arm(130, 160, 146, 176, k);
      s += '<path d="M54 202Q62 172 80 158" stroke="#6a3c1a" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
      s += S('M44 206h44v20q-22 11 -44 0z', '#d0453c', '#8f2420', -2, -2)
        + '<path d="M46 214l6 6l6 -6l6 6l6 -6l6 6l6 -6l6 6" stroke="#ffd25e" stroke-width="2" fill="none" stroke-linejoin="round"/>'
        + S('M44 206a22 7 0 1 0 44 0a22 7 0 1 0 -44 0z', '#f6e7c6', '#cdb68a', -1, -1)
        + '<path d="M44 206a22 7 0 0 0 44 0" stroke="#b9862c" stroke-width="2" fill="none"/>' + shine('M50 214v8', 2.4, .35);
      s += '<path d="M146 176L96 200" stroke="#5a3214" stroke-width="5" stroke-linecap="round"/><path d="M146 176L97 199.5" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round"/>'
        + S(circ(96, 200, 4.6), '#f6e7c6', '#cdb68a', -1, -1);
      return s + hand(66, 204) + hand(146, 176);
    }
    case 11: {
      // Iftar dates (cute, Ramadan): a brass plate of dates held out in both hands, a glass of water on it.
      s += arm(70, 160, 72, 200, k) + arm(130, 160, 128, 200, k);
      s += S('M64 204a36 10 0 1 0 72 0a36 10 0 1 0 -72 0z', '#e8b04a', '#a8731e', -2, -2) + '<path d="M70 203a30 7 0 0 0 60 0" stroke="#fff3c4" stroke-width="1.6" fill="none" opacity=".55"/>';
      for (const [x, y, a] of [[80, 199, -20], [90, 196, 15], [100, 200, -8], [88, 203, 30], [76, 205, 10], [98, 206, -25]] as [number, number, number][]) {
        s += `<g transform="rotate(${a} ${x} ${y})"><ellipse cx="${x}" cy="${y + 1}" rx="7" ry="4.2" fill="#3a1608"/><ellipse cx="${x}" cy="${y}" rx="7" ry="4.2" fill="#7a3414"/><ellipse cx="${x - 2}" cy="${y - 1.4}" rx="3" ry="1.2" fill="#c06a3a" opacity=".7"/></g>`;
      }
      s += S('M112 178h16l-2 24h-12z', '#dff4ff', '#a8cfe0', -1, -1) + '<path d="M114.5 186h11l-1.3 14h-8.4z" fill="#7cc6ec" opacity=".55"/>' + shine('M115 181v17', 1.8, .7);
      return s + hand(68, 206) + hand(132, 206);
    }
    default:
      s += arm(70, 160, 74, 204, k) + arm(130, 160, 140, 192, k);
      s += '<circle cx="142" cy="224" r="30" fill="#ffd36b" opacity=".18" class="fg-glow"/><path d="M142 196v10" stroke="#8a5a1c" stroke-width="3"/>';
      s += S('M130 204h24l-4 6h-16z', '#d6952b', '#8f5c14', -1, -1) + S('M132 210h20l-2 30h-16z', '#eaa93a', '#a86d1a', -2, -2)
        + '<rect x="136" y="214" width="12" height="22" rx="4" fill="#fff3c4"/><path d="M142 219q5 6 0 12q-5 -6 0 -12z" fill="#ff9d2e"/>' + S('M130 240h24l-3 5h-18z', '#d6952b', '#8f5c14', -1, -1);
      return s + hand(74, 206) + hand(142, 196);
  }
}

/** Expressions (round 5) an actor can show for a moment: classes `xp-{name}` on the character (actor.ts). */
export const XPS = ['happy', 'wow', 'sleepy', 'calm', 'proud', 'star'] as const;
export type Xp = (typeof XPS)[number];

const DARK = '#26160f';
/** Eyes: a kind from the face (0 round, 1 almond, 2 big, 3 lashes, 4 smiling) or an expression's. */
function eyes(kind: number | Xp, ey: number, sk: Pair, older: boolean): string {
  const at = [84, 116];
  const arc = (x: number, up: boolean, w = 3.4) => `<path d="M${x - 6.5} ${ey + (up ? 2 : -1)}Q${x} ${ey + (up ? -6 : 5)} ${x + 6.5} ${ey + (up ? 2 : -1)}" stroke="${DARK}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const dot = (x: number, rx: number, ry: number, hi = 1.9) => `<ellipse cx="${x}" cy="${ey}" rx="${rx}" ry="${ry}" fill="${DARK}"/><circle cx="${x + rx * .32}" cy="${ey - ry * .38}" r="${hi}" fill="#fff"/><circle cx="${x - rx * .35}" cy="${ey + ry * .42}" r="${hi * .45}" fill="#fff" opacity=".8"/>`;
  let s = '';
  if (kind === 'happy' || kind === 'proud' || kind === 4) s = at.map((x) => arc(x, true, kind === 4 ? 3 : 3.6)).join('');
  else if (kind === 'sleepy') s = at.map((x) => arc(x, false, 3)).join('');
  else if (kind === 'calm') s = at.map((x) => `<path d="M${x - 6} ${ey - 1}Q${x} ${ey + 7} ${x + 6} ${ey - 1}Z" fill="${DARK}"/><path d="M${x - 7} ${ey - 1.6}Q${x} ${ey - 3} ${x + 7} ${ey - 1.6}" stroke="${sk[1]}" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="${x + 2}" cy="${ey + 1.2}" r="1.2" fill="#fff"/>`).join('');
  else if (kind === 'wow') s = at.map((x) => dot(x, 6.2, 7.8, 2.2)).join('');
  else if (kind === 'star') s = at.map((x) => `<path d="${star4(x, ey, 8)}" fill="#ffc533" stroke="#b8860b" stroke-width="1.2" stroke-linejoin="round"/><circle cx="${x - 2}" cy="${ey - 2.4}" r="1.5" fill="#fff"/>`).join('');
  else if (kind === 1) s = at.map((x, i) => {
    const o = i ? 1 : -1;
    return `<path d="M${x - 7 * o} ${ey + 1}Q${x - 1 * o} ${ey - 8} ${x + 7 * o} ${ey - 2}Q${x + 1 * o} ${ey + 6} ${x - 7 * o} ${ey + 1}Z" fill="${DARK}"/><path d="M${x + 6 * o} ${ey - 2}l${3 * o} -2" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/><circle cx="${x + 1.6}" cy="${ey - 2}" r="1.7" fill="#fff"/>`;
  }).join('');
  else if (kind === 2) s = at.map((x) => `<ellipse cx="${x}" cy="${ey}" rx="6.4" ry="7.8" fill="${DARK}"/><ellipse cx="${x}" cy="${ey + 1}" rx="4.2" ry="5.2" fill="#6b3f24"/><circle cx="${x}" cy="${ey + 1}" r="2.6" fill="${DARK}"/><circle cx="${x + 2.2}" cy="${ey - 3}" r="2.4" fill="#fff"/><circle cx="${x - 2.2}" cy="${ey + 3.4}" r="1.1" fill="#fff"/>`).join('');
  else if (kind === 3) s = at.map((x, i) => {
    const o = i ? 1 : -1;
    return dot(x, 5, 6.5) + `<path d="M${x + 4 * o} ${ey - 5}l${3.6 * o} -3M${x + 5.4 * o} ${ey - 2.4}l${4 * o} -1.2" stroke="${DARK}" stroke-width="1.8" stroke-linecap="round"/>`;
  }).join('');
  else s = at.map((x) => dot(x, 5, 6.5)).join('');
  // Smile lines at the outer corners for an older face.
  if (older) s += at.map((x, i) => { const o = i ? 1 : -1; return `<path d="M${x + 9 * o} ${ey - 3}l${4 * o} -2M${x + 9.5 * o} ${ey + 1}l${4.5 * o} 0M${x + 9 * o} ${ey + 4.6}l${4 * o} 2" stroke="${sk[1]}" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>`; }).join('');
  return s;
}
/** Brows: 1 soft, 2 thick, 3 arched; an expression lifts or lowers them. */
function brows(kind: number, ey: number, col: string, xp: Xp | null): string {
  if (!kind) return '';
  const lift = xp === 'wow' ? -5 : xp === 'happy' || xp === 'star' ? -2 : xp === 'proud' ? -1.5 : xp === 'sleepy' || xp === 'calm' ? 1.5 : 0;
  const by = ey - 12 + lift;
  return [84, 116].map((x, i) => {
    const o = i ? 1 : -1;
    const tilt = xp === 'calm' || xp === 'sleepy' ? 1.5 * o : 0;
    if (kind === 2) return `<path d="M${x - 7 * o} ${by + 1 + tilt}Q${x} ${by - 3} ${x + 7 * o} ${by + 1.4 - tilt}" stroke="${col}" stroke-width="4.8" fill="none" stroke-linecap="round"/>`;
    if (kind === 3) return `<path d="M${x - 7 * o} ${by + 1.6 + tilt}Q${x - 1 * o} ${by - 5} ${x + 7.5 * o} ${by + .6 - tilt}" stroke="${col}" stroke-width="2.7" fill="none" stroke-linecap="round"/>`;
    return `<path d="M${x - 6.5 * o} ${by + tilt}Q${x} ${by - 3} ${x + 6.5 * o} ${by - tilt}" stroke="${col}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
  }).join('');
}
/** Mouths: 0 smile, 1 open grin, 2 soft, 3 cheeky; or an expression's. */
function mouth(kind: number | Xp, my: number, beard: boolean): string {
  const lip = beard ? '#f3b9a6' : '#8a3b2a';
  const open = (w: number, d: number) => {
    const o = `M${100 - w} ${my - 1}Q100 ${my + 1.4} ${100 + w} ${my - 1}Q${100 + w - 2} ${my + d} 100 ${my + d}Q${100 - w + 2} ${my + d} ${100 - w} ${my - 1}Z`;
    return clipped(o, `<path d="${o}" fill="#6a2418"/><path d="M${100 - w} ${my - 3}H${100 + w}V${my + 2.6}H${100 - w}Z" fill="#fff"/><ellipse cx="100" cy="${my + d}" rx="${w * .55}" ry="${d * .42}" fill="#ff7f86"/>`)
      + (beard ? `<path d="${o}" fill="none" stroke="${lip}" stroke-width="1.6"/>` : '');
  };
  if (kind === 'happy' || kind === 'star' || kind === 1) return open(kind === 1 ? 11 : 12, kind === 1 ? 10 : 12);
  if (kind === 'wow') return `<ellipse cx="100" cy="${my + 4}" rx="4" ry="5.2" fill="#6a2418"/><ellipse cx="100" cy="${my + 6.4}" rx="2.4" ry="2" fill="#ff7f86"/>` + (beard ? `<ellipse cx="100" cy="${my + 4}" rx="4" ry="5.2" fill="none" stroke="${lip}" stroke-width="1.4"/>` : '');
  if (kind === 'sleepy') return `<ellipse cx="100" cy="${my + 3}" rx="2.6" ry="1.8" fill="#6a2418"/>`;
  if (kind === 'proud') return `<path d="M86 ${my}Q100 ${my + 11} 114 ${my}" stroke="${lip}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M85 ${my - 2}q-1.6 2 0 4M115 ${my - 2}q1.6 2 0 4" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  if (kind === 'calm' || kind === 2) return `<path d="M94 ${my + 1}Q100 ${my + 5} 106 ${my + 1}" stroke="${lip}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
  if (kind === 3) return `<path d="M91 ${my + 1.4}Q101 ${my + 7} 110 ${my - 2}" stroke="${lip}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M109 ${my - 3.4}q2 1 1.4 3" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return `<path d="M90 ${my}Q100 ${my + 8} 110 ${my}" stroke="${lip}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
}
/** The face's features for one expression (null = the face as built). */
function features(f: Fig, xp: Xp | null, ey: number, fr: number): string {
  const sk = SKIN[f.skin];
  const niqab = f.head === 5, beard = f.beard >= 2;
  const older = f.age === 1;
  const col = older ? '#b9bcc2' : HAIR[f.hairC][1];
  let s = '';
  // Cheeks: 0 as before (a blush without a beard), 1 none, 2 blush, 3 freckles, 4 both. Happy faces blush more.
  const cx = Math.min(28, fr - 10);
  const blush = (f.cheeks === 0 && !f.beard) || f.cheeks === 2 || f.cheeks === 4 || xp === 'happy' || xp === 'proud' || xp === 'star';
  if (blush && !niqab) s += [100 - cx, 100 + cx].map((x) => `<ellipse cx="${x}" cy="${ey + 12}" rx="6.5" ry="4.2" fill="#ff7d7d" opacity="${xp ? .45 : .35}"/>`).join('');
  if ((f.cheeks === 3 || f.cheeks === 4) && !niqab) s += [100 - cx, 100 + cx].map((x) => [[-3, -1], [1, -2.4], [3.4, 1], [-1, 2]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${ey + 10 + dy}" r="1.15" fill="${sk[1]}"/>`).join('')).join('');
  if (!niqab) {
    // A soft nose, and smile folds for an older face.
    s += `<path d="M97 ${ey + 8.5}Q100 ${ey + 11.5} 103 ${ey + 8.5}" stroke="${sk[1]}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (older && !f.beard) s += `<path d="M82 ${ey + 11}Q79 ${ey + 18} 84 ${ey + 23}M118 ${ey + 11}Q121 ${ey + 18} 116 ${ey + 23}" stroke="${sk[1]}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".8"/>`;
  }
  const open = !xp || xp === 'wow';
  const e = eyes(xp ?? f.eyes, ey, sk, older);
  s += open ? `<g class="fg-eyes">${e}</g>` : e;
  s += brows(f.brows || (xp === 'wow' ? 1 : 0), ey, col, xp);
  if (!niqab) {
    if (f.beard) s += `<path d="M86 ${ey + 14}Q100 ${ey + 8} 114 ${ey + 14}Q108 ${ey + 17} 100 ${ey + 14}Q92 ${ey + 17} 86 ${ey + 14}Z" fill="${HAIR[f.hairC][1]}"/>`;
    s += mouth(xp ?? f.mouth, ey + (f.beard ? 19 : 15), beard);
  }
  return s;
}

function head(f: Fig, o: { xp?: Xp; all?: boolean } = {}): string {
  const sk = SKIN[f.skin], hc = HAIR[f.hairC], wc = HEADC[f.headC];
  const covered = f.head === 4 || f.head === 5;
  const wrap = covered ? f.wrap : 0;
  const hx = 100, hy = 96;
  let s = '';
  // Behind the face: a khimar's cape, a wrapped hijab's volume, the cloth, back hair.
  if (wrap === 1) s += S('M40 142Q100 116 160 142L168 198Q100 220 32 198Z', wc[0], wc[1], -7, -4) + `<path d="M44 186Q100 206 156 186" stroke="${wc[1]}" stroke-width="2.4" fill="none" opacity=".6"/>`;
  if (wrap === 3) s += S(circ(100, 44, 24), wc[0], wc[1], -4, -4);
  if (covered) s += S('M50 104Q46 44 100 42Q154 44 150 104Q154 148 124 160L100 166L76 160Q46 148 50 104Z', wc[0], wc[1], -7, -5) + `<path d="M76 158Q100 150 124 158" stroke="${wc[1]}" stroke-width="3" fill="none"/>`;
  if (wrap === 3) s += `<g fill="none" stroke="${wc[1]}" stroke-width="3" stroke-linecap="round" opacity=".85"><path d="M60 66Q96 40 140 54"/><path d="M58 58Q104 34 136 46"/></g>`;
  if (f.head === 2) {
    // Shemagh: white cloth with a red (or the chosen colour's) check.
    const d = 'M50 96Q46 42 100 40Q154 42 150 96L160 156Q144 166 130 152L132 104H68L70 152Q56 166 40 156Z';
    const ink = f.headC === 0 ? '#cf3440' : wc[0];
    s += S(d, '#f7f4ec', '#d9cfbf', -6, -4) + clipped(d, `<g stroke="${ink}" stroke-width="2.2" opacity=".8">`
      + Array.from({ length: 12 }, (_, i) => `<path d="M${30 + i * 12} 30L${10 + i * 12} 170"/><path d="M${10 + i * 12} 30L${30 + i * 12} 170"/>`).join('') + '</g>');
  }
  const hair = hairShows(f);
  if (hair) s += hairBack(f, hc);
  const fr = covered ? 33 : 44, fy = covered ? hy + 8 : hy;
  s += S(circ(hx, fy, fr), sk[0], sk[1], -7, -6);
  if (!covered && f.head !== 2) s += S(circ(hx - fr + 2, fy + 4, 8), sk[0], sk[1], -2, -2) + S(circ(hx + fr - 2, fy + 4, 8), sk[0], sk[1], -2, -2)
    + `<path d="M${hx - fr + 1} ${fy + 1}q2 4 0 7M${hx + fr - 1} ${fy + 1}q-2 4 0 7" stroke="${sk[1]}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  if (f.beard) s += beardOf(f);
  if (f.head === 5) s += S('M66 104H134Q138 146 100 152Q62 146 66 104Z', wc[0], wc[1], -5, -3) + `<path d="M66 104H134" stroke="${wc[1]}" stroke-width="2.5"/>`;
  const ey = fy + (covered ? -2 : 2);
  if (f.face) {
    if (o.all) s += `<g class="fg-xp fg-x0">${features(f, null, ey, fr)}</g>` + XPS.map((x) => `<g class="fg-xp fg-x-${x}">${features(f, x, ey, fr)}</g>`).join('');
    else s += features(f, o.xp ?? null, ey, fr);
  }
  if (f.glasses === 1) s += `<g fill="none" stroke="#1e2733" stroke-width="3.2"><circle cx="84" cy="${ey}" r="12"/><circle cx="116" cy="${ey}" r="12"/><path d="M96 ${ey - 1}h8"/></g>`;
  if (f.glasses === 2) s += `<g fill="none" stroke="#1e2733" stroke-width="3.2"><rect x="71" y="${ey - 10}" width="26" height="19" rx="5"/><rect x="103" y="${ey - 10}" width="26" height="19" rx="5"/><path d="M97 ${ey - 2}h6"/></g>`;
  if (f.glasses === 3) s += `<g fill="none" stroke-width="3.4"><g stroke="#a8740f" transform="translate(.6 1.2)"><circle cx="84" cy="${ey}" r="12.5"/><circle cx="116" cy="${ey}" r="12.5"/><path d="M96.5 ${ey - 2}q3.5 -3 7 0"/></g><g stroke="#f2c14e"><circle cx="84" cy="${ey}" r="12.5"/><circle cx="116" cy="${ey}" r="12.5"/><path d="M96.5 ${ey - 2}q3.5 -3 7 0"/></g></g>`;
  if (f.glasses) s += `<path d="M77 ${ey - 6}l5 -3M109 ${ey - 6}l5 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
  s += shine(`M${hx - fr * 0.62} ${fy - fr * 0.55}Q${hx - fr * 0.2} ${fy - fr * 0.95} ${hx + fr * 0.15} ${fy - fr * 0.9}`, 4, 0.28);
  if (hair) s += hairFront(f, hc);
  if (f.head === 1) s += S('M58 82Q58 42 100 42Q142 42 142 82Q100 72 58 82Z', wc[0], wc[1], -5, -4) + `<path d="M60 78Q100 68 140 78" stroke="${wc[1]}" stroke-width="3" fill="none"/>`
    + [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${70 + i * 10}" cy="${62 + Math.abs(i - 3) * 2}" r="1.8" fill="${wc[1]}"/>`).join('');
  if (f.head === 2) s += S('M54 60Q100 46 146 60V70Q100 56 54 70Z', '#22232b', '#0b0b10', -2, -2) + S('M56 70Q100 58 144 70V77Q100 65 56 77Z', '#22232b', '#0b0b10', -2, -2);
  if (f.head === 3) {
    // Turban (imama): a wrapped dome with crossing folds and a tail at the side.
    s += S('M142 78Q160 100 150 136Q146 118 134 108Z', wc[0], wc[1], -2, -2);
    s += S('M54 84Q48 36 100 34Q152 36 146 84Q100 72 54 84Z', wc[0], wc[1], -6, -5);
    s += `<g fill="none" stroke="${wc[1]}" stroke-width="3" stroke-linecap="round"><path d="M58 70Q96 48 140 58"/><path d="M60 80Q104 54 144 72"/><path d="M66 52Q100 40 130 46"/></g>`;
    s += shine('M66 60Q84 44 104 42', 4, 0.3);
  }
  if (f.head === 6) {
    // A knitted cap.
    s += S('M58 84Q56 38 100 38Q144 38 142 84Z', wc[0], wc[1], -5, -4) + S('M54 76Q100 64 146 76V90Q100 78 54 90Z', wc[0], wc[1], -2, -3);
    s += `<g stroke="${wc[1]}" stroke-width="2" opacity=".7">${Array.from({ length: 9 }, (_, i) => `<path d="M${62 + i * 10} ${77 - Math.sin((i / 8) * Math.PI) * 4}v10"/>`).join('')}</g>`;
  }
  if (f.head === 7) {
    // Peci (songkok): a black velvet cap with a flat top, worn straight.
    const p: Pair = f.headC === 0 ? ['#2a2b33', '#0e0e13'] : wc;
    s += S('M60 80V54Q60 46 70 45Q100 41 130 45Q140 46 140 54V80Q100 70 60 80Z', p[0], p[1], -5, -4)
      + `<path d="M62 50Q100 44 138 50" stroke="#fff" stroke-width="2" fill="none" opacity=".18"/><path d="M60 78Q100 68 140 78" stroke="${f.headC === 0 ? '#d9b35a' : p[1]}" stroke-width="2" fill="none" opacity=".8"/>`;
  }
  if (wrap === 2) {
    // Shayla: the long end brought round under the chin and over the shoulder.
    s += S('M140 120Q154 150 124 168Q94 182 58 164Q60 156 68 154Q96 166 118 154Q134 142 134 122Z', wc[0], wc[1], -3, -3)
      + `<path d="M70 160Q98 172 120 158" stroke="${wc[1]}" stroke-width="2" fill="none" opacity=".6"/>`;
  }
  if (covered) s += shine('M62 70Q80 50 100 48', 5, 0.2);
  return s;
}

/** Beards with texture: 1 short, 2 full, 3 long; strands in the darker tone, a soft highlight. */
function beardOf(f: Fig): string {
  const hc = f.age === 1 && f.hairC < 5 ? HAIR[5] : HAIR[f.hairC];
  const d = f.beard === 1 ? 'M62 104Q64 140 100 144Q136 140 138 104Q130 122 116 122Q100 116 84 122Q70 122 62 104Z'
    : f.beard === 2 ? 'M58 98Q56 148 100 152Q144 148 142 98Q134 124 120 126Q100 118 80 126Q66 124 58 98Z'
      : 'M58 98Q54 166 100 176Q146 166 142 98Q134 124 120 126Q100 118 80 126Q66 124 58 98Z';
  const low = f.beard === 1 ? 140 : f.beard === 2 ? 148 : 170;
  const strands = [74, 86, 100, 114, 126].map((x, i) => `<path d="M${x} ${126 + (i % 2) * 3}Q${x + (x < 100 ? -2 : 2)} ${(126 + low) / 2} ${x + (x - 100) * .12} ${low - 6 - Math.abs(x - 100) * .2}" stroke="${hc[1]}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".55"/>`).join('');
  return S(d, hc[0], hc[1], -4, -4) + clipped(d, strands) + shine(`M70 ${120}Q74 ${low - 12} 88 ${low - 4}`, 2.4, 0.16);
}

/** Hair behind the head (round 5): long, bun, afro, braids, ponytail. */
function hairBack(f: Fig, hc: Pair): string {
  switch (f.hair) {
    case 4: return S('M48 100Q44 40 100 42Q156 40 152 100L156 168Q140 176 128 160L130 110H70L72 160Q60 176 44 168Z', hc[0], hc[1], -5, -4)
      + `<path d="M50 120Q50 150 54 166M150 120Q150 150 146 166" stroke="${hc[1]}" stroke-width="2" fill="none" opacity=".5"/>`;
    case 5: return S(circ(100, 44, 17), hc[0], hc[1], -3, -3) + `<path d="M88 40Q100 32 112 40" stroke="${hc[1]}" stroke-width="2" fill="none" opacity=".6"/>`;
    case 9: {
      // An afro: a big soft round with a scalloped edge.
      const puffs = Array.from({ length: 14 }, (_, i) => { const a = Math.PI * (0.95 + (i / 13) * 1.1); return circ(100 + Math.cos(a) * 54, 74 + Math.sin(a) * 46, 13); });
      return puffs.map((d) => S(d, hc[0], hc[1], -3, -3)).join('') + S('M44 100Q40 30 100 26Q160 30 156 100Q130 84 100 84Q70 84 44 100Z', hc[0], hc[1], -6, -5)
        + Array.from({ length: 10 }, (_, i) => `<circle cx="${58 + (i * 37) % 84}" cy="${36 + (i * 23) % 40}" r="1.4" fill="${hc[1]}" opacity=".6"/>`).join('');
    }
    case 10: {
      // Two plaits hanging beside the face, each tied with a bow.
      let s = S('M54 92Q50 48 100 48Q150 48 146 92Z', hc[0], hc[1], -4, -4);
      for (const x of [52, 148]) {
        for (let y = 104; y < 168; y += 10) s += S(circ(x + ((y / 10) % 2 ? 1.2 : -1.2), y, 7.4), hc[0], hc[1], -2, -2) + `<path d="M${x - 4} ${y - 3}q4 4 8 0" stroke="${hc[1]}" stroke-width="1.4" fill="none" opacity=".7"/>`;
        s += `<path d="M${x - 8} 172l8 4l8 -4l-2 8l-6 -3l-6 3z" fill="#ff7d9a"/><circle cx="${x}" cy="176" r="2.6" fill="#d24a6c"/>`;
      }
      return s;
    }
    case 11: {
      // A ponytail swinging behind on one side, with a band.
      return S('M128 56Q170 60 166 120Q164 150 150 160Q156 128 146 104Q140 84 120 70Z', hc[0], hc[1], -4, -3)
        + `<path d="M146 76Q160 100 156 136" stroke="${hc[1]}" stroke-width="2" fill="none" opacity=".55"/><ellipse cx="132" cy="62" rx="7" ry="5" fill="#ff7d9a" transform="rotate(30 132 62)"/>`;
    }
  }
  return '';
}

/** Hair on the head (round 5): a hairline with tufts, sideburns, strands in the darker tone and a sheen. */
function hairFront(f: Fig, hc: Pair): string {
  const strand = (d: string, w = 2) => `<path d="${d}" stroke="${hc[1]}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity=".55"/>`;
  const side = f.beard ? '' : `<path d="M58 84Q57 93 60 99M142 84Q143 93 140 99" stroke="${hc[0]}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  let s = '';
  switch (f.hair) {
    case 1:
      s += S('M56 92Q50 46 100 46Q150 46 144 92Q140 74 128 68Q118 76 104 70Q90 76 78 68Q62 72 56 92Z', hc[0], hc[1], -4, -4) + side
        + strand('M70 60Q86 52 100 52') + strand('M106 54Q124 55 134 66') + strand('M84 66Q90 60 98 58', 1.6);
      break;
    case 2:
      s += S('M56 92Q50 46 100 46Q150 46 144 92Q138 70 120 66Q100 76 80 66Q62 70 56 92Z', hc[0], hc[1], -4, -4) + side;
      for (const [x, y, r] of [[64, 66, 10], [76, 54, 12], [92, 50, 12], [108, 50, 12], [124, 54, 12], [136, 66, 10], [60, 80, 8], [140, 80, 8]]) s += S(circ(x, y, r), hc[0], hc[1], -2.5, -2.5) + `<path d="M${x - r * .5} ${y - r * .2}q${r * .4} ${-r * .5} ${r * .8} 0" stroke="${hc[1]}" stroke-width="1.6" fill="none" opacity=".6"/>`;
      break;
    case 3:
      s += S('M58 88Q56 46 100 46Q150 46 144 88Q134 60 112 58Q118 70 100 74Q90 62 74 66Q62 72 58 88Z', hc[0], hc[1], -4, -4) + side
        + strand('M70 58Q92 46 120 52') + strand('M104 60Q120 58 134 70') + strand('M84 62Q96 56 110 58', 1.6);
      break;
    case 6:
      // A short fade: a thin layer close to the head, darker at the sides.
      s += S('M57 90Q52 48 100 48Q148 48 143 90Q138 72 126 70Q100 64 74 70Q62 72 57 90Z', hc[0], hc[1], -3, -3) + side
        + Array.from({ length: 22 }, (_, i) => `<circle cx="${64 + (i * 29) % 72}" cy="${56 + (i * 11) % 14}" r=".9" fill="${hc[1]}" opacity=".6"/>`).join('');
      break;
    case 7:
      // Wavy: a scalloped fringe and a wave across the top.
      s += S('M56 92Q50 44 100 44Q150 44 144 92Q138 76 128 74Q122 64 112 70Q104 60 94 68Q84 60 76 70Q64 70 56 92Z', hc[0], hc[1], -4, -4) + side
        + strand('M66 62Q76 52 88 58Q100 64 112 54Q124 46 136 60') + strand('M72 70Q80 64 88 68', 1.6);
      break;
    case 8:
      // A side parting with a sweep to the right.
      s += S('M56 92Q52 46 100 46Q148 46 144 90Q132 64 98 64Q84 66 78 58Q66 70 56 92Z', hc[0], hc[1], -4, -4) + side
        + `<path d="M78 50Q77 56 79 60" stroke="${shade(hc[1], -.3)}" stroke-width="2.4" stroke-linecap="round"/>` + strand('M84 54Q112 48 136 66') + strand('M86 60Q110 56 130 70', 1.6);
      break;
    case 9:
      s += S('M57 82Q56 54 100 52Q144 54 143 82Q128 66 100 66Q72 66 57 82Z', hc[0], hc[1], -3, -3);
      break;
    default:
      // 4 long, 5 bun, 10 braids, 11 ponytail: a fringe swept to one side.
      s += S('M58 88Q60 50 100 50Q140 50 142 88Q120 62 96 70Q76 74 58 88Z', hc[0], hc[1], -4, -4) + strand('M70 70Q88 60 110 62') + strand('M66 80Q80 70 96 70', 1.6);
  }
  return s + shine('M68 62Q82 50 100 50', 3.5, 0.24);
}

/** Arms raised for a cheer (both up) or a wave (one up, swinging at the shoulder); drawn only for actors. */
function raised(f: Fig, which: 'up' | 'wave'): string {
  const k = sleeve(f);
  const sk = SKIN[f.skin];
  const hand = withWatch(f, (x: number, y: number) => S(circ(x, y, 10), sk[0], sk[1], -3, -3), 1);
  if (which === 'up') return arm(66, 160, 46, 112, k) + arm(134, 160, 154, 112, k) + hand(44, 106) + hand(156, 106);
  const down = f.pose === 1 ? arm(68, 160, 64, 204, k) + hand(62, 208) : arm(66, 160, 58, 210, k) + hand(57, 214);
  return down + `<g class="fg-wave-arm">${arm(134, 160, 160, 116, k)}${hand(162, 110)}</g>`;
}

const kid = (f: Fig) => f.body === BOY || f.body === GIRL;
/** The whole character, standing on the ground. `cls` adds classes to the moving group. */
export function figureSvg(f: Fig, o: { label?: string; size?: number; still?: boolean; actor?: boolean; cheer?: boolean; xp?: Xp } = {}): string {
  const k = kid(f);
  // An actor (a character in a moment) also carries raised arms for a cheer and a wave, shown by class.
  // `cheer` draws the arms raised for good (a picture, e.g. the character card).
  const arms = o.actor ? `<g class="fg-arms">${holds(f)}</g>` : o.cheer ? raised(f, 'up') : holds(f);
  const up = o.actor ? `<g class="fg-up">${raised(f, 'up')}</g><g class="fg-wv">${raised(f, 'wave')}</g>` : '';
  const kidT = 'transform="translate(100 248) scale(.86 .8) translate(-100 -248)"';
  // An actor carries every expression (shown by class); a picture shows one (`xp`, else the face as built).
  const hd = head(f, o.actor ? { all: true } : { xp: o.xp ?? (o.cheer ? 'happy' : undefined) });
  const inner = k
    ? `<g ${kidT}>${body(f)}${arms}</g><g transform="translate(0 20)"><g class="fg-head">${hd}</g></g>${up ? `<g ${kidT}>${up}</g>` : ''}`
    : `${body(f)}${arms}<g class="fg-head">${hd}</g>${up}`;
  const size = o.size ? ` width="${o.size}" height="${Math.round(o.size * 1.31)}"` : '';
  return `<svg viewBox="0 0 200 262"${size} class="fg${o.still ? ' still' : ''}" ${o.label ? `role="img" aria-label="${o.label}"` : 'aria-hidden="true"'}><ellipse class="fg-shadow" cx="100" cy="250" rx="62" ry="9" fill="#000" opacity=".3"/><g class="fg-act"><g class="fg-bob">${inner}</g></g></svg>`;
}
/** The prize backgrounds' own touches (centre x, y, radius r): stars on the aurora, rays on the sun. */
export function bgDeco(bg: number, x: number, y: number, r: number): string {
  if (bg === 8) return [[-.55, -.5, .09], [.5, -.62, .07], [.62, .1, .06], [-.7, .25, .05], [.1, -.8, .05]].map(([a, b, k]) => {
    const cx = x + a * r, cy = y + b * r, R = k * r;
    return `<path d="M${cx} ${cy - R}L${cx + R * .3} ${cy - R * .3}L${cx + R} ${cy}L${cx + R * .3} ${cy + R * .3}L${cx} ${cy + R}L${cx - R * .3} ${cy + R * .3}L${cx - R} ${cy}L${cx - R * .3} ${cy - R * .3}Z" fill="#fff" opacity=".85"/>`;
  }).join('') + `<path d="M${x - r} ${y - r * .1}Q${x} ${y - r * .55} ${x + r} ${y - r * .25}" stroke="#a8ffe6" stroke-width="${r * .14}" fill="none" opacity=".35"/>`;
  if (bg === 10) {
    const m = `M${x + r * .52} ${y - r * .78}a${r * .26} ${r * .26} 0 1 0 ${r * .14} ${r * .46}a${r * .2} ${r * .2} 0 1 1 ${-r * .14} ${-r * .46}z`;
    return `<path d="${m}" fill="#ffe7a3"/>` + [[-.62, -.2], [-.36, -.5], [.66, .05]].map(([a, b]) => {
      const cx = x + a * r, cy = y + b * r, w = r * .07;
      return `<circle cx="${cx}" cy="${cy}" r="${w * 2.6}" fill="#ffd36b" opacity=".3"/><rect x="${cx - w}" y="${cy - w * 1.4}" width="${w * 2}" height="${w * 2.8}" rx="${w * .6}" fill="#ffcf55"/>`;
    }).join('');
  }
  if (bg === 11) return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, cx = x - r * .85 + t * r * 1.7, cy = y - r * .55 + Math.sin(t * Math.PI) * r * .22;
    const c = ['#fff3c4', '#ffd25e', '#9ff5da', '#ffb0c8'][i % 4];
    return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r * .1).toFixed(2)}" fill="${c}" opacity=".35"/><circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r * .05).toFixed(2)}" fill="${c}"/>`;
  }).join('') + `<path d="M${x - r} ${y - r * .6}Q${x} ${y - r * .2} ${x + r} ${y - r * .6}" stroke="#fff" stroke-width="${r * .025}" fill="none" opacity=".5"/>`;
  if (bg === 9) return Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2, w = 0.13;
    const p = (rr: number, t: number) => `${(x + Math.cos(t) * rr).toFixed(2)} ${(y + Math.sin(t) * rr).toFixed(2)}`;
    return `<path d="M${x} ${y}L${p(r * .97, a - w)}L${p(r * .97, a + w)}Z" fill="#fff6c8" opacity="${i % 2 ? .22 : .38}"/>`;
  }).join('');
  if (bg === 12) {
    // Night of Qadr: soft light coming down from above, a thin crescent, a few rising lights.
    const rays = [-.5, -.22, .06, .34, .6].map((a, i) => {
      const x0 = x + a * r * .5, w = r * (.07 + (i % 2) * .04);
      return `<path d="M${(x0 - w * .3).toFixed(2)} ${y - r}L${(x0 + w * .3).toFixed(2)} ${y - r}L${(x0 + a * r * .9 + w).toFixed(2)} ${y + r}L${(x0 + a * r * .9 - w).toFixed(2)} ${y + r}Z" fill="#fff3c4" opacity="${i % 2 ? .12 : .2}"/>`;
    }).join('');
    const m = `M${x - r * .5} ${y - r * .74}a${r * .22} ${r * .22} 0 1 0 ${r * .12} ${r * .4}a${r * .17} ${r * .17} 0 1 1 ${-r * .12} ${-r * .4}z`;
    return rays + `<path d="${m}" fill="#ffe7a3"/>` + [[.55, -.5, .05], [.7, .2, .04], [-.7, .3, .035], [.3, .6, .03], [-.35, .7, .03]].map(([a, b, k]) =>
      `<circle cx="${(x + a * r).toFixed(2)}" cy="${(y + b * r).toFixed(2)}" r="${(k * r * 2.4).toFixed(2)}" fill="#ffd36b" opacity=".25"/><circle cx="${(x + a * r).toFixed(2)}" cy="${(y + b * r).toFixed(2)}" r="${(k * r).toFixed(2)}" fill="#fff6d8"/>`).join('');
  }
  return '';
}
/** Head and shoulders for an avatar disc: SVG markup in the disc's own units (centre 20,20, radius r). */
export function bustMarkup(f: Fig, r = 17, zoom = false): string {
  const k = kid(f);
  const inner = k
    ? `<g transform="translate(100 248) scale(.86 .8) translate(-100 -248)">${body(f)}${holds(f)}</g><g transform="translate(0 20)"><g class="fg-head">${head(f)}</g></g>`
    : `${body(f)}${holds(f)}<g class="fg-head">${head(f)}</g>`;
  const id = `fg${++uid}`;
  const [a, b] = BG[f.bg];
  // A window of 136 units round the head, a little below its middle so the shoulders show.
  const cy = zoom ? (k ? 118 : 98) : k ? 120 : 102, w = zoom ? 88 : 136, s = (2 * r) / w;
  return `<defs><clipPath id="${id}"><circle cx="20" cy="20" r="${r}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
    + `<circle cx="20" cy="20" r="${r}" fill="url(#${id}g)"/>${bgDeco(f.bg, 20, 20, r)}<circle cx="14" cy="12" r="${r * 0.7}" fill="#fff" opacity=".12"/>`
    + `<g clip-path="url(#${id})"><g transform="translate(${20 - r} ${20 - r}) scale(${s.toFixed(4)}) translate(${-(100 - w / 2)} ${-(cy - w / 2)})">${inner}</g></g>`;
}
