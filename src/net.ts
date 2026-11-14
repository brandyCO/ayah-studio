// Shared bits for talking to our edge proxy (proxy/pixabay-worker.js) gently enough for a very large
// crowd: one anonymous install id (for fair per-person limits; never tied to an account), random
// spreading of retries, and remote switches the owner can flip in Cloudflare without a release.

/** The edge proxy (Cloudflare Worker); empty in builds without one. */
export const EDGE = (import.meta.env.VITE_PIXABAY_PROXY ?? '').replace(/\/+$/, '');

/**
 * Where the big static files (mushaf page fonts, word timings) come from: the Cloudflare worker
 * `ayah-studio-files` (files/wrangler.toml), which has no bandwidth limit, beside the edge proxy on the same
 * workers.dev address (or `VITE_FILES_URL`). Empty when unknown: then everything comes from the Pages site.
 * Every caller falls back to the Pages site when it does not answer.
 */
export const FILES = (import.meta.env.VITE_FILES_URL
  || EDGE.replace(/^https:\/\/ayah-studio-pixabay\.([a-z0-9-]+\.workers\.dev)$/, 'https://ayah-studio-files.$1')
  .replace(/^(?!https:\/\/ayah-studio-files\.).*$/, '')).replace(/\/+$/, '');

/** A random id for this install (shared with sync's device id). Nothing about the person. */
export function installId(): string {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = crypto.randomUUID().slice(0, 18);
      localStorage.setItem('deviceId', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/** `ms` spread randomly between half and one and a half times, so phones don't act in step. */
export const jitter = (ms: number) => Math.round(ms * (0.5 + Math.random()));

export interface RemoteConfig {
  /** Free library (Pixabay/Pexels) on. The proxy also refuses searches itself when off. */
  stock: boolean;
  /** "Popular this week" and the anonymous reel counter on. */
  popular: boolean;
  /** Background download of the whole mushaf on. */
  mushafDownload: boolean;
  /** Least minutes between two sync rounds started by returning to the app. */
  syncMinutes: number;
  /** Ranks asks the edge for its league's fingerprint (one database read per league, not per player). */
  leaguePulse: boolean;
}
const DEFAULTS: RemoteConfig = { stock: true, popular: true, mushafDownload: true, syncMinutes: 1, leaguePulse: true };
const KEY = 'remoteConfig';
const TTL = 3600e3;

let loading: Promise<RemoteConfig> | null = null;
/** The switches (kept an hour on this device; the defaults when offline or without a proxy). */
export function remoteConfig(): Promise<RemoteConfig> {
  loading ??= (async () => {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { at: number; v: Partial<RemoteConfig> } | null;
      if (c && Date.now() - c.at < TTL) return clean(c.v);
    } catch { /* no storage */ }
    if (!EDGE) return DEFAULTS;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(`${EDGE}/config`, { signal: ctl.signal }).finally(() => clearTimeout(t));
      if (!r.ok) return DEFAULTS;
      const v = clean(await r.json());
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* ignore */ }
      return v;
    } catch {
      return DEFAULTS;
    }
  })();
  return loading;
}

function clean(v: Partial<RemoteConfig> | null): RemoteConfig {
  const o = { ...DEFAULTS };
  if (v && typeof v === 'object') {
    for (const k of ['stock', 'popular', 'mushafDownload', 'leaguePulse'] as const) if (typeof v[k] === 'boolean') o[k] = v[k];
    if (typeof v.syncMinutes === 'number' && v.syncMinutes >= 0 && v.syncMinutes <= 120) o.syncMinutes = v.syncMinutes;
  }
  return o;
}
