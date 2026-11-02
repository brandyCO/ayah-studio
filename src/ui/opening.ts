// The opening (owner request 2026-11-02, "drawn as if someone's drawing it"): once per launch, on the
// launch colour that continues the Android splash, the app's mark is drawn line by line in the chosen
// theme's colours — the two squares of the end-of-ayah rosette traced one after the other, then the inner
// ring, then the light at its centre is lit and blooms, the name rises in, and the whole picture fades into
// the app (≈ 2.2 s). It never delays the app (the mushaf loads underneath); a tap ends it; skipped with
// reduced motion and in old-phone mode (main.ts).
import { h } from './dom';
import { themeById, themeId } from './theme';

const NS = 'http://www.w3.org/2000/svg';

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** The mark of public/icon.svg (512 units), each line drawable (pathLength 1). */
function mark(line: string, ring: string): SVGSVGElement {
  const svg = el('svg', { viewBox: '0 0 512 512', class: 'op-mark', 'aria-hidden': 'true' }) as SVGSVGElement;
  const defs = el('defs', {});
  const glow = el('radialGradient', { id: 'op-glow', cx: 256, cy: 256, r: 146.32, gradientUnits: 'userSpaceOnUse' });
  for (const [o, a] of [[0, 0.95], [0.22, 0.55], [0.6, 0.12], [1, 0]]) glow.append(el('stop', { offset: o, 'stop-color': line, 'stop-opacity': a }));
  const core = el('radialGradient', { id: 'op-core', cx: 256, cy: 256, r: 25.96, gradientUnits: 'userSpaceOnUse' });
  for (const [o, a] of [[0, 1], [0.55, 0.9], [1, 0]]) core.append(el('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a }));
  defs.append(glow, core);
  const sq = (cls: string, extra: Record<string, string | number> = {}) => el('rect', {
    class: `op-line ${cls}`, x: 138, y: 138, width: 236, height: 236, rx: 16.52, fill: 'none', stroke: line,
    'stroke-width': 12.98, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1, ...extra,
  });
  svg.append(defs,
    el('circle', { class: 'op-glow', cx: 256, cy: 256, r: 146.32, fill: 'url(#op-glow)' }),
    sq('op-a'),
    sq('op-b', { transform: 'rotate(45 256 256)' }),
    el('circle', { class: 'op-line op-ring', cx: 256, cy: 256, r: 77.88, fill: 'none', stroke: ring, 'stroke-width': 7.14, 'stroke-linecap': 'round', pathLength: 1, transform: 'rotate(-90 256 256)' }),
    el('circle', { class: 'op-core', cx: 256, cy: 256, r: 25.96, fill: 'url(#op-core)' }));
  return svg;
}

export function playOpening() {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const x = themeById(themeId());
  const name = h('div', { class: 'op-name' }, ...[...'ayah studio'].map((c, i) =>
    h('span', { style: `--i:${i}` }, c === ' ' ? ' ' : c)));
  name.style.setProperty('--op-name', `linear-gradient(90deg, ${x.neon.join(', ')})`);
  const box = h('div', { class: 'app-opening', 'aria-hidden': 'true' },
    h('div', { class: 'op-stage' }, mark(x.accentDark, x.fill[x.fill.length - 1]), name));
  box.style.setProperty('--op-line', x.accentDark);
  const end = () => box.remove();
  box.addEventListener('click', end);
  box.addEventListener('animationend', (e) => { if (e.target === box) end(); });
  document.body.append(box);
  setTimeout(end, 2800); // whatever happens, never longer
}
