// Lists what a cold start downloads (biggest first) and when each finished. Usage: node scripts/speed-res.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('../dist/', import.meta.url).pathname;
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { const file = path.endsWith('/') ? `${path}index.html` : path; const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[extname(file)] ?? 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
await ctx.route((u) => !u.href.startsWith(base), (r) => r.abort());
await ctx.addInitScript(() => { localStorage.setItem('onboarded', '1'); });
const page = await ctx.newPage();
const sizes = new Map();
page.on('response', async (r) => { try { sizes.set(r.url(), (await r.body()).length); } catch { /* */ } });
await page.goto(base);
await page.waitForFunction(() => !!document.querySelector('.mushaf-page:not(.loading)'), null, { timeout: 60000 });
const drawn = await page.evaluate(() => performance.now());
await page.waitForTimeout(4000);
const ents = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => [e.name, Math.round(e.responseEnd), e.initiatorType]));
let before = 0, total = 0;
for (const [n, end, init] of ents.sort((a, b) => (sizes.get(b[0]) ?? 0) - (sizes.get(a[0]) ?? 0))) {
  const kb = (sizes.get(n) ?? 0) / 1024; total += kb; if (end <= drawn) before += kb;
  console.log(`${kb.toFixed(1).padStart(8)} KB  ${String(end).padStart(6)} ms ${end <= drawn ? '*' : ' '} ${init.padEnd(6)} ${n.replace(base, '')}`);
}
console.log(`page drawn at ${Math.round(drawn)} ms; ${before.toFixed(0)} KB raw before it (* = before), ${total.toFixed(0)} KB in the first ${Math.round(drawn + 4000)} ms`);
await browser.close(); server.close();
