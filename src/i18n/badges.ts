// Badge names and goals (src/data/badges.ts), loaded with the screens that show them so the first load does
// not grow. English is the source; Arabic falls back to it per key. `{n}` is the badge's number.
import { lang } from './index';
import type { BadgeDef } from '../data/badges';

const en = {
  't0': 'Bronze', 't1': 'Silver', 't2': 'Gold', 't3': 'Platinum', 't4': 'Diamond',
  'g.read': 'Reading', 'g.listen': 'Listening', 'g.learn': 'Learn', 'g.dua': "Du'a & dhikr", 'g.goals': 'Goals', 'g.ranks': 'Ranks', 'g.create': 'Create & share',
  'f.streak': 'Steady flame', 'n.streak': 'Keep your flame lit {n} days in a row',
  'f.pages': 'Pages read', 'n.pages': 'Read {n} pages (counted pages only)',
  'f.surahs': 'Surahs finished', 'n.surahs': 'Finish {n} surahs: read every page of each',
  'f.juz': 'Juz completed', 'n.juz': 'Finish {n} juz: read all their pages',
  'f.kahf': 'Al-Kahf Fridays', 'n.kahf': 'Finish Surah Al-Kahf on {n} Fridays',
  'f.listen': 'Hours of recitation', 'n.listen': 'Listen to {n} hours of recitation',
  'f.lessons': 'Lessons passed', 'n.lessons': 'Pass {n} Learn lessons or tasmi’',
  'f.memo': 'Ayat memorised', 'n.memo': 'Memorise {n} ayat',
  'f.trees': 'Trees grown', 'n.trees': 'Grow {n} trees: recite each surah whole from memory',
  'f.water': 'Trees watered', 'n.water': 'Water a thirsty tree {n} times',
  'f.strong': 'Pages held strong', 'n.strong': 'Hold {n} mushaf pages strong in Page memory',
  'f.dhikr': 'Dhikr', 'n.dhikr': 'Count {n} dhikr on the tasbih',
  'f.adhkar': 'Adhkar sessions', 'n.adhkar': 'Say the morning or evening adhkar in full {n} times',
  'f.lanterns': "Du'a lanterns", 'n.lanterns': "Light {n} du'a lanterns",
  'f.nights': 'Peaceful nights', 'n.nights': "Say the bedtime du'a on {n} nights",
  'f.fullday': 'Days full of light', 'n.fullday': "Light all seven du'a lanterns on {n} days",
  'f.goals': 'Every goal met', 'n.goals': 'Meet every daily goal on {n} days',
  'f.weeks': 'Weeks of goals', 'n.weeks': 'Meet every weekly goal in {n} weeks',
  'f.league': 'Leagues climbed', 'n.league1': 'Reach the Hijrah league', 'n.league2': 'Reach the Badr league', 'n.league3': 'Reach the Al-Khandaq league',
  'n.league4': 'Reach the Fath Makkah league', 'n.league5': 'Finish a week at #1 in the Fath Makkah league',
  'f.top3': 'Top 3 finishes', 'n.top3': 'Finish a week in your league’s top 3, {n} times',
  'f.wins': 'Weeks won', 'n.wins': 'Finish a week at #1 in your league, {n} times',
  'f.reels': 'Reels made', 'n.reels': 'Make {n} reels',
  'f.shares': 'Ayat shared', 'n.shares': 'Share ayat {n} times (copy them or share a reel)',
  'icons': 'App icons', 'iconsSub': 'Win them with badges and in Ranks, then wear one on your home screen',
  'ic.theme': 'Theme icon', 'ic.themeSub': 'Follows your theme colours',
  'ic.sapphire': 'Rare Sapphire', 'ic.legend': 'Legendary Gold', 'ic.celestial': 'Mythic Celestial',
  'ic.sapphireHow': 'Earn any Platinum badge, or finish a week in a league’s top 3',
  'ic.legendHow': 'Earn any Diamond badge, or win a week at #1',
  'ic.celestialHow': 'Earn 5 Diamond badges, or win a week in the Fath Makkah league',
  'ic.use': 'Use', 'ic.inUse': 'In use', 'ic.locked': 'Locked', 'ic.set': 'Your new icon shows when you leave the app',
  'ic.web': 'Shows as this tab’s icon here, and on your home screen in the Android app',
  'ic.new': 'New app icon', 'ic.newSub': '{name} is yours. Wear it on your home screen',
  'step': 'Next: {tier}', 'all': 'Every tier earned',
};
export type BadgeKey = keyof typeof en;
const ar: Partial<Record<BadgeKey, string>> = {
  't0': 'برونزي', 't1': 'فضي', 't2': 'ذهبي', 't3': 'بلاتيني', 't4': 'ماسي',
  'g.read': 'القراءة', 'g.listen': 'الاستماع', 'g.learn': 'الحفظ', 'g.dua': 'الدعاء والذكر', 'g.goals': 'الأهداف', 'g.ranks': 'الترتيب', 'g.create': 'الإنشاء والمشاركة',
  'f.streak': 'شعلة ثابتة', 'n.streak': 'أبقِ شعلتك مضاءة {n} يومًا متتاليًا',
  'f.pages': 'صفحات مقروءة', 'n.pages': 'اقرأ {n} صفحة (الصفحات المحسوبة فقط)',
  'f.surahs': 'سور مكتملة', 'n.surahs': 'أكمل {n} سورة: اقرأ كل صفحاتها',
  'f.juz': 'أجزاء مكتملة', 'n.juz': 'أكمل {n} جزءًا: اقرأ كل صفحاتها',
  'f.kahf': 'جُمع الكهف', 'n.kahf': 'أكمل سورة الكهف في {n} جمعة',
  'f.listen': 'ساعات التلاوة', 'n.listen': 'استمع إلى {n} ساعة من التلاوة',
  'f.lessons': 'دروس مجتازة', 'n.lessons': 'اجتز {n} درسًا أو تسميعًا في الحفظ',
  'f.memo': 'آيات محفوظة', 'n.memo': 'احفظ {n} آية',
  'f.trees': 'أشجار نمت', 'n.trees': 'أنبت {n} شجرة: سمّع كل سورة كاملة من حفظك',
  'f.water': 'أشجار سُقيت', 'n.water': 'اسقِ شجرة عطشى {n} مرة',
  'f.strong': 'صفحات راسخة', 'n.strong': 'ثبّت {n} صفحة من المصحف في ذاكرة الصفحات',
  'f.dhikr': 'الذكر', 'n.dhikr': 'عُدّ {n} ذكرًا على المسبحة',
  'f.adhkar': 'جلسات الأذكار', 'n.adhkar': 'قل أذكار الصباح أو المساء كاملة {n} مرة',
  'f.lanterns': 'فوانيس الدعاء', 'n.lanterns': 'أضئ {n} فانوس دعاء',
  'f.nights': 'ليالٍ هادئة', 'n.nights': 'قل أذكار النوم في {n} ليلة',
  'f.fullday': 'أيام مليئة بالنور', 'n.fullday': 'أضئ فوانيس الدعاء السبعة في {n} يوم',
  'f.goals': 'كل الأهداف', 'n.goals': 'حقق كل أهدافك اليومية في {n} يوم',
  'f.weeks': 'أسابيع الأهداف', 'n.weeks': 'حقق كل أهدافك الأسبوعية في {n} أسبوع',
  'f.league': 'دوريات صعدتها', 'n.league1': 'اصعد إلى دوري الهجرة', 'n.league2': 'اصعد إلى دوري بدر', 'n.league3': 'اصعد إلى دوري الخندق',
  'n.league4': 'اصعد إلى دوري فتح مكة', 'n.league5': 'أنهِ أسبوعًا في المركز الأول في دوري فتح مكة',
  'f.top3': 'ضمن الثلاثة الأوائل', 'n.top3': 'أنهِ أسبوعًا ضمن الثلاثة الأوائل في دوريك {n} مرة',
  'f.wins': 'أسابيع فزت بها', 'n.wins': 'أنهِ أسبوعًا في المركز الأول في دوريك {n} مرة',
  'f.reels': 'مقاطع صنعتها', 'n.reels': 'اصنع {n} مقطعًا',
  'f.shares': 'آيات شاركتها', 'n.shares': 'شارك آيات {n} مرة (انسخها أو شارك مقطعًا)',
  'icons': 'أيقونات التطبيق', 'iconsSub': 'اربحها بالأوسمة وفي الترتيب، ثم ضع واحدة على شاشتك الرئيسية',
  'ic.theme': 'أيقونة السمة', 'ic.themeSub': 'تتبع ألوان سمتك',
  'ic.sapphire': 'الياقوت الأزرق النادر', 'ic.legend': 'الذهب الأسطوري', 'ic.celestial': 'السماوي الخرافي',
  'ic.sapphireHow': 'احصل على أي وسام بلاتيني، أو أنهِ أسبوعًا ضمن الثلاثة الأوائل في دوري',
  'ic.legendHow': 'احصل على أي وسام ماسي، أو فز بأسبوع في المركز الأول',
  'ic.celestialHow': 'احصل على 5 أوسمة ماسية، أو فز بأسبوع في دوري فتح مكة',
  'ic.use': 'استخدمها', 'ic.inUse': 'مستخدمة', 'ic.locked': 'مقفلة', 'ic.set': 'تظهر أيقونتك الجديدة عند خروجك من التطبيق',
  'ic.web': 'تظهر هنا كأيقونة هذه الصفحة، وعلى شاشتك الرئيسية في تطبيق أندرويد',
  'ic.new': 'أيقونة جديدة للتطبيق', 'ic.newSub': '{name} لك الآن. ضعها على شاشتك الرئيسية',
  'step': 'التالي: {tier}', 'all': 'حصلت على كل المستويات',
};

export function bt(k: BadgeKey, vars?: Record<string, string | number>): string {
  let s = (lang() === 'ar' ? ar[k] : undefined) ?? en[k];
  if (vars) for (const [a, v] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(typeof v === 'number' ? v.toLocaleString(lang() === 'ar' ? 'ar-u-nu-latn' : 'en') : v));
  return s;
}
/** "Pages read · Gold" */
export const badgeName = (b: Pick<BadgeDef, 'fam' | 'step'>) => `${bt(`f.${b.fam}` as BadgeKey)} · ${bt(`t${b.step}` as BadgeKey)}`;
export const tierName = (step: number) => bt(`t${step}` as BadgeKey);
export const badgeGoal = (b: Pick<BadgeDef, 'fam' | 'need'>) =>
  b.fam === 'league' ? bt(`n.league${b.need}` as BadgeKey) : bt(`n.${b.fam}` as BadgeKey, { n: b.need });
