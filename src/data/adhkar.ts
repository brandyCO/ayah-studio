// Morning and evening adhkar (Hisn al-Muslim, chapter 27; public/data/adhkar.json by
// scripts/make-adhkar.mjs). The goal is met only by saying each dhikr in the app's session
// (src/ui/adhkar.ts), counted tap by tap. Progress is this device's, for today; the finished
// flags go into the journey (DayRec.ad / am) and sync with it.
// The evening adhkar open at Asr (from the prayer times when a location is set, else 15:00).

export type AdhkarPeriod = 's' | 'm';
export interface Dhikr {
  id: string;
  /** 's' morning, 'm' evening, 'sm' both. */
  when: string;
  count: number;
  /** Quran: the ayat, drawn from our own text. */
  quran?: { s: number; a: number; b: number };
  /** Said before it (isti'adha / basmala). */
  opening?: string;
  ar: string;
  /** The evening wording, where the book gives one. */
  arM?: string;
  en: string;
  enM?: string;
  ref: string;
  refAr: string;
  /** 'night' | 'lazy' | 'day' */
  note?: string;
}

/** How many adhkar each session has (checked against the data when it loads). */
export const ADHKAR_TOTAL: Record<AdhkarPeriod, number> = { s: 25, m: 23 };

let data: Promise<Dhikr[]> | null = null;
export function loadAdhkar(): Promise<Dhikr[]> {
  data ??= fetch(`${import.meta.env.BASE_URL}data/adhkar.json?v=${__DATA_VERSION__}`)
    .then((r) => { if (!r.ok) throw new Error(`adhkar.json HTTP ${r.status}`); return r.json(); })
    .then((d: { items: Dhikr[] }) => d.items);
  data.catch(() => { data = null; });
  return data;
}
export const sessionList = (all: Dhikr[], p: AdhkarPeriod) => all.filter((x) => x.when.includes(p));

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// --- today's progress: session key → id → times said. Keys: 's' / 'm' (morning / evening adhkar),
// and the du'a moments ('wake', 'sleep', 'salah:fajr', 'adhan:asr', …; src/data/duas.ts). ---
export type SessionKey = string;
interface Progress { day: string; c: Record<SessionKey, Record<string, number>>; at: Record<SessionKey, string>; f: Record<SessionKey, string[]> }
function progress(): Progress {
  try {
    const v = JSON.parse(localStorage.getItem('adhkarProgress') ?? 'null') as (Partial<Progress> & { s?: Record<string, number>; m?: Record<string, number> }) | null;
    if (v && v.day === dayKey()) return { day: v.day, c: v.c ?? { s: v.s ?? {}, m: v.m ?? {} }, at: v.at ?? {}, f: v.f ?? {} };
  } catch { /* ignore */ }
  return { day: dayKey(), c: {}, at: {}, f: {} };
}
function saveProgress(p: Progress) {
  try { localStorage.setItem('adhkarProgress', JSON.stringify(p)); } catch { /* ignore */ }
}
export const saidCount = (p: SessionKey, id: string) => progress().c[p]?.[id] ?? 0;
/** Adhkar said in full today. */
export const finishedCount = (p: SessionKey) => progress().f[p]?.length ?? 0;
/** Ids said in full today in a session. */
export const finishedIds = (p: SessionKey) => progress().f[p] ?? [];
/** One more (or one fewer) time said; returns the new count. `count` overrides the dhikr's own. */
export function say(p: SessionKey, d: Pick<Dhikr, 'id' | 'count'>, n = 1, count = d.count): number {
  const pr = progress();
  const c = (pr.c[p] ??= {});
  const v = Math.max(0, Math.min(count, (c[d.id] ?? 0) + n));
  if (v) c[d.id] = v; else delete c[d.id];
  const f = new Set(pr.f[p] ?? []);
  if (v >= count) f.add(d.id); else f.delete(d.id);
  pr.f[p] = [...f];
  saveProgress(pr);
  return v;
}
/** Where the user was (to pick up there). */
export const lastAt = (p: SessionKey) => progress().at[p];
export function setLastAt(p: SessionKey, id: string) {
  const pr = progress();
  pr.at[p] = id;
  saveProgress(pr);
}

// --- when the evening adhkar open ---
const FALLBACK_HOUR = 15;
/** Today's Asr time (kept from the prayer times; 15:00 without a location). */
export function eveningFrom(now = new Date()): Date {
  try {
    const v = JSON.parse(localStorage.getItem('asrToday') ?? 'null') as { day: string; at: number } | null;
    if (v && v.day === dayKey(now)) return new Date(v.at);
  } catch { /* ignore */ }
  const d = new Date(now);
  d.setHours(FALLBACK_HOUR, 0, 0, 0);
  return d;
}
export const eveningOpen = (now = new Date()) => now >= eveningFrom(now);
/** Works out today's Asr from the prayer settings; a change repaints the goals. */
export async function refreshAsr(now = new Date()) {
  try {
    const { prayerDay, prayerSettings } = await import('./prayer');
    if (prayerSettings().lat == null) return;
    const times = await prayerDay(now);
    const asr = times?.[3];
    if (!asr) return;
    const before = eveningFrom(now).getTime();
    localStorage.setItem('asrToday', JSON.stringify({ day: dayKey(now), at: asr.getTime() }));
    if (before !== asr.getTime()) window.dispatchEvent(new Event('journey-changed'));
  } catch { /* no location or no adhan library: keep 15:00 */ }
}

/** Light for one dhikr said in full (the goal itself gives its own when claimed). */
export const dhikrLight = (count: number) => (count >= 100 ? 10 : count >= 7 ? 5 : count >= 3 ? 3 : 2);
