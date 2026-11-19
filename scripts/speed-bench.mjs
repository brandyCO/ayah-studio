// Speed bench for the whole app (thread "Make the whole app fast", 2026-11-19): serves the built app (dist/) and
// measures, in headless Chromium at a phone size with the CPU slowed down (Tecno-class phone ≈ 4–6× a laptop):
//   - cold start on a slow connection (empty cache): first paint, mushaf page drawn, main-thread blocked time
//   - warm start (files cached): the same
//   - tab switches Read → Learn → Ranks → Me → Read, twice (first visit, return): tap to screen ready, blocked time
// Outside hosts (Supabase, audio, Cloudflare) answer after a delay with an error, like a bad connection.
// Usage: npm run build && node scripts/speed-bench.mjs [cpu=6] [runs=3]   (JSON=out.json writes the numbers)
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL(`../${process.env.DIST || 'dist'}/`, import.meta.url).pathname;
const CPU = Number(process.argv[2]) || 6;
const RUNS = Number(process.argv[3]) || 3;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };

const gz = new Map();
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = path.endsWith('/') ? `${path}index.html` : path;
    const body = await readFile(join(root, file));
    const cache = file.startsWith('/assets/') || file.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // Compressed like the real hosts (Cloudflare / GitHub Pages) for text files.
    const zip = /text|json|javascript|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, { 'content-type': type, 'cache-control': cache, ...(zip ? { 'content-encoding': 'gzip' } : {}) });
    res.end(zip ? (gz.get(file) ?? gz.set(file, gzipSync(body)).get(file)) : body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const NETS = {
  slow3g: { latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 },
  fast4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};

// Runs in the page: long tasks and the moment a screen is ready.
const PROBE = () => {
  window.__lt = [];
  // Frame times: every animation frame's start, to count dropped frames (anything over ~2 frames at 60 fps).
  window.__fr = [];
  const tick = (t) => { window.__fr.push(t); if (window.__fr.length > 4000) window.__fr.splice(0, 2000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* */ }
  try { for (const k of ['onboarded', 'tourSeen', 'mushafHint', 'mushafAsked']) localStorage.setItem(k, '1');
    // Like the app (all pages on the phone): no background download of the whole mushaf during the test.
    if (location.search.includes('kept') || !location.search) localStorage.setItem('mushafKept', '1'); } catch { /* */ }
};
const READY = (want) => {
  const app = document.getElementById('app');
  const s = app?.querySelector(':scope > .screen:not(.screen-ghost):not([hidden])');
  if (!s || s.classList.contains('screen-building') || app.querySelector('.route-skel')) return false;
  if (want && !s.querySelector(want)) return false;
  if ([...s.querySelectorAll('.muted, [aria-busy="true"]')].some((e) => e.getAttribute('aria-busy') === 'true' || /^(Loading|…)/.test(e.textContent ?? ''))) return false;
  return true;
};

async function context(browser, net) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.6, serviceWorkers: 'block', locale: 'en-US', isMobile: true, hasTouch: true });
  await ctx.route((url) => !url.href.startsWith(base), async (r) => { await new Promise((ok) => setTimeout(ok, Number(process.env.HANG) || 600)); await r.abort().catch(() => {}); });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Network.enable');
  if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[net] });
  return { ctx, page, cdp };
}

const blocked = (lt, from, to) => lt.filter(([s]) => s >= from && s <= to).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);

async function start(browser, net, warm) {
  const { ctx, page, cdp } = await context(browser, net);
  if (warm) { await page.goto(base); await page.waitForTimeout(6000); }
  const t0 = Date.now();
  if (warm) await page.reload({ waitUntil: 'commit' }); else await page.goto(base, { waitUntil: 'commit' });
  await page.waitForFunction(() => !!document.querySelector('.mushaf-page:not(.loading) .qcf-line, .mushaf-page:not(.loading) [data-p]'), null, { timeout: 90000, polling: 50 });
  const r = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
    now: performance.now(),
    lt: window.__lt,
    js: performance.getEntriesByType('resource').filter((e) => /\.js$/.test(e.name)).reduce((a, e) => a + (e.encodedBodySize || 0), 0),
    reqs: performance.getEntriesByType('resource').length,
  }));
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({ lt: window.__lt, now: performance.now() }));
  await cdp.detach().catch(() => {});
  await ctx.close();
  return { fcp: Math.round(r.fcp), page: Math.round(r.now), wall: Date.now() - t0, blockedToPage: Math.round(blocked(r.lt, 0, r.now)), blocked3sAfter: Math.round(blocked(after.lt, r.now, after.now)), jsKB: Math.round(r.js / 1024), reqs: r.reqs };
}

const TABS = [['learn', '#/learn', '.lp-top'], ['ranks', '#/ranks', null], ['me', '#/me', null], ['read', null, '.mushaf-page:not(.loading)']];
// Tabs as in the Android / iPhone app: the app's own files are on the phone (no network wait), outside hosts are slow
// and fail (a bad connection or none).
async function tabs(browser) {
  const { ctx, page } = await context(browser, null);
  await page.goto(base);
  await page.waitForFunction(() => !!document.querySelector('.mushaf-page:not(.loading)'), null, { timeout: 60000 });
  await page.waitForTimeout(9000); // the app settles (idle prefetch of Me, Learn, Ranks)
  const out = [];
  for (const round of [1, 2]) {
    for (const [name, hash, want] of TABS) {
      const t0 = await page.evaluate(() => performance.now());
      if (hash) await page.evaluate((h) => { location.hash = h; }, hash);
      else await page.evaluate(() => { location.hash = localStorage.getItem('lastRead') || '#/s/1'; });
      await page.waitForFunction(READY, want, { timeout: 30000, polling: 'raf' }).catch(() => {});
      const r = await page.evaluate(() => ({ now: performance.now(), lt: window.__lt }));
      await page.waitForTimeout(1500);
      // Smoothness from the tap until 1.5 s after the screen is ready: frames slower than 50 ms, and the slowest.
      const f = await page.evaluate((from) => { const fr = window.__fr.filter((x) => x >= from); const gaps = fr.slice(1).map((x, i) => x - fr[i]); return { janky: gaps.filter((g) => g > 50).length, worst: Math.round(Math.max(0, ...gaps)) }; }, t0);
      out.push({ tab: name, round, ms: Math.round(r.now - t0), blocked: Math.round(blocked(r.lt, t0, r.now)), ...f });
      await page.waitForTimeout(1000);
    }
  }
  await ctx.close();
  return out;
}

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const browser = await chromium.launch();
const result = { cpu: CPU, runs: RUNS, starts: {}, tabs: [] };
// Web: first visit on slow 3G and on 4G. App: files on the phone (no network for them).
for (const [label, net, warm] of [['web slow 3G', 'slow3g', false], ['web 4G', 'fast4g', false], ['app start', null, false], ['app restart', null, true]]) {
  if (process.env.SKIP_START) break;
  const rs = [];
  for (let i = 0; i < RUNS; i++) rs.push(await start(browser, net, warm));
  const m = {};
  for (const k of Object.keys(rs[0])) m[k] = med(rs.map((r) => r[k]));
  result.starts[label] = m;
  console.log(`${label.padEnd(13)} page drawn ${m.page} ms · blocked ${m.blockedToPage} ms (+${m.blocked3sAfter} ms next 3 s) · JS ${m.jsKB} KB · ${m.reqs} requests`);
}
const all = [];
for (let i = 0; i < RUNS; i++) all.push(await tabs(browser));
for (let j = 0; j < all[0].length; j++) {
  const { tab, round } = all[0][j];
  const ms = med(all.map((r) => r[j].ms)), bl = med(all.map((r) => r[j].blocked));
  const janky = med(all.map((r) => r[j].janky)), worst = med(all.map((r) => r[j].worst));
  result.tabs.push({ tab, round, ms, blocked: bl, janky, worst });
  console.log(`tab ${tab.padEnd(6)} ${round === 1 ? 'first ' : 'return'} ${String(ms).padStart(5)} ms to ready · blocked ${bl} ms · ${janky} slow frames, slowest ${worst} ms`);
}
await browser.close();
server.close();
if (process.env.JSON) await writeFile(process.env.JSON, JSON.stringify(result, null, 1));
