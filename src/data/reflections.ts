// The reflections journal (docs/together.md T4): private notes on an ayah, kept on this device
// (IndexedDB `reflections`) and synced with the account when signed in (src/cloud/sync.ts). One note
// per ayah holds dated paragraphs, so it grows into a conversation with your past self. Between
// devices, paragraphs merge one by one: the newest edit of each wins and nothing written on either
// device is lost. A removed paragraph stays as a dated tombstone for a while so the removal reaches
// the other devices. A change fires `reflections-changed` on window.
// Notes hold the user's own words and an ayah reference only — never Quran text.
import { tx } from './db';

export interface Entry {
  id: string;
  at: number; // when the paragraph was started (ms) — its date
  edited: number; // last change (ms); the newest edit wins when merging
  text: string;
  deleted?: true; // removed at `edited`
}
export interface Reflection {
  id: string; // "s:a"
  s: number;
  a: number;
  entries: Entry[]; // oldest first
}

export const MAX_TEXT = 5000; // characters per paragraph
const MAX_ENTRIES = 200;
const TOMBSTONE_DAYS = 120;

export const noteId = (s: number, a: number) => `${s}:${a}`;

const validEntry = (e: unknown): e is Entry => {
  const x = e as Entry;
  return !!x && typeof x.id === 'string' && x.id.length >= 1 && x.id.length <= 40
    && typeof x.at === 'number' && typeof x.edited === 'number' && typeof x.text === 'string' && x.text.length <= MAX_TEXT;
};
const validNote = (r: unknown): r is Reflection => {
  const x = r as Reflection;
  return !!x && Number.isInteger(x.s) && x.s >= 1 && x.s <= 114 && Number.isInteger(x.a) && x.a >= 1 && x.a <= 286
    && Array.isArray(x.entries);
};
const clean = (e: Entry): Entry => ({ id: e.id, at: e.at, edited: e.edited, text: e.deleted ? '' : e.text, ...(e.deleted ? { deleted: true as const } : {}) });

// --- the notes, in memory (the margin marks read them synchronously) ---
let cache = new Map<string, Reflection>();
let loading: Promise<void> | null = null;

/** Reads the notes from storage once; call (and await) before using the functions below. */
export function loadReflections(): Promise<void> {
  loading ??= tx<Reflection[]>('reflections', 'readonly', (st) => st.getAll())
    .then((list) => {
      for (const r of list) if (validNote(r)) cache.set(r.id, { ...r, entries: r.entries.filter(validEntry) });
    })
    .catch((e) => console.warn('Reflections unavailable', e));
  return loading;
}

export const liveEntries = (r: Reflection) => r.entries.filter((e) => !e.deleted).sort((x, y) => x.at - y.at);
/** When the newest paragraph was started. */
export const lastWritten = (r: Reflection) => Math.max(0, ...liveEntries(r).map((e) => e.at));
const lastEdited = (r: Reflection) => Math.max(0, ...liveEntries(r).map((e) => e.edited));

/** Notes with something written, most recently edited first. */
export const reflections = (): Reflection[] =>
  [...cache.values()].filter((r) => liveEntries(r).length).sort((x, y) => lastEdited(y) - lastEdited(x));

export function reflectionAt(s: number, a: number): Reflection | undefined {
  const r = cache.get(noteId(s, a));
  return r && liveEntries(r).length ? r : undefined;
}

/** Every note with its removed paragraphs (for syncing). */
export const reflectionRecords = (): Reflection[] => [...cache.values()];

function persist(r: Reflection) {
  const old = Date.now() - TOMBSTONE_DAYS * 86_400_000;
  r.entries = r.entries.filter((e) => !e.deleted || e.edited > old).sort((x, y) => x.at - y.at).slice(-MAX_ENTRIES);
  if (r.entries.length) {
    cache.set(r.id, r);
    void tx('reflections', 'readwrite', (st) => st.put(r)).catch((e) => console.warn('Could not save the reflection', e));
  } else {
    cache.delete(r.id);
    void tx('reflections', 'readwrite', (st) => st.delete(r.id)).catch(() => {});
  }
  window.dispatchEvent(new Event('reflections-changed'));
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Writes a paragraph of the note on s:a — a new one when `entryId` is null — and returns its id.
 * Emptying a paragraph removes it. Returns null when nothing was kept.
 */
export function writeEntry(s: number, a: number, entryId: string | null, text: string): string | null {
  const id = noteId(s, a);
  const r: Reflection = cache.get(id) ?? { id, s, a, entries: [] };
  const now = Date.now();
  const body = text.slice(0, MAX_TEXT);
  const empty = !body.trim();
  const i = entryId ? r.entries.findIndex((e) => e.id === entryId) : -1;
  if (i < 0) {
    if (empty) return null;
    const e: Entry = { id: entryId ?? newId(), at: now, edited: now, text: body };
    r.entries = [...r.entries, e];
    persist(r);
    return e.id;
  }
  const cur = r.entries[i];
  if (!cur.deleted && cur.text === body) return cur.id;
  r.entries = r.entries.map((e, k) => (k !== i ? e : empty ? { ...e, text: '', edited: now, deleted: true as const } : { ...e, text: body, edited: now, deleted: undefined }))
    .map(clean);
  persist(r);
  return empty ? null : cur.id;
}

/** Removes the whole note on s:a (every paragraph). */
export function deleteReflection(s: number, a: number) {
  const r = cache.get(noteId(s, a));
  if (!r) return;
  const now = Date.now();
  r.entries = r.entries.map((e) => (e.deleted ? e : { ...e, text: '', edited: now, deleted: true as const }));
  persist(r);
}

/** Merges a note from another device: per paragraph, the newest edit (written or removed) wins. */
export function mergeReflection(remote: unknown): boolean {
  if (!validNote(remote)) return false;
  const id = noteId(remote.s, remote.a);
  const mine = cache.get(id);
  const byId = new Map((mine?.entries ?? []).map((e) => [e.id, e]));
  let changed = false;
  for (const e of remote.entries.filter(validEntry)) {
    const cur = byId.get(e.id);
    if (!cur || e.edited > cur.edited) {
      byId.set(e.id, clean(e));
      changed = true;
    }
  }
  if (changed) persist({ id, s: remote.s, a: remote.a, entries: [...byId.values()] });
  return changed;
}

/** Lower-case, without accents or harakat (so "quran" finds "Qur'ān"), for the journal's search. */
export const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’'`]/g, '').toLowerCase();

/** Where `q` (already folded) occurs in `text`, as a range of the original text; null if nowhere. */
export function findFolded(text: string, q: string): [number, number] | null {
  if (!q) return null;
  let folded = '';
  const start: number[] = []; // original index of each folded character
  const end: number[] = [];
  let i = 0;
  for (const ch of text) {
    for (const f of fold(ch)) {
      folded += f;
      start.push(i);
      end.push(i + ch.length);
    }
    i += ch.length;
  }
  const k = folded.indexOf(q);
  return k < 0 ? null : [start[k], end[k + q.length - 1]];
}
