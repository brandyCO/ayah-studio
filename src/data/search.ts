// Finding things in the Quran: references typed as text ("2:255", "juz 5", "page 50", "hizb 3")
// and words — Arabic (without harakat, any alif/hamza form) or the chosen translation. The text is only
// read here, never changed: a match is reported as the words (Arabic) or the range (translation) to mark.
import { loadMeta, surahText, surahTranslation, type SurahMeta } from './quran';
import { fold, findFolded } from './reflections';
import { currentTranslation } from './translations';

const base = import.meta.env.BASE_URL;

export interface Divisions {
  /** [surah, ayah] where each of the 30 juz starts. */
  juz: [number, number][];
  /** [surah, ayah] where each of the 240 quarters (rub' al-hizb) starts; 4 per hizb, 8 per juz. */
  quarters: [number, number][];
}

let divisions: Promise<Divisions> | null = null;
/** public/data/divisions.json (scripts/fetch-divisions.mjs). */
export function loadDivisions(): Promise<Divisions> {
  divisions ??= fetch(`${base}data/divisions.json?v=${__DATA_VERSION__}`).then((r) => {
    if (!r.ok) throw new Error(`Could not load juz data (HTTP ${r.status})`);
    return r.json() as Promise<Divisions>;
  });
  divisions.catch(() => (divisions = null));
  return divisions;
}

/** The juz (1–30) and quarter (1–240) that surah:ayah falls in. */
export function divisionOf(d: Divisions, s: number, a: number): { juz: number; quarter: number } {
  const at = (list: [number, number][]) => {
    let i = 0;
    while (i + 1 < list.length && (list[i + 1][0] < s || (list[i + 1][0] === s && list[i + 1][1] <= a))) i++;
    return i + 1;
  };
  return { juz: at(d.juz), quarter: at(d.quarters) };
}

// --- Arabic folding: letters only, so "الرحمن", "ٱلرَّحۡمَٰنِ" and "الرحمان" meet ---
const ARABIC = /[؀-ۿ]/;
export const isArabic = (q: string) => ARABIC.test(q);

/** Two foldings of an Arabic word: dagger alif dropped (الرحمن) and written out (الكتاب). */
function foldAr(w: string, dagger: '' | 'ا'): string {
  return w
    .replace(/ٰ/g, dagger)
    .normalize('NFD')
    .replace(/[\p{M}ـۥۦ۞۩٠-٩۰-۹]/gu, '') // marks, tatweel, small waw/yeh, ۞ ۩, numbers
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}
/** The query's folding (the user's own spelling; harakat allowed). */
export const foldQuery = (q: string) => foldAr(q, '').replace(/\s+/g, ' ').trim();

interface ArabicIndex {
  /** Per surah, per ayah: the words, and the two folded forms joined with spaces + word start offsets. */
  ayat: { words: string[]; forms: { text: string; starts: number[] }[] }[][];
}
let arIndex: Promise<ArabicIndex> | null = null;
function arabicIndex(meta: SurahMeta[]): Promise<ArabicIndex> {
  arIndex ??= Promise.all(meta.map((m) => surahText(m.n))).then((surahs) => ({
    ayat: surahs.map((ayat) => ayat.map((text) => {
      const words = text.split(' ');
      const forms = (['', 'ا'] as const).map((d) => {
        const starts: number[] = [];
        let joined = '';
        for (const w of words) {
          if (joined) joined += ' ';
          starts.push(joined.length);
          joined += foldAr(w, d);
        }
        return { text: joined, starts };
      });
      return { words, forms };
    })),
  }));
  arIndex.catch(() => (arIndex = null));
  return arIndex;
}

export interface AyahHit {
  s: number;
  a: number;
  /** Arabic hit: indices of the matching words (the ayah's own words, split at spaces). */
  words?: Set<number>;
  /** Translation hit: [start, end) in the translation text. */
  range?: [number, number];
}

export const MIN_QUERY = 2;

/** Every ayah whose Arabic contains `q` (letters only; across word breaks too). */
export async function searchArabic(q: string): Promise<AyahHit[]> {
  const fq = foldQuery(q);
  if (fq.replace(/ /g, '').length < MIN_QUERY) return [];
  const meta = await loadMeta();
  const idx = await arabicIndex(meta);
  const hits: AyahHit[] = [];
  idx.ayat.forEach((ayat, si) => ayat.forEach((ay, ai) => {
    for (const f of ay.forms) {
      const k = f.text.indexOf(fq);
      if (k < 0) continue;
      const words = new Set<number>();
      // Mark every word the match touches (whole words only: the text is never split inside a word).
      let from = k;
      while (from >= 0) {
        const end = from + fq.length;
        f.starts.forEach((st, wi) => {
          const wEnd = wi + 1 < f.starts.length ? f.starts[wi + 1] - 1 : f.text.length;
          if (st < end && wEnd > from) words.add(wi);
        });
        from = f.text.indexOf(fq, from + 1);
      }
      hits.push({ s: si + 1, a: ai + 1, words });
      break;
    }
  }));
  return hits;
}

/** Every ayah whose translation (the chosen one) contains `q` (case and accents ignored). */
export async function searchTranslation(q: string, id = currentTranslation()): Promise<{ hits: AyahHit[]; texts: Map<string, string> }> {
  const fq = fold(q.trim());
  const texts = new Map<string, string>();
  if (fq.length < 3) return { hits: [], texts };
  const meta = await loadMeta();
  const surahs = await Promise.all(meta.map((m) => surahTranslation(m.n, id)));
  const hits: AyahHit[] = [];
  surahs.forEach((ayat, si) => ayat.forEach((text, ai) => {
    const r = findFolded(text, fq);
    if (!r) return;
    hits.push({ s: si + 1, a: ai + 1, range: r });
    texts.set(`${si + 1}:${ai + 1}`, text);
  }));
  return { hits, texts };
}

// --- references typed as text ---
export type Jump =
  | { kind: 'ayah'; s: number; a: number }
  | { kind: 'juz'; n: number }
  | { kind: 'hizb'; n: number }
  | { kind: 'page'; n: number };

const digits = (q: string) => q.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** Loose surah-name matching so "baqarah", "Al Baqara" and "البقرة" all find Al-Baqara. */
export const normName = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, '').replace(/aa/g, 'a').replace(/ii|ee/g, 'i').replace(/uu|oo/g, 'u').replace(/ah$/, 'a');
const normArName = (s: string) => foldQuery(s).replace(/^سوره /, '').replace(/^ال/, '').replace(/ /g, '');

/** Surahs whose name matches `q` (number, English, meaning or Arabic). */
export function matchSurahs(meta: SurahMeta[], q: string): SurahMeta[] {
  const t = digits(q.trim());
  if (!t) return meta;
  if (/^\d+$/.test(t)) return meta.filter((s) => String(s.n) === t);
  if (isArabic(t)) {
    const qa = normArName(t);
    return qa ? meta.filter((s) => normArName(s.ar).includes(qa)) : [];
  }
  const qn = normName(t);
  return qn ? meta.filter((s) => normName(s.en).includes(qn) || normName(s.tr).includes(qn)) : [];
}

/** Where a typed reference leads: "2:255", "2 255", "baqara 255", "juz 5", "hizb 3", "page 50". */
export function parseJump(meta: SurahMeta[], q: string): Jump | null {
  const t = digits(q.trim().toLowerCase()).replace(/\s+/g, ' ');
  let m = /^(?:juz'?|juzz|para|parah|جزء|الجزء|ج) ?(\d{1,2})$/.exec(t);
  if (m) return +m[1] >= 1 && +m[1] <= 30 ? { kind: 'juz', n: +m[1] } : null;
  m = /^(?:hizb|حزب|الحزب) ?(\d{1,2})$/.exec(t);
  if (m) return +m[1] >= 1 && +m[1] <= 60 ? { kind: 'hizb', n: +m[1] } : null;
  m = /^(?:page|pg|p|صفحة|الصفحة|ص) ?(\d{1,3})$/.exec(t);
  if (m) return +m[1] >= 1 && +m[1] <= 604 ? { kind: 'page', n: +m[1] } : null;
  m = /^(\d{1,3}) ?[:.,/ ] ?(\d{1,3})$/.exec(t);
  if (m) {
    const s = meta[+m[1] - 1];
    return s && +m[2] >= 1 && +m[2] <= s.ayahs ? { kind: 'ayah', s: s.n, a: +m[2] } : null;
  }
  m = /^(.+?) ?[: ] ?(\d{1,3})$/.exec(t); // a surah name, then the ayah
  if (m) {
    const found = matchSurahs(meta, m[1]);
    const s = found.length === 1 ? found[0] : found.find((x) => normName(x.en) === normName(m![1]));
    return s && +m[2] >= 1 && +m[2] <= s.ayahs ? { kind: 'ayah', s: s.n, a: +m[2] } : null;
  }
  return null;
}
