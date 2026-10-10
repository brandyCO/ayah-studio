// Revision lamps as a 3D lantern field (docs/light.md, L4): drag to glide along the shore of juz,
// pinch (or the wheel) to come closer or see more, tap a lantern to pick its page. The camera glides
// to the picked page's juz. three.js loads only here; on failure the canvas grid is used.
import type { LightStage } from '../light/engine';
import type { LampState } from '../light/scenes/lampField';
import type { Quality } from '../light/support';
import { h } from './dom';
import { t } from '../i18n';

export interface LampField {
  el: HTMLElement;
  set(lamps: (LampState | undefined)[], selected: number): void;
  /** A lantern rises a little and brightens (Revised today / marked). */
  rise(page: number): void;
  dispose(): void;
}

export async function mountLampField(o: {
  quality: Quality;
  juzOfPage: number[];
  onPick(page: number): void;
  onFallback(): void;
}): Promise<LampField | null> {
  try {
    const [{ LightStage }, { lampFieldScene, juzX }] = await Promise.all([import('../light/engine'), import('../light/scenes/lampField')]);
    const canvas = h('canvas', { class: 'lamp-field-canvas', 'aria-hidden': 'true' });
    const label = h('div', { class: 'lamp-field-label' });
    const el = h('div', { class: 'lamp-field' }, canvas, label);
    const sc = lampFieldScene(o.juzOfPage, 2);
    let target = 0; // where the camera glides to (world x)
    let dragging = false;
    let shownJuz = 0;
    let first = true;
    const juzAt = (x: number) => Math.min(30, Math.max(1, Math.round(-x / 9) + 1));
    let stage: LightStage | null = null;
    stage = new LightStage(canvas, sc, {
      quality: o.quality,
      onFallback: () => { api.dispose(); o.onFallback(); },
      beforeFrame: () => {
        // Glide with a soft ease towards the target (never a jump).
        if (!dragging) sc.input.camX += (target - sc.input.camX) * 0.06;
        const j = juzAt(sc.input.camX);
        if (j !== shownJuz) { shownJuz = j; label.textContent = t('circ.juz', { n: j }); }
      },
    });

    // --- touch: drag to glide, pinch to zoom, tap to pick ---
    const pts = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0, cam: 0, dist: 7, pinch: 0, moved: false };
    const worldPerPx = () => (2 * sc.input.dist * 1.1 * Math.tan((sc.camera.fov * Math.PI) / 360)) / Math.max(1, canvas.clientHeight);
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()];
      start = { x: e.clientX, y: e.clientY, cam: sc.input.camX, dist: sc.input.dist, pinch: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, moved: pts.size > 1 };
      dragging = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()];
      if (b && start.pinch) {
        sc.input.dist = Math.min(14, Math.max(4, start.dist * (start.pinch / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)))));
        start.moved = true;
        return;
      }
      const dx = e.clientX - start.x;
      if (Math.abs(dx) > 6) start.moved = true;
      sc.input.camX = Math.min(juzX(1) + 4, Math.max(juzX(30) - 4, start.cam - dx * worldPerPx()));
      target = sc.input.camX;
    });
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size) return;
      dragging = false;
      if (!start.moved) pickAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) sc.input.dist = Math.min(14, Math.max(4, sc.input.dist * (1 + e.deltaY * 0.01)));
      else target = Math.min(juzX(1) + 4, Math.max(juzX(30) - 4, target - (e.deltaX || e.deltaY) * worldPerPx()));
    }, { passive: false });

    /** The lantern nearest to the tap on screen (within 30 px). */
    function pickAt(cx: number, cy: number) {
      const b = canvas.getBoundingClientRect();
      sc.camera.updateMatrixWorld();
      let best = 0, bestD = 30;
      const v = sc.positions[1].clone();
      for (let p = 1; p < sc.positions.length; p++) {
        v.copy(sc.positions[p]).project(sc.camera);
        if (v.z > 1) continue;
        const d = Math.hypot(b.left + ((v.x + 1) / 2) * b.width - cx, b.top + ((1 - v.y) / 2) * b.height - cy);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) o.onPick(best);
    }

    const api: LampField = {
      el,
      set(lamps, selected) {
        sc.input.lamps = lamps;
        if (selected !== sc.input.selected || first) target = sc.positions[selected]?.x ?? 0;
        if (first) sc.input.camX = target; // open right at the page, glide afterwards
        first = false;
        sc.input.selected = selected;
        sc.refresh();
      },
      rise(page) {
        if (!stage) return;
        sc.input.rose.set(page, stage.now());
        sc.refresh();
      },
      dispose() { stage?.dispose(); stage = null; el.remove(); },
    };
    requestAnimationFrame(() => { stage?.resize(); stage?.start(); });
    return api;
  } catch {
    return null;
  }
}
