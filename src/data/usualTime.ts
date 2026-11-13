// The time of day this person usually lights their flame, so the evening reminder can come when
// it fits their day instead of a fixed hour. Kept as day → minutes after midnight (localStorage
// `flameTimes`, the 30 newest days; synced with the account like the other keys).
import { dayKey } from './readLog';

const KEY = 'flameTimes';
const KEEP = 30;
const NEED = 4;

type Times = Record<string, number>;
const load = (): Times => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

/** The flame was lit now. */
export function noteFlameTime(now = new Date()) {
  const t = load();
  t[dayKey(now)] = now.getHours() * 60 + now.getMinutes();
  const keep = Object.keys(t).sort().slice(-KEEP);
  const out: Times = {};
  for (const k of keep) if (Number.isFinite(t[k])) out[k] = t[k];
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* full or private */ }
}

/** Minutes after midnight this person usually lights the flame (median of the last 3 weeks), or
 *  null until there are 4 days to go by. Small hours count as the night before (00:00–03:59 → +24 h). */
export function usualMinutes(now = new Date()): number | null {
  const from = dayKey(new Date(now.getTime() - 21 * 864e5));
  const v = Object.entries(load()).filter(([k, m]) => k >= from && typeof m === 'number')
    .map(([, m]) => (m < 240 ? m + 1440 : m)).sort((a, b) => a - b);
  if (v.length < NEED) return null;
  const mid = v.length >> 1;
  const m = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return Math.round(m) % 1440;
}

/** When the reminder comes: 45 min after the usual time, on the quarter hour, between 07:00 and
 *  22:00 (never in quiet hours); 21:00 until the usual time is known. */
export function smartReminder(now = new Date()): { h: number; m: number; learned: boolean } {
  const u = usualMinutes(now);
  if (u == null) return { h: 21, m: 0, learned: false };
  let at = Math.round((u + 45) / 15) * 15;
  if (u < 240) at = 22 * 60; // usually after midnight: remind before quiet hours
  at = Math.min(22 * 60, Math.max(7 * 60, at));
  return { h: Math.floor(at / 60), m: at % 60, learned: true };
}
