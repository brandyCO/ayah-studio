// "Tafsir" under a translation (docs/grow.md, G4): a quiet link that opens the published tafsir of
// the ayah, attributed, exactly as published. Only while the `tafsir` flag is on (licence pending).
import { feature } from '../features';
import { loadTafsir, TAFSIR, tafsirView } from '../data/tafsir';
import { t } from '../i18n';
import { h } from './dom';

const span = (v: string[]) => {
  if (v.length < 2) return v[0] ?? '';
  const [s, a] = v[0].split(':');
  const b = v[v.length - 1].split(':')[1];
  return `${s}:${a}–${b}`;
};

/** The link + its panel for ayah s:a, or null while tafsir is off. */
export function tafsirToggle(s: number, a: number): HTMLElement | null {
  if (!feature('tafsir')) return null;
  const panel = h('div', { class: 'tafsir', hidden: true, lang: TAFSIR.lang, dir: 'ltr' });
  let loaded = false;
  const btn = h('button', { class: 'tafsir-link', 'aria-expanded': 'false', onclick: async (e: Event) => {
    e.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open || loaded) return;
    panel.replaceChildren(h('p', { class: 'muted small' }, t('common.loading')));
    try {
      const x = await loadTafsir(s, a);
      loaded = true;
      const nodes: Node[] = [h('p', { class: 'tafsir-source' }, h('b', {}, TAFSIR.name), ` · ${TAFSIR.by}`)];
      if (x.verses.length > 1) nodes.push(h('p', { class: 'muted small' }, t('tafsir.explains', { ref: span(x.verses) })));
      nodes.push(x.html ? h('div', { class: 'tafsir-text' }, tafsirView(x.html)) : h('p', { class: 'muted small' }, t('tafsir.none')));
      nodes.push(h('p', { class: 'small' }, h('a', { href: `https://quran.com/${s}:${a}/tafsirs/en-tafisr-ibn-kathir`, target: '_blank', rel: 'noopener' }, t('tafsir.source'))));
      panel.replaceChildren(...nodes);
    } catch {
      panel.replaceChildren(h('p', { class: 'muted small' }, t('tafsir.failed')));
    }
  } }, t('tafsir.link'));
  return h('div', { class: 'tafsir-wrap' }, btn, panel);
}
