// Runs the watch once from Node, the same code as the worker (watch.js). Used by .github/workflows/watch.yml before it
// deploys: `node watch/run.mjs busy|limits [--dry] [--scale N]`. Reads the secrets from the environment.
import { runBusy, runLimits } from './watch.js';
import { readFileSync } from 'node:fs';

const vars = Object.fromEntries([...readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8').matchAll(/^([A-Z_]+) = "(.*)"$/gm)].map((m) => [m[1], m[2]]));
const env = { ...vars, ...Object.fromEntries(['SUPABASE_ACCESS_TOKEN', 'SUPABASE_LOGS_TOKEN', 'CF_TOKEN', 'CF_ACCOUNT_ID', 'GITHUB_TOKEN'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
const [job] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
const i = process.argv.indexOf('--scale');
const scale = i > 0 ? Number(process.argv[i + 1]) : 1;
const r = job === 'busy' ? await runBusy(env, dry) : await runLimits(env, dry, scale);
console.log(r.summary);
for (const n of r.notes || []) console.log(`::warning::${n}`);
console.log('actions:', JSON.stringify(r.actions));
