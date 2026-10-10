// Reading log (docs/light.md L6, later T9 "Your year"): which mushaf pages were read on which local
// day, on this device only (localStorage `readLog`: "YYYY-MM-DD" → pages). A page open ≥ 20 s counts
// (the mushaf's read timer). Kept for ~13 months; nothing is counted against anyone — it only lights
// stars in the Home sky. A change fires `readlog-changed`.
const KEY = 'readLog';
const KEEP_DAYS = 400;

type Log = Record<string, number[]>;

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let cache: Log | null = null;
export function readLog(): Log {
  if (cache) return cache;
  const out: Log = {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (v && typeof v === 'object') {
      for (const [k, pages] of Object.entries(v)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(pages)) continue;
        out[k] = pages.filter((p): p is number => Number.isInteger(p) && p >= 1 && p <= 604);
      }
    }
  } catch {
    /* ignore */
  }
  return (cache = out);
}

/** Records that `page` was read today. */
export function logPageRead(page: number, now = new Date()) {
  if (!Number.isInteger(page) || page < 1 || page > 604) return;
  const log = readLog();
  const k = dayKey(now);
  if (log[k]?.includes(page)) return;
  log[k] = [...(log[k] ?? []), page];
  const cutoff = dayKey(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  for (const d of Object.keys(log)) if (d < cutoff) delete log[d];
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('readlog-changed'));
}

export interface PageReads {
  /** Days this month the page was read. */
  days: number;
  /** Day of the month it was last read (1–31). */
  last: number;
}

/** Pages read in the month of `date` (default: this month). */
export function monthReads(date = new Date()): Map<number, PageReads> {
  const prefix = dayKey(date).slice(0, 8);
  const out = new Map<number, PageReads>();
  for (const [k, pages] of Object.entries(readLog())) {
    if (!k.startsWith(prefix)) continue;
    const day = Number(k.slice(8));
    for (const p of pages) {
      const r = out.get(p);
      if (r) { r.days++; r.last = Math.max(r.last, day); } else out.set(p, { days: 1, last: day });
    }
  }
  return out;
}
