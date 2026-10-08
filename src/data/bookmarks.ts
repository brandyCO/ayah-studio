// Bookmarked ayat, kept on this device (localStorage) and synced with the account when signed in
// (src/cloud/sync.ts). Newest first. A removed bookmark stays as a dated tombstone for a while so the
// removal reaches the user's other devices. A change fires `bookmarks-changed` on window.
export interface Bookmark {
  s: number;
  a: number;
  at: number; // when it was saved (ms)
}
export interface BookmarkRecord extends Bookmark {
  deleted?: true; // removed at `at`
}

const KEY = 'bookmarks';
const MAX = 500;
const TOMBSTONE_DAYS = 120;

const valid = (b: unknown): b is BookmarkRecord => {
  const r = b as BookmarkRecord;
  return !!r && Number.isInteger(r.s) && r.s >= 1 && r.s <= 114 && Number.isInteger(r.a) && r.a >= 1 && r.a <= 286 && typeof r.at === 'number';
};

/** Every record, removals included (for syncing). */
export function bookmarkRecords(): BookmarkRecord[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return [];
  }
}

export const bookmarks = (): Bookmark[] => bookmarkRecords().filter((b) => !b.deleted);

function save(list: BookmarkRecord[]) {
  const old = Date.now() - TOMBSTONE_DAYS * 86_400_000;
  const kept = list.filter((b) => !b.deleted || b.at > old).sort((x, y) => y.at - x.at);
  const live = kept.filter((b) => !b.deleted).slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify([...live, ...kept.filter((b) => b.deleted)]));
  } catch {
    /* storage unavailable: kept for this visit only */
  }
  window.dispatchEvent(new Event('bookmarks-changed'));
}

const same = (b: Bookmark, s: number, a: number) => b.s === s && b.a === a;
export const isBookmarked = (s: number, a: number) => bookmarks().some((b) => same(b, s, a));

/** Adds the bookmark, or removes it if it exists. Returns true when it is now bookmarked. */
export function toggleBookmark(s: number, a: number): boolean {
  const on = !isBookmarked(s, a);
  save([{ s, a, at: Date.now(), ...(on ? {} : { deleted: true as const }) }, ...bookmarkRecords().filter((b) => !same(b, s, a))]);
  return on;
}

export function removeBookmark(s: number, a: number) {
  save([{ s, a, at: Date.now(), deleted: true }, ...bookmarkRecords().filter((b) => !same(b, s, a))]);
}

/** Merges records from another device: per ayah, the newest change (added or removed) wins. */
export function mergeBookmarks(remote: unknown[]) {
  const byKey = new Map(bookmarkRecords().map((b) => [`${b.s}:${b.a}`, b]));
  let changed = false;
  for (const r of remote.filter(valid)) {
    const k = `${r.s}:${r.a}`;
    const mine = byKey.get(k);
    if (!mine || r.at > mine.at) {
      byKey.set(k, { s: r.s, a: r.a, at: r.at, ...(r.deleted ? { deleted: true as const } : {}) });
      changed = true;
    }
  }
  if (changed) save([...byKey.values()]);
}
