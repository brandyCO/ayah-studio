// Can the app read a recording from another site? In Chromium, from another origin: a HEAD (file size), a
// Range fetch (reel slices) and an <audio crossorigin> that plays (Listen, Web Audio).
//   node scripts/cors-check.cjs OUT.json URL...
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, ...urls] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.goto('https://example.com/');
  const res = {};
  for (const url of urls) {
    res[url] = await p.evaluate(async (url) => {
      const r = {};
      try { const h = await fetch(url, { method: 'HEAD' }); r.head = [h.status, h.headers.get('content-length'), h.url]; } catch (e) { r.head = String(e); }
      try { const g = await fetch(url, { headers: { Range: 'bytes=1000-1999' } }); r.range = [g.status, (await g.arrayBuffer()).byteLength]; } catch (e) { r.range = String(e); }
      try {
        const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = url;
        const ctx = new AudioContext(); ctx.createMediaElementSource(a).connect(ctx.destination);
        await a.play(); await new Promise((ok) => setTimeout(ok, 1500)); r.play = a.currentTime; a.pause();
      } catch (e) { r.play = String(e); }
      return r;
    }, url);
    console.log(url, JSON.stringify(res[url]));
  }
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  await b.close();
})();
