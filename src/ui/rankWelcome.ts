// "Welcome to your league" (owner request 2026-11-19, "another one, the way Duolingo does it"): the league-intro
// pattern, in our own art. While the league loads, the league's emblem drops in with a squash and a shine, the
// user's character waves beside it, the title and the one rule ("the top 3 move up") come in, and a chunky
// Continue button fills like a loading bar. Once the league is there the button pops ready; a tap sends the emblem
// up into the league card and the real leaderboard rows slide in one after another, the user's row last with a
// bounce. Only transform / opacity move.
import './rankWelcome.css';
import { tierEmblem } from './rankMoment';
import { actor, myFigureCode } from './actor';
import { rt, type RankKey } from '../i18n/ranks';
import { h } from './dom';
import { sfx } from './sfx';

const tierKey = ['lantern', 'star', 'moon', 'dawn', 'sun'];
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };
const READY_MIN = 1500, READY_MAX = 6000;

export function welcomeReveal(done: Promise<unknown>, tier: () => number | null): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sel = Math.max(0, Math.min(4, tier() ?? 0));
  const em = h('span', { class: 'rw-em' }, tierEmblem(sel));
  const me = still || !myFigureCode() ? null : actor('rw-actor');
  const title = h('h2', {}, rt('rk.leagueTitle', { tier: rt(`rk.tier.${tierKey[sel]}` as RankKey) }));
  const label = h('span', { class: 'rw-label' }, rt('rk.continue'));
  const fill = h('i', { class: 'rw-fill' });
  const btn = h('button', { class: 'rw-btn', disabled: true, 'aria-label': rt('rk.continue') }, fill, label);
  const wait = h('p', { class: 'rw-wait' }, rt('rk.joinSub'));
  const el = h('div', { class: `rw${still ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': rt('rk.joinTitle') },
    h('div', { class: 'rw-stage' },
      h('span', { class: 'rw-rays', 'aria-hidden': 'true' }),
      h('span', { class: 'rw-spark s1' }), h('span', { class: 'rw-spark s2' }), h('span', { class: 'rw-spark s3' }),
      em, me ? h('span', { class: 'rw-me' }, me.el) : ''),
    h('div', { class: 'rw-text' }, h('p', { class: 'rw-kick' }, rt('rk.welcomeKicker')), title, h('p', { class: 'rw-line' }, rt('rk.welcomeLine'))),
    h('div', { class: 'rw-foot' }, btn, wait));
  document.body.append(el);
  const t0 = performance.now();
  if (!still) {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
    setTimeout(() => { sfx.pop(2); vibrate(12); }, 330);              // the emblem lands
    setTimeout(() => { me?.wave(1400); }, 650);
  }
  let ready = false;
  const setReady = () => {
    if (ready) return;
    ready = true;
    const n = tier();
    if (n !== null && n !== sel) {
      sel = Math.max(0, Math.min(4, n));
      em.replaceChildren(tierEmblem(sel));
      title.textContent = rt('rk.leagueTitle', { tier: rt(`rk.tier.${tierKey[sel]}` as RankKey) });
    }
    btn.disabled = false;
    el.classList.add('ready');
    if (!still) { sfx.shimmer(); vibrate(8); me?.hop(0.8); setTimeout(() => me?.cheer(1200), 380); } // one hop, never two in a row (owner 2026-11-19)
    btn.focus({ preventScroll: true });
  };
  let loaded = false;
  void done.then(() => { loaded = true; }, () => { loaded = true; });
  const check = () => {
    const t = performance.now() - t0;
    if ((loaded && t >= READY_MIN) || t >= READY_MAX) setReady(); else setTimeout(check, 60);
  };
  check();

  return new Promise((resolve) => {
    btn.addEventListener('click', () => {
      if (!ready || el.classList.contains('out')) return;
      sfx.whoosh();
      // The emblem rises into the league card's emblem, the rest of the screen fades, and the real rows slide in.
      const to = document.querySelector('.rk-hero-em')?.getBoundingClientRect();
      const from = em.getBoundingClientRect();
      if (!still && to && to.width) {
        const k = to.width / from.width;
        em.style.setProperty('--fly', `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${k})`);
        el.classList.add('fly');
      }
      el.classList.add('out');
      const rows = [...document.querySelectorAll<HTMLElement>('.rk-list .rk-row')].filter((r) => {
        const b = r.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight;
      });
      if (!still) rows.forEach((r, i) => {
        r.style.setProperty('--rw-d', `${120 + i * 55}ms`);
        r.classList.add(r.classList.contains('me') ? 'rw-in-me' : 'rw-in');
        setTimeout(() => r.classList.remove('rw-in', 'rw-in-me'), 900 + i * 55);
      });
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 520);
    });
  });
}
