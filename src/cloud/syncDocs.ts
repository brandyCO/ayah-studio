// What a sync round sends and how it merges what arrives (cloud/sync.ts runs the rounds). Loaded with the
// first round, like kv.ts, so none of it is in the first load.
import { bookmarkRecords, mergeBookmarks } from '../data/bookmarks';
import { deleteDraft, deletedDrafts, getDraft, listDrafts, saveDraft } from '../data/drafts';
import { loadReflections, mergeReflection, reflectionRecords } from '../data/reflections';
import { journeyRecord, mergeJourney, otherJourney } from '../data/journey';
import { dayKey } from '../data/readLog';
import { goalsRecord, mergeGoals } from '../data/goals';
import type { Project } from '../engine/project';
import { mergePrefs, prefRecords, prefsBehind } from '../ui/prefs';
import { installId as deviceId } from '../net';
import * as kv from './kv';
import type { Kind, Meta, Row } from './sync';
export { kv };

// --- merging what other devices wrote ---
export async function applyRemote(rows: Row[], meta: Meta): Promise<boolean> {
  await loadReflections();
  let prefsChanged = false, kvChanged = false;
  for (const r of rows) {
    const key = `${r.kind}/${r.id}`;
    // One row that cannot be merged (an older or newer app's shape) must never stop the rest syncing.
    try {
    if (r.kind === 'state' && r.id.startsWith('kv:')) {
      const res = kv.mergeKv(r.id.slice(3), r.data, r.deleted);
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
    } else if (r.kind === 'state' && r.id.startsWith('jm:')) {
      // A part of another device's journey: a month's days or its page times ('jm:{device}:{part}').
      const rest = r.id.slice(3), i = rest.lastIndexOf(':');
      mergeJourneyPart(rest.slice(0, i), rest.slice(i + 1), r.data, r.deleted);
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

// --- this device's documents ---
const hasGarden = () => { try { return !!localStorage.getItem('garden'); } catch { return false; } };
export async function localRows(user: string, meta: Meta): Promise<{ key: string; print: string; row: Row }[]> {
  const dev = deviceId();
  const out: { key: string; print: string; row: Row }[] = [];
  const add = (kind: Kind, id: string, data: Record<string, unknown>, print: string, deleted = false) =>
    out.push({ key: `${kind}/${id}`, print, row: { user_id: user, kind, id, data, deleted, device_id: dev } });

  const items = bookmarkRecords();
  add('state', 'bookmarks', { items }, JSON.stringify(items));
  const prefs = prefRecords();
  add('setting', 'prefs', { prefs }, JSON.stringify(prefs));
  for (const [k, r] of Object.entries(prefs)) if (r.at > 0) add('setting', `pref:${k}`, r, String(r.at));
  // The journey in parts: a tap sends this month's head (a few KB), not a year of days.
  const { head, parts } = journeyParts();
  add('state', `journey:${dev}`, head, JSON.stringify(head));
  for (const [p, data] of Object.entries(parts)) add('state', `jm:${dev}:${p}`, data, JSON.stringify(data));
  const mine = `state/jm:${dev}:`;
  for (const key of Object.keys(meta.pushed)) // a month dropped here (older than the days kept)
    if (key.startsWith(mine) && meta.pushed[key] !== 'deleted' && !(key.slice(mine.length) in parts)) add('state', key.slice(6), {}, 'deleted', true);
  const garden = hasGarden() ? (await import('../data/garden')).gardenRecord() : null;
  if (garden) add('state', 'garden', garden as unknown as Record<string, unknown>, JSON.stringify(garden));
  const g = goalsRecord();
  if (g) add('setting', 'goals', { goals: g }, String(g.at));
  await loadReflections();
  for (const r of reflectionRecords()) {
    const data = { s: r.s, a: r.a, entries: r.entries };
    add('reflection', r.id, data, JSON.stringify(r.entries), r.entries.every((e) => e.deleted));
  }
  for (const r of kv.kvRecords()) add('state', `kv:${r.key}`, r.data, r.print, r.deleted);
  for (const d of await listDrafts()) add('draft', d.id, { project: d.project, created: d.created, updated: d.updated }, String(d.updated));
  for (const [id, at] of Object.entries(deletedDrafts())) add('draft', id, { updated: at }, `deleted:${at}`, true);
  return out;
}

// --- the Me tab's journey in parts ---
// A year of days was one ~40–100 KB document sent again at every tasbih tap; now the head (this month's
// days and everything else but the page times) changes often and stays small, while each earlier month
// (`YYYY-MM`) and the page times (`pages`) change rarely and are sent only when they do.
type Days = Record<string, unknown>;
type Log = Record<string, number[]>;

/** head = 'state/journey:{device}' (`from` = the first day it holds); parts = 'state/jm:{device}:{part}'. */
export function journeyParts(): { head: Record<string, unknown>; parts: Record<string, Record<string, unknown>> } {
  const { j, log } = journeyRecord();
  const from = `${dayKey().slice(0, 7)}-01`;
  const { days: allDays, pageLast, ...rest } = j;
  const days: Days = {}, recent: Log = {};
  const parts: Record<string, { days: Days; log: Log }> = {};
  const month = (k: string) => (parts[k.slice(0, 7)] ??= { days: {}, log: {} });
  for (const [k, d] of Object.entries(allDays)) if (k >= from) days[k] = d; else month(k).days[k] = d;
  for (const [k, p] of Object.entries(log)) if (k >= from) recent[k] = p; else month(k).log[k] = p;
  return { head: { j: { ...rest, days }, log: recent, from }, parts: { ...parts, pages: { pageLast } } };
}

/** One part of another device's journey arrived: put it into that device's journey kept here. */
export function mergeJourneyPart(device: string, part: string, data: unknown, deleted: boolean): boolean {
  if (!device) return false;
  const { log: oldLog = {}, ...j } = (otherJourney(device) ?? { days: {}, pageLast: {} }) as { log?: Log; days: Days; pageLast: unknown };
  const d = (data && typeof data === 'object' ? data : {}) as { days?: Days; log?: Log; pageLast?: unknown };
  const days: Days = { ...j.days }, log: Log = { ...oldLog };
  let pageLast = j.pageLast;
  if (part === 'pages') pageLast = deleted ? {} : d.pageLast;
  else if (/^\d{4}-\d{2}$/.test(part)) {
    for (const k of Object.keys(days)) if (k.startsWith(part)) delete days[k];
    for (const k of Object.keys(log)) if (k.startsWith(part)) delete log[k];
    if (!deleted) {
      for (const [k, v] of Object.entries(d.days ?? {})) if (k.startsWith(part)) days[k] = v;
      for (const [k, v] of Object.entries(d.log ?? {})) if (k.startsWith(part)) log[k] = v;
    }
  } else return false;
  return mergeJourney({ j: { ...j, days, pageLast }, log }, device);
}
