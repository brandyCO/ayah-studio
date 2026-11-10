// Ranks (owner request 2026-11-09; supabase/migrations/20261110000000_ranks.sql): the app reports
// each day's totals of what it measures itself (pages counted after their reading time, seconds of
// recitation played, surahs finished, reels exported — all the user's devices combined), and reads
// the boards. The server caps the numbers, keeps them from going down or growing faster than time
// allows, and works out the score. Signed in with Google only; nothing is sent signed out.
import { account, onAccount } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { addDays, allDays, claimGoal } from '../data/journey';
import { dayKey, readLogAll } from '../data/readLog';
import { isNative, shareableLink } from '../native';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const TIERS = ['lantern', 'star', 'moon', 'dawn', 'sun'] as const;
export type Tier = (typeof TIERS)[number];
export const tierOf = (n: number): Tier => TIERS[Math.max(0, Math.min(4, n | 0))];
/** League size and how many move up / down at the week's end (server: rank_join_league). */
export const LEAGUE = { size: 15, up: 3, down: 3, downFrom: 8 };
/** Points, as the server counts them (rank_score). */
export const POINTS = { page: 10, minute: 2, surah: 30, reel: 15, lesson: 15, day: 20 };

/** A player on a board. A private player shows no name or avatar (name null). */
export interface Row { name: string | null; score: number; me: boolean; tier?: number; move?: number; avatar?: number | null; frame?: number; private?: boolean; figure?: string | null }
export type Metric = 'all' | 'pages' | 'listen' | 'surahs' | 'reels';
export const METRICS: Metric[] = ['all', 'pages', 'listen', 'surahs', 'reels'];
/** This week's quest, the same for everyone (server: rank_quest). */
export interface Quest { kind: 'pages' | 'listen' | 'days' | 'surahs' | 'lessons'; target: number; done: number; bonus: number; complete: boolean | null }
export interface Status {
  name: string; tier: number; avatar: number; frame: number; figure?: string | null; bestTier: number; bestPlace: number | null; wins: number; prizes: number; private: boolean; total: number; week: number; weekPlace: number | null; weekPlayers: number;
  allPlace: number; allPlayers: number; quest: Quest; rival: (Row & { gap: number }) | null;
  /** Last week's league result, if the player played. */
  last: { score: number; tier: number; size: number; place: number } | null; weekStart: string;
}
export interface Board { id: string; name: string; code: string; mine: boolean; members: number }

const firstName = () => (account()?.name ?? '').trim().split(/\s+/)[0]?.slice(0, 24) || 'Reader';
/** The name others see: the user's own choice, else the first name of the account. */
export const rankName = () => { try { return localStorage.getItem('rankName') || firstName(); } catch { return firstName(); } };

// --- reporting: today (and yesterday, until it is settled), at most every 90 s, only when changed ---
function totals(k: string) {
  const d = allDays()[k];
  return { pages: readLogAll()[k]?.length ?? 0, listen: Math.floor(d?.l ?? 0), surahs: d?.s?.length ?? 0, reels: d?.r ?? 0, lessons: d?.ls ?? 0 };
}
let timer = 0;
let busy = false;
export function reportSoon(delay = 90_000) {
  if (!account() || timer) return;
  timer = window.setTimeout(() => { timer = 0; void report(); }, delay);
}
export async function report(): Promise<void> {
  if (!account() || busy) return;
  busy = true;
  try {
    let sent: Record<string, string> = {};
    try { sent = JSON.parse(localStorage.getItem('rankSent') ?? '{}'); } catch { /* ignore */ }
    const today = dayKey();
    for (const k of [addDays(today, -1), today]) {
      const v = totals(k);
      const sig = `${account()!.id}:${v.pages}:${v.listen}:${v.surahs}:${v.reels}:${v.lessons}`;
      if (sent[k] === sig || (k !== today && !v.pages && !v.listen && !v.surahs && !v.reels && !v.lessons)) continue;
      await rpc('rank_report', { d: k, pages: v.pages, listen: v.listen, surahs: v.surahs, reels: v.reels, my_name: rankName(), lessons: v.lessons });
      sent[k] = sig;
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
  const soon = () => reportSoon();
  window.addEventListener('journey-changed', soon);
  window.addEventListener('readlog-changed', soon);
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer) { clearTimeout(timer); timer = 0; void report(); } });
  onAccount((a) => {
    if (!a) return;
    reportSoon(3000);
    // A board invite opened before signing in: Ranks joins it.
    try { if ((sessionStorage.getItem('pendingBoard') || sessionStorage.getItem('pendingChallenge')) && location.hash !== '#/ranks') location.hash = '#/ranks'; } catch { /* ignore */ }
    void scheduleLeagueNote();
  });
}

// --- reading the boards (kept a minute, so switching tabs is instant) ---
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
  const c = cache.get(key);
  if (!fresh && c && Date.now() - c.at < 60_000) return c.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  return v;
}
export const dropCache = () => cache.clear();

export const rankStatus = (fresh = false) => cached('status', async () => {
  const s = await rpc<Status | null>('rank_status', { d: dayKey() });
  if (s) { s.figure = await myFigure(); await sendLocalFigure(); }
  return s;
}, fresh);
// The character from the builder (src/ui/figure.ts): kept on this device too, so the status needs no change on the server.
const FIG = 'rankFigure';
async function myFigure(): Promise<string | null> {
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
/** A character made before signing in goes up the first time the boards are read. */
async function sendLocalFigure() {
  try {
    const v = localStorage.getItem(FIG);
    if (!v || localStorage.getItem(SENT) === v) return;
    await rpc('rank_set_figure', { code: v });
    localStorage.setItem(SENT, v);
  } catch { /* try again next time */ }
}
export const rankLeague = (fresh = false) => cached('league', () => rpc<{ tier: number; players: Row[] } | null>('rank_league', { d: dayKey() }), fresh);
export const rankGlobal = (allTime: boolean, metric: Metric = 'all', fresh = false) =>
  cached(`global:${allTime}:${metric}`, () => rpc<Row[]>('rank_global', { d: dayKey(), all_time: allTime, metric }), fresh);
export const myBoards = (fresh = false) => cached('boards', () => rpc<Board[]>('rank_my_boards'), fresh);
export const boardRanks = (id: string, metric: Metric = 'all', fresh = false) =>
  cached(`board:${id}:${metric}`, () => rpc<Row[]>('rank_board', { board: id, d: dayKey(), metric }), fresh);
export const boardGoal = (id: string, fresh = false) => cached(`goal:${id}`, () => rpc<{ goal: number | null; pages: number }>('rank_board_goal', { board: id, d: dayKey() }), fresh);
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

// --- friend challenge: one friend, the 7 days from the day they accept, pages + listening ---
export interface Challenge {
  id: string; code: string | null; start: string | null; end: string | null; waiting: boolean; expired: boolean;
  day: number | null; over: boolean; claimed: boolean; me: number | null; them: number | null; friend: Row | null;
}
export const myChallenges = (fresh = false) => cached('challenges', () => rpc<Challenge[]>('rank_my_challenges', { d: dayKey() }), fresh);
export async function createChallenge(): Promise<{ id: string; code: string }> {
  await report();
  const r = await rpc<{ id: string; code: string }>('rank_challenge_create');
  dropCache();
  return r;
}
export async function acceptChallenge(code: string): Promise<string> {
  await report();
  const id = await rpc<string>('rank_challenge_accept', { ch_code: code.trim().toLowerCase(), d: dayKey() });
  dropCache();
  return id;
}
export async function cancelChallenge(id: string) {
  await rpc('rank_challenge_cancel', { ch: id });
  dropCache();
}
export const challengePreview = (code: string) =>
  rpc<{ from: Row; taken: boolean; expired: boolean; mine: boolean; joined: boolean } | null>('rank_challenge_preview', { ch_code: code.toLowerCase() });
export const challengeLink = (code: string) => shareableLink(`#/rc/${code}`);
/** Claims a finished challenge's Light once (winner 100, tie 60, otherwise 30). */
export async function claimChallenge(c: Challenge): Promise<{ result: 'won' | 'tie' | 'lost'; light: number } | null> {
  const r = await rpc<{ result: 'won' | 'tie' | 'lost'; light: number } | null>('rank_challenge_claim', { ch: c.id });
  dropCache();
  if (r) claimGoal(`ch:${c.id}`, r.light);
  return r;
}

// --- prizes: the top 3 of a league win a trophy and Light (#1 also a streak freeze) ---
export interface Prize { week: string; place: number | null; tier: number; promoted: boolean; light: number; freeze: boolean; item?: string | null; claimed: boolean }
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

/** When the week's league ends (Monday 00:00, local). */
export function weekEnds(now = new Date()): Date {
  const toMon = (8 - now.getDay()) % 7 || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + toMon);
}

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
/** Sunday from 18:00 until midnight: the last hours (local). */
export const lastHours = (now = new Date()) => now.getDay() === 0 && now.getHours() >= 18;
const NOTE_ID = 3300;
export const leagueNoteOn = () => { try { return localStorage.getItem('rankNote') !== '0'; } catch { return true; } };
export function setLeagueNote(on: boolean) {
  try { localStorage.setItem('rankNote', on ? '1' : '0'); } catch { /* ignore */ }
  void scheduleLeagueNote();
}
/** Android: one note at 18:00 on Sunday with where you stand (rescheduled whenever the league is read). */
export async function scheduleLeagueNote(players?: Row[]) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: NOTE_ID }] });
    if (!leagueNoteOn() || !account()) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const end = weekEnds();
    const at = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1, 18, 0);
    if (at.getTime() < Date.now() + 60_000) return;
    const { rt } = await import('../i18n/ranks');
    const st = players ? standing(players) : { kind: 'join' as const };
    const body = st.kind === 'up' ? rt('rk.noteUp', { n: st.n, pages: Math.ceil(st.n / POINTS.page) })
      : st.kind === 'hold' ? rt('rk.noteHold', { place: st.place, n: st.n })
        : st.kind === 'safe' ? rt('rk.noteSafe', { n: st.n, pages: Math.ceil(st.n / POINTS.page) })
          : st.kind === 'top' ? rt('rk.noteTop') : rt('rk.noteJoin');
    await LocalNotifications.schedule({ notifications: [{
      id: NOTE_ID, smallIcon: 'ic_stat_crescent', title: rt('rk.noteTitle', { h: 6 }), body,
      schedule: { at, allowWhileIdle: true }, extra: { hash: '#/ranks' },
    }] });
  } catch { /* an older build or notifications off */ }
}

/** Last week from this device's own log: pages read and minutes of recitation (Monday → Sunday). */
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
