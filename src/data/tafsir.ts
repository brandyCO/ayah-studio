// Tafsir beside the translation (docs/grow.md, G4; the `tafsir` flag, on since 2026-11-24). Fetched per ayah from
// Quran.com on demand and kept on this device for at most 7 days (Quran Foundation's caching limit),
// then fetched again — or, offline, dropped. Shown exactly as published: never edited, cut or
// summarised; only its markup is reduced to safe elements (tafsirView()).
import { keepNewest, tx } from './db';

export interface TafsirSource { id: number; name: string; by: string; lang: string; slug: string }
/** The tafsirs Quran.com publishes (the same library Tarteel uses), as Quran.com names them; owner decision
 *  2026-11-24 "do what Tarteel does". Fi Zilal al-Quran is left out. Each is credited and linked to Quran.com. */
export const TAFSIRS: TafsirSource[] = [
  { id: 169, name: 'Tafsir Ibn Kathir (abridged)', by: 'Darussalam', lang: 'en', slug: 'en-tafisr-ibn-kathir' },
  { id: 168, name: "Ma'arif al-Qur'an", by: 'Mufti Muhammad Shafi', lang: 'en', slug: 'en-tafsir-maarif-ul-quran' },
  { id: 817, name: 'Tazkirul Quran', by: 'Maulana Wahiduddin Khan', lang: 'en', slug: 'tazkirul-quran-en' },
  { id: 16, name: 'التفسير الميسر', by: 'مجمع الملك فهد', lang: 'ar', slug: 'ar-tafsir-muyassar' },
  { id: 91, name: 'تفسير السعدي', by: 'السعدي', lang: 'ar', slug: 'ar-tafseer-al-saddi' },
  { id: 14, name: 'تفسير ابن كثير', by: 'ابن كثير', lang: 'ar', slug: 'ar-tafsir-ibn-kathir' },
  { id: 15, name: 'تفسير الطبري', by: 'الطبري', lang: 'ar', slug: 'ar-tafsir-al-tabari' },
  { id: 90, name: 'تفسير القرطبي', by: 'القرطبي', lang: 'ar', slug: 'ar-tafseer-al-qurtubi' },
  { id: 94, name: 'تفسير البغوي', by: 'البغوي', lang: 'ar', slug: 'ar-tafsir-al-baghawi' },
  { id: 93, name: 'التفسير الوسيط', by: 'طنطاوي', lang: 'ar', slug: 'ar-tafsir-al-wasit' },
  { id: 160, name: 'Tafsir Ibn Kathir (اردو)', by: 'Hafiz Ibn Kathir', lang: 'ur', slug: 'tafseer-ibn-e-kaseer-urdu' },
  { id: 159, name: 'Bayan ul Quran (اردو)', by: 'Dr. Israr Ahmad', lang: 'ur', slug: 'tafsir-bayan-ul-quran' },
  { id: 818, name: 'Tazkir ul Quran (اردو)', by: 'Maulana Wahiduddin Khan', lang: 'ur', slug: 'tazkiru-quran-ur' },
  { id: 164, name: 'Tafseer ibn Kathir (বাংলা)', by: 'Tawheed Publication', lang: 'bn', slug: 'bn-tafseer-ibn-e-kaseer' },
  { id: 165, name: 'Tafsir Ahsanul Bayaan (বাংলা)', by: 'Bayaan Foundation', lang: 'bn', slug: 'bn-tafsir-ahsanul-bayaan' },
  { id: 166, name: 'Tafsir Abu Bakr Zakaria (বাংলা)', by: 'King Fahd Quran Printing Complex', lang: 'bn', slug: 'bn-tafsir-abu-bakr-zakaria' },
  { id: 381, name: 'Tafsir Fathul Majid (বাংলা)', by: 'AbdulRahman Bin Hasan Al-Alshaikh', lang: 'bn', slug: 'tafisr-fathul-majid-bn' },
  { id: 170, name: 'Тафсир ас-Саади', by: 'as-Saadi', lang: 'ru', slug: 'ru-tafseer-al-saddi' },
  { id: 804, name: 'تەفسیری ڕێبەر', by: 'Rebar', lang: 'ckb', slug: 'kurd-tafsir-rebar' },
];
const RTL = new Set(['ar', 'ur', 'ckb']);
export const tafsirDir = (t: TafsirSource) => (RTL.has(t.lang) ? 'rtl' : 'ltr');
const PICK = 'tafsirPick';
/** The reader's tafsir: their pick, else one in the interface language (English otherwise). */
export function chosenTafsir(uiLang: string): TafsirSource {
  let id = NaN;
  try { id = Number(localStorage.getItem(PICK)); } catch { /* ignore */ }
  const lng = uiLang === 'ku' ? 'ckb' : uiLang;
  return TAFSIRS.find((x) => x.id === id) ?? TAFSIRS.find((x) => x.lang === lng) ?? TAFSIRS[0];
}
export function pickTafsir(id: number) {
  try { localStorage.setItem(PICK, String(id)); } catch { /* ignore */ }
}
const WEEK = 7 * 86_400_000;
const APIS = ['https://api.quran.com/api/v4', 'https://api.qurancdn.com/api/v4'];

export interface Tafsir {
  html: string; // as received
  verses: string[]; // the ayat this passage explains together, e.g. ["94:1", …, "94:8"]
  at: number; // when it was fetched
}
interface Row extends Tafsir { key: string; used: number }

export async function loadTafsir(src: TafsirSource, s: number, a: number): Promise<Tafsir> {
  const key = `${src.id}:${s}:${a}`;
  const hit = await tx<Row | undefined>('tafsir', 'readonly', (st) => st.get(key)).catch(() => undefined);
  const fresh = hit && Date.now() - hit.at < WEEK;
  if (hit && fresh && navigator.onLine !== false) {
    void tx('tafsir', 'readwrite', (st) => st.put({ ...hit, used: Date.now() })).catch(() => {});
    return hit;
  }
  let last: unknown = null;
  for (const api of APIS) {
    try {
      const r = await fetch(`${api}/tafsirs/${src.id}/by_ayah/${s}:${a}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { tafsir?: { text?: unknown; verses?: Record<string, unknown> } };
      const html = typeof j.tafsir?.text === 'string' ? j.tafsir.text : '';
      const verses = Object.keys(j.tafsir?.verses ?? {}).filter((k) => /^\d+:\d+$/.test(k));
      const row: Row = { key, html, verses: verses.length ? verses : [`${s}:${a}`], at: Date.now(), used: Date.now() };
      void tx('tafsir', 'readwrite', (st) => st.put(row)).then(() => keepNewest('tafsir', 300)).catch(() => {});
      return row;
    } catch (e) {
      last = e;
    }
  }
  if (hit && fresh) return hit; // offline: the copy from this week
  if (hit) void tx('tafsir', 'readwrite', (st) => st.delete(key)).catch(() => {});
  throw last instanceof Error ? last : new Error('Could not load the tafsir');
}

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI']);
const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'SUP', 'SUB', 'BR', 'A']);
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

/** The published text as safe DOM: known elements only, no attributes (links to quran.com kept as
 *  plain text links), every character of the text unchanged. Arabic passages get lang/dir. */
export function tafsirView(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = document.createDocumentFragment();
  const copy = (from: Node, to: Node) => {
    for (const n of Array.from(from.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) { to.appendChild(document.createTextNode(n.textContent ?? '')); continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const el = n as Element;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'IMG') continue;
      let made: HTMLElement | null = null;
      if (BLOCK.has(tag)) made = document.createElement(tag === 'DIV' || tag === 'H1' ? 'p' : tag === 'H2' || tag === 'H3' || tag === 'H4' ? 'h4' : tag.toLowerCase());
      else if (INLINE.has(tag)) made = document.createElement(tag === 'A' ? 'span' : tag.toLowerCase());
      if (!made) { copy(el, to); continue; } // unknown element: keep its text
      copy(el, made);
      const text = made.textContent ?? '';
      const ar = (text.match(ARABIC) ?? []).length;
      if (ar && ar >= text.replace(/\s/g, '').length * 0.5) {
        made.lang = 'ar';
        made.dir = 'rtl';
        made.classList.add('tf-ar');
      }
      to.appendChild(made);
    }
  };
  copy(doc.body, out);
  return out;
}
