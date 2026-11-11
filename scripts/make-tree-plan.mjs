// Prints the 114 magic trees' combinations (PLAN in src/ui/magicTrees.ts) and checks the file still holds them.
// The search ran on every app start (~140 ms on a fast phone); its result is fixed, so the app keeps the table.
// Run: node scripts/make-tree-plan.mjs
import { readFileSync } from 'node:fs';
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const NO_PALM = new Set([5, 12, 3, 11]);
// choose each surah's combination: no two trees share more than two of form / leaves / fruit / bark / colours,
// neighbours always differ in form and leaves, and every option is used about evenly
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
const line = `const PLAN = [null, ${plan.slice(1).map((v) => `[${v.join(',')}]`).join(', ')}];`;
const src = readFileSync(new URL('../src/ui/magicTrees.ts', import.meta.url), 'utf8');
console.log(src.includes(line) ? 'magicTrees.ts matches' : `magicTrees.ts differs; put this line in:\n${line}`);
