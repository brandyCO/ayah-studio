// Quiet moments (Marwan 2026-11-24, Tecno: "fighting for the phone"): background work that holds the main thread
// (building screens ahead, a sync round's merging, a Ranks refresh) waits while a sheet, a moment or the onboarding
// is on screen, and for 1.5 s after a touch, so pop-ins, closes, swipes and taps keep the phone to themselves.
let lastInput = 0;
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const) {
    addEventListener(ev, () => { lastInput = performance.now(); }, { capture: true, passive: true });
  }
}
/** True while something is animating in front of the person or they touched the screen in the last 1.5 s. */
export const busyNow = () => performance.now() - lastInput < 1500 || !!document.querySelector('dialog[open], .cel, .ul');

/** Runs `fn` after `ms` at the next idle, quiet moment; `maxWait` (ms) runs it anyway after that long. */
export function whenQuiet(fn: () => void, ms = 0, maxWait = Infinity) {
  const start = performance.now();
  const tryIt = () => (busyNow() && performance.now() - start < maxWait ? setTimeout(tryIt, 1500) : fn());
  setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(tryIt, { timeout: 4000 }) : tryIt()), ms);
}
