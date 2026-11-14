// Robot check before a merge (optimization list item 15): serves the built app (dist/) and opens the
// main screens in headless Chromium at a phone size, in English and Arabic. Fails on any page error,
// a raw text key or "undefined" on screen, a missing screen, or a page wider than the phone.
// Usage: npm run build && node scripts/smoke.mjs   (needs the `playwright` package and its Chromium)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = path.endsWith('/') ? `${path}index.html` : path;
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

// Each screen: its address and something that must be on it.
const SCREENS = [
  ['#/', '.mushaf, .page, canvas, .qcf-p, [class*="mushaf"]'],
  ['#/s/1', '.ayah'],
  ['#/learn', '.lp-top'],
  ['#/me', 'main, .screen, [class*="me-"]'],
  ['#/ranks', '[class*="rk"], [class*="rank"]'],
  ['#/create', '[class*="create"], [class*="cr-"]'],
];
const problems = [];
const browser = await chromium.launch();
// English, Arabic and four more interface languages in other scripts and directions (picked from the phone's locale).
for (const lang of ['en-US', 'ar-SA', 'ur-PK', 'ru-RU', 'zh-CN', 'fr-FR']) {
  const ctx = await browser.newContext({ locale: lang, viewport: { width: 360, height: 760 }, serviceWorkers: 'block' });
  // Outside hosts (audio, Supabase, fonts) are cut off: the screens must still open without them.
  await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('onboarded', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  let current = '';
  page.on('pageerror', (e) => problems.push(`${lang} ${current}: page error: ${e.message}`));
  for (const [hash, must] of SCREENS) {
    current = hash;
    if (hash === '#/s/1') await page.evaluate(() => localStorage.setItem('readerMode', 'translation'));
    await page.goto(base + hash);
    await page.waitForTimeout(2500);
    const r = await page.evaluate((sel) => {
      const text = document.body.innerText;
      return {
        found: !!document.querySelector(sel),
        keys: [...new Set(text.match(/\b[a-z]{1,8}\.[a-zA-Z][\w-]*\b/g) ?? [])].filter((k) => !/^(www|e\.g|i\.e)\b/.test(k) && !/\.(com|org|net|app|io|json|js|mp4|mp3|png|jpg)$/.test(k)).slice(0, 5),
        undef: /\bundefined\b|\bNaN\b|\[object Object\]/.test(text),
        wide: document.documentElement.scrollWidth - innerWidth,
      };
    }, must);
    if (!r.found) problems.push(`${lang} ${hash}: screen did not open (${must})`);
    if (r.keys.length) problems.push(`${lang} ${hash}: raw text keys on screen: ${r.keys.join(', ')}`);
    if (r.undef) problems.push(`${lang} ${hash}: "undefined", NaN or [object Object] on screen`);
    if (r.wide > 1) problems.push(`${lang} ${hash}: page is ${r.wide}px wider than the phone`);
    if (hash === '#/s/1') await page.evaluate(() => localStorage.removeItem('readerMode'));
  }
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) {
  console.error(`Smoke test failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Smoke test OK: ${SCREENS.length} screens in English and Arabic.`);
