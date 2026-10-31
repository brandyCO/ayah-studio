// Ayah Studio · edge proxy (Cloudflare Worker): Pixabay and Pexels search, plus the few calls every
// phone makes to Supabase ("Popular this week", the anonymous reel counter) and remote switches.
// Holds the API keys (secrets PIXABAY_KEY and, optionally, PEXELS_KEY) so they never ship in the
// public app, caches every search for 24 h (Pixabay API terms; also saves Pexels' hourly quota),
// filters out results that show people (rule 4) and returns only the fields the app needs.
//
//   GET /sources                                  →  { pixabay, pexels, collections: [{ id, label }] }
//   GET /search?source=pixabay|pexels&type=image|video&q=clouds&page=1[&i=<install id>]
//   GET /search?source=…&type=…&collection=skies&page=1   (a curated calm collection)
//        →  { total, hits: [{ id, source, type, thumb, src, width, height, user, page, tags, duration? }] }
//   GET /file?url=<a Pixabay/Pexels file URL>     →  the file with CORS headers (only used when the
//                                                    browser cannot fetch it directly)
//   GET /popular                                  →  Supabase popular_this_week(), cached 10 min
//   POST /reel?i=<install id>  (text/plain JSON {r, s, a, b}) →  Supabase record_reel(), rate-limited
//   GET /config                                   →  remote switches for the app (variable FLAGS)
//
// Built to hold a very large crowd on free plans and to grow by adding bindings, no code change:
// - Searches are cached in this data center (Cache API) and, with a KV namespace bound as STOCK_KV,
//   worldwide, so "clouds" searched in London is not a fresh Pixabay call in Jakarta.
// - A daily scheduled run (Cron Trigger) builds every curated collection and the Quick reel footage
//   searches ahead of time, so browsing them never waits on (or spends) the library's limit.
// - The calls to each library are counted in one place for the whole world when a Durable Object is
//   bound as BUDGET (class Budget below), so all copies of the worker together stay under the key's
//   limit (Pixabay 100 a minute, Pexels 200 an hour; PIXABAY_PER_MIN / PEXELS_PER_HOUR once raised).
//   Without it each copy keeps its own count, which is only a rough guard.
// - Fair use per person: counted per app install (the `i` parameter) and, more loosely, per address
//   (mobile networks put many people behind one address). With a rate-limiting binding RATE_LIMITER
//   the per-install limit holds across the whole network.
// Variables: ALLOWED_ORIGINS (comma-separated; unset → any), SUPABASE_URL + SUPABASE_KEY (the
// publishable key, public by design), FLAGS (JSON, e.g. {"stock":false,"popular":false}).

const PER_PAGE = 30;
const DAY = 86400;
const POPULAR_TTL = 600; // s

/** Curated calm collections: tuned searches (nature/abstract, no people). */
const COLLECTIONS = {
  skies: { label: 'Calm skies', q: 'clouds sky', pexels: 'clouds sky' },
  ocean: { label: 'Ocean', q: 'ocean waves', pexels: 'ocean waves' },
  night: { label: 'Night', q: 'night sky stars', pexels: 'starry night sky' },
  rain: { label: 'Rain', q: 'rain drops', pexels: 'rain drops window' },
  mountains: { label: 'Mountains', q: 'mountains landscape', pexels: 'mountains landscape' },
  desert: { label: 'Desert', q: 'desert dunes', pexels: 'desert sand dunes' },
  forest: { label: 'Forest', q: 'forest trees', pexels: 'forest trees' },
  light: { label: 'Soft light', q: 'sunlight bokeh', pexels: 'sun rays light' },
  water: { label: 'Water', q: 'river water', pexels: 'river water flowing' },
  snow: { label: 'Snow', q: 'snow winter landscape', pexels: 'snowy landscape' },
  sunset: { label: 'Sunset', q: 'sunset sky', pexels: 'sunset sky' },
  flowers: { label: 'Flowers', q: 'flowers nature', pexels: 'flowers nature' },
};
/** Quick reel footage searches (src/engine/styles.ts FOOTAGE) not already among the collections. */
const FOOTAGE_EXTRA = ['mountains mist', 'sunlight rays'];

/** Words that mean a result shows people (matched against tags / descriptions). */
const PEOPLE = new Set(('people person persons woman women man men girl girls boy boys child children kid kids baby ' +
  'face faces portrait model couple family lady ladies guy selfie crowd human humans body fashion bride groom ' +
  'teenager teen adult adults businessman businesswoman worker hand hands feet legs silhouette dancer dancing ' +
  'athlete runner surfer hiker tourist tourists swimmer bikini wedding').split(' '));
const showsPeople = (text) => (text ?? '').toLowerCase().split(/[^a-z]+/).some((w) => PEOPLE.has(w));

// Per-copy sliding-window counters: the fallback when no binding is set, and the loose per-address guard.
const windows = new Map();
function allow(key, limit, ms) {
  const now = Date.now();
  const list = (windows.get(key) ?? []).filter((t) => now - t < ms);
  if (list.length >= limit) {
    windows.set(key, list);
    return false;
  }
  list.push(now);
  windows.set(key, list);
  if (windows.size > 5000) for (const [k, v] of windows) if (!v.some((t) => now - t < 3600e3)) windows.delete(k);
  return true;
}

/** One counter for the whole world (a Durable Object has exactly one instance per name). */
export class Budget {
  constructor() {
    this.win = new Map();
  }
  async fetch(request) {
    const u = new URL(request.url);
    const limit = Number(u.searchParams.get('limit')) || 1;
    const ms = Number(u.searchParams.get('ms')) || 60e3;
    const now = Date.now();
    let w = this.win.get(ms);
    if (!w || now - w.start >= ms) w = { start: now, n: 0 };
    const ok = w.n < limit;
    if (ok) w.n++;
    this.win.set(ms, w);
    return new Response(JSON.stringify({ ok, wait: ok ? 0 : Math.ceil((ms - (now - w.start)) / 1000) }));
  }
}

const limits = (env, source) => (source === 'pexels'
  ? [Math.max(1, Number(env.PEXELS_PER_HOUR) || 200) * 0.9, 3600e3]
  : [Math.max(1, Number(env.PIXABAY_PER_MIN) || 100) * 0.9, 60e3]);

/** May we make one more call to this library right now (worldwide when BUDGET is bound)? */
async function upstreamOk(env, source) {
  const [limit, ms] = limits(env, source);
  if (env.BUDGET) {
    try {
      const stub = env.BUDGET.get(env.BUDGET.idFromName(source));
      const r = await stub.fetch(`https://budget/take?limit=${Math.floor(limit)}&ms=${ms}`);
      return (await r.json()).ok;
    } catch {
      /* the counter is unreachable: fall back to this copy's own count */
    }
  }
  return allow(`upstream:${source}`, Math.floor(limit), ms);
}

const flagsOf = (env) => {
  try {
    return { stock: true, popular: true, ...JSON.parse(env.FLAGS || '{}') };
  } catch {
    return { stock: true, popular: true };
  }
};

/** A cached answer: this data center first, then the worldwide KV copy. */
async function readCache(env, key) {
  const local = await caches.default.match(new Request(`https://edge-proxy.cache/${key}`));
  if (local) return local.text();
  if (!env.STOCK_KV) return null;
  try {
    const kv = await env.STOCK_KV.get(key);
    // Keep a copy here too, so this data center answers the next caller without KV.
    if (kv) await writeCache(env, key, kv, key === 'popular' ? POPULAR_TTL : 3600, { kv: false });
    return kv;
  } catch {
    return null;
  }
}
async function writeCache(env, key, body, ttl, { local = true, kv = true } = {}) {
  const jobs = [];
  if (local) jobs.push(caches.default.put(new Request(`https://edge-proxy.cache/${key}`), new Response(body, { headers: { 'Cache-Control': `public, max-age=${ttl}` } })));
  // KV: free plan 1,000 writes a day (paid: 1 million a month); a refused write only costs a later miss.
  if (kv && env.STOCK_KV) jobs.push(env.STOCK_KV.put(key, body, { expirationTtl: Math.max(60, ttl) }));
  await Promise.allSettled(jobs);
}

const norm = (q) => q.toLowerCase().replace(/\s+/g, ' ').trim();
const searchKey = (source, type, q, page) => `search/${source}/${type}/${page}/${encodeURIComponent(norm(q))}`;

/** Fetches a search from the library (if the budget allows) and caches it everywhere. */
async function fetchSearch(env, source, type, q, page) {
  const key = source === 'pexels' ? env.PEXELS_KEY : env.PIXABAY_KEY;
  if (!(await upstreamOk(env, source))) {
    const e = new Error(`${source === 'pexels' ? 'Pexels' : 'Pixabay'} is busy — try a collection, the other library or again shortly`);
    e.status = 429;
    throw e;
  }
  const out = source === 'pexels' ? await pexels(key, type, q, page) : await pixabay(key, type, q, page);
  const body = JSON.stringify(out);
  await writeCache(env, searchKey(source, type, q, page), body, DAY);
  return body;
}

const installId = (url) => {
  const i = url.searchParams.get('i') ?? '';
  return /^[a-z0-9-]{8,40}$/i.test(i) ? i : '';
};

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : null;
    const cors = allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {};
    const reply = (status, body, extra = {}) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
      });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': String(DAY) } });
    }
    if (!allowOrigin) return reply(403, { error: 'origin not allowed' });

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const url = new URL(request.url);
    const who = installId(url);
    /** Per person: per install (exact with RATE_LIMITER), and 10× looser per address. */
    const limited = async (key, limit) => {
      if (!allow(`${key}:ip:${ip}`, limit * 10, 60e3)) return true;
      const id = who ? `i:${who}` : `ip:${ip}`;
      if (env.RATE_LIMITER) return !(await env.RATE_LIMITER.limit({ key: `${key}:${id}` })).success;
      return !allow(`${key}:${id}`, limit, 60e3);
    };
    const flags = flagsOf(env);

    if (url.pathname === '/reel' && request.method === 'POST') return reel(request, env, ctx, reply, limited, flags);
    if (request.method !== 'GET') return reply(405, { error: 'GET only' });

    if (url.pathname === '/config') {
      const { stock, popular, ...app } = flags;
      return reply(200, { stock, popular, ...app }, { 'Cache-Control': 'public, max-age=300' });
    }

    if (url.pathname === '/popular') {
      if (!flags.popular || !env.SUPABASE_URL || !env.SUPABASE_KEY) return reply(200, { total: 0, reciters: [], ayat: [] }, { 'Cache-Control': 'public, max-age=300' });
      const hit = await readCache(env, 'popular');
      if (hit) return reply(200, hit, { 'Cache-Control': `public, max-age=${POPULAR_TTL}` });
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/popular_this_week`, {
        method: 'POST', headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}',
      }).catch(() => null);
      if (!r?.ok) return reply(502, { error: 'popular unavailable' });
      const body = await r.text();
      ctx.waitUntil(writeCache(env, 'popular', body, POPULAR_TTL));
      return reply(200, body, { 'Cache-Control': `public, max-age=${POPULAR_TTL}` });
    }

    if (url.pathname === '/sources') {
      return reply(200, {
        pixabay: flags.stock && !!env.PIXABAY_KEY,
        pexels: flags.stock && !!env.PEXELS_KEY,
        collections: Object.entries(COLLECTIONS).map(([id, c]) => ({ id, label: c.label })),
      }, { 'Cache-Control': 'public, max-age=3600' });
    }

    if (url.pathname === '/file') {
      let target;
      try {
        target = new URL(url.searchParams.get('url') ?? '');
      } catch {
        return reply(400, { error: 'bad url' });
      }
      const ok = /(^|\.)pixabay\.com$/.test(target.hostname) || /^(images|videos)\.pexels\.com$/.test(target.hostname);
      if (target.protocol !== 'https:' || !ok) return reply(400, { error: 'Pixabay and Pexels files only' });
      if (await limited('file', 20)) return reply(429, { error: 'Too many downloads — try again in a minute' });
      const r = await fetch(target, { headers: { 'User-Agent': 'AyahStudio/1 (stock proxy)' } });
      if (!r.ok) return reply(r.status, { error: `The library answered ${r.status}` });
      const headers = { ...cors, 'Content-Type': r.headers.get('Content-Type') ?? 'application/octet-stream' };
      if (r.headers.get('Content-Length')) headers['Content-Length'] = r.headers.get('Content-Length');
      return new Response(r.body, { status: 200, headers });
    }

    if (url.pathname !== '/search') return reply(404, { error: 'not found' });
    if (!flags.stock) return reply(503, { error: 'The free library is resting for a while — your own photos and the built-in scenes still work' });
    const source = url.searchParams.get('source') === 'pexels' ? 'pexels' : 'pixabay';
    const type = url.searchParams.get('type') === 'video' ? 'video' : 'image';
    const col = COLLECTIONS[url.searchParams.get('collection') ?? ''];
    const q = col ? (source === 'pexels' ? col.pexels : col.q) : (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const page = Math.min(10, Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
    if (!norm(q)) return reply(400, { error: 'empty search' });
    if (!(source === 'pexels' ? env.PEXELS_KEY : env.PIXABAY_KEY)) return reply(501, { error: `${source === 'pexels' ? 'Pexels' : 'Pixabay'} is not set up` });

    // One cache entry per normalized search (independent of the caller's origin).
    const key = searchKey(source, type, q, page);
    const hit = await readCache(env, key);
    if (hit) {
      return reply(200, hit, { 'Cache-Control': `public, max-age=${DAY}` });
    }

    // Only searches that reach the library count against the limits.
    if (await limited('search', 30)) return reply(429, { error: 'Too many searches — try again in a minute' });
    try {
      const body = await fetchSearch(env, source, type, q, page);
      return reply(200, body, { 'Cache-Control': `public, max-age=${DAY}` });
    } catch (e) {
      return reply(e.status === 429 ? 429 : 502, { error: e.status === 429 ? e.message : e.message || 'Search failed' });
    }
  },

  /** Cron Trigger (daily): build every collection and the Quick reel searches ahead of time. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(warm(env));
  },
};

async function warm(env) {
  const jobs = [];
  for (const source of ['pixabay', 'pexels']) {
    if (!(source === 'pexels' ? env.PEXELS_KEY : env.PIXABAY_KEY)) continue;
    const qs = Object.values(COLLECTIONS).map((c) => (source === 'pexels' ? c.pexels : c.q));
    for (const q of qs) for (const type of ['video', 'image']) jobs.push([source, type, q]);
    for (const q of FOOTAGE_EXTRA) jobs.push([source, 'video', q]);
  }
  // One after another, well inside each library's limit.
  for (const [source, type, q] of jobs) {
    try {
      await fetchSearch(env, source, type, q, 1);
    } catch {
      /* busy or failing: that search is fetched on demand instead */
    }
  }
}

/** The anonymous reel counter, through the edge so nobody can call the database thousands of times. */
async function reel(request, env, ctx, reply, limited, flags) {
  if (!flags.popular || !env.SUPABASE_URL || !env.SUPABASE_KEY) return reply(202, '{}');
  let b;
  try {
    b = JSON.parse((await request.text()).slice(0, 300));
  } catch {
    return reply(400, { error: 'bad body' });
  }
  const int = (x) => (Number.isInteger(x) ? x : NaN);
  const body = { reciter_id: int(b?.r), s: int(b?.s), a_from: int(b?.a), a_to: int(b?.b) };
  if (Object.values(body).some(Number.isNaN)) return reply(400, { error: 'bad body' });
  if (await limited('reel', 6)) return reply(429, { error: 'slow down' });
  ctx.waitUntil(fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_reel`, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => {}));
  return reply(202, '{}');
}

function upstreamError(name, r) {
  const e = new Error(`${name} answered ${r.status}`);
  e.status = r.status;
  return e;
}

async function pixabay(key, type, q, page) {
  const api = new URL(type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/');
  api.searchParams.set('key', key);
  api.searchParams.set('q', q);
  api.searchParams.set('safesearch', 'true');
  api.searchParams.set('per_page', String(PER_PAGE));
  api.searchParams.set('page', String(page));
  if (type === 'image') {
    api.searchParams.set('image_type', 'photo');
    api.searchParams.set('orientation', 'vertical'); // fits the 9:16 frame
  } else {
    api.searchParams.set('video_type', 'film');
  }
  const r = await fetch(api);
  if (!r.ok) throw upstreamError('Pixabay', r);
  const data = await r.json();
  const hits = (data.hits ?? []).filter((h) => !showsPeople(h.tags)).map((h) => (type === 'image' ? pixabayImage(h) : pixabayVideo(h))).filter(Boolean);
  return { total: data.totalHits ?? hits.length, hits };
}

function pixabayImage(h) {
  if (!h.largeImageURL) return null;
  // largeImageURL is scaled to at most 1280 px on its longer side. Its copy on the CDN (same name
  // pattern as the 150 px preview) sends CORS headers, so the app can download it directly.
  const k = Math.min(1, 1280 / Math.max(h.imageWidth, h.imageHeight));
  const cdn = /^https:\/\/cdn\.pixabay\.com\/.+_150\.(jpe?g|png)$/i.test(h.previewURL ?? '') ? h.previewURL.replace(/_150\.(\w+)$/, '_1280.$1') : '';
  return {
    id: h.id, source: 'pixabay', type: 'image', thumb: h.webformatURL || h.previewURL, src: cdn || h.largeImageURL, alt: cdn ? h.largeImageURL : undefined,
    width: Math.round(h.imageWidth * k), height: Math.round(h.imageHeight * k),
    user: h.user, page: h.pageURL, tags: h.tags ?? '',
  };
}

function pixabayVideo(h) {
  const v = h.videos ?? {};
  // Medium is usually 1920×1080: sharp enough for a 9:16 crop without a huge download.
  const pick = [v.medium, v.small, v.large, v.tiny].find((x) => x && x.url);
  if (!pick) return null;
  const thumb = v.tiny?.thumbnail || v.small?.thumbnail || pick.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg` : '');
  return {
    id: h.id, source: 'pixabay', type: 'video', thumb, src: pick.url, width: pick.width, height: pick.height,
    user: h.user, page: h.pageURL, tags: h.tags ?? '', duration: h.duration,
  };
}

async function pexels(key, type, q, page) {
  const api = new URL(type === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search');
  api.searchParams.set('query', q);
  api.searchParams.set('orientation', 'portrait'); // 9:16-friendly photos and videos
  api.searchParams.set('per_page', String(PER_PAGE));
  api.searchParams.set('page', String(page));
  const r = await fetch(api, { headers: { Authorization: key } });
  if (!r.ok) throw upstreamError('Pexels', r);
  const data = await r.json();
  const list = type === 'video' ? data.videos ?? [] : data.photos ?? [];
  // Pexels has no tags: its photo description (alt) and page address describe the content.
  const hits = list.filter((h) => !showsPeople(`${h.alt ?? ''} ${h.url ?? ''}`)).map((h) => (type === 'video' ? pexelsVideo(h) : pexelsPhoto(h))).filter(Boolean);
  return { total: data.total_results ?? hits.length, hits };
}

const slug = (url) => (url ?? '').replace(/\/$/, '').split('/').pop().replace(/-\d+$/, '').replace(/-/g, ' ');

function pexelsPhoto(h) {
  const o = h.src?.original;
  if (!o) return null;
  // Pexels resizes on request: big enough to cover 1080×1920 with room for the Ken Burns motion.
  const k = Math.min(1, 2304 / h.height);
  return {
    id: h.id, source: 'pexels', type: 'image', thumb: `${o}?auto=compress&cs=tinysrgb&fit=crop&w=216&h=384`,
    src: `${o}?auto=compress&cs=tinysrgb&h=2304`, width: Math.round(h.width * k), height: Math.round(h.height * k),
    user: h.photographer, page: h.url, tags: h.alt || slug(h.url),
  };
}

function pexelsVideo(h) {
  const files = (h.video_files ?? []).filter((f) => f.link && f.width && f.height && (f.file_type ?? 'video/mp4') === 'video/mp4');
  if (!files.length) return null;
  // The smallest file that still covers 1080×1920 without upscaling (never above 4K), else the largest.
  const cover = (f) => Math.max(1080 / f.width, 1920 / f.height);
  const ok = files.filter((f) => f.width * f.height <= 3840 * 2160).sort((a, b) => a.width * a.height - b.width * b.height);
  const pick = ok.find((f) => cover(f) <= 1) ?? ok[ok.length - 1] ?? files[0];
  return {
    id: h.id, source: 'pexels', type: 'video', thumb: h.image, src: pick.link, width: pick.width, height: pick.height,
    user: h.user?.name ?? 'Pexels', page: h.url, tags: slug(h.url), duration: h.duration,
  };
}
