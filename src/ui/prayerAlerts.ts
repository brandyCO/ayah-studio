// Prayer reminders (Android; Me → Settings → Prayer reminders): a notification for each prayer the
// user turned on, at its time or 5–30 minutes before, worked out on the phone from their own
// location (prayer.ts). The next 10 days are scheduled (ids 3100–3149) and scheduled again whenever
// the app opens, the settings or the location change, so the times follow the seasons and travel
// (the location is refreshed quietly at most every 6 h, only when the phone already allows it).
// Sounds: the opening "Allahu Akbar, Allahu Akbar" of the Madinah adhan (res/raw/prayer_adhan.ogg, a
// 21 s clip the owner supplied, 2026-10-29), a soft chime (res/raw/prayer_chime.wav, generated), the
// phone's own sound, or silent.
// localStorage `prayerAlerts`.
import { PRAYERS, prayerDay, prayerSettings, setPrayerSettings, type PrayerName } from '../data/prayer';
import { locale, t, type Key } from '../i18n';
import { isNative } from '../native';

export const ALERT_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const satisfies readonly PrayerName[];
export type AlertPrayer = (typeof ALERT_PRAYERS)[number];
export const BEFORE = [0, 5, 10, 15, 30] as const;
export const SOUNDS = ['adhan', 'chime', 'default', 'quiet'] as const;
export type AlertSound = (typeof SOUNDS)[number];
export interface PrayerAlerts { on: Record<AlertPrayer, boolean>; before: number; sound: AlertSound }

const DAYS = 10;
const BASE = 3100;
const IDS = Array.from({ length: DAYS * ALERT_PRAYERS.length }, (_, i) => BASE + i);
const OFF: Record<AlertPrayer, boolean> = { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false };

export function prayerAlerts(): PrayerAlerts {
  const base: PrayerAlerts = { on: { ...OFF }, before: 0, sound: 'adhan' };
  try {
    const v = JSON.parse(localStorage.getItem('prayerAlerts') ?? 'null');
    if (!v || typeof v !== 'object') return base;
    const on = { ...OFF };
    for (const p of ALERT_PRAYERS) on[p] = v.on?.[p] === true;
    return {
      on,
      before: (BEFORE as readonly number[]).includes(v.before) ? v.before : 0,
      sound: (SOUNDS as readonly string[]).includes(v.sound) ? v.sound : 'adhan',
    };
  } catch {
    return base;
  }
}
export const anyAlert = (a = prayerAlerts()) => ALERT_PRAYERS.some((p) => a.on[p]);

/** Saves the settings and schedules them; false when notifications are not allowed. */
export async function setPrayerAlerts(a: PrayerAlerts): Promise<boolean> {
  try { localStorage.setItem('prayerAlerts', JSON.stringify(a)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('prayer-alerts-changed'));
  return schedulePrayerAlerts(true);
}

type LN = typeof import('@capacitor/local-notifications').LocalNotifications;
let channels: Promise<void> | null = null;
const makeChannels = (ln: LN) => (channels ??= (async () => {
  const name = t('pa.title');
  await ln.createChannel({ id: 'prayer_adhan', name: `${name} · ${t('pa.s.adhan')}`, importance: 4, sound: 'prayer_adhan.ogg', vibration: true, visibility: 1 });
  await ln.createChannel({ id: 'prayer_chime', name: `${name} · ${t('pa.s.chime')}`, importance: 4, sound: 'prayer_chime.wav', vibration: true, visibility: 1 });
  await ln.createChannel({ id: 'prayer_default', name: `${name} · ${t('pa.s.default')}`, importance: 4, vibration: true, visibility: 1 });
  await ln.createChannel({ id: 'prayer_quiet', name: `${name} · ${t('pa.s.quiet')}`, importance: 2, vibration: false, visibility: 1 });
})().catch(() => { channels = null; }));

let sample: HTMLAudioElement | null = null;
/** Plays the reminder sound once in the app, so the choice can be heard (the chime has no web copy). */
export function previewSound(s: AlertSound) {
  sample?.pause();
  sample = null;
  if (s !== 'adhan') return;
  sample = new Audio('sounds/prayer-adhan.ogg');
  void sample.play().catch(() => {});
}

/** Whether Android lets reminders ring on the minute (else they can be a few minutes late). */
export async function exactAllowed(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return true;
  }
}
/** Opens Android's "Alarms & reminders" setting for the app. */
export async function askExact(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return false;
  }
}

let running: Promise<boolean> | null = null;
let again = false;
/** Cancels and schedules the next 10 days. `ask`: the user just acted, so a permission may be asked. */
export function schedulePrayerAlerts(ask = false): Promise<boolean> {
  if (!isNative()) return Promise.resolve(true);
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      return await scheduleNow(ask);
    } catch {
      return false;
    } finally {
      running = null;
      if (again) { again = false; void schedulePrayerAlerts(); }
    }
  })();
  return running;
}

async function scheduleNow(ask: boolean): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) });
  const a = prayerAlerts();
  const ps = prayerSettings();
  if (!anyAlert(a) || ps.lat === null) return true;
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
  if (p.display !== 'granted') return false;
  await makeChannels(LocalNotifications);
  // Exact only when Android already allows it: scheduling an exact alarm without the permission
  // would open the system setting by itself, every time the app opens.
  const exact = await exactAllowed();
  const fmt = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
  const now = Date.now();
  const list = [];
  const d0 = new Date();
  for (let day = 0; day < DAYS; day++) {
    const times = await prayerDay(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + day), ps);
    if (!times) break;
    for (const [k, name] of ALERT_PRAYERS.entries()) {
      if (!a.on[name]) continue;
      const time = times[PRAYERS.indexOf(name)];
      const at = time.getTime() - a.before * 60_000;
      if (at < now + 5_000) continue;
      const pn = t(`pr.${name}` as Key);
      list.push({
        id: BASE + day * ALERT_PRAYERS.length + k,
        title: a.before ? t('pa.soon', { name: pn, n: a.before }) : t('pa.now', { name: pn }),
        body: t('pa.body', { name: pn, time: fmt.format(time) }),
        smallIcon: 'ic_stat_crescent',
        channelId: `prayer_${a.sound}`,
        schedule: { at: new Date(at), allowWhileIdle: true },
        isExactNotification: exact,
        extra: { hash: '#/me' },
      });
    }
  }
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return true;
}

/** Travel: a fresh location (rounded as always) when the phone already allows it, at most every 6 h. */
async function relocate() {
  const ps = prayerSettings();
  if (ps.lat === null || !(anyAlert() || ps.lockScreen)) return;
  let last = 0;
  try { last = Number(localStorage.getItem('prayerLocAt') ?? 0); } catch { /* ignore */ }
  if (Date.now() - last < 6 * 3600_000) return;
  const r = await (await import('../data/location')).getLocation(false);
  if (!r.ok) return;
  try { localStorage.setItem('prayerLocAt', String(Date.now())); } catch { /* ignore */ }
  const cur = prayerSettings();
  if (cur.lat !== r.lat || cur.lng !== r.lng) setPrayerSettings({ ...cur, lat: r.lat, lng: r.lng });
}

/** Android app start: keep the reminders scheduled ahead, and follow location and settings changes. */
export function initPrayerAlerts() {
  if (!isNative()) return;
  let lastRun = 0;
  const refresh = () => {
    if (Date.now() - lastRun < 3600_000) return;
    lastRun = Date.now();
    void relocate();
    if (anyAlert()) void schedulePrayerAlerts();
  };
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  let timer = 0;
  window.addEventListener('prayer-changed', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => { if (anyAlert()) void schedulePrayerAlerts(); }, 800);
  });
}
