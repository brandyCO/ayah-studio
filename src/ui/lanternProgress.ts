// The export's progress as a paper lantern slowly filling with light (docs/light.md, L5), instead of
// a bar. The percentage stays as text beside it; the lantern is decoration (aria-hidden).
const SVG = 'http://www.w3.org/2000/svg';

export function lanternProgress(): { el: HTMLElement; set(f: number): void } {
  const el = document.createElement('div');
  el.className = 'lantern-progress';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 80 120" width="80" height="120">
    <defs>
      <clipPath id="lp-body"><path d="M22 30 Q14 60 22 92 L58 92 Q66 60 58 30 Z"/></clipPath>
      <linearGradient id="lp-fill" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#ffb85c"/><stop offset="1" stop-color="#fff1d6"/>
      </linearGradient>
    </defs>
    <path d="M40 6 V18" class="lp-string"/>
    <rect x="28" y="18" width="24" height="12" rx="3" class="lp-cap"/>
    <path d="M22 30 Q14 60 22 92 L58 92 Q66 60 58 30 Z" class="lp-paper"/>
    <rect x="10" y="92" width="60" height="62" fill="url(#lp-fill)" clip-path="url(#lp-body)" class="lp-light"/>
    <path d="M30 30 Q26 60 30 92 M50 30 Q54 60 50 92" class="lp-ribs"/>
    <rect x="28" y="92" width="24" height="10" rx="3" class="lp-cap"/>
  </svg>`;
  const light = el.querySelector<SVGRectElement>('.lp-light')!;
  return {
    el,
    set(f) {
      const k = Math.min(1, Math.max(0, f));
      light.setAttribute('y', String(92 - 62 * k));
      el.style.setProperty('--lp', k.toFixed(3));
    },
  };
}
