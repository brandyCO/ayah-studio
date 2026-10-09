// Kids space recitations (docs/kids.md K2): the reciter's whole QDC recording of a short surah, kept
// on this device (IndexedDB `audio`, the same `{url}|all` entries as src/data/audio.ts) so a surah
// played once works offline. The parent can keep every surah of the space for the current reciter.
import { KIDS_SURAHS } from './kids';
import { cachedBytes } from './audioCache';
import { qdcSurah, type QdcSurah } from './qdc';

const whole = (url: string) => cachedBytes(`${url}|all`, async () => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the recitation (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
});

export interface KidsRecitation {
  qdc: QdcSurah;
  /** A blob: URL of the whole recording; revoke it when done. */
  src: string;
}

/** The surah's recording and timings, from the device when kept before. */
export async function kidsRecitation(reciter: number, surah: number): Promise<KidsRecitation> {
  const qdc = await qdcSurah(reciter, surah);
  const bytes = await whole(qdc.audioUrl);
  noteKept(reciter, surah);
  return { qdc, src: URL.createObjectURL(new Blob([bytes.slice()], { type: 'audio/mpeg' })) };
}

/** Keeps every surah of the space for one reciter; reports progress; returns how many failed. */
export async function keepAllOffline(reciter: number, progress: (done: number, total: number) => void): Promise<number> {
  let done = 0;
  let failed = 0;
  for (const s of KIDS_SURAHS) {
    try {
      const q = await qdcSurah(reciter, s);
      await whole(q.audioUrl);
      noteKept(reciter, s);
    } catch {
      failed++;
    }
    progress(++done, KIDS_SURAHS.length);
  }
  return failed;
}

/** Surahs kept per reciter (a note on this device; the bytes are in IndexedDB). */
function keptList(): Record<string, number[]> {
  try {
    const v = JSON.parse(localStorage.getItem('kidsKept') ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function noteKept(reciter: number, surah: number) {
  const all = keptList();
  const l = new Set(Array.isArray(all[reciter]) ? all[reciter] : []);
  if (l.has(surah)) return;
  l.add(surah);
  all[reciter] = [...l];
  try {
    localStorage.setItem('kidsKept', JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
/** How many surahs of the space have been kept for a reciter. */
export const keptCount = (reciter: number) => (keptList()[reciter] ?? []).filter((s) => KIDS_SURAHS.includes(s)).length;
