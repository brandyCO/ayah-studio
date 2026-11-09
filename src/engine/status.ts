// WhatsApp Status parts: a reel longer than a Status (90 s since 2025) cut into as few pieces as possible,
// of similar length, each cut in a pause — between ayat when one falls in the window, else between two
// text groups, never mid-word. A reel that fits is shared whole.
import type { Timeline } from './timeline';

export const STATUS_LIMIT = 90;
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
    // Parts still needed, and where an even split would cut; the cut must leave a remainder that the
    // other parts can still carry.
    const left = Math.ceil((end - at - 0.05) / limit);
    const ideal = at + (end - at) / left;
    const lo = Math.max(at + MIN_PART, end - (left - 1) * limit);
    const ok = (x: number) => x >= lo && x <= at + limit;
    const pick = (list: number[]) => {
      const fit = list.filter(ok);
      return fit.length ? fit.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a)) : undefined;
    };
    const loose = (list: number[]) => list.filter((x) => x > at + MIN_PART && x <= at + limit).pop();
    const cut = pick(ayahCuts) ?? pick(groupCuts) ?? loose(ayahCuts) ?? loose(groupCuts) ?? ideal;
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
