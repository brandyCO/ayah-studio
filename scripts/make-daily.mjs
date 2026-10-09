// One-off: the curated list for the ayah of the day → public/data/daily.json (docs/grow.md, G2).
// Run with `node scripts/make-daily.mjs`, then commit the output.
//
// Criteria (docs/grow.md §3 G2): well-known ayat, or a run of consecutive ayat forming one sentence,
// whose meaning stands on its own without the surrounding passage — remembrance, mercy, hope,
// patience, gratitude, trust, duas from the Quran, Allah's names; no legal rulings, no verses about
// punishment or battle out of context, nothing that starts mid-sentence or answers the previous ayah;
// the Saheeh International translation of the run ≤ 60 words, so the widget can always show it whole.
// The order is a fixed shuffle (seeded below), so every device shows the same ayah on the same date.
import { readFile, writeFile } from 'node:fs/promises';

const LIST = `
2:45 2:110 2:115 2:152 2:153 2:186 2:208 2:261 2:263 3:26 3:31 3:92 3:102 3:104 3:139 3:200
4:58 4:110 6:17 6:162-163 7:23 7:56 7:180 7:199 7:205 8:2 9:51 10:57 10:62 10:107 11:6 11:90
11:114 11:115 13:11 14:24-25 14:34 14:40-41 15:49 16:18 16:53 16:90 16:97 16:125 16:128 17:9
17:70 17:80 17:82 17:111 18:10 18:23-24 18:46 18:109 20:25-28 20:46 20:114 20:132 21:35 21:83
21:87 21:89 21:107 23:1-2 23:118 25:58 25:63 27:62 28:24 28:77 28:88 29:45 29:57 29:69 30:21
30:22 30:50 31:17 31:18 33:41-42 33:56 33:70-71 35:2 35:15 36:82-83 37:180-182 38:29 39:10
39:53 41:30 41:34 42:19 42:28 42:36 42:40 47:7 48:4 49:10 49:13 50:16 51:20-21 51:49 51:56
52:48 54:17 55:1-4 55:13 55:26-27 55:60 57:3 57:4 58:11 59:18 59:21 59:22 59:23 59:24 62:10
64:11 64:15 64:16 67:1-2 67:15 68:4 70:5 73:8 76:8-9 79:40-41 84:6 86:4 87:14-15 89:27-30
92:5-7 93:3-5 93:6-8 94:1-4 94:5-6 94:7-8 95:4 96:1-5 97:3 99:7-8 103:1-3 110:1-3 112:1-4
113:1-5 114:1-6
`.trim().split(/\s+/);

const meta = JSON.parse(await readFile(new URL('../public/data/meta.json', import.meta.url), 'utf8'));
const en = JSON.parse(await readFile(new URL('../public/data/en-sahih.json', import.meta.url), 'utf8'));

const seen = new Set();
const items = LIST.map((ref) => {
  const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(ref);
  if (!m) throw new Error(`Bad reference ${ref}`);
  const s = Number(m[1]), from = Number(m[2]), to = Number(m[3] ?? m[2]);
  if (!meta[s - 1] || from < 1 || to < from || to > meta[s - 1].ayahs || to - from > 5) throw new Error(`Out of range ${ref}`);
  if (seen.has(ref)) throw new Error(`Duplicate ${ref}`);
  seen.add(ref);
  const text = en.surahs[s - 1].slice(from - 1, to).join(' '); // unaltered, ayat joined by a space
  const words = text.split(/\s+/).length;
  if (words > 60) throw new Error(`${ref}: ${words} words (max 60)`);
  return { s, from, to, en: text };
});

// Seeded Fisher–Yates (mulberry32), so the order is fixed and well mixed.
let seed = 20261009;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
}

await writeFile(new URL('../public/data/daily.json', import.meta.url), JSON.stringify({
  source: 'Curated by Ayah Studio (criteria in scripts/make-daily.mjs); English: Saheeh International, unaltered.',
  epoch: '2026-01-01', // day 0 of the cycle (local date)
  items,
}) + '\n');
console.log(`OK: ${items.length} entries → public/data/daily.json`);
