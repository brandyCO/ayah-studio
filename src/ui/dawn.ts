// Waking dawn (du'a moments step 3): the morning after the bedtime du'a were said in full, the first
// time the app is open between 03:00 and 12:00 a dawn rises over the screen — night sky giving way to
// rose and gold, the sun coming up — with the first waking du'a (Hisn al-Muslim, as bundled) and a way
// into the waking session. Once a day; skipped over the studio, the Kids space or an open dialog.
// Bedtime (`bedtimeDone`) is set by the sleep session's last du'a (src/ui/adhkar.ts).
import './dawn.css';
import { dawnDue, loadDuas } from '../data/duas';
import { akt } from '../i18n/adhkar';
import { lang } from '../i18n';
import { h, haptic } from './dom';
import { popIn, reduced } from './juice';
import { sfx } from './sfx';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export async function showDawn() {
  const now = new Date();
  if (!dawnDue(now)) return;
  if (/^#\/(reel|kids|rc|rb|t)(\/|$)/.test(location.hash) || document.querySelector('dialog[open], .cel')) return;
  let first;
  try { first = (await loadDuas()).wake[0]; } catch { return; }
  set('dawnSeen', dayKey(now));
  const sun = h('div', { class: 'dw-sun', 'aria-hidden': 'true' });
  const text = h('div', { class: 'dw-text' },
    h('p', { class: 'dw-kicker' }, akt('dw.morning')),
    h('p', { class: 'dw-ar', lang: 'ar', dir: 'rtl' }, first.ar),
    lang() === 'ar' ? '' : h('p', { class: 'dw-en' }, first.en),
    h('p', { class: 'dw-ref' }, akt('ak.source', { ref: lang() === 'ar' ? first.refAr : first.ref })),
    h('div', { class: 'dw-actions' },
      h('button', { class: 'primary brand-btn', onclick: () => { haptic(); dialog.close(); void import('./adhkar').then((m) => m.openDuas('wake')); } }, akt('dw.say')),
      h('button', { class: 'chip', onclick: () => dialog.close() }, akt('dw.later'))));
  const dialog = h('dialog', { class: 'dawn', 'aria-label': akt('dw.morning') },
    h('div', { class: 'dw-sky dw-night', 'aria-hidden': 'true' }), h('div', { class: 'dw-sky dw-day', 'aria-hidden': 'true' }),
    h('div', { class: 'dw-stars', 'aria-hidden': 'true' }), sun, h('div', { class: 'dw-hills', 'aria-hidden': 'true' }), text);
  dialog.addEventListener('close', () => dialog.remove());
  window.addEventListener('hashchange', () => dialog.close(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  if (reduced()) { dialog.classList.add('up'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('up')));
  setTimeout(() => { sfx.shimmer(); popIn(text, { stiffness: 180, damping: 16 }); text.classList.add('in'); }, 1600);
}
