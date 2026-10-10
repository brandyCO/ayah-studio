// Picker thumbnails for the light reel backgrounds (docs/light.md, L2): renders each scene at t = 20 s
// with the real engine in headless Chromium (software GL) and writes public/backgrounds/light-*-thumb.jpg.
// Usage: npx vite --port 5173 &  then  node scripts/make-light-thumbs.mjs [playwright module path]
import { writeFileSync } from 'node:fs';

const pw = process.argv[2] ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(pw);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.goto('http://localhost:5173/#/drafts');
for (const id of ['dawn', 'stars', 'aurora', 'lanterns', 'rays']) {
  const url = await p.evaluate(async (id) => {
    const { LightReel } = await import('/src/light/reel.ts');
    const r = new LightReel(id);
    const gl = r.frame(20, 432, 768);
    const c = document.createElement('canvas');
    c.width = 216;
    c.height = 384;
    c.getContext('2d').drawImage(gl, 0, 0, 216, 384);
    r.dispose();
    return c.toDataURL('image/jpeg', 0.82);
  }, id);
  writeFileSync(`public/backgrounds/light-${id}-thumb.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`light-${id}-thumb.jpg`);
}
await b.close();
