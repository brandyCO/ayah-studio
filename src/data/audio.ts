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

/** Join clips into one stereo buffer, clip i at offsets[i] seconds. Where a clip starts before the
 *  previous one ends (per-ayah files joined directly), the overlap is crossfaded (equal power). */
export function mixdown(clips: AudioBuffer[], offsets: number[], duration: number): AudioBuffer {
  const length = Math.ceil(duration * SAMPLE_RATE);
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  const starts = offsets.map((o) => Math.round(o * SAMPLE_RATE));
  for (let ch = 0; ch < 2; ch++) {
    const dst = out.getChannelData(ch);
    clips.forEach((clip, i) => {
      const at = starts[i];
      const src = clip.getChannelData(Math.min(ch, clip.numberOfChannels - 1));
      const n = Math.max(0, Math.min(src.length, length - at));
      const xin = i > 0 ? Math.max(0, starts[i - 1] + clips[i - 1].length - at) : 0;
      const xout = i + 1 < clips.length ? Math.max(0, at + src.length - starts[i + 1]) : 0;
      for (let k = 0; k < n; k++) {
        let g = 1;
        if (k < xin) g *= Math.sin((Math.PI / 2) * (k / xin));
        if (k >= src.length - xout) g *= Math.cos((Math.PI / 2) * ((k - (src.length - xout)) / xout));
        dst[at + k] += src[k] * g;
      }
    });
  }
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
  const cut = Math.round(0.01 * R); // cuts fall in the reciter's pauses; fade them anyway
  pieces.forEach((p, k) => {
    const a = Math.round(p.from * R), b = Math.min(src.length, Math.round(p.to * R)), at = Math.round(p.at * R);
    const n = Math.min(b - a, out.length - at);
    if (n <= 0) return;
    // A piece that simply continues the previous one (nothing trimmed or added between) needs no fade.
    const prev = pieces[k - 1], next = pieces[k + 1];
    const joinedBefore = !!prev && Math.abs(prev.to - p.from) < 1e-4 && Math.abs(prev.at + (prev.to - prev.from) - p.at) < 1e-4;
    const joinedAfter = !!next && Math.abs(next.from - p.to) < 1e-4 && Math.abs(p.at + (p.to - p.from) - next.at) < 1e-4;
    const fin = joinedBefore || a === 0 ? 0 : Math.min(n, Math.round((p.fadeIn ?? 0.01) * R));
    const fout = joinedAfter || b >= src.length ? 0 : Math.min(n, Math.round((p.fadeOut ?? 0.01) * R));
    for (let ch = 0; ch < 2; ch++) {
      const seg = src.getChannelData(Math.min(ch, src.numberOfChannels - 1)).slice(a, a + n);
      for (let i = 0; i < fin; i++) seg[i] *= Math.sin((Math.PI / 2) * (i / fin));
      // Long fades decay like a room's echo (quadratic); a plain cut keeps the short sine.
      for (let i = 0; i < fout; i++) {
        const x = i / fout; // 0 at the very end
        seg[n - 1 - i] *= fout > cut ? x * x : Math.sin((Math.PI / 2) * x);
      }
      out.copyToChannel(seg, ch, at);
    }
  });
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

/** Echo on the reciter's own voice (nothing is added, rule 3): an algorithmic room (Freeverb-style
 *  combs + all-passes) and optional repeats. All amounts 0–1; pure, so preview = export. */
export interface Echo { amount: number; space: number; tail: number; repeat: number }
export const ECHO_PRESETS: Record<'room' | 'hall' | 'masjid' | 'mountain', Echo> = {
  room: { amount: 0.25, space: 0.25, tail: 0.3, repeat: 0 },
  hall: { amount: 0.35, space: 0.6, tail: 0.6, repeat: 0 },
  masjid: { amount: 0.45, space: 0.85, tail: 0.8, repeat: 0.1 },
  mountain: { amount: 0.35, space: 0.7, tail: 0.5, repeat: 0.45 },
};
export function validEcho(v: unknown): Echo | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, Math.round(x * 100) / 100)) : 0);
  const e = { amount: n(o.amount), space: n(o.space), tail: n(o.tail), repeat: n(o.repeat) };
  return e.amount > 0 ? e : undefined;
}

export function addEcho(src: AudioBuffer, e: Echo | undefined): AudioBuffer {
  if (!e || e.amount <= 0) return src;
  const R = src.sampleRate, n = src.length;
  const k = R / 44100;
  const size = 0.6 + e.space * 0.8; // room size scales the comb lengths
  const fb = 0.7 + e.tail * 0.27; // how long it rings
  const damp = 0.15 + (1 - e.tail) * 0.35; // brighter when long
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const pre = Math.round((0.012 + e.space * 0.04) * R);
  const echoD = Math.round((0.26 + e.space * 0.22) * R), echoFb = e.repeat * 0.55, echoMix = e.repeat * 0.6;
  const dryIn = [src.getChannelData(0), src.getChannelData(Math.min(1, src.numberOfChannels - 1))];
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: R });
  for (let c = 0; c < 2; c++) {
    const dry = dryIn[c];
    const spread = c ? Math.round(23 * k) : 0;
    // Mono-ish input to the room, with the pre-delay.
    const inp = new Float32Array(n);
    for (let i = pre; i < n; i++) inp[i] = (dryIn[0][i - pre] + dryIn[1][i - pre]) * 0.5 * 0.015;
    // Repeats: a feedback delay on the input (a voice coming back off far walls).
    if (echoMix > 0) {
      const d = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const back = i >= echoD ? d[i - echoD] : 0;
        d[i] = inp[i] + back * echoFb;
        inp[i] += back * echoMix;
      }
    }
    const wet = new Float32Array(n);
    for (const len0 of combs) {
      const len = Math.max(1, Math.round((len0 * size + spread) * k));
      const buf = new Float32Array(len);
      let idx = 0, store = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = inp[i] + store * fb;
        wet[i] += y;
        if (++idx >= len) idx = 0;
      }
    }
    for (const len0 of alls) {
      const len = Math.max(1, Math.round((len0 + spread) * k));
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx];
        const x = wet[i];
        buf[idx] = x + b * 0.5;
        wet[i] = b - x;
        if (++idx >= len) idx = 0;
      }
    }
    const res = new Float32Array(n);
    const w = e.amount * 3, d0 = 1 - e.amount * 0.35;
    for (let i = 0; i < n; i++) res[i] = dry[i] * d0 + wet[i] * w;
    out.copyToChannel(res, c);
  }
  return out;
}
