// Main-thread breakdown (style, layout, paint, script…) of a switch to one screen at a slowed CPU, from a Chrome trace.
// Usage: node scripts/speed-trace.mjs [dir=dist] [cpu=6] '#/me'   (VIA='#/me' visits it once first: a return visit)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL(`../${process.argv[2] || 'dist'}/`, import.meta.url).pathname;
const CPU = Number(process.argv[3]) || 6;
const TO = process.argv[4] || '#/me';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { const file = path.endsWith('/') ? `${path}index.html` : path; const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': T[extname(file)] ?? 'application/octet-stream', 'cache-control': file.startsWith('/assets/') ? 'max-age=999999' : 'no-cache' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.route((u) => !u.href.startsWith(base), async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.abort().catch(() => {}); });
await ctx.addInitScript(() => { try { for (const k of ['onboarded', 'tourSeen', 'mushafHint', 'mushafAsked', 'mushafKept']) localStorage.setItem(k, '1'); } catch { /* */ } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
if (process.env.CSS) await ctx.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }); }, process.env.CSS);
await page.goto(base); await page.waitForTimeout(13000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
if (process.env.VIA) { await page.evaluate((h) => { location.hash = h; }, process.env.VIA); await page.waitForTimeout(3000); await page.evaluate(() => { location.hash = '#/s/1'; }); await page.waitForTimeout(2500); }
const events = [];
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
await cdp.send('Tracing.start', { categories: process.env.CATS || 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' });
await page.evaluate((h) => { location.hash = h; }, TO);
await page.waitForTimeout(Number(process.env.MS || 1500));
await cdp.send('Tracing.end'); await done;
// Renderer main thread: the thread with the most 'RunTask' time in the page's process.
const main = events.filter((e) => e.name === 'TracingStartedInBrowser' || e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
const tids = new Set(main.filter((e) => e.name === 'thread_name').map((e) => `${e.pid}:${e.tid}`));
const on = (e) => tids.has(`${e.pid}:${e.tid}`) && e.ph === 'X' && e.dur;
const tasks = events.filter((e) => on(e) && e.name === 'RunTask');
const busy = tasks.reduce((a, e) => a + e.dur, 0) / 1000;
const long = tasks.filter((e) => e.dur > 50000).map((e) => Math.round(e.dur / 1000));
const NAMES = ['FunctionCall', 'EvaluateScript', 'v8.compile', 'v8.parseOnBackground', 'ParseHTML', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'PaintImage', 'Layerize', 'UpdateLayer', 'CompositeLayers', 'Commit', 'RasterTask', 'Decode Image', 'ScheduleStyleRecalculation', 'HitTest', 'ParseAuthorStyleSheet', 'IntersectionObserverController::computeIntersections', 'TimerFire', 'FireAnimationFrame', 'GCEvent', 'MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'BlinkGC.AtomicPhase'];
const sum = new Map();
for (const e of events.filter(on)) if (NAMES.includes(e.name)) sum.set(e.name, (sum.get(e.name) ?? 0) + e.dur / 1000);
console.log(`${TO} at ${CPU}× CPU: main thread busy ${Math.round(busy)} ms in ${process.env.MS || 1500} ms; long tasks: ${long.join(', ') || 'none'}`);
for (const [k, v] of [...sum].sort((a, b) => b[1] - a[1])) if (v >= 2) console.log(`${v.toFixed(0).padStart(6)} ms  ${k}`);
// The biggest single layouts / style recalcs, with how many elements they touched.
for (const n of ['UpdateLayoutTree', 'Layout', 'Paint']) {
  const big = events.filter((e) => on(e) && e.name === n).sort((a, b) => b.dur - a.dur).slice(0, 3);
  console.log(`  biggest ${n}: ${big.map((e) => `${Math.round(e.dur / 1000)} ms${e.args?.elementCount ? ` (${e.args.elementCount} el)` : ''}${e.args?.beginData?.dirtyObjects ? ` (${e.args.beginData.dirtyObjects}/${e.args.beginData.totalObjects} obj)` : ''}`).join(', ')}`);
}
// Inside each long task: everything that ran, by name (self time), so nothing hides in an unlisted event.
for (const lt of tasks.filter((e) => e.dur > 50000)) {
  const inner = events.filter((e) => on(e) && e !== lt && e.ts >= lt.ts && e.ts + e.dur <= lt.ts + lt.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const selfT = new Map();
  for (const e of inner) {
    const kids = inner.filter((c) => c !== e && c.ts >= e.ts && c.ts + c.dur <= e.ts + e.dur && !inner.some((m) => m !== e && m !== c && m.ts >= e.ts && m.ts + m.dur <= e.ts + e.dur && c.ts >= m.ts && c.ts + c.dur <= m.ts + m.dur));
    const self = e.dur - kids.reduce((a, c) => a + c.dur, 0);
    const k = e.name + (e.args?.data?.url ? ' ' + e.args.data.url.split('/').pop() : '') + (e.args?.data?.functionName ? ' ' + e.args.data.functionName : '');
    selfT.set(k, (selfT.get(k) ?? 0) + self / 1000);
  }
  console.log(`  task ${Math.round(lt.dur / 1000)} ms: ` + [...selfT].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · '));
}
await browser.close(); server.close();
