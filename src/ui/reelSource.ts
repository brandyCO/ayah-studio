// The recitation of a reel: QDC full-surah audio sliced to the selection with word timings, or
// everyayah per-ayah files (Ayah mode only) when QDC has no timing. Shared by the editor and the
// gift player, so a gift plays exactly like the editor's preview.
import { arrangeAudio, ayahAudio, mixdown, sliceAudio } from '../data/audio';
import { qdcSurah } from '../data/qdc';
import { loadMeta, loadWordMap, reference, surahText, surahTranslation, surahWordMeanings, type SurahMeta } from '../data/quran';
import type { Reciter } from '../data/reciters';
import { arrangeReel, LEAD_IN, planClipReel, planQdcReel, voiceOnset, type ReelPlan } from '../engine/recitation';
import { joinSegments, MAX_SEGMENTS, MAX_SEGMENTS_SECONDS, noteLength, type Note, type Segment, type TimedNote } from '../engine/segments';
import { displayWords, parseSpans, wordMeanings } from '../engine/words';

export interface Reel {
  plan: ReelPlan;
  audio: AudioBuffer;
}

export async function loadReel(r: Reciter, n: number, from: number, arabic: string[], wordMap: Record<string, string>,
  progress: (msg: string) => void): Promise<Reel> {
  try {
    const q = await qdcSurah(r.id, n);
    const p = planQdcReel(q.timings, n, from, arabic, wordMap);
    if (p) {
      progress('Loading recitation…');
      return { plan: p, audio: await sliceAudio(q.audioUrl, p.clip!, LEAD_IN, p.duration, q.duration) };
    }
    console.warn(`QDC has no timing for ${n}:${from}-${from + arabic.length - 1} (reciter ${r.id}); using everyayah`);
  } catch (e) {
    console.warn(`QDC recitation failed (reciter ${r.id}); using everyayah`, e);
  }
  // Fallback: per-ayah files without word timings (Ayah mode only).
  let done = 0;
  progress(`Loading recitation… 0/${arabic.length}`);
  const clips = await Promise.all(arabic.map((_, i) => ayahAudio(r, n, from + i).then((b) => {
    progress(`Loading recitation… ${++done}/${arabic.length}`);
    return b;
  })));
  const p = planClipReel(from, clips.map((c) => c.duration));
  return { plan: p, audio: mixdown(clips, p.offsets!, p.duration) };
}

export interface SegmentRef {
  surah: number;
  from: number;
  to: number;
  note: Omit<Note, 'ref'> | null;
}

/** A multi-segment reel ready for buildTimeline() (with its per-ayah texts) and the joined audio. */
export interface SegmentReel {
  plan: ReelPlan;
  audio: AudioBuffer;
  arabic: string[];
  english: string[];
  meanings: string[][];
  surahs: SurahMeta[];
  notes: TimedNote[];
  /** How many of the given segments fit (≤ MAX_SEGMENTS and about MAX_SEGMENTS_SECONDS); the rest
   *  make the next part. */
  used: number;
}

/**
 * Load segments in order (three at a time), each sliced, timed and paced like a one-range reel, until
 * the reel would pass MAX_SEGMENTS_SECONDS; then join them. A segment that cannot be loaded at all
 * fails the whole reel (a keepsake never silently drops a guest's ayah).
 */
export async function loadSegments(r: Reciter, refs: SegmentRef[], pace: { pause: number; hold: boolean }, outro: number,
  progress: (done: number, total: number) => void, alive: () => boolean = () => true): Promise<SegmentReel> {
  const [meta, wordMap] = await Promise.all([loadMeta(), loadWordMap()]);
  const list = refs.slice(0, MAX_SEGMENTS);
  type Loaded = { seg: Segment; audio: AudioBuffer; arabic: string[]; english: string[]; meanings: string[][] };
  const loaded: Loaded[] = [];
  let total = outro;
  const one = async (x: SegmentRef): Promise<Loaded> => {
    const n = x.surah, s = meta[n - 1];
    const [allAr, allEn, allWbw] = await Promise.all([surahText(n), surahTranslation(n), surahWordMeanings(n)]);
    const arabic = allAr.slice(x.from - 1, x.to);
    const english = allEn.slice(x.from - 1, x.to);
    const meanings = arabic.map((text, i) => wordMeanings(allWbw[x.from - 1 + i], parseSpans(wordMap[`${n}:${x.from + i}`]), displayWords(text).length));
    const reel = await loadReel(r, n, x.from, arabic, wordMap, () => {});
    if (reel.plan.onset === undefined) reel.plan.onset = voiceOnset(reel.audio.getChannelData(0), reel.audio.sampleRate, reel.plan.ayat[0].start);
    const plan = arrangeReel(reel.plan, { pause: pace.pause, hold: pace.hold, intro: 0, outro: 0 });
    const audio = arrangeAudio(reel.audio, plan.pieces!, plan.duration);
    const note = x.note ? { ...x.note, ref: reference(s, x.from, x.to) } : null;
    return { seg: { surah: n, plan, note }, audio, arabic, english, meanings };
  };
  progress(0, list.length);
  for (let i = 0; i < list.length && alive(); i += 3) {
    const batch = await Promise.all(list.slice(i, i + 3).map(one));
    for (const b of batch) {
      const len = b.seg.plan.duration + (b.seg.note ? noteLength(b.seg.note) : 0);
      if (loaded.length && total + len > MAX_SEGMENTS_SECONDS) break;
      loaded.push(b);
      total += len;
    }
    progress(loaded.length, list.length);
    if (loaded.length < Math.min(i + 3, list.length)) break; // the reel is full
  }
  if (!alive()) throw new DOMException('Cancelled', 'AbortError');
  const { plan, offsets, notes } = joinSegments(loaded.map((l) => l.seg), outro);
  return {
    plan,
    audio: mixdown(loaded.map((l) => l.audio), offsets, plan.duration),
    arabic: loaded.flatMap((l) => l.arabic),
    english: loaded.flatMap((l) => l.english),
    meanings: loaded.flatMap((l) => l.meanings),
    surahs: loaded.flatMap((l) => l.arabic.map(() => meta[l.seg.surah - 1])),
    notes,
    used: loaded.length,
  };
}
