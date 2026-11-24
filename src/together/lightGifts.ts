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
import { Offline, isOffline, sendLater } from './outbox';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (navigator.onLine === false) throw new Offline('offline');
  const sb = await supabase();
  const { data, error, status } = await sb.rpc(fn, args);
  if (error) throw status === 0 ? new Offline(localMsg(error.message)) : new Error(localMsg(error.message));
  return data as T;
}

/** Sends a gift now, or with no connection keeps it to send when back online (outbox.ts) with its Light held,
 *  so it cannot be spent twice. Resolves true when sent now, false when it waits. */
async function send(args: { who: string; amount: number; piece: string | null }, price: number): Promise<boolean> {
  try {
    const id = await rpc<string>('rank_gift_send', args);
    shopAdd(`gf:${id}`, price);
    return true;
  } catch (e) {
    if (!isOffline(e)) throw e;
    sendLater(`gift:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, 'rank_gift_send', args, undefined, price);
    return false;
  }
}

export const GIFT_LIGHT = [25, 50, 100, 200];
export interface Gift { id: string; light: number; item: string | null; at: string; from: Omit<Row, 'score'> }

/** Sends Light; throws when it cannot (not enough Light, not friends, 3 today). False: it waits for a connection. */
export async function giftLight(pid: string, n: number): Promise<boolean> {
  if (wallet() < n) throw new Error('need');
  return send({ who: pid, amount: n, piece: null }, n);
}
/** Sends a piece (its shop id, e.g. `rm:olive`) at its price. False: it waits for a connection. */
export async function giftPiece(pid: string, piece: string, price: number): Promise<boolean> {
  if (wallet() < price) throw new Error('need');
  return send({ who: pid, amount: 0, piece }, price);
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
