// "Joining your league" (owner request 2026-11-19): the first time Ranks has nothing kept on this device (just signed
// in, or a new phone), the wait for the league becomes a short reveal instead of a loading line. The user's character
// walks in, the bar fills while the league really loads, the league's emblem drops onto its stand, the character
// cheers, and the screen opens on the league. It lasts as long as the loading does: at least 1.2 s so it reads,
// at most 3 s (the league then finishes loading behind it). Transform and opacity only, so it keeps 60 fps.
import './rankJoin.css';
import { actor } from './actor';
import { tierEmblem } from './rankMoment';
import { rt } from '../i18n/ranks';
import { h } from './dom';

const MIN = 1200, MAX = 3000;

/** Plays over Ranks until `done` settles (within MIN..MAX); `tier()` names the league once it is known. */
export function joinReveal(done: Promise<unknown>, tier: () => number | null): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const me = still ? null : actor('rj-actor');
  const stand = h('div', { class: 'rj-stand' }, h('span', { class: 'rj-rays', 'aria-hidden': 'true' }), h('span', { class: 'rj-slot' }));
  const fill = h('i', {});
  const el = h('div', { class: `rj${still ? ' still' : ''}`, role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'rj-scene' }, stand, me ? h('div', { class: 'rj-walk' }, me.el) : ''),
    h('div', { class: 'rj-text' }, h('h2', {}, rt('rk.joinTitle')), h('p', {}, rt('rk.joinSub'))),
    h('div', { class: 'rj-bar', role: 'progressbar', 'aria-label': rt('rk.joinTitle') }, fill));
  document.body.append(el);
  const t0 = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    const n = tier();
    stand.querySelector('.rj-slot')!.replaceChildren(tierEmblem(n ?? 0));
    el.classList.add('landed');
    me?.cheer(1400);
  };
  return new Promise((resolve) => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 320);
    };
    const finish = () => {
      const wait = Math.max(0, MIN - (performance.now() - t0));
      setTimeout(() => { land(); setTimeout(close, still ? 300 : 650); }, wait);
    };
    void done.then(finish, finish);
    // Never longer than MAX: what is still loading goes on behind it.
    setTimeout(() => { land(); setTimeout(close, still ? 200 : 450); }, MAX - (still ? 200 : 450));
    el.addEventListener('click', () => { if (performance.now() - t0 > MIN) close(); });
  });
}
