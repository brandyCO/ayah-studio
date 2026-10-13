// "Popular this week": which reciters and ayat people made reels of in the last 7 days (anonymous
// daily counts in Supabase: supabase/migrations/20261015000000_studio_styles_popular.sql), plus the
// owner's weekly pick (public/data/trending.json, shown as "Trending"). Plain fetch to the database's
// REST endpoint, so nobody downloads the Supabase client for this. Nothing about the person is sent:
// only the reciter id and the ayah range of an exported reel.
import { SUPABASE_KEY, SUPABASE_URL } from '../cloud/config';
import { RECITERS } from './reciters';

const base = import.meta.env.BASE_URL;

export interface Popular {
  reciters: { id: number; trending: boolean }[]; // most used first; the owner's pick first of all
  ayat: { surah: number; from: number; to: number; trending: boolean }[];
}

const rpc = (fn: string, body: object = {}) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Count an exported reel (fire and forget; offline or failing is fine). */
export async function recordReel(reciterId: number, surah: number, from: number, to: number) {
  try {
    await rpc('record_reel', { reciter_id: reciterId, s: surah, a_from: from, a_to: to });
  } catch {
    /* offline */
  }
}

const parseRange = (key: unknown) => {
  const m = typeof key === 'string' ? /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(key) : null;
  if (!m) return null;
  const surah = +m[1], from = +m[2], to = m[3] ? +m[3] : from;
  return surah >= 1 && surah <= 114 && from >= 1 && to >= from && to - from < 10 ? { surah, from, to } : null;
};
const known = (id: unknown): id is number => typeof id === 'number' && RECITERS.some((r) => r.id === id);

const CACHE = 'popular';
const TTL = 6 * 3600 * 1000;
let loading: Promise<Popular> | null = null;

/** This week's popular reciters and ayat (kept for 6 hours on this device; empty when offline). */
export function loadPopular(): Promise<Popular> {
  loading ??= (async () => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as { at: number; p: Popular } | null;
      if (c && Date.now() - c.at < TTL && Array.isArray(c.p?.reciters) && Array.isArray(c.p?.ayat)) return c.p;
    } catch { /* no storage */ }
    const [counts, pick] = await Promise.all([
      rpc('popular_this_week').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ reciters?: { id: unknown }[]; ayat?: { key: unknown }[] } | null>,
      fetch(`${base}data/trending.json?v=${__DATA_VERSION__}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ reciter?: unknown; ayah?: unknown } | null>,
    ]);
    const p: Popular = { reciters: [], ayat: [] };
    if (known(pick?.reciter)) p.reciters.push({ id: pick!.reciter as number, trending: true });
    for (const r of counts?.reciters ?? []) if (known(r.id) && !p.reciters.some((x) => x.id === r.id)) p.reciters.push({ id: r.id, trending: false });
    const pickAyah = parseRange(pick?.ayah);
    if (pickAyah) p.ayat.push({ ...pickAyah, trending: true });
    for (const a of counts?.ayat ?? []) {
      const r = parseRange(a.key);
      if (r && !p.ayat.some((x) => x.surah === r.surah && x.from === r.from && x.to === r.to)) p.ayat.push({ ...r, trending: false });
    }
    if (counts || pick) try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), p })); } catch { /* no storage */ }
    return p;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

export const popularReciters = () => loadPopular().then((p) => p.reciters);
