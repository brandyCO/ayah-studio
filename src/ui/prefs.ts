// Per-device UI preferences (best effort: storage can be unavailable).
export type ReaderMode = 'mushaf' | 'translation';

export function readerMode(): ReaderMode {
  try {
    return localStorage.getItem('readerMode') === 'translation' ? 'translation' : 'mushaf';
  } catch {
    return 'mushaf';
  }
}

export function setReaderMode(m: ReaderMode) {
  try {
    localStorage.setItem('readerMode', m);
  } catch {
    /* ignore */
  }
}

/** Last reciter picked in the editor (QDC id); also used for the length estimate while selecting. */
export function reelReciter(fallback: number): number {
  try {
    const v = Number(localStorage.getItem('reelReciter'));
    return Number.isInteger(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function setReelReciter(id: number) {
  try {
    localStorage.setItem('reelReciter', String(id));
  } catch {
    /* ignore */
  }
}
