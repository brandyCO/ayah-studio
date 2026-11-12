// Surprise chests and Friday (owner request 2026-11-12), kept out of the first load.
import { dayKey } from './readLog';

// --- surprises (owner request 2026-11-12, "surprise rewards") ---
/** About one chest in six holds double its Light. Worked out from the claim and the day, so every device agrees and a
 *  chest never changes its mind; the amount shown on the chest stays its own, the surprise shows when it opens. */
export function surprise(id: string, now = new Date()): 1 | 2 {
  let x = 2166136261;
  for (const c of `${dayKey(now)}|${id}`) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return (x >>> 0) % 6 === 0 ? 2 : 1;
}

// --- Friday (owner request 2026-11-12): double XP all day, and the Al-Kahf quest ---
export const KAHF_LIGHT = 60;
/** Al-Kahf in the Madinah mushaf: pages 293–304. */
export const KAHF_PAGES = Array.from({ length: 12 }, (_, i) => 293 + i);
export const isFriday = (now = new Date()) => now.getDay() === 5;
