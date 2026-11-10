// Similar ayat (mutashabihat) for tasmi' in the Learn tab, found in our own bundled text only:
// two ayat are similar when they share a run of at least 4 words (or 3 words making up most of a short
// ayah), compared letter for letter with the harakat and the ayah number left out. For each ayah the 3
// most similar others are kept. Writes public/data/similar.json: { "s:a": ["s:a", ...] }.
// Run: node scripts/make-similar.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const q = JSON.parse(readFileSync(new URL('../public/data/quran-uthmani.json', import.meta.url), 'utf8'));
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const fold = (w) => w.replace(MARKS, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ۥ|ۦ/g, '');
const ayat = [];
q.surahs.forEach((list, si) => list.forEach((text, ai) => {
  const words = text.replace(/ [٠-٩]+$/, '').split(' ').map(fold).filter(Boolean);
  ayat.push({ key: `${si + 1}:${ai + 1}`, words });
}));
if (ayat.length !== 6236) throw new Error(`expected 6236 ayat, got ${ayat.length}`);

// Index every 3-word run.
const idx = new Map();
ayat.forEach((a, n) => {
  for (let i = 0; i + 3 <= a.words.length; i++) {
    const k = a.words.slice(i, i + 3).join(' ');
    let l = idx.get(k); if (!l) idx.set(k, (l = new Set())); l.add(n);
  }
});

/** Longest run of words the two ayat share. */
function run(a, b) {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = up;
    }
  }
  return best;
}

const out = {};
let pairs = 0;
ayat.forEach((a, n) => {
  const cands = new Set();
  for (let i = 0; i + 3 <= a.words.length; i++) {
    const l = idx.get(a.words.slice(i, i + 3).join(' '));
    if (l && l.size <= 60) for (const m of l) if (m !== n) cands.add(m); // a phrase in > 60 ayat is a formula, not a trap
  }
  const scored = [];
  for (const m of cands) {
    const b = ayat[m];
    const r = run(a.words, b.words);
    const short = Math.min(a.words.length, b.words.length);
    if (r >= 4 || (r >= 3 && r >= 0.6 * short)) scored.push([r / Math.max(a.words.length, b.words.length) + r / 100, b.key]);
  }
  scored.sort((x, y) => y[0] - x[0]);
  if (scored.length) { out[a.key] = scored.slice(0, 3).map((x) => x[1]); pairs += out[a.key].length; }
});
writeFileSync(new URL('../public/data/similar.json', import.meta.url), JSON.stringify(out));
console.log(`${Object.keys(out).length} ayat with similar ayat, ${pairs} links`);
