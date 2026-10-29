// Recitation audio for a reel. Primary: a slice of the reciter's QDC full-surah recording, Range-
// fetched and trimmed by its timings. Fallback: everyayah.com per-ayah files (no word timings).
import { cachedBytes } from './audioCache';
import { decodeMp3Span, VbrError, type DecodedSpan, type SeekTable } from './mp3';
import { DEFAULT_RECITER, everyayahUrl, reciterById, type Reciter } from './reciters';
import type { AudioPiece } from '../engine/recitation';

export const SAMPLE_RATE = 48_000;
const WHOLE_FILE_MAX = 240; // seconds: a VBR recording up to this long is decoded whole instead
const FADE = 0.015; // seconds, at the slice edges (no clicks)

const decoded = new Map<string, Promise<AudioBuffer>>();

const decode = (buf: ArrayBuffer) => new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(buf);

/** A whole file (kept on the device for offline use); a fresh copy each time, as decoding consumes it. */
async function download(url: string): Promise<ArrayBuffer> {
  const bytes = await cachedBytes(`${url}|all`, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download recitation audio (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  });
  return bytes.slice().buffer;
}

/** One ayah from everyayah.com (cached in memory; the HTTP cache keeps the MP3). A reciter who is not
 *  on everyayah (mp3quran only) is replaced by the default one. */
export function ayahAudio(r: Reciter, surah: number, ayah: number): Promise<AudioBuffer> {
  if (!r.everyayah) r = reciterById(DEFAULT_RECITER);
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
export async function sliceAudio(url: string, clip: [number, number], at: number, duration: number, fileDuration: number | null, seek?: SeekTable): Promise<AudioBuffer> {
  let span: DecodedSpan;
  try {
    span = await decodeMp3Span(url, clip[0], clip[1], SAMPLE_RATE, undefined, seek);
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

/**
 * The finished recitation, as platforms like it: brought to one steady loudness (speech around
 * -18 dBFS RMS, peaks kept under -1 dBFS) with a soft fade at the very start and end. Nothing is added
 * (rule 3); the words are untouched. Same input → same output, so preview = export.
 */
export function polishAudio(src: AudioBuffer): AudioBuffer {
  const R = src.sampleRate, n = src.length, chs = Math.min(2, src.numberOfChannels);
  const data = Array.from({ length: chs }, (_, c) => src.getChannelData(c));
  // Speech loudness: mean power of 50 ms windows above a -45 dBFS gate (silences don't count).
  const win = Math.max(1, Math.round(0.05 * R));
  let sum = 0, count = 0, peak = 0;
  for (let i = 0; i < n; i += win) {
    let p = 0;
    const e = Math.min(n, i + win);
    for (let c = 0; c < chs; c++) for (let j = i; j < e; j++) { const v = data[c][j]; p += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    p /= (e - i) * chs;
    if (p > 3.2e-5) { sum += p; count++; }
  }
  const rms = count ? Math.sqrt(sum / count) : 0;
  const gain = rms > 0 ? Math.min(8, Math.max(0.25, 0.126 / rms), peak > 0 ? 0.89 / peak : 8) : 1;
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: R });
  const fin = Math.min(n, Math.round(0.03 * R)), fout = Math.min(n, Math.round(0.35 * R));
  for (let c = 0; c < 2; c++) {
    const seg = data[Math.min(c, chs - 1)].slice();
    for (let i = 0; i < n; i++) seg[i] *= gain;
    for (let i = 0; i < fin; i++) seg[i] *= Math.sin((Math.PI / 2) * (i / fin));
    for (let i = 0; i < fout; i++) seg[n - 1 - i] *= Math.sin((Math.PI / 2) * (i / fout));
    out.copyToChannel(seg, c);
  }
  return out;
}
