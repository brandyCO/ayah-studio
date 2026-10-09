// The translation list (docs/grow.md, G1): languages with their translators, the chosen one ticked.
// Used by ☰ → Translation in the reader and by the reel editor (Translation → Which).
import { t } from '../i18n';
import { surahTranslation } from '../data/quran';
import { translationGroups, type TranslationInfo } from '../data/translations';
import { h, toast } from './dom';

/** The list; `pick` is called once the translation's file has loaded (it is then offline too). */
export function translationList(current: () => string, pick: (id: string) => void): HTMLElement {
  const box = h('div', { class: 'tr-list' });
  const fill = () => box.replaceChildren(...translationGroups().map((g) =>
    h('section', { class: 'tr-group' },
      h('h3', { class: 'tr-lang' }, g.name),
      ...g.items.map((x) => item(x)))));
  const item = (x: TranslationInfo) => {
    const on = x.id === current();
    return h('button', { class: `menu-item tr-item${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: async () => {
      if (x.id === current()) return;
      const b = box.querySelector<HTMLElement>(`[data-id="${x.id}"]`);
      b?.classList.add('busy');
      try {
        await surahTranslation(1, x.id); // the whole file: every surah after this is offline
        pick(x.id);
        fill();
      } catch {
        toast(t('tr.failed'));
        b?.classList.remove('busy');
      }
    }, 'data-id': x.id },
    h('span', { class: 'tr-name', dir: 'auto' }, x.translator),
    x.id !== 'en.sahih' && !on ? h('span', { class: 'muted small' }, t('tr.size', { mb: (x.bytes / 1048576 / 3).toFixed(1) })) : null,
    h('span', { class: 'tr-tick', 'aria-hidden': 'true' }, on ? '✓' : ''));
  };
  fill();
  return box;
}
