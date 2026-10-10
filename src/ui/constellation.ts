// The Khatm circle's ring as a 3D constellation (docs/light.md, L3), behind the flat SVG ring, which
// keeps the taps, keyboard focus and labels. three.js loads only here; if it cannot run, or the
// device proves too slow, the canvas is removed and the SVG ring shows as before.
import type { LightStage } from '../light/engine';
import type { StarState } from '../light/scenes/constellation';
import type { Quality } from '../light/support';
import { h } from './dom';

export interface Constellation {
  /** The canvas to put inside the ring box (kept across redraws). */
  canvas: HTMLCanvasElement;
  set(stars: StarState[]): void;
  /** Play the completion moment: all lights drift into one point that blooms open. */
  celebrate(): void;
  dispose(): void;
}

export async function mountConstellation(quality: Quality, onFallback: () => void): Promise<Constellation | null> {
  try {
    const [{ LightStage }, { constellationScene }] = await Promise.all([import('../light/engine'), import('../light/scenes/constellation')]);
    const canvas = h('canvas', { class: 'ring-sky', 'aria-hidden': 'true' });
    const sc = constellationScene(3);
    let stage: LightStage | null = null;
    const api: Constellation = {
      canvas,
      set(stars) { sc.input.stars = stars; },
      celebrate() { if (stage) sc.input.celebrateAt = stage.now(); },
      dispose() { stage?.dispose(); stage = null; canvas.remove(); },
    };
    stage = new LightStage(canvas, sc, { quality, onFallback: () => { api.dispose(); onFallback(); } });
    sc.input.openedAt = stage.now();
    // Start once the canvas is in the page (it has a size then).
    requestAnimationFrame(() => { stage?.resize(); stage?.start(); });
    return api;
  } catch {
    return null;
  }
}
