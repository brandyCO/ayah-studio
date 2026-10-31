// The first days: right after the tour, one gentle question — how much each day? — so the first
// flame can be lit on day one; then on the second and third day a small card on Me with one new
// thing to try (listen while reading, make a first reel). Each is shown once and can be dismissed.
import { allDays } from '../data/journey';
import { choosePace, goals, needsPace, PACES, type Pace } from '../data/goals';
import { t, type Key } from '../i18n';
import { h, haptic, toast } from './dom';
import { goalText } from './goalName';

const paceLine = (p: Pace) => {
  const v = PACES[p];
  const dk = Object.values(v.dhikr).reduce((a, b) => a + (b ?? 0), 0);
  return [goalText('pages', v.pages), v.memorise ? goalText('memorise', v.memorise) : '', t('pace.dhikr', { n: dk }), v.adhkar ? t('goal.adhkar') : '']
    .filter(Boolean).join(' · ');
};

/** After the tour: pick a daily pace (once; "Later" leaves it to the Me screen). */
export function openPaceSheet() {
  if (!needsPace()) return;
  const d = h('dialog', { class: 'sheet bottom pace-sheet' },
    h('div', { class: 'pace-sheet-art', 'aria-hidden': 'true' }),
    h('h2', {}, t('fs.paceTitle')),
    h('p', { class: 'muted small' }, t('fs.paceSub')),
    h('div', { class: 'pace' }, ...(['gentle', 'steady', 'devoted'] as Pace[]).map((p) => h('button', {
      class: `pace-opt${p === 'gentle' ? ' rec' : ''}`,
      onclick: () => {
        choosePace(p);
        haptic(12);
        d.close();
        toast(t('fs.paceSet', { goal: goalText('pages', goals().pages) }));
      },
    }, h('b', {}, t(`pace.${p}` as Key)), h('span', { class: 'muted small' }, paceLine(p))))),
    h('button', { class: 'chip', onclick: () => d.close() }, t('fs.later'))) as HTMLDialogElement;
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

/** Me, on the 2nd and 3rd day the app was opened: one thing to try. Null on other days or once dismissed. */
export function dayCard(): HTMLElement | null {
  const opened = Object.entries(allDays()).filter(([, r]) => r.o).length;
  if (opened !== 2 && opened !== 3) return null;
  let seen = 0;
  try { seen = Number(localStorage.getItem('dayCard') ?? 0); } catch { /* ignore */ }
  if (seen >= opened) return null;
  const dismiss = () => { try { localStorage.setItem('dayCard', String(opened)); } catch { /* ignore */ } card.remove(); };
  const two = opened === 2;
  const card = h('section', { class: 'me-card day-card' },
    h('span', { class: 'day-card-n' }, t('fs.day', { n: opened })),
    h('b', {}, t(two ? 'fs.day2Title' : 'fs.day3Title')),
    h('p', { class: 'muted small' }, t(two ? 'fs.day2Text' : 'fs.day3Text')),
    h('div', { class: 'chips' },
      h('a', { class: 'chip on', href: two ? '#/' : '#/drafts', onclick: dismiss }, t(two ? 'fs.day2Go' : 'fs.day3Go')),
      h('button', { class: 'chip', onclick: dismiss }, t('fs.notNow'))));
  return card;
}
