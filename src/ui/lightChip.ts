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
  let shown = -1;
  let raf = 0;
  const paint = () => {
    const all = stats('all').light;
    // More Light than shown (a reward just claimed): count up to it while the flying light lands.
    if (shown >= 0 && all > shown && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const from = shown, t0 = performance.now() + 450;
      cancelAnimationFrame(raf);
      const tick = (now: number) => {
        const p = Math.min(1, Math.max(0, (now - t0) / 700));
        n.textContent = fmt.format(Math.round(from + (all - from) * (1 - (1 - p) ** 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else n.textContent = fmt.format(all);
    shown = all;
    el.setAttribute('aria-label', t('lt.chip', { n: all }));
    el.title = t('lt.chip', { n: all });
  };
  paint();
  const on = () => { if (!el.isConnected) window.removeEventListener('journey-changed', on); else paint(); };
  window.addEventListener('journey-changed', on);
  return el;
}
