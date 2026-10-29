// The user's location, rounded to 0.01° (about 1 km; the town, not the street), for prayer times and
// Ramadan reminders. It never leaves the device. Android app: @capacitor/geolocation (Google's fused
// location, which works with "approximate" permission); the WebView's own navigator.geolocation timed
// out or reported "not allowed" on phones where the permission was granted. Web: navigator.geolocation.
import { isNative } from '../native';

export type LocFail = 'denied' | 'off' | 'timeout' | 'unsupported';
export type LocResult = { ok: true; lat: number; lng: number } | { ok: false; why: LocFail };

const round = (x: number) => Math.round(x * 100) / 100;
const MAX_AGE = 6 * 3600_000;

/** `ask`: the user tapped a button, so the permission may be asked for; otherwise only used when granted. */
export async function getLocation(ask = true): Promise<LocResult> {
  if (isNative()) return nativeLocation(ask);
  if (!navigator.geolocation) return { ok: false, why: 'unsupported' };
  if (!ask) {
    try {
      const q = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (q?.state !== 'granted') return { ok: false, why: 'denied' };
    } catch {
      return { ok: false, why: 'denied' };
    }
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }),
      (e) => resolve({ ok: false, why: e.code === 1 ? 'denied' : e.code === 2 ? 'off' : 'timeout' }),
      { maximumAge: MAX_AGE, timeout: 20_000 });
  });
}

const why = (e: unknown): LocFail => {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (/not enabled|disabled|services|turned off|location settings/.test(m)) return 'off';
  if (/denied|permission/.test(m)) return 'denied';
  return 'timeout';
};

async function nativeLocation(ask: boolean): Promise<LocResult> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const granted = (p: { location: string; coarseLocation: string }) => p.location === 'granted' || p.coarseLocation === 'granted';
    let p = await Geolocation.checkPermissions();
    if (!granted(p)) {
      if (!ask) return { ok: false, why: 'denied' };
      p = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
      if (!granted(p)) return { ok: false, why: 'denied' };
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 20_000, maximumAge: MAX_AGE });
    return { ok: true, lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
  } catch (e) {
    return { ok: false, why: why(e) };
  }
}
