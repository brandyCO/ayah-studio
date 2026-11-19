// The Umm al-Qura (Hijri) date of a day, shared by Ramadan, the season, the wardrobe and the page tint. Building an
// Intl.DateTimeFormat costs a slow phone a few milliseconds and screens asked for it many times while drawing (Me ~20
// times), so there is one formatter and each local day is worked out once.
let fmt: Intl.DateTimeFormat | null | undefined;
const memo = new Map<string, { year: number; month: number; day: number } | null>();

export function hijriDate(d: Date): { year: number; month: number; day: number } | null {
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (memo.has(key)) return memo.get(key)!;
  if (fmt === undefined) {
    try { fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric' }); } catch { fmt = null; }
  }
  let v: { year: number; month: number; day: number } | null = null;
  if (fmt) {
    try {
      const p = fmt.formatToParts(d);
      const n = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? '', 10);
      const r = { year: n('year'), month: n('month'), day: n('day') };
      v = Number.isInteger(r.year) && Number.isInteger(r.month) && Number.isInteger(r.day) ? r : null;
    } catch { v = null; }
  }
  if (memo.size > 200) memo.clear();
  memo.set(key, v);
  return v;
}
