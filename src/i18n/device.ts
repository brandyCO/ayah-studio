// Strings for Device check (src/ui/debug.ts; owner 2026-11-24: every screen in every language). English is the
// source; Arabic here, the other languages in the locale bundles (module `device`). Codec names stay as they are.
import { fill, lang, tr } from './index';

const en = {
  'dv.title': 'Device check',
  'dv.checking': 'Checking…',
  'dv.intro': 'Can this phone make the video itself?',
  'dv.tafsir': 'Tafsir beside the translation',
  'dv.errorsOn': 'Error reports: on (Sentry; no account or personal data)',
  'dv.errorsOff': 'Error reports: off',
  'dv.lite': 'Old-phone mode',
  'dv.autoOn': 'Auto (on: {why})',
  'dv.autoOff': 'Auto (off: {why})',
  'dv.on': 'On',
  'dv.off': 'Off',
  'dv.saveData': 'Data Saver is on',
  'dv.mem': '{n} GB memory',
  'dv.cores': '{n} CPU cores',
  'dv.timingsNone': 'Timings: none yet (open the mushaf or the studio first).',
  'dv.timings': 'Timings on this device',
  'dv.median': 'median {t} ({n})',
  'dv.fpsNone': 'Smoothness: open a chest or another reward moment, then come back here.',
  'dv.fps': 'Smoothness of reward moments (newest · median)',
  'dv.fpsRow': '{fps} fps · slowest {ms} ms · {p}% slow',
  'dv.fpsMedian': 'median {fps} fps ({n})',
  'dv.clear': 'Clear',
  'dv.ua': 'User agent: {ua}',
  'dv.yes': 'Yes',
  'dv.no': 'No',
  'dv.webcodecs': 'WebCodecs available',
  'dv.aac': 'AAC audio (built in)',
  'dv.opus': 'Opus audio',
  'dv.path': 'Export path',
  'dv.noPath': 'none: this browser cannot make the video',
};

const ar: Partial<Record<keyof typeof en, string>> = {
  'dv.title': 'فحص الجهاز',
  'dv.checking': 'جارٍ الفحص…',
  'dv.intro': 'هل يستطيع هذا الهاتف صنع الفيديو بنفسه؟',
  'dv.tafsir': 'التفسير بجانب الترجمة',
  'dv.errorsOn': 'تقارير الأخطاء: مفعّلة (Sentry؛ دون حساب أو بيانات شخصية)',
  'dv.errorsOff': 'تقارير الأخطاء: متوقفة',
  'dv.lite': 'وضع الهواتف القديمة',
  'dv.autoOn': 'تلقائي (مفعّل: {why})',
  'dv.autoOff': 'تلقائي (متوقف: {why})',
  'dv.on': 'تشغيل',
  'dv.off': 'إيقاف',
  'dv.saveData': 'توفير البيانات مفعّل',
  'dv.mem': 'ذاكرة {n} غيغابايت',
  'dv.cores': '{n} أنوية معالج',
  'dv.timingsNone': 'الأوقات: لا شيء بعد (افتح المصحف أو الاستوديو أولًا).',
  'dv.timings': 'الأوقات على هذا الجهاز',
  'dv.median': 'الوسيط {t} ({n})',
  'dv.fpsNone': 'السلاسة: افتح صندوقًا أو لحظة مكافأة أخرى، ثم عد إلى هنا.',
  'dv.fps': 'سلاسة لحظات المكافأة (الأحدث · الوسيط)',
  'dv.fpsRow': '{fps} إطارًا/ث · أبطأ إطار {ms} م.ث · {p}% بطيء',
  'dv.fpsMedian': 'الوسيط {fps} إطارًا/ث ({n})',
  'dv.clear': 'مسح',
  'dv.ua': 'وكيل المستخدم: {ua}',
  'dv.yes': 'نعم',
  'dv.no': 'لا',
  'dv.webcodecs': 'WebCodecs متاح',
  'dv.aac': 'صوت AAC (مدمج)',
  'dv.opus': 'صوت Opus',
  'dv.path': 'طريقة التصدير',
  'dv.noPath': 'لا شيء: هذا المتصفح لا يستطيع صنع الفيديو',
};

export type DeviceKey = keyof typeof en;

export function dvt(key: DeviceKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : tr('device', key)) ?? en[key];
  return fill(s, vars);
}
