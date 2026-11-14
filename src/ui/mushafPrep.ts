// "Preparing your mushaf" (round 4, Play build only): shown on a page whose font is still on its way in the Play
// asset pack (src/data/fontPack.ts), instead of a broken page or one in another font. A calm card on the page's
// skeleton: an open mushaf drawn in light lines, the title, how far the pages are, and — when Play waits for
// Wi-Fi — one button to let it use mobile data. Every card on screen follows the pack's progress.

import { h } from './dom';
import { t } from '../i18n';
import { allowMobileData, onPack, packState, type PackState } from '../data/fontPack';

const SVG = 'http://www.w3.org/2000/svg';
function book(): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 64 48');
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('mp-prep-book');
  s.innerHTML = '<path d="M32 10c-7-5-17-6-27-4v34c10-2 20-1 27 4 7-5 17-6 27-4V6C49 4 39 5 32 10Z"/>'
    + '<path d="M32 10v34"/><path class="ln" d="M11 15c5-1 11 0 16 2M11 22c5-1 11 0 16 2M11 29c5-1 11 0 16 2'
    + 'M37 17c5-2 11-3 16-2M37 24c5-2 11-3 16-2M37 31c5-2 11-3 16-2"/>';
  return s;
}

function paint(card: HTMLElement, s: PackState) {
  const sub = card.querySelector<HTMLElement>('.mp-prep-sub')!;
  const bar = card.querySelector<HTMLElement>('.mp-prep-bar i')!;
  const btn = card.querySelector<HTMLButtonElement>('.mp-prep-data')!;
  const pct = s.total ? Math.max(0, Math.min(100, Math.round(((s.done ?? 0) / s.total) * 100))) : 0;
  const offline = navigator.onLine === false;
  const wifi = s.state === 'wifi' || s.state === 'confirm';
  sub.textContent = offline ? t('mushaf.prepOffline')
    : wifi ? t('mushaf.prepWifi')
    : pct > 0 ? t('mushaf.prepPct', { pct }) : t('mushaf.prepWait');
  bar.style.width = `${pct > 0 ? pct : 0}%`;
  card.classList.toggle('indeterminate', pct === 0 && !offline);
  btn.hidden = !wifi || offline;
}

let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  const all = () => document.querySelectorAll<HTMLElement>('.mp-prep').forEach((c) => paint(c, packState()));
  onPack(all);
  window.addEventListener('online', all);
  window.addEventListener('offline', all);
}

/** The card laid over a placeholder page while its font is in the pack still on its way. */
export function prepCard(): HTMLElement {
  watch();
  const card = h('div', { class: 'mp-prep', role: 'status', 'aria-live': 'polite', dir: 'auto' },
    book(),
    h('b', { class: 'mp-prep-title' }, t('mushaf.prep')),
    h('span', { class: 'mp-prep-sub' }),
    h('div', { class: 'mp-prep-bar' }, h('i')),
    h('button', { class: 'mp-prep-data chip', type: 'button', hidden: true, onclick: () => void allowMobileData() }, t('mushaf.prepData')));
  paint(card, packState());
  return card;
}
