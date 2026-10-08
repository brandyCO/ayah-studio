import { loadMeta, type SurahMeta } from '../data/quran';
import { openDebugPanel } from './debug';
import { h } from './dom';

// Loose matching so "baqarah", "Al Baqara" and "2" all find Al-Baqara.
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, '').replace(/aa/g, 'a').replace(/ii|ee/g, 'i').replace(/uu|oo/g, 'u').replace(/ah$/, 'a');

let lastQuery = '';

export async function showSurahList(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const list = h('ol', { class: 'surah-list' });
  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search surah by name or number', value: lastQuery,
    autocomplete: 'off', oninput: () => { lastQuery = search.value; fill(); },
  });

  const row = (s: SurahMeta) =>
    h('li', {},
      h('a', { href: `#/s/${s.n}`, class: 'surah-row' },
        h('span', { class: 'surah-num' }, String(s.n)),
        h('span', { class: 'surah-names' },
          h('strong', {}, s.en),
          h('span', { class: 'muted' }, `${s.tr} · ${s.ayahs} ayat`)),
        h('span', { class: 'surah-ar', lang: 'ar', dir: 'rtl' }, s.ar)));

  function fill() {
    const q = search.value.trim();
    const qn = norm(q);
    const items = meta.filter((s) =>
      !q || String(s.n) === q || (qn && (norm(s.en).includes(qn) || norm(s.tr).includes(qn))) || s.ar.includes(q));
    list.replaceChildren(...items.map(row));
    if (!items.length) list.append(h('li', { class: 'muted empty' }, 'No surah found'));
  }
  fill();

  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', { class: 'brand-name' }, 'Ayah Studio'), h('p', { class: 'muted' }, 'Read · select · turn into a reel')),
      h('a', { class: 'chip', href: '#/drafts' }, 'Drafts'),
      h('button', { class: 'icon-btn', 'aria-label': 'Device check', title: 'Device check', onclick: openDebugPanel }, '⚙')),
    h('div', { class: 'search-wrap' }, search),
    list,
  );
  return () => {};
}
