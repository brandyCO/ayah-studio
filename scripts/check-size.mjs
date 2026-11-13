// Speed budget: what a first visit downloads before anything shows — the entry script, the modules it
// preloads and the stylesheet (gzip, as served). Fails the build when it grows past the budget, so the
// app does not get slower one feature at a time. Raise BUDGET on purpose, never by accident.
// Usage: node scripts/check-size.mjs (after `npm run build`)
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// 2026-11-09: raised from 135 (the extra recordings and the shared player took first load to 136.4 KB, and
// the Pages deploy had stopped on it since #134).
// 2026-11-11: raised to 141 for the Listen player's repeat / juz playback and its background service (140.1 KB;
// the favourite sheets were moved out of first load to keep it there).
// 2026-11-11: raised to 142 for Arabic in every notification and message (141.2 KB: error messages in Arabic,
// localised references, channel names; the media picker strings and the server-message table load lazily).
// 2026-11-12: raised to 143 for friend challenges + weekly rivals (142.2 KB: challenge / duel calls and the Challenges tab
// on Me; their screens, strings and styles load on first use).
// 2026-11-13: raised to 145 for 59 more recordings (144.1 KB: their entries in the reciter list, which the player and
// pickers need at once).
const BUDGET_KB = 145;
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
