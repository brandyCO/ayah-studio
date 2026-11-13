// Export: fixed-step render loop → CanvasSource (WebCodecs VideoEncoder) + recitation PCM →
// AudioBufferSource (AAC) → Mediabunny MP4 muxer. Uses the same render() as the preview.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  canEncodeAudio,
} from 'mediabunny';
import type { BackgroundMedia } from './backgrounds';
import type { ExportPath } from './capabilities';
import { H, setFrame, W } from './layout';
import type { Project } from './project';
import { render } from './render';
import { prepareScenes, sceneSpans } from './scenes';
import type { Timeline } from './timeline';
import { sliceAudio } from './status';

export const FPS = 30;

export interface ExportOptions {
  project: Project;
  timeline: Timeline;
  audio: AudioBuffer;
  media: BackgroundMedia[]; // per scene entry
  path: ExportPath;
  height: 1920 | 1280;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
  /** The chosen cover frame as a JPEG (also embedded as the MP4's cover art). */
  onCover?: (jpeg: Blob) => void;
  /** Only this part of the reel (seconds), e.g. one WhatsApp Status piece; the audio is cut to match. */
  range?: { from: number; to: number };
}

let aacRegistered = false;

/** Where the finished video goes. A file on the phone's disk when the browser can (OPFS), so a long
 *  reel never has to fit in memory at once; else memory, as before. */
interface Sink { target: BufferTarget | StreamTarget; done(): Promise<Blob>; drop(): Promise<void> }

export async function diskSink(mime: string): Promise<Sink | null> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return null;
    // Earlier exports' files: kept a few hours (their result page may still share them), then removed.
    for await (const [name, handle] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (!name.startsWith('export-') || handle.kind !== 'file') continue;
      const f = await (handle as FileSystemFileHandle).getFile().catch(() => null);
      if (f && Date.now() - f.lastModified > 6 * 3600_000) await root.removeEntry(name).catch(() => {});
    }
    const name = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fh = await root.getFileHandle(name, { create: true });
    if (typeof fh.createWritable !== 'function') { await root.removeEntry(name).catch(() => {}); return null; }
    const w = await fh.createWritable();
    const stream = new WritableStream<{ type: 'write'; data: Uint8Array; position: number }>({
      write: (c) => w.write({ type: 'write', position: c.position, data: c.data as Uint8Array<ArrayBuffer> }),
      close: () => w.close(),
      abort: () => w.abort(),
    });
    return {
      target: new StreamTarget(stream, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      done: async () => { const f = await fh.getFile(); return new Blob([f], { type: mime }); },
      drop: async () => { await w.abort().catch(() => {}); await root.removeEntry(name).catch(() => {}); },
    };
  } catch {
    return null;
  }
}

/** Keeps the screen on while the video is made (the phone sleeping would pause it). */
function keepAwake(): () => void {
  type Lock = { release(): Promise<void> };
  const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Lock> } }).wakeLock;
  if (!wl) return () => {};
  let lock: Lock | null = null;
  let on = true;
  const take = () => { if (on && !document.hidden) void wl.request('screen').then((l) => { if (on) lock = l; else void l.release(); }, () => {}); };
  const onVis = () => { if (!document.hidden && !lock) take(); if (document.hidden) lock = null; };
  document.addEventListener('visibilitychange', onVis);
  take();
  return () => { on = false; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => {}); lock = null; };
}

export async function exportVideo(o: ExportOptions): Promise<Blob> {
  const { path } = o;
  if (path.audioCodec === 'aac' && !aacRegistered && !(await canEncodeAudio('aac'))) {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
    aacRegistered = true;
  }

  // `height` is the 9:16 height (1920 / 1280); other formats keep the same short side (1080 / 720).
  setFrame(o.project.format);
  const scale = (o.height * 9) / 16 / Math.min(W, H);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const mime = path.container === 'mp4' ? 'video/mp4' : 'video/webm';
  const t0 = o.range?.from ?? 0;
  const t1 = o.range?.to ?? o.timeline.duration;
  const first = Math.round(t0 * FPS);
  const frames = Math.ceil(t1 * FPS) - first;
  const disk = await diskSink(mime);
  const target = disk?.target ?? new BufferTarget();
  // On disk the MP4's index is written into space kept at the start (still Fast Start, no full copy
  // in memory); its size comes from the packet counts, with a third more as a margin.
  const reserve = !!disk && path.container === 'mp4';
  const output = new Output({
    format: path.container === 'mp4' ? new Mp4OutputFormat({ fastStart: reserve ? 'reserve' : 'in-memory' }) : new WebMOutputFormat(),
    target,
  });
  const video = new CanvasSource(canvas, {
    codec: path.videoCodec,
    bitrate: o.height === 1920 ? 6_000_000 : 3_500_000,
    keyFrameInterval: 2,
    fullCodecString: path.fullCodecString,
    hardwareAcceleration: path.hardware ? 'prefer-hardware' : 'no-preference',
  });
  const audio = new AudioBufferSource({ codec: path.audioCodec, bitrate: 128_000 });
  const audioPackets = Math.ceil(((t1 - t0) * o.audio.sampleRate) / 1024);
  output.addVideoTrack(video, { frameRate: FPS, ...(reserve ? { maximumPacketCount: Math.ceil(frames * 1.34) + 8 } : {}) });
  output.addAudioTrack(audio, reserve ? { maximumPacketCount: Math.ceil(audioPackets * 1.34) + 8 } : {});

  // The cover frame: drawn first, embedded as cover art, handed back as an image.
  const cover = o.range ? undefined : o.project.cover;
  if (cover !== undefined && cover <= o.timeline.duration) {
    const spans0 = sceneSpans(o.timeline.scenes, o.project.transition);
    await prepareScenes(spans0, cover, o.media, o.project.clips ?? [], false, o.project.slowmo ?? 1);
    render(ctx, cover, o.project, o.timeline, o.media);
    const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));
    if (jpeg) {
      if (path.container === 'mp4') output.setMetadataTags({ images: [{ data: new Uint8Array(await jpeg.arrayBuffer()), mimeType: 'image/jpeg', kind: 'coverFront' }] });
      o.onCover?.(jpeg);
    }
  }

  const abort = () => void output.cancel();
  o.signal.addEventListener('abort', abort);
  const release = keepAwake();
  try {
    await output.start();
    await audio.add(o.range ? sliceAudio(o.audio, t0, t1) : o.audio);
    audio.close();

    const spans = sceneSpans(o.timeline.scenes, o.project.transition);
    // Pipelined: while frame i is being encoded, the background video is already decoding frame i + 1
    // (`video.add` copies the canvas at once, so the next frame can be prepared straight away).
    const prep = (i: number) => prepareScenes(spans, (first + i) / FPS, o.media, o.project.clips ?? [], false, o.project.slowmo ?? 1);
    let ready = prep(0);
    for (let i = 0; i < frames; i++) {
      if (o.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = (first + i) / FPS;
      await ready;
      render(ctx, t, o.project, o.timeline, o.media);
      const encoded = video.add(i / FPS, 1 / FPS);
      ready = i + 1 < frames ? prep(i + 1) : null;
      await encoded;
      if (i % 5 === 0) o.onProgress(i / frames);
    }
    await ready;
    video.close();
    await output.finalize();
    o.onProgress(1);
    if (disk) return await disk.done();
    return new Blob([(target as BufferTarget).buffer!], { type: mime });
  } catch (e) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    await disk?.drop();
    throw e;
  } finally {
    release();
    o.signal.removeEventListener('abort', abort);
  }
}
