// Per-device UI preferences (best effort: storage can be unavailable). The ones in SYNCED_PREFS
// follow the user's account across devices (src/cloud/sync.ts): each change records when it was made,
// and the newest change wins.
export const SYNCED_PREFS = ['readerMode', 'reelReciter', 'reelLook', 'timeTint', 'lastRead', 'translation'] as const;
type SyncedPref = (typeof SYNCED_PREFS)[number];

function prefTimes(): Record<string, number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem('prefsAt') ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Records that a synced preference changed now. */
export function touchPref(key: SyncedPref) {
  try {
    localStorage.setItem('prefsAt', JSON.stringify({ ...prefTimes(), [key]: Date.now() }));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('prefs-changed'));
}

/** Synced preferences with their change times (for syncing). */
export function prefRecords(): Record<string, { v: string | null; at: number }> {
  const at = prefTimes();
  const out: Record<string, { v: string | null; at: number }> = {};
  for (const k of SYNCED_PREFS) {
    try {
      out[k] = { v: localStorage.getItem(k), at: at[k] ?? 0 };
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Takes the newer value of each preference from another device. Returns true if any changed. */
export function mergePrefs(remote: unknown): boolean {
  if (!remote || typeof remote !== 'object') return false;
  const times = prefTimes();
  let changed = false;
  for (const k of SYNCED_PREFS) {
    const r = (remote as Record<string, { v?: unknown; at?: unknown }>)[k];
    if (!r || typeof r.at !== 'number' || r.at <= (times[k] ?? 0)) continue;
    if (r.v !== null && typeof r.v !== 'string') continue;
    if (typeof r.v === 'string' && r.v.length > 20000) continue;
    try {
      if (r.v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, r.v);
      times[k] = r.at;
      changed = true;
    } catch {
      /* ignore */
    }
  }
  if (changed) {
    try {
      localStorage.setItem('prefsAt', JSON.stringify(times));
    } catch {
      /* ignore */
    }
  }
  return changed;
}
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
  touchPref('readerMode');
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
  touchPref('reelReciter');
}

/** The look of the last reel (text mode, mood settings, colours, pacing…), applied to the next one. */
export function reelLook(): unknown {
  try {
    return JSON.parse(localStorage.getItem('reelLook') ?? 'null');
  } catch {
    return null;
  }
}

export function setReelLook(look: unknown) {
  try {
    localStorage.setItem('reelLook', JSON.stringify(look));
  } catch {
    /* ignore */
  }
  touchPref('reelLook');
}

/** Where the user was reading (`#/s/{surah}/{ayah}`): the app reopens there; Al-Fatiha the first time. */
const READ = /^#\/s\/\d{1,3}(\/\d{1,3})?$/;
export function lastRead(): string {
  try {
    const h = localStorage.getItem('lastRead');
    if (h && READ.test(h)) return h;
  } catch {
    /* ignore */
  }
  return '#/s/1';
}

export function setLastRead(hash: string) {
  if (!READ.test(hash)) return;
  try {
    if (localStorage.getItem('lastRead') === hash) return;
    localStorage.setItem('lastRead', hash);
  } catch {
    /* ignore */
  }
  touchPref('lastRead');
}

/** The first-run tour (src/ui/tour.ts) was shown or skipped on this device. */
export function tourSeen(): boolean {
  try {
    return !!localStorage.getItem('tourSeen');
  } catch {
    return true; // no storage: never nag
  }
}
export function markTourSeen() {
  try {
    localStorage.setItem('tourSeen', '1');
  } catch {
    /* ignore */
  }
}
