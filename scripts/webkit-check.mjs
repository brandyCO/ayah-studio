// Opens the app in WebKit as an iPhone (owner report 2026-11-16: only a green screen on iPhones) and writes page
// errors, console errors and screenshots to the folder given. Usage: node scripts/webkit-check.mjs URL OUT
import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const log = [];
const b = await webkit.launch();
for (const scheme of ['dark', 'light']) {
  for (const dev of ['iPhone 13', 'iPhone SE']) {
    const c = await b.newContext({ ...devices[dev], colorScheme: scheme });
    const p = await c.newPage();
    const tag = `${scheme}-${dev.replace(/ /g, '')}`;
    p.on('pageerror', (e) => log.push(`[${tag}] PAGEERROR ${e.message}\n${e.stack || ''}`));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${tag}] console.${m.type()} ${m.text()}`); });
    p.on('requestfailed', (r) => log.push(`[${tag}] FAILED ${r.url()} ${r.failure()?.errorText}`));
    try {
      await p.goto(url, { waitUntil: 'load', timeout: 60000 });
      await p.waitForTimeout(8000);
      await p.screenshot({ path: `${out}/${tag}.png` });
      const text = await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, ' '));
      log.push(`[${tag}] text: ${text}`);
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(6000);
      await p.screenshot({ path: `${out}/${tag}-reload.png` });
    } catch (e) { log.push(`[${tag}] GOTO ${e.message}`); }
    await c.close();
  }
}
await b.close();
writeFileSync(`${out}/log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
