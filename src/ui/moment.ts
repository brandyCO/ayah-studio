// Light moments in the UI (docs/light.md, L5): calm 3D backdrops behind a screen's content. three.js loads only when one is used; with
// reduced motion, battery saver, no WebGL or a slow device they fall back to a soft CSS glow (or
// nothing), never a broken screen.
import type { MomentId } from '../light/scenes/moments';
import { lightQuality } from '../light/support';
import { h } from './dom';

/** A calm 3D scene behind `host`'s content (position: relative host). Returns a disposer. */
export function lightBackdrop(host: HTMLElement, id: MomentId): () => void {
  let dispose: (() => void) | null = null;
  let gone = false;
  void (async () => {
    const quality = await lightQuality();
    if (quality === 'flat' || gone) return;
    try {
      const [{ LightStage }, { MOMENTS }] = await Promise.all([import('../light/engine'), import('../light/scenes/moments')]);
      if (gone) return;
      const canvas = h('canvas', { class: 'light-backdrop', 'aria-hidden': 'true' });
      host.prepend(canvas);
      host.classList.add('has-light');
      const stage = new LightStage(canvas, MOMENTS[id](1), {
        quality,
        onFallback: () => { stage.dispose(); canvas.remove(); host.classList.remove('has-light'); },
      });
      requestAnimationFrame(() => { stage.resize(); stage.start(); });
      dispose = () => { stage.dispose(); canvas.remove(); host.classList.remove('has-light'); };
    } catch { /* stays as it was */ }
  })();
  return () => { gone = true; dispose?.(); };
}
