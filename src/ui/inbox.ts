// The bell (owner requests 2026-11-10, 2026-11-19): sits in the top bar of Me, Learn and Ranks with the number of new
// notifications, and opens the Notifications screen (#/notifications, src/ui/notifications.ts), where everything is
// kept after it is read. The count is local: src/data/notifs.ts gathers from the journey and the Ranks answers kept on
// this device.
import './lightChip.css';
import { unreadCount } from '../data/notifs';
import { nt } from '../i18n/notifs';
import { h, haptic } from './dom';

/** The bell for a top bar: a count while something is new, kept current while on screen. */
export function inboxBell(): HTMLElement {
  const n = h('i', { class: 'ib-n' });
  const el = h('button', { class: 'icon-btn ib-bell', type: 'button', onclick: () => { haptic(6); location.hash = '#/notifications'; } }, bellSvg(), n);
  let last = -1;
  const paint = () => {
    if (!el.isConnected && last >= 0) { off(); return; }
    const c = unreadCount();
    n.textContent = c > 9 ? '9+' : String(c);
    el.classList.toggle('has', c > 0);
    if (c > last && last >= 0) { el.classList.remove('ring'); void el.offsetWidth; el.classList.add('ring'); }
    last = c;
    el.setAttribute('aria-label', c ? nt('nt.bell', { n: c }) : nt('nt.title'));
  };
  const evs = ['journey-changed', 'garden-changed', 'rank-cache', 'notifs-changed', 'sync-arrived', 'hashchange'];
  const off = () => evs.forEach((e) => window.removeEventListener(e, paint));
  evs.forEach((e) => window.addEventListener(e, paint));
  // Counted when the browser is idle, not in the frame that first draws the screen.
  if ('requestIdleCallback' in window) requestIdleCallback(paint, { timeout: 600 }); else setTimeout(paint, 50);
  return el;
}

function bellSvg(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.8H4.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return s;
}
