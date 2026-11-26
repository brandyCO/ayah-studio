// Frame budget for every screen and animation (Marwan 2026-11-24, Tecno 20 Pro: "fighting for the phone").
// Serves the built app (dist/) as the Android app sees it (files local, outside hosts slow and failing), phone size,
// CPU slowed (default 6×), and plays each scenario: start, gift calendar, every tab first and return, Me scroll,
// shop open / scroll / a piece's preview open and close, the room, the Learn path. For each: frames over the 60 fps
// budget (> 20 ms), dropped-frame runs (> 34 ms), the slowest frame, main-thread blocked time, and the compositor
// layers (count + painted area in megapixels: what a phone GPU keeps in memory and composites every frame; headless
// Chromium paints on the CPU, so this is the stand-in for a weak phone GPU).
// Usage: npm run build && node scripts/frame-budget.mjs [cpu=6]   (DIST=other-build, ONLY=regex, JSON=out.json)
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL(`../${process.env.DIST || 'dist'}/`, import.meta.url).pathname;
const CPU = Number(process.argv[2]) || 6;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const file = path.endsWith('/') ? `${path}index.html` : path;
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': T[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const PROBE = () => {
  try { Object.defineProperty(navigator.serviceWorker, 'controller', { get: () => ({}) }); } catch { /* */ }
  window.__lt = []; window.__fr = [];
  const tick = (t) => { window.__fr.push(t); if (window.__fr.length > 6000) window.__fr.splice(0, 3000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  try {
    if (!sessionStorage.getItem('__b')) {
      sessionStorage.setItem('__b', '1');
      for (const k of ['tourSeen', 'mushafHint', 'mushafAsked', 'mushafKept', 'onboarded']) localStorage.setItem(k, '1');
      // A person a few days in: their own character, the shop, room and wardrobe open.
      localStorage.setItem('rankFigure', '02010110000100');
      localStorage.setItem('revealSeen', JSON.stringify(['shop', 'room', 'wardrobe']));
    }
  } catch { /* */ }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.6, serviceWorkers: 'block', isMobile: true, hasTouch: true, locale: 'en-US' });
await ctx.route((u) => !u.href.startsWith(base), async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.abort().catch(() => {}); });
await ctx.addInitScript(PROBE);
// Try a style change without rebuilding: CSS='…' is added to every page.
if (process.env.CSS) await ctx.addInitScript((css) => { addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); }); }, process.env.CSS);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('LayerTree.enable');
let layers = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers; });
const layerStats = () => {
  const drawn = layers.filter((l) => l.drawsContent && !l.invisible);
  return { layers: drawn.length, mpx: +(drawn.reduce((a, l) => a + l.width * l.height, 0) * 2.6 * 2.6 / 1e6).toFixed(1) };
};

async function topFunctions(p, name) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = p.timeDeltas; const total = dt.reduce((a, b) => a + b, 0);
  p.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP) || 25);
  console.log(`-- ${name}: ${Math.round(total / 1000)} ms sampled`);
  for (const [k, v] of top) console.log(`   ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`);
}
const now = () => page.evaluate(() => performance.now());
async function measure(name, act, settle = 1500) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) { await act().catch(() => {}); await page.waitForTimeout(settle); return null; }
  const tr = process.env.TRACE && new RegExp(process.env.TRACE).test(name);
  if (tr) await browser.startTracing(page, { path: `${process.env.TRACEDIR || '/tmp'}/${name.replace(/\W+/g, '-')}.json`, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking', 'blink', 'cc', 'blink.animations', 'devtools.timeline.async'] });
  const prof = process.env.PROF && new RegExp(process.env.PROF).test(name);
  if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const t0 = await now();
  try { await act(); } catch (e) { if (prof) await cdp.send('Profiler.stop').catch(() => {}); console.log(`${name.padEnd(26)} skipped (${e.message.split('\n')[0]})`); return null; }
  await page.waitForTimeout(settle);
  if (tr) await browser.stopTracing();
  if (prof) await topFunctions((await cdp.send('Profiler.stop')).profile, name);
  const r = await page.evaluate((a) => {
    const fr = window.__fr.filter((x) => x >= a);
    const g = fr.slice(1).map((x, i) => x - fr[i]);
    return {
      over: g.filter((x) => x > 20).length, dropped: g.filter((x) => x > 34).length, worst: Math.round(Math.max(0, ...g)), frames: g.length,
      blocked: Math.round(window.__lt.filter(([s]) => s >= a).reduce((x, [, d]) => x + Math.max(0, d - 50), 0)),
    };
  }, t0);
  if (process.env.ANIMS && new RegExp(process.env.ANIMS).test(name)) {
    const a = await page.evaluate(() => {
      const c = {};
      for (const an of document.getAnimations()) {
        if (an.playState !== 'running') continue;
        const t = an.effect?.target; const kf = an.effect?.getKeyframes?.() ?? [];
        const props = [...new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))].join(',');
        const vis = t && t.getBoundingClientRect ? (() => { const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; })() : false;
        const k = `${an.animationName || 'waapi'} [${props}] ${t?.getAttribute?.('class')?.split(' ')[0] ?? t?.tagName} ${vis ? 'VISIBLE' : 'off'}`;
        c[k] = (c[k] || 0) + 1;
      }
      const els = document.getElementsByTagName('*').length;
      const wc = {}; let shopEls = 0;
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const keys = [];
        if (cs.willChange !== 'auto') keys.push('wc:' + cs.willChange);
        if (cs.filter !== 'none') keys.push('filter:' + (el.getAttribute('class') || el.tagName).split(' ')[0] + '=' + cs.filter.slice(0, 60));
        if (cs.backdropFilter && cs.backdropFilter !== 'none') keys.push('backdrop');
        if (cs.mixBlendMode !== 'normal') keys.push('blend');
        if (cs.contentVisibility !== 'visible') keys.push('cv:' + cs.contentVisibility);
        for (const k of keys) { const kk = k + ' ' + (el.closest('.sh-page') ? 'shop' : el.closest('.screen-kept') ? 'kept' : el.closest('.screen') ? 'screen' : 'other'); wc[kk] = (wc[kk] || 0) + 1; }
        if (el.closest('.sh-page')) shopEls++;
      }
      c['__styles ' + JSON.stringify(wc) + ' shopEls=' + shopEls] = 0;
      return { els, anims: Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 30) };
    });
    console.log(`-- ${name}: ${a.els} elements; running animations:`); for (const [k, v] of a.anims) console.log(`   ${String(v).padStart(4)}  ${k}`);
  }
  const out = { name, ...r, ...layerStats() };
  console.log(`${name.padEnd(26)} worst ${String(r.worst).padStart(4)} ms · dropped ${String(r.dropped).padStart(3)} · over budget ${String(r.over).padStart(3)}/${r.frames} · blocked ${String(r.blocked).padStart(4)} ms · layers ${out.layers} (${out.mpx} MP)`);
  return out;
}
// A finger's fling (touch, with momentum), as on a phone; FLING=0 scrolls by wheel steps instead.
const fling = async (dy, n = 3) => { for (let i = 0; i < n; i++) await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 600, yDistance: -dy, speed: 2400, gestureSourceType: 'touch', repeatCount: 0 }); };
const results = [];
const run = async (...a) => { const r = await measure(...a); if (r) results.push(r); };
const go = (hash) => page.evaluate((h) => { location.hash = h; }, hash);
const closeDialogs = () => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

await run('start (reader)', async () => { await page.goto(base); await page.waitForSelector('.mushaf-page:not(.loading)', { timeout: 60000 }); }, 4000);
await run('idle 8 s (background)', async () => {}, 8000);
if (await page.$('dialog.gw[open]')) await run('gift calendar close', () => page.click('.gw-x'), 1500);
await closeDialogs();
for (const round of ['first', 'return']) {
  for (const [tab, hash] of [['learn', '#/learn'], ['ranks', '#/ranks'], ['me', '#/me'], ['read', null]]) {
    await run(`tab ${tab} ${round}`, async () => {
      if (hash) await go(hash);
      else await page.evaluate(() => { location.hash = localStorage.getItem('lastRead') || '#/s/1'; });
    }, 2000);
    await closeDialogs();
  }
}
await go('#/me'); await page.waitForTimeout(2000); await closeDialogs();
await run('gift calendar open', async () => { await page.click('.gw-card-me'); await page.waitForSelector('dialog.gw[open]'); }, 1500);
await run('gift calendar close 2', () => page.click('.gw-x'), 1200);
await run('me scroll', async () => {
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(150); }
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
}, 800);
await run('shop open', async () => { await page.evaluate(() => [...document.querySelectorAll('.lt-chip')].find((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.top < innerHeight && !e.closest('.screen-kept'); })?.click()); await page.waitForSelector('.sh-tile'); }, 2000);
if (process.env.SHOTDIR) { await page.waitForTimeout(4000); await page.screenshot({ path: `${process.env.SHOTDIR}/shop-top.png` }); }
await run('shop scroll', async () => { if (process.env.FLING !== '0') await fling(1400); else for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(150); } }, 1000);
await run('shop preview open', async () => {
  const tiles = await page.$$('.sh-tile');
  await tiles[Math.min(5, tiles.length - 1)].click();
  await page.waitForSelector('.sh-card');
}, 1800);
await run('shop preview close', () => page.click('.sh-card-x'), 1200);
await run('shop close', () => page.click('.sh-back'), 1200);
await page.waitForTimeout(3000);
await run('shop open again', async () => { await page.evaluate(() => [...document.querySelectorAll('.lt-chip')].find((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.top < innerHeight && !e.closest('.screen-kept'); })?.click()); await page.waitForSelector('.sh-tile'); }, 2000);
if (process.env.FREEZE) await page.evaluate(() => { for (const an of document.getAnimations()) an.pause(); for (const v of document.querySelectorAll('svg')) v.pauseAnimations?.(); });
await run('shop scroll again', async () => { if (process.env.FLING !== '0') await fling(1400); else for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(150); } }, 1000);
if (process.env.SHOPSTAT) console.log('SHOPSTAT', JSON.stringify(await page.evaluate(() => {
  const d = document.querySelector('dialog[open]'); if (!d) return null;
  const imgs = [...d.querySelectorAll('image')].map((i) => (i.getAttribute('href') || '').slice(0, 5));
  const by = {}; for (const k of imgs) by[k] = (by[k] || 0) + 1;
  const svgs = [...d.querySelectorAll('svg')].filter((s) => !s.parentElement?.closest('svg'));
  const live = svgs.filter((s) => !s.dataset.flat);
  return { els: d.querySelectorAll('*').length, tiles: d.querySelectorAll('.sh-tile').length, imgs: by, svgs: svgs.length, live: live.length,
    liveEls: live.reduce((n, s) => n + s.querySelectorAll('*').length, 0), liveCls: [...new Set(live.map((s) => (s.parentElement?.className || '') + '>' + (s.getAttribute('class') || '')))].slice(0, 12),
    anims: document.getAnimations().length, animList: Object.entries(document.getAnimations().reduce((m, a) => { const t = a.effect?.target; const k = (a.constructor.name) + ' ' + (a.animationName || '') + ' ' + (t ? t.tagName + '.' + String(t.className?.baseVal ?? t.className).split(' ')[0] + (t.closest('dialog') ? ' [dlg]' : ' [page]') : '') + ' ' + a.playState; m[k] = (m[k] || 0) + 1; return m; }, {})) };
})));
if (process.env.SHOTDIR) { await page.evaluate(() => { document.querySelector('dialog[open]').scrollTop = 2600; }); await page.waitForTimeout(4000); await page.screenshot({ path: `${process.env.SHOTDIR}/shop-down.png` }); }
await page.evaluate(() => document.querySelector('.sh-back')?.click()); await page.waitForTimeout(800);
await closeDialogs();
await run('room open', () => go('#/me/room'), 2500);
await run('learn path scroll', async () => {
  await go('#/learn'); await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(150); }
}, 1000);

await browser.close();
server.close();
if (process.env.JSON) await writeFile(process.env.JSON, JSON.stringify({ cpu: CPU, results }, null, 1));
