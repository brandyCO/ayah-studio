// Night calm: from Isha until Fajr the app winds down (front-end backlog 2026-11-13). Reward sounds rest, goal banners wait
// for the morning, the bright colours soften (`html.calm`), and Me's next step becomes the bedtime du'a once the day's
// flame is lit. Times from the prayer settings (kept for the day in `calmTimes`), else 21:00 → 04:30.
type Times = { day: string; isha: number; fajr: number };
const KEY = 'calmTimes';
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (d: Date, h: number, m: number) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.getTime(); };

function kept(now: Date): Times | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Times | null; return v && v.day === dayKey(now) ? v : null; } catch { return null; }
}

/** True from tonight's Isha until the next Fajr (or 21:00 → 04:30 without a location). */
export function isCalm(now = new Date()): boolean {
  const t = kept(now);
  const isha = t?.isha ?? at(now, 21, 0);
  const fajr = t?.fajr ?? at(now, 4, 30);
  const ms = now.getTime();
  return ms >= isha || ms < fajr;
}

let timer = 0;
/** Keeps `html.calm` in step with the night; asks for today's prayer times once a day. */
export function watchCalm() {
  const now = new Date();
  if (!kept(now)) {
    void import('./prayer').then(async ({ prayerDay }) => {
      const p = await prayerDay(now);
      if (!p) return;
      try { localStorage.setItem(KEY, JSON.stringify({ day: dayKey(now), isha: p[5].getTime(), fajr: p[0].getTime() })); } catch { /* ignore */ }
      apply();
    }).catch(() => {});
  }
  apply();
  clearInterval(timer);
  timer = window.setInterval(apply, 60_000);
}
function apply() {
  const on = isCalm();
  document.documentElement.classList.toggle('calm', on);
}
