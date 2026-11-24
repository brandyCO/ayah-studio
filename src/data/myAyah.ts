// "My ayah" (owner request 2026-11-24): a personal ayah of the day beside the shared one, picked from what the
// user does in the app. In order: the surah being memorised (an ayah already learned, to keep it fresh), a
// surah memorised whole that is due for review, the surah being read (the stretch before where they stopped),
// a recent bookmark, else another ayah from the curated list. Always one whole ayah from the bundled text
// (rule 1), the same all day (seeded by the local date), short ones preferred so it fits a card and a widget.
import { dayNumber, loadDaily, pick, type DailyItem } from './daily';
import { trees, thirstyTrees } from './garden';
import type { Stop } from './stopped';
import { bookmarks } from './bookmarks';
import { loadMeta, surahText } from './quran';

export type MyWhy = 'memorising' | 'review' | 'reading' | 'bookmark' | 'picked';
export interface MyAyah { s: number; a: number; why: MyWhy }

const DAY = 86_400_000;
const LONG = 40; // Arabic words: longer ayat are chosen only when nothing shorter is there

/** A small, steady hash: the same inputs give the same pick all day on every device. */
const mix = (a: number, b: number) => {
  let x = (a * 2654435761 + b * 40503) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return x >>> 0;
};

/** One ayah of s in [lo, hi], seeded by the day, preferring ayat of ≤ LONG words. */
async function oneOf(s: number, lo: number, hi: number, day: number): Promise<number> {
  const text = await surahText(s);
  hi = Math.min(hi, text.length);
  lo = Math.max(1, Math.min(lo, hi));
  const all = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const short = all.filter((a) => text[a - 1].split(' ').length <= LONG);
  const pool = short.length ? short : [all.reduce((m, a) => (text[a - 1].length < text[m - 1].length ? a : m), all[0])];
  return pool[mix(day, s) % pool.length];
}

/** Today's personal ayah, never the same as the shared one. */
export async function myAyah(date = new Date(), shared?: DailyItem): Promise<MyAyah> {
  const d = await loadDaily();
  shared ??= pick(d, date);
  const day = dayNumber(d.epoch, date);
  const now = date.getTime();
  const notShared = (s: number, a: number) => !(s === shared!.s && a >= shared!.from && a <= shared!.to);
  const tryPick = async (s: number, lo: number, hi: number, why: MyWhy): Promise<MyAyah | null> => {
    const a = await oneOf(s, lo, hi, day);
    if (notShared(s, a)) return { s, a, why };
    if (hi > lo) { const b = a < hi ? a + 1 : a - 1; return { s, a: b, why }; }
    return null;
  };
  const meta = await loadMeta();

  // Memorising: the surah with the most recent lesson that is not whole yet.
  const learning = trees().filter((t) => t.learned > 0 && !t.full).sort((a, b) => b.water - a.water)[0];
  if (learning && now - learning.water < 30 * DAY) {
    const r = await tryPick(learning.s, 1, learning.learned, 'memorising');
    if (r) return r;
  }
  // A surah memorised whole and due for review.
  const due = thirstyTrees(now)[0];
  if (due?.full) {
    const r = await tryPick(due.s, 1, meta[due.s - 1].ayahs, 'review');
    if (r) return r;
  }
  // Reading: the ten ayat before where they stopped (the stretch they read), in the last two weeks.
  let stop: Stop | null = null; // read here, so stopped.ts stays as small as first load needs it
  try { stop = JSON.parse(localStorage.getItem('stoppedAt') ?? 'null'); } catch { /* none */ }
  if (stop && typeof stop.s === 'number' && typeof stop.a === 'number' && now - stop.at < 14 * DAY && meta[stop.s - 1]) {
    const r = await tryPick(stop.s, stop.a - 9, stop.a, 'reading');
    if (r) return r;
  }
  // A bookmark from the last month (the newest first, a different one each day).
  const marks = bookmarks().filter((b) => now - b.at < 30 * DAY && notShared(b.s, b.a));
  if (marks.length) {
    const b = marks[mix(day, 7) % Math.min(marks.length, 5)];
    return { s: b.s, a: b.a, why: 'bookmark' };
  }
  // Otherwise another ayah of the curated list, far from today's shared one.
  const n = d.items.length;
  const x = d.items[(((day + 1 + (mix(day, 3) % (n - 1))) % n) + n) % n];
  return { s: x.s, a: x.from, why: 'picked' };
}
