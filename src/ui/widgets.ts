// Android home-screen widgets (streak, tasbih, prayer times) and the lock-screen prayer line, fed
// by the web app (WidgetsPlugin.java): the streak, the next 14 days of prayer times and the dhikr
// phrases are handed over whenever they change; counts made on the tasbih widget come back into the
// journey when the app opens. Also the dhikr reminders (local notifications, at the times picked in
// Me). Web: nothing (the Me screen shows the same things).
import { registerPlugin } from '@capacitor/core';
import { addDhikr, streak, todayRec } from '../data/journey';
import { DHIKR, goals } from '../data/goals';
import { dayKey } from '../data/readLog';
import { PRAYERS, prayerDay, prayerSettings } from '../data/prayer';
import { locale, t, type Key } from '../i18n';
import { rewardPalette } from './theme';
import { isNative } from '../native';

interface WidgetData {
  streak: { days: number; lit: boolean; today: string; weeks: number; freeze: boolean; week: string[]; hist: Record<string, string>; best: number };
  theme: Record<string, string>;
  prayers: { days: { d: string; t: number[] }[]; names: string[]; place: string };
  dhikr: { id: string; ar: string; en: string; target: number }[];
  lockScreen: boolean;
  dhikrDay: string;
  dhikrToday: Record<string, number>;
  strings: Record<string, string>;
}
const Widgets = registerPlugin<{
  update(d: WidgetData): Promise<void>;
  takeTasbih(): Promise<{ counts?: Record<string, Record<string, number>> }>;
  status(): Promise<{ canPin: boolean; on: Record<WidgetKind, number> }>;
  pin(o: { kind: WidgetKind }): Promise<{ ok: boolean }>;
}>('Widgets');

export const WIDGETS = ['streak', 'tasbih', 'prayer', 'daily'] as const;
export type WidgetKind = (typeof WIDGETS)[number];
export interface WidgetStatus { canPin: boolean; on: Record<WidgetKind, number> }
const NONE: WidgetStatus = { canPin: false, on: { streak: 0, tasbih: 0, prayer: 0, daily: 0 } };
/** Which widgets are on the home screen (Android); web: none, and none can be added. */
export async function widgetStatus(): Promise<WidgetStatus> {
  if (!isNative()) return NONE;
  try {
    const r = await Widgets.status();
    return { canPin: !!r.canPin, on: { ...NONE.on, ...r.on } };
  } catch {
    return NONE; // an older app build without these calls
  }
}
/** Asks the launcher to place a widget; false when it cannot (the page then shows the steps). */
export async function pinWidget(kind: WidgetKind): Promise<boolean> {
  if (!isNative()) return false;
  try {
    syncWidgets(true);
    return (await Widgets.pin({ kind })).ok;
  } catch {
    return false;
  }
}

async function data(): Promise<WidgetData> {
  const s = streak();
  const ps = prayerSettings();
  const days: { d: string; t: number[] }[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const times = await prayerDay(date, ps);
    if (!times) break;
    days.push({ d: dayKey(date), t: times.map((x) => x.getTime()) });
  }
  const g = goals();
  const str = (k: string) => t(k as Key);
  // This week and last week, day by day: the widget lays out Monday → Sunday itself, so a new day
  // or a new week shows right even before the app opens again.
  const hist: Record<string, string> = {};
  for (const w of [...streak(new Date(Date.now() - 7 * 86_400_000)).week, ...s.week]) {
    if (w.state === 'lit' || w.state === 'frozen' || w.state === 'revived') hist[w.day] = w.state;
  }
  const narrow = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const letters = Array.from({ length: 7 }, (_, i) => narrow.format(new Date(2026, 0, 5 + i))); // 5 Jan 2026 is a Monday
  return {
    streak: { days: s.days, lit: s.litToday, today: dayKey(), weeks: s.weeks, freeze: s.freeze.free, week: s.week.map((w) => w.state), hist, best: s.best },
    theme: widgetTheme(),
    prayers: { days, names: PRAYERS.map((p) => str(`pr.${p}`)), place: ps.lat !== null ? `${ps.lat.toFixed(2)}, ${ps.lng!.toFixed(2)}` : '' },
    dhikr: DHIKR.map((d) => ({ id: d.id, ar: d.ar, en: str(d.key), target: g.dhikr[d.id] || 33 })),
    lockScreen: ps.lockScreen && days.length > 0,
    dhikrDay: dayKey(),
    dhikrToday: { ...(todayRec().dk ?? {}) },
    strings: {
      dayStreak: str('w.dayStreak'), litToday: str('w.litToday'), openToday: str('w.openToday'), start: str('w.start'),
      weeks: str('w.weeks'), next: str('w.next'), noLocation: str('w.noLocation'), tapToCount: str('w.tapToCount'),
      prayerChannel: str('w.prayerChannel'), letters: letters.join('|'), best: str('w.best'), streakHead: str('w.streakHead'),
      todayAyah: str('wg.dailyHead'),
    },
  };
}

let timer = 0;
/** Hands the widgets fresh data (debounced). */
export function syncWidgets(now = false) {
  if (!isNative()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void data().then((d) => Widgets.update(d)).catch(() => {}), now ? 0 : 1500);
}

/** Counts made on the tasbih widget since the app last looked → today's (or that day's) journey. */
async function pullTasbih() {
  try {
    const { counts } = await Widgets.takeTasbih();
    for (const [day, byId] of Object.entries(counts ?? {})) {
      const [y, m, d] = day.split('-').map(Number);
      const at = new Date(y, m - 1, d, 12);
      for (const [id, n] of Object.entries(byId)) if (n > 0 && DHIKR.some((x) => x.id === id)) addDhikr(id, n, at);
    }
  } catch {
    /* an older app build without the plugin */
  }
}

// --- dhikr reminders ---
export const REMINDER_TIMES = ['06:30', '09:00', '13:00', '17:00', '21:00'] as const;
const REMIND_IDS = REMINDER_TIMES.map((_, i) => 3000 + i);
export function dhikrReminders(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('dhikrReminders') ?? '[]');
    return Array.isArray(v) ? v.filter((x) => (REMINDER_TIMES as readonly string[]).includes(x)) : [];
  } catch {
    return [];
  }
}
/** Saves the reminder times and schedules them (daily). False when notifications are not allowed. */
export async function setDhikrReminders(times: string[]): Promise<boolean> {
  try { localStorage.setItem('dhikrReminders', JSON.stringify(times)); } catch { /* ignore */ }
  if (!isNative()) return true;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: REMIND_IDS.map((id) => ({ id })) });
  if (!times.length) return true;
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  if (p.display !== 'granted') return false;
  await LocalNotifications.schedule({
    notifications: times.map((time) => {
      const [hour, minute] = time.split(':').map(Number);
      return {
        id: REMIND_IDS[REMINDER_TIMES.indexOf(time as (typeof REMINDER_TIMES)[number])],
        title: t('rem.title'), body: t('rem.body'), smallIcon: 'ic_stat_crescent',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        extra: { hash: '#/me' },
      };
    }),
  });
  return true;
}

/** Asks Android to allow notifications (the lock-screen prayer line needs it). */
export async function allowNotifications(): Promise<boolean> {
  if (!isNative()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

/** Android app start: pull widget counts, keep the widgets in step from now on. */
export function initWidgets() {
  if (!isNative()) return;
  void import('./prayerAlerts').then((m) => m.initPrayerAlerts());
  const refresh = () => void pullTasbih().then(() => syncWidgets(true));
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  for (const ev of ['journey-changed', 'prayer-changed', 'readlog-changed', 'theme-changed']) window.addEventListener(ev, () => syncWidgets());
  void import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const hash = e.notification.extra?.hash;
      if (hash === '#/me') location.hash = '#/me';
    })).catch(() => {});
}

/** The theme colours for the widgets (hex): the flame, the week's checks, the glow and the night. */
function widgetTheme(): Record<string, string> {
  const p = rewardPalette();
  const hsl = (hue: number, sat: number, l: number) => {
    const a = (sat / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  return { deep: p.deep, deep2: p.deep2, n1: p.n1, n2: p.n2, n3: p.n3, hi: p.hi, core: p.core,
    night: hsl(p.hue, 55, 13), night2: hsl(p.hue, 40, 7), night3: hsl(p.hue, 35, 4) };
}
