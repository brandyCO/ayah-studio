// The inbox bell (owner request 2026-11-10): one place for everything waiting for the user — goal
// and week chests, badges, new pieces for the character, Ranks prizes, challenge and bedtime-pact
// chests. The bell sits in the top bar of Me, Learn and Ranks with a count; a tap lists them and each
// row goes straight to where it is opened (Me scrolls to the chest; Ranks pops its prize up).
// Counting is local only: rewards from the journey, and prizes / challenges from the answers Ranks
// kept on this device (src/together/ranks.ts, `rankCache`); pacts are asked when the list opens.
import './lightChip.css';
import { icon } from './icons';
import { pendingRewards, type Pending } from '../data/claims';
import { earnedPieces } from '../data/wardrobe';
import { account } from '../cloud/auth';
import { t, type Key } from '../i18n';
import { mpt } from '../i18n/mePages';
import { badgeName } from '../i18n/badges';
import { goalLabel } from './goalName';
import { h, haptic } from './dom';

interface Item { icon: string; title: string; sub?: string; go: () => void; gesture?: { kind: number; name: string } }

const toMe = () => {
  try { sessionStorage.setItem('meFocus', 'claim'); } catch { /* private window */ }
  if (location.hash === '#/me') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/me';
};
const toRanks = () => { location.hash = '#/ranks'; };
// Friend challenges (an answer to give, a chest) wait on Me → goals → Challenges.
const toChallenges = () => { try { sessionStorage.setItem('meGoalTab', 'ch'); } catch { /* ignore */ } location.hash = '#/me'; };

/** Prizes and challenge chests from what Ranks kept on this device (no network). */
function rankWaiting(): { prizes: { week: string }[]; challenges: number } {
  try {
    const v = JSON.parse(localStorage.getItem('rankCache') ?? 'null');
    if (!v || v.who !== account()?.id) return { prizes: [], challenges: 0 };
    const prizes = (Array.isArray(v.v?.prizes) ? v.v.prizes : []).filter((p: { claimed?: boolean }) => !p.claimed);
    const challenges = (Array.isArray(v.v?.challenges) ? v.v.challenges : []).filter((c: { over?: boolean; claimed?: boolean; incoming?: boolean; start?: string | null }) => c.incoming || (c.over && !c.claimed && c.start)).length;
    return { prizes, challenges };
  } catch { return { prizes: [], challenges: 0 }; }
}

/** Gestures a friend sent in a challenge (Salam, MashaAllah…) not seen yet, from the Ranks answers kept on this device.
 *  Seen = shown on the challenge card (src/ui/cheers.ts, `rkCheerSeen`) or opened from the bell. */
function gesturesWaiting(): { ch: string; kind: number; at: string; name: string }[] {
  try {
    const v = JSON.parse(localStorage.getItem('rankCache') ?? 'null');
    if (!v || v.who !== account()?.id || !Array.isArray(v.v?.cheers)) return [];
    const seen = JSON.parse(localStorage.getItem('rkCheerSeen') || '{}') as Record<string, string>;
    const chs: { id: string; friend?: { name?: string | null } | null }[] = Array.isArray(v.v?.challenges) ? v.v.challenges : [];
    const week = Date.now() - 7 * 864e5;
    return (v.v.cheers as { ch: string; kind: number; at: string; mine: boolean }[])
      .filter((c) => !c.mine && Date.parse(c.at) > week && (seen[c.ch] ?? '') < c.at)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .filter((c, i, all) => all.findIndex((x) => x.ch === c.ch) === i) // the newest per friend
      .map((c) => ({ ...c, name: chs.find((x) => x.id === c.ch)?.friend?.name ?? '' }));
  } catch { return []; }
}
/** New followers (not followed back, after the last look at Ranks → Friends), from the Ranks answers kept on this device. */
function followersWaiting(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('rankCache') ?? 'null');
    if (!v || v.who !== account()?.id || !Array.isArray(v.v?.follows?.followers)) return [];
    const seen = localStorage.getItem('followSeen') ?? '';
    return (v.v.follows.followers as { name?: string | null; at: string; on?: boolean }[])
      .filter((f) => !f.on && f.at > seen).map((f) => f.name ?? '');
  } catch { return []; }
}
const toFriends = () => { try { sessionStorage.setItem('rankView', 'friends'); } catch { /* ignore */ } location.hash = '#/ranks'; };
function seeGesture(ch: string, at: string) {
  try { const s = JSON.parse(localStorage.getItem('rkCheerSeen') || '{}'); s[ch] = at; localStorage.setItem('rkCheerSeen', JSON.stringify(s)); } catch { /* ignore */ }
}

/** Gifts from friends counted when Me last asked (src/together/lightGifts.ts, kept per account). */
function giftsWaitingHere(): number {
  try { const v = JSON.parse(localStorage.getItem('giftsWaiting') ?? 'null'); return v && v.who === account()?.id ? Math.min(20, v.n | 0) : 0; } catch { return 0; }
}
const rewardItem = (p: Pending): Item => {
  if (p.kind === 'goal') return { icon: 'gift', title: p.goal.week ? mpt('mp.inWeek') : mpt('mp.inGoal'), sub: goalLabel(p.goal), go: toMe };
  if (p.kind === 'all') return { icon: 'gift', title: mpt('mp.inAll'), sub: mpt('mp.inChest'), go: toMe };
  if (p.kind === 'weekAll') return { icon: 'gift', title: mpt('mp.inWeekAll'), sub: mpt('mp.inChest'), go: toMe };
  return { icon: 'medal', title: mpt('mp.inBadge'), sub: badgeName({ fam: p.id.slice(0, -2), step: +p.id.slice(-1) }), go: toMe };
};

function localItems(): Item[] {
  const out = pendingRewards().map(rewardItem);
  if (earnedPieces().length) out.push({ icon: 'shirt', title: mpt('mp.inPieces'), go: () => { location.hash = '#/me'; } });
  if (account()) {
    const r = rankWaiting();
    for (const p of r.prizes) out.push({ icon: 'trophy', title: mpt('mp.inPrize'), sub: mpt('mp.inPrizeSub', { week: p.week }), go: toRanks });
    for (let i = 0; i < r.challenges; i++) out.push({ icon: 'swords', title: mpt('mp.inChallenge'), go: toChallenges });
    for (const g of gesturesWaiting()) out.push({ icon: 'hands', title: g.name, gesture: { kind: g.kind, name: g.name }, go: () => { seeGesture(g.ch, g.at); toChallenges(); } });
    const fol = followersWaiting();
    if (fol.length) out.push({ icon: 'users', title: fol.length > 1 ? mpt('mp.inFollowN', { n: fol.length }) : mpt('mp.inFollow1', { name: fol[0] || mpt('mp.inSomeone') }), go: toFriends });
    for (let i = 0; i < giftsWaitingHere(); i++) out.push({ icon: 'gift', title: mpt('mp.gift.kicker'), go: () => { location.hash = '#/me'; } });
  }
  return out;
}
/** How many things are waiting (shown on the bell). */
export const inboxCount = () => { try { return localItems().length; } catch { return 0; } };

/** The bell for a top bar: a count while something waits, kept current while on screen. */
export function inboxBell(): HTMLElement {
  const n = h('i', { class: 'ib-n' });
  const el = h('button', { class: 'icon-btn ib-bell', type: 'button', onclick: () => { haptic(6); void openInbox(); } }, bellSvg(), n);
  let last = -1;
  const paint = () => {
    if (!el.isConnected && last >= 0) { off(); return; }
    const c = inboxCount();
    n.textContent = c > 9 ? '9+' : String(c);
    el.classList.toggle('has', c > 0);
    if (c > last && last >= 0) { el.classList.remove('ring'); void el.offsetWidth; el.classList.add('ring'); }
    last = c;
    el.setAttribute('aria-label', c ? mpt('mp.bell', { n: c }) : mpt('mp.inbox'));
  };
  const evs = ['journey-changed', 'garden-changed', 'rank-cache', 'hashchange'];
  const off = () => evs.forEach((e) => window.removeEventListener(e, paint));
  evs.forEach((e) => window.addEventListener(e, paint));
  // Counted when the browser is idle, not in the frame that first draws the screen (the count's first run
  // sets up date formats and took part in opening Learn).
  if ('requestIdleCallback' in window) requestIdleCallback(paint, { timeout: 600 }); else setTimeout(paint, 50);
  return el;
}

function bellSvg(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.8H4.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return s;
}

/** The list: everything waiting, each row going straight to where it is opened. */
export async function openInbox() {
  const list = h('div', { class: 'ib-list' });
  const row = (it: Item) => h('button', { class: 'ib-row', onclick: () => { d.close(); it.go(); } },
    h('span', { class: 'ib-ic', 'aria-hidden': 'true' }, icon(it.icon, 22)),
    h('span', { class: 'ib-txt' }, h('b', {}, it.title), it.sub ? h('span', { class: 'muted small' }, it.sub) : ''),
    h('span', { class: 'ib-go' }, mpt('mp.open')));
  const paint = (items: Item[]) => list.replaceChildren(...(items.length ? items.map(row) : [h('p', { class: 'muted ib-empty' }, mpt('mp.inboxEmpty'))]));
  const d = h('dialog', { class: 'sheet bottom ib-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, mpt('mp.inbox')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    list);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  let items = localItems();
  if (items.some((it) => it.gesture)) {
    // A gesture's words come with the Ranks strings (loaded only when there is one).
    const { rt } = await import('../i18n/ranks');
    items = items.map((it) => (it.gesture ? { ...it, title: it.gesture.name ? rt('rk.gFrom', { name: it.gesture.name, g: rt(`rk.g${it.gesture.kind}` as never) }) : rt(`rk.g${it.gesture.kind}` as never) } : it));
  }
  paint(items);
  // Pacts are not kept on the device: ask once, quietly, and add their chests.
  if (account()) {
    try {
      const { myPacts } = await import('../together/pacts');
      const pacts = (await myPacts()).filter((p) => p.over && !p.claimed);
      if (pacts.length && d.isConnected) paint([...items, ...pacts.map(() => ({ icon: 'moon', title: mpt('mp.inPact'), go: () => { location.hash = '#/me'; } }))]);
    } catch { /* offline */ }
  }
}
