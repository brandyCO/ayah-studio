// Light particles for the reward moments (celebrate.ts), drawn by src/ui/sparksCore.ts.
// Speed (owner 2026-11-10, "60fps, every animation"): the particles are drawn in a worker on an OffscreenCanvas,
// so clearing and drawing a full-screen canvas every frame no longer takes the main thread's time from the
// moment's own animations. One worker for all moments, started with this module; without OffscreenCanvas the
// same engine runs on the page.
import { engine, type Engine } from './sparksCore';

export interface Sparks { burst(x: number, y: number, n: number, power?: number): void; motes(on: boolean): void; stop(): void }

let worker: Worker | null = null;
let ids = 0;
try {
  if (typeof OffscreenCanvas === 'function' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype)
    worker = new Worker(new URL('./sparksWorker.ts', import.meta.url), { type: 'module' });
} catch { worker = null; }

/** Starts the particle layer on `canvas` (sized to its box) with these colours (rgba(…, 1) strings). */
export function sparks(canvas: HTMLCanvasElement, colors: string[]): Sparks {
  const lite = document.documentElement.classList.contains('lite');
  const dpr = window.devicePixelRatio || 1;
  // The box size is read once and then kept by a ResizeObserver (never read in a frame).
  const w = canvas.clientWidth, h = canvas.clientHeight;
  let local: Engine | null = null;
  const id = ++ids;
  const send = (m: Record<string, unknown>) => worker!.postMessage({ id, ...m });
  if (worker) {
    try {
      const off = canvas.transferControlToOffscreen();
      worker.postMessage({ t: 'init', id, canvas: off, colors, lite, dpr, w, h }, [off]);
    } catch { local = engine(canvas, colors, lite, dpr, w, h); }
  } else local = engine(canvas, colors, lite, dpr, w, h);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {
    const r = es[es.length - 1].contentRect;
    if (local) local.resize(r.width, r.height); else send({ t: 'resize', w: r.width, h: r.height });
  }) : null;
  ro?.observe(canvas);
  return {
    burst(x, y, n, power = 1) { if (local) local.burst(x, y, n, power); else send({ t: 'burst', x, y, n, power }); },
    motes(on) { if (local) local.motes(on); else send({ t: 'motes', on }); },
    stop() { ro?.disconnect(); if (local) local.stop(); else send({ t: 'stop' }); },
  };
}
