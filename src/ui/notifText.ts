// What a notification says and where it leads (the Notifications screen, phone notifications). The words are made
// when shown, so they follow the interface language even for entries kept from before a language change.
import type { NEntry } from '../data/notifs';
import { nt } from '../i18n/notifs';
import { goTo, type NDest } from './notifTap';

export type { NDest };
export interface NView { icon: string; title: string; sub?: string; act?: string; go: () => void; to: NDest }

// Each kind opens its own screen (owner 2026-11-25: "a screen for each"), the one its spot in the app opens too.
const nav = (hash: string, store?: [string, string]) => ({ to: { hash, store }, go: () => goTo({ hash, store }) });
const toGoals = nav('#/me/goals', ['meFocus', 'claim']);
// Friends' asks, follows and news live on the News page (2026-11-23).
const toFriends = nav('#/news');
const toLeague = nav('#/ranks', ['rankView', 'league']);
const toChallenges = nav('#/me/challenges');

let mods: Promise<{
  rt: typeof import('../i18n/ranks').rt; ft: typeof import('../i18n/friends').ft; clt: typeof import('../i18n/challenges').clt;
  goalLabel: typeof import('./goalName').goalLabel; badgeName: typeof import('../i18n/badges').badgeName;
  meta: { en: string; ar: string }[] | null; surahName: typeof import('../i18n').surahName; levelLabel: typeof import('../data/xp').levelLabel;
}> | null = null;
/** The other modules' words, loaded once. */
export const loadWords = () => (mods ??= Promise.all([
  import('../i18n/ranks'), import('../i18n/friends'), import('../i18n/challenges'), import('./goalName'), import('../i18n/badges'),
  import('../data/quran').then((q) => q.loadMeta()).catch(() => null), import('../i18n'), import('../data/xp'),
]).then(([r, f, c, g, b, meta, i, x]) => ({ rt: r.rt, ft: f.ft, clt: c.clt, goalLabel: g.goalLabel, badgeName: b.badgeName, meta: meta as { en: string; ar: string }[] | null, surahName: i.surahName, levelLabel: x.levelLabel })));

type Words = Awaited<ReturnType<typeof loadWords>>;
/** Synchronous once `loadWords()` has resolved (the screen awaits it first). `waiting`: rewards still to claim. */
export function viewOf(e: NEntry, w: Words, waiting: Set<string>): NView {
  const d = e.d ?? {};
  const name = d.name || nt('nt.someone');
  const what = () => {
    const k = d.kind;
    if (k === 'surah') { const m = w.meta?.[(d.g ?? d.n ?? 1) - 1]; return w.ft('fn.surah', { name: m ? w.surahName(m) : String(d.g ?? d.n) }); }
    const n = e.ty === 'cheer' ? d.g ?? 0 : d.n ?? 0;
    return k === 'streak' ? w.ft('fn.streak', { n }) : k === 'level' ? w.ft('fn.level', { n }) : k === 'juz' ? w.ft('fn.juz', { n }) : k === 'khatm' ? w.ft('fn.khatm') : '';
  };
  const wait = waiting.has(e.k);
  switch (e.ty) {
    case 'goal': case 'weekGoal': {
      const goal = d.goal ? w.goalLabel(d.goal as never) : '';
      return { icon: 'gift', title: nt(e.ty === 'goal' ? 'nt.goal' : 'nt.weekGoal', { goal }), sub: wait ? nt('nt.chestSub') : undefined, act: wait ? nt('nt.claim') : undefined, ...toGoals };
    }
    case 'all': return { icon: 'star', title: nt('nt.allGoals'), sub: wait ? nt('nt.chestSub') : undefined, act: wait ? nt('nt.claim') : undefined, ...toGoals };
    case 'weekAll': return { icon: 'star', title: nt('nt.weekAll'), sub: wait ? nt('nt.chestSub') : undefined, act: wait ? nt('nt.claim') : undefined, ...toGoals };
    case 'badge': {
      const id = d.id ?? '';
      return { icon: 'medal', title: nt('nt.badge', { badge: w.badgeName({ fam: id.slice(0, -2), step: +id.slice(-1) }) }), act: wait ? nt('nt.claim') : undefined, ...nav('#/me/badges', ['meBadge', id]) };
    }
    case 'pieces': return { icon: 'shirt', title: ((d.n ?? 1) > 1 ? nt('nt.piecesN', { n: d.n ?? 1 }) : nt('nt.pieces1')), act: wait ? nt('nt.claim') : undefined, ...nav('#/me/wardrobe') };
    case 'level': return { icon: 'sparkle', title: nt('nt.level', { n: d.n ?? 1 }), sub: nt('nt.levelSub'), ...nav('#/me/level') };
    case 'fire': return { icon: 'flame', title: nt('nt.fire', { n: d.n ?? 0 }), sub: nt('nt.fireSub'), ...nav('#/me/streak') };
    case 'chestCh': return { icon: 'swords', title: nt('nt.chestCh', { name }), sub: wait ? nt('nt.chestSub') : undefined, act: wait ? nt('nt.claim') : undefined, ...toChallenges };
    case 'pact': return { icon: 'moon', title: nt('nt.pact'), act: wait ? nt('nt.claim') : undefined, ...nav('#/me') };
    // Open plays the gift right here (owner 2026-11-23: it used to send people to Me, where they did not see it).
    case 'gift': return { icon: 'gift', title: ((d.n ?? 1) > 1 ? nt('nt.giftN', { n: d.n ?? 1 }) : nt('nt.gift1')), act: wait ? nt('nt.open') : undefined,
      go: () => void import('./giftOpen').then((m) => m.openWaitingGifts()), to: { hash: '#/me', run: 'gifts' } };
    case 'follow': return { icon: 'users', title: nt('nt.follow', { name }), act: nt('nt.see'), ...toFriends };
    case 'ask': return { icon: 'users', title: nt('nt.ask', { name }), act: nt('nt.see'), ...toFriends };
    case 'challenge': return { icon: 'swords', title: nt('nt.challenge', { name }), sub: d.kind ? w.clt(`cl.k.${d.kind}` as never) : undefined, act: nt('nt.see'), ...toChallenges };
    case 'gesture': return { icon: 'hands', title: `${name}: ${w.rt(`rk.g${d.n ?? 0}` as never)}`, ...toChallenges };
    case 'cheer': return { icon: 'hands', title: (d.n ?? 1) > 1 ? nt('nt.cheerN', { n: d.n ?? 1 }) : nt('nt.cheer', { name }), sub: nt('nt.cheerSub', { what: what() }), ...toFriends };
    case 'feat': return { icon: 'star', title: name, sub: what(), ...toFriends };
    case 'passed': return { icon: 'trophy', title: nt('nt.passed', { name }), sub: nt('nt.place', { place: d.place ?? 0 }), ...toLeague };
    case 'passedBy': return { icon: 'trophy', title: nt('nt.passedBy', { name }), sub: nt('nt.passedBySub', { place: d.place ?? 0 }), act: nt('nt.read'), ...nav('#/') };
    case 'lastHours': return { icon: 'clock', title: nt('nt.lastHours'), sub: nt('nt.place', { place: d.place ?? 0 }), ...toLeague };
    case 'result': return { icon: 'trophy', title: nt('nt.result', { place: d.place ?? 0, n: d.n ?? 0 }), sub: nt('nt.resultSub'), ...toLeague };
    case 'prize': return { icon: 'trophy', title: nt('nt.prize'), act: wait ? nt('nt.claim') : undefined, ...toLeague };
    case 'kahf': return { icon: 'book', title: nt('nt.kahf'), sub: nt('nt.kahfSub'), act: nt('nt.read'), ...nav('#/s/18') };
    case 'season': return { icon: 'crescent', title: ((d.n ?? 0) > 1 ? nt('nt.seasonN', { n: d.n ?? 0 }) : nt('nt.season1')), sub: nt('nt.seasonSub'), ...nav('#/season') };
  }
}

/** Title and line for a phone notification ("…and 2 more" folded into the line). */
export async function notifText(e: NEntry, more: number): Promise<{ title: string; sub: string; to: NDest }> {
  const w = await loadWords();
  const v = viewOf(e, w, new Set());
  const extra = more > 0 ? `+${more}` : '';
  return { title: v.title, sub: [v.sub, extra].filter(Boolean).join(' · '), to: v.to };
}

/** Which kept entries are still waiting for their Claim (from what is waiting now, the same keys the log uses). */
export async function waitingKeys(list: NEntry[]): Promise<Set<string>> {
  const [{ pendingRewards }, { earnedPieces }, { dayKey }] = await Promise.all([import('../data/claims'), import('../data/wardrobe'), import('../data/notifs')]);
  const day = dayKey();
  const keys = new Set<string>();
  for (const p of pendingRewards()) {
    if (p.kind === 'goal') keys.add(`g:${p.goal.week ?? day}:${p.goal.id}`);
    else if (p.kind === 'all') keys.add(`ga:${day}`);
    else if (p.kind === 'weekAll') keys.add('weekAll');
    else keys.add(`b:${p.id}`);
  }
  let rk: { prizes?: { week: string; claimed?: boolean }[]; challenges?: { id: string; over?: boolean; claimed?: boolean }[] } = {};
  try { rk = JSON.parse(localStorage.getItem('rankCache') ?? 'null')?.v ?? {}; } catch { /* ignore */ }
  for (const p of rk.prizes ?? []) if (!p.claimed) keys.add(`pz:${p.week}`);
  for (const c of rk.challenges ?? []) if (c.over && !c.claimed) keys.add(`cc:${c.id}`);
  let gifts = 0;
  try { gifts = JSON.parse(localStorage.getItem('giftsWaiting') ?? 'null')?.n | 0; } catch { /* ignore */ }
  const out = new Set<string>();
  for (const e of list) {
    if (keys.has(e.k) || (e.ty === 'weekAll' && keys.has('weekAll')) || (e.ty === 'pieces' && earnedPieces().length) || (e.ty === 'gift' && gifts > 0)) out.add(e.k);
  }
  return out;
}
