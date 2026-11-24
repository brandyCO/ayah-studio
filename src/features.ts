// Feature flags for things that wait on an owner decision (docs/grow.md §0). Off unless turned on
// here or, for testing on one device, in Device check.
const DEFAULTS = {
  /** Tafsir beside the translation (G4): on since 2026-11-24 (owner: "do what Tarteel does"). */
  tafsir: true,
};
export type Feature = keyof typeof DEFAULTS;

export function feature(f: Feature): boolean {
  try {
    const v = localStorage.getItem(`flag:${f}`);
    return v === null ? DEFAULTS[f] : v === '1';
  } catch {
    return DEFAULTS[f];
  }
}

export function setFeature(f: Feature, on: boolean) {
  try {
    localStorage.setItem(`flag:${f}`, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
