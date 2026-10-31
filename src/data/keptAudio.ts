// Favourite reciters' recitations kept on this device for good (owner request 2026-10-31): one Cache
// Storage cache per reciter (`kept-reciter-{id}`, never trimmed; removed only by the user), filled by
// src/data/reciterDownload.ts. Every audio read checks it first, so a kept surah plays and makes reels
// without the network: the Range slices for reels (audioCache.ts), whole everyayah files, the Listen tab.
export const keptCache = (id: number) => `kept-reciter-${id}`;

const blobs = new Map<string, Blob>();

/** The kept copy of a recitation file, or null. */
export async function keptBlob(url: string): Promise<Blob | null> {
  const hit = blobs.get(url);
  if (hit) return hit;
  if (typeof caches === 'undefined' || !anyKept()) return null;
  try {
    const res = await caches.match(url);
    if (!res?.ok || !/audio|mpeg|octet/.test(res.headers.get('Content-Type') ?? 'audio')) return null;
    const b = await res.blob();
    if (blobs.size >= 24) blobs.delete(blobs.keys().next().value!);
    blobs.set(url, b);
    return b;
  } catch {
    return null;
  }
}

/** Whether any reciter has files kept (skips the cache lookups for everyone else). */
const anyKept = () => {
  try { return (localStorage.getItem('favKept') ?? '{}') !== '{}'; } catch { return false; }
};

export function forgetKept() {
  blobs.clear();
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
}

const urls = new Map<string, string>();
/** What an <audio> element should load: a local object URL for a kept file, else the URL itself. */
export async function playableUrl(url: string): Promise<string> {
  const have = urls.get(url);
  if (have) return have;
  const b = await keptBlob(url);
  if (!b) return url;
  const u = URL.createObjectURL(b.type ? b : b.slice(0, b.size, 'audio/mpeg'));
  urls.set(url, u);
  if (urls.size > 8) {
    const [k, v] = urls.entries().next().value!;
    urls.delete(k);
    URL.revokeObjectURL(v);
  }
  return u;
}
