// Media picker strings (Scenes → Add / Change), loaded with the studio so the first download stays
// small. English is the source; Arabic falls back to it per key.
import { lang } from './index';

const en = {
  'media.search': 'Search',
  'media.searchHint': 'Search calm scenes…',
  'media.adding': 'Adding…',
  'media.addingN': 'Adding {i} of {n}…',
  'media.removeAsk': 'Remove “{name}” from this device? Scenes using it show a plain colour instead.',
  'media.removeFailed': 'Could not remove it',
  'media.maxDownloads': 'Up to {n} downloads at a time — wait for one to finish',
  'media.fromDevice': 'From device',
  'media.remove': 'Remove {name}',
  'media.removeTitle': 'Remove from this device',
  'media.mineEmpty': 'Add your own photos and videos (calm scenes, no faces). They stay on this device and are never uploaded.',
  'media.mineNote': 'Videos play without their own sound: the recitation is the only audio. Videos up to {mb} MB.',
  'media.using': 'Using {mb} MB on this device.',
  'media.usingUnder': 'Using under 1 MB on this device.',
  'media.notSetUp': 'The free library is not set up in this build yet.',
  'media.loading': 'Loading…',
  'media.videos': 'Videos',
  'media.photos': 'Photos',
  'media.by': '{tags} · by {user} on {site}',
  'media.saving': 'Saving…',
  'media.saved': 'Saved',
  'media.try': 'Try {name}',
  'media.searching': 'Searching…',
  'media.nothing': 'Nothing found — try another word.',
  'media.more': 'More',
  'media.videosBy': 'Videos provided by',
  'media.photosBy': 'Photos provided by',
  'media.credit': '(free to use). A picked item is saved to My media; its creator is credited on the export page. Choose calm scenes without people.',
  'media.tabPresets': 'Presets',
  'media.tabMine': 'My media',
  'media.tabStock': 'Free library',
};
export type MediaKey = keyof typeof en;

const ar: Partial<Record<MediaKey, string>> = {
  'media.search': 'بحث',
  'media.searchHint': 'ابحث عن مشاهد هادئة…',
  'media.adding': 'جارٍ الإضافة…',
  'media.addingN': 'جارٍ إضافة {i} من {n}…',
  'media.removeAsk': 'هل تحذف «{name}» من هذا الجهاز؟ المشاهد التي تستخدمه ستظهر بلون واحد بدلًا منه.',
  'media.removeFailed': 'تعذّر الحذف',
  'media.maxDownloads': '{n} تنزيلات في وقت واحد على الأكثر، انتظر حتى ينتهي أحدها',
  'media.fromDevice': 'من الجهاز',
  'media.remove': 'حذف {name}',
  'media.removeTitle': 'احذف من هذا الجهاز',
  'media.mineEmpty': 'أضف صورك ومقاطعك (مشاهد هادئة بلا وجوه). تبقى على هذا الجهاز ولا تُرفع إلى أي مكان.',
  'media.mineNote': 'تُعرض المقاطع دون صوتها: التلاوة هي الصوت الوحيد. حجم الفيديو حتى {mb} ميغابايت.',
  'media.using': 'تستخدم {mb} ميغابايت على هذا الجهاز.',
  'media.usingUnder': 'تستخدم أقل من 1 ميغابايت على هذا الجهاز.',
  'media.notSetUp': 'المكتبة المجانية غير متاحة في هذه النسخة بعد.',
  'media.loading': 'جارٍ التحميل…',
  'media.videos': 'مقاطع',
  'media.photos': 'صور',
  'media.by': '{tags} · من {user} على {site}',
  'media.saving': 'جارٍ الحفظ…',
  'media.saved': 'محفوظ',
  'media.try': 'جرّب {name}',
  'media.searching': 'جارٍ البحث…',
  'media.nothing': 'لم نجد شيئًا، جرّب كلمة أخرى.',
  'media.more': 'المزيد',
  'media.videosBy': 'المقاطع مقدّمة من',
  'media.photosBy': 'الصور مقدّمة من',
  'media.credit': '(مجانية الاستخدام). ما تختاره يُحفظ في وسائطي، ويُذكر صاحبه في صفحة التصدير. اختر مشاهد هادئة بلا أشخاص.',
  'media.tabPresets': 'جاهزة',
  'media.tabMine': 'وسائطي',
  'media.tabStock': 'المكتبة المجانية',
};

/** A media picker string, with {name} placeholders filled from `vars`. */
export function mdt(key: MediaKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : undefined) ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
