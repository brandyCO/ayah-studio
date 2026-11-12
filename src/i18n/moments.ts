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
  'pu.kicker': 'Power up',
  'pu.up': 'New level!',
  'pu.l1': 'Glowing',
  'pu.l2': 'Burning',
  'pu.l3': 'Blazing',
  'pu.l4': 'Radiant',
  'pu.l5': 'Like the dawn',
  'pu.level': 'Level {n} · {name}',
  'pu.next': '{n} more days to {name}',
  'pu.max': 'The highest level, alhamdulillah',
  'pu.friend': 'Friend streak with {name}',
  'pu.friendDays': 'day friend streak',
  'lv.up': 'Level up!',
  'lv.word': 'level',
  'lv.sub': 'Your character gathers more light as it grows',
  'lv.b1': 'Your character now stands on a glow of light',
  'lv.b2': 'A soft halo of light now surrounds your character',
  'lv.b3': 'Two lights now circle your character',
  'lv.b4': 'Your character now shines at its edges',
  'lv.b5': 'Rays of light now rise behind your character',
  'lv.b6': 'Radiant: your character is all gold',
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
  'pu.kicker': 'انطلاقة النور',
  'pu.up': 'مستوى جديد!',
  'pu.l1': 'متوهّج',
  'pu.l2': 'مشتعل',
  'pu.l3': 'متّقد',
  'pu.l4': 'مشرق',
  'pu.l5': 'كالفجر',
  'pu.level': 'المستوى {n} · {name}',
  'pu.next': 'المستوى التالي «{name}» بعد {n} يوم',
  'pu.max': 'أعلى مستوى، الحمد لله',
  'pu.friend': 'سلسلة الصحبة مع {name}',
  'pu.friendDays': 'يوم صحبة متتالٍ',
  'lv.up': 'مستوى أعلى!',
  'lv.word': 'المستوى',
  'lv.sub': 'تجمع شخصيتك مزيدًا من النور كلما كبرت',
  'lv.b1': 'تقف شخصيتك الآن على هالة من نور',
  'lv.b2': 'هالة ناعمة من النور تحيط بشخصيتك الآن',
  'lv.b3': 'نوران يدوران الآن حول شخصيتك',
  'lv.b4': 'تتلألأ حواف شخصيتك بالنور الآن',
  'lv.b5': 'أشعة من نور ترتفع الآن خلف شخصيتك',
  'lv.b6': 'مشرقة: شخصيتك صارت ذهبية كلها',
};

/** A moment string, with {name} placeholders filled from `vars`. */
export function mt(key: MomentKey, vars?: Record<string, string | number>): string {
  const s = (lang() === 'ar' ? ar[key] : undefined) ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
