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
