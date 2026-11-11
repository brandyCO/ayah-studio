// Friends on Ranks (owner request 2026-11-11): a tap on a player in the league opens a small profile — what they chose to
// show and both characters standing side by side — where you can ask to be friends; an invite link (#/rf/{code}) makes
// friends at once. Two friends keep a friend streak (the days in a row both earned points, counted by the server). While
// both have earned points today their characters stand on fire together, and on 7 / 30 / 100 / 365 days they power up
// together full screen (powerUp.ts). Simple on purpose: no explaining needed beyond one line.
import { account } from '../cloud/auth';
import { ft } from '../i18n/friends';
import { rt } from '../i18n/ranks';
import {
  SHOW, answerFriend, askFriend, friendInvite, friendInviteLink, friendInvitePreview, joinFriend, myFriends, myShow, peekProfile, preloadProfiles, rankProfile, removeFriend, sendProfile,
  type Friend, type Friends, type Profile, type Row, type ShowKey,
} from '../together/ranks';
import { myFigureCode, actor } from './actor';
import { avatar } from './rankAvatars';
import { blazingPair, powerLevel, powerUp } from './powerUp';
import { ptsIcon, share, tierBadge } from './ranks';
import { t } from '../i18n';
import { openAccount } from './account';
import { flame } from './flame';
import { h, haptic, toast } from './dom';
import { tabBar } from './tabs';
import { levelLabel, levelOf, levelProgress, myXp } from '../data/xp';
import { withLevel } from './levelLook';
import './friends.css';

const num = (n: number) => n.toLocaleString();
const PENDING = 'pendingFriend';
const MILESTONES = [7, 30, 100, 365];

/** Two people side by side: characters (on fire together when `on`), else their avatar discs. */
function pair(me: string | null, them: Row | Profile | Friend, on: boolean, streak: number, disc = 72): HTMLElement {
  const a = actor('fr-fig', me);
  const b = them.private ? null : actor('fr-fig', them.figure ?? null);
  if (a && b) {
    withLevel(a.el, levelOf(myXp()));
    if (them.xp != null) withLevel(b.el, levelOf(them.xp));
    const box = h('span', { class: 'fr-pair' }, blazingPair(powerLevel(Math.max(1, streak)), a.el, b.el, on));
    setTimeout(() => { if (on) { a.cheer(1600); b.cheer(1600); } else { a.wave(1400); b.hop(0.4); } }, 380);
    return box;
  }
  const one = (fig: string | null, r?: Row | Profile | Friend) => avatar(r?.private ? null : r?.avatar ?? 0, r?.tier ?? 0, disc, r?.frame ?? 0, fig);
  return h('span', { class: `fr-pair discs${on ? ' on' : ''}` }, one(me), one(them.private ? null : them.figure ?? null, them));
}

const streakLine = (f: { streak: number; meToday: boolean; themToday: boolean }, name: string) =>
  h('div', { class: `fr-streak${f.meToday && f.themToday ? ' on' : ''}` },
    h('span', { class: 'fr-flame' }, flame(f.meToday && f.themToday ? 2 : f.streak ? 1 : 0, 26, true)),
    h('span', {}, h('b', {}, f.streak ? ft('fr.streak', { n: f.streak }) : ft('fr.streak0')),
      h('small', {}, f.meToday && f.themToday ? ft('fr.both') : f.themToday ? ft('fr.you') : f.meToday ? ft('fr.them', { name }) : ft('fr.neither'))));

/** A profile from a board row, while the full one is not kept yet (no loading text: the page fills in place). */
function fromRow(row: Row): Profile {
  const fr = friendsNow()?.friends.find((f) => f.pid === row.pid);
  return { name: row.name, pid: row.pid, figure: row.figure, avatar: row.avatar, frame: row.frame ?? 0, tier: row.tier, xp: row.xp, private: row.private,
    room: row.room, me: row.me, relation: row.me ? 'me' : fr ? 'friend' : 'none', show: 0, bestTier: row.tier ?? 0,
    friend: fr ? { streak: fr.streak, meToday: fr.meToday, themToday: fr.themToday } : undefined };
}
let friendsKept: Friends | null = null;
const friendsNow = () => friendsKept;

/** The profile of a player (from their row on a board): a full page with both characters, opened at once from what
 *  this device keeps (league profiles are fetched ahead), then brought up to date in place. */
export async function openProfile(row: Row, onChange: () => void = () => {}) {
  const pid = row.pid;
  if (!pid) return;
  const kept = peekProfile(pid);
  let prof: Profile | null = kept === undefined ? fromRow(row) : kept;
  let known = kept !== undefined;
  const title = h('h2', {}, row.me ? ft('fr.mine') : row.name ?? rt('rk.private'));
  const back = h('button', { class: 'icon-btn fr-back', 'aria-label': t('common.close') }, '‹');
  const stage = h('div', { class: 'fr-stage' });
  const info = h('div', { class: 'fr-info' });
  const d: HTMLDialogElement = h('dialog', { class: 'fr-page' }, h('header', { class: 'fr-page-top' }, back, title), h('div', { class: 'fr-page-body' }, stage, info));
  // Back (and Android's back button) closes the page.
  let pushed = false;
  try { history.pushState({ frPage: pid }, ''); pushed = true; } catch { /* ignore */ }
  const onPop = () => { pushed = false; d.close(); };
  window.addEventListener('popstate', onPop);
  const close = () => { if (pushed) history.back(); else d.close(); };
  back.onclick = close;
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('close', () => { window.removeEventListener('popstate', onPop); d.remove(); });
  window.addEventListener('hashchange', () => { pushed = false; d.close(); }, { once: true });
  document.body.append(d);
  d.showModal();

  let pairSig = '';
  const paint = () => {
    if (!prof) {
      stage.replaceChildren(pairSolo({ ...fromRow(row), private: true }));
      info.replaceChildren(h('p', { class: 'muted' }, ft('fr.private')));
      return;
    }
    const p = prof;
    const name = p.name ?? rt('rk.private');
    const f = p.friend;
    const on = !!f && f.meToday && f.themToday;
    // The characters are drawn once and kept while nothing about them changed (their animations keep running).
    const sig = JSON.stringify([p.relation === 'me', p.figure, myFigureCode(), on, f?.streak ?? 0, p.xp ?? null]);
    if (sig !== pairSig) {
      pairSig = sig;
      stage.replaceChildren(p.relation === 'me' ? h('div', { class: 'fr-solo' }, pairSolo(p)) : pair(myFigureCode(), p, on, f?.streak ?? 0, 116));
    }
    title.textContent = p.relation === 'me' ? ft('fr.mine') : name;
    const stat = (k: ShowKey, label: string, v: number | undefined, icon: Node | string = '') =>
      v === undefined ? '' : h('span', { class: `fr-stat s-${k}` }, h('b', {}, icon, num(v)), h('small', {}, label));
    const stats = h('div', { class: 'fr-stats' },
      stat('week', ft('fr.week'), p.week, ptsIcon()),
      stat('streak', ft('fr.flame'), p.streak, h('span', { class: 'fr-mini-flame' }, flame(1, 16, true))),
      stat('trophies', ft('fr.trophies'), p.trophies, '🏆 '),
      stat('pages', ft('fr.pages'), p.pages),
      stat('listen', ft('fr.listen'), p.listen));
    // Each action shows its result at once; the server's answer follows quietly.
    const act = (next: Profile['relation'], fn: () => Promise<unknown>, after?: (r: unknown) => void) => {
      const was = p.relation;
      prof = { ...p, relation: next, friend: next === 'friend' ? p.friend : undefined };
      haptic(10);
      paint();
      void fn().then((r) => { after?.(r); onChange(); return refresh(); }).catch((e) => { toast((e as Error).message); prof = { ...p, relation: was }; paint(); });
    };
    const main: Node[] = !known ? [h('span', { class: 'fr-acts-wait', 'aria-hidden': 'true' })]
      : p.relation === 'none' ? [h('button', { class: 'primary brand-btn fr-add', onclick: () => act('sent', () => askFriend(pid), (r) => toast(r === 'friend' ? ft('fr.joined') : ft('fr.sent'))) }, `＋ ${ft('fr.add')}`)]
        : p.relation === 'sent' ? [h('button', { class: 'chip', onclick: () => act('none', () => removeFriend(pid)) }, `${ft('fr.sent')} · ${ft('fr.cancel')}`)]
          : p.relation === 'asked' ? [h('button', { class: 'primary brand-btn', onclick: () => act('friend', () => answerFriend(pid, true), () => toast(ft('fr.joined'))) }, ft('fr.accept')),
            h('button', { class: 'chip', onclick: () => act('none', () => answerFriend(pid, false)) }, ft('fr.decline'))]
            : p.relation === 'friend' ? [h('span', { class: 'fr-badge' }, `✓ ${ft('fr.friends')}`)] : [];
    const actions = p.relation === 'me' ? '' : h('div', { class: 'fr-acts' }, ...main,
      known && p.room && !p.private ? h('button', { class: 'chip', onclick: () => { close(); void import('./room').then((m) => m.openVisit({ name: p.name, figure: p.figure ?? null, room: p.room ?? null })); } }, ft('fr.visit')) : '',
      known && p.relation === 'friend' ? h('button', { class: 'chip fr-remove', onclick: () => { if (confirm(ft('fr.removeAsk', { name }))) act('none', () => removeFriend(pid)); } }, ft('fr.remove')) : '');
    // Your own profile: choose what it shows (the stats above follow each switch).
    const mine = p.relation === 'me' ? (() => {
      let bits = myShow();
      const keys: [ShowKey, string][] = [['week', ft('fr.week')], ['streak', ft('fr.flame')], ['trophies', ft('fr.trophies')], ['pages', ft('fr.pages')], ['listen', ft('fr.listen')]];
      return h('div', { class: 'fr-mine' }, h('h3', {}, ft('fr.mine')), h('p', { class: 'muted small' }, ft('fr.mineSub')),
        h('div', { class: 'chips' }, ...keys.map(([k, label]) => {
          const b: HTMLButtonElement = h('button', { class: `chip${bits & SHOW[k] ? ' on' : ''}`, 'aria-pressed': String(!!(bits & SHOW[k])), onclick: () => {
            bits ^= SHOW[k];
            b.classList.toggle('on', !!(bits & SHOW[k]));
            b.setAttribute('aria-pressed', String(!!(bits & SHOW[k])));
            stats.querySelector(`.s-${k}`)?.classList.toggle('off', !(bits & SHOW[k]));
            haptic(6);
            void sendProfile(bits, true);
          } }, label);
          return b;
        })));
    })() : '';
    if (p.relation === 'me') { const bits = myShow(); for (const [k, v] of Object.entries(SHOW)) stats.querySelector(`.s-${k}`)?.classList.toggle('off', !(bits & v)); }
    info.replaceChildren(
      h('div', { class: 'fr-who' }, h('h3', {}, p.relation === 'me' ? `${name} · ${ft('fr.you2')}` : name), p.tier !== undefined ? tierBadge(p.tier) : ''),
      p.xp != null ? levelLine(p.xp) : '',
      f ? streakLine(f, name) : '',
      stats.childElementCount ? stats : '',
      actions, mine,
      f ? h('p', { class: 'muted small fr-help' }, ft('fr.help')) : '');
  };
  const refresh = async () => {
    try {
      const v = await rankProfile(pid, true);
      if (!d.isConnected) return;
      if (known && JSON.stringify(v) === JSON.stringify(prof)) return;
      prof = v;
      known = true;
      paint();
    } catch (e) { if (!known && d.isConnected) toast((e as Error).message); }
  };
  paint();
  void refresh();
}
/** "Level 12" with a bar to the next level. */
function levelLine(xp: number) {
  const { level, p, need } = levelProgress(xp);
  return h('div', { class: 'fr-level' },
    h('span', { class: `lv-pill${level >= 50 ? ' gold' : ''}` }, levelLabel(level)),
    h('span', { class: 'fr-level-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p * 100)) }, h('i', { style: `width:${Math.round(p * 100)}%` })),
    h('small', { class: 'muted' }, level >= 50 ? '' : ft('fr.levelNext', { n: num(need) })));
}
function pairSolo(p: Profile) {
  const a = actor('fr-fig', p.figure ?? null);
  return a ? withLevel(a.el, levelOf(p.xp ?? myXp())) : avatar(p.avatar ?? 0, p.tier ?? 0, 116, p.frame ?? 0, p.figure);
}

/** A friend streak milestone reached today (both earned points), each shown once: both characters power up together. */
let playing = false;
async function milestone(list: Friend[]) {
  if (playing || document.querySelector('dialog[open], .cel')) return;
  for (const f of list) {
    if (!f.pid || !f.meToday || !f.themToday || !MILESTONES.includes(f.streak)) continue;
    const key = `frMs:${f.pid}:${f.streak}`;
    try { if (localStorage.getItem(key)) continue; localStorage.setItem(key, '1'); } catch { continue; }
    if (!myFigureCode() || !f.figure) continue;
    playing = true;
    try { await powerUp(f.streak, { friend: { code: f.figure, name: f.name ?? '' } }); } finally { playing = false; }
    return;
  }
}

/** The Friends tab on Ranks: asks waiting, your friends with their streaks, and an invite link. */
export async function friendsTab(fresh: boolean, onChange: () => void): Promise<HTMLElement> {
  const data = await myFriends(fresh);
  friendsKept = data;
  void preloadProfiles(data.friends.map((f) => f.pid));
  const invite = h('button', { class: 'fr-invite', onclick: async () => {
    try {
      const code = await friendInvite();
      await share(ft('fr.invite'), ft('fr.inviteText'), friendInviteLink(code));
    } catch (e) { toast((e as Error).message); }
  } }, h('span', { class: 'fr-invite-ic', 'aria-hidden': 'true' }, '＋'), h('span', {}, h('b', {}, ft('fr.invite')), h('small', {}, ft('fr.inviteSub'))));
  // An answer shows at once: the ask leaves the list; the tab is redrawn quietly once the server has it.
  const answer = (e: Event, pid: string, ok: boolean) => {
    const row = (e.currentTarget as HTMLElement).closest('.fr-ask') as HTMLElement | null;
    row?.classList.add('gone');
    haptic(10);
    if (ok) toast(ft('fr.joined'));
    void answerFriend(pid, ok).then(onChange, (err) => { row?.classList.remove('gone'); toast((err as Error).message); });
  };
  const asks = data.asks.length ? h('section', { class: 'fr-asks' }, h('h3', {}, ft('fr.asks')),
    ...data.asks.map((a) => h('div', { class: 'fr-ask' },
      avatar(a.private ? null : a.avatar ?? 0, a.tier ?? 0, 40, a.frame ?? 0, a.figure),
      h('span', { class: 'fr-ask-name' }, ft('fr.asked', { name: a.name ?? rt('rk.private') })),
      h('button', { class: 'chip on', onclick: (e: Event) => answer(e, a.pid!, true) }, ft('fr.accept')),
      h('button', { class: 'chip', onclick: (e: Event) => answer(e, a.pid!, false) }, '✕')))) : '';
  const me = myFigureCode();
  const cards = data.friends.map((f) => {
    const on = f.meToday && f.themToday;
    const name = f.name ?? rt('rk.private');
    return h('button', { class: `fr-card${on ? ' on' : ''}`, onclick: () => void openProfile({ ...f, score: f.week }, onChange) },
      h('span', { class: 'fr-card-pair' }, pair(me, f, on, f.streak)),
      h('span', { class: 'fr-card-txt' }, h('b', {}, name),
        h('span', { class: 'fr-card-streak' }, h('span', { class: 'fr-mini-flame' }, flame(on ? 2 : f.streak ? 1 : 0, 16, true)), f.streak ? ft('fr.streak', { n: f.streak }) : ft('fr.streak0')),
        h('small', {}, on ? ft('fr.both') : f.themToday ? ft('fr.you') : f.meToday ? ft('fr.them', { name }) : ft('fr.neither'))));
  });
  setTimeout(() => void milestone(data.friends), 900);
  return h('div', { class: 'fr-tab' }, asks,
    cards.length ? h('div', { class: 'fr-cards' }, ...cards) : h('p', { class: 'muted fr-empty' }, ft('fr.empty')),
    invite,
    h('p', { class: 'muted small' }, ft('fr.help')));
}

/** #/rf/{code}: a friend's invite. Signed in → become friends and open Friends; else who sent it and a sign-in. */
export async function showFriendInvite(root: HTMLElement, code: string): Promise<() => void> {
  const box = h('div', { class: 'rk-invite me-card' }, h('p', { class: 'muted' }, rt('rk.loading')));
  root.append(h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('h1', {}, rt('rk.title')))), box, tabBar('ranks'));
  const p = await friendInvitePreview(code).catch(() => null);
  if (!p) { box.replaceChildren(h('p', {}, ft('fr.linkBad'))); return () => {}; }
  const open = () => { try { sessionStorage.setItem('rankView', 'friends'); } catch { /* ignore */ } location.hash = '#/ranks'; };
  const go = async () => {
    try { await joinFriend(code); toast(ft('fr.joined')); } catch (e) { toast((e as Error).message); return; }
    open();
  };
  const a = actor('fr-fig', p.figure);
  box.replaceChildren(
    h('div', { class: 'fr-inv-fig' }, a ? a.el : avatar(p.avatar, p.tier, 88, p.frame, p.figure)),
    h('h2', {}, ft('fr.linkTitle', { name: p.name })),
    h('p', { class: 'muted' }, p.mine ? ft('fr.yours') : p.friend ? ft('fr.already') : ft('fr.linkSub')),
    p.mine || p.friend ? h('button', { class: 'primary brand-btn', onclick: open }, ft('fr.open'))
      : account() ? h('button', { class: 'primary brand-btn', onclick: go }, ft('fr.linkJoin'))
        : h('button', { class: 'primary brand-btn', onclick: () => { try { sessionStorage.setItem(PENDING, code); } catch { /* ignore */ } openAccount(); } }, ft('fr.linkSignIn')));
  if (a) setTimeout(() => a.wave(2000), 500);
  return () => {};
}

/** A friend link opened before signing in: become friends now (called when Ranks opens). */
export async function takePendingFriend(): Promise<boolean> {
  let code: string | null = null;
  try { code = sessionStorage.getItem(PENDING); } catch { /* ignore */ }
  if (!code || !account()) return false;
  try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ }
  try { await joinFriend(code); toast(ft('fr.joined')); return true; } catch (e) { toast((e as Error).message); return false; }
}

/** Called while the league shows: the Friends tab and the profiles a tap may open are fetched ahead. */
export function warmFriends(leaguePids: (string | null | undefined)[]) {
  void preloadProfiles(leaguePids);
  void myFriends().then((f) => { friendsKept = f; void preloadProfiles(f.friends.map((x) => x.pid)); }).catch(() => {});
}
