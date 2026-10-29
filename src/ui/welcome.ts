// First launch: three short screens to make the app yours — the language, the reciter (hear each one
// before choosing) and the theme colours (shown live). Every step has a sensible default already
// picked, so Next / Skip always works. Shown once instead of the tour (☰ → Tour still shows that).
// Picking another language reloads the app; the welcome then continues at the reciter step.
import { LANGS, lang, setLang, t } from '../i18n';
import { DEFAULT_RECITER, TIMED_RECITERS, reciterPickerLabel } from '../data/reciters';
import { h, haptic } from './dom';
import { icon } from './icons';
import { markTourSeen, reelReciter, setReelReciter } from './prefs';
import { themeChooser } from './themePicker';
import { sampleButton, stopSample } from './voiceSample';

const RESUME = 'welcomeStep';

export function showWelcome(done?: () => void) {
  let i = 0;
  try { i = Number(sessionStorage.getItem(RESUME)) || 0; sessionStorage.removeItem(RESUME); } catch { /* ignore */ }
  const card = h('div', { class: 'tour-card welcome-card', role: 'group' });
  const overlay = h('div', { class: 'tour welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('welcome.label') }, card);
  const close = () => {
    stopSample();
    markTourSeen();
    overlay.classList.add('out');
    window.setTimeout(() => overlay.remove(), 400);
    done?.();
  };
  const go = (k: number) => { stopSample(); i = Math.max(0, Math.min(2, k)); draw(); };

  const languageStep = () => h('div', { class: 'welcome-list' }, ...LANGS.map((l) => h('button', {
    class: `welcome-option${l.id === lang() ? ' on' : ''}`, lang: l.id, dir: l.dir, 'aria-pressed': String(l.id === lang()),
    onclick: () => {
      haptic();
      if (l.id === lang()) return go(1);
      try { sessionStorage.setItem(RESUME, '1'); } catch { /* ignore */ }
      setLang(l.id); // reloads in the new language
    },
  }, h('span', { class: 'welcome-name' }, l.name), l.id === lang() ? icon('check', 20) : null)));

  const reciterStep = () => {
    const chosen = reelReciter(DEFAULT_RECITER);
    const list = h('div', { class: 'welcome-list scroll' });
    const rows = TIMED_RECITERS.filter((r) => !r.note).map((r) => {
      const row = h('button', {
        class: `welcome-option${r.id === chosen ? ' on' : ''}`, 'aria-pressed': String(r.id === chosen),
        onclick: () => {
          haptic();
          setReelReciter(r.id); // the mushaf player and new reels
          for (const el of list.children) { el.classList.toggle('on', el === row); el.setAttribute('aria-pressed', String(el === row)); }
        },
      }, h('span', { class: 'welcome-name' }, reciterPickerLabel(r)), sampleButton(r));
      return row;
    });
    list.append(...rows);
    return list;
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
