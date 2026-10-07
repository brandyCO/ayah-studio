// One-off: fetch the 15-line Madinah mushaf layout (604 pages) and map it onto the bundled text.
// Run after fetch-data.mjs: `node scripts/fetch-mushaf.mjs`, then commit public/data/mushaf.json.
//
// Source: Quran.com API v4 `verses/by_chapter` with word `page_number` + `line_number` (Madinah 15-line layout).
// Only line breaks are taken from the API. The words are verified to match public/data/quran-uthmani.json
// exactly, and the app renders the bundled text — never the API's copy.
//
// Output: { pages: [{ juz, lines }] }, where each line is one of
//   ["h", surah]                    surah header
//   ["b", surah]                    basmala before the surah
//   [[surah, ayah, from, to], ...]  word ranges (token indices, `to` exclusive) of the ayah text
// Tokens are the ayah text split on regular spaces, with a lone ayah-number token joined to the word
// before it — the same rule as arabicWords() in src/engine/layout.ts.
import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../public/data/', import.meta.url);
const text = JSON.parse(await readFile(new URL('quran-uthmani.json', DATA), 'utf8')).surahs;

function assert(cond, msg) {
  if (!cond) throw new Error(`Verification failed: ${msg}`);
}

function tokens(t) {
  const w = t.split(' ').filter((x) => x.length > 0);
  for (let i = w.length - 1; i > 0; i--) if (/^[٠-٩]+$/.test(w[i])) w.splice(i - 1, 2, `${w[i - 1]} ${w[i]}`);
  return w;
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

// Per-word page/line numbers, fetched surah by surah (the by_page listing is not reliable).
async function chapter(s) {
  const out = [];
  for (let pg = 1; ; pg++) {
    // Text and positions are fetched separately: asking for both in one call returns wrong page
    // numbers for some words (seen at 5:77). Merged by word position, which must agree.
    const base = `https://api.quran.com/api/v4/verses/by_chapter/${s}?words=true&fields=juz_number&per_page=50&page=${pg}&mushaf=5`;
    const [d, t] = await Promise.all([json(`${base}&word_fields=line_number,page_number`), json(`${base}&word_fields=text_qpc_hafs`)]);
    assert(d.verses.length === t.verses.length, `surah ${s} batch ${pg} sizes agree`);
    d.verses.forEach((v, i) => {
      const tv = t.verses[i];
      assert(v.verse_key === tv.verse_key && v.words.length === tv.words.length, `${v.verse_key} batches agree`);
      v.words.forEach((w, k) => {
        assert(w.position === tv.words[k].position && w.char_type_name === tv.words[k].char_type_name, `${v.verse_key} word ${k} agrees`);
        w.text_qpc_hafs = tv.words[k].text_qpc_hafs;
      });
    });
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

const PAGES = 604;
const pages = Array.from({ length: PAGES }, (_, i) => ({ juz: 0, lines: Array.from({ length: i < 2 ? 8 : 15 }, () => null) }));
let lastPos = 0;
for (const v of verses.flat()) {
  const [s, a] = v.verse_key.split(':').map(Number);
  const tk = tokens(text[s - 1][a - 1]);
  const words = v.words.filter((w) => w.char_type_name === 'word');
  const end = v.words.filter((w) => w.char_type_name === 'end');
  assert(end.length === 1, `${v.verse_key} has one end marker`);
  // Match by letter position, ignoring spacing: the API's word split is for word-by-word study and
  // differs from the text's spaces in places (it groups "بَعۡدَ مَا", splits "لَّوۡمَا", and joins ۞
  // with a regular space). Every letter must still match; our text stays authoritative.
  const bare = (x) => x.replace(/\s+/g, '');
  const apiStr = words.map((w) => bare(w.text_qpc_hafs)).join('');
  const ourStr = bare(tk.join(' ').replace(/\s+[\u0660-\u0669]+$/, ''));
  assert(apiStr === ourStr, `${v.verse_key} text differs:\n  api: ${apiStr}\n  ours: ${ourStr}`);
  const owner = []; // letter offset -> API word index
  words.forEach((w, wi) => {
    for (let c = 0; c < bare(w.text_qpc_hafs).length; c++) owner.push(wi);
  });
  let offset = 0;
  tk.forEach((t, i) => {
    const w = words[owner[offset]];
    offset += bare(t).length;
    const p = w.page_number, ln = w.line_number;
    const pg = pages[p - 1];
    assert(pg && ln >= 1 && ln <= pg.lines.length, `${v.verse_key} token ${i + 1} at page ${p} line ${ln}`);
    const pos = p * 100 + ln;
    assert(pos >= lastPos, `${v.verse_key} token ${i + 1} goes backwards`);
    lastPos = pos;
    pg.juz ||= v.juz_number;
    pg.lines[ln - 1] ??= [];
    const segs = pg.lines[ln - 1];
    const last = segs[segs.length - 1];
    if (last && last[0] === s && last[1] === a && last[3] === i) last[3] = i + 1;
    else segs.push([s, a, i, i + 1]);
  });
}
pages.forEach((pg, i) => assert(pg.juz > 0, `page ${i + 1} has ayat`));

// Fill the empty lines with surah headers and basmalas. Runs of empty lines may continue across a
// page break; each run must hold exactly what the following surah needs.
const flat = pages.flatMap((pg, pi) => pg.lines.map((l, li) => ({ pi, li, l })));
for (let i = 0; i < flat.length; ) {
  if (flat[i].l) { i++; continue; }
  let j = i;
  while (j < flat.length && !flat[j].l) j++;
  assert(j < flat.length, 'no empty lines after the last ayah');
  const [s, a] = flat[j].l[0];
  assert(a === 1, `empty lines before ${s}:${a} (page ${flat[j].pi + 1})`);
  const need = s === 1 || s === 9 ? [['h', s]] : [['h', s], ['b', s]];
  assert(j - i === need.length, `surah ${s} gap is ${j - i} lines, expected ${need.length}`);
  need.forEach((item, k) => (pages[flat[i + k].pi].lines[flat[i + k].li] = item));
  i = j;
}

await writeFile(new URL('mushaf.json', DATA), JSON.stringify({
  source: 'Quran.com API v4 (verses/by_chapter word page/line) — Madinah mushaf 15-line layout (KFGQPC Hafs, mushaf=5). Line breaks only; text from quran-uthmani.json.',
  pages,
}) + '\n');
console.log('OK: 604 pages, 6236 ayat, every word verified; wrote mushaf.json');
