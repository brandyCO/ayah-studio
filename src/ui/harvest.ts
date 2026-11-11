// The harvest (owner request 2026-11-11): when several goal chests wait on Me, "Open all" plays them in one moment.
// The chests stand in a row; one after another each jolts, bursts open with its own sound and vibration (by
// tier), and its Light flies down into one total that climbs, faster with each chest. Your character watches
// and cheers at the end. Every chest shows what it holds (nothing random). A tap plays the rest at once.
// Reduced motion: the open chests and the total at once.
import { h } from './dom';
import { t } from '../i18n';
import { chestArt, chestTier } from './chest';
import { sparks, type Sparks } from './sparks';
import { rewardPalette, rgba } from './theme';
import { bump, holdPage, popIn, squash, tick } from './juice';
import { actor as makeActor } from './actor';
import { sfx } from './sfx';
import { mt } from '../i18n/moments';
import { fpsStart } from '../fps';
import { flyLight } from './celebrate';
import './chest.css';
import './cel.css';
import './harvest.css';

export interface HarvestItem { label: string; light: number }

export function harvest(items: HarvestItem[]): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = rewardPalette();
  const total = items.reduce((a, b) => a + b.light, 0);
  return new Promise((resolve) => {
    const frames = still ? null : fpsStart('Harvest');
    const ok = h('button', { class: 'cel-ok' }, t('cel.ok'));
    const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
    const chests = items.map((it) => {
      const c = h('div', { class: `hv-ch t${chestTier(it.light)}` }, chestArt(chestTier(it.light)), h('span', { class: 'hv-n' }, `+${it.light}`));
      c.setAttribute('aria-label', `${it.label} · +${it.light}`);
      return c;
    });
    const sum = h('b', {}, `+${still ? total : 0}`);
    const now = h('p', { class: 'hv-now', 'aria-live': 'polite' }, '');
    const totalEl = h('div', { class: 'hv-total' }, h('span', { class: 'cel-orb' }), sum, h('span', {}, ` ${t('me.light')}`));
    const row = h('div', { class: `hv-row${items.length > 4 ? ' many' : ''}` }, ...chests);
    const el = h('div', { class: `cel go cel-harvest${still ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': mt('hv.title') },
      canvas,
      h('div', { class: 'cel-text' }, h('p', { class: 'cel-kicker' }, mt('hv.kicker')), h('h2', {}, mt('hv.title', { n: items.length }))),
      row, now, totalEl, ok);
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    let fx: Sparks | null = null, done = false, finished = false, shown = 0;
    const close = () => {
      if (done) return;
      done = true;
      frames?.();
      timers.forEach(clearTimeout);
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      holdPage(false);
      if (!still) { flyLight(totalEl, chestTier(total)); sfx.whoosh(); }
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const me = makeActor('hv-actor');
    if (me) el.append(me.el);
    const k = () => canvas.getBoundingClientRect();
    const centre = (n: Element) => { const r = n.getBoundingClientRect(), c = k(); return [r.left + r.width / 2 - c.left, r.top + r.height / 2 - c.top] as const; };
    // Light flies from a chest down into the total as a few small lights.
    const fly = (from: Element, n: number) => {
      const a = from.getBoundingClientRect(), b = sum.getBoundingClientRect();
      for (let i = 0; i < n; i++) {
        const d = h('i', { class: 'hv-dot' });
        d.style.left = `${a.left + a.width / 2 - 5}px`; d.style.top = `${a.top + a.height * 0.4 - 5}px`;
        el.append(d);
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height * 0.4);
        const bend = (Math.random() - 0.5) * 120;
        d.animate([
          { translate: '0 0', scale: '.4', opacity: 0 },
          { translate: `${dx * 0.3 + bend}px ${dy * 0.15 - 60}px`, scale: '1.2', opacity: 1, offset: 0.35 },
          { translate: `${dx}px ${dy}px`, scale: '.6', opacity: 0.9 },
        ], { duration: 520 + i * 40, delay: i * 35, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'both' }).finished.then(() => d.remove(), () => d.remove());
      }
    };
    let running = 0;
    const openOne = (i: number) => {
      const c = chests[i], tier = chestTier(items[i].light);
      squash(c.querySelector('.ck-art')!, 0.25, { stiffness: 380, damping: 12 });
      c.classList.add('open');
      now.textContent = items[i].label;
      bump(now, 0.2);
      sfx.open(0, tier);
      const [x, y] = centre(c);
      fx?.burst(x, y - 6, 26 + tier * 10, 0.6 + tier * 0.08);
      later(220, () => {
        fly(c, 4 + tier);
        sfx.pop(i);
        const from = running;
        running += items[i].light;
        later(480, () => { tick(sum, running, { from, ms: 380, prefix: '+', onPop: () => sfx.tick() }); squash(totalEl, 0.18); });
      });
      if (i % 2) me?.hop(0.3 + 0.5 * (i / items.length));
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
      chests.forEach((c) => c.classList.add('open'));
      sum.textContent = `+${total}`;
      el.classList.add('done');
      bump(totalEl, 0.35);
      const [x, y] = centre(totalEl);
      fx?.burst(x, y, 70 + Math.min(4, chestTier(total)) * 16, 1.05);
      fx?.motes(true);
      sfx.shimmer();
      me?.cheer(2400);
      ok.focus({ preventScroll: true });
    };
    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => {
      if (e.target === ok) return;
      if (!finished) { finish(); return; }
      close();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    holdPage(true);
    if (still) { finished = true; chests.forEach((c) => c.classList.add('open')); el.classList.add('done'); ok.focus({ preventScroll: true }); return; }
    fx = sparks(canvas, [rgba(P.n1, 1), rgba(P.n2, 1), rgba(P.n3, 1), rgba(P.hi, 1), rgba(P.core, 1)]);
    chests.forEach((c, i) => popIn(c, { delay: 120 + i * 90 })?.effect?.updateTiming({ fill: 'backwards' }));
    // Each chest a little sooner than the one before: the rhythm quickens into the total.
    let at = 700 + chests.length * 90, gap = 760;
    chests.forEach((_, i) => { later(at, () => { shown = i + 1; openOne(i); }); at += gap; gap = Math.max(300, gap * 0.82); });
    later(at + 500, () => { if (shown === chests.length) finish(); });
    ok.focus({ preventScroll: true });
  });
}
