// Checks every interface translation (src/i18n/locales/{lang}.json) against the English source
// (scripts/i18n/en.json, written by scripts/i18n-source.mjs): every key present and non-empty, the same
// {placeholders}, well-formed plurals ({n, plural, one {…} other {…}} with an `other`), and no key the
// source does not have. Usage: node scripts/check-i18n.mjs [--strict] [lang…]   (no langs = all).
// Without --strict (the PR check) a missing or no-longer-used key is only counted — the app shows English for it —
// and only a broken translation (wrong placeholders, a bad plural) fails; with --strict everything fails.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'scripts/i18n/en.json'), 'utf8'));
const dir = path.join(root, 'src/i18n/locales');

/** The placeholder names a string uses, plurals included ({n, plural, …} counts as n). */
export function holes(s) {
  const out = new Set();
  const plural = /\{(\w+),\s*plural,/g;
  let m;
  while ((m = plural.exec(s))) out.add(m[1]);
  for (const x of s.matchAll(/\{(\w+)\}/g)) out.add(x[1]);
  return out;
}

/** Problems with the ICU plural blocks in `s` (balanced braces, an `other` form). */
function pluralIssues(s) {
  const issues = [];
  let i = 0;
  while ((i = s.indexOf(', plural,', i)) >= 0) {
    const open = s.lastIndexOf('{', i);
    let depth = 0, j = open;
    for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
    if (depth) { issues.push('unbalanced plural'); break; }
    const body = s.slice(i + 9, j);
    if (!/(^|\s|\})other\s*\{/.test(body)) issues.push('plural without other');
    i = j;
  }
  return issues;
}

export function check(id, strict = true) {
  const file = path.join(dir, `${id}.json`);
  const tr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  let missing = 0;
  for (const [mod, keys] of Object.entries(en)) {
    const t = tr[mod] ?? {};
    for (const [k, s] of Object.entries(keys)) {
      const v = t[k];
      if (typeof v !== 'string' || !v.trim()) { if (strict) problems.push(`${mod}/${k}: missing`); else missing++; continue; }
      const a = [...holes(s)].sort().join(','), b = [...holes(v)].sort().join(',');
      if (a !== b) problems.push(`${mod}/${k}: placeholders {${a}} vs {${b}}`);
      for (const p of pluralIssues(v)) problems.push(`${mod}/${k}: ${p}`);
      if (/Ayah Studio/.test(s) && !/Ayah Studio/.test(v)) problems.push(`${mod}/${k}: "Ayah Studio" must stay as it is`);
    }
    if (strict) for (const k of Object.keys(t)) if (!(k in keys)) problems.push(`${mod}/${k}: not in the English source`);
  }
  if (strict) for (const mod of Object.keys(tr)) if (!(mod in en)) problems.push(`${mod}: unknown module`);
  problems.missing = missing;
  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const strict = process.argv.includes('--strict');
  const args = process.argv.slice(2).filter((a) => a !== '--strict');
  const ids = args.length ? args
    : fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  let bad = 0;
  for (const id of ids) {
    const p = check(id, strict);
    console.log(`${id}: ${p.length ? `${p.length} problem(s)` : 'ok'}${p.missing ? ` · ${p.missing} string(s) not translated yet (English shows)` : ''}`);
    for (const x of p.slice(0, 60)) console.log(`  ${x}`);
    if (p.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
