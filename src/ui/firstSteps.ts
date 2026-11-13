// The first days: right after the tour, one gentle question — how much each day? — so the first
// flame can be lit on day one; then on the second and third day a small card on Me with one new
// thing to try (listen while reading, make a first reel). Each is shown once and can be dismissed.
import { allDays } from '../data/journey';
import { choosePace, goals, needsPace, PACES, setGoals, type Pace } from '../data/goals';
import { fe, type FrontKey } from '../i18n/front';
import { t, type Key } from '../i18n';
import { h, haptic, toast } from './dom';
import { goalText } from './goalName';
import { icon } from './icons';

const paceLine = (p: Pace) => {
  const v = PACES[p];
  const dk = Object.values(v.dhikr).reduce((a, b) => a + (b ?? 0), 0);
  return [goalText('pages', v.pages), v.memorise ? goalText('memorise', v.memorise) : '', t('pace.dhikr', { n: dk }), v.adhkar ? t('goal.eAdhkar') : '']
    .filter(Boolean).join(' · ');
};

export type Why = 'read' | 'memorise' | 'understand' | 'reels' | 'dhikr';
const WHYS: Why[] = ['read', 'memorise', 'understand', 'reels', 'dhikr'];
const WHY_IC: Record<Why, string> = { read: 'book', memorise: 'sprout', understand: 'translation', reels: 'film', dhikr: 'beads' };

/** What the user said brought them here (synced like any setting; empty when skipped or not asked). */
export function whyHere(): Why[] {
  try {
    const v = JSON.parse(localStorage.getItem('whyHere') ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is Why => WHYS.includes(x)) : [];
  } catch { return []; }
}

/** The goals a pace sets, leaned towards what the user came for (never lower than the pace). */
function tailor(why: Why[]) {
  if (!why.length) return;
  const g = goals();
  if (why.includes('memorise')) { g.memorise = Math.max(g.memorise, 1); g.lessons = Math.max(g.lessons, 1); }
  if (why.includes('reels')) g.weekly.reels = Math.max(g.weekly.reels, 1);
  if (why.includes('dhikr')) { g.adhkar = true; g.duas = Math.max(g.duas, 3); }
  setGoals(g);
}

/** After the tour, once: what brings you here? Then the daily pace. */
export function openWhySheet() {
  let asked = false;
  try { asked = localStorage.getItem('whyHere') !== null; } catch { /* private */ }
  if (asked || !needsPace()) { openPaceSheet(); return; }
  const picked = new Set<Why>();
  const go = h('button', { class: 'primary brand-btn why-go', disabled: true }, fe('why.go'));
  const save = () => { try { localStorage.setItem('whyHere', JSON.stringify([...picked])); } catch { /* private */ } };
  const opts = WHYS.map((w) => {
    const b = h('button', { class: 'why-opt', 'aria-pressed': 'false', onclick: () => {
      if (picked.has(w)) picked.delete(w); else picked.add(w);
      b.setAttribute('aria-pressed', String(picked.has(w)));
      b.classList.toggle('on', picked.has(w));
      go.disabled = !picked.size;
      haptic(8);
    } },
    h('span', { class: `why-ic w-${w}`, 'aria-hidden': 'true' }, icon(WHY_IC[w], 22)),
    h('span', { class: 'why-txt' }, h('b', {}, fe(`why.${w}` as FrontKey)), h('span', { class: 'muted small' }, fe(`why.${w}Sub` as FrontKey))),
    h('span', { class: 'why-tick', 'aria-hidden': 'true' }));
    return b;
  });
  const d = h('dialog', { class: 'sheet bottom why-sheet' },
    h('h2', {}, fe('why.title')),
    h('p', { class: 'muted small' }, fe('why.sub')),
    h('div', { class: 'why-list' }, ...opts),
    go,
    h('button', { class: 'chip why-skip', onclick: () => { save(); d.close(); } }, fe('why.skip'))) as HTMLDialogElement;
  go.onclick = () => { save(); haptic(12); d.close(); };
  d.addEventListener('close', () => { d.remove(); setTimeout(openPaceSheet, 300); });
  document.body.append(d);
  d.showModal();
}

/** After the tour: pick a daily pace (once; "Later" leaves it to the Me screen). */
export function openPaceSheet() {
  if (!needsPace()) return;
  const why = whyHere();
  // Someone here to memorise is offered the steady pace (it has a daily ayah to memorise); everyone else gentle.
  const rec: Pace = why.includes('memorise') ? 'steady' : 'gentle';
  const d = h('dialog', { class: 'sheet bottom pace-sheet' },
    h('div', { class: 'pace-sheet-art', 'aria-hidden': 'true' }),
    h('h2', {}, t('fs.paceTitle')),
    h('p', { class: 'muted small' }, t('fs.paceSub')),
    h('div', { class: 'pace' }, ...(['gentle', 'steady', 'devoted'] as Pace[]).map((p) => h('button', {
      class: `pace-opt${p === rec ? ' rec' : ''}`,
      onclick: () => {
        choosePace(p);
        tailor(why);
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
