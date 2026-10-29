// Relight a friend's flame (Me tab, M4; supabase/migrations/20261028000000_m4_relight.sql): the owner
// of a streak that went out asks (signed in with Google) and shares a link; a friend signed in with
// another account relights it within 48 hours; the owner's app then covers the missed days.
import { revive, streak } from '../data/journey';
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { isNative, shareableLink } from '../native';
import { t } from '../i18n';
import { toast } from '../ui/dom';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const firstName = () => (account()?.name ?? '').trim().split(/\s+/)[0]?.slice(0, 40) || 'A friend';
export const relightLink = (code: string) => shareableLink(`#/relight/${code}`);

/** Asks for a relight of the flame that went out and opens the share sheet. */
export async function askRelight(): Promise<void> {
  const lost = streak().lost;
  if (!lost || !account()) return;
  const code = await rpc<string>('ask_relight', { my_name: firstName(), streak_days: lost.n, missed_days: lost.days.slice(-3) });
  try { localStorage.setItem('relightAsked', JSON.stringify({ code, at: Date.now() })); } catch { /* ignore */ }
  const url = relightLink(code);
  const text = t('rl.shareText', { n: lost.n });
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: t('rl.shareTitle'), text, url, dialogTitle: t('rl.shareTitle') });
      return;
    }
    if (navigator.share) { await navigator.share({ title: t('rl.shareTitle'), text, url }); return; }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast(t('rl.copied'));
  } catch {
    toast(url);
  }
}

/** Has an ask been made recently (so the app looks for a relight)? */
const askedRecently = () => {
  try {
    const v = JSON.parse(localStorage.getItem('relightAsked') ?? 'null');
    return !!v && Date.now() - Number(v.at) < 3 * 86_400_000;
  } catch {
    return false;
  }
};

/** Takes relights given by friends into the journey (on start, on resume, on Me). */
export async function takeRelights(): Promise<void> {
  if (!account() || !askedRecently()) return;
  try {
    const list = await rpc<{ missed: string[]; helper: string | null }[]>('take_relights');
    for (const r of list) {
      revive(r.missed);
      toast(t('rl.relitBy', { name: r.helper || t('rl.aFriend') }));
    }
    if (list.length) localStorage.removeItem('relightAsked');
  } catch {
    /* offline: next time */
  }
}

export interface RelightPreview { name: string; streak: number; state: 'open' | 'relit' | 'expired'; mine: boolean | null; helper: string | null }
export const relightPreview = (code: string) => rpc<RelightPreview | null>('relight_preview', { code });
export const giveRelight = (code: string) => rpc<void>('give_relight', { code, my_name: firstName() });
