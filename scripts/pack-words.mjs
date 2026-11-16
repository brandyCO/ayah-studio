// Packs the aligned word times in dist/ by juz: dist/data/words/{key}/{SSS}.json (one per surah, as kept in
// public/ and written by scripts/make-word-timings.py) → dist/data/words/{key}/p{FFF}.json, one file for the
// surahs whose ayah 1 lies in the same juz (FFF = the first of them, WORD_PACKS in src/data/alignedWords.ts),
// { "surah": { "ayah": [[word, startMs, endMs], ...] } }. ~210 reciters × 28 packs instead of ~21,000 files,
// so the site stays under Cloudflare's 20,000 files a version. Run after `vite build` (npm run build).
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = readFileSync(join(root, 'src/data/alignedWords.ts'), 'utf8');
const PACKS = JSON.parse(src.match(/WORD_PACKS = (\[[\d, ]+\])/)[1]);

// The packs must be the juz each surah starts in (public/data/divisions.json).
const juz = JSON.parse(readFileSync(join(root, 'public/data/divisions.json'), 'utf8')).juz;
const juzOf = (s) => juz.filter(([a, b]) => a < s || (a === s && b <= 1)).length;
const firsts = [];
for (let s = 1; s <= 114; s++) if (s === 1 || juzOf(s) !== juzOf(s - 1)) firsts.push(s);
if (JSON.stringify(firsts) !== JSON.stringify(PACKS)) throw new Error(`WORD_PACKS should be ${JSON.stringify(firsts)}`);

const packOf = (s) => PACKS.filter((f) => f <= s).at(-1);
const dir = join(root, 'dist/data/words');
if (!existsSync(dir)) { console.log('pack-words: no dist/data/words'); process.exit(0); }
let before = 0, after = 0;
for (const key of readdirSync(dir)) {
  const packs = new Map();
  for (const f of readdirSync(join(dir, key)).sort()) {
    const m = f.match(/^(\d{3})\.json$/);
    if (!m) continue;
    const s = Number(m[1]);
    const d = JSON.parse(readFileSync(join(dir, key, f), 'utf8'));
    if (!packs.has(packOf(s))) packs.set(packOf(s), {});
    packs.get(packOf(s))[s] = d.a;
    unlinkSync(join(dir, key, f));
    before++;
  }
  for (const [p, d] of packs) {
    writeFileSync(join(dir, key, `p${String(p).padStart(3, '0')}.json`), JSON.stringify(d));
    after++;
  }
}
console.log(`pack-words: ${before} surah files → ${after} juz packs`);
