// Gifts between friends (owner request 2026-11-12, "make Light way more valuable"): Light (10–200) or a piece bought
// with Light, sent to a friend (≤ 3 a day; server: rank_gift_send). The sender's Light pays for it as a purchase
// (`gf:{id}` in the shop's list, synced like every purchase); the friend opens it once (rank_gift_open) as a chest,
// and what it holds joins their Light (`gift:{id}` claim) or their pieces.
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { localMsg } from '../i18n';
import { shopAdd, shopHas, wallet } from '../data/garden';
import { claimGoal } from '../data/journey';
import type { Row } from './ranks';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(localMsg(error.message));
  return data as T;
}

export const GIFT_LIGHT = [25, 50, 100, 200];
export interface Gift { id: string; light: number; item: string | null; at: string; from: Omit<Row, 'score'> }

/** Sends Light; throws when it cannot (not enough Light, not friends, 3 today). */
export async function giftLight(pid: string, n: number): Promise<void> {
  if (wallet() < n) throw new Error('need');
  const id = await rpc<string>('rank_gift_send', { who: pid, amount: n, piece: null });
  shopAdd(`gf:${id}`, n);
}
/** Sends a piece (its shop id, e.g. `rm:olive`) at its price. */
export async function giftPiece(pid: string, piece: string, price: number): Promise<void> {
  if (wallet() < price) throw new Error('need');
  const id = await rpc<string>('rank_gift_send', { who: pid, amount: 0, piece });
  shopAdd(`gf:${id}`, price);
}

const KEY = 'giftsWaiting';
/** Gifts waiting for me (also counted on this device for the inbox bell). */
export async function myGifts(): Promise<Gift[]> {
  if (!account()) return [];
  const list = await rpc<Gift[]>('rank_my_gifts');
  try { localStorage.setItem(KEY, JSON.stringify({ who: account()!.id, n: list.length })); } catch { /* ignore */ }
  window.dispatchEvent(new Event('rank-cache'));
  return list;
}
export function giftsWaiting(): number {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && v.who === account()?.id ? v.n | 0 : 0; } catch { return 0; }
}
/** Opens a gift once: its Light is claimed, its piece kept. False when it was opened already. */
export async function openGift(g: Gift): Promise<boolean> {
  const r = await rpc<{ light: number; item: string | null } | null>('rank_gift_open', { gift: g.id });
  if (!r) return false;
  if (r.light > 0) claimGoal(`gift:${g.id}`, r.light);
  if (r.item && !shopHas(r.item)) shopAdd(r.item, 0);
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v) localStorage.setItem(KEY, JSON.stringify({ ...v, n: Math.max(0, (v.n | 0) - 1) }));
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('rank-cache'));
  return true;
}
