// First launch (front-end review F1, 2026-11-13): no questions before the first ayah. The language comes
// from the phone (Me → Settings → Language changes it) and the colours wait in Me → Settings. The reciter is
// asked the first time something is played (`askReciterFirst()`): the full list, hear each one, then Listen.
// `showWelcome()` (the old three steps) stays for Me → Settings → Tour.
import { mark } from '../usage';
import { lang, setLang, t } from '../i18n';
import { LANGS } from '../i18n/langs';
import { DEFAULT_RECITER, RECITERS, groupRecordings, reciterPickerLabel, type Reciter } from '../data/reciters';
import { recordingChips, reciterSearchBox } from './recordings';
import { h, haptic } from './dom';
import { icon } from './icons';
import { markTourSeen, reelReciter, setReelReciter } from './prefs';
import { themeChooser } from './themePicker';
import { sampleButton, stopSample } from './voiceSample';

const RESUME = 'welcomeStep';

export function showWelcome(done?: () => void) {
  // Already showing (the reader was left and opened again before answering): never stack a second one.
  if (document.querySelector('.tour.welcome:not(.out)')) return;
  let i = 0;
  try { i = Number(sessionStorage.getItem(RESUME)) || 0; sessionStorage.removeItem(RESUME); } catch { /* ignore */ }
  const card = h('div', { class: 'tour-card welcome-card', role: 'group' });
  const overlay = h('div', { class: 'tour welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('welcome.label') }, card);
  const close = () => {
    stopSample();
    markTourSeen();
    mark('ev:welcome-done');
    overlay.classList.add('out');
    window.setTimeout(() => overlay.remove(), 400);
    done?.();
  };
  const go = (k: number) => { stopSample(); i = Math.max(0, Math.min(2, k)); mark(`ev:welcome-${i}`); draw(); };

  const languageStep = () => h('div', { class: 'welcome-list scroll' }, ...LANGS.map((l) => h('button', {
    class: `welcome-option${l.id === lang() ? ' on' : ''}`, lang: l.id, dir: l.dir, 'aria-pressed': String(l.id === lang()),
    onclick: () => {
      haptic();
      if (l.id === lang()) return go(1);
      try { sessionStorage.setItem(RESUME, '1'); } catch { /* ignore */ }
      setLang(l.id); // reloads in the new language
    },
  }, h('span', { class: 'welcome-name' }, l.name, l.id === 'en' ? '' : h('small', { class: 'muted', lang: 'en', dir: 'ltr' }, ` · ${l.en}`)),
  l.id === lang() ? icon('check', 20) : null)));

  // The same full list as the player's reciter picker: one row per reciter, his recordings as chips
  // under the name, a search box on top.
  const reciterStep = () => {
    let chosen = reelReciter(DEFAULT_RECITER);
    const list = h('div', { class: 'welcome-list scroll' });
    const paint = () => list.replaceChildren(...groupRecordings(RECITERS).map((g) => {
      const r = g.find((x) => x.id === chosen) ?? g[0];
      const on = g.some((x) => x.id === chosen);
      const pick = (x: Reciter) => { haptic(); chosen = x.id; setReelReciter(x.id); paint(); }; // the mushaf player and new reels
      return h('div', { class: 'rec-group' },
        h('button', { class: `welcome-option${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => pick(r) },
          h('span', { class: 'welcome-name' }, g.length > 1 ? r.name : reciterPickerLabel(r)), sampleButton(r)),
        recordingChips(g, chosen, pick));
    }));
    paint();
    const search = reciterSearchBox(list, t('ed.reciter-search'));
    search.classList.add('welcome-search');
    // Rows are rebuilt on a pick: keep the search's filter on them.
    new MutationObserver(() => search.dispatchEvent(new Event('input'))).observe(list, { childList: true });
    return h('div', { class: 'welcome-reciters' }, search, list);
  };

  function draw() {
    const steps = [
      { title: t('welcome.lang'), text: t('welcome.langText'), body: languageStep },
      { title: t('welcome.reciter'), text: t('welcome.reciterText'), body: reciterStep },
      { title: t('welcome.theme'), text: t('welcome.themeText'), body: () => h('div', { class: 'welcome-theme' }, ...themeChooser(true)) },
    ];
    const s = steps[i];
    const last = i === steps.length - 1;
    card.replaceChildren(
      h('div', { class: 'tour-step welcome-step' }, h('h2', {}, s.title), h('p', {}, s.text), s.body()),
      h('div', { class: 'tour-dots', 'aria-hidden': 'true' }, ...steps.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
      h('div', { class: 'tour-buttons' },
        i > 0 ? h('button', { class: 'chip', onclick: () => go(i - 1) }, t('common.back')) : h('button', { class: 'chip', onclick: close }, t('tour.skip')),
        last ? h('button', { class: 'primary brand-btn', onclick: close }, t('tour.start'))
          : h('button', { class: 'primary', onclick: () => go(i + 1) }, t('tour.next'))));
  }
  document.body.append(overlay);
  draw();
}

/** The first time anything is played: pick a voice (the default is already picked), then it plays.
 *  Asked once per device; someone who already chose a reciter (or synced one) is never asked. */
export function askReciterFirst(play: () => void) {
  let asked = false;
  try { asked = !!localStorage.getItem('reciterAsked') || !!localStorage.getItem('reelReciter'); } catch { asked = true; }
  if (asked) return play();
  try { localStorage.setItem('reciterAsked', '1'); } catch { /* ignore */ }
  let chosen = reelReciter(DEFAULT_RECITER);
  const list = h('div', { class: 'welcome-list scroll' });
  const paint = () => list.replaceChildren(...groupRecordings(RECITERS).map((g) => {
    const r = g.find((x) => x.id === chosen) ?? g[0];
    const on = g.some((x) => x.id === chosen);
    const pick = (x: Reciter) => { haptic(); chosen = x.id; paint(); };
    return h('div', { class: 'rec-group' },
      h('button', { class: `welcome-option${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => pick(r) },
        h('span', { class: 'welcome-name' }, g.length > 1 ? r.name : reciterPickerLabel(r)), sampleButton(r)),
      recordingChips(g, chosen, pick));
  }));
  paint();
  const search = reciterSearchBox(list, t('ed.reciter-search'));
  search.classList.add('welcome-search');
  new MutationObserver(() => search.dispatchEvent(new Event('input'))).observe(list, { childList: true });
  const card = h('div', { class: 'tour-card welcome-card', role: 'group' });
  const overlay = h('div', { class: 'tour welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('welcome.reciter') }, card);
  const finish = (go: boolean) => {
    stopSample();
    setReelReciter(chosen); // the mushaf player and new reels
    overlay.classList.add('out');
    window.setTimeout(() => overlay.remove(), 400);
    if (go) play();
  };
  card.append(
    h('div', { class: 'tour-step welcome-step' }, h('h2', {}, t('welcome.reciter')), h('p', {}, t('welcome.reciterText')),
      h('div', { class: 'welcome-reciters' }, search, list)),
    h('div', { class: 'tour-buttons' },
      h('button', { class: 'chip', onclick: () => finish(false) }, t('common.close')),
      h('button', { class: 'primary brand-btn', onclick: () => finish(true) }, icon('play', 18), ' ', t('welcome.listen'))));
  document.body.append(overlay);
}
