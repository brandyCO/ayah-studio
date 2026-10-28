// The user's own logos for their watermark, kept on this device only (localStorage, small PNGs).
import { registerLogo } from '../engine/mark';

const KEY = 'markLogos';
const MAX = 4;
const MAX_PX = 480; // longest side kept (the mark is at most ~144 px tall on the 1080 px frame)

export interface Logo {
  id: string;
  url: string; // data:image/png
}

export function listLogos(): Logo[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Logo[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string' && x.url.startsWith('data:image/')) : [];
  } catch {
    return [];
  }
}

const store = (list: Logo[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* full or private window: kept for this visit */ }
};

const decoded = new Map<string, Promise<HTMLImageElement | null>>();
/** Decode a saved logo and register it for the renderer (null: not on this device). */
export function loadLogo(id: string | undefined): Promise<HTMLImageElement | null> {
  if (!id) return Promise.resolve(null);
  let p = decoded.get(id);
  if (!p) {
    const logo = listLogos().find((x) => x.id === id);
    p = !logo ? Promise.resolve(null) : new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { registerLogo(id, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = logo.url;
    });
    decoded.set(id, p);
  }
  return p;
}

/** Read a picked image, scale it down (transparency kept), save it first in the list. */
export async function addLogo(file: File): Promise<Logo> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const logo = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, url: c.toDataURL('image/png') };
  store([logo, ...listLogos()]);
  registerLogo(logo.id, c);
  decoded.set(logo.id, Promise.resolve(null)); // registered above as the canvas itself
  return logo;
}

export function removeLogo(id: string) {
  store(listLogos().filter((x) => x.id !== id));
  decoded.delete(id);
}
