// The ayah of the day in the Android app (docs/grow.md, G2): an optional morning notification
// (off by default, at most one a morning, never between 22:00 and 06:00) and the home-screen widget's
// texts in the chosen translation (DailyAyahWidget.java via DailyPlugin.java). Taps on either open
// the ayah. The web build shows the ayah of the day on the Today card only.
import { registerPlugin } from '@capacitor/core';
import { loadMeta, reference, surahTranslation } from '../data/quran';
import { loadDaily, pick } from '../data/daily';
import { currentTranslation, translationInfo } from '../data/translations';
import { t } from '../i18n';
import { isNative } from '../native';
import { h, toast } from './dom';

const Daily = registerPlugin<{
  store(o: { texts: Record<string, string>; names: Record<string, string>; credit: string }): Promise<void>;
  takeLaunchHash(): Promise<{ hash?: string }>;
}>('Daily');

const IDS = Array.from({ length: 14 }, (_, i) => 2000 + i); // the next 14 mornings
export interface MorningSettings { on: boolean; time: string } // HH:MM, 06:00–21:59
const DEFAULT: MorningSettings = { on: false, time: '07:30' };

export function morningSettings(): MorningSettings {
  try {
    const v = JSON.parse(localStorage.getItem('morningAyah') ?? 'null') as Partial<MorningSettings> | null;
    return v && typeof v.on === 'boolean' && typeof v.time === 'string' && quietOk(v.time) ? { on: v.on, time: v.time } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}
const quietOk = (time: string) => {
  const m = /^(\d\d):(\d\d)$/.exec(time);
  return !!m && Number(m[1]) >= 6 && Number(m[1]) <= 21 && Number(m[2]) < 60;
};
function setMorning(s: MorningSettings) {
  try {
    localStorage.setItem('morningAyah', JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const key = (x: { s: number; from: number; to: number }) => `${x.s}:${x.from}${x.to > x.from ? `-${x.to}` : ''}`;

/** (Re)schedules the next 14 mornings; returns false if notifications are not allowed. */
export async function scheduleMorning(): Promise<boolean> {
  if (!isNative()) return true;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) });
  const st = morningSettings();
  if (!st.on) return true;
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  if (p.display !== 'granted') return false;
  const [d, meta] = await Promise.all([loadDaily(), loadMeta()]);
  const info = translationInfo(currentTranslation());
  const [hh, mm] = st.time.split(':').map(Number);
  const now = new Date();
  const list = [];
  for (let k = 0; k < 15 && list.length < IDS.length; k++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm);
    if (at.getTime() < Date.now() + 60_000) continue;
    const x = pick(d, at);
    const tr = await surahTranslation(x.s, info.id).catch(() => null);
    const body = tr ? tr.slice(x.from - 1, x.to).join(' ') : x.en; // the whole translation, never cut
    list.push({
      id: IDS[list.length], title: t('today.ayah', { ref: reference(meta[x.s - 1], x.from, x.to) }), body, largeBody: body,
      smallIcon: 'ic_stat_crescent', schedule: { at, allowWhileIdle: true }, extra: { hash: `#/s/${x.s}/${x.from}` },
    });
  }
  await LocalNotifications.schedule({ notifications: list });
  return true;
}

/** The widget shows the chosen translation: hand it the texts of the whole list. */
async function storeWidgetTexts() {
  const [d, meta] = await Promise.all([loadDaily(), loadMeta()]);
  const info = translationInfo(currentTranslation());
  const texts: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const x of d.items) {
    const tr = await surahTranslation(x.s, info.id);
    texts[key(x)] = tr.slice(x.from - 1, x.to).join(' ');
    names[String(x.s)] = meta[x.s - 1].en;
  }
  await Daily.store({ texts, names, credit: info.translator });
}

/** App start (Android): taps on the widget or a notification open the ayah; keep the widget and the
 *  mornings in step with the chosen translation. */
export async function initDailyNative() {
  if (!isNative()) return;
  const takeHash = () => Daily.takeLaunchHash().then((r) => { if (r.hash?.startsWith('#/')) location.hash = r.hash; }).catch(() => {});
  await takeHash();
  const { App } = await import('@capacitor/app');
  void App.addListener('resume', () => void takeHash());
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  void LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const hash = e.notification.extra?.hash;
    if (typeof hash === 'string' && hash.startsWith('#/s/')) location.hash = hash;
  });
  const sync = () => { void storeWidgetTexts().catch((e) => console.warn('Widget texts not stored', e)); void scheduleMorning().catch(() => {}); };
  sync();
  window.addEventListener('translation-changed', sync);
}

/** ☰ → Morning ayah (Android app): on/off and the time. */
export function openMorning() {
  const st = morningSettings();
  const time = h('input', { type: 'time', class: 'search', value: st.time, min: '06:00', max: '21:59' });
  const save = async (on: boolean) => {
    if (!quietOk(time.value)) { toast(t('morning.quiet')); return; }
    setMorning({ on, time: time.value });
    const ok = await scheduleMorning();
    if (!ok) { setMorning({ on: false, time: time.value }); toast(t('morning.denied')); }
    else toast(on ? t('morning.onToast', { time: time.value }) : t('morning.offToast'));
    d.close();
  };
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('morning.title')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', { class: 'muted small' }, t('morning.note')),
    h('label', { class: 'sub-row' }, h('span', {}, t('morning.time')), time),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => void save(true) }, st.on ? t('morning.save') : t('morning.turnOn')),
      st.on ? h('button', { class: 'chip', onclick: () => void save(false) }, t('morning.turnOff')) : null));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}
