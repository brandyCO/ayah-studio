// Prayer times (Me tab, widgets, lock screen): worked out on the device with `adhan` from the
// user's location (rounded to ~1 km; it never leaves the device) and a calculation method (picked
// from the time zone at first, changeable). localStorage `prayer`.
import type { PrayerTimes as PT } from 'adhan';
import { getLocation, type LocResult } from './location';

export const METHODS = ['MuslimWorldLeague', 'UmmAlQura', 'Egyptian', 'Karachi', 'NorthAmerica', 'Dubai', 'Qatar',
  'Kuwait', 'Singapore', 'Turkey', 'Tehran', 'MoonsightingCommittee'] as const;
export type Method = (typeof METHODS)[number];
export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerName = (typeof PRAYERS)[number];

export interface PrayerSettings {
  lat: number | null;
  lng: number | null;
  method: Method;
  hanafi: boolean;
  /** Android: the next prayer on the lock screen (a silent notification that stays). */
  lockScreen: boolean;
}

/** A first guess from the time zone; the user can change it. */
function guessMethod(): { method: Method; hanafi: boolean } {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { /* ignore */ }
  const m: Record<string, Method> = {
    'Asia/Riyadh': 'UmmAlQura', 'Asia/Aden': 'UmmAlQura', 'Africa/Cairo': 'Egyptian', 'Asia/Karachi': 'Karachi',
    'Asia/Dubai': 'Dubai', 'Asia/Muscat': 'Dubai', 'Asia/Qatar': 'Qatar', 'Asia/Bahrain': 'Qatar', 'Asia/Kuwait': 'Kuwait',
    'Asia/Singapore': 'Singapore', 'Asia/Kuala_Lumpur': 'Singapore', 'Asia/Jakarta': 'Singapore', 'Asia/Makassar': 'Singapore',
    'Asia/Jayapura': 'Singapore', 'Asia/Brunei': 'Singapore', 'Europe/Istanbul': 'Turkey', 'Asia/Tehran': 'Tehran',
  };
  const method = m[tz] ?? (tz.startsWith('America/') ? 'NorthAmerica' : 'MuslimWorldLeague');
  const hanafi = ['Asia/Karachi', 'Asia/Kabul', 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Calcutta', 'Europe/Istanbul', 'Asia/Tashkent'].includes(tz);
  return { method, hanafi };
}

export function prayerSettings(): PrayerSettings {
  const base: PrayerSettings = { lat: null, lng: null, lockScreen: false, ...guessMethod() };
  try {
    const v = JSON.parse(localStorage.getItem('prayer') ?? 'null');
    if (!v || typeof v !== 'object') return base;
    const num = (x: unknown, lim: number) => (typeof x === 'number' && Math.abs(x) <= lim ? x : null);
    return {
      lat: num(v.lat, 90), lng: num(v.lng, 180),
      method: METHODS.includes(v.method) ? v.method : base.method,
      hanafi: typeof v.hanafi === 'boolean' ? v.hanafi : base.hanafi,
      lockScreen: v.lockScreen === true,
    };
  } catch {
    return base;
  }
}
export function setPrayerSettings(s: PrayerSettings) {
  try {
    localStorage.setItem('prayer', JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('prayer-changed'));
}

let lib: typeof import('adhan') | null = null;
export const loadAdhan = async () => (lib ??= await import('adhan'));

/** The six times of a day (Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha), or null without a location. */
export async function prayerDay(date = new Date(), s = prayerSettings()): Promise<Date[] | null> {
  if (s.lat === null || s.lng === null) return null;
  const a = await loadAdhan();
  const params = a.CalculationMethod[s.method]();
  params.madhab = s.hanafi ? a.Madhab.Hanafi : a.Madhab.Shafi;
  if (Math.abs(s.lat) > 48) params.highLatitudeRule = a.HighLatitudeRule.recommended(new a.Coordinates(s.lat, s.lng));
  const p: PT = new a.PrayerTimes(new a.Coordinates(s.lat, s.lng), date, params);
  return [p.fajr, p.sunrise, p.dhuhr, p.asr, p.maghrib, p.isha];
}

/** The next prayer (sunrise is not one) from now, possibly tomorrow's Fajr. */
export async function nextPrayer(now = new Date()): Promise<{ name: PrayerName; at: Date } | null> {
  const today = await prayerDay(now);
  if (!today) return null;
  for (let i = 0; i < 6; i++) if (i !== 1 && today[i] > now) return { name: PRAYERS[i], at: today[i] };
  const tomorrow = await prayerDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return tomorrow ? { name: 'fajr', at: tomorrow[0] } : null;
}

/** Asks for the location (rounded to 0.01°, about 1 km) and saves it. */
export async function locatePrayer(): Promise<LocResult> {
  const r = await getLocation(true);
  if (r.ok) setPrayerSettings({ ...prayerSettings(), lat: r.lat, lng: r.lng });
  return r;
}
