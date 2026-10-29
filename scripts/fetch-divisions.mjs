// One-off: where each juz and each quarter (rub' al-hizb) starts → public/data/divisions.json.
//   Quran.com API v4 (verses/by_chapter: juz_number, rub_el_hizb_number), cross-checked against
//   api.alquran.cloud/v1/meta (juzs, hizbQuarters). Both must agree on all 30 + 240 starts.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/data/divisions.json', import.meta.url);
const assert = (ok, msg) => { if (!ok) { console.error('FAIL:', msg); process.exit(1); } };
const json = async (url) => {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    assert(i < 3, `${url} → HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
  }
};

const juz = [];
const quarters = [];
let ayat = 0;
for (let s = 1; s <= 114; s++) {
  const { verses } = await json(`https://api.quran.com/api/v4/verses/by_chapter/${s}?per_page=300&fields=juz_number,rub_el_hizb_number`);
  for (const v of verses) {
    ayat++;
    if (!juz[v.juz_number - 1]) juz[v.juz_number - 1] = [s, v.verse_number];
    if (!quarters[v.rub_el_hizb_number - 1]) quarters[v.rub_el_hizb_number - 1] = [s, v.verse_number];
  }
}
assert(ayat === 6236, `6236 ayat (got ${ayat})`);
assert(juz.length === 30 && juz.every(Boolean), '30 juz');
assert(quarters.length === 240 && quarters.every(Boolean), '240 quarters');

const meta = (await json('https://api.alquran.cloud/v1/meta')).data;
const same = (a, b) => a.length === b.length && a.every(([s, v], i) => b[i].surah === s && b[i].ayah === v);
assert(same(juz, meta.juzs.references), 'juz starts agree with alquran.cloud');
// One known difference: quarter 106 (hizb 27, second quarter). Quran.com (the King Fahd Complex
// QPC data, the same as our mushaf pages) starts it at 15:49 "نبئ عبادي"; alquran.cloud at 15:50.
const KNOWN = { 106: [[15, 49], [15, 50]] };
quarters.forEach((q, i) => {
  const r = meta.hizbQuarters.references[i];
  if (q[0] === r.surah && q[1] === r.ayah) return;
  const k = KNOWN[i + 1];
  assert(k && k[0][0] === q[0] && k[0][1] === q[1] && k[1][0] === r.surah && k[1][1] === r.ayah,
    `quarter ${i + 1}: Quran.com ${q.join(':')} vs alquran.cloud ${r.surah}:${r.ayah}`);
});

// Our own text (KFGQPC Hafs) prints ۞ at each quarter that does not start a surah: they must match.
const text = JSON.parse(await readFile(new URL('../public/data/quran-uthmani.json', import.meta.url), 'utf8')).surahs;
const marked = new Set();
text.forEach((su, s) => su.forEach((a, i) => { if (a.includes('\u06de')) marked.add(`${s + 1}:${i + 1}`); }));
const starts = new Set(quarters.map((q) => q.join(':')));
for (const k of marked) assert(starts.has(k), `۞ at ${k} is not a quarter start`);
for (const [s, a] of quarters) assert(a === 1 || marked.has(`${s}:${a}`), `quarter at ${s}:${a} has no ۞ in the text`);

await writeFile(OUT, JSON.stringify({
  source: 'Quran.com API v4 (juz_number, rub_el_hizb_number), checked against api.alquran.cloud/v1/meta and the ۞ marks in quran-uthmani.json',
  juz, quarters,
}) + '\n');
console.log('wrote divisions.json: 30 juz, 240 quarters');
