// Free stock libraries (Pixabay, Pexels): search through a tiny key-holding proxy
// (proxy/pixabay-worker.js; the repo is public, so API keys never ship in the app), then download
// the picked file into the local library. Terms: searches are cached (24 h at the proxy), the source
// is shown wherever results are, creators are credited, and files are downloaded, not hotlinked.
import { hasMedia, importDownload } from './library';

export type StockSource = 'pixabay' | 'pexels';
export const SOURCE_NAME: Record<StockSource, 'Pixabay' | 'Pexels'> = { pixabay: 'Pixabay', pexels: 'Pexels' };
export const SOURCE_SITE: Record<StockSource, string> = { pixabay: 'https://pixabay.com/', pexels: 'https://www.pexels.com/' };

export interface StockHit {
  id: number;
  source?: StockSource; // missing in answers from the first version of the proxy (Pixabay only)
  type: 'image' | 'video';
  thumb: string; // small preview (hotlinking allowed for previews)
  src: string; // the file to download (CORS-enabled CDN)
  alt?: string; // a second URL for the same file
  width: number;
  height: number;
  user: string;
  page: string; // the item's page at the source
  tags: string;
  duration?: number; // seconds (videos)
}

export interface StockPage {
  total: number;
  hits: StockHit[];
}

export interface StockSources {
  pixabay: boolean;
  pexels: boolean;
  collections: { id: string; label: string }[];
}

const PROXY = (import.meta.env.VITE_PIXABAY_PROXY ?? '').replace(/\/+$/, '');
export const stockEnabled = () => PROXY !== '';

/** Calm search ideas, used when the proxy has no curated collections (rule 4: nature/abstract, no people). */
export const SUGGESTIONS = ['Clouds', 'Sea', 'Mountains', 'Night sky', 'Rain', 'Forest', 'Desert', 'Sunset', 'Water', 'Snow'];

let sources: Promise<StockSources> | null = null;
/** What the proxy offers. An older proxy without /sources has Pixabay search only. */
export function stockSources(): Promise<StockSources> {
  sources ??= fetch(`${PROXY}/sources`)
    .then(async (r) => (r.ok ? ((await r.json()) as StockSources) : { pixabay: true, pexels: false, collections: [] }))
    .catch(() => {
      sources = null; // offline: ask again next time
      return { pixabay: true, pexels: false, collections: [] };
    });
  return sources;
}

export interface StockQuery {
  source: StockSource;
  type: 'image' | 'video';
  q?: string;
  collection?: string;
  page: number;
}

const pages = new Map<string, Promise<StockPage>>();

export function searchStock(s: StockQuery): Promise<StockPage> {
  const params = new URLSearchParams({ source: s.source, type: s.type, page: String(s.page) });
  if (s.collection) params.set('collection', s.collection);
  else params.set('q', (s.q ?? '').trim().slice(0, 100));
  const key = params.toString().toLowerCase();
  if (!pages.has(key)) {
    const p = fetch(`${PROXY}/search?${params}`).then(async (r) => {
      if (!r.ok) {
        const msg = ((await r.json().catch(() => null)) as { error?: string } | null)?.error;
        throw new Error(r.status === 429 ? msg ?? 'Too many searches — try again in a minute' : msg ?? `Search failed (${r.status})`);
      }
      const page = (await r.json()) as StockPage;
      for (const h of page.hits) h.source ??= s.source;
      return page;
    });
    p.catch(() => pages.delete(key));
    pages.set(key, p);
  }
  return pages.get(key)!;
}

export const stockId = (h: StockHit) => `${h.source === 'pexels' ? 'pe' : 'px'}:${h.type}:${h.id}`;

/** Downloads a hit into the library (once; later picks use the stored copy). */
export async function downloadHit(h: StockHit, onProgress?: (fraction: number) => void): Promise<string> {
  const id = stockId(h);
  if (await hasMedia(id)) return id;
  // Straight from the library's CDN; the second URL, then the proxy's relay, if that fails.
  const relay = () => fetch(`${PROXY}/file?${new URLSearchParams({ url: h.src })}`);
  const r = await fetch(h.src)
    .then((x) => (x.ok || !h.alt ? x : fetch(h.alt)))
    .catch(() => (h.alt ? fetch(h.alt).catch(relay) : relay()));
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
  const label = (h.tags.split(',')[0]?.trim() || (h.type === 'image' ? 'Photo' : 'Video')).replace(/^./, (c) => c.toUpperCase()).slice(0, 40);
  await importDownload(id, h.type, blob, label, { author: h.user, url: h.page, source: SOURCE_NAME[h.source ?? 'pixabay'] });
  return id;
}
