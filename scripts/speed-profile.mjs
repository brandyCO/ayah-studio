// CPU profile of one start (warm by default) at a slowed CPU: top functions by self time and by script.
// Usage: npx vite build --minify false --outDir dist-prof && node scripts/speed-profile.mjs [dir=dist-prof] [cpu=6] [cold]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL(`../${process.argv[2] || 'dist-prof'}/`, import.meta.url).pathname;
const CPU = Number(process.argv[3]) || 6;
const cold = process.argv[4] === 'cold';
const TO = process.argv[4]?.startsWith('#') ? process.argv[4] : ''; // profile a switch to this screen instead of a start
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
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
if (!cold) { await page.goto(base); await page.waitForTimeout(TO ? 9000 : 6000); }
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
if (TO && process.env.VIA) { await page.evaluate((h) => { location.hash = h; }, process.env.VIA); await page.waitForTimeout(3000); await page.evaluate(() => { location.hash = '#/s/1'; }); await page.waitForTimeout(2500); }
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
if (TO) {
  await page.evaluate((h) => { location.hash = h; }, TO);
  await page.waitForTimeout(1500);
} else {
if (cold) await page.goto(base, { waitUntil: 'commit' }); else await page.reload({ waitUntil: 'commit' });
await page.waitForFunction(() => !!document.querySelector('.mushaf-page:not(.loading)'), null, { timeout: 90000, polling: 50 });
}
const drawn = await page.evaluate(() => performance.now());
const { profile } = await cdp.send('Profiler.stop');
console.log(TO ? `switch to ${TO} (${CPU}× CPU)` : `page drawn at ${Math.round(drawn)} ms (${CPU}× CPU)`);
const self = new Map(); const byUrl = new Map();
const dt = new Map(); profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
for (const n of profile.nodes) {
  const us = dt.get(n.id) ?? 0; if (!us) continue;
  const f = n.callFrame; const u = (f.url || '(native)').replace(base, '');
  const k = `${f.functionName || '(anon)'}  ${u}:${f.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + us); byUrl.set(u, (byUrl.get(u) ?? 0) + us);
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
console.log('— self time by function —\n' + top(self, 30));
console.log('— by file —\n' + top(byUrl, 15));
// FN=name: who calls it (self time of that function by its callers' chain, 3 deep).
if (process.env.FN) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const chains = new Map();
  for (const n of profile.nodes) {
    if (n.callFrame.functionName !== process.env.FN) continue;
    const us = dt.get(n.id) ?? 0; if (!us) continue;
    const names = []; let id = parent.get(n.id);
    for (let i = 0; i < 4 && id; i++) { const f = byId.get(id).callFrame; names.push(`${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`); id = parent.get(id); }
    const k = names.join(' < '); chains.set(k, (chains.get(k) ?? 0) + us);
  }
  console.log(`— callers of ${process.env.FN} —\n` + top(chains, 10));
}
await browser.close(); server.close();
