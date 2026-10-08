// Translation reading view: one card per ayah with Arabic + English. Same selection gestures as
// the mushaf view (long-press, drag, tap to extend).
import { loadMeta, surahText, surahTranslation } from '../data/quran';
import { h } from './dom';
import { setReaderMode } from './prefs';
import { openReflection } from './reflections';
import { selectionController } from './selection';

export async function showReader(root: HTMLElement, n: number, focusAyah?: number): Promise<() => void> {
  const [meta, arabic, english] = await Promise.all([loadMeta(), surahText(n), surahTranslation(n)]);
  const s = meta[n - 1];

  const cards = arabic.map((text, i) =>
    h('article', { class: 'ayah', 'data-s': String(n), 'data-a': String(i + 1) },
      h('div', { class: 'ayah-ar', lang: 'ar', dir: 'rtl' }, text),
      h('p', { class: 'ayah-en' }, h('span', { class: 'ayah-num' }, `${n}:${i + 1}`), english[i])));
  const listEl = h('main', { class: 'ayat' }, ...cards);

  const sel = selectionController({
    meta,
    area: listEl,
    paint: (sel) => cards.forEach((c, i) => {
      const k = i + 1;
      const on = !!sel && k >= sel.lo && k <= sel.hi;
      c.classList.toggle('sel', on);
      c.classList.toggle('sel-first', on && k === sel!.lo);
      c.classList.toggle('sel-last', on && k === sel!.hi);
    }),
    onReflect: (x) => { sel.clear(); void openReflection(meta, x.surah, x.lo); },
  });

  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'All surahs' }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, `${s.n}. ${s.en}`), h('p', { class: 'muted' }, `${s.tr} · ${s.ayahs} ayat`)),
      h('button', { class: 'chip', onclick: () => { setReaderMode('mushaf'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, 'Mushaf')),
    h('p', { class: 'hint muted' }, 'Long-press an ayah to select it. Drag, or tap another ayah, to extend.'),
    listEl,
    sel.bar,
  );

  if (focusAyah && cards[focusAyah - 1]) {
    requestAnimationFrame(() => cards[focusAyah - 1].scrollIntoView({ block: 'center' }));
  }

  return () => sel.destroy();
}
