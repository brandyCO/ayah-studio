// Lamps for Learn lessons (owner decision 2026-11-12): five lamps each day. A wrong answer in a new
// lesson's exercises dims one; with none lit, new lessons rest until a lamp comes back. Lamps come back
// by themselves (one every LAMP_MINUTES, all of them on a new day), by practising what was learned
// (a review, a tasmi' or a page recited: +1 each) or all at once for Light.
// Memorisation tests (reviews, tasmi', page memory) never use a lamp and are never held back, so
// nobody is ever kept from the Quran itself. Kept in localStorage `learnLamps` (synced, newest wins).
import { dayKey } from './readLog';
import { shopAdd, wallet } from './garden';

export const LAMPS = 5;
export const LAMP_MINUTES = 30;
export const REFILL_PRICE = 50;
const KEY = 'learnLamps';
const STEP = LAMP_MINUTES * 60_000;

interface S { d: string; n: number; t: number }

function read(now = Date.now()): S {
  let s: S | null = null;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (j && typeof j.d === 'string' && Number.isFinite(j.n) && Number.isFinite(j.t)) s = { d: j.d, n: Math.max(0, Math.min(LAMPS, Math.round(j.n))), t: j.t };
  } catch { /* ignore */ }
  const today = dayKey(new Date(now));
  if (!s || s.d !== today) return { d: today, n: LAMPS, t: now };
  // One lamp back for every LAMP_MINUTES since the clock started (it starts when one goes out).
  if (s.n < LAMPS && now > s.t) {
    const k = Math.floor((now - s.t) / STEP);
    if (k > 0) { s.n = Math.min(LAMPS, s.n + k); s.t += k * STEP; }
  }
  if (s.n >= LAMPS) s.t = now;
  return s;
}
function write(s: S) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('lamps-changed', { detail: s.n }));
}

/** Lamps lit now, and when the next one comes back (null when all are lit). */
export function lamps(now = Date.now()): { n: number; next: number | null } {
  const s = read(now);
  return { n: s.n, next: s.n < LAMPS ? s.t + STEP : null };
}
/** A wrong answer: one lamp dims. Returns the lamps still lit. */
export function dimLamp(): number {
  const now = Date.now();
  const s = read(now);
  if (s.n <= 0) return 0;
  if (s.n >= LAMPS) s.t = now;
  s.n--;
  write(s);
  return s.n;
}
/** Practising what was learned brings one back. False when all were already lit. */
export function earnLamp(): boolean {
  const s = read();
  if (s.n >= LAMPS) return false;
  s.n++;
  if (s.n >= LAMPS) s.t = Date.now();
  write(s);
  return true;
}
export const canRefill = () => lamps().n < LAMPS && wallet() >= REFILL_PRICE;
/** All five lit again for Light (recorded with the shop's purchases, so it syncs and counts once). */
export function refillLamps(): boolean {
  if (!canRefill()) return false;
  if (!shopAdd(`lr:${Date.now().toString(36)}`, REFILL_PRICE)) return false;
  write({ d: dayKey(), n: LAMPS, t: Date.now() });
  return true;
}

// --- flawless lessons: no wrong answer and recited from memory without a slip ---
const FKEY = 'learnFlawless';
function flawSet(): Set<string> {
  try { const j = JSON.parse(localStorage.getItem(FKEY) ?? '[]'); return new Set(Array.isArray(j) ? j.filter((x) => typeof x === 'string') : []); } catch { return new Set(); }
}
/** The lesson that ends at ayah `a` of surah `s` was flawless (a mark on its path step). */
export const isFlawless = (s: number, a: number) => flawSet().has(`${s}:${a}`);
export function markFlawless(s: number, a: number): boolean {
  const f = flawSet();
  if (f.has(`${s}:${a}`)) return false;
  f.add(`${s}:${a}`);
  try { localStorage.setItem(FKEY, JSON.stringify([...f])); } catch { /* ignore */ }
  return true;
}
