// @ts-nocheck
/* The 114 magic trees: every surah its own shape, leaves, fruit, bark, colours and seed. Drawn in a 500 x 625 frame,
   ground at y 520, growth g 0 to 1 (seed to full tree; fruit from about 0.8). Pure in (surah, g, t). */

const TAU = Math.PI * 2, GROUND = 520, CX = 250;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${clamp(s, 0, 100)}%,${clamp(l, 0, 100)}%,${a})`;
function glow(ctx, x, y, r, h, s, l, a = 1) {
  if (a <= 0.005 || r <= 0.5) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hsl(h, s, l, a)); g.addColorStop(.35, hsl(h, s, l, a * .35)); g.addColorStop(1, hsl(h, s, l, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
}
function sparkle(ctx, x, y, r, h, s, l, a = 1) {
  if (a <= 0.01 || r < .3) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hsl(h, s, l, a); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const an = i * TAU / 8 - Math.PI / 2, rr = i % 2 ? r * .18 : r * (i % 4 ? .55 : 1); ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
  ctx.fill(); ctx.restore(); glow(ctx, x, y, r * 1.4, h, s, l, a * .5);
}
function leafPath(ctx, x, y, a, len, wid, round = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * (.3 - round * .1), -wid, len * (.75 + round * .15), -wid * (.8 + round * .3), len, 0);
  ctx.bezierCurveTo(len * (.75 + round * .15), wid * (.8 + round * .3), len * (.3 - round * .1), wid, 0, 0);
  ctx.restore();
}
function leaf(ctx, x, y, a, len, wid, fill, vein, round) {
  if (len < .5) return; leafPath(ctx, x, y, a, len, wid, round); ctx.fillStyle = fill; ctx.fill();
  if (vein) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeStyle = vein; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(len * .08, 0); ctx.lineTo(len * .85, 0); ctx.stroke(); ctx.restore(); }
}
function star(ctx, x, y, r, n, inner, rot = -Math.PI / 2) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
const bez = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---------- wood ----------
function grow(o, r) {
  const segs = [], tips = [];
  const rec = (x, y, a, len, w, d, dist) => {
    const a2 = a + (r() - .5) * o.curve;
    const x1 = x + Math.cos(a2) * len, y1 = y + Math.sin(a2) * len;
    const cx = x + Math.cos(a) * len * .55, cy = y + Math.sin(a) * len * .55, w1 = Math.max(o.minW || 1, w * o.wdecay);
    segs.push({ x0: x, y0: y, x1, y1, cx, cy, w0: w, w1, d, s0: dist, s1: dist + len });
    if (d >= o.depth) { tips.push({ x: x1, y: y1, a: a2, d, b: dist + len, end: true }); return; }
    const n = d < 1 ? o.k0 : (r() < o.k3 ? 3 : 2);
    for (let k = 0; k < n; k++) {
      const f = n === 1 ? 0 : (k / (n - 1) - .5) * 2;
      let na = a2 + f * o.spread + (r() - .5) * .4; na += (-Math.PI / 2 - na) * o.up;
      rec(x1, y1, na, len * (o.decay + (r() - .5) * .18), w1, d + 1, dist + len);
    }
    if (d >= (o.innerFrom ?? 2) && r() < .55) tips.push({ x: x1, y: y1, a: a2, d, b: dist + len });
  };
  rec(CX, GROUND, -Math.PI / 2 + (o.lean || 0), o.len, o.w, 0, 0);
  return { segs, tips };
}
function rootsFor(w, r) {
  const out = [];
  for (let i = 0; i < 5; i++) { const side = i % 2 ? 1 : -1, len = w * (.9 + r() * 1.1), a = side > 0 ? .12 + r() * .3 : Math.PI - .12 - r() * .3;
    out.push({ x0: CX + side * w * .15, y0: GROUND - w * .35, x1: CX + Math.cos(a) * len, y1: GROUND + Math.sin(a) * len * .4 + 2, cx: CX + Math.cos(a) * len * .4, cy: GROUND - w * .1, w0: w * .42, w1: 1.5, d: 0 }); }
  return out;
}

// ---------- the 12 kinds of magic ----------
// Each kind: name, line, sky (night tint hue), wood(P, r) → {segs, tips} (+ roots), items(T, P, r) adds attachments,
// bark colours, seed(ctx, x, y, u, P, t).

// ===== 114 different trees: form × leaves × fruit × bark × colours, every surah its own combination =====

const PALETTES = [ // [foliage hue, foliage sat, accent hue, accent sat, name]
  [142, 50, 42, 95, 'forest and gold'], [165, 55, 28, 90, 'jade and amber'], [188, 60, 50, 95, 'teal and honey'], [205, 55, 205, 30, 'ice'],
  [248, 45, 48, 90, 'indigo and gold'], [278, 45, 310, 70, 'violet and rose'], [312, 55, 45, 85, 'orchid and gold'], [340, 65, 52, 90, 'rose and gold'],
  [8, 80, 45, 95, 'scarlet'], [26, 85, 195, 75, 'copper and sky'], [44, 85, 18, 90, 'gold and fire'], [58, 70, 300, 60, 'lime and lilac'],
  [96, 55, 330, 70, 'spring and pink'], [120, 45, 55, 90, 'meadow'], [175, 40, 280, 60, 'sea glass and violet'], [200, 35, 40, 85, 'mist and gold'],
  [228, 50, 25, 90, 'night and ember'], [262, 55, 175, 70, 'amethyst and teal'], [295, 40, 60, 80, 'plum and lemon'], [325, 50, 190, 70, 'fuchsia and aqua'],
  [210, 6, 48, 90, 'silver and gold'], [36, 60, 190, 60, 'sand and turquoise'], [152, 65, 330, 75, 'emerald and rose'], [216, 70, 48, 95, 'sapphire and gold'],
];
const BARKS = [
  { name: 'old wood', c: (p) => [hsl(24, 35, 9), hsl(28, 35, 36), hsl(p.ah, 70, 70)] },
  { name: 'silver', c: () => [hsl(220, 15, 16), hsl(220, 20, 80), '#ffffff'] },
  { name: 'glass', c: (p) => [hsl(p.fh, 45, 16), hsl(p.fh, 55, 80), '#ffffff'], fx: 'glass' },
  { name: 'slate', c: (p) => [hsl(210, 10, 12), hsl(210, 8, 44), hsl(p.ah, 60, 72)] },
  { name: 'gold', c: () => [hsl(32, 60, 14), hsl(42, 70, 55), hsl(50, 100, 82)] },
  { name: 'coral', c: (p) => [hsl(p.fh, 40, 24), hsl(p.fh, 45, 68), hsl(p.fh, 60, 88)] },
  { name: 'ember wood', c: () => [hsl(15, 12, 6), hsl(20, 10, 26), null], fx: 'cracks' },
  { name: 'birch', c: () => ['#5d6370', '#eef0f4', '#ffffff'], fx: 'birch' },
  { name: 'obsidian', c: () => [hsl(260, 25, 6), hsl(260, 18, 30), null], fx: 'veins' },
  { name: 'rosewood', c: (p) => [hsl(345, 30, 10), hsl(345, 22, 40), hsl(p.ah, 70, 75)] },
];
const FORMS = ['round crown', 'umbrella crown', 'weeping', 'tall cone', 'palm', 'spiral', 'bottle trunk', 'cloud tiers', 'twin trunks', 'floating crown', 'vase', 'banyan'];
const LEAVES = ['leaves', 'round leaves', 'crystal shards', 'blossoms', 'flame leaves', 'cloud puffs', 'stained glass', 'feathers', 'needles', 'light ribbons', 'star leaves', 'fan leaves', 'glass beads', 'crescent leaves'];
const FRUITS = ['lanterns', 'mosque lamps', 'stars', 'pearls', 'crescent moons', 'crystal drops', 'bells of light', 'star medallions', 'glowing orbs', 'pomegranates of light', 'fireflies', 'seed pods', 'teardrops of light', 'halos'];
const SEED_BODIES = ['drop', 'orb', 'gem', 'acorn', 'star', 'spiral', 'shell', 'puff', 'coal', 'lens', 'bean', 'lamp'];
const SEED_MARKS = ['none', 'rings', 'eight-star', 'facets', 'dots', 'crescent', 'stripes', 'sprout'];
const NO_PALM = new Set([5, 12, 3, 11]); // puffs, beads, blossoms, fans look wrong on fronds

// choose each surah's combination: no two trees share more than two of form / leaves / fruit / bark / colours,
// neighbours always differ in form and leaves, and every option is used about evenly
const PLAN = (() => {
  const r = rng(114114), plan = [null], cnt = [12, 14, 14, 10, 24, 12, 8].map((n) => new Array(n).fill(0)), sizes = [12, 14, 14, 10, 24, 12, 8];
  for (let s = 1; s <= 114; s++) {
    let best = null, bestScore = Infinity;
    for (let c = 0; c < 600; c++) {
      const v = sizes.map((n) => Math.floor(r() * n));
      if (v[0] === 4 && NO_PALM.has(v[1])) continue;
      let score = 0;
      v.forEach((x, i) => { score += cnt[i][x] * [6, 6, 6, 3, 2, 3, 2][i]; });
      for (let p = 1; p < s; p++) { const q = plan[p]; let sh = 0; for (let i = 0; i < 5; i++) if (q[i] === v[i]) sh++;
        if (sh >= 3) score += 1000; else if (sh === 2) score += 30;
        if (s - p <= 3 && (q[0] === v[0] || q[1] === v[1] || q[2] === v[2])) score += 200;
        if (q[5] === v[5] && q[6] === v[6]) score += 400; }
      if (score < bestScore) { bestScore = score; best = v; }
    }
    best.forEach((x, i) => cnt[i][x]++); plan.push(best);
  }
  return plan;
})();

// ---------- forms ----------
function leafyOpts(P, r, base) {
  const o = Object.assign({ len: 150, w: 32, depth: 5, k0: 2, k3: .35, spread: .62, decay: .73, wdecay: .64, curve: .4, up: .12 }, base);
  o.depth -= P.size < .3 ? 1 : 0; o.k3 = Math.min(.8, o.k3 + .3 * P.size - .1); o.w *= .8 + .35 * P.size;
  o.len *= .85 + r() * .25; o.spread *= .8 + r() * .4; o.up *= .5 + r(); o.curve *= .7 + r() * .6; o.decay += (r() - .5) * .05; o.lean = (o.lean || 0) + (r() - .5) * .25;
  if (r() < .3) o.k0 = o.k0 === 2 ? 3 : 2; return o;
}
const ptsFromTips = (tips, R, sq = .85) => tips.map((t) => ({ x: t.x, y: t.y, b: t.b, R, sq, a: t.a }));
const FORM = [
  (P, r) => { const g = grow(leafyOpts(P, r, {}), r); return { ...g, pts: ptsFromTips(g.tips, 30) }; },
  (P, r) => { const g = grow(leafyOpts(P, r, { len: 190, depth: 4, k0: 3, spread: 1.15, up: -.04, decay: .62, curve: .3 }), r);
    const top = g.segs[0].y1; const sq = (y) => y < top ? top - (top - y) * .42 : y;
    for (const q of g.segs) { q.y0 = sq(q.y0); q.y1 = sq(q.y1); q.cy = sq(q.cy); } for (const t of g.tips) t.y = sq(t.y);
    return { ...g, pts: ptsFromTips(g.tips, 38, .42) }; },
  (P, r) => { const g = grow(leafyOpts(P, r, { len: 130, w: 30, depth: 4, k0: 3, k3: 0, spread: .85, decay: .72, wdecay: .62, curve: .5, up: .05, innerFrom: 1 }), r);
    return { ...g, pts: ptsFromTips(g.tips, 14, .8), weeping: true }; },
  (P, r) => { const segs = [], tips = [], pts = []; const n = 9 + Math.round(P.size * 2), tall = .75 + r() * .3 + P.size * .3, wide = .7 + r() * .5, L = 44 * tall; let px = CX, py = GROUND, dist = 0;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + Math.sin(i * .7 + tall * 9) * .05, nx = px + Math.cos(a) * L, ny = py + Math.sin(a) * L, w = 24 - i * 2.2;
      segs.push({ x0: px, y0: py, x1: nx, y1: ny, cx: (px + nx) / 2, cy: (py + ny) / 2, w0: Math.max(2, w), w1: Math.max(1.5, w - 2.2), d: i < 2 ? 0 : 1, s0: dist, s1: dist + L });
      if (i >= 2) for (const side of [-1, 1]) { const span = ((1 - (i - 2) / (n - 1)) * 90 + 20) * wide, ang = -Math.PI / 2 + side * (1.05 + r() * .2), bx = nx + Math.cos(ang) * span, by = ny + Math.sin(ang) * span * .6;
        segs.push({ x0: nx, y0: ny, x1: bx, y1: by, cx: (nx + bx) / 2, cy: (ny + by) / 2 - 4, w0: Math.max(1.5, w * .35), w1: 1, d: 2, s0: dist + L, s1: dist + L + span * .6 }); tips.push({ x: bx, y: by, a: ang, d: 3, b: dist + L + span * .6 }); }
      dist += L; px = nx; py = ny; }
    tips.push({ x: px, y: py, a: -Math.PI / 2, d: 3, b: dist });
    const H = GROUND - 60 - py; for (let i = 0; i < 70 + 50 * P.size; i++) { const f = Math.pow(r(), .8), y = GROUND - 60 - f * H, half = ((1 - f) * 115 + 12) * wide; pts.push({ x: CX + (r() - .5) * 2 * half, y, b: .2 + f * .75, R: 9, sq: 1 }); }
    return { segs, tips, pts, cone: true }; },
  (P, r) => { let px = CX, py = GROUND, a = -Math.PI / 2 - .05, segs = [], dist = 0; const n = 11 + Math.round(P.size * 3), bend = (r() - .5) * .08;
    for (let i = 0; i < n; i++) { const L = 28, w = 24 - i * 1.1; a += bend + .02 - (i > 6 ? .02 : 0); const nx = px + Math.cos(a) * L, ny = py + Math.sin(a) * L;
      segs.push({ x0: px, y0: py, x1: nx, y1: ny, cx: (px + nx) / 2, cy: (py + ny) / 2, w0: w, w1: w - 1.1, d: 0, s0: dist, s1: dist + L, ring: true }); dist += L; px = nx; py = ny; }
    const fr = []; const nf = 8 + Math.floor(r() * 4) + Math.round(P.size * 5);
    for (let i = 0; i < nf; i++) fr.push({ a: -Math.PI / 2 + (i / (nf - 1) - .5) * 3.3 + (r() - .5) * .2, L: 120 + r() * 60, droop: .5 + Math.abs(i / (nf - 1) - .5) * 1.4, back: i % 3 === 0, ph: r() * TAU });
    const top = { x: px, y: py, a: -Math.PI / 2, d: 4, b: dist };
    return { segs, tips: [top], pts: [], fronds: fr, top, crown: { x: px, y: py + 30, R: 170 } }; },
  (P, r) => { const segs = [], tips = [], n = 12 + Math.round(P.size * 3), amp = 18 + r() * 22, ph = r() * TAU, L = 30; let px = CX, py = GROUND, dist = 0;
    for (let i = 0; i < n; i++) { const nx = CX + Math.sin(i * .75 + ph) * amp * (i / n), ny = py - L, w = 26 - i * 1.6;
      segs.push({ x0: px, y0: py, x1: nx, y1: ny, cx: (px + nx) / 2 + 4, cy: (py + ny) / 2, w0: Math.max(2, w), w1: Math.max(1.5, w - 1.6), d: 0, s0: dist, s1: dist + L }); dist += L;
      if (i >= 3) { const side = i % 2 ? 1 : -1, span = (1 - i / n) * 80 + 26, ang = -Math.PI / 2 + side * (.9 + r() * .4), bx = nx + Math.cos(ang) * span, by = ny + Math.sin(ang) * span;
        segs.push({ x0: nx, y0: ny, x1: bx, y1: by, cx: (nx + bx) / 2, cy: (ny + by) / 2 + 6, w0: Math.max(2, w * .4), w1: 1.2, d: 2, s0: dist, s1: dist + span * .7 }); tips.push({ x: bx, y: by, a: ang, d: 3, b: dist + span * .7 }); }
      px = nx; py = ny; }
    tips.push({ x: px, y: py, a: -Math.PI / 2, d: 3, b: dist }); return { segs, tips, pts: ptsFromTips(tips, 24, .8) }; },
  (P, r) => { const g = grow(leafyOpts(P, r, { len: 165, w: 66, depth: 3, k0: 4, k3: .6, spread: 1.05, decay: .5, wdecay: .4, curve: .5, up: .3 }), r);
    g.segs[0].w1 = g.segs[0].w0 * .55; g.segs[0].cx += 6; return { ...g, pts: ptsFromTips(g.tips, 22, .8) }; },
  (P, r) => { const segs = [], tips = [], pts = []; const nPad = 3 + Math.round(P.size * 2), H = 300 + 60 * P.size, sway = (r() < .5 ? -1 : 1) * (30 + r() * 30); let px = CX, py = GROUND, dist = 0; const N = 10;
    for (let i = 0; i < N; i++) { const q = (i + 1) / N, nx = CX + Math.sin(q * Math.PI * 1.4) * sway, ny = GROUND - q * H, L = Math.hypot(nx - px, ny - py), w = 28 - i * 2.2;
      segs.push({ x0: px, y0: py, x1: nx, y1: ny, cx: (px + nx) / 2, cy: (py + ny) / 2, w0: Math.max(2.5, w), w1: Math.max(2, w - 2.2), d: 0, s0: dist, s1: dist + L }); dist += L; px = nx; py = ny;
      if (i >= N - 1 - nPad * 2 && (N - 1 - i) % 2 === 0 || i === N - 1) { const side = i === N - 1 ? 0 : (i % 4 < 2 ? 1 : -1), reach = side ? 60 + r() * 40 : 0, bx = nx + side * reach, by = ny - 8 - r() * 10, padW = 50 + r() * 40 - (i / N) * 10;
        if (side) segs.push({ x0: nx, y0: ny, x1: bx, y1: by, cx: (nx + bx) / 2, cy: ny - 12, w0: Math.max(2, w * .5), w1: 2, d: 2, s0: dist, s1: dist + reach * .6 });
        const b0 = dist + reach * .6; tips.push({ x: bx, y: by, a: -Math.PI / 2, d: 3, b: b0 });
        for (let k = 0; k < 26; k++) { const a = r() * TAU, d = Math.sqrt(r()); pts.push({ x: bx + Math.cos(a) * d * padW, y: by + Math.sin(a) * d * 16 - 6, b: b0 + r() * .05 * dist, R: 10, sq: .6 }); } } }
    return { segs, tips, pts, rawB: true }; },
  (P, r) => { const o = leafyOpts(P, r, { len: 135, w: 24, spread: .55, up: .1 }), A = grow(Object.assign({}, o, { lean: -.32 }), r), B = grow(Object.assign({}, o, { lean: .3, len: o.len * .92 }), r);
    for (const q of A.segs) { q.x0 -= 12; q.x1 -= 12; q.cx -= 12; } for (const t of A.tips) t.x -= 12; for (const q of B.segs) { q.x0 += 12; q.x1 += 12; q.cx += 12; } for (const t of B.tips) t.x += 12;
    const tips = [...A.tips, ...B.tips]; return { segs: [...A.segs, ...B.segs], tips, pts: ptsFromTips(tips, 28), twin: true }; },
  (P, r) => { const g = grow({ len: 110, w: 26, depth: 2, k0: 3, k3: 0, spread: .5, decay: .6, wdecay: .55, curve: .3, up: .2 }, r);
    const cy = GROUND - 330 - 20 * P.size, R = 80 + 25 * P.size, pts = []; for (let i = 0; i < 46 + 30 * P.size; i++) { const a = r() * TAU, d = Math.sqrt(r()); pts.push({ x: CX + Math.cos(a) * d * R, y: cy + Math.sin(a) * d * R * .8, b: .75 + r() * .2, R: 14, sq: .9 }); }
    return { ...g, pts, rawB: true, float: { x: CX, y: cy, R } }; },
  (P, r) => { const g = grow(leafyOpts(P, r, { len: 120, w: 26, k0: 3, k3: .2, spread: .3, decay: .8, curve: .22, up: .45 }), r); return { ...g, pts: ptsFromTips(g.tips, 26) }; },
  (P, r) => { const g = grow(leafyOpts(P, r, { len: 120, w: 40, depth: 5, spread: .95, up: 0, curve: .45, decay: .72 }), r); const aerial = [];
    for (const q of g.segs) if (q.d >= 2 && q.d <= 3 && r() < .45 && q.y1 < GROUND - 120) aerial.push({ x: q.x1, y: q.y1, b: q.s1 });
    return { ...g, pts: ptsFromTips(g.tips, 28, .75), aerial }; },
];

// ---------- leaves (drawn at a cluster point) ----------
function drawLeaf(ctx, f, x, y, a, s, k, p, t, ph) {
  const L = clamp(k);
  switch (f) {
    case 0: leaf(ctx, x, y, a, s, s * .38, hsl(p.fh, p.fs, 12 + 42 * L), L > .6 ? hsl(p.fh, 50, 85, .25) : null); break;
    case 1: leaf(ctx, x, y, a, s * .9, s * .55, hsl(p.fh, p.fs, 13 + 40 * L), null, .8); break;
    case 2: { const len = s * 1.6, wid = s * .3; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * .35, -wid); ctx.lineTo(len, 0); ctx.lineTo(len * .35, wid); ctx.closePath();
      const gr = ctx.createLinearGradient(0, -wid, 0, wid); gr.addColorStop(0, hsl(ph > 3.5 ? p.ah : p.fh, 75, 35 + 45 * L)); gr.addColorStop(1, hsl(p.fh, 70, 16 + 25 * L)); ctx.fillStyle = gr; ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(235,250,255,${.2 + L * .5})`; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * .35, -wid); ctx.lineTo(len, 0); ctx.stroke(); ctx.restore(); break; }
    case 3: { const r = s * .55; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = hsl(p.fh, p.fs, 34 + 60 * L); for (let i = 0; i < 5; i++) { const b = i * TAU / 5; ctx.beginPath(); ctx.ellipse(Math.cos(b) * r * .55, Math.sin(b) * r * .55, r * .55, r * .4, b, 0, TAU); ctx.fill(); }
      ctx.fillStyle = hsl(p.ah, 90, 70); ctx.beginPath(); ctx.arc(0, 0, r * .22, 0, TAU); ctx.fill(); ctx.restore(); break; }
    case 4: { const fl = 1 + Math.sin(t * 5 + ph) * .08; ctx.save(); ctx.translate(x, y); ctx.rotate((a + Math.PI / 2) * .25); ctx.beginPath(); ctx.moveTo(0, -s * 1.1 * fl); ctx.bezierCurveTo(s * .55, -s * .3, s * .45, s * .4, 0, s * .4); ctx.bezierCurveTo(-s * .45, s * .4, -s * .55, -s * .3, 0, -s * 1.1 * fl);
      const gr = ctx.createLinearGradient(0, s * .4, 0, -s); gr.addColorStop(0, hsl(p.fh - 8, 90, 14 + 22 * L)); gr.addColorStop(1, hsl(p.fh + 14, 100, 40 + 40 * L)); ctx.fillStyle = gr; ctx.fill(); ctx.restore(); break; }
    case 5: { const r = s * 1.1, gr = ctx.createRadialGradient(x - r * .3, y - r * .4, r * .1, x, y, r); gr.addColorStop(0, hsl(p.fh, p.fs * .5, 70 + 24 * L, .95)); gr.addColorStop(.7, hsl(p.fh, p.fs * .8, 40 + 25 * L, .9)); gr.addColorStop(1, hsl(p.fh, p.fs, 30, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); break; }
    case 6: { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -s * .9); ctx.lineTo(s * .55, 0); ctx.lineTo(0, s * .7); ctx.lineTo(-s * .55, 0); ctx.closePath();
      ctx.fillStyle = hsl(ph > 3.1 ? p.ah : p.fh, 55, 24 + 36 * L, .9); ctx.fill(); ctx.strokeStyle = 'rgba(20,14,28,.85)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); break; }
    case 7: { const n = 9, len = s * 2; let px = x, py = y, b = a; ctx.strokeStyle = hsl(p.fh, p.fs, 32 + 48 * L, .85); ctx.lineWidth = .9; const ps = [];
      for (let i = 0; i <= n; i++) { ps.push([px, py, b]); px += Math.cos(b) * len / n; py += Math.sin(b) * len / n; b += .07; }
      ctx.beginPath(); ps.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.lineWidth = .6; ctx.strokeStyle = hsl(p.fh, p.fs, 45 + 45 * L, .55);
      for (let i = 1; i < ps.length; i++) { const [qx, qy, qa] = ps[i], bl = (1 - i / ps.length) * s * .5 + 1.5; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + Math.cos(qa + sd * 1.1) * bl, qy + Math.sin(qa + sd * 1.1) * bl); ctx.stroke(); } } break; }
    case 8: { ctx.strokeStyle = hsl(p.fh, 35, 14 + 34 * L); ctx.lineWidth = 1.3; for (let i = -3; i <= 3; i++) { const b = a + i * .22; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * s * 1.1, y + Math.sin(b) * s * 1.1); ctx.stroke(); } break; }
    case 9: { const w = Math.sin(t * 2 + ph) * s * .3; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hsl(p.fh + (ph / TAU - .5) * 30, 80, 32 + 40 * L, .55); ctx.lineWidth = s * .3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + Math.cos(a) * s * .6 - w, y + Math.sin(a) * s * .6 + w, x + Math.cos(a) * s * 1.2 + w, y + Math.sin(a) * s * 1.2 - w, x + Math.cos(a) * s * 1.8, y + Math.sin(a) * s * 1.8); ctx.stroke(); ctx.restore(); break; }
    case 10: star(ctx, x, y, s * .6, 5, .45, a); ctx.fillStyle = hsl(p.fh, p.fs, 18 + 50 * L); ctx.fill(); break;
    case 11: { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s, -.55, .55); ctx.closePath(); ctx.fillStyle = hsl(p.fh, p.fs, 16 + 44 * L); ctx.fill();
      ctx.strokeStyle = hsl(p.fh, p.fs, 10 + 30 * L, .6); ctx.lineWidth = .5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * .2) * s, Math.sin(i * .2) * s); ctx.stroke(); } ctx.restore(); break; }
    case 12: { const r = s * .42; ctx.fillStyle = hsl(p.fh, p.fs, 25 + 45 * L, .55); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.strokeStyle = hsl(p.fh, 60, 80, .5); ctx.lineWidth = .6; ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${.4 + .5 * L})`; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .25, 0, TAU); ctx.fill(); break; }
    case 13: { const r = s * .6; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.arc(0, 0, r, -1.2, 1.9); ctx.arc(r * .35, -r * .1, r * .85, 1.75, -1.05, true); ctx.closePath(); ctx.fillStyle = hsl(p.fh, p.fs, 20 + 60 * L); ctx.fill(); ctx.restore(); break; }
  }
}
const LEAF_SIZE = [15, 12, 12, 9, 13, 14, 12, 9, 12, 10, 12, 12, 11, 12];
const LEAF_N = [1, .85, .8, .75, .8, .3, .7, .65, .9, .55, .85, .8, .8, .85]; // share of a full crown

// ---------- fruit ----------
function drawFruit(ctx, u, x, y, s, p, t, ph, a) {
  if (s < .5) return; const br = .85 + .15 * Math.sin(t * 1.7 + ph), h = p.ah, S = p.as;
  const ball = (lo, hi, edge) => { const g = ctx.createRadialGradient(x - s * .35, y - s * .35, 0, x, y, s); g.addColorStop(0, lo); g.addColorStop(.5, hi); g.addColorStop(1, edge); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); };
  switch (u) {
    case 0: glow(ctx, x, y, s * 7, h, 100, 62, .5 * a * br); { ctx.beginPath(); ctx.ellipse(x, y, s * .78, s, 0, 0, TAU); const g = ctx.createRadialGradient(x, y + s * .2, 0, x, y, s); g.addColorStop(0, hsl(h + 10, 100, 93)); g.addColorStop(.5, hsl(h, S, 66)); g.addColorStop(1, hsl(h - 8, 80, 38)); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = hsl(h - 10, 70, 22, .6); ctx.lineWidth = .7; ctx.beginPath(); ctx.ellipse(x, y, s * .35, s, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = hsl(h - 10, 50, 20); ctx.fillRect(x - s * .4, y - s * 1.15, s * .8, s * .3); ctx.fillRect(x - s * .3, y + s * .9, s * .6, s * .25); } break;
    case 1: glow(ctx, x, y + s * .3, s * 6, h, 100, 62, .5 * a * br); { ctx.fillStyle = hsl(h, 50, 30); ctx.beginPath(); ctx.moveTo(x - s * .5, y - s * .9); ctx.lineTo(x + s * .5, y - s * .9); ctx.lineTo(x + s * .25, y - s * 1.3); ctx.lineTo(x - s * .25, y - s * 1.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - s * .5, y - s * .9); ctx.bezierCurveTo(x - s * 1.2, y - s * .2, x - s * .6, y + s * .9, x, y + s); ctx.bezierCurveTo(x + s * .6, y + s * .9, x + s * 1.2, y - s * .2, x + s * .5, y - s * .9); ctx.closePath();
      const g = ctx.createRadialGradient(x, y + s * .2, 0, x, y, s * 1.2); g.addColorStop(0, '#fffbe8'); g.addColorStop(.6, hsl(h, S, 62, .9)); g.addColorStop(1, hsl(h + 180, 50, 35, .9)); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = hsl(h, 60, 80, .8); ctx.lineWidth = .8; ctx.stroke();
      for (const k of [-.45, 0, .45]) { ctx.beginPath(); ctx.arc(x + k * s, y + s * .15, s * .12, 0, TAU); ctx.strokeStyle = hsl(h + 180, 60, 30, .7); ctx.stroke(); } } break;
    case 2: glow(ctx, x, y, s * 4, h, 90, 65, .5 * a * br); star(ctx, x, y, s * 1.1, 5, .45); { const g = ctx.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, '#fff'); g.addColorStop(1, hsl(h, S, 62)); ctx.fillStyle = g; } ctx.fill(); break;
    case 3: glow(ctx, x, y, s * 4, h, 60, 85, .45 * a * br); ball('#ffffff', hsl(h, 35, 88), hsl(h + 40, 25, 62)); break;
    case 4: glow(ctx, x, y, s * 4.5, h, 70, 88, .5 * a * br); ctx.fillStyle = hsl(h, 50, 92); ctx.beginPath(); ctx.arc(x, y, s, -1.2, 1.9); ctx.arc(x + s * .35, y - s * .1, s * .85, 1.75, -1.05, true); ctx.fill(); break;
    case 5: glow(ctx, x, y, s * 5, h, 90, 70, .45 * a * br); ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x + s * .7, y); ctx.lineTo(x, y + s * 1.6); ctx.lineTo(x - s * .7, y); ctx.closePath();
      { const g = ctx.createLinearGradient(x - s, 0, x + s, 0); g.addColorStop(0, hsl(h, 80, 90)); g.addColorStop(1, hsl(p.fh, 80, 45)); ctx.fillStyle = g; } ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x, y + s * 1.6); ctx.stroke(); break;
    case 6: glow(ctx, x, y, s * 5, h, 100, 70, .45 * a * br); ctx.beginPath(); ctx.moveTo(x - s, y + s * .7); ctx.bezierCurveTo(x - s, y - s * .2, x - s * .7, y - s, x, y - s); ctx.bezierCurveTo(x + s * .7, y - s, x + s, y - s * .2, x + s, y + s * .7); ctx.closePath();
      { const g = ctx.createLinearGradient(x - s, 0, x + s, 0); g.addColorStop(0, hsl(h, S, 80)); g.addColorStop(1, hsl(h, S, 40)); ctx.fillStyle = g; } ctx.fill(); ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(x, y + s * .8, s * .25, 0, TAU); ctx.fill(); break;
    case 7: glow(ctx, x, y, s * 4.5, h, 80, 70, .45 * a * br); ctx.fillStyle = hsl(h, S, 45); ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); ctx.strokeStyle = hsl(h, 90, 88, .95); ctx.lineWidth = .9;
      for (const rot of [0, Math.PI / 4]) { ctx.beginPath(); for (let i = 0; i < 4; i++) { const b = rot + i * Math.PI / 2 + Math.PI / 4; ctx.lineTo(x + Math.cos(b) * s * .75, y + Math.sin(b) * s * .75); } ctx.closePath(); ctx.stroke(); } break;
    case 8: glow(ctx, x, y, s * 6, h, 90, 65, .55 * a * br); ball('#ffffff', hsl(h, S, 70), hsl(h, S, 40)); ctx.strokeStyle = hsl(h, 80, 85, .7); ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s * .4, -.3, 0, TAU); ctx.stroke(); break;
    case 9: glow(ctx, x, y, s * 5, h, 100, 60, .5 * a * br); ball(hsl(h + 30, 100, 88), hsl(h + 5, 100, 58), hsl(h - 10, 80, 30)); ctx.fillStyle = hsl(h, 70, 38); ctx.beginPath();
      for (let i = 0; i < 5; i++) { const b = -Math.PI / 2 + (i - 2) * .35; ctx.lineTo(x + Math.cos(b) * s * 1.25, y + Math.sin(b) * s * 1.25); ctx.lineTo(x + Math.cos(b + .17) * s * .85, y + Math.sin(b + .17) * s * .85); } ctx.fill(); break;
    case 10: for (let i = 0; i < 3; i++) { const fx = x + Math.sin(t * .9 + ph + i * 2) * 12, fy = y + Math.cos(t * .7 + ph + i) * 9; glow(ctx, fx, fy, 9, h, 100, 70, .7 * a * (.6 + .4 * Math.sin(t * 3 + i + ph))); ctx.fillStyle = hsl(h, 100, 92, a); ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, TAU); ctx.fill(); } break;
    case 11: for (const [dx, dy] of [[-s * .7, 0], [s * .7, 0], [0, s * .9]]) { glow(ctx, x + dx, y + dy, s * 2.5, h, 90, 70, .35 * a * br); ctx.fillStyle = hsl(h, S, 80); ctx.beginPath(); ctx.arc(x + dx, y + dy, s * .55, 0, TAU); ctx.fill(); } break;
    case 12: glow(ctx, x, y, s * 5, h, 100, 75, .5 * a * br); ctx.beginPath(); ctx.moveTo(x, y - s * 1.5); ctx.bezierCurveTo(x + s, y - s * .2, x + s, y + s, x, y + s); ctx.bezierCurveTo(x - s, y + s, x - s, y - s * .2, x, y - s * 1.5);
      { const g = ctx.createRadialGradient(x, y + s * .2, 0, x, y, s * 1.2); g.addColorStop(0, '#fffdf2'); g.addColorStop(1, hsl(h, S, 70)); ctx.fillStyle = g; } ctx.fill(); break;
    case 13: glow(ctx, x, y, s * 5, h, 90, 75, .45 * a * br); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hsl(h, S, 80, .9 * a); ctx.lineWidth = s * .3; ctx.beginPath(); ctx.ellipse(x, y, s, s * .45, Math.sin(t + ph) * .3, 0, TAU); ctx.stroke(); ctx.restore(); break;
  }
}

// ---------- seeds: body × mark, in the tree's colours ----------
function drawSeed(ctx, x, y, u, T, t, al = 1) {
  if (al <= 0) return; const p = T.pal, body = T.plan[5], mark = T.plan[6], cy = y - 34 * u, R = 32 * u, h = p.fh, a = p.ah;
  ctx.save(); ctx.globalAlpha = al; glow(ctx, x, cy, 95 * u, a, 90, 65, .45); glow(ctx, x, cy, 60 * u, h, 70, 60, .35);
  const shade = (c1, c2, c3) => { const g = ctx.createRadialGradient(x - R * .35, cy - R * .4, 1, x, cy, R * 1.25); g.addColorStop(0, c1); g.addColorStop(.5, c2); g.addColorStop(1, c3); return g; };
  const main = shade(hsl(a, 90, 92), hsl(h, p.fs + 10, 55), hsl(h, p.fs, 18));
  ctx.beginPath();
  switch (body) {
    case 0: ctx.moveTo(x, cy - R * 1.4); ctx.bezierCurveTo(x + R * 1.1, cy - R * .2, x + R, cy + R, x, cy + R); ctx.bezierCurveTo(x - R, cy + R, x - R * 1.1, cy - R * .2, x, cy - R * 1.4); break;
    case 1: ctx.arc(x, cy, R, 0, TAU); break;
    case 2: for (let i = 0; i < 6; i++) { const b = -Math.PI / 2 + i * TAU / 6; ctx.lineTo(x + Math.cos(b) * R * .85, cy + Math.sin(b) * R * 1.25); } ctx.closePath(); break;
    case 3: ctx.moveTo(x, cy + R * 1.1); ctx.bezierCurveTo(x + R * 1.1, cy + R * .9, x + R * 1.05, cy - R * .5, x, cy - R * .7); ctx.bezierCurveTo(x - R * 1.05, cy - R * .5, x - R * 1.1, cy + R * .9, x, cy + R * 1.1); break;
    case 4: star(ctx, x, cy, R * 1.15, 5 + (T.s % 4), .5); break;
    case 5: for (let i = 0; i <= 50; i++) { const q = i / 50, b = q * TAU * 2.2, rr = R * (.15 + .85 * q); ctx.lineTo(x + Math.cos(b) * rr, cy + Math.sin(b) * rr); } ctx.lineTo(x, cy); break;
    case 6: ctx.moveTo(x - R * .25, cy + R * .7); for (let i = 0; i <= 9; i++) { const b = Math.PI + i * Math.PI / 9; ctx.lineTo(x + Math.cos(b) * R * 1.25, cy + Math.sin(b) * R * 1.1 + R * .2); } ctx.lineTo(x + R * .25, cy + R * .7); ctx.closePath(); break;
    case 7: ctx.arc(x, cy, R * .45, 0, TAU); break;
    case 8: ctx.ellipse(x, cy, R * 1.1, R * .9, -.2, 0, TAU); break;
    case 9: ctx.ellipse(x, cy, R * 1.2, R * .62, 0, 0, TAU); break;
    case 10: ctx.moveTo(x - R * .9, cy); ctx.bezierCurveTo(x - R * .9, cy - R * 1.1, x + R * .3, cy - R * .9, x + R * .2, cy - R * .2); ctx.bezierCurveTo(x + R * .1, cy + R * .3, x + R * 1.1, cy + R * .3, x + R * .8, cy + R * .8); ctx.bezierCurveTo(x + R * .3, cy + R * 1.2, x - R * .9, cy + R * 1, x - R * .9, cy); break;
    case 11: ctx.moveTo(x - R * .6, cy - R * .6); ctx.bezierCurveTo(x - R * 1.3, cy, x - R * .7, cy + R * 1.1, x, cy + R * 1.2); ctx.bezierCurveTo(x + R * .7, cy + R * 1.1, x + R * 1.3, cy, x + R * .6, cy - R * .6); ctx.closePath(); break;
  }
  if (body === 7) { ctx.fillStyle = hsl(a, 80, 92); ctx.fill(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const nf = 20 + (T.s % 12);
    for (let i = 0; i < nf; i++) { const b = i * TAU / nf + Math.sin(t * .8 + i) * .04; ctx.strokeStyle = hsl(h, 50, 85, .55); ctx.lineWidth = .9 * u; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(b) * R * 1.1, cy + Math.sin(b) * R * 1.1); ctx.stroke(); sparkle(ctx, x + Math.cos(b) * R * 1.1, cy + Math.sin(b) * R * 1.1, 3 * u, a, 60, 92, .8); } ctx.restore(); }
  else if (body === 8) { ctx.fillStyle = shade('#4a3a36', '#1a1210', '#080504'); ctx.fill(); ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; const rr = rng(T.s);
    for (let i = 0; i < 5; i++) { let px = x + (rr() - .5) * R * 1.4, py = cy + (rr() - .5) * R; ctx.strokeStyle = hsl(a, 100, 60, .9); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rr() - .5) * 20 * u; py += (rr() - .5) * 16 * u; ctx.lineTo(px, py); } ctx.stroke(); } ctx.restore(); }
  else if (body === 2 || body === 9) { ctx.fillStyle = main; ctx.globalAlpha = al * .92; ctx.fill(); ctx.globalAlpha = al; ctx.strokeStyle = hsl(a, 70, 90, .8); ctx.lineWidth = 1.2 * u; ctx.stroke(); }
  else if (body === 11) { ctx.fillStyle = shade('#fffbe8', hsl(a, 90, 70, .85), hsl(h, 50, 30, .9)); ctx.fill(); ctx.strokeStyle = hsl(a, 60, 85); ctx.lineWidth = 1.2 * u; ctx.stroke();
    ctx.fillStyle = hsl(h, 40, 30); ctx.fillRect(x - R * .5, cy - R * .8, R, R * .2); ctx.beginPath(); ctx.moveTo(x - R * .3, cy - R * .8); ctx.lineTo(x, cy - R * 1.3); ctx.lineTo(x + R * .3, cy - R * .8); ctx.fill(); glow(ctx, x, cy + R * .3, R * .9, a, 100, 80, .7); }
  else { ctx.fillStyle = main; ctx.fill(); }
  if (body === 3) { ctx.beginPath(); ctx.ellipse(x, cy - R * .62, R * 1.02, R * .38, 0, 0, TAU); ctx.fillStyle = shade(hsl(h, 40, 50), hsl(h, 50, 30), hsl(h, 50, 14)); ctx.fill(); }
  // mark
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hsl(a, 90, 88, .85); ctx.fillStyle = hsl(a, 90, 88, .85); ctx.lineWidth = 1.2 * u;
  switch (mark) {
    case 1: for (const k of [.35, .6]) { ctx.beginPath(); ctx.ellipse(x, cy, R * k, R * k * .9, 0, 0, TAU); ctx.stroke(); } break;
    case 2: for (const rot of [0, Math.PI / 4]) { ctx.beginPath(); for (let i = 0; i < 4; i++) { const b = rot + i * Math.PI / 2 + Math.PI / 4; ctx.lineTo(x + Math.cos(b) * R * .42, cy + Math.sin(b) * R * .42); } ctx.closePath(); ctx.stroke(); } break;
    case 3: for (let i = 0; i < 5; i++) { const b = i * TAU / 5 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(b) * R * .8, cy + Math.sin(b) * R * .8); ctx.stroke(); } break;
    case 4: for (let i = 0; i < 7; i++) { const b = i * TAU / 7; ctx.beginPath(); ctx.arc(x + Math.cos(b) * R * .5, cy + Math.sin(b) * R * .5, 1.8 * u, 0, TAU); ctx.fill(); } break;
    case 5: ctx.beginPath(); ctx.arc(x, cy, R * .4, -1.2, 1.9); ctx.arc(x + R * .14, cy - R * .05, R * .34, 1.75, -1.05, true); ctx.fill(); break;
    case 6: for (const k of [-.4, 0, .4]) { ctx.beginPath(); ctx.moveTo(x + k * R - R * .2, cy - R * .6); ctx.quadraticCurveTo(x + k * R + R * .2, cy, x + k * R - R * .1, cy + R * .6); ctx.stroke(); } break;
    case 7: ctx.restore(); ctx.save(); ctx.strokeStyle = hsl(120, 45, 60); ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, cy - R * 1.05); ctx.quadraticCurveTo(x + 2 * u, cy - R * 1.6, x + 10 * u, cy - R * 1.55); ctx.stroke(); leaf(ctx, x + 2 * u, cy - R * 1.45, -2.5 + Math.sin(t * 1.5) * .1, 12 * u, 4.5 * u, hsl(120, 50, 62)); break;
  }
  ctx.restore();
  sparkle(ctx, x + R * .45, cy - R * .75, 8 * u * (.85 + .15 * Math.sin(t * 2)), a, 50, 96, .9);
  ctx.restore();
}

// ---------- build ----------
function build(s, pages = 5) {
  const plan = PLAN[s], [fi, li, ui, bi, ci] = plan, r = rng(s * 7919 + 13), pr = PALETTES[ci];
  const pal = { fh: pr[0] + (r() - .5) * 10, fs: pr[1], ah: pr[2] + (r() - .5) * 10, as: pr[3], name: pr[4] };
  const P = { s, pages, size: clamp(Math.log(pages * 2 + 1) / Math.log(97)) };
  const form = FORM[fi](P, r), bark = BARKS[bi];
  const T = { s, plan, pal, P, bark, form, segs: form.segs, tips: form.tips, items: [], fi, li, ui,
    name: `${FORMS[fi]}, ${LEAVES[li]}, ${FRUITS[ui]}`, line: `${FORMS[fi][0].toUpperCase() + FORMS[fi].slice(1)} with ${LEAVES[li]} and ${FRUITS[ui]} · ${bark.name} · ${pal.name}` };
  T.roots = fi === 4 ? [] : rootsFor(T.segs[0].w0 * (fi === 6 ? .7 : 1), r);
  if (fi === 8) T.roots.push(...rootsFor(20, r).map((q) => ({ ...q, x0: q.x0 + 12, x1: q.x1 + 12, cx: q.cx + 12 })));
  const max = Math.max(...T.segs.map((q) => q.s1));
  for (const q of T.segs) { q.s0 /= max; q.s1 /= max; } for (const t of T.tips) t.b /= max;
  const pts = form.pts.map((q) => ({ ...q, b: q.b > 1.01 ? q.b / max : q.b }));
  if (form.aerial) for (const q of form.aerial) q.b /= max;
  let cx = 0, cy = 0, R = 1; const src = pts.length ? pts : T.tips; for (const t of src) { cx += t.x; cy += t.y; } cx /= src.length; cy /= src.length; for (const t of src) R = Math.max(R, Math.hypot(t.x - cx, t.y - cy));
  T.crown = form.crown || { x: cx, y: cy, R }; const C = T.crown; T.lit = (x, y) => clamp(.55 - (x - C.x) / (C.R + 30) * .35 - (y - C.y) / (C.R + 30) * .45);
  const fol = LEAF_SIZE[li], nPer = Math.max(2, Math.round((260 + 520 * P.size) * LEAF_N[li] * (form.weeping ? .35 : 1) / Math.max(1, pts.length)));
  // leaves along young branches
  if (![3, 4, 9].includes(fi)) for (const q of T.segs) if (q.d >= 1) { const L = Math.hypot(q.x1 - q.x0, q.y1 - q.y0), n = Math.round(L / 14);
    for (let i = 0; i < n; i++) { const t = .2 + r() * .8, x = lerp(lerp(q.x0, q.cx, t), lerp(q.cx, q.x1, t), t), y = lerp(lerp(q.y0, q.cy, t), lerp(q.cy, q.y1, t), t);
      T.items.push({ kind: 'young', x, y, a: Math.atan2(q.y1 - q.y0, q.x1 - q.x0) + (r() < .5 ? -1 : 1) * (.8 + r() * .5), size: 9 * (.7 + r() * .5), k: -2 + T.lit(x, y), b: q.s0 + t * (q.s1 - q.s0), ph: r() * TAU }); } }
  // foliage
  for (const q of pts) for (let i = 0; i < nPer; i++) { const an = r() * TAU, d = Math.sqrt(r()) * q.R, x = q.x + Math.cos(an) * d, y = q.y + Math.sin(an) * d * q.sq;
    T.items.push({ kind: 'leaf', x, y, a: Math.atan2(y - q.y, x - q.x) + (r() - .5) * 1.2, size: fol * (.7 + r() * .6), k: clamp(T.lit(x, y) * .85 + r() * .25), b: q.b + d / Math.max(1, q.R) * .04 + r() * .05, ph: r() * TAU }); }
  if (form.weeping) for (const t of T.tips) for (let i = 0; i < 6; i++) T.items.push({ kind: 'strand', p: t, x: t.x, y: t.y, dx: (r() - .5) * 60 + Math.cos(t.a) * 26, L: 70 + r() * 150, k: clamp(T.lit(t.x, t.y) + r() * .25), b: t.b, grow: .2, ph: r() * TAU });
  if (form.fronds) for (const f of form.fronds) T.items.push({ kind: 'frond', ...f, x: form.top.x, y: form.top.y, b: .55 + r() * .25, k: f.back ? 0 : 2 });
  if (form.aerial) for (const q of form.aerial) T.items.push({ kind: 'aerial', x: q.x, y: q.y, b: q.b + .1, k: -3, ph: r() * TAU });
  if (form.float) T.items.push({ kind: 'beam', x: CX, y: form.float.y, late: .3, k: -5 });
  T.items.sort((a, b) => a.k - b.k);
  // fruit: count grows with the surah
  const nFruit = Math.round(5 + 13 * P.size), hang = (form.fronds ? Array.from({ length: 9 }, () => ({ x: form.top.x + (r() - .5) * 40, y: form.top.y + 6, b: 1 })) : pts.length ? pts : T.tips)
    .map((q) => [r(), q]).sort((a, b) => a[0] - b[0]).slice(0, nFruit).map((e) => e[1]);
  hang.forEach((q, i) => T.items.push({ kind: 'fruit', x: q.x + (r() - .5) * 10, y: q.y + (form.cone ? 0 : 4), L: form.cone ? 0 : 10 + r() * 22, size: 6 + r() * 2.5, late: .8 + i * (.15 / nFruit), k: 50, ph: r() * TAU }));
  // fit the frame
  let top = GROUND, lo = CX, hi = CX;
  for (const it of T.items) if (it.kind === 'leaf' || it.kind === 'fruit') { top = Math.min(top, it.y - 18); lo = Math.min(lo, it.x - 18); hi = Math.max(hi, it.x + 18); }
  for (const t of T.tips) { top = Math.min(top, t.y - 25); lo = Math.min(lo, t.x - 25); hi = Math.max(hi, t.x + 25); }
  if (form.fronds) { top -= 140; lo = Math.min(lo, CX - 190); hi = Math.max(hi, CX + 190); }
  if (form.weeping) { lo -= 40; hi += 40; }
  T.shift = clamp(CX - (lo + hi) / 2, -60, 60);
  T.fit = Math.min(1, (GROUND - 40) / (GROUND - top), 470 / (hi - lo));
  T.grain = []; const gr = rng(s); for (const q of T.segs) if (q.w0 > 10) for (let k = 0; k < q.w0 / 5; k++) T.grain.push({ q, off: gr() - .5, t0: gr() * .5, l: .2 + gr() * .4 });
  T.motes = Array.from({ length: 20 }, () => ({ a: r() * TAU, d: Math.sqrt(r()), s: .8 + r() * 1.8, ph: r() * TAU }));
  return T;
}

// ---------- draw ----------
function seg(ctx, s, f, wf, warp, T, magic, t) {
  const [dark, light, rim] = T.bark.c(T.pal), fx = T.bark.fx;
  const p0 = warp(s.x0, s.y0), c = warp(s.cx, s.cy), p2 = warp(s.x1, s.y1);
  const qx = lerp(p0[0], c[0], f), qy = lerp(p0[1], c[1], f), ex = lerp(qx, lerp(c[0], p2[0], f), f), ey = lerp(qy, lerp(c[1], p2[1], f), f);
  const w0 = s.w0 * wf, w1 = f < 1 ? Math.max(1, s.w0 * wf * .4) : s.w1 * wf;
  const dx = ex - p0[0], dy = ey - p0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, wm = (w0 + w1) / 4;
  ctx.beginPath(); ctx.moveTo(p0[0] + nx * w0 / 2, p0[1] + ny * w0 / 2);
  ctx.quadraticCurveTo(qx + nx * wm, qy + ny * wm, ex + nx * w1 / 2, ey + ny * w1 / 2); ctx.lineTo(ex - nx * w1 / 2, ey - ny * w1 / 2);
  ctx.quadraticCurveTo(qx - nx * wm, qy - ny * wm, p0[0] - nx * w0 / 2, p0[1] - ny * w0 / 2); ctx.closePath();
  const w = Math.max(w0, 2), g = ctx.createLinearGradient(qx - w * .6, qy - w * .2, qx + w * .6, qy + w * .2);
  g.addColorStop(0, light); g.addColorStop(.45, mixc(light, dark)); g.addColorStop(1, dark);
  ctx.fillStyle = g; if (fx === 'glass') ctx.globalAlpha = .85; ctx.fill(); ctx.beginPath(); ctx.arc(ex, ey, w1 / 2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  if (rim && w0 > 3) { ctx.save(); ctx.strokeStyle = rim; ctx.globalAlpha = .5; ctx.lineWidth = Math.max(.8, w0 * .08); ctx.beginPath(); ctx.moveTo(p0[0] - nx * w0 * .42, p0[1] - ny * w0 * .42); ctx.quadraticCurveTo(qx - nx * wm * .85, qy - ny * wm * .85, ex - nx * w1 * .42, ey - ny * w1 * .42); ctx.stroke(); ctx.restore(); }
  if (fx === 'glass') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hsl(T.pal.fh, 90, 70, .5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(qx, qy, ex, ey); ctx.stroke(); ctx.restore(); }
  if ((fx === 'cracks' || fx === 'veins') && w0 > 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hsl(T.pal.ah, 100, fx === 'cracks' ? 55 : 70, .3 + .5 * magic * (.7 + .3 * Math.sin(t * 2 + s.x0))); ctx.lineWidth = fx === 'cracks' ? 1.1 : .8;
    ctx.beginPath(); ctx.moveTo(p0[0] + nx * w0 * .15, p0[1] + ny * w0 * .15); ctx.quadraticCurveTo(qx - nx * wm * .3, qy - ny * wm * .3, ex + nx * w1 * .1, ey + ny * w1 * .1); ctx.stroke(); ctx.restore(); }
  if (s.ring) { ctx.strokeStyle = 'rgba(5,10,12,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - w1 * .5, ey + 1); ctx.quadraticCurveTo(ex, ey + 5, ex + w1 * .5, ey + 1); ctx.stroke(); }
  return [ex, ey, Math.atan2(dy, dx)];
}
const mixCache = {};
function mixc(a, b) { const key = a + b; if (mixCache[key]) return mixCache[key]; const c = document.createElement('canvas').getContext('2d'); c.fillStyle = a; const A = c.fillStyle; c.fillStyle = b; const B = c.fillStyle;
  const pp = (x) => x.startsWith('#') ? [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)) : x.match(/[\d.]+/g).slice(0, 3).map(Number);
  const pa = pp(A), pb = pp(B); return (mixCache[key] = `rgb(${pa.map((v, i) => Math.round((v + pb[i]) / 2)).join(',')})`); }

function drawTree(ctx, T, g, env = {}) {
  const t = env.t || 0, thirst = env.thirst || 0, W8 = g * 1.16, wf = .22 + .78 * ease(clamp(g / .9)), sh = T.shift, p = T.pal;
  const warp = (x, y) => { const h = clamp((GROUND - y) / 420, 0, 1.4); return [x + sh + Math.sin(t * .7) * 5 * h * h + Math.sin(t * 1.7 + x * .02) * 1.4 * h, y + thirst * 14 * h * h]; };
  ctx.save(); const sr = 40 + 120 * g, sg = ctx.createRadialGradient(CX + sh, GROUND + 4, 0, CX + sh, GROUND + 4, sr); sg.addColorStop(0, `rgba(0,0,0,${.15 + .3 * g})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(CX + sh, GROUND + 4, sr, sr * .3, 0, 0, TAU); ctx.fill(); ctx.restore();
  const magic = clamp((g - .78) / .22) * (1 - thirst * .7);
  glow(ctx, T.crown.x + sh, T.crown.y, 240, p.ah, 70, 60, .13 * magic);
  drawSeed(ctx, CX + sh, GROUND - 2, .55, T, t, 1 - clamp((g - .015) / .05));
  if (g > .02) for (const q of T.roots) seg(ctx, q, clamp((g - .1) / .3), wf, warp, T, magic, t);
  const buds = [];
  for (const q of T.segs) { const f = clamp((W8 - q.s0) / (q.s1 - q.s0)); if (f <= 0) continue; const e = seg(ctx, q, f, wf, warp, T, magic, t); if (f < 1) buds.push({ x: e[0], y: e[1], a: e[2], f }); }
  const ga = .3 * clamp((g - .3) / .3), fx = T.bark.fx;
  if (ga > 0 && fx !== 'glass') { ctx.save(); ctx.strokeStyle = fx === 'birch' ? 'rgba(40,44,52,.9)' : 'rgba(0,0,0,.6)'; ctx.lineWidth = fx === 'birch' ? 1.6 : 1; ctx.globalAlpha = fx === 'birch' ? ga * 1.6 : ga;
    for (const q of T.grain) { const s = q.q; if (W8 < s.s1) continue; const off = q.off * s.w0 * wf * .7, dx = s.x1 - s.x0, dy = s.y1 - s.y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, len = fx === 'birch' ? .06 : q.l;
      const a = warp(s.x0 + dx * q.t0 + nx * off, s.y0 + dy * q.t0 + ny * off), b = warp(s.x0 + dx * (q.t0 + len) + nx * off * .8, s.y0 + dy * (q.t0 + len) + ny * off * .8); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); } ctx.restore(); }
  for (const b of buds) { const sz = (8 + 5 * b.f) * (1 + .7 * (1 - clamp(g / .3))); for (const side of [-1, 1]) leaf(ctx, b.x, b.y, b.a + side * .7 + Math.sin(t * 2 + b.x) * .1, sz, sz * .38, hsl(p.fh, 45, 55)); }
  for (const it of T.items) {
    const k = it.late != null ? ease(clamp((g - it.late) / .08)) * (1 - thirst * .6) : ease(clamp((W8 - it.b) / (it.grow || (it.kind === 'young' ? .06 : .12))));
    if (k <= 0) continue;
    const [x, y] = warp(it.x, it.y), sway = Math.sin(t * 2.1 + (it.ph || 0)) * .08 + thirst * .5 * Math.cos(it.a || 0);
    switch (it.kind) {
      case 'young': leaf(ctx, x, y, it.a + sway, it.size * k, it.size * .38 * k, hsl(p.fh, 40, 22 + 28 * clamp(it.k + 2))); break;
      case 'leaf': drawLeaf(ctx, T.li, x, y, it.a + sway, it.size * k, it.k * (1 - thirst * .3), p, t, it.ph); break;
      case 'strand': { const [x0, y0] = warp(it.p.x, it.p.y), drift = Math.sin(t * .9 + it.ph) * 6 * k, L = it.L * k * (1 - thirst * .25), x1 = x0 + it.dx * (.5 + .5 * k) + drift, ym = y0 - 18 * k, y1 = Math.min(GROUND - 30, y0 + L), c1x = x0 + it.dx * .6, c2y = y0 + (y1 - y0) * .3;
        ctx.strokeStyle = hsl(p.fh, 30, 25 + 50 * clamp(it.k)); ctx.lineWidth = 1.1; ctx.globalAlpha = .85; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(c1x, ym, x1, c2y, x1, y1); ctx.stroke(); ctx.globalAlpha = 1;
        for (let q = .15; q < 1; q += .1) { const lk = clamp((k - q * .6) / .3); if (lk <= 0) continue; drawLeaf(ctx, T.li, bez(x0, c1x, x1, x1, q), bez(y0, ym, c2y, y1, q), Math.PI / 2 + ((q * 13) % 1 > .5 ? .6 : -.6), LEAF_SIZE[T.li] * .55 * lk, it.k * (.6 + q * .4), p, t, it.ph + q * 9); } break; }
      case 'frond': frond2(ctx, it, k, t, thirst, warp, T); break;
      case 'aerial': { ctx.strokeStyle = hsl(p.fh, 20, 30, .6 * k); ctx.lineWidth = 1.2; const yy = lerp(y, GROUND - 4, k); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(t + it.ph) * 3, (y + yy) / 2, x + 2, yy); ctx.stroke(); break; }
      case 'beam': { const gr = ctx.createLinearGradient(0, it.y, 0, GROUND - 200); gr.addColorStop(0, hsl(p.ah, 90, 75, .0)); gr.addColorStop(.5, hsl(p.ah, 90, 75, .05 * k)); gr.addColorStop(1, hsl(p.ah, 90, 75, .1 * k));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 10, GROUND - 200); ctx.lineTo(x + 10, GROUND - 200); ctx.lineTo(x + 26, it.y + 30); ctx.lineTo(x - 26, it.y + 30); ctx.fill(); for (let i = 0; i < 6; i++) { const yy = GROUND - 200 - ((t * 20 + i * 25) % 130); glow(ctx, x + Math.sin(i + t) * 8, yy, 5, p.ah, 100, 80, .7 * k); } break; }
      case 'fruit': { const sw = Math.sin(t * 1.3 + it.ph) * 2.5, lx = x + sw, ly = y + it.L * k, s = it.size * k * (T.ui === 10 ? 1.4 : 1);
        if (it.L > 0 && T.ui !== 10) { ctx.strokeStyle = hsl(p.ah, 50, 70, .55 * k); ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly - s); ctx.stroke(); }
        drawFruit(ctx, T.ui, lx, ly, s, p, t, it.ph, k); break; }
    }
  }
  if (magic > 0) for (const m of T.motes) { const x = T.crown.x + sh + Math.cos(m.a + t * .05) * m.d * 210, y = T.crown.y + 40 + Math.sin(m.a) * m.d * 170 - ((t * 6 + m.ph * 30) % 40); glow(ctx, x, y, m.s * 4, p.ah, 80, 70, magic * (.5 + .4 * Math.sin(t * 2 + m.ph))); }
}
function frond2(ctx, it, k, t, thirst, warp, T) {
  const p = T.pal, [x0, y0] = warp(it.x, it.y), bright = it.back ? .55 : 1, L = it.L * k; let x = x0, y = y0, a = it.a; const n = 16, pts = [];
  for (let i = 0; i <= n; i++) { pts.push({ x, y, a }); x += Math.cos(a) * L / n; y += Math.sin(a) * L / n; const tgt = Math.cos(a) >= 0 ? Math.PI / 2 : -1.5 * Math.PI; a += (tgt - a) * (.035 * it.droop * (1 + thirst)); a += Math.sin(t * .8 + it.ph) * .004; }
  ctx.strokeStyle = hsl(p.fh, 40, 25 + 30 * bright); ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
  for (let i = 1; i < pts.length; i++) { const q = i / pts.length, pt = pts[i]; for (const side of [-1, 1]) drawLeaf(ctx, T.li, pt.x, pt.y, pt.a + side * (1.1 - q * .4), LEAF_SIZE[T.li] * (1.3 - q * .8) * k, .3 + .6 * bright * (1 - q * .3), p, t, it.ph + i); }
}

function island(ctx, T, t) {
  const p = T.pal, x = CX, y = GROUND, rx = 200, ry = 64;
  const g = ctx.createLinearGradient(0, 0, 0, 625); g.addColorStop(0, hsl(p.ah, 30, 9)); g.addColorStop(1, hsl(p.fh, 30, 3)); ctx.fillStyle = g; ctx.fillRect(0, 0, 500, 625);
  const r = rng(T.s * 3 + 1); for (let i = 0; i < 70; i++) { const sx = r() * 500, sy = r() * 380, s = r(); ctx.fillStyle = `rgba(255,255,255,${(.15 + s * .5) * (.75 + .25 * Math.sin(t * 1.3 + i))})`; ctx.beginPath(); ctx.arc(sx, sy, .4 + s * .9, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(x, y + ry * .5, rx * .98, ry * 1.25, 0, 0, Math.PI); ctx.lineTo(x - rx * .98, y + ry * .5);
  const gs = ctx.createLinearGradient(0, y, 0, y + ry * 1.9); gs.addColorStop(0, '#2a1c14'); gs.addColorStop(1, '#05080a'); ctx.fillStyle = gs; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); const gh = lerp(140, p.fh, .25);
  const gt = ctx.createRadialGradient(x - rx * .3, y - ry * .5, rx * .1, x, y, rx); gt.addColorStop(0, hsl(gh, 30, 30)); gt.addColorStop(1, hsl(gh, 35, 12)); ctx.fillStyle = gt; ctx.fill(); ctx.clip();
  for (let i = 0; i < 240; i++) { const a = r() * TAU, d = Math.sqrt(r()), gx = x + Math.cos(a) * d * rx, gy = y + Math.sin(a) * d * ry, tone = r();
    ctx.strokeStyle = hsl(gh, 30, tone < .5 ? 12 : 38, .7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + (r() - .5) * 3 + Math.sin(t * 1.2 + gx * .05) * .8, gy - 3 - r() * 5); ctx.stroke(); }
  ctx.restore();
}
function fitTo(ctx, T) { const f = T.fit; ctx.translate(CX, GROUND); ctx.scale(f, f); ctx.translate(-CX, -GROUND); }
export const MagicTrees = { build, drawTree, drawSeed, island, fitTo, PLAN, FORMS, LEAVES, FRUITS, W: 500, H: 625 };

/** Mushaf pages per surah (line shares of the 604 pages). */
export const SURAH_PAGES: number[] = [0.47, 47.4, 26.8, 29.27, 21.53, 22.87, 25.87, 9.87, 20.87, 13.33, 14.0, 13.33, 6.0, 6.73, 5.27, 14.47, 11.47, 11.27, 7.13, 9.6, 9.8, 9.87, 7.87, 9.6, 7.13, 9.87, 8.4, 10.87, 8.0, 6.27, 3.8, 2.87, 9.93, 6.33, 5.6, 5.6, 6.87, 5.13, 8.8, 9.73, 5.87, 6.13, 6.6, 2.8, 3.33, 4.4, 3.93, 4.27, 2.47, 2.6, 2.6, 2.33, 2.53, 2.53, 3.0, 3.13, 4.2, 3.27, 3.4, 2.33, 1.47, 1.27, 1.4, 1.87, 1.93, 1.87, 2.2, 2.13, 1.8, 1.6, 1.6, 1.87, 1.33, 1.73, 1.13, 1.67, 1.47, 1.33, 1.33, 1.0, 0.8, 0.6, 1.27, 0.8, 0.8, 0.47, 0.53, 0.73, 1.07, 0.6, 0.47, 0.53, 0.33, 0.2, 0.27, 0.53, 0.2, 0.67, 0.27, 0.33, 0.33, 0.2, 0.13, 0.27, 0.2, 0.2, 0.27, 0.13, 0.2, 0.2, 0.2, 0.13, 0.2, 0.27];
