// Word times made by forced alignment for reciters that have none on Quran.com (everyayah and mp3quran
// recordings), checked offline by scripts/make-word-timings.py and bundled per reciter and surah:
// public/data/words/{key}/{SSS}.json = { a: { "ayah": [[word, startMs, endMs], ...] } }, word = 1-based
// display word (`displayWords`), times in the recording the reel plays (mp3quran: the surah file;
// everyayah: that ayah's own file). Only ayat whose words passed every check are listed; a reel with any
// other ayah stays in Ayah mode (rule 8).
import { Capacitor } from '@capacitor/core';
import { PUBLIC_URL } from '../cloud/config';
import { hasAlignedWords, wordsKey, type Reciter } from './reciters';

export type AyahWords = [number, number, number][];

const files = new Map<string, Promise<Record<string, AyahWords>>>();

/** The surah's checked word times per ayah number (empty when it has none). */
export function alignedWords(r: Reciter, surah: number): Promise<Record<string, AyahWords>> {
  if (!hasAlignedWords(r, surah)) return Promise.resolve({});
  const url = `./data/words/${wordsKey(r)}/${String(surah).padStart(3, '0')}.json`;
  if (!files.has(url)) {
    const p = wordsFile(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json().then((d: { a: Record<string, AyahWords> }) => d.a);
    });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return files.get(url)!.catch(() => ({}));
}

const WORDS_CACHE = 'words';

/** Web: the bundled file. Android app: the word times (~34 MB in all) are left out of the APK, so they come
 *  from the Pages site on first use and are kept in Cache Storage (newest 1500 surahs: favourite reciters' too) for offline reels. */
async function wordsFile(path: string): Promise<Response> {
  if (!Capacitor.isNativePlatform()) return fetch(path);
  const url = PUBLIC_URL + path.replace(/^\.\//, '');
  const cache = await caches.open(WORDS_CACHE);
  const hit = await cache.match(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) return res;
  await cache.put(url, res.clone());
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 1500))) await cache.delete(k);
  return res;
}
