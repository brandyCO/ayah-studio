// The user's media library: uploads from the device and downloads from Pixabay, kept in IndexedDB
// on this device only (never uploaded anywhere). Each item is registered as a background, so scenes
// refer to it by id like a preset ('u:…' for uploads, 'px:image:…' / 'px:video:…' for Pixabay).
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { registerBackground, unregisterBackground, type Background, type Credit } from '../engine/backgrounds';
import { tx as dbTx } from './db';

export interface MediaItem {
  id: string;
  kind: 'image' | 'video';
  label: string;
  blob: Blob;
  thumb: Blob; // 216×384 JPEG
  added: number;
  credit?: Credit;
}

/** Largest video accepted (IndexedDB space on a phone is limited). */
export const MAX_VIDEO_MB = 250;

const STORE = 'media';
const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) => dbTx<T>(STORE, mode, run);

const thumbUrls = new Map<string, string>();
function register(m: MediaItem) {
  if (!thumbUrls.has(m.id)) thumbUrls.set(m.id, URL.createObjectURL(m.thumb));
  const thumb = thumbUrls.get(m.id)!;
  const b: Background = m.kind === 'image'
    ? { id: m.id, label: m.label, kind: 'image', src: m.blob, thumb, credit: m.credit }
    : { id: m.id, label: m.label, kind: 'video', src: m.blob, thumb, credit: m.credit };
  registerBackground(b);
}

let loaded: Promise<void> | null = null;
/** Registers every library item as a background (once per page load). Never fails: no storage → empty library. */
export function loadLibrary(): Promise<void> {
  loaded ??= tx<MediaItem[]>('readonly', (s) => s.getAll())
    .then((items) => items.sort((a, b) => b.added - a.added).forEach(register))
    .catch((e) => console.warn('Media library unavailable', e));
  return loaded;
}

export async function deleteMedia(id: string) {
  await tx('readwrite', (s) => s.delete(id));
  unregisterBackground(id);
  const url = thumbUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  thumbUrls.delete(id);
}

export async function hasMedia(id: string) {
  return (await tx<IDBValidKey | undefined>('readonly', (s) => s.getKey(id))) !== undefined;
}

async function save(m: MediaItem) {
  // Ask the browser to keep the library when space runs low (best effort).
  void navigator.storage?.persist?.().catch(() => {});
  await tx('readwrite', (s) => s.put(m));
  register(m);
}

const TW = 216, TH = 384; // thumbnail size (9:16, like the presets)

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const jpeg = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/jpeg', q));

/** A 9:16 thumbnail of `src`, cropped to cover. */
function thumbnail(src: CanvasImageSource, sw: number, sh: number) {
  const c = canvas(TW, TH);
  const ctx = c.getContext('2d')!;
  const k = Math.max(TW / sw, TH / sh);
  ctx.drawImage(src, (TW - sw * k) / 2, (TH - sh * k) / 2, sw * k, sh * k);
  return jpeg(c, 0.8);
}

/**
 * An image ready for the reel: no larger than it needs to be to cover the 1080×1920 frame with room
 * for the Ken Burns motion, as an opaque JPEG.
 */
async function prepareImage(file: Blob) {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be opened');
  }
  const k = Math.min(1, Math.max(1296 / bmp.width, 2304 / bmp.height), 4096 / Math.max(bmp.width, bmp.height));
  const c = canvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const out = { blob: await jpeg(c, 0.9), thumb: await thumbnail(bmp, bmp.width, bmp.height) };
  bmp.close();
  return out;
}

/** Checks that this device can decode the video, and takes its first frame as the thumbnail. */
async function prepareVideo(file: Blob) {
  if (file.size > MAX_VIDEO_MB * 1e6) throw new Error(`Videos up to ${MAX_VIDEO_MB} MB, please`);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new Error('This file has no video this app can read');
    if (!(await track.canDecode())) throw new Error('This device cannot play this video format');
    const sink = new CanvasSink(track, { width: TW, height: TH, fit: 'cover' });
    const first = await sink.getCanvas(await track.getFirstTimestamp());
    if (!first) throw new Error('This video has no frames');
    const c = canvas(TW, TH);
    c.getContext('2d')!.drawImage(first.canvas, 0, 0);
    return { blob: file, thumb: await jpeg(c, 0.8) };
  } finally {
    input.dispose();
  }
}

const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

/** Adds a file picked from the device. Its sound is never used (rule 3: recitation audio only). */
export async function importFile(file: File): Promise<MediaItem> {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!kind) throw new Error(`${file.name}: not an image or a video`);
  const p = kind === 'image' ? await prepareImage(file) : await prepareVideo(file);
  const label = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || (kind === 'image' ? 'Photo' : 'Video');
  const m: MediaItem = { id: `u:${uid()}`, kind, label, ...p, added: Date.now() };
  await save(m);
  return m;
}

/** Adds media downloaded from a stock library (kept here: no permanent hotlinking). */
export async function importDownload(id: string, kind: 'image' | 'video', blob: Blob, label: string, credit: Credit): Promise<MediaItem> {
  const p = kind === 'image' ? await prepareImage(blob) : await prepareVideo(blob);
  const m: MediaItem = { id, kind, label, ...p, added: Date.now(), credit };
  await save(m);
  return m;
}

/** Space used by this site on the device (library, caches), if the browser says. */
export async function storageUsed(): Promise<number | null> {
  try {
    return (await navigator.storage?.estimate?.())?.usage ?? null;
  } catch {
    return null;
  }
}
