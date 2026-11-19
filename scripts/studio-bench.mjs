// Runs bench/ (studio render cost per effect) in headless Chromium with CPU throttling.
// node scripts/studio-bench.mjs [width] [cpuRate]   (dev server: npx vite --port 5199)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const width = process.argv[2] ?? '720', rate = Number(process.argv[3] ?? 4);
const b = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
const s = await p.context().newCDPSession(p);
await s.send('Emulation.setCPUThrottlingRate', { rate });
await p.goto(`http://localhost:5199/bench/?w=${width}`);
await p.waitForFunction(() => window.benchDone, null, { timeout: 600000 });
const rows = await p.evaluate(() => window.benchDone);
if (typeof rows === 'string') { console.error(rows); process.exit(1); }
for (const r of rows) console.log(`${r.label.padEnd(40)} ${String(r.avg).padStart(7)} ms  p90 ${r.p90}`);
await b.close();
