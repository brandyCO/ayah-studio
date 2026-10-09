// The ayah of the day (docs/grow.md, G2): a calm pick from a curated list (public/data/daily.json,
// scripts/make-daily.mjs), the same on every device for a given local date. The Android widget
// (DailyAyahWidget.java) computes the same pick from the same file.
const base = import.meta.env.BASE_URL;

export interface DailyItem {
  s: number;
  from: number;
  to: number;
  en: string; // Saheeh International, unaltered (the widget's fallback text)
}
interface DailyData {
  epoch: string; // YYYY-MM-DD, day 0 of the cycle
  items: DailyItem[];
}

let data: Promise<DailyData> | null = null;
export function loadDaily(): Promise<DailyData> {
  data ??= fetch(`${base}data/daily.json?v=${__DATA_VERSION__}`).then((r) => {
    if (!r.ok) throw new Error(`daily.json: HTTP ${r.status}`);
    return r.json() as Promise<DailyData>;
  });
  data.catch(() => { data = null; });
  return data;
}

/** Whole days from the epoch to `date`'s local calendar day (immune to daylight-saving shifts). */
export function dayNumber(epoch: string, date: Date): number {
  const [y, m, d] = epoch.split('-').map(Number);
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000);
}

export const pick = (d: DailyData, date: Date): DailyItem => {
  const n = d.items.length;
  return d.items[((dayNumber(d.epoch, date) % n) + n) % n];
};

export async function todaysAyah(date = new Date()): Promise<DailyItem> {
  return pick(await loadDaily(), date);
}
