// The first days: right after the tour, a short conversation with the character (src/ui/onboard.ts) — what
// brings you here, how much each day — so the first flame can be lit on day one; then on the second and third day a small card on Me with one new
// thing to try (listen while reading, make a first reel). Each is shown once and can be dismissed.
import { allDays } from '../data/journey';
import { goals, PACES, setGoals, type Pace } from '../data/goals';
import { t } from '../i18n';
import { h } from './dom';
import { goalText } from './goalName';

export const paceLine = (p: Pace) => {
  const v = PACES[p];
  const dk = Object.values(v.dhikr).reduce((a, b) => a + (b ?? 0), 0);
  return [goalText('pages', v.pages), v.memorise ? goalText('memorise', v.memorise) : '', t('pace.dhikr', { n: dk }), v.adhkar ? t('goal.eAdhkar') : '']
    .filter(Boolean).join(' · ');
};

export type Why = 'read' | 'memorise' | 'understand' | 'reels' | 'dhikr';
export const WHYS: Why[] = ['read', 'memorise', 'understand', 'reels', 'dhikr'];
export const WHY_IC: Record<Why, string> = { read: 'book', memorise: 'sprout', understand: 'translation', reels: 'film', dhikr: 'beads' };

/** What the user said brought them here (synced like any setting; empty when skipped or not asked). */
export function whyHere(): Why[] {
  try {
    const v = JSON.parse(localStorage.getItem('whyHere') ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is Why => WHYS.includes(x)) : [];
  } catch { return []; }
}

/** The goals a pace sets, leaned towards what the user came for (never lower than the pace). */
export function tailor(why: Why[]) {
  if (!why.length) return;
  const g = goals();
  if (why.includes('memorise')) { g.memorise = Math.max(g.memorise, 1); g.lessons = Math.max(g.lessons, 1); }
  if (why.includes('reels')) g.weekly.reels = Math.max(g.weekly.reels, 1);
  if (why.includes('dhikr')) { g.adhkar = true; g.duas = Math.max(g.duas, 3); }
  setGoals(g);
}

/** Keeps the answers to "What brings you here?" (an empty list = asked and skipped). */
export function saveWhy(why: Why[]) {
  try { localStorage.setItem('whyHere', JSON.stringify(why)); } catch { /* private */ }
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
