// Dua & ayah wall (docs/together.md T8). A host opens a wall for an occasion; guests join with its
// code or QR (no install) and add one entry each: their name, ≤ 3 ayat (a reference only) and an
// optional short dua in their own words. The database (supabase/migrations/20261011000000_t8_walls.sql)
// lets the host read every entry and hide any; a guest reads only their own; nobody else sees
// anything. The host's screen follows new entries live (Supabase Realtime).
import { account, signInGuest } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import type { Look } from '../engine/project';
import { shareableLink } from '../native';
import { errorText } from './circles';

export { errorText };

export const TITLE_MAX = 80;
export const NAME_MAX = 40;
export const DUA_MAX = 140;
export const MAX_ENTRY_AYAT = 3;

export const OCCASIONS = [
  ['wedding', 'Wedding'], ['eid', 'Eid'], ['ramadan', 'Ramadan'], ['birth', 'A new baby'],
  ['gathering', 'Family gathering'], ['memorial', 'In memory'], ['other', 'Other'],
] as const;
export type Occasion = (typeof OCCASIONS)[number][0];
export const occasionLabel = (o: string) => OCCASIONS.find(([k]) => k === o)?.[1] ?? 'Other';

export interface Wall {
  id: string;
  host_id: string;
  title: string;
  occasion: Occasion;
  join_code: string;
  status: 'open' | 'closed';
  look: unknown;
  reciter: number;
  created_at: string;
  closed_at: string | null;
}

export interface WallEntry {
  id: string;
  wall_id: string;
  user_id: string;
  name: string;
  dua: string | null;
  surah: number;
  ayah_from: number;
  ayah_to: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface WallPreview {
  title: string;
  occasion: Occasion;
  open: boolean;
  host: boolean;
  entry: Pick<WallEntry, 'id' | 'name' | 'dua' | 'surah' | 'ayah_from' | 'ayah_to' | 'hidden'> | null;
}

export const validCode = (c: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(c);
export const joinLink = (code: string) => shareableLink(`#/w/${code}`);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(errorText(error));
  return data as T;
}

export const createWall = (title: string, occasion: Occasion, look: Partial<Look>, reciter: number) =>
  rpc<{ id: string; code: string }>('create_wall', { wall_title: title.trim().slice(0, TITLE_MAX), wall_occasion: occasion, wall_look: look, reciter_id: reciter });
export const updateWall = (id: string, title: string, occasion: Occasion, look: unknown, reciter: number) =>
  rpc<void>('update_wall', { wall_id: id, wall_title: title.trim().slice(0, TITLE_MAX), wall_occasion: occasion, wall_look: look, reciter_id: reciter });
export const setWallOpen = (id: string, open: boolean) => rpc<void>('set_wall_open', { wall_id: id, open });
export const deleteWall = (id: string) => rpc<void>('delete_wall', { wall_id: id });
export const hideEntry = (id: string, hide: boolean) => rpc<void>('hide_wall_entry', { entry_id: id, hide });
export const previewWall = (code: string) => rpc<WallPreview | null>('wall_preview', { code });
export const removeEntry = (id: string) => rpc<void>('remove_wall_entry', { entry_id: id });
export const addEntry = (code: string, e: { name: string; dua: string; surah: number; from: number; to: number }) =>
  rpc<string>('add_wall_entry', {
    code, guest_name: e.name.trim().slice(0, NAME_MAX), guest_dua: e.dua.trim().slice(0, DUA_MAX) || null, s: e.surah, a_from: e.from, a_to: e.to,
  });

/** The host's walls, newest first (row-level security returns only their own). */
export async function myWalls(): Promise<(Wall & { entries: number })[]> {
  const sb = await supabase();
  const { data, error } = await sb.from('walls').select('*, wall_entries(count)').order('created_at', { ascending: false });
  if (error) throw new Error(errorText(error));
  return (data as (Wall & { wall_entries: { count: number }[] })[]).map(({ wall_entries, ...w }) => ({ ...w, entries: wall_entries?.[0]?.count ?? 0 }));
}

/** One wall with all its entries in the order they arrived (the host only). */
export async function loadWall(id: string): Promise<{ wall: Wall; entries: WallEntry[] } | null> {
  const sb = await supabase();
  const [w, e] = await Promise.all([
    sb.from('walls').select('*').eq('id', id).maybeSingle(),
    sb.from('wall_entries').select('*').eq('wall_id', id).order('created_at'),
  ]);
  if (w.error) throw new Error(errorText(w.error));
  if (e.error) throw new Error(errorText(e.error));
  return w.data ? { wall: w.data as Wall, entries: e.data as WallEntry[] } : null;
}

/** Live changes to a wall's entries while the host's screen is open. */
export async function watchWall(id: string, onChange: () => void): Promise<() => void> {
  const sb = await supabase();
  let timer = 0;
  const soon = () => { clearTimeout(timer); timer = window.setTimeout(onChange, 200); };
  const ch = sb.channel(`wall-${id}`);
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'wall_entries', filter: `wall_id=eq.${id}` }, soon);
  ch.subscribe();
  return () => { clearTimeout(timer); void sb.removeChannel(ch); };
}

/** A session that may add to a wall: the Google account, or an anonymous session (works once
 *  anonymous sign-ins are enabled in the Supabase project). */
export async function ensureGuest(): Promise<'account' | 'anonymous' | null> {
  if (account()) return 'account';
  // Anonymous session (after a Turnstile check when set up); null → Google sign-in is needed.
  return (await signInGuest()) ? 'anonymous' : null;
}
