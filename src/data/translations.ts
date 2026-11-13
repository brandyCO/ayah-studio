// Translations of the meaning (docs/grow.md, G1): the bundled list, the reader's choice (a synced
// preference) and loading one. Files: public/data/tr/ (scripts/fetch-translations.mjs).
import { touchPref } from '../ui/prefs';
import { TRANSLATIONS, type TranslationInfo } from './translationList';

export { TRANSLATIONS, type TranslationInfo };
export const DEFAULT_TRANSLATION = 'en.sahih';

export const translationInfo = (id: string | undefined): TranslationInfo =>
  TRANSLATIONS.find((t) => t.id === id) ?? TRANSLATIONS[0];
export const validTranslation = (id: unknown): id is string => typeof id === 'string' && TRANSLATIONS.some((t) => t.id === id);

/** Before any choice: the first translation in the phone's own languages (its order of preference),
 *  else Saheeh International. Not saved, so a choice made on another device still wins when it syncs. */
let phoneDefault: string | undefined;
function fromPhone(): string {
  if (phoneDefault) return phoneDefault;
  phoneDefault = DEFAULT_TRANSLATION;
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const code = (l || '').toLowerCase().split('-')[0];
      if (code === 'en') break;
      const t = TRANSLATIONS.find((x) => x.lang === code);
      if (t) { phoneDefault = t.id; break; }
    }
  } catch {
    /* Saheeh International */
  }
  return phoneDefault;
}

/** The translation chosen on this device (or synced from another), else the phone's language. */
export function currentTranslation(): string {
  try {
    const v = localStorage.getItem('translation');
    return validTranslation(v) ? v : fromPhone();
  } catch {
    return DEFAULT_TRANSLATION;
  }
}

export function setTranslation(id: string) {
  if (!validTranslation(id)) return;
  try {
    localStorage.setItem('translation', id);
  } catch {
    /* ignore */
  }
  touchPref('translation');
  window.dispatchEvent(new Event('translation-changed'));
}

/** Path under public/data/ of a translation's file. */
export const translationFile = (id: string) => (id === DEFAULT_TRANSLATION ? 'en-sahih.json' : `tr/${id}.json`);

/** Languages in the order shown by the picker: English first, then by English name. */
export function translationGroups(): { lang: string; name: string; items: TranslationInfo[] }[] {
  const groups = new Map<string, { lang: string; name: string; items: TranslationInfo[] }>();
  for (const t of TRANSLATIONS) {
    if (!groups.has(t.lang)) groups.set(t.lang, { lang: t.lang, name: t.langName === t.langEn ? t.langEn : `${t.langName} · ${t.langEn}`, items: [] });
    groups.get(t.lang)!.items.push(t);
  }
  return [...groups.values()].sort((a, b) => (a.lang === 'en' ? -1 : b.lang === 'en' ? 1 : translationInfo(a.items[0].id).langEn.localeCompare(translationInfo(b.items[0].id).langEn)));
}

/** The chosen translation's credit and direction, as a reel needs them (gifts and walls use the viewer's). */
export function reelTranslation(id = currentTranslation()): { credit: string; dir: 'ltr' | 'rtl' } {
  const info = translationInfo(id);
  return { credit: info.translator, dir: info.dir };
}
