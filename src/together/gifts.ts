// Gift an ayah (docs/together.md T3): a link that plays a few ayat in the sender's reel look, with an
// optional short message. The database (supabase/migrations/20261010000000_t3_gifts.sql) lets anyone
// with the link open a gift (get_gift, signed out too) but nobody list them, and only stores gifts
// through send_gift(), which checks the reference, reciter, look and message. Only references are
// stored — the Quran text always comes from the bundled data. Gifts received are remembered on this
// device so they can be found again (☰ → Gifts).
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import type { Look } from '../engine/project';
import { shareableLink } from '../native';
import { errorText } from './circles';

export { errorText };

export interface Gift {
  id: string;
  from_name: string;
  surah: number;
  ayah_from: number;
  ayah_to: number;
  reciter: number;
  look: unknown;
  message: string | null;
  reply_to: string | null;
  created_at: string;
  mine: boolean;
  opens: number | null; // only for the author
  replies: GiftSummary[] | null; // only for the author
}
export interface GiftSummary {
  id: string;
  from_name: string;
  surah: number;
  ayah_from: number;
  ayah_to: number;
  created_at: string;
}
export interface MyGift extends GiftSummary {
  kind: 'sent' | 'reply';
  message: string | null;
  reply_to: string | null;
  opens: number | null;
  replies: number | null;
}

export const MESSAGE_MAX = 140;
export const NAME_MAX = 40;
/** Ready-made messages (the sender can also write their own). */
export const PRESETS = ['Thinking of you', 'This ayah made me think of you', 'A little light for your day', 'Ramadan Mubarak', 'Eid Mubarak', 'Get well soon'];

export const giftLink = (id: string) => shareableLink(`#/gift/${id}`);
export const validGiftId = (id: string) => /^[a-hj-km-np-z2-9]{12}$/.test(id);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(errorText(error));
  return data as T;
}

/** A session that may send: the Google account, or — for a reply from someone without one — an
 *  anonymous session (works once anonymous sign-ins are enabled in the Supabase project). */
export async function ensureSender(reply: boolean): Promise<'account' | 'anonymous' | null> {
  if (account()) return 'account';
  if (!reply) return null;
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user?.is_anonymous) return 'anonymous';
  const { error } = await sb.auth.signInAnonymously();
  if (error) return null; // anonymous sign-ins are off: Google sign-in is needed
  return 'anonymous';
}

export function sendGift(g: { surah: number; from: number; to: number; reciter: number; look: Partial<Look>; name: string; message: string; replyTo: string | null }): Promise<string> {
  return rpc<string>('send_gift', {
    s: g.surah, a_from: g.from, a_to: g.to, reciter_id: g.reciter, gift_look: g.look, sender_name: g.name.trim().slice(0, NAME_MAX),
    msg: g.message.trim().slice(0, MESSAGE_MAX) || null, reply: g.replyTo,
  });
}

export async function getGift(id: string): Promise<Gift | null> {
  return rpc<Gift | null>('get_gift', { gift_id: id });
}

export const myGifts = () => rpc<MyGift[]>('my_gifts', {});
export const deleteGift = (id: string) => rpc<void>('delete_gift', { gift_id: id });

// --- gifts received on this device ---
export interface Received {
  id: string;
  from: string;
  surah: number;
  ayah_from: number;
  ayah_to: number;
  at: number; // first opened
}
const RECEIVED = 'giftsReceived';
export function received(): Received[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECEIVED) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && validGiftId(x.id)) : [];
  } catch {
    return [];
  }
}
export function rememberReceived(g: Gift) {
  if (g.mine) return;
  const list = received().filter((x) => x.id !== g.id);
  const old = received().find((x) => x.id === g.id);
  list.unshift({ id: g.id, from: g.from_name, surah: g.surah, ayah_from: g.ayah_from, ayah_to: g.ayah_to, at: old?.at ?? Date.now() });
  try {
    localStorage.setItem(RECEIVED, JSON.stringify(list.slice(0, 100)));
  } catch {
    /* ignore */
  }
}
export function forgetReceived(id: string) {
  try {
    localStorage.setItem(RECEIVED, JSON.stringify(received().filter((x) => x.id !== id)));
  } catch {
    /* ignore */
  }
}

// --- replying: the gift being answered while the user selects ayat in the mushaf ---
export interface PendingReply {
  id: string;
  to: string; // the sender's name
}
const REPLY = 'giftReply';
export function pendingReply(): PendingReply | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(REPLY) ?? 'null');
    return v && typeof v.id === 'string' && validGiftId(v.id) && typeof v.to === 'string' ? v : null;
  } catch {
    return null;
  }
}
export function setPendingReply(r: PendingReply | null) {
  try {
    if (r) sessionStorage.setItem(REPLY, JSON.stringify(r));
    else sessionStorage.removeItem(REPLY);
  } catch {
    /* ignore */
  }
}
