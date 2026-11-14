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
import { h, skeleton, sweepListeners } from './ui/dom';
import { playOpening } from './ui/opening';
import { showMushaf } from './ui/mushaf';
import { lastRead, readerMode, setLastRead } from './ui/prefs';
import { showReader } from './ui/reader';
import { initAuth } from './cloud/auth';
import { startSync } from './cloud/sync';
import { setupOffline } from './offline';
import { isNative } from './native';
import { initI18n, t } from './i18n';
import { applyTheme } from './ui/theme';
import { applyLite, liteMode } from './lite';
import { initErrors } from './errors';
import { initUsage, markRoute } from './usage';
import { showSurahList } from './ui/surahList';
import { clearPass, kidsOn, usePass } from './data/kids';
import { recordOpen } from './data/journey';
import { watchVitals } from './perf';
import { quietPlayer } from './ui/player';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let routeId = 0;

async function route() {
  const id = ++routeId;
  closeSheetsOnRoute();
  cleanup?.();
  cleanup = null;
  const [view, a, b, c4, d5] = location.hash.replace(/^#\/?/, '').split('/');
  // The Kids space is on: only its own screens (and a page the parent opened through the gate).
  if (kidsOn() && view !== 'kids' && !usePass(location.hash)) {
    history.replaceState(null, '', '#/kids');
    return void route();
  }
  if (view === 'kids') clearPass();
  markRoute(location.hash); // anonymous screen counts (src/usage.ts)
  // Listening carries on across screens, but not into the studio (its own sound) or the Kids space.
  if (view === 'reel' || view === 'kids') quietPlayer(view === 'kids');
  const screen = h('div', { class: `screen screen-${view || 'home'}` });
  app.replaceChildren(screen);
  sweepListeners(); // listeners of the screen just left
  document.body.dataset.view = view || 'home';
  window.scrollTo(0, 0);
  // A screen that takes a moment (data, fonts) shows a skeleton of itself instead of a blank page,
  // only when it is not ready within 120 ms (no flash on a fast open). The studio has its own.
  const skel = view === 'reel' ? null : skeleton(view === 's' && readerMode() === 'mushaf' ? 'page' : 'list');
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
    } else if (view === 'drafts') {
      const { showDrafts } = await import('./ui/drafts');
      c = await showDrafts(screen);
    } else {
      await import('./ui/screens.css').catch(() => {});
      c = await showSurahList(screen, view === 'search');
    }
    dropSkel();
    if (id === routeId) cleanup = c;
    else c();
  } catch (e) {
    dropSkel();
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
// A launch (not a shared link) opens with a light sweep across the logo (docs/light.md, L5).
if (launch && !liteMode()) playOpening();

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
  if ('requestIdleCallback' in window) requestIdleCallback(runLater, { timeout: 1500 });
  else setTimeout(runLater, 300);
});
// Favourite reciters' downloads carry on where they stopped (Wi-Fi only), after the first screen.
setTimeout(() => void import('./data/reciterDownload').then((m) => m.keepFavourites()), 6000);
// The daily streak (Me tab): opening the app lights today's flame (not in the Kids space).
const markOpen = () => { if (!kidsOn() && !document.hidden) recordOpen(); };
markOpen();
document.addEventListener('visibilitychange', markOpen);
// Goals and badges (Me tab): checked whenever the journey changes; a new badge is announced.
later(() => void import('./ui/rewards').then((m) => m.watchRewards()));
later(() => void import('./data/nightCalm').then((m) => m.watchCalm()));
later(initUsage); // anonymous usage counts, sent once a day per key (src/usage.ts)
// Me and Learn are ready before their first tap (front-end review G12): fetched and parsed in a quiet moment
// once the first screen is up, not on Data Saver.
later(() => setTimeout(() => {
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const go = () => { void import('./ui/me').catch(() => {}); void import('./ui/learnPath').catch(() => {}); };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 }); else go();
}, 2500));
// The onboarding's language screen reloads the app in the language picked; carry on where it was.
try { if (sessionStorage.getItem('obResume')) void import('./ui/onboard').then((m) => setTimeout(() => m.openOnboarding(true), 500)); } catch { /* private */ }
watchVitals(); // real-use speed (this device only, Device check)
if (isNative()) later(() => void import('./ui/widgets').then((m) => m.initWidgets())); // streak, tasbih, prayer widgets
if (isNative()) later(() => void import('./ui/nudges').then((m) => m.initNudges())); // the evening flame reminder
setupOffline();
// Problem reports made offline go out now (src/ui/report.ts).
setTimeout(() => { try { if (localStorage.getItem('reportQueue')) void import('./ui/report').then((m) => m.flushReports()); } catch { /* ignore */ } }, 5000);
// Accounts are optional: restore a sign-in made on this device (or finish one coming back from
// Google), then keep bookmarks, settings and drafts in sync with the account.
startSync();
if (isNative()) later(() => void import('./ui/morning').then((m) => m.initDailyNative())); // widget + morning ayah (Android)
void initAuth();
later(() => void import('./ui/circles').then((m) => m.resumePendingJoin())); // an invitation opened before signing in
later(() => void import('./ui/relight').then((m) => m.resumePendingRelight())); // a friend's relight opened before signing in
// A friend relit the flame: cover the missed days (when an ask was made in the last 3 days).
later(() => void import('./cloud/auth').then(({ onAccount }) => onAccount((a) => { if (a) void import('./together/relight').then((m) => m.takeRelights()); })));
document.addEventListener('visibilitychange', () => { if (!document.hidden && !afterFirst) void import('./together/relight').then((m) => m.takeRelights()); });
// The Ramadan season: its reminders, and the teaser for a new user once their account has synced (first day only).
setTimeout(() => void import('./ui/seasonCard').then((m) => m.initSeason()), 2500);
// Ranks: the day's checked totals go to the server when they change (signed in with Google only).
later(() => void import('./together/ranks').then((m) => m.watchRanks()));
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
