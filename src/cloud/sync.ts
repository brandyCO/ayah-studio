// Sync between a signed-in user's devices (docs/together.md T0). Local first: everything lives on the
// device as before; when signed in, this mirrors it to Supabase `user_docs` and merges what other
// devices wrote. Settings: one document per preference (`pref:{key}`, newest change wins) plus the
// older all-in-one `prefs` document for older app versions. Synced: the Me tab (each device's journey — streak days, counts, badges, reading
// log — as its own document, read combined; goals: the newest set wins), bookmarks and settings (one document each, merged per entry: the newest
// change wins) and reel drafts (one document each, the most recently edited version wins; deletions
// travel as tombstones), the Learn gardens (one document: trees, decorations, purchases) and reflections (one document per ayah's note, merged per paragraph: the
// newest edit wins). Everything else kept on the device follows too (cloud/kv.ts: one document per stored key,
// merged so that neither device loses anything). Thumbnails, own media, voice recordings, downloads, caches
// and the Kids space never leave the device.
import { clearOtherJourneys } from '../data/journey';
import { account, onAccount } from './auth';
import { supabase } from './supabase';
import { installId, jitter, remoteConfig } from '../net';
// Loaded with the first round (keeps it out of the first load).
// The merging and the documents (syncDocs.ts, with kv.ts) come with the first round, out of the first load.
let docs: typeof import('./syncDocs') | null = null;
let kvMod: typeof import('./kv') | null = null;
const loadDocs = async () => { docs ??= await import('./syncDocs'); kvMod = docs.kv; return docs; };

export type Kind = 'draft' | 'bookmark' | 'state' | 'setting' | 'reflection' | 'lamp';
export interface Row {
  user_id: string;
  kind: Kind;
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  device_id: string;
  updated_at?: string;
}

export interface SyncStatus {
  state: 'off' | 'syncing' | 'ok' | 'error' | 'offline';
  at: number | null; // last successful sync (ms)
  error?: string;
  /** This account's data has not reached this device yet (signed in on a new phone): screens say
   *  "Bringing your progress…" rather than show an empty streak. */
  first?: boolean;
}
let status: SyncStatus = { state: 'off', at: null };
const statusListeners = new Set<(s: SyncStatus) => void>();
export const syncStatus = () => status;
export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}
function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s };
  for (const fn of statusListeners) fn(status);
}

// --- per-account sync memory on this device ---
export interface Meta {
  user: string;
  pulled: string | null; // newest server updated_at merged
  pushed: Record<string, string>; // doc key → fingerprint of what was last pushed
  synced?: 1; // everything on the server has been pulled here once
}
const META_KEY = 'syncMeta';
function loadMeta(user: string): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Meta | null;
    if (m && m.user === user && typeof m.pushed === 'object') return m;
    // Another account signed in here before: its other devices' streaks are not this account's.
    if (m && m.user && m.user !== user) { clearOtherJourneys(); try { localStorage.removeItem('kvMeta'); } catch { /* ignore */ } }
  } catch {
    /* fresh */
  }
  return { user, pulled: null, pushed: {} };
}
/** A round has finished here for this account (rounds before `synced` existed left pulled / pushed). */
const synced = (m: Meta) => !!(m.synced || m.pulled || Object.keys(m.pushed).length);
/** Signed in, and this account's data has not reached this phone yet. */
export function firstSyncPending(): boolean {
  const acc = account();
  return !!acc && !synced(loadMeta(acc.id));
}
function saveMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
const deviceId = installId;

/** Values that arrived from another device: every screen that shows them repaints. */
function announceKv() {
  quiet = true;
  try {
    for (const ev of ['kv-synced', 'prefs-synced', 'journey-changed', 'garden-changed', 'pages-changed', 'room-look', 'ramadan-changed', 'bookmarks-changed']) window.dispatchEvent(new Event(ev));
  } finally { quiet = false; }
}
let quiet = false; // set while announcing what arrived, so it does not start another round

// --- one sync round: pull, merge, push ---
let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = round().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

async function round() {
  const acc = account();
  if (!acc) return setStatus({ state: 'off', first: false });
  const first = !synced(loadMeta(acc.id));
  if (!navigator.onLine) return setStatus({ state: 'offline', first });
  setStatus({ state: 'syncing', error: undefined, first });
  lastRound = Date.now();
  let arrived = false;
  const wasSynced = !first;
  try {
    const sb = await supabase();
    const { applyRemote, localRows, kv: { linkKv, scanKv } } = await loadDocs();
    const meta = loadMeta(acc.id);
    scanKv(); // what changed here since the last round, before anything arrives
    let kvChanged = false;

    // Pull everything changed since the last sync (all of it the first time).
    for (;;) {
      // Only other devices' writes: this device's own are already here.
      let q = sb.from('user_docs').select('kind,id,data,deleted,updated_at').neq('device_id', deviceId()).order('updated_at').limit(500);
      if (meta.pulled) q = q.gt('updated_at', meta.pulled);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      // Progress from another phone (not this phone's first pull, which shows as "Bringing your progress…").
      if (wasSynced && rows.some((r) => r.kind === 'state' && (r.id.startsWith('journey:') || r.id.startsWith('jm:') || r.id === 'garden'))) arrived = true;
      if (await applyRemote(rows, meta)) kvChanged = true;
      if (rows.length) meta.pulled = rows[rows.length - 1].updated_at ?? meta.pulled;
      saveMeta(meta);
      if (rows.length < 500) break;
    }
    if (!meta.synced) { meta.synced = 1; saveMeta(meta); }

    if (kvChanged) announceKv();

    // Push what changed here since it was last pushed (merged state included).
    // Fingerprints, not whole documents, are kept in the meta (a journey was ~100 KB rewritten each round).
    const fp = (s: string) => (s.length > 64 ? kvMod!.hash(s) : s);
    const changed: { key: string; print: string; row: Row }[] = [];
    for (const d of await localRows(acc.id, meta)) {
      const print = fp(d.print);
      if (meta.pushed[d.key] === print) continue;
      // Pushed by an earlier version, which kept the whole document: the same, now kept as a fingerprint.
      if (meta.pushed[d.key] === d.print) { meta.pushed[d.key] = print; continue; }
      changed.push({ ...d, print });
    }
    const refused: string[] = [];
    for (let i = 0; i < changed.length; i += 50) {
      const batch = changed.slice(i, i + 50);
      const { error } = await sb.from('user_docs').upsert(batch.map((d) => d.row), { onConflict: 'user_id,kind,id' });
      if (error) {
        if (!navigator.onLine) throw error;
        // One document the server refuses (too large, say) must not hold back the others: send them one by one.
        for (const d of batch) {
          const one = await sb.from('user_docs').upsert([d.row], { onConflict: 'user_id,kind,id' });
          if (one.error) { refused.push(d.key); console.warn('Sync: not saved', d.key, one.error.message); continue; }
          meta.pushed[d.key] = d.print;
          if (d.key.startsWith('state/kv:')) linkKv([d.key.slice(9)]);
        }
      } else {
        for (const d of batch) meta.pushed[d.key] = d.print;
        linkKv(batch.filter((d) => d.key.startsWith('state/kv:')).map((d) => d.key.slice(9)));
      }
      saveMeta(meta);
    }
    if (refused.length) setStatus({ state: 'error', at: Date.now(), error: `${refused.length} item(s) could not be saved: ${refused.slice(0, 3).join(', ')}` });
    else setStatus({ state: 'ok', at: Date.now(), first: false });
    failures = 0;
    if (arrived) window.dispatchEvent(new Event('sync-arrived'));
  } catch (e) {
    console.warn('Sync failed', e);
    // Wait longer after each failure (30 s → 15 min, spread randomly), so a server that comes back
    // after an outage is not met by every phone at once.
    if (navigator.onLine) {
      failures++;
      soon(0);
    }
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) });
  }
}

// --- when to sync ---
let timer = 0;
let lastRound = 0;
let failures = 0;
let pending = false; // a round is waiting on its timer
const backoff = () => (failures ? jitter(Math.min(15 * 60e3, 30e3 * 2 ** (failures - 1))) : 0);
const soon = (ms = 4000) => {
  if (!account()) return;
  clearTimeout(timer);
  pending = true;
  timer = window.setTimeout(() => { pending = false; void syncNow(); }, Math.max(ms, backoff()));
};
/** Leaving the app: send what is waiting now. A hidden app's timers stop (Android), so a streak lit or
 *  a reward claimed just before leaving would otherwise reach the other devices only at the next open.
 *  This is the round that was already due, only sooner (none after a failure: the back-off holds). */
const onHide = () => {
  if (account() && !failures && kvMod?.scanKv(Date.now(), true)) pending = true; // something else changed here (a lesson, a setting…)
  if (!pending || failures) return;
  clearTimeout(timer);
  pending = false;
  void syncNow();
};
/** Back in the app or online again: a round, but not more often than the remote setting allows
 *  (a minute by default), a few random seconds later so phones don't arrive together. */
const onReturn = () => void remoteConfig().then((c) => {
  if (Date.now() - lastRound >= c.syncMinutes * 60e3) soon(jitter(3000));
});

/** A screen showing progress opened: fetch what the other phones did, unless a round ran in the last 30 s. */
export function freshen() {
  if (!account() || failures || running || Date.now() - lastRound < 30e3) return;
  soon(jitter(400));
}

let started = false;
/** Starts syncing whenever an account is signed in (call once at startup). */
export function startSync() {
  if (started) return;
  started = true;
  onAccount((a) => {
    if (a) void syncNow();
    else setStatus({ state: 'off', at: null });
  });
  for (const ev of ['bookmarks-changed', 'reflections-changed', 'garden-changed', 'pages-changed', 'room-look', 'ramadan-changed']) window.addEventListener(ev, () => { if (!quiet) soon(); });
  // The Me tab (streak, goals, counts) changes often while counting dhikr: sync once it rests.
  for (const ev of ['journey-changed', 'readlog-changed']) window.addEventListener(ev, () => { if (!quiet) soon(20_000); });
  // The reel look is remembered at every studio edit, like the draft below.
  window.addEventListener('prefs-changed', (e) => quiet || soon((e as CustomEvent).detail === 'reelLook' ? 20_000 : 4000));
  // The studio saves its draft ~1 s after every edit: sync once the editing has rested a while,
  // not a pull + push round after each pause (leaving the studio still syncs within 20 s).
  window.addEventListener('drafts-changed', () => soon(20_000));
  window.addEventListener('online', onReturn);
  // Anything else saved on the device (a lesson, a setting, an icon picked…): looked for once a minute while
  // the app is open, so it reaches the other devices without waiting for the app to be left.
  // The other phones' changes: looked for every 2 minutes while the app is open (one small read when
  // nothing changed), and when a screen showing progress opens (freshen()).
  window.setInterval(() => {
    if (document.visibilityState !== 'visible' || pending || failures || !account()) return;
    if (kvMod?.scanKv(Date.now(), true) || Date.now() - lastRound >= 2 * 60e3) soon(jitter(3000));
  }, 60e3);
  window.addEventListener('hashchange', () => { if (/^#\/(me|learn|ranks)(\/|$)/.test(location.hash)) freshen(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onReturn();
    else onHide();
  });
}
