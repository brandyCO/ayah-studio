// Kids space (docs/kids.md): settings and progress for the child, kept on this device only
// (localStorage; never synced: nothing about the child leaves the device). A change fires
// `kids-changed`.

/** The surahs of the space, in path order: Al-Fatiha, then Juz 'Amma from An-Nas back to An-Naba. */
export const KIDS_SURAHS = [1, ...Array.from({ length: 37 }, (_, i) => 114 - i)];
export const isKidsSurah = (s: number) => KIDS_SURAHS.includes(s);
export const NAME_MAX = 24;

export interface KidsSettings {
  name: string; // the child's name or nickname (user text, ≤ 24 characters), may be empty
  reciter: number | null; // QDC id; null = the reel reciter
  speed: 0.75 | 1;
  repeats: 1 | 3;
  translation: boolean; // Sahih International under the ayah
}
const DEFAULTS: KidsSettings = { name: '', reciter: null, speed: 1, repeats: 1, translation: true };

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('kids-changed'));
}

/** The space is on: the app opens in it and only the parent gate leads out. */
export const kidsOn = () => read<boolean>('kidsOn', false) === true;
export const setKidsOn = (on: boolean) => write('kidsOn', on);
/** The parent finished the first-time setup. */
export const kidsSetUp = () => read<boolean>('kidsSetUp', false) === true;

export function kidsSettings(): KidsSettings {
  const v = read<Partial<KidsSettings>>('kidsSettings', {});
  const o = v && typeof v === 'object' ? v : {};
  return {
    name: typeof o.name === 'string' ? o.name.slice(0, NAME_MAX) : DEFAULTS.name,
    reciter: Number.isInteger(o.reciter) && (o.reciter as number) > 0 ? (o.reciter as number) : null,
    speed: o.speed === 0.75 ? 0.75 : 1,
    repeats: o.repeats === 3 ? 3 : 1,
    translation: typeof o.translation === 'boolean' ? o.translation : DEFAULTS.translation,
  };
}
export function setKidsSettings(patch: Partial<KidsSettings>) {
  const next = { ...kidsSettings(), ...patch };
  next.name = cleanName(next.name);
  write('kidsSettings', next);
  write('kidsSetUp', true);
}
/** A name as typed: no line breaks or control characters, single spaces, ≤ 24 characters. */
export const cleanName = (s: string) => s.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/** Learned surahs (their lanterns are lit): surah → when (ms). */
export function learned(): Record<number, number> {
  const v = read<Record<string, unknown>>('kidsLearned', {});
  const out: Record<number, number> = {};
  if (v && typeof v === 'object') for (const [k, t] of Object.entries(v)) if (isKidsSurah(Number(k)) && typeof t === 'number') out[Number(k)] = t;
  return out;
}
export function setLearned(s: number, on: boolean) {
  if (!isKidsSurah(s)) return;
  const all = learned();
  if (on) all[s] = all[s] ?? Date.now();
  else delete all[s];
  write('kidsLearned', all);
}

/** One-time pass through the space's router guard (the parent opened the editor from the space). */
export function grantPass(hash: string) {
  try {
    sessionStorage.setItem('kidsPass', hash);
  } catch {
    /* ignore */
  }
}
export function usePass(hash: string): boolean {
  try {
    const p = sessionStorage.getItem('kidsPass');
    return !!p && hash.startsWith(p);
  } catch {
    return false;
  }
}
export function clearPass() {
  try {
    sessionStorage.removeItem('kidsPass');
  } catch {
    /* ignore */
  }
}
