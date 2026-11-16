// The opening. Every opening drawn by the web page (a light sweep, then "the character arrives" with ~70 and later
// 8 moving layers) lagged on the owner's phone (2026-11-14): while the app starts, the WebView's GPU is busy drawing
// the first page, so even compositor-only animations stutter. So the app now opens with Android's own splash: the
// launcher icon (the user's character in the ayah marker) on the splash colour, kept on screen until the first page
// is drawn underneath, then leaving with a native animation (the icon swells and fades, the splash fades;
// AppActivity.java). On the web the browser shows the page at once: nothing to play.
import { Capacitor, registerPlugin } from '@capacitor/core';

const Launch = registerPlugin<{ ready(): Promise<void> }>('Launch');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Tells the app the first screen is up (at most 3.5 s after start), so the native splash leaves. Resolves once
 *  the splash's exit animation is over, so main.ts can hold the start-up extras until then. */
export function playOpening(firstScreen: Promise<unknown> = Promise.resolve()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  return Promise.race([firstScreen.catch(() => {}), wait(3500)])
    .then(frames)
    .then(() => Launch.ready().catch(() => {}))
    .then(() => wait(220));
}
