// Khatm circles (docs/together.md T2): a group reads the whole Quran together, one juz each. The
// database (supabase/migrations/20261009000000_t2_circles.sql) only lets members see a circle and only
// changes it through checked functions; this module calls them, keeps the last state of the user's
// circles on the device (for the mushaf's gold page edge and the Today card, also offline) and
// subscribes to live changes while a circle is on screen. Which pages of your juz you have read is
// kept on this device only.
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { shareableLink } from '../native';

export interface Circle {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  round: number;
  status: 'open' | 'complete';
  due_date: string | null;
  completed_at: string | null;
  kind?: 'khatm' | 'family'; // family circles (docs/kids.md K6) have children instead of juz parts
}
export interface Member {
  circle_id: string;
  user_id: string;
  name: string;
  color: number;
  joined_at: string;
}
export interface Part {
  circle_id: string;
  round: number;
  juz: number;
  user_id: string | null;
  status: 'free' | 'taken' | 'done';
  taken_at: string | null;
  done_at: string | null;
}
export interface CircleState {
  circle: Circle;
  members: Member[];
  parts: Part[]; // the current round's 30 parts, by juz
}

// Soft member colours (also told apart by their initial, never by colour alone).
export const MEMBER_COLORS = ['#3f9e86', '#c98b3e', '#7a7fc9', '#c2697c', '#5b9bc4', '#9a8a4a', '#8e6bb8', '#4f9e5a', '#c4775b', '#5a8f8f', '#b06a9e', '#7d8f4f'];

/** A readable message from a Supabase/Postgres error. */
export const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(errorText(error));
  return data as T;
}

// --- the user's circles, kept on the device ---
const CACHE_KEY = 'circles';
let cache: { user: string; circles: CircleState[] } | null = null;
function readCache(): CircleState[] {
  const a = account();
  if (!a) return [];
  if (!cache) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
      cache = c && c.user === a.id && Array.isArray(c.circles) ? c : { user: a.id, circles: [] };
    } catch {
      cache = { user: a.id, circles: [] };
    }
  }
  return cache!.user === a.id ? cache!.circles : [];
}
function writeCache(circles: CircleState[]) {
  const a = account();
  if (!a) return;
  cache = { user: a.id, circles };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('circles-changed'));
}
/** The last known state of the user's circles (no network). */
export const cachedCircles = (): CircleState[] => readCache();

/** Loads all the user's circles with their members and current parts. */
export async function loadCircles(): Promise<CircleState[]> {
  const sb = await supabase();
  const { data: circles, error } = await sb.from('circles').select('*').order('created_at');
  if (error) throw new Error(errorText(error));
  const ids = (circles as Circle[]).map((c) => c.id);
  if (!ids.length) {
    writeCache([]);
    return [];
  }
  const [{ data: members, error: e1 }, { data: parts, error: e2 }] = await Promise.all([
    sb.from('circle_members').select('*').in('circle_id', ids).order('joined_at'),
    sb.from('circle_parts').select('*').in('circle_id', ids).order('juz'),
  ]);
  if (e1 || e2) throw new Error(errorText(e1 ?? e2));
  const out = (circles as Circle[]).map((circle) => ({
    circle,
    members: (members as Member[]).filter((m) => m.circle_id === circle.id),
    parts: (parts as Part[]).filter((p) => p.circle_id === circle.id && p.round === circle.round),
  }));
  writeCache(out);
  return out;
}

/** Re-reads one circle (after a change or a live update) and updates the cache. */
export async function loadCircle(id: string): Promise<CircleState | null> {
  const all = await loadCircles();
  return all.find((c) => c.circle.id === id) ?? null;
}

export const createCircle = (name: string, memberName: string, due: string | null) =>
  rpc<string>('create_circle', { circle_name: name, member_name: memberName, due });
export const joinCircle = (code: string, memberName: string) => rpc<string>('join_circle', { code, member_name: memberName });
export const takePart = (c: string, juz: number | null) => rpc<number>('take_part', { c, j: juz });
export const setPart = (c: string, juz: number, state: 'taken' | 'done' | 'free') => rpc<void>('set_part', { c, j: juz, state });
export const newRound = (c: string) => rpc<number>('new_round', { c });
export const leaveCircle = (c: string) => rpc<void>('leave_circle', { c });
export const deleteCircle = (c: string) => rpc<void>('delete_circle', { c });
export async function previewCircle(code: string): Promise<{ name: string; members: number; round: number; status: string } | null> {
  const rows = await rpc<{ name: string; members: number; round: number; status: string }[]>('circle_preview', { code });
  return rows?.[0] ?? null;
}

/** Calls `onChange` whenever the circle's parts, members or state change (live, while subscribed). */
export async function watchCircle(id: string, onChange: () => void): Promise<() => void> {
  const sb = await supabase();
  let timer = 0;
  const soon = () => { clearTimeout(timer); timer = window.setTimeout(onChange, 250); };
  const ch = sb.channel(`circle-${id}`);
  for (const table of ['circle_parts', 'circle_members']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `circle_id=eq.${id}` }, soon);
  }
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'circles', filter: `id=eq.${id}` }, soon);
  ch.subscribe();
  return () => { clearTimeout(timer); void sb.removeChannel(ch); };
}

export const inviteLink = (code: string) => shareableLink(`#/join/${code}`);

/** The user's own parts across their circles. */
export function myParts(states = cachedCircles()): { state: CircleState; part: Part }[] {
  const me = account()?.id;
  if (!me) return [];
  return states.flatMap((state) => state.parts.filter((p) => p.user_id === me).map((part) => ({ state, part })));
}

// --- pages of your juz read on this device ---
const READ_KEY = 'juzPagesRead';
type ReadMap = Record<string, number[]>; // "circle:round:juz" → pages read
const partKey = (p: Pick<Part, 'circle_id' | 'round' | 'juz'>) => `${p.circle_id}:${p.round}:${p.juz}`;
function readMap(): ReadMap {
  try {
    const v = JSON.parse(localStorage.getItem(READ_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export const pagesRead = (p: Pick<Part, 'circle_id' | 'round' | 'juz'>) => new Set(readMap()[partKey(p)] ?? []);

/** Records that `page` was read (open ≥ 20 s or listened to) — for every taken juz it belongs to. */
export function markPageRead(page: number, juzPages: (juz: number) => number[]) {
  const mine = myParts().filter(({ part }) => part.status === 'taken' && juzPages(part.juz).includes(page));
  if (!mine.length) return;
  const map = readMap();
  let changed = false;
  for (const { part } of mine) {
    const k = partKey(part);
    const set = new Set(map[k] ?? []);
    if (!set.has(page)) {
      set.add(page);
      map[k] = [...set];
      changed = true;
    }
  }
  if (!changed) return;
  // Forget parts that are no longer the user's (other rounds, left circles).
  const live = new Set(myParts().map(({ part }) => partKey(part)));
  for (const k of Object.keys(map)) if (!live.has(k)) delete map[k];
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('circles-changed'));
}
