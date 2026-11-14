// Launch test (.github/workflows/launchtest.yml): thousands of virtual players using the app at once against the
// STAGING Supabase project, ramping to a launch spike. Each virtual player opens the app (files from Cloudflare),
// syncs, reports progress, opens Ranks / friends / rival, does Learn and the shop now and then, and keeps polling
// the way the app does while it stays open. Run with k6; settings come from the environment (see the workflow).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import exec from 'k6/execution';

const URL = __ENV.SB_URL;                 // https://<staging ref>.supabase.co
const ANON = __ENV.SB_ANON;               // the staging project's anon key
const SECRET = __ENV.SB_JWT_SECRET || '';  // staging JWT secret: tokens are signed here (no Auth calls, no MAU)
const PW = __ENV.SB_PW || '';              // password of the first SIGNINS test players (real sign-in path)
const SIGNINS = Number(__ENV.SIGNINS || 0);
const FILES = (__ENV.FILES || '').replace(/\/+$/, '');
const N = Number(__ENV.PLAYERS || 10000);
const PEAK = Number(__ENV.PEAK || 1000);  // virtual players on this runner at the top
const OFFSET = Number(__ENV.OFFSET || 0); // this runner's first player (runners never share a player)
const BYTES = Number(__ENV.BYTES || 250e6); // most bytes this runner may pull from Supabase (free-plan egress)
// League ids and public player ids of the seeded players (written by the workflow from the staging database).
const IDS = JSON.parse(open(__ENV.IDS || './ids.json'));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const options = {
  discardResponseBodies: false,
  scenarios: {
    players: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(PEAK * 0.1) },
        { duration: '3m', target: Math.round(PEAK * 0.5) },
        { duration: '2m', target: PEAK },   // the launch spike
        { duration: '3m', target: PEAK },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
    // What the edge proxy sends to the database: one league pulse per league and one player pulse per watched
    // player every 8 s, at most (the proxy keeps each answer 8 s however many phones ask).
    proxy: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.PROXY_RATE || 20), timeUnit: '1s', duration: '11m',
      preAllocatedVUs: 50, maxVUs: 400, exec: 'proxy',
    },
  },
  thresholds: {
    'http_req_failed{kind:db}': [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_duration{kind:db}': ['p(95)<1500'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max', 'count'],
};
// A submetric per call, so the summary export lists each one (the thresholds never fail).
const CALLS = ['sign_in', 'sync_pull', 'sync_push', 'rank_report', 'rank_status', 'rank_league', 'rank_my_social',
  'rank_my_friends', 'rank_feats_feed', 'rank_my_duel', 'rank_global', 'rank_flawless', 'harakat_can_upload',
  'rank_my_gifts', 'rank_lamp_wall', 'rank_set_look', 'rank_my_pulse', 'rank_live', 'rank_league_pulse', 'rank_player_pulse'];
for (const c of CALLS) {
  options.thresholds[`call_ms{call:${c}}`] = ['max>=0'];
  options.thresholds[`call_errors{call:${c}}`] = ['rate>=0'];
}
options.thresholds['files_ms'] = ['max>=0'];
options.thresholds['files_errors'] = ['rate>=0'];

const sbBytes = new Counter('supabase_bytes');
const callTime = new Trend('call_ms', true);
const errors = new Rate('call_errors');
const filesTime = new Trend('files_ms', true);
const filesErr = new Rate('files_errors');
let pulled = 0;

const b64 = (s) => encoding.b64encode(s, 'rawurl');
function mint(uid) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub: uid, role: 'authenticated', aud: 'authenticated', is_anonymous: false,
    iat: now, exp: now + 7200, iss: `${URL}/auth/v1`, email: `p@load.test` }));
  return `${head}.${body}.${crypto.hmac('sha256', SECRET, `${head}.${body}`, 'base64rawurl')}`;
}
const uidOf = (i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const today = () => new Date().toISOString().slice(0, 10);

function track(name, res) {
  const ok = res.status >= 200 && res.status < 300;
  callTime.add(res.timings.duration, { call: name });
  errors.add(!ok, { call: name });
  const n = res.body ? res.body.length : 0;
  sbBytes.add(n);
  pulled += n;
  if (pulled > BYTES) exec.test.abort(`Supabase byte budget reached on this runner (${BYTES})`);
  return ok;
}
function rpc(name, args, token) {
  const res = http.post(`${URL}/rest/v1/rpc/${name}`, JSON.stringify(args || {}), {
    headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' },
    tags: { kind: 'db', name }, timeout: '30s',
  });
  track(name, res);
  return res;
}

// Each virtual player is one seeded test player; the first few sign in for real (password), the rest use a token.
let cached = null; // one session per virtual player, kept across its iterations (tokens last 2 h)
function session() {
  if (cached && cached.until > Date.now()) return cached;
  cached = login();
  cached.until = Date.now() + 90 * 60e3;
  return cached;
}
function login() {
  const share = Math.max(1, Math.min(PEAK, N));
  const i = ((OFFSET + ((exec.vu.idInTest - 1) % share)) % N) + 1;
  const uid = uidOf(i);
  if (i <= SIGNINS && PW) {
    const res = http.post(`${URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: `p${i}@load.test`, password: PW }), {
      headers: { apikey: ANON, 'Content-Type': 'application/json' }, tags: { kind: 'auth', name: 'sign_in' }, timeout: '30s',
    });
    track('sign_in', res);
    try { if (res.status === 200) return { uid, i, token: res.json('access_token') }; } catch (_) { /* fall through */ }
  }
  return { uid, i, token: mint(uid) };
}

function openApp() {
  if (!FILES) return;
  const tags = { kind: 'files' };
  for (const [name, path] of [['version', '/version.json'], ['meta', '/data/meta.json'],
    ['page_font', `/fonts/qcf-v2/p${1 + Math.floor(Math.random() * 604)}.woff2`]]) {
    const res = http.get(`${FILES}${path}`, { tags: { ...tags, name }, responseType: 'none', timeout: '30s' });
    filesTime.add(res.timings.duration);
    filesErr.add(res.status !== 200);
  }
}

function syncPull(s) {
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const res = http.get(`${URL}/rest/v1/user_docs?select=kind,id,data,deleted,updated_at&device_id=neq.lt${s.i}&updated_at=gt.${since}&order=updated_at&limit=500`, {
    headers: { apikey: ANON, Authorization: `Bearer ${s.token}` }, tags: { kind: 'db', name: 'sync_pull' }, timeout: '30s',
  });
  track('sync_pull', res);
}
function syncPush(s, big) {
  const at = Math.floor(Date.now() / 1000);
  const rows = big
    ? [{ user_id: s.uid, kind: 'state', id: 'garden', data: { v: 'g'.repeat(12000), at }, device_id: `lt${s.i}` }]
    : [1, 2, 3].map((k) => ({ user_id: s.uid, kind: 'state', id: `kv:key${k}`, data: { v: 'y'.repeat(400), at }, device_id: `lt${s.i}` }));
  const res = http.post(`${URL}/rest/v1/user_docs?on_conflict=user_id,kind,id&select=updated_at`, JSON.stringify(rows), {
    headers: { apikey: ANON, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation' },
    tags: { kind: 'db', name: 'sync_push' }, timeout: '30s',
  });
  track('sync_push', res);
}
function report(s, step) {
  const i = s.i;
  rpc('rank_report', { d: today(), pages: (i % 15) + step, listen: (i % 50) * 60 + 60 + step * 30, surahs: i % 2, reels: i % 3,
    my_name: `Player ${i}`, lessons: i % 4, adhkar: i % 3, dhikr: (i % 10) * 33 + 33,
    week_end: new Date(Date.now() + 3 * 86400e3).toISOString(), utc_off: 180 }, s.token);
}

export default function () {
  const s = session();
  openApp();
  syncPull(s);
  syncPush(s, false);
  report(s, 0);
  const ranks = Math.random() < 0.7;
  if (ranks) {
    rpc('rank_status', { d: today() }, s.token);
    rpc('rank_league', { d: today() }, s.token);
    rpc('rank_my_social', { d: today() }, s.token);
    if (Math.random() < 0.3) { rpc('rank_my_friends', { d: today() }, s.token); rpc('rank_feats_feed', {}, s.token); }
    if (Math.random() < 0.2) rpc('rank_my_duel', { d: today() }, s.token);
    if (Math.random() < 0.1) rpc('rank_global', { d: today(), all_time: false, metric: 'all' }, s.token);
  }
  if (Math.random() < 0.2) { // Learn
    rpc('rank_flawless', { d: today(), n: 1 }, s.token);
    rpc('harakat_can_upload', {}, s.token);
    syncPush(s, true);
  }
  if (Math.random() < 0.1) { // shop
    rpc('rank_my_gifts', {}, s.token);
    rpc('rank_lamp_wall', { lim: 80 }, s.token);
    rpc('rank_set_look', { my_avatar: s.i % 24, is_private: false, my_frame: 0 }, s.token);
  }
  // The app stays open 2–5 minutes: pulse every ~10 s, reports as progress comes, sync once a minute.
  const end = Date.now() + (120 + Math.random() * 180) * 1000;
  let step = 1;
  while (Date.now() < end) {
    sleep(8 + Math.random() * 7);
    rpc('rank_my_pulse', { d: today() }, s.token);
    if (Math.random() < 0.25) { report(s, step++); }
    if (Math.random() < 0.15) { syncPull(s); syncPush(s, false); }
    if (ranks && Math.random() < 0.15) rpc('rank_my_social', { d: today() }, s.token);
    if (Math.random() < 0.08) rpc('rank_live', { k: 'read' }, s.token);
  }
}

// The proxy's own database calls (anonymous), spread over leagues and players.
export function proxy() {
  if (Math.random() < 0.5) {
    rpc('rank_league_pulse', { lg: pick(IDS.leagues), d: today() });
  } else {
    const pids = [];
    for (let k = 0; k < 16; k++) pids.push(pick(IDS.pids));
    rpc('rank_player_pulse', { pids, d: today() });
  }
}
