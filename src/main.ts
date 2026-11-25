// Entry: hash router for the three Phase 0 screens.
//   #/                 surah list (the app itself opens on the mushaf: where the user left off, or Al-Fatiha)
//   #/search           the same list with the search box focused (surah, 2:255, juz 5, page 50, words)
//   #/s/2[/255]        reading view — mushaf page or translation cards (optionally at an ayah)
//   #/reel/2/255-257[/draft]   editor for a selection (optionally a saved draft)
//   #/drafts           saved reel drafts
//   #/learn…            Learn: the path, lessons, Your garden, tree close-ups, page memory (src/ui/learnRoutes.ts)
//   #/me               Me: streak flame, stats, reading time, settings
//   #/relight/CODE     relight a friend's streak flame
//   #/me/settings      the Me tab's settings
//   #/me/widgets       the home-screen widgets (Add to home screen)
//   #/me/room, #/me/prayer, #/me/stats, #/me/library   Me's doors: full screens
//   #/join/CODE        an invitation to a Khatm circle
//   #/ramadan          today's Ramadan portion (from a reminder)
//   #/season           the Ramadan season: countdown and what unlocks (before), its home (during), the recap (Eid)
//   #/kids[/N]         the Kids space (docs/kids.md): while it is on, every other address leads here
import './styles.css';
import { closeSheetsOnRoute } from './ui/backCloses';
import { h, skeleton, studioShell, sweepListeners } from './ui/dom';
import { playOpening } from './ui/opening';
import { showMushaf } from './ui/mushaf';
import { lastRead, readerMode, setLastRead } from './ui/prefs';
import { showReader } from './ui/reader';
import { initAuth } from './cloud/auth';
import { startSync } from './cloud/sync';
import { setupOffline } from './offline';
import { isIOS, isNative } from './native';
import { initI18n, t } from './i18n';
import { applyTheme } from './ui/theme';
import { applyLite } from './lite';
import { initErrors } from './errors';
import { initUsage, markRoute } from './usage';
import { clearPass, kidsOn, usePass } from './data/kids';
import { recordOpen } from './data/journey';
import { watchVitals } from './perf';
import { quietPlayer } from './ui/playerHub';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let routeId = 0;
/** Tab screens kept as a picture for their next open (route()); a few minutes at most, dropped on an account change. */
const TAB_ROOTS = new Set(['me', 'ranks', 'learn']);
const GHOST_MS = 10 * 60_000;
const ghosts = new Map<string, { el: HTMLElement; at: number }>();
// Instant tabs (thread "Make the whole app fast", 2026-11-19): a tab screen left is kept alive, hidden in #app (still
// connected, so its listeners stay; `content-visibility: hidden` keeps its layout worked out, so showing it is cheap), with its cleanup held back. Tapping the tab again shows it as it was (scroll place
// too) and tells it with the event `screen-shown`, so it can refresh what may have changed; nothing is rebuilt. Kept up
// to KEEP_MS, then rebuilt as before. A screen keeps polling only while shown (`offScreen()` in dom.ts).
const KEEP_MS = 10 * 60_000;
const alive = new Map<string, { el: HTMLElement; c: () => void; at: number; y: number }>();
const dropAlive = (key?: string) => {
  for (const [k, v] of alive) if (!key || k === key) { alive.delete(k); try { v.c(); } catch (e) { console.error(e); } v.el.remove(); }
};
let shownTab = '';

/** Builds a tab ahead, hidden, while the app is idle (Me, then Learn), so even its first tap shows a ready screen. */
async function prebuild(key: 'me' | 'learn' | 'ranks') {
  if (alive.has(key) || shownTab === key || kidsOn() || document.hidden) return;
  try { if (key === 'me' && sessionStorage.getItem('meFocus')) return; } catch { /* private window */ }
  const screen = h('div', { class: `screen screen-${key} screen-kept` });
  screen.dataset.tab = key;
  screen.inert = true;
  app.prepend(screen);
  try {
    const c = key === 'me' ? await (await import('./ui/me')).showMe(screen)
      : key === 'ranks' ? await (await import('./ui/ranks')).showRanks(screen)
      : await (await import('./ui/learnRoutes')).learnRoute(screen, undefined, undefined);
    // Opened (or the account changed) while it was built: the one built by route() wins.
    if (alive.has(key) || shownTab === key || !screen.isConnected) { c(); screen.remove(); return; }
    alive.set(key, { el: screen, c, at: Date.now(), y: 0 });
    // Laid out and painted once, unseen (a kept screen that never rendered would do it all on its first tap); then
    // `content-visibility: hidden` keeps that work for the tap.
    screen.classList.replace('screen-kept', 'screen-warm');
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      if (screen.classList.contains('screen-warm')) screen.classList.replace('screen-warm', 'screen-kept');
    }, 50)));
  } catch (e) { console.warn('prebuild', key, e); screen.remove(); }
}
function prebuildTabs() {
  const idle = (fn: () => void, ms: number) => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : fn()), ms);
  idle(() => void prebuild('me').then(() => idle(() => void prebuild('learn').then(() => idle(() => void prebuild('ranks'), 1500)), 1500)), 2500);
}
/** Puts `els` in #app in place of what was shown, leaving the kept (hidden) tab screens in it. */
function replaceScreens(...els: HTMLElement[]) {
  const keep = new Set([...alive.values()].map((v) => v.el));
  const pre = document.getElementById('prepaint'); // index.html's first page: stays until the reader's own is drawn
  if (pre) keep.add(pre);
  for (const el of [...app.children]) if (!keep.has(el as HTMLElement)) el.remove();
  app.append(...els);
}
async function route() {
  const id = ++routeId;
  closeSheetsOnRoute();
  const [view, a, b, c4, d5] = location.hash.replace(/^#\/?/, '').split('/');
  const shown = app.querySelector<HTMLElement>(':scope > .screen:not(.screen-ghost):not(.screen-kept):not(.screen-warm)');
  if (shownTab && cleanup && shown?.dataset.tab === shownTab && !kidsOn()) {
    // Keep the tab just left alive instead of tearing it down.
    alive.set(shownTab, { el: shown, c: cleanup, at: Date.now(), y: window.scrollY });
    shown.classList.add('screen-kept');
    shown.inert = true;
    shown.dispatchEvent(new Event('screen-hidden'));
  } else cleanup?.();
  cleanup = null;
  shownTab = '';
  // The Kids space is on: only its own screens (and a page the parent opened through the gate).
  if (kidsOn() && view !== 'kids' && !usePass(location.hash)) {
    history.replaceState(null, '', '#/kids');
    return void route();
  }
  if (view === 'kids') clearPass();
  markRoute(location.hash); // anonymous screen counts (src/usage.ts)
  // Listening carries on across screens, but not into the studio (its own sound) or the Kids space.
  if (view === 'reel' || view === 'kids') quietPlayer(view === 'kids');
  for (const [k, v] of alive) if (Date.now() - v.at > KEEP_MS || view === 'kids') dropAlive(k);
  const keepKey = TAB_ROOTS.has(view) && !a ? view : '';
  const back = keepKey ? alive.get(keepKey) : undefined;
  if (back) {
    alive.delete(keepKey);
    for (const el of [...app.children]) if (el !== back.el && ![...alive.values()].some((v) => v.el === el)) el.remove();
    back.el.classList.remove('screen-kept', 'screen-warm');
    back.el.inert = false;
    document.body.dataset.view = view;
    window.scrollTo(0, back.y);
    cleanup = back.c;
    shownTab = keepKey;
    back.el.dispatchEvent(new Event('screen-shown'));
    void import('./ui/tabs').then((m) => m.hopKept(back.el));
    return;
  }
  const screen = h('div', { class: `screen screen-${view || 'home'}` });
  // Tabs feel instant (owner 2026-11-16, "ultra fast like Duolingo"): the screen of a tab left earlier stays as a
  // still picture (inert) while its fresh copy is built underneath, then the two swap — no blank or skeleton between.
  const prev = app.querySelector<HTMLElement>(':scope > .screen:not(.screen-ghost):not(.screen-kept):not(.screen-warm)');
  if (prev?.dataset.tab) ghosts.set(prev.dataset.tab, { el: prev, at: Date.now() });
  const tabKey = TAB_ROOTS.has(view) && !a ? view : '';
  if (tabKey) screen.dataset.tab = tabKey;
  const ghost = tabKey ? ghosts.get(tabKey) : undefined;
  if (ghost && Date.now() - ghost.at < GHOST_MS) {
    ghosts.delete(tabKey);
    ghost.el.classList.add('screen-ghost');
    ghost.el.inert = true;
    screen.classList.add('screen-building');
    replaceScreens(ghost.el, screen);
  } else replaceScreens(screen);
  if (tabKey) shownTab = tabKey;
  const unGhost = () => { if (id !== routeId) return; app.querySelector(':scope > .screen-ghost')?.remove(); screen.classList.remove('screen-building'); };
  sweepListeners(); // listeners of the screen just left
  document.body.dataset.view = view || 'home';
  window.scrollTo(0, 0);
  // A screen that takes a moment (data, fonts) shows a skeleton of itself instead of a blank page,
  // only when it is not ready within 120 ms (no flash on a fast open). The studio has its own.
  const skel = view === 'reel' || screen.classList.contains('screen-building') ? null : skeleton(view === 's' && readerMode() === 'mushaf' ? 'page' : 'list');
  const skelTimer = skel ? window.setTimeout(() => { if (id === routeId) app.append(skel); }, 120) : 0;
  const dropSkel = () => { clearTimeout(skelTimer); skel?.remove(); };
  try {
    let c: () => void;
    if (view === 's' && Number(a)) {
      setLastRead(location.hash);
      const show = readerMode() === 'mushaf' ? showMushaf : showReader;
      c = await show(screen, Number(a), Number(b) || undefined);
    } else if (view === 'reel' && Number(a) && b) {
      const [from, to] = b.split('-').map(Number);
      try { localStorage.setItem('studioUsed', '1'); } catch { /* private window */ } // the web warm-up may now keep the studio offline
      // The studio's frame and its loading light show at once, while the editor's code and the reel load.
      screen.append(studioShell());
      // The editor pulls in the video engine (Mediabunny); load it only when needed.
      const { showEditor } = await import('./ui/editor');
      c = await showEditor(screen, Number(a), from, to || from, c4 || undefined);
    } else if (view === 't' && Number(a) && b) {
      // "Make this reel yourself" (a link in a shared reel's caption): the same ayat, reciter and look,
      // opened in the studio as a new reel. The editor checks every part before using it.
      try { sessionStorage.setItem('reelTemplate', JSON.stringify({ reciter: Number(c4) || 0, look: d5 ?? '' })); } catch { /* private window */ }
      history.replaceState(null, '', `#/reel/${Number(a)}/${b.replace(/[^0-9-]/g, '')}`);
      return void route();
    } else if (view === 'join' && a) {
      const { showJoin } = await import('./ui/circles');
      c = await showJoin(screen, a);
    } else if (view === 'ramadan') {
      // A Ramadan reminder was tapped: the mushaf on the next page of today's portion.
      const { ramadanTarget } = await import('./ui/ramadan');
      history.replaceState(null, '', await ramadanTarget());
      return void route();
    } else if (view === 'season') {
      c = await (await import('./ui/season')).showSeason(screen);
    } else if (view === 'kids') {
      if (Number(a)) {
        const { showKidsSurah } = await import('./ui/kidsListen');
        c = await showKidsSurah(screen, Number(a));
      } else {
        const { showKids } = await import('./ui/kids');
        c = await showKids(screen);
      }
    } else if (view === 'relight' && a) {
      const { showRelight } = await import('./ui/relight');
      c = await showRelight(screen, a);
    } else if (view === 'me') {
      const { showMe, showMeSettings } = await import('./ui/me');
      if (a === 'widgets') c = await (await import('./ui/widgetsPage')).showMeWidgets(screen);
      else c = a === 'settings' ? showMeSettings(screen, b) : await showMe(screen, a);
    } else if (view === 'learn') {
      c = await (await import('./ui/learnRoutes')).learnRoute(screen, a, b);
    } else if (view === 'ranks' || ((view === 'rb' || view === 'rc' || view === 'bp' || view === 'rf') && a)) {
      c = await (await import('./ui/ranks')).ranksRoute(screen, view, a);
    } else if (view === 'news') {
      c = await (await import('./ui/news')).showNews(screen);
    } else if (view === 'notifications') {
      c = await (await import('./ui/notifications')).showNotifications(screen);
    } else if (view === 'drafts') {
      const { showDrafts } = await import('./ui/drafts');
      c = await showDrafts(screen);
    } else {
      await import('./ui/screens.css').catch(() => {});
      c = await (await import('./ui/surahList')).showSurahList(screen, view === 'search'); // the app opens on the mushaf: loaded when wanted
    }
    dropSkel();
    unGhost();
    if (!screen.classList.contains('screen-mushaf')) document.getElementById('prepaint')?.remove();
    if (id === routeId) cleanup = c;
    else { c(); if (shownTab === tabKey) shownTab = ''; }
  } catch (e) {
    dropSkel();
    unGhost();
    document.getElementById('prepaint')?.remove();
    if (id !== routeId) return;
    console.error(e);
    screen.replaceChildren(h('div', { class: 'error' },
      h('h2', {}, t('common.wrong')),
      h('p', {}, e instanceof Error ? e.message : String(e)),
      h('div', { class: 'row center' },
        h('button', { class: 'primary', onclick: () => location.reload() }, t('common.reload')),
        h('a', { href: '#/', class: 'chip' }, t('common.backToSurahs')))));
  }
}

// Opening the app (no address of its own) goes straight to the mushaf: where the user left off,
// or Al-Fatiha the first time. The surah list stays one tap away ('‹' or ☰ → All surahs).
const launch = !location.hash || location.hash === '#' || location.hash === '#/';
applyTheme(); // the user's brand gradient, before the first screen
applyLite(); // old-phone mode: heavy decorations off (src/lite.ts)
try { document.documentElement.classList.toggle('easy', localStorage.getItem('easyMode') === 'on'); } catch { /* storage blocked */ } // easy mode: bigger text and buttons
initErrors(); // crash reports, only when a Sentry DSN is set (src/errors.ts)
window.addEventListener('prefs-synced', () => applyTheme()); // picked on another device
if (kidsOn()) { if (!location.hash.startsWith('#/kids')) history.replaceState(null, '', '#/kids'); }
else if (launch) history.replaceState(null, '', lastRead());
// In the app the system splash (the launcher icon) stays until the first screen is drawn, then leaves with a
// native animation (src/ui/opening.ts, AppActivity.java); the start-up extras below wait until it has gone.
let firstUp = () => {};
const firstScreen = new Promise<void>((r) => { firstUp = r; });
const opening = playOpening(firstScreen);

window.addEventListener('hashchange', route);
// Everything below the first screen waits until that screen is up (and the phone has a quiet moment),
// so a first open downloads and runs only what page 1 needs. Each part is idempotent and listens for
// later changes itself, so starting it a moment later loses nothing.
let afterFirst: (() => void)[] | null = [];
const later = (f: () => void) => { if (afterFirst) afterFirst.push(f); else f(); };
const runLater = () => {
  const list = afterFirst;
  afterFirst = null;
  for (const f of list ?? []) try { f(); } catch (e) { console.error(e); }
};
void initI18n().then(route).finally(() => {
  firstUp();
  void opening.then(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(runLater, { timeout: 1500 });
    else setTimeout(runLater, 300);
  });
});
// Favourite reciters' downloads carry on where they stopped (Wi-Fi only), after the first screen.
later(() => setTimeout(() => void import('./data/reciterDownload').then((m) => m.keepFavourites()), 4000));
// The studio's starter footage (a Pixabay nature clip ready for the next new reel), once the app has settled.
later(() => setTimeout(() => void import('./data/starter').then((m) => m.warmStarter()).catch(() => {}), 20000));
// The daily streak (Me tab): opening the app lights today's flame (not in the Kids space).
const markOpen = () => { if (!kidsOn() && !document.hidden) recordOpen(); };
markOpen();
document.addEventListener('visibilitychange', markOpen);
// Goals and badges (Me tab): checked whenever the journey changes; a new badge is announced.
later(() => void import('./ui/rewards').then((m) => m.watchRewards()));
later(() => void import('./data/nightCalm').then((m) => m.watchCalm()));
later(() => void import('./ui/press').then((m) => m.initPress())); // a boing on what was tapped; the page stretches at its ends, the tab bar stays
later(initUsage); // anonymous usage counts, sent once a day per key (src/usage.ts)
// Me and Learn are ready before their first tap (front-end review G12): fetched and parsed in a quiet moment
// once the first screen is up, not on Data Saver.
later(() => setTimeout(() => {
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const go = () => {
    // One screen's code per quiet moment: starting the three at once listed ~200 files in one task (~100 ms on a
    // slow phone, a felt pause a few seconds after opening).
    const quiet = (f: () => void, ms: number) => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 3000 }) : f()), ms);
    void import('./ui/me').catch(() => {});
    quiet(() => void import('./ui/learnPath').catch(() => {}), 300);
    quiet(() => void import('./ui/ranks').catch(() => {}), 900); // Ranks too, a moment later
    prebuildTabs(); // then Me and Learn built ahead, hidden, so their first tap is instant too
  };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 }); else go();
}, 2500));
watchVitals(); // real-use speed (this device only, Device check)
if (isNative()) void import('./appLinks'); // a shared link opened the app: go to its route
if (isIOS()) void import('./iosHaptics').then((m) => m.installIosHaptics()); // taps felt on the iPhone too
if (isNative()) later(() => void import('./ui/widgets').then((m) => m.initWidgets())); // streak, tasbih, prayer widgets
if (isNative()) later(() => void import('./ui/nudges').then((m) => m.initNudges())); // the evening flame reminder
setupOffline();
// Problem reports made offline go out now (src/ui/report.ts).
later(() => setTimeout(() => { try { if (localStorage.getItem('feedbackQueue')) void import('./ui/feedback').then((m) => m.flushFeedback()); } catch { /* ignore */ } }, 4000));
later(() => setTimeout(() => { try { if (localStorage.getItem('reportQueue')) void import('./ui/report').then((m) => m.flushReports()); } catch { /* ignore */ } }, 3000));
// Accounts are optional: restore a sign-in made on this device (or finish one coming back from
// Google), then keep bookmarks, settings and drafts in sync with the account.
void opening.then(startSync); // after the opening on a launch, so it never stutters
if (isNative()) later(() => void import('./ui/morning').then((m) => m.initDailyNative())); // widget + morning ayah (Android)
void opening.then(initAuth);
later(() => void import('./ui/circles').then((m) => m.resumePendingJoin())); // an invitation opened before signing in
later(() => void import('./ui/relight').then((m) => m.resumePendingRelight())); // a friend's relight opened before signing in
// A friend relit the flame: cover the missed days (when an ask was made in the last 3 days).
later(() => void import('./cloud/auth').then(({ onAccount }) => onAccount((a) => { if (a) void import('./together/relight').then((m) => m.takeRelights()); })));
document.addEventListener('visibilitychange', () => { if (!document.hidden && !afterFirst) void import('./together/relight').then((m) => m.takeRelights()); });
// The Ramadan season: its reminders, and the teaser for a new user once their account has synced (first day only).
setTimeout(() => void import('./ui/seasonCard').then((m) => m.initSeason()), 2500);
// Ranks: the day's checked totals go to the server when they change (signed in with Google only).
later(() => void import('./together/ranks').then((m) => m.watchRanks()));
later(() => void import('./cloud/auth').then(({ onAccount }) => { let who: string | undefined; onAccount((x) => { if (x?.id !== who) { ghosts.clear(); dropAlive(); } who = x?.id; }); }));
// Web: ask the browser to keep this site's storage (streak, Light, goals) instead of clearing it
// when space runs low or, on iPhone Safari, after 7 days away. Asked once the user has earned
// something, so Firefox's question never comes before there is anything to keep.
if (!isNative()) later(() => {
  const s = navigator.storage;
  if (!s?.persist || !s.persisted) return;
  void s.persisted().then((yes) => {
    if (yes) return;
    const ask = () => { window.removeEventListener('journey-changed', ask); void s.persist().catch(() => {}); };
    if (localStorage.getItem('journey')) ask();
    else window.addEventListener('journey-changed', ask);
  }, () => {});
});
// The ayah wall was removed (owner, 2026-10-11): drop a guest entry left waiting from before.
try { sessionStorage.removeItem('pendingWall'); } catch { /* ignore */ }
