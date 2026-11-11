// Strings for the reward moments added in round 4 (chest suspense, the harvest, streak milestones), loaded with
// them so the first load does not grow. English is the source; Arabic falls back to it per key.
import { lang } from './index';

const en = {
  'cel.tapMore': 'Keep tapping…',
  'cel.tapNear': 'It’s giving way…',
  'cel.tapAlmost': 'Almost!',
  'hv.kicker': 'Your harvest',
  'hv.title': '{n} chests at once',
  'hv.open': 'Open all {n} chests',
  'sm.m7': 'A whole week of light. Seven lanterns, one for each day. Your room’s flame frame is now bronze',
  'sm.m30': 'A month of light. Your room’s flame frame is now silver',
  'sm.m100': 'A hundred days. A new dawn. Your room’s flame frame is now gold',
  'sm.m365': 'A whole year of light, alhamdulillah. A crescent now crowns your room’s flame',
};
export type MomentKey = keyof typeof en;
const ar: Partial<Record<MomentKey, string>> = {
  'cel.tapMore': 'واصل النقر…',
  'cel.tapNear': 'بدأ يتشقق…',
  'cel.tapAlmost': 'كاد أن يُفتح!',
  'hv.kicker': 'حصادك',
  'hv.title': '{n} صناديق معًا',
  'hv.open': 'افتح الصناديق الـ{n} كلها',
  'sm.m7': 'أسبوع كامل من النور. سبعة فوانيس، لكل يوم فانوس. صار إطار الشعلة في غرفتك برونزيًا',
  'sm.m30': 'شهر من النور. صار إطار الشعلة في غرفتك فضيًا',
  'sm.m100': 'مئة يوم. فجر جديد. صار إطار الشعلة في غرفتك ذهبيًا',
  'sm.m365': 'عام كامل من النور، الحمد لله. هلال يتوّج الآن شعلة غرفتك',
};

/** A moment string, with {name} placeholders filled from `vars`. */
export function mt(key: MomentKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : undefined) ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
