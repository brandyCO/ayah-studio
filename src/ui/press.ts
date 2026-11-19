// Press and release, Duolingo-style (motion engine 2026-11-19): a tappable thing sinks while held (CSS, styles.css
// "Butter pass") and on release springs back past its size and settles, a small boing. Loaded once the first screen
// is up; one listener for the whole app. Not on the mushaf page, in the studio or the Kids space (calm places), and
// never with reduced motion.
import { springValues } from './juice';
import { initStretch } from './stretch';

const SEL = '.primary, .chip, .icon-btn, .tab-btn, .me-tile, .claim-all, .claim-badge, .pace-opt, .bd-tile, .tb-btn, .lp-step, .sh-tile, .lk-choice, .rw-btn';
const CALM = '.mushaf-strip, .studio, [data-view="reel"], [data-view="kids"]';

export function initPress() {
  initStretch();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const vs = springValues({ from: 0.94, to: 1, stiffness: 420, damping: 13 });
  const frames = vs.map((v) => ({ scale: `${v.toFixed(4)}` }));
  const ms = (vs.length - 1) * (1000 / 60);
  let down: Element | null = null;
  addEventListener('pointerdown', (e) => {
    const t = (e.target as Element | null)?.closest?.(SEL);
    down = t && !t.closest(CALM) && !(t as HTMLButtonElement).disabled ? t : null;
  }, { passive: true, capture: true });
  addEventListener('pointerup', (e) => {
    const t = (e.target as Element | null)?.closest?.(SEL);
    if (!down || t !== down) { down = null; return; }
    down = null;
    // The individual `scale` property: it never fights the element's own transform, and wins over the CSS
    // press transition while it plays.
    t.animate(frames, { duration: ms, easing: 'linear' });
  }, { passive: true, capture: true });
  addEventListener('pointercancel', () => { down = null; }, { passive: true });
}
