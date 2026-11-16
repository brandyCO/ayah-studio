// Free-plan watch on Cloudflare (replaces the GitHub workflows busy.yml and limits.yml, so they no longer use the private
// repo's Actions minutes). Two Cron Triggers (wrangler.toml):
//  - every 10 minutes, "busy": people using the app at once (signed-in accounts that reported to Ranks, were reading /
//    listening or synced in the last 5 minutes) and database calls a second (pg_stat_statements, 60 s apart). At LINE
//    (500) an issue "Busy: …" (label `busy`) is opened and assigned to the owner; it closes itself under 80 % of LINE.
//  - every hour, "limits": Supabase free plan (database 500 MB, stored files 1 GB, connections, egress pace from the last
//    24 h of gateway logs) and Cloudflare Workers requests today (100,000 a day). One issue per limit (label `limit`) at
//    70 %, a mention at 90 %, closed under 60 %.
// GitHub emails the owner and notifies his phone for an assigned issue or a mention. Read only on Supabase and Cloudflare;
// the readings never leave Cloudflare except in those issues. Secrets (set by .github/workflows/watch.yml):
// SUPABASE_ACCESS_TOKEN, optional SUPABASE_LOGS_TOKEN ("Analytics logs: read", for egress), CF_TOKEN + CF_ACCOUNT_ID
// (analytics), GITHUB_TOKEN (fine-grained, this repo only, Issues: read and write). The same code runs in Node for a
// dry run (watch/run.mjs).

const MB = 1048576;

/** One SQL query through the Supabase Management API; rows as objects. */
export async function sql(env, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env.PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase query ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------- busy ----------

export async function readBusy(env, gapMs = 60000) {
  const calls = async () => {
    try { return Number((await sql(env, 'select coalesce(sum(calls), 0)::bigint as n from extensions.pg_stat_statements'))[0].n); } catch { return NaN; }
  };
  const c1 = await calls(), t1 = Date.now();
  const [p] = await sql(env, `select count(*)::int as people from (
      select user_id from public.rank_players
        where last_report > now() - interval '5 minutes' or live_at > now() - interval '5 minutes'
      union
      select user_id from public.user_docs where updated_at > now() - interval '5 minutes'
    ) s`);
  const [c] = await sql(env, 'select count(*)::int as n from pg_stat_activity where datname = current_database()');
  await sleep(gapMs);
  const c2 = await calls(), t2 = Date.now();
  const rate = Number.isFinite(c1) && Number.isFinite(c2) ? Math.max(0, Math.round((c2 - c1) / ((t2 - t1) / 1000))) : '?';
  return { people: Number(p.people), rate, conns: Number(c.n) };
}

export async function tellBusy(gh, env, { people, rate, conns }) {
  const line = Number(env.LINE || 500);
  const open = await gh.openIssues('busy');
  const now = `${people} people at once, ${rate} database calls a second, ${conns} connections`;
  const actions = [];
  if (people >= line && !open.length) {
    actions.push(['create', `Busy: ${people} people at once`]);
    await gh.create(`Busy: ${people} people at once`, ['busy'],
      `The app is getting busy: ${now}.\n\nThe launch test showed the free Supabase server slows down at about 700 people at once. Nothing is slow yet. To stay ahead of it: Supabase dashboard → project → Settings → Billing → Pro ($25/month), then Settings → Compute and Disk → Small or Medium. Or ask Claude to do the checks with you.\n\nCounted: signed-in accounts that reported progress, were reading or listening, or synced in the last 5 minutes (people not signed in are not counted).\n\nChecked by the Cloudflare worker ayah-studio-watch (watch/watch.js). This issue closes itself once it is back under ${Math.round(line * 0.8)}.`);
  }
  for (const i of open) {
    if (people < line * 0.8) {
      actions.push(['close', i.number]);
      await gh.comment(i.number, `Quieter again: ${now}.`);
      await gh.close(i.number);
    } else if (people >= line * 1.2 && !i.title.includes(`${people}`)) {
      actions.push(['retitle', i.number]);
      await gh.retitle(i.number, `Busy: ${people} people at once`);
    }
  }
  return { summary: `People at once (signed in, last 5 min): ${now}`, actions };
}

// ---------- limits ----------

export async function readLimits(env) {
  const rows = [], notes = [];
  try {
    const [d] = await sql(env, `select pg_database_size(current_database())::bigint as db,
        coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0)::bigint as files,
        (select count(*) from pg_stat_activity)::int as conns,
        current_setting('max_connections')::int as maxc`);
    rows.push(
      { key: 'supabase-db', name: 'Supabase database', used: Number(d.db) / MB, limit: 500, unit: 'MB' },
      { key: 'supabase-files', name: 'Supabase stored files', used: Number(d.files) / MB, limit: 1024, unit: 'MB' },
      { key: 'supabase-conns', name: 'Supabase database connections', used: Number(d.conns), limit: Number(d.maxc), unit: 'connections' },
    );
  } catch (e) { notes.push(`Database: ${e.message}`); }

  try {
    // The Management API has no egress figure: add up the bytes the API gateway sent in the last 24 hours and read it
    // as the month's pace (last day × days in the month). The free plan keeps logs for one day.
    const end = new Date(), start = new Date(end.getTime() - 86400000);
    const q = 'select count(*) as n, sum(cast(h.content_length as int64)) as b from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as r cross join unnest(r.headers) as h';
    const u = new URL(`https://api.supabase.com/v1/projects/${env.PROJECT_REF}/analytics/endpoints/logs.all`);
    u.searchParams.set('sql', q);
    u.searchParams.set('iso_timestamp_start', start.toISOString());
    u.searchParams.set('iso_timestamp_end', end.toISOString());
    const r = await fetch(u, { headers: { Authorization: `Bearer ${env.SUPABASE_LOGS_TOKEN || env.SUPABASE_ACCESS_TOKEN}` } });
    const d = await r.json().catch(() => ({}));
    const res = d.result || [];
    if (!r.ok || d.error || !res.length) throw new Error(`HTTP ${r.status} ${JSON.stringify(d.error || d.message || '').slice(0, 200)}`);
    const day = (Number(res[0].b) || 0) / 1e9;
    const days = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    rows.push({ key: 'supabase-egress', name: 'Supabase egress pace this month', used: day * days, limit: 5, unit: 'GB',
      note: `${day.toFixed(2)} GB in the last 24 h, ${res[0].n || 0} requests` });
  } catch (e) { notes.push(`Egress estimate not available (needs SUPABASE_LOGS_TOKEN with "Analytics logs: read"): ${e.message}`); }

  if (env.CF_TOKEN && env.CF_ACCOUNT_ID) {
    try {
      const now = new Date();
      const s = `${now.toISOString().slice(0, 10)}T00:00:00Z`, e = `${now.toISOString().slice(0, 19)}Z`;
      const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests} dimensions{scriptName}}}}}',
          variables: { a: env.CF_ACCOUNT_ID, s, e },
        }),
      });
      const d = await r.json();
      if (d.errors?.length) throw new Error(d.errors.map((x) => x.message).join('; ').slice(0, 300));
      const per = {};
      for (const x of d.data.viewer.accounts[0].workersInvocationsAdaptive) per[x.dimensions.scriptName] = (per[x.dimensions.scriptName] || 0) + x.sum.requests;
      rows.push({ key: 'cf-workers', name: 'Cloudflare Workers requests today', used: Object.values(per).reduce((a, b) => a + b, 0), limit: 100000, unit: 'requests',
        note: Object.entries(per).sort().map(([k, v]) => `${k} ${v}`).join(', ') });
    } catch (e) { notes.push(`Cloudflare analytics: ${e.message}`); }
  }
  return { rows, notes };
}

const UPGRADE = {
  'supabase-db': 'Supabase Pro ($25/month) gives an 8 GB database.',
  'supabase-files': 'Supabase Pro ($25/month) gives 100 GB of files.',
  'supabase-egress': 'Supabase Pro ($25/month) gives 250 GB of egress a month. Past 5 GB the free project is limited until the month ends.',
  'supabase-conns': 'Supabase Pro with Small compute or larger gives more connections.',
  'cf-workers': 'Cloudflare Workers Paid ($5/month) gives 10 million requests a month. Past 100,000 a day the proxy answers errors until 00:00 UTC (the app falls back where it can).',
};
const fmt = (n) => (n >= 100 ? Math.round(n).toLocaleString('en') : n.toFixed(1));

export async function tellLimits(gh, env, rows, scale = 1) {
  const lines = ['| Limit | Used | Free plan | % |', '|---|---|---|---|'];
  const open = await gh.openIssues('limit');
  const actions = [];
  for (const r of rows) {
    const used = r.used * scale, pct = Math.round((used / r.limit) * 100);
    lines.push(`| ${r.name} | ${fmt(used)} ${r.unit} | ${fmt(r.limit)} ${r.unit} | ${pct} % |`);
    const tag = `Limit: ${r.name}`;
    const issue = open.find((i) => i.title.startsWith(tag));
    const now = `${fmt(used)} of ${fmt(r.limit)} ${r.unit} (${pct} %)${r.note ? ` · ${r.note}` : ''}`;
    if (pct >= 70 && !issue) {
      actions.push(['create', tag]);
      await gh.create(`${tag} ${pct} %`, ['limit'],
        `${r.name} is at ${now}.\n\nNothing has stopped yet. ${UPGRADE[r.key] || ''}\n\nChecked by the Cloudflare worker ayah-studio-watch (watch/watch.js), every hour.\n\nThis issue says so again at 90 % and closes itself once back under 60 %.`);
    } else if (issue) {
      const was = Number((issue.title.match(/(\d+) %$/) || [])[1] || 0);
      if (pct < 60) {
        actions.push(['close', issue.number]);
        await gh.comment(issue.number, `Back under: ${now}.`);
        await gh.close(issue.number);
      } else if (pct >= 90 && was < 90) {
        actions.push(['mention', issue.number]);
        await gh.retitle(issue.number, `${tag} ${pct} %`);
        await gh.comment(issue.number, `@${env.OWNER} now ${now}: time to upgrade. ${UPGRADE[r.key] || ''}`);
      } else if (Math.abs(pct - was) >= 5) {
        actions.push(['retitle', issue.number]);
        await gh.retitle(issue.number, `${tag} ${pct} %`);
      }
    }
  }
  return { summary: lines.join('\n'), actions };
}

// ---------- GitHub issues ----------

/** Issues on env.REPO with env.GITHUB_TOKEN. `dry` only reads (and logs what it would write). */
export function github(env, dry = false) {
  const api = (path, init = {}) => fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    ...init,
    headers: { ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}), Accept: 'application/vnd.github+json', 'User-Agent': 'ayah-studio-watch', 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  });
  const write = (path, method, body) => (dry ? (console.log('[dry]', method, path, JSON.stringify(body).slice(0, 160)), null) : api(path, { method, body: JSON.stringify(body) }));
  return {
    openIssues: async (label) => (await api(`/issues?state=open&labels=${label}&per_page=50`)).filter((i) => !i.pull_request),
    create: (title, labels, body) => write('/issues', 'POST', { title, labels, body, assignees: [env.OWNER] }),
    comment: (n, body) => write(`/issues/${n}/comments`, 'POST', { body }),
    close: (n) => write(`/issues/${n}`, 'PATCH', { state: 'closed', state_reason: 'completed' }),
    retitle: (n, title) => write(`/issues/${n}`, 'PATCH', { title }),
  };
}

export async function runBusy(env, dry = false) {
  return tellBusy(github(env, dry), env, await readBusy(env, dry ? 5000 : 60000));
}

export async function runLimits(env, dry = false, scale = 1) {
  const { rows, notes } = await readLimits(env);
  const out = await tellLimits(github(env, dry), env, rows, scale);
  return { ...out, notes };
}

export default {
  async scheduled(event, env, ctx) {
    const job = event.cron.startsWith('17 ') ? runLimits(env) : runBusy(env);
    ctx.waitUntil(job.then((r) => console.log(r.summary, r.notes || '', JSON.stringify(r.actions)), (e) => console.error('watch failed', e.message)));
  },
  // No public page: the worker only runs on its schedule.
  fetch: () => new Response('Not found', { status: 404 }),
};
