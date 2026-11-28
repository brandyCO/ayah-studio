// The opening flare at the approved item-art level (docs/item-art.md): every reward moment (chests, gifts, unlocks,
// badges, streak, ranks, the week's gifts, a surah finished, the launch) bursts with the same illustrated light,
// richer by rarity — a bloom, a shock ring, a khatam that turns open, four-pointed sparkles thrown out and, from
// legendary up, a wheel of god rays that keeps turning behind the prize (mythic: two wheels, two colours).
// Light build: each piece is an SVG data-URL <img> drawn once per rarity and cached; everything moves by
// transform / opacity only (WAAPI), so it holds 60 fps on slow phones. Old-phone mode throws fewer sparkles and
// keeps the rays still; reduced motion shows nothing.
import { lite, reduced } from './juice';

/** 0 common · 1 rare · 2 epic · 3 legendary · 4 mythic */
export type Rarity = 0 | 1 | 2 | 3 | 4;
const COL: [string, string, string][] = [
  ['#fff6d6', '#ffd36b', '#ffb53d'],
  ['#e3f4ff', '#6cc0ff', '#2f7fe8'],
  ['#f3e4ff', '#b77cff', '#7b3fe0'],
  ['#fff3c2', '#ffc53d', '#e08a00'],
  ['#fff1c9', '#b06bff', '#5fe3ff'],
];
const SPARKS = [6, 9, 12, 16, 20];

const url = (inner: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${inner}</svg>`)}`;
const star = (cx: number, cy: number, R: number, r: number, k: number, rot = -90) => Array.from({ length: k * 2 }, (_, i) => {
  const a = ((rot + (i * 180) / k) * Math.PI) / 180, q = i % 2 ? r : R;
  return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * q).toFixed(1)} ${(cy + Math.sin(a) * q).toFixed(1)}`;
}).join('') + 'Z';

function rays(c: string, n: number, phase = 0): string {
  const w = 180 / n * 0.42;
  const wedges = Array.from({ length: n }, (_, i) => {
    const a = (phase + (i * 360) / n) * Math.PI / 180, L = i % 2 ? 78 : 98, s = (w * Math.PI) / 180;
    const p = (q: number, d: number) => `${(100 + Math.cos(a + q) * d).toFixed(1)} ${(100 + Math.sin(a + q) * d).toFixed(1)}`;
    return `M${p(-s * 0.18, 8)}L${p(-s, L)}Q${p(0, L + 6)} ${p(s, L)}L${p(s * 0.18, 8)}Z`;
  }).join('');
  return `<defs><radialGradient id="g" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse"><stop offset=".05" stop-color="#fff" stop-opacity=".95"/><stop offset=".3" stop-color="${c}" stop-opacity=".7"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><path d="${wedges}" fill="url(#g)"/>`;
}
function ring([hi, c, deep]: [string, string, string]): string {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4, x = 100 + Math.cos(a) * 80, y = 100 + Math.sin(a) * 80;
    return `<path d="${star(x, y, 7, 2.4, 4)}" fill="${hi}" stroke="${deep}" stroke-width="1"/>`;
  }).join('');
  return `<circle cx="100" cy="100" r="80" fill="none" stroke="${deep}" stroke-width="9" opacity=".5"/><circle cx="100" cy="100" r="80" fill="none" stroke="${c}" stroke-width="6"/><circle cx="100" cy="100" r="80" fill="none" stroke="${hi}" stroke-width="2"/><circle cx="100" cy="100" r="68" fill="none" stroke="${hi}" stroke-width="1.2" opacity=".6" stroke-dasharray="3 5"/>${dots}`;
}
function khatam([hi, c, deep]: [string, string, string]): string {
  const sq = (r: number) => `M${100 - r} ${100 - r}H${100 + r}V${100 + r}H${100 - r}Z`;
  const both = (r: number) => `<path d="${sq(r)}"/><path d="${sq(r)}" transform="rotate(45 100 100)"/>`;
  return `<defs><radialGradient id="f" cx="100" cy="100" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${hi}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`
    + `<g fill="url(#f)">${both(62)}</g><g fill="none" stroke="${deep}" stroke-width="7" stroke-linejoin="round" opacity=".55">${both(62)}</g>`
    + `<g fill="none" stroke="${c}" stroke-width="4.5" stroke-linejoin="round">${both(62)}</g><g fill="none" stroke="${hi}" stroke-width="1.6" stroke-linejoin="round">${both(62)}${both(44)}</g>`;
}
function spark([hi, c]: [string, string, string]): string {
  return `<defs><radialGradient id="s" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c}" stop-opacity=".7"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`
    + `<circle cx="100" cy="100" r="70" fill="url(#s)"/><path d="${star(100, 100, 96, 14, 4)}" fill="${c}"/><path d="${star(100, 100, 70, 9, 4)}" fill="${hi}"/><circle cx="100" cy="100" r="9" fill="#fff"/>`;
}
function bloom([hi, c]: [string, string, string]): string {
  return `<defs><radialGradient id="b" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="${hi}" stop-opacity=".8"/><stop offset=".6" stop-color="${c}" stop-opacity=".3"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><circle cx="100" cy="100" r="100" fill="url(#b)"/>`;
}

interface Art { rays: string; rays2?: string; ring: string; khatam: string; spark: string; spark2?: string; bloom: string }
type Piece = keyof Art;

// Bitmaps (2026-11-26, Marwan: "the last opening reveal frames lag a bit … smooth on any phone"). An SVG picture is
// parsed, laid out and recorded on the main thread the first time it paints, at its full size: the flare's eight to
// twenty-five pictures did that in the very frame the chest burst open (~70 ms at 6× CPU). Each piece is now drawn once
// into a bitmap ahead of time (`warmFlare`, a piece per quiet moment), which the phone decodes off the main thread; the
// soft pieces (bloom, rays, sparkles) need no more than one pixel per CSS pixel, capped, so they upload quickly too.
const bits = new Map<string, string>(); // rarity · piece · px → blob URL
const pending = new Set<string>();
const SOFT: Partial<Record<Piece, true>> = { rays: true, rays2: true, bloom: true, spark: true, spark2: true };
const pxFor = (piece: Piece, css: number) => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.max(32, Math.min(SOFT[piece] ? 640 : 900, Math.round(css * (SOFT[piece] ? 1 : dpr) / 32) * 32));
};
const bitKey = (r: Rarity, piece: Piece, px: number) => `${r}|${piece}|${px}`;
async function drawBit(r: Rarity, piece: Piece, px: number): Promise<void> {
  const key = bitKey(r, piece, px);
  if (bits.has(key) || pending.has(key)) return;
  const src = art(r)[piece];
  if (!src) return;
  pending.add(key);
  try {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = c.height = px;
    c.getContext('2d')!.drawImage(im, 0, 0, px, px);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
    if (blob) bits.set(key, URL.createObjectURL(blob));
  } catch { /* the SVG picture stays the fallback */ } finally { pending.delete(key); }
}
/** The pieces a flare of this rarity and size will show, as [piece, css px]. */
function pieces(r: Rarity, S: number): [Piece, number][] {
  const out: [Piece, number][] = [['bloom', S * 1.1], ['khatam', S * 0.62], ['ring', S * 0.7], ['spark', S * 0.13]];
  if (r >= 1) out.unshift(['rays', S * (r >= 3 ? 1.5 : 1.25)]);
  if (r === 4) out.push(['rays2', S * 1.3], ['spark2', S * 0.13]);
  return out;
}
/** Draws a flare's pieces ahead of time, one per quiet moment, so the burst itself only starts animations. */
export function warmFlare(r: Rarity, size: number) {
  if (reduced()) return;
  const todo = pieces(r, size).map(([p, css]) => [p, pxFor(p, css)] as const).filter(([p, px]) => !bits.has(bitKey(r, p, px)));
  const next = () => {
    const one = todo.shift();
    if (!one) return;
    const go = () => void drawBit(r, one[0], one[1]).then(next);
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 800 }); else setTimeout(go, 50);
  };
  next();
}
const cache = new Map<Rarity, Art>();
function art(r: Rarity): Art {
  let a = cache.get(r);
  if (a) return a;
  const c = COL[r];
  a = {
    rays: url(rays(c[1], r >= 3 ? 16 : 12)), ring: url(ring(c)), khatam: url(khatam(c)), spark: url(spark(c)), bloom: url(bloom(c)),
    ...(r === 4 ? { rays2: url(rays(c[2], 12, 15)), spark2: url(spark(['#e9fdff', c[2], c[1]])) } : {}),
  };
  cache.set(r, a);
  return a;
}

export interface FlareOpts {
  /** Centre inside `host`, in px from its top-left (default: its middle). */
  x?: number; y?: number;
  /** Diameter of the burst in px (default: 0.9 × the host's smaller side, ≤ 420). */
  size?: number;
  /** How long the ray wheel stays behind the prize, in ms (default 2600). 0 = until removed. */
  hold?: number;
  /** Drawn under the host's other children (default: on top). */
  under?: boolean;
}

/** Plays the flare in `host` (which must be positioned). Returns the layer, which removes itself when done. */
export function flare(host: HTMLElement, r: Rarity, o: FlareOpts = {}): HTMLElement | null {
  if (reduced() || !host.isConnected) return null;
  const slow = lite();
  // Positions and sizes given by the caller are used as they are: reading the host's style or size here forced the
  // phone to restyle and lay out the whole moment in the frame of the burst.
  const given = o.x != null && o.y != null && o.size != null;
  if (!given && getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const a = art(r);
  const w = given ? 0 : host.clientWidth || 300, hgt = given ? 0 : host.clientHeight || 300;
  const S = o.size ?? Math.min(420, Math.min(w, hgt) * 0.9);
  const pic = (piece: Piece, k: number) => bits.get(bitKey(r, piece, pxFor(piece, S * k))) ?? a[piece]!;
  const layer = document.createElement('span');
  layer.className = 'flare';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `position:absolute;left:${o.x ?? w / 2}px;top:${o.y ?? hgt / 2}px;width:0;height:0;pointer-events:none;z-index:${o.under ? 0 : 5}`;
  const img = (piece: Piece, k: number) => {
    const el = document.createElement('img');
    el.src = pic(piece, k); el.alt = ''; el.decoding = 'sync';
    const d = S * k;
    el.style.cssText = `position:absolute;left:${-d / 2}px;top:${-d / 2}px;width:${d}px;height:${d}px;max-width:none;opacity:0;will-change:transform,opacity`;
    layer.append(el);
    return el;
  };
  const E = 'cubic-bezier(.15,.75,.3,1)';
  const anims: Animation[] = [];
  const wheelEls = new Set<Element>();
  // A piece that has played out leaves at once: kept (invisible) it stayed a layer the phone re-layered and re-styled
  // with every later frame of the moment (the chest keeps its flare until it closes).
  const go = (el: Element, k: Keyframe[], o2: KeyframeAnimationOptions) => {
    const an = el.animate(k, { fill: 'forwards', easing: E, ...o2 });
    anims.push(an);
    if (!wheelEls.has(el)) an.finished.then(() => el.remove(), () => {});
  };

  // God rays: from rare up; legendary and mythic keep turning behind the prize while it is shown.
  const hold = o.hold ?? 2600;
  if (r >= 1) {
    const wheels = [img('rays', r >= 3 ? 1.5 : 1.25), ...(a.rays2 ? [img('rays2', 1.3)] : [])];
    for (const w of wheels) wheelEls.add(w);
    wheels.forEach((el, i) => {
      const peak = r >= 3 ? 0.95 : 0.6, dir = i ? -1 : 1;
      go(el, [{ opacity: 0, transform: 'scale(.3) rotate(0deg)' }, { opacity: peak, transform: `scale(1) rotate(${dir * 20}deg)` }], { duration: 700 });
      if (r >= 3 && !slow) {
        const turn = el.animate([{ rotate: '0deg' }, { rotate: `${dir * 360}deg` }], { duration: i ? 30000 : 22000, iterations: Infinity });
        anims.push(turn);
      }
      if (hold) go(el, [{ opacity: peak }, { opacity: 0 }], { duration: 600, delay: hold, easing: 'ease-in', composite: 'replace' });
    });
  }
  // The bloom: a soft flash of the rarity's light.
  go(img('bloom', 1.1), [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(.9)', offset: 0.25 }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 900 + r * 120 });
  // The khatam turns open and fades; the shock ring runs out (twice from epic up).
  go(img('khatam', 0.62), [{ opacity: 0, transform: 'scale(.2) rotate(-45deg)' }, { opacity: 1, transform: 'scale(.95) rotate(0deg)', offset: 0.4 }, { opacity: 0, transform: 'scale(1.35) rotate(22deg)' }], { duration: 1100 });
  const rings = r >= 2 ? 2 : 1;
  for (let i = 0; i < rings; i++) go(img('ring', 0.7), [{ opacity: 0.95, transform: 'scale(.15)' }, { opacity: 0, transform: `scale(${1.5 + i * 0.35})` }], { duration: 800 + i * 200, delay: 60 + i * 180 });
  // Sparkles thrown out in a ring, each popping, turning and fading where it lands. They start a frame later, in
  // their own task (they wait 80 ms anyway): starting twenty-odd animations with the rest held up the burst's frame.
  const n = slow ? Math.ceil(SPARKS[r] / 2) : SPARKS[r];
  const throwSparks = () => { if (!layer.isConnected) return; for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.31, dist = S * (0.32 + ((i * 37) % 10) / 34);
    const k = 0.07 + ((i * 53) % 7) / 100;
    const el = img(a.spark2 && i % 3 === 0 ? 'spark2' : 'spark', 0.13);
    if (k !== 0.13) { const d = S * k; el.style.left = el.style.top = `${-d / 2}px`; el.style.width = el.style.height = `${d}px`; }
    const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist;
    go(el, [{ opacity: 0, transform: 'translate(0,0) scale(.2) rotate(0deg)' },
      { opacity: 1, transform: `translate(${(x * 0.7).toFixed(1)}px,${(y * 0.7).toFixed(1)}px) scale(1.15) rotate(45deg)`, offset: 0.45 },
      { opacity: 0, transform: `translate(${x.toFixed(1)}px,${(y + 14).toFixed(1)}px) scale(.4) rotate(90deg)` }],
    { duration: 900 + (i % 4) * 140, delay: Math.max(0, 64 + (i % 5) * 40) });
  } };
  if (o.under) host.prepend(layer); else host.append(layer);
  requestAnimationFrame(throwSparks);
  const end = Math.max(1500, hold ? hold + 700 : 0);
  if (hold || r < 1) setTimeout(() => { for (const x of anims) x.cancel(); layer.remove(); }, end);
  return layer;
}

/** The rarity of a Light amount or price, on the shop's scale. */
export const rarityOf = (price: number): Rarity => (price >= 3000 ? 4 : price >= 1500 ? 3 : price >= 600 ? 2 : price >= 150 ? 1 : 0);
