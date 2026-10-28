// ☰ → Theme colours: a grid of brand gradients (src/ui/theme.ts). Tapping one applies it at once, and
// the preview above the grid (the app name, a button, a progress bar) shows it live. The same chooser
// is the last step of the first-launch welcome (src/ui/welcome.ts).
import { h, haptic, toast } from './dom';
import { t, tOr } from '../i18n';
import { THEMES, rgba, setTheme, themeId } from './theme';

/** The live preview and the grid of themes. */
export function themeChooser(quiet = false): HTMLElement[] {
  const grid = h('div', { class: 'theme-grid' });
  const tiles = THEMES.map((x) => {
    const name = tOr(`theme.${x.id}`, x.name);
    const tile = h('button', {
      class: `theme-tile${x.id === themeId() ? ' on' : ''}`, 'aria-pressed': String(x.id === themeId()), 'aria-label': name,
      style: `--tg: linear-gradient(135deg, ${x.neon.join(', ')}); --tf: linear-gradient(45deg, ${x.fill.join(', ')}); --tglow: ${rgba(x.neon[0], 0.55)}`,
      onclick: () => {
        haptic();
        setTheme(x.id);
        for (const el of grid.querySelectorAll('.theme-tile')) { el.classList.toggle('on', el === tile); el.setAttribute('aria-pressed', String(el === tile)); }
        if (!quiet) toast(t('theme.applied', { name }));
      },
    },
    h('span', { class: 'theme-swatch', 'aria-hidden': 'true' }, h('span', { class: 'theme-pill' })),
    h('span', { class: 'theme-name' }, name));
    return tile;
  });
  grid.append(...tiles);
  return [
    h('div', { class: 'theme-preview' },
      h('span', { class: 'brand-name theme-brand' }, 'ayah studio'),
      h('button', { class: 'primary brand-btn', tabindex: '-1', 'aria-hidden': 'true' }, t('theme.sample')),
      h('div', { class: 'export-bar theme-bar', 'aria-hidden': 'true' }, h('div', {}))),
    grid,
  ];
}

export function openThemePicker() {
  const d = h('dialog', { class: 'sheet bottom theme-sheet' });
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.append(
    h('div', { class: 'sheet-head' }, h('h2', {}, t('theme.title')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', { class: 'muted small' }, t('theme.note')),
    ...themeChooser());
  document.body.append(d);
  d.showModal();
}
