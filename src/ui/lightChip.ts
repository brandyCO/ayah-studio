// A small Light (Noor) count for a top bar (Me, Learn, the studio): a star and the Light there is to
// spend (all earned minus what the garden and the Ranks shop took), the same number and star as the
// shop (owner decision 2026-11-10: one currency, drawn one way). Private, never compared.
import './lightChip.css';
import { stats } from '../data/journey';

// The garden module (what was spent) loads on first use, so it never joins the first load.
let wallet: (() => number) | null = null;
const loadWallet = () => import('../data/garden').then((g) => { wallet = g.wallet; });
import { locale, t } from '../i18n';
import { h } from './dom';

/** Tapping it opens the shop (owner request 2026-11-12), unless the screen gives its own action. */
export function lightChip(onclick: () => void = () => void import('./shop').then((m) => m.openShop())): HTMLElement {
  const n = h('b', {});
  // Made on first paint (after the wallet loads), so its first-time set-up is not part of opening a screen.
  let nf: Intl.NumberFormat | null = null;
  const fmt = { format: (x: number) => (nf ??= new Intl.NumberFormat(locale())).format(x) };
  const el = h('button', { class: 'lt-chip', onclick, type: 'button' },
    star(), n);
  let shown = -1;
  let raf = 0;
  const paint = () => {
    const all = wallet ? wallet() : stats('all').light;
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
  if (wallet) paint(); else { n.textContent = ''; void loadWallet().then(() => { shown = -1; paint(); }); }
  const on = () => {
    if (el.isConnected) { paint(); return; }
    window.removeEventListener('journey-changed', on);
    window.removeEventListener('garden-changed', on);
  };
  window.addEventListener('journey-changed', on);
  window.addEventListener('garden-changed', on);
  return el;
}

/** The Light star: four soft points with a bright core, in the theme colours. */
export function star(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'lt-chip-ic');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path class="lt-star" d="M12 1.5c.9 5 2.6 7.6 9.5 10.5-6.9 2.9-8.6 5.5-9.5 10.5-.9-5-2.6-7.6-9.5-10.5C9.4 9.1 11.1 6.5 12 1.5z"/>'
    + '<circle class="lt-star-core" cx="12" cy="12" r="2.6"/>';
  return s;
}
