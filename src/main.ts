// Entry: hash router for the three Phase 0 screens.
//   #/                 surah list (the app itself opens on the mushaf: where the user left off, or Al-Fatiha)
//   #/search           the same list with the search box focused (surah, 2:255, juz 5, page 50, words)
//   #/s/2[/255]        reading view — mushaf page or translation cards (optionally at an ayah)
//   #/reel/2/255-257[/draft]   editor for a selection (optionally a saved draft)
//   #/drafts           saved reel drafts
//   #/me               Me: streak flame, stats, reading time, settings
//   #/join/CODE        an invitation to a Khatm circle
//   #/ramadan          today's Ramadan portion (from a reminder)
//   #/kids[/N]         the Kids space (docs/kids.md): while it is on, every other address leads here
import './styles.css';
import { h, skeleton } from './ui/dom';
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
import { showSurahList } from './ui/surahList';
import { clearPass, kidsOn, usePass } from './data/kids';
import { recordOpen } from './data/journey';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let routeId = 0;

async function route() {
  const id = ++routeId;
  cleanup?.();
  cleanup = null;
  const [view, a, b, c4] = location.hash.replace(/^#\/?/, '').split('/');
  // The Kids space is on: only its own screens (and a page the parent opened through the gate).
  if (kidsOn() && view !== 'kids' && !usePass(location.hash)) {
    history.replaceState(null, '', '#/kids');
    return void route();
  }
  if (view === 'kids') clearPass();
  const screen = h('div', { class: `screen screen-${view || 'home'}` });
  app.replaceChildren(screen);
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
      // The editor pulls in the video engine (Mediabunny); load it only when needed.
      const { showEditor } = await import('./ui/editor');
      c = await showEditor(screen, Number(a), from, to || from, c4 || undefined);
    } else if (view === 'join' && a) {
      const { showJoin } = await import('./ui/circles');
      c = await showJoin(screen, a);
    } else if (view === 'ramadan') {
      // A Ramadan reminder was tapped: the mushaf on the next page of today's portion.
      const { ramadanTarget } = await import('./ui/ramadan');
      history.replaceState(null, '', await ramadanTarget());
      return void route();
    } else if (view === 'kids') {
      if (Number(a)) {
        const { showKidsSurah } = await import('./ui/kidsListen');
        c = await showKidsSurah(screen, Number(a));
      } else {
        const { showKids } = await import('./ui/kids');
        c = await showKids(screen);
      }
    } else if (view === 'me') {
      const { showMe } = await import('./ui/me');
      c = await showMe(screen);
    } else if (view === 'drafts') {
      const { showDrafts } = await import('./ui/drafts');
      c = await showDrafts(screen);
    } else c = await showSurahList(screen, view === 'search');
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
initErrors(); // crash reports, only when a Sentry DSN is set (src/errors.ts)
window.addEventListener('prefs-synced', () => applyTheme()); // picked on another device
if (kidsOn()) { if (!location.hash.startsWith('#/kids')) history.replaceState(null, '', '#/kids'); }
else if (launch) history.replaceState(null, '', lastRead());
// A launch (not a shared link) opens with a light sweep across the logo (docs/light.md, L5).
if (launch && !liteMode()) playOpening();

window.addEventListener('hashchange', route);
void initI18n().then(route);
// The daily streak (Me tab): opening the app lights today's flame (not in the Kids space).
const lightToday = () => { if (!kidsOn() && !document.hidden) recordOpen(); };
lightToday();
document.addEventListener('visibilitychange', lightToday);
// Goals and badges (Me tab): checked whenever the journey changes; a new badge is announced.
void import('./ui/rewards').then((m) => m.watchRewards());
if (isNative()) void import('./ui/widgets').then((m) => m.initWidgets()); // streak, tasbih, prayer widgets
setupOffline();
// Accounts are optional: restore a sign-in made on this device (or finish one coming back from
// Google), then keep bookmarks, settings and drafts in sync with the account.
startSync();
if (isNative()) void import('./ui/morning').then((m) => m.initDailyNative()); // widget + morning ayah (Android)
void initAuth();
void import('./ui/circles').then((m) => m.resumePendingJoin()); // an invitation opened before signing in
// The ayah wall was removed (owner, 2026-10-11): drop a guest entry left waiting from before.
try { sessionStorage.removeItem('pendingWall'); } catch { /* ignore */ }
