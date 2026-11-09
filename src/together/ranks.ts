// Ranks (owner request 2026-11-09; supabase/migrations/20261110000000_ranks.sql): the app reports
// each day's totals of what it measures itself (pages counted after their reading time, seconds of
// recitation played, surahs finished, reels exported — all the user's devices combined), and reads
// the boards. The server caps the numbers, keeps them from going down or growing faster than time
// allows, and works out the score. Signed in with Google only; nothing is sent signed out.
import { account, onAccount } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import { addDays, allDays } from '../data/journey';
import { dayKey, readLogAll } from '../data/readLog';
import { shareableLink } from '../native';

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
export const POINTS = { page: 10, minute: 2, surah: 30, reel: 15, day: 20 };

/** A player on a board. A private player shows no name or avatar (name null). */
export interface Row { name: string | null; score: number; me: boolean; tier?: number; move?: number; avatar?: number | null; private?: boolean }
export type Metric = 'all' | 'pages' | 'listen' | 'surahs' | 'reels';
export const METRICS: Metric[] = ['all', 'pages', 'listen', 'surahs', 'reels'];
/** This week's quest, the same for everyone (server: rank_quest). */
export interface Quest { kind: 'pages' | 'listen' | 'days' | 'surahs'; target: number; done: number; bonus: number; complete: boolean | null }
export interface Status {
  name: string; tier: number; avatar: number; private: boolean; total: number; week: number; weekPlace: number | null; weekPlayers: number;
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
  return { pages: readLogAll()[k]?.length ?? 0, listen: Math.floor(d?.l ?? 0), surahs: d?.s?.length ?? 0, reels: d?.r ?? 0 };
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
      const sig = `${account()!.id}:${v.pages}:${v.listen}:${v.surahs}:${v.reels}`;
      if (sent[k] === sig || (k !== today && !v.pages && !v.listen && !v.surahs && !v.reels)) continue;
      await rpc('rank_report', { d: k, pages: v.pages, listen: v.listen, surahs: v.surahs, reels: v.reels, my_name: rankName() });
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
    try { if (sessionStorage.getItem('pendingBoard') && location.hash !== '#/ranks') location.hash = '#/ranks'; } catch { /* ignore */ }
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

export const rankStatus = (fresh = false) => cached('status', () => rpc<Status | null>('rank_status', { d: dayKey() }), fresh);
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
export async function setLook(avatar: number, priv: boolean) {
  await rpc('rank_set_look', { my_avatar: avatar, is_private: priv });
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
