// Collects every English interface string into scripts/i18n/en.json, grouped by module:
// { core, studio, ranks, …, engine, noor, msg }. This is the source the translations in
// src/i18n/locales/{lang}.json follow (scripts/check-i18n.mjs checks them against it).
// Run after adding or changing English strings: node scripts/i18n-source.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/** Evaluates the object literal that starts at `start` in `src` (plain strings only). */
function literal(src, start, file) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`${file}: ${start} not found`);
  const open = src.indexOf('{', i);
  const end = src.slice(open).search(/\n}( as const)?;/) + open;
  return Function(`return (${src.slice(open, end + 2)});`)();
}

const out = {};
out.core = literal(read('src/i18n/en.ts'), 'const en = {', 'en.ts');
out.studio = literal(read('src/i18n/enStudio.ts'), 'const studio = {', 'enStudio.ts');
for (const m of ['adhkar', 'badges', 'challenges', 'friends', 'front', 'lampWall', 'learn', 'mePages', 'media', 'moments', 'ranks', 'season', 'shop']) {
  out[m] = literal(read(`src/i18n/${m}.ts`), 'const en = {', `${m}.ts`);
}
out.noor = literal(read('src/ui/noor.ts'), 'const en = {', 'noor.ts');
out.engine = JSON.parse(read('scripts/i18n/engine-en.json'));
out.msg = JSON.parse(read('scripts/i18n/messages-en.json'));
out.extra = JSON.parse(read('scripts/i18n/extra-en.json'));

let n = 0, chars = 0;
for (const [m, d] of Object.entries(out)) for (const v of Object.values(d)) { n++; chars += v.length; if (typeof v !== 'string') throw new Error(`${m}: not a string`); }
fs.writeFileSync(path.join(root, 'scripts/i18n/en.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${n} strings, ${chars} characters, ${Object.keys(out).length} modules`);
