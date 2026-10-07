import { audioUrls, type Reciter } from './reciters';

export const SAMPLE_RATE = 48_000;

const decoded = new Map<string, Promise<AudioBuffer>>();

async function fetchFirst(urls: string[]): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.arrayBuffer();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not download recitation audio (${lastErr instanceof Error ? lastErr.message : lastErr})`);
}

/** Download and decode one ayah's recitation (cached in memory; the HTTP cache keeps the MP3). */
export function ayahAudio(r: Reciter, surah: number, ayah: number, globalAyah: number): Promise<AudioBuffer> {
  const key = `${r.id}/${globalAyah}`;
  if (!decoded.has(key)) {
    const p = fetchFirst(audioUrls(r, surah, ayah, globalAyah)).then((buf) =>
      new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(buf),
    );
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
