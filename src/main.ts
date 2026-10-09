// Entry: hash router for the three Phase 0 screens.
//   #/                 surah list (the app itself opens on the mushaf: where the user left off, or Al-Fatiha)
//   #/s/2[/255]        reading view — mushaf page or translation cards (optionally at an ayah)
//   #/reel/2/255-257[/draft]   editor for a selection (optionally a saved draft)
//   #/drafts           saved reel drafts
//   #/join/CODE        an invitation to a Khatm circle
//   #/ramadan          today's Ramadan portion (from a reminder)
//   #/gift/ID          a gift: a few ayat in the sender's reel look (opens without an account)
//   #/w/CODE           a guest adds their ayah to a dua & ayah wall (from the QR code)
//   #/wall/ID[/reel[/N]]  the host's wall screen / its keepsake reel (from entry N)
import './styles.css';
import { capabilities } from './engine/capabilities';
import { h } from './ui/dom';
import { showMushaf } from './ui/mushaf';
import { lastRead, readerMode, setLastRead } from './ui/prefs';
import { showReader } from './ui/reader';
import { initAuth } from './cloud/auth';
import { startSync } from './cloud/sync';
import { setupOffline } from './offline';
import { initI18n, t } from './i18n';
import { showSurahList } from './ui/surahList';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let routeId = 0;

async function route() {
  const id = ++routeId;
  cleanup?.();
  cleanup = null;
  const [view, a, b, c4] = location.hash.replace(/^#\/?/, '').split('/');
  const screen = h('div', { class: `screen screen-${view || 'home'}` });
  app.replaceChildren(screen);
  document.body.dataset.view = view || 'home';
  window.scrollTo(0, 0);
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
    } else if (view === 'gift' && a) {
      const { showGift } = await import('./ui/gift');
      c = await showGift(screen, a);
    } else if (view === 'w' && a) {
      const { showWallJoin } = await import('./ui/wall');
      c = await showWallJoin(screen, a);
    } else if (view === 'wall' && a) {
      const m = await import('./ui/wall');
      c = b === 'reel' ? await m.showKeepsake(screen, a, Math.max(0, Math.floor(Number(c4) || 0))) : await m.showWallHost(screen, a);
    } else if (view === 'ramadan') {
      // A Ramadan reminder was tapped: the mushaf on the next page of today's portion.
      const { ramadanTarget } = await import('./ui/ramadan');
      history.replaceState(null, '', await ramadanTarget());
      return void route();
    } else if (view === 'drafts') {
      const { showDrafts } = await import('./ui/drafts');
      c = await showDrafts(screen);
    } else c = await showSurahList(screen);
    if (id === routeId) cleanup = c;
    else c();
  } catch (e) {
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
if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', lastRead());

window.addEventListener('hashchange', route);
void initI18n().then(route);
void capabilities(); // warm up the device check
setupOffline();
// Accounts are optional: restore a sign-in made on this device (or finish one coming back from
// Google), then keep bookmarks, settings and drafts in sync with the account.
startSync();
void initAuth();
void import('./ui/circles').then((m) => m.resumePendingJoin()); // an invitation opened before signing in
try {
  if (sessionStorage.getItem('pendingWall')) void import('./ui/wall').then((m) => m.resumePendingWall()); // a wall entry before signing in
} catch {
  /* ignore */
}
