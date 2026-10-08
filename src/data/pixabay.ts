// Pixabay library: search through a tiny key-holding proxy (proxy/pixabay-worker.js; the repo is
// public, so the API key never ships in the app), then download the picked file into the local
// library. Pixabay API terms: results are cached (24 h at the proxy), the source is shown wherever
// results are, and files are downloaded rather than hotlinked.
import { hasMedia, importDownload, type MediaItem } from './library';

export interface PixabayHit {
  id: number;
  type: 'image' | 'video';
  thumb: string; // small preview (hotlinking allowed for previews)
  src: string; // the file to download (cdn.pixabay.com, CORS-enabled)
  width: number;
  height: number;
  user: string;
  page: string; // the item's page on pixabay.com
  tags: string;
  duration?: number; // seconds (videos)
}

export interface PixabayPage {
  total: number;
  hits: PixabayHit[];
}

const PROXY = (import.meta.env.VITE_PIXABAY_PROXY ?? '').replace(/\/+$/, '');
export const pixabayEnabled = () => PROXY !== '';

/** Calm search ideas (rule 4: nature/abstract, no people). */
export const SUGGESTIONS = ['Clouds', 'Sea', 'Mountains', 'Night sky', 'Rain', 'Forest', 'Desert', 'Sunset', 'Water', 'Snow'];

const pages = new Map<string, Promise<PixabayPage>>();

export function searchPixabay(type: 'image' | 'video', q: string, page = 1): Promise<PixabayPage> {
  const query = q.trim().slice(0, 100);
  const key = `${type}|${query.toLowerCase()}|${page}`;
  if (!pages.has(key)) {
    const url = `${PROXY}/search?${new URLSearchParams({ type, q: query, page: String(page) })}`;
    const p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 429 ? 'Too many searches — try again in a minute' : `Search failed (${r.status})`);
      return (await r.json()) as PixabayPage;
    });
    p.catch(() => pages.delete(key));
    pages.set(key, p);
  }
  return pages.get(key)!;
}

export const pixabayId = (h: PixabayHit) => `px:${h.type}:${h.id}`;

/** Downloads a hit into the library (once; later picks use the stored copy). */
export async function downloadHit(h: PixabayHit, onProgress?: (fraction: number) => void): Promise<string> {
  const id = pixabayId(h);
  if (await hasMedia(id)) return id;
  // Straight from Pixabay's CDN; through the proxy if the browser may not read it (no CORS headers).
  const r = await fetch(h.src).catch(() => fetch(`${PROXY}/file?${new URLSearchParams({ url: h.src })}`));
  if (!r.ok || !r.body) throw new Error(r.status === 403 || r.status === 410 ? 'This link has expired — search again later' : `Download failed (${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress?.(got / total);
  }
  const blob = new Blob(chunks as BlobPart[], { type: r.headers.get('content-type') ?? (h.type === 'image' ? 'image/jpeg' : 'video/mp4') });
  const label = (h.tags.split(',')[0]?.trim() || (h.type === 'image' ? 'Photo' : 'Video')).replace(/^./, (c) => c.toUpperCase());
  const m: MediaItem = await importDownload(id, h.type, blob, label, { author: h.user, url: h.page, source: 'Pixabay' });
  return m.id;
}
