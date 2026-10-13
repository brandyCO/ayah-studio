// Word times made by forced alignment for reciters that have none on Quran.com (everyayah and mp3quran
// recordings), checked offline by scripts/make-word-timings.py and bundled per reciter and surah:
// public/data/words/{key}/{SSS}.json = { a: { "ayah": [[word, startMs, endMs], ...] } }, word = 1-based
// display word (`displayWords`), times in the recording the reel plays (mp3quran: the surah file;
// everyayah: that ayah's own file). Only ayat whose words passed every check are listed; a reel with any
// other ayah stays in Ayah mode (rule 8).
import { hasAlignedWords, wordsKey, type Reciter } from './reciters';

export type AyahWords = [number, number, number][];

const files = new Map<string, Promise<Record<string, AyahWords>>>();

/** The surah's checked word times per ayah number (empty when it has none). */
export function alignedWords(r: Reciter, surah: number): Promise<Record<string, AyahWords>> {
  if (!hasAlignedWords(r, surah)) return Promise.resolve({});
  const url = `./data/words/${wordsKey(r)}/${String(surah).padStart(3, '0')}.json`;
  if (!files.has(url)) {
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json().then((d: { a: Record<string, AyahWords> }) => d.a);
    });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return files.get(url)!.catch(() => ({}));
}
