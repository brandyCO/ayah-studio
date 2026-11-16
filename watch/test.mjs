// Checks watch.js against a pretend Supabase, Cloudflare and GitHub (no network): `node watch/test.mjs`.
import assert from 'node:assert/strict';
import { runBusy, runLimits } from './watch.js';

let issues = [], calls = 0, people = 0, dbBytes = 0;
const log = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), body = init.body ? JSON.parse(init.body) : null;
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status });
  if (u.endsWith('/database/query')) {
    const q = body.query;
    if (q.includes('pg_stat_statements')) { calls += 120; return json([{ n: String(calls) }]); }
    if (q.includes('rank_players')) return json([{ people }]);
    if (q.includes('pg_database_size')) return json([{ db: String(dbBytes), files: '0', conns: 15, maxc: 60 }]);
    if (q.includes('pg_stat_activity')) return json([{ n: 12 }]);
  }
  if (u.includes('/analytics/endpoints/logs.all')) return json({ result: [{ n: 1000, b: 1e6 }] });
  if (u.includes('graphql')) return json({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 101 }, dimensions: { scriptName: 'p' } }] }] } } });
  if (u.includes('api.github.com')) {
    const m = init.method || 'GET';
    log.push(`${m} ${u.split('/repos/')[1]}`);
    if (m === 'GET') { const l = new URL(u).searchParams.get('labels'); return json(issues.filter((i) => i.labels.includes(l) && i.state === 'open')); }
    const n = Number((u.match(/issues\/(\d+)/) || [])[1]);
    if (m === 'POST' && !n) { const i = { number: issues.length + 1, state: 'open', ...body }; issues.push(i); return json(i, 201); }
    if (m === 'PATCH') { Object.assign(issues.find((i) => i.number === n), body); return json({}); }
    return json({}, 201);
  }
  throw new Error('unexpected fetch ' + u);
};
const env = { PROJECT_REF: 'x', REPO: 'o/r', OWNER: 'o', LINE: '500', SUPABASE_ACCESS_TOKEN: 't', GITHUB_TOKEN: 'g', CF_TOKEN: 'c', CF_ACCOUNT_ID: 'a' };
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f) => realTimeout(f, 0);

people = 120; let r = await runBusy(env); assert.equal(issues.length, 0);
people = 520; r = await runBusy(env); assert.equal(issues.length, 1); assert.match(issues[0].title, /Busy: 520/); assert.deepEqual(issues[0].assignees, ['o']);
people = 530; await runBusy(env); assert.equal(issues.length, 1);
people = 390; await runBusy(env); assert.equal(issues[0].state, 'closed');

dbBytes = 100 * 1048576; r = await runLimits(env); assert.equal(issues.filter((i) => i.labels.includes('limit')).length, 0); assert.match(r.summary, /Supabase database \| 100 MB/);
dbBytes = 360 * 1048576; await runLimits(env); const lim = issues.find((i) => i.labels.includes('limit')); assert.equal(lim.title, 'Limit: Supabase database 72 %');
dbBytes = 460 * 1048576; await runLimits(env); assert.equal(lim.title, 'Limit: Supabase database 92 %'); assert.ok(log.some((l) => l.startsWith('POST') && l.includes(`issues/${lim.number}/comments`)));
dbBytes = 200 * 1048576; await runLimits(env); assert.equal(lim.state, 'closed');
// Egress pace: 1 MB a day × days in month, Workers 101 requests.
assert.match(r.summary, /egress pace/); assert.match(r.summary, /Workers requests today \| 101 requests/);
// Dry run writes nothing.
const before = issues.length; dbBytes = 480 * 1048576; await runLimits(env, true); assert.equal(issues.length, before);
console.log('watch: all checks passed');
