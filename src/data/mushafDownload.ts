// The whole mushaf on the device (owner requests 2026-10-29 and 2026-11-09: every page readable offline as
// soon as possible). The Android app carries all 604 page fonts inside the APK, so there is nothing to
// download there. On the web (and iPhone) the fonts (~95 MB) are kept by the service worker:
// - with the reader's yes ("Download the whole mushaf", asked once on the mushaf and always in Me →
//   Settings → Reading) it runs on any connection, six pages at a time, nearest to the page being read
//   first, and asks the browser to keep the storage for good;
// - without it, it still runs quietly on Wi-Fi (or a computer's connection), three at a time.
// Stops while the app is hidden or offline and carries on later; once all are kept it never runs again.
// For a large crowd: it can be switched off remotely (`mushafDownload`), and when the server says it is
// busy or failing it rests 5–15 minutes.
import { Capacitor } from '@capacitor/core';
import { PAGE_COUNT, keepPageFont, pageFontKept } from './mushaf';
import { remoteConfig } from '../net';

const DONE = 'mushafKept';
const OK = 'mushafOk';
export const MUSHAF_MB = 95;
let running = false;
let started = false;
let kept = -1; // pages on the device, once counted
let near = () => 1; // the page being read (the mushaf view updates it each time it opens)

interface Conn { type?: string; saveData?: boolean; addEventListener?(t: string, f: () => void): void }
const conn = (): Conn | undefined => (navigator as Navigator & { connection?: Conn }).connection;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Wi-Fi or a wired connection. Without the Network Information API (desktop Safari/Firefox) a
 *  computer counts as unmetered, a phone does not. */
export function unmetered(): boolean {
  const c = conn();
  if (c?.saveData) return false;
  if (c?.type) return c.type === 'wifi' || c.type === 'ethernet';
  return !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

export const idle = () => new Promise<void>((r) => ('requestIdleCallback' in window
  ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 200)));

/** The whole mushaf is on this device (always in the Android app). */
export const mushafKept = () => Capacitor.isNativePlatform() || !!get(DONE);
/** The reader said yes to the download (any connection). */
export const mushafAllowed = () => !!get(OK);

export interface MushafProgress { kept: number; total: number; running: boolean; done: boolean; allowed: boolean }
export function mushafProgress(): MushafProgress {
  const done = mushafKept();
  return { kept: done ? PAGE_COUNT : Math.max(0, kept), total: PAGE_COUNT, running, done, allowed: mushafAllowed() };
}
/** Count the pages already on this device (for the progress shown before a run). */
export async function countMushafKept() {
  if (kept >= 0 || mushafKept()) return;
  let n = 0;
  for (let p = 1; p <= PAGE_COUNT; p++) if (await pageFontKept(p)) n++;
  if (kept < 0) { kept = n; changed(); }
}
const changed = () => window.dispatchEvent(new Event('mushaf-download'));

const go = () => {
  if (!running && !mushafKept() && document.visibilityState === 'visible' && navigator.onLine && (mushafAllowed() || unmetered())) void run();
};

/** The reader's yes: download every page now, on any connection. */
export function allowMushafDownload() {
  set(OK, '1');
  void navigator.storage?.persist?.().catch(() => false);
  restUntil = 0;
  listen();
  go();
  changed();
}

function listen() {
  if (started) return;
  started = true;
  conn()?.addEventListener?.('change', go);
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', go);
}

/** Start (or resume) the background download around `near()`, the page being read. */
export function keepWholeMushaf(reading: () => number) {
  near = reading;
  if (Capacitor.isNativePlatform()) { dropOldAppCopies(); return; }
  if (mushafKept() || started) return;
  listen();
  // After the first page and its neighbours have loaded.
  setTimeout(go, mushafAllowed() ? 1500 : 4000 + Math.random() * 26e3);
}

/** Before the pages were in the APK the app downloaded them into Cache Storage `qcf-v2`; free that space. */
function dropOldAppCopies() {
  if (get('qcfDropped')) return;
  set('qcfDropped', '1');
  void caches?.delete('qcf-v2').catch(() => false);
}

let restUntil = 0;

async function run() {
  if (Date.now() < restUntil) return;
  running = true;
  changed();
  try {
    if (!(await remoteConfig()).mushafDownload) return;
    const left = new Set<number>();
    for (let p = 1; p <= PAGE_COUNT; p++) if (!(await pageFontKept(p))) left.add(p);
    kept = PAGE_COUNT - left.size;
    changed();
    while (left.size) {
      const fast = mushafAllowed();
      if (document.visibilityState !== 'visible' || !navigator.onLine || !(fast || unmetered())) return;
      if (!fast) await idle();
      const at = near();
      const next = [...left].sort((a, b) => Math.abs(a - at) - Math.abs(b - at)).slice(0, fast ? 6 : 3);
      await Promise.all(next.map((p) => keepPageFont(p).then(() => { left.delete(p); kept++; }, () => {})));
      changed();
      if (next.every((p) => left.has(p))) {
        // All failed (busy server, bad connection): rest a while, then carry on.
        restUntil = Date.now() + 5 * 60e3 + Math.random() * 10 * 60e3;
        setTimeout(go, restUntil - Date.now() + 100);
        return;
      }
    }
    set(DONE, '1');
  } finally {
    running = false;
    changed();
  }
}
