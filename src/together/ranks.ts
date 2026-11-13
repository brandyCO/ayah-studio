// Ranks (owner request 2026-11-09; supabase/migrations/20261110000000_ranks.sql): the app reports
// each day's totals of what it measures itself (pages counted after their reading time, seconds of
// recitation played, surahs finished, reels exported — all the user's devices combined), and reads
// the boards. The server caps the numbers, keeps them from going down or growing faster than time
// allows, and works out the score. Signed in with Google only; nothing is sent signed out.
import { account, onAccount } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { localMsg } from '../i18n';
import { addDays, allDays, claimGoal, streak } from '../data/journey';
import { dayKey, readLogAll } from '../data/readLog';
import { isNative, shareableLink } from '../native';
import { setMyXp } from '../data/xp';
import { isFriendFireDay } from '../data/fireDays';
import { dayTotals, islamicTotals, rankDay, utcOff, watchMaghrib, weekEndAt } from '../data/rankDay';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(localMsg(error.message));
  return data as T;
}

export const TIERS = ['lantern', 'star', 'moon', 'dawn', 'sun'] as const;
export type Tier = (typeof TIERS)[number];
export const tierOf = (n: number): Tier => TIERS[Math.max(0, Math.min(4, n | 0))];
/** League size and how many move up / down at the week's end (server: rank_join_league). */
export const LEAGUE = { size: 15, up: 3, down: 3, downFrom: 8 };
/** Points, as the server counts them (rank_score). */
export const POINTS = { page: 10, minute: 2, surah: 30, reel: 15, lesson: 15, flawless: 10, day: 20 };

/** A player on a board. A private player shows no name or avatar (name null). */
export interface Row { name: string | null; score: number; me: boolean; lamp?: number; pid?: string | null; xp?: number | null; tier?: number; move?: number; avatar?: number | null; frame?: number; private?: boolean; figure?: string | null; room?: string | null }
export type Metric = 'all' | 'pages' | 'listen' | 'surahs' | 'reels';
export const METRICS: Metric[] = ['all', 'pages', 'listen', 'surahs', 'reels'];
/** This week's quest, the same for everyone (server: rank_quest). */
export interface Quest { kind: 'pages' | 'listen' | 'days' | 'surahs' | 'lessons'; target: number; done: number; bonus: number; complete: boolean | null }
export interface Status {
  name: string; tier: number; avatar: number; frame: number; figure?: string | null; bestTier: number; bestPlace: number | null; wins: number; prizes: number; private: boolean; total: number; week: number; weekPlace: number | null; weekPlayers: number;
  allPlace: number; allPlayers: number; quest: Quest; rival: (Row & { gap: number; act?: Act | null }) | null;
  /** This phone's week is over, the league's is not: last week's place as it stands, until the last member's Maghrib. */
  waiting?: { until: string; score: number; size: number; tier: number; place: number } | null;
  weekLast?: string;
  /** Last week's league result, if the player played. */
  last: { score: number; tier: number; size: number; place: number } | null; weekStart: string;
}
/** What a player did today: pages, minutes listened, lessons, and when they last reported. */
export interface Act { pages: number; listen: number; lessons: number; at: string }
export interface Board { id: string; name: string; code: string; mine: boolean; members: number }

const firstName = () => (account()?.name ?? '').trim().split(/\s+/)[0]?.slice(0, 24) || 'Reader';
/** The name others see: the user's own choice, else the first name of the account. */
export const rankName = () => { try { return localStorage.getItem('rankName') || firstName(); } catch { return firstName(); } };

// --- reporting: today (and yesterday, until it is settled), a few seconds after a change ---
// The server takes one report per 5 s (rank_report); a report sent sooner would be ignored, so the app
// waits out the gap itself instead of sending it and wrongly marking the numbers as sent.
const GAP = 5_200;
let lastAt = 0;
const totals = dayTotals;
let timer = 0;
let busy = false;
export function reportSoon(delay = 2_500) {
  if (!account() || timer) return;
  timer = window.setTimeout(() => { timer = 0; void report(); }, delay);
}
export async function report(): Promise<void> {
  if (!account() || busy) return;
  busy = true;
  try {
    const wait = lastAt + GAP - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (!account()) return;
    let sent: Record<string, string> = {};
    try { sent = JSON.parse(localStorage.getItem('rankSent') ?? '{}'); } catch { /* ignore */ }
    // By the Islamic day (from Maghrib the next day has begun; the week ends at this phone's own Friday Maghrib).
    const today = rankDay();
    for (const k of [addDays(today, -1), today]) {
      const v = islamicTotals(k, totals) as ReturnType<typeof totals>;
      const sig = `${account()!.id}:${v.pages}:${v.listen}:${v.surahs}:${v.reels}:${v.lessons}:${v.flawless}:${v.adhkar}:${v.dhikr}`;
      if (sent[k] === sig || (k !== today && !v.pages && !v.listen && !v.surahs && !v.reels && !v.lessons && !v.adhkar && !v.dhikr)) continue;
      lastAt = Date.now();
      await rpc('rank_report', { d: k, pages: v.pages, listen: v.listen, surahs: v.surahs, reels: v.reels, my_name: rankName(), lessons: v.lessons, adhkar: v.adhkar, dhikr: v.dhikr, week_end: weekEndAt().toISOString(), utc_off: utcOff() });
      // Flawless lessons: 10 extra XP each (rank_flawless; an older server without it is skipped).
      if (v.flawless) await rpc('rank_flawless', { d: k, n: v.flawless }).catch(() => undefined);
      sent[k] = sig;
      if (k === today) setTimeout(() => void friendMoments(), 1500);
    }
    // The lamp of Light by the name (sent when it changes).
    const lamp = (await import('../data/shop')).lampOf();
    if (String(lamp) !== (localStorage.getItem('rankLamp') ?? '0')) {
      await rpc('rank_set_lamp', { n: lamp });
      try { localStorage.setItem('rankLamp', String(lamp)); } catch { /* ignore */ }
    }
    for (const k of Object.keys(sent)) if (k < addDays(today, -3)) delete sent[k];
    try { localStorage.setItem('rankSent', JSON.stringify(sent)); } catch { /* ignore */ }
  } catch {
    /* offline or signed out: the next change tries again */
  } finally {
    busy = false;
  }
}
/** Keeps the server's numbers in step (main.ts). */
export function watchRanks() {
  watchMaghrib(totals);
  const soon = () => reportSoon();
  window.addEventListener('journey-changed', soon);
  window.addEventListener('readlog-changed', soon);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer) { clearTimeout(timer); timer = 0; void report(); }
    if (!document.hidden) setTimeout(() => void friendMoments(), 2500);
  });
  onAccount((a) => {
    kept = null;
    cache.clear();
    profs.clear();
    profsLoaded = false;
    if (!a) return;
    reportSoon(3000);
    setTimeout(() => void friendMoments(), 4000);
    // A board invite opened before signing in: Ranks joins it.
    try { if ((sessionStorage.getItem('pendingBoard') || sessionStorage.getItem('pendingChallenge')) && location.hash !== '#/ranks') location.hash = '#/ranks'; } catch { /* ignore */ }
    void scheduleLeagueNote();
  });
}

// --- reading the boards (kept a minute, so switching tabs is instant) ---
// Answers are kept a minute in memory, and the last of each on this device too, so Ranks can open
// at once with what it showed last time (`staleFirst`) while the fresh answers load. While Ranks is
// open, `refreshCached()` asks again for what it shows and tells whether anything changed.
const cache = new Map<string, { at: number; v: unknown; json: string; load: () => Promise<unknown> }>();
const STORE = 'rankCache';
let kept: Record<string, unknown> | null = null;
const keptAll = () => {
  if (kept) return kept;
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    kept = v && v.who === account()?.id && typeof v.v === 'object' ? v.v : {};
  } catch { kept = {}; }
  return kept!;
};
let keepTimer = 0;
const keep = (key: string, v: unknown) => {
  keptAll()[key] = v;
  clearTimeout(keepTimer);
  keepTimer = window.setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ who: account()?.id, v: kept })); } catch { /* full */ }
    // The inbox bell counts prizes and challenge chests from these (src/ui/inbox.ts).
    window.dispatchEvent(new Event('rank-cache'));
  }, 400);
};
/** Thrown while painting from the kept answers when one is missing: the fresh paint follows. */
export class StaleMiss extends Error {}
let stale = false;
/** Runs `paint` with the answers kept on this device (no network); a missing one throws StaleMiss. */
export async function staleFirst<T>(paint: () => Promise<T>): Promise<T> {
  stale = true;
  try { return await paint(); } finally { stale = false; }
}
async function cached<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
  const c = cache.get(key);
  if (!fresh && c && Date.now() - c.at < 60_000) return c.v as T;
  if (stale && !fresh) {
    if (c) return c.v as T;
    const k = keptAll();
    if (key in k) return k[key] as T;
    throw new StaleMiss();
  }
  // The same answer asked for twice at once (the league by the list and by the moments) goes to the server once.
  const running = loading.get(key);
  if (running) return running as Promise<T>;
  const p = load().then((v) => {
    cache.set(key, { at: Date.now(), v, json: JSON.stringify(v) ?? '', load });
    keep(key, v);
    return v;
  }).finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}
const loading = new Map<string, Promise<unknown>>();
export const dropCache = () => { for (const c of cache.values()) c.at = 0; };
/** Asks again for the kept answers `live` picks (what is on screen now); true when any of them changed. */
export async function refreshCached(live: (key: string) => boolean): Promise<boolean> {
  let changed = false;
  await Promise.all([...cache.entries()].filter(([key]) => live(key)).map(async ([key, c]) => {
    try {
      const v = await c.load();
      const json = JSON.stringify(v) ?? '';
      if (json !== c.json) changed = true;
      cache.set(key, { at: Date.now(), v, json, load: c.load });
      keep(key, v);
    } catch { /* offline: keep what there is */ }
  }));
  return changed;
}

export const rankStatus = (fresh = false) => cached('status', async () => {
  const s = await rpc<Status | null>('rank_status', { d: rankDay() });
  if (s) { setMyXp(s.total); s.figure = await myFigure(); await sendLocalFigure(); void sendRoom(); void sendProfile(); }
  return s;
}, fresh);
// The character from the builder (src/ui/figure.ts): kept on this device too, so the status needs no change on the server.
const FIG = 'rankFigure';
export async function myFigure(): Promise<string | null> {
  try { const v = localStorage.getItem(FIG); if (v !== null) return v || null; } catch { /* ignore */ }
  const v = await rpc<string | null>('rank_my_figure').catch(() => null);
  try { localStorage.setItem(FIG, v ?? ''); } catch { /* ignore */ }
  return v;
}
/** Wears a character on the boards (null = back to the avatar disc). The prize outfit is checked by the server. */
// The character is the default avatar (owner decision 2026-11-10), so it can be made signed out too: kept on this
// device and sent to the boards once signed in (`rankFigureSent` = the code the server has).
const SENT = 'rankFigureSent';
export async function setFigure(code: string | null) {
  if (account()) {
    await rpc('rank_set_figure', { code });
    try { localStorage.setItem(SENT, code ?? ''); } catch { /* ignore */ }
  }
  try { localStorage.setItem(FIG, code ?? ''); } catch { /* ignore */ }
  dropCache();
}
/** Your room as friends see it on a visit (round 5): sent when it changed, once signed in and playing. */
const ROOM_SENT = 'rankRoomSent';
export async function sendRoom() {
  if (!account()) return;
  try {
    const code = (await import('../data/roomItems')).myRoomCode();
    if (localStorage.getItem(ROOM_SENT) === code) return;
    await rpc('rank_set_room', { code });
    localStorage.setItem(ROOM_SENT, code);
  } catch { /* not playing yet, or offline: try again next time */ }
}
/** A character made before signing in goes up the first time the boards are read. */
async function sendLocalFigure() {
  try {
    const v = localStorage.getItem(FIG);
    if (!v || localStorage.getItem(SENT) === v) return;
    await rpc('rank_set_figure', { code: v });
    localStorage.setItem(SENT, v);
  } catch { /* try again next time */ }
}
export interface League { tier: number; players: Row[]; waiting?: boolean; until?: string | null }
export const rankLeague = (fresh = false) => cached('league', () => rpc<League | null>('rank_league', { d: rankDay() }), fresh);
export const rankGlobal = (allTime: boolean, metric: Metric = 'all', fresh = false) =>
  cached(`global:${allTime}:${metric}`, () => rpc<Row[]>('rank_global', { d: rankDay(), all_time: allTime, metric }), fresh);
/** Weekly #1s, newest first, and the most weeks won (server: rank_hall). */
export interface Hall { recent: (Row & { week: string; tier: number })[]; most: (Row & { wins: number })[] }
export const rankHall = (fresh = false) => cached('hall', () => rpc<Hall>('rank_hall'), fresh);
export const myBoards = (fresh = false) => cached('boards', () => rpc<Board[]>('rank_my_boards'), fresh);
export const boardRanks = (id: string, metric: Metric = 'all', fresh = false) =>
  cached(`board:${id}:${metric}`, () => rpc<Row[]>('rank_board', { board: id, d: rankDay(), metric }), fresh);
export const boardGoal = (id: string, fresh = false) => cached(`goal:${id}`, () => rpc<{ goal: number | null; pages: number }>('rank_board_goal', { board: id, d: rankDay() }), fresh);
export async function setBoardGoal(id: string, pages: number | null) {
  await rpc('rank_set_board_goal', { board: id, pages });
  dropCache();
}
/** Avatar (0–23, drawn in the app; no photos) and private mode. */
export async function setLook(avatar: number, priv: boolean, frame = 0) {
  await rpc('rank_set_look', { my_avatar: avatar, is_private: priv, my_frame: frame });
  dropCache();
}

export async function setRankName(name: string) {
  await rpc('rank_set_name', { my_name: name });
  try { localStorage.setItem('rankName', name); } catch { /* ignore */ }
  dropCache();
}
export async function createBoard(name: string): Promise<{ id: string; code: string }> {
  await report();
  const r = await rpc<{ id: string; code: string }>('rank_create_board', { board_name: name });
  dropCache();
  return r;
}
export async function joinBoard(code: string): Promise<string> {
  await report();
  const id = await rpc<string>('rank_join_board', { board_code: code.trim().toLowerCase() });
  dropCache();
  return id;
}
export async function leaveBoard(id: string) {
  await rpc('rank_leave_board', { board: id });
  dropCache();
}
export const boardPreview = (code: string) => rpc<{ name: string; members: number; joined: boolean } | null>('rank_board_preview', { board_code: code.toLowerCase() });
export const boardLink = (code: string) => shareableLink(`#/rb/${code}`);

// --- friend challenge: one friend, the 7 days from the day they accept, in one kind of good deed ---
/** read = pages 10 + minutes 2 (the first kind); the others count their own unit. */
export type ChallengeKind = 'read' | 'pages' | 'listen' | 'lessons' | 'adhkar' | 'dhikr';
export const CHALLENGE_KINDS: ChallengeKind[] = ['pages', 'dhikr', 'adhkar', 'listen', 'lessons', 'read'];
export interface Challenge {
  id: string; code: string | null; start: string | null; end: string | null; waiting: boolean; expired: boolean;
  day: number | null; over: boolean; claimed: boolean; me: number | null; them: number | null; friend: Row | null;
  kind?: ChallengeKind; asked?: boolean; incoming?: boolean;
}
export const myChallenges = (fresh = false) => cached('challenges', () => rpc<Challenge[]>('rank_my_challenges', { d: rankDay() }), fresh);
export async function createChallenge(kind: ChallengeKind = 'read'): Promise<{ id: string; code: string }> {
  await report();
  const r = await rpc<{ id: string; code: string }>('rank_challenge_create', { k: kind });
  dropCache();
  return r;
}
export async function acceptChallenge(code: string): Promise<string> {
  await report();
  const id = await rpc<string>('rank_challenge_accept', { ch_code: code.trim().toLowerCase(), d: rankDay() });
  dropCache();
  return id;
}
/** Challenges a friend straight away (no link); it waits for their yes. */
export async function challengeFriend(pid: string, kind: ChallengeKind): Promise<string> {
  await report();
  const id = await rpc<string>('rank_challenge_friend', { who: pid, k: kind });
  dropCache();
  return id;
}
/** The friend's answer: yes starts the 7 days today, no removes it. */
export async function answerChallenge(id: string, yes: boolean) {
  if (yes) await report();
  await rpc('rank_challenge_answer', { ch: id, yes, d: rankDay() });
  dropCache();
}
export async function cancelChallenge(id: string) {
  await rpc('rank_challenge_cancel', { ch: id });
  dropCache();
}
export const challengePreview = (code: string) =>
  rpc<{ from: Row; taken: boolean; expired: boolean; mine: boolean; joined: boolean } | null>('rank_challenge_preview', { ch_code: code.toLowerCase() });
export const challengeLink = (code: string) => shareableLink(`#/rc/${code}`);
/** A gesture between the two players of a running challenge (0 wave, 1 MashaAllah, 2 keep going, 3 du'a, 4 race). */
export interface Cheer { ch: string; kind: number; at: string; mine: boolean }
export const myCheers = (fresh = false) => cached('cheers', () => rpc<Cheer[]>('rank_challenge_cheers'), fresh);
/** Sends a gesture; returns how many are left today (5 a day). */
export async function sendCheer(ch: string, kind: number): Promise<number> {
  const n = await rpc<number>('rank_challenge_cheer', { ch, kind });
  cache.delete('cheers');
  return n;
}
/** Claims a finished challenge's Light once (winner 100, tie 60, otherwise 30). */
export async function claimChallenge(c: Challenge): Promise<{ result: 'won' | 'tie' | 'lost'; light: number } | null> {
  const r = await rpc<{ result: 'won' | 'tie' | 'lost'; light: number } | null>('rank_challenge_claim', { ch: c.id });
  dropCache();
  if (r) claimGoal(`ch:${c.id}`, r.light);
  return r;
}

// --- weekly duel (everyone, no way out: owner 2026-11-12): this week's closest rival (league, then pace), the week's XP + dhikr / adhkar points + quests ---
export interface DuelQuest { kind: 'pages' | 'listen' | 'lessons' | 'adhkar' | 'dhikr'; target: number; done: boolean }
export interface Duel { id: string; week: string; end: string; day: number; me: number; them: number; rival: Row }
export interface DuelState { on: boolean; duel: Duel | null; quests: DuelQuest[] | null; last: { id: string; week: string; me: number; them: number; rival: Row } | null }
export const myDuel = (fresh = false) => cached('duel', () => rpc<DuelState>('rank_my_duel', { d: rankDay() }), fresh);
/** Opens last week's duel chest once (won 100, tie 60, otherwise 30). */
export async function claimDuel(id: string): Promise<{ result: 'won' | 'tie' | 'lost'; light: number; me: number; them: number } | null> {
  const r = await rpc<{ result: 'won' | 'tie' | 'lost'; light: number; me: number; them: number } | null>('rank_duel_claim', { duel: id });
  dropCache();
  if (r) claimGoal(`du:${id}`, r.light);
  return r;
}

// --- prizes: the top 3 of a league win a trophy and Light (#1 also a streak freeze) ---
export interface Prize { week: string; place: number | null; tier: number; promoted: boolean; light: number; freeze: boolean; item?: string | null; piece?: string | null; claimed: boolean }
export const myPrizes = (fresh = false) => cached('prizes', () => rpc<Prize[]>('rank_my_prizes'), fresh);
/** Claims a prize once: its Light joins the journey and a freeze is kept for later. */
export async function claimPrize(p: Prize): Promise<boolean> {
  const r = await rpc<{ light: number; freeze: boolean } | null>('rank_claim_prize', { wk: p.week });
  dropCache();
  if (!r) return false;
  const { keepFreeze } = await import('../data/shop');
  claimGoal(`rk:${p.week}`, r.light);
  if (r.freeze) keepFreeze(`prize:${p.week}`);
  // A prize-only garden decoration for the top 3 (waits on the garden's decorations shelf).
  if (p.place && p.place <= 3) { const { grantPrizeDeco } = await import('../data/garden'); grantPrizeDeco(p.week, p.place); }
  return true;
}

// --- moments: last week's result (once a week) and the players you passed since you last looked ---
// The Ranks screen shows them as cards; a full-screen moment can take them with takeRankMoments().
export interface RankMoments { week: (NonNullable<Status['last']> & { tierNow: number; weekStart: string }) | null; passed: string[] }
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
/** What is waiting to be shown (nothing is cleared). */
export function rankMoments(s: Status | null, league: { players: Row[] } | null): RankMoments {
  const out: RankMoments = { week: null, passed: [] };
  if (s?.last && ls.get('rankWeekSeen', '') !== s.weekStart) out.week = { ...s.last, tierNow: s.tier, weekStart: s.weekStart };
  if (league && s) {
    const seen = ls.get<{ w: string; above: string[] } | null>('rankAbove', null);
    const me = league.players.findIndex((r) => r.me);
    const above = league.players.slice(0, Math.max(0, me)).map((r) => r.name).filter((n): n is string => !!n);
    if (seen && seen.w === s.weekStart) out.passed = seen.above.filter((n) => !above.includes(n) && league.players.some((r) => r.name === n));
    else ls.set('rankAbove', { w: s.weekStart, above });
  }
  return out;
}
/** Marks the moments as seen. */
export function takeRankMoments(s: Status | null, league: { players: Row[] } | null) {
  if (s?.last) ls.set('rankWeekSeen', s.weekStart);
  if (league && s) {
    const me = league.players.findIndex((r) => r.me);
    ls.set('rankAbove', { w: s.weekStart, above: league.players.slice(0, Math.max(0, me)).map((r) => r.name).filter(Boolean) });
  }
}

/** When this week's league ends for this phone: its own Friday Maghrib (owner decision 2026-11-12). */
export const weekEnds = (now = new Date()): Date => weekEndAt(now);

// --- the league's last hours: where you stand, and (Android) a note on Sunday evening ---
export type Stand = { kind: 'up'; n: number } | { kind: 'hold'; n: number; place: number } | { kind: 'safe'; n: number } | { kind: 'top' } | { kind: 'join' };
/** What this week's league needs from you: points to the top 3, your lead over #4, or out of the bottom 3. */
export function standing(players: Row[]): Stand {
  const i = players.findIndex((r) => r.me);
  if (i < 0) return { kind: 'join' };
  const n = players.length, me = players[i].score;
  if (i < LEAGUE.up) {
    if (n <= LEAGUE.up || me === 0) return me === 0 ? { kind: 'up', n: 1 } : { kind: 'top' };
    return { kind: 'hold', n: me - players[LEAGUE.up].score, place: i + 1 };
  }
  if (n >= LEAGUE.downFrom && i >= n - LEAGUE.down) return { kind: 'safe', n: players[n - LEAGUE.down - 1].score - me + 1 };
  return { kind: 'up', n: players[LEAGUE.up - 1].score - me + 1 };
}
/** The last 3 hours before this phone's Friday Maghrib. */
export const lastHours = (now = new Date()) => { const left = weekEnds(now).getTime() - now.getTime(); return left > 0 && left <= 3 * 36e5; };
/** The last 3 days of the week (Wednesday → Friday, Islamic days): danger shows in red. */
export const lastDays = (now = new Date()) => weekEnds(now).getTime() - now.getTime() <= 3 * 864e5;
const NOTE_ID = 3300;
export const leagueNoteOn = () => { try { return localStorage.getItem('rankNote') !== '0'; } catch { return true; } };
export function setLeagueNote(on: boolean) {
  try { localStorage.setItem('rankNote', on ? '1' : '0'); } catch { /* ignore */ }
  void scheduleLeagueNote();
}
/** Android: one note 3 hours before this phone's Friday Maghrib with where you stand (rescheduled whenever the league is read). */
export async function scheduleLeagueNote(players?: Row[]) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: NOTE_ID }] });
    if (!leagueNoteOn() || !account()) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const at = new Date(weekEnds().getTime() - 3 * 36e5);
    if (at.getTime() < Date.now() + 60_000) return;
    const { rt } = await import('../i18n/ranks');
    const st = players ? standing(players) : { kind: 'join' as const };
    const body = st.kind === 'up' ? rt('rk.noteUp', { n: st.n, pages: Math.ceil(st.n / POINTS.page) })
      : st.kind === 'hold' ? rt('rk.noteHold', { place: st.place, n: st.n })
        : st.kind === 'safe' ? rt('rk.noteSafe', { n: st.n, pages: Math.ceil(st.n / POINTS.page) })
          : st.kind === 'top' ? rt('rk.noteTop') : rt('rk.noteJoin');
    await LocalNotifications.schedule({ notifications: [{
      id: NOTE_ID, smallIcon: 'ic_stat_crescent', title: rt('rk.noteTitle', { h: 3 }), body,
      schedule: { at, allowWhileIdle: true }, extra: { hash: '#/ranks' },
    }] });
  } catch { /* an older build or notifications off */ }
}

/** Last week from this device's own log: pages read and minutes of recitation (the 7 days before this week). */
export function lastWeekLocal(weekStart: string) {
  const days = allDays(), log = readLogAll();
  let pages = 0, listen = 0, active = 0;
  for (let i = -7; i < 0; i++) {
    const k = addDays(weekStart, i);
    const p = log[k]?.length ?? 0, l = Math.floor((days[k]?.l ?? 0) / 60);
    pages += p; listen += l; if (p || l) active++;
  }
  return { pages, listen, active };
}

// --- friends (owner request 2026-11-11; supabase/migrations/20261111400000_rank_friends.sql) ---
/** What a profile shows (bits, as on the server): this week's points, the flame streak, trophies, pages, listening. */
export const SHOW = { week: 1, streak: 2, trophies: 4, pages: 8, listen: 16 } as const;
export type ShowKey = keyof typeof SHOW;
/** Two friends' streak: the days in a row both earned points, and whether each has today. */
export interface FriendStreak { streak: number; meToday: boolean; themToday: boolean }
export interface Profile extends Omit<Row, 'score'> {
  relation: 'me' | 'friend' | 'sent' | 'asked' | 'none'; show: number; bestTier: number;
  week?: number; streak?: number; trophies?: number; pages?: number; listen?: number; friend?: FriendStreak;
}
export interface Friend extends Omit<Row, 'score'>, FriendStreak { since: string; week: number }
export interface Friends { friends: Friend[]; asks: Omit<Row, 'score'>[]; sent: string[] }

/** A friend streak that reached a milestone and was not shown on this device yet (`frMs:{pid}:{n}`). */
export function friendMilestoneDue(list: Friend[]): Friend | null {
  for (const f of list) {
    if (!f.pid || !isFriendFireDay(f.streak)) continue;
    try { if (localStorage.getItem(`frMs:${f.pid}:${f.streak}`)) continue; } catch { continue; }
    return f;
  }
  return null;
}
let momentAt = 0;
/** Checks the friend streaks (app open, return, after today's points went out, Ranks) and plays a milestone reached:
 *  both characters on fire together. Not over the studio, the Kids space or another moment; at most every 20 s. */
export async function friendMoments(): Promise<void> {
  if (!account() || document.hidden || Date.now() - momentAt < 20_000) return;
  try { if (!localStorage.getItem('rankFigure')) return; } catch { return; }
  momentAt = Date.now();
  let data: Friends;
  try { data = await myFriends(true); } catch { return; }
  if (friendMilestoneDue(data.friends)) {
    const m = await import('../ui/friends');
    await m.friendMilestone(data.friends);
    return;
  }
  // Every other day the streak goes on: one small card for all the friends kept today (owner 2026-11-12).
  const today = dayKey();
  const kept = data.friends.filter((f) => {
    if (!f.pid || !f.meToday || !f.themToday || f.streak < 1) return false;
    try { return !localStorage.getItem(`frUp:${today}:${f.pid}`); } catch { return false; }
  });
  if (!kept.length) return;
  const m = await import('../ui/friends');
  await m.friendDayMoment(kept);
}
// Profiles open at once (owner, 2026-11-11: "no loading, ever"): each one is kept on this device (per account, newest 60)
// and the league's players are fetched ahead while Ranks is open, the top 3 first. A profile shown from the kept copy is
// refreshed quietly and updated in place.
const PROF_STORE = 'rankProfiles';
const profs = new Map<string, { at: number; v: Profile | null }>();
let profsLoaded = false;
const loadProfs = () => {
  if (profsLoaded) return;
  profsLoaded = true;
  try {
    const v = JSON.parse(localStorage.getItem(PROF_STORE) ?? 'null');
    if (v && v.who === account()?.id && v.p && typeof v.p === 'object') for (const [k, p] of Object.entries(v.p)) profs.set(k, { at: 0, v: p as Profile });
  } catch { /* ignore */ }
};
let profTimer = 0;
const keepProfs = () => {
  clearTimeout(profTimer);
  profTimer = window.setTimeout(() => {
    const p: Record<string, Profile | null> = {};
    for (const [k, e] of [...profs.entries()].slice(-60)) p[k] = e.v;
    try { localStorage.setItem(PROF_STORE, JSON.stringify({ who: account()?.id, p })); } catch { /* full */ }
  }, 600);
};
/** The profile kept on this device (undefined when never seen). */
export function peekProfile(pid: string): Profile | null | undefined {
  loadProfs();
  return profs.get(pid)?.v;
}
/** Sets the kept profile (after an action, so a reopened profile shows the new state at once). */
export function putProfile(pid: string, v: Profile | null) {
  loadProfs();
  profs.delete(pid);
  profs.set(pid, { at: Date.now(), v });
  keepProfs();
}
const inflight = new Map<string, Promise<Profile | null>>();
/** A player's profile: kept for 2 minutes unless `fresh`. */
export function rankProfile(pid: string, fresh = false): Promise<Profile | null> {
  loadProfs();
  const c = profs.get(pid);
  if (!fresh && c && Date.now() - c.at < 120_000) return Promise.resolve(c.v);
  const running = inflight.get(pid);
  if (running) return running;
  const p = rpc<Profile | null>('rank_profile', { who: pid, d: rankDay() }).then((v) => { putProfile(pid, v); return v; }).finally(() => inflight.delete(pid));
  inflight.set(pid, p);
  return p;
}
/** Fetches ahead the profiles a tap may open (top 3 first): in one call (`rank_profiles`), kept 10 minutes. A tap
 *  shows the kept one at once and asks again (`rankProfile`). */
let batchOk = true;
export async function preloadProfiles(pids: (string | null | undefined)[]) {
  if (!account()) return;
  loadProfs();
  const todo = [...new Set(pids.filter((x): x is string => !!x))].filter((pid) => { const c = profs.get(pid); return !c || Date.now() - c.at > 600_000; });
  if (!todo.length) return;
  if (batchOk) {
    try {
      for (let i = 0; i < todo.length; i += 40) {
        const part = todo.slice(i, i + 40);
        const got = await rpc<Record<string, Profile | null>>('rank_profiles', { whos: part, d: rankDay() });
        for (const pid of part) putProfile(pid, got?.[pid] ?? null);
      }
      return;
    } catch (e) {
      // A server without it yet: one by one, as before.
      if (!navigator.onLine) return;
      if (/rank_profiles|PGRST202|function/i.test(String((e as Error)?.message ?? e))) batchOk = false;
    }
  }
  const next = async (): Promise<void> => {
    const pid = todo.shift();
    if (!pid) return;
    try { await rankProfile(pid); } catch { /* offline: tried again next time */ }
    return next();
  };
  await Promise.all([next(), next()]);
}
export const myFriends = (fresh = false) => cached('friends', () => rpc<Friends>('rank_my_friends', { d: rankDay() }), fresh);
export async function askFriend(pid: string): Promise<'sent' | 'friend'> {
  const r = await rpc<'sent' | 'friend'>('rank_friend_ask', { who: pid });
  dropCache();
  return r;
}
export async function answerFriend(pid: string, ok: boolean) { await rpc('rank_friend_answer', { who: pid, ok }); dropCache(); }
export async function removeFriend(pid: string) { await rpc('rank_friend_remove', { who: pid }); dropCache(); }
export const friendInvite = () => rpc<string>('rank_friend_invite');
export const friendInviteLink = (code: string) => shareableLink(`#/rf/${code}`);
export const friendInvitePreview = (code: string) =>
  rpc<{ name: string; avatar: number; frame: number; figure: string | null; tier: number; mine: boolean; friend: boolean } | null>('rank_friend_invite_preview', { code: code.toLowerCase() });
// --- invite rewards (marketing plan 2026-11-13): a new player joining with your link; after their 3rd day with points you both claim 50 Light once ---
export interface InviteRow { name: string | null; days: number; claimed: boolean }
export interface Invites { light: number; days: number; cap: number; rewarded: number; invitedBy: InviteRow | null; friends: (InviteRow & { pid: string })[] }
export const myInvites = (fresh = false) => cached('invites', () => rpc<Invites>('rank_my_invites'), fresh);
/** Claims once: pid = the friend you invited, null = your own reward for being invited. */
export async function claimInvite(pid: string | null): Promise<number> {
  const r = await rpc<{ light: number; id: string } | null>('rank_claim_invite', { who: pid });
  dropCache();
  if (!r) return 0;
  claimGoal(`iv:${r.id}`, r.light);
  return r.light;
}
export async function joinFriend(code: string) { const r = await rpc<Row>('rank_friend_join', { code: code.toLowerCase() }); dropCache(); return r; }
/** What your profile shows (kept on this device too) and your flame streak, sent when either changed. */
const SHOWN = 'rankShow';
export const myShow = (): number => { try { const v = Number(localStorage.getItem(SHOWN)); return Number.isInteger(v) && v >= 0 && v <= 31 && localStorage.getItem(SHOWN) !== null ? v : 7; } catch { return 7; } };
export async function sendProfile(show = myShow(), force = false) {
  if (!account()) return;
  try {
    const days = streak().days;
    const sig = `${show}:${days}`;
    if (!force && localStorage.getItem('rankShowSent') === sig) return;
    await rpc('rank_set_profile', { show_bits: show, my_streak: days });
    localStorage.setItem(SHOWN, String(show));
    localStorage.setItem('rankShowSent', sig);
  } catch { /* not playing yet, or offline: next time */ }
}
