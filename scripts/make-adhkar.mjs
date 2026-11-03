// Builds public/data/adhkar.json: the morning and evening adhkar (Hisn al-Muslim, chapter 27, by
// Sa'id ibn Wahf al-Qahtani) for the adhkar session (src/ui/adhkar.ts).
//
// Nothing here is written by us:
// - Arabic of the hadith adhkar: hisnmuslim.com's text of the chapter, as published in
//   https://github.com/YousefAsalya/Islamic-Pro-azkar-API (data/ar.json, MIT). Only the book's own
//   instructions around a dhikr are taken off (the outer (( )), "(three times)", "[In the evening say: …]");
//   the count goes on the counter, the evening wording replaces the words the book says to replace.
// - English: the Darussalam translation of the book, as in @kazishariar/morning-evening-adhkar-data
//   1.0.3 (npm, CC BY 4.0).
// - Quran: our own bundled text (quran-uthmani.json, KFGQPC) and Saheeh International (en-sahih.json).
// - Counts: the book's (the "(seven times)" in the text wins over a wrong count field).
// - References: the book's citations, written short (collection + number).
//
// Usage: node scripts/make-adhkar.mjs HISN_AR.json KAZ_DATA.json
//   HISN_AR.json  = https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/data/ar.json
//   KAZ_DATA.json = data.json from `npm pack @kazishariar/morning-evening-adhkar-data@1.0.3`
import { readFileSync, writeFileSync } from 'node:fs';

const [hisnPath, kazPath] = process.argv.slice(2);
if (!hisnPath || !kazPath) { console.error('usage: node scripts/make-adhkar.mjs HISN_AR.json KAZ_DATA.json'); process.exit(1); }
const chapter = JSON.parse(readFileSync(hisnPath, 'utf8')).find((c) => c.id === 27);
if (!chapter || chapter.category !== 'أذكار الصباح والمساء' || chapter.array.length !== 24) throw new Error('chapter 27 not as expected');
const hisn = (i) => chapter.array[i - 1].text;
const kaz = Object.fromEntries(JSON.parse(readFileSync(kazPath, 'utf8')).data.map((x) => [Number(x.id.split('_')[1]), x]));
const quran = JSON.parse(readFileSync('public/data/quran-uthmani.json', 'utf8')).surahs;
const sahih = JSON.parse(readFileSync('public/data/en-sahih.json', 'utf8')).surahs;

const ISTIADHA = hisn(1).slice(0, hisn(1).indexOf('﴿')).trim();
const BASMALA = hisn(2).slice(0, hisn(2).indexOf('﴿')).trim();
const letters = (x) => x.replace(/[^\u0621-\u064A ]/g, '');
if (letters(ISTIADHA) !== 'أعوذ بالله من الشيطان الرجيم' || letters(BASMALA) !== 'بسم الله الرحمن الرحيم') throw new Error('openings');

/** The dhikr itself: what is inside (( )). */
const inner = (s) => {
  const a = s.indexOf('((');
  const b = s.lastIndexOf('))');
  if (a < 0 || b < a) throw new Error(`no (( )) in ${s.slice(0, 40)}`);
  return s.slice(a + 2, b).trim();
};
/** The book's evening wording(s) for a dhikr. */
const eveningNotes = (s) => [...s.matchAll(/\[\s*وإذا أمسى قال:\s*([^\]]+?)\s*\]/g)].map((m) => m[1].replace(/\.{2,}$|…$/, '').replace(/[.]$/, '').trim());
const COUNT_WORDS = [['ثلاث مرات', 3], ['أربع مرات', 4], ['سبع مرات', 7], ['عشر مرات', 10], ['مائة مرة', 100]];
/** The count the book writes after the dhikr (1 when none). */
const bookCount = (s) => {
  const after = s.slice(s.lastIndexOf('))') + 2).replace(/[^\u0621-\u064A ]/g, '').replace(/\s+/g, ' ');
  return COUNT_WORDS.find(([w]) => after.includes(w))?.[1] ?? 1;
};
// What the book says, checked by hand against the printed chapter.
const EXPECTED = { 3: 1, 4: 1, 5: 1, 6: 4, 7: 1, 8: 3, 9: 7, 10: 1, 11: 1, 12: 3, 13: 3, 14: 1, 15: 1, 16: 1, 17: 100, 18: 10, 19: 100, 20: 3, 21: 1, 22: 100, 23: 3, 24: 10 };
/** Replaces the first run of whole words in `text` that reads `from` (letters compared, so the
 * marks' order does not matter) by `to`. */
const swap = (text, from, to) => {
  const want = from.replace(/[^\u0621-\u064A]/g, '');
  const starts = [0, ...[...text.matchAll(/\s+/g)].map((m) => m.index + m[0].length)];
  for (const a of starts) {
    for (let b = a + 1; b <= text.length; b++) {
      const got = text.slice(a, b).replace(/[^\u0621-\u064A]/g, '');
      if (!want.startsWith(got)) break;
      if (got === want && (b === text.length || !/[\u0621-\u064A\u064B-\u0652\u0670]/.test(text[b]))) return text.slice(0, a) + to + text.slice(b);
    }
  }
  throw new Error(`not found: ${from}`);
};

const items = [];
const quranItem = (id, when, opening, s, a, b, ref, refAr, note) => {
  const ar = []; const en = [];
  for (let k = a; k <= b; k++) { ar.push(quran[s - 1][k - 1]); en.push(sahih[s - 1][k - 1]); }
  items.push({ id, when, count: when === 'm' && id === 'baqarah' ? 1 : (id === 'kursi' ? 1 : 3), quran: { s, a, b }, opening, ar: ar.join(' '), en: en.join(' '), ref, refAr, ...(note ? { note } : {}) });
};
quranItem('kursi', 'sm', ISTIADHA, 2, 255, 255, 'Al-Hakim 1/562; Sahih al-Targhib 1/273', 'الحاكم 1/562، صحيح الترغيب والترهيب 1/273');
quranItem('baqarah', 'm', ISTIADHA, 2, 285, 286, 'Al-Bukhari 5009; Muslim 807', 'البخاري 5009، مسلم 807', 'night');
quranItem('ikhlas', 'sm', BASMALA, 112, 1, 4, 'Abu Dawud 5082; At-Tirmidhi 3575', 'أبو داود 5082، الترمذي 3575');
quranItem('falaq', 'sm', BASMALA, 113, 1, 5, 'Abu Dawud 5082; At-Tirmidhi 3575', 'أبو داود 5082، الترمذي 3575');
quranItem('nas', 'sm', BASMALA, 114, 1, 6, 'Abu Dawud 5082; At-Tirmidhi 3575', 'أبو داود 5082، الترمذي 3575');
if (!letters(hisn(2)).includes('ثلاث مرات') || /مر/.test(hisn(1).slice(hisn(1).indexOf('﴾')))) throw new Error('quran counts');

// Hadith adhkar: [book number, when, english (morning), english (evening), reference, Arabic reference,
// evening: how the book's evening wording goes in ('whole' or the morning words it replaces, in order)].
const HADITH = [
  [3, 'sm', 7, 8, 'Muslim 2723', 'مسلم 2723', ['أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ', 'رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيرَ مَا بَعْدَهُ ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي  هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ']],
  [4, 'sm', 9, 10, 'At-Tirmidhi 3391', 'الترمذي 3391', 'whole'],
  [5, 'sm', 11, 11, 'Al-Bukhari 6306', 'البخاري 6306'],
  [6, 'sm', 12, 13, 'Abu Dawud 5069 (hasan, Ibn Baz)', 'أبو داود 5069، وحسّنه ابن باز', ['اللَّهُمَّ إِنِّي أَصْبَحْتُ']],
  [7, 'sm', 14, 15, 'Abu Dawud 5073 (hasan, Ibn Baz)', 'أبو داود 5073، وحسّنه ابن باز', ['اللَّهُمَّ مَا أَصْبَحَ بِي']],
  [8, 'sm', 16, 16, 'Abu Dawud 5090 (hasan, Ibn Baz)', 'أبو داود 5090، وحسّنه ابن باز'],
  [9, 'sm', 17, 17, 'Abu Dawud 5081; Ibn as-Sunni 71', 'أبو داود 5081، ابن السني 71'],
  [10, 'sm', 18, 18, 'Abu Dawud 5074; Ibn Majah 3871', 'أبو داود 5074، ابن ماجه 3871'],
  [11, 'sm', 19, 19, 'At-Tirmidhi 3392; Abu Dawud 5067', 'الترمذي 3392، أبو داود 5067'],
  [12, 'sm', 20, 20, 'Abu Dawud 5088; At-Tirmidhi 3388', 'أبو داود 5088، الترمذي 3388'],
  [13, 'sm', 21, 21, 'At-Tirmidhi 3389; Ahmad 18967', 'الترمذي 3389، أحمد 18967'],
  [14, 'sm', 22, 22, 'Al-Hakim 1/545; Sahih al-Targhib 1/273', 'الحاكم 1/545، صحيح الترغيب والترهيب 1/273'],
  [15, 'sm', 23, 24, 'Abu Dawud 5084 (hasan)', 'أبو داود 5084، وإسناده حسن', 'whole'],
  [16, 'sm', 25, 26, 'Ahmad 15360; Ibn as-Sunni 34', 'أحمد 15360، ابن السني 34', ['أَصْبَحْنا عَلَى فِطْرَةِ الْإِسْلاَمِ']],
  [17, 'sm', 34, 34, 'Muslim 2692', 'مسلم 2692'],
  [18, 'sm', 28, 28, "An-Nasa'i, 'Amal al-Yawm wal-Laylah 24; Abu Dawud 5077", 'النسائي في عمل اليوم والليلة 24، أبو داود 5077'],
  [19, 's', 32, 32, 'Al-Bukhari 3293; Muslim 2691', 'البخاري 3293، مسلم 2691'],
  [20, 's', 31, 31, 'Muslim 2726', 'مسلم 2726'],
  [21, 's', 27, 27, 'Ibn Majah 925 (hasan)', 'ابن ماجه 925، وإسناده حسن'],
  [22, 's', 33, 33, 'Al-Bukhari 6307; Muslim 2702', 'البخاري 6307، مسلم 2702'],
  [23, 'm', 30, 30, "Ahmad 2/290; An-Nasa'i, 'Amal al-Yawm wal-Laylah 590", 'أحمد 2/290، النسائي في عمل اليوم والليلة 590'],
  [24, 'sm', 29, 29, 'At-Tabarani; Sahih al-Targhib 656', 'الطبراني، صحيح الترغيب والترهيب 656'],
];
const cleanEn = (s) => s.replace(/\s+/g, ' ').trim();
for (const [n, when, enS, enM, ref, refAr, evening] of HADITH) {
  const raw = hisn(n);
  const ar = inner(raw);
  const count = bookCount(raw);
  if (count !== EXPECTED[n]) throw new Error(`count of ${n}: ${count}`);
  const item = { id: `h${n}`, when, count, ar, en: cleanEn(kaz[enS].english), ref, refAr };
  if (n === 18) item.note = 'lazy';
  if (n === 22) item.note = 'day';
  if (evening) {
    const notes = eveningNotes(raw);
    if (evening === 'whole') {
      if (notes.length !== 1) throw new Error(`evening ${n}`);
      item.arM = notes[0];
    } else {
      if (notes.length !== evening.length) throw new Error(`evening ${n}: ${notes.length}`);
      let m = ar;
      evening.forEach((from, k) => { m = swap(m, from, notes[k]); });
      item.arM = m;
    }
    item.enM = cleanEn(kaz[enM].english);
  } else if (eveningNotes(raw).length) throw new Error(`unused evening wording in ${n}`);
  items.push(item);
}

// Order: as in the book (Quran first), the evening-only ones where the book has them.
const order = ['kursi', 'baqarah', 'ikhlas', 'falaq', 'nas', ...HADITH.map(([n]) => `h${n}`)];
items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
for (const it of items) if (!it.ar || !it.en || !(it.count >= 1)) throw new Error(`incomplete ${it.id}`);

const out = {
  source: "Hisn al-Muslim (Sa'id ibn Wahf al-Qahtani), chapter 27: morning and evening. Arabic: hisnmuslim.com via github.com/YousefAsalya/Islamic-Pro-azkar-API (MIT). English: Darussalam translation via @kazishariar/morning-evening-adhkar-data (CC BY 4.0). Quran: KFGQPC Uthmani Hafs (Quran.com) and Saheeh International. Built by scripts/make-adhkar.mjs.",
  items,
};
writeFileSync('public/data/adhkar.json', JSON.stringify(out));
const s = items.filter((x) => x.when.includes('s'));
const m = items.filter((x) => x.when.includes('m'));
console.log(`adhkar.json: ${items.length} items; morning ${s.length} (${s.reduce((a, x) => a + x.count, 0)} times), evening ${m.length} (${m.reduce((a, x) => a + x.count, 0)} times)`);
