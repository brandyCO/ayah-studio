// "Tafsir" under a translation (docs/grow.md, G4): a quiet link that opens the published tafsir of
// the ayah, attributed, exactly as published, in the tafsir the reader picks (Quran.com's library).
import { feature } from '../features';
import { lang, t } from '../i18n';
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
  const panel = h('div', { class: 'tafsir', hidden: true });
  let loaded = false;
  const show = async () => {
    panel.replaceChildren(h('p', { class: 'muted small' }, t('common.loading')));
    try {
      const { loadTafsir, chosenTafsir, pickTafsir, TAFSIRS, tafsirDir, tafsirView } = await import('../data/tafsir'); // only when opened
      const src = chosenTafsir(lang());
      const x = await loadTafsir(src, s, a);
      loaded = true;
      const pick = h('select', { class: 'tafsir-pick', 'aria-label': t('tafsir.pick'), onchange: (e: Event) => {
        e.stopPropagation();
        pickTafsir(Number((e.target as HTMLSelectElement).value));
        void show();
      } }, ...TAFSIRS.map((o) => h('option', { value: String(o.id) }, o.name))) as HTMLSelectElement;
      pick.value = String(src.id);
      pick.addEventListener('click', (e) => e.stopPropagation());
      const text: Node[] = [h('p', { class: 'tafsir-source' }, pick, h('span', { class: 'muted small' }, ' ', h('bdi', {}, src.by), ' · Quran.com'))];
      if (x.verses.length > 1) text.push(h('p', { class: 'muted small' }, t('tafsir.explains', { ref: span(x.verses) })));
      text.push(x.html ? h('div', { class: 'tafsir-text', lang: src.lang, dir: tafsirDir(src) }, tafsirView(x.html)) : h('p', { class: 'muted small' }, t('tafsir.none')));
      text.push(h('p', { class: 'small' }, h('a', { href: `https://quran.com/${s}:${a}/tafsirs/${src.slug}`, target: '_blank', rel: 'noopener' }, t('tafsir.source'))));
      panel.replaceChildren(...text);
    } catch {
      panel.replaceChildren(h('p', { class: 'muted small' }, t('tafsir.failed')));
    }
  };
  const btn = h('button', { class: 'tafsir-link', 'aria-expanded': 'false', onclick: async (e: Event) => {
    e.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open || loaded) return;
    void show();
  } }, t('tafsir.link'));
  return h('div', { class: 'tafsir-wrap' }, btn, panel);
}
