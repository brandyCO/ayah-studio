// Lamps in the Learn tab (src/data/learnLamps.ts): the five lamps drawn in the reward art's flat style,
// a chip on the path's top bar, a row over a lesson's exercises (the last lit one dims with a wisp of
// smoke on a wrong answer) and the resting panel shown when none is lit. Everything here stays live:
// a lamp that comes back by itself lights up where it is shown.
import { LAMPS, LAMP_MINUTES, REFILL_PRICE, canRefill, lamps, refillLamps } from '../data/learnLamps';
import { thirsty, trees, wallet } from '../data/garden';
import { loadMeta } from '../data/quran';
import { surahName, t } from '../i18n';
import { lt } from '../i18n/learn';
import { h, haptic, toast } from './dom';
import { popIn, reduced, squash } from './juice';
import { sfx } from './sfx';

const NS = 'http://www.w3.org/2000/svg';
/** A small brass lamp: lit = a warm flame and a glow in its glass, dim = cold glass, no flame. */
export function lampArt(size = 26): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 30');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(Math.round(size * 1.25)));
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('lamp-art');
  s.innerHTML = '<circle class="lg" cx="12" cy="15" r="11"/>'
    + '<path class="lc" d="M8 6.5h8l-1.2 3H9.2z"/><path class="lc" d="M10.6 3.2h2.8v3.3h-2.8z"/>'
    + '<path class="lb" d="M7.6 9.5h8.8c.9 0 1.4.5 1.4 1.4v9.6c0 1.3-1 2.3-2.3 2.3H8.5c-1.3 0-2.3-1-2.3-2.3v-9.6c0-.9.5-1.4 1.4-1.4z"/>'
    + '<path class="lw" d="M8.8 11.4h6.4v8.8c0 .6-.4 1-1 1h-4.4c-.6 0-1-.4-1-1z"/>'
    + '<path class="lf" d="M12 12.6c1.6 1.8 2.3 3.2 2.3 4.6a2.3 2.3 0 0 1-4.6 0c0-1.4.7-2.8 2.3-4.6z"/>'
    + '<path class="lfi" d="M12 15.6c.7.8 1 1.4 1 2a1 1 0 0 1-2 0c0-.6.3-1.2 1-2z"/>'
    + '<path class="lc" d="M6.6 22.8h10.8l1 2.4H5.6z"/><path class="lh" d="M8.6 10.6h1.6v1.2H8.6z"/>';
  return s;
}

// One ticker for every lamp shown: repaints when lamps change here or on another tab, and once a few
// seconds while one is coming back (the countdown, and the lamp that comes back by itself).
const live = new Set<() => void>();
let tick = 0;
const onStorage = (e: StorageEvent) => { if (e.key === 'learnLamps') runAll(); };
function watch(paint: () => void, el: Element) {
  const f = () => { if (!el.isConnected) { live.delete(f); return; } paint(); };
  live.add(f);
  if (live.size === 1) {
    window.removeEventListener('lamps-changed', runAll);
    window.addEventListener('lamps-changed', runAll);
    window.removeEventListener('storage', onStorage);
    window.addEventListener('storage', onStorage);
  }
  if (!tick) tick = window.setInterval(() => { if (!live.size) { clearInterval(tick); tick = 0; return; } if (!document.hidden) runAll(); }, 5000);
  queueMicrotask(f);
}
function runAll() { for (const f of [...live]) f(); }

/** "12 min" / "45 s" until the next lamp. */
export function untilNext(): string {
  const { next } = lamps();
  if (next === null) return '';
  const ms = Math.max(0, next - Date.now());
  const m = Math.ceil(ms / 60_000);
  return m >= 2 ? lt('learn.min', { m }) : lt('learn.sec', { s: Math.max(1, Math.ceil(ms / 1000)) });
}

/** Five lamps in a row; the last lit one dims with a wisp of smoke when one goes out. */
export function lampRow(cls = ''): HTMLElement {
  const items = Array.from({ length: LAMPS }, () => h('i', { class: 'lamp' }, lampArt(22)));
  const row = h('span', { class: `lamps ${cls}`, role: 'img' }, ...items);
  let shown = -1;
  watch(() => {
    const { n } = lamps();
    if (n === shown) return;
    items.forEach((el, k) => el.classList.toggle('out', k >= n));
    if (shown > n && !reduced()) {
      for (let k = n; k < shown && k < LAMPS; k++) {
        const el = items[k];
        el.classList.remove('dimming'); void el.offsetWidth; el.classList.add('dimming');
        setTimeout(() => el.classList.remove('dimming'), 1300);
      }
    } else if (shown >= 0 && n > shown && !reduced()) for (let k = shown; k < n; k++) popIn(items[k]);
    shown = n;
    row.setAttribute('aria-label', lt('learn.lampsAria', { n, of: LAMPS }));
  }, row);
  return row;
}

/** The path's top-bar chip: one lamp and how many are lit; a tap explains them. */
export function lampChip(): HTMLElement {
  const num = h('span', {});
  const btn = h('button', { class: 'lp-pill lp-lamps', type: 'button', onclick: () => { haptic(); squash(btn, 0.1); lampSheet(); } }, lampArt(18), num);
  watch(() => {
    const { n } = lamps();
    num.textContent = `${n}/${LAMPS}`; // G6: "5/5" never reads as Light
    btn.classList.toggle('none', n === 0);
    btn.setAttribute('aria-label', lt('learn.lampsAria', { n, of: LAMPS }));
  }, btn);
  return btn;
}

/** Where a lamp can be earned now: a thirsty tree first, then the surah reviewed longest ago. */
function earnTarget(skip?: number): number | null {
  const learned = trees().filter((t) => t.learned > 0 && t.s !== skip);
  const dry = learned.filter((t) => thirsty(t)).sort((a, b) => a.water - b.water);
  const any = (dry.length ? dry : learned.sort((a, b) => a.water - b.water))[0];
  return any?.s ?? null;
}

/**
 * The ways a lamp comes back: waiting (a countdown), practising what was learned (+1), or all five
 * for Light. `review` reviews in place (a lesson resting on a new chunk reviews its own surah first).
 */
export function lampWays(opts: { surah?: number; review?: (s: number) => void; refilled?: () => void } = {}): HTMLElement {
  const box = h('div', { class: 'lamp-ways' });
  const wait = h('p', { class: 'lamp-wait' });
  const review = h('div', { class: 'lamp-earn' });
  const refill = h('button', { class: 'lamp-btn refill', type: 'button', onclick: () => {
    if (!refillLamps()) { toast(lt('learn.lampsNoLight', { n: REFILL_PRICE })); return; }
    haptic(20); sfx.pop(4);
    toast(lt('learn.lampsRefilled'));
    opts.refilled?.();
  } });
  box.append(wait, review, refill);
  void loadMeta().then((meta) => {
    const s = opts.surah && trees().some((t) => t.s === opts.surah && t.learned > 0) ? opts.surah : earnTarget();
    review.replaceChildren(
      s ? h('a', { class: 'lamp-btn review', href: `#/learn/${s}/review`, onclick: (e: Event) => { if (opts.review) { e.preventDefault(); opts.review(s); } } },
        lt('learn.lampsEarn', { name: surahName(meta[s - 1]) })) : '',
      h('a', { class: 'lamp-btn ghost', href: '#/learn/pages' }, lt('learn.lampsEarnPages')));
  });
  watch(() => {
    const { n } = lamps();
    wait.textContent = n >= LAMPS ? lt('learn.lampsFull') : lt('learn.lampsNext', { t: untilNext() });
    refill.textContent = '';
    refill.append(lt('learn.lampsRefill', { n: REFILL_PRICE }));
    refill.disabled = n >= LAMPS;
    refill.classList.toggle('short', n < LAMPS && !canRefill());
    refill.title = wallet() < REFILL_PRICE ? lt('learn.lampsNoLight', { n: REFILL_PRICE }) : '';
  }, box);
  return box;
}

/** What lamps are, how many are lit and how they come back. */
export function lampSheet() {
  const d = h('dialog', { class: 'sheet bottom learn-sheet lamp-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, lt('learn.lampsTitle')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    lampRow('big'),
    h('p', {}, lt('learn.lampsBody')),
    h('p', { class: 'muted small' }, lt('learn.lampsDay', { m: LAMP_MINUTES })),
    lampWays({ refilled: () => d.close() }));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  window.addEventListener('hashchange', () => d.close(), { once: true });
  document.body.append(d);
  d.showModal();
}

/**
 * The resting panel: no lamp is lit. `resume` runs once one is (by itself, earned or refilled);
 * `recite` (inside a lesson) goes on to reciting from memory, which never needs a lamp.
 */
export function lampsOut(opts: { surah?: number; resume: () => void; recite?: () => void; review?: (s: number) => void; back?: boolean }): HTMLElement {
  const go = h('button', { class: 'lamp-btn go', type: 'button', hidden: true, onclick: () => opts.resume() }, lt('learn.lampsGo'));
  const panel = h('section', { class: 'lamp-out', 'aria-live': 'polite' },
    h('div', { class: 'lamp-out-art' }, lampArt(64)),
    h('h2', {}, lt('learn.lampsOutTitle')),
    h('p', { class: 'muted' }, lt('learn.lampsOutSub')),
    go,
    opts.recite ? h('button', { class: 'lamp-btn recite', type: 'button', onclick: () => opts.recite!() }, lt('learn.lampsRecite')) : '',
    lampWays({ surah: opts.surah, review: opts.review, refilled: () => opts.resume() }),
    opts.back ? h('a', { class: 'lamp-btn ghost', href: '#/learn' }, lt('learn.backToPath')) : '');
  let was = 0;
  watch(() => {
    const { n } = lamps();
    go.hidden = n === 0;
    panel.classList.toggle('lit', n > 0);
    if (n > 0 && was === 0 && !reduced()) popIn(go);
    was = n;
  }, panel);
  return panel;
}

/** "4 min 12 s" for the celebration (time spent in a lesson). */
export function spentLabel(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m === 0 ? lt('learn.sec', { s }) : s === 0 || m >= 10 ? lt('learn.min', { m: s >= 30 && m >= 10 ? m + 1 : m }) : lt('learn.minSec', { m, s });
}
