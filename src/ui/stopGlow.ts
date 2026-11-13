// "You stopped here": the ayah where the reader left off glows softly on the page for a few
// seconds, with a small pill (and, after listening, a way to carry on from it). Shown once a break.
import type { SurahMeta } from '../data/quran';
import { stopShown, type Stop } from '../data/stopped';
import { t, uiRef } from '../i18n';
import { fe } from '../i18n/front';
import { h, haptic } from './dom';
import { icon } from './icons';
import './stopGlow.css';

export function showStop(area: HTMLElement, pageEl: HTMLElement, meta: SurahMeta[], st: Stop, listen: (s: number, a: number) => void) {
  const words = [...pageEl.querySelectorAll<HTMLElement>(`.w[data-s="${st.s}"][data-a="${st.a}"]`)];
  if (!words.length) return;
  stopShown();
  area.querySelector('.stop-pill')?.remove();
  for (const w of words) w.classList.add('stop-here');
  const end = () => {
    for (const w of words) w.classList.add('stop-out');
    pill.classList.add('out');
    setTimeout(() => { for (const w of words) w.classList.remove('stop-here', 'stop-out'); pill.remove(); }, 900);
    clearTimeout(timer);
    area.removeEventListener('pointerdown', onDown, true);
  };
  const onDown = (e: Event) => { if (!(e.target as Element).closest?.('.stop-pill')) end(); };
  const ref = uiRef(meta[st.s - 1], st.a, st.a);
  const pill = h('div', { class: 'stop-pill', role: 'status' },
    h('span', { class: 'stop-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'stop-txt' }, h('b', {}, fe('stop.here')), h('span', {}, ref)),
    st.how === 'listen'
      ? h('button', { class: 'chip on stop-go', onclick: () => { haptic(10); end(); listen(st.s, st.a); } }, icon('play', 16), fe('stop.listen'))
      : '',
    h('button', { class: 'icon-btn stop-x', 'aria-label': t('common.close'), onclick: end }, icon('close', 16)));
  area.append(pill);
  area.addEventListener('pointerdown', onDown, true);
  const timer = window.setTimeout(end, st.how === 'listen' ? 9000 : 6000);
}
