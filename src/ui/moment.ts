// Light moments in the UI (docs/light.md, L5): a short full-screen scene that can always be tapped
// away, and calm 3D backdrops behind a screen's content. three.js loads only when one is used; with
// reduced motion, battery saver, no WebGL or a slow device they fall back to a soft CSS glow (or
// nothing), never a broken screen.
import type { MomentId } from '../light/scenes/moments';
import { lightQuality } from '../light/support';
import { h } from './dom';

/** Plays a moment over `parent` (a dialog's top layer, or the page). Resolves when it ends or is tapped. */
export async function playMoment(id: MomentId, o: { parent?: HTMLElement; inline?: boolean; seconds: number; caption?: string }): Promise<void> {
  const quality = await lightQuality();
  const caption = o.caption ? h('p', { class: 'light-moment-caption' }, o.caption) : null;
  const root = h('div', { class: `light-moment${o.inline ? ' inline' : ''}${quality === 'flat' ? ' flat' : ''}`, role: 'presentation' }, ...(caption ? [caption] : []));
  (o.parent ?? document.body).append(root);
  let dispose = () => {};
  let ms = o.seconds * 1000;
  if (quality === 'flat') {
    ms = Math.min(ms, 1400); // a short soft glow instead of the scene
  } else {
    try {
      const [{ LightStage }, { MOMENTS }] = await Promise.all([import('../light/engine'), import('../light/scenes/moments')]);
      const canvas = h('canvas', { class: 'light-moment-canvas', 'aria-hidden': 'true' });
      root.prepend(canvas);
      const stage = new LightStage(canvas, MOMENTS[id](1), { quality, onFallback: () => { stage.dispose(); canvas.remove(); root.classList.add('flat'); } });
      requestAnimationFrame(() => { stage.resize(); stage.start(); });
      dispose = () => stage.dispose();
    } catch {
      root.classList.add('flat');
    }
  }
  return new Promise((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('hashchange', end);
      root.classList.add('out');
      setTimeout(() => { dispose(); root.remove(); }, 700);
      resolve();
    };
    const timer = setTimeout(end, ms);
    root.addEventListener('click', end);
    window.addEventListener('hashchange', end);
  });
}

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
