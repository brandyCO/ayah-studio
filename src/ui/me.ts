// Me (#/me): a compact streak card (flame, count, this week), today's goals (pages, memorising, reels,
// dhikr, morning adhkar), today's prayer times, honest stats (this week against last week, month, all
// time), milestone badges, My library. Its settings (reading time per page, prayer method and lock
// screen, dhikr reminders) live on #/me/settings, with the way on to the app's menu.
import { levelLabel, levelOf, myXp } from '../data/xp';
import { setSoundsOn, soundsOn } from './sfx';
import './me.css';
import { noorLine, noorText } from './noor';
import { eveningFrom, refreshAsr } from '../data/adhkar';
import { akt } from '../i18n/adhkar';
import { favouritesSection } from './favourite';
import { favouriteIds } from '../data/reciterDownload';
import { mushafOfflineRow } from './mushafOffline';
import { reciterById } from '../data/reciters';
import { dayKey, readLog } from '../data/readLog';
import { addMemorised, addDays, PAGE_TIMES, pageSeconds, setPageSeconds, stats, streak, weekOf, type Period, type Stats } from '../data/journey';
import { CUSTOM_MAX, CUSTOM_TIMES, DHIKR, DHIKR_GOALS, MEMO_GOALS, PACES, PAGE_GOALS, REEL_GOALS, acceptTip, choosePace, dismissTip, goalTip, goals, needsPace, setGoals, todayGoals, type CustomGoal, type DhikrId, type GoalProgress, type GoalTip, type Pace } from '../data/goals';
import { badgeDone, badgeStates, type BadgeDef, type BadgeGroup, type BadgeState } from '../data/badges';
import { badgeGoal, badgeName, bt, tierName, type BadgeKey } from '../i18n/badges';
import { iconCard, newIconCard } from './appIcons';
import { badgeMoment } from '../data/claims';
import { addCustom, claimBadge, claimGoal, goalClaimed, lightOn } from '../data/journey';
import { ALL_LIGHT, BADGE_LIGHT, DUA_GOALS, LESSON_GOALS, WEEK_ALL_LIGHT, WEEK_LISTEN, WEEK_NIGHTS, WEEK_PAGES, WEEK_REELS, WEEK_SURAHS, dayLightMax, lightFor, resetsAt, weekAllId, weekClaimed, weekGoals } from '../data/goals';
import { bookmarks } from '../data/bookmarks';
import { recentPages } from '../data/history';
import { loadMeta, type SurahMeta } from '../data/quran';
import { LANGS, lang, locale, setLang, surahName, t, type Key, uiRef } from '../i18n';
import { h, haptic, toast } from './dom';
import { mt } from '../i18n/moments';
import { flame, flameTier } from './flame';
import { isFireDay } from '../data/fireDays';
const hasFigure = () => { try { return !!localStorage.getItem('rankFigure'); } catch { return false; } };
import { dayMark } from './streakMoment';
import { rewardPalette, rgba } from './theme';
import { badgeArt } from './badge';
import { goMushaf, tabBar } from './tabs';
import { lightChip, star } from './lightChip';
import { wallet } from '../data/garden';
import { lastRead, setReaderMode } from './prefs';
import { setTimeTint, timeTintOn } from './living';
import { currentTranslation, setTranslation, translationInfo } from '../data/translations';
import { accountLabel } from './account';
import { METHODS, PRAYERS, locatePrayer, prayerDay, prayerSettings, setPrayerSettings, type Method } from '../data/prayer';
import { REMINDER_TIMES, allowNotifications, dhikrReminders, setDhikrReminders } from './widgets';
import { isNative } from '../native';
import { ALERT_PRAYERS, BEFORE, SOUNDS, anyAlert, askExact, exactAllowed, prayerAlerts, previewSound, setPrayerAlerts } from './prayerAlerts';
import { widgetHint } from './widgetsPage';
import { account } from '../cloud/auth';
import { firstSyncPending, onSyncStatus, syncNow, syncStatus } from '../cloud/sync';
import { tick as tickNum } from './juice';
import { openAccount } from './account';
import { goalLabel, goalText } from './goalName';
import { dayCard } from './firstSteps';
import { todayCard } from './todayCard';
import { seasonCard } from './seasonCard';
import { RISK_TIMES, nudgeSettings, setNudgeSettings } from './nudges';
import { chest } from './chest';
import { mpt } from '../i18n/mePages';
import { inboxBell } from './inbox';

const minutes = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? t('me.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('me.min', { n: m });
};
const timeLabel = (sec: number) => (sec % 60 ? t('me.minHalf', { n: Math.floor(sec / 60) }) : t('me.minN', { n: sec / 60 }));
/** "Read 2 pages", "Read 1 page"… (a goal's name for an amount). */
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

let period: Period = 'week';
/** Which goals the goals card shows: today's or this week's (remembered on this device). */
type GoalTab = 'day' | 'week' | 'ch';
let goalTab: GoalTab = (() => { try { const v = localStorage.getItem('meGoalTab'); return v === 'week' || v === 'ch' ? v : 'day'; } catch { return 'day'; } })();
/** A friend challenge waits for an answer or a chest, from the Ranks answers kept on this device (no network). */
const challengeWaiting = () => {
  try {
    const v = JSON.parse(localStorage.getItem('rankCache') ?? 'null')?.v?.challenges as { incoming?: boolean; over?: boolean; claimed?: boolean; start?: string | null }[] | undefined;
    return !!v?.some((c) => c.incoming || (c.over && !c.claimed && c.start));
  } catch { return false; }
};
/** The doors on Me open these full screens: #/me/room, #/me/prayer, #/me/stats, #/me/library. */
export const ME_PAGES = ['room', 'prayer', 'stats', 'library'] as const;
export type MePage = (typeof ME_PAGES)[number];

function dialog(title: string, ...body: (Node | string | false)[]) {
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    ...body.filter((x): x is Node | string => x !== false));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  return d;
}

/** A badge's sheet: the medallion large, its goal and progress, or the day it was earned. */
export function openBadge(b: BadgeState, fresh = false) {
  const n = b.def.need;
  dialog(fresh ? t('bd.new') : t('bd.title'),
    h('div', { class: `bd-detail${fresh ? ' fresh' : ''}` },
      badgeArt(b.def.tier, b.def.icon, !!b.earned, 148),
      h('h3', {}, badgeName(b.def)),
      h('p', { class: 'muted' }, badgeGoal(b.def)),
      b.earned
        ? h('p', { class: 'bd-when' }, t('bd.earned', { date: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(parse(b.earned)) }))
        : h('div', { class: 'bd-progress' }, h('span', { style: `width:${Math.round((100 * b.have) / n)}%` }), h('b', {}, b.def.fam === 'league' ? `${b.have} / ${n}` : `${b.have.toLocaleString()} / ${n.toLocaleString()}`))));
}

// What the goal rings and the Light lantern showed last (this session), so they fill on from there.
const ringWas = new Map<string, number>();

/** ‹ on Me's own screens: step back in history when Me opened it, so the phone's back button does not loop. */
const backToMe = (e: Event) => {
  let fromMe = false;
  try { fromMe = sessionStorage.getItem('meScroll') !== null; } catch { /* ignore */ }
  if (fromMe && history.length > 1) { e.preventDefault(); history.back(); }
};
const svgIcon = (cls: string, body: string) => {
  const el = h('span', { class: cls, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return el;
};
const roomIcon = () => svgIcon('me-room-ic', '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>');
const editIcon = () => svgIcon('goal-edit-ic', '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>');
const clockIcon = () => svgIcon('goal-reset-ic', '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>');
let lanternWas: number | undefined;

export async function showMe(root: HTMLElement, at?: string): Promise<() => void> {
  const page = (ME_PAGES as readonly string[]).includes(at ?? '') ? at as MePage : undefined;
  // Sent here to a tab (the inbox's friend challenges): open on it.
  try { const v = sessionStorage.getItem('meGoalTab'); if (v === 'ch' || v === 'week' || v === 'day') { goalTab = v; sessionStorage.removeItem('meGoalTab'); } } catch { /* ignore */ }
  const meta = await loadMeta();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lite');
  const hero = h('section', { class: 'me-hero' });
  // The streak card's sky follows the user's day in the same seven times as the du'a lanterns (owner request
  // 2026-11-11): before dawn, Fajr, Dhuhr, Asr, Maghrib, Isha, and the night's sleep, each its own sky. From the prayer
  // times when a location is set, else by the hour.
  const SKIES = ['wake', 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'sleep'] as const;
  const paintSky = async () => {
    const now = new Date(), hr = now.getHours() + now.getMinutes() / 60;
    let sky: (typeof SKIES)[number] = hr >= 3 && hr < 5 ? 'wake' : hr >= 5 && hr < 7 ? 'fajr' : hr >= 7 && hr < 15 ? 'dhuhr'
      : hr >= 15 && hr < 17.5 ? 'asr' : hr >= 17.5 && hr < 19 ? 'maghrib' : hr >= 19 && hr < 22 ? 'isha' : 'sleep';
    try {
      const p = await prayerDay(now);
      if (p) {
        const at = now.getTime(), M = 60_000, [fajr, sunrise, , asr, maghrib, isha] = p.map((d) => d.getTime());
        sky = at >= fajr - 120 * M && at < fajr ? 'wake' : at >= fajr && at < sunrise + 30 * M ? 'fajr' : at >= sunrise && at < asr ? 'dhuhr'
          : at >= asr && at < maghrib - 25 * M ? 'asr' : at >= maghrib - 25 * M && at < isha ? 'maghrib' : at >= isha && at < isha + 150 * M ? 'isha' : 'sleep';
      }
    } catch { /* by the hour, as above */ }
    for (const k of SKIES) hero.classList.toggle(`sky-${k}`, k === sky);
  };
  void paintSky();
  // Pieces earned for the character (streaks, seasons) wait here in a chest (src/ui/wardrobeCard.ts, lazy).
  const wardrobeSlot = h('div', { class: 'wd-slot' });
  // The character's room, decorated with prizes (src/ui/room.ts, lazy; only with a character).
  const roomSlot = h('div', { class: 'rm-slot' });
  const paintRoom = () => {
    let has = false;
    try { has = !!localStorage.getItem('rankFigure'); } catch { /* ignore */ }
    if (page !== 'room') { paintDoors(); return; }
    // The room is the whole screen: its own floating top bar, no tab bar.
    if (has) void import('./room').then((m) => {
      const bar = h('div', { class: 'rm-full-bar' },
        h('a', { class: 'icon-btn', href: '#/me', 'aria-label': mpt('mp.back'), onclick: backToMe }, '‹'),
        h('h1', {}, mpt('mp.room')),
        lightChip());
      const c = m.roomScreen(dressUp, bar);
      roomSlot.replaceChildren(c ?? '');
    });
    else roomSlot.replaceChildren(h('button', { class: 'primary me-make-fig', onclick: () => dressUp() }, mpt('mp.roomMake')));
  };
  const dressUp = (tab?: 'wardrobe') => void import('./figureBuilder').then((b) => {
    let code: string | null = null;
    try { code = localStorage.getItem('rankFigure') || null; } catch { /* ignore */ }
    b.openBuilder({ figure: code, wins: 0 }, () => { actorTried = false; meActor?.el.remove(); meActor = null; hero.querySelector('.me-ghost')?.remove(); placeActor(true); paintRoom(); }, tab);
  });
  void import('./wardrobeCard').then((m) => {
    const c = m.wardrobeCard(() => dressUp('wardrobe'));
    if (c) wardrobeSlot.replaceChildren(c);
  });
  const goalsBox = h('section', { class: 'me-card' });
  // The day's string of du'a lanterns (src/ui/dayLanterns.ts, loaded with Me).
  const duaBox = h('section', { class: 'me-card dl-card' });
  const paintDuas = () => void import('./dayLanterns').then((m) => m.paintDayLanterns(duaBox));
  const noorEl = noorLine('me');
  // Asked once, right under the lanterns: reminders after each adhan and salah (owner request 2026-11-10).
  const duaAsk = h('div', { class: 'me-ask-slot' });
  const paintAsk = () => {
    let asked = true;
    try { asked = !!localStorage.getItem('duaNotesAsked'); } catch { /* ignore */ }
    const a = prayerAlerts();
    if (asked || a.duas || a.salah || page) { duaAsk.replaceChildren(); return; }
    const done = () => { try { localStorage.setItem('duaNotesAsked', '1'); } catch { /* ignore */ } duaAsk.replaceChildren(); };
    duaAsk.replaceChildren(h('section', { class: 'me-card me-ask' },
      h('span', { class: 'me-ask-ic', 'aria-hidden': 'true' }, '🔔'),
      h('div', { class: 'me-ask-txt' }, h('b', {}, mpt('mp.askTitle')), h('p', { class: 'muted small' }, mpt('mp.askBody')),
        h('div', { class: 'chips' },
          h('button', { class: 'chip on', onclick: async () => {
            haptic();
            done();
            if (prayerSettings().lat === null) {
              toast(t('pr.finding'));
              const r = await locatePrayer();
              if (!r.ok) toast(t(`pr.fail.${r.why}` as Key));
            }
            const ok = await import('./prayerAlerts').then((m) => m.turnOnDuaNotes());
            toast(ok || !isNative() ? mpt('mp.askDone') : t('rem.denied'));
          } }, mpt('mp.askYes')),
          h('button', { class: 'chip', onclick: done }, mpt('mp.askNo'))))));
  };
  const statsBox = h('section', { class: 'me-card' });
  const badgeBox = h('section', { class: 'me-card' });
  const libBox = h('section', { class: 'me-card' });
  const prayerBox = h('section', { class: 'me-card' });
  // Badges waiting for their Claim stay on Me itself; the rest of the badges live behind a door.
  const claimSlot = h('div', { class: 'me-claims' });
  const doors = h('nav', { class: 'me-doors', 'aria-label': t('me.title') });
  const prayerStrip = h('a', { class: 'me-pr-strip', href: '#/me/prayer' });
  let prayerLine = '';
  const timeFmt = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const longDay = new Intl.DateTimeFormat(locale(), { weekday: 'long' });

  let heroSig = '';
  // Sync, as the user sees it: "Bringing your progress…" on a new phone, a quiet status line, and
  // progress from another phone counting up with a note (cloud/sync.ts).
  let shownDays = -1, arriving = false;
  let catchNext = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The streak moment: once a day, the first time Me is open with today's flame lit — and only
  // while nothing else is open (the tasbih counter, a sheet, a reward moment), so it never cuts in.
  let streakPlaying = false;
  const maybeStreak = () => {
    const s = streak();
    if (page || streakPlaying || !s.litToday || s.days < 1 || document.hidden) return;
    let seen = '';
    try { seen = localStorage.getItem('flameSeen') ?? ''; } catch { /* ignore */ }
    if (seen === dayKey()) return;
    if (document.querySelector('dialog[open], .cel')) return;
    try { localStorage.setItem('flameSeen', dayKey()); } catch { /* ignore */ }
    streakPlaying = true;
    const week = s.week.map((w) => ({ ...w, label: dayFmt.format(parse(w.day)) }));
    void import('./streakMoment').then((m) => m.streakMoment(s.days, week, dayKey())).then(async () => {
      // Every week of the streak (and the other fire days, data/fireDays.ts) the character then goes up in flames.
      if (!isFireDay(s.days) || !hasFigure() || document.hidden) return;
      const key = `fireSeen:${dayKey()}`;
      try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
      await (await import('./powerUp')).powerUp(s.days);
    }).finally(() => {
      streakPlaying = false;
      catchNext = true;
      heroSig = '';
      paintHero();
    });
  };
  // The user's character (when they made one) stands on the streak card: it waves when Me opens and when
  // tapped, and cheers when the flame catches. Loaded only for people with a character.
  // No character yet: a soft outline waits in its place, and a tap opens the builder (character by default,
  // owner decision 2026-11-10).
  const showGhost = () => {
    void import('../i18n/ranks').then(({ rt }) => {
      if (!hero.isConnected) return;
      const ghost = h('button', { class: 'me-actor me-ghost', type: 'button', 'aria-label': rt('fb.open'), onclick: () => {
        haptic(8);
        void import('./figureBuilder').then((m) => m.openBuilder({ figure: null, wins: 0 }, () => {
          ghost.remove(); actorTried = false; placeActor(true); paintRoom();
        }));
      } }, h('span', { class: 'me-ghost-fig', 'aria-hidden': 'true' }), h('span', { class: 'me-ghost-txt' }, rt('fb.open')));
      hero.append(ghost);
    });
  };
  let meActor: import('./actor').Actor | null = null;
  let actorTried = false;
  const placeActor = (cheer: boolean) => {
    if (meActor) { hero.append(meActor.el); if (cheer) setTimeout(() => meActor?.cheer(), 700); return; }
    if (actorTried) return;
    actorTried = true;
    let code: string | null = null;
    try { code = localStorage.getItem('rankFigure'); } catch { /* ignore */ }
    if (!code && account()) {
      // Made on another device: the account keeps it, so this device (the web too) fetches it once.
      // (`myFigure()` keeps '' when the account has none, so this is asked once.)
      let never = false;
      try { never = localStorage.getItem('rankFigure') === null; } catch { /* ignore */ }
      if (never) {
        void import('../together/ranks').then((m) => m.myFigure()).catch(() => null).then((c) => {
          if (!hero.isConnected) return;
          if (!c) { showGhost(); return; }
          actorTried = false;
          paintRoom();
          placeActor(false);
        });
        return;
      }
    }
    if (!code) { showGhost(); return; }
    void import('./actor').then((m) => {
      // The character follows the day: reading, sitting by its lantern at night, dozing after the bedtime du'a.
      let bedtime = false;
      try { bedtime = localStorage.getItem('bedtimeDone') === dayKey(new Date(Date.now() - 12 * 3600e3)); } catch { /* ignore */ }
      const look = m.dayLook(code, { read: (readLog()[dayKey()]?.length ?? 0) > 0, bedtime });
      meActor = m.actor(`me-actor day-${look.mode}`, look.code);
      if (!meActor || !hero.isConnected) return;
      const a = meActor;
      // The character's level (all-time XP from Ranks) shows on it as gathered light.
      const xp = myXp();
      if (xp > 0) void import('./levelLook').then((l) => l.withLevel(a.el, levelOf(xp)));
      a.el.setAttribute('role', 'button');
      a.el.setAttribute('aria-hidden', 'true');
      if (look.mode === 'asleep') {
        m.poseClass(a.el, 'sleepy', true);
        a.el.append(...['z', 'z', 'Z'].map((z, i) => h('i', { class: 'fg-z', style: `--i:${i}` }, z)));
      }
      // A tap greets you, then goes into the room.
      a.el.addEventListener('click', () => { if (look.mode === 'asleep') a.nod(); else a.wave(); haptic(8); setTimeout(() => { location.hash = '#/me/room'; }, 420); });
      hero.append(a.el);
      setTimeout(() => (cheer ? a.cheer() : look.mode === 'morning' ? a.stretch() : look.mode === 'asleep' || look.mode === 'night' ? a.nod() : a.wave()), 600);
    });
  };
  const hasFig = () => { try { return !!localStorage.getItem('rankFigure'); } catch { return false; } };
  const paintHero = () => {
    const s = streak();
    // Repaint only when something on the card changed (keeps the flame's animation running).
    const loading = firstSyncPending();
    const sig = JSON.stringify([s.days, s.litToday, s.weeks, s.best, s.freeze, s.extra, s.week, s.lost, hasFig(), myXp(), loading]);
    if (sig === heroSig) return;
    heroSig = sig;
    const fromOther = arriving && !loading && shownDays >= 0;
    const countFrom = fromOther && s.days > shownDays ? shownDays : -1;
    arriving = false;
    shownDays = loading ? -1 : s.days;
    const lost = loading ? undefined : s.lost; // the other phones' days are on their way: nothing is lost
    const tier = loading ? flameTier(1, true) : flameTier(s.days, s.litToday); // a new phone: a small flame, never an ember
    const pip = (w: (typeof s.week)[number]) => h('span', { class: `me-pip ${w.state}`, title: longDay.format(parse(w.day)) },
      dayMark(w.state),
      h('span', { class: 'me-pip-d' }, dayFmt.format(parse(w.day))));
    // After the streak moment, the card's flame catches (flares up, sparks, the count ticks on).
    const catchNow = catchNext && s.litToday && !reduced;
    catchNext = false;
    const num = h('b', {}, loading ? '…' : String(catchNow ? s.days - 1 : s.days));
    hero.classList.toggle('loading', loading);
    const flameBox = h('div', { class: `me-flame${catchNow ? ' catch' : ''}` }, flame(tier, 104, reduced));
    hero.replaceChildren(
      hasFig() ? h('a', { class: 'me-room-btn', href: '#/me/room', 'aria-label': mpt('mp.room') }, roomIcon(), h('span', {}, mpt('mp.roomBtn'))) : '',
      h('div', { class: 'me-top' },
        flameBox,
        h('div', { class: 'me-top-txt' },
          h('div', { class: 'me-count' }, num, h('span', {}, t(s.days === 1 ? 'me.day' : 'me.days'))),
          h('p', { class: 'me-status' }, loading ? mpt(navigator.onLine ? 'mp.bringing' : 'mp.bringOffline') : s.days === 0 ? t('me.statusStart') : s.litToday ? t('me.statusLit') : t('me.statusKeep')))),
      lost ? h('p', { class: 'me-lost' }, t('me.lost', { n: lost.n })) : '',
      lost && lost.days.length <= 3 ? h('button', { class: 'me-relight', onclick: () => {
        if (!account()) { toast(t('rl.signInFirst')); openAccount(); return; }
        void import('../together/relight').then((m) => m.askRelight()).catch((e) => toast(e instanceof Error ? e.message : String(e)));
      } }, `🔥  ${t('rl.askFriend')}`) : '',
      lost ? keptFreezeButton(lost.days) : '',
      h('div', { class: 'me-week', role: 'list', 'aria-label': t('me.thisWeek') }, ...s.week.map(pip)),
      h('div', { class: 'me-chips' },
        h('span', { class: 'me-chip' }, t(s.weeks === 1 ? 'me.week1' : 'me.weeks', { n: s.weeks })),
        h('span', { class: 'me-chip', title: t('me.freezeHelp') }, s.freeze.free ? t('me.freezeReady') : t('me.freezeUsed', { day: longDay.format(parse(s.freeze.day!)) })),
        h('span', { class: 'me-chip', title: t('me.extraHelp') }, s.extra.free ? t('me.extraReady') : t('me.extraNext', { day: longDay.format(parse(s.extra.next!)) })),
        h('span', { class: 'me-chip' }, t('me.best', { n: s.best })),
        myXp() > 0 ? h('a', { class: 'me-chip me-level', href: '#/ranks' }, levelLabel(levelOf(myXp()))) : ''));
    placeActor(catchNow);
    if (fromOther) {
      if (countFrom >= 0) tickNum(num, s.days, { from: countFrom, ms: 900 });
      const note = h('span', { class: 'me-arrived', role: 'status' }, mpt('mp.fromOther'));
      hero.append(note);
      setTimeout(() => note.remove(), 3600);
    }
    if (catchNow) {
      const canvas = h('canvas', { class: 'me-sparks', 'aria-hidden': 'true' });
      hero.append(canvas);
      void import('./sparks').then(({ sparks }) => setTimeout(() => {
        const P = rewardPalette();
        const fx = sparks(canvas, [rgba(P.n1, 1), rgba(P.n3, 1), rgba(P.hi, 1)]);
        const f = flameBox.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        fx.burst(f.left + f.width / 2 - c.left, f.top + f.height * 0.45 - c.top, 34, 0.55);
        num.textContent = String(s.days);
        num.classList.add('tick');
        haptic(14);
        setTimeout(() => { fx.stop(); canvas.remove(); }, 2600);
      }, 650));
    }
  };

  // --- rewards: a met goal or a new badge waits for its Claim tap, then its moment plays ---
  let playing = false;
  const play = async (run: () => Promise<void>, mark: () => void) => {
    if (playing) return;
    playing = true;
    try {
      await run();
    } finally {
      playing = false;
      mark();
      void import('./nudges').then((m) => m.maybeAskNudges());
    }
  };
  const openAdhkarSession = (p: 's' | 'm') => { haptic(); void import('./adhkar').then((m) => m.openAdhkar(p)); };
  const claimGoalRow = (g: GoalProgress, from?: Element) => play(
    () => import('./celebrate').then((m) => m.celebrate({ kind: 'chest', title: goalLabel(g), sub: t('cel.goalSub') }, from, lightFor(g))),
    () => claimGoal(g.id, lightFor(g)));
  const claimAll = (from?: Element) => play(
    () => import('./celebrate').then((m) => m.celebrate({ kind: 'chest', title: t('cel.allTitle'), sub: t('cel.allSub'), kicker: t('cel.all') }, from, ALL_LIGHT)),
    () => claimGoal('all', ALL_LIGHT));
  const claimBadgeNow = (b: BadgeDef, from?: Element) => play(
    () => import('./celebrate').then((m) => {
      const k = badgeMoment(b);
      return m.celebrate(k === 'flame' ? { kind: 'flame', badge: b, days: b.need } : { kind: k, badge: b }, from, BADGE_LIGHT[b.tier]);
    }),
    () => claimBadge(b.id, BADGE_LIGHT[b.tier]));

  // --- today's goals ---
  // Bars fill from where they were (0 the first time this session) to where they are now.
  const bar = (id: string, pct: number) => {
    const fill = h('i', { style: `--p:${still ? pct : (ringWas.get(id) ?? 0)}` });
    if (!still && ringWas.get(id) !== pct) requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--p', String(pct))));
    ringWas.set(id, pct);
    return h('span', { class: 'goal-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct * 100)) }, fill);
  };
  // A goal's chest: resting until the goal is met, then shaking to be opened; open once claimed.
  const goalChest = (id: string, light: number, met: boolean, open: (el: HTMLElement) => void, week = false) => {
    const claimed = week ? weekClaimed(id) : goalClaimed(id);
    const state = claimed ? 'open' : met ? 'ready' : 'locked';
    return chest(light, state, t(claimed ? 'chest.opened' : met ? 'chest.open' : 'chest.locked', { n: light }), open);
  };
  const goalRow = (g: GoalProgress) => {
    const met = g.done >= g.target;
    const pct = Math.min(1, g.done / g.target);
    let act: Node | string = '';
    if (g.kind === 'dhikr') act = h('button', { class: 'chip', onclick: () => void import('./tasbih').then((m) => m.openTasbih(g.dhikr as DhikrId)) }, t('goal.count'));
    else if (g.kind === 'memorise') act = h('span', { class: 'goal-step' },
      h('button', { class: 'chip', 'aria-label': t('goal.less'), onclick: () => { addMemorised(-1); haptic(); } }, '−'),
      h('button', { class: 'chip', 'aria-label': t('goal.more'), onclick: () => { addMemorised(1); haptic(); } }, '+'));
    else if (g.kind === 'adhkar') act = h('button', { class: `chip${met ? ' on' : ''}`, onclick: () => openAdhkarSession(g.period ?? 's') },
      met ? t('goal.adhkarAgain') : g.done ? t('goal.adhkarGo') : t('goal.adhkarBegin'));
    else if (g.kind === 'duas') act = h('button', { class: 'chip', onclick: () => { haptic(); void import('./dayLanterns').then((m) => m.openNextMoment()); } }, t('goal.adhkarBegin'));
    else if (g.kind === 'lessons') act = h('a', { class: 'chip', href: '#/learn' }, t('goal.adhkarBegin'));
    else if (g.kind === 'nights') act = h('button', { class: 'chip', onclick: () => { haptic(); void import('./adhkar').then((m) => m.openDuas('sleep')); } }, t('goal.adhkarBegin'));
    else if (g.kind === 'pages') act = h('a', { class: 'chip', href: '#/' }, t('goal.read'));
    else if (g.kind === 'reels') act = h('a', { class: 'chip', href: '#/drafts' }, t('goal.make'));
    else if (g.kind === 'surahs') act = h('a', { class: 'chip', href: '#/' }, t('goal.read'));
    else if (g.kind === 'listen') act = h('button', { class: 'chip', onclick: () => goMushaf('listen') }, t('goal.listen1'));
    else if (g.kind === 'custom') {
      const c = g.custom!;
      act = c.target === 1
        ? h('button', { class: `chip${met ? ' on' : ''}`, 'aria-pressed': String(met), onclick: () => { addCustom(c.id, met ? -1 : 1, 1); haptic(); } }, met ? t('goal.doneMark') : t('goal.markDone'))
        : h('span', { class: 'goal-step' },
          h('button', { class: 'chip', 'aria-label': t('goal.less'), onclick: () => { addCustom(c.id, -1, c.target); haptic(); } }, '−'),
          h('button', { class: 'chip', 'aria-label': t('goal.more'), onclick: () => { addCustom(c.id, 1, c.target); haptic(); } }, '+'));
    }
    // Once met, only the adhkar keep their button (to read them again); the chest is the claim.
    if (met && g.kind !== 'adhkar') act = '';
    return h('div', { class: `goal k-${g.kind}${met ? ' met' : ''}` },
      h('span', { class: 'goal-txt' },
        h('b', {}, goalLabel(g)),
        bar(g.id, pct),
        h('span', { class: 'muted small' }, g.kind === 'adhkar' ? (met ? t('goal.adhkarDone') : t('goal.adhkarOf', { n: g.done, of: g.target }))
          : g.kind === 'custom' && g.target === 1 ? (met ? t('goal.doneToday') : t('cg.mine')) : `${Math.min(g.done, g.target)} / ${g.target}`)),
      act,
      goalChest(g.id, lightFor(g), met, (el) => void claimGoalRow(g, el), !!g.week));
  };
  // The day's chest: every goal met today.
  const dayRow = (list: GoalProgress[]) => {
    const n = list.filter((g) => g.done >= g.target).length;
    const all = n === list.length;
    return h('div', { class: `goal-day${all ? ' met' : ''}` },
      h('span', { class: 'goal-txt' },
        h('b', {}, t('chest.day')),
        bar('all', n / list.length),
        h('span', { class: 'muted small' }, all && goalClaimed('all') ? t('goal.allMet') : `${n} / ${list.length}`)),
      goalChest('all', ALL_LIGHT, all, (el) => void claimAll(el)));
  };
  // The harvest: every goal chest waiting (today's and this week's) opened in one moment.
  const waitingChests = () => {
    const out: { id: string; label: string; light: number }[] = [];
    const list = todayGoals(), wk = weekGoals();
    for (const g of list) if (g.done >= g.target && !goalClaimed(g.id)) out.push({ id: g.id, label: goalLabel(g), light: lightFor(g) });
    if (list.length > 1 && list.every((g) => g.done >= g.target) && !goalClaimed('all')) out.push({ id: 'all', label: t('chest.day'), light: ALL_LIGHT });
    for (const g of wk) if (g.done >= g.target && !weekClaimed(g.id)) out.push({ id: g.id, label: goalLabel(g), light: lightFor(g) });
    if (wk.length > 1 && wk.every((g) => g.done >= g.target) && !weekClaimed(weekAllId())) out.push({ id: weekAllId(), label: t('wkg.chest'), light: WEEK_ALL_LIGHT });
    return out;
  };
  const harvestAll = () => {
    const list = waitingChests();
    if (list.length < 2) return;
    haptic();
    void play(() => import('./harvest').then((m) => m.harvest(list)), () => { for (const c of list) claimGoal(c.id, c.light); });
  };
  const harvestBtn = () => {
    const list = waitingChests();
    if (list.length < 2) return '';
    return h('button', { class: 'goal-harvest', onclick: harvestAll },
      h('span', {}, mt('hv.open', { n: list.length })), h('b', {}, star(), ` ${list.reduce((a, c) => a + c.light, 0)}`));
  };
  // This week's goals (reset every Monday): their own rows and chest for all of them.
  const claimWeekAll = (from?: Element) => play(
    () => import('./celebrate').then((m) => m.celebrate({ kind: 'chest', title: t('wkg.allTitle'), sub: t('wkg.allSub'), kicker: t('wkg.title') }, from, WEEK_ALL_LIGHT)),
    () => claimGoal(weekAllId(), WEEK_ALL_LIGHT));
  const weekBox = () => {
    const list = weekGoals();
    if (!list.length) return '';
    const n = list.filter((g) => g.done >= g.target).length;
    const all = n === list.length;
    return h('div', { class: 'week-goals' },
      list.length > 1 ? h('div', { class: `goal-day${all ? ' met' : ''}` },
        h('span', { class: 'goal-txt' },
          h('b', {}, t('wkg.chest')),
          bar(weekAllId(), n / list.length),
          h('span', { class: 'muted small' }, `${n} / ${list.length}`)),
        goalChest(weekAllId(), WEEK_ALL_LIGHT, all, (el) => void claimWeekAll(el), true)) : '',
      h('div', { class: 'goals' }, ...list.map(goalRow)));
  };
  // "Resets in 05:12:09" (owner 2026-11-12: "include the seconds, so it gets more urgency"): ticks every second
  // while Me is on screen; the week shows its days first ("6 d 05:12:09").
  const leftText = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    return d ? `${t('wkg.days', { d })} ${clock}` : clock;
  };
  // The time left sits as a small clock pill at the top right of the goals card (owner request 2026-11-10).
  const resetText = (el: HTMLElement) => {
    const left = leftText(resetsAt()[el.dataset.reset as 'day' | 'week'].getTime() - Date.now());
    el.lastChild!.textContent = left;
    // The spoken label changes once a minute, not every second.
    const full = t('wkg.resets', { left: left.slice(0, -3) });
    if (el.title !== full) { el.title = full; el.setAttribute('aria-label', full); }
  };
  const resetLabel = (which: 'day' | 'week') => {
    const el = h('span', { class: 'goal-reset', 'data-reset': which, role: 'timer' }, clockIcon(), h('b', {}));
    resetText(el);
    return el;
  };
  const paintResets = () => root.querySelectorAll<HTMLElement>('.goal-reset').forEach(resetText);
  // Light (Noor): what claimed goals gathered today, this week and this month, private to the user.
  // The lantern fills with this week's Light against what seven days of today's goals could give.
  const lightStrip = () => {
    const week = stats('week').light;
    const month = stats('month').light;
    const today = lightOn(dayKey());
    const fill = Math.min(1, week / Math.max(1, 7 * dayLightMax()));
    const lantern = h('span', { class: 'lt-lantern', 'aria-hidden': 'true' });
    lantern.innerHTML = `<svg viewBox="0 0 32 44"><path d="M12 3h8M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><defs><clipPath id="lt-c"><rect x="5" y="7" width="22" height="31" rx="9"/></clipPath></defs><rect x="5" y="7" width="22" height="31" rx="9" class="lt-glass"/><rect x="5" y="7" width="22" height="31" clip-path="url(#lt-c)" class="lt-fill" style="--fill:${still ? fill : (lanternWas ?? 0)}"/><path d="M11 41h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    if (!still && lanternWas !== fill) {
      const r = lantern.querySelector<SVGElement>('.lt-fill')!;
      requestAnimationFrame(() => requestAnimationFrame(() => r.style.setProperty('--fill', String(fill))));
    }
    lanternWas = fill;
    return h('button', { class: 'lt-strip', onclick: openLight },
      lantern,
      h('span', { class: 'lt-txt' },
        h('b', {}, t('lt.today', { n: today })),
        h('span', { class: 'muted small' }, t('lt.line', { week, month }))));
  };
  const openLight = () => {
    const all = stats('all').light;
    dialog(t('lt.title'),
      h('div', { class: 'lt-sheet' },
        h('div', { class: 'me-tiles' },
          h('div', { class: 'me-tile lt-left' }, h('span', { class: 'me-tile-n' }, star(), h('b', {}, String(wallet()))), h('span', {}, mpt('mp.toSpend'))),
          ...([['lt.tToday', lightOn(dayKey())], ['lt.tWeek', stats('week').light], ['lt.tMonth', stats('month').light], ['lt.tAll', all]] as [Key, number][])
            .map(([k, n]) => h('div', { class: 'me-tile' }, h('span', { class: 'me-tile-n' }, h('b', {}, String(n))), h('span', {}, k === 'lt.tAll' ? mpt('mp.earnedAll') : t(k))))),
        h('p', { class: 'muted small' }, t('lt.help'))));
  };
  // A first pace (once), then the goals; at most one gentle suggestion a week.
  const paceCard = () => h('div', { class: 'pace' },
    h('p', { class: 'muted small' }, t('pace.sub')),
    ...(['gentle', 'steady', 'devoted'] as Pace[]).map((p) => h('button', { class: `pace-opt${p === 'steady' ? ' rec' : ''}`, onclick: () => { choosePace(p); haptic(); } },
      h('b', {}, t(`pace.${p}` as Key)), h('span', { class: 'muted small' }, paceLine(p)))));
  const paceLine = (p: Pace) => {
    const v = PACES[p];
    const dk = Object.values(v.dhikr).reduce((a, b) => a + (b ?? 0), 0);
    return [goalText('pages', v.pages), v.memorise ? goalText('memorise', v.memorise) : '', t('pace.dhikr', { n: dk }), v.adhkar ? t('goal.eAdhkar') : '']
      .filter(Boolean).join(' · ');
  };
  const tipLabel = (tip: GoalTip, n: number) => tip.kind === 'dhikr'
    ? `${t(DHIKR.find((x) => x.id === tip.dhikr)!.key as Key)} ×${n}` : goalText(tip.kind, n);
  const tipCard = (tip: GoalTip) => h('div', { class: `goal-tip${tip.up ? ' up' : ''}` },
    h('p', {}, t(tip.up ? 'tip.up' : 'tip.down', { goal: tipLabel(tip, tip.from), to: tipLabel(tip, tip.to) })),
    h('div', { class: 'chips' },
      h('button', { class: 'chip on', onclick: () => { acceptTip(tip); haptic(); toast(t('tip.done')); } }, t('tip.yes')),
      h('button', { class: 'chip', onclick: () => dismissTip(tip) }, t('tip.no'))));
  const paintGoals = () => {
    noorEl.querySelector('.noor-say')!.textContent = noorText('me');
    if (needsPace()) {
      goalsBox.replaceChildren(h('h2', { class: 'me-h' }, t('pace.title')), paceCard());
      return;
    }
    const list = todayGoals();
    const all = list.length > 0 && list.every((g) => g.done >= g.target);
    const tip = goalTip();
    const wk = weekGoals();
    // A chest waiting to be opened on the other side shows as a dot on its switch.
    const dayReady = list.some((g) => g.done >= g.target && !goalClaimed(g.id)) || (all && list.length > 1 && !goalClaimed('all'));
    const wkAll = wk.length > 0 && wk.every((g) => g.done >= g.target);
    const weekReady = wk.some((g) => g.done >= g.target && !weekClaimed(g.id)) || (wkAll && wk.length > 1 && !weekClaimed(weekAllId()));
    // Challenges (owner 2026-11-12): friend challenges beside Today and This week, for people signed in.
    const withCh = !!account();
    const tab: GoalTab = goalTab === 'ch' ? (withCh ? 'ch' : 'day') : wk.length ? goalTab : 'day';
    const pick = (v: GoalTab) => {
      if (goalTab === v) return;
      goalTab = v;
      try { localStorage.setItem('meGoalTab', v); } catch { /* ignore */ }
      haptic(6);
      paintGoals();
    };
    const seg = (v: GoalTab, label: string, dot: boolean) => h('button', {
      class: `goal-seg-b${tab === v ? ' on' : ''}`, role: 'tab', 'aria-selected': String(tab === v), onclick: () => pick(v),
    }, label, dot && tab !== v ? h('i', { class: 'goal-seg-dot', 'aria-label': mpt('mp.weekReady') }) : '');
    const chBox = h('div', { class: 'goal-ch' });
    if (tab === 'ch') {
      const fill = (fresh: boolean) => void import('./challenges').then((m) => m.challengesPanel(() => fill(true), fresh)).then((el) => chBox.replaceChildren(el)).catch(() => {});
      fill(false);
      setTimeout(() => { if (chBox.isConnected) fill(true); }, 400);
    }
    const body = tab === 'ch' ? [chBox] : tab === 'week'
      ? [weekBox()]
      : [tip ? tipCard(tip) : '',
        list.length > 1 ? dayRow(list) : all ? h('p', { class: 'goal-all' }, t('goal.allMet')) : '',
        list.length ? h('div', { class: 'goals' }, ...list.map(goalRow)) : h('p', { class: 'muted' }, t('goal.none')),
        list.length ? lightStrip() : ''];
    goalsBox.replaceChildren(
      h('div', { class: 'me-row goal-head' },
        wk.length || withCh
          ? h('div', { class: 'goal-seg', role: 'tablist', 'aria-label': t('goal.title') }, seg('day', mpt('mp.today'), dayReady),
            wk.length ? seg('week', mpt('mp.week'), weekReady) : '', withCh ? seg('ch', mpt('mp.challenges'), challengeWaiting()) : '')
          : h('h2', { class: 'me-h' }, t('goal.title')),
        tab === 'week' || (tab === 'day' && list.length) ? resetLabel(tab) : '',
        h('button', { class: 'chip goal-edit', onclick: openGoalEditor, 'aria-label': t('goal.edit'), title: t('goal.edit') }, editIcon())),
      harvestBtn(),
      ...body,
      h('div', { class: 'goal-links chips' },
        h('button', { class: 'chip tb-open', onclick: () => void import('./tasbih').then((m) => m.openTasbih()) }, `📿 ${t('tb.title')}`),
        // The adhkar keep a way in here only when they are not a goal row already.
        list.some((g) => g.kind === 'adhkar' && (g.period ?? 's') === 's') ? '' : h('button', { class: 'chip', onclick: () => openAdhkarSession('s') }, `☀ ${t('goal.adhkar')}`),
        list.some((g) => g.kind === 'adhkar' && g.period === 'm') ? '' : h('button', { class: 'chip', onclick: () => openAdhkarSession('m') }, `☾ ${t('goal.adhkarM')}`),
        goals().custom.length < CUSTOM_MAX ? h('button', { class: 'chip', onclick: () => openCustom() }, `＋ ${t('cg.add')}`) : ''));
  };
  /** Add or change one of the user's own goals. */
  function openCustom(c?: CustomGoal) {
    const cur: CustomGoal = c ? { ...c, days: [...c.days] } : { id: Date.now().toString(36), name: '', target: 1, days: [] };
    const name = h('input', { class: 'search', maxlength: 40, placeholder: t('cg.placeholder'), value: cur.name, 'aria-label': t('cg.name') });
    const wd = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
    const order = [1, 2, 3, 4, 5, 6, 0];
    const chip = (label: string, on: () => boolean, tap: () => void) => {
      const b = h('button', { class: `chip${on() ? ' on' : ''}`, 'aria-pressed': String(on()), onclick: () => { tap(); paint(); } }, label);
      return b;
    };
    const times = h('div', { class: 'chips' });
    const days = h('div', { class: 'chips' });
    const paint = () => {
      times.replaceChildren(...CUSTOM_TIMES.map((n) => chip(n === 1 ? t('cg.once') : `×${n}`, () => cur.target === n, () => { cur.target = n; })));
      days.replaceChildren(chip(t('cg.every'), () => !cur.days.length, () => { cur.days = []; }),
        ...order.map((d) => chip(wd.format(new Date(2026, 0, 4 + d)), () => cur.days.includes(d), () => {
          cur.days = cur.days.includes(d) ? cur.days.filter((x) => x !== d) : [...cur.days, d];
          if (cur.days.length === 7) cur.days = [];
        })));
    };
    paint();
    const d = dialog(t(c ? 'cg.edit' : 'cg.title'),
      h('div', { class: 'sheet-scroll goal-editor' },
        h('label', { class: 'goal-edit' }, h('b', {}, t('cg.name')), name),
        h('div', { class: 'goal-edit' }, h('b', {}, t('cg.times')), times),
        h('div', { class: 'goal-edit' }, h('b', {}, t('cg.days')), days),
        h('p', { class: 'muted small' }, t('cg.private')),
        h('div', { class: 'chips cg-actions' },
          h('button', { class: 'primary brand-btn', onclick: () => {
            cur.name = name.value.trim().slice(0, 40);
            if (!cur.name) { name.focus(); return; }
            const g = goals();
            const i = g.custom.findIndex((x) => x.id === cur.id);
            if (i >= 0) g.custom[i] = cur; else if (g.custom.length < CUSTOM_MAX) g.custom.push(cur);
            setGoals(g);
            d.close();
          } }, t('cg.save')),
          c ? h('button', { class: 'chip', onclick: () => {
            const g = goals();
            g.custom = g.custom.filter((x) => x.id !== cur.id);
            setGoals(g);
            d.close();
          } }, t('cg.delete')) : '')));
    if (!c) setTimeout(() => name.focus(), 50);
  }
  function openGoalEditor() {
    const g = goals();
    const row = (label: string, list: readonly number[], cur: number, set: (n: number) => void, fmt = (n: number) => String(n)) =>
      h('div', { class: 'goal-edit' }, h('b', {}, label), h('div', { class: 'chips' }, ...list.map((n) => h('button', {
        class: `chip${n === cur ? ' on' : ''}`, 'aria-pressed': String(n === cur),
        onclick: (e: Event) => {
          set(n); setGoals(g);
          (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.currentTarget));
        },
      }, n ? fmt(n) : t('goal.off')))));
    const paceRow = h('div', { class: 'goal-edit' }, h('b', {}, t('pace.title')), h('div', { class: 'chips' },
      ...(['gentle', 'steady', 'devoted'] as Pace[]).map((p) => h('button', { class: 'chip', onclick: () => { choosePace(p); d.close(); openGoalEditor(); } }, t(`pace.${p}` as Key)))));
    const mine = h('div', { class: 'goal-edit' }, h('b', {}, t('cg.mine')),
      h('div', { class: 'menu' }, ...g.custom.map((c) => h('button', { class: 'menu-item', onclick: () => { d.close(); openCustom(c); } },
        h('span', {}, c.name), h('span', { class: 'muted small' }, ` · ${c.target === 1 ? t('cg.once') : `×${c.target}`}`))),
      g.custom.length < CUSTOM_MAX ? h('button', { class: 'menu-item', onclick: () => { d.close(); openCustom(); } }, `＋  ${t('cg.add')}`) : h('p', { class: 'muted small' }, t('cg.full'))));
    const d = dialog(t('goal.editTitle'),
      h('div', { class: 'sheet-scroll goal-editor' },
        paceRow,
        row(t('goal.ePages'), PAGE_GOALS, g.pages, (n) => { g.pages = n; }),
        row(t('goal.eMemo'), MEMO_GOALS, g.memorise, (n) => { g.memorise = n; }),
        row(t('goal.eReels'), REEL_GOALS, g.reels, (n) => { g.reels = n; }),
        ...DHIKR.map((x) => row(t(x.key as Key), DHIKR_GOALS, g.dhikr[x.id] ?? 0, (n) => { if (n) g.dhikr[x.id] = n; else delete g.dhikr[x.id]; })),
        row(t('goal.eAdhkar'), [0, 1], g.adhkar ? 1 : 0, (n) => { g.adhkar = !!n; }, () => t('goal.on')),
        row(t('goal.eDuas'), DUA_GOALS, g.duas, (n) => { g.duas = n; }),
        row(t('goal.eLessons'), LESSON_GOALS, g.lessons, (n) => { g.lessons = n; }),
        h('h3', { class: 'me-h2' }, t('wkg.title')),
        row(t('wkg.ePages'), WEEK_PAGES, g.weekly.pages, (n) => { g.weekly.pages = n; }),
        row(t('wkg.eListen'), WEEK_LISTEN, g.weekly.listen, (n) => { g.weekly.listen = n; }, (n) => t('wkg.min', { n })),
        row(t('wkg.eSurahs'), WEEK_SURAHS, g.weekly.surahs, (n) => { g.weekly.surahs = n; }),
        row(t('wkg.eReels'), WEEK_REELS, g.weekly.reels, (n) => { g.weekly.reels = n; }),
        row(t('wkg.eNights'), WEEK_NIGHTS, g.weekly.nights, (n) => { g.weekly.nights = n; }),
        mine));
  }

  const paintStats = () => {
    const st: Stats = stats(period);
    const now = new Date();
    const last = period === 'week' ? stats('week', parse(addDays(weekOf(dayKey(now)), -1))) : null;
    const tab = (p: Period, label: string) => h('button', {
      class: `tab${p === period ? ' on' : ''}`, role: 'tab', 'aria-selected': String(p === period),
      onclick: () => { period = p; haptic(); paintStats(); },
    }, label);
    // This week: each tile also says how it compares with last week.
    const vs = (k: keyof Stats, show = (n: number) => String(n)) => {
      if (!last) return '';
      const d = (st[k] as number) - (last[k] as number);
      return d ? h('span', { class: `wk-diff ${d > 0 ? 'up' : 'down'}` }, `${d > 0 ? '▲' : '▼'} ${show(Math.abs(d))}`) : '';
    };
    const tile = (n: string, label: string, diff: Node | string, sub?: string) =>
      h('div', { class: 'me-tile' }, h('span', { class: 'me-tile-n' }, h('b', {}, n), diff), h('span', {}, label), sub ? h('span', { class: 'muted small' }, sub) : '');
    const names = st.surahList.slice(-3).map((s) => surahName(meta[s - 1])).join(' · ');
    statsBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('me.stats')),
      h('div', { class: 'tabs me-tabs', role: 'tablist' },
        tab('week', t('me.week')), tab('month', t('me.month')), tab('all', t('me.all'))),
      h('div', { class: 'me-tiles' },
        tile(String(st.light), t('me.light'), vs('light')),
        tile(String(st.pages), t('me.pages'), vs('pages')),
        tile(String(st.ayat), t('me.ayat'), vs('ayat')),
        tile(minutes(st.listen), t('me.listened'), vs('listen', (n) => minutes(n))),
        tile(String(st.surahs), t('me.surahs'), vs('surahs'), names || undefined),
        tile(String(st.juz), t('me.juz'), vs('juz')),
        tile(String(st.memorised), t('me.memorised'), vs('memorised')),
        tile(String(st.dhikr), t('me.dhikr'), vs('dhikr')),
        tile(String(st.reels), t('me.reels'), vs('reels'))),
      h('p', { class: 'muted small' }, last
        ? (now.getDay() === 1 && last.litDays ? t('wk.monday', { pages: last.pages, dhikr: last.dhikr }) : t('wk.sub'))
        : t('me.honest', { time: timeLabel(pageSeconds()) })));
  };

  const paintBadges = () => {
    const all = badgeStates();
    const got = all.filter((b) => b.earned).length;
    const tap = (b: BadgeState) => (e: Event) => (b.earned && !badgeDone(b.def.id) ? void claimBadgeNow(b.def, e.currentTarget as Element) : openBadge(b));
    const tile = (b: BadgeState) => h('button', { class: `bd-tile t-${b.def.tier}${b.earned ? ' earned' : ''}`, onclick: tap(b) },
      badgeArt(b.def.tier, b.def.icon, !!b.earned, 68),
      h('span', { class: 'bd-name' }, badgeName(b.def)),
      b.earned ? '' : h('span', { class: 'bd-mini' }, h('span', { style: `width:${Math.round((100 * b.have) / b.def.need)}%` })));
    // One row per family: its five tiers, and a bar towards the next one.
    const fams = new Map<string, BadgeState[]>();
    for (const b of all) fams.set(b.def.fam, [...(fams.get(b.def.fam) ?? []), b]);
    const famRow = (list: BadgeState[]) => {
      const next = list.find((b) => !b.earned);
      const d = list[0].def;
      return h('div', { class: 'bdf' },
        h('div', { class: 'bdf-head' }, h('b', {}, bt(`f.${d.fam}` as BadgeKey)),
          h('span', { class: 'muted small' }, next ? bt('step', { tier: tierName(next.def.step) }) : bt('all'))),
        h('div', { class: 'bdf-tiers' }, ...list.map((b) => h('button', { class: `bdf-t${b.earned ? ' earned' : ''}${b === next ? ' next' : ''}`, 'aria-label': badgeName(b.def), onclick: tap(b) },
          badgeArt(b.def.tier, b.def.icon, !!b.earned, 60),
          b.earned && !badgeDone(b.def.id) ? h('i', { class: 'bdf-dot', 'aria-hidden': 'true' }) : ''))),
        next ? h('div', { class: 'bdf-bar' }, h('span', { style: `width:${Math.round((100 * next.have) / next.def.need)}%` }),
          h('b', {}, next.def.fam === 'league' ? badgeGoal(next.def) : `${next.have.toLocaleString()} / ${next.def.need.toLocaleString()}`)) : '');
    };
    const groups: BadgeGroup[] = ['read', 'listen', 'learn', 'dua', 'goals', 'ranks', 'create'];
    const byFamily = () => groups.flatMap((g) => {
      const rows = [...fams.values()].filter((l) => l[0].def.group === g);
      return rows.length ? [h('h3', { class: 'bdf-group' }, bt(`g.${g}` as BadgeKey)), ...rows.map(famRow)] : [];
    });
    // On Me: the newest earned first, then the next tier of each family, closest first.
    const earned = all.filter((b) => b.earned).sort((a, b) => (b.earned! > a.earned! ? 1 : b.earned! < a.earned! ? -1 : b.def.step - a.def.step));
    const next = [...fams.values()].map((l) => l.find((b) => !b.earned)).filter((b): b is BadgeState => !!b).sort((a, b) => b.have / b.def.need - a.have / a.def.need);
    const seeAll = () => dialog(t('bd.badges'), h('div', { class: 'sheet-scroll' }, ...byFamily()));
    const waiting = earned.filter((b) => !badgeDone(b.def.id)).sort((a, b) => b.def.step - a.def.step);
    const shown = page === 'stats' ? waiting : waiting.slice(0, 3);
    claimSlot.replaceChildren(
      waiting.length ? h('div', { class: 'claim-badges' }, ...shown.map((b) => h('button', { class: `claim-badge t-${b.def.tier}`, onclick: (e: Event) => void claimBadgeNow(b.def, e.currentTarget as Element) },
        badgeArt(b.def.tier, b.def.icon, true, 44),
        h('span', { class: 'cb-txt' }, h('span', {}, t('cel.badge')), h('b', {}, badgeName(b.def))),
        h('span', { class: 'cb-go' }, `✦ ${t('cel.claim')}`))),
        waiting.length > shown.length ? h('a', { class: 'chip claim-more', href: '#/me/stats' }, `+${waiting.length - shown.length}`) : '') : '',
      page ? '' : newIconCard() ?? '');
    badgeBox.replaceChildren(
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, t('bd.badges')),
        h('button', { class: 'chip', onclick: seeAll }, t('bd.all', { n: got, of: all.length }))),
      page === 'stats' ? h('div', { class: 'bdf-list' }, ...byFamily()) : h('div', { class: 'bd-row' }, ...[...earned, ...next].slice(0, 4).map(tile)));
    if (page === 'stats') badgeBox.append(iconCard());
  };

  // --- the doors: each opens its own full screen, so Me stays short ---
  const paintDoors = () => {
    if (page) return;
    let hasFigure = false;
    try { hasFigure = !!localStorage.getItem('rankFigure'); } catch { /* ignore */ }
    const earned = badgeStates().filter((b) => b.earned).length;
    const door = (id: MePage, icon: string, title: string, sub: string, dot = false, tap?: () => void) =>
      h('a', { class: `me-door d-${id}`, href: `#/me/${id}`, onclick: tap ? (e: Event) => { e.preventDefault(); tap(); } : null },
        h('span', { class: 'me-door-ic', 'aria-hidden': 'true' }, icon),
        h('span', { class: 'me-door-txt' }, h('b', {}, title), h('span', { class: 'muted small' }, sub)),
        dot ? h('i', { class: 'me-door-dot', 'aria-hidden': 'true' }) : '');
    void hasFigure;
    // The room is on the streak card and prayer times on the line at the top; these two are used less often.
    prayerStrip.replaceChildren(h('span', { class: 'me-pr-ic', 'aria-hidden': 'true' }, '🕌'),
      h('span', { class: 'me-pr-txt' }, prayerLine || mpt('mp.prayerSet')), h('span', { class: 'me-pr-go', 'aria-hidden': 'true' }, '›'));
    doors.replaceChildren(
      door('stats', '🏅', mpt('mp.stats'), mpt('mp.statsSub', { pages: stats('week').pages, n: earned })),
      door('library', '📚', mpt('mp.lib'), mpt('mp.libSub')));
  };

  const paintLibrary = () => {
    const bms = bookmarks();
    const recent = recentPages().slice(0, 3);
    const ref = (s: number, a: number) => uiRef(meta[s - 1] as SurahMeta, a, a);
    libBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('lib.title')),
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => openBookmarks() }, `🔖  ${t('lib.bookmarks', { n: bms.length })}`),
        h('a', { class: 'menu-item', href: '#/drafts' }, `🎬  ${t('lib.reels')}`),
        ...recent.map((r) => h('a', { class: 'menu-item', href: `#/s/${r.s}/${r.a}` },
          h('span', {}, `📖  ${ref(r.s, r.a)}`), h('span', { class: 'muted small' }, ` · ${t('common.page', { n: r.page })}`)))));
    function openBookmarks() {
      dialog(t('menu.bookmarks'), bms.length
        ? h('div', { class: 'sheet-scroll menu' }, ...bms.map((b) => h('a', { class: 'menu-item', href: `#/s/${b.s}/${b.a}` }, ref(b.s, b.a))))
        : h('p', { class: 'muted' }, t('bm.empty')));
    }
  };

  const paintPrayer = async () => {
    const ps = prayerSettings();
    const head = h('h2', { class: 'me-h' }, t('pr.title'));
    const locate = h('button', { class: 'chip', onclick: async () => {
      toast(t('pr.finding'));
      const r = await locatePrayer(); if (!r.ok) toast(t(`pr.fail.${r.why}` as Key));
    } }, ps.lat === null ? t('pr.setLocation') : t('pr.update'));
    if (ps.lat === null) {
      prayerBox.replaceChildren(head, h('p', { class: 'muted small' }, t('pr.locHelp')), locate);
      if (prayerLine) { prayerLine = ''; paintDoors(); }
      return;
    }
    const times = (await prayerDay(new Date(), ps))!;
    const now = Date.now();
    let next = times.findIndex((x, i) => i !== 1 && x.getTime() > now);
    const tomorrow = next < 0 ? (await prayerDay(new Date(Date.now() + 86_400_000), ps))![0] : null;
    const nextAt = tomorrow ?? times[next];
    if (next < 0) next = 0;
    const mins = Math.max(0, Math.round((nextAt.getTime() - now) / 60_000));
    const line = t('pr.next', { name: t(`pr.${PRAYERS[next]}` as Key), time: timeFmt.format(nextAt), left: minutes(mins * 60) });
    if (line !== prayerLine) { prayerLine = line; paintDoors(); }
    prayerBox.replaceChildren(
      h('div', { class: 'me-row' }, head, h('a', { class: `chip${anyAlert() ? ' on' : ''}`, href: '#/me/settings/pa' }, `🔔 ${t(anyAlert() ? 'pa.on' : 'pa.short')}`)),
      h('p', { class: 'pr-next' }, t('pr.next', { name: t(`pr.${PRAYERS[next]}` as Key), time: timeFmt.format(nextAt), left: minutes(mins * 60) })),
      h('div', { class: 'pr-list' }, ...times.map((x, i) => h('div', { class: `pr-row${i === next && !tomorrow ? ' next' : ''}${i === 1 ? ' sun' : ''}` },
        h('span', {}, t(`pr.${PRAYERS[i]}` as Key)), h('b', {}, timeFmt.format(x))))),
      h('p', { class: 'muted small' }, t('pr.privacy')));
  };

  void import('../together/relight').then((m) => m.takeRelights());
  // Repaint at most once a frame, however many changes arrive (a burst of tasbih taps, a sync).
  let queued = 0;
  const paintAll = () => { queued = 0; paintHero(); paintGoals(); paintDuas(); paintStats(); paintBadges(); paintDoors(); maybeStreak(); };
  const refresh = () => { if (!queued) queued = requestAnimationFrame(paintAll); };
  paintAll();
  paintLibrary();
  void paintPrayer();
  const tick = window.setInterval(() => { if (!document.hidden) { void paintPrayer(); void paintSky(); } }, 30_000);
  const secTick = window.setInterval(() => { if (!document.hidden) paintResets(); }, 1000);
  // The evening adhkar join the goals at Asr: work out today's Asr, and repaint when it comes.
  void refreshAsr();
  const toAsr = eveningFrom().getTime() - Date.now();
  const asrTimer = toAsr > 0 && toAsr < 86_400_000 ? window.setTimeout(refresh, toAsr + 1000) : 0;
  const onPrayer = () => void paintPrayer();
  // The sync line under the streak card (signed in only): tap it, or pull the page down, to sync now.
  const syncLine = h('button', { class: 'me-sync', type: 'button', 'aria-label': mpt('mp.syncNow'), onclick: () => void syncNow() });
  const agoText = (at: number) => {
    const sec = (Date.now() - at) / 1000;
    return sec < 60 ? mpt('mp.justNow') : sec < 3600 ? mpt('mp.minAgo', { n: Math.round(sec / 60) }) : mpt('mp.hAgo', { n: Math.round(sec / 3600) });
  };
  let pulling = false;
  const paintSync = () => {
    const st = syncStatus();
    syncLine.hidden = !account() || st.state === 'off' && !st.at;
    syncLine.classList.toggle('busy', st.state === 'syncing');
    syncLine.textContent = pulling ? mpt('mp.pull')
      : st.state === 'syncing' ? mpt('mp.syncing')
        : st.state === 'offline' ? mpt('mp.savedOffline')
          : st.state === 'error' ? mpt('mp.savedRetry')
            : st.at ? mpt('mp.synced', { ago: agoText(st.at) }) : '';
  };
  let wasLoading = firstSyncPending();
  const offSync = onSyncStatus(() => {
    paintSync();
    const loading = firstSyncPending();
    if (loading !== wasLoading) { wasLoading = loading; refresh(); }
  });
  const syncTick = setInterval(paintSync, 30e3);
  // Progress merged in from another phone while Me is open: the streak counts up with a note.
  const onArrive = () => { if (syncStatus().state === 'syncing' && !firstSyncPending()) arriving = true; };
  window.addEventListener('journey-changed', onArrive);
  // Pull to refresh (at the top of Me).
  let y0 = -1;
  const onDown = (e: TouchEvent) => { y0 = !page && scrollY <= 0 && account() ? e.touches[0].clientY : -1; };
  const onMove = (e: TouchEvent) => {
    if (y0 < 0) return;
    const p = e.touches[0].clientY - y0 > 80;
    if (p !== pulling) { pulling = p; paintSync(); }
  };
  const onUp = () => { if (pulling) { pulling = false; void syncNow(); paintSync(); } y0 = -1; };
  root.addEventListener('touchstart', onDown, { passive: true });
  root.addEventListener('touchmove', onMove, { passive: true });
  root.addEventListener('touchend', onUp);

  if (page === 'room') {
    root.classList.add('me-room-screen');
    root.append(roomSlot);
  } else if (page) {
    // A door's full screen: the same live sections, on their own.
    const title = { room: mpt('mp.room'), prayer: mpt('mp.prayer'), stats: mpt('mp.stats'), library: mpt('mp.lib') }[page];
    const content = { room: [roomSlot], prayer: [prayerBox], stats: [claimSlot, statsBox, badgeBox], library: [libBox] }[page];
    root.append(
      h('header', { class: 'topbar' },
        h('a', { class: 'icon-btn', href: '#/me', 'aria-label': mpt('mp.back'), onclick: backToMe }, '‹'),
        h('div', { class: 'brand' }, h('h1', {}, title)),
        lightChip()),
      h('div', { class: `me-page me-page-${page}` }, ...content),
      tabBar('me'));
  } else {
    paintAsk();
    root.append(
      h('header', { class: 'topbar' },
        h('div', { class: 'brand' }, h('h1', {}, t('me.title')), h('p', { class: 'muted' }, t('me.sub'))),
        lightChip(),
        inboxBell(),
        h('a', { class: 'icon-btn me-gear', href: '#/me/settings', 'aria-label': t('me.settings'), title: t('me.settings') }, '⚙')),
      prayerStrip, hero, syncLine, noorEl, dayCard() ?? '', wardrobeSlot, claimSlot, goalsBox, duaBox, duaAsk, doors, todayCard(), seasonCard() ?? '',
      tabBar('me'));
    void widgetHint().then((card) => { if (card && hero.isConnected) hero.after(card); });
  }
  paintRoom();

  // A lantern tapped on the home-screen widget (#/me/du:wake, #/me/du:salah:fajr…): its session opens over Me.
  if (at?.startsWith('du:')) {
    const [m, p] = at.slice(3).split(':');
    history.replaceState(null, '', '#/me');
    if (m === 'wake' || m === 'sleep' || m === 'salah') setTimeout(() => void import('./adhkar').then((x) => x.openDuas(m, p as never)), 350);
  }
  // Opened from a goal note (banner or notification): bring the waiting Claim into view and let it glow.
  try {
    if (sessionStorage.getItem('meFocus') === 'claim') {
      sessionStorage.removeItem('meFocus');
      setTimeout(() => {
        if (!goalsBox.querySelector('.chest.ready') && goalsBox.querySelector('.goal-seg-dot')) {
          goalTab = goalTab === 'day' ? 'week' : 'day';
          paintGoals();
        }
        const c = goalsBox.querySelector<HTMLElement>('.chest.ready') ?? root.querySelector<HTMLElement>('.claim-badge');
        if (!c) return;
        c.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
        c.classList.add('focus');
        setTimeout(() => c.classList.remove('focus'), 2600);
      }, 450);
    }
  } catch { /* private window */ }
  window.addEventListener('journey-changed', refresh);
  window.addEventListener('readlog-changed', refresh);
  window.addEventListener('prayer-changed', onPrayer);
  // A sheet or the tasbih counter closed: the streak moment may play now.
  const onClose = () => setTimeout(maybeStreak, 350);
  document.addEventListener('close', onClose, true);
  // Back from one of Me's own screens (a door, settings): Me opens where it was left, not at the top.
  if (!page) {
    let y = 0;
    try { y = Number(sessionStorage.getItem('meScroll')) || 0; sessionStorage.removeItem('meScroll'); } catch { /* ignore */ }
    if (y > 0) {
      const go = () => window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
      requestAnimationFrame(go);
      // Some cards (lanterns, today, the character) arrive a moment later and may lengthen the page.
      setTimeout(() => { if (Math.abs(scrollY - y) > 4 && scrollY < y) go(); }, 250);
    }
  }
  const leaveY = () => scrollY;
  return () => {
    if (!page && location.hash.startsWith('#/me/')) {
      try { sessionStorage.setItem('meScroll', String(Math.round(leaveY()))); } catch { /* ignore */ }
    }
    document.removeEventListener('close', onClose, true);
    offSync();
    clearInterval(syncTick);
    window.removeEventListener('journey-changed', onArrive);
    clearInterval(tick);
    clearInterval(secTick);
    clearTimeout(asrTimer);
    cancelAnimationFrame(queued);
    window.removeEventListener('prayer-changed', onPrayer);
    window.removeEventListener('journey-changed', refresh);
    window.removeEventListener('readlog-changed', refresh);
  };
}

/** #/me/settings: the Me tab's own settings, then the way on to the app's menu. */
export function showMeSettings(root: HTMLElement): () => void {
  const timeFmt = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
  const body = h('div', {});
  const section = (title: string, ...kids: (Node | string | false)[]) => h('section', { class: 'me-card' }, h('h2', { class: 'me-h' }, title), ...kids);
  const chips = <T,>(list: readonly T[], cur: (x: T) => boolean, label: (x: T) => string, pick: (x: T) => void | Promise<void>) =>
    h('div', { class: 'chips' }, ...list.map((x) => h('button', {
      class: `chip${cur(x) ? ' on' : ''}`, 'aria-pressed': String(cur(x)),
      onclick: async () => { await pick(x); haptic(); paint(); },
    }, label(x))));

  const paint = () => {
    const ps = prayerSettings();
    const rem = dhikrReminders();
    const sel = h('select', { class: 'search pr-method', 'aria-label': t('pr.method'), onchange: (e: Event) =>
      setPrayerSettings({ ...prayerSettings(), method: (e.target as HTMLSelectElement).value as Method }) },
    ...METHODS.map((m) => h('option', { value: m, selected: m === ps.method }, t(`pr.m.${m}` as Key))));
    body.replaceChildren(
      section(t('set.reading'),
        h('div', { class: 'menu' },
          h('a', { class: 'menu-item', href: '#/' }, `📖  ${t('menu.allSurahs')}`),
          h('form', { class: 'menu-item go-page', onsubmit: (e: Event) => {
            e.preventDefault();
            const p = Math.round(Number(pageInput.value));
            if (p >= 1 && p <= 604) goMushaf(`page:${p}`);
          } }, pageInput, h('button', { class: 'chip', type: 'submit' }, t('menu.goToPage'))),
          h('button', { class: 'menu-item', onclick: () => { setReaderMode('translation'); location.hash = lastRead(); } }, `🔤  ${t('menu.translationView')}`),
          h('button', { class: 'menu-item', onclick: () => goMushaf('bookmarks') }, `🔖  ${t('menu.bookmarks')}`),
          h('button', { class: 'menu-item', onclick: () => goMushaf('reflections') }, `✎  ${t('menu.reflections')}`),
          h('button', { class: 'menu-item', onclick: openTranslations }, `🌐  ${t('menu.translation', { name: translationInfo(currentTranslation()).translator })}`),
          h('button', { class: 'menu-item', 'aria-pressed': String(timeTintOn()), onclick: () => { setTimeTint(!timeTintOn()); paint(); } },
            `🕰  ${t('menu.timeTint', { state: t(timeTintOn() ? 'menu.on' : 'menu.off') })}`)),
        h('b', { class: 'set-label' }, t('me.pageTime')),
        h('p', { class: 'muted small' }, t('me.pageTimeHelp')),
        chips(PAGE_TIMES, (x) => x === pageSeconds(), timeLabel, (x) => setPageSeconds(x)),
        mushafOfflineRow()),
      section(t('pr.title'),
        h('p', { class: 'muted small' }, t('pr.locHelp')),
        h('button', { class: 'chip', onclick: async () => {
          toast(t('pr.finding'));
          const r = await locatePrayer(); if (!r.ok) toast(t(`pr.fail.${r.why}` as Key));
        } }, ps.lat === null ? t('pr.setLocation') : t('pr.update')),
        h('label', { class: 'pr-set' }, h('span', { class: 'muted small' }, t('pr.method')), sel),
        h('div', { class: 'chips pr-asr' }, h('span', { class: 'muted small' }, t('pr.asr')),
          ...[false, true].map((hanafi) => h('button', {
            class: `chip${ps.hanafi === hanafi ? ' on' : ''}`, 'aria-pressed': String(ps.hanafi === hanafi),
            onclick: () => setPrayerSettings({ ...prayerSettings(), hanafi }),
          }, t(hanafi ? 'pr.hanafi' : 'pr.standard')))),
        isNative() ? h('button', {
          class: `menu-item${ps.lockScreen ? ' on' : ''}`, 'aria-pressed': String(ps.lockScreen),
          onclick: async () => {
            const on = !prayerSettings().lockScreen;
            if (on && !(await allowNotifications())) return toast(t('rem.denied'));
            setPrayerSettings({ ...prayerSettings(), lockScreen: on });
          },
        }, `🔒  ${t('pr.lock', { state: t(ps.lockScreen ? 'menu.on' : 'menu.off') })}`) : '',
        h('p', { class: 'muted small' }, t('pr.privacy'))),
      alertsSection(),
      section(t('fav.section'),
        favouriteIds().length ? favouritesSection(favouriteIds().map(reciterById), paint) : h('p', { class: 'muted small' }, t('fav.sectionHelp'))),
      section(t('wg.title'),
        h('p', { class: 'muted small' }, t('wg.setHelp')),
        h('div', { class: 'menu' }, h('a', { class: 'menu-item', href: '#/me/widgets' }, `🧩  ${t('wg.open')}`))),
      nudgeSection(),
      isNative() ? section(t('rem.label'),
        chips(REMINDER_TIMES, (x) => rem.includes(x), (tm) => timeFmt.format(new Date(2026, 0, 1, Number(tm.slice(0, 2)), Number(tm.slice(3)))),
          async (tm) => {
            const next = rem.includes(tm) ? rem.filter((x) => x !== tm) : [...rem, tm];
            if (!(await setDhikrReminders(next))) toast(t('rem.denied'));
          })) : '',
      isNative() ? h('section', { class: 'me-card menu' },
        h('button', { class: 'menu-item', onclick: () => void import('./morning').then((m) => m.openMorning()) }, `✧  ${t('morning.title')}`)) : '',
      section(t('menu.gYours'),
        h('div', { class: 'menu' },
          h('button', { class: 'menu-item', onclick: () => goMushaf('ramadan') }, `☾  ${t('menu.ramadan')}`),
          h('button', { class: 'menu-item', onclick: () => void import('./circles').then((m) => m.openCircles()) }, `◯  ${t('menu.circles')}`),
          h('button', { class: 'menu-item', onclick: () => void import('./kids').then((m) => m.openKidsSpace()) }, `🌙  ${t('menu.kids')}`))),
      section(t('set.app'),
        h('div', { class: 'menu' },
          h('button', { class: 'menu-item', onclick: () => openAccount() }, accountLabel()),
          h('button', { class: 'menu-item', onclick: () => void import('./themePicker').then((m) => m.openThemePicker()) }, `◐  ${t('theme.menu')}`),
          h('button', { class: 'menu-item', onclick: openLanguage }, `🗣  ${t('menu.language', { name: LANGS.find((l) => l.id === lang())!.name })}`),
          h('button', { class: 'menu-item', 'aria-pressed': String(soundsOn()), onclick: () => { setSoundsOn(!soundsOn()); paint(); } }, `${soundsOn() ? '🔔' : '🔕'}  ${t(soundsOn() ? 'set.soundsOn' : 'set.soundsOff')}`),
          h('button', { class: 'menu-item', onclick: () => void import('./harakatClips').then((m) => m.openHelpSheet()) }, `🎙  ${t('set.harakatHelp')}`),
          h('button', { class: 'menu-item', onclick: () => goMushaf('tour') }, `✧  ${t('menu.tour')}`),
          h('button', { class: 'menu-item', onclick: () => void import('./report').then((m) => m.openReport()) }, `⚑  ${t('set.report')}`))));
  };
  const pageInput = h('input', { type: 'number', class: 'search', min: '1', max: '604', placeholder: t('menu.pagePlaceholder', { n: 604 }), inputmode: 'numeric' }) as HTMLInputElement;
  const openTranslations = async () => {
    const { translationList } = await import('./translationPicker');
    const d = dialog(t('tr.title'),
      h('p', { class: 'muted small' }, t('tr.note')),
      h('div', { class: 'sheet-scroll' }, translationList(currentTranslation, (id) => { setTranslation(id); d.close(); paint(); })));
  };
  const openLanguage = () => {
    dialog(t('lang.title'),
      h('p', { class: 'muted small' }, t('lang.note')),
      h('div', { class: 'menu' }, ...LANGS.map((l) => h('button', {
        class: `menu-item tr-item${l.id === lang() ? ' on' : ''}`, lang: l.id, dir: l.dir,
        onclick: (e: Event) => { if (l.id !== lang()) setLang(l.id); else (e.currentTarget as HTMLElement).closest('dialog')?.close(); },
      }, h('span', { class: 'tr-name' }, l.name), h('span', { class: 'tr-tick', 'aria-hidden': 'true' }, l.id === lang() ? '✓' : '')))));
  };
  const alertsSection = () => {
    const a = prayerAlerts();
    const ps = prayerSettings();
    // Each change starts from the saved settings (two quick taps never undo each other).
    const save = async (change: (cur: typeof a) => typeof a) => {
      const done = setPrayerAlerts(change(prayerAlerts()));
      haptic();
      paint();
      if (!(await done) && isNative()) toast(t('rem.denied'));
    };
    const box = section(t('pa.title'),
      h('p', { class: 'muted small' }, t('pa.help')),
      ps.lat === null ? h('p', { class: 'pa-warn small' }, t('pa.needLoc')) : '',
      h('div', { class: 'chips pa-prayers' }, ...ALERT_PRAYERS.map((p) => h('button', {
        class: `chip${a.on[p] ? ' on' : ''}`, 'aria-pressed': String(a.on[p]),
        onclick: () => save((c) => ({ ...c, on: { ...c.on, [p]: !c.on[p] } })),
      }, `${a.on[p] ? '🔔' : '🔕'} ${t(`pr.${p}` as Key)}${times ? ` · ${timeFmt.format(times[PRAYERS.indexOf(p)])}` : ''}`))),
      h('b', { class: 'set-label' }, t('pa.when')),
      chips(BEFORE, (x) => x === a.before, (x) => (x ? t('pa.before', { n: x }) : t('pa.atTime')), (x) => save((c) => ({ ...c, before: x }))),
      h('b', { class: 'set-label' }, t('pa.sound')),
      chips(SOUNDS, (x) => x === a.sound, (x) => t(`pa.s.${x}` as Key), (x) => { previewSound(x); save((c) => ({ ...c, sound: x })); }),
      h('b', { class: 'set-label' }, akt('du.notes')),
      h('p', { class: 'muted small' }, akt('du.notesHelp')),
      h('button', { class: `chip${a.duas ? ' on' : ''}`, 'aria-pressed': String(a.duas), onclick: () => save((c) => ({ ...c, duas: !c.duas })) }, a.duas ? akt('du.notesOn') : akt('du.notesOff')),
      h('b', { class: 'set-label' }, akt('du.salahNotes')),
      h('p', { class: 'muted small' }, akt('du.salahHelp')),
      h('button', { class: `chip${a.salah ? ' on' : ''}`, 'aria-pressed': String(a.salah), onclick: () => save((c) => ({ ...c, salah: !c.salah })) }, a.salah ? akt('du.notesOn') : akt('du.notesOff')),
      !isNative() ? h('p', { class: 'muted small' }, t('pa.web')) : '',
      isNative() && anyAlert(a) && !exact ? h('div', { class: 'pa-exact' },
        h('p', { class: 'muted small' }, t('pa.late')),
        h('button', { class: 'chip', onclick: async () => { exact = await askExact(); void setPrayerAlerts(prayerAlerts()); paint(); } }, t('pa.exact'))) : '');
    box.id = 'pa';
    return box;
  };
  // Goal notes (src/ui/nudges.ts): which ones, and the evening reminder's time.
  const nudgeSection = () => {
    const n = nudgeSettings();
    const toggle = (k: 'goal' | 'all' | 'freeze' | 'risk', label: string) => h('button', {
      class: `menu-item${n[k] ? ' on' : ''}`, 'aria-pressed': String(n[k]),
      onclick: async () => {
        const on = !nudgeSettings()[k];
        if (on && isNative() && (k === 'risk' || k === 'goal' || k === 'all') && !(await allowNotifications())) toast(t('rem.denied'));
        setNudgeSettings({ ...nudgeSettings(), [k]: on });
        haptic();
        paint();
      },
    }, `${n[k] ? '🔔' : '🔕'}  ${label}`);
    return section(t('nudge.section'),
      h('p', { class: 'muted small' }, t(isNative() ? 'nudge.help' : 'nudge.helpWeb')),
      h('div', { class: 'menu' },
        toggle('goal', t('nudge.setGoal')),
        toggle('all', t('nudge.setAll')),
        toggle('freeze', t('nudge.setFreeze')),
        isNative() ? toggle('risk', t('nudge.setRisk')) : ''),
      isNative() && n.risk ? h('div', {},
        h('b', { class: 'set-label' }, t('nudge.riskWhen')),
        chips(RISK_TIMES, (x) => x === n.riskAt, (tm) => timeFmt.format(new Date(2026, 0, 1, Number(tm.slice(0, 2)), 0)),
          (x) => setNudgeSettings({ ...nudgeSettings(), riskAt: x }))) : '',
      h('p', { class: 'muted small' }, t('nudge.calm')));
  };
  let times: Date[] | null = null;
  let exact = true;
  paint();
  void (async () => {
    times = await prayerDay(new Date(), prayerSettings());
    exact = await exactAllowed();
    paint();
    if (location.hash.endsWith('/pa')) document.getElementById('pa')?.scrollIntoView({ block: 'start' });
  })();
  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/me', 'aria-label': t('me.title') }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, t('me.settings')))),
    body, tabBar('me'));
  const onPrayer = async () => { times = await prayerDay(new Date(), prayerSettings()); paint(); };
  window.addEventListener('prayer-changed', onPrayer);
  return () => window.removeEventListener('prayer-changed', onPrayer);
}

/** A flame that went out can be relit with streak freezes kept from the Ranks shop or prizes. */
function keptFreezeButton(days: string[]): HTMLElement {
  const box = h('div', {});
  void Promise.all([import('../data/shop'), import('../i18n/ranks')]).then(([shop, { rt }]) => {
    if (shop.bankedFreezes() < days.length) return;
    box.replaceChildren(h('button', { class: 'me-relight', onclick: () => {
      if (shop.useFreezes(days)) { toast(rt('rk.freezeUsed')); haptic(); }
    } }, `❄  ${rt('rk.useFreeze', { n: days.length })}`));
  }).catch(() => { /* offline chunk: nothing */ });
  return box;
}
