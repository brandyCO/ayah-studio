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

/** Every interface language (names and the picker's list: ./langs.ts, loaded with the screens that show it). English
 *  is the source; Arabic's strings live in ar.ts and the modules; every other language is one lazy JSON bundle
 *  (`locales/{id}.json`, all modules, made from scripts/i18n/en.json and checked by scripts/check-i18n.mjs). */
export type Lang = 'en' | 'ar' | 'ur' | 'id' | 'bn' | 'tr' | 'fa' | 'fr' | 'ms' | 'hi' | 'ru' | 'es' | 'de' | 'pt' | 'sw'
  | 'ha' | 'so' | 'ps' | 'uz' | 'az' | 'bs' | 'sq' | 'ckb' | 'ta' | 'ml' | 'zh' | 'it' | 'nl' | 'ja' | 'ko';
type Bundle = Record<string, Record<string, string>>;
const BUNDLES = import.meta.glob<Bundle>('./locales/*.json', { import: 'default' });
export const hasBundle = (id: string) => `./locales/${id}.json` in BUNDLES;
/** Whether this build offers `id` as an interface language. */
export const offered = (id: string | null | undefined): id is Lang => id === 'en' || id === 'ar' || (!!id && hasBundle(id));
const RTL = new Set<string>(['ar', 'ur', 'fa', 'ps', 'ckb']);
/** The Intl locale of a language (dates, numbers, plurals; always with Western digits). */
export const intlLoc = (id: Lang) => (id === 'zh' ? 'zh-CN' : id);

let current: Lang = 'en';
let dict: Partial<Record<Key, string>> = {};
let bundle: Bundle | null = null;
let more: typeof import('./more') | null = null;
let arMsg: ((m: string) => string | null) | null = null;
let generic = '';

/** This language's string for `key` of a lazily loaded module ('ranks', 'shop'…), if its bundle has one. Arabic
 *  keeps its own dictionaries in the modules. */
export const tr = (mod: string, key: string): string | undefined => bundle?.[mod]?.[key];

/** Fills a translated string: ICU plurals first ({n, plural, one {…} few {…} other {…}}, `#` = the number), then
 *  {name} placeholders. `num` formats numbers (t() groups digits the language's way; the modules print them plain). */
export function fill(s: string, vars?: Record<string, string | number>, num: (v: string | number) => string = String): string {
  if (!vars) return s;
  if (more && s.includes(', plural,')) s = more.plurals(s, vars, num, intlLoc(current));
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? num(vars[k]) : m));
}

/** The interface string for `key`, with {name} placeholders filled from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = dict[key] ?? en[key] ?? key; // a studio key before its strings loaded shows the key, never "undefined"
  return fill(s, vars, fmtNum);
}

/** A name defined elsewhere in English (an effect, a mood…) under `key` if this language has it. */
export const tOr = (key: string, fallback: string): string => (dict as Record<string, string>)[key] ?? fallback;

const fmtNum = (v: string | number) => (typeof v === 'number' ? numFmt().format(v) : v);
let nf: Intl.NumberFormat | null = null;
// Western digits in every language: references like 2:255 and times stay the same everywhere.
const numFmt = () => (nf ??= new Intl.NumberFormat(current === 'en' ? 'en' : `${intlLoc(current)}-u-nu-latn`));

export const lang = (): Lang => current;
export const dir = (): 'ltr' | 'rtl' => (RTL.has(current) ? 'rtl' : 'ltr');
/** The locale for Intl date formatting (Western digits). */
export const locale = () => (current === 'en' ? undefined : `${intlLoc(current)}-u-nu-latn`);

function stored(): Lang | null {
  try {
    const v = localStorage.getItem('uiLang');
    return offered(v) ? v : null;
  } catch {
    return null;
  }
}

/** The first of the phone's languages this build offers (Indonesian's old code `in`, Dari as Persian), else English. */
export function deviceLang(): Lang {
  const alias: Record<string, string> = { in: 'id', prs: 'fa', zsm: 'ms', 'ku-iq': 'ckb', 'ku-arab': 'ckb' };
  const want = (navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']).filter(Boolean);
  for (const raw of want) {
    const full = raw.toLowerCase();
    const base = alias[full] ?? alias[full.split('-')[0]] ?? full.split('-')[0];
    if (offered(base)) return base;
  }
  return 'en';
}

/** A surah's name for the interface: its Arabic name in the Arabic interface, else the English one. */
/** Time left, one way everywhere: "2 d 5 h", "10 h 4 m", "12 min"; in Arabic whole words
 *  ("يومان و5 ساعات", "10 ساعات و4 دقائق"). Never a 0 d. */
export function timeLeft(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  if (current === 'ar') {
    const u = (n: number, unit: string) => new Intl.NumberFormat('ar-u-nu-latn', { style: 'unit', unit, unitDisplay: 'long' }).format(n);
    const [a, b] = d ? [u(d, 'day'), hh ? u(hh, 'hour') : ''] : hh ? [u(hh, 'hour'), mm ? u(mm, 'minute') : ''] : [u(mm, 'minute'), ''];
    return b ? `${a} و${b}` : a;
  }
  return d ? (hh ? t('wkg.leftD', { d, h: hh }) : t('wkg.days', { d })) : hh ? t('wkg.leftH', { h: hh, m: mm }) : t('wkg.leftM', { m: mm });
}

/** "6 d" / "6 أيام". */
export const daysText = (d: number) => current === 'ar'
  ? new Intl.NumberFormat('ar-u-nu-latn', { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(d) : t('wkg.days', { d });

/** A surah's name for the interface: its Arabic name in an Arabic-script interface (Arabic, Urdu, Persian, Pashto,
 *  Kurdish), else the transliterated one ("Al-Baqarah"). */
export const surahName = (m: { en: string; ar: string }) => (ARABIC_SCRIPT.has(current) ? m.ar : m.en);
const ARABIC_SCRIPT = new Set<Lang>(['ar', 'ur', 'fa', 'ps', 'ckb']);
/** What a surah's name means ("The Cow"), in the interface language where its bundle has it, else in English. */
export const surahMeaning = (m: { n: number; tr: string }) => tr('extra', `sm.${m.n}`) ?? m.tr;

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const isLink = (s: string) => /^\s*(https?:\/\/|[\w.-]+\.\w{2,}\/)\S*\s*$/.test(s);

/** A message from outside our strings (the server, the network, a thrown error) in the interface
 *  language: its translation when we know it, else the message unchanged. */
export function localMsg(msg: string): string {
  if (current === 'en' || !msg || isLink(msg)) return msg;
  if (current === 'ar') return !arMsg || hasArabic(msg) ? msg : arMsg(msg) ?? msg;
  return !more || more.inOwnScript(msg, current) ? msg : more.bundleMsg(msg, bundle) ?? msg;
}

/** The text to show for an error (or a toast with an unknown English message): in Arabic (and any language not
 *  written in Latin letters) it is never left in English — an unknown one becomes a plain "could not do that, try
 *  again". In a Latin-script language an unknown message cannot be told from our own translated text, so it stays. */
export function errMsg(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  if (current === 'en' || isLink(msg)) return msg;
  if (current === 'ar') return !arMsg || hasArabic(msg) ? msg : arMsg(msg) ?? (/[A-Za-z]{2,}/.test(msg) ? generic : msg);
  if (!more || more.inOwnScript(msg, current)) return msg;
  return more.bundleMsg(msg, bundle) ?? (!more.LATIN.has(current) && /[A-Za-z]{2,}/.test(msg) ? bundle?.msg?.['@generic'] ?? msg : msg);
}

/** A reference for the interface ("Al-Baqarah · 2:255", "البقرة · 2:255"). Reels keep `reference()`. */
export const uiRef = (m: { en: string; ar: string; n: number }, from: number, to = from) =>
  `${surahName(m)} · ${m.n}:${from}${to > from ? `–${to}` : ''}`;

/** Picks the language (the user's choice, else the device's if we have it) and loads its strings. */
export async function initI18n() {
  const want = stored() ?? deviceLang();
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
  } else if (want !== 'en' && hasBundle(want)) {
    try {
      const [b, m] = await Promise.all([BUNDLES[`./locales/${want}.json`](), import('./more')]);
      bundle = b;
      more = m;
      m.patchDates(want);
      dict = { ...b.core, ...b.studio, ...b.engine } as Partial<Record<Key, string>>;
      current = want;
    } catch {
      /* offline before the strings were cached: English */
    }
  }
  document.documentElement.lang = current;
  document.documentElement.dir = dir();
  document.documentElement.dataset.script = SCRIPT[current] ?? 'latin';
}
/** The writing system, for fonts and line heights in CSS (`html[data-script]`). */
const SCRIPT: Partial<Record<Lang, string>> = {
  ar: 'arabic', ur: 'urdu', fa: 'arabic', ps: 'arabic', ckb: 'arabic', bn: 'bengali', hi: 'devanagari', ta: 'tamil',
  ml: 'malayalam', zh: 'cjk', ja: 'cjk', ko: 'cjk', ru: 'cyrillic',
};

/** Switches the interface language (the page reloads so every screen picks it up). */
export function setLang(id: Lang) {
  try {
    localStorage.setItem('uiLang', id);
  } catch {
    /* ignore */
  }
  location.reload();
}
