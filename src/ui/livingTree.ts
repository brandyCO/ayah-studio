// A living tree for the Learn gardens (premium pass, owner request 2026-11-02): one tree per surah,
// grown continuously from a growth value g (0 = a seed, 1 = full grown) instead of in stages. The tree
// is a seeded structure of branches, each born at its own moment of growth, that lengthen and thicken;
// leaves unfold one by one along them, then blossom and fruit. Every surah gets its own branching.
// Wind moves each branch on its own (the sway passes from a branch to its children). Pure in (g, t):
// the same surah, growth and time always draw the same picture. Canvas 2D, no images.
import { rng, speciesOf, type Species } from './gardenArt';

interface Branch {
  parent: number;
  /** Where on the parent it starts (0–1 of the parent's length). */
  at: number;
  /** Angle relative to the parent (radians, 0 = straight on). */
  angle: number;
  len: number;
  /** Width at the base (relative to the trunk's). */
  w: number;
  /** Growth value at which it starts, and how much growth it takes to reach full length. */
  birth: number;
  span: number;
  depth: number;
  /** Bend along its length, and its own wind phase. */
  curve: number;
  phase: number;
}
interface Leaf { b: number; at: number; angle: number; size: number; birth: number; shade: number; side: number }
interface Bloom { b: number; at: number; angle: number; birth: number; size: number; kind: 'flower' | 'fruit' }
export interface LiveTree { s: number; species: Species; branches: Branch[]; leaves: Leaf[]; blooms: Bloom[]; hue: number; accent: [number, number, number] }

const cache = new Map<number, LiveTree>();
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const c = clamp(x); return c * c * (3 - 2 * c); };

/** The surah's tree structure (built once, seeded by its number). */
export function liveTree(s: number): LiveTree {
  const hit = cache.get(s);
  if (hit) return hit;
  const r = rng(s * 7717 + 3);
  const species = speciesOf(s);
  const branches: Branch[] = [];
  const leaves: Leaf[] = [];
  const blooms: Bloom[] = [];
  const lean = (r() - 0.5) * 0.25;
  const add = (b: Branch) => { branches.push(b); return branches.length - 1; };

  if (species === 'palm') {
    // A ringed trunk in curving segments, a crown of fronds that multiplies as it grows.
    const bend = (r() < 0.5 ? -1 : 1) * (0.05 + r() * 0.06);
    let prev = -1;
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      prev = add({ parent: prev, at: 1, angle: i === 0 ? lean * 0.5 : bend, len: 0.15 + r() * 0.02, w: 0.1 * (1 - i * 0.035), birth: (i / segs) * 0.55, span: 0.12, depth: 0, curve: 0, phase: r() * 6 });
    }
    const fronds = 9 + Math.floor(r() * 4);
    for (let i = 0; i < fronds; i++) {
      const a = ((i / fronds) - 0.5) * Math.PI * 1.7 + (r() - 0.5) * 0.2;
      add({ parent: prev, at: 1, angle: a, len: 0.55 + r() * 0.2, w: 0.025, birth: 0.04 + (i % fronds) / fronds * 0.75, span: 0.22, depth: 1, curve: Math.sign(a || 1) * (0.9 + r() * 0.4), phase: r() * 6 });
    }
    for (let i = 0; i < 9; i++) blooms.push({ b: prev, at: 1, angle: Math.PI + (r() - 0.5) * 1.2, birth: 0.88 + r() * 0.1, size: 0.035 + r() * 0.01, kind: 'fruit' });
  } else {
    const P = {
      cypress: { trunk: 1.3, depth: 2, kids: [5, 9], spread: 0.28, shrink: 0.32, leaves: 26, leaf: 0.05 },
      olive: { trunk: 0.42, depth: 4, kids: [2, 3], spread: 0.75, shrink: 0.72, leaves: 9, leaf: 0.045 },
      broad: { trunk: 0.5, depth: 5, kids: [2, 3], spread: 0.6, shrink: 0.74, leaves: 7, leaf: 0.06 },
      blossom: { trunk: 0.48, depth: 5, kids: [2, 3], spread: 0.68, shrink: 0.72, leaves: 5, leaf: 0.05 },
      fruit: { trunk: 0.46, depth: 5, kids: [2, 3], spread: 0.62, shrink: 0.72, leaves: 7, leaf: 0.06 },
    }[species];
    const trunk = add({ parent: -1, at: 0, angle: lean, len: P.trunk * (0.9 + r() * 0.2), w: species === 'olive' ? 0.13 : 0.1, birth: 0, span: species === 'cypress' ? 0.8 : 0.32, depth: 0, curve: (r() - 0.5) * (species === 'olive' ? 0.8 : 0.3), phase: r() * 6 });
    const grow = (pi: number, depth: number) => {
      const p = branches[pi];
      if (depth > P.depth) return;
      const n = species === 'cypress' && depth === 1 ? P.kids[0] + Math.floor(r() * (P.kids[1] - P.kids[0] + 1)) : P.kids[0] + (r() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const at = species === 'cypress' && depth === 1 ? 0.15 + (i / n) * 0.8 : n === 1 ? 1 : 0.55 + r() * 0.45;
        const side = species === 'cypress' ? (i % 2 ? 1 : -1) : i === 0 ? -1 : i === 1 ? 1 : (r() - 0.5) * 0.6;
        const angle = side * P.spread * (0.6 + r() * 0.6) + (r() - 0.5) * 0.2;
        const len = (species === 'cypress' && depth === 1 ? 0.22 * (1 - at * 0.7) : p.len * P.shrink * (0.85 + r() * 0.3));
        const birth = p.birth + p.span * at * 0.85;
        const b = add({ parent: pi, at, angle, len, w: p.w * (species === 'cypress' ? 0.25 : 0.68), birth, span: p.span * (species === 'cypress' ? 0.3 : 0.86), depth, curve: (r() - 0.5) * 0.5, phase: r() * 6 });
        // Leaves along the newer branches, each unfolding a moment after the wood reaches it.
        if (depth >= (species === 'cypress' ? 1 : 2)) {
          const k = Math.round(P.leaves * (0.7 + r() * 0.6));
          for (let j = 0; j < k; j++) {
            const la = 0.2 + r() * 0.8;
            leaves.push({ b, at: la, angle: (r() - 0.5) * 2.4, size: P.leaf * (0.75 + r() * 0.5), birth: birth + p.span * 0.86 * la + 0.03 + r() * 0.05, shade: r(), side: r() < 0.5 ? -1 : 1 });
          }
          if (species === 'blossom' || species === 'fruit') {
            const m = species === 'blossom' ? 3 : r() < 0.4 ? 1 : 0;
            for (let j = 0; j < m; j++) blooms.push({ b, at: 0.5 + r() * 0.5, angle: (r() - 0.5) * 2, birth: species === 'blossom' ? 0.72 + r() * 0.2 : 0.86 + r() * 0.12, size: species === 'blossom' ? 0.03 : 0.045, kind: species === 'blossom' ? 'flower' : 'fruit' });
          }
          if (species === 'olive' && r() < 0.3) blooms.push({ b, at: 0.6 + r() * 0.4, angle: 2, birth: 0.9 + r() * 0.08, size: 0.022, kind: 'fruit' });
        }
        grow(b, depth + 1);
      }
    };
    grow(trunk, 1);
  }
  const hueR = rng(s * 7919)();
  const FR = [356, 24, 48, 280, 8, 36], BL = [338, 0, 300, 18, 350, 270];
  const pick = Math.floor(rng(s * 31337 + 7)() * 6);
  const accent: [number, number, number] = species === 'blossom' ? (BL[pick] === 0 ? [40, 30, 97] : [BL[pick], 72, 86])
    : species === 'palm' ? [28, 70, 40] : species === 'olive' ? [250, 22, 28] : [FR[pick], 74, FR[pick] === 48 ? 56 : 48];
  const t: LiveTree = { s, species, branches, leaves, blooms, hue: (hueR - 0.5) * 18, accent };
  cache.set(s, t);
  return t;
}

export interface LiveLook {
  /** Growth 0–1. */
  g: number;
  /** Seconds (wind). */
  t: number;
  night: boolean;
  /** Thirst 0–1: paler leaves, a droop. */
  thirst?: number;
  /** Variety 0–3 (Classic, Autumn, Moonlit, Light). */
  v?: number;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(1)},${Math.max(0, Math.min(100, s)).toFixed(1)}%,${Math.max(0, Math.min(100, l)).toFixed(1)}%,${a})`;

function leafColour(sp: Species, v: number, hue: number): [number, number, number] {
  if (v === 1) return [32 + hue / 2, 74, 50];
  if (v === 2) return [190 + hue / 3, 32, 70];
  if (v === 3) return [47, 92, 60];
  return sp === 'palm' ? [94 + hue, 46, 40] : sp === 'olive' ? [86 + hue / 2, 20, 50] : sp === 'cypress' ? [146 + hue / 2, 36, 27]
    : sp === 'blossom' ? [104 + hue, 36, 44] : sp === 'fruit' ? [124 + hue, 40, 33] : [112 + hue, 42, 37];
}

/**
 * Draws the tree with its base at (x, y); `unit` px = one tree unit (a full tree is about 1.5–2 units tall).
 * Light falls from the upper left.
 */
export function drawLiveTree(ctx: CanvasRenderingContext2D, tree: LiveTree, x: number, y: number, unit: number, k: LiveLook) {
  const g = clamp(k.g);
  const v = k.v ?? 0;
  const thirst = k.thirst ?? 0;
  const sp = tree.species;
  const night = k.night;
  const B = tree.branches;
  const n = B.length;
  // Where every branch is this frame: start point, absolute angle, visible length, width.
  const sx = new Float32Array(n), sy = new Float32Array(n), ang = new Float32Array(n), vis = new Float32Array(n), wid = new Float32Array(n);
  const girth = 0.3 + 0.7 * ease(g * 1.2);
  const wind = (b: Branch) => Math.sin(k.t * (0.7 + b.depth * 0.18) + b.phase) * 0.018 * (1 + b.depth * 0.9) + Math.sin(k.t * 0.31 + b.phase * 0.5) * 0.012;
  const droop = thirst * 0.12;
  for (let i = 0; i < n; i++) {
    const b = B[i];
    const grown = ease((g - b.birth) / b.span);
    vis[i] = b.len * grown;
    wid[i] = b.w * girth * (0.35 + 0.65 * grown);
    if (b.parent < 0) { sx[i] = 0; sy[i] = 0; ang[i] = b.angle + wind(b) * 0.3; continue; }
    const p = b.parent;
    const along = vis[p] * b.at;
    // The parent bends along its length (curve): the point and the direction at `at`.
    const pa = ang[p] + B[p].curve * b.at * 0.5;
    sx[i] = sx[p] + Math.sin(pa) * along;
    sy[i] = sy[p] - Math.cos(pa) * along;
    // Branches droop a little when thirsty and sway in the wind, more at the tips.
    ang[i] = pa + b.angle + wind(b) + (b.depth > 0 ? droop * Math.sign(b.angle || 1) : 0);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unit, unit);

  // Soft shadow on the ground, cast to the lower right.
  const crownW = sp === 'cypress' ? 0.25 : sp === 'palm' ? 0.5 : 0.6;
  const sh = ctx.createRadialGradient(0.12, 0.02, 0, 0.12, 0.02, crownW * (0.4 + g));
  sh.addColorStop(0, night ? 'rgba(0,0,0,.35)' : 'rgba(30,45,20,.26)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.ellipse(0.12, 0.02, crownW * (0.4 + g), crownW * (0.4 + g) * 0.3, 0, 0, Math.PI * 2); ctx.fill();

  // Seed: a sprouting seed in a small mound until the trunk starts.
  if (g < 0.06) {
    const m = ctx.createRadialGradient(-0.03, -0.04, 0.01, 0, -0.01, 0.1);
    m.addColorStop(0, night ? '#5a4632' : '#8a6a48'); m.addColorStop(1, night ? '#2e2318' : '#5a4130');
    ctx.fillStyle = m;
    ctx.beginPath(); ctx.ellipse(0, -0.01, 0.1, 0.05, 0, Math.PI, 0); ctx.fill();
    const sprout = ease(g / 0.06);
    ctx.strokeStyle = hsl(100, 45, night ? 40 : 52);
    ctx.lineWidth = 0.012; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -0.04); ctx.quadraticCurveTo(0.01, -0.04 - 0.06 * sprout, 0.025 * sprout, -0.04 - 0.09 * sprout); ctx.stroke();
  }

  // Wood: each branch a tapered, slightly curved limb; a lit edge on the left.
  const bark = v === 2 ? [205, 10, night ? 50 : 72] : v === 3 ? [38, 32, night ? 60 : 82] : sp === 'palm' ? [32, 34, night ? 30 : 44] : sp === 'olive' ? [32, 12, night ? 28 : 40] : [24, 30, night ? 22 : 31];
  const order = [...B.keys()].sort((a, b) => B[a].depth - B[b].depth);
  for (const i of order) {
    if (vis[i] <= 0.002) continue;
    const b = B[i];
    const w0 = wid[i], w1 = b.depth === 0 && sp !== 'palm' ? w0 * 0.55 : w0 * 0.45;
    const a0 = ang[i], a1 = a0 + b.curve * 0.5;
    const ex = sx[i] + Math.sin((a0 + a1) / 2) * vis[i], ey = sy[i] - Math.cos((a0 + a1) / 2) * vis[i];
    const mx = sx[i] + Math.sin(a0) * vis[i] * 0.5, my = sy[i] - Math.cos(a0) * vis[i] * 0.5;
    if (sp === 'palm' && b.depth === 1) {
      drawFrond(ctx, sx[i], sy[i], a0, vis[i], b.curve, ease((g - b.birth) / b.span), leafColour(sp, v, tree.hue), night, thirst);
      continue;
    }
    const nx0 = Math.cos(a0), ny0 = Math.sin(a0), nx1 = Math.cos(a1), ny1 = Math.sin(a1);
    ctx.fillStyle = hsl(bark[0], bark[1], bark[2]);
    ctx.beginPath();
    ctx.moveTo(sx[i] - nx0 * w0 / 2, sy[i] - ny0 * w0 / 2);
    ctx.quadraticCurveTo(mx - nx0 * (w0 + w1) / 4, my - ny0 * (w0 + w1) / 4, ex - nx1 * w1 / 2, ey - ny1 * w1 / 2);
    ctx.arc(ex, ey, w1 / 2, a1 + Math.PI, a1, false);
    ctx.quadraticCurveTo(mx + nx0 * (w0 + w1) / 4, my + ny0 * (w0 + w1) / 4, sx[i] + nx0 * w0 / 2, sy[i] + ny0 * w0 / 2);
    ctx.closePath();
    ctx.fill();
    if (w0 > 0.012) {
      // The lit side of the bark, and for palms the rings.
      ctx.strokeStyle = hsl(bark[0], bark[1] - 4, bark[2] + 14, 0.7);
      ctx.lineWidth = w0 * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx[i] - nx0 * w0 * 0.22, sy[i] - ny0 * w0 * 0.22);
      ctx.quadraticCurveTo(mx - nx0 * w0 * 0.2, my - ny0 * w0 * 0.2, ex - nx1 * w1 * 0.2, ey - ny1 * w1 * 0.2);
      ctx.stroke();
      if (sp === 'palm') {
        ctx.strokeStyle = hsl(bark[0], bark[1], bark[2] - 10, 0.6);
        ctx.lineWidth = 0.008;
        ctx.beginPath(); ctx.moveTo(ex - nx1 * w1 * 0.5, ey - ny1 * w1 * 0.5); ctx.lineTo(ex + nx1 * w1 * 0.5, ey + ny1 * w1 * 0.5); ctx.stroke();
      }
    }
  }

  // Leaves: unfold one by one (scale and colour from bud-green), the back ones darker, the lit side lighter.
  const base = leafColour(sp, v, tree.hue);
  const lc: [number, number, number] = thirst > 0 ? [base[0] * (1 - thirst * 0.5) + 44 * thirst * 0.5, base[1] * (1 - thirst * 0.55), base[2] + thirst * 6] : base;
  const nightK = night && v < 2 ? 0.72 : 1;
  const L = tree.leaves;
  // Crown centre for the light: leaves up and to the left catch it.
  let cx = 0, cy = 0, cnt = 0;
  for (const lf of L) { if (g < lf.birth) continue; const i = lf.b; cx += sx[i]; cy += sy[i]; cnt++; }
  if (cnt) { cx /= cnt; cy /= cnt; }
  if (v === 3 && cnt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.7);
    gl.addColorStop(0, `rgba(255,220,130,${0.25 * g})`); gl.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Two passes: the shaded leaves behind, then the lit ones in front.
  for (const pass of [0, 1]) {
    for (const lf of L) {
      if (g < lf.birth || (lf.shade < 0.45 ? 0 : 1) !== pass) continue;
      const i = lf.b;
      const along = vis[i] * lf.at;
      const a = ang[i] + B[i].curve * lf.at * 0.5;
      const px = sx[i] + Math.sin(a) * along, py = sy[i] - Math.cos(a) * along;
      const open = ease((g - lf.birth) / 0.06);
      const size = lf.size * (0.3 + 0.7 * open);
      const flutter = Math.sin(k.t * 2.1 + lf.shade * 20) * 0.12;
      const la = a + lf.side * (0.9 + lf.angle * 0.3) + flutter + thirst * 0.5 * lf.side;
      const lit = clamp(0.5 + ((cx - px) * -1 + (cy - py) * -1) * 0.9) * 0.5 + lf.shade * 0.5;
      const l = (lc[2] - 9 + lit * 20) * nightK;
      const young = 1 - open;
      ctx.fillStyle = hsl(lc[0] - young * 12, lc[1] + young * 10, l + young * 10);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(la);
      ctx.beginPath();
      if (sp === 'cypress') { ctx.ellipse(0, -size * 0.5, size * 0.55, size * 0.9, 0, 0, Math.PI * 2); }
      else if (sp === 'olive') { ctx.ellipse(0, -size * 0.8, size * 0.22, size * 0.8, 0, 0, Math.PI * 2); }
      else { ctx.moveTo(0, 0); ctx.quadraticCurveTo(size * 0.55, -size * 0.55, 0, -size * 1.25); ctx.quadraticCurveTo(-size * 0.55, -size * 0.55, 0, 0); }
      ctx.fill();
      if (pass === 1 && size > 0.035) {
        // A fine vein and a glint of light on the lit leaves.
        ctx.strokeStyle = hsl(lc[0], lc[1] - 10, l + 16, 0.5);
        ctx.lineWidth = size * 0.06;
        ctx.beginPath(); ctx.moveTo(0, -size * 0.1); ctx.lineTo(0, -size * 1.0); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // Blossom and fruit.
  for (const bl of tree.blooms) {
    if (g < bl.birth) continue;
    const i = bl.b;
    const along = vis[i] * bl.at;
    const a = ang[i] + B[i].curve * bl.at * 0.5;
    const px = sx[i] + Math.sin(a) * along + Math.sin(a + bl.angle) * 0.02, py = sy[i] - Math.cos(a) * along - Math.cos(a + bl.angle) * 0.02 + (bl.kind === 'fruit' ? 0.02 : 0);
    const open = ease((g - bl.birth) / 0.05);
    const ac = v === 1 ? [14, 80, 52] : v === 2 ? [210, 60, 92] : v === 3 ? [42, 100, 88] : tree.accent;
    const r = bl.size * open;
    if (bl.kind === 'flower') {
      ctx.fillStyle = hsl(ac[0], ac[1], ac[2] * (night ? 0.85 : 1));
      for (let p = 0; p < 5; p++) { const pa = p * 1.2566 + bl.angle; ctx.beginPath(); ctx.arc(px + Math.cos(pa) * r * 0.5, py + Math.sin(pa) * r * 0.5, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(px, py, r * 0.22, 0, Math.PI * 2); ctx.fill();
    } else {
      const fg = ctx.createRadialGradient(px - r * 0.35, py - r * 0.35, r * 0.1, px, py, r);
      fg.addColorStop(0, hsl(ac[0], ac[1], ac[2] + 18)); fg.addColorStop(1, hsl(ac[0], ac[1], ac[2] - 8));
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawFrond(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, curve: number, open: number, c: [number, number, number], night: boolean, thirst: number) {
  // A rib arching out and down, with leaflets along both sides, unfolding from the base.
  const steps = 14;
  const pts: [number, number, number][] = [];
  let px = x, py = y, pa = a;
  for (let i = 0; i <= steps; i++) {
    pts.push([px, py, pa]);
    pa += (curve * (0.5 + thirst * 0.4)) / steps;
    px += Math.sin(pa) * len / steps;
    py -= Math.cos(pa) * len / steps;
  }
  ctx.strokeStyle = hsl(c[0], c[1] - 10, c[2] - 8);
  ctx.lineWidth = 0.012;
  ctx.lineCap = 'round';
  ctx.beginPath(); pts.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy))); ctx.stroke();
  for (let i = 1; i <= steps; i++) {
    const [qx, qy, qa] = pts[i];
    const k = i / steps;
    const ll = 0.13 * Math.sin(k * Math.PI * 0.9 + 0.2) * open;
    for (const side of [-1, 1]) {
      const la = qa + side * (1.1 + k * 0.3) + 0.25;
      ctx.strokeStyle = hsl(c[0], c[1], (c[2] + (side < 0 ? 8 : -2)) * (night ? 0.75 : 1));
      ctx.lineWidth = 0.016 * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.quadraticCurveTo(qx + Math.sin(la) * ll * 0.6, qy - Math.cos(la) * ll * 0.6 + 0.02, qx + Math.sin(la) * ll, qy - Math.cos(la) * ll + 0.05); ctx.stroke();
    }
  }
}
