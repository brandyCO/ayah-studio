// Bedtime pact (du'a moments step 6; supabase/migrations/20261110600000_bedtime_pacts.sql): family or
// friends keep the bedtime du'a for 7 nights together. A shared goal, never a ranking. The app marks
// tonight after the bedtime session is said in full (kept in localStorage `pactMark` until it is sent).
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { localMsg } from '../i18n';
import { claimGoal } from '../data/journey';
import { dayKey } from '../data/readLog';
import { nightKey } from '../data/duas';
import { shareableLink } from '../native';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(localMsg(error.message));
  return data as T;
}

export interface Face { name: string | null; private?: boolean; avatar: number | null; tier: number; me: boolean; frame?: number; figure?: string | null }
export interface Pact {
  id: string; start: string; end: string; code: string | null; night: number; over: boolean; claimed: boolean;
  members: { face: Face; nights: number[] }[];
}

export const pactLink = (code: string) => shareableLink(`#/bp/${code}`);
export const myPacts = () => rpc<Pact[]>('my_pacts', { d: dayKey() });
export const createPact = () => rpc<{ id: string; code: string }>('pact_create', { d: dayKey() });
export const joinPact = (code: string) => rpc<string>('pact_join', { p_code: code.trim().toLowerCase(), d: dayKey() });
export const leavePact = (id: string) => rpc<void>('pact_leave', { pid: id });
export const pactPreview = (code: string) => rpc<{ from: Face; members: number; open: boolean; joined: boolean } | null>('pact_preview', { p_code: code.trim().toLowerCase() });
export async function claimPact(p: Pact): Promise<{ kept: number; everyone: boolean; light: number } | null> {
  const r = await rpc<{ kept: number; everyone: boolean; light: number } | null>('pact_claim', { pid: p.id });
  if (r) claimGoal(`bp:${p.id}`, r.light);
  return r;
}

/** Tonight's bedtime du'a were said: marks the night in every running pact (now, or when next possible). */
export async function markTonight(night = nightKey()) {
  try { localStorage.setItem('pactMark', night); } catch { /* ignore */ }
  await flushPactMark();
}
export async function flushPactMark() {
  let night: string | null = null;
  try { night = localStorage.getItem('pactMark'); } catch { /* ignore */ }
  if (!night || !account()) return;
  try {
    await rpc<number>('pact_mark', { d: night });
    localStorage.removeItem('pactMark');
  } catch { /* offline, or the night is too old: kept, and dropped once it is */
    if (night < dayKey(new Date(Date.now() - 2 * 86400e3))) try { localStorage.removeItem('pactMark'); } catch { /* ignore */ }
  }
}
