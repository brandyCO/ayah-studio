// ☰ → Theme colours: a grid of brand gradients (src/ui/theme.ts). Tapping one applies it at once.
import { h, toast } from './dom';
import { t, tOr } from '../i18n';
import { THEMES, rgba, setTheme, themeId } from './theme';

export function openThemePicker() {
  const d = h('dialog', { class: 'sheet bottom theme-sheet' });
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  const tiles = THEMES.map((x) => {
    const name = tOr(`theme.${x.id}`, x.name);
    const tile = h('button', {
      class: `theme-tile${x.id === themeId() ? ' on' : ''}`, 'aria-pressed': String(x.id === themeId()), 'aria-label': name,
      style: `--tg: linear-gradient(135deg, ${x.neon.join(', ')}); --tf: linear-gradient(45deg, ${x.fill.join(', ')}); --tglow: ${rgba(x.neon[0], 0.55)}`,
      onclick: () => {
        setTheme(x.id);
        for (const el of d.querySelectorAll('.theme-tile')) { el.classList.toggle('on', el === tile); el.setAttribute('aria-pressed', String(el === tile)); }
        toast(t('theme.applied', { name }));
      },
    },
    h('span', { class: 'theme-swatch', 'aria-hidden': 'true' }, h('span', { class: 'theme-pill' })),
    h('span', { class: 'theme-name' }, name));
    return tile;
  });
  d.append(
    h('div', { class: 'sheet-head' }, h('h2', {}, t('theme.title')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', { class: 'muted small' }, t('theme.note')),
    h('div', { class: 'theme-preview' },
      h('span', { class: 'brand-name theme-brand' }, 'ayah studio'),
      h('button', { class: 'primary brand-btn', tabindex: '-1', 'aria-hidden': 'true' }, t('theme.sample')),
      h('div', { class: 'export-bar theme-bar', 'aria-hidden': 'true' }, h('div', {}))),
    h('div', { class: 'theme-grid' }, ...tiles));
  document.body.append(d);
  d.showModal();
}
