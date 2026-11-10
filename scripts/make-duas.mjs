// Builds public/data/duas.json: the du'a moments through the day (Hisn al-Muslim, by Sa'id ibn Wahf
// al-Qahtani): on waking (ch. 1), on hearing the adhan (ch. 15), after the salam of the prayer (ch. 25)
// and before sleeping (ch. 28), for the du'a sessions (src/ui/adhkar.ts) and the moments of the day.
//
// Nothing here is written by us:
// - Arabic: hisnmuslim.com's text, as published in https://github.com/YousefAsalya/Islamic-Pro-azkar-API
//   (data/ar.json, MIT). Only the book's own marks around a du'a are taken off (the outer (( )), "(three
//   times)"); where the book joins dhikr said a different number of times (e.g. 33 + 33 + 33 + 1), each
//   is its own step, cut at the book's own commas.
// - English: the same repository's data/en.json (the Darussalam translation of the book). Each English
//   text below is checked to appear in it word for word; the book's word notes appended to it
//   ("al-waseelah: …") are kept apart as `gloss`. One typo fixed: "salve" → "slave".
// - Quran: our own bundled text (quran-uthmani.json, KFGQPC) and Saheeh International (en-sahih.json).
// - Counts: the book's (checked by hand against the printed chapters).
// - References: the book's citations, written short (collection + number).
//
// Usage: node scripts/make-duas.mjs HISN_AR.json HISN_EN.json
//   HISN_AR.json = https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/data/ar.json
//   HISN_EN.json = https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/data/en.json
import { readFileSync, writeFileSync } from 'node:fs';

const [arPath, enPath] = process.argv.slice(2);
if (!arPath || !enPath) { console.error('usage: node scripts/make-duas.mjs HISN_AR.json HISN_EN.json'); process.exit(1); }
const AR = JSON.parse(readFileSync(arPath, 'utf8'));
const EN = JSON.parse(readFileSync(enPath, 'utf8'));
const CHAPTERS = { 1: ['أذكار الاستيقاظ من النوم', 4], 15: ['أذكار الآذان', 5], 25: ['الأذكار بعد السلام من الصلاة', 8], 28: ['أذكار النوم', 13] };
for (const [c, [name, n]] of Object.entries(CHAPTERS)) {
  const a = AR.find((x) => x.id === Number(c));
  const e = EN.find((x) => x.id === Number(c));
  if (!a || a.category !== name || a.array.length !== n || !e || e.array.length !== n) throw new Error(`chapter ${c} not as expected`);
}
const ar = (c, i) => AR.find((x) => x.id === c).array[i - 1].text;
const enSrc = (c, i) => EN.find((x) => x.id === c).array[i - 1].text;
const quran = JSON.parse(readFileSync('public/data/quran-uthmani.json', 'utf8')).surahs;
const sahih = JSON.parse(readFileSync('public/data/en-sahih.json', 'utf8')).surahs;

const BASMALA = 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ';
const letters = (x) => x.replace(/[^ء-ي]/g, '');
if (!ar(25, 5).startsWith('بسم الله الرحمن الرحيم')) throw new Error('basmala');

/** What is inside the book's (( )) (chapter 1 uses single ( )); `k` picks the k-th pair. */
const inner = (s, k = 0) => {
  const pairs = [...s.matchAll(/\(\((.+?)\)\)(?!\))/gs)].map((m) => m[1].trim());
  if (pairs.length) { if (!pairs[k]) throw new Error(`no pair ${k} in ${s.slice(0, 40)}`); return pairs[k]; }
  const m = s.match(/^\s*\(\s*(.+?)\s*\)\.?\s*$/s);
  if (!m) throw new Error(`no ( ) in ${s.slice(0, 40)}`);
  return m[1].trim();
};
/** Letters with their marks, the marks in a fixed order (sources differ in the order they type them). */
const clusters = (s) => [...s.matchAll(/.[\u064B-\u0652\u0670]*/gsu)].map((m) => m[0]);
const canon = (c) => c[0] + [...c.slice(1)].sort().join('');
/** A part of `text` cut at whole words, returned exactly as the book writes it. */
const part = (text, piece) => {
  const t = clusters(text), p = clusters(piece).map(canon);
  for (let i = 0; i + p.length <= t.length; i++) {
    if (!p.every((c, k) => canon(t[i + k]) === c)) continue;
    const before = t[i - 1], after = t[i + p.length];
    if ((before && /[\u0621-\u064A]/.test(before[0])) || (after && /[\u0621-\u064A]/.test(after[0]))) continue;
    return t.slice(i, i + p.length).join('');
  }
  throw new Error(`not in the text at a word boundary: ${piece}`);
};
const norm = (s) => s.replace(/\s+/g, ' ').replace(/([.)])(?=[A-Z(‘])/g, '$1 ').replace(/\bsalve\b/g, 'slave').trim();
/** English given here, checked to be in the book's English word for word (spaces aside). */
const en = (c, i, text) => {
  if (!norm(enSrc(c, i)).includes(norm(text))) throw new Error(`English not found in ${c}:${i}: ${text.slice(0, 50)}`);
  return norm(text);
};
const verse = (s, a, b) => {
  const arr = []; const e = [];
  for (let k = a; k <= b; k++) { arr.push(quran[s - 1][k - 1]); e.push(sahih[s - 1][k - 1]); }
  return { quran: { s, a, b }, ar: arr.join(' '), en: e.join(' ') };
};
// The Quran in the book's text must be the same ayat as ours (letters only, the book's spelling differs a little).
const sameAyat = (bookText, s, a, b) => {
  const want = letters(verse(s, a, b).ar.replace(/[٠-٩۰-۹]/g, ''));
  const got = letters(bookText);
  const strip = (x) => x.replace(/[اىيوأإآؤئءةل]/g, '');
  if (!strip(got).includes(strip(want).slice(0, 30))) throw new Error(`book Quran differs at ${s}:${a}`);
};

const moments = { wake: [], adhan: [], salah: [], sleep: [] };
const add = (m, item) => {
  if (!item.ar || !item.en || !(item.count >= 1) || !item.ref || !item.refAr) throw new Error(`incomplete ${item.id}`);
  if (Object.values(moments).some((l) => l.some((x) => x.id === item.id))) throw new Error(`duplicate ${item.id}`);
  moments[m].push(item);
};

// --- On waking (chapter 1) ---
add('wake', { id: 'w1', count: 1, ar: inner(ar(1, 1)), en: en(1, 1, 'All praise is for Allah who gave us life after having taken it from us and unto Him is the resurrection.'), ref: 'Al-Bukhari 6312; Muslim 2711', refAr: 'البخاري 6312، مسلم 2711' });
add('wake', { id: 'w2', count: 1, ar: inner(ar(1, 2)), en: en(1, 2, 'None has the right to be worshipped except Allah, alone without associate, to Him belongs sovereignty and praise and He is over all things wholly capable. How perfect Allah is, and all praise is for Allah, and none has the right to be worshipped except Allah, Allah is the greatest and there is no power nor might except with Allah, The Most High, The Supreme. O my Lord forgive me'), ref: 'Al-Bukhari 1154', refAr: 'البخاري 1154' });
add('wake', { id: 'w3', count: 1, ar: inner(ar(1, 3)), en: en(1, 3, 'All praise is for Allah who restored to me my health and returned my soul and has allowed me to remember Him.'), ref: 'At-Tirmidhi 3401', refAr: 'الترمذي 3401' });
sameAyat(ar(1, 4), 3, 190, 200);
add('wake', { id: 'w4', count: 1, ...verse(3, 190, 200), note: 'wakeNight', ref: 'Al-Bukhari 4569; Muslim 763', refAr: 'البخاري 4569، مسلم 763' });

// --- On hearing the adhan (chapter 15). Items 1, 3 and 5 are things to do, written as the book writes them. ---
add('adhan', { id: 'a1', act: true, count: 1, ar: ar(15, 1).trim(), en: en(15, 1, "‘One repeats just as the mu-aththin (one who calls to prayer) says, except when he says: Hayya AAalas-salah (or) hayya AAalal-falah ‘come to prayer, come to success’ instead, one should say: La hawla wala quwwata illa billah. ‘There is no might nor power except with Allah.’"), ref: 'Al-Bukhari 611; Muslim 385', refAr: 'البخاري 611، مسلم 385' });
add('adhan', { id: 'a2', count: 1, ar: inner(ar(15, 2), 0), arNote: inner(ar(15, 2), 1), en: en(15, 2, '‘And I too bear witness that none has the right to be worshipped except Allah, alone, without partner, and that Muhammad is His slave and Messenger. I am pleased with Allah as a Lord, and Muhammad as a Messenger and Islam as a religion.’'), enNote: en(15, 2, 'Immediately following the declaration of faith called by the mu-aththin, one says:'), ref: 'Muslim 386', refAr: 'مسلم 386' });
add('adhan', { id: 'a3', act: true, count: 1, ar: inner(ar(15, 3)), en: en(15, 3, "‘One should then send prayers on the Prophet (sal-Allaahu 'alayhe wa sallam) after answering the call of the mu.adhdhin’."), ref: 'Muslim 384', refAr: 'مسلم 384' });
add('adhan', { id: 'a4', count: 1, ar: inner(ar(15, 4)), en: en(15, 4, '‘O Allah, Owner of this perfect call and Owner of this prayer to be performed, bestow upon Muhammad al-waseelah and al-fadeelah and send him upon a praised platform which You have promised him. Verily, You never fail in Your promise.’'),
  gloss: [en(15, 4, 'al-waseelah: A station in paradise.'), en(15, 4, 'al-fadeelah: A rank above the rest of creation.'), en(15, 4, 'praised platform: One in which all of creation will praise him on, in order to bring about the account quickly and be relieved from the lengthy standing or the role of intercession.')],
  ref: 'Al-Bukhari 614; the words in [ ]: Al-Bayhaqi 1/410', refAr: 'البخاري 614، وما بين المعقوفين: البيهقي 1/410' });
add('adhan', { id: 'a5', act: true, count: 1, ar: inner(ar(15, 5)), en: en(15, 5, 'One should also supplicate for himself during the time between the athan and the iqamah as supplication at such time is not rejected.'), ref: 'At-Tirmidhi 212; Abu Dawud 521', refAr: 'الترمذي 212، أبو داود 521' });

// --- After the salam (chapter 25). `prayers`: only after these; `countBy`: a count per prayer. ---
const s1 = inner(ar(25, 1));
add('salah', { id: 's1a', count: 3, ar: part(s1, 'أَسْتَغْفِرُ اللَّهَ'), en: en(25, 1, 'I ask Allah for forgiveness.'), ref: 'Muslim 591', refAr: 'مسلم 591' });
add('salah', { id: 's1b', count: 1, ar: part(s1, 'اللَّهُمَّ أَنْتَ السَّلاَمُ، وَمِنْكَ السَّلاَمُ، تَبَارَكْتَ يَا ذَا الْجَلاَلِ وَالْإِكْرَامِ'), en: en(25, 1, 'O Allah, You are As-Salam and from You is all peace, blessed are You, O Possessor of majesty and honour.'),
  gloss: [en(25, 1, 'AS-Salam: The One Who is free from all defects and deficiencies.')], ref: 'Muslim 591', refAr: 'مسلم 591' });
// The book marks "[three times]" in square brackets (another narration); the Darussalam English and
// al-Bukhari's narration have it once, so the counter asks once and the text keeps the book's mark.
add('salah', { id: 's2', count: 1, ar: inner(ar(25, 2)), en: en(25, 2, 'None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise and He is over all things omnipotent. O Allah, none can prevent what You have willed to bestow and none can bestow what You have willed to prevent, and no wealth or majesty can benefit anyone, as from You is all wealth and majesty.'), ref: 'Al-Bukhari 844; Muslim 593', refAr: 'البخاري 844، مسلم 593' });
add('salah', { id: 's3', count: 1, ar: inner(ar(25, 3)), en: en(25, 3, 'None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise and He is over all things omnipotent. There is no might nor power except with Allah, none has the right to be worshipped except Allah and we worship none except Him. For Him is all favour, grace, and glorious praise. None has the right to be worshipped except Allah and we are sincere in faith and devotion to Him although the disbelievers detest it.'), ref: 'Muslim 594', refAr: 'مسلم 594' });
const s4 = inner(ar(25, 4));
if (!letters(s4).includes('ثلاثاوثلاثين')) throw new Error('33');
const S4 = { ref: 'Muslim 597', refAr: 'مسلم 597', beads: true };
add('salah', { id: 's4a', count: 33, ar: part(s4, 'سُبْحَانَ اللَّهِ'), en: en(25, 4, 'How perfect Allah is'), ...S4 });
add('salah', { id: 's4b', count: 33, ar: part(s4, 'وَالْحَمْدُ لِلَّهِ'), en: en(25, 4, 'all praise is for Allah'), ...S4 });
add('salah', { id: 's4c', count: 33, ar: part(s4, 'وَاللَّهُ أَكْبَرُ'), en: en(25, 4, 'and Allah is the greatest.'), ...S4 });
add('salah', { id: 's4d', count: 1, ar: part(s4, 'لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ'), en: en(25, 4, 'None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise and He is over all things omnipotent.'), note: 'hundred', ...S4, beads: undefined });
const QULS = { opening: BASMALA, count: 1, countBy: { fajr: 3, maghrib: 3 }, note: 'quls', enNote: en(25, 5, "The following three Soorahs should be recited once after Zuhr, 'Asr and 'Ishaa prayers and thrice after the Fajr and Maghrib prayers."), ref: "Abu Dawud 1523; At-Tirmidhi 2903; An-Nasa'i 1336", refAr: 'أبو داود 1523، الترمذي 2903، النسائي 1336' };
sameAyat(ar(25, 5), 112, 1, 4); sameAyat(ar(25, 5), 113, 1, 5); sameAyat(ar(25, 5), 114, 1, 6);
add('salah', { id: 's5a', ...verse(112, 1, 4), ...QULS });
add('salah', { id: 's5b', ...verse(113, 1, 5), ...QULS });
add('salah', { id: 's5c', ...verse(114, 1, 6), ...QULS });
sameAyat(ar(25, 6), 2, 255, 255);
add('salah', { id: 's6', count: 1, ...verse(2, 255, 255), ref: "An-Nasa'i, 'Amal al-Yawm wal-Laylah 100; Ibn as-Sunni 121", refAr: 'النسائي في عمل اليوم والليلة 100، ابن السني 121' });
if (!letters(ar(25, 7)).includes('عشرمراتبعدصلاةالمغربوالصبح')) throw new Error('s7');
add('salah', { id: 's7', count: 10, prayers: ['fajr', 'maghrib'], ar: inner(ar(25, 7)), en: en(25, 7, 'None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise, He gives life and causes death and He is over all things omnipotent.'), ref: 'At-Tirmidhi 3474; Ahmad 4/227', refAr: 'الترمذي 3474، أحمد 4/227' });
if (!letters(ar(25, 8)).includes('صلاةالفجر')) throw new Error('s8');
add('salah', { id: 's8', count: 1, prayers: ['fajr'], ar: inner(ar(25, 8)), en: en(25, 8, 'O Allah, I ask You for knowledge which is beneficial and sustenance which is good, and deeds which are acceptable.'), ref: 'Ibn Majah 925', refAr: 'ابن ماجه 925' });

// --- Before sleeping (chapter 28) ---
const z1 = { opening: BASMALA, count: 3, note: 'blow', enNote: en(28, 1, 'When retiring to his bed every night, the Prophet would hold his palms together, spit (A form of spitting comprising mainly of air with little spittle) in them, recite the last three chapters (Al-Ikhlas, Al-Falaq, An-Nas) of the Quran and then wipe over his entire body as much as possible with his hands, beginning with his head and face and then all parts of the body, he would do this three times.'), ref: 'Al-Bukhari 5017; Muslim 2192', refAr: 'البخاري 5017، مسلم 2192' };
if (!letters(ar(28, 1)).includes('ثلاثمرات')) throw new Error('z1');
sameAyat(ar(28, 1), 112, 1, 4); sameAyat(ar(28, 1), 113, 1, 5); sameAyat(ar(28, 1), 114, 1, 6);
add('sleep', { id: 'z1a', ...verse(112, 1, 4), ...z1 });
add('sleep', { id: 'z1b', ...verse(113, 1, 5), ...z1 });
add('sleep', { id: 'z1c', ...verse(114, 1, 6), ...z1 });
sameAyat(ar(28, 2), 2, 255, 255);
add('sleep', { id: 'z2', count: 1, ...verse(2, 255, 255), ref: 'Al-Bukhari 2311', refAr: 'البخاري 2311' });
sameAyat(ar(28, 3), 2, 285, 286);
add('sleep', { id: 'z3', count: 1, ...verse(2, 285, 286), ref: 'Al-Bukhari 5009; Muslim 807', refAr: 'البخاري 5009، مسلم 807' });
add('sleep', { id: 'z4', count: 1, ar: inner(ar(28, 4)), en: en(28, 4, 'In Your name my Lord, I lie down and in Your name I rise, so if You should take my soul then have mercy upon it, and if You should return my soul then protect it in the manner You do so with Your righteous servants.'), ref: 'Al-Bukhari 6320; Muslim 2714', refAr: 'البخاري 6320، مسلم 2714' });
add('sleep', { id: 'z5', count: 1, ar: inner(ar(28, 5)), en: en(28, 5, 'O Allah, verily You have created my soul and You shall take it’s life, to You belongs it’s life and death. If You should keep my soul alive then protect it, and if You should take it’s life then forgive it. O Allah, I ask You to grant me good health.'), ref: 'Muslim 2712', refAr: 'مسلم 2712' });
add('sleep', { id: 'z6', count: 1, ar: inner(ar(28, 6)), en: en(28, 6, 'O Allah, protect me from Your punishment on the day Your servants are resurrected.'), ref: 'Abu Dawud 5045; At-Tirmidhi 3398', refAr: 'أبو داود 5045، الترمذي 3398' });
add('sleep', { id: 'z7', count: 1, ar: inner(ar(28, 7)), en: en(28, 7, 'In Your name O Allah, I live and die.'), ref: 'Al-Bukhari 6324; Muslim 2711', refAr: 'البخاري 6324، مسلم 2711' });
const z8 = inner(ar(28, 8));
if (!letters(z8).includes('أربعاوثلاثين')) throw new Error('34');
const Z8 = { ref: 'Al-Bukhari 3705; Muslim 2727', refAr: 'البخاري 3705، مسلم 2727', beads: true };
add('sleep', { id: 'z8a', count: 33, ar: part(z8, 'سُبْحَانَ اللَّهِ'), en: en(28, 8, 'How Perfect Allah is.'), ...Z8 });
add('sleep', { id: 'z8b', count: 33, ar: part(z8, 'وَالْحَمْدُ لِلَّهِ'), en: en(28, 8, 'All praise is for Allah.'), ...Z8 });
add('sleep', { id: 'z8c', count: 34, ar: part(z8, 'وَاللَّهُ أَكْبَرُ'), en: en(28, 8, 'Allah is the greatest.'), ...Z8 });
add('sleep', { id: 'z9', count: 1, ar: inner(ar(28, 9)), en: en(28, 9, 'O Allah, Lord of the seven heavens and the exalted throne, our Lord and Lord of all things, Splitter of the seed and the date stone, Revealer of the Tawrah, the Injeel and the Furqan, I take refuge in You from the evil of all things You shall seize by the forelock (i.e. You have total mastery over). O Allah, You are The First so there is nothing before You and You are The Last so there is nothing after You. You are Aththahir so there is nothing above You and You are Al-Batin so there is nothing closer than You. Settle our debt for us and spare us from poverty.'),
  gloss: [en(28, 9, 'Tawrah: The book revealed to Moosa u.').replace(/ u\.$/, '.'), en(28, 9, 'Injeel: The book revealed to Easa u.').replace(/ u\.$/, '.'), en(28, 9, 'Furqan: One of the many names of the Quran, means: The Criterion which distinguishes between truth and falsehood.'),
    en(28, 9, 'Aththahir: Indicates the greatness of His attributes and the insignificance of every single creation in respect to His greatness and Highness, for He is above all of His creation as regards His essence and attributes.'),
    en(28, 9, 'Al-Batin: Indicates His awareness and knowledge of all secrets, of that which is in the hearts and the most intimate of things just as it indicates His closeness and nearness to all in a manner which befits His majesty.')],
  ref: 'Muslim 2713', refAr: 'مسلم 2713' });
add('sleep', { id: 'z10', count: 1, ar: inner(ar(28, 10)), en: en(28, 10, 'All praise is for Allah, Who fed us and gave us drink, and Who is sufficient for us and has sheltered us, for how many have none to suffice them or shelter them.'), ref: 'Muslim 2715', refAr: 'مسلم 2715' });
add('sleep', { id: 'z11', count: 1, ar: inner(ar(28, 11)), en: en(28, 11, 'O Allah, Knower of the seen and the unseen, Creator of the heavens and the earth, Lord and Sovereign of all things I bear witness that none has the right to be worshipped except You. I take refuge in You from the evil of my soul and from the evil and shirk of the devil, and from committing wrong against my soul or bringing such upon another Muslim.'),
  gloss: [en(28, 11, 'shirk: to associate others with Allah in those things which are specific to Him. This can occur in (1) belief, e.g. to believe that other than Allah has the power to benefit or harm, (2) speech, e.g. to swear by other than Allah and (3) action, e.g. to bow or prostrate to other than Allah.')],
  ref: 'Abu Dawud 5067; At-Tirmidhi 3392', refAr: 'أبو داود 5067، الترمذي 3392' });
add('sleep', { id: 'z12', act: true, count: 1, read: [32, 67], ar: inner(ar(28, 12)), en: en(28, 12, 'The Prophet never used to sleep until he had recited Soorat As-Sajdah (chapter 32) and Soorat Al-Mulk (chapter 67).'), ref: "At-Tirmidhi 2892; An-Nasa'i, 'Amal al-Yawm wal-Laylah 707", refAr: 'الترمذي 2892، النسائي في عمل اليوم والليلة 707' });
add('sleep', { id: 'z13', count: 1, ar: inner(ar(28, 13)), en: en(28, 13, 'O Allah, I submit my soul unto You, and I entrust my affair unto You, and I turn my face towards You, and I totally rely on You, in hope and fear of You. Verily there is no refuge nor safe haven from You except with You. I believe in Your Book which You have revealed and in Your Prophet whom You have sent.'),
  enNote: en(28, 13, 'If you then die, you will die upon the fitrah.'), gloss: [en(28, 13, 'fitrah: the religion of Islam, the way of Ibraheem u.').replace(/ u\.$/, '.')],
  ref: 'Al-Bukhari 6313; Muslim 2710', refAr: 'البخاري 6313، مسلم 2710' });

for (const l of Object.values(moments)) for (const it of l) for (const k of Object.keys(it)) if (it[k] === undefined) delete it[k];
const out = {
  source: "Hisn al-Muslim (Sa'id ibn Wahf al-Qahtani), chapters 1 (waking), 15 (the adhan), 25 (after the salam) and 28 (sleeping). Arabic: hisnmuslim.com and English (Darussalam) via github.com/YousefAsalya/Islamic-Pro-azkar-API (MIT). Quran: KFGQPC Uthmani Hafs (Quran.com) and Saheeh International. Built by scripts/make-duas.mjs.",
  moments,
};
writeFileSync('public/data/duas.json', JSON.stringify(out));
console.log(`duas.json: ${Object.entries(moments).map(([k, l]) => `${k} ${l.length}`).join(', ')}`);
