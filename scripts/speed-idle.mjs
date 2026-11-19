// How busy the main thread stays while the user just looks at a screen (animations running in JS / canvas / layout),
// at a slowed CPU. A screen at rest should leave the main thread almost idle, so taps and scrolling stay at 60 fps.
// Usage: node scripts/speed-idle.mjs [dir=dist] [cpu=6]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL(`../${process.argv[2] || 'dist'}/`, import.meta.url).pathname;
const CPU = Number(process.argv[3]) || 6;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { const file = path.endsWith('/') ? `${path}index.html` : path; const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': T[extname(file)] ?? 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.route((u) => !u.href.startsWith(base), async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.abort().catch(() => {}); });
await ctx.addInitScript(() => { try { for (const k of ['onboarded', 'tourSeen', 'mushafHint', 'mushafAsked', 'mushafKept']) localStorage.setItem(k, '1'); } catch { /* */ } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(base); await page.waitForTimeout(8000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
for (const hash of (process.env.SCREENS || '#/s/1,#/learn,#/ranks,#/me,#/').split(',')) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(4000);
  const events = [];
  const onData = (d) => events.push(...d.value);
  cdp.on('Tracing.dataCollected', onData);
  const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,toplevel,v8.execute,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await page.waitForTimeout(3000);
  await cdp.send('Tracing.end'); await done;
  cdp.off('Tracing.dataCollected', onData);
  const tids = new Set(events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const on = (e) => tids.has(`${e.pid}:${e.tid}`) && e.ph === 'X' && e.dur;
  const busy = events.filter((e) => on(e) && e.name === 'RunTask').reduce((a, e) => a + e.dur, 0) / 1000;
  const sum = new Map();
  for (const e of events.filter(on)) if (['FunctionCall', 'FireAnimationFrame', 'TimerFire', 'UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Commit', 'Layerize', 'RunMicrotasks'].includes(e.name)) {
    const k = e.name + (e.args?.data?.url ? ` ${e.args.data.url.split('/').pop()}:${e.args.data.lineNumber ?? ''}` : '');
    sum.set(k, (sum.get(k) ?? 0) + e.dur / 1000);
  }
  const frames = await page.evaluate(() => new Promise((ok) => { const fr = []; const t0 = performance.now(); const f = (t) => { fr.push(t); if (t - t0 < 2000) requestAnimationFrame(f); else ok(fr.slice(1).map((x, i) => x - fr[i])); }; requestAnimationFrame(f); }));
  const slow = frames.filter((g) => g > 20).length;
  console.log(`${hash.padEnd(8)} at rest: main thread ${Math.round(busy / 30)} % busy · ${slow} of ${frames.length} frames over 20 ms · ` + [...sum].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · '));
}
await browser.close(); server.close();
