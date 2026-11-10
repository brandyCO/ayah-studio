// The reward art's shared look (owner request 2026-11-10: "all the reward art in the character style"): the
// same flat two-tone shapes as the characters (`figure.ts`), lit from the top left — a shade colour with the
// base laid over it shifted up and left, a soft white shine, and a chunky darker edge underneath like the
// app's buttons. No outlines, no gradients on the objects (glows stay soft).

let uid = 0;

/** One shape in two tones: the shade, and the base over it shifted by (dx, dy), clipped to the shape. */
export function two(d: string, base: string, shade: string, dx = -2, dy = -2): string {
  const id = `ft${++uid}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${shade}"/><path d="${d}" fill="${base}" transform="translate(${dx} ${dy})" clip-path="url(#${id})"/>`;
}
/** The chunky edge under a shape: the same shape moved down, in a deep colour. */
export const edge = (d: string, c: string, dy = 3) => `<path d="${d}" fill="${c}" transform="translate(0 ${dy})"/>`;
/** A soft white stroke where the light catches. */
export const shine = (d: string, w = 2, o = 0.35) => `<path d="${d}" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${o}"/>`;
/** A line drawn with a small shade under it, so it reads as raised. */
export const raisedLine = (d: string, c: string, w: number, under = 'rgba(0,0,0,.28)', dy = 1) =>
  `<path d="${d}" stroke="${under}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(${dy * 0.5} ${dy})"/><path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
export const circlePath = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
/** A star with k points as a path (radii R outer, r inner), the first point up. */
export function starPath(cx: number, cy: number, R: number, r: number, k = 8): string {
  const pts: string[] = [];
  for (let i = 0; i < k * 2; i++) {
    const a = (i * Math.PI) / k - Math.PI / 2;
    const d = i % 2 ? r : R;
    pts.push(`${(cx + d * Math.cos(a)).toFixed(2)} ${(cy + d * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Mixes a #rrggbb colour towards black (k > 0) or white (k < 0). Other colours are returned unchanged. */
export function mix(hex: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const to = k > 0 ? 0 : 255, a = Math.abs(k);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * a));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const NS = 'http://www.w3.org/2000/svg';
export function svgOf(vb: string, inner: string, size?: number): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', vb);
  el.setAttribute('aria-hidden', 'true');
  if (size) { el.setAttribute('width', String(size)); el.setAttribute('height', String(size)); }
  el.innerHTML = inner;
  return el;
}

/** A streak freeze: a chunky ice crystal holding a snowflake (viewBox 48). */
export function freezeArt(size?: number): SVGSVGElement {
  const hex = 'M24 4L41 14V34L24 44L7 34V14Z';
  // Three axes, a small V at each end.
  const flake = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const P = (r: number, w: number) => `${(24 + c * r - s * w).toFixed(2)} ${(24 + s * r + c * w).toFixed(2)}`;
    return `M24 24L${P(11, 0)}M${P(5.5, -3.4)}L${P(8.5, 0)}L${P(5.5, 3.4)}`;
  }).join('');
  return svgOf('0 0 48 48', `${edge(hex, '#1f5f93', 3)}${two(hex, '#bfeaff', '#62b6e6', -3, -3)}
    ${two('M24 4L41 14L24 24L7 14Z', '#e4f7ff', '#a6dcf5', -1.5, -1.5)}
    ${raisedLine(flake, '#fff', 2.4, 'rgba(31,95,147,.45)')}
    ${shine('M11 17V30', 2.2, .55)}<circle cx="35" cy="12" r="1.6" fill="#fff" opacity=".9"/>`, size);
}
