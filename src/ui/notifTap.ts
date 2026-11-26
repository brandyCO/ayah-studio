// One handler for every tapped notification (owner 2026-11-25: "many notifications open the Me tab"). Each module used
// to add its own listener, but the plugin hands a tap that started the app to the FIRST listener only (the others
// never hear it), and that was often the one that only knew '#/me'. Now every notification carries where it leads in
// `extra` and this, registered at start, takes it there:
//   hash   the screen ('#/me/streak', '#/me/goals', '#/me/badges', '#/me/level', '#/me/prayer', '#/ranks', '#/s/2/255' …)
//   sk/sv  a key and value noted in sessionStorage first (which goal tab, which badge, the league view)
//   focus  'claim': the goals screen brings the waiting chest into view
//   fid    that very chest (goal id, 'all') opens there
//   run    'gifts': the waiting gifts play once there
//   du/dus a prayer's du'a / after-salah adhkar open over the prayer screen
import { isNative } from '../native';

/** Where a notification leads (also each row of the Notifications screen, src/ui/notifText.ts). */
export interface NDest { hash: string; store?: [string, string]; run?: 'gifts'; fid?: string }

/** Goes to `to`. */
export function goTo(to: NDest) {
  if (to.store) try { sessionStorage.setItem(to.store[0], to.store[1]); } catch { /* private window */ }
  if (to.fid) try { sessionStorage.setItem('meFocusId', to.fid); } catch { /* private window */ }
  if (location.hash === to.hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = to.hash;
  if (to.run === 'gifts') setTimeout(() => void import('./giftOpen').then((m) => m.openWaitingGifts()), 400);
}

type Extra = { hash?: unknown; fid?: unknown; sk?: unknown; sv?: unknown; focus?: unknown; run?: unknown; du?: unknown; dus?: unknown } | undefined;

export function handleNotifTap(x: Extra) {
  if (!x) return;
  const hash = typeof x.hash === 'string' && x.hash.startsWith('#/') ? x.hash : '';
  const store: [string, string] | undefined = typeof x.sk === 'string' && typeof x.sv === 'string' ? [x.sk, x.sv] : undefined;
  if (x.focus === 'claim') try { sessionStorage.setItem('meFocus', 'claim'); } catch { /* private window */ }
  if (hash) goTo({ hash, store, run: x.run === 'gifts' ? 'gifts' : undefined, fid: typeof x.fid === 'string' ? x.fid : undefined });
  const du = typeof x.du === 'string' ? x.du : typeof x.dus === 'string' ? x.dus : '';
  if (du) {
    const kind = typeof x.du === 'string' ? 'adhan' : 'salah';
    setTimeout(() => void Promise.all([import('./prayerAlerts'), import('./adhkar')]).then(([pa, m]) => {
      if ((pa.ALERT_PRAYERS as readonly string[]).includes(du)) m.openDuas(kind, du as never);
    }), 1400);
  }
}

/** App start (Android / iPhone), before anything else listens. */
export function watchNotifTaps() {
  if (!isNative()) return;
  void import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => handleNotifTap(e.notification.extra as Extra))).catch(() => {});
}
