// Adhkar session strings, loaded with that screen. English is the source; Arabic falls back to it
// per key. Interface words only: the adhkar themselves come from public/data/adhkar.json.
import { lang } from './index';

const en = {
  'ak.titleS': 'Morning adhkar',
  'ak.titleM': 'Evening adhkar',
  'ak.of': '{n} of {of}',
  'ak.times': 'Say it {n} times',
  'ak.timesMany': 'Say it {n} times',
  'ak.once': 'Say it once',
  'ak.tap': 'Tap each time you say it',
  'ak.tapAria': 'Said it once more. {n} of {of}',
  'ak.undo': 'One less',
  'ak.prev': 'Previous',
  'ak.next': 'Next',
  'ak.quran': 'Quran · {name} {ref}',
  'ak.source': 'Source: {ref} · Hisn al-Muslim',
  'ak.noteNight': 'For the evening: the hadith is about reciting them at night.',
  'ak.noteLazy': 'Ten times, or once when you feel tired.',
  'ak.lazyBtn': 'Only once today',
  'ak.noteDay': 'One hundred times in the day.',
  'ak.light': '+{n} Light',
  'ak.translation': 'Meaning',
  'ak.size': 'Text size',
  'ak.doneTitleS': 'All the morning adhkar said',
  'ak.doneTitleM': 'All the evening adhkar said',
  'ak.doneSub': 'May Allah accept from you and keep you in His care.',
  'ak.claim': '✦ Claim your goal',
  'ak.close': 'Close',
  'ak.again': 'Read them again',
  'ak.list': 'All adhkar',
  'ak.failed': 'Could not open the adhkar. Check the connection and try again.',
  'ak.credit': 'Arabic: hisnmuslim.com · English: Darussalam · Quran: King Fahd Complex, Saheeh International',
};
export type AdhkarKey = keyof typeof en;

const ar: Partial<Record<AdhkarKey, string>> = {
  'ak.titleS': 'أذكار الصباح',
  'ak.titleM': 'أذكار المساء',
  'ak.of': '{n} من {of}',
  'ak.times': 'تُقال {n} مرات',
  'ak.timesMany': 'تُقال {n} مرة',
  'ak.once': 'تُقال مرة واحدة',
  'ak.tap': 'اضغط كلما قلتها',
  'ak.tapAria': 'قلتها مرة أخرى. {n} من {of}',
  'ak.undo': 'مرة أقل',
  'ak.prev': 'السابق',
  'ak.next': 'التالي',
  'ak.quran': 'قرآن · {name} {ref}',
  'ak.source': 'المصدر: {ref} · حصن المسلم',
  'ak.noteNight': 'للمساء: الحديث في قراءتهما في الليل.',
  'ak.noteLazy': 'عشر مرات، أو مرة واحدة عند الكسل.',
  'ak.lazyBtn': 'مرة واحدة اليوم',
  'ak.noteDay': 'مائة مرة في اليوم.',
  'ak.light': '+{n} نور',
  'ak.translation': 'المعنى',
  'ak.size': 'حجم الخط',
  'ak.doneTitleS': 'أتممت أذكار الصباح',
  'ak.doneTitleM': 'أتممت أذكار المساء',
  'ak.doneSub': 'تقبّل الله منك وحفظك.',
  'ak.claim': '✦ استلم هدفك',
  'ak.close': 'إغلاق',
  'ak.again': 'اقرأها مرة أخرى',
  'ak.list': 'كل الأذكار',
  'ak.failed': 'تعذّر فتح الأذكار. تحقق من الاتصال وحاول مرة أخرى.',
  'ak.credit': 'النص: hisnmuslim.com · الترجمة: دار السلام · القرآن: مجمع الملك فهد، صحيح إنترناشونال',
};

/** An adhkar string, with {name} placeholders filled from `vars`. */
export function akt(key: AdhkarKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : undefined) ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
