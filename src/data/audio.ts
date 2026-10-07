// Recitation audio for a reel. Primary: a slice of the reciter's QDC full-surah recording, Range-
// fetched and trimmed by its timings. Fallback: everyayah.com per-ayah files (no word timings).
import { decodeMp3Span, VbrError, type DecodedSpan } from './mp3';
import { everyayahUrl, type Reciter } from './reciters';
import type { AudioPiece } from '../engine/recitation';

export const SAMPLE_RATE = 48_000;
const WHOLE_FILE_MAX = 240; // seconds: a VBR recording up to this long is decoded whole instead
const FADE = 0.015; // seconds, at the slice edges (no clicks)

const decoded = new Map<string, Promise<AudioBuffer>>();

const decode = (buf: ArrayBuffer) => new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(buf);

async function download(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download recitation audio (HTTP ${res.status})`);
  return res.arrayBuffer();
}

/** One ayah from everyayah.com (cached in memory; the HTTP cache keeps the MP3). */
export function ayahAudio(r: Reciter, surah: number, ayah: number): Promise<AudioBuffer> {
  const key = `${r.everyayah}/${surah}/${ayah}`;
  if (!decoded.has(key)) {
    const p = download(everyayahUrl(r, surah, ayah)).then(decode);
    p.catch(() => decoded.delete(key));
    decoded.set(key, p);
  }
  return decoded.get(key)!;
}

/** Concatenate clips into one stereo buffer, placing clip i at offsets[i] seconds. */
export function mixdown(clips: AudioBuffer[], offsets: number[], duration: number): AudioBuffer {
  const length = Math.ceil(duration * SAMPLE_RATE);
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  clips.forEach((clip, i) => {
    const at = Math.round(offsets[i] * SAMPLE_RATE);
    for (let ch = 0; ch < 2; ch++) {
      const src = clip.getChannelData(Math.min(ch, clip.numberOfChannels - 1));
      out.copyToChannel(src.subarray(0, Math.max(0, Math.min(src.length, length - at))), ch, at);
    }
  });
  return out;
}

/**
 * The reel's recitation: file seconds clip[0]..clip[1] of the surah recording, placed at `at` seconds
 * in a buffer of `duration` seconds. Only the bytes covering the clip are downloaded.
 */
export async function sliceAudio(url: string, clip: [number, number], at: number, duration: number, fileDuration: number | null): Promise<AudioBuffer> {
  let span: DecodedSpan;
  try {
    span = await decodeMp3Span(url, clip[0], clip[1], SAMPLE_RATE);
  } catch (e) {
    if (!(e instanceof VbrError) || !fileDuration || fileDuration > WHOLE_FILE_MAX) throw e;
    span = { buffer: await decode(await download(url)), t: 0 };
  }
  const R = SAMPLE_RATE;
  const out = new AudioBuffer({ length: Math.ceil(duration * R), numberOfChannels: 2, sampleRate: R });
  const from = Math.round((clip[0] - span.t) * R);
  const n = Math.min(Math.round((clip[1] - clip[0]) * R), span.buffer.length - from, out.length - Math.round(at * R));
  if (from < 0 || n <= 0) throw new Error('Recitation audio does not cover the selected ayat');
  const fade = Math.round(FADE * R);
  for (let ch = 0; ch < 2; ch++) {
    const seg = span.buffer.getChannelData(Math.min(ch, span.buffer.numberOfChannels - 1)).slice(from, from + n);
    for (let i = 0; i < fade && i < n; i++) {
      const g = Math.sin((Math.PI / 2) * (i / fade));
      seg[i] *= g;
      seg[n - 1 - i] *= g;
    }
    out.copyToChannel(seg, ch, Math.round(at * R));
  }
  return out;
}

/** The base reel audio rearranged into its pieces (pauses between ayat, room for the cards). */
export function arrangeAudio(src: AudioBuffer, pieces: AudioPiece[], duration: number): AudioBuffer {
  const R = src.sampleRate;
  const out = new AudioBuffer({ length: Math.ceil(duration * R), numberOfChannels: 2, sampleRate: R });
  const fade = Math.round(0.01 * R); // cuts fall in the reciter's pauses; fade them anyway
  for (const p of pieces) {
    const a = Math.round(p.from * R), b = Math.min(src.length, Math.round(p.to * R)), at = Math.round(p.at * R);
    const n = Math.min(b - a, out.length - at);
    if (n <= 0) continue;
    for (let ch = 0; ch < 2; ch++) {
      const seg = src.getChannelData(Math.min(ch, src.numberOfChannels - 1)).slice(a, a + n);
      for (let i = 0; i < fade && i < n; i++) {
        const g = Math.sin((Math.PI / 2) * (i / fade));
        if (a > 0) seg[i] *= g;
        if (b < src.length) seg[n - 1 - i] *= g;
      }
      out.copyToChannel(seg, ch, at);
    }
  }
  return out;
}
