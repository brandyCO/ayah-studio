// Kids space, one surah (docs/kids.md K2): one ayah at a time in large Arabic (the bundled text in
// the KFGQPC font, never altered), its reference (rule 2) and, if the parent left it on, its Sahih
// International translation.
import { isKidsSurah, kidsSettings } from '../data/kids';
import { loadMeta, reference, surahText, surahTranslation } from '../data/quran';
import { displayWords } from '../engine/words';
import { h } from './dom';
import { icon } from './icons';
import { parentButton } from './kids';

export async function showKidsSurah(root: HTMLElement, n: number): Promise<() => void> {
  if (!isKidsSurah(n)) {
    location.replace('#/kids');
    return () => {};
  }
  const [meta, arabic, english] = await Promise.all([loadMeta(), surahText(n), surahTranslation(n)]);
  const s = meta[n - 1];
  const opts = kidsSettings();
  root.classList.add('kids', 'kids-surah');
  let ayah = 1;

  const ar = h('p', { class: 'kids-ar', lang: 'ar', dir: 'rtl' });
  const ref = h('p', { class: 'kids-ref' });
  const en = h('p', { class: 'kids-en' });
  const prev = h('button', { class: 'kids-btn', 'aria-label': 'Previous ayah', onclick: () => show(ayah - 1) }, icon('left', 28));
  const next = h('button', { class: 'kids-btn', 'aria-label': 'Next ayah', onclick: () => show(ayah + 1) }, icon('right', 28));

  function show(a: number) {
    ayah = Math.min(s.ayahs, Math.max(1, a));
    // Whole words only: the ayah is the bundled text split at its spaces (displayWords checks it).
    ar.replaceChildren(...displayWords(arabic[ayah - 1]).flatMap((w, i) => [i ? ' ' : '', h('span', { class: 'kids-word' }, w)]));
    ref.textContent = reference(s, ayah);
    en.textContent = english[ayah - 1];
    en.hidden = !opts.translation;
    prev.disabled = ayah === 1;
    next.disabled = ayah === s.ayahs;
  }
  show(1);

  root.append(
    h('header', { class: 'kids-top' },
      h('a', { class: 'kids-back', href: '#/kids', 'aria-label': 'All surahs' }, icon('left', 26)),
      h('h1', { class: 'kids-title' }, s.en),
      parentButton()),
    h('main', { class: 'kids-stage' }, ar, ref, en),
    h('nav', { class: 'kids-controls' }, prev, next));
  return () => {};
}
