// WhatsApp Status parts: a reel cut into pieces of at most `limit` seconds, each cut in a pause —
// between ayat when one falls in the window, else between two text groups, never mid-word.
import type { Timeline } from './timeline';

export const STATUS_LIMIT = 30;
const MIN_PART = 8;

/** Where each part starts and ends (reel seconds). One part when the reel already fits. */
export function statusParts(tl: Timeline, limit = STATUS_LIMIT): { from: number; to: number }[] {
  const end = tl.duration;
  if (end <= limit + 0.05) return [{ from: 0, to: end }];
  const between = (a: number, b: number) => (a + Math.min(b, a + 0.6)) / 2; // the middle of the pause (≤ 0.3 s in)
  const ayahCuts: number[] = [];
  const groupCuts: number[] = [];
  tl.ayat.forEach((a, i) => {
    const next = tl.ayat[i + 1];
    if (next) ayahCuts.push(between(a.end, next.start));
    a.events.forEach((e, k) => {
      const n = a.events[k + 1];
      if (n && n.start >= e.end - 0.01) groupCuts.push(between(e.end, n.start));
    });
  });
  const parts: { from: number; to: number }[] = [];
  let at = 0;
  while (end - at > limit + 0.05) {
    const pick = (list: number[]) => list.filter((x) => x > at + MIN_PART && x <= at + limit).pop();
    const cut = pick(ayahCuts) ?? pick(groupCuts) ?? at + limit;
    parts.push({ from: at, to: cut });
    at = cut;
  }
  parts.push({ from: at, to: end });
  return parts;
}

/** The recitation between two reel times, as its own buffer. */
export function sliceAudio(buf: AudioBuffer, from: number, to: number): AudioBuffer {
  const a = Math.max(0, Math.round(from * buf.sampleRate));
  const b = Math.min(buf.length, Math.round(to * buf.sampleRate));
  const out = new AudioBuffer({ length: Math.max(1, b - a), sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
  return out;
}
