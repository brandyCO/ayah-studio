// The ★ beside a reciter in the pickers (Listen, studio). Its sheets (favourite.ts) load on the first tap,
// so they stay out of the app's first load.
import { isFavourite } from '../data/reciterDownload';
import type { Reciter } from '../data/reciters';
import { t } from '../i18n';
import { h, haptic } from './dom';

/** The ★ beside a reciter in a list (inside the row's button: a span, like the voice sample). */
export function starButton(r: Reciter, surah: number | null, onChange: () => void): HTMLElement {
  const on = isFavourite(r.id);
  const open = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    haptic();
    void import('./favourite').then((m) => {
      if (isFavourite(r.id)) m.manageFavourite(r, surah, onChange);
      else m.askDownload(r, surah, onChange);
    });
  };
  return h('span', {
    class: `fav-star${on ? ' on' : ''}`, role: 'button', tabindex: '0', 'aria-pressed': String(on),
    'aria-label': t(on ? 'fav.manage' : 'fav.add', { name: r.short }), title: t(on ? 'fav.manage' : 'fav.add', { name: r.short }),
    onclick: open, onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') open(e); },
  }, on ? '★' : '☆');
}

