// The page's stretch at its top and bottom, without the tab bar (owner 2026-11-19: "I like the stretch, but not for
// nav"). The system stretch (Android 12+) pulls the whole view, fixed bars included, so it is switched off
// (overscroll-behavior in styles.css, OVER_SCROLL_NEVER in AppActivity) and made here instead: pulling past the end
// stretches the page's own content from that edge with resistance, and letting go springs it back. Only the screen's
// parts that scroll move (fixed and sticky bars, docks and the nav are left out); transform only, so the compositor does it.
import { springValues } from './juice';

const MAX = 0.07;          // the most it stretches (7 % of the screen)
const SOFT = 340;          // px of pull for ~63 % of that

export function initStretch() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let y0 = 0, edge: 0 | 1 | -1 = 0, parts: HTMLElement[] = [], k = 1, raf = 0, back: Animation[] = [];
  const atTop = () => scrollY <= 0;
  const atEnd = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 1;
  const skip = (t: EventTarget | null) => {
    const b = document.body;
    if (b.classList.contains('mushaf-mode') || b.dataset.view === 'reel' || document.querySelector('dialog[open], .cel')) return true;
    // A finger on something that scrolls on its own (a list in a sheet, a sideways strip) is left to it.
    for (let n = t instanceof Element ? t : null; n && n !== b; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  };
  const paint = () => {
    raf = 0;
    for (const p of parts) p.style.transform = k === 1 ? '' : `scaleY(${k.toFixed(4)})`;
  };
  const begin = (dir: 1 | -1) => {
    edge = dir;
    for (const a of back) a.cancel();
    back = [];
    const screen = document.querySelector('#app > .screen:not(.screen-kept):not(.screen-ghost)') ?? document.getElementById('app')?.lastElementChild;
    parts = screen ? [...screen.children].filter((c): c is HTMLElement => c instanceof HTMLElement
      && !/fixed|sticky/.test(getComputedStyle(c).position) && c.offsetHeight > 0) : [];
    const y = dir < 0 ? 0 : innerHeight;
    for (const p of parts) {
      const r = p.getBoundingClientRect();
      p.style.transformOrigin = `50% ${(y - r.top).toFixed(1)}px`;
      p.style.willChange = 'transform';
    }
  };
  const end = () => {
    if (!edge) return;
    edge = 0;
    cancelAnimationFrame(raf); raf = 0;
    const from = k; k = 1;
    const vs = springValues({ from, to: 1, stiffness: 380, damping: 26 });
    const done = parts;
    parts = [];
    back = done.map((p) => {
      p.style.transform = '';
      const a = p.animate(vs.map((v) => ({ transform: `scaleY(${v.toFixed(4)})` })), { duration: (vs.length - 1) * (1000 / 60), easing: 'linear' });
      a.onfinish = () => { p.style.willChange = ''; p.style.transformOrigin = ''; };
      return a;
    });
  };
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || skip(e.target)) { y0 = NaN; return; }
    y0 = e.touches[0].clientY;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (Number.isNaN(y0) || e.touches.length !== 1) return;
    const y = e.touches[0].clientY, dy = y - y0;
    if (!edge) {
      // The stretch starts where the page reached its end, so there is no jump.
      if (dy > 0 && atTop()) begin(-1);
      else if (dy < 0 && atEnd()) begin(1);
      else { y0 = y; return; }
      y0 = y;
      return;
    }
    const pull = edge < 0 ? Math.max(0, dy) : Math.max(0, -dy);
    k = 1 + MAX * (1 - Math.exp(-pull / SOFT));
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', end, { passive: true });
}
