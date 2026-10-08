// The recitation of a reel: QDC full-surah audio sliced to the selection with word timings, or
// everyayah per-ayah files (Ayah mode only) when QDC has no timing. Shared by the editor and the
// gift player, so a gift plays exactly like the editor's preview.
import { ayahAudio, mixdown, sliceAudio } from '../data/audio';
import { qdcSurah } from '../data/qdc';
import type { Reciter } from '../data/reciters';
import { LEAD_IN, planClipReel, planQdcReel, type ReelPlan } from '../engine/recitation';

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
