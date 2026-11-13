// Guard on the bundled Quran text (optimization list item 19): every build checks that the Arabic text,
// the mushaf page layout and Saheeh International still have every ayah (6236, per surah as in
// meta.json) and are byte-for-byte the reviewed copies. A deliberate update (a new source file)
// must also update scripts/quran-checksums.json: run `node scripts/check-quran.mjs --write`.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../public/data/', import.meta.url);
const sumsFile = new URL('./quran-checksums.json', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const FILES = ['quran-uthmani.json', 'mushaf.json', 'en-sahih.json', 'meta.json'];
const errors = [];
const fail = (m) => errors.push(m);

const meta = JSON.parse(read('meta.json'));
if (meta.length !== 114) fail(`meta.json: ${meta.length} surahs, expected 114`);
const counts = meta.map((s) => s.ayahs);
const total = counts.reduce((a, b) => a + b, 0);
if (total !== 6236) fail(`meta.json: ${total} ayat, expected 6236`);

for (const f of ['quran-uthmani.json', 'en-sahih.json']) {
  const { surahs } = JSON.parse(read(f));
  if (surahs.length !== 114) fail(`${f}: ${surahs.length} surahs, expected 114`);
  surahs.forEach((ayat, i) => {
    if (ayat.length !== counts[i]) fail(`${f}: surah ${i + 1} has ${ayat.length} ayat, expected ${counts[i]}`);
    ayat.forEach((t, j) => { if (typeof t !== 'string' || !t.trim()) fail(`${f}: ${i + 1}:${j + 1} is empty`); });
  });
}

// The mushaf: 604 pages, and every ayah's words appear on some line.
const { pages } = JSON.parse(read('mushaf.json'));
if (pages.length !== 604) fail(`mushaf.json: ${pages.length} pages, expected 604`);
const seen = new Set();
for (const p of pages) for (const line of p.lines) if (Array.isArray(line[0])) for (const [s, a] of line) seen.add(`${s}:${a}`);
for (let s = 1; s <= 114; s++) for (let a = 1; a <= counts[s - 1]; a++) if (!seen.has(`${s}:${a}`)) fail(`mushaf.json: ${s}:${a} is on no page`);

const now = Object.fromEntries(FILES.map((f) => [f, sha(read(f))]));
if (process.argv.includes('--write')) {
  writeFileSync(sumsFile, JSON.stringify(now, null, 2) + '\n');
  console.log('Wrote scripts/quran-checksums.json');
} else {
  const pinned = JSON.parse(readFileSync(sumsFile, 'utf8'));
  for (const f of FILES) if (pinned[f] !== now[f]) fail(`${f} changed (sha256 ${now[f].slice(0, 12)}…). If this is a reviewed update, run node scripts/check-quran.mjs --write`);
}

if (errors.length) {
  console.error(`Quran text check failed:\n- ${errors.slice(0, 30).join('\n- ')}${errors.length > 30 ? `\n… and ${errors.length - 30} more` : ''}`);
  process.exit(1);
}
console.log(`Quran text OK: 114 surahs, ${total} ayat, 604 mushaf pages, checksums match.`);
