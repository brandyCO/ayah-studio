// Friends on Ranks (owner request 2026-11-11): a tap on a player in the league opens a small profile — what they chose to
// show and both characters standing side by side — where you can ask to be friends; an invite link (#/rf/{code}) makes
// friends at once. Two friends keep a friend streak (the days in a row both earned points, counted by the server). While
// both have earned points today their characters stand on fire together, and on 7 / 30 / 100 / 365 days they power up
// together full screen (powerUp.ts). Simple on purpose: no explaining needed beyond one line.
import { account } from '../cloud/auth';
import { icon } from './icons';
import { ft, type FriendKey } from '../i18n/friends';
import { rt } from '../i18n/ranks';
import {
  SHOW, socialUnchanged, markSocialSeen, answerFriend, cheerFeat, featsFeed, type Feat, type Feats, friendMilestoneDue, askFriend, claimInvite, friendInvite, friendInviteLink, friendInvitePreview, joinFriend, myFriends, myInvites, myShow, peekProfile, preloadProfiles, rankProfile, removeFriend, sendProfile,
  blockPlayer, unblockPlayer, myBlocks, reportPlayer, type ReportWhy, followPlayer, unfollowPlayer, followList, dropFollower, myFlag, setFlag, myFollows, newFollowers, markFollowersSeen, type Follower, type Follows,
  type Friend, type Friends, type Invites, type Profile, type Row, type ShowKey,
  profileAt, keptSince,
} from '../together/ranks';
import { updatedNote } from './updatedAgo';
import { isOffline } from '../together/outbox';
import { myFigureCode, actor } from './actor';
import { avatar, trophy } from './rankAvatars';
import { blazingPair, powerLevel, powerUp } from './powerUp';
import { ptsIcon, share, sheet, tierBadge } from './ranks';
import { lampLine, lampPill } from './lampPill';
import { surahName, t } from '../i18n';
import { loadMeta, type SurahMeta } from '../data/quran';
import { openAccount } from './account';
import { flame } from './flame';
import { richIcon, levelIcon } from './richIcon';
import { h, haptic, skeletonRows, toast } from './dom';
import { tabBar } from './tabs';
import { levelLabel, levelOf, levelProgress, myXp } from '../data/xp';
import { withLevel } from './levelLook';
import { dayKey } from '../data/readLog';
import { BADGES } from '../data/badges';
import { hifzBadge, parseHifz } from './hifzBadge';
import { badgeArt } from './badge';
import { countryName, flagImg, pickFlag } from './flag';
import './friends.css';

const num = (n: number) => n.toLocaleString();
const PENDING = 'pendingFriend';

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
  // Without a connection the page shows what this phone kept (or the board row), with when it was brought.
  const ago = updatedNote(() => profileAt(pid), 120_000, { offlineAlone: true });
  const back = h('button', { class: 'icon-btn fr-back back-btn', 'aria-label': t('common.close') }, icon('back', 22));
  const stage = h('div', { class: 'fr-stage' });
  const info = h('div', { class: 'fr-info' });
  // ⋯ Report / Block (App Store guideline 1.2): on every other player's profile.
  const more = h('button', { class: 'icon-btn fr-more', 'aria-label': ft('fr.more'), hidden: row.me ? true : undefined }, '⋯');
  const d: HTMLDialogElement = h('dialog', { class: 'fr-page' }, h('header', { class: 'fr-page-top' }, back, title, more), h('div', { class: 'fr-page-body' }, ago, stage, info));
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

  let unfriend: (() => void) | null = null;
  more.onclick = () => playerMenu(unfriend, pid, prof?.blocked ? null : prof?.name ?? row.name ?? null, !!prof?.blocked, () => { onChange(); prof = { ...(prof ?? fromRow(row)), blocked: true, name: null, figure: null }; paint(); void refresh(); }, () => { onChange(); void refresh(); });
  let pairSig = '';
  const paint = () => {
    if (prof?.blocked) {
      // Blocked: nothing of theirs shows, only the way back.
      pairSig = '';
      title.textContent = ft('fr.blockedName');
      stage.replaceChildren(pairSolo({ ...fromRow(row), private: true, figure: null }));
      info.replaceChildren(h('p', { class: 'muted' }, ft('fr.blocked')),
        h('button', { class: 'chip', onclick: () => void unblockPlayer(pid).then(() => { toast(ft('fr.unblocked')); onChange(); return refresh(); }).catch((e) => toast((e as Error).message)) }, ft('fr.unblock')));
      return;
    }
    if (!prof) {
      stage.replaceChildren(pairSolo({ ...fromRow(row), private: true }));
      info.replaceChildren(h('p', { class: 'muted' }, ft('fr.private')));
      return;
    }
    const p = prof;
    const name = p.name ?? rt('rk.private');
    const f = p.friend;
    const mineP = p.relation === 'me';
    // The header: the player in their own room (owner 2026-11-18), drawn once and kept while nothing about it changed.
    const sig = JSON.stringify([mineP, p.figure, mineP ? myFigureCode() : '', p.room ?? null, p.badges?.top ?? [], p.xp ?? null]);
    if (sig !== pairSig) {
      pairSig = sig;
      stage.replaceChildren(h('div', { class: 'fr-solo' }, pairSolo(p)));
      const fig = mineP ? myFigureCode() : p.figure;
      if (fig && !p.private) void import('./room').then((m) => {
        if (pairSig !== sig || !d.isConnected) return;
        const scene = m.roomStage(mineP ? undefined : { figure: p.figure ?? null, room: p.room ?? null, badges: p.badges?.top, best: p.streak });
        if (!scene) return;
        const room = h('button', { class: 'fr-room', 'aria-label': ft('fr.visit'), onclick: () => {
          if (mineP) { close(); location.hash = '#/me/room'; } else m.openVisit({ name: p.name, figure: p.figure ?? null, room: p.room ?? null, badges: p.badges?.top });
        } }, scene);
        stage.replaceChildren(room);
      });
    }
    title.textContent = mineP ? ft('fr.mine') : name;
    const stat = (k: ShowKey, label: string, v: number | undefined, icon: Node | string = '') =>
      v === undefined ? '' : h('span', { class: `fr-stat s-${k}` }, h('b', {}, icon, num(v)), h('small', {}, label));
    // All-time XP first: it never resets (the level shows it anyway), so a new week's 0 never reads as XP lost.
    const total = p.xp != null ? h('span', { class: 'fr-stat s-total' }, h('b', {}, ptsIcon(), num(p.xp)), h('small', {}, ft('fr.total'))) : '';
    const stats = h('div', { class: 'fr-stats' }, total,
      stat('week', ft('fr.week'), p.week, ptsIcon()),
      stat('streak', ft('fr.flame'), p.streak, h('span', { class: 'fr-mini-flame' }, flame(1, 16, true))),
      stat('trophies', ft('fr.trophies'), p.trophies, icon('trophy', 16)),
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
    // Follow: one tap, no request (owner 2026-11-18). Friends (asked and accepted) is the closer bond beside it.
    const fw = p.follow;
    const follow = (on: boolean) => {
      if (!fw) return;
      haptic(on ? 14 : 8);
      const was = p;
      prof = { ...p, follow: { ...fw, on, followers: Math.max(0, fw.followers + (on ? 1 : -1)) } };
      paint();
      if (on) void import('./sfx').then((m) => m.sfx.pop?.()).catch(() => {});
      void (on ? followPlayer(pid) : unfollowPlayer(pid)).then(() => { onChange(); return refresh(); })
        .catch((e) => { toast((e as Error).message); prof = was; paint(); });
    };
    const followBtn = !known || mineP || !fw ? ''
      : fw.on ? h('button', { class: 'chip fr-following', 'aria-pressed': 'true', onclick: () => follow(false) }, `✓ ${ft('fr.followingBtn')}`)
        : h('button', { class: 'primary brand-btn fr-follow', 'aria-pressed': 'false', onclick: () => follow(true) }, fw.back ? ft('fr.followBack') : `＋ ${ft('fr.follow')}`);
    const friendBtns: Node[] = !known ? [h('span', { class: 'fr-acts-wait', 'aria-hidden': 'true' })]
      : p.relation === 'none' ? [h('button', { class: 'chip fr-add', onclick: () => act('sent', () => askFriend(pid), (r) => toast(r === 'friend' ? ft('fr.joined') : ft('fr.sent'))) }, icon('heart', 16), ft('fr.add'))]
        : p.relation === 'sent' ? [h('button', { class: 'chip', onclick: () => act('none', () => removeFriend(pid)) }, `${ft('fr.sent')} · ${ft('fr.cancel')}`)]
          : p.relation === 'asked' ? [h('button', { class: 'primary brand-btn', onclick: () => act('friend', () => answerFriend(pid, true), () => toast(ft('fr.joined'))) }, ft('fr.accept')),
            h('button', { class: 'chip', onclick: () => act('none', () => answerFriend(pid, false)) }, ft('fr.decline'))]
            : p.relation === 'friend' ? [h('span', { class: 'fr-badge' }, `✓ ${ft('fr.friends')}`),
              h('button', { class: 'chip fr-ch', onclick: () => challenge(pid, name, onChange) }, icon('swords', 18), chLabel),
              h('button', { class: 'chip fr-gift', onclick: () => void import('./giftSend').then((m) => m.openGiftSheet(pid, name)) }, icon('gift', 18), ft('fr.gift'))] : [];
    const actions = mineP ? '' : h('div', { class: 'fr-acts' }, followBtn, ...friendBtns);
    // Remove friend lives in ⋯ (less on the page).
    unfriend = known && p.relation === 'friend' ? () => { if (confirm(ft('fr.removeAsk', { name }))) act('none', () => removeFriend(pid)); } : null;
    // Followers · Following, like Duolingo: tap a count for the list.
    const counts = fw ? h('div', { class: 'fr-counts' },
      h('button', { class: 'fr-count', onclick: () => openFollowList(pid, 'followers', name, onChange) }, h('b', {}, num(fw.followers)), h('small', {}, ft('fr.followers'))),
      h('button', { class: 'fr-count', onclick: () => openFollowList(pid, 'following', name, onChange) }, h('b', {}, num(fw.following)), h('small', {}, ft('fr.followingN'))),
      !mineP && fw.back ? h('span', { class: 'fr-back-pill' }, ft('fr.followsYou')) : '') : '';
    // Badges they earned (the rarest first), and their trophies.
    const defs = (p.badges?.top ?? []).map((id) => BADGES.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
    const badges = defs.length || (mineP && p.badges) ? h('section', { class: 'fr-shelf s-badges' },
      h('h3', {}, ft('fr.badges'), p.badges && p.badges.n > defs.length ? h('small', {}, ` · ${ft('fr.badgesN', { n: p.badges.n })}`) : ''),
      defs.length ? h('div', { class: 'fr-shelf-row' }, ...defs.map((x) => badgeArt(x.tier, x.icon, true, 48))) : h('p', { class: 'muted small' }, ft('fr.badgesNone'))) : '';
    // Their Hifz badges: how many surahs they hold and the best two (sent among the badges, hifzBadge.ts).
    const hz = parseHifz(p.badges?.top);
    const hifz = hz.count ? h('section', { class: 'fr-shelf s-hifz' },
      h('h3', {}, ft(mineP ? (hz.count === 1 ? 'fr.myHeart1' : 'fr.myHeartN') : hz.count === 1 ? 'fr.heart1' : 'fr.heartN', { n: hz.count })),
      h('div', { class: 'fr-shelf-row' }, ...hz.list.map((x) => hifzBadge(x.s, x.tier, 52)))) : '';
    const cups = p.cups?.length ? h('section', { class: 'fr-shelf' }, h('h3', {}, ft('fr.trophies')),
      h('div', { class: 'fr-shelf-row' }, ...p.cups.map((place) => h('span', { class: `fr-cup p${place}`, title: `#${place}` }, trophy(place, 34))))) : '';
    // Your own profile: your flag, and what it shows (the stats above follow each switch).
    const mine = mineP ? (() => {
      let bits = myShow();
      const keys: [ShowKey, string][] = [['week', ft('fr.weekXp')], ['streak', ft('fr.flame')], ['trophies', ft('fr.trophies')], ['pages', ft('fr.pages')], ['listen', ft('fr.listen')], ['badges', ft('fr.badges')]];
      const code = p.flag ?? myFlag();
      const flagBtn = h('button', { class: 'chip fr-flag-btn', onclick: () => pickFlag(code ?? '', { title: ft('fr.flagPick'), sub: ft('fr.flagSub'), none: ft('fr.flagNone'), search: ft('fr.flagSearch') },
        async (c) => { await setFlag(c); prof = { ...p, flag: c || null }; paint(); onChange(); }) },
        code ? flagImg(code, 16) : icon('flag', 16), code ? countryName(code) : ft('fr.flagAdd'));
      return h('div', { class: 'fr-mine' }, h('h3', {}, ft('fr.edit')),
        h('div', { class: 'chips' }, flagBtn),
        h('p', { class: 'muted small' }, ft('fr.mineSub')),
        h('div', { class: 'chips' }, ...keys.map(([k, label]) => {
          const b: HTMLButtonElement = h('button', { class: `chip${bits & SHOW[k] ? ' on' : ''}`, 'aria-pressed': String(!!(bits & SHOW[k])), onclick: () => {
            bits ^= SHOW[k];
            b.classList.toggle('on', !!(bits & SHOW[k]));
            b.setAttribute('aria-pressed', String(!!(bits & SHOW[k])));
            stats.querySelector(`.s-${k}`)?.classList.toggle('off', !(bits & SHOW[k]));
            info.querySelector(`.s-${k}`)?.classList.toggle('off', !(bits & SHOW[k]));
            haptic(6);
            void sendProfile(bits, true);
          } }, label);
          return b;
        })));
    })() : '';
    info.replaceChildren(
      h('div', { class: 'fr-who' }, h('h3', {}, p.private ? '' : flagImg(p.flag, 18), mineP ? `${name} · ${ft('fr.you2')}` : name), p.tier !== undefined ? tierBadge(p.tier) : ''),
      counts,
      p.xp != null ? levelLine(p.xp) : '',
      p.private ? '' : lampLine(p.lamp),
      actions,
      f ? streakLine(f, name) : '',
      stats.childElementCount ? stats : '',
      hifz, badges, cups, mine,
      f ? h('p', { class: 'muted small fr-help' }, ft('fr.help')) : !mineP && known ? h('p', { class: 'muted small fr-help' }, ft('fr.friendHint')) : '');
    if (mineP) { const bits = myShow(); for (const [k, v] of Object.entries(SHOW)) info.querySelector(`.s-${k}`)?.classList.toggle('off', !(bits & v)); }
  };
  const refresh = async () => {
    try {
      const v = await rankProfile(pid, true);
      if (!d.isConnected) return;
      ago.update();
      if (known && JSON.stringify(v) === JSON.stringify(prof)) return;
      prof = v;
      known = true;
      paint();
    } catch (e) {
      ago.update();
      // Offline: no error, the kept page and its "Offline · 5 min ago" note stay; it fills in when back online.
      if (isOffline(e)) { if (d.isConnected) addEventListener('online', () => { if (d.isConnected) void refresh(); }, { once: true }); return; }
      if (!known && d.isConnected) toast((e as Error).message);
    }
  };
  // Built before it is shown, so the page slides in smoothly from its first frame.
  paint();
  document.body.append(d);
  d.showModal();
  void refresh();
}
/** Followers or Following of a player: a sheet of rows (tap → that profile), with Follow / Remove on your own. */
function openFollowList(pid: string, kind: 'followers' | 'following', name: string, onChange: () => void) {
  const box = h('div', { class: 'fr-follow-list' }, skeletonRows(4, true));
  const d = sheet(kind === 'followers' ? ft('fr.followers') : ft('fr.followingN'), box);
  void followList(pid, kind).then((rows) => {
    if (!d.isConnected) return;
    if (!rows.length) { box.replaceChildren(h('p', { class: 'muted' }, kind === 'followers' ? ft('fr.noFollowers', { name }) : ft('fr.noFollowing', { name }))); return; }
    const mineList = peekProfile(pid)?.relation === 'me';
    box.replaceChildren(...rows.map((r) => {
      const me = r.me;
      const btn = me || !r.pid ? '' : r.on
        ? h('button', { class: 'chip', onclick: (e: Event) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; void unfollowPlayer(r.pid!).then(() => { r.on = false; b.replaceWith(h('span', { class: 'muted small' }, '')); onChange(); }, (er) => { b.disabled = false; toast((er as Error).message); }); } }, `✓ ${ft('fr.followingBtn')}`)
        : h('button', { class: 'chip on', onclick: (e: Event) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; haptic(12); void followPlayer(r.pid!).then(() => { b.textContent = `✓ ${ft('fr.followingBtn')}`; b.classList.remove('on'); onChange(); }, (er) => { b.disabled = false; toast((er as Error).message); }); } }, kind === 'followers' && mineList ? ft('fr.followBack') : ft('fr.follow'));
      const drop = mineList && kind === 'followers' && r.pid ? h('button', { class: 'icon-btn fr-drop', 'aria-label': ft('fr.removeFollower'), title: ft('fr.removeFollower'), onclick: (e: Event) => {
        const row = (e.currentTarget as HTMLElement).closest('.fr-follow-row');
        void dropFollower(r.pid!).then(() => { row?.remove(); onChange(); }, (er) => toast((er as Error).message));
      } }, '✕') : '';
      return h('div', { class: 'fr-follow-row' },
        h('button', { class: 'fr-follow-who', onclick: () => { d.close(); void openProfile({ ...r, score: 0 }, onChange); } },
          avatar(r.avatar ?? 0, r.tier ?? 0, 40, r.frame ?? 0, r.figure), h('b', {}, flagImg(r.flag, 13), r.name ?? rt('rk.private'))),
        btn, drop);
    }));
  }, (e) => box.replaceChildren(h('p', { class: 'muted' }, (e as Error).message)));
}

/** ⋯ on a profile: report the player, block (or unblock) them. */
function playerMenu(unfriend: (() => void) | null, pid: string, name: string | null, blocked: boolean, onBlocked: () => void, onUnblocked: () => void) {
  const who = name ?? ft('fr.thisPlayer');
  const d = sheet(who,
    h('div', { class: 'menu' },
      unfriend ? h('button', { class: 'menu-item', onclick: () => { d.close(); unfriend(); } }, icon('close', 18), ft('fr.remove')) : '',
      h('button', { class: 'menu-item', onclick: () => { d.close(); openReport(pid, name, onBlocked); } }, icon('flag', 18), ft('fr.report')),
      blocked
        ? h('button', { class: 'menu-item', onclick: () => { d.close(); void unblockPlayer(pid).then(() => { toast(ft('fr.unblocked')); onUnblocked(); }).catch((e) => toast((e as Error).message)); } }, icon('lock', 18), ft('fr.unblock'))
        : h('button', { class: 'menu-item fr-block', onclick: () => { d.close(); askBlock(pid, who, onBlocked); } }, icon('lock', 18), ft('fr.block'))));
}
function askBlock(pid: string, who: string, onBlocked: () => void) {
  const go: HTMLButtonElement = h('button', { class: 'primary fr-block-go' }, icon('lock', 18), ft('fr.block'));
  const d = sheet(ft('fr.block'), h('p', { class: 'muted' }, ft('fr.blockAsk', { name: who })),
    h('div', { class: 'fr-acts' }, h('button', { class: 'chip', onclick: () => d.close() }, t('common.cancel')), go));
  go.onclick = () => {
    go.disabled = true;
    haptic(10);
    void blockPlayer(pid).then(() => { d.close(); toast(ft('fr.blockedToast')); onBlocked(); })
      .catch((e) => { go.disabled = false; toast((e as Error).message); });
  };
}
/** Report a player: a reason from four, a note if wanted; then the choice to block them too. */
function openReport(pid: string, name: string | null, onBlocked: () => void) {
  let why: ReportWhy | null = null;
  const reasons: ReportWhy[] = ['name', 'character', 'spam', 'other'];
  const send: HTMLButtonElement = h('button', { class: 'primary brand-btn', disabled: true }, ft('fr.reportSend'));
  const chips = reasons.map((r) => {
    const b: HTMLButtonElement = h('button', { class: 'chip', 'aria-pressed': 'false', onclick: () => {
      why = r;
      for (const c of chips) { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', String(c === b)); }
      send.disabled = false;
    } }, ft(`fr.why.${r}` as FriendKey));
    return b;
  });
  const note: HTMLTextAreaElement = h('textarea', { class: 'fr-report-note', maxlength: 500, rows: 3, placeholder: ft('fr.reportNote') });
  const d = sheet(ft('fr.reportTitle'), h('p', { class: 'muted small' }, ft('fr.reportSub')), h('div', { class: 'chips fr-why' }, ...chips), note, send);
  send.onclick = () => {
    if (!why) return;
    send.disabled = true;
    void reportPlayer(pid, why, note.value).then(() => {
      d.replaceChildren(h('div', { class: 'sheet-head' }, h('h2', {}, ft('fr.reportThanks'))),
        h('p', { class: 'muted' }, ft('fr.reportNext')),
        h('div', { class: 'fr-acts' },
          h('button', { class: 'chip fr-block', onclick: () => { d.close(); askBlock(pid, name ?? ft('fr.thisPlayer'), onBlocked); } }, icon('lock', 18), ft('fr.alsoBlock')),
          h('button', { class: 'primary brand-btn', onclick: () => d.close() }, t('common.close'))));
    }).catch((e) => { send.disabled = false; toast((e as Error).message); });
  };
}

/** Me → Settings → App → Blocked players: everyone you blocked, each with Unblock. */
export async function openBlocked() {
  const box = h('div', { class: 'fr-blocked-list' }, skeletonRows(3, true));
  sheet(ft('fr.blockedList'), box);
  const fill = async () => {
    let rows: { pid: string; name: string | null }[];
    try { rows = account() ? await myBlocks() : []; } catch (e) { box.replaceChildren(h('p', { class: 'muted' }, (e as Error).message)); return; }
    box.replaceChildren(...(rows.length ? rows.map((r) => h('div', { class: 'fr-blocked-row' }, h('span', {}, r.name ?? ft('fr.thisPlayer')),
      h('button', { class: 'chip', onclick: () => void unblockPlayer(r.pid).then(() => { toast(ft('fr.unblocked')); return fill(); }).catch((e) => toast((e as Error).message)) }, ft('fr.unblock'))))
      : [h('p', { class: 'muted' }, ft('fr.blockedNone'))]));
  };
  await fill();
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

/** A friend streak milestone reached (the server counts the days you both earned XP, through today once both have):
 *  both characters power up together, each milestone once per device. */
let playing = false;
export async function friendMilestone(list: Friend[]) {
  const route = location.hash;
  if (playing || document.hidden || document.querySelector('dialog[open], .cel') || /^#\/(reel|kids|t\/)/.test(route)) return;
  if (!myFigureCode()) return;
  const f = friendMilestoneDue(list);
  if (!f) return;
  try { localStorage.setItem(`frMs:${f.pid}:${f.streak}`, '1'); } catch { return; }
  playing = true;
  try { await powerUp(f.streak, { friend: { code: f.private ? null : f.figure ?? null, name: f.name ?? '', lamp: f.private ? '' : lampPill(f.lamp, true) } }); } finally { playing = false; }
}

/** The daily friend streak moment (owner 2026-11-12: "the same flame … animated, the character inside the flame"):
 *  the power-up with both characters inside the smooth flame, for the friend with the longest streak kept today
 *  (the others are marked seen with it). Once a day per friend. Without a character: a small card with the discs. */
export async function friendDayMoment(list: Friend[]) {
  const route = location.hash;
  if (playing || document.hidden || document.querySelector('dialog[open], .cel, .fd-moment') || /^#\/(reel|kids|t\/)/.test(route)) return;
  const today = dayKey();
  try { for (const f of list) localStorage.setItem(`frUp:${today}:${f.pid}`, '1'); } catch { return; }
  const me = myFigureCode();
  if (me) {
    const top = [...list].sort((x, y) => y.streak - x.streak)[0];
    playing = true;
    try {
      const p = powerUp(Math.max(1, top.streak), { friend: { code: top.private ? null : top.figure ?? null, name: top.private ? rt('rk.private') : top.name ?? '', lamp: top.private ? '' : lampPill(top.lamp, true) } });
      if (p) { await p; return; }
    } finally { playing = false; }
  }
  await import('./challenges.css');
  const rows = list.slice(0, 4).map((f) => {
    const name = f.private ? rt('rk.private') : f.name ?? rt('rk.private');
    return h('div', { class: 'fd-row' },
      h('span', { class: 'fd-pair' }, avatar(0, 0, 40, 0, me), avatar(f.private ? null : f.avatar ?? 0, f.tier ?? 0, 40, f.frame ?? 0, f.private ? null : f.figure)),
      h('b', {}, name, f.private ? '' : lampPill(f.lamp)),
      h('span', { class: 'fd-n' }, flame(2, 22, true), String(f.streak)));
  });
  const ok = h('button', { class: 'primary brand-btn' }, ft('fr.keepGoing'));
  const box = h('div', { class: 'fd-moment', role: 'dialog', 'aria-modal': 'true', 'aria-label': ft('fr.keptTitle') },
    h('div', { class: 'fd-card' }, h('h2', {}, ft('fr.keptTitle')), h('p', { class: 'muted' }, ft('fr.keptSub')), h('div', { class: 'fd-list' }, ...rows), ok));
  document.body.append(box);
  haptic(14);
  void import('./sfx').then((m) => m.sfx.pop?.()).catch(() => {});
  await new Promise<void>((res) => {
    const close = () => { box.remove(); res(); };
    ok.addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    window.addEventListener('hashchange', close, { once: true });
  });
}

/** Challenge a friend in a good deed (src/ui/challenges.ts). */
let chLabel = 'Challenge';
void import('../i18n/challenges').then((m) => { chLabel = m.clt('cl.challenge'); });
function challenge(pid: string | null | undefined, name: string, after?: () => void) {
  if (!pid) return;
  haptic(8);
  void import('./challenges').then((m) => m.openChallengePicker({ pid, name }, after));
}

/** The Friends tab on Ranks: asks waiting, your friends with their streaks, and an invite link. */
/** The Friends tab came on screen (it was built ahead): its new followers count as seen, a friend moment may play. */
export function friendsShown() {
  void myFollows().then(markFollowersSeen, () => {});
  if (friendsKept) setTimeout(() => void friendMilestone(friendsKept!.friends), 600);
}
/** `hidden`: built ahead beside another tab, so nothing is marked seen and no moment plays yet. */
export async function friendsTab(fresh: boolean, onChange: () => void, hidden = false): Promise<HTMLElement> {
  const [data, inv, feats, meta, follows] = await Promise.all([myFriends(fresh), myInvites(fresh).catch(() => null), featsFeed(fresh).catch(() => null),
    loadMeta().catch(() => null), myFollows(fresh).catch(() => null)]);
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
    const ch = h('button', { class: 'chip fr-ch-btn', 'aria-label': `${chLabel} ${name}`, onclick: () => challenge(f.pid, name, onChange) }, icon('swords', 18), chLabel);
    return h('div', { class: 'fr-card-wrap' }, ch, h('button', { class: `fr-card${on ? ' on' : ''}`, onclick: () => void openProfile({ ...f, score: f.week }, onChange) },
      h('span', { class: 'fr-card-pair' }, pair(me, f, on, f.streak)),
      h('span', { class: 'fr-card-txt' }, h('b', {}, f.private ? '' : flagImg(f.flag, 13), name, f.private ? '' : lampPill(f.lamp)),
        f.live ? h('span', { class: 'fr-live' }, h('i', { 'aria-hidden': 'true' }), ft(f.live === 'listen' ? 'fn.listening' : 'fn.reading')) : '',
        h('span', { class: 'fr-card-streak' }, h('span', { class: 'fr-mini-flame' }, flame(on ? 2 : f.streak ? 1 : 0, 16, true)), f.streak ? ft('fr.streak', { n: f.streak }) : ft('fr.streak0')),
        h('small', {}, on ? ft('fr.both') : f.themToday ? ft('fr.you') : f.meToday ? ft('fr.them', { name }) : ft('fr.neither')))));
  });
  if (!hidden) setTimeout(() => void friendMilestone(data.friends), 900);
  const fresh2 = newFollowers(follows);
  if (!hidden) markFollowersSeen(follows);
  return h('div', { class: 'fr-tab' }, updatedNote(() => keptSince('friends')), asks, newFollowersSection(fresh2, onChange), news(feats, meta),
    cards.length ? h('div', { class: 'fr-cards' }, ...cards) : h('p', { class: 'muted fr-empty' }, ft('fr.empty')),
    followingSection(follows, onChange),
    inviteRewards(inv, onChange),
    invite,
    h('p', { class: 'muted small' }, ft('fr.help')));
}

/** Who followed you lately (not followed back yet), each with Follow back. */
function newFollowersSection(list: Follower[], onChange: () => void): HTMLElement | string {
  if (!list.length) return '';
  return h('section', { class: 'fr-asks fr-new-followers' }, h('h3', {}, ft('fr.newFollowers')),
    ...list.slice(0, 6).map((f) => {
      const btn = h('button', { class: 'chip on' }, ft('fr.followBack'));
      btn.onclick = () => {
        haptic(10);
        btn.disabled = true;
        btn.classList.remove('on');
        btn.textContent = ft('fr.followingBtn');
        void followPlayer(f.pid!).then(onChange, (e) => { btn.disabled = false; btn.classList.add('on'); btn.textContent = ft('fr.followBack'); toast((e as Error).message); });
      };
      const name = f.name ?? rt('rk.private');
      return h('div', { class: 'fr-ask' },
        h('button', { class: 'fr-follow-who', onclick: () => void openProfile({ ...f, score: 0 } as Row, onChange) },
          avatar(f.private ? null : f.avatar ?? 0, f.tier ?? 0, 40, f.frame ?? 0, f.figure),
          h('span', { class: 'fr-ask-name' }, f.private ? '' : flagImg(f.flag, 13), ft('fr.followedYou', { name }))),
        btn);
    }));
}
/** People you follow who are not your friends: this week's XP and whether they are reading now. */
function followingSection(f: Follows | null, onChange: () => void): HTMLElement | string {
  const list = (f?.following ?? []).filter((x) => !x.friend);
  if (!list.length) return '';
  return h('section', { class: 'fr-following' }, h('h3', {}, ft('fr.followingTitle')),
    ...list.slice(0, 30).map((x) => {
      const name = x.name ?? rt('rk.private');
      return h('button', { class: 'fr-follow-row', onclick: () => void openProfile({ ...x, score: x.week } as Row, onChange) },
        avatar(x.private ? null : x.avatar ?? 0, x.tier ?? 0, 40, x.frame ?? 0, x.figure),
        h('span', { class: 'fr-follow-txt' }, h('b', {}, x.private ? '' : flagImg(x.flag, 13), name),
          x.live ? h('span', { class: 'fr-live' }, h('i', { 'aria-hidden': 'true' }), ft(x.live === 'listen' ? 'fn.listening' : 'fn.reading')) : ''),
        h('span', { class: 'fr-follow-xp' }, `${x.week} ${rt('rk.ptsShort')}`));
    }));
}

/** A milestone in a few words ("30-day streak", "Finished Al-Mulk"). */
export function featLabel(f: Feat, meta: SurahMeta[] | null): string {
  if (f.kind === 'surah') { const m = meta?.[f.n - 1]; return ft('fn.surah', { name: m ? surahName(m) : String(f.n) }); }
  return ft(`fn.${f.kind}` as FriendKey, { n: f.n });
}
const FEAT_IC: Record<Feat['kind'], string> = { streak: 'flame', level: 'star', surah: 'book', juz: 'book', khatm: 'trophy' };
/** A milestone's premium icon: the theme's own streak flame, a level shield with its number, the mushaf, a trophy. */
const featArt = (f: Feat, size: number): HTMLElement => f.kind === 'level' ? levelIcon(f.n, size)
  : f.kind === 'khatm' ? h('span', { class: 'rich-ic' }, trophy(1, size)) : richIcon(FEAT_IC[f.kind], size);
function ago(at: string) {
  const s = Math.max(0, (Date.now() - Date.parse(at)) / 1000);
  return s < 60 ? ft('fn.now') : s < 3600 ? ft('fn.min', { n: Math.floor(s / 60) }) : s < 86400 ? ft('fn.h', { n: Math.floor(s / 3600) }) : ft('fn.d', { n: Math.floor(s / 86400) });
}
/** Friends' milestones of the week, each with one MashaAllah; then mine that friends cheered. */
function news(feats: Feats | null, meta: SurahMeta[] | null): HTMLElement | string {
  if (!feats || (!feats.friends.length && !feats.mine.length)) return '';
  const rows = feats.friends.slice(0, 8).map((f) => {
    const btn = h('button', { class: `chip fn-cheer${f.cheered ? ' on' : ''}`, disabled: !!f.cheered, 'aria-pressed': String(!!f.cheered) },
      f.cheered ? ft('fn.cheered', { n: f.cheers ?? 1 }) : ft('fn.cheer'));
    btn.onclick = () => {
      haptic(14);
      btn.disabled = true;
      btn.classList.add('on', 'pop');
      btn.textContent = ft('fn.cheered', { n: (f.cheers ?? 0) + 1 });
      void import('./sfx').then((m) => m.sfx.pop?.()).catch(() => {});
      void cheerFeat(f.id).then((n) => { btn.textContent = ft('fn.cheered', { n }); },
        (e) => { btn.disabled = false; btn.classList.remove('on', 'pop'); btn.textContent = ft('fn.cheer'); toast((e as Error).message); });
    };
    return h('div', { class: `fn-row k-${f.kind}` },
      avatar(f.private ? null : f.avatar ?? 0, f.tier ?? 0, 40, f.frame ?? 0, f.figure),
      h('span', { class: 'fn-txt' }, h('b', {}, f.name ?? rt('rk.private')),
        h('span', { class: 'fn-what' }, h('span', { class: 'fn-ic', 'aria-hidden': 'true' }, featArt(f, 22)), featLabel(f, meta), h('small', {}, ` · ${ago(f.at)}`))),
      btn);
  });
  const mine = feats.mine.slice(0, 3).map((f) => {
    const by = (f.by ?? []).map((n) => n || ft('fn.someone'));
    return h('div', { class: 'fn-row fn-mine' }, h('span', { class: 'fn-ic big', 'aria-hidden': 'true' }, featArt(f, 40)),
      h('span', { class: 'fn-txt' }, h('b', {}, featLabel(f, meta)),
        h('span', { class: 'fn-what' }, by.length > 1 ? ft('fn.by2', { name: by[by.length - 1], n: by.length - 1 }) : ft('fn.by1', { name: by[0] ?? ft('fn.someone') }))));
  });
  return h('section', { class: 'fn-news' },
    rows.length ? h('h3', {}, ft('fn.title')) : '', ...rows,
    mine.length ? h('h3', {}, ft('fn.mine')) : '', ...mine);
}

/** App open / return: friends who said MashaAllah since last time, as one toast. */
export async function cheersArrived() {
  // Only my own part of the friends' fingerprint holds the MashaAllahs on my news: unchanged = nothing new (round 6).
  const pulse = await socialUnchanged('cheers', 'own');
  if (pulse.same) return;
  let feats: Feats;
  try { feats = await featsFeed(true); } catch { return; }
  if (!feats?.mine) return;
  markSocialSeen('cheers', pulse.p);
  let seen: Record<string, number> = {};
  let first = true;
  try { const raw = localStorage.getItem('featCheersSeen'); first = raw === null; seen = JSON.parse(raw ?? '{}') ?? {}; } catch { /* ignore */ }
  const fresh = feats.mine.filter((f) => (f.by?.length ?? 0) > (seen[f.id] ?? 0));
  const next: Record<string, number> = {};
  for (const f of feats.mine) next[f.id] = f.by?.length ?? 0;
  try { localStorage.setItem('featCheersSeen', JSON.stringify(next)); } catch { /* ignore */ }
  if (first || !fresh.length || document.querySelector('.cel, dialog[open]')) return;
  const f = fresh[0];
  const meta = await loadMeta().catch(() => null);
  const by = (f.by ?? []).slice(seen[f.id] ?? 0).map((n) => n || ft('fn.someone'));
  haptic(12);
  toast(by.length > 1 ? ft('fn.toastN', { n: by.length, what: featLabel(f, meta) }) : ft('fn.toast1', { name: by[0] ?? ft('fn.someone'), what: featLabel(f, meta) }));
}

/** Invite rewards waiting or on their way (each row once, until claimed). */
function inviteRewards(inv: Invites | null, onChange: () => void): HTMLElement | string {
  if (!inv) return '';
  const row = (label: string, days: number, pid: string | null) => {
    const ready = days >= inv.days;
    const btn = ready ? h('button', { class: 'chip on', onclick: async (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      try {
        const n = await claimInvite(pid);
        if (n) { haptic(20); toast(ft('fr.ivDone', { n })); }
        onChange();
      } catch (err) { b.disabled = false; toast((err as Error).message); }
    } }, ft('fr.ivClaim', { n: inv.light })) : '';
    return h('div', { class: 'fr-ask' }, h('span', { class: 'fr-ask-name' }, label), btn);
  };
  const rows: HTMLElement[] = [];
  const by = inv.invitedBy;
  if (by && !by.claimed) rows.push(row(ft('fr.ivBy', { name: by.name ?? ft('fr.ivSomeone'), n: by.days }), by.days, null));
  if (inv.rewarded < inv.cap) for (const f of inv.friends) if (!f.claimed) rows.push(row(ft('fr.ivFriend', { name: f.name ?? ft('fr.ivSomeone'), n: f.days }), f.days, f.pid));
  return rows.length ? h('section', { class: 'fr-asks' }, h('h3', {}, ft('fr.ivTitle')), ...rows) : '';
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
  void myFollows().catch(() => {}); // kept on the device, so the bell can say who followed you
}
