// Multi-segment reels (docs/together.md T8): several ayah ranges, each from its own surah with its own
// word timings, audio slice and reference line, joined on one timeline. Each segment is planned and
// arranged on its own (planQdcReel/planClipReel + arrangeReel, no cards); here the segments are placed
// one after another, each optionally followed by a short note card (user text: a name and a dua, never
// drawn like the ayah), and the closing card at the end (pure: runs in node too).
import type { PlannedAyah, ReelPlan } from './recitation';
import type { Recited } from './words';

/** At most this many segments or seconds in one reel; more → several reels (parts). */
export const MAX_SEGMENTS = 30;
export const MAX_SEGMENTS_SECONDS = 600;

/** User text shown on a card after a segment: who chose it, and their own short dua. */
export interface Note {
  name: string;
  dua: string | null;
  ref: string; // the segment's reference ("Al-Baqarah · 2:255")
}
export interface TimedNote extends Note {
  start: number;
  end: number;
}

export interface Segment {
  surah: number;
  plan: ReelPlan; // arranged, without intro/outro cards
  note: Note | null;
}

/** Seconds a note card stays: long enough to read the dua calmly. */
export const noteLength = (n: Note) => (n.dua ? Math.min(8, Math.max(4.5, 3 + n.dua.length / 28)) : 3);

const shiftAyah = (a: PlannedAyah, d: number, surah: number): PlannedAyah => ({
  ...a, surah, start: a.start + d, end: a.end + d, last: a.last + d,
  wordStart: a.wordStart?.map((x) => x + d) ?? null,
  seq: a.seq?.map(([w, s, e]): Recited => [w, s + d, e + d]) ?? null,
});

/**
 * One plan for the joined reel: each segment's times moved to where it starts; `offsets[i]` is where
 * segment i's audio goes (for mixdown). Every segment keeps its own words and timings (rule 8: a
 * segment without word timings stays in Ayah mode).
 */
export function joinSegments(segs: Segment[], outro: number): { plan: ReelPlan; offsets: number[]; notes: TimedNote[] } {
  if (!segs.length) throw new Error('A reel needs at least one segment');
  let t = 0;
  const offsets: number[] = [];
  const notes: TimedNote[] = [];
  const ayat: PlannedAyah[] = [];
  for (const s of segs) {
    offsets.push(t);
    ayat.push(...s.plan.ayat.map((a) => shiftAyah(a, t, s.surah)));
    t += s.plan.duration;
    if (s.note) {
      const len = noteLength(s.note);
      notes.push({ ...s.note, start: t, end: t + len });
      t += len;
    }
  }
  const duration = t + outro;
  return {
    plan: { source: segs.every((s) => s.plan.source === 'qdc') ? 'qdc' : 'everyayah', duration, ayat, wordTimed: ayat.every((a) => a.wordStart), intro: 0, outro },
    offsets,
    notes,
  };
}
