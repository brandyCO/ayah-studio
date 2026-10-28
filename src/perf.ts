// Performance timing: how long the main moments take on this device (opening the app to the first
// mushaf page, opening the studio to a ready preview, making a video). Kept on this device only
// (the newest 30, localStorage `perfLog`) and shown in Device check; nothing is sent anywhere.

export interface PerfEntry { name: string; ms: number; at: number }
const KEY = 'perfLog';
const MAX = 30;

export function perfLog(): PerfEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as PerfEntry[]).filter((e) => e && typeof e.name === 'string' && typeof e.ms === 'number') : [];
  } catch {
    return [];
  }
}

/** Records one timing (also as a `performance.measure`, for DevTools). */
export function perfRecord(name: string, ms: number) {
  if (!(ms >= 0) || !isFinite(ms)) return;
  try { performance.measure?.(name, { start: performance.now() - ms, duration: ms }); } catch { /* old browser */ }
  try {
    localStorage.setItem(KEY, JSON.stringify([...perfLog(), { name, ms: Math.round(ms), at: Date.now() }].slice(-MAX)));
  } catch { /* storage blocked */ }
}

/** A timer: call the returned function when the moment is over. */
export function perfStart(name: string): () => void {
  const t0 = performance.now();
  let done = false;
  return () => { if (!done) { done = true; perfRecord(name, performance.now() - t0); } };
}

let launchDone = false;
/** Opening the app → its first screen ready (from the browser's navigation start); once per launch. */
export function perfLaunch(screen: string) {
  if (launchDone) return;
  launchDone = true;
  perfRecord(`Open app → ${screen}`, performance.now());
}

/** Median and newest timing per name, for Device check. */
export function perfSummary(): { name: string; last: number; median: number; n: number }[] {
  const by = new Map<string, number[]>();
  for (const e of perfLog()) by.set(e.name, [...(by.get(e.name) ?? []), e.ms]);
  return [...by].map(([name, v]) => {
    const s = [...v].sort((a, b) => a - b);
    return { name, last: v[v.length - 1], median: s[Math.floor(s.length / 2)], n: v.length };
  });
}
