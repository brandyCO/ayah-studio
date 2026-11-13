// "Help improve the harakat check" (off by default, never in the Kids space; Me → ⚙ → App): while Follow my
// voice uses our server, keep a short clip (≤ 3 s: the word with its neighbours) of each word it flagged
// and, now and then, of one it did not. After the check they are shared with the learner's own answer:
// a flagged word untapped at the check = "I said it right". Teachers label them (#/learn/review) and the
// labels tune the check (scripts/harakat-tune.py). Signed-in Google accounts only; see the privacy page.
import { kidsOn } from '../data/kids';
import { supabase } from '../cloud/supabase';
import { h, toast } from './dom';
import { t } from '../i18n';
import { account } from '../cloud/auth';
import { lt } from '../i18n/learn';
import { CLIP_BUCKET, removeMyClipFiles, uploadClip } from '../cloud/clipFiles';

const KEY = 'harakatHelp';
export const helpChoice = (): 'on' | 'off' | null => {
  try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : null; } catch { return null; }
};
export const helpOn = () => helpChoice() === 'on' && !kidsOn();
export const setHelp = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

/** What the server answered for one part (server/harakat/server.py). */
export interface PartResult { said: number[]; flags: number[]; scores?: Record<string, number>; at?: Record<string, [number, number]> }
interface Clip { key: string; s: number; a: number; words: string[]; target: number; score: number | null; flagged: boolean; pcm: Int16Array }

const RATE = 16000, MAX_S = 3, PER_SESSION = 20;

/** Clips kept during one tasmi', shared when it is checked. */
export class ClipJar {
  private list: Clip[] = [];

  /** One part: `word(i)` is the i-th word sent with it (its key, surah, ayah and text), or null. */
  take(pcm: Int16Array, r: PartResult, word: (i: number) => { key: string; s: number; a: number; text: string } | null) {
    // kept in memory while the learner has not chosen yet (the check asks), shared only once they say yes
    if (!(helpOn() || (helpChoice() === null && !kidsOn())) || !r.at) return;
    const at = r.at;
    const unflagged = r.said.filter((i) => !r.flags.includes(i) && at[i]);
    const pick = [...r.flags.filter((i) => at[i])];
    if (unflagged.length && Math.random() < 0.25) pick.push(unflagged[Math.floor(Math.random() * unflagged.length)]);
    for (const i of pick) {
      if (this.list.length >= PER_SESSION) return;
      const w = word(i);
      if (!w) continue;
      // the word with both neighbours if they fit in 3 s, else with one, else alone (with a little air)
      const ok = (j: number) => !!at[j] && word(j)?.a === w.a;
      const tries = [[i - 1, i, i + 1], [i - 1, i], [i, i + 1]].filter((g) => g.every(ok));
      let idx = [i], t0 = at[i][0] - 0.3, t1 = at[i][1] + 0.3;
      for (const g of tries) {
        const a0 = at[g[0]][0] - 0.08, a1 = at[g[g.length - 1]][1] + 0.08;
        if (a1 - a0 <= MAX_S) { idx = g; t0 = a0; t1 = a1; break; }
      }
      t0 = Math.max(0, t0); t1 = Math.min(pcm.length / RATE, t1, t0 + MAX_S);
      if (t1 - t0 < 0.15) continue;
      this.list.push({
        key: w.key, s: w.s, a: w.a, words: idx.map((j) => word(j)!.text), target: idx.indexOf(i),
        score: r.scores?.[String(i)] ?? null, flagged: r.flags.includes(i),
        pcm: pcm.slice(Math.floor(t0 * RATE), Math.floor(t1 * RATE)),
      });
    }
  }

  /** After the check: `missed` = the words left marked as missed. */
  share(missed: Set<string>) {
    const list = this.list;
    this.list = [];
    if (!list.length || !helpOn()) return;
    void (async () => {
      const sb = await supabase();
      for (const c of list) {
        // the sound goes to file storage, the row keeps its details and the file's path
        const path = await uploadClip(sb, c.pcm);
        if (!path) return; // daily limit, signed out or offline: the rest are dropped, nothing is kept
        const { error } = await sb.rpc('harakat_clip_add_file', {
          p_surah: c.s, p_ayah: c.a, p_words: c.words, p_target: c.target, p_score: c.score, p_flagged: c.flagged,
          p_learner: c.flagged ? (missed.has(c.key) ? 'wrong' : 'right') : 'none', p_path: path,
        });
        if (error) { await sb.storage.from(CLIP_BUCKET).remove([path]).catch(() => {}); return; }
      }
    })().catch(() => {});
  }

  clear() { this.list = []; }
  get size() { return this.list.length; }
}

/** Deletes every clip this account shared. */
export async function forgetMyClips(): Promise<number> {
  const sb = await supabase();
  await removeMyClipFiles(sb);
  const { data, error } = await sb.rpc('harakat_forget_mine');
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Asked once, at the check of a tasmi' where the server flagged a word. */
export function helpCard(done: () => void): HTMLElement {
  return h('div', { class: 'ls-help' },
    h('p', {}, h('b', {}, lt('learn.helpTitle')), ' ', lt('learn.helpBody')),
    h('div', { class: 'ls-help-btns' },
      h('button', { class: 'chip', onclick: () => { setHelp(true); done(); } }, lt('learn.helpYes')),
      h('button', { class: 'chip', onclick: () => { setHelp(false); done(); } }, lt('learn.helpNo'))));
}

/** Me → ⚙ → App → Help improve the harakat check. */
export function openHelpSheet() {
  const body = h('div', { class: 'ls-help-sheet' });
  const paint = () => body.replaceChildren(
    h('p', {}, lt('learn.helpSheetBody')),
    kidsOn() ? h('p', { class: 'muted small' }, lt('learn.helpKids')) : '',
    account() ? '' : h('p', { class: 'muted small' }, lt('learn.helpSignIn')),
    h('div', { class: 'menu' },
      h('button', { class: 'menu-item', 'aria-pressed': String(helpOn()), disabled: kidsOn(), onclick: () => { setHelp(!helpOn()); paint(); } },
        lt(helpOn() ? 'learn.helpOn' : 'learn.helpOff')),
      account() ? h('button', { class: 'menu-item', onclick: () => void forgetMyClips().then((n) => toast(lt('learn.helpForgot', { n })), () => toast(lt('learn.followFailed'))) }, lt('learn.helpForget')) : ''));
  paint();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, lt('learn.helpTitle')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    body);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
