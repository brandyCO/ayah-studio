// Small moments while reading, never over the Arabic: when a page counts (after its reading time) a
// line of light runs along the bottom edge of the page, right to left, and the pages goal shows its new
// count for a moment; when the page finished a surah (every page of it read) or a juz, a calm card rises
// from the bottom: the surah's name, its ayat, Continue. Tapping anywhere else lets it go.
import type { SurahMeta } from '../data/quran';
import { todayGoals } from '../data/goals';
import { surahName, t } from '../i18n';
import { mt } from '../i18n/moments';
import { h, haptic } from './dom';
import { bustMarkup, parse } from './figure';
import { actor, myFigureCode } from './actor';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Pg = { lines: unknown[][] };
const surahsOn = (pg: Pg) => (pg.lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as [number, number, string][]).map((g) => g[0]);
/** Pages from this one to the end of the surah it carries on into (the page's last surah). */
export function surahLeft(mushaf: { pages: Pg[] }, meta: SurahMeta[], p: number): { n: number; name: string } | undefined {
  const s = surahsOn(mushaf.pages[p - 1]).pop();
  if (!s) return undefined;
  let end = p;
  while (end < mushaf.pages.length && surahsOn(mushaf.pages[end]).includes(s)) end++;
  return end > p ? { n: end - p, name: surahName(meta[s - 1]) } : undefined;
}

/** The page just counted: a sweep of light along the bottom edge + the pages goal for a moment. */
export function pageCounted(area: HTMLElement, left?: { n: number; name: string }) {
  area.querySelector('.page-light')?.remove();
  const g = todayGoals().find((x) => x.kind === 'pages');
  // The user's character reads along: a small bust holding the mushaf at the start of the pill.
  const code = myFigureCode();
  const f = parse(code);
  const bust = f ? h('span', { class: 'page-light-me' }) : '';
  if (bust && f) { f.hold = 2; bust.innerHTML = `<svg viewBox="1 1 38 38" width="22" height="22">${bustMarkup(f, 18)}</svg>`; }
  const pill = g ? h('span', { class: `page-light-pill${g.done >= g.target ? ' met' : ''}` }, bust,
    g.done >= g.target ? `✓ ${t('pm.pagesMet', { n: g.target })}` : t('pm.pages', { done: g.done, n: g.target })) : '';
  // Honest progress (owner request 2026-11-12): how far to the end of the surah being read.
  const rest = left && left.n > 0 ? h('span', { class: 'page-light-pill' }, mt(left.n === 1 ? 'mt.pm.left1' : 'mt.pm.left', { n: left.n, name: left.name })) : '';
  const el = h('div', { class: 'page-light', 'aria-hidden': 'true' }, h('span', { class: 'page-light-line' }), pill, rest);
  area.append(el);
  haptic(6);
  setTimeout(() => el.remove(), still() ? 2400 : 3200);
}

/** A surah (or a juz) finished on this page. */
export function finished(surahs: SurahMeta[], juz: number[]) {
  if (!surahs.length && !juz.length) return;
  document.querySelector('.done-card')?.remove();
  const s = surahs[surahs.length - 1];
  const close = () => {
    card.classList.remove('show');
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('hashchange', close);
    setTimeout(() => card.remove(), 450);
  };
  const outside = (e: Event) => { if (!card.contains(e.target as Node)) close(); };
  const card = h('section', { class: 'done-card', role: 'status' },
    h('span', { class: 'done-glow', 'aria-hidden': 'true' }),
    s ? h('p', { class: 'done-ar', lang: 'ar', dir: 'rtl' }, s.ar) : '',
    h('h2', {}, s ? t('pm.surahDone', { name: surahName(s) }) : t('pm.juzDone', { n: juz[0] })),
    h('p', { class: 'muted small' }, s
      ? [t('pm.ayat', { n: s.ayahs }), juz.length ? t('pm.andJuz', { n: juz[0] }) : ''].filter(Boolean).join(' · ')
      : t('pm.juzSub')),
    h('div', { class: 'done-row' },
      h('a', { class: 'chip', href: '#/me', onclick: close }, t('pm.seeMe')),
      h('button', { class: 'primary brand-btn', onclick: close }, t('pm.continue'))));
  // The character joins in: it pops up in the card's corner and cheers (round 3, big milestones).
  const me = actor('done-actor');
  if (me) { card.prepend(me.el); setTimeout(() => me.cheer(juz.length ? 2600 : 2000), 520); }
  document.body.append(card);
  haptic(14);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 300);
  window.addEventListener('hashchange', close);
}
