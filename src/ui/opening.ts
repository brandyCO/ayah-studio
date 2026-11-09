// The opening (owner request 2026-11-02, "drawn as if someone's drawing it"): once per launch, on the
// launch colour that continues the Android splash, the app's mark is drawn line by line in the chosen
// theme's colours — the two squares of the end-of-ayah rosette traced one after the other with a bright
// pen tip, then the inner ring, then the light at its centre is lit and blooms, the name rises in, and the
// whole picture fades into the app (≈ 3.2 s). The drawing runs in a worker on an OffscreenCanvas
// (src/ui/openingWorker.ts), so the app starting up underneath cannot make it stutter; the name and the
// fade are transform/opacity CSS animations, which the compositor runs. It never delays the app; a tap
// ends it; skipped with reduced motion and in old-phone mode (main.ts).
import { h } from './dom';
import { themeById, themeId } from './theme';
import { runOpening, type OpeningColours } from './openingArt';

const CSS_PX = 200; // the canvas (room for the glow)
const MARK_PX = 132; // the mark's 512 units

export function playOpening() {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const x = themeById(themeId());
  const colours: OpeningColours = { line: x.accentDark, ring: x.fill[x.fill.length - 1] };
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const canvas = h('canvas', { class: 'op-mark', width: Math.round(CSS_PX * dpr), height: Math.round(CSS_PX * dpr) }) as HTMLCanvasElement;
  const name = h('div', { class: 'op-name' }, ...[...'ayah studio'].map((c, i) =>
    h('span', { style: `--i:${i}` }, c === ' ' ? ' ' : c)));
  name.style.setProperty('--op-name', `linear-gradient(90deg, ${x.neon.join(', ')})`);
  const box = h('div', { class: 'app-opening', 'aria-hidden': 'true' }, h('div', { class: 'op-stage' }, canvas, name));
  let worker: Worker | null = null;
  const end = () => { box.remove(); worker?.terminate(); worker = null; };
  box.addEventListener('click', end);
  box.addEventListener('animationend', (e) => { if (e.target === box) end(); });
  document.body.append(box);
  const start = performance.timeOrigin + performance.now();
  try {
    if (!('transferControlToOffscreen' in canvas)) throw new Error('no OffscreenCanvas');
    worker = new Worker(new URL('./openingWorker.ts', import.meta.url), { type: 'module' });
    const off = canvas.transferControlToOffscreen();
    worker.postMessage({ canvas: off, css: CSS_PX, mark: MARK_PX, dpr, colours, start }, [off]);
  } catch {
    worker = null;
    runOpening(canvas, CSS_PX, MARK_PX, dpr, colours, start);
  }
  setTimeout(end, 3600); // whatever happens, never longer
}
