// The du'a moments through the day (Hisn al-Muslim chapters 1, 15, 25, 28; public/data/duas.json by
// scripts/make-duas.mjs): on waking, on hearing the adhan, after the salam and before sleeping.
// Said in the same session as the morning / evening adhkar (src/ui/adhkar.ts), counted tap by tap;
// progress is kept for the day per session key (src/data/adhkar.ts): 'wake', 'sleep', and per prayer
// for the adhan and after the salah ('salah:fajr', 'adhan:asr', …).
import type { Dhikr } from './adhkar';

export type Moment = 'wake' | 'adhan' | 'salah' | 'sleep';
export const MOMENTS: Moment[] = ['wake', 'adhan', 'salah', 'sleep'];
export type Prayer = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYER_LIST: Prayer[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export interface Dua extends Dhikr {
  /** Something to do, written as the book writes it (one tap = done). */
  act?: boolean;
  /** Only after these prayers. */
  prayers?: Prayer[];
  /** A different count after these prayers. */
  countBy?: Partial<Record<Prayer, number>>;
  /** Surahs the book says to read (opened in the mushaf). */
  read?: number[];
  /** Counted on the bead ring. */
  beads?: boolean;
  /** The book's own words around it. */
  arNote?: string;
  enNote?: string;
  /** The book's word notes on the English. */
  gloss?: string[];
}

let data: Promise<Record<Moment, Dua[]>> | null = null;
export function loadDuas(): Promise<Record<Moment, Dua[]>> {
  data ??= fetch(`${import.meta.env.BASE_URL}data/duas.json?v=${__DATA_VERSION__}`)
    .then((r) => { if (!r.ok) throw new Error(`duas.json HTTP ${r.status}`); return r.json(); })
    .then((d: { moments: Record<Moment, Dua[]> }) => d.moments);
  data.catch(() => { data = null; });
  return data;
}

/** The session key: the adhan and the salah have one per prayer. */
export const momentKey = (m: Moment, p?: Prayer) => (m === 'salah' || m === 'adhan' ? `${m}:${p ?? 'fajr'}` : m);

/** A moment's list for a prayer, each with the count the book gives after it. */
export function momentList(all: Record<Moment, Dua[]>, m: Moment, p: Prayer = 'fajr'): Dua[] {
  return all[m]
    .filter((d) => !d.prayers || m !== 'salah' || d.prayers.includes(p))
    .map((d) => (d.countBy?.[p] ? { ...d, count: d.countBy[p]! } : d));
}

/** The prayer whose time it is now (the last one that came in; before Fajr = last night's Isha).
 * From the prayer times when a location is set, else from the hour. */
export async function prayerNow(now = new Date()): Promise<Prayer> {
  try {
    const { prayerDay, prayerSettings } = await import('./prayer');
    if (prayerSettings().lat != null) {
      const t = await prayerDay(now);
      if (t) {
        const at: [Prayer, Date][] = [['fajr', t[0]], ['dhuhr', t[2]], ['asr', t[3]], ['maghrib', t[4]], ['isha', t[5]]];
        let cur: Prayer = 'isha';
        for (const [p, d] of at) if (now >= d) cur = p;
        return cur;
      }
    }
  } catch { /* no location: by the hour */ }
  const h = now.getHours();
  return h < 4 ? 'isha' : h < 12 ? 'fajr' : h < 15 ? 'dhuhr' : h < 18 ? 'asr' : h < 20 ? 'maghrib' : 'isha';
}
