// Me → Today: one line saying what is next, with one button — the journey's portion for today (or, with
// no journey, one quiet "Start a journey" line) — and the journey picker (Khatm in 30 days, Juz 'Amma in 30
// days, Khatm in 6 months). Fewer choices, more reading.
import { currentPlan, journeyState, JOURNEYS, startJourney, type JourneyId } from '../data/journeys';
import { loadMushaf, type Mushaf } from '../data/mushaf';
import { t, type Key } from '../i18n';
import { h, haptic, listenWhile, toast } from './dom';
import { goMushaf } from './tabs';

export function todayCard(): HTMLElement {
  const box = h('section', { class: 'me-card today-card' });
  let m: Mushaf | null = null;
  const paint = () => {
    if (!box.isConnected && m) { window.removeEventListener('journey-changed', paint); return; }
    if (!m) return;
    const s = journeyState(m);
    const rows: Node[] = [];
    if (s && !s.done) {
      rows.push(
        h('div', { class: 'tc-head' }, h('b', {}, t(`jr.${s.id}` as Key)), h('span', { class: 'muted small' }, t('jr.dayOf', { day: Math.min(s.day, s.days), n: s.days }))),
        h('div', { class: 'tc-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.total), 'aria-valuenow': String(s.read) },
          h('span', { style: `--w:${(s.read / s.total).toFixed(4)}` })),
        h('div', { class: 'tc-row' },
          h('span', {}, s.today ? t(s.today === 1 ? 'jr.today1' : 'jr.today', { n: s.today }) : t('jr.todayDone'),
            h('span', { class: 'muted small' }, ` · ${t('jr.pages', { read: s.read, total: s.total })}`)),
          s.next ? h('button', { class: 'primary brand-btn', onclick: () => goMushaf(`page:${s.next!}`) }, t('jr.open')) : ''));
    } else if (s?.done) {
      rows.push(h('div', { class: 'tc-done' },
        h('b', {}, t('jr.complete', { name: t(`jr.${s.id}` as Key) })),
        h('p', { class: 'muted small' }, t('jr.completeSub', { n: s.total })),
        h('button', { class: 'chip', onclick: openPicker }, t('jr.another'))));
    } else {
      // F5: no journey: one quiet line (the Read tab already continues reading, Friday's Al-Kahf is in the goals).
      box.classList.add('tc-slim');
      box.replaceChildren(h('button', { class: 'tc-start', onclick: openPicker }, h('b', {}, t('jr.start')), h('span', { 'aria-hidden': 'true' }, '›')));
      return;
    }
    box.classList.remove('tc-slim');
    if (s && !s.done) rows.push(h('button', { class: 'tc-change muted small', onclick: openPicker }, t('jr.change')));
    box.replaceChildren(h('h2', { class: 'me-h' }, t('jr.title')), ...rows);
  };
  void loadMushaf().then((x) => { m = x; paint(); });
  listenWhile(box, window, 'journey-changed', paint);
  return box;
}

export function openPicker() {
  const cur = currentPlan()?.id;
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('jr.pick')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', { class: 'muted small' }, t('jr.pickSub')),
    h('div', { class: 'pace' }, ...JOURNEYS.map((j) => h('button', {
      class: `pace-opt${j.id === cur ? ' rec' : ''}`,
      onclick: () => { startJourney(j.id as JourneyId); haptic(12); d.close(); toast(t('jr.started', { name: t(`jr.${j.id}` as Key) })); },
    }, h('b', {}, t(`jr.${j.id}` as Key)), h('span', { class: 'muted small' }, t(`jr.${j.id}Sub` as Key))))),
    cur ? h('button', { class: 'chip', onclick: () => { startJourney(null); d.close(); } }, t('jr.stop')) : '') as HTMLDialogElement;
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
