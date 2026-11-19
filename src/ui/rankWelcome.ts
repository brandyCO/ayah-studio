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
import { springValues } from './juice';

// Real spring physics (owner 2026-11-19: "not smooth and satisfying the squashing"): every bounce here is
// simulated once and played as keyframes at 60 a second, so it squashes on impact, stretches back, wobbles and
// settles like a body, not along a fixed curve.
const F = 1000 / 60;
/** The emblem falls (accelerating, stretched by its speed), hits the ground, squashes flat, springs back up a
 *  little, stretches, and settles with a jelly wobble. */
function dropFrames(): Keyframe[] {
  const out: Keyframe[] = [];
  const fall = 17, h0 = 240;                                   // ~0.28 s of fall from 240 px up
  for (let i = 0; i <= fall; i++) {
    const p = i / fall, y = -h0 * (1 - p * p), st = 1 + 0.16 * p * p;
    out.push({ transform: `translateY(${y.toFixed(1)}px) scale(${(1 / st).toFixed(3)}, ${st.toFixed(3)})`, opacity: Math.min(1, p * 3) });
  }
  // After the hit: the squash (d) and a small rebound (y) are two springs played together.
  const d = springValues({ from: 1, to: 0, stiffness: 380, damping: 9 });
  const y = springValues({ from: 0, to: 0, v0: -520, stiffness: 260, damping: 15 });
  const n = Math.max(d.length, y.length);
  for (let i = 1; i < n; i++) {
    const dd = d[Math.min(i, d.length - 1)] * 0.26, yy = y[Math.min(i, y.length - 1)];
    out.push({ transform: `translateY(${yy.toFixed(1)}px) scale(${(1 + dd).toFixed(3)}, ${(1 - dd).toFixed(3)})`, opacity: 1 });
  }
  return out;
}
const play = (el: Element, frames: Keyframe[], delay = 0) => el.animate(frames, { duration: (frames.length - 1) * F, delay, fill: 'both', easing: 'linear' });
/** Rises into place from `dy` px below with an overshoot. */
const rise = (dy: number, k = 300, c = 17, scale0 = 1) => springValues({ from: 1, to: 0, stiffness: k, damping: c })
  .map((v, i, a) => ({ transform: `translateY(${(dy * v).toFixed(1)}px) scale(${(1 + (scale0 - 1) * v).toFixed(3)})`, opacity: Math.min(1, (i / a.length) * 6) }));
/** A pop: scale from `s0` to 1 with an overshoot, squashing a little as it lands. */
const pop = (s0: number, k = 420, c = 12) => springValues({ from: s0, to: 1, stiffness: k, damping: c })
  .map((v) => ({ transform: `scale(${(v + (v - 1) * 0.35).toFixed(3)}, ${(v - (v - 1) * 0.35).toFixed(3)})` }));

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
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('go');
      play(em.firstElementChild!, dropFrames(), 60);
      play(el.querySelector('.rw-text')!, rise(28), 520);
      play(el.querySelector('.rw-foot')!, rise(36), 680);
    }));
    setTimeout(() => { sfx.pop(2); vibrate(12); }, 60 + 17 * F);      // the emblem hits the ground
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
    if (!still) { play(btn, pop(0.86)); play(em.firstElementChild!, pop(0.92, 360, 10)); sfx.shimmer(); vibrate(8); me?.hop(0.8); setTimeout(() => me?.cheer(1200), 380); } // one hop, never two in a row (owner 2026-11-19)
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
        const mine = r.classList.contains('me');
        const fr = rise(mine ? 44 : 34, mine ? 260 : 320, mine ? 13 : 18, mine ? 0.92 : 1);
        const a = r.animate(fr, { duration: (fr.length - 1) * F, delay: 120 + i * 55, fill: 'backwards', easing: 'linear' });
        a.onfinish = () => a.cancel();
      });
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 520);
    });
  });
}
