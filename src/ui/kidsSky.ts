// The Kids path in 3D (docs/light.md, L7): a full-screen WebGL scene of the path winding away over a
// cloud sea. The 2D path's own stops (links with the surah names) are kept and placed every frame on
// their lantern's projection, scaled by distance, so taps, labels, keyboard focus and screen readers
// work exactly as before. Swipe up/down (or the wheel) glides the camera along the path; focusing
// a stop glides to it. three.js loads only here. Flat quality (reduced motion, battery saver, no
// WebGL), the parent's switch, or a device too slow for the scene → the 2D path, untouched.
import type { LightStage } from '../light/engine';
import { lightQuality } from '../light/support';
import { h } from './dom';

export async function mountKidsSky(root: HTMLElement, stops: HTMLElement[], lit: boolean[], next: number, bloom: number): Promise<() => void> {
  const quality = await lightQuality();
  if (quality === 'flat' || !root.isConnected || !stops.length) return () => {};
  let stage: LightStage | null = null;
  const canvas = h('canvas', { class: 'kids-sky-canvas', 'aria-hidden': 'true' });
  const saved = stops.map((el) => el.getAttribute('style') ?? '');
  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  const on = (el: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) => { el.addEventListener(type, fn, o); listeners.push([el, type, fn, o]); };
  const off = () => {
    stage?.dispose();
    stage = null;
    canvas.remove();
    root.classList.remove('kids-3d');
    stops.forEach((el, i) => { el.setAttribute('style', saved[i]); el.classList.remove('kids-far'); });
    for (const [el, type, fn, o] of listeners) el.removeEventListener(type, fn, o);
    listeners.length = 0;
  };
  try {
    const [{ LightStage }, { kidsPathScene }, { Vector3 }] = await Promise.all([import('../light/engine'), import('../light/scenes/kidsPath'), import('three')]);
    if (!root.isConnected) return () => {};
    const night = matchMedia('(prefers-color-scheme: dark)').matches;
    const sc = kidsPathScene(stops.length, night);
    const last = stops.length - 1;
    const start = bloom >= 0 ? bloom : next >= 0 ? next : last;
    Object.assign(sc.input, { focus: start, lit, next, bloom });
    let target = start;
    let vel = 0;
    let dragging = false;

    root.prepend(canvas);
    root.classList.add('kids-3d');
    scrollTo(0, 0);

    // --- place the stops on their lanterns ---
    const v = new Vector3(), cam = new Vector3();
    const place = () => {
      const W = innerWidth, H = innerHeight;
      sc.camera.updateMatrixWorld();
      cam.setFromMatrixPosition(sc.camera.matrixWorld);
      sc.lanterns.forEach((g, i) => {
        const el = stops[i];
        g.getWorldPosition(v);
        const dist = v.distanceTo(cam);
        v.project(sc.camera);
        const ahead = i - sc.input.focus;
        if (v.z > 1 || ahead < -0.95 || ahead > 9) {
          el.style.visibility = 'hidden';
          return;
        }
        const k = Math.min(1.15, Math.max(0.4, 5.9 / dist));
        const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
        el.style.cssText = `left:0;top:0;visibility:visible;z-index:${1000 - Math.round(dist * 10)};`
          + `transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${k.toFixed(3)}) translate(-50%,-50%);`
          + `opacity:${Math.min(1, Math.max(0, Math.min(1.6 - ahead * 0.17, (ahead + 0.95) / 0.6))).toFixed(2)}`;
        el.classList.toggle('kids-far', k < 0.72);
      });
    };

    stage = new LightStage(canvas, sc, {
      quality,
      beforeFrame: () => {
        if (!dragging) {
          target = Math.min(last, Math.max(0, target + vel));
          vel *= 0.9;
        }
        sc.input.focus += (target - sc.input.focus) * (dragging ? 0.25 : 0.07);
      },
      afterFrame: place,
      onFallback: () => { console.warn('Kids path: too slow for 3D, 2D path'); off(); },
    });
    if (bloom >= 0) {
      sc.input.bloomAt = stage.now() + 0.6;
      // After the bloom, glide on to the next lantern with Noor.
      if (next >= 0) window.setTimeout(() => { if (!dragging) target = next; }, 2200);
    }

    // --- glide along the path: swipe, wheel, keyboard focus ---
    let s = { y: 0, f: 0, moved: false };
    let lastY = 0, lastAt = 0;
    on(root, 'pointerdown', ((e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.kids-top, dialog')) return;
      dragging = true;
      vel = 0;
      s = { y: e.clientY, f: target, moved: false };
      lastY = e.clientY;
      lastAt = performance.now();
    }) as EventListener);
    on(root, 'pointermove', ((e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - s.y;
      if (Math.abs(dy) > 8) s.moved = true;
      target = Math.min(last, Math.max(0, s.f - dy / 150));
      const now = performance.now();
      vel = Math.max(-0.08, Math.min(0.08, (-(e.clientY - lastY) / 150) * (16 / Math.max(8, now - lastAt))));
      lastY = e.clientY;
      lastAt = now;
    }) as EventListener);
    const up = () => {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - lastAt > 90) vel = 0;
    };
    on(window, 'pointerup', up);
    on(window, 'pointercancel', up);
    // A swipe is not a tap on the lantern it started on.
    on(root, 'click', ((e: Event) => { if (s.moved) { e.preventDefault(); e.stopPropagation(); s.moved = false; } }) as EventListener, { capture: true });
    on(root, 'wheel', ((e: WheelEvent) => { e.preventDefault(); target = Math.min(last, Math.max(0, target + e.deltaY / 320)); }) as EventListener, { passive: false });
    stops.forEach((el, i) => on(el, 'focus', () => { target = i; }));
    stage.start();
  } catch (e) {
    console.warn('Kids path: 2D path', e);
    off();
  }
  return off;
}
