// Circles (docs/together.md T2): the shared base of the family circles (docs/kids.md K6). The
// database (supabase/migrations/20261009000000_t2_circles.sql) only lets members see a circle and only
// changes it through checked functions; this module calls them and keeps the last state of the user's
// circles on the device. (Khatm circles were removed from the app by the owner on 2026-10-28.)
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

export const joinCircle = (code: string, memberName: string) => rpc<string>('join_circle', { code, member_name: memberName });
export const leaveCircle = (c: string) => rpc<void>('leave_circle', { c });
export const deleteCircle = (c: string) => rpc<void>('delete_circle', { c });
export async function previewCircle(code: string): Promise<{ name: string; members: number; round: number; status: string } | null> {
  const rows = await rpc<{ name: string; members: number; round: number; status: string }[]>('circle_preview', { code });
  return rows?.[0] ?? null;
}

export const inviteLink = (code: string) => shareableLink(`#/join/${code}`);
