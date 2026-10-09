import { loadMeta, type SurahMeta } from '../data/quran';
import { openDebugPanel } from './debug';
import { h } from './dom';
import { t } from '../i18n';

// Loose matching so "baqarah", "Al Baqara" and "2" all find Al-Baqara.
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, '').replace(/aa/g, 'a').replace(/ii|ee/g, 'i').replace(/uu|oo/g, 'u').replace(/ah$/, 'a');

let lastQuery = '';

export async function showSurahList(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const list = h('ol', { class: 'surah-list' });
  const search = h('input', {
    type: 'search', class: 'search', placeholder: t('list.search'), value: lastQuery,
    autocomplete: 'off', oninput: () => { lastQuery = search.value; fill(); },
  });

  const row = (s: SurahMeta) =>
    h('li', {},
      h('a', { href: `#/s/${s.n}`, class: 'surah-row' },
        h('span', { class: 'surah-num' }, String(s.n)),
        h('span', { class: 'surah-names' },
          h('strong', {}, s.en),
          h('span', { class: 'muted' }, t('list.surahInfo', { tr: s.tr, n: s.ayahs }))),
        h('span', { class: 'surah-ar', lang: 'ar', dir: 'rtl' }, s.ar)));

  function fill() {
    const q = search.value.trim();
    const qn = norm(q);
    const items = meta.filter((s) =>
      !q || String(s.n) === q || (qn && (norm(s.en).includes(qn) || norm(s.tr).includes(qn))) || s.ar.includes(q));
    list.replaceChildren(...items.map(row));
    if (!items.length) list.append(h('li', { class: 'muted empty' }, t('list.none')));
  }
  fill();

  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', { class: 'brand-name' }, 'Ayah Studio'), h('p', { class: 'muted' }, t('list.tagline'))),
      h('a', { class: 'chip', href: '#/drafts' }, t('list.drafts')),
      h('button', { class: 'icon-btn', 'aria-label': t('list.deviceCheck'), title: t('list.deviceCheck'), onclick: openDebugPanel }, '⚙')),
    h('div', { class: 'search-wrap' }, search),
    list,
  );
  return () => {};
}
