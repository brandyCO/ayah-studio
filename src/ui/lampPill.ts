// The lamp of Light by a name (owner request 2026-11-12, "Light visible to others"): bronze, silver, gold or diamond,
// by the Light a player has spent. Shown on boards, profiles, the rival card, friend cards and friend moments.
import './lampPill.css';
import { h } from './dom';
import { rt, type RankKey } from '../i18n/ranks';

export const lampPill = (n?: number, big = false) => !n ? '' : h('span', { class: `rk-lamp l${n}${big ? ' big' : ''}`, title: rt(`rk.lamp${n}` as RankKey), 'aria-label': rt(`rk.lamp${n}` as RankKey) }, lampSvg());
/** The lamp with its name ("Gold lamp of Light"), for a profile. */
export const lampLine = (n?: number) => !n ? '' : h('p', { class: 'lamp-line small' }, lampPill(n, true), rt(`rk.lamp${n}` as RankKey));
function lampSvg(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.innerHTML = '<circle class="g" cx="8" cy="9" r="7"/><path class="e" d="M5.2 4.6h5.6l.8 1.4H4.4z"/><path class="b" d="M4.4 6h7.2q1.4 3-1 6.2H5.4Q3 9 4.4 6z"/>'
    + '<path class="f" d="M8 7.2c1 1.1 1.2 1.9 1.2 2.5a1.2 1.2 0 0 1-2.4 0c0-.6.2-1.4 1.2-2.5z"/><path class="t" d="M6.8 3.4h2.4l-.4 1.2H7.2z"/>';
  return s;
}
