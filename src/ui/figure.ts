// Characters for Ranks (owner request 2026-11-10): a person built from parts, drawn in code in the reward
// art style (flat shapes in two tones, light from the top left, a soft ground shadow). Faces are the user's
// choice and off by default (owner decision 2026-11-10). No photos, no real people.
// A character is 14 base-36 digits, one per slot (SLOTS); the server checks only the format and the prize
// outfit (rank_set_figure), the rest is ours to draw.

export const SLOTS = ['face', 'skin', 'body', 'hair', 'hairC', 'beard', 'head', 'headC', 'outfit', 'outC', 'glasses', 'hold', 'pose', 'bg'] as const;
export type Slot = (typeof SLOTS)[number];
export type Fig = Record<Slot, number>;

type Pair = [string, string];
const SKIN: Pair[] = [['#f6d5b8', '#d9a882'], ['#f0c39b', '#cf9a6e'], ['#e0a676', '#bf7c4f'], ['#c98b5b', '#9f6638'],
  ['#a8693f', '#7f4a26'], ['#8f5a39', '#6a3c22'], ['#6e4129', '#4c2916'], ['#4f2e1d', '#33190d']];
const HAIR: Pair[] = [['#2a1c14', '#140c07'], ['#4b2e1b', '#2a190d'], ['#7a4a26', '#4f2d13'], ['#b07a3e', '#7d5122'],
  ['#e0b46a', '#b08438'], ['#a3a9b1', '#6c727a']];
const CLOTH: Pair[] = [['#f7f5ef', '#cfc6b4'], ['#efe2c6', '#c8b48c'], ['#d8b98c', '#a88656'], ['#9aa3b0', '#6b7482'],
  ['#2f3f6b', '#1b2645'], ['#2a2d38', '#15171e'], ['#2fb06a', '#1b7a47'], ['#4a8fe0', '#2a62b0'], ['#a83246', '#701c2c'], ['#7a5cd0', '#5038a0']];
const HEADC: Pair[] = [['#ffffff', '#c9bfae'], ['#22232b', '#0b0b10'], ['#2f3f6b', '#1b2645'], ['#2fb06a', '#1b7a47'],
  ['#a83246', '#701c2c'], ['#7a5cd0', '#5038a0'], ['#e08aa8', '#b45c7c'], ['#d8b98c', '#a88656']];
/** Disc colours behind the character (light, dark): 6 free, 2 bought. */
export const BG: Pair[] = [['#5b8cf0', '#2f5fc4'], ['#3fd0b4', '#13836f'], ['#a98af0', '#6142c4'], ['#ffc55a', '#d98a10'],
  ['#ff9aa8', '#d2566c'], ['#79d46a', '#3a9a2c'], ['#3b4a7a', '#121a36'], ['#ffe08a', '#c47f10'],
  // 8 aurora and 9 sun rays: weekly prize pieces (PIECES)
  ['#3dd1ad', '#5b3fc4'], ['#ffd25e', '#e0761f'],
  // 10 night garden (a 30-day streak), 11 Eid lights (Eid al-Adha)
  ['#33459a', '#0d1433'], ['#ff9a6b', '#b23a6e']];
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
    case 'hair': return b === WOMAN ? [] : b === GIRL ? [4, 5, 2] : [1, 2, 3, 0];
    case 'hairC': return n(HAIR.length);
    case 'beard': return b === MAN ? [0, 1, 2, 3] : [];
    case 'head': return b === MAN ? [0, 1, 2, 3, 6] : b === BOY ? [0, 1, 2, 6] : b === WOMAN ? [4, 5] : [0, 4, 6];
    case 'headC': return n(HEADC.length);
    case 'outfit': return [...(b === MAN ? [0, 1, 2, 6] : b === BOY ? [0, 1, 2] : b === WOMAN ? [3, 4, 6] : [3, 2]), 7, 8, 9, 10, 11];
    case 'outC': return n(CLOTH.length);
    case 'glasses': return [0, 1, 2, 3];
    case 'hold': return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    case 'pose': return [0, 1];
    case 'bg': return n(BG.length);
  }
}
/** Whether the head is covered so no hair shows (shemagh, turban, hijab, niqab). */
export const hairHidden = (f: Fig) => f.head >= 2 && f.head <= 5;
/** Whether the hair shows (not covered, not bald). */
export const hairShows = (f: Fig) => !hairHidden(f) && f.hair > 0 && options('hair', f).length > 0;

/** Parts bought with Light (`fg:{slot}:{value}` in the shop), and the one only a week at #1 gives. */
export const PRICE: Record<string, number> = { 'head:3': 150, 'outfit:1': 120, 'outfit:4': 120, 'hold:5': 100, 'bg:6': 80, 'bg:7': 120 };
export const PRIZE = 'outfit:6';
/** Weekly prize pieces (owner request 2026-11-10): a league's top 3 win the week's piece, in turn, back after
 *  6 weeks (server: rank_prize_piece); never sold. Kept as `fg:{slot}:{value}` once claimed. */
export const PIECES = ['outfit:7', 'hold:6', 'glasses:3', 'bg:8', 'hold:7', 'bg:9'];
export const isPiece = (slot: string, v: number) => PIECES.includes(`${slot}:${v}`) || !!WARDROBE[`${slot}:${v}`];
/** The wardrobe (owner request 2026-11-10, "amazing, beautiful, premium and cute depending on the rarity"): pieces
 *  that are earned, never sold. How: a week in a league's top 3, a streak reached, or a season of the year (kept for
 *  good once earned; seasons come back every year). */
export type Rarity = 'cute' | 'rare' | 'epic' | 'legendary';
export type How = 'week' | 's7' | 's30' | 's100' | 's365' | 'ramadan' | 'fitr' | 'hajj' | 'adha';
export const WARDROBE: Record<string, { r: Rarity; how: How }> = {
  'glasses:3': { r: 'cute', how: 'week' }, 'hold:7': { r: 'cute', how: 'week' }, 'hold:6': { r: 'rare', how: 'week' },
  'bg:8': { r: 'rare', how: 'week' }, 'bg:9': { r: 'epic', how: 'week' }, 'outfit:7': { r: 'epic', how: 'week' },
  'hold:8': { r: 'cute', how: 's7' }, 'bg:10': { r: 'rare', how: 's30' }, 'outfit:8': { r: 'epic', how: 's100' },
  'outfit:9': { r: 'legendary', how: 's365' },
  'hold:9': { r: 'rare', how: 'ramadan' }, 'outfit:10': { r: 'epic', how: 'fitr' }, 'outfit:11': { r: 'rare', how: 'hajj' },
  'bg:11': { r: 'epic', how: 'adha' },
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
export const DEFAULT: Fig = normalize({ face: 0, skin: 2, body: MAN, hair: 1, hairC: 0, beard: 1, head: 1, headC: 0, outfit: 0, outC: 0, glasses: 0, hold: 1, pose: 0, bg: 0 });
export const encode = (f: Fig) => SLOTS.map((s) => f[s].toString(36)).join('');
export function parse(code: string | null | undefined): Fig | null {
  if (!code || !/^[0-9a-z]{14}$/.test(code)) return null;
  const f = {} as Fig;
  SLOTS.forEach((s, i) => { f[s] = parseInt(code[i], 36); });
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

function body(f: Fig): string {
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
  const outfit = f.outfit === 6 ? 0 : f.outfit;
  if (sit) s += S('M40 224Q100 196 160 224Q166 240 150 242H50Q34 240 40 224Z', outfit === 2 ? ['#33415c', '#212b3f'][0] : c[0], outfit === 2 ? '#212b3f' : c[1]);
  s += S(robe, c[0], c[1], -8, -4);
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

function holds(f: Fig): string {
  const k = sleeve(f);
  const sk = SKIN[f.skin];
  const hand = (x: number, y: number) => S(circ(x, y, 10), sk[0], sk[1], -3, -3);
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
    default:
      s += arm(70, 160, 74, 204, k) + arm(130, 160, 140, 192, k);
      s += '<circle cx="142" cy="224" r="30" fill="#ffd36b" opacity=".18" class="fg-glow"/><path d="M142 196v10" stroke="#8a5a1c" stroke-width="3"/>';
      s += S('M130 204h24l-4 6h-16z', '#d6952b', '#8f5c14', -1, -1) + S('M132 210h20l-2 30h-16z', '#eaa93a', '#a86d1a', -2, -2)
        + '<rect x="136" y="214" width="12" height="22" rx="4" fill="#fff3c4"/><path d="M142 219q5 6 0 12q-5 -6 0 -12z" fill="#ff9d2e"/>' + S('M130 240h24l-3 5h-18z', '#d6952b', '#8f5c14', -1, -1);
      return s + hand(74, 206) + hand(142, 196);
  }
}

function head(f: Fig): string {
  const sk = SKIN[f.skin], hc = HAIR[f.hairC], wc = HEADC[f.headC];
  const covered = f.head === 4 || f.head === 5;
  const hx = 100, hy = 96;
  let s = '';
  if (covered) s += S('M50 104Q46 44 100 42Q154 44 150 104Q154 148 124 160L100 166L76 160Q46 148 50 104Z', wc[0], wc[1], -7, -5) + `<path d="M76 158Q100 150 124 158" stroke="${wc[1]}" stroke-width="3" fill="none"/>`;
  if (f.head === 2) {
    // Shemagh: white cloth with a red (or the chosen colour's) check.
    const d = 'M50 96Q46 42 100 40Q154 42 150 96L160 156Q144 166 130 152L132 104H68L70 152Q56 166 40 156Z';
    const id = `fg${++uid}`;
    const ink = f.headC === 0 ? '#cf3440' : wc[0];
    s += S(d, '#f7f4ec', '#d9cfbf', -6, -4) + `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})" stroke="${ink}" stroke-width="2.2" opacity=".8">`
      + Array.from({ length: 12 }, (_, i) => `<path d="M${30 + i * 12} 30L${10 + i * 12} 170"/><path d="M${10 + i * 12} 30L${30 + i * 12} 170"/>`).join('') + '</g>';
  }
  const hair = hairShows(f);
  if (hair && f.hair === 4) s += S('M48 100Q44 40 100 42Q156 40 152 100L156 168Q140 176 128 160L130 110H70L72 160Q60 176 44 168Z', hc[0], hc[1], -5, -4);
  if (hair && f.hair === 5) s += S(circ(100, 44, 17), hc[0], hc[1], -3, -3);
  const fr = covered ? 33 : 44, fy = covered ? hy + 8 : hy;
  s += S(circ(hx, fy, fr), sk[0], sk[1], -7, -6);
  if (!covered && f.head !== 2) s += S(circ(hx - fr + 2, fy + 4, 8), sk[0], sk[1], -2, -2) + S(circ(hx + fr - 2, fy + 4, 8), sk[0], sk[1], -2, -2);
  if (f.beard === 1) s += S('M62 104Q64 140 100 144Q136 140 138 104Q130 122 116 122Q100 116 84 122Q70 122 62 104Z', hc[0], hc[1], -4, -4);
  if (f.beard === 2) s += S('M58 98Q56 148 100 152Q144 148 142 98Q134 124 120 126Q100 118 80 126Q66 124 58 98Z', hc[0], hc[1], -4, -4);
  if (f.beard === 3) s += S('M58 98Q54 166 100 176Q146 166 142 98Q134 124 120 126Q100 118 80 126Q66 124 58 98Z', hc[0], hc[1], -4, -4);
  if (f.head === 5) s += S('M66 104H134Q138 146 100 152Q62 146 66 104Z', wc[0], wc[1], -5, -3) + `<path d="M66 104H134" stroke="${wc[1]}" stroke-width="2.5"/>`;
  const ey = fy + (covered ? -2 : 2);
  if (f.face) {
    s += `<g class="fg-eyes"><ellipse cx="84" cy="${ey}" rx="5" ry="6.5" fill="#26160f"/><ellipse cx="116" cy="${ey}" rx="5" ry="6.5" fill="#26160f"/><circle cx="85.6" cy="${ey - 2.4}" r="1.9" fill="#fff"/><circle cx="117.6" cy="${ey - 2.4}" r="1.9" fill="#fff"/></g>`;
    if (f.head !== 5) {
      if (f.beard >= 2) s += `<path d="M88 ${ey + 22}Q100 ${ey + 28} 112 ${ey + 22}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>`;
      else s += `<path d="M90 ${ey + 15}Q100 ${ey + 23} 110 ${ey + 15}" stroke="#8a3b2a" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
        + (f.beard ? '' : `<ellipse cx="72" cy="${ey + 12}" rx="6" ry="4" fill="#ff7d7d" opacity=".35"/><ellipse cx="128" cy="${ey + 12}" rx="6" ry="4" fill="#ff7d7d" opacity=".35"/>`);
    }
  }
  if (f.glasses === 1) s += `<g fill="none" stroke="#1e2733" stroke-width="3.2"><circle cx="84" cy="${ey}" r="12"/><circle cx="116" cy="${ey}" r="12"/><path d="M96 ${ey - 1}h8"/></g>`;
  if (f.glasses === 2) s += `<g fill="none" stroke="#1e2733" stroke-width="3.2"><rect x="71" y="${ey - 10}" width="26" height="19" rx="5"/><rect x="103" y="${ey - 10}" width="26" height="19" rx="5"/><path d="M97 ${ey - 2}h6"/></g>`;
  if (f.glasses === 3) s += `<g fill="none" stroke-width="3.4"><g stroke="#a8740f" transform="translate(.6 1.2)"><circle cx="84" cy="${ey}" r="12.5"/><circle cx="116" cy="${ey}" r="12.5"/><path d="M96.5 ${ey - 2}q3.5 -3 7 0"/></g><g stroke="#f2c14e"><circle cx="84" cy="${ey}" r="12.5"/><circle cx="116" cy="${ey}" r="12.5"/><path d="M96.5 ${ey - 2}q3.5 -3 7 0"/></g></g>`;
  if (f.glasses) s += `<path d="M77 ${ey - 6}l5 -3M109 ${ey - 6}l5 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
  s += shine(`M${hx - fr * 0.62} ${fy - fr * 0.55}Q${hx - fr * 0.2} ${fy - fr * 0.95} ${hx + fr * 0.15} ${fy - fr * 0.9}`, 4, 0.28);
  if (hair) {
    if (f.hair === 1) s += S('M56 90Q50 46 100 46Q150 46 144 90Q136 64 100 62Q64 64 56 90Z', hc[0], hc[1], -4, -4);
    if (f.hair === 2) s += S('M56 92Q50 46 100 46Q150 46 144 92Q138 70 120 66Q100 76 80 66Q62 70 56 92Z', hc[0], hc[1], -4, -4)
      + [64, 84, 104, 124].map((x, i) => S(circ(x + 6, 56 + (i % 2) * 4, 12), hc[0], hc[1], -3, -3)).join('');
    if (f.hair === 3) s += S('M58 88Q56 46 100 46Q150 46 144 88Q134 60 112 58Q118 70 100 74Q90 62 74 66Q62 72 58 88Z', hc[0], hc[1], -4, -4);
    if (f.hair === 4 || f.hair === 5) s += S('M58 88Q60 50 100 50Q140 50 142 88Q120 62 96 70Q76 74 58 88Z', hc[0], hc[1], -4, -4);
    if (f.hair > 0) s += shine('M68 64Q82 52 100 52', 3.5, 0.22);
  }
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
  if (covered) s += shine('M62 70Q80 50 100 48', 5, 0.2);
  return s;
}

/** Arms raised for a cheer (both up) or a wave (one up, swinging at the shoulder); drawn only for actors. */
function raised(f: Fig, which: 'up' | 'wave'): string {
  const k = sleeve(f);
  const sk = SKIN[f.skin];
  const hand = (x: number, y: number) => S(circ(x, y, 10), sk[0], sk[1], -3, -3);
  if (which === 'up') return arm(66, 160, 46, 112, k) + arm(134, 160, 154, 112, k) + hand(44, 106) + hand(156, 106);
  const down = f.pose === 1 ? arm(68, 160, 64, 204, k) + hand(62, 208) : arm(66, 160, 58, 210, k) + hand(57, 214);
  return down + `<g class="fg-wave-arm">${arm(134, 160, 160, 116, k)}${hand(162, 110)}</g>`;
}

const kid = (f: Fig) => f.body === BOY || f.body === GIRL;
/** The whole character, standing on the ground. `cls` adds classes to the moving group. */
export function figureSvg(f: Fig, o: { label?: string; size?: number; still?: boolean; actor?: boolean; cheer?: boolean } = {}): string {
  const k = kid(f);
  // An actor (a character in a moment) also carries raised arms for a cheer and a wave, shown by class.
  // `cheer` draws the arms raised for good (a picture, e.g. the character card).
  const arms = o.actor ? `<g class="fg-arms">${holds(f)}</g>` : o.cheer ? raised(f, 'up') : holds(f);
  const up = o.actor ? `<g class="fg-up">${raised(f, 'up')}</g><g class="fg-wv">${raised(f, 'wave')}</g>` : '';
  const kidT = 'transform="translate(100 248) scale(.86 .8) translate(-100 -248)"';
  const inner = k
    ? `<g ${kidT}>${body(f)}${arms}</g><g transform="translate(0 20)"><g class="fg-head">${head(f)}</g></g>${up ? `<g ${kidT}>${up}</g>` : ''}`
    : `${body(f)}${arms}<g class="fg-head">${head(f)}</g>${up}`;
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
  return '';
}
/** Head and shoulders for an avatar disc: SVG markup in the disc's own units (centre 20,20, radius r). */
export function bustMarkup(f: Fig, r = 17): string {
  const k = kid(f);
  const inner = k
    ? `<g transform="translate(100 248) scale(.86 .8) translate(-100 -248)">${body(f)}${holds(f)}</g><g transform="translate(0 20)"><g class="fg-head">${head(f)}</g></g>`
    : `${body(f)}${holds(f)}<g class="fg-head">${head(f)}</g>`;
  const id = `fg${++uid}`;
  const [a, b] = BG[f.bg];
  // A window of 136 units round the head, a little below its middle so the shoulders show.
  const cy = k ? 120 : 102, w = 136, s = (2 * r) / w;
  return `<defs><clipPath id="${id}"><circle cx="20" cy="20" r="${r}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
    + `<circle cx="20" cy="20" r="${r}" fill="url(#${id}g)"/>${bgDeco(f.bg, 20, 20, r)}<circle cx="14" cy="12" r="${r * 0.7}" fill="#fff" opacity=".12"/>`
    + `<g clip-path="url(#${id})"><g transform="translate(${20 - r} ${20 - r}) scale(${s.toFixed(4)}) translate(${-(100 - w / 2)} ${-(cy - w / 2)})">${inner}</g></g>`;
}
