// Ayah Studio · stock media proxy (Cloudflare Worker, free tier): Pixabay and Pexels.
// Holds the API keys (secrets PIXABAY_KEY and, optionally, PEXELS_KEY) so they never ship in the
// public app, caches every search for 24 h (Pixabay API terms; also saves Pexels' hourly quota),
// filters out results that show people (rule 4) and returns only the fields the app needs.
//
//   GET /sources                                  →  { pixabay, pexels, collections: [{ id, label }] }
//   GET /search?source=pixabay|pexels&type=image|video&q=clouds&page=1
//   GET /search?source=…&type=…&collection=skies&page=1   (a curated calm collection)
//        →  { total, hits: [{ id, source, type, thumb, src, width, height, user, page, tags, duration? }] }
//   GET /file?url=<a Pixabay/Pexels file URL>     →  the file with CORS headers (only used when the
//                                                    browser cannot fetch it directly)
//
// Limits: each visitor (IP) may make 30 searches a minute that are not already cached, and 20
// file relays a minute. Uncached calls to each source are also capped below its own limit
// (Pixabay 100/min, Pexels 200/h), so one busy visitor can never use up the key for everyone.
// Optional variable ALLOWED_ORIGINS: comma-separated origins allowed to call it. Unset → any.

const PER_PAGE = 30;
const DAY = 86400;

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

/** Words that mean a result shows people (matched against tags / descriptions). */
const PEOPLE = new Set(('people person persons woman women man men girl girls boy boys child children kid kids baby ' +
  'face faces portrait model couple family lady ladies guy selfie crowd human humans body fashion bride groom ' +
  'teenager teen adult adults businessman businesswoman worker hand hands feet legs silhouette dancer dancing ' +
  'athlete runner surfer hiker tourist tourists swimmer bikini wedding').split(' '));
const showsPeople = (text) => (text ?? '').toLowerCase().split(/[^a-z]+/).some((w) => PEOPLE.has(w));

// Per-isolate counters (good enough as a guard; a Cloudflare rate-limiting binding can be added as
// RATE_LIMITER for exact per-visitor limits across the whole network).
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
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': String(DAY) } });
    }
    if (!allowOrigin) return reply(403, { error: 'origin not allowed' });
    if (request.method !== 'GET') return reply(405, { error: 'GET only' });

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limited = async (key, limit) => {
      if (env.RATE_LIMITER) return !(await env.RATE_LIMITER.limit({ key: `${key}:${ip}` })).success;
      return !allow(`${key}:${ip}`, limit, 60e3);
    };
    const url = new URL(request.url);

    if (url.pathname === '/sources') {
      return reply(200, {
        pixabay: !!env.PIXABAY_KEY,
        pexels: !!env.PEXELS_KEY,
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
    const source = url.searchParams.get('source') === 'pexels' ? 'pexels' : 'pixabay';
    const type = url.searchParams.get('type') === 'video' ? 'video' : 'image';
    const col = COLLECTIONS[url.searchParams.get('collection') ?? ''];
    const q = col ? (source === 'pexels' ? col.pexels : col.q) : (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const page = Math.min(10, Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
    if (!q) return reply(400, { error: 'empty search' });
    const key = source === 'pexels' ? env.PEXELS_KEY : env.PIXABAY_KEY;
    if (!key) return reply(501, { error: `${source === 'pexels' ? 'Pexels' : 'Pixabay'} is not set up` });

    // One cache entry per normalized search (independent of the caller's origin).
    const cacheKey = new Request(`https://stock-proxy.cache/search?s=${source}&type=${type}&q=${encodeURIComponent(q.toLowerCase())}&page=${page}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return reply(200, await hit.text(), { 'Cache-Control': `public, max-age=${DAY}` });

    // Only searches that reach the library count against the limits.
    if (await limited('search', 30)) return reply(429, { error: 'Too many searches — try again in a minute' });
    const budget = source === 'pexels' ? allow('upstream:pexels', 180, 3600e3) : allow('upstream:pixabay', 90, 60e3);
    if (!budget) return reply(429, { error: `${source === 'pexels' ? 'Pexels' : 'Pixabay'} is busy — try the other library or again shortly` });

    let out;
    try {
      out = source === 'pexels' ? await pexels(key, type, q, page) : await pixabay(key, type, q, page);
    } catch (e) {
      return reply(e.status === 429 ? 429 : 502, { error: e.status === 429 ? 'The library is busy — try again shortly' : e.message });
    }
    const body = JSON.stringify(out);
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Cache-Control': `public, max-age=${DAY}` } })));
    return reply(200, body, { 'Cache-Control': `public, max-age=${DAY}` });
  },
};

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
