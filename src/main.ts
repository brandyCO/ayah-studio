// Entry: hash router for the three Phase 0 screens.
//   #/                 surah list
//   #/s/2[/255]        reading view — mushaf page or translation cards (optionally at an ayah)
//   #/reel/2/255-257   editor for a selection
import './styles.css';
import { capabilities } from './engine/capabilities';
import { h } from './ui/dom';
import { showMushaf } from './ui/mushaf';
import { readerMode } from './ui/prefs';
import { showReader } from './ui/reader';
import { showSurahList } from './ui/surahList';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let routeId = 0;

async function route() {
  const id = ++routeId;
  cleanup?.();
  cleanup = null;
  const [view, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  const screen = h('div', { class: `screen screen-${view || 'home'}` });
  app.replaceChildren(screen);
  document.body.dataset.view = view || 'home';
  window.scrollTo(0, 0);
  try {
    let c: () => void;
    if (view === 's' && Number(a)) {
      const show = readerMode() === 'mushaf' ? showMushaf : showReader;
      c = await show(screen, Number(a), Number(b) || undefined);
    } else if (view === 'reel' && Number(a) && b) {
      const [from, to] = b.split('-').map(Number);
      // The editor pulls in the video engine (Mediabunny); load it only when needed.
      const { showEditor } = await import('./ui/editor');
      c = await showEditor(screen, Number(a), from, to || from);
    } else c = await showSurahList(screen);
    if (id === routeId) cleanup = c;
    else c();
  } catch (e) {
    if (id !== routeId) return;
    console.error(e);
    screen.replaceChildren(h('div', { class: 'error' },
      h('h2', {}, 'Something went wrong'),
      h('p', {}, e instanceof Error ? e.message : String(e)),
      h('a', { href: '#/', class: 'primary' }, 'Back to surahs')));
  }
}

window.addEventListener('hashchange', route);
void route();
void capabilities(); // warm up the device check
