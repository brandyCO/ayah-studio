// Everything else the app keeps on the device follows the account too (owner request 2026-11-11:
// "every piece of data"). The Me tab's journey, the garden (Learn trees), goals, bookmarks, the synced
// preferences, drafts and reflections have their own documents with their own merging (cloud/sync.ts);
// every other localStorage key is mirrored here as one `user_docs` row `state/kv:{key}` = { v, at }:
// the stored text and when it last changed on a device. Nothing has to register: a new key syncs by
// itself unless it is listed below as belonging to this device (caches, downloads, the install's id).
//
// Merging never drops either side's progress:
// - Both sides changed it at the same time, or never since they were linked (both `at` 0: data from
//   before syncing), or the key is progress (UNION): the two are merged — objects key by key, lists
//   joined, numbers the larger, a record with `at` (or a `day`) the newer one.
// - Otherwise the newer change wins (a setting changed, a list cleared, a style deleted).
// Locations (prayer times, the Ramadan reminder) stay on the device (privacy page).

import { SYNCED_PREFS } from '../ui/prefs';

/** This device's own: caches, downloads, scheduling state, its install id, and the Kids space
 *  (nothing about a child leaves the device: docs/kids.md). */
const DEVICE = new Set([
  'deviceId', 'syncMeta', 'kvMeta', 'journeyOthers', 'remoteConfig', 'perfLog', 'fpsLog', 'liteMode', 'warmedUp',
  'lastPage', 'listenKept', 'favKept', 'kidsKept', 'favAnyNet', 'stockPages', 'popular', 'rankCache', 'circles',
  'mushafKept', 'mushafOk', 'mushafAsked', 'qcfDropped', 'reportQueue', 'rankFigureSent', 'rankRoomSent', 'rankSent', 'rankShowSent', 'rankXp',
  'asrToday', 'prayerLocAt', 'exportQuality', 'pactMark', 'vitals', 'rankProfiles',
  // Synced by their own documents (cloud/sync.ts).
  'prefsAt', 'draftsDeleted', 'bookmarks', 'journey', 'readLog', 'garden', 'goals', ...SYNCED_PREFS,
]);
const DEVICE_PREFIX = ['sb-', 'flag:', 'kids', 'debug'];
/** Progress: always merged, so two devices used the same day both keep what they did. */
const UNION = new Set([
  'pageStrength', 'learnWeak', 'learnPageTasmi', 'learnSimilar', 'adhkarProgress', 'ramadan', 'goalTips',
  'rkCheerSeen', 'nudgeFreeze',
]);
/** Fields kept on the device only (a location): left out of what is sent, kept as they are here. */
const LOCAL_FIELDS: Record<string, (o: Record<string, unknown>) => Record<string, unknown>> = {
  prayer: (o) => ({ lat: o.lat ?? null, lng: o.lng ?? null }),
  'ramadan-settings': (o) => { const r = isObj(o.reminder) ? o.reminder : {}; return { reminder: { lat: r.lat ?? null, lng: r.lng ?? null } }; },
};
const STRIP: Record<string, (o: Record<string, unknown>) => Record<string, unknown>> = {
  prayer: ({ lat: _a, lng: _b, ...rest }) => rest,
  'ramadan-settings': (o) => {
    if (!isObj(o.reminder)) return o;
    const { lat: _a, lng: _b, ...rem } = o.reminder;
    return { ...o, reminder: rem };
  },
};
/** `over` laid onto `base`, nested objects field by field. */
function overlay(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? overlay(base[k] as Record<string, unknown>, v) : v;
  return out;
}
/** The value as sent: without its device-only fields. */
function outgoing(k: string, v: string | null): string | null {
  if (v === null || !STRIP[k]) return v;
  const o = parse(v);
  return isObj(o) ? JSON.stringify(STRIP[k](o)) : v;
}
/** Larger values (a logo picture, say) are left on the device rather than refused by the server. */
const MAX_LEN = 300_000;

export const kvSynced = (k: string) =>
  k.length <= 61 && !DEVICE.has(k) && !DEVICE_PREFIX.some((p) => k.startsWith(p));

// --- what changed here, and when ---
/** h: fingerprint of the value · at: when it last changed here (0 = before syncing) · l: already merged
 *  with the account's (sent or received), so from now on the newer change wins. */
interface KvMeta { [key: string]: { h: string; at: number; l?: 1 } }
const META = 'kvMeta';
function loadMeta(): KvMeta {
  try { const v = JSON.parse(localStorage.getItem(META) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveMeta(m: KvMeta) { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* full */ } }
/** A short fingerprint of a stored value (FNV-1a), so the meta stays small. */
export function hash(s: string | null): string {
  if (s === null) return '-';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}.${s.length}`;
}
const keys = (): string[] => { try { return Object.keys(localStorage); } catch { return []; } };
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

// Keys written since the last full look, so the minute check reads only those (not every value stored).
const touched = new Set<string>();
let everything = true; // nothing looked at yet, or the storage was cleared
try {
  const proto = Storage.prototype;
  const { setItem, removeItem, clear } = proto;
  const mark = (s: Storage, k: unknown) => { try { if (s === localStorage) touched.add(String(k)); } catch { /* no storage */ } };
  proto.setItem = function (this: Storage, k: string, v: string) { mark(this, k); return setItem.call(this, k, v); };
  proto.removeItem = function (this: Storage, k: string) { mark(this, k); return removeItem.call(this, k); };
  proto.clear = function (this: Storage) { try { if (this === localStorage) everything = true; } catch { /* ignore */ } return clear.call(this); };
  // Another tab of the app wrote it.
  window.addEventListener('storage', (e) => { if (e.key === null) everything = true; else touched.add(e.key); });
} catch { everything = true; }

/** Notes every key that changed since the last look (its time = now). A key seen for the first time
 *  gets time 0: it holds data from before syncing, which is merged with the account's, never replaced.
 *  `quick`: only the keys written since the last look (the once-a-minute check, leaving the app). */
export function scanKv(now = Date.now(), quick = false): boolean {
  const m = loadMeta();
  let dirty = false, changed = false;
  if (quick && !everything) {
    if (!touched.size) return false;
    for (const k of touched) {
      if (!kvSynced(k)) continue;
      const v = get(k);
      if (v === null && !m[k]) continue;
      const h = hash(v);
      if (!m[k]) { m[k] = { h, at: 0 }; dirty = true; } else if (m[k].h !== h) { m[k] = { ...m[k], h, at: now }; dirty = changed = true; }
    }
    touched.clear();
    if (dirty) saveMeta(m);
    return changed;
  }
  everything = false;
  touched.clear();
  const seen = new Set<string>();
  for (const k of keys()) {
    if (!kvSynced(k)) continue;
    seen.add(k);
    const h = hash(get(k));
    if (!m[k]) { m[k] = { h, at: 0 }; dirty = true; } else if (m[k].h !== h) { m[k] = { ...m[k], h, at: now }; dirty = changed = true; }
  }
  for (const k of Object.keys(m)) {
    if (seen.has(k) || !kvSynced(k)) continue;
    if (m[k].h !== '-') { m[k] = { ...m[k], h: '-', at: now }; dirty = changed = true; } // removed here
  }
  if (dirty) saveMeta(m);
  return changed;
}

const parse = (s: string | null): unknown => { if (s === null) return null; try { return JSON.parse(s); } catch { return undefined; } };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const sorted = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sorted) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x;
/** JSON with object keys in order, so equal values compare equal on every device. */
const stable = (x: unknown) => JSON.stringify(sorted(x));

/** Two versions of one value merged so that neither loses anything. Deterministic both ways round
 *  (merge(a, b) equals merge(b, a)), so two devices end up with the same value. */
export function mergeValues(a: unknown, b: unknown): unknown {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    // The same order on both devices: the "larger" side's items first.
    const [x, y] = stable(a) >= stable(b) ? [a, b] : [b, a];
    const out: unknown[] = [];
    const seen = new Set<string>();
    for (const it of [...x, ...y]) { const s = stable(it); if (!seen.has(s)) { seen.add(s); out.push(it); } }
    return out;
  }
  if (isObj(a) && isObj(b)) {
    // A dated record (`at`) or a day's record (`day`): the newer one, not a mix of two days.
    if (typeof a.at === 'number' && typeof b.at === 'number' && a.at !== b.at) return a.at > b.at ? a : b;
    if (a.day !== undefined && b.day !== undefined && a.day !== b.day && typeof a.day === typeof b.day) return String(a.day) > String(b.day) ? a : b;
    const out: Record<string, unknown> = {};
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) out[k] = mergeValues(a[k], b[k]);
    return out;
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return a || b;
  return stable(a) >= stable(b) ? a : b;
}

/** This device's documents: [key, { v, at }, fingerprint, removed]. */
export function kvRecords(): { key: string; data: { v: string | null; at: number }; print: string; deleted: boolean }[] {
  const m = loadMeta();
  const out: { key: string; data: { v: string | null; at: number }; print: string; deleted: boolean }[] = [];
  for (const [k, { h, at }] of Object.entries(m)) {
    if (!kvSynced(k)) continue;
    const v = outgoing(k, get(k));
    if (v !== null && JSON.stringify(v).length > MAX_LEN) continue; // as sent (escaped)
    if (v === null && h !== '-') continue;
    out.push({ key: k, data: { v, at }, print: `${hash(v)}@${at}`, deleted: v === null });
  }
  return out;
}

/** Another device's version of a key. `print` = the fingerprint of what the server holds when this
 *  device now has exactly that (nothing to send back); without it the merged value is sent this round. */
export function mergeKv(key: string, data: unknown, deleted: boolean): { print?: string; changed: boolean } {
  if (!kvSynced(key) || !isObj(data)) return { changed: false };
  const rAt = Number(data.at) || 0;
  const rv = deleted || typeof data.v !== 'string' ? null : data.v;
  const remotePrint = `${hash(rv)}@${rAt}`;
  const m = loadMeta();
  const local = get(key);
  const known = !!m[key];
  const lAt = m[key]?.at ?? 0;
  // What this device held before it was linked to the account is merged, never replaced or removed.
  const merge = UNION.has(key) || !m[key]?.l || rAt === lAt;
  let next: string | null;
  if (rv === null) {
    if (local === null) { if (m[key]) { m[key].l = 1; saveMeta(m); } return { print: remotePrint, changed: false }; }
    if (merge || rAt <= lAt) return { changed: false }; // kept, and sent again
    next = null;
  } else if (local === null) {
    if (known && lAt > rAt && m[key].h === '-') return { changed: false }; // removed here after that change
    next = rv;
  } else if (merge) {
    const a = parse(local), b = parse(rv);
    if (a === undefined || b === undefined) next = rAt !== lAt ? (rAt > lAt ? rv : local) : (local >= rv ? local : rv);
    else {
      let merged = mergeValues(b, a);
      if (isObj(merged) && isObj(a) && LOCAL_FIELDS[key]) merged = overlay(merged, LOCAL_FIELDS[key](a));
      next = stable(merged) === stable(a) ? local : JSON.stringify(merged);
    }
  } else if (rAt > lAt) {
    next = rv;
    const a = parse(local), b = parse(rv);
    if (LOCAL_FIELDS[key] && isObj(a) && isObj(b)) next = JSON.stringify(overlay(b, LOCAL_FIELDS[key](a)));
  } else return { changed: false }; // ours is newer: sent this round

  const changed = next !== local;
  try {
    if (next === null) localStorage.removeItem(key);
    else if (changed) localStorage.setItem(key, next);
  } catch { return { changed: false }; }
  const same = stable(parse(outgoing(key, next))) === stable(parse(rv)) || outgoing(key, next) === rv;
  // Holding what the server holds: its time. A merge that differs is newer than both (sent back).
  m[key] = { h: hash(next), at: same ? Math.max(rAt, lAt) : Math.max(rAt, lAt, Date.now()), l: 1 };
  saveMeta(m);
  return { print: same ? `${hash(outgoing(key, next))}@${m[key].at}` : undefined, changed };
}

/** These keys are on the server now: later changes from other devices replace them by time. */
export function linkKv(keys: string[]) {
  if (!keys.length) return;
  const m = loadMeta();
  for (const k of keys) if (m[k]) m[k].l = 1;
  saveMeta(m);
}

/** Forget the account's merge history (another account signs in on this device). */
export function resetKv() { try { localStorage.removeItem(META); } catch { /* ignore */ } }
