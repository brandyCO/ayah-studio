// Strings for Today's ayah + My ayah (src/ui/ayahCards.ts) and their home-screen widgets (owner request
// 2026-11-24). English is the source; Arabic here, the other languages in the locale bundles (module `daily`).
import { fill, lang, tr } from './index';

const en = {
  'dy.title': 'Ayah of the day',
  'dy.today': 'Today’s ayah',
  'dy.todaySub': 'The same ayah for everyone today',
  'dy.mine': 'My ayah',
  'dy.why.memorising': 'From {surah}, which you are memorising',
  'dy.why.review': 'From {surah}, ready for your review',
  'dy.why.reading': 'From {surah}, which you are reading',
  'dy.why.bookmark': 'From your bookmarks',
  'dy.why.picked': 'Picked for you today',
  'dy.listen': 'Listen',
  'dy.reel': 'Reel',
  'dy.share': 'Share',
  'dy.read': 'Read',
  'dy.shareTitle': 'Today’s ayah',
  'dy.shareInvite': 'Read it with me on Ayah Studio:',
  'dy.wgMine': 'My ayah',
  'dy.wgMineDesc': 'An ayah picked from what you memorise and read. On a large widget, shown with today’s ayah.',
  'dy.wgTodayDesc': 'The same ayah for everyone, new each day. On a large widget, shown with your own ayah.',
  'dy.newsHead': 'Today’s ayah for everyone',
  'dy.wgEmpty': 'Open the app once to see the ayah here.',
};

const ar: Partial<Record<DailyKey, string>> = {
  'dy.title': 'آية اليوم',
  'dy.today': 'آية اليوم',
  'dy.todaySub': 'الآية نفسها للجميع اليوم',
  'dy.mine': 'آيتي',
  'dy.why.memorising': 'من {surah}، التي تحفظها',
  'dy.why.review': 'من {surah}، حان وقت مراجعتها',
  'dy.why.reading': 'من {surah}، التي تقرؤها',
  'dy.why.bookmark': 'من علاماتك المرجعية',
  'dy.why.picked': 'اخترناها لك اليوم',
  'dy.listen': 'استمع',
  'dy.reel': 'فيديو',
  'dy.share': 'شارك',
  'dy.read': 'اقرأ',
  'dy.shareTitle': 'آية اليوم',
  'dy.shareInvite': 'اقرأها معي في Ayah Studio:',
  'dy.wgMine': 'آيتي',
  'dy.wgMineDesc': 'آية مختارة مما تحفظ وتقرأ. وفي الحجم الكبير تظهر مع آية اليوم.',
  'dy.wgTodayDesc': 'الآية نفسها للجميع، جديدة كل يوم. وفي الحجم الكبير تظهر مع آيتك.',
  'dy.newsHead': 'آية اليوم للجميع',
  'dy.wgEmpty': 'افتح التطبيق مرة لتظهر الآية هنا.',
};

export type DailyKey = keyof typeof en;

export function dyt(key: DailyKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : tr('daily', key)) ?? en[key];
  return fill(s, vars);
}
