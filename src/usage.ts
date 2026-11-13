// Anonymous usage counts (owner request 2026-11-13: "which screens are used, where people drop off, no personal
// data"). Each day this device keeps a short list of keys — screens opened (`v:me`), things done (`ev:page`), how
// many days since it was installed (`age:7-13`), the platform and language, and on its first day the same keys
// again under `d0:` (the first-day funnel). Each key is sent once a day, as one of a list of words: no install id,
// no account, no time of day, no address, nothing typed. The server only adds 1 to that day's count of each key
// (supabase/migrations/20261113400000_usage_counts.sql), so the owner sees "1,240 phones opened Learn on 12 Nov",
// never who. Off in the Kids space, in development, and when Me → ⚙ → App → Anonymous usage counts is off.
import { SUPABASE_KEY, SUPABASE_URL } from './cloud/config';

const KEY = 'usage';
const OFF = 'usageOff';
const KEEP = 4; // days a list waits to be sent (offline)

interface Day { k: string[]; s: string[] } // keys seen, keys sent
interface State { since: string; days: Record<string, Day> }

const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const usageOn = (): boolean => { try { return localStorage.getItem(OFF) !== '1'; } catch { return false; } };
export function setUsageOn(on: boolean) {
  try {
    if (on) localStorage.removeItem(OFF);
    else { localStorage.setItem(OFF, '1'); localStorage.removeItem(KEY); }
  } catch { /* storage blocked */ }
}

const kids = () => { try { return localStorage.getItem('kidsOn') === 'true'; } catch { return true; } };
const live = () => !import.meta.env.DEV && usageOn() && !kids();

let state: State | null = null;
function load(): State {
  if (state) return state;
  try { state = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null; } catch { state = null; }
  if (!state || typeof state.since !== 'string' || typeof state.days !== 'object') state = { since: dayOf(), days: {} };
  return state;
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* full */ } };

function ageKey(since: string, day: string): string {
  const n = Math.round((Date.parse(day) - Date.parse(since)) / 864e5);
  return `age:${n <= 0 ? '0' : n === 1 ? '1' : n < 7 ? '2-6' : n < 14 ? '7-13' : n < 30 ? '14-29' : n < 90 ? '30-89' : '90+'}`;
}

/** Note that something happened today (`v:…` a screen, `ev:…` an action). Cheap: a list in localStorage. */
export function mark(key: string) {
  if (!live() || !/^(v|ev):[a-z0-9-]{1,30}$/.test(key)) return;
  const s = load();
  const d = dayOf();
  let day = s.days[d];
  if (!day) {
    day = s.days[d] = { k: [], s: [] };
    const native = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
    const lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    day.k.push(ageKey(s.since, d), `p:${native ? 'android' : 'web'}`, `l:${/^[a-z]{2}$/.test(lang) ? lang : 'xx'}`);
  }
  const add = (k: string) => { if (!day!.k.includes(k)) { day!.k.push(k); dirty = true; } };
  add(key);
  if (d === s.since) add(`d0:${key}`);
  if (dirty) { save(); schedule(); }
}

/** The screen a route shows, in a few words (`#/learn/67` → `v:learn-lesson`). */
export function markRoute(hash: string) {
  const [v = '', a = ''] = hash.replace(/^#\/?/, '').split('/');
  const name = v === 's' ? 'read'
    : v === 'reel' ? 'studio'
    : v === 'learn' ? (!a ? 'learn' : a === 'garden' ? 'learn-garden' : a === 'pages' ? 'learn-pages' : a === 'page' ? 'learn-page' : a === 'tree' ? 'learn-tree' : 'learn-lesson')
    : v === 'me' ? (!a ? 'me' : a === 'settings' ? 'me-settings' : /^(room|prayer|stats|library|widgets)$/.test(a) ? `me-${a}` : 'me')
    : v === 'ranks' ? 'ranks' : /^(rb|rc|bp|rf)$/.test(v) ? 'ranks-invite'
    : v === '' ? 'surahs' : /^(search|drafts|season|relight|kids)$/.test(v) ? v : 'other';
  mark(`v:${name}`);
}

let dirty = false;
let timer = 0;
function schedule() {
  if (timer) return;
  timer = window.setTimeout(() => { timer = 0; void send(false); }, 60_000);
}

/** Sends what is not sent yet (today's new keys and any days kept while offline). */
async function send(leaving: boolean) {
  if (!live() || !state || !dirty && !leaving) return;
  dirty = false;
  const today = dayOf();
  for (const [d, day] of Object.entries(state.days)) {
    if (Date.parse(today) - Date.parse(d) > KEEP * 864e5) { delete state.days[d]; continue; }
    const keys = day.k.filter((k) => !day.s.includes(k)).slice(0, 100);
    if (!keys.length) continue;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/usage_add`, {
        method: 'POST', keepalive: leaving,
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ d, keys }),
      });
      if (r.ok || r.status === 400) day.s.push(...keys); // 400: a day the server no longer takes
      else dirty = true;
    } catch { dirty = true; break; } // offline: next time
  }
  // Only today's list is still needed once it is sent.
  for (const d of Object.keys(state.days)) if (d !== today && state.days[d].k.every((k) => state!.days[d].s.includes(k))) delete state.days[d];
  save();
}

/** Starts sending: a minute after a change, and when the app is left. */
export function initUsage() {
  if (!live()) return;
  load();
  dirty = Object.values(state!.days).some((d) => d.k.some((k) => !d.s.includes(k)));
  try { if (Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))) mark('ev:signed-in'); } catch { /* blocked */ }
  if (dirty) schedule();
  document.addEventListener('visibilitychange', () => { if (document.hidden) void send(true); });
}
