// Decode a time span of a long MP3 without downloading the whole file: read the header to learn the
// frame layout, HTTP Range-fetch only the frames covering the span (+ margin), decode them with Web
// Audio and report the exact file time of the first decoded sample, so the caller can trim precisely.
//
// Constant-bitrate files are exact: frame k starts at audioStart + k · bytesPerFrame. The decoded
// chunk is aligned by its end (its last frame is known), because a decoder may drop the first frames
// of a chunk whose bit reservoir points into bytes we did not fetch. Verified in Chromium against a
// whole-file decode (within one sample at 48 kHz). Variable-bitrate files can only be positioned
// approximately, so they are refused (`VbrError`) and the caller decodes the whole file or falls back.
import { cachedBytes } from './audioCache';

interface Frame {
  len: number;
  spf: number; // samples per frame
  sr: number;
  br: number; // bits per second
  mpeg1: boolean;
  mono: boolean;
}

const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR = [44100, 48000, 32000];

/** MPEG audio Layer III frame header at b[i], or null. */
function frameAt(b: Uint8Array, i: number): Frame | null {
  if (i < 0 || i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[i + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  if (ver === 1 || ((b[i + 1] >> 1) & 3) !== 1) return null;
  const bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
  if (bri === 0 || bri === 15 || sri === 3) return null;
  const mpeg1 = ver === 3;
  const sr = SR[sri] / (mpeg1 ? 1 : ver === 2 ? 2 : 4);
  const br = (mpeg1 ? BR1 : BR2)[bri] * 1000;
  const spf = mpeg1 ? 1152 : 576;
  return { len: Math.floor((spf / 8) * br / sr) + ((b[i + 2] >> 1) & 1), spf, sr, br, mpeg1, mono: b[i + 3] >> 6 === 3 };
}

const sameStream = (a: Frame, b: Frame) => a.sr === b.sr && a.mpeg1 === b.mpeg1 && a.mono === b.mono;

/** First offset ≥ from where a frame is followed by two more of the same stream (or the buffer ends). */
function sync(b: Uint8Array, from: number): number {
  for (let i = from; i + 4 <= b.length; i++) {
    const f = frameAt(b, i);
    if (!f) continue;
    let j = i + f.len, ok = true;
    for (let k = 0; k < 2 && j + 4 <= b.length; k++) {
      const g = frameAt(b, j);
      if (!g || !sameStream(f, g)) { ok = false; break; }
      j += g.len;
    }
    if (ok) return i;
  }
  return -1;
}

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

export interface Mp3Info {
  audioStart: number; // byte offset of the first audio frame (after ID3 and any Xing/Info frame)
  sr: number;
  spf: number;
  br: number;
  /** CBR: average bytes per frame (exact over the stream); null for VBR. */
  bytesPerFrame: number | null;
  /** Samples a full-file decode drops at the start (encoder delay + decoder delay, from the LAME tag). */
  skip: number;
}

/** Bytes a..b (inclusive): kept on the device after the first download (offline use). */
const range = (url: string, a: number, b: number, signal?: AbortSignal) => cachedBytes(`${url}|${a}-${b}`, () => fetchRange(url, a, b, signal));

/** Fetch bytes a..b (inclusive). Reads only what is needed if the server ignores Range. */
async function fetchRange(url: string, a: number, b: number, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 206) return new Uint8Array(await res.arrayBuffer());
  // 200: the whole file is coming; keep bytes a..b and stop reading.
  const out = new Uint8Array(b - a + 1);
  const reader = res.body!.getReader();
  let at = 0, got = 0;
  while (got < out.length) {
    const { done, value } = await reader.read();
    if (done) break;
    const lo = Math.max(a - at, 0), hi = Math.min(value.length, b + 1 - at);
    if (hi > lo) {
      out.set(value.subarray(lo, hi), got);
      got += hi - lo;
    }
    at += value.length;
  }
  void reader.cancel().catch(() => {});
  return out.subarray(0, got);
}

const probes = new Map<string, Promise<Mp3Info>>();

export function probeMp3(url: string): Promise<Mp3Info> {
  if (!probes.has(url)) {
    const p = probe(url);
    p.catch(() => probes.delete(url));
    probes.set(url, p);
  }
  return probes.get(url)!;
}

async function probe(url: string): Promise<Mp3Info> {
  let base = 0;
  let b = await range(url, 0, 16383);
  // Skip ID3v2 tags (cover art can make them large).
  while (b.length >= 10 && ascii(b, 0, 3) === 'ID3') {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    base += 10 + size + (b[5] & 0x10 ? 10 : 0);
    b = await range(url, base, base + 16383);
  }
  const i = sync(b, 0);
  if (i < 0) throw new Error('Not an MP3 stream');
  const f = frameAt(b, i)!;
  const side = f.mpeg1 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17);
  const x = i + 4 + side;
  const tag = ascii(b, x, 4);
  const info: Mp3Info = {
    audioStart: base + i,
    sr: f.sr,
    spf: f.spf,
    br: f.br,
    bytesPerFrame: (f.spf / 8) * f.br / f.sr,
    skip: 0,
  };
  if (tag === 'Xing' || tag === 'Info') {
    info.audioStart = base + i + f.len; // the tag frame carries no audio
    const audio = frameAt(b, i + f.len);
    if (audio) info.br = audio.br;
    info.bytesPerFrame = (f.spf / 8) * info.br / f.sr;
    const flags = u32(b, x + 4);
    // Skip the frames / bytes / TOC / quality fields to reach the LAME extension.
    const p = x + 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0) + (flags & 4 ? 100 : 0) + (flags & 8 ? 4 : 0);
    // Encoder delay (12 bits at +21); a whole-file decode drops it plus the decoder's 529 samples.
    if (/^(LAME|Lavc|Lavf|GOGO|L3.9)/.test(ascii(b, p, 4))) info.skip = ((b[p + 21] << 4) | (b[p + 22] >> 4)) + 529;
    if (tag === 'Xing') info.bytesPerFrame = null;
  } else if (ascii(b, i + 36, 4) === 'VBRI') {
    info.bytesPerFrame = null;
  }
  return info;
}

export interface DecodedSpan {
  buffer: AudioBuffer;
  /** File time (seconds) of the buffer's first sample. */
  t: number;
}

export class VbrError extends Error {}

const MARGIN_FRAMES = 12; // ~0.3 s before the span: room for the bit reservoir and decoder warm-up

/** Decode file seconds [t0, t1] (plus a margin) at `rate`. */
export async function decodeMp3Span(url: string, t0: number, t1: number, rate: number, signal?: AbortSignal): Promise<DecodedSpan> {
  const info = await probeMp3(url);
  const bpf = info.bytesPerFrame;
  if (!bpf) throw new VbrError('Variable-bitrate MP3: cannot seek exactly');
  const byteOf = (k: number) => info.audioStart + Math.floor(k * bpf);
  const frameAtTime = (t: number) => Math.floor((t * info.sr + info.skip) / info.spf);
  const k0 = Math.max(0, frameAtTime(t0) - MARGIN_FRAMES);
  const k1 = frameAtTime(t1) + 4;
  const a = Math.max(info.audioStart, byteOf(k0) - 16);
  const b = byteOf(k1 + 1) + 2048;
  const bytes = await range(url, a, b, signal);

  // Keep whole frames only, from the first sync to the last complete frame.
  const first = sync(bytes, 0);
  if (first < 0) throw new Error('No MP3 frames in the fetched range');
  let end = first, frames = 0;
  for (let f = frameAt(bytes, end); f && end + f.len <= bytes.length; f = frameAt(bytes, end)) {
    if (f.br !== info.br) throw new VbrError('MP3 bitrate changes: not constant-bitrate');
    end += f.len;
    frames++;
  }
  if (frames < 2) throw new Error('MP3 range too short');
  const firstFrame = Math.round((a + first - info.audioStart) / bpf);
  const buffer = await new OfflineAudioContext(2, 1, rate).decodeAudioData(bytes.slice(first, end).buffer);
  // Align by the end: the chunk's last sample is the end of frame firstFrame + frames - 1.
  const endTime = ((firstFrame + frames) * info.spf - info.skip) / info.sr;
  return { buffer, t: endTime - buffer.duration };
}
