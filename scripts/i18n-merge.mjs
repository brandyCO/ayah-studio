// Joins a language's translated parts (scripts/i18n/work/{lang}/*.json, each { module: { key: text } },
// a module may be split over several files) into src/i18n/locales/{lang}.json in the source's key order,
// then checks it. Usage: node scripts/i18n-merge.mjs {lang}
import fs from 'node:fs';
import path from 'node:path';
import { check } from './check-i18n.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const id = process.argv[2];
if (!id) { console.error('usage: node scripts/i18n-merge.mjs {lang}'); process.exit(2); }
const en = JSON.parse(fs.readFileSync(path.join(root, 'scripts/i18n/en.json'), 'utf8'));
const work = path.join(root, 'scripts/i18n/work', id);
const got = {};
for (const f of fs.readdirSync(work).filter((f) => f.endsWith('.json')).sort()) {
  let part;
  try { part = JSON.parse(fs.readFileSync(path.join(work, f), 'utf8')); }
  catch (e) { console.error(`${f}: not valid JSON (${e.message})`); process.exit(1); }
  for (const [mod, keys] of Object.entries(part)) Object.assign((got[mod] ??= {}), keys);
}
const out = {};
for (const [mod, keys] of Object.entries(en)) {
  out[mod] = {};
  for (const k of Object.keys(keys)) if (got[mod]?.[k] != null) out[mod][k] = got[mod][k];
  for (const k of Object.keys(got[mod] ?? {})) if (!(k in keys)) out[mod][k] = got[mod][k]; // reported by check()
}
fs.mkdirSync(path.join(root, 'src/i18n/locales'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/i18n/locales', `${id}.json`), JSON.stringify(out) + '\n');
const p = check(id);
console.log(`${id}: ${p.length ? `${p.length} problem(s)` : 'ok, every string translated'}`);
for (const x of p.slice(0, 80)) console.log(`  ${x}`);
process.exit(p.length ? 1 : 0);
