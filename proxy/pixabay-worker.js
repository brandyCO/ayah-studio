// Ayah Studio · Pixabay search proxy (Cloudflare Worker, free tier).
// Holds the Pixabay API key (secret PIXABAY_KEY) so it never ships in the public app, caches every
// search for 24 h (Pixabay API terms) and returns only the fields the app needs.
//
//   GET /search?type=image|video&q=clouds&page=1  →  { total, hits: [{ id, type, thumb, src, width,
//                                                        height, user, page, tags, duration? }] }
//   GET /file?url=<a Pixabay file URL>             →  the file, with CORS headers (used only when the
//                                                     browser cannot fetch it from Pixabay directly)
//
// Optional variable ALLOWED_ORIGINS: comma-separated origins allowed to call it, e.g.
// "https://brandyco.github.io,https://localhost,http://localhost:5173". Unset → any origin.

const PER_PAGE = 30;
const DAY = 86400;

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

    const url = new URL(request.url);
    if (url.pathname === '/file') {
      let target;
      try {
        target = new URL(url.searchParams.get('url') ?? '');
      } catch {
        return reply(400, { error: 'bad url' });
      }
      if (target.protocol !== 'https:' || !/(^|\.)pixabay\.com$/.test(target.hostname)) return reply(400, { error: 'Pixabay files only' });
      const r = await fetch(target, { headers: { 'User-Agent': 'AyahStudio/1 (pixabay proxy)' } });
      if (!r.ok) return reply(r.status, { error: `Pixabay answered ${r.status}` });
      const headers = { ...cors, 'Content-Type': r.headers.get('Content-Type') ?? 'application/octet-stream' };
      if (r.headers.get('Content-Length')) headers['Content-Length'] = r.headers.get('Content-Length');
      return new Response(r.body, { status: 200, headers });
    }
    if (url.pathname !== '/search') return reply(404, { error: 'not found' });
    const type = url.searchParams.get('type') === 'video' ? 'video' : 'image';
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const page = Math.min(10, Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
    if (!env.PIXABAY_KEY) return reply(500, { error: 'PIXABAY_KEY is not set' });

    // One cache entry per normalized search (independent of the caller's origin).
    const cacheKey = new Request(`https://pixabay-proxy.cache/search?type=${type}&q=${encodeURIComponent(q.toLowerCase())}&page=${page}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return reply(200, await hit.text(), { 'Cache-Control': `public, max-age=${DAY}` });

    const api = new URL(type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/');
    api.searchParams.set('key', env.PIXABAY_KEY);
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
    if (!r.ok) return reply(r.status === 429 ? 429 : 502, { error: `Pixabay answered ${r.status}` });
    const data = await r.json();
    const hits = (data.hits ?? []).map((h) => (type === 'image' ? image(h) : video(h))).filter(Boolean);
    const body = JSON.stringify({ total: data.totalHits ?? hits.length, hits });
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Cache-Control': `public, max-age=${DAY}` } })));
    return reply(200, body, { 'Cache-Control': `public, max-age=${DAY}` });
  },
};

function image(h) {
  if (!h.largeImageURL) return null;
  // largeImageURL is scaled to at most 1280 px on its longer side.
  const k = Math.min(1, 1280 / Math.max(h.imageWidth, h.imageHeight));
  return {
    id: h.id, type: 'image', thumb: h.webformatURL || h.previewURL, src: h.largeImageURL,
    width: Math.round(h.imageWidth * k), height: Math.round(h.imageHeight * k),
    user: h.user, page: h.pageURL, tags: h.tags ?? '',
  };
}

function video(h) {
  const v = h.videos ?? {};
  // Medium is usually 1920×1080: sharp enough for a 9:16 crop without a huge download.
  const pick = [v.medium, v.small, v.large, v.tiny].find((x) => x && x.url);
  if (!pick) return null;
  const thumb = v.tiny?.thumbnail || v.small?.thumbnail || pick.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg` : '');
  return {
    id: h.id, type: 'video', thumb, src: pick.url, width: pick.width, height: pick.height,
    user: h.user, page: h.pageURL, tags: h.tags ?? '', duration: h.duration,
  };
}
