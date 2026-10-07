// Background presets and their decoded media. Video loops are decoded frame-accurately with
// Mediabunny (never by seeking a <video> element), so preview and export see the same frames.
// User media (uploads, Pixabay downloads) comes from the local library as blobs: see src/data/library.ts.
import { ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource, type InputVideoTrack, type WrappedCanvas } from 'mediabunny';

/** Who made a library item and where it came from (shown in the picker and on the export page). */
export interface Credit {
  author: string;
  url: string; // the item's page at the source
  source: 'Pixabay';
}

export type Background =
  | { id: string; label: string; kind: 'image'; src: string | Blob; thumb: string; credit?: Credit }
  | { id: string; label: string; kind: 'video'; src: string | Blob; alt?: string; thumb: string; credit?: Credit }
  | { id: string; label: string; kind: 'color'; color: string };

const bg = (f: string) => `${import.meta.env.BASE_URL}backgrounds/${f}`;

export const BACKGROUNDS: Background[] = [
  { id: 'mist', label: 'Mist', kind: 'video', src: bg('mist-loop.mp4'), alt: bg('mist-loop.webm'), thumb: bg('mist-loop-thumb.jpg') },
  { id: 'motes', label: 'Light', kind: 'video', src: bg('motes-loop.mp4'), alt: bg('motes-loop.webm'), thumb: bg('motes-loop-thumb.jpg') },
  { id: 'dunes', label: 'Dunes', kind: 'image', src: bg('dusk-dunes.jpg'), thumb: bg('dusk-dunes-thumb.jpg') },
  { id: 'night', label: 'Night', kind: 'image', src: bg('night-sky.jpg'), thumb: bg('night-sky-thumb.jpg') },
  { id: 'midnight', label: 'Midnight', kind: 'color', color: '#0f1b2d' },
  { id: 'forest', label: 'Forest', kind: 'color', color: '#12291f' },
  { id: 'charcoal', label: 'Charcoal', kind: 'color', color: '#1d1d22' },
];

/** Backgrounds from the user's library (registered by src/data/library.ts), in library order. */
const library = new Map<string, Background>();
export const libraryBackgrounds = () => [...library.values()];
export function registerBackground(b: Background) {
  library.set(b.id, b);
}
export function unregisterBackground(id: string) {
  library.delete(id);
}

export const isBackground = (id: string) => library.has(id) || BACKGROUNDS.some((b) => b.id === id);
/** A scene whose media was deleted from the library shows a calm colour instead. */
export const backgroundById = (id: string) =>
  library.get(id) ?? BACKGROUNDS.find((b) => b.id === id) ?? (id.includes(':') ? BACKGROUNDS.find((b) => b.id === 'charcoal')! : BACKGROUNDS[0]);

/** A seamlessly looping video whose current frame is copied into `canvas` by `prepare(t)`. */
export class VideoLoop {
  readonly canvas: HTMLCanvasElement;
  private iter: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  private next: WrappedCanvas | null = null;
  private shown = -1;
  private busy: Promise<void> | null = null;

  private constructor(private sink: CanvasSink, readonly duration: number, w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
  }

  /** Opens the first source this device can decode (H.264 MP4, then VP9 WebM). */
  static async open(...srcs: (string | Blob)[]): Promise<VideoLoop> {
    let track: InputVideoTrack | null = null;
    for (const src of srcs) {
      const input = new Input({ source: typeof src === 'string' ? new UrlSource(src) : new BlobSource(src), formats: ALL_FORMATS });
      const t = await input.getPrimaryVideoTrack();
      if (t && (await t.canDecode())) {
        track = t;
        break;
      }
    }
    if (!track) throw new Error('This device cannot decode the background video');
    const duration = await track.computeDuration();
    // Decode no larger than needed to cover the 1080×1920 frame (phone videos are often 4K).
    const k = Math.min(1, Math.max(1080 / track.displayWidth, 1920 / track.displayHeight));
    const w = Math.round(track.displayWidth * k), h = Math.round(track.displayHeight * k);
    const loop = new VideoLoop(new CanvasSink(track, { width: w, height: h, fit: 'cover', poolSize: 2 }), duration, w, h);
    await loop.prepare(0);
    return loop;
  }

  get isBusy() {
    return this.busy !== null;
  }

  /** Make `canvas` hold the frame for time t (looped). Calls are serialized. */
  prepare(t: number): Promise<void> {
    if (this.busy) return this.busy.then(() => this.prepare(t));
    this.busy = this.seek(((t % this.duration) + this.duration) % this.duration).finally(() => (this.busy = null));
    return this.busy;
  }

  private async seek(lt: number) {
    // Restart the decoder when jumping backwards (loop wrap, scrubbing) or far ahead.
    if (!this.iter || lt < this.shown || lt > this.shown + 1) {
      await this.iter?.return();
      this.iter = this.sink.canvases(lt);
      this.next = (await this.iter.next()).value ?? null;
      this.shown = -1;
    }
    let frame: WrappedCanvas | null = null;
    while (this.next && this.next.timestamp <= lt + 1e-4) {
      frame = this.next;
      const ctx = this.canvas.getContext('2d')!;
      ctx.drawImage(frame.canvas, 0, 0, this.canvas.width, this.canvas.height);
      this.shown = frame.timestamp;
      this.next = (await this.iter.next()).value ?? null;
    }
    if (!frame && this.shown < 0 && this.next) {
      // Requested time is before the first frame: show the first frame.
      this.canvas.getContext('2d')!.drawImage(this.next.canvas, 0, 0, this.canvas.width, this.canvas.height);
      this.shown = this.next.timestamp;
    }
  }

  dispose() {
    void this.iter?.return();
    this.iter = null;
  }
}

export interface BackgroundMedia {
  bg: Background;
  image?: ImageBitmap;
  video?: VideoLoop;
}

const images = new Map<string | Blob, Promise<ImageBitmap>>();

export async function loadBackground(b: Background): Promise<BackgroundMedia> {
  if (b.kind === 'image') {
    const src = b.src;
    if (!images.has(src)) {
      const p = (typeof src === 'string' ? fetch(src).then((r) => r.blob()) : Promise.resolve(src)).then((blob) => createImageBitmap(blob));
      p.catch(() => images.delete(src));
      images.set(src, p);
    }
    return { bg: b, image: await images.get(src)! };
  }
  if (b.kind === 'video') return { bg: b, video: await VideoLoop.open(...(b.alt ? [b.src, b.alt] : [b.src])) };
  return { bg: b };
}
