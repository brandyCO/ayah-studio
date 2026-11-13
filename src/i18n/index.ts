// Interface strings (docs/grow.md, G1). English is the source (en.ts, typed keys); other languages
// are lazy-loaded dictionaries, and a missing key falls back to English. Only interface words are
// translated here — Quran text, translations of the meaning and surah names come from the bundled data.
import enCore, { type Key } from './en';

// English: the first-load strings, joined by the studio's own when the editor opens (loadStudioStrings()).
const en = enCore as Record<Key, string>;
let studioStrings: Promise<void> | null = null;
/** Loads the reel studio's English strings (call before drawing the editor). */
export function loadStudioStrings(): Promise<void> {
  studioStrings ??= import('./enStudio').then((m) => { Object.assign(en, m.default); }, (e) => { studioStrings = null; throw e; });
  return studioStrings;
}

export type { Key };
export type Lang = 'en' | 'ar';
export const LANGS: { id: Lang; name: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', name: 'English', dir: 'ltr' },
  { id: 'ar', name: 'العربية', dir: 'rtl' },
];

let current: Lang = 'en';
let dict: Partial<Record<Key, string>> = {};
let arMsg: ((m: string) => string | null) | null = null;
let generic = '';

/** The interface string for `key`, with {name} placeholders filled from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = dict[key] ?? en[key] ?? key; // a studio key before its strings loaded shows the key, never "undefined"
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? fmtNum(vars[k]) : m)) : s;
}

/** A name defined elsewhere in English (an effect, a mood…) under `key` if this language has it. */
export const tOr = (key: string, fallback: string): string => (dict as Record<string, string>)[key] ?? fallback;

const fmtNum = (v: string | number) => (typeof v === 'number' ? numFmt().format(v) : v);
let nf: Intl.NumberFormat | null = null;
// Western digits in every language: references like 2:255 and times stay the same everywhere.
const numFmt = () => (nf ??= new Intl.NumberFormat(current === 'ar' ? 'ar-u-nu-latn' : 'en'));

export const lang = (): Lang => current;
export const dir = (): 'ltr' | 'rtl' => LANGS.find((l) => l.id === current)!.dir;
/** The locale for Intl date formatting (Western digits). */
export const locale = () => (current === 'ar' ? 'ar-u-nu-latn' : undefined);

function stored(): Lang | null {
  try {
    const v = localStorage.getItem('uiLang');
    return v === 'en' || v === 'ar' ? v : null;
  } catch {
    return null;
  }
}

/** A surah's name for the interface: its Arabic name in the Arabic interface, else the English one. */
export const surahName = (m: { en: string; ar: string }) => (current === 'ar' ? m.ar : m.en);

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const isLink = (s: string) => /^\s*(https?:\/\/|[\w.-]+\.\w{2,}\/)\S*\s*$/.test(s);

/** A message from outside our strings (the server, the network, a thrown error) in the interface
 *  language: in Arabic, its Arabic when we know it, else the message unchanged. */
export function localMsg(msg: string): string {
  if (current !== 'ar' || !arMsg || !msg || hasArabic(msg) || isLink(msg)) return msg;
  return arMsg(msg) ?? msg;
}

/** The text to show for an error (or a toast with an unknown English message): in Arabic it is
 *  never left in English — an unknown one becomes a plain "could not do that, try again". */
export function errMsg(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  if (current !== 'ar' || !arMsg || hasArabic(msg) || isLink(msg)) return msg;
  return arMsg(msg) ?? (/[A-Za-z]{2,}/.test(msg) ? generic : msg);
}

/** A reference for the interface ("Al-Baqarah · 2:255", "البقرة · 2:255"). Reels keep `reference()`. */
export const uiRef = (m: { en: string; ar: string; n: number }, from: number, to = from) =>
  `${surahName(m)} · ${m.n}:${from}${to > from ? `–${to}` : ''}`;

/** Picks the language (the user's choice, else the device's if we have it) and loads its strings. */
export async function initI18n() {
  const want = stored() ?? (navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en');
  if (want === 'ar') {
    try {
      const [d, m] = await Promise.all([import('./ar'), import('./arMessages')]);
      dict = d.default;
      arMsg = m.arMessage;
      generic = m.AR_GENERIC;
      current = 'ar';
    } catch {
      /* offline before the strings were cached: English */
    }
  }
  document.documentElement.lang = current;
  document.documentElement.dir = dir();
}

/** Switches the interface language (the page reloads so every screen picks it up). */
export function setLang(id: Lang) {
  try {
    localStorage.setItem('uiLang', id);
  } catch {
    /* ignore */
  }
  location.reload();
}
