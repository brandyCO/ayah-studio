// Cold first visit on slow 3G (gzip, CPU slowed): every download until the mushaf page is drawn, in start order,
// with when it started and finished. Shows what holds up the first page. Usage: node scripts/speed-waterfall.mjs [cpu=6]
import { createServer } from 'node:http';
import { createSecureServer } from 'node:http2';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL(`../${process.env.DIST || 'dist'}/`, import.meta.url).pathname;
const CPU = Number(process.argv[2]) || 6;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
// H2=1: HTTP/2 over TLS like the real hosts (Cloudflare, GitHub Pages); plain HTTP/1.1 allows 6 downloads at once.
const H2 = !!process.env.H2;
let tls = {};
if (H2) { const d = tmpdir(); execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${d}/wf.key`, '-out', `${d}/wf.crt`, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  tls = { key: await readFile(`${d}/wf.key`), cert: await readFile(`${d}/wf.crt`), allowHTTP1: true }; }
const handler = async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = path.endsWith('/') ? `${path}index.html` : path;
    const body = await readFile(join(root, file));
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const zip = /text|json|javascript|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, { 'content-type': type, ...(zip ? { 'content-encoding': 'gzip' } : {}) });
    res.end(zip ? gzipSync(body) : body);
  } catch { res.writeHead(404); res.end(); }
};
const server = (H2 ? createSecureServer(tls, handler) : createServer(handler)).listen(0);
await new Promise((ok) => server.once('listening', ok));
const base = `${H2 ? 'https' : 'http'}://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.6, serviceWorkers: 'block', ignoreHTTPSErrors: true, isMobile: true, hasTouch: true });
await ctx.route((u) => !u.href.startsWith(base), async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.abort().catch(() => {}); });
await ctx.addInitScript(() => { for (const k of ['onboarded', 'tourSeen', 'mushafHint', 'mushafAsked', 'mushafKept']) localStorage.setItem(k, '1'); });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
await page.goto(base, { waitUntil: 'commit' });
// The page on screen: index.html's first picture (#prepaint) or the reader's own; then the reader itself.
await page.waitForFunction(() => !!document.querySelector('#prepaint .w') || !!document.querySelector('.mushaf-page:not(.loading) .qcf-line, .mushaf-page:not(.loading) [data-p]'), null, { timeout: 90000, polling: 50 });
const shown = await page.evaluate(() => performance.now());
await page.waitForFunction(() => !!document.querySelector('.mushaf-page:not(.loading) .qcf-line, .mushaf-page:not(.loading) [data-p]'), null, { timeout: 90000, polling: 50 });
const r = await page.evaluate(() => ({ now: performance.now(), fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
  res: performance.getEntriesByType('resource').map((e) => [e.name, Math.round(e.startTime), Math.round(e.responseEnd), e.transferSize, e.initiatorType]) }));
let kb = 0;
for (const [n, s, e, t, i] of r.res.sort((a, b) => a[1] - b[1])) {
  if (s > r.now) continue; kb += t / 1024;
  console.log(`${String(s).padStart(6)} → ${String(e).padStart(6)} ms ${(t / 1024).toFixed(1).padStart(7)} KB ${e <= r.now ? '*' : ' '} ${i.padEnd(6)} ${n.replace(base, '')}`);
}
console.log(`first paint ${Math.round(r.fcp)} ms · page shown ${Math.round(shown)} ms · reader ready ${Math.round(r.now)} ms · ${kb.toFixed(0)} KB started before it (* = finished before)`);
await browser.close(); server.close();
