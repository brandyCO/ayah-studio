// Link preview banners (owner request 2026-11-25, "a banner for each invitation link, each unique on its own").
// WhatsApp, Telegram, iMessage, X… show a link's og:image. Every shared ayah gets its own 1200×630 banner: the ayah
// itself in the KFGQPC font (drawn by Chromium, rule 5; the bundled text unchanged and never cut, rule 1), Saheeh
// International under it when both fit, the reference always (rule 2), on one of the app's gradients picked per ayah.
// An ayah too long for a banner shows its surah name, reference and translation instead (or only the first two):
// never a part of the ayah. Also one banner per surah (`/s/N`) and one per invite kind (friend, challenge, board, pact,
// relight, family circle). Served by the `ayah-studio` worker (files/share.js), which writes the og tags.
//
// Writes into OUT (default share-cards/):
//   og/a/{s}/{a}.jpg   6236 ayah banners      og/s/{s}.jpg   114 surah banners      og/k/{kind}.jpg   invite banners
//   og/m/{s}.json      what the worker needs per surah: names, Arabic text, Saheeh International (small, parsed per link)
// Usage: node scripts/make-share-cards.mjs              (needs the `playwright` package and its Chromium)
//        ONLY=11:90,2:282,112 node scripts/make-share-cards.mjs   a few ayat / surahs only (for a look)
//        JOBS=6 (pages at once, default 4) OUT=dir PUBLIC=dir (data, fonts and icons from a built site instead of public/)
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const pub = process.env.PUBLIC || new URL('../public/', import.meta.url).pathname; // or a built site (dist/)
const OUT = process.env.OUT || new URL('../share-cards/', import.meta.url).pathname;
const JOBS = Number(process.env.JOBS) || 4;
const W = 1200;
const H = 630;

const meta = JSON.parse(await readFile(join(pub, 'data/meta.json'), 'utf8'));
const quran = JSON.parse(await readFile(join(pub, 'data/quran-uthmani.json'), 'utf8')).surahs;
const sahih = JSON.parse(await readFile(join(pub, 'data/en-sahih.json'), 'utf8')).surahs;
if (quran.length !== 114 || sahih.length !== 114 || quran.flat().length !== 6236 || sahih.flat().length !== 6236) {
  throw new Error('Quran data is not 114 surahs / 6236 ayat');
}

/** The app's own gradients (src/ui/theme.ts `fill`, the icon's sunset first), deep enough for white text. */
const PALETTES = [
  ['#5b3fc4', '#a24c9e', '#f3695b'], // sunset (the app icon)
  ['#0b3f9e', '#0a6f9a'], // deep ocean
  ['#05573d', '#0f8273'], // emerald
  ['#3d0f9e', '#8e14bd'], // ultraviolet
  ['#2c1a96', '#8f1470', '#a8420c'], // nebula
  ['#8f1450', '#6a2aa6'], // rose quartz
  ['#0d2a5c', '#3b3aa8'], // night
  ['#006b54', '#00607a', '#4b3bb8'], // aurora
];
const paletteFor = (s, a) => PALETTES[(s * 7 + a * 3) % PALETTES.length];

/** Invite banners: English headline + the same in Arabic (the sharer's friends may read either). */
const KINDS = {
  rf: { en: 'Be my Quran friend', ar: 'كن صديقي في رحلة القرآن', pal: 0 },
  rc: { en: 'A Quran challenge for you', ar: 'تحدٍّ قرآني لك', pal: 3 },
  rb: { en: 'Join our Quran league', ar: 'انضم إلى دوري القرآن معنا', pal: 1 },
  bp: { en: "Seven nights of the bedtime du'a", ar: 'سبع ليالٍ من دعاء النوم معًا', pal: 6 },
  relight: { en: 'Help relight my streak', ar: 'ساعدني لأعيد إشعال سلسلتي', pal: 4 },
  join: { en: 'Join our family circle', ar: 'انضم إلى دائرة عائلتنا', pal: 2 },
};

const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = path === '/card.html' ? Buffer.from(PAGE) : await readFile(join(pub, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Hafs; src: url(/fonts/UthmanicHafs.woff2); font-display: block; }
@font-face { font-family: Nunito; src: url(/fonts/Nunito-latin.woff2); font-weight: 200 1000; font-display: block; }
@font-face { font-family: Nunito; src: url(/fonts/Nunito-latin-ext.woff2); font-weight: 200 1000; font-display: block;
  unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: NotoAr; src: url(/fonts/NotoSansArabic-Bold.woff2); font-weight: 700; font-display: block; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
#c { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; color: #fff; font-family: Nunito, NotoAr, sans-serif; }
.glow { position: absolute; inset: 0; background:
  radial-gradient(60% 70% at 50% 45%, rgba(255,255,255,.16), rgba(255,255,255,0) 70%),
  radial-gradient(40% 50% at 100% 0%, rgba(255,255,255,.10), rgba(255,255,255,0) 70%); }
.star { position: absolute; width: 520px; height: 520px; right: -140px; bottom: -170px; opacity: .09; }
.spark { position: absolute; color: #ffe08a; font-size: 26px; text-shadow: 0 0 12px rgba(255,214,90,.8); }
header { position: absolute; left: 56px; right: 56px; top: 36px; height: 56px; display: flex; align-items: center; gap: 14px; }
header img { width: 56px; height: 56px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
header b { font-weight: 900; font-size: 28px; letter-spacing: .2px; }
header .sn { margin-inline-start: auto; font-size: 46px; line-height: 1; text-shadow: 0 2px 12px rgba(0,0,0,.25); }
main { position: absolute; left: 64px; right: 64px; top: 112px; bottom: 104px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px; text-align: center; }
.ar { font-family: Hafs; direction: rtl; line-height: 1.75; text-shadow: 0 2px 14px rgba(0,0,0,.28); word-spacing: 2px; }
.tr { font-weight: 700; line-height: 1.35; color: rgba(255,255,255,.92); text-shadow: 0 1px 8px rgba(0,0,0,.2); max-width: 1000px; }
footer { position: absolute; left: 0; right: 0; bottom: 34px; display: flex; justify-content: center; }
.pill { padding: 9px 26px 11px; border-radius: 999px; background: rgba(255,255,255,.17); border: 1.5px solid rgba(255,255,255,.28);
  font-weight: 900; font-size: 27px; backdrop-filter: blur(4px); }
.big { font-size: 150px; line-height: 1.1; text-shadow: 0 4px 24px rgba(0,0,0,.3); }
.sub { font-weight: 800; font-size: 34px; }
.sub2 { font-weight: 700; font-size: 26px; color: rgba(255,255,255,.85); }
.kind { position: absolute; inset: 0; display: flex; align-items: center; gap: 56px; padding: 0 80px; }
.kind img { width: 330px; height: 330px; border-radius: 74px; box-shadow: 0 24px 60px rgba(0,0,0,.3); flex: none; }
.kind h1 { font-weight: 900; font-size: 64px; line-height: 1.08; }
.kind h2 { font-family: NotoAr; font-weight: 700; font-size: 40px; direction: rtl; margin-top: 18px; color: rgba(255,255,255,.92); }
.kind p { font-weight: 800; font-size: 28px; margin-top: 22px; color: rgba(255,255,255,.85); }
</style></head><body><div id="c"></div><script>
const STAR = '<svg class="star" viewBox="0 0 100 100"><g fill="none" stroke="#fff" stroke-width="3"><rect x="20" y="20" width="60" height="60" rx="4"/><rect x="20" y="20" width="60" height="60" rx="4" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="17"/></g></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const faces = new Map();
async function suraFont(n) {
  if (!faces.has(n)) {
    const f = new FontFace('sn' + n, 'url(/fonts/suras/s' + String(n).padStart(3, '0') + '.woff2)');
    faces.set(n, f.load().then((x) => document.fonts.add(x)));
  }
  return faces.get(n);
}
const sn = (n, cls) => '<span class="' + cls + '" style="font-family: sn' + n + '">' + String(n).padStart(3, '0') + '</span>';
function frame(pal, inner, n) {
  const g = 'linear-gradient(160deg, ' + pal.join(', ') + ')';
  return '<div style="position:absolute;inset:0;background:' + g + '"></div><div class="glow"></div>' + STAR +
    '<span class="spark" style="left:1080px;top:118px">✦</span><span class="spark" style="left:96px;top:520px;font-size:18px;color:#fff">✦</span>' +
    '<header><img src="/icon-b-192.png" alt=""><b>Ayah Studio</b>' + (n ? sn(n, 'sn') : '') + '</header>' + inner;
}
const fits = (box) => box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
/** Draws one card; returns which layout it took. */
window.draw = async (card) => {
  const c = document.getElementById('c');
  if (card.n) await suraFont(card.n);
  await document.fonts.load('40px Hafs', card.ar || 'ا');
  await document.fonts.load('900 40px Nunito', 'A');
  await document.fonts.load('700 40px NotoAr', 'ا');
  if (card.type === 'kind') {
    c.innerHTML = frame(card.pal, '', 0).replace(/<header>.*<\\/header>/, '') +
      '<div class="kind"><img src="/icon-b-512.png" alt=""><div><h1>' + esc(card.en) + '</h1><h2>' + esc(card.ar) + '</h2><p>Ayah Studio · Quran together</p></div></div>';
    return 'kind';
  }
  if (card.type === 'surah') {
    c.innerHTML = frame(card.pal, '<main>' + sn(card.n, 'big') + '<div class="sub">' + esc(card.title) + '</div><div class="sub2">' + esc(card.sub) + '</div></main>' +
      '<footer><span class="pill">' + esc(card.ref) + '</span></footer>', 0);
    return 'surah';
  }
  c.innerHTML = frame(card.pal, '<main></main><footer><span class="pill">' + esc(card.ref) + '</span></footer>', card.n);
  const box = c.querySelector('main');
  const ar = document.createElement('div'); ar.className = 'ar'; ar.textContent = card.ar;
  const tr = document.createElement('div'); tr.className = 'tr'; tr.textContent = card.tr;
  // 1. The whole ayah with its translation; 2. the whole ayah alone; 3. surah name + translation; 4. surah name only.
  box.replaceChildren(ar, tr);
  for (let a = 72; a >= 40; a -= 2) {
    ar.style.fontSize = a + 'px';
    tr.style.fontSize = Math.max(24, Math.min(32, Math.round(a * 0.45))) + 'px';
    if (fits(box)) return 'ayah+tr';
  }
  box.replaceChildren(ar);
  for (let a = 72; a >= 36; a -= 2) { ar.style.fontSize = a + 'px'; if (fits(box)) return 'ayah'; }
  const name = document.createElement('div'); name.innerHTML = sn(card.n, 'big'); name.firstChild.style.fontSize = '96px';
  box.replaceChildren(name, tr);
  for (let s = 26; s >= 22; s -= 1) { tr.style.fontSize = s + 'px'; if (fits(box)) return 'name+tr'; }
  const more = document.createElement('div'); more.className = 'sub'; more.textContent = 'Ayah ' + card.a + ' · read it whole in Ayah Studio';
  box.replaceChildren(name, more);
  name.firstChild.style.fontSize = '150px';
  return 'name';
};
</script></body></html>`;

// --- what to draw ---
const pick = (process.env.ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
const wantAyah = (s, a) => !pick.length || pick.includes(`${s}:${a}`);
const wantSurah = (s) => !pick.length || pick.includes(String(s));
const cards = [];
for (const m of meta) {
  const s = m.n;
  if (wantSurah(s)) {
    cards.push({ file: `og/s/${s}.jpg`, type: 'surah', n: s, pal: paletteFor(s, 0), title: `Surah ${m.en}`,
      sub: `${m.tr} · ${m.ayahs} ayat`, ref: `${m.en} · ${s}` });
  }
  for (let a = 1; a <= m.ayahs; a++) {
    if (!wantAyah(s, a)) continue;
    cards.push({ file: `og/a/${s}/${a}.jpg`, type: 'ayah', n: s, a, pal: paletteFor(s, a), ar: quran[s - 1][a - 1], tr: sahih[s - 1][a - 1],
      ref: `${m.en} · ${s}:${a}` });
  }
}
if (!pick.length || pick.includes('kinds')) {
  for (const [k, v] of Object.entries(KINDS)) cards.push({ file: `og/k/${k}.jpg`, type: 'kind', pal: PALETTES[v.pal], en: v.en, ar: v.ar });
}

// The worker's per-surah data (names + text for the og title / description).
await mkdir(join(OUT, 'og/m'), { recursive: true });
for (const m of meta) {
  await writeFile(join(OUT, `og/m/${m.n}.json`), JSON.stringify({ en: m.en, ar: m.ar, tr: m.tr, ayahs: m.ayahs, q: quran[m.n - 1], t: sahih[m.n - 1] }));
}

const browser = await chromium.launch();
const tally = {};
let done = 0;
const queue = cards.slice();
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { throw e; });
  await page.goto(`${base}card.html`);
  for (let card; (card = queue.shift());) {
    const how = await page.evaluate((c) => window.draw(c), card);
    tally[how] = (tally[how] ?? 0) + 1;
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const jpg = await page.screenshot({ type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: W, height: H } });
    await mkdir(join(OUT, card.file, '..'), { recursive: true });
    await writeFile(join(OUT, card.file), jpg);
    if (++done % 500 === 0) console.log(`${done}/${cards.length} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await page.close();
}));
await browser.close();
server.close();
console.log(`${done} banners in ${Math.round((Date.now() - t0) / 1000)} s →`, OUT, tally);
