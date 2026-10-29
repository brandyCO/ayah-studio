// The whole mushaf on the device (owner request 2026-10-29: no loading pages while swiping). After the
// first page shows, the 604 page fonts (~95 MB) are downloaded quietly, two at a time while the app is
// idle, nearest to the page being read first, and kept for good (Cache Storage). Only on Wi-Fi (or a
// computer's connection); on mobile data the reader still fetches the pages around it as before.
// Stops while the app is hidden or offline and carries on later; once all are kept it never runs again.
import { PAGE_COUNT, keepPageFont, pageFontKept } from './mushaf';

const DONE = 'mushafKept';
let running = false;
let started = false;
let near = () => 1; // the page being read (the mushaf view updates it each time it opens)

interface Conn { type?: string; saveData?: boolean; addEventListener?(t: string, f: () => void): void }
const conn = (): Conn | undefined => (navigator as Navigator & { connection?: Conn }).connection;

/** Wi-Fi or a wired connection. Without the Network Information API (desktop Safari/Firefox) a
 *  computer counts as unmetered, a phone does not. */
function unmetered(): boolean {
  const c = conn();
  if (c?.saveData) return false;
  if (c?.type) return c.type === 'wifi' || c.type === 'ethernet';
  return !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

const idle = () => new Promise<void>((r) => ('requestIdleCallback' in window
  ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 200)));

/** Start (or resume) the background download around `near()`, the page being read. */
export function keepWholeMushaf(reading: () => number) {
  near = reading;
  try { if (localStorage.getItem(DONE)) return; } catch { /* storage blocked: still try */ }
  if (started) return;
  started = true;
  const go = () => { if (!running && document.visibilityState === 'visible' && navigator.onLine && unmetered()) void run(); };
  conn()?.addEventListener?.('change', go);
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', go);
  setTimeout(go, 4000); // after the first page and its neighbours
}

async function run() {
  running = true;
  try {
    const left = new Set<number>();
    for (let p = 1; p <= PAGE_COUNT; p++) if (!(await pageFontKept(p))) left.add(p);
    while (left.size) {
      if (document.visibilityState !== 'visible' || !navigator.onLine || !unmetered()) return;
      await idle();
      const at = near();
      const next = [...left].sort((a, b) => Math.abs(a - at) - Math.abs(b - at)).slice(0, 2);
      await Promise.all(next.map((p) => keepPageFont(p).then(() => left.delete(p), () => {})));
      if (next.every((p) => left.has(p))) return; // both failed: try again later
    }
    try { localStorage.setItem(DONE, '1'); } catch { /* ignore */ }
  } finally {
    running = false;
  }
}
