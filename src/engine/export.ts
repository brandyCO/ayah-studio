// Export: fixed-step render loop → CanvasSource (WebCodecs VideoEncoder) + recitation PCM →
// AudioBufferSource (AAC) → Mediabunny MP4 muxer. Uses the same render() as the preview.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeAudio,
} from 'mediabunny';
import type { BackgroundMedia } from './backgrounds';
import type { ExportPath } from './capabilities';
import { H, W } from './layout';
import type { Project } from './project';
import { render } from './render';
import { prepareScenes, sceneSpans } from './scenes';
import type { Timeline } from './timeline';

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
}

let aacRegistered = false;

export async function exportVideo(o: ExportOptions): Promise<Blob> {
  const { path } = o;
  if (path.audioCodec === 'aac' && !aacRegistered && !(await canEncodeAudio('aac'))) {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
    aacRegistered = true;
  }

  const scale = o.height / H;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = o.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const output = new Output({
    format: path.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, {
    codec: path.videoCodec,
    bitrate: o.height === 1920 ? 6_000_000 : 3_500_000,
    keyFrameInterval: 2,
    fullCodecString: path.fullCodecString,
    hardwareAcceleration: path.hardware ? 'prefer-hardware' : 'no-preference',
  });
  const audio = new AudioBufferSource({ codec: path.audioCodec, bitrate: 128_000 });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio);

  const abort = () => void output.cancel();
  o.signal.addEventListener('abort', abort);
  try {
    await output.start();
    await audio.add(o.audio);
    audio.close();

    const frames = Math.ceil(o.timeline.duration * FPS);
    const spans = sceneSpans(o.timeline.scenes, o.project.transition);
    for (let i = 0; i < frames; i++) {
      if (o.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = i / FPS;
      await prepareScenes(spans, t, o.media, o.project.clips ?? []);
      render(ctx, t, o.project, o.timeline, o.media);
      await video.add(t, 1 / FPS);
      if (i % 5 === 0) o.onProgress(i / frames);
    }
    video.close();
    await output.finalize();
    o.onProgress(1);
    const mime = path.container === 'mp4' ? 'video/mp4' : 'video/webm';
    return new Blob([output.target.buffer!], { type: mime });
  } catch (e) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    throw e;
  } finally {
    o.signal.removeEventListener('abort', abort);
  }
}
