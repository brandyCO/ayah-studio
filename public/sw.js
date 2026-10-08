// Ayah Studio service worker: lets the app open and work offline.
// - The app itself (HTML, JS, CSS): the page is fetched fresh when online (so updates arrive at
//   once) and from the cache when offline; built files have content hashes, so cache-first.
// - Bundled data (Quran text, translations, mushaf layout), fonts and default backgrounds:
//   cache-first; data URLs carry a version (?v=…), and an older version is dropped when a new one is stored.
// - Quran.com recitation timings: network-first, the last answer is kept for offline use.
// - Range requests for our own files (background videos are read in pieces) are answered from the
//   cached whole file.
// - Recitation audio slices are kept by the app itself (IndexedDB), as Range responses can't be cached here.
const APP = 'app-v1';
const STATIC = 'static-v1';
const NET = 'net-v1';
const MAX_APP_FILES = 80;
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Keep the page and the files it loads right away, so the next visit works offline.
    try {
      const cache = await caches.open(APP);
      const res = await fetch(SCOPE.href, { cache: 'no-cache' });
      if (res.ok) {
        const html = await res.clone().text();
        await cache.put(SCOPE.href, res);
        const files = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2))"/g)].map((m) => new URL(m[1], SCOPE).href);
        await Promise.all(files.map((u) => cache.add(u).catch(() => {})));
      }
    } catch {
      /* offline during install: the files are cached as they are used */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (![APP, STATIC, NET].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
  const path = ours ? url.pathname.slice(SCOPE.pathname.length) : '';

  if (req.headers.has('range')) {
    if (ours && (path.startsWith('backgrounds/') || path.startsWith('assets/'))) event.respondWith(rangeFromCache(req, path.startsWith('assets/') ? APP : STATIC));
    return;
  }

  if (ours) {
    if (req.mode === 'navigate' || path === '' || path === 'index.html') {
      return event.respondWith(networkFirst(APP, req, SCOPE.href, 4000));
    }
    if (path.startsWith('assets/')) return event.respondWith(cacheFirst(APP, req));
    if (path.startsWith('data/') || path.startsWith('fonts/') || path.startsWith('backgrounds/')) {
      return event.respondWith(cacheFirst(STATIC, req, path.startsWith('data/')));
    }
    return; // anything else (sw.js itself, dev files): straight to the network
  }

  if ((url.hostname === 'api.qurancdn.com' || url.hostname === 'api.quran.com') && url.pathname.startsWith('/api/qdc/audio/')) {
    return event.respondWith(networkFirst(NET, req, req.url));
  }
  // Everything else (recitation audio, stock libraries, the proxy) goes to the network as usual.
});

async function cacheFirst(name, req, onePerPath = false) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) {
    const copy = res.clone();
    void (async () => {
      if (onePerPath) {
        // A newer version of a data file replaces the older one.
        const path = new URL(req.url).pathname;
        for (const k of await cache.keys()) if (new URL(k.url).pathname === path && k.url !== req.url) await cache.delete(k);
      }
      await cache.put(req, copy);
      if (name === APP) await trim(cache, MAX_APP_FILES);
    })();
  }
  return res;
}

async function networkFirst(name, req, key, timeoutMs = 0) {
  const cache = await caches.open(name);
  const net = fetch(req).then((res) => {
    if (res.ok) void cache.put(key, res.clone());
    return res;
  });
  net.catch(() => {});
  try {
    return await (timeoutMs ? withTimeout(net, timeoutMs) : net);
  } catch {
    // Offline (or slow): the last copy; with none kept, keep waiting for the network.
    return (await cache.match(key)) ?? net;
  }
}

/** A Range request answered from the cached whole file (fetched whole once if not cached yet). */
async function rangeFromCache(req, name) {
  const cache = await caches.open(name);
  const key = new Request(req.url);
  let res = await cache.match(key);
  if (!res) {
    try {
      res = await fetch(key);
    } catch {
      return fetch(req);
    }
    if (!res.ok || res.status !== 200) return res;
    await cache.put(key, res.clone());
  }
  const blob = await res.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return new Response(blob, { status: 200, headers: { 'Content-Type': blob.type } });
  let start, end;
  if (m[1] === '') { // the last N bytes
    start = Math.max(0, blob.size - Number(m[2]));
    end = blob.size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? blob.size - 1 : Math.min(Number(m[2]), blob.size - 1);
  }
  if (start >= blob.size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': blob.type || res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Keep the newest `max` built files (old builds' files are dropped). */
async function trim(cache, max) {
  const keys = (await cache.keys()).filter((k) => new URL(k.url).pathname.includes('/assets/'));
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}
