// Offline use: registers the service worker (public/sw.js), then — once it controls the page —
// loads the bundled data, fonts, default backgrounds and the editor in the background, so they are
// kept on the device even before they are first needed. Recitation audio is kept per reel by
// src/data/audioCache.ts.
import { isNative } from './native';
import { unmetered } from './data/mushafDownload';

const BASE = import.meta.env.BASE_URL;
const DATA = ['meta.json', 'quran-uthmani.json', 'en-sahih.json', 'en-wbw.json', 'mushaf.json', 'word-map.json', 'divisions.json', 'adhkar.json', 'duas.json'];
// The surah header names are one tiny font per surah (src/ui/suraName.ts), all 114 kept for offline reading.
const FONTS = ['UthmanicHafs.woff2', 'AmiriQuran.woff2', 'bismillah.svg',
  ...Array.from({ length: 114 }, (_, i) => `suras/s${String(i + 1).padStart(3, '0')}.woff2`)];

export function setupOffline() {
  // Only for the built web app over http(s): not the dev server, and not the Android app (Capacitor),
  // whose files are on the device already.
  if (isNative() || !import.meta.env.PROD || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register(`${BASE}sw.js`).catch((e) => console.warn('Offline mode unavailable', e));
  // Once per app version: afterwards everything is in the cache, and re-reading it on every launch
  // (the editor, the data files) only costs the phone time and memory.
  const build = `${__DATA_VERSION__}|${document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? ''}`;
  const warm = () => {
    try { if (localStorage.getItem('warmedUp') === build) return; } catch { /* storage blocked */ }
    window.setTimeout(() => void idleThen(warmUp).then((ok) => { if (ok) try { localStorage.setItem('warmedUp', build); } catch { /* ignore */ } }), 3000);
  };
  if (navigator.serviceWorker.controller) warm();
  else navigator.serviceWorker.addEventListener('controllerchange', warm, { once: true });
}

async function warmUp(): Promise<boolean> {
  const urls = [...DATA.map((f) => `${BASE}data/${f}?v=${__DATA_VERSION__}`), ...FONTS.map((f) => `${BASE}fonts/${f}`)];
  let ok = true;
  for (const u of urls) await fetch(u).then((r) => { if (!r.ok) ok = false; }, () => { ok = false; });
  // The studio and its backgrounds (~3 MB) only on Wi-Fi, or once the person has opened the studio:
  // a reader on mobile data does not pay for a video editor they may never use. Not done yet = tried
  // again on a later visit.
  let studio = false;
  try { studio = localStorage.getItem('studioUsed') === '1'; } catch { /* ignore */ }
  if (!unmetered() && !studio) return false;
  try {
    await import('./ui/editor'); // the editor and video engine
    const { BACKGROUNDS } = await import('./engine/backgrounds');
    for (const b of BACKGROUNDS) {
      if (b.kind === 'color') continue;
      for (const u of [b.src, b.thumb, b.kind === 'video' ? b.alt : undefined]) if (typeof u === 'string') await fetch(u).then((r) => { if (!r.ok) ok = false; }, () => { ok = false; });
    }
  } catch {
    return false; // offline right now: try again on the next visit
  }
  return ok;
}

/** Runs `f` at the phone's next quiet moment (so the warm-up never competes with the screen being used). */
function idleThen<T>(f: () => Promise<T>): Promise<T> {
  return new Promise((ok) => {
    const go = () => ok(f());
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 500);
  });
}
