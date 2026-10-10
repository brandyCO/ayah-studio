// The Khatm circle's ring as a 3D constellation (docs/light.md, L3): a halo of 30 stars lying back
// in the sky, turning slowly. The juz labels (numbers / member initials) follow their stars on
// screen, scaled by distance; a tap picks the nearest star; a sideways drag turns the ring (with a
// soft glide), a mouse drag also tilts it. The flat SVG ring stays in the page for keyboard focus
// and screen readers (focusing a juz rings its star). three.js loads only here; if it cannot run,
// or the device proves too slow, the canvas goes and the SVG ring shows as before.
import type { LightStage } from '../light/engine';
import type { StarState } from '../light/scenes/constellation';
import type { Quality } from '../light/support';
import { h } from './dom';

export interface Constellation {
  /** The canvas and the label layer to put inside the ring box (kept across redraws). */
  canvas: HTMLCanvasElement;
  labels: HTMLElement;
  set(stars: StarState[], labels: string[]): void;
  /** Keyboard focus moved to a juz (0: none). */
  focus(juz: number): void;
  /** Play the completion moment: all lights drift into one point that blooms open. */
  celebrate(): void;
  dispose(): void;
}

export async function mountConstellation(quality: Quality, onFallback: () => void, onPick: (juz: number) => void): Promise<Constellation | null> {
  try {
    const [{ LightStage }, { constellationScene, TILT_MIN, TILT_MAX }, { Vector3 }] = await Promise.all([
      import('../light/engine'), import('../light/scenes/constellation'), import('three')]);
    const canvas = h('canvas', { class: 'ring-sky', 'aria-hidden': 'true' });
    const labels = h('div', { class: 'ring-sky-labels', 'aria-hidden': 'true' });
    const spans = Array.from({ length: 30 }, () => labels.appendChild(h('span', { class: 'ring-sky-label' })));
    const sc = constellationScene(3);
    let stage: LightStage | null = null;
    let vel = 0, dragging = false;
    const v = new Vector3();

    const place = () => {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W) return;
      sc.camera.updateMatrixWorld();
      sc.cores.forEach((core, i) => {
        core.getWorldPosition(v);
        const z = v.z;
        v.project(sc.camera);
        const k = Math.min(1.25, Math.max(0.7, 1 + z * 0.12)); // nearer → larger
        const el = spans[i];
        const o = Math.min(1, Math.max(0, core.material.opacity * 1.4)) * (0.45 + 0.55 * Math.min(1, Math.max(0, (z + 3) / 6)));
        el.style.transform = `translate(${(((v.x + 1) / 2) * W).toFixed(1)}px, ${(((1 - v.y) / 2) * H + 11 * k).toFixed(1)}px) translate(-50%, 0) scale(${k.toFixed(3)})`;
        el.style.opacity = o.toFixed(2);
        el.style.zIndex = String(100 + Math.round(z * 10));
      });
    };

    const api: Constellation = {
      canvas, labels,
      set(stars, text) {
        sc.input.stars = stars;
        text.forEach((s, i) => { if (spans[i] && spans[i].textContent !== s) spans[i].textContent = s; });
        stars.forEach((s, i) => spans[i]?.classList.toggle('mine', s.mine));
      },
      focus(juz) { sc.input.focus = juz; },
      celebrate() { if (stage) sc.input.celebrateAt = stage.now(); },
      dispose() { stage?.dispose(); stage = null; canvas.remove(); labels.remove(); },
    };
    stage = new LightStage(canvas, sc, {
      quality,
      onFallback: () => { api.dispose(); onFallback(); },
      beforeFrame: () => {
        if (!dragging) { sc.input.spin += vel; vel *= 0.94; }
      },
      afterFrame: place,
    });
    sc.input.openedAt = stage.now();

    // --- touch: a sideways drag turns the ring, a tap picks the nearest star ---
    let s = { x: 0, y: 0, spin: 0, tilt: 0, moved: false, mouse: false }, lastX = 0, lastAt = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      vel = 0;
      s = { x: e.clientX, y: e.clientY, spin: sc.input.spin, tilt: sc.input.tilt, moved: false, mouse: e.pointerType === 'mouse' };
      lastX = e.clientX;
      lastAt = performance.now();
      if (s.mouse) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) > 7) s.moved = true;
      sc.input.spin = s.spin + dx * 0.009;
      if (s.mouse) sc.input.tilt = Math.min(TILT_MAX, Math.max(TILT_MIN, s.tilt + dy * 0.004));
      const now = performance.now();
      vel = Math.max(-0.04, Math.min(0.04, ((e.clientX - lastX) * 0.009 * 16) / Math.max(8, now - lastAt)));
      lastX = e.clientX;
      lastAt = now;
    });
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - lastAt > 90) vel = 0;
      if (!s.moved && e.type === 'pointerup') pickAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    function pickAt(cx: number, cy: number) {
      const b = canvas.getBoundingClientRect();
      sc.camera.updateMatrixWorld();
      let best = 0, bestD = 34;
      sc.cores.forEach((core, i) => {
        core.getWorldPosition(v).project(sc.camera);
        const d = Math.hypot(b.left + ((v.x + 1) / 2) * b.width - cx, b.top + ((1 - v.y) / 2) * b.height - cy);
        if (d < bestD) { bestD = d; best = i + 1; }
      });
      if (best) onPick(best);
    }

    // Start once the canvas is in the page (it has a size then).
    requestAnimationFrame(() => { stage?.resize(); stage?.start(); });
    return api;
  } catch {
    return null;
  }
}
