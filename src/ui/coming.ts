// What's coming (owner request 2026-11-24, "a timeline of what's to be unlocked … part of the onboarding"): the first
// week as a path, one stop a day — the flame, listening along, the Light shop (day 3), the room (4), the wardrobe (5),
// seven days in a row (the flame catches fire, the first streak badge) and level 5 (a new app icon). Passed stops are
// lit, today's has the user's own character beside it, the rest wait in grey with "Tomorrow" / "In n days". Shown in
// the onboarding, on Me while anything is ahead, from Settings any time, and as a pop-up only the day before an unlock
// (owner: not every day; the unlock days have their own moment, which names tomorrow's).
import './coming.css';
import { streak } from '../data/journey';
import { daysOpened, type Reveal } from '../data/reveal';
import { levelOf, myXp } from '../data/xp';
import { fe, type FrontKey } from '../i18n/front';
import { myFigureCode } from './actor';
import { h, haptic } from './dom';
import { bustMarkup, parse } from './figure';
import { flame } from './flame';
import { icon } from './icons';
import { reduced, rise, stagger } from './juice';
import { miniArt } from './unlock';

type Id = 'flame' | 'listen' | 'shop' | 'room' | 'wardrobe' | 'fire' | 'icon';
interface Step { id: Id; day?: number; reached: boolean; today: boolean; left?: number; progress?: string }
const ICON: Partial<Record<Id, string>> = { listen: 'listen', icon: 'star' };
const REVEAL: Id[] = ['shop', 'room', 'wardrobe'];

export function steps(): Step[] {
  const n = Math.max(1, daysOpened());
  const st = streak();
  const lv = levelOf(myXp());
  const byDay = (id: Id, day: number): Step => ({ id, day, reached: n >= day, today: n === day, left: day - n });
  return [
    byDay('flame', 1), byDay('listen', 2), byDay('shop', 3), byDay('room', 4), byDay('wardrobe', 5),
    { id: 'fire', day: 7, reached: st.best >= 7, today: false, progress: fe('co.fireLeft', { n: Math.min(7, st.days) }) },
    { id: 'icon', reached: lv >= 5, today: false, progress: fe('co.level', { n: Math.min(5, lv) }) },
  ];
}
/** Something still to look forward to in the first week (Me keeps its card while true). */
export const ahead = () => daysOpened() <= 8 && steps().some((s) => !s.reached && s.id !== 'icon');
/** What comes tomorrow, if anything (the unlock moment's card and the day-before pop-up name it). */
export function tomorrow(): Step | null {
  return steps().find((s) => !s.reached && (s.left === 1 || (s.id === 'fire' && streak().days === 6 && !streak().litToday))) ?? null;
}
export const stepTitle = (id: Id) => fe(`co.${id}` as FrontKey);

function art(s: Step): HTMLElement {
  const box = h('span', { class: 'co-art', 'aria-hidden': 'true' });
  if (REVEAL.includes(s.id)) box.append(miniArt(s.id as Reveal));
  else if (s.id === 'flame' || s.id === 'fire') box.append(flame(s.id === 'fire' ? 3 : 1, 44, true));
  else box.append(icon(ICON[s.id] ?? 'star', 26));
  if (!s.reached) box.append(h('span', { class: 'co-lock' }, icon('lock', 14)));
  return box;
}
function when(s: Step): string {
  if (s.reached) return s.today ? fe('co.today') : '';
  if (s.left !== undefined && s.left > 0) return s.left === 1 ? fe('co.tomorrow') : fe('co.inDays', { n: s.left });
  return s.progress ?? '';
}

/** The path itself (the sheet and the onboarding both use it). */
export function comingPath(compact = false): HTMLElement {
  const list = steps();
  const code = myFigureCode();
  const f = code ? parse(code) : null;
  const here = list.findIndex((s) => s.today) >= 0 ? list.findIndex((s) => s.today) : list.findIndex((s) => !s.reached);
  const items = list.map((s, i) => {
    const state = s.today ? 'today' : s.reached ? 'done' : i === here ? 'next' : 'later';
    const tag = s.day ? fe('co.day', { n: s.day }) : fe('co.anytime');
    const li = h('li', { class: `co-step s-${state} k-${s.id}` },
      h('span', { class: 'co-node' }, art(s), s.reached && !s.today ? h('span', { class: 'co-tick' }, icon('check', 12)) : ''),
      h('span', { class: 'co-txt' },
        h('small', { class: 'co-tag' }, tag),
        h('b', {}, stepTitle(s.id)),
        compact ? '' : h('span', { class: 'co-sub' }, fe(`co.${s.id}Text` as FrontKey))),
      h('span', { class: 'co-when' }, when(s)));
    if (i === here && f) {
      const me = h('span', { class: 'co-me', 'aria-hidden': 'true' });
      me.innerHTML = `<svg viewBox="1 1 38 38">${bustMarkup(f, 18)}</svg>`;
      li.append(me);
    }
    return li;
  });
  const ol = h('ol', { class: `co-path${compact ? ' compact' : ''}` }, ...items);
  if (!reduced()) requestAnimationFrame(() => stagger(items, (el, delay) => rise(el, 18, { delay, feel: 'bouncy' }), 60, 80));
  return ol;
}

/** The full sheet. `teaser`: the step to name at the top ("Tomorrow: your room"). */
export function openComing(teaser: Step | null = null) {
  if (document.querySelector('dialog.co')) return;
  const done = () => { haptic(8); d.close(); };
  const d = h('dialog', { class: 'co', 'aria-label': fe('co.title') },
    h('header', { class: 'co-head' },
      h('button', { class: 'icon-btn co-x', 'aria-label': fe('co.close'), onclick: done }, icon('close', 22)),
      teaser ? h('p', { class: 'co-kicker' }, fe('co.tomorrowIs', { what: stepTitle(teaser.id) })) : '',
      h('h2', {}, fe('co.title')),
      h('p', { class: 'muted' }, fe('co.sub'))),
    comingPath(),
    h('footer', { class: 'co-foot' }, h('button', { class: 'primary brand-btn', onclick: done }, fe('co.close')))) as HTMLDialogElement;
  d.addEventListener('close', () => d.remove());
  window.addEventListener('hashchange', () => d.open && d.close(), { once: true });
  document.body.append(d);
  d.showModal();
}

/** The pop-up, once, on the day before an unlock (not on a day that has its own unlock moment). */
export function comingPopup(newReveal: boolean) {
  if (newReveal) return;
  const t = tomorrow();
  if (!t) return;
  const day = new Date().toDateString();
  try { if (localStorage.getItem('comingShown') === day) return; localStorage.setItem('comingShown', day); } catch { return; }
  if (document.querySelector('dialog[open], .cel')) return;
  openComing(t);
}

/** Me's small card while anything is ahead: the next stop and when. */
export function comingCard(): HTMLElement | '' {
  if (!ahead()) return '';
  const next = steps().find((s) => !s.reached && s.id !== 'icon');
  if (!next) return '';
  return h('button', { class: 'me-card co-card', onclick: () => openComing() },
    h('span', { class: 'co-card-art' }, art(next)),
    h('span', { class: 'co-card-txt' }, h('small', {}, fe('co.title')), h('b', {}, fe('co.next', { what: stepTitle(next.id), when: when(next) }))),
    icon('right', 18));
}
