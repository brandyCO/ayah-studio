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
import { bookmarkRecords, mergeBookmarks } from '../data/bookmarks';
import { deleteDraft, deletedDrafts, getDraft, listDrafts, saveDraft } from '../data/drafts';
import { loadReflections, mergeReflection, reflectionRecords } from '../data/reflections';
import { clearOtherJourneys, journeyRecord, mergeJourney } from '../data/journey';
import { goalsRecord, mergeGoals } from '../data/goals';
import type { Project } from '../engine/project';
import { mergePrefs, prefRecords, prefsBehind } from '../ui/prefs';
import { account, onAccount } from './auth';
import { supabase } from './supabase';
import { installId, jitter, remoteConfig } from '../net';
// Loaded with the first round (keeps it out of the first load).
let kvMod: typeof import('./kv') | null = null;
const loadKv = async () => (kvMod ??= await import('./kv'));

type Kind = 'draft' | 'bookmark' | 'state' | 'setting' | 'reflection' | 'lamp';
interface Row {
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
interface Meta {
  user: string;
  pulled: string | null; // newest server updated_at merged
  pushed: Record<string, string>; // doc key → fingerprint of what was last pushed
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
function saveMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
const deviceId = installId;

// --- merging what other devices wrote ---
async function applyRemote(rows: Row[], meta: Meta): Promise<boolean> {
  await loadReflections();
  let prefsChanged = false, kvChanged = false;
  for (const r of rows) {
    const key = `${r.kind}/${r.id}`;
    // One row that cannot be merged (an older or newer app's shape) must never stop the rest syncing.
    try {
    if (r.kind === 'state' && r.id.startsWith('kv:')) {
      const res = kvMod!.mergeKv(r.id.slice(3), r.data, r.deleted);
      if (res.print) meta.pushed[key] = res.print; // already on the server: don't send it back
      if (res.changed) kvChanged = true;
    } else if (r.kind === 'state' && r.id === 'bookmarks') {
      mergeBookmarks(Array.isArray(r.data.items) ? r.data.items : []);
    } else if (r.kind === 'setting' && r.id === 'prefs') {
      // The older all-in-one document (still written, for older app versions).
      if (mergePrefs(r.data.prefs)) prefsChanged = true;
      if (prefsBehind(r.data.prefs)) delete meta.pushed[key]; // it lacks a newer choice made here: send it again
    } else if (r.kind === 'setting' && r.id.startsWith('pref:')) {
      // One document per preference, so a device writing its reading place cannot put back an old theme.
      const k = r.id.slice(5);
      if (mergePrefs({ [k]: r.data })) prefsChanged = true;
      if (prefsBehind({ [k]: r.data }, [k])) delete meta.pushed[key];
      else meta.pushed[key] = String(r.data.at); // already on the server: don't send it back
    } else if (r.kind === 'state' && r.id.startsWith('journey:')) {
      mergeJourney(r.data, r.id.slice(8)); // kept per device and read combined
    } else if (r.kind === 'state' && r.id === 'garden') {
      (await import('../data/garden')).mergeGarden(r.data); // per tree / decoration, newest wins; purchases add up (pushed back merged)
    } else if (r.kind === 'setting' && r.id === 'goals') {
      mergeGoals(r.data.goals);
    } else if (r.kind === 'reflection') {
      mergeReflection(r.data); // merged per paragraph; the result is pushed back on this round
    } else if (r.kind === 'draft') {
      const updated = typeof r.data.updated === 'number' ? r.data.updated : 0;
      const local = await getDraft(r.id);
      if (r.deleted) {
        if (local && local.updated <= updated) await deleteDraft(r.id);
        meta.pushed[key] = `deleted:${updated}`;
      } else if (!local || local.updated < updated) {
        const project = r.data.project as Project | undefined;
        if (!project || typeof project !== 'object') continue;
        meta.pushed[key] = String(updated); // already on the server: don't send it back
        await saveDraft({ id: r.id, project, created: Number(r.data.created) || updated, updated });
      }
    }
    } catch (e) {
      console.warn('Sync: could not merge', key, e);
    }
  }
  if (prefsChanged) {
    window.dispatchEvent(new Event('prefs-synced')); // the theme, the translation, …
    window.dispatchEvent(new Event('journey-changed')); // a journey plan or the page reading time
  }
  return kvChanged;
}
/** Values that arrived from another device: every screen that shows them repaints. */
function announceKv() {
  quiet = true;
  try {
    for (const ev of ['kv-synced', 'prefs-synced', 'journey-changed', 'garden-changed', 'pages-changed', 'room-look', 'ramadan-changed', 'bookmarks-changed']) window.dispatchEvent(new Event(ev));
  } finally { quiet = false; }
}
let quiet = false; // set while announcing what arrived, so it does not start another round

// --- this device's documents ---
const hasGarden = () => { try { return !!localStorage.getItem('garden'); } catch { return false; } };
async function localRows(user: string): Promise<{ key: string; print: string; row: Row }[]> {
  const dev = deviceId();
  const out: { key: string; print: string; row: Row }[] = [];
  const add = (kind: Kind, id: string, data: Record<string, unknown>, print: string, deleted = false) =>
    out.push({ key: `${kind}/${id}`, print, row: { user_id: user, kind, id, data, deleted, device_id: dev } });

  const items = bookmarkRecords();
  add('state', 'bookmarks', { items }, JSON.stringify(items));
  const prefs = prefRecords();
  add('setting', 'prefs', { prefs }, JSON.stringify(prefs));
  for (const [k, r] of Object.entries(prefs)) if (r.at > 0) add('setting', `pref:${k}`, r, String(r.at));
  const journey = journeyRecord();
  add('state', `journey:${dev}`, journey, JSON.stringify(journey));
  const garden = hasGarden() ? (await import('../data/garden')).gardenRecord() : null;
  if (garden) add('state', 'garden', garden as unknown as Record<string, unknown>, JSON.stringify(garden));
  const g = goalsRecord();
  if (g) add('setting', 'goals', { goals: g }, String(g.at));
  await loadReflections();
  for (const r of reflectionRecords()) {
    const data = { s: r.s, a: r.a, entries: r.entries };
    add('reflection', r.id, data, JSON.stringify(r.entries), r.entries.every((e) => e.deleted));
  }
  for (const r of (kvMod?.kvRecords() ?? [])) add('state', `kv:${r.key}`, r.data, r.print, r.deleted);
  for (const d of await listDrafts()) add('draft', d.id, { project: d.project, created: d.created, updated: d.updated }, String(d.updated));
  for (const [id, at] of Object.entries(deletedDrafts())) add('draft', id, { updated: at }, `deleted:${at}`, true);
  return out;
}

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
  if (!acc) return setStatus({ state: 'off' });
  if (!navigator.onLine) return setStatus({ state: 'offline' });
  setStatus({ state: 'syncing', error: undefined });
  lastRound = Date.now();
  try {
    const sb = await supabase();
    const { kvRecords, linkKv, mergeKv, scanKv } = await loadKv();
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
      if (await applyRemote(rows, meta)) kvChanged = true;
      if (rows.length) meta.pulled = rows[rows.length - 1].updated_at ?? meta.pulled;
      saveMeta(meta);
      if (rows.length < 500) break;
    }

    if (kvChanged) announceKv();

    // Push what changed here since it was last pushed (merged state included).
    const changed = (await localRows(acc.id)).filter((d) => meta.pushed[d.key] !== d.print);
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
    else setStatus({ state: 'ok', at: Date.now() });
    failures = 0;
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
  if (account() && !failures && kvMod?.scanKv()) pending = true; // something else changed here (a lesson, a setting…)
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
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !pending && !failures && account() && kvMod?.scanKv()) soon();
  }, 60e3);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onReturn();
    else onHide();
  });
}
