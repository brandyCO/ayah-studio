// One-off: fetch Quran text, surah metadata and the English translation into public/data/.
// Run with `node scripts/fetch-data.mjs`, then commit the output. The app never fetches text at runtime.
//
// Sources:
//   Text   — Quran.com API v4, `qpc_hafs` (King Fahd Glorious Quran Printing Complex Uthmani Hafs text,
//            the encoding the bundled KFGQPC Uthmanic Script Hafs font is designed for).
//   Meta   — api.alquran.cloud/v1/meta
//   Trans. — api.alquran.cloud/v1/quran/en.sahih (Saheeh International)
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/data/', import.meta.url);

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Verification failed: ${msg}`);
}

const metaRes = await json('https://api.alquran.cloud/v1/meta');
const refs = metaRes.data.surahs.references;
assert(refs.length === 114, '114 surahs in meta');

let offset = 0;
const meta = refs.map((s) => {
  const m = {
    n: s.number,
    ar: s.name,
    en: s.englishName,
    tr: s.englishNameTranslation,
    ayahs: s.numberOfAyahs,
    start: offset, // global ayah number of this surah's first ayah = start + 1
    type: s.revelationType,
  };
  offset += s.numberOfAyahs;
  return m;
});
assert(offset === 6236, `6236 ayat in meta (got ${offset})`);

const textRes = await json('https://api.quran.com/api/v4/quran/verses/qpc_hafs');
const verses = textRes.verses;
assert(verses.length === 6236, `6236 verses of text (got ${verses.length})`);
const text = meta.map((s) => []);
for (const v of verses) {
  const [sn, an] = v.verse_key.split(':').map(Number);
  assert(an === text[sn - 1].length + 1, `ayah order at ${v.verse_key}`);
  assert(v.id === meta[sn - 1].start + an, `global id at ${v.verse_key}`);
  assert(typeof v.text_qpc_hafs === 'string' && v.text_qpc_hafs.length > 0, `non-empty ${v.verse_key}`);
  text[sn - 1].push(v.text_qpc_hafs);
}
meta.forEach((s, i) => assert(text[i].length === s.ayahs, `surah ${s.n} has ${s.ayahs} ayat (got ${text[i].length})`));

const trRes = await json('https://api.alquran.cloud/v1/quran/en.sahih');
const trSurahs = trRes.data.surahs;
assert(trSurahs.length === 114, '114 surahs of translation');
const translation = trSurahs.map((s, i) => {
  assert(s.ayahs.length === meta[i].ayahs, `translation surah ${s.number} count`);
  return s.ayahs.map((a) => a.text);
});

await mkdir(OUT, { recursive: true });
const write = (name, data) => writeFile(new URL(name, OUT), JSON.stringify(data) + '\n');
await write('meta.json', meta);
await write('quran-uthmani.json', {
  source: 'Quran.com API v4 (text_qpc_hafs) — King Fahd Glorious Quran Printing Complex, Uthmani script, Hafs. Unmodified.',
  surahs: text,
});
await write('en-sahih.json', {
  source: 'Saheeh International, via api.alquran.cloud (edition en.sahih)',
  surahs: translation,
});
console.log('OK: 114 surahs, 6236 ayat verified; wrote meta.json, quran-uthmani.json, en-sahih.json');
