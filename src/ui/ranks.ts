// Ranks tab (#/ranks; owner request 2026-11-09): your league this week (up to 15 people at a similar
// level; the top 3 move up a tier, the bottom 3 down), the global board (this week / all time), and
// boards of your own with an invite link (#/rb/{code}). Scores come from the server only
// (src/together/ranks.ts). Signed out: what Ranks is and a Google sign-in.
import { account, onAccount } from '../cloud/auth';
import { t, type Key } from '../i18n';
import { rt, type RankKey } from '../i18n/ranks';
import { isNative, shareableLink } from '../native';
import {
  LEAGUE, METRICS, POINTS, boardGoal, boardLink, boardPreview, boardRanks, createBoard, joinBoard, leaveBoard, myBoards, rankGlobal,
  rankLeague, rankMoments, myPrizes, setFigure, claimPrize, rankName, rankStatus, report, setBoardGoal, setLook, setRankName, takeRankMoments, tierOf, weekEnds,
  myChallenges, createChallenge, standing, lastHours, scheduleLeagueNote, leagueNoteOn, setLeagueNote, acceptChallenge, cancelChallenge, challengePreview, challengeLink, claimChallenge,
  type Board, type Challenge, type Metric, type Row, type Status,
  StaleMiss, staleFirst, refreshCached, dropCache,
} from '../together/ranks';
import { inboxBell } from './inbox';
import { bump } from './juice';
import { star } from './lightChip';
import { pageSeconds } from '../data/journey';
import { FREEZE_MAX, bankedFreezes, FREEZE_PRICE, ITEMS, buy, buyFreeze, lightLeft, owns, weekPrize, weeksUntil, won, type Item, type Win, type Wins } from '../data/shop';
import { AVATARS, FRAMES, avatar, trophy } from './rankAvatars';
import { builderCard, openBuilder } from './figureBuilder';
import { actor, hop as hopFig, type Actor } from './actor';
import { gestureRow } from './cheers';
import { freezeArt } from './flat';
import { pieceArt } from './wardrobeCard';
import { grantPiece } from '../data/wardrobe';
import { WARDROBE, weekPiece } from './figure';
import { chest, chestArt, chestTier } from './chest';
import { tierEmblem } from './rankMoment';
import { openAccount } from './account';
import { h, haptic, toast } from './dom';
import { goMushaf, tabBar } from './tabs';
import { levelLabel, levelOf } from '../data/xp';
import { withLevel } from './levelLook';
import './ranks.css';

type View = 'league' | 'friends' | 'global' | 'boards';
const PENDING = 'pendingBoard';
const PENDING_CH = 'pendingChallenge';

const TIER_ICON: Record<string, string> = { lantern: '🏮', star: '⭐', moon: '🌙', dawn: '🌅', sun: '☀️' };
const tierName = (n: number) => rt(`rk.tier.${tierOf(n)}` as RankKey);
export const tierBadge = (n: number) => h('span', { class: `rk-tier t${n}` }, `${TIER_ICON[tierOf(n)]} ${tierName(n)}`);
const num = (n: number) => n.toLocaleString();

/** The share sheet (app or browser), else the link copied. */
export async function share(title: string, text: string, url: string) {
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return;
    }
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(rt('rk.copied')); } catch { toast(url); }
}

export function sheet(title: string, ...body: (Node | string)[]) {
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

/** Ranks points have their own mark (a violet badge with a rising chevron), so they never look like Light's star. */
export function ptsIcon(cls = ''): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `rk-pts-ic ${cls}`.trim());
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path class="rk-pts-bg" d="M12 1.8 21 7v10l-9 5.2L3 17V7z"/>'
    + '<path class="rk-pts-hi" d="M12 1.8 21 7v3.2L12 5 3 10.2V7z"/>'
    + '<path class="rk-pts-up" d="m7.6 14.6 4.4-4.4 4.4 4.4" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}
const pts = (n: number, unit = true) => h('span', { class: 'rk-pts' }, ptsIcon(), num(n), unit ? h('span', { class: 'rk-pts-u' }, rt('rk.ptsShort')) : '');

/** Places moved since yesterday: a small green ▲2 or red ▼1 beside the name. */
const moved = (n = 0) => n ? h('span', { class: `rk-move ${n > 0 ? 'up' : 'down'}`, 'aria-label': rt(n > 0 ? 'rk.movedUp' : 'rk.movedDown', { n: Math.abs(n) }) },
  `${n > 0 ? '▲' : '▼'}${Math.abs(n)}`) : '';

/** The character's level (from all-time XP) beside a name. */
export const lvPill = (xp?: number | null) => xp == null ? '' : h('span', { class: `lv-pill${levelOf(xp) >= 40 ? ' gold' : ''}` }, levelLabel(levelOf(xp), true));

/** The top 3 on a podium (owner pick 2026-11-10): gold in the middle, silver left, bronze right, each player
 *  standing as their own character (or their avatar disc on a stand). The steps rise and the players drop
 *  onto them the first time a day; #1 cheers, the rest bob; a tap makes a player hop (yours waves). */
export function podium(rows: Row[]): HTMLElement | '' {
  const top = rows.slice(0, 3);
  if (top.length < 3 || top[0].score <= 0) return '';
  let today = '';
  try { today = new Date().toDateString(); } catch { /* ignore */ }
  let first = true;
  try { first = localStorage.getItem('rkPodium') !== today; localStorage.setItem('rkPodium', today); } catch { /* ignore */ }
  const spot = (r: Row, place: number) => {
    const code = r.private ? null : r.figure ?? null;
    const a = code ? actor('rk-pod-fig', code) : null;
    if (a && r.xp != null) withLevel(a.el, levelOf(r.xp));
    const who = a ? a.el : h('span', { class: 'rk-pod-disc' }, avatar(r.private ? null : r.avatar ?? 0, r.tier ?? 0, place === 1 ? 64 : 54, r.frame ?? 0));
    const el = h('button', { class: `rk-pod p${place}${r.me ? ' me' : ''}`, 'aria-label': `#${place} ${r.name ?? rt('rk.private')} · ${num(r.score)}`,
      onclick: () => { if (a) (r.me ? a.wave() : a.hop(0.6)); else hopFig(el, 12, 480, false); haptic(8); } },
      h('span', { class: 'rk-pod-who' }, place === 1 ? h('span', { class: 'rk-pod-beam', 'aria-hidden': 'true' }) : '', who),
      h('span', { class: 'rk-pod-name' }, r.name ?? rt('rk.private'), r.me ? h('span', { class: 'rk-you' }, rt('rk.you')) : ''),
      h('span', { class: 'rk-pod-step' }, h('b', {}, String(place)), h('span', {}, ptsIcon(), num(r.score))));
    return { el, a };
  };
  const [g, sv, br] = [spot(top[0], 1), spot(top[1], 2), spot(top[2], 3)];
  const box = h('div', { class: `rk-podium${first ? ' intro' : ''}` }, sv.el, g.el, br.el);
  if (first) setTimeout(() => { g.a?.cheer(2400); setTimeout(() => { sv.a?.hop(0.4); br.a?.hop(0.4); }, 300); }, 1500);
  else setTimeout(() => g.a?.hop(0.3), 600);
  return box;
}

/** One list of players, best first; zones mark who moves up or down in a league. */
function list(rows: Row[], zones = false, metric: Metric = 'all', meNote = ''): HTMLElement {
  const n = rows.length;
  const items: Node[] = [];
  rows.forEach((r, i) => {
    const up = zones && i < LEAGUE.up && r.score > 0;
    const down = zones && n >= LEAGUE.downFrom && i >= n - LEAGUE.down;

    if (zones && n >= LEAGUE.downFrom && i === n - LEAGUE.down) items.push(h('li', { class: 'rk-zone down' }, `▼ ${rt('rk.zoneDown')}`));
    // A tap opens the player's profile (friends, 2026-11-11; their room is visited from there). Private players have none.
    const visit = !!r.pid && (r.me || !r.private);
    items.push(h('li', { class: `rk-row${i < 3 ? ` r${i + 1}` : i < 10 ? ' r10' : ''}${r.me ? ' me' : ''}${up ? ' up' : ''}${down ? ' down' : ''}${visit ? ' visit' : ''}`,
      ...(visit ? { role: 'button', tabindex: '0', 'aria-label': r.name ?? rt('rk.private'),
        onclick: () => void import('./friends').then((m) => m.openProfile(r, () => { dropCache(); })),
        onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } } } : {}) },
      h('span', { class: `rk-place p${i + 1}` }, String(i + 1)),
      avatar(r.private ? null : r.avatar ?? 0, r.tier ?? 0, 34, r.frame ?? 0, r.figure),
      h('span', { class: `rk-name${r.private ? ' muted' : ''}` }, r.name ?? rt('rk.private'), r.me ? h('span', { class: 'rk-you' }, rt('rk.you')) : '', lvPill(r.xp), moved(r.move), r.tier !== undefined ? h('span', { class: 'rk-mini muted small' }, ` · ${tierName(r.tier)}`) : '',
        r.me && meNote ? h('small', { class: 'rk-note' }, meNote) : ''),
      up || down ? h('span', { class: `rk-dir ${up ? 'up' : 'down'}`, title: rt(up ? 'rk.zoneUp' : 'rk.zoneDown') }, up ? '▲' : '▼') : '',
      h('span', { class: 'rk-score' }, metric === 'all' ? ptsIcon() : '', num(r.score), metric === 'listen' ? h('span', { class: 'rk-unit muted small' }, ` ${rt('rk.min')}`) : '')));
    if (zones && i === LEAGUE.up - 1 && n > LEAGUE.up) items.push(h('li', { class: 'rk-zone up' }, `▲ ${rt('rk.zoneUp')}`));
  });
  return h('ol', { class: 'rk-list' }, ...items);
}

export async function showRanks(root: HTMLElement): Promise<() => void> {
  let view: View = (() => { try { return (sessionStorage.getItem('rankView') as View) || 'league'; } catch { return 'league'; } })();
  let allTime = false;
  let metric: Metric = 'all';
  const metricChips = () => h('div', { class: 'chips rk-metrics', role: 'group', 'aria-label': rt('rk.measure') },
    ...METRICS.map((m) => h('button', { class: `chip${metric === m ? ' on' : ''}`, 'aria-pressed': String(metric === m),
      onclick: () => { metric = m; haptic(); void paint(); } }, rt(`rk.m.${m}` as RankKey))));
  let openBoard: Board | null = null;
  const head = h('section', { class: 'rk-head' });
  const tabs = h('div', { class: 'tabs rk-tabs', role: 'tablist' });
  const body = h('section', { class: 'rk-body' });
  const ends = h('span', { class: 'rk-ends muted small' });

  const tab = (v: View, label: string) => h('button', {
    class: `tab${v === view ? ' on' : ''}`, role: 'tab', 'aria-selected': String(v === view),
    onclick: () => { view = v; openBoard = null; metric = 'all'; haptic(); try { sessionStorage.setItem('rankView', v); } catch { /* ignore */ } paint(); },
  }, label);

  // Your avatar stays in the top bar even before the ranks load (signed out, or not counted yet): the character
  // kept on this device, and a tap opens the builder.
  const localAv = () => {
    let fig: string | null = null;
    try { fig = localStorage.getItem('rankFigure') || null; } catch { /* ignore */ }
    return h('button', { class: 'rk-me-av', 'aria-label': rt('fb.open'), onclick: () => openBuilder({ figure: fig, wins: 0 }, () => void paint(true)) },
      avatar(fig ? 0 : null, 0, 36, 0, fig));
  };
  const signedOut = () => {
    topActs.replaceChildren(infoBtn(), localAv());
    head.replaceChildren();
    tabs.replaceChildren();
    body.replaceChildren(h('div', { class: 'rk-signin me-card' },
      h('div', { class: 'rk-trophy', 'aria-hidden': 'true' }, '🏆'),
      h('h2', {}, rt('rk.outTitle')),
      h('p', { class: 'muted' }, rt('rk.outSub')),
      h('button', { class: 'primary brand-btn', onclick: () => openAccount() }, rt('rk.signIn')),
      howBtn()));
  };
  const howBtn = () => h('button', { class: 'chip rk-how-btn', onclick: openHow }, rt('rk.info'));
  /** How Ranks work (the ⓘ in the top bar): points, Light and leagues side by side, so the two never get mixed up. */
  function openHow() {
    const secs = pageSeconds();
    const rt2 = secs % 60 ? `${Math.floor(secs / 60)}½` : String(secs / 60);
    const earn = (icon: string, label: string, sub: string, n: number | string) => h('li', { class: 'rk-earn' },
      h('span', { class: 'rk-earn-ic', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'rk-earn-txt' }, h('b', {}, label), sub ? h('small', { class: 'muted' }, sub) : ''),
      h('span', { class: 'rk-earn-n' }, `+${n}`));
    const card = (cls: string, icon: Node, title: string, ...body: (Node | string)[]) => h('section', { class: `rk-info ${cls}` },
      h('div', { class: 'rk-info-head' }, h('span', { class: 'rk-info-ic' }, icon), h('h3', {}, title)), ...body);
    const big = (el: SVGSVGElement) => { el.classList.add('big'); return el; };
    sheet(rt('rk.info'), h('div', { class: 'sheet-scroll rk-how' },
      card('pts', ptsIcon('big'), rt('rk.iPtsTitle'),
        h('p', {}, rt('rk.iPtsBody')),
        h('p', { class: 'rk-info-sub' }, rt('rk.iEarn')),
        h('ul', { class: 'rk-earns' },
          earn('📖', rt('rk.eaPage'), rt('rk.eaPageSub', { t: rt2 }), POINTS.page),
          earn('🎧', rt('rk.eaMinute'), rt('rk.eaMinuteSub'), POINTS.minute),
          earn('🌿', rt('rk.eaLesson'), rt('rk.eaLessonSub'), POINTS.lesson),
          earn('✅', rt('rk.eaSurah'), '', POINTS.surah),
          earn('🎬', rt('rk.eaReel'), rt('rk.eaReelSub'), POINTS.reel),
          earn('📅', rt('rk.eaDay'), rt('rk.eaDaySub'), POINTS.day),
          earn('🎯', rt('rk.eaQuest'), rt('rk.eaQuestSub'), 50))),
      card('light', big(star()), rt('rk.iLightTitle'), h('p', {}, rt('rk.iLightBody'))),
      card('league', tierEmblem(0) as unknown as Node, rt('rk.iLeagueTitle'),
        h('p', {}, rt('rk.iLeagueBody', { size: LEAGUE.size, up: LEAGUE.up, down: LEAGUE.down }))),
      card('when', h('span', { 'aria-hidden': 'true' }, '⏱'), rt('rk.iWhenTitle'), h('p', {}, rt('rk.iWhenBody'))),
      h('p', { class: 'muted small' }, rt('rk.fair')),
      h('p', { class: 'muted small' }, rt('rk.fairNote'))));
  }
  const infoBtn = () => h('button', { class: 'rk-info-btn', 'aria-label': rt('rk.info'), title: rt('rk.info'), onclick: openHow }, 'i');
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

  // Duolingo-style: the league list is the screen. Above it only the tier ladder and one slim strip
  // (this week's quest and prizes); you, the shop and the trophies sit behind the top bar's buttons,
  // and a prize waiting to be opened pops up once instead of living on the page.
  const topActs = h('div', { class: 'rk-top-acts' });
  const bell = inboxBell();
  let status: Status | null = null;
  async function paintHead(fresh: boolean) {
    const s = await rankStatus(fresh);
    status = s;
    if (!s) {
      topActs.replaceChildren(infoBtn(), localAv());
      head.replaceChildren(h('div', { class: 'rk-me me-card' }, h('p', {}, rt('rk.notYet')), howBtn()));
      return;
    }
    topActs.replaceChildren(
      infoBtn(),
      bell,
      h('button', { class: 'chip rk-shop-btn', onclick: () => openShop(s), 'aria-label': rt('rk.shop') }, star(), num(lightLeft())),
      h('button', { class: 'rk-me-av', 'aria-label': rt('rk.you'), onclick: () => openYou(s) }, avatar(s.private ? null : s.avatar, s.tier, 36, s.frame, s.figure)));
    head.replaceChildren(view === 'league' ? h('div', { class: 'rk-headbox' },
      h('div', { class: `rk-hero t${s.tier}` },
        ladder(s.tier),
        h('h2', { class: 'rk-hero-title' }, rt('rk.leagueTitle', { tier: tierName(s.tier) })),
        h('p', { class: 'rk-hero-sub' }, rt('rk.zoneUp'), ' · ', ends),
        h('button', { class: 'rk-hero-pts', onclick: openHow, 'aria-label': `${num(s.week)} ${rt('rk.ptsWeek')}. ${rt('rk.info')}` },
          pts(s.week, false), h('span', {}, rt('rk.ptsWeek')), h('span', { class: 'rk-hero-pts-i', 'aria-hidden': 'true' }, 'i'))),
      strip(s)) : '');
    if (fromKept) return;
    void paintPrizes(s, fresh);
    void moments(s);
  }
  /** The five tiers in a row, yours lit and larger, the ones above still to reach. */
  const ladder = (tier: number) => h('div', { class: 'rk-ladder', role: 'img', 'aria-label': rt('rk.leagueTitle', { tier: tierName(tier) }) },
    ...[0, 1, 2, 3, 4].map((n) => h('span', { class: `rk-rung${n === tier ? ' on' : n < tier ? ' past' : ''}` }, tierEmblem(n) as unknown as Node)));
  /** One line: this week's quest progress, and this week's prizes; tap for both in full. */
  function strip(s: Status) {
    const q = s.quest;
    const done = !!q.complete || q.done >= q.target;
    const pct = Math.round((Math.min(q.done, q.target) / q.target) * 100);
    return h('button', { class: 'rk-strip', onclick: () => openWeek(s) },
      h('span', { class: 'rk-strip-q' },
        h('span', { class: 'small' }, done ? `✓ ${rt('rk.questTitle')}` : rt(`rk.q.${q.kind}` as RankKey, { n: q.target })),
        h('span', { class: 'rk-goal-bar' }, h('span', { style: `width:${pct}%` }))),
      h('span', { class: 'rk-strip-p' }, itemArt(weekPrize(s.weekStart, 1), s, 30), itemArt(weekPrize(s.weekStart, 2), s, 30)),
      h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'));
  }
  function openWeek(s: Status) {
    sheet(rt('rk.thisWeek'), h('div', { class: 'sheet-scroll rk-week' }, questCard(s), weekPrizeCard(s)));
  }
  /** You: name, tier, places, and the way to your look, the shop, your trophies and how points work. */
  function openYou(s: Status) {
    const d = sheet(rt('rk.you'), h('div', { class: 'sheet-scroll rk-you-sheet' },
      h('div', { class: 'rk-me-top' },
        h('button', { class: 'rk-me-av', 'aria-label': rt('rk.look'), onclick: () => { d.close(); openLook(s); } }, avatar(s.private ? null : s.avatar, s.tier, 64, s.frame, s.figure)),
        h('div', { class: 'rk-me-txt' },
          h('button', { class: 'rk-me-name', onclick: () => { d.close(); openName(); }, title: rt('rk.name') }, s.name, h('span', { class: 'muted small' }, ' ✎')),
          tierBadge(s.tier)),
        h('div', { class: 'rk-me-score' }, h('b', {}, pts(s.week, false)), h('span', { class: 'muted small' }, rt('rk.ptsWeek')))),
        h('p', { class: 'muted small' }, rt('rk.notLight')),
      h('div', { class: 'rk-me-line' },
        h('span', {}, s.weekPlace ? rt('rk.place', { n: num(s.weekPlace), of: num(s.weekPlayers) }) : rt('rk.noPlace')),
        h('span', { class: 'muted' }, rt('rk.allTime', { n: num(s.total), place: num(s.allPlace) }))),
      s.private ? h('p', { class: 'muted small' }, rt('rk.privateOn')) : '',
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => { d.close(); openLook(s); } }, `◐  ${rt('rk.look')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openShop(s); } }, `✦  ${rt('rk.shop')} · ${num(lightLeft())}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openShelf(prizes); } }, `🏆  ${rt('rk.trophies')} · ${prizes.filter((p) => p.place).length}`),
        s.last ? h('button', { class: 'menu-item', onclick: () => { d.close(); void recap(s); } }, `↗  ${rt('rk.recapShare')}`) : '',
        h('button', { class: 'menu-item', onclick: () => { d.close(); openHow(); } }, `ⓘ  ${rt('rk.info')}`)),
      isNative() ? h('label', { class: 'rk-note-toggle small' },
        h('input', { type: 'checkbox', checked: leagueNoteOn(), onchange: (e: Event) => setLeagueNote((e.target as HTMLInputElement).checked) }),
        ` ${rt('rk.noteToggle')}`) : ''));
  }
  /** "Bilal is 38 points ahead. 4 pages passes him." */
  const rivalLine = (r: Row & { gap: number }) => rt(r.gap > 0 ? 'rk.rival' : 'rk.rivalTie', {
    name: r.name ?? rt('rk.private'), n: num(r.gap), pages: Math.max(1, Math.ceil((r.gap + 1) / POINTS.page)) });
  function questCard(s: Status) {
    const q = s.quest;
    const done = !!q.complete || q.done >= q.target;
    const pct = Math.round((Math.min(q.done, q.target) / q.target) * 100);
    return h('div', { class: `rk-quest me-card${done ? ' done' : ''}` },
      h('div', { class: 'me-row' }, h('b', {}, rt('rk.questTitle')), h('span', { class: 'rk-quest-bonus small' }, done ? `✓ +${q.bonus}` : `+${q.bonus}`)),
      h('p', {}, rt(`rk.q.${q.kind}` as RankKey, { n: q.target })),
      h('div', { class: 'rk-goal-bar' }, h('span', { style: `width:${pct}%` })),
      h('p', { class: 'muted small' }, done ? rt('rk.questDone') : rt('rk.questLeft', { n: q.done, of: q.target })));
  }
  /** This week's prizes: the same in every league, back only after 12 weeks. */
  const itemArt = (id: string | null | undefined, s: Status, size: number) => !id ? '' : id.startsWith('av:')
    ? avatar(Number(id.slice(3)), s.tier, size) : avatar(s.private ? 0 : s.avatar, s.tier, size, Number(id.slice(3)), s.figure);
  function weekPrizeCard(s: Status) {
    const a = weekPrize(s.weekStart, 1), f = weekPrize(s.weekStart, 2);
    return h('button', { class: 'rk-weekprize me-card', onclick: () => openShop(s, true) },
      h('div', { class: 'rk-wp-txt' }, h('b', {}, rt('rk.weekPrizes')), h('p', { class: 'muted small' }, rt('rk.weekPrizesSub'))),
      h('div', { class: 'rk-wp-items' },
        h('span', { class: 'rk-wp-item' }, itemArt(a, s, 48), h('span', { class: 'small' }, '#1')),
        h('span', { class: 'rk-wp-item' }, itemArt(f, s, 48), h('span', { class: 'small' }, '#2 · #3')),
        // The week's character piece goes to all three (wardrobe, never sold).
        h('span', { class: 'rk-wp-item' }, pieceArt(weekPiece(s.weekStart), 48), h('span', { class: 'small' }, '#1–3'))));
  }
  /** Last week's result and the players you passed: played full screen once (src/ui/rankMoment.ts), then marked seen. */
  const momentBox = h('div', { class: 'rk-moments' });
  let momentsPlaying = false;
  async function moments(s: Status) {
    if (momentsPlaying) return;
    const lg = await rankLeague().catch(() => null);
    const m = rankMoments(s, lg);
    if (!m.week && !m.passed.length) { setTimeout(() => { if (momentBox.isConnected) offerPrize(s); }, 700); return; }
    momentsPlaying = true;
    try {
      // Let the screen settle first; skip it if the user has already left Ranks or a sheet is open.
      await new Promise((r) => setTimeout(r, 200));
      if (!momentBox.isConnected || document.querySelector('dialog[open], .cel')) return;
      const { playRankMoments } = await import('./rankMoment');
      takeRankMoments(s, lg);
      await playRankMoments(m, { s, players: lg?.players ?? [] });
    } finally { momentsPlaying = false; }
    if (momentBox.isConnected) offerPrize(s);
  }
  /** Prizes waiting to be claimed: a chest in the top bar, and once a session a pop-up to open it. */
  let wonItems: string[] = [];
  let prizes: import('../together/ranks').Prize[] = [];
  async function paintPrizes(s: Status, fresh: boolean) {
    prizes = await myPrizes(fresh || s.prizes > 0).catch(() => []);
    wonItems = prizes.map((p) => p.item).filter((i): i is string => !!i);
    // A piece claimed on another device (or before pieces came) is in the wardrobe here too.
    for (const p of prizes) if (p.claimed && p.piece) grantPiece(p.piece);
    const open = prizes.filter((p) => !p.claimed);
    topActs.querySelector('.rk-top-chest')?.remove();
    if (!open.length) return;
    topActs.prepend(h('button', { class: 'rk-top-chest', 'aria-label': rt('rk.prizeOpen'), onclick: () => prizePop(open[0], s) },
      chestArt(chestTier(open[0].light)) as unknown as Node, h('span', { class: 'rk-dot' })));
  }
  function prizePop(p: import('../together/ranks').Prize, s: Status) {
    const d = sheet(p.place ? rt('rk.prizeWon', { place: p.place, tier: tierName(p.tier) }) : rt('rk.prizeUp'),
      h('div', { class: 'sheet-scroll rk-pop' },
        p.place ? trophy(p.place, 56) : '',
        h('p', { class: 'muted' }, [rt('rk.prizeLight', { n: p.light }), p.freeze ? rt('rk.prizeFreeze') : '',
          p.item ? rt(p.item.startsWith('av:') ? 'rk.prizeAvatar' : 'rk.prizeFrame') : ''].filter(Boolean).join(' · ')),
        chest(p.light, 'ready', rt('rk.prizeOpen'), (el) => { d.close(); void openPrize(p, el, s); })));
  }
  /** After the week's moments: a prize not yet opened pops up once this session. */
  function offerPrize(s: Status) {
    const p = prizes.find((x) => !x.claimed);
    if (!p || document.querySelector('dialog[open], .cel')) return;
    const k = `rkPop:${p.week}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* ignore */ }
    prizePop(p, s);
  }
  async function openPrize(p: import('../together/ranks').Prize, el: HTMLElement, st: Status) {
    try {
      if (!(await claimPrize(p))) { void paint(true); return; }
      const { celebrate } = await import('./celebrate');
      // What comes out of the chest, one by one: exactly what this week earned.
      const loot: import('./celebrate').Loot[] = [{ kind: 'light', n: p.light }];
      if (p.place) loot.push({ kind: 'item', art: trophy(p.place, 44), label: rt(`rk.loot${p.place}` as 'rk.loot1') });
      if (p.freeze) loot.push({ kind: 'freeze' });
      if (p.item) loot.push({ kind: 'item', art: itemArt(p.item, st, 52) as HTMLElement, label: rt(p.item.startsWith('av:') ? 'rk.lootAvatar' : 'rk.lootFrame'), rare: true });
      if (p.piece) {
        grantPiece(p.piece);
        const [slot, v] = p.piece.split(':');
        const r = WARDROBE[p.piece]?.r ?? 'rare';
        loot.push({ kind: 'item', art: pieceArt(p.piece, 56), label: `${rt(`fb.${slot}.${v}` as RankKey)} · ${rt(`fb.r.${r}` as RankKey)}`, rare: r === 'epic' || r === 'legendary' });
      }
      await celebrate({ kind: 'chest', title: p.place ? rt('rk.prizeWon', { place: p.place, tier: tierName(p.tier) }) : rt('rk.prizeUp'),
        sub: p.item ? rt(p.item.startsWith('av:') ? 'rk.prizeAvatarSub' : 'rk.prizeFrameSub') : p.freeze ? rt('rk.prizeFreezeSub') : rt('rk.prizeSub'), kicker: rt('rk.trophies'), loot }, el, p.light);
    } catch (e) { toast((e as Error).message); }
    void paint(true);
  }
  function openShelf(list: import('../together/ranks').Prize[]) {
    sheet(rt('rk.trophies'), h('div', { class: 'sheet-scroll rk-shelf-list' },
      ...list.map((p) => h('div', { class: 'me-row' },
        trophy(p.place, 30),
        h('span', { class: 'rk-shelf-txt' }, h('b', {}, p.place ? rt('rk.prizeWon', { place: p.place, tier: tierName(p.tier) }) : rt('rk.prizeUp')),
          h('span', { class: 'muted small' }, rt('rk.weekOf', { d: new Date(`${p.week}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }))),
        h('span', { class: 'small' }, `+${p.light}`)))));
  }

  const winsOf = (s: Status): Wins => ({ bestTier: s.bestTier ?? s.tier, bestPlace: s.bestPlace ?? null, wins: s.wins ?? 0, items: wonItems });
  let shopWeek = '';
  const winText = (w: Win, it?: Item) => {
    if (w !== 'week' || !it) return rt(`rk.win.${w}` as RankKey);
    const n = weeksUntil(it.id, shopWeek);
    const who = it.kind === 'avatar' ? '#1' : '#2 · #3';
    return n === 0 ? rt('rk.win.weekNow', { who }) : rt('rk.win.weekIn', { who, n });
  };
  /** The shop: freezes kept for later, avatars and frames for Light; what can only be won, and how. */
  function openShop(s: Status, prizes = false) {
    const x = winsOf(s);
    shopWeek = s.weekStart;
    const left = h('b', {});
    const freezeRow = h('div', { class: 'rk-shop-freeze me-card' });
    const grid = (items: Item[]) => h('div', { class: 'rk-shop-grid' }, ...items.map((it) => {
      const own = owns(it.kind as 'avatar' | 'frame', it.ref as number, x);
      const art = it.kind === 'avatar' ? avatar(it.ref as number, s.tier, 46) : avatar(s.private ? 0 : s.avatar, s.tier, 46, it.ref as number, s.figure);
      const wk = it.win === 'week' ? ` wk${weeksUntil(it.id, shopWeek) === 0 ? ' now' : ''}` : '';
      return h('button', { class: `rk-shop-item${own ? ' own' : ''}${it.win && !own ? ` locked${wk}` : ''}`, onclick: () => {
        if (own) { d.close(); openLook(s); return; }
        if (it.win) { toast(winText(it.win, it)); return; }
        if (!confirm(rt('rk.buyQ', { n: it.price ?? 0 }))) return;
        if (buy(it)) { haptic(20); toast(rt('rk.bought')); repaint(); } else toast(rt('rk.notEnough'));
      } }, art, h('span', { class: 'small' }, own ? rt('rk.owned') : it.win ? `🔒 ${winText(it.win, it)}` : `✦ ${it.price}`));
    }));
    const body = h('div', { class: 'sheet-scroll rk-shop' });
    const repaint = () => {
      left.textContent = num(lightLeft());
      const kept = bankedFreezes();
      freezeRow.replaceChildren(
        h('span', { class: 'rk-shop-fz' }, freezeArt(44) as unknown as Node),
        h('div', {}, h('b', {}, rt('rk.freezeTitle')), h('p', { class: 'muted small' }, rt('rk.freezeSub', { n: kept, max: FREEZE_MAX }))),
        h('button', { class: 'primary brand-btn', disabled: kept >= FREEZE_MAX, onclick: () => {
          if (!confirm(rt('rk.buyQ', { n: FREEZE_PRICE }))) return;
          if (buyFreeze()) { haptic(20); toast(rt('rk.bought')); repaint(); } else toast(rt('rk.notEnough'));
        } }, `✦ ${FREEZE_PRICE}`));
      body.replaceChildren(
        h('p', { class: 'rk-shop-left' }, rt('rk.lightLeft'), ' ', left),
        freezeRow,
        h('h3', { class: 'me-h2' }, rt('rk.shopAvatars')), grid(ITEMS.filter((i) => i.kind === 'avatar' && i.price)),
        h('h3', { class: 'me-h2' }, rt('rk.shopFrames')), grid(ITEMS.filter((i) => i.kind === 'frame' && i.price)),
        h('h3', { class: 'me-h2' }, rt('rk.shopWin')), h('p', { class: 'muted small' }, rt('rk.shopWinSub')),
        grid(ITEMS.filter((i) => i.win && i.win !== 'week' && i.kind !== 'icon')),
        weekHead,
        h('p', { class: 'muted small' }, rt('rk.weekPrizesSub')),
        // This week's first, then in the order they come round.
        grid(ITEMS.filter((i) => i.win === 'week').sort((a, b) => weeksUntil(a.id, shopWeek) - weeksUntil(b.id, shopWeek))),
        h('p', { class: 'muted small' }, rt('rk.shopNote')));
    };
    const weekHead = h('h3', { class: 'me-h2' }, rt('rk.shopWeek'));
    repaint();
    const d = sheet(rt('rk.shop'), body);
    if (prizes) requestAnimationFrame(() => weekHead.scrollIntoView({ block: 'start' }));
  }

  function openLook(s: Status) {
    const x = winsOf(s);
    let pick = s.avatar ?? 0;
    let frame = s.frame ?? 0;
    let priv = s.private;
    // Picking a disc takes the character off; frames go round either.
    let pickedDisc = false;
    const grid = h('div', { class: 'rk-av-grid' });
    const frames = h('div', { class: 'rk-av-grid' });
    const paintGrid = () => {
      grid.replaceChildren(...Array.from({ length: AVATARS }, (_, i) => i).filter((i) => owns('avatar', i, x)).map((i) => h('button', {
        class: `rk-av-pick${i === pick ? ' on' : ''}`, 'aria-pressed': String(i === pick), 'aria-label': rt('rk.avatarN', { n: i + 1 }),
        onclick: () => { pick = i; pickedDisc = true; haptic(); paintGrid(); } }, avatar(i, s.tier, 42, frame))));
      frames.replaceChildren(...Array.from({ length: FRAMES }, (_, i) => i).filter((i) => owns('frame', i, x)).map((i) => h('button', {
        class: `rk-av-pick${i === frame ? ' on' : ''}`, 'aria-pressed': String(i === frame), 'aria-label': rt('rk.frameN', { n: i + 1 }),
        onclick: () => { frame = i; haptic(); paintGrid(); } }, avatar(pick, s.tier, 42, i, pickedDisc ? null : s.figure))));
    };
    paintGrid();
    const sw = h('input', { type: 'checkbox', checked: priv, onchange: (e: Event) => { priv = (e.target as HTMLInputElement).checked; } });
    const d = sheet(rt('rk.look'), h('div', { class: 'sheet-scroll' },
      builderCard(s, () => { d.close(); openBuilder(s, () => void paint(true)); }),
      h('p', { class: 'muted small' }, rt('rk.lookSub')), grid,
      h('h3', { class: 'me-h2' }, rt('rk.frames')), frames,
      h('button', { class: 'chip', style: 'margin-top:10px', onclick: () => { d.close(); openShop(s); } }, `✦ ${rt('rk.moreInShop')}`),
      h('button', { class: 'chip', style: 'margin-top:10px', onclick: () => { d.close(); openName(); } }, `✎ ${rt('rk.name')}`),
      h('label', { class: 'rk-private' }, sw, h('span', {}, h('b', {}, rt('rk.privateTitle')), h('span', { class: 'muted small' }, rt('rk.privateSub')))),
      h('div', { class: 'chips', style: 'margin-top:12px' }, h('button', { class: 'primary brand-btn', onclick: async () => {
        try {
          await setLook(pick, priv, frame);
          if (pickedDisc && s.figure) await setFigure(null);
          d.close(); void paint(true);
        } catch (e) { toast((e as Error).message); }
      } }, rt('rk.save')))));
  }

  /** Sunday evening: the hours left and the one number that matters now. */
  function hoursBox(players: Row[]) {
    const st = standing(players);
    const line = st.kind === 'up' ? rt('rk.noteUp', { n: num(st.n), pages: Math.ceil(st.n / POINTS.page) })
      : st.kind === 'hold' ? rt('rk.noteHold', { place: st.place, n: num(st.n) })
        : st.kind === 'safe' ? rt('rk.noteSafe', { n: num(st.n), pages: Math.ceil(st.n / POINTS.page) })
          : st.kind === 'top' ? rt('rk.noteTop') : rt('rk.noteJoin');
    return h('div', { class: 'rk-hours me-card', role: 'status' },
      h('b', {}, `⏳ ${rt('rk.hoursTitle', { left: left(weekEnds().getTime() - Date.now()) })}`),
      h('p', { class: 'small' }, line),
      h('button', { class: 'chip', onclick: () => goMushaf() }, rt('rk.hoursRead')));
  }
  /** Monday and Tuesday: last week's result as a card to share (until closed). */
  function recapCard() {
    const s = status;
    if (!s?.last) return '';
    const dow = new Date().getDay();
    let seen = '';
    try { seen = localStorage.getItem('rankRecapSeen') ?? ''; } catch { /* ignore */ }
    if ((dow !== 1 && dow !== 2) || seen === s.weekStart) return '';
    const el: HTMLElement = h('div', { class: `rk-recap me-card t${s.last.tier}` },
      h('span', { class: 'rk-recap-em' }, tierEmblem(s.last.tier) as unknown as Node),
      h('div', { class: 'rk-recap-txt' },
        h('b', {}, rt('rk.recapTitle')),
        h('span', { class: 'small' }, `#${s.last.place} · ${rt('rk.recapOf', { n: s.last.size, tier: tierName(s.last.tier) })} · ${num(s.last.score)} ${rt('rk.recapPts')}`)),
      h('button', { class: 'primary brand-btn', onclick: () => void recap(s) }, rt('rk.recapShare')),
      h('button', { class: 'icon-btn rk-recap-x', 'aria-label': t('common.close'), onclick: () => {
        try { localStorage.setItem('rankRecapSeen', s.weekStart); } catch { /* ignore */ }
        el.remove();
      } }, '✕'));
    return el;
  }
  const recap = async (s: Status) => (await import('./rankRecap')).shareRecap(s, shareableLink('#/ranks'));

  async function paintBody(fresh: boolean) {
    if (view === 'league') {
      const lg = await rankLeague(fresh);
      if (!lg) { body.replaceChildren(h('p', { class: 'muted' }, rt('rk.notYet'))); return; }
      void scheduleLeagueNote(lg.players);
      body.replaceChildren(
        lastHours() ? hoursBox(lg.players) : '',
        recapCard(),
        // The character is everyone's avatar by default (owner decision 2026-11-10): until one is made, ask here.
        status && !status.figure && !status.private ? builderCard(status, () => openBuilder(status!, () => void paint(true))) : '',
        podium(lg.players),
        list(lg.players, true, 'all', status?.rival && status.rival.gap > 0 ? rt('rk.rivalShort', { name: status.rival.name ?? rt('rk.private'), n: num(status.rival.gap), pages: Math.max(1, Math.ceil((status.rival.gap + 1) / POINTS.page)) }) : ''),
        h('p', { class: 'muted small' }, rt('rk.leagueNote', { up: LEAGUE.up, down: LEAGUE.down })));
      // Profiles a tap may open (top 3 first) and the Friends tab load ahead, so nothing shows a loading state.
      void import('./friends').then((m) => m.warmFriends(lg.players.filter((x) => x.me || !x.private).map((x) => x.pid)));
    } else if (view === 'friends') {
      const m = await import('./friends');
      body.replaceChildren(await m.friendsTab(fresh, () => void paint(true)));
    } else if (view === 'global') {
      const rows = await rankGlobal(metric === 'all' && allTime, metric, fresh);
      const sw = (on: boolean, label: string) => h('button', { class: `chip${allTime === on ? ' on' : ''}`, onclick: () => { allTime = on; void paint(); } }, label);
      const s = await rankStatus();
      const meIn = rows.some((r) => r.me);
      body.replaceChildren(
        metricChips(),
        metric === 'all' ? h('div', { class: 'chips rk-switch' }, sw(false, rt('rk.thisWeek')), sw(true, rt('rk.allTimeTab'))) : '',
        rows.length ? list(rows, false, metric) : h('p', { class: 'muted' }, rt('rk.empty')),
        !meIn && s && metric === 'all' ? h('p', { class: 'rk-mine' }, allTime ? rt('rk.youAll', { place: num(s.allPlace), n: num(s.total) })
          : s.weekPlace ? rt('rk.youWeek', { place: num(s.weekPlace), n: num(s.week) }) : '') : '');
    } else if (openBoard) {
      const b = openBoard;
      const [rows, goal] = await Promise.all([boardRanks(b.id, metric, fresh), boardGoal(b.id, fresh)]);
      body.replaceChildren(
        h('div', { class: 'me-row rk-sub' },
          h('button', { class: 'chip', onclick: () => { openBoard = null; void paint(); } }, `‹ ${rt('rk.boards')}`),
          ends),
        h('h2', { class: 'me-h' }, b.name),
        goalBox(b, goal),
        metricChips(),
        podium(rows),
        list(rows, false, metric),
        h('div', { class: 'chips rk-board-acts' },
          h('button', { class: 'primary brand-btn', onclick: () => void invite(b) }, rt('rk.invite')),
          h('button', { class: 'chip', onclick: async () => {
            if (!confirm(b.mine ? rt('rk.deleteQ') : rt('rk.leaveQ'))) return;
            try { await leaveBoard(b.id); openBoard = null; void paint(true); } catch (e) { toast((e as Error).message); }
          } }, b.mine ? rt('rk.delete') : rt('rk.leave'))));
    } else {
      const [boards, chs] = await Promise.all([myBoards(fresh), myChallenges(fresh).catch(() => [] as Challenge[])]);
      const code = h('input', { class: 'search', maxlength: 8, placeholder: rt('rk.codePh'), 'aria-label': rt('rk.join'), autocapitalize: 'off' });
      body.replaceChildren(
        challengeBox(chs),
        h('h2', { class: 'me-h' }, rt('rk.boards')),
        boards.length ? h('div', { class: 'menu rk-boards' }, ...boards.map((b) => h('button', { class: 'menu-item', onclick: () => { openBoard = b; metric = 'all'; void paint(); } },
          h('span', {}, `👥  ${b.name}`), h('span', { class: 'muted small' }, ` · ${rt('rk.members', { n: b.members })}`))))
          : h('p', { class: 'muted' }, rt('rk.noBoards')),
        h('div', { class: 'chips rk-board-acts' }, h('button', { class: 'primary brand-btn', onclick: newBoard }, `＋ ${rt('rk.create')}`)),
        h('div', { class: 'rk-join' }, code, h('button', { class: 'chip', onclick: async () => {
          if (code.value.trim().length !== 8) { code.focus(); return; }
          try { await joinBoard(code.value); toast(rt('rk.joined')); void paint(true); } catch (e) { toast((e as Error).message); }
        } }, rt('rk.join'))));
    }
  }

  /** The board's shared goal: pages read together this week; the owner sets it. */
  function goalBox(b: Board, g: { goal: number | null; pages: number }) {
    if (!g.goal) return b.mine ? h('button', { class: 'chip rk-goal-set', onclick: () => openGoal(b, null) }, `＋ ${rt('rk.goalAdd')}`) : '';
    const pct = Math.min(100, Math.round((g.pages / g.goal) * 100));
    return h('div', { class: `rk-goal me-card${pct >= 100 ? ' done' : ''}` },
      h('div', { class: 'me-row' }, h('b', {}, rt('rk.goalTitle')),
        b.mine ? h('button', { class: 'chip', onclick: () => openGoal(b, g.goal) }, rt('rk.goalEdit')) : ''),
      h('div', { class: 'rk-goal-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(g.goal), 'aria-valuenow': String(g.pages) },
        h('span', { style: `width:${pct}%` })),
      h('p', { class: 'small' }, pct >= 100 ? rt('rk.goalDone', { n: num(g.goal) }) : rt('rk.goalLine', { n: num(g.pages), of: num(g.goal) })));
  }
  function openGoal(b: Board, cur: number | null) {
    const input = h('input', { class: 'search', type: 'number', min: '1', max: '100000', value: String(cur ?? Math.max(50, b.members * 25)), 'aria-label': rt('rk.goalTitle') });
    const d = sheet(rt('rk.goalTitle'), h('div', { class: 'sheet-scroll' },
      h('p', { class: 'muted small' }, rt('rk.goalSub')), input,
      h('div', { class: 'chips', style: 'margin-top:12px' },
        h('button', { class: 'primary brand-btn', onclick: async () => {
          const v = Math.round(Number(input.value));
          if (!(v >= 1 && v <= 100000)) { input.focus(); return; }
          try { await setBoardGoal(b.id, v); d.close(); void paint(true); } catch (e) { toast((e as Error).message); }
        } }, rt('rk.save')),
        cur ? h('button', { class: 'chip', onclick: async () => {
          try { await setBoardGoal(b.id, null); d.close(); void paint(true); } catch (e) { toast((e as Error).message); }
        } }, rt('rk.goalRemove')) : '')));
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
  const invite = (b: Board) => share(b.name, rt('rk.inviteText', { name: b.name, code: b.code }), boardLink(b.code));

  /** Friend challenges: one friend, 7 days of pages and listening, side by side. */
  // Both characters face each other over a challenge (owner idea 2026-11-10): the one ahead stands on the higher
  // step; when the card comes into view the leader cheers and the other waves (a tie: both wave), and once it is
  // over the winner cheers and the other claps them on. Only when both have a character and the friend's is not
  // private.
  function duo(me: number, them: number, friend: Row | null): { el: HTMLElement; a: Actor; b: Actor } | null {
    if (status?.private || !friend || friend.private) return null;
    const a = actor('rk-duo-a mine', status?.figure ?? null), b = a ? actor('rk-duo-a theirs', friend.figure ?? null) : null;
    if (!a || !b) return null;
    const top = Math.max(1, me, them);
    const step = (n: number) => h('span', { class: 'rk-duo-step', style: `--h:${6 + Math.round((n / top) * 30)}px` });
    const el = h('div', { class: 'rk-duo', 'aria-hidden': 'true' },
      h('div', { class: 'rk-duo-side' }, a.el, step(me)), h('span', { class: 'rk-duo-vs' }, rt('rk.chVs')), h('div', { class: 'rk-duo-side' }, b.el, step(them)));
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect();
      if (me === them) { a.wave(); setTimeout(() => b.wave(), 300); return; }
      const [lead, other] = me > them ? [a, b] : [b, a];
      setTimeout(() => { lead.cheer(); setTimeout(() => other.wave(), 450); }, 300);
    }, { threshold: 0.6 });
    io.observe(el);
    return { el, a, b };
  }
  function challengeBox(list: Challenge[]): HTMLElement {
    const live = list.filter((c) => !c.expired && !(c.over && c.claimed));
    const done = list.filter((c) => c.over && c.claimed).slice(0, 3);
    const card = (c: Challenge) => {
      if (c.waiting) {
        return h('div', { class: 'rk-ch me-card wait' },
          h('div', { class: 'rk-ch-vs' }, avatar(status?.private ? null : status?.avatar ?? 0, status?.tier ?? 0, 40, status?.frame ?? 0, status?.figure),
            h('span', { class: 'rk-ch-x' }, rt('rk.chVs')), h('span', { class: 'rk-ch-q', 'aria-hidden': 'true' }, '?')),
          h('p', { class: 'small' }, rt('rk.chWaiting')),
          h('div', { class: 'chips' },
            h('button', { class: 'primary brand-btn', onclick: () => void sendChallenge(c.code!) }, rt('rk.chSend')),
            h('button', { class: 'chip', onclick: async () => {
              try { await cancelChallenge(c.id); void paint(true); } catch (e) { toast((e as Error).message); }
            } }, rt('rk.chCancel'))));
      }
      const me = c.me ?? 0, them = c.them ?? 0, top = Math.max(1, me, them);
      const who = c.friend?.name ?? rt('rk.private');
      const line = c.over ? (me > them ? rt('rk.chWon', { name: who }) : me === them ? rt('rk.chTie') : rt('rk.chLost', { name: who }))
        : me > them ? rt('rk.chAhead', { n: num(me - them) }) : me === them ? rt('rk.chEven') : rt('rk.chBehind', { name: who, n: num(them - me), pages: Math.ceil((them - me + 1) / POINTS.page) });
      const bar = (n: number, mine: boolean, face: HTMLElement, label: string) => h('div', { class: `rk-ch-row${mine ? ' me' : ''}` }, face,
        h('div', { class: 'rk-ch-bar' }, h('span', { style: `width:${Math.max(3, Math.round((n / top) * 100))}%` })),
        h('b', { 'aria-label': `${label}: ${num(n)}` }, num(n)));
      const claim = c.over && !c.claimed ? h('button', { class: 'primary brand-btn rk-ch-claim' }, chestArt(chestTier(me > them ? 100 : me === them ? 60 : 30)), ` ${rt('rk.chClaim')}`) : null;
      claim?.addEventListener('click', () => void openChallenge(c, claim));
      const cast = duo(me, them, c.friend);
      return h('div', { class: `rk-ch me-card${c.over ? ' over' : ''}` },
        h('div', { class: 'me-row' }, h('b', {}, rt('rk.chTitle')), h('span', { class: 'muted small' }, c.over ? rt('rk.chOver') : rt('rk.chDay', { d: c.day ?? 1 }))),
        cast?.el ?? '',
        bar(me, true, avatar(status?.private ? null : status?.avatar ?? 0, status?.tier ?? 0, 30, status?.frame ?? 0, status?.figure), rt('rk.you')),
        bar(them, false, avatar(c.friend?.private ? null : c.friend?.avatar ?? 0, c.friend?.tier ?? 0, 30, c.friend?.frame ?? 0, c.friend?.figure), who),
        h('p', { class: 'small rk-ch-line' }, line), claim ?? '',
        c.over ? '' : gestureRow(c, cast, who));
    };
    return h('section', { class: 'rk-chs' },
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, rt('rk.chs')),
        live.filter((c) => c.waiting).length < 3 ? h('button', { class: 'chip', onclick: () => void newChallenge() }, `＋ ${rt('rk.chNew')}`) : ''),
      live.length ? h('div', { class: 'rk-ch-list' }, ...live.map(card)) : h('p', { class: 'muted small' }, rt('rk.chNone')),
      done.length ? h('p', { class: 'muted small' }, done.map((c) => `${c.friend?.name ?? rt('rk.private')} ${num(c.me ?? 0)}–${num(c.them ?? 0)}`).join(' · ')) : '');
  }
  async function newChallenge() {
    try { const r = await createChallenge(); await paint(true); void sendChallenge(r.code); } catch (e) { toast((e as Error).message); }
  }
  const sendChallenge = (code: string) => share(rt('rk.chs'), rt('rk.chText', { name: status?.name ?? rankName() }), challengeLink(code));
  async function openChallenge(c: Challenge, el: HTMLElement) {
    try {
      const r = await claimChallenge(c);
      if (!r) { void paint(true); return; }
      const { celebrate } = await import('./celebrate');
      const who = c.friend?.name ?? rt('rk.private');
      await celebrate({ kind: 'chest', kicker: rt('rk.chTitle'),
        title: r.result === 'won' ? rt('rk.chWon', { name: who }) : r.result === 'tie' ? rt('rk.chTie') : rt('rk.chLost', { name: who }),
        sub: rt('rk.chSub'), loot: [{ kind: 'light', n: r.light }] }, el, r.light);
    } catch (e) { toast((e as Error).message); }
    void paint(true);
  }

  let paintId = 0;
  // Painting from the answers kept on this device (Ranks opens at once, then the fresh paint follows).
  let fromKept = false;
  /** Points that arrived since the last paint float up from your row ("+10") and the hero's pill bumps. */
  let shownPts: number | null = null;
  function showGain() {
    const now = status?.week;
    if (now == null) return;
    const gain = shownPts == null ? 0 : now - shownPts;
    shownPts = now;
    if (gain <= 0) return;
    const row = body.querySelector<HTMLElement>('.rk-row.me');
    const score = row?.querySelector<HTMLElement>('.rk-score');
    if (row && score && metric === 'all') {
      score.append(h('span', { class: 'rk-gain', 'aria-hidden': 'true' }, `+${num(gain)}`));
      row.classList.remove('gain'); void row.offsetWidth; row.classList.add('gain');
    }
    const pill = head.querySelector<HTMLElement>('.rk-hero-pts');
    if (pill) bump(pill, 0.14);
    haptic(8);
  }
  const paintTabs = () => tabs.replaceChildren(tab('league', rt('rk.tLeague')), tab('friends', friendsLabel), tab('global', rt('rk.tGlobal')), tab('boards', rt('rk.tBoards')));
  async function paint(fresh = false) {
    const id = ++paintId;
    if (!account()) { signedOut(); return; }
    paintTabs();
    ends.textContent = rt('rk.ends', { left: left(weekEnds().getTime() - Date.now()) });
    if (!body.childElementCount) body.append(h('p', { class: 'muted' }, rt('rk.loading')));
    try {
      if (fresh) await report();
      await paintHead(fresh);
      if (status && fresh) void import('./levelUp').then((m) => m.maybeLevelUp(status!.total));
      await paintBody(fresh);
      showGain();
    } catch (e) {
      if (e instanceof StaleMiss) return;
      if (id === paintId) body.replaceChildren(h('p', { class: 'muted' }, rt('rk.offline')), h('button', { class: 'chip', onclick: () => void paint(true) }, t('common.reload')));
    }
  }
  /** Ranks at once from last time, then the fresh answers (only repainted when something changed). */
  async function open() {
    if (!account()) { signedOut(); return; }
    fromKept = true;
    try { await staleFirst(() => paint(false)); } finally { fromKept = false; }
    await paint(true);
  }

  root.append(
    h('header', { class: 'topbar rk-top' }, h('div', { class: 'brand' }, h('h1', {}, rt('rk.title'))), topActs),
    tabs, head, momentBox, body, tabBar('ranks'));
  // A board invite opened before signing in: join it now.
  const pending = (() => { try { return sessionStorage.getItem(PENDING); } catch { return null; } })();
  if (pending && account()) {
    try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ }
    try { await joinBoard(pending); view = 'boards'; toast(rt('rk.joined')); } catch (e) { toast((e as Error).message); }
  }
  // Its strings load beside the league (not before it): the tab is named as soon as they arrive.
  let friendsLabel = '';
  void import('../i18n/friends').then((m) => { friendsLabel = m.ft('fr.tab'); if (tabs.childElementCount) paintTabs(); });
  const pendingFr = (() => { try { return sessionStorage.getItem('pendingFriend'); } catch { return null; } })();
  if (pendingFr && account()) await import('./friends').then(async (m) => { if (await m.takePendingFriend()) view = 'friends'; });
  const pendingCh = (() => { try { return sessionStorage.getItem(PENDING_CH); } catch { return null; } })();
  if (pendingCh && account()) {
    try { sessionStorage.removeItem(PENDING_CH); } catch { /* ignore */ }
    try { await acceptChallenge(pendingCh); view = 'boards'; toast(rt('rk.chJoined')); } catch (e) { toast((e as Error).message); }
  }
  void open();
  const off = onAccount(() => void paint(true));
  const tick = window.setInterval(() => { if (!document.hidden) ends.textContent = rt('rk.ends', { left: left(weekEnds().getTime() - Date.now()) }); }, 30_000);
  // Live while open: others' points, names and characters show within seconds, not after a minute. Only what is on
  // screen is asked for again, every 8 s, slowing to 30 s while nothing changes (a quiet board costs the server little).
  const onScreen = (k: string) => k === 'status' || (view === 'league' ? k === 'league'
    : view === 'friends' ? k === 'friends'
      : view === 'global' ? k === `global:${metric === 'all' && allTime}:${metric}`
        : k === 'boards' || k === 'challenges' || k === 'cheers' || k.startsWith('board:') || k.startsWith('goal:'));
  let quiet = 0, stopped = false, live = 0;
  const poll = async () => {
    if (stopped) return;
    if (!document.hidden && account() && !document.querySelector('dialog[open], .cel')) {
      try {
        await report();
        if (await refreshCached(onScreen)) { quiet = 0; await paint(false); } else quiet++;
      } catch { /* offline: try again later */ }
    }
    if (!stopped) live = window.setTimeout(poll, quiet < 3 ? 8_000 : quiet < 6 ? 15_000 : 30_000);
  };
  live = window.setTimeout(poll, 8_000);
  // Back from another app or a sheet, or a tab switched: look again soon.
  const wake = () => { if (document.hidden || stopped) return; quiet = 0; clearTimeout(live); live = window.setTimeout(poll, 1_000); };
  document.addEventListener('visibilitychange', wake);
  return () => { stopped = true; off(); clearInterval(tick); clearTimeout(live); document.removeEventListener('visibilitychange', wake); };
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

/** #/rc/{code}: a friend challenge. Signed in → accept and open Ranks; else who sent it and a sign-in. */
export async function showChallengeInvite(root: HTMLElement, code: string): Promise<() => void> {
  const box = h('div', { class: 'rk-invite me-card' }, h('p', { class: 'muted' }, rt('rk.loading')));
  root.append(h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('h1', {}, rt('rk.title')))), box, tabBar('ranks'));
  const p = await challengePreview(code).catch(() => null);
  if (!p) { box.replaceChildren(h('p', {}, rt('rk.chBad'))); return () => {}; }
  const open = () => { try { sessionStorage.setItem('rankView', 'boards'); } catch { /* ignore */ } location.hash = '#/ranks'; };
  const go = async () => {
    try { await acceptChallenge(code); } catch (e) { toast((e as Error).message); return; }
    open();
  };
  const who = p.from.name ?? rt('rk.private');
  box.replaceChildren(
    h('div', { class: 'rk-ch-vs big' }, avatar(p.from.private ? null : p.from.avatar ?? 0, p.from.tier ?? 0, 64, p.from.frame ?? 0, p.from.figure),
      h('span', { class: 'rk-ch-x' }, rt('rk.chVs')), h('span', { class: 'rk-ch-q', 'aria-hidden': 'true' }, '?')),
    h('h2', {}, rt('rk.chInvite', { name: who })),
    h('p', { class: 'muted' }, p.expired ? rt('rk.chExpired') : p.taken && !p.joined ? rt('rk.chTaken') : rt('rk.chInviteSub')),
    p.joined || p.mine ? h('button', { class: 'primary brand-btn', onclick: open }, rt('rk.open'))
      : p.taken || p.expired ? h('a', { class: 'chip', href: '#/ranks' }, rt('rk.open'))
        : account() ? h('button', { class: 'primary brand-btn', onclick: go }, rt('rk.chAccept'))
          : h('button', { class: 'primary brand-btn', onclick: () => { try { sessionStorage.setItem(PENDING_CH, code); } catch { /* ignore */ } openAccount(); } }, rt('rk.chSignIn')));
  return () => {};
}

/** #/ranks, #/rb/{code} (a board invite) and #/rc/{code} (a friend challenge). */
export const ranksRoute = (root: HTMLElement, view: string, code?: string) =>
  view === 'rb' ? showBoardInvite(root, code!) : view === 'rc' ? showChallengeInvite(root, code!)
    : view === 'rf' ? import('./friends').then((m) => m.showFriendInvite(root, code!))
    : view === 'bp' ? import('./pact').then((m) => m.showPactInvite(root, code!)) : showRanks(root);
