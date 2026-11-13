// Strings for the front-end review's last items (comeback welcome, Me's next step, the Friday story card), loaded
// with them so the first load does not grow. English is the source; Arabic falls back to it per key.
import { lang } from './index';

const en = {
  'cb.kicker': 'Welcome back',
  'cb.title': 'It’s so good to see you',
  'cb.titleName': 'It’s so good to see you, {name}',
  'cb.body': 'Everything you built is still here, waiting for you.',
  'cb.light': '{n} Light',
  'cb.badges': '{n} badges',
  'cb.level': 'Level {n}',
  'cb.go': 'Read one page',
  'cb.goSub': 'One page lights today’s flame',
  'cb.later': 'Later',
  'nx.kicker': 'Next up',
  'nx.flame': 'Light today’s flame',
  'nx.flameSub': 'Read one page and it catches',
  'nx.read': 'Read a page',
  'nx.morn': 'Your morning adhkar',
  'nx.eve': 'Your evening adhkar',
  'nx.adhkarSub': 'A few minutes, said with your heart',
  'nx.of': '{n} of {of}',
  'nx.begin': 'Begin',
  'nx.continue': 'Continue',
  'nx.portion1': '1 page left in today’s portion',
  'nx.portion': '{n} pages left in today’s portion',
  'nx.open': 'Open the page',
  'nx.done': 'Every goal met today',
  'nx.doneSub': 'MashaAllah. End the day with a recitation',
  'nx.listen': 'Listen',
};
export type FrontKey = keyof typeof en;
const ar: Partial<Record<FrontKey, string>> = {
  'cb.kicker': 'أهلًا بعودتك',
  'cb.title': 'سعداء جدًا برؤيتك',
  'cb.titleName': 'سعداء جدًا برؤيتك يا {name}',
  'cb.body': 'كل ما بنيته ما زال هنا ينتظرك.',
  'cb.light': '{n} نور',
  'cb.badges': '{n} أوسمة',
  'cb.level': 'المستوى {n}',
  'cb.go': 'اقرأ صفحة واحدة',
  'cb.goSub': 'صفحة واحدة تشعل شعلة اليوم',
  'cb.later': 'لاحقًا',
  'nx.kicker': 'التالي',
  'nx.flame': 'أشعل شعلة اليوم',
  'nx.flameSub': 'اقرأ صفحة واحدة فتشتعل',
  'nx.read': 'اقرأ صفحة',
  'nx.morn': 'أذكار الصباح',
  'nx.eve': 'أذكار المساء',
  'nx.adhkarSub': 'دقائق قليلة بقلب حاضر',
  'nx.of': '{n} من {of}',
  'nx.begin': 'ابدأ',
  'nx.continue': 'تابع',
  'nx.portion1': 'بقيت صفحة واحدة من ورد اليوم',
  'nx.portion': 'بقيت {n} صفحات من ورد اليوم',
  'nx.open': 'افتح الصفحة',
  'nx.done': 'أتممت كل أهداف اليوم',
  'nx.doneSub': 'ما شاء الله. اختم يومك بتلاوة',
  'nx.listen': 'استمع',
};

/** A string, with {name} placeholders filled from `vars`. */
export function fe(key: FrontKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : undefined) ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
