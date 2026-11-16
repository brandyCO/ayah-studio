// Play Store screenshots (docs/play-store.md): serves the built app (dist/) and photographs the main screens at
// 1080 × 1920 (a 360 × 640 phone at 3×) in English and Arabic → store/{en,ar}/NN-name.png.
// Usage: npm run build && node scripts/store-screenshots.mjs
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../store/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = path.endsWith('/') ? `${path}index.html` : path;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(join(root, file)));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const only = process.argv[2];
const SHOTS = [
  ['01-mushaf', '#/s/18', 5000],
  ['02-learn', '#/learn', 4000],
  ['03-season', '#/season', 5000],
  ['04-me', '#/me', 4000],
  ['05-ranks', '#/ranks', 4000],
  ['06-search', '#/', 3000],
];
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  await mkdir(join(out, lang), { recursive: true });
  const ctx = await browser.newContext({ locale: lang === 'ar' ? 'ar-SA' : 'en-US', viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, serviceWorkers: 'block', isMobile: true, hasTouch: true });
  await ctx.addInitScript((l) => {
    for (const [k, v] of Object.entries({ onboarded: '1', tourSeen: '1', mushafHint: '1', mushafAsked: '1', uiLang: l, studioSeen: '1', listenMoved: '1', nudgeAsked: '1', duaNotesAsked: '1', usageOff: '1' })) localStorage.setItem(k, v);
  }, lang);
  const page = await ctx.newPage();
  for (const [name, hash, wait] of SHOTS) {
    if (only && !name.includes(only)) continue;
    await page.goto(base + hash);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: join(out, lang, `${name}.png`) });
    console.log(lang, name);
  }
  await ctx.close();
}
// The 512 px store icon (full square: Play rounds it) and the 1024 × 500 feature graphic, in both languages.
if (!only || only === "art") {
  const svg = (await readFile(join(root, 'icon.svg'), 'utf8')).replace('<g clip-path="url(#tile)">', '<g>');
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 } });
  const page = await ctx.newPage();
  await page.setContent(`<style>body{margin:0}svg{display:block;width:512px;height:512px}</style>${svg}`);
  await page.screenshot({ path: join(out, 'icon-512.png') });
  for (const [lang, title, line] of [['en', 'Ayah Studio', 'Read, learn and share the Quran'], ['ar', 'آية ستوديو', 'اقرأ القرآن وتعلّمه وشاركه']]) {
    await page.setViewportSize({ width: 1024, height: 500 });
    const html = `<!doctype html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><style>
      @font-face { font-family: N; src: url(${base}fonts/Nunito-latin.woff2); font-weight: 200 1000; }
      body { margin: 0; width: 1024px; height: 500px; display: flex; align-items: center; gap: 56px; padding: 0 80px; box-sizing: border-box;
        background: linear-gradient(135deg, #2a1d7a 0%, #4b36b8 38%, #ff7f57 82%, #ffb38a 100%); font-family: N, 'Noto Naskh Arabic', sans-serif; color: #fff; overflow: hidden; }
      .ic { width: 300px; height: 300px; flex: none; border-radius: 68px; overflow: hidden; box-shadow: 0 24px 60px rgba(20, 8, 60, .45); }
      .ic svg { width: 100%; height: 100%; display: block; }
      h1 { white-space: nowrap; font-size: 84px; font-weight: 900; margin: 0 0 12px; letter-spacing: -1px; text-shadow: 0 4px 0 rgba(30, 10, 80, .25); }
      p { font-size: 38px; font-weight: 700; margin: 0; opacity: .95; }
    </style><body><div class="ic">${svg}</div><div><h1>${title}</h1><p>${line}</p></div></body></html>`;
    await page.route(`${base}feature.html`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto(`${base}feature.html`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, lang, 'feature-graphic.png') });
  }
}
await browser.close();
server.close();
