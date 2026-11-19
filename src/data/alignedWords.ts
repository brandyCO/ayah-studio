// Word times made by forced alignment for reciters that have none on Quran.com (everyayah and mp3quran
// recordings), checked offline by scripts/make-word-timings.py and bundled per reciter and surah:
// public/data/words/{key}/{SSS}.json = { a: { "ayah": [[word, startMs, endMs], ...] } }, word = 1-based
// display word (`displayWords`), times in the recording the reel plays (mp3quran: the surah file;
// everyayah: that ayah's own file). Only ayat whose words passed every check are listed; a reel with any
// other ayah stays in Ayah mode (rule 8).
// The build packs them by juz (scripts/pack-words.mjs): data/words/{key}/p{FFF}.json = { "surah": { "ayah": … } }
// for the surahs whose ayah 1 lies in one juz, FFF = the first of them; the dev server serves the surah files.
import { Capacitor } from '@capacitor/core';
import { PUBLIC_URL } from '../cloud/config';
import { FILES, timedFetch } from '../net';
import { hasAlignedWords, wordsKey, type Reciter } from './reciters';

export type AyahWords = [number, number, number][];

/** First surah of each word pack: the surahs whose ayah 1 lies in the same juz (checked by pack-words.mjs). */
export const WORD_PACKS = [1, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 17, 19, 21, 23, 26, 28, 30, 34, 37, 40, 42, 46, 52, 58, 67, 78];

const packOf = (surah: number) => WORD_PACKS.filter((f) => f <= surah).at(-1)!;
const pad = (n: number) => String(n).padStart(3, '0');

type Pack = Record<string, Record<string, AyahWords>>;
const files = new Map<string, Promise<Pack>>();

/** The surah's checked word times per ayah number (empty when it has none). */
export function alignedWords(r: Reciter, surah: number): Promise<Record<string, AyahWords>> {
  if (!hasAlignedWords(r, surah)) return Promise.resolve({});
  const dev = import.meta.env.DEV;
  const url = `./data/words/${wordsKey(r)}/${dev ? pad(surah) : `p${pad(packOf(surah))}`}.json`;
  if (!files.has(url)) {
    const p = wordsFile(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json().then((d) => (dev ? { [surah]: (d as { a: Record<string, AyahWords> }).a } : (d as Pack)));
    });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return files.get(url)!.then((d) => d[surah] ?? {}).catch(() => ({}));
}

const WORDS_CACHE = 'words';

/** Web: the bundled file. Android app: the word times (~34 MB in all) are left out of the APK, so they come
 *  from Cloudflare (else the Pages site) on first use and are kept in Cache Storage (newest 1500 juz packs: favourite reciters' too) for offline reels. */
async function wordsFile(path: string): Promise<Response> {
  if (!Capacitor.isNativePlatform()) return fetch(path);
  const url = PUBLIC_URL + path.replace(/^\.\//, '');
  const cache = await caches.open(WORDS_CACHE);
  const hit = await cache.match(url);
  if (hit) return hit;
  // Cloudflare first (no bandwidth limit), the Pages site when it does not answer; kept under the site's address.
  const viaFiles = FILES ? await timedFetch(`${FILES}/${path.replace(/^\.\//, '')}`, {}, 10000).catch(() => null) : null;
  const res = viaFiles?.ok ? viaFiles : await fetch(url);
  if (!res.ok) return res;
  await cache.put(url, res.clone());
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 1500))) await cache.delete(k);
  return res;
}
