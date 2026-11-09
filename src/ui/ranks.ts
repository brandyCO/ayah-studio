// Ranks tab (#/ranks; owner request 2026-11-09): your league this week (up to 15 people at a similar
// level; the top 3 move up a tier, the bottom 3 down), the global board (this week / all time), and
// boards of your own with an invite link (#/rb/{code}). Scores come from the server only
// (src/together/ranks.ts). Signed out: what Ranks is and a Google sign-in.
import { account, onAccount } from '../cloud/auth';
import { t, type Key } from '../i18n';
import { rt, type RankKey } from '../i18n/ranks';
import { isNative } from '../native';
import {
  LEAGUE, POINTS, boardLink, boardPreview, boardRanks, createBoard, joinBoard, leaveBoard, myBoards, rankGlobal, rankLeague,
  rankName, rankStatus, report, setRankName, tierOf, weekEnds, type Board, type Row,
} from '../together/ranks';
import { openAccount } from './account';
import { h, haptic, toast } from './dom';
import { tabBar } from './tabs';
import './ranks.css';

type View = 'league' | 'global' | 'boards';
const PENDING = 'pendingBoard';

const TIER_ICON: Record<string, string> = { lantern: '🏮', star: '⭐', moon: '🌙', dawn: '🌅', sun: '☀️' };
const tierName = (n: number) => rt(`rk.tier.${tierOf(n)}` as RankKey);
const tierBadge = (n: number) => h('span', { class: `rk-tier t${n}` }, `${TIER_ICON[tierOf(n)]} ${tierName(n)}`);
const num = (n: number) => n.toLocaleString();

function sheet(title: string, ...body: (Node | string)[]) {
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    ...body);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  return d;
}

const left = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? t('wkg.leftD', { d, h: hh }) : hh ? t('wkg.leftH', { h: hh, m: mm }) : t('wkg.leftM', { m: mm });
};

/** One list of players, best first; zones mark who moves up or down in a league. */
function list(rows: Row[], zones = false): HTMLElement {
  const n = rows.length;
  const items: Node[] = [];
  rows.forEach((r, i) => {
    const up = zones && i < LEAGUE.up && r.score > 0;
    const down = zones && n >= LEAGUE.downFrom && i >= n - LEAGUE.down;

    if (zones && n >= LEAGUE.downFrom && i === n - LEAGUE.down) items.push(h('li', { class: 'rk-zone down' }, `▼ ${rt('rk.zoneDown')}`));
    items.push(h('li', { class: `rk-row${r.me ? ' me' : ''}${up ? ' up' : ''}${down ? ' down' : ''}` },
      h('span', { class: `rk-place p${i + 1}` }, String(i + 1)),
      h('span', { class: 'rk-avatar', 'aria-hidden': 'true' }, (r.name[0] ?? '?').toUpperCase()),
      h('span', { class: 'rk-name' }, r.name, r.me ? h('span', { class: 'rk-you' }, rt('rk.you')) : '', r.tier !== undefined ? h('span', { class: 'rk-mini muted small' }, ` · ${tierName(r.tier)}`) : ''),
      h('span', { class: 'rk-score' }, num(r.score))));
    if (zones && i === LEAGUE.up - 1 && n > LEAGUE.up) items.push(h('li', { class: 'rk-zone up' }, `▲ ${rt('rk.zoneUp')}`));
  });
  return h('ol', { class: 'rk-list' }, ...items);
}

export async function showRanks(root: HTMLElement): Promise<() => void> {
  let view: View = (() => { try { return (sessionStorage.getItem('rankView') as View) || 'league'; } catch { return 'league'; } })();
  let allTime = false;
  let openBoard: Board | null = null;
  const head = h('section', { class: 'rk-head' });
  const tabs = h('div', { class: 'tabs rk-tabs', role: 'tablist' });
  const body = h('section', { class: 'rk-body' });
  const ends = h('span', { class: 'rk-ends muted small' });

  const tab = (v: View, label: string) => h('button', {
    class: `tab${v === view ? ' on' : ''}`, role: 'tab', 'aria-selected': String(v === view),
    onclick: () => { view = v; openBoard = null; haptic(); try { sessionStorage.setItem('rankView', v); } catch { /* ignore */ } paint(); },
  }, label);

  const signedOut = () => {
    head.replaceChildren();
    tabs.replaceChildren();
    body.replaceChildren(h('div', { class: 'rk-signin me-card' },
      h('div', { class: 'rk-trophy', 'aria-hidden': 'true' }, '🏆'),
      h('h2', {}, rt('rk.outTitle')),
      h('p', { class: 'muted' }, rt('rk.outSub')),
      h('button', { class: 'primary brand-btn', onclick: () => openAccount() }, rt('rk.signIn')),
      howBtn()));
  };
  const howBtn = () => h('button', { class: 'chip rk-how-btn', onclick: openHow }, rt('rk.how'));
  function openHow() {
    sheet(rt('rk.how'), h('div', { class: 'sheet-scroll rk-how' },
      h('ul', {},
        h('li', {}, rt('rk.ptPage', { n: POINTS.page })),
        h('li', {}, rt('rk.ptMinute', { n: POINTS.minute })),
        h('li', {}, rt('rk.ptSurah', { n: POINTS.surah })),
        h('li', {}, rt('rk.ptReel', { n: POINTS.reel })),
        h('li', {}, rt('rk.ptDay', { n: POINTS.day }))),
      h('p', { class: 'muted small' }, rt('rk.fair')),
      h('p', { class: 'muted small' }, rt('rk.league', { size: LEAGUE.size, up: LEAGUE.up, down: LEAGUE.down }))));
  }
  function openName() {
    const input = h('input', { class: 'search', maxlength: 24, value: rankName(), 'aria-label': rt('rk.name') });
    const d = sheet(rt('rk.name'), h('div', { class: 'sheet-scroll' },
      h('p', { class: 'muted small' }, rt('rk.nameSub')), input,
      h('div', { class: 'chips', style: 'margin-top:12px' }, h('button', { class: 'primary brand-btn', onclick: async () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        try { await setRankName(v); d.close(); void paint(true); } catch (e) { toast((e as Error).message); }
      } }, rt('rk.save')))));
    setTimeout(() => input.focus(), 50);
  }

  async function paintHead(fresh: boolean) {
    const s = await rankStatus(fresh);
    if (!s) {
      head.replaceChildren(h('div', { class: 'rk-me me-card' },
        h('p', {}, rt('rk.notYet')), howBtn()));
      return;
    }
    head.replaceChildren(h('div', { class: 'rk-me me-card' },
      h('div', { class: 'rk-me-top' },
        h('span', { class: `rk-medal t${s.tier}`, 'aria-hidden': 'true' }, TIER_ICON[tierOf(s.tier)]),
        h('div', { class: 'rk-me-txt' },
          h('button', { class: 'rk-me-name', onclick: openName, title: rt('rk.name') }, s.name, h('span', { class: 'muted small' }, ' ✎')),
          tierBadge(s.tier)),
        h('div', { class: 'rk-me-score' }, h('b', {}, num(s.week)), h('span', { class: 'muted small' }, rt('rk.ptsWeek')))),
      h('div', { class: 'rk-me-line' },
        h('span', {}, s.weekPlace ? rt('rk.place', { n: num(s.weekPlace), of: num(s.weekPlayers) }) : rt('rk.noPlace')),
        h('span', { class: 'muted' }, rt('rk.allTime', { n: num(s.total), place: num(s.allPlace) }))),
      howBtn()));
  }

  async function paintBody(fresh: boolean) {
    if (view === 'league') {
      const lg = await rankLeague(fresh);
      if (!lg) { body.replaceChildren(h('p', { class: 'muted' }, rt('rk.notYet'))); return; }
      body.replaceChildren(
        h('div', { class: 'me-row rk-sub' }, h('h2', { class: 'me-h' }, rt('rk.leagueTitle', { tier: tierName(lg.tier) })), ends),
        list(lg.players, true),
        h('p', { class: 'muted small' }, rt('rk.leagueNote', { up: LEAGUE.up, down: LEAGUE.down })));
    } else if (view === 'global') {
      const rows = await rankGlobal(allTime, fresh);
      const sw = (on: boolean, label: string) => h('button', { class: `chip${allTime === on ? ' on' : ''}`, onclick: () => { allTime = on; void paint(); } }, label);
      const s = await rankStatus();
      const meIn = rows.some((r) => r.me);
      body.replaceChildren(
        h('div', { class: 'chips rk-switch' }, sw(false, rt('rk.thisWeek')), sw(true, rt('rk.allTimeTab'))),
        rows.length ? list(rows) : h('p', { class: 'muted' }, rt('rk.empty')),
        !meIn && s ? h('p', { class: 'rk-mine' }, allTime ? rt('rk.youAll', { place: num(s.allPlace), n: num(s.total) })
          : s.weekPlace ? rt('rk.youWeek', { place: num(s.weekPlace), n: num(s.week) }) : '') : '');
    } else if (openBoard) {
      const b = openBoard;
      const rows = await boardRanks(b.id, fresh);
      body.replaceChildren(
        h('div', { class: 'me-row rk-sub' },
          h('button', { class: 'chip', onclick: () => { openBoard = null; void paint(); } }, `‹ ${rt('rk.boards')}`),
          ends),
        h('h2', { class: 'me-h' }, b.name),
        list(rows),
        h('div', { class: 'chips rk-board-acts' },
          h('button', { class: 'primary brand-btn', onclick: () => void invite(b) }, rt('rk.invite')),
          h('button', { class: 'chip', onclick: async () => {
            if (!confirm(b.mine ? rt('rk.deleteQ') : rt('rk.leaveQ'))) return;
            try { await leaveBoard(b.id); openBoard = null; void paint(true); } catch (e) { toast((e as Error).message); }
          } }, b.mine ? rt('rk.delete') : rt('rk.leave'))));
    } else {
      const boards = await myBoards(fresh);
      const code = h('input', { class: 'search', maxlength: 8, placeholder: rt('rk.codePh'), 'aria-label': rt('rk.join'), autocapitalize: 'off' });
      body.replaceChildren(
        boards.length ? h('div', { class: 'menu rk-boards' }, ...boards.map((b) => h('button', { class: 'menu-item', onclick: () => { openBoard = b; void paint(); } },
          h('span', {}, `👥  ${b.name}`), h('span', { class: 'muted small' }, ` · ${rt('rk.members', { n: b.members })}`))))
          : h('p', { class: 'muted' }, rt('rk.noBoards')),
        h('div', { class: 'chips rk-board-acts' }, h('button', { class: 'primary brand-btn', onclick: newBoard }, `＋ ${rt('rk.create')}`)),
        h('div', { class: 'rk-join' }, code, h('button', { class: 'chip', onclick: async () => {
          if (code.value.trim().length !== 8) { code.focus(); return; }
          try { await joinBoard(code.value); toast(rt('rk.joined')); void paint(true); } catch (e) { toast((e as Error).message); }
        } }, rt('rk.join'))));
    }
  }

  function newBoard() {
    const input = h('input', { class: 'search', maxlength: 40, placeholder: rt('rk.boardPh'), 'aria-label': rt('rk.boardName') });
    const d = sheet(rt('rk.create'), h('div', { class: 'sheet-scroll' },
      h('p', { class: 'muted small' }, rt('rk.createSub')), input,
      h('div', { class: 'chips', style: 'margin-top:12px' }, h('button', { class: 'primary brand-btn', onclick: async () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        try {
          const r = await createBoard(v);
          d.close();
          openBoard = { id: r.id, code: r.code, name: v, mine: true, members: 1 };
          await paint(true);
          void invite(openBoard);
        } catch (e) { toast((e as Error).message); }
      } }, rt('rk.createGo')))));
    setTimeout(() => input.focus(), 50);
  }
  async function invite(b: Board) {
    const url = boardLink(b.code);
    const text = rt('rk.inviteText', { name: b.name, code: b.code });
    try {
      if (isNative()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: b.name, text, url, dialogTitle: rt('rk.invite') });
        return;
      }
      if (navigator.share) { await navigator.share({ title: b.name, text, url }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(rt('rk.copied')); } catch { toast(url); }
  }

  let paintId = 0;
  async function paint(fresh = false) {
    const id = ++paintId;
    if (!account()) { signedOut(); return; }
    tabs.replaceChildren(tab('league', rt('rk.tLeague')), tab('global', rt('rk.tGlobal')), tab('boards', rt('rk.tBoards')));
    ends.textContent = rt('rk.ends', { left: left(weekEnds().getTime() - Date.now()) });
    if (!body.childElementCount) body.append(h('p', { class: 'muted' }, rt('rk.loading')));
    try {
      if (fresh) await report();
      await Promise.all([paintHead(fresh), paintBody(fresh)]);
    } catch (e) {
      if (id === paintId) body.replaceChildren(h('p', { class: 'muted' }, rt('rk.offline')), h('button', { class: 'chip', onclick: () => void paint(true) }, t('common.reload')));
    }
  }

  root.append(
    h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('h1', {}, rt('rk.title')), h('p', { class: 'muted' }, rt('rk.sub')))),
    head, tabs, body, tabBar('ranks'));
  // A board invite opened before signing in: join it now.
  const pending = (() => { try { return sessionStorage.getItem(PENDING); } catch { return null; } })();
  if (pending && account()) {
    try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ }
    try { await joinBoard(pending); view = 'boards'; toast(rt('rk.joined')); } catch (e) { toast((e as Error).message); }
  }
  void paint(true);
  const off = onAccount(() => void paint(true));
  const tick = window.setInterval(() => { if (!document.hidden) ends.textContent = rt('rk.ends', { left: left(weekEnds().getTime() - Date.now()) }); }, 30_000);
  return () => { off(); clearInterval(tick); };
}

/** #/rb/{code}: a board invite. Signed in → join and open Ranks; else the board's name and a sign-in. */
export async function showBoardInvite(root: HTMLElement, code: string): Promise<() => void> {
  const box = h('div', { class: 'rk-invite me-card' }, h('p', { class: 'muted' }, rt('rk.loading')));
  root.append(h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('h1', {}, rt('rk.title')))), box, tabBar('ranks'));
  const p = await boardPreview(code).catch(() => null);
  if (!p) { box.replaceChildren(h('p', {}, rt('rk.badInvite'))); return () => {}; }
  const go = async () => {
    try { await joinBoard(code); } catch (e) { toast((e as Error).message); return; }
    try { sessionStorage.setItem('rankView', 'boards'); } catch { /* ignore */ }
    location.hash = '#/ranks';
  };
  box.replaceChildren(
    h('div', { class: 'rk-trophy', 'aria-hidden': 'true' }, '👥'),
    h('h2', {}, p.name),
    h('p', { class: 'muted' }, rt('rk.inviteSub', { n: p.members })),
    p.joined ? h('a', { class: 'primary brand-btn', href: '#/ranks' }, rt('rk.open'))
      : account() ? h('button', { class: 'primary brand-btn', onclick: go }, rt('rk.joinBoard'))
        : h('button', { class: 'primary brand-btn', onclick: () => { try { sessionStorage.setItem(PENDING, code); } catch { /* ignore */ } openAccount(); } }, rt('rk.signInJoin')));
  return () => {};
}
