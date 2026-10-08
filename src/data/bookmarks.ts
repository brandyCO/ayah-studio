// Bookmarked ayat, kept on this device (localStorage; synced with the account later, docs/together.md
// T0). Newest first. A change fires `bookmarks-changed` on window so open views can repaint.
export interface Bookmark {
  s: number;
  a: number;
  at: number; // when it was saved (ms)
}

const KEY = 'bookmarks';
const MAX = 500;

export function bookmarks(): Bookmark[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((b): b is Bookmark => !!b && Number.isInteger(b.s) && Number.isInteger(b.a) && typeof b.at === 'number');
  } catch {
    return [];
  }
}

function save(list: Bookmark[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage unavailable: kept for this visit only */
  }
  window.dispatchEvent(new Event('bookmarks-changed'));
}

export const isBookmarked = (s: number, a: number) => bookmarks().some((b) => b.s === s && b.a === a);

/** Adds the bookmark, or removes it if it exists. Returns true when it is now bookmarked. */
export function toggleBookmark(s: number, a: number): boolean {
  const list = bookmarks();
  const i = list.findIndex((b) => b.s === s && b.a === a);
  if (i >= 0) {
    list.splice(i, 1);
    save(list);
    return false;
  }
  save([{ s, a, at: Date.now() }, ...list]);
  return true;
}

export function removeBookmark(s: number, a: number) {
  save(bookmarks().filter((b) => !(b.s === s && b.a === a)));
}
