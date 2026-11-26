// Notifications (owner request 2026-11-19): one history of what happened for the user — wins (goals, chests, badges,
// pieces, level, streak), friends (follows, asks, challenges, gestures, MashaAllahs, their milestones, gifts), the
// league (passed / passed by, last hours, last week's result, prizes) and news (Friday Al-Kahf, the season ahead).
// Kept after it is read, 60 days, until the user deletes it; synced with the account like the rest (localStorage
// `notifLog`, cloud/kv.ts). Entries are gathered from what the app already knows on this device (the journey, and the
// Ranks answers kept in `rankCache`), so nothing new is asked of the server. A deleted entry's key is remembered
// (`notifGone`) so the same event never comes back. What reaches the user is theirs to choose per group: in the app,
// as a phone notification (Android, while the app is in the background), and quiet hours.
import { pendingRewards } from './claims';
import { earnedPieces } from './wardrobe';
import { streak } from './journey';
import { dayKey } from './readLog';
export { dayKey }; // for notifText.ts (a dynamic import of readLog would split it out of the first load)
import { isFireDay } from './fireDays';
import { levelOf } from './xp';
import { weekEndAt } from './rankDay';
import { nextRamadan } from './season';
import { account } from '../cloud/auth';
import type { GoalProgress } from './goals';

export type NGroup = 'win' | 'friend' | 'league' | 'news';
export const GROUPS: NGroup[] = ['win', 'friend', 'league', 'news'];
export type NType =
  | 'goal' | 'weekGoal' | 'all' | 'weekAll' | 'badge' | 'pieces' | 'level' | 'fire' | 'chestCh' | 'pact' | 'gift'
  | 'follow' | 'ask' | 'challenge' | 'gesture' | 'cheer' | 'feat'
  | 'passed' | 'passedBy' | 'lastHours' | 'result' | 'prize'
  | 'kahf' | 'season';
export interface NEntry {
  /** Stable key of the event: the same event is never added twice. */ k: string;
  g: NGroup; ty: NType; at: string;
  /** Read. */ r?: 1;
  /** What the row shows: a name, a number, a goal, a badge id… */
  d?: { name?: string; n?: number; id?: string; goal?: Pick<GoalProgress, 'id' | 'kind' | 'week' | 'dhikr' | 'target'> & Record<string, unknown>; kind?: string; place?: number; tier?: number; week?: string; g?: number };
}

const LOG = 'notifLog', GONE = 'notifGone', PREFS = 'notifPrefs', SENT = 'notifSent';
const KEEP_DAYS = 60, MAX = 200;
const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } };

// --- what reaches the user ---
export interface NPrefs { app: Record<NGroup, boolean>; phone: Record<NGroup, boolean>; quiet: [number, number] }
const DEF: NPrefs = { app: { win: true, friend: true, league: true, news: true }, phone: { win: true, friend: true, league: false, news: false }, quiet: [22, 7] };
export function notifPrefs(): NPrefs {
  const v = read<Partial<NPrefs>>(PREFS, {});
  const out: NPrefs = { app: { ...DEF.app }, phone: { ...DEF.phone }, quiet: [...DEF.quiet] as [number, number] };
  for (const g of GROUPS) {
    if (typeof v.app?.[g] === 'boolean') out.app[g] = v.app[g];
    if (typeof v.phone?.[g] === 'boolean') out.phone[g] = v.phone[g];
  }
  if (Array.isArray(v.quiet) && v.quiet.length === 2 && v.quiet.every((x) => Number.isInteger(x) && x >= 0 && x < 24)) out.quiet = [v.quiet[0], v.quiet[1]];
  return out;
}
export function setNotifPrefs(p: NPrefs) { write(PREFS, p); window.dispatchEvent(new Event('notifs-changed')); }
/** Inside the user's quiet hours (default 22:00–07:00). */
export function quietNow(now = new Date(), p = notifPrefs()): boolean {
  const [a, b] = p.quiet;
  if (a === b) return false;
  const h = now.getHours();
  return a < b ? h >= a && h < b : h >= a || h < b;
}

// --- the log ---
let mem: NEntry[] | null = null;
export function notifLog(): NEntry[] {
  if (mem) return mem;
  const v = read<NEntry[]>(LOG, []);
  mem = Array.isArray(v) ? v.filter((e) => e && typeof e.k === 'string' && GROUPS.includes(e.g) && typeof e.at === 'string') : [];
  return mem;
}
window.addEventListener('storage', (e) => { if (e.key === LOG) mem = null; });
window.addEventListener('sync-arrived', () => { mem = null; });
const save = (list: NEntry[]) => {
  const from = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
  mem = list.filter((e) => e.at >= from).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX);
  write(LOG, mem);
  window.dispatchEvent(new Event('notifs-changed'));
};
const gone = (): Record<string, string> => read<Record<string, string>>(GONE, {});

/** Visible entries (the groups the user keeps in the app). */
export const visibleNotifs = (p = notifPrefs()) => notifLog().filter((e) => p.app[e.g]);
/** Unread, for the bell. */
export const unreadCount = () => { try { collectNotifs(); return visibleNotifs().filter((e) => !e.r).length; } catch { return 0; } };

export function markRead(keys?: string[]) {
  const set = keys ? new Set(keys) : null;
  let changed = false;
  const list = notifLog().map((e) => (!e.r && (!set || set.has(e.k)) ? (changed = true, { ...e, r: 1 as const }) : e));
  if (changed) save(list);
}
/** Deletes entries for good (their events do not come back). Returns what was removed, for Undo. */
export function deleteNotifs(keys: string[]): NEntry[] {
  const set = new Set(keys);
  const out = notifLog().filter((e) => set.has(e.k));
  const g = gone();
  const now = new Date().toISOString();
  for (const k of keys) g[k] = now;
  const from = new Date(Date.now() - (KEEP_DAYS + 30) * 864e5).toISOString();
  for (const [k, at] of Object.entries(g)) if (at < from) delete g[k];
  write(GONE, g);
  save(notifLog().filter((e) => !set.has(e.k)));
  return out;
}
export function undoDelete(entries: NEntry[]) {
  const g = gone();
  for (const e of entries) delete g[e.k];
  write(GONE, g);
  const have = new Set(notifLog().map((e) => e.k));
  save([...notifLog(), ...entries.filter((e) => !have.has(e.k))]);
}

// --- gathering ---
const rankKept = (): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(localStorage.getItem('rankCache') ?? 'null');
    return v && v.who && v.who === account()?.id && v.v && typeof v.v === 'object' ? v.v : null;
  } catch { return null; }
};
type Row = { name?: string | null; pid?: string | null; me?: boolean };

let busy = false;
let lastRun = 0;
/** Adds what happened since the last look. Cheap: runs at most once a second. */
export function collectNotifs(force = false): NEntry[] {
  if (busy || (!force && Date.now() - lastRun < 1000)) return [];
  busy = true; lastRun = Date.now();
  try {
    const now = new Date();
    const iso = now.toISOString();
    const day = dayKey(now);
    const have = new Set(notifLog().map((e) => e.k));
    const g = gone();
    const first = !localStorage.getItem(LOG);
    const add: NEntry[] = [];
    const put = (e: Omit<NEntry, 'at'> & { at?: string }) => {
      if (have.has(e.k) || g[e.k]) return;
      have.add(e.k);
      add.push({ ...e, at: e.at && e.at <= iso ? e.at : iso });
    };

    // Wins: chests and badges waiting for their Claim.
    for (const p of pendingRewards(now)) {
      if (p.kind === 'goal') {
        const { id, kind, week, dhikr, target } = p.goal;
        const goal = { ...p.goal, id, kind, week, dhikr, target } as NonNullable<NEntry['d']>['goal'];
        put({ k: `g:${week ?? day}:${id}`, g: 'win', ty: week ? 'weekGoal' : 'goal', d: { goal } });
      } else if (p.kind === 'all') put({ k: `ga:${day}`, g: 'win', ty: 'all' });
      else if (p.kind === 'weekAll') put({ k: `gw:${day.slice(0, 8)}`, g: 'win', ty: 'weekAll' });
      else put({ k: `b:${p.id}`, g: 'win', ty: 'badge', d: { id: p.id } });
    }
    const pieces = earnedPieces(now);
    if (pieces.length) put({ k: `pc:${pieces.sort().join(',')}`, g: 'win', ty: 'pieces', d: { n: pieces.length } });
    const st = streak(now);
    if (st.litToday && st.days >= 3 && isFireDay(st.days)) put({ k: `sf:${st.days}:${day}`, g: 'win', ty: 'fire', d: { n: st.days } });
    try {
      const xp = Number(localStorage.getItem('rankXp')) || 0;
      const lv = levelOf(xp);
      if (xp > 0 && lv > 1) put({ k: `lv:${lv}`, g: 'win', ty: 'level', d: { n: lv } });
    } catch { /* ignore */ }

    // Friends and the league: from the Ranks answers kept on this device.
    const rk = rankKept();
    if (rk) {
      const fol = (rk.follows as { followers?: (Row & { at: string; on?: boolean })[] } | undefined)?.followers ?? [];
      for (const f of fol) if (f.at) put({ k: `fo:${f.pid ?? f.name}:${f.at.slice(0, 10)}`, g: 'friend', ty: 'follow', at: f.at, d: { name: f.name ?? '' } });
      const asks = (rk.friends as { asks?: Row[] } | undefined)?.asks ?? [];
      for (const a of asks) put({ k: `fa:${a.pid ?? a.name}`, g: 'friend', ty: 'ask', d: { name: a.name ?? '' } });
      const chs = (rk.challenges as { id: string; incoming?: boolean; over?: boolean; claimed?: boolean; start?: string | null; kind?: string; friend?: Row | null }[] | undefined) ?? [];
      for (const c of chs) {
        if (c.incoming) put({ k: `ci:${c.id}`, g: 'friend', ty: 'challenge', d: { name: c.friend?.name ?? '', kind: c.kind } });
        if (c.over && !c.claimed && c.start) put({ k: `cc:${c.id}`, g: 'win', ty: 'chestCh', d: { name: c.friend?.name ?? '' } });
      }
      const cheers = (rk.cheers as { ch: string; kind: number; at: string; mine: boolean }[] | undefined) ?? [];
      const week = now.getTime() - 7 * 864e5;
      for (const c of cheers) if (!c.mine && Date.parse(c.at) > week) {
        put({ k: `gs:${c.ch}:${c.at}`, g: 'friend', ty: 'gesture', at: c.at, d: { name: chs.find((x) => x.id === c.ch)?.friend?.name ?? '', n: c.kind } });
      }
      const feats = rk.feats as { friends?: (Row & { id: number; kind: string; n: number; at: string })[]; mine?: { id: number; kind: string; n: number; at: string; cheers?: number; by?: string[] }[] } | undefined;
      for (const f of feats?.friends ?? []) put({ k: `ff:${f.id}`, g: 'friend', ty: 'feat', at: f.at, d: { name: f.name ?? '', kind: f.kind, n: f.n } });
      for (const f of feats?.mine ?? []) if ((f.cheers ?? 0) > 0) put({ k: `fc:${f.id}`, g: 'friend', ty: 'cheer', d: { name: f.by?.[0] ?? '', n: f.cheers, kind: f.kind, g: f.n } });
      try {
        const gv = JSON.parse(localStorage.getItem('giftsWaiting') ?? 'null');
        if (gv && (gv.n | 0) > 0) put({ k: `gf:${day}`, g: 'friend', ty: 'gift', d: { n: Math.min(20, gv.n | 0) } });
      } catch { /* ignore */ }

      const s = rk.status as { weekStart?: string; tier?: number; last?: { place: number; tier: number; size: number } | null } | undefined;
      const league = rk.league as { players?: Row[] } | undefined;
      if (s?.weekStart && s.last) put({ k: `lr:${s.weekStart}`, g: 'league', ty: 'result', d: { place: s.last.place, tier: s.last.tier, n: s.last.size } });
      if (s?.weekStart && league?.players?.length) {
        const ps = league.players;
        const me = ps.findIndex((r) => r.me);
        if (me >= 0) {
          const above = ps.slice(0, me).map((r) => r.name).filter((n): n is string => !!n);
          const seen = read<{ w: string; above: string[] } | null>('notifAbove', null);
          if (seen && seen.w === s.weekStart) {
            for (const n of seen.above) if (!above.includes(n) && ps.some((r) => r.name === n)) put({ k: `lp:${s.weekStart}:${n}`, g: 'league', ty: 'passed', d: { name: n, place: me + 1 } });
            for (const n of above) if (!seen.above.includes(n)) put({ k: `lb:${s.weekStart}:${n}:${day}`, g: 'league', ty: 'passedBy', d: { name: n, place: me + 1 } });
          }
          write('notifAbove', { w: s.weekStart, above });
          const left = weekEndAt(now).getTime() - now.getTime();
          if (left > 0 && left <= 3 * 36e5) put({ k: `lh:${s.weekStart}`, g: 'league', ty: 'lastHours', d: { place: me + 1 } });
        }
      }
      const prizes = (rk.prizes as { week: string; place: number | null; claimed?: boolean }[] | undefined) ?? [];
      for (const p of prizes) if (!p.claimed) put({ k: `pz:${p.week}`, g: 'league', ty: 'prize', d: { week: p.week, place: p.place ?? 0 } });
    }

    // News.
    if (now.getDay() === 5) put({ k: `nk:${day}`, g: 'news', ty: 'kahf' });
    const rm = nextRamadan(now);
    const days = rm.start ? Math.ceil((rm.start.getTime() - now.getTime()) / 864e5) : 0;
    if (days > 0 && days <= 30) put({ k: `ns:${rm.year}`, g: 'news', ty: 'season', d: { n: days } });

    if (!add.length) return [];
    // The very first look: what was already there is not news (kept as read, so the history starts full).
    if (first) for (const e of add) e.r = 1;
    save([...notifLog(), ...add]);
    if (!first) void phone(add);
    return add;
  } finally { busy = false; }
}

// --- phone notifications (Android, while the app is in the background) ---
const PHONE_IDS = Array.from({ length: 10 }, (_, i) => 3650 + i);
const ORDER: NGroup[] = ['friend', 'win', 'league', 'news'];
async function phone(add: NEntry[]) {
  if (!document.hidden) return;
  const p = notifPrefs();
  if (quietNow(new Date(), p)) return;
  const { isNative } = await import('../native');
  if (!isNative()) return;
  const today = dayKey();
  const sent = read<{ d: string; n: number }>(SENT, { d: today, n: 0 });
  if (sent.d !== today) { sent.d = today; sent.n = 0; }
  if (sent.n >= 3) return;
  // Wins that are goal notes already have their own note (ui/nudges.ts).
  const pick = add.filter((e) => p.phone[e.g] && e.ty !== 'goal' && e.ty !== 'weekGoal' && e.ty !== 'all')
    .sort((a, b) => ORDER.indexOf(a.g) - ORDER.indexOf(b.g));
  if (!pick.length) return;
  const { notifText } = await import('../ui/notifText');
  const top = pick[0];
  const more = pick.filter((e) => e.g === top.g).length - 1;
  const { title, sub, to } = await notifText(top, more);
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    sent.n++;
    write(SENT, sent);
    await LocalNotifications.schedule({ notifications: [{
      id: PHONE_IDS[sent.n % PHONE_IDS.length], title, body: sub || ' ', smallIcon: 'ic_stat_crescent',
      // A tap opens the screen this notification is about (src/ui/notifTap.ts), not the list.
      schedule: { at: new Date(Date.now() + 400), allowWhileIdle: true }, extra: { hash: to.hash, st: to.store, run: to.run },
    }] });
  } catch { /* an older build */ }
}

/** App start: keeps the history current in the background too (a phone notification needs the app to notice). */
export function watchNotifs() {
  const run = () => { try { collectNotifs(); } catch { /* ignore */ } };
  for (const e of ['journey-changed', 'rank-cache', 'sync-arrived']) window.addEventListener(e, () => setTimeout(run, 300));
  document.addEventListener('visibilitychange', () => setTimeout(run, 300));
  setTimeout(run, 2000);
}
