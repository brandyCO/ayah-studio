// The ayah of the day in the Android app (docs/grow.md, G2): an optional morning notification
// (off by default, at most one a morning, never between 22:00 and 06:00) and the home-screen widget's
// texts in the chosen translation (DailyAyahWidget.java via DailyPlugin.java). Taps on either open
// the ayah. The web build shows the ayah of the day on the Today card only.
import { registerPlugin } from '@capacitor/core';
import { loadMeta, reference, surahText, surahTranslation } from '../data/quran';
import { loadDaily, pick } from '../data/daily';
import { currentTranslation, translationInfo } from '../data/translations';
import { t } from '../i18n';
import { isNative } from '../native';
import { h, toast } from './dom';

const Daily = registerPlugin<{
  store(o: { texts: Record<string, string>; names: Record<string, string>; credit: string; lang: DailyLang; images: Record<string, string> }): Promise<void>;
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

export type DailyLang = 'ar' | 'tr';
/** The daily ayah widget's text: the Arabic (drawn by the app in the Quran font) or the translation. */
export function dailyWidgetLang(): DailyLang {
  try { return localStorage.getItem('dailyWidgetLang') === 'ar' ? 'ar' : 'tr'; } catch { return 'tr'; }
}
export function setDailyWidgetLang(v: DailyLang) {
  try { localStorage.setItem('dailyWidgetLang', v); } catch { /* ignore */ }
  if (isNative()) void storeWidgetTexts().catch((e) => console.warn('Widget texts not stored', e));
}

const AR_DAYS = 21; // Arabic pictures are made for the next three weeks; the app renews them on start
/** The ayat as a white picture (transparent background) in the KFGQPC font: the widget cannot use the
 *  app's Quran font, and the Quran is never drawn in a system font. Wrapped only between words, never
 *  cut (rule 1); the widget tints it and scales it to fit. */
async function arabicPicture(text: string): Promise<string> {
  const W = 960;
  const font = (px: number) => `${px}px UthmanicHafs`;
  await document.fonts.load(font(60), text).catch(() => {});
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const words = text.split(' ');
  const wrap = (px: number) => {
    ctx.font = font(px);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && ctx.measureText(next).width > W) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  let px = 64;
  let lines = wrap(px);
  while (px > 30 && lines.length * px * 1.75 > 470) lines = wrap(--px);
  const lh = Math.round(px * 1.75);
  c.width = W;
  c.height = lines.length * lh + Math.round(px * 0.6);
  ctx.font = font(px);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, i * lh + Math.round(px * 1.3)));
  return c.toDataURL('image/png').split(',')[1];
}

/** The widget shows the chosen translation, or the Arabic as pictures: hand it the whole list. */
async function storeWidgetTexts() {
  const [d, meta] = await Promise.all([loadDaily(), loadMeta()]);
  const info = translationInfo(currentTranslation());
  const lang = dailyWidgetLang();
  const texts: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const x of d.items) {
    const tr = await surahTranslation(x.s, info.id);
    texts[key(x)] = tr.slice(x.from - 1, x.to).join(' ');
    names[String(x.s)] = meta[x.s - 1].en;
  }
  const images: Record<string, string> = {};
  if (lang === 'ar') {
    const now = new Date();
    for (let i = 0; i < AR_DAYS; i++) {
      const x = pick(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
      if (images[key(x)]) continue;
      const ar = await surahText(x.s);
      images[key(x)] = await arabicPicture(ar.slice(x.from - 1, x.to).join(' '));
    }
  }
  await Daily.store({ texts, names, credit: info.translator, lang, images });
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

/** Settings → Morning ayah (Android app): on/off and the time. */
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
