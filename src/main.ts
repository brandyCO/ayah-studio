// Entry: hash router for the three Phase 0 screens.
//   #/                 surah list (the app itself opens on the mushaf: where the user left off, or Al-Fatiha)
//   #/s/2[/255]        reading view — mushaf page or translation cards (optionally at an ayah)
//   #/reel/2/255-257[/draft]   editor for a selection (optionally a saved draft)
//   #/drafts           saved reel drafts
import './styles.css';
import { capabilities } from './engine/capabilities';
import { h } from './ui/dom';
import { showMushaf } from './ui/mushaf';
import { lastRead, readerMode, setLastRead } from './ui/prefs';
import { showReader } from './ui/reader';
import { setupOffline } from './offline';
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
      h('h2', {}, 'Something went wrong'),
      h('p', {}, e instanceof Error ? e.message : String(e)),
      h('div', { class: 'row center' },
        h('button', { class: 'primary', onclick: () => location.reload() }, 'Reload'),
        h('a', { href: '#/', class: 'chip' }, 'Back to surahs'))));
  }
}

// Opening the app (no address of its own) goes straight to the mushaf: where the user left off,
// or Al-Fatiha the first time. The surah list stays one tap away ('‹' or ☰ → All surahs).
if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', lastRead());

window.addEventListener('hashchange', route);
void route();
void capabilities(); // warm up the device check
setupOffline();
