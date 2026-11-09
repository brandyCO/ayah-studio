import { MagicTrees, SURAH_PAGES } from './magicTrees';
// The juz gardens' art (Learn tab), all drawn in code on a 2D canvas: an island of grass squares
// seen at an angle, a tree per surah and the decorations. Each surah's tree takes its kind and
// colours from the surah number (seeded), so the same surah always grows the same tree; a bought
// variety recolours it. No figures, people or animals (docs/light.md rules); light is the only magic.
import type { DecoKind, Stage } from '../data/garden';

export interface Iso {
  /** Tile width and height on screen (px). */
  tw: number;
  th: number;
  /** Screen position of the grid's top corner. */
  ox: number;
  oy: number;
}
/** Centre of cell (x, y) on the ground. */
export const cellCenter = (iso: Iso, x: number, y: number) => ({ x: iso.ox + (x - y) * iso.tw / 2, y: iso.oy + (x + y + 1) * iso.th / 2 });
/** The cell under a screen point (may be outside the grid). */
export function cellAt(iso: Iso, px: number, py: number) {
  const a = (px - iso.ox) / (iso.tw / 2);
  const b = (py - iso.oy) / (iso.th / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/** A small seeded random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(1)}, ${Math.max(0, Math.min(100, s)).toFixed(1)}%, ${Math.max(0, Math.min(100, l)).toFixed(1)}%, ${a})`;
type HSL = [number, number, number];

// --- the island ---
export function drawGround(ctx: CanvasRenderingContext2D, iso: Iso, n: number, night: boolean, magic: number, t: number) {
  const { tw, th } = iso;
  const at = (x: number, y: number) => ({ x: iso.ox + (x - y) * tw / 2, y: iso.oy + (x + y) * th / 2 });
  const L = at(0, n), B = at(n, n), R = at(n, 0);
  const depth = th * 0.75;
  // Earth under the grass: the left face lit, the right one in shade, a darker band of roots.
  const face = (p: { x: number; y: number }, q: { x: number; y: number }, top: string, bottom: string) => {
    const g = ctx.createLinearGradient(0, Math.min(p.y, q.y), 0, Math.max(p.y, q.y) + depth);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.lineTo(q.x, q.y + depth); ctx.lineTo(p.x, p.y + depth);
    ctx.closePath();
    ctx.fill();
  };
  // A soft shadow the island casts below itself.
  ctx.save();
  ctx.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(40,60,50,.12)';
  ctx.filter = `blur(${Math.round(th * 0.5)}px)`;
  ctx.beginPath();
  ctx.ellipse(B.x, B.y + depth * 1.4, tw * n * 0.42, th * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  face(L, B, night ? '#3b2f25' : '#9b7653', night ? '#1d1712' : '#6e5038');
  face(B, R, night ? '#2b221b' : '#7d5d40', night ? '#140f0c' : '#523a28');
  ctx.strokeStyle = night ? 'rgba(0,0,0,.25)' : 'rgba(60,40,25,.18)';
  ctx.lineWidth = 1;
  for (const k of [0.38, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(L.x, L.y + depth * k); ctx.lineTo(B.x, B.y + depth * k); ctx.lineTo(R.x, R.y + depth * k);
    ctx.stroke();
  }
  // A rim of grass hanging over the edge.
  ctx.fillStyle = night ? '#24493a' : '#7fb26a';
  ctx.beginPath();
  ctx.moveTo(L.x, L.y); ctx.lineTo(B.x, B.y); ctx.lineTo(R.x, R.y);
  ctx.lineTo(R.x, R.y + th * 0.16); ctx.lineTo(B.x, B.y + th * 0.16); ctx.lineTo(L.x, L.y + th * 0.16);
  ctx.closePath();
  ctx.fill();

  // Grass squares: each its own shade (seeded), a lighter top edge, a faint seam.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = rng(x * 131 + y * 977 + 7);
    const p = at(x, y);
    const base: HSL = night ? [152 + r() * 10, 24 + r() * 8, 20 + r() * 4] : [96 + r() * 14, 38 + r() * 9, 56 + r() * 6];
    const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + th);
    g.addColorStop(0, hsl(base[0], base[1], base[2] + 4));
    g.addColorStop(1, hsl(base[0], base[1], base[2] - 3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + tw / 2, p.y + th / 2); ctx.lineTo(p.x, p.y + th); ctx.lineTo(p.x - tw / 2, p.y + th / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = night ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(p.x - tw / 2 + 1, p.y + th / 2); ctx.lineTo(p.x, p.y + 0.5); ctx.lineTo(p.x + tw / 2 - 1, p.y + th / 2);
    ctx.stroke();
    // Tufts of grass.
    ctx.strokeStyle = night ? 'rgba(120,200,160,.18)' : 'rgba(60,110,40,.28)';
    for (let k = 0; k < 3; k++) {
      const gx = p.x + (r() - 0.5) * tw * 0.5, gy = p.y + th * (0.3 + r() * 0.45);
      ctx.beginPath();
      ctx.moveTo(gx - 1.5, gy); ctx.lineTo(gx - 2.5, gy - 3);
      ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 4);
      ctx.moveTo(gx + 1.5, gy); ctx.lineTo(gx + 2.8, gy - 3);
      ctx.stroke();
    }
  }
  // A finished juz: threads of light run along the seams and breathe.
  if (magic > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.55 + 0.45 * Math.sin(t * 1.1);
    ctx.strokeStyle = `rgba(255, 220, 140, ${0.16 * magic * pulse})`;
    ctx.lineWidth = 1.2;
    for (let k = 1; k < n; k++) {
      const a = at(k, 0), b = at(k, n), c = at(0, k), d = at(n, k);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Outline of one cell (drag target). */
export function drawCellMark(ctx: CanvasRenderingContext2D, iso: Iso, x: number, y: number, ok: boolean, t = 0) {
  const c = cellCenter(iso, x, y);
  ctx.save();
  if (ok) {
    // A breathing spot of light where the seed will go, with a ring opening out from it.
    const br = 0.5 + 0.5 * Math.sin(t * 3.2), ring = (t * 0.9) % 1;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, iso.tw * 0.45);
    g.addColorStop(0, `rgba(255,244,200,${0.45 + 0.35 * br})`); g.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c.x, c.y, iso.tw * 0.45, iso.th * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,250,225,${0.8 * (1 - ring)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, iso.tw * (0.1 + 0.35 * ring), iso.th * (0.1 + 0.35 * ring), 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - iso.th / 2); ctx.lineTo(c.x + iso.tw / 2, c.y); ctx.lineTo(c.x, c.y + iso.th / 2); ctx.lineTo(c.x - iso.tw / 2, c.y);
  ctx.closePath();
  ctx.fillStyle = ok ? 'rgba(255,255,255,.32)' : 'rgba(220,80,60,.25)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ok ? 'rgba(255,255,255,.9)' : 'rgba(220,80,60,.8)';
  ctx.stroke();
  ctx.restore();
}

// --- trees ---
export type Species = 'palm' | 'olive' | 'cypress' | 'broad' | 'blossom' | 'fruit';
const SPECIES: Species[] = ['palm', 'olive', 'cypress', 'broad', 'blossom', 'fruit'];
/** The tree a surah grows. */
export const speciesOf = (s: number): Species => SPECIES[(s * 5) % 6];

/** Each surah's own tree shape (seeded by its number): no two surahs grow quite the same tree. */
export interface Shape {
  /** Lean of the crown (sideways per unit of height). */
  lean: number;
  /** Height and width multipliers. */
  h: number;
  w: number;
  /** Leaf clumps (clump trees), fronds (palms). */
  n: number;
  /** A second, smaller crown above (clump trees). */
  tiers: 1 | 2;
  /** A second stem beside the first (palm, cypress) or a forked trunk (clump trees). */
  twin: boolean;
  /** Which fruit or blossom colour. */
  hue: number;
}
const FRUITS = [356, 24, 48, 280, 8, 36];
const BLOSSOMS = [338, 0, 300, 18, 350, 270];
const shapes = new Map<number, Shape>();
export function shapeOf(s: number): Shape {
  let sh = shapes.get(s);
  if (sh) return sh;
  const r = rng(s * 31337 + 7);
  const sp = speciesOf(s);
  sh = {
    lean: (r() - 0.5) * 0.24,
    h: 0.86 + r() * 0.3,
    w: 0.86 + r() * 0.32,
    n: sp === 'palm' ? 6 + Math.floor(r() * 5) : 7 + Math.floor(r() * 6),
    tiers: r() < 0.35 ? 2 : 1,
    twin: r() < 0.32,
    hue: Math.floor(r() * 6),
  };
  shapes.set(s, sh);
  return sh;
}

interface Palette { leaf: HSL; trunk: HSL; accent: HSL; glow: number }
function palette(s: number, v: number, sp: Species, thirsty: boolean, night: boolean): Palette {
  const r = rng(s * 7919);
  const j = (r() - 0.5) * 18;
  let leaf: HSL = sp === 'palm' ? [92 + j, 44, 44] : sp === 'olive' ? [84 + j / 2, 20, 54] : sp === 'cypress' ? [146 + j / 2, 34, 29]
    : sp === 'broad' ? [112 + j, 40, 40] : sp === 'blossom' ? [104 + j, 34, 47] : [122 + j, 38, 35];
  let trunk: HSL = sp === 'olive' ? [30, 14, 42] : sp === 'palm' ? [32, 34, 46] : [24, 32, 33];
  const sh = shapeOf(s);
  const bh = BLOSSOMS[sh.hue];
  let accent: HSL = sp === 'blossom' ? (bh === 0 ? [40, 30, 96] : [bh + j / 2, 70, 86]) : sp === 'fruit' ? [FRUITS[sh.hue] + j / 3, 72, FRUITS[sh.hue] === 48 ? 56 : 50] : sp === 'palm' ? [30, 70, 42] : sp === 'olive' ? [250, 18, 30] : [48, 80, 64];
  let glow = 0;
  if (v === 1) { leaf = [30 + j / 2, 72, 52]; accent = [12, 78, 52]; trunk = [22, 30, 30]; }
  if (v === 2) { leaf = [192 + j / 3, 30, 72]; accent = [210, 60, 92]; trunk = [200, 10, 74]; glow = 0.35; }
  if (v === 3) { leaf = [46 + j / 4, 92, 62]; accent = [40, 100, 86]; trunk = [38, 30, 86]; glow = 1; }
  if (thirsty) leaf = [leaf[0] * 0.5 + 42 * 0.5, leaf[1] * 0.45, leaf[2] * 0.9 + 6];
  if (night && v < 2) { leaf = [leaf[0], leaf[1] * 0.85, leaf[2] * 0.72]; trunk = [trunk[0], trunk[1], trunk[2] * 0.7]; accent = [accent[0], accent[1], accent[2] * 0.85]; }
  return { leaf, trunk, accent, glow };
}

/** A round clump of leaves lit from the top left. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, c: HSL, a = 1) {
  const g = ctx.createRadialGradient(x - rad * 0.38, y - rad * 0.42, rad * 0.1, x, y, rad);
  g.addColorStop(0, hsl(c[0], c[1], c[2] + 13, a));
  g.addColorStop(0.55, hsl(c[0], c[1], c[2], a));
  g.addColorStop(1, hsl(c[0], c[1] + 4, c[2] - 11, a));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}
function trunkPath(ctx: CanvasRenderingContext2D, h: number, w: number, c: HSL, bend = 0) {
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, hsl(c[0], c[1], c[2] + 10));
  g.addColorStop(1, hsl(c[0], c[1], c[2] - 8));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.quadraticCurveTo(-w * 0.35 + bend, -h * 0.5, -w * 0.22 + bend, -h);
  ctx.lineTo(w * 0.22 + bend, -h);
  ctx.quadraticCurveTo(w * 0.35 + bend, -h * 0.5, w / 2, 0);
  ctx.closePath();
  ctx.fill();
}

export interface TreeLook {
  s: number;
  v: number;
  stage: Stage;
  thirsty: boolean;
  /** Seconds, for the sway. */
  t: number;
  night: boolean;
  /** 0–1 scale while growing into the stage (an animation). */
  grow?: number;
  /** Draw lifted (being dragged). */
  lifted?: boolean;
}

/** Height of a full tree in tile widths, for hit tests and layout. */
export const treeHeight = (s: number) => 2.3 * (0.7 + 0.6 * magicSize(s));
/** Height of a tree at a stage, in tile widths. */
export const STAGE_SCALE = [0, 0.66, 0.62, 0.8, 1];
export const stageHeight = (s: number, stage: Stage) => (stage === 0 ? 0.3 : stage === 1 ? 0.42 : treeHeight(s) * STAGE_SCALE[stage]);

/** 0–1 by the surah's length in pages (a long surah grows a bigger, fuller tree). */
export const magicSize = (s: number) => Math.min(1, Math.log(SURAH_PAGES[s - 1] * 2 + 1) / Math.log(97));
const built = new Map<number, unknown>();
const magic = (s: number) => built.get(s) ?? (built.set(s, MagicTrees.build(s, SURAH_PAGES[s - 1])), built.get(s));
/** Growth for each stage: seed, sprout, young, growing (first fruit ripening), full. */
const STAGE_G = [0.04, 0.4, 0.68, 0.86, 1];
const pics = new Map<string, HTMLCanvasElement>();

/** A surah's magic tree, its ground point at (cx, cy); u = tile width. Cached as a picture per stage. */
export function drawTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, k: TreeLook) {
  const H = treeHeight(k.s) * u, f = H / 480, dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const g0 = k.stage > 0 ? STAGE_G[k.stage - 1] : 0, g = g0 + (STAGE_G[k.stage] - g0) * (k.grow ?? 1);
  const px = Math.max(24, Math.round(H * dpr / 8) * 8), key = `${k.s}|${k.stage}|${k.thirsty ? 1 : 0}|${px}`;
  let pic = k.grow !== undefined && k.grow < 1 ? undefined : pics.get(key);
  if (!pic) {
    pic = document.createElement('canvas'); const sc = px / 480; pic.width = Math.ceil(500 * sc); pic.height = Math.ceil(625 * sc);
    const c = pic.getContext('2d')!; c.scale(sc, sc); c.translate(0, -40);
    const T = magic(k.s) as { fit: number };
    c.save(); MagicTrees.fitTo(c, T); MagicTrees.drawTree(c, T, g, { t: 0, thirst: k.thirsty ? 1 : 0 }); c.restore();
    if (k.grow === undefined || k.grow >= 1) { if (pics.size > 400) pics.clear(); pics.set(key, pic); }
  }
  ctx.save();
  ctx.translate(cx, cy - (k.lifted ? u * 0.25 : 0));
  ctx.fillStyle = k.night ? 'rgba(0,0,0,.28)' : 'rgba(30,50,20,.2)';
  ctx.beginPath(); ctx.ellipse(u * 0.04, 0, u * (0.12 + 0.25 * g), u * (0.06 + 0.12 * g), 0, 0, Math.PI * 2); ctx.fill();
  if (!k.thirsty) ctx.rotate(Math.sin(k.t * 0.8 + k.s) * 0.012);
  ctx.drawImage(pic, -250 * f, -(520 - 40) * f, 500 * f, 625 * f);
  ctx.restore();
}

/** The earlier hand-drawn trees (six species), kept for reference. */
export function drawSimpleTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, k: TreeLook) {
  const sp = speciesOf(k.s);
  const p = palette(k.s, k.v, sp, k.thirsty, k.night);
  const r = rng(k.s * 104729 + 11);
  const seed = r() * 10;
  const growth = k.grow ?? 1;
  const scale = STAGE_SCALE[k.stage] * u * (0.92 + r() * 0.16) * (0.6 + 0.4 * growth);
  ctx.save();
  ctx.translate(cx, cy);
  if (k.lifted) ctx.translate(0, -u * 0.25);
  // Shadow on the grass.
  ctx.fillStyle = k.night ? 'rgba(0,0,0,.28)' : 'rgba(30,50,20,.2)';
  ctx.beginPath();
  ctx.ellipse(u * 0.05, 0, Math.max(u * 0.12, scale * 0.34), Math.max(u * 0.06, scale * 0.17), 0, 0, Math.PI * 2);
  ctx.fill();

  if (k.stage === 0) {
    // A seed in a small mound of soil, a first leaf peeping out.
    blob(ctx, 0, -u * 0.03, u * 0.16, [28, 34, 34]);
    ctx.fillStyle = hsl(32, 40, 60);
    ctx.beginPath(); ctx.ellipse(-u * 0.02, -u * 0.08, u * 0.035, u * 0.022, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hsl(p.leaf[0], p.leaf[1] + 10, p.leaf[2] + 8);
    ctx.lineWidth = Math.max(1, u * 0.02);
    ctx.beginPath(); ctx.moveTo(0, -u * 0.1); ctx.quadraticCurveTo(u * 0.02, -u * 0.16, u * 0.06, -u * 0.18); ctx.stroke();
    ctx.restore();
    return;
  }
  const sway = Math.sin(k.t * 0.9 + seed) * (k.thirsty ? 0.008 : 0.022) * (k.stage / 4 + 0.3);
  ctx.rotate(sway);
  const droop = k.thirsty ? 0.08 : 0;
  ctx.scale(scale, scale);
  // From here one unit = a full tree's tile width. The surah's own proportions and lean:
  const sh = shapeOf(k.s);
  ctx.transform(k.stage === 1 ? 1 : sh.w, 0, k.stage === 1 ? sh.lean * 0.5 : sh.lean, k.stage === 1 ? 1 : sh.h, 0, 0);
  if (k.stage === 1) {
    // Sapling: a thin stem and a few leaves.
    ctx.strokeStyle = hsl(p.trunk[0], p.trunk[1], p.trunk[2] + 12);
    ctx.lineWidth = 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.04, -0.4, 0, -0.75); ctx.stroke();
    const leaf = (x: number, y: number, a: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + droop * 3);
      const g = ctx.createLinearGradient(0, 0, 0.32, 0);
      g.addColorStop(0, hsl(p.leaf[0], p.leaf[1], p.leaf[2] + 12));
      g.addColorStop(1, hsl(p.leaf[0], p.leaf[1], p.leaf[2] - 4));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.16, -0.12, 0.34, 0); ctx.quadraticCurveTo(0.16, 0.1, 0, 0); ctx.fill();
      ctx.restore();
    };
    leaf(0.01, -0.45, -0.4); leaf(-0.01, -0.56, Math.PI + 0.4); leaf(0, -0.75, -1.2); leaf(0, -0.72, Math.PI + 1.1);
    ctx.restore();
    return;
  }
  const full = k.stage === 4;
  if (p.glow > 0) { ctx.shadowColor = hsl(p.accent[0], 90, 75, 0.9); ctx.shadowBlur = u * 0.35 * p.glow; }
  if (sp === 'cypress') {
    const cypress = (ox: number, sc: number, wd: number) => {
    ctx.save();
    ctx.translate(ox, 0);
    ctx.scale(sc * wd, sc);
    trunkPath(ctx, 0.25, 0.12, p.trunk);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(-0.25, 0, 0.25, 0);
    g.addColorStop(0, hsl(p.leaf[0], p.leaf[1], p.leaf[2] + 12));
    g.addColorStop(0.6, hsl(p.leaf[0], p.leaf[1], p.leaf[2]));
    g.addColorStop(1, hsl(p.leaf[0], p.leaf[1], p.leaf[2] - 10));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -1.95 + droop);
    ctx.bezierCurveTo(0.26, -1.4, 0.3, -0.5, 0.08, -0.16);
    ctx.lineTo(-0.08, -0.16);
    ctx.bezierCurveTo(-0.3, -0.5, -0.26, -1.4, 0, -1.95 + droop);
    ctx.fill();
    // Layers of foliage.
    ctx.strokeStyle = hsl(p.leaf[0], p.leaf[1], p.leaf[2] - 14, 0.5);
    ctx.lineWidth = 0.025;
    for (let i = 0; i < 7; i++) {
      const y = -0.35 - i * 0.22;
      const w = 0.2 * Math.sin(((i + 1) / 8) * Math.PI) + 0.05;
      ctx.beginPath(); ctx.moveTo(-w, y); ctx.quadraticCurveTo(0, y + 0.07, w, y); ctx.stroke();
    }
    if (full && sc === 1) for (let i = 0; i < 6; i++) blob(ctx, (r() - 0.5) * 0.3, -0.5 - r() * 1.1, 0.03, p.accent);
    ctx.restore();
    };
    if (sh.twin) cypress(-0.26, 0.68, 1);
    cypress(0, 1, 0.8 + sh.n * 0.03);
  } else if (sp === 'palm') {
    // A curved trunk of rings, fronds from the crown.
    const palm = (ox: number, sc: number, bend: number, fronds: number) => {
    ctx.save();
    ctx.translate(ox, 0);
    ctx.scale(sc, sc);
    const H = 1.25;
    for (let i = 0; i < 9; i++) {
      const t0 = i / 9, t1 = (i + 1) / 9;
      const x0 = bend * t0 * t0, x1 = bend * t1 * t1;
      ctx.fillStyle = hsl(p.trunk[0], p.trunk[1], p.trunk[2] + (i % 2 ? 4 : -2));
      ctx.beginPath();
      ctx.moveTo(x0 - 0.075 + t0 * 0.02, -H * t0); ctx.lineTo(x1 - 0.07 + t1 * 0.02, -H * t1);
      ctx.lineTo(x1 + 0.07 - t1 * 0.02, -H * t1); ctx.lineTo(x0 + 0.075 - t0 * 0.02, -H * t0);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    const top = { x: bend, y: -H };
    if (full && sc === 1) for (let i = 0; i < 7; i++) blob(ctx, top.x + (r() - 0.5) * 0.16, top.y + 0.08 + r() * 0.08, 0.045, p.accent);
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + 0.3;
      const len = 0.55 + r() * 0.15;
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len * 0.35 + 0.18 + droop * 3;
      ctx.save();
      ctx.translate(top.x, top.y);
      const g = ctx.createLinearGradient(0, 0, ex, ey);
      g.addColorStop(0, hsl(p.leaf[0], p.leaf[1], p.leaf[2] - 6));
      g.addColorStop(1, hsl(p.leaf[0], p.leaf[1], p.leaf[2] + 10));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ex * 0.5, -0.22 + ey * 0.2, ex, ey);
      ctx.quadraticCurveTo(ex * 0.45, -0.08 + ey * 0.3, 0, 0.04);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    };
    const dirn = r() < 0.5 ? -1 : 1;
    if (sh.twin) palm(0.18 * dirn, 0.7, -0.22 * dirn, sh.n - 1);
    palm(0, 1, 0.18 * dirn * -1 * (sh.twin ? -1 : 1), sh.n);
  } else {
    // Trunk + clumps: broadleaf, olive, blossom and fruit trees.
    const H = sp === 'olive' ? 0.5 : sp === 'blossom' ? 0.62 : 0.6;
    trunkPath(ctx, H, sp === 'olive' ? 0.2 : 0.15, p.trunk, sp === 'olive' ? 0.05 : 0);
    if (sp === 'blossom' || sp === 'olive') {
      ctx.strokeStyle = hsl(p.trunk[0], p.trunk[1], p.trunk[2] - 2);
      ctx.lineWidth = 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -H * 0.8); ctx.quadraticCurveTo(-0.15, -H - 0.1, -0.3, -H - 0.2);
      ctx.moveTo(0.02, -H * 0.9); ctx.quadraticCurveTo(0.18, -H - 0.05, 0.3, -H - 0.22); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    const cy0 = -H - (sp === 'olive' ? 0.22 : 0.4) + droop;
    const wide = sp === 'olive' ? 0.5 : sp === 'fruit' ? 0.36 : 0.4;
    const tall = sp === 'olive' ? 0.18 : sp === 'fruit' ? 0.34 : 0.36;
    const rr = sp === 'olive' ? 0.17 : 0.21;
    const clumps: [number, number, number][] = [];
    if (sh.twin && sp !== 'blossom' && sp !== 'olive') {
      // A forked trunk: two limbs carrying a wider crown.
      ctx.strokeStyle = hsl(p.trunk[0], p.trunk[1], p.trunk[2] - 2);
      ctx.lineWidth = 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -H * 0.7); ctx.quadraticCurveTo(-0.1, -H - 0.05, -0.2, -H - 0.2);
      ctx.moveTo(0, -H * 0.75); ctx.quadraticCurveTo(0.12, -H, 0.22, -H - 0.18); ctx.stroke();
    }
    const spread = sh.twin && sp !== 'blossom' && sp !== 'olive' ? 1.25 : 1;
    for (let i = 0; i < sh.n; i++) {
      const a = (i / sh.n) * Math.PI * 2 + r();
      clumps.push([Math.cos(a) * wide * spread * (0.45 + r() * 0.5), cy0 + Math.sin(a) * tall * (0.4 + r() * 0.5), rr * (0.75 + r() * 0.45) * (9 / sh.n) ** 0.35]);
    }
    if (sh.tiers === 2) for (let i = 0; i < 5; i++) {
      // A smaller crown above the first.
      const a = (i / 5) * Math.PI * 2 + r();
      clumps.push([Math.cos(a) * wide * 0.4 * (0.4 + r() * 0.5), cy0 - tall * 1.25 + Math.sin(a) * tall * 0.3, rr * (0.6 + r() * 0.3)]);
    }
    clumps.sort((a, b) => a[1] - b[1]);
    // Back clumps darker, the front ones lit.
    for (const [x, y, rad] of clumps) blob(ctx, x, y, rad, [p.leaf[0], p.leaf[1], p.leaf[2] - (y < cy0 ? 0 : 2)]);
    blob(ctx, -0.04, cy0 - 0.05, rr * 1.15, p.leaf);
    if (p.glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, -0.04, cy0, rr * 2.2, [p.accent[0], 90, 70], 0.18 * p.glow);
      ctx.restore();
    }
    // Blossoms, fruit or olives on a full tree (a few flowers on a medium blossom).
    const dots = sp === 'blossom' ? (full ? 26 : k.stage === 3 ? 10 : 0) : full ? (sp === 'olive' ? 12 : 8) : 0;
    for (let i = 0; i < dots; i++) {
      const [x, y, rad] = clumps[i % clumps.length];
      const a = r() * Math.PI * 2, d = r() * rad * 0.8;
      const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d;
      if (sp === 'blossom') {
        ctx.fillStyle = hsl(p.accent[0], p.accent[1], p.accent[2] + (r() - 0.5) * 8);
        ctx.beginPath(); ctx.arc(fx, fy, 0.03 + r() * 0.02, 0, Math.PI * 2); ctx.fill();
      } else blob(ctx, fx, fy, sp === 'olive' ? 0.03 : 0.055, p.accent);
    }
    if (full && sp === 'blossom') {
      // A few petals on the grass.
      ctx.fillStyle = hsl(p.accent[0], p.accent[1], p.accent[2], 0.8);
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse((r() - 0.5) * 0.7, (r() - 0.3) * 0.18, 0.025, 0.014, r() * 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

/** A soft water-drop bubble over a thirsty tree. */
export function drawThirst(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, t: number) {
  const bob = Math.sin(t * 2.2) * u * 0.04;
  const r = u * 0.17;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.shadowColor = 'rgba(0,0,0,.18)';
  ctx.shadowBlur = u * 0.12;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.8); ctx.lineTo(0, r * 1.35); ctx.lineTo(r * 0.3, r * 0.8); ctx.fill();
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6);
  g.addColorStop(0, '#7cc8f2'); g.addColorStop(1, '#2f86c9');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.bezierCurveTo(r * 0.5, -r * 0.05, r * 0.42, r * 0.55, 0, r * 0.55);
  ctx.bezierCurveTo(-r * 0.42, r * 0.55, -r * 0.5, -r * 0.05, 0, -r * 0.62);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath(); ctx.ellipse(-r * 0.13, r * 0.12, r * 0.07, r * 0.13, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// --- decorations ---
function box(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, ax: number, by: number, hgt: number, top: string, left: string, right: string, lift = 0) {
  const P = (sx: number, sy: number, up: number) => [cx + (sx * ax - sy * by) * u / 2, cy + (sx * ax + sy * by) * u / 4 - up] as const;
  const poly = (pts: (readonly [number, number])[], c: string) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
  const lo = lift, hi = lift + hgt;
  poly([P(-1, 1, lo), P(1, 1, lo), P(1, 1, hi), P(-1, 1, hi)], left);
  poly([P(1, 1, lo), P(1, -1, lo), P(1, -1, hi), P(1, 1, hi)], right);
  poly([P(-1, -1, hi), P(1, -1, hi), P(1, 1, hi), P(-1, 1, hi)], top);
}
function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, c: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, c.replace('A', String(a)));
  g.addColorStop(1, c.replace('A', '0'));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
}
const WARM = 'rgba(255, 210, 130, A)';

/** Height of a decoration in tile widths (hit tests). */
export const decoHeight = (k: DecoKind) => ({ lamp: 0.9, flowers: 0.25, stones: 0.1, bench: 0.35, pond: 0.12, fountain: 0.7, arch: 1.25, pavilion: 1.3, moongate: 1.15, starwell: 1.2,
  goldfountain: 0.95, winnerarch: 1.25, silvergate: 1.15, silverlamps: 0.9, bronzebench: 0.5, bronzelantern: 0.95 })[k];
/** Ranks prizes: a won decoration in its metal (gold #1, silver #2, bronze #3), light / mid / shade. */
const METAL = {
  gold: ['#ffe7a0', '#e0b04a', '#a8771f'], silver: ['#f4f6f8', '#c3c9d0', '#8d949c'], bronze: ['#f0c39a', '#c8834f', '#8d5530'],
};
/** An eight-pointed star (two turned squares), centred at (x, y). */
function star8(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, turn = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(turn); ctx.fillStyle = fill;
  for (const rot of [0, Math.PI / 4]) { ctx.save(); ctx.rotate(rot); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); }
  ctx.restore();
}
/** The shimmer every prize carries: a soft glow and a few slow glints. */
function prizeShine(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, t: number, col: string, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, cx, cy - u * h * 0.5, u * 0.55, col, 0.18 + 0.06 * Math.sin(t * 1.1));
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.35 + i / 3) % 1, a = Math.sin(ph * Math.PI);
    ctx.globalAlpha = a * 0.9;
    star8(ctx, cx + Math.cos(i * 2.1) * u * 0.32, cy - u * h * (0.3 + 0.5 * ((i * 0.37) % 1)), u * 0.018 * (0.6 + a), '#fffbe6', t);
  }
  ctx.restore();
}

export function drawDeco(ctx: CanvasRenderingContext2D, k: DecoKind, cx: number, cy: number, u: number, t: number, night: boolean, lifted = false, metal?: string[]) {
  ctx.save();
  if (lifted) ctx.translate(0, -u * 0.25);
  const dim = (c: string) => {
    if (!night) return c;
    const n = parseInt(c.slice(1), 16), f = 0.72;
    return `rgb(${Math.round((n >> 16) * f)}, ${Math.round(((n >> 8) & 255) * f)}, ${Math.round((n & 255) * f)})`;
  };
  const stone = metal ? metal.map(dim) : night ? ['#b9b4aa', '#8e8a81', '#75716a'] : ['#f1ece2', '#d9d2c4', '#bfb7a8'];
  const shadow = () => { ctx.fillStyle = night ? 'rgba(0,0,0,.28)' : 'rgba(30,50,20,.18)'; ctx.beginPath(); ctx.ellipse(cx + u * 0.04, cy, u * 0.3, u * 0.14, 0, 0, Math.PI * 2); ctx.fill(); };
  const r = rng(k.length * 97 + 5);
  switch (k) {
    case 'flowers': {
      const cols = [[340, 70, 72], [48, 90, 62], [270, 50, 72], [10, 75, 66], [0, 0, 98]];
      for (let i = 0; i < 16; i++) {
        const x = cx + (r() - 0.5) * u * 0.55, y = cy + (r() - 0.5) * u * 0.25;
        ctx.strokeStyle = night ? '#2f5a45' : '#4f8a3c'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - u * 0.08); ctx.stroke();
        const c = cols[i % cols.length];
        ctx.fillStyle = hsl(c[0], c[1], c[2] * (night ? 0.8 : 1));
        ctx.beginPath(); ctx.arc(x, y - u * 0.09, u * 0.028, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(x, y - u * 0.09, u * 0.009, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'stones':
      for (const [dx, dy, s] of [[-0.2, -0.04, 1], [0.03, 0.05, 1.15], [0.24, -0.02, 0.9]] as const) {
        ctx.fillStyle = stone[2];
        ctx.beginPath(); ctx.ellipse(cx + dx * u, cy + dy * u + 1.5, u * 0.1 * s, u * 0.05 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = stone[0];
        ctx.beginPath(); ctx.ellipse(cx + dx * u, cy + dy * u, u * 0.1 * s, u * 0.05 * s, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'lamp': {
      shadow();
      ctx.fillStyle = metal ? stone[1] : night ? '#3a3a3a' : '#4a4038';
      ctx.fillRect(cx - u * 0.018, cy - u * 0.7, u * 0.036, u * 0.7);
      box(ctx, cx, cy, u, 0.07, 0.07, u * 0.04, stone[0], stone[1], stone[2]);
      const ly = cy - u * 0.78;
      glowAt(ctx, cx, ly, u * (night ? 0.7 : 0.35), WARM, night ? 0.55 : 0.3);
      ctx.fillStyle = metal ? stone[2] : '#4a4038';
      ctx.beginPath(); ctx.moveTo(cx - u * 0.08, ly - u * 0.08); ctx.lineTo(cx, ly - u * 0.16); ctx.lineTo(cx + u * 0.08, ly - u * 0.08); ctx.fill();
      ctx.fillStyle = `rgba(255, 220, 150, ${0.85 + 0.15 * Math.sin(t * 3)})`;
      ctx.fillRect(cx - u * 0.055, ly - u * 0.08, u * 0.11, u * 0.14);
      ctx.strokeStyle = '#4a4038'; ctx.lineWidth = Math.max(1, u * 0.012);
      ctx.strokeRect(cx - u * 0.055, ly - u * 0.08, u * 0.11, u * 0.14);
      break;
    }
    case 'bench': {
      shadow();
      const wood = metal ? stone : night ? ['#7a5a40', '#5a4230', '#4a3626'] : ['#c49466', '#a07650', '#87613f'];
      box(ctx, cx - u * 0.16, cy - u * 0.04, u, 0.03, 0.1, u * 0.14, stone[1], stone[1], stone[2]);
      box(ctx, cx + u * 0.16, cy + u * 0.04, u, 0.03, 0.1, u * 0.14, stone[1], stone[1], stone[2]);
      box(ctx, cx, cy, u, 0.42, 0.13, u * 0.035, wood[0], wood[1], wood[2], u * 0.14);
      box(ctx, cx - u * 0.06, cy - u * 0.11, u, 0.42, 0.02, u * 0.12, wood[0], wood[1], wood[2], u * 0.18);
      break;
    }
    case 'pond': {
      const g = ctx.createRadialGradient(cx - u * 0.1, cy - u * 0.04, 0, cx, cy, u * 0.4);
      g.addColorStop(0, night ? '#2d6a7a' : '#8fd3e8'); g.addColorStop(1, night ? '#123844' : '#3b97b8');
      ctx.fillStyle = stone[1];
      ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.42, u * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy + 1, u * 0.37, u * 0.165, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
      const ph = (t * 0.5) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.ellipse(cx + u * 0.08, cy, u * 0.06 * (1 + ph * 2), u * 0.03 * (1 + ph * 2), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      // Lily pads.
      ctx.fillStyle = night ? '#2f5a45' : '#5f9e4e';
      ctx.beginPath(); ctx.ellipse(cx - u * 0.16, cy + u * 0.03, u * 0.05, u * 0.025, 0, 0.3, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6c3d6'; ctx.beginPath(); ctx.arc(cx - u * 0.15, cy + u * 0.02, u * 0.017, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'fountain': {
      shadow();
      const water = night ? '#3d8aa0' : '#8fd3e8';
      ctx.fillStyle = stone[2]; ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.34, u * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = stone[1]; ctx.fillRect(cx - u * 0.34, cy - u * 0.1, u * 0.68, u * 0.1);
      ctx.fillStyle = stone[0]; ctx.beginPath(); ctx.ellipse(cx, cy - u * 0.1, u * 0.34, u * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = water; ctx.beginPath(); ctx.ellipse(cx, cy - u * 0.1, u * 0.29, u * 0.135, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = stone[1]; ctx.fillRect(cx - u * 0.035, cy - u * 0.42, u * 0.07, u * 0.32);
      ctx.fillStyle = stone[0]; ctx.beginPath(); ctx.ellipse(cx, cy - u * 0.42, u * 0.14, u * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      // Falling water: arcs of drops, moving.
      ctx.fillStyle = 'rgba(220,245,255,.9)';
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const ph = (t * 0.9 + i * 0.37) % 1;
        const x = cx + Math.cos(a) * u * (0.04 + ph * 0.18), y = cy - u * 0.5 + Math.sin(a) * u * 0.03 * ph + (ph * ph) * u * 0.38 - ph * u * 0.06;
        ctx.globalAlpha = 1 - ph * 0.6;
        ctx.beginPath(); ctx.arc(x, y, u * 0.012, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'arch': {
      shadow();
      const col = (dx: number) => box(ctx, cx + dx * u, cy + dx * u * 0.5, u, 0.06, 0.06, u * 0.85, stone[0], stone[1], stone[2]);
      col(-0.25);
      // The pointed arch between the columns.
      ctx.strokeStyle = stone[1]; ctx.lineWidth = u * 0.07; ctx.lineCap = 'round';
      const lx = cx - 0.25 * u, ly = cy - 0.125 * u - u * 0.85, rx = cx + 0.25 * u, ry = cy + 0.125 * u - u * 0.85;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + u * 0.03, ly - u * 0.3, (lx + rx) / 2, (ly + ry) / 2 - u * 0.36);
      ctx.quadraticCurveTo(rx - u * 0.02, ry - u * 0.3, rx, ry); ctx.stroke();
      ctx.strokeStyle = stone[0]; ctx.lineWidth = u * 0.035;
      ctx.stroke();
      col(0.25);
      // A climbing vine.
      ctx.fillStyle = night ? '#2f5a45' : '#5f9e4e';
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(lx + (r() - 0.3) * u * 0.1, ly + u * (0.1 + i * 0.08), u * 0.03, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f2a7c3';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(lx + (r() - 0.3) * u * 0.1, ly + u * (0.15 + i * 0.16), u * 0.018, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'pavilion': {
      shadow();
      box(ctx, cx, cy, u, 0.36, 0.36, u * 0.06, stone[0], stone[1], stone[2]);
      const pillar = (sx: number, sy: number) => box(ctx, cx + (sx - sy) * u * 0.14, cy + (sx + sy) * u * 0.07, u, 0.035, 0.035, u * 0.62, stone[0], stone[1], stone[2], u * 0.06);
      pillar(-1, -1); pillar(1, -1); pillar(-1, 1);
      if (night) glowAt(ctx, cx, cy - u * 0.35, u * 0.5, WARM, 0.3);
      pillar(1, 1);
      box(ctx, cx, cy, u, 0.36, 0.36, u * 0.07, stone[0], stone[1], stone[2], u * 0.68);
      // Dome with a finial.
      const dy = cy - u * 0.75;
      const g = ctx.createRadialGradient(cx - u * 0.1, dy - u * 0.2, u * 0.02, cx, dy - u * 0.1, u * 0.32);
      g.addColorStop(0, night ? '#7fb7a6' : '#b8e6d8'); g.addColorStop(1, night ? '#2c6656' : '#3e9a80');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.28, dy); ctx.bezierCurveTo(cx - u * 0.28, dy - u * 0.28, cx - u * 0.06, dy - u * 0.34, cx, dy - u * 0.44);
      ctx.bezierCurveTo(cx + u * 0.06, dy - u * 0.34, cx + u * 0.28, dy - u * 0.28, cx + u * 0.28, dy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8c76a'; ctx.beginPath(); ctx.arc(cx, dy - u * 0.47, u * 0.025, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'moongate': {
      shadow();
      const R = u * 0.42, my = cy - u * 0.5;
      // Light through the gate.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowAt(ctx, cx, my, R * 0.95, 'rgba(190, 220, 255, A)', 0.25 + 0.1 * Math.sin(t * 0.8));
      ctx.restore();
      ctx.strokeStyle = stone[2]; ctx.lineWidth = u * 0.16;
      ctx.beginPath(); ctx.ellipse(cx + 1, my + 1, R * 0.8, R, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = stone[0]; ctx.lineWidth = u * 0.13;
      ctx.beginPath(); ctx.ellipse(cx, my, R * 0.8, R, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(232, 199, 106, .8)'; ctx.lineWidth = Math.max(1, u * 0.012);
      ctx.beginPath(); ctx.ellipse(cx, my, R * 0.8 - u * 0.065, R - u * 0.065, 0, 0, Math.PI * 2); ctx.stroke();
      // A crescent in the gate.
      ctx.fillStyle = '#fff5d6';
      ctx.beginPath(); ctx.arc(cx + u * 0.05, my - u * 0.12, u * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx + u * 0.09, my - u * 0.15, u * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'goldfountain': { // the fountain in gold, a trophy cup on top with water spilling from it
      const m = METAL.gold, sm = m.map(dim);
      prizeShine(ctx, cx, cy, u, t, WARM, 0.9);
      drawDeco(ctx, 'fountain', cx, cy, u, t, night, false, m);
      const ty = cy - u * 0.5;
      ctx.fillStyle = sm[1]; ctx.fillRect(cx - u * 0.02, ty - u * 0.1, u * 0.04, u * 0.1);
      ctx.fillStyle = sm[2]; ctx.beginPath(); ctx.ellipse(cx, ty, u * 0.07, u * 0.025, 0, 0, Math.PI * 2); ctx.fill();
      const cupY = ty - u * 0.1;
      const g = ctx.createLinearGradient(cx - u * 0.11, 0, cx + u * 0.11, 0);
      g.addColorStop(0, sm[2]); g.addColorStop(0.35, sm[0]); g.addColorStop(1, sm[1]);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.11, cupY - u * 0.17); ctx.quadraticCurveTo(cx - u * 0.1, cupY, cx, cupY); ctx.quadraticCurveTo(cx + u * 0.1, cupY, cx + u * 0.11, cupY - u * 0.17); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = sm[1]; ctx.lineWidth = Math.max(1, u * 0.018);
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * u * 0.12, cupY - u * 0.11, u * 0.04, u * 0.045, 0, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5); ctx.stroke(); }
      ctx.fillStyle = night ? '#3d8aa0' : '#8fd3e8'; ctx.beginPath(); ctx.ellipse(cx, cupY - u * 0.17, u * 0.105, u * 0.03, 0, 0, Math.PI * 2); ctx.fill();
      star8(ctx, cx, cupY - u * 0.085, u * 0.03, '#fff3c4', Math.PI / 8);
      break;
    }
    case 'winnerarch': { // the arch in gold, three small lanterns hanging under it
      const m = METAL.gold;
      prizeShine(ctx, cx, cy, u, t, WARM, 1.1);
      drawDeco(ctx, 'arch', cx, cy, u, t, night, false, m);
      for (const [dx, dy] of [[-0.12, 0.16], [0, 0.08], [0.12, 0.16]] as const) {
        const x = cx + dx * u, y = cy - u * 1.05 + dy * u + Math.sin(t * 1.4 + dx * 9) * u * 0.008;
        ctx.strokeStyle = dim(m[2]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - u * 0.1); ctx.lineTo(x, y - u * 0.04); ctx.stroke();
        glowAt(ctx, x, y, u * (night ? 0.18 : 0.1), WARM, night ? 0.6 : 0.35);
        ctx.fillStyle = `rgba(255, 214, 140, ${0.85 + 0.15 * Math.sin(t * 2.6 + dx * 7)})`;
        ctx.beginPath(); ctx.ellipse(x, y, u * 0.028, u * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dim(m[1]); ctx.fillRect(x - u * 0.02, y - u * 0.05, u * 0.04, u * 0.012);
      }
      break;
    }
    case 'silvergate': { // the moon gate in silver
      prizeShine(ctx, cx, cy, u, t, 'rgba(210, 228, 255, A)', 1);
      drawDeco(ctx, 'moongate', cx, cy, u, t, night, false, METAL.silver);
      star8(ctx, cx - u * 0.12, cy - u * 0.68, u * 0.025, '#f4f8ff', t * 0.2);
      break;
    }
    case 'silverlamps': { // two silver lamps side by side
      prizeShine(ctx, cx, cy, u, t, 'rgba(210, 228, 255, A)', 0.8);
      drawDeco(ctx, 'lamp', cx - u * 0.13, cy - u * 0.065, u, t, night, false, METAL.silver);
      drawDeco(ctx, 'lamp', cx + u * 0.13, cy + u * 0.065, u, t + 0.7, night, false, METAL.silver);
      break;
    }
    case 'bronzebench': { // the bench in bronze, a star on its back
      prizeShine(ctx, cx, cy, u, t, WARM, 0.4);
      drawDeco(ctx, 'bench', cx, cy, u, t, night, false, METAL.bronze);
      star8(ctx, cx - u * 0.06, cy - u * 0.36, u * 0.045, dim(METAL.bronze[0]), Math.PI / 8);
      star8(ctx, cx - u * 0.06, cy - u * 0.36, u * 0.02, '#fff0dc', Math.PI / 8);
      break;
    }
    case 'bronzelantern': { // the garden lamp in bronze, a turning star on top
      prizeShine(ctx, cx, cy, u, t, WARM, 0.85);
      drawDeco(ctx, 'lamp', cx, cy, u, t, night, false, METAL.bronze);
      star8(ctx, cx, cy - u * 0.97, u * 0.035, dim(METAL.bronze[0]), t * 0.4);
      break;
    }
    case 'starwell': {
      shadow();
      ctx.fillStyle = stone[2]; ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.26, u * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = stone[1]; ctx.fillRect(cx - u * 0.26, cy - u * 0.16, u * 0.52, u * 0.16);
      ctx.fillStyle = stone[0]; ctx.beginPath(); ctx.ellipse(cx, cy - u * 0.16, u * 0.26, u * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = night ? '#0d2733' : '#24566a'; ctx.beginPath(); ctx.ellipse(cx, cy - u * 0.16, u * 0.2, u * 0.095, 0, 0, Math.PI * 2); ctx.fill();
      // A beam of light rising, an eight-pointed star turning slowly in it.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, cy - u * 0.16, 0, cy - u * 1.2);
      beam.addColorStop(0, 'rgba(255, 225, 150, .55)'); beam.addColorStop(1, 'rgba(255, 225, 150, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.16, cy - u * 0.16); ctx.lineTo(cx - u * 0.06, cy - u * 1.2); ctx.lineTo(cx + u * 0.06, cy - u * 1.2); ctx.lineTo(cx + u * 0.16, cy - u * 0.16); ctx.fill();
      const sy = cy - u * (0.85 + 0.04 * Math.sin(t * 1.3));
      glowAt(ctx, cx, sy, u * 0.3, WARM, 0.5);
      ctx.restore();
      ctx.save();
      ctx.translate(cx, sy); ctx.rotate(t * 0.3);
      ctx.fillStyle = '#ffe9a8';
      for (const rot of [0, Math.PI / 4]) {
        ctx.save(); ctx.rotate(rot);
        ctx.fillRect(-u * 0.065, -u * 0.065, u * 0.13, u * 0.13);
        ctx.restore();
      }
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

/** A tile with one thing on it, for the store and sheets (crisp at the device's pixel ratio). */
export function vignette(size: number, draw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number) => void, night: boolean, tall = 1.95): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  // The tile as large as the thing on it allows (`tall`: its height in tile widths).
  const u = size * Math.min(0.62, 0.72 / Math.max(0.6, tall));
  const iso: Iso = { tw: u, th: u / 2, ox: size / 2, oy: size * 0.8 - u / 4 };
  drawGround(ctx, iso, 1, night, 0, 0);
  const p = cellCenter(iso, 0, 0);
  draw(ctx, p.x, p.y, u);
  c.setAttribute('aria-hidden', 'true');
  return c;
}

/** A surah's own seed, large (the store's packets, the seed under the finger); `size` = its glow's width. */
export function drawSeedAt(ctx: CanvasRenderingContext2D, s: number, x: number, y: number, size: number, t = 0) {
  const u = size / 200;
  (MagicTrees.drawSeed as (c: CanvasRenderingContext2D, x: number, y: number, u: number, T: unknown, t: number) => void)(ctx, x, y + 34 * u, u, magic(s), t);
}
/** A seed as a small picture for the store. */
export function seedPic(s: number, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawSeedAt(ctx, s, size / 2, size / 2, size);
  c.setAttribute('aria-hidden', 'true');
  return c;
}
