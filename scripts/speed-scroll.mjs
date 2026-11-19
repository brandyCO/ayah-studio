// Scrolling smoothness: a finger drag (touch) down and back up each long screen at a slowed CPU; counts frames over
// 20 ms (a 60 fps frame is 16.7 ms) and the main thread's busy time while scrolling.
// Usage: node scripts/speed-scroll.mjs [dir=dist] [cpu=6]   (RM=1: with reduced motion, i.e. without the stretch / press)
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
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
await ctx.route((u) => !u.href.startsWith(base), async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.abort().catch(() => {}); });
await ctx.addInitScript(() => { try { for (const k of ['onboarded', 'tourSeen', 'mushafHint', 'mushafAsked', 'mushafKept']) localStorage.setItem(k, '1'); } catch { /* */ } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(base); await page.waitForTimeout(8000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
for (const hash of (process.env.SCREENS || '#/me,#/learn,#/ranks,#/').split(',')) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(3500);
  await page.evaluate(() => { window.__g = []; let last = 0; const f = (t) => { if (last) window.__g.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(f); }; window.__stop = false; requestAnimationFrame(f); });
  for (const dy of [-1400, 1400, -700, 700]) {
    await cdp.send('Input.synthesizeScrollGesture', { x: 196, y: 500, yDistance: dy, speed: 1600, gestureSourceType: 'touch', repeatCount: 0 });
  }
  const g = await page.evaluate(() => { window.__stop = true; return window.__g; });
  const slow = g.filter((x) => x > 20).length, worst = Math.round(Math.max(...g));
  console.log(`${hash.padEnd(8)} scroll: ${slow} of ${g.length} frames over 20 ms · slowest ${worst} ms`);
}
await browser.close(); server.close();
