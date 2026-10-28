// Search history and recently read mushaf pages: this device only (localStorage), newest first,
// each list cleared by the user from the search screen.

export interface RecentPage { page: number; s: number; a: number; at: number }

const MAX_SEARCHES = 10;
const MAX_PAGES = 12;

function read<T>(key: string, ok: (v: unknown) => v is T): T[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter(ok) : [];
  } catch {
    return [];
  }
}
function write(key: string, v: unknown[]) {
  try {
    if (v.length) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100;
const isPage = (v: unknown): v is RecentPage => {
  const p = v as RecentPage;
  return !!p && [p.page, p.s, p.a, p.at].every((n) => Number.isInteger(n) && n > 0) && p.page <= 604 && p.s <= 114;
};

export const recentSearches = () => read('searchHistory', isText);

/** Remembers a search the user acted on (opened a result or pressed Enter). */
export function addSearch(q: string) {
  const t = q.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 100) return;
  const key = t.toLowerCase();
  write('searchHistory', [t, ...recentSearches().filter((x) => x.toLowerCase() !== key)].slice(0, MAX_SEARCHES));
}

export function removeSearch(q: string) {
  write('searchHistory', recentSearches().filter((x) => x !== q));
}

export const clearSearches = () => write('searchHistory', []);

export const recentPages = () => read('recentPages', isPage);

/** A mushaf page the user stayed on (src/ui/mushaf.ts, after a few seconds). */
export function addRecentPage(page: number, s: number, a: number) {
  write('recentPages', [{ page, s, a, at: Date.now() }, ...recentPages().filter((p) => p.page !== page)].slice(0, MAX_PAGES));
}

export const clearRecentPages = () => write('recentPages', []);
