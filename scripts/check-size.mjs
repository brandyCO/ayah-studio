// Speed budget: what a first visit downloads before anything shows — the entry script, the modules it
// preloads and the stylesheet (gzip, as served). Fails the build when it grows past the budget, so the
// app does not get slower one feature at a time. Raise BUDGET on purpose, never by accident.
// Usage: node scripts/check-size.mjs (after `npm run build`)
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 135;
const html = readFileSync('dist/index.html', 'utf8');
const files = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
let total = 0;
const rows = files.map((f) => {
  const kb = gzipSync(readFileSync(`dist/${f}`)).length / 1024;
  total += kb;
  return [f, kb];
}).sort((a, b) => b[1] - a[1]);
for (const [f, kb] of rows) console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
console.log(`${total.toFixed(1).padStart(7)} KB  first load (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) {
  console.error(`First-load JS + CSS is ${total.toFixed(1)} KB gzip, over the ${BUDGET_KB} KB budget. Lazy-load the new code (import()) or raise the budget on purpose.`);
  process.exit(1);
}
