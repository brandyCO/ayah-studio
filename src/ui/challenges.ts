// Friend challenges in any good deed, and the weekly rival (owner request 2026-11-12). Loaded on demand by Me's
// Challenges tab, the friend cards and profiles, and the League tab on Ranks.
//  - A friend is challenged straight from their card or profile: pages, dhikr, adhkar, listening, Learn lessons, or
//    reading + listening. It waits for their yes; the 7 days start that day. Dhikr is on trust between friends.
//  - The weekly rival (opt-in) lives on Ranks: a player of your tier who does about as much as you, the week's XP +
//    dhikr / adhkar points under a pace limit + two duel quests a day, the same for both. Never on Me (owner: Me is full).
import { account } from '../cloud/auth';
import { icon } from './icons';
import { clt, type ChallengeKey } from '../i18n/challenges';
import {
  CHALLENGE_KINDS, answerChallenge, cancelChallenge, challengeFriend, claimChallenge, claimDuel, myChallenges, myDuel,
  type Challenge, type ChallengeKind, type DuelQuest, type DuelState, type Row,
} from '../together/ranks';
import { chestArt, chestTier } from './chest';
import { h, haptic, toast } from './dom';
import { avatar } from './rankAvatars';
import { lampPill } from './lampPill';
import { lampOf } from '../data/shop';
import './challenges.css';

const num = (n: number) => n.toLocaleString();
const ICON: Record<ChallengeKind, string> = { read: 'sparkle', pages: 'book', listen: 'listen', lessons: 'sprout', adhkar: 'sun', dhikr: 'beads' };
const myFig = () => { try { return localStorage.getItem('rankFigure') || null; } catch { return null; } };
const meDisc = (size: number) => avatar(0, 0, size, 0, myFig());
const theirDisc = (r: Row | null, size: number) => avatar(r?.private ? null : r?.avatar ?? 0, r?.tier ?? 0, size, r?.frame ?? 0, r?.private ? null : r?.figure);
const kindOf = (c: Challenge): ChallengeKind => c.kind ?? 'read';

function sheet(title: string, ...body: (Node | string)[]) {
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': '✕', onclick: close }, '✕')),
    ...body);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  return d;
}

/** "Challenge Yusuf": pick the good deed, and it is sent straight to them. */
export function openChallengePicker(friend: { pid: string; name: string }, after?: () => void) {
  const tiles = CHALLENGE_KINDS.map((k) => h('button', { class: 'cl-kind', onclick: async () => {
    haptic(10);
    d.close();
    try {
      await challengeFriend(friend.pid, k);
      toast(clt('cl.sent', { name: friend.name }));
      after?.();
    } catch (e) { toast((e as Error).message); }
  } }, h('span', { class: 'cl-kind-ic', 'aria-hidden': 'true' }, icon(ICON[k], 22)),
    h('b', {}, clt(`cl.k.${k}` as ChallengeKey)), h('small', {}, clt(`cl.d.${k}` as ChallengeKey))));
  const d = sheet(clt('cl.pickTitle', { name: friend.name }),
    h('div', { class: 'sheet-scroll' }, h('p', { class: 'muted small' }, clt('cl.pickSub')),
      h('div', { class: 'cl-kinds' }, ...tiles), h('p', { class: 'muted small' }, clt('cl.trust'))));
}

const unit = (k: ChallengeKind) => clt(`cl.u.${k}` as ChallengeKey);
const bars = (me: number, them: number, friend: Row | null, k: ChallengeKind) => {
  const top = Math.max(1, me, them);
  const row = (n: number, mine: boolean, face: HTMLElement) => h('div', { class: `cl-row${mine ? ' me' : ''}` }, face,
    h('div', { class: 'cl-bar' }, h('span', { style: `width:${Math.max(3, Math.round((n / top) * 100))}%` })),
    h('b', {}, `${num(n)} `, h('small', {}, unit(k))));
  return [row(me, true, meDisc(30)), row(them, false, theirDisc(friend, 30))];
};

async function openChest(title: string, claim: () => Promise<{ result: 'won' | 'tie' | 'lost'; light: number } | null>, who: string, el: HTMLElement) {
  try {
    const r = await claim();
    if (!r) return;
    const { celebrate } = await import('./celebrate');
    await celebrate({ kind: 'chest', kicker: title,
      title: r.result === 'won' ? clt('cl.won', { name: who }) : r.result === 'tie' ? clt('cl.tie') : clt('cl.lost', { name: who }),
      sub: clt('cl.chestSub'), loot: [{ kind: 'light', n: r.light }] }, el, r.light);
  } catch (e) { toast((e as Error).message); }
}

/** One challenge as a card: an answer to give, a wait, the race, or a chest to open. */
function card(c: Challenge, repaint: () => void): HTMLElement | null {
  const k = kindOf(c);
  const who = c.friend?.private ? '…' : c.friend?.name ?? '…';
  const head = h('div', { class: 'cl-head' }, h('span', { class: 'cl-kind-ic sm', 'aria-hidden': 'true' }, icon(ICON[k], 22)),
    h('b', {}, clt(`cl.k.${k}` as ChallengeKey)),
    h('span', { class: 'muted small' }, c.over ? clt('cl.over') : c.start ? clt('cl.day', { d: c.day ?? 1 }) : ''));
  if (c.incoming) {
    const act = (yes: boolean) => async () => {
      haptic(10);
      try { await answerChallenge(c.id, yes); } catch (e) { toast((e as Error).message); }
      repaint();
    };
    return h('div', { class: 'cl-card in' }, head,
      h('div', { class: 'cl-who' }, theirDisc(c.friend, 40), h('p', {}, h('b', {}, clt('cl.incoming', { name: who })), h('br'), h('small', { class: 'muted' }, clt(`cl.d.${k}` as ChallengeKey)))),
      h('div', { class: 'chips' }, h('button', { class: 'primary brand-btn', onclick: act(true) }, clt('cl.yes')), h('button', { class: 'chip', onclick: act(false) }, clt('cl.no'))));
  }
  if (c.waiting) return null; // a link nobody took yet: kept on Ranks → My boards
  if (c.asked) {
    return h('div', { class: 'cl-card wait' }, head,
      h('div', { class: 'cl-who' }, theirDisc(c.friend, 40), h('p', { class: 'small' }, clt('cl.asked', { name: who }))),
      h('button', { class: 'chip', onclick: async () => { try { await cancelChallenge(c.id); } catch (e) { toast((e as Error).message); } repaint(); } }, clt('cl.takeBack')));
  }
  const me = c.me ?? 0, them = c.them ?? 0;
  const line = c.over ? (me > them ? clt('cl.won', { name: who }) : me === them ? clt('cl.tie') : clt('cl.lost', { name: who }))
    : me > them ? clt('cl.ahead', { n: num(me - them) }) : me === them ? clt('cl.even') : clt('cl.behind', { name: who, n: num(them - me) });
  const claim = c.over && !c.claimed ? h('button', { class: 'primary brand-btn cl-claim' }, chestArt(chestTier(me > them ? 100 : me === them ? 60 : 30)), ` ${clt('cl.open')}`) : null;
  claim?.addEventListener('click', () => void openChest(clt(`cl.k.${k}` as ChallengeKey), () => claimChallenge(c), who, claim).then(repaint));
  return h('div', { class: `cl-card${c.over ? ' over' : ''}` }, head, ...bars(me, them, c.friend, k), h('p', { class: 'small cl-line' }, line), claim ?? '');
}

/** Me → goals → Challenges: friend challenges only (the weekly rival is on Ranks, with a small pill here). */
export async function challengesPanel(repaint: () => void, fresh = false): Promise<HTMLElement> {
  if (!account()) return h('p', { class: 'muted' }, clt('cl.signIn'));
  const [list, duel] = await Promise.all([myChallenges(fresh).catch(() => [] as Challenge[]), myDuel(fresh).catch(() => null)]);
  const cards = list.filter((c) => !(c.expired && !c.incoming) && !(c.over && c.claimed)).map((c) => card(c, repaint)).filter((x): x is HTMLElement => !!x);
  const find = h('button', { class: 'chip cl-find', onclick: () => { try { sessionStorage.setItem('rankView', 'friends'); } catch { /* ignore */ } location.hash = '#/ranks'; } }, `＋ ${clt('cl.find')}`);
  const d = duel?.duel;
  const pill = d ? h('button', { class: 'chip cl-duel-pill', onclick: () => { try { sessionStorage.setItem('rankView', 'league'); } catch { /* ignore */ } location.hash = '#/ranks'; } },
    icon('swords', 16), clt('cl.duelPill', { name: d.rival.private ? '…' : d.rival.name ?? '…', me: num(d.me), them: num(d.them) })) : '';
  return h('div', { class: 'cl-panel' }, pill,
    cards.length ? h('div', { class: 'cl-list' }, ...cards) : h('p', { class: 'muted small' }, clt('cl.none')), find);
}
/** Something waits on the Challenges tab (an answer to give or a chest), from the answers kept on this device. */
export const challengesWaiting = (list: Challenge[]) => list.some((c) => c.incoming || (c.over && !c.claimed && c.start));

const questText = (q: DuelQuest) => clt(q.kind === 'adhkar' && q.target > 1 ? 'du.q.adhkar2' : `du.q.${q.kind}` as ChallengeKey, { n: q.target });
const QUEST_IC: Record<DuelQuest['kind'], string> = { pages: 'book', listen: 'listen', lessons: 'sprout', adhkar: 'sun', dhikr: 'beads' };

/** Where each duel quest is done: the mushaf, listening, Learn, the adhkar of this time of day, the tasbih. */
function goDo(kind: DuelQuest['kind']) {
  if (kind === 'lessons') { location.hash = '#/learn'; return; }
  if (kind === 'dhikr') { void import('./tasbih').then((m) => m.openTasbih()); return; }
  if (kind === 'adhkar') { void import('./dayLanterns').then((m) => m.openNextMoment()); return; }
  void import('./tabs').then((m) => m.goMushaf(kind === 'listen' ? 'listen' : undefined));
}

const clock = (ms: number, days = false) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const c = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return days && d ? `${d}d ${c}` : c;
};

/** The small "VS" badge on the league card: your rival's face once you have one, else crossed swords. */
export async function duelBadge(): Promise<HTMLElement> {
  const label = h('span', { class: 'du-badge-t' }, clt('du.offTitle'));
  const b = h('span', { class: 'du-badge', 'aria-hidden': 'true' }, h('span', { class: 'du-badge-ic' }, icon('swords', 22)), label);
  void myDuel().then((st) => {
    const d = st.duel;
    // F44: while nobody is free, a small "Finding your rival" line instead of a full screen; once paired, a toast says who.
    let was = '';
    try { was = localStorage.getItem('duSearching') ?? ''; } catch { /* ignore */ }
    if (!d) {
      b.classList.add('searching');
      label.textContent = clt('du.finding');
      try { localStorage.setItem('duSearching', '1'); } catch { /* ignore */ }
    } else if (was) {
      try { localStorage.removeItem('duSearching'); } catch { /* ignore */ }
      if (!d.rival.private && d.rival.name) toast(clt('du.paired', { name: d.rival.name }));
    }
    if (d) {
      b.firstElementChild?.replaceWith(theirDisc(d.rival, 26));
      label.textContent = '';
      label.append(h('b', { class: 'du-badge-x' }, clt('du.vs').toUpperCase()), ` ${d.rival.private ? '…' : d.rival.name ?? '…'} · ${num(d.me)}–${num(d.them)}`);
    }
    if (st.last) b.classList.add('ready');
  }).catch(() => {});
  return b;
}

/** The weekly rival, full screen (owner 2026-11-12): both characters walk in and face off in a burst of light,
 *  settle, then the scores, today's two duel quests (each opens where it is done) and the countdowns with seconds. */
export async function openDuel(onChange?: () => void): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { actor } = await import('./actor');
  const page = h('dialog', { class: `du-page${still ? ' still' : ''}`, 'aria-label': clt('du.title') });
  const close = () => { if (page.open) page.close(); };
  const shut = h('button', { class: 'icon-btn du-close', 'aria-label': '✕', onclick: close }, '✕');
  const stage = h('div', { class: 'du-stage' });
  const info = h('div', { class: 'du-info' });
  page.append(shut, h('p', { class: 'du-kick' }, clt('du.title')), stage, info);
  page.addEventListener('close', () => { clearInterval(tick); page.remove(); onChange?.(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(page);
  page.showModal();
  let tick = 0;

  const paint = async (fresh: boolean, first: boolean) => {
    let st: DuelState;
    try { st = await myDuel(fresh); } catch (e) { info.replaceChildren(h('p', {}, (e as Error).message)); return; }
    const d = st.duel;
    const mine = actor('du-fig mine'), theirs = d && !d.rival.private ? actor('du-fig theirs', d.rival.figure ?? null) : null;
    if (first || !stage.childElementCount || (d && stage.querySelector('.empty'))) {
      // Under each hero their lamp of Light (owner 2026-11-12, "Light visible to others").
      const side = (a: ReturnType<typeof actor>, disc: HTMLElement, cls: string, lamp = 0) => h('div', { class: `du-hero ${cls}` }, h('i', { class: 'du-glow' }), a ? a.el : disc,
        lamp ? h('span', { class: 'du-lamp' }, lampPill(lamp, true)) : '');
      stage.replaceChildren(
        side(mine, meDisc(110), 'l', lampOf()),
        h('div', { class: 'du-clash', 'aria-hidden': 'true' }, h('i', { class: 'du-ring' }), h('i', { class: 'du-ring r2' }), h('b', {}, clt('du.vs').toUpperCase())),
        d ? side(theirs, theirDisc(d.rival, 110), 'r', d.rival.private ? 0 : d.rival.lamp ?? 0) : h('div', { class: 'du-hero r empty' }, h('span', { class: 'du-q-mark' }, '?')));
      if (!still) {
        setTimeout(() => { mine?.hop(); theirs?.hop(); }, 650);
        setTimeout(() => { if (!d) return; (d.me >= d.them ? mine : theirs)?.cheer(1600); setTimeout(() => (d.me >= d.them ? theirs : mine)?.wave(1400), 400); }, 1350);
      }
    }
    const lastBtn = st.last ? (() => {
      const l = st.last!;
      const who = l.rival.private ? '…' : l.rival.name ?? '…';
      const b = h('button', { class: 'primary brand-btn cl-claim' }, chestArt(chestTier(l.me > l.them ? 100 : l.me === l.them ? 60 : 30)), ` ${clt('du.last')} · ${num(l.me)}–${num(l.them)}`);
      b.addEventListener('click', () => void openChest(clt('du.title'), () => claimDuel(l.id), who, b).then(() => paint(true, false)));
      return b;
    })() : '';
    if (!d) {
      // No rival free yet (owner 2026-11-12): only the search, no quests or scores until someone is paired. The server
      // pairs on each ask, so it looks again every 12 s while this is open.
      info.replaceChildren(
        h('div', { class: 'du-search', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
        h('p', { class: 'du-line' }, clt('du.waiting')),
        h('p', { class: 'small muted du-how' }, clt('du.waitSub')),
        lastBtn);
      clearInterval(tick);
      tick = window.setInterval(() => { if (!document.hidden) void paint(true, false); }, 12_000);
      return;
    }
    const who = d ? (d.rival.private ? '…' : d.rival.name ?? '…') : '';
    const day = h('b', { class: 'du-clock' }), week = h('b', { class: 'du-clock' });
    const tickNow = async () => {
      const { resetsAt } = await import('../data/goals');
      const r = resetsAt();
      day.textContent = clock(r.day.getTime() - Date.now());
      week.textContent = clock(r.week.getTime() - Date.now(), true);
    };
    void tickNow();
    clearInterval(tick);
    tick = window.setInterval(() => { if (!document.hidden) void tickNow(); }, 1000);
    const quest = (q: DuelQuest) => h('button', { class: `du-quest${q.done ? ' done' : ''}`, onclick: () => { haptic(8); close(); goDo(q.kind); } },
      h('span', { class: 'du-quest-ic', 'aria-hidden': 'true' }, icon(q.done ? 'check' : QUEST_IC[q.kind], 20)),
      h('span', { class: 'du-quest-t' }, questText(q), h('small', {}, '+30')), h('span', { class: 'du-quest-go', 'aria-hidden': 'true' }, '›'));
    info.replaceChildren(
      d ? h('div', { class: 'du-score' }, h('b', { class: 'me' }, num(d.me)), h('span', {}, '–'), h('b', {}, num(d.them))) : '',
      d ? h('p', { class: 'du-line' }, d.me > d.them ? clt('cl.ahead', { n: num(d.me - d.them) }) : d.me === d.them ? clt('cl.even') : clt('cl.behind', { name: who, n: num(d.them - d.me) }))
        : h('p', { class: 'du-line muted' }, clt('du.waiting')),
      lastBtn,
      h('div', { class: 'du-clocks' },
        h('div', {}, h('small', {}, clt('du.today')), day),
        h('div', {}, h('small', {}, clt('du.week')), week)),
      h('h3', { class: 'du-qh' }, clt('du.quests')),
      h('div', { class: 'du-quests' }, ...(st.quests ?? []).map(quest)),
      h('p', { class: 'small muted du-how' }, clt('du.how')));
  };
  await paint(false, true).catch(() => {});
  void paint(true, false);
}
