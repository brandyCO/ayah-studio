// The opening (docs/light.md, L5): once per launch, a single band of light sweeps across the logo's
// sound bars on the launch colour (it continues the Android splash), then fades — ≤ 1.2 s, never
// delaying the app (the mushaf loads underneath), skipped with reduced motion; tap ends it.
import { h } from './dom';

export function playOpening() {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const icon = `${import.meta.env.BASE_URL}icon.svg`;
  const sweep = h('div', { class: 'app-opening-sweep' });
  sweep.style.setProperty('--icon', `url("${icon}")`);
  const el = h('div', { class: 'app-opening', 'aria-hidden': 'true' },
    h('div', { class: 'app-opening-logo' }, h('img', { src: icon, alt: '', width: 112, height: 112 }), sweep));
  const end = () => el.remove();
  el.addEventListener('click', end);
  el.addEventListener('animationend', (e) => { if (e.target === el) end(); });
  document.body.append(el);
  setTimeout(end, 1400); // whatever happens, never longer
}
