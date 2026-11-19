// "Joining your league" (owner request 2026-11-19, redone after "make it premium, Duolingo style, about ranks"): the
// first time Ranks has nothing kept on this device (just signed in, or a new phone), the wait for the league becomes
// the league itself arriving. The five league emblems pop in in a row, the row glides to the user's league, which
// grows with turning rays; under it fifteen empty seats fill with readers one by one (the loading bar, paced by the
// real load), the last seat is the user's own, it lands with a bounce and "You're in!", and the screen opens on the
// league. At least ~2.6 s so it reads, at most ~4.2 s (the league then finishes loading behind it). Transform and
// opacity only, so it keeps 60 fps on slow phones.
import './rankJoin.css';
import { tierEmblem } from './rankMoment';
import { avatar } from './rankAvatars';
import { encode, random } from './figure';
import { actor, myFigureCode } from './actor';
import { rt, type RankKey } from '../i18n/ranks';
import { h } from './dom';
import { sfx } from './sfx';

const SEATS = 15, ME = 7;           // a league of 15; the user's seat is in the middle of the grid
const LAND_MIN = 2600, LAND_MAX = 4200;
const tierKey = ['lantern', 'star', 'moon', 'dawn', 'sun'];
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

/** Plays over Ranks until `done` settles (within the limits above); `tier()` names the league once it is known. */
export function joinReveal(done: Promise<unknown>, tier: () => number | null): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sel = Math.max(0, Math.min(4, tier() ?? 0));
  const ems = [0, 1, 2, 3, 4].map((i) => h('span', { class: 'rj-em', style: `--i:${i}` }, tierEmblem(i)));
  const rays = h('span', { class: 'rj-rays', 'aria-hidden': 'true' });
  const row = h('div', { class: 'rj-row', 'aria-hidden': 'true' }, rays, ...ems);
  const name = h('h2', {});
  const sub = h('p', { class: 'rj-sub' }, rt('rk.joinSub'));
  const count = h('span', { class: 'rj-count' });
  // Fifteen seats: fourteen readers, each a character of their own (owner 2026-11-19: "not profiles that aren't
  // characters"; made up, different every time: they stand for the readers being found), and the user's own, last.
  // Each character is drawn once into a picture (decoded off the main thread), so the seats popping in never
  // redraw fourteen detailed drawings on a slow phone.
  const pic = (svg: Element, size: number) => {
    const img = h('img', { width: String(size), height: String(size), alt: '', decoding: 'async',
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg.querySelector("svg") ?? svg))}` });
    void img.decode().catch(() => {});
    return img;
  };
  const seats = Array.from({ length: SEATS }, (_, i) => {
    const who = h('span', { class: 'rj-pic' });
    const burst = i === ME ? h('span', { class: 'rj-burst', 'aria-hidden': 'true' }, ...Array.from({ length: 10 }, (_, k) => h('i', { style: `--a:${k * 36 + 18}deg` }))) : '';
    return h('span', { class: `rj-seat${i === ME ? ' me' : ''}` }, burst, h('span', { class: 'rj-who' }, who),
      i === ME ? h('b', { class: 'rj-you' }, rt('rk.you' as RankKey)) : '');
  });
  const grid = h('div', { class: 'rj-grid', 'aria-hidden': 'true' }, ...seats);
  // The characters are drawn a few at a time while the emblems play, never all in one long task.
  const draw = (i: number) => seats[i].querySelector('.rj-pic')!.replaceWith(
    pic(i === ME ? avatar(0, sel, 56, 0, myFigureCode()) : avatar(i + 1, sel, 52, 0, encode(random(0))), i === ME ? 56 : 52));
  let drawn = 0;
  const drawSome = () => { const end = Math.min(SEATS, drawn + 2); while (drawn < end) draw(drawn++); if (drawn < SEATS) setTimeout(drawSome, 40); };
  const drawAll = () => { while (drawn < SEATS) draw(drawn++); };
  // The user's own character waits under the seats, watching them fill, and cheers when its seat is taken.
  const me = still || !myFigureCode() ? null : actor('rj-actor');
  const el = h('div', { class: `rj${still ? ' still' : ''}`, role: 'status', 'aria-live': 'polite', 'aria-label': rt('rk.joinTitle') },
    h('span', { class: 'rj-bg', 'aria-hidden': 'true' }, h('span', { class: 'rj-glow' })),
    h('p', { class: 'rj-kick' }, rt('rk.joinKicker')), row,
    h('div', { class: 'rj-text' }, name, sub), grid, count, me ? h('div', { class: 'rj-me' }, me.el) : '');

  const place = () => {
    ems.forEach((e, i) => { e.style.setProperty('--d', String(i - sel)); e.classList.toggle('sel', i === sel); });
    name.textContent = rt(`rk.tier.${tierKey[sel]}` as RankKey);
  };
  place();
  let filled = 0;
  const paintCount = () => { count.textContent = rt('rk.joinCount', { n: filled, of: SEATS }); };
  paintCount();
  // The order readers arrive in: every seat but the user's, shuffled; the user's comes last.
  const order = Array.from({ length: SEATS }, (_, i) => i).filter((i) => i !== ME).sort(() => Math.random() - 0.5);
  const fill = (i: number) => {
    seats[i].classList.add('on');
    filled++; paintCount();
    if (!still && filled % 3 === 0) sfx.pop(filled % 5);
    if (me && filled % 5 === 0) me.glance(filled % 10 ? 1 : -1);
  };

  document.body.append(el);
  const t0 = performance.now();
  const timers: number[] = [];
  const at = (ms: number, f: () => void) => { timers.push(window.setTimeout(f, Math.max(0, ms - (performance.now() - t0)))); };

  if (still) { drawAll(); order.forEach(fill); }
  else {
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('go'); setTimeout(drawSome, 60); }));
    at(900, () => { el.classList.add('focus'); sfx.shimmer(); vibrate(8); });
    at(1250, () => { drawAll(); el.classList.add('seats'); });
  }
  // Readers arrive at a steady pace up to the last three; those wait for the league to load.
  let next = 0;
  const pace = () => {
    if (next < order.length - 3) { fill(order[next++]); at(1450 + next * 95, pace); }
  };
  if (!still) at(1450, pace);

  let loaded = false;
  void done.then(() => { loaded = true; }, () => { loaded = true; });

  return new Promise((resolve) => {
    let state: 'wait' | 'landing' | 'closed' = 'wait';
    const close = () => {
      if (state === 'closed') return;
      state = 'closed';
      timers.forEach(clearTimeout);
      // The user's seat flies to their own row in the league now painted underneath, so the reveal becomes the
      // screen: everything else fades away round it.
      const row = document.querySelector<HTMLElement>('.rk-row.me');
      const to = row?.querySelector('svg')?.getBoundingClientRect();
      const from = seats[ME].querySelector('.rj-who > *')?.getBoundingClientRect();
      let ms = still ? 0 : 380;
      if (!still && to && from && to.width && to.top > 0 && to.bottom < innerHeight) {
        const k = to.width / from.width;
        const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
        seats[ME].style.setProperty('--fly', `translate(${dx}px, ${dy}px) scale(${k})`);
        el.classList.add('fly');
        ms = 620;
        setTimeout(() => { row?.classList.add('rj-arrived'); setTimeout(() => row?.classList.remove('rj-arrived'), 900); }, 520);
      }
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, ms);
    };
    const land = () => {
      if (state !== 'wait') return;
      state = 'landing';
      const n = tier();
      if (n !== null && n !== sel) { sel = Math.max(0, Math.min(4, n)); place(); }
      // The last readers sit down quickly, then the user's own seat.
      const rest = order.slice(next); next = order.length;
      rest.forEach((i, k) => at(performance.now() - t0 + k * 80, () => fill(i)));
      at(performance.now() - t0 + rest.length * 80 + 120, () => {
        filled++; paintCount();
        seats[ME].classList.add('on');
        el.classList.add('landed');
        sub.textContent = rt('rk.joinIn');
        if (!still) { sfx.pop(4, true); vibrate([14, 40, 18]); }
        me?.cheer(1300); me?.face('happy', 1600);
        at(performance.now() - t0 + (still ? 500 : 1000), close);
      });
    };
    const check = () => {
      const t = performance.now() - t0;
      if ((loaded && t >= LAND_MIN) || t >= LAND_MAX) land(); else timers.push(window.setTimeout(check, 60));
    };
    if (still) { void done.finally(() => setTimeout(land, 300)); setTimeout(land, 2000); }
    else check();
    el.addEventListener('click', () => { if (state === 'landing' || performance.now() - t0 > LAND_MIN + 600) close(); });
  });
}
