// One-off: map Quran.com word positions (the `wordIndex` of QDC recitation segments) onto the words of
// the bundled text. Run after fetch-data.mjs: `node scripts/fetch-word-map.mjs`, then commit
// public/data/word-map.json.
//
// The API's word split is for word-by-word study and differs from the text's spaces in places (it
// groups "بَعۡدَ مَا", splits "لَّوۡمَا", and joins ۞ with a regular space). Like fetch-mushaf.mjs we
// align by letters with whitespace ignored and require every letter to match; our text stays
// authoritative and is never changed.
//
// Output: { map: { "s:a": "0 1 2-3 4 4 …" } } listing, for each API word position (1-based, in order),
// the index of the space-separated token of our ayah text holding its first letter, and "-last" when it
// runs into a later token. Ayat where API word p is exactly our token p-1 are left out (identity).
import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../public/data/', import.meta.url);
const text = JSON.parse(await readFile(new URL('quran-uthmani.json', DATA), 'utf8')).surahs;

function assert(cond, msg) {
  if (!cond) throw new Error(`Verification failed: ${msg}`);
}

async function json(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function chapter(s) {
  const out = [];
  for (let pg = 1; ; pg++) {
    const d = await json(`https://api.quran.com/api/v4/verses/by_chapter/${s}?words=true&per_page=50&page=${pg}&word_fields=text_qpc_hafs`);
    out.push(...d.verses);
    if (!d.pagination.next_page) break;
  }
  assert(out.length === text[s - 1].length, `surah ${s} has ${text[s - 1].length} ayat (got ${out.length})`);
  return out;
}

const verses = new Array(114);
let next = 1;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next <= 114) {
    const s = next++;
    verses[s - 1] = await chapter(s);
  }
}));

const bare = (x) => x.replace(/\s+/g, '');
// The ayah-number glyph (after a no-break space, or a space in 2:72) is not a recited word.
const stripNumber = (t) => t.replace(/[\s ]*[٠-٩]+$/, '');

const map = {};
let mapped = 0, apiWords = 0;
for (const v of verses.flat()) {
  const [s, a] = v.verse_key.split(':').map(Number);
  const tokens = stripNumber(text[s - 1][a - 1]).split(' ');
  const words = v.words.filter((w) => w.char_type_name === 'word');
  apiWords += words.length;
  // Letter offset → our token index.
  const owner = [];
  tokens.forEach((t, i) => { for (let k = 0; k < bare(t).length; k++) owner.push(i); });
  const ours = tokens.map(bare).join('');
  assert(words.map((w) => bare(w.text_qpc_hafs)).join('') === ours, `${v.verse_key} letters differ`);
  let pos = 0;
  const spans = words.map((w) => {
    const b = bare(w.text_qpc_hafs);
    assert(b.length > 0, `${v.verse_key} word ${w.position} is empty`);
    assert(ours.slice(pos, pos + b.length) === b, `${v.verse_key} word ${w.position} letters match`);
    const first = owner[pos], last = owner[pos + b.length - 1];
    pos += b.length;
    return first === last ? `${first}` : `${first}-${last}`;
  });
  assert(pos === ours.length, `${v.verse_key} every letter covered`);
  words.forEach((w, i) => assert(w.position === i + 1, `${v.verse_key} positions are 1..n`));
  const identity = spans.length === tokens.length && spans.every((x, i) => x === `${i}`);
  if (!identity) {
    map[v.verse_key] = spans.join(' ');
    mapped++;
  }
}

await writeFile(new URL('word-map.json', DATA), JSON.stringify({
  source: 'Quran.com API v4 (verses/by_chapter words, text_qpc_hafs): word positions used by QDC recitation segments, aligned letter-for-letter to quran-uthmani.json tokens. Ayat not listed map 1:1.',
  map,
}) + '\n');
console.log(`OK: 6236 ayat, ${apiWords} API words aligned letter-for-letter; ${mapped} ayat differ from our spacing; wrote word-map.json`);
