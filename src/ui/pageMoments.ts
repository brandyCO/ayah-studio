// Small moments while reading, never over the Arabic: when a page counts (after its reading time) a
// line of light runs along the bottom edge of the page, right to left, and the pages goal shows its new
// count for a moment; when the page finished a surah (every page of it read) or a juz, a calm card rises
// from the bottom: the surah's name, its ayat, Continue. Tapping anywhere else lets it go.
import type { SurahMeta } from '../data/quran';
import { todayGoals } from '../data/goals';
import { surahName, t } from '../i18n';
import { h, haptic } from './dom';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The page just counted: a sweep of light along the bottom edge + the pages goal for a moment. */
export function pageCounted(area: HTMLElement) {
  area.querySelector('.page-light')?.remove();
  const g = todayGoals().find((x) => x.kind === 'pages');
  const pill = g ? h('span', { class: `page-light-pill${g.done >= g.target ? ' met' : ''}` },
    g.done >= g.target ? `✓ ${t('pm.pagesMet', { n: g.target })}` : t('pm.pages', { done: g.done, n: g.target })) : '';
  const el = h('div', { class: 'page-light', 'aria-hidden': 'true' }, h('span', { class: 'page-light-line' }), pill);
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
  document.body.append(card);
  haptic(14);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 300);
  window.addEventListener('hashchange', close);
}
