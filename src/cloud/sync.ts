// Sync between a signed-in user's devices (docs/together.md T0). Local first: everything lives on the
// device as before; when signed in, this mirrors it to Supabase `user_docs` and merges what other
// devices wrote. Synced: bookmarks and settings (one document each, merged per entry: the newest
// change wins) and reel drafts (one document each, the most recently edited version wins; deletions
// travel as tombstones) and reflections (one document per ayah's note, merged per paragraph: the
// newest edit wins) and revision lamps (one document, merged per page). Thumbnails and own media never leave the device.
import { bookmarkRecords, mergeBookmarks } from '../data/bookmarks';
import { deleteDraft, deletedDrafts, getDraft, listDrafts, saveDraft } from '../data/drafts';
import { loadReflections, mergeReflection, reflectionRecords } from '../data/reflections';
import { lampRecords, mergeLamps } from '../data/lamps';
import type { Project } from '../engine/project';
import { mergePrefs, prefRecords } from '../ui/prefs';
import { account, onAccount } from './auth';
import { supabase } from './supabase';

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
function deviceId(): string {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = crypto.randomUUID().slice(0, 18);
      localStorage.setItem('deviceId', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

// --- merging what other devices wrote ---
async function applyRemote(rows: Row[], meta: Meta) {
  await loadReflections();
  for (const r of rows) {
    const key = `${r.kind}/${r.id}`;
    if (r.kind === 'state' && r.id === 'bookmarks') {
      mergeBookmarks(Array.isArray(r.data.items) ? r.data.items : []);
    } else if (r.kind === 'setting' && r.id === 'prefs') {
      if (mergePrefs(r.data.prefs)) window.dispatchEvent(new Event('prefs-synced'));
    } else if (r.kind === 'lamp' && r.id === 'pages') {
      mergeLamps(r.data.pages); // merged per page; the result is pushed back on this round
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
  }
}

// --- this device's documents ---
async function localRows(user: string): Promise<{ key: string; print: string; row: Row }[]> {
  const dev = deviceId();
  const out: { key: string; print: string; row: Row }[] = [];
  const add = (kind: Kind, id: string, data: Record<string, unknown>, print: string, deleted = false) =>
    out.push({ key: `${kind}/${id}`, print, row: { user_id: user, kind, id, data, deleted, device_id: dev } });

  const items = bookmarkRecords();
  add('state', 'bookmarks', { items }, JSON.stringify(items));
  const prefs = prefRecords();
  add('setting', 'prefs', { prefs }, JSON.stringify(prefs));
  const pages = lampRecords();
  if (Object.keys(pages).length) add('lamp', 'pages', { pages }, JSON.stringify(pages));
  await loadReflections();
  for (const r of reflectionRecords()) {
    const data = { s: r.s, a: r.a, entries: r.entries };
    add('reflection', r.id, data, JSON.stringify(r.entries), r.entries.every((e) => e.deleted));
  }
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
  try {
    const sb = await supabase();
    const meta = loadMeta(acc.id);

    // Pull everything changed since the last sync (all of it the first time).
    for (;;) {
      // Only other devices' writes: this device's own are already here.
      let q = sb.from('user_docs').select('kind,id,data,deleted,updated_at').neq('device_id', deviceId()).order('updated_at').limit(500);
      if (meta.pulled) q = q.gt('updated_at', meta.pulled);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      await applyRemote(rows, meta);
      if (rows.length) meta.pulled = rows[rows.length - 1].updated_at ?? meta.pulled;
      saveMeta(meta);
      if (rows.length < 500) break;
    }

    // Push what changed here since it was last pushed (merged state included).
    const changed = (await localRows(acc.id)).filter((d) => meta.pushed[d.key] !== d.print);
    for (let i = 0; i < changed.length; i += 50) {
      const batch = changed.slice(i, i + 50);
      const { error } = await sb.from('user_docs').upsert(batch.map((d) => d.row), { onConflict: 'user_id,kind,id' });
      if (error) throw error;
      for (const d of batch) meta.pushed[d.key] = d.print;
      saveMeta(meta);
    }
    setStatus({ state: 'ok', at: Date.now() });
  } catch (e) {
    console.warn('Sync failed', e);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) });
  }
}

// --- when to sync ---
let timer = 0;
const soon = (ms = 4000) => {
  if (!account()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), ms);
};

let started = false;
/** Starts syncing whenever an account is signed in (call once at startup). */
export function startSync() {
  if (started) return;
  started = true;
  onAccount((a) => {
    if (a) void syncNow();
    else setStatus({ state: 'off', at: null });
  });
  for (const ev of ['bookmarks-changed', 'prefs-changed', 'drafts-changed', 'reflections-changed', 'lamps-changed']) window.addEventListener(ev, () => soon());
  window.addEventListener('online', () => soon(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon(500);
  });
}
