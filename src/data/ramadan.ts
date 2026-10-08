// Ramadan mode (docs/together.md T7), kept on this device: the plan (one Khatm, two, or "just keep me
// company"), which pages were read this Ramadan, today's portion (the pages left split evenly over the
// days left — re-balanced every day, so a missed day just spreads out), the days with reading, the
// ayat the user came back to (for the Eid recap), the reminder before Maghrib and a ±1 day shift for
// local moon sighting. Dates follow the Umm al-Qura calendar (Intl). A preview setting pretends it is
// Ramadan (or Eid) so the mode can be tried at any time of year.
const KEY = 'ramadan';
const DAY = 86_400_000;
export const PAGES = 604;

export type Plan = 'one' | 'two' | 'company';
export interface Reminder {
  on: boolean;
  lat: number | null;
  lng: number | null;
  time: string; // 'HH:MM' when there is no location (the user's own Maghrib time)
  before: number; // minutes before Maghrib
}
export interface RamadanData {
  year: number; // hijri year these records belong to
  plan: Plan | null;
  welcomed: boolean; // the first-night moment was shown (or skipped)
  read: number[]; // pages read in the current Khatm
  khatms: number; // Khatms completed this Ramadan
  days: number[]; // Ramadan days with reading
  today: { day: number; pages: number[] } | null; // today's portion, fixed at the day's first look
  ayat: Record<string, number>; // 's:a' → times the user came back to it (listened, selected, reflected)
  recapSeen: boolean;
}
export interface RamadanSettings {
  shift: -1 | 0 | 1;
  reminder: Reminder;
  preview: number | 'eid' | null; // pretend it is Ramadan day N (or Eid)
}

const read = <T>(k: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null');
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('ramadan-changed'));
};

export function ramadanSettings(): RamadanSettings {
  const s = read<RamadanSettings>(`${KEY}-settings`, { shift: 0, reminder: { on: false, lat: null, lng: null, time: '18:00', before: 15 }, preview: null });
  if (![-1, 0, 1].includes(s.shift)) s.shift = 0;
  return s;
}
export const setRamadanSettings = (s: RamadanSettings) => write(`${KEY}-settings`, s);

// --- the calendar ---
function hijri(date: Date): { year: number; month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
    const num = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '', 10);
    const v = { year: num('year'), month: num('month'), day: num('day') };
    return Object.values(v).every(Number.isInteger) ? v : null;
  } catch {
    return null;
  }
}

export interface RamadanNow {
  day: number | null; // day of Ramadan (1–30), or null
  length: number; // days in this Ramadan (29 or 30)
  eid: boolean; // 1–3 Shawwal
  year: number; // hijri year
  lastTen: boolean;
}
/** Where today falls, with the user's ±1 day shift (or the preview). */
export function ramadanNow(date = new Date()): RamadanNow {
  const st = ramadanSettings();
  const h = hijri(new Date(date.getTime() - st.shift * DAY));
  const year = h?.year ?? 0;
  if (st.preview === 'eid') return { day: null, length: 30, eid: true, year, lastTen: false };
  if (typeof st.preview === 'number') return { day: st.preview, length: 30, eid: false, year, lastTen: st.preview >= 21 };
  if (!h) return { day: null, length: 30, eid: false, year, lastTen: false };
  if (h.month === 9) {
    const h30 = hijri(new Date(date.getTime() - st.shift * DAY + (30 - h.day) * DAY));
    const length = h30?.month === 9 ? 30 : 29;
    return { day: h.day, length, eid: false, year, lastTen: h.day >= 21 };
  }
  return { day: null, length: 30, eid: h.month === 10 && h.day <= 3, year, lastTen: false };
}

/** Days until Ramadan starts (for the sheet out of season), roughly. */
export function daysToRamadan(date = new Date()): number | null {
  for (let i = 1; i <= 360; i++) {
    const h = hijri(new Date(date.getTime() + i * DAY - ramadanSettings().shift * DAY));
    if (!h) return null;
    if (h.month === 9 && h.day === 1) return i;
  }
  return null;
}

// --- this Ramadan's records ---
const empty = (year: number): RamadanData => ({ year, plan: null, welcomed: false, read: [], khatms: 0, days: [], today: null, ayat: {}, recapSeen: false });
export function ramadanData(now = ramadanNow()): RamadanData {
  const d = read<RamadanData>(KEY, empty(now.year));
  // A new Ramadan starts fresh (the Eid days still belong to the Ramadan before them).
  return d.year === now.year ? d : empty(now.year);
}
const save = (d: RamadanData) => write(KEY, d);

export const planPages = (p: Plan | null) => (p === 'two' ? 2 * PAGES : p === 'one' ? PAGES : 0);

export function setPlan(plan: Plan | null) {
  const d = ramadanData();
  d.plan = plan;
  d.welcomed = true;
  d.today = null; // re-portion today
  save(d);
}
export function setWelcomed() {
  const d = ramadanData();
  d.welcomed = true;
  save(d);
}
export function setRecapSeen() {
  const d = ramadanData();
  d.recapSeen = true;
  save(d);
}

/** Today's portion: fixed at the day's first look, from what is left over the days left. */
export function todayPortion(now = ramadanNow()): { pages: number[]; left: number[] } | null {
  const d = ramadanData(now);
  if (!now.day || !d.plan || d.plan === 'company') return null;
  if (!d.today || d.today.day !== now.day) {
    const total = planPages(d.plan);
    const done = d.khatms * PAGES + d.read.length;
    const remainingDays = Math.max(1, now.length - now.day + 1);
    const n = Math.max(0, Math.ceil((total - done) / remainingDays));
    const readSet = new Set(d.read);
    const unread: number[] = [];
    for (let p = 1; p <= PAGES && unread.length < n; p++) if (!readSet.has(p)) unread.push(p);
    // The second Khatm starts again from page 1 once the first is finished.
    d.today = { day: now.day, pages: unread };
    save(d);
  }
  const readSet = new Set(d.read);
  return { pages: d.today.pages, left: d.today.pages.filter((p) => !readSet.has(p)) };
}

/** A page stayed open long enough to count as read (during Ramadan, with a plan or keeping company). */
export function markRamadanRead(page: number) {
  const now = ramadanNow();
  if (!now.day) return;
  const d = ramadanData(now);
  if (!d.plan) return;
  let changed = false;
  if (!d.days.includes(now.day)) {
    d.days.push(now.day);
    changed = true;
  }
  if (d.plan !== 'company' && !d.read.includes(page)) {
    d.read.push(page);
    changed = true;
    if (d.read.length >= PAGES) {
      d.khatms++;
      d.read = [];
      window.dispatchEvent(new Event('ramadan-khatm'));
    }
  }
  if (changed) save(d);
}

/** The user came back to an ayah (listened, selected, reflected) — for the Eid recap. */
export function noteAyah(s: number, a: number) {
  const now = ramadanNow();
  if (!now.day) return;
  const d = ramadanData(now);
  const k = `${s}:${a}`;
  d.ayat[k] = (d.ayat[k] ?? 0) + 1;
  save(d);
}

export function mostReturned(d = ramadanData()): [number, number] | null {
  const best = Object.entries(d.ayat).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [s, a] = best[0].split(':').map(Number);
  return Number.isInteger(s) && Number.isInteger(a) ? [s, a] : null;
}
