// The interface languages' names for the pickers (onboarding, welcome, Me → Settings → Language), loaded with them.
import { offered, type Lang } from './index';

/** `name` in its own words, `en` its English name, `mark` the short sign on the onboarding tile. */
export type LangInfo = { id: Lang; name: string; en: string; dir: 'ltr' | 'rtl'; mark: string };
const ALL: LangInfo[] = [
  { id: 'en', name: 'English', en: 'English', dir: 'ltr', mark: 'En' },
  { id: 'ar', name: 'العربية', en: 'Arabic', dir: 'rtl', mark: 'ع' },
  { id: 'ur', name: 'اردو', en: 'Urdu', dir: 'rtl', mark: 'اُ' },
  { id: 'id', name: 'Bahasa Indonesia', en: 'Indonesian', dir: 'ltr', mark: 'Id' },
  { id: 'bn', name: 'বাংলা', en: 'Bengali', dir: 'ltr', mark: 'বা' },
  { id: 'tr', name: 'Türkçe', en: 'Turkish', dir: 'ltr', mark: 'Tr' },
  { id: 'fa', name: 'فارسی', en: 'Persian', dir: 'rtl', mark: 'فا' },
  { id: 'fr', name: 'Français', en: 'French', dir: 'ltr', mark: 'Fr' },
  { id: 'ms', name: 'Bahasa Melayu', en: 'Malay', dir: 'ltr', mark: 'Ms' },
  { id: 'hi', name: 'हिन्दी', en: 'Hindi', dir: 'ltr', mark: 'हि' },
  { id: 'ru', name: 'Русский', en: 'Russian', dir: 'ltr', mark: 'Ру' },
  { id: 'es', name: 'Español', en: 'Spanish', dir: 'ltr', mark: 'Es' },
  { id: 'de', name: 'Deutsch', en: 'German', dir: 'ltr', mark: 'De' },
  { id: 'pt', name: 'Português', en: 'Portuguese', dir: 'ltr', mark: 'Pt' },
  { id: 'sw', name: 'Kiswahili', en: 'Swahili', dir: 'ltr', mark: 'Sw' },
  { id: 'ha', name: 'Hausa', en: 'Hausa', dir: 'ltr', mark: 'Ha' },
  { id: 'so', name: 'Soomaali', en: 'Somali', dir: 'ltr', mark: 'So' },
  { id: 'ps', name: 'پښتو', en: 'Pashto', dir: 'rtl', mark: 'پ' },
  { id: 'uz', name: 'Oʻzbekcha', en: 'Uzbek', dir: 'ltr', mark: 'Uz' },
  { id: 'az', name: 'Azərbaycanca', en: 'Azerbaijani', dir: 'ltr', mark: 'Az' },
  { id: 'bs', name: 'Bosanski', en: 'Bosnian', dir: 'ltr', mark: 'Bs' },
  { id: 'sq', name: 'Shqip', en: 'Albanian', dir: 'ltr', mark: 'Sq' },
  { id: 'ckb', name: 'کوردی', en: 'Kurdish (Sorani)', dir: 'rtl', mark: 'کو' },
  { id: 'ta', name: 'தமிழ்', en: 'Tamil', dir: 'ltr', mark: 'த' },
  { id: 'ml', name: 'മലയാളം', en: 'Malayalam', dir: 'ltr', mark: 'മ' },
  { id: 'zh', name: '中文', en: 'Chinese', dir: 'ltr', mark: '中' },
  { id: 'it', name: 'Italiano', en: 'Italian', dir: 'ltr', mark: 'It' },
  { id: 'nl', name: 'Nederlands', en: 'Dutch', dir: 'ltr', mark: 'Nl' },
  { id: 'ja', name: '日本語', en: 'Japanese', dir: 'ltr', mark: '日' },
  { id: 'ko', name: '한국어', en: 'Korean', dir: 'ltr', mark: '한' },
];
/** The languages this build offers (English, Arabic and every translated bundle), in the order shown. */
export const LANGS: readonly LangInfo[] = ALL.filter((l) => offered(l.id));
