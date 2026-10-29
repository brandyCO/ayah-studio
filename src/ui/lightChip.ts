// A small Light (Noor) count for a top bar (Me, the studio): a glowing star and the Light gathered
// so far, in the theme colours. Private, never compared. Follows journey changes while on screen.
import { stats } from '../data/journey';
import { locale, t } from '../i18n';
import { h } from './dom';

export function lightChip(onclick?: () => void): HTMLElement {
  const n = h('b', {});
  const fmt = new Intl.NumberFormat(locale());
  const el = h(onclick ? 'button' : 'span', { class: 'lt-chip', ...(onclick ? { onclick, type: 'button' } : {}) },
    h('span', { class: 'lt-chip-ic', 'aria-hidden': 'true' }), n);
  const paint = () => {
    const all = stats('all').light;
    n.textContent = fmt.format(all);
    el.setAttribute('aria-label', t('lt.chip', { n: all }));
    el.title = t('lt.chip', { n: all });
  };
  paint();
  const on = () => { if (!el.isConnected) window.removeEventListener('journey-changed', on); else paint(); };
  window.addEventListener('journey-changed', on);
  return el;
}
