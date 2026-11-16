// iPhone app: WKWebView has no navigator.vibrate, so every tap, claim and celebration would be felt on Android only.
// Here vibrate() is given to the page backed by the Taptic Engine (ios/App/App/HapticPlugin.swift): each "on" part
// of a pattern becomes one tap, light for short ones (≤ 10 ms, e.g. a chip), medium (≤ 20), firm beyond; "off" parts
// keep their spacing. Same calls as Android (src/ui/dom.ts haptic(), celebrate.ts, rankMoment.ts).
import { Capacitor, registerPlugin } from '@capacitor/core';

const Haptic = registerPlugin<{ impact(o: { style: 'light' | 'medium' | 'heavy' }): Promise<void> }>('Haptic');

export function installIosHaptics() {
  if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('Haptic')) return;
  const tap = (ms: number) => void Haptic.impact({ style: ms <= 10 ? 'light' : ms <= 20 ? 'medium' : 'heavy' }).catch(() => {});
  const vibrate = (p: VibratePattern): boolean => {
    const parts = typeof p === 'number' ? [p] : Array.from(p);
    let at = 0;
    parts.forEach((ms, i) => {
      if (i % 2 === 0 && ms > 0) { if (at === 0) tap(ms); else window.setTimeout(() => tap(ms), at); }
      at += Math.max(0, ms);
    });
    return true;
  };
  try { Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true }); } catch { /* read-only: no haptics */ }
}
