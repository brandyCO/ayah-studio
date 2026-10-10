// Offline use: registers the service worker (public/sw.js), then — once it controls the page —
// loads the bundled data, fonts, default backgrounds and the editor in the background, so they are
// kept on the device even before they are first needed. Recitation audio is kept per reel by
// src/data/audioCache.ts.
import { isNative } from './native';

const BASE = import.meta.env.BASE_URL;
const DATA = ['meta.json', 'quran-uthmani.json', 'en-sahih.json', 'en-wbw.json', 'mushaf.json', 'word-map.json'];
const FONTS = ['UthmanicHafs.woff2', 'SuraNames.woff2', 'AmiriQuran.woff2', 'bismillah.svg'];

export function setupOffline() {
  // Only for the built web app over http(s): not the dev server, and not the Android app (Capacitor),
  // whose files are on the device already.
  if (isNative() || !import.meta.env.PROD || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register(`${BASE}sw.js`).catch((e) => console.warn('Offline mode unavailable', e));
  const warm = () => window.setTimeout(() => void warmUp(), 3000);
  if (navigator.serviceWorker.controller) warm();
  else navigator.serviceWorker.addEventListener('controllerchange', warm, { once: true });
}

async function warmUp() {
  const urls = [...DATA.map((f) => `${BASE}data/${f}?v=${__DATA_VERSION__}`), ...FONTS.map((f) => `${BASE}fonts/${f}`)];
  for (const u of urls) await fetch(u).catch(() => {});
  try {
    await import('./ui/editor'); // the editor and video engine
    await import('./light/reel'); // three.js + the light scenes (Night listening, light backgrounds)
    const { BUILT_IN_BACKGROUNDS } = await import('./engine/backgrounds');
    for (const b of BUILT_IN_BACKGROUNDS) {
      if (b.kind === 'color') continue;
      if (b.kind === 'light') { await fetch(b.thumb).catch(() => {}); continue; }
      for (const u of [b.src, b.thumb, b.kind === 'video' ? b.alt : undefined]) if (typeof u === 'string') await fetch(u).catch(() => {});
    }
  } catch {
    /* offline right now: try again on the next visit */
  }
}
