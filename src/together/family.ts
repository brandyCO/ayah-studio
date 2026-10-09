// Family encouragement (docs/kids.md K6): a family circle (a circle of kind 'family',
// supabase/migrations/20261013000000_k6_family.sql) holds children by first name, the short surahs each
// is learning or has learned, and du'a notes from relatives. This module calls the checked database
// functions and links this device's Kids space to one child, so a lit lantern reaches the family and
// their notes reach the child — only while the parent is signed in on this device (the Kids space
// itself never asks to sign in).
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { learned } from '../data/kids';
import { errorText, type Circle, type Member } from './circles';

export interface Child {
  id: string;
  circle_id: string;
  name: string;
  added_by: string | null;
  created_at: string;
}
export interface FamilyPart {
  child_id: string;
  circle_id: string;
  surah: number;
  status: 'learning' | 'learned';
  at: string;
}
export interface FamilyNote {
  id: string;
  circle_id: string;
  child_id: string;
  surah: number | null;
  from_id: string;
  from_name: string;
  body: string;
  created_at: string;
  seen_at: string | null;
}
export interface FamilyState {
  circle: Circle;
  members: Member[];
  children: Child[];
  parts: FamilyPart[];
  notes: FamilyNote[];
}

/** Gentle presets for a du'a note (the members' own words; never presented as Quran or hadith). */
export const NOTE_PRESETS = [
  'May Allah make the Quran the light of your heart',
  'So proud of you — keep going!',
  'May Allah bless you and make it easy for you',
  'I love hearing you recite',
];

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(errorText(error));
  return data as T;
}

export async function loadFamily(id: string): Promise<FamilyState | null> {
  const sb = await supabase();
  const { data: circle, error } = await sb.from('circles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(errorText(error));
  if (!circle) return null;
  const [m, c, p, n] = await Promise.all([
    sb.from('circle_members').select('*').eq('circle_id', id).order('joined_at'),
    sb.from('circle_children').select('*').eq('circle_id', id).order('created_at'),
    sb.from('family_parts').select('*').eq('circle_id', id),
    sb.from('family_notes').select('*').eq('circle_id', id).order('created_at', { ascending: false }),
  ]);
  const err = m.error ?? c.error ?? p.error ?? n.error;
  if (err) throw new Error(errorText(err));
  return { circle: circle as Circle, members: m.data as Member[], children: c.data as Child[], parts: p.data as FamilyPart[], notes: n.data as FamilyNote[] };
}

export const createFamily = (name: string, memberName: string) => rpc<string>('create_family_circle', { circle_name: name, member_name: memberName });
export const addChild = (c: string, name: string) => rpc<string>('add_child', { c, child_name: name });
export const renameChild = (ch: string, name: string) => rpc<void>('rename_child', { ch, child_name: name });
export const removeChild = (ch: string) => rpc<void>('remove_child', { ch });
export const setChildSurah = (ch: string, s: number, state: 'learning' | 'learned' | 'none') => rpc<void>('set_child_surah', { ch, s, state });
export const leaveNote = (ch: string, s: number | null, note: string) => rpc<string>('leave_note', { ch, s, note });
export const deleteNote = (note: string) => rpc<void>('delete_note', { note });
export const markNoteSeen = (note: string) => rpc<void>('mark_note_seen', { note });

/** May the signed-in user manage this child (they added them, or own the circle)? */
export const canManage = (st: FamilyState, ch: Child) => {
  const me = account()?.id;
  return !!me && (ch.added_by === me || st.circle.owner_id === me);
};

// --- this device's Kids space ↔ one child of a family circle ---
export interface KidsLink {
  user: string; // the parent's account on this device
  circle: string;
  circleName: string;
  child: string;
  childName: string;
}
const LINK = 'kidsFamily';
const PUSHED = 'kidsFamilyPushed'; // surahs already reported as learned for the linked child

export function kidsLink(): KidsLink | null {
  try {
    const v = JSON.parse(localStorage.getItem(LINK) ?? 'null') as KidsLink | null;
    return v && typeof v.child === 'string' && typeof v.circle === 'string' && v.user === account()?.id ? v : null;
  } catch {
    return null;
  }
}
export function setKidsLink(l: Omit<KidsLink, 'user'> | null) {
  try {
    if (!l) localStorage.removeItem(LINK);
    else localStorage.setItem(LINK, JSON.stringify({ ...l, user: account()?.id }));
    localStorage.removeItem(PUSHED);
  } catch {
    /* ignore */
  }
}
function pushed(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(PUSHED) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Reports this device's lit lanterns to the linked child (each once; quietly retried on the next call
 * when offline) and returns the notes the child has not seen yet: notes without a surah, and notes for
 * a surah once its lantern is lit. Does nothing (and loads nothing) without a link and a sign-in.
 */
export async function syncKidsFamily(): Promise<FamilyNote[]> {
  const l = kidsLink();
  if (!l || !navigator.onLine) return [];
  const lit = learned();
  const done = new Set(pushed());
  for (const s of Object.keys(lit).map(Number)) {
    if (done.has(s)) continue;
    try {
      await setChildSurah(l.child, s, 'learned');
      done.add(s);
    } catch (e) {
      console.warn('Lantern not shared with the family yet', e);
      break;
    }
  }
  try {
    localStorage.setItem(PUSHED, JSON.stringify([...done]));
  } catch {
    /* ignore */
  }
  const sb = await supabase();
  const { data, error } = await sb.from('family_notes').select('*').eq('child_id', l.child).is('seen_at', null).order('created_at');
  if (error) {
    console.warn('Family notes not loaded', error);
    return [];
  }
  return (data as FamilyNote[]).filter((n) => n.surah === null || lit[n.surah]);
}

/** A lantern was put out on this device: let it be lit (and reported) again later. */
export function forgetPushed(s: number) {
  try {
    localStorage.setItem(PUSHED, JSON.stringify(pushed().filter((x) => x !== s)));
  } catch {
    /* ignore */
  }
}
