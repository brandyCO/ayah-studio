// Tafsir beside the translation (docs/grow.md, G4; behind the `tafsir` flag). Fetched per ayah from
// Quran.com on demand and kept on this device for at most 7 days (Quran Foundation's caching limit),
// then fetched again — or, offline, dropped. Shown exactly as published: never edited, cut or
// summarised; only its markup is reduced to safe elements (tafsirView()).
import { keepNewest, tx } from './db';

export const TAFSIR = { id: 169, name: 'Tafsir Ibn Kathir (abridged)', by: 'Darussalam, via Quran.com', lang: 'en' };
const WEEK = 7 * 86_400_000;
const APIS = ['https://api.quran.com/api/v4', 'https://api.qurancdn.com/api/v4'];

export interface Tafsir {
  html: string; // as received
  verses: string[]; // the ayat this passage explains together, e.g. ["94:1", …, "94:8"]
  at: number; // when it was fetched
}
interface Row extends Tafsir { key: string; used: number }

export async function loadTafsir(s: number, a: number): Promise<Tafsir> {
  const key = `${TAFSIR.id}:${s}:${a}`;
  const hit = await tx<Row | undefined>('tafsir', 'readonly', (st) => st.get(key)).catch(() => undefined);
  const fresh = hit && Date.now() - hit.at < WEEK;
  if (hit && fresh && navigator.onLine !== false) {
    void tx('tafsir', 'readwrite', (st) => st.put({ ...hit, used: Date.now() })).catch(() => {});
    return hit;
  }
  let last: unknown = null;
  for (const api of APIS) {
    try {
      const r = await fetch(`${api}/tafsirs/${TAFSIR.id}/by_ayah/${s}:${a}`);
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
