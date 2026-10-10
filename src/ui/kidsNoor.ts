// Noor in the 2D Kids screens (docs/light.md §Noor): a warm core, a soft halo and a short trail that
// only shows while it glides. No face, eyes, body or wings; silent; feeling shown only by light.
// CSS only (no three.js): the trail is a few faint lights following the core with growing delays.
// Moods: rest (breathing), listen (a soft flicker on each recited word), turn (warmer, slower),
// bright (~2 s after a lantern is lit, then back). Reduced motion: no breathing or flicker, and a
// glide becomes a fade out and in at the new place.
import { reducedMotion } from '../light/support';
import { h } from './dom';

export type NoorMood = 'rest' | 'listen' | 'turn';
const TRAIL = 4;
const GLIDE_MS = 3200;

export function kidsNoor(extra = '') {
  const core = h('span', { class: 'kids-noor-core' });
  const halo = h('span', { class: 'kids-noor-halo' });
  const trail = Array.from({ length: TRAIL }, (_, i) => h('span', { class: 'kids-noor-trail', style: `--k:${i + 1}` }));
  const el = h('div', { class: `kids-noor m-rest${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' }, ...trail, halo, core);
  let mood: NoorMood = 'rest';
  let brightT = 0, glideT = 0, fadeT = 0;
  const set = (x: string, y: string) => { el.style.setProperty('--nx', x); el.style.setProperty('--ny', y); };

  return {
    el,
    /** Rest at (x, y) (CSS lengths in the parent); `glide` = travel there slowly with the trail. */
    place(x: string, y: string, glide = false) {
      clearTimeout(glideT);
      clearTimeout(fadeT);
      if (!glide) {
        el.classList.add('still');
        set(x, y);
        void el.offsetWidth;
        el.classList.remove('still');
        return;
      }
      if (reducedMotion()) {
        el.classList.add('away');
        fadeT = window.setTimeout(() => {
          el.classList.add('still');
          set(x, y);
          void el.offsetWidth;
          el.classList.remove('still', 'away');
        }, 900);
        return;
      }
      el.classList.add('gliding');
      set(x, y);
      glideT = window.setTimeout(() => el.classList.remove('gliding'), GLIDE_MS + 600);
    },
    mood(m: NoorMood) {
      if (m === mood) return;
      el.classList.remove(`m-${mood}`);
      mood = m;
      el.classList.add(`m-${m}`);
    },
    /** A soft swell as a word starts (listening). */
    pulse() {
      if (reducedMotion() || typeof core.animate !== 'function') return;
      core.animate([{ opacity: 0.8, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.18)', offset: 0.35 },
        { opacity: 0.8, transform: 'translate(-50%, -50%) scale(1)' }], { duration: 650, easing: 'ease-in-out' });
      halo.animate([{ opacity: 0.7 }, { opacity: 1, offset: 0.35 }, { opacity: 0.7 }], { duration: 650, easing: 'ease-in-out' });
    },
    /** Brighter and warmer for ~2 s (a lantern lit), then it settles. */
    brighten() {
      clearTimeout(brightT);
      el.classList.add('bright');
      brightT = window.setTimeout(() => el.classList.remove('bright'), 2000);
    },
    dispose() {
      clearTimeout(brightT);
      clearTimeout(glideT);
      clearTimeout(fadeT);
      el.remove();
    },
  };
}
export type KidsNoor = ReturnType<typeof kidsNoor>;
export const NOOR_GLIDE_MS = GLIDE_MS;
