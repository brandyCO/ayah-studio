// Friends on Ranks (owner request 2026-11-11): a tap on a player in the league opens a small profile — what they chose to
// show and both characters standing side by side — where you can ask to be friends; an invite link (#/rf/{code}) makes
// friends at once. Two friends keep a friend streak (the days in a row both earned points, counted by the server). While
// both have earned points today their characters stand on fire together, and on 7 / 30 / 100 / 365 days they power up
// together full screen (powerUp.ts). Simple on purpose: no explaining needed beyond one line.
import { account } from '../cloud/auth';
import { ft } from '../i18n/friends';
import { rt } from '../i18n/ranks';
import {
  SHOW, answerFriend, askFriend, friendInvite, friendInviteLink, friendInvitePreview, joinFriend, myFriends, myShow, rankProfile, removeFriend, sendProfile,
  type Friend, type Profile, type Row, type ShowKey,
} from '../together/ranks';
import { myFigureCode, actor } from './actor';
import { avatar } from './rankAvatars';
import { blazingPair, powerLevel, powerUp } from './powerUp';
import { ptsIcon, sheet, share, tierBadge } from './ranks';
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
function pair(me: string | null, them: Row | Profile | Friend, on: boolean, streak: number): HTMLElement {
  const a = actor('fr-fig', me);
  const b = them.private ? null : actor('fr-fig', them.figure ?? null);
  if (a && b) {
    withLevel(a.el, levelOf(myXp()));
    if (them.xp != null) withLevel(b.el, levelOf(them.xp));
    const box = h('span', { class: 'fr-pair' }, blazingPair(powerLevel(Math.max(1, streak)), a.el, b.el, on));
    setTimeout(() => { if (on) { a.cheer(1600); b.cheer(1600); } else { a.wave(1400); b.hop(0.4); } }, 380);
    return box;
  }
  const disc = (fig: string | null, r?: Row | Profile | Friend) => avatar(r?.private ? null : r?.avatar ?? 0, r?.tier ?? 0, 72, r?.frame ?? 0, fig);
  return h('span', { class: `fr-pair discs${on ? ' on' : ''}` }, disc(me), disc(them.private ? null : them.figure ?? null, them));
}

const streakLine = (f: { streak: number; meToday: boolean; themToday: boolean }, name: string) =>
  h('div', { class: `fr-streak${f.meToday && f.themToday ? ' on' : ''}` },
    h('span', { class: 'fr-flame' }, flame(f.meToday && f.themToday ? 2 : f.streak ? 1 : 0, 26, true)),
    h('span', {}, h('b', {}, f.streak ? ft('fr.streak', { n: f.streak }) : ft('fr.streak0')),
      h('small', {}, f.meToday && f.themToday ? ft('fr.both') : f.themToday ? ft('fr.you') : f.meToday ? ft('fr.them', { name }) : ft('fr.neither'))));

/** The profile of a player (from their row on a board). */
export async function openProfile(row: Row, onChange: () => void = () => {}) {
  if (!row.pid) return;
  const box = h('div', { class: 'fr-prof' }, h('p', { class: 'muted' }, rt('rk.loading')));
  const d = sheet(row.me ? ft('fr.mine') : row.name ?? rt('rk.private'), box);
  d.classList.add('fr-sheet');
  let p: Profile | null = null;
  try { p = await rankProfile(row.pid); } catch (e) { box.replaceChildren(h('p', { class: 'muted' }, (e as Error).message)); return; }
  if (!p) { box.replaceChildren(h('p', { class: 'muted' }, ft('fr.private'))); return; }
  const prof = p;
  const name = prof.name ?? rt('rk.private');
  const f = prof.friend;
  const on = !!f && f.meToday && f.themToday;
  const stat = (k: ShowKey, label: string, v: number | undefined, icon: Node | string = '') =>
    v === undefined ? '' : h('span', { class: `fr-stat s-${k}` }, h('b', {}, icon, num(v)), h('small', {}, label));
  const stats = h('div', { class: 'fr-stats' },
    stat('week', ft('fr.week'), prof.week, ptsIcon()),
    stat('streak', ft('fr.flame'), prof.streak, h('span', { class: 'fr-mini-flame' }, flame(1, 16, true))),
    stat('trophies', ft('fr.trophies'), prof.trophies, '🏆 '),
    stat('pages', ft('fr.pages'), prof.pages),
    stat('listen', ft('fr.listen'), prof.listen));
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); haptic(10); onChange(); d.close(); void openProfile(row, onChange); } catch (e) { toast((e as Error).message); } };
  const main: Node[] = prof.relation === 'none' ? [h('button', { class: 'primary brand-btn fr-add', onclick: () => act(() => askFriend(row.pid!).then((r) => toast(r === 'friend' ? ft('fr.joined') : ft('fr.sent')))) }, `＋ ${ft('fr.add')}`)]
    : prof.relation === 'sent' ? [h('button', { class: 'chip', onclick: () => act(() => removeFriend(row.pid!)) }, `${ft('fr.sent')} · ${ft('fr.cancel')}`)]
      : prof.relation === 'asked' ? [h('button', { class: 'primary brand-btn', onclick: () => act(() => answerFriend(row.pid!, true)) }, ft('fr.accept')),
        h('button', { class: 'chip', onclick: () => act(() => answerFriend(row.pid!, false)) }, ft('fr.decline'))]
        : prof.relation === 'friend' ? [h('span', { class: 'fr-badge' }, `✓ ${ft('fr.friends')}`)] : [];
  const actions = prof.relation === 'me' ? '' : h('div', { class: 'fr-acts' }, ...main,
    prof.room && !prof.private ? h('button', { class: 'chip', onclick: () => { d.close(); void import('./room').then((m) => m.openVisit({ name: prof.name, figure: prof.figure ?? null, room: prof.room ?? null })); } }, ft('fr.visit')) : '',
    prof.relation === 'friend' ? h('button', { class: 'chip fr-remove', onclick: () => { if (confirm(ft('fr.removeAsk', { name }))) void act(() => removeFriend(row.pid!)); } }, ft('fr.remove')) : '');
  // Your own profile: choose what it shows.
  const mine = prof.relation === 'me' ? (() => {
    let bits = myShow();
    const keys: [ShowKey, string][] = [['week', ft('fr.week')], ['streak', ft('fr.flame')], ['trophies', ft('fr.trophies')], ['pages', ft('fr.pages')], ['listen', ft('fr.listen')]];
    return h('div', { class: 'fr-mine' }, h('p', { class: 'muted small' }, ft('fr.mineSub')),
      h('div', { class: 'chips' }, ...keys.map(([k, label]) => {
        const b: HTMLButtonElement = h('button', { class: `chip${bits & SHOW[k] ? ' on' : ''}`, 'aria-pressed': String(!!(bits & SHOW[k])), onclick: () => {
          bits ^= SHOW[k];
          b.classList.toggle('on', !!(bits & SHOW[k]));
          b.setAttribute('aria-pressed', String(!!(bits & SHOW[k])));
          haptic(6);
          void sendProfile(bits, true);
        } }, label);
        return b;
      })));
  })() : '';
  box.replaceChildren(
    prof.relation === 'me' ? h('div', { class: 'fr-solo' }, pairSolo(prof)) : pair(myFigureCode(), prof, on, f?.streak ?? 0),
    h('div', { class: 'fr-who' }, h('h3', {}, prof.relation === 'me' ? `${name} · ${ft('fr.you2')}` : name), prof.tier !== undefined ? tierBadge(prof.tier) : ''),
    prof.xp != null ? levelLine(prof.xp) : '',
    f ? streakLine(f, name) : '',
    stats.childElementCount ? stats : '',
    actions, mine,
    f ? h('p', { class: 'muted small fr-help' }, ft('fr.help')) : '');
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
  return a ? withLevel(a.el, levelOf(p.xp ?? myXp())) : avatar(p.avatar ?? 0, p.tier ?? 0, 96, p.frame ?? 0, p.figure);
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
  const invite = h('button', { class: 'fr-invite', onclick: async () => {
    try {
      const code = await friendInvite();
      await share(ft('fr.invite'), ft('fr.inviteText'), friendInviteLink(code));
    } catch (e) { toast((e as Error).message); }
  } }, h('span', { class: 'fr-invite-ic', 'aria-hidden': 'true' }, '＋'), h('span', {}, h('b', {}, ft('fr.invite')), h('small', {}, ft('fr.inviteSub'))));
  const asks = data.asks.length ? h('section', { class: 'fr-asks' }, h('h3', {}, ft('fr.asks')),
    ...data.asks.map((a) => h('div', { class: 'fr-ask' },
      avatar(a.private ? null : a.avatar ?? 0, a.tier ?? 0, 40, a.frame ?? 0, a.figure),
      h('span', { class: 'fr-ask-name' }, ft('fr.asked', { name: a.name ?? rt('rk.private') })),
      h('button', { class: 'chip on', onclick: async () => { try { await answerFriend(a.pid!, true); toast(ft('fr.joined')); onChange(); } catch (e) { toast((e as Error).message); } } }, ft('fr.accept')),
      h('button', { class: 'chip', onclick: async () => { try { await answerFriend(a.pid!, false); onChange(); } catch (e) { toast((e as Error).message); } } }, '✕')))) : '';
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
