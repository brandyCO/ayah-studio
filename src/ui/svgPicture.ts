// Still pictures for drawn art in lists, the way Discord does it (Marwan 2026-11-24, Tecno: the shop missed nearly every
// frame while scrolling; "how would Discord have it super light smooth").
// The item art is drawn as inline SVG: a character is ~100 paths, a frame or a room piece dozens more, and each is an
// element the phone styles, lays out and paints, again whenever anything on the page changes (a list of 70 tiles held
// ~5,700 elements). Here every drawing in a list becomes one picture:
//   1. the <svg> element stays (its class, size and place, so every CSS rule that sizes it still applies) but holds one
//      <image> of the drawing instead of its shapes;
//   2. once the page is quiet, that drawing is painted once into a bitmap (WebP) at the size it shows, kept in memory
//      and on the phone (Cache Storage `art-thumbs`), and the <image> shows the bitmap from then on. A bitmap is decoded
//      off the main thread; an SVG picture is parsed and laid out on it, every session. The next time the list opens
//      (even after a restart) no drawing is parsed at all.
// Animations inside a drawing rest (the item-art rule: stills in lists, the full motion in the open piece's card).
const NS = 'http://www.w3.org/2000/svg';
const PAD = 0.25; // art that spills past its viewBox (glows, sparkles, a raised arm) keeps that much room
const urls = new Map<string, string>(); // drawing → its SVG data URL
const bitmaps = new Map<string, string>(); // drawing + size → blob URL of its bitmap
const STORE = 'art-thumbs-v1';

function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519) ^ (b >>> 13); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
}

type Box = { x: number; y: number; w: number; h: number };
const padded = (vx: number, vy: number, vw: number, vh: number): Box => {
  const px = vw * PAD, py = vh * PAD;
  return { x: vx - px, y: vy - py, w: vw + 2 * px, h: vh + 2 * py };
};
function dataUrl(b: Box, inner: string): string {
  const key = `${b.x} ${b.y} ${b.w} ${b.h}|${inner}`;
  let src = urls.get(key);
  if (!src) {
    // A still: SMIL and CSS motion taken out. An SVG picture keeps animating inside an <image>, and every moving one on
    // screen repainted and re-layered the whole list on every frame (frames' rim glints, sparkles).
    const still = inner.replace(/<(animate\w*|set)\b[^>]*\/>|<(animate\w*|set)\b[^>]*>[^]*?<\/\2>/g, '');
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${b.w}" height="${b.h}" overflow="visible"><style>*{animation:none!important;transition:none!important}</style>${still}</svg>`)}`;
    if (urls.size > 300) urls.delete(urls.keys().next().value!);
    urls.set(key, src);
  }
  return src;
}
/** Whether the drawing stands on its own: every `url(#id)` it uses is defined inside it, no page colours. */
function selfContained(inner: string): boolean {
  if (/currentColor|var\(--/.test(inner)) return false;
  const ids = new Set([...inner.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]));
  for (const r of inner.matchAll(/url\(\s*['"]?#([^'")\s]+)|href="#([^"]+)"/g)) if (!ids.has(r[1] ?? r[2])) return false;
  return true;
}
function imageOf(b: Box, src: string, par: string | null): SVGImageElement {
  const im = document.createElementNS(NS, 'image');
  im.setAttribute('x', String(b.x)); im.setAttribute('y', String(b.y));
  im.setAttribute('width', String(b.w)); im.setAttribute('height', String(b.h));
  if (par) im.setAttribute('preserveAspectRatio', par);
  im.dataset.src = src;
  const kept = bitmaps.get(src);
  if (kept) im.setAttribute('href', kept);
  else void fromStore(im);
  return im;
}
/** A bitmap kept on the phone from an earlier session is shown at once (no drawing parsed); otherwise the drawing
 *  itself shows now and its bitmap is made later. */
async function fromStore(im: SVGImageElement) {
  const src = im.dataset.src!;
  const c = await openStore();
  const hit = await c?.match(storeUrl(src)).catch(() => undefined);
  if (hit) {
    const url = bitmaps.get(src) ?? URL.createObjectURL(await hit.blob());
    keep(src, url);
    im.setAttribute('href', url);
    return;
  }
  // The drawing shows now; its bitmap is painted later from this same loaded picture (never parsed a second time).
  im.setAttribute('href', src);
  toBitmap(im);
}
/** At most 300 bitmaps held in memory (the oldest let go; pictures already on screen keep showing). */
function keep(src: string, url: string) {
  if (bitmaps.get(src) === url) return;
  bitmaps.set(src, url);
  if (bitmaps.size > 300) { const [k, u] = bitmaps.entries().next().value!; bitmaps.delete(k); URL.revokeObjectURL(u); }
}
const storeUrl = (src: string) => `${location.origin}/__art/${hash(src)}.webp`;

// --- bitmaps, made one at a time while the page is quiet -------------------------------------------------------
const queue: SVGImageElement[] = [];
let running = false, lastScroll = 0;
if (typeof window !== 'undefined') addEventListener('scroll', () => { lastScroll = performance.now(); }, { capture: true, passive: true });
const idle = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 2500 }) : setTimeout(f, 60));
function toBitmap(im: SVGImageElement) {
  queue.push(im);
  if (!running) { running = true; idle(pump); }
}
let store: Promise<Cache | null> | null = null;
const openStore = () => (store ??= ('caches' in window ? caches.open(STORE).catch(() => null) : Promise.resolve(null)));

async function pump() {
  // Never while the list moves or a finger is down: those frames belong to the scroll.
  if (performance.now() - lastScroll < 250) { setTimeout(() => idle(pump), 200); return; }
  const im = queue.shift();
  if (!im) { running = false; return; }
  try { await makeBitmap(im); } catch { /* no bitmap */ }
  if (im.isConnected && !im.getAttribute('href')) im.setAttribute('href', bitmaps.get(im.dataset.src!) ?? im.dataset.src!);
  idle(pump);
}
async function makeBitmap(im: SVGImageElement) {
  const src = im.dataset.src!;
  if (!im.isConnected || bitmaps.has(src)) { const u = bitmaps.get(src); if (u) im.setAttribute('href', u); return; }
  const svg = im.ownerSVGElement;
  const r = svg?.getBoundingClientRect();
  const vb = svg?.viewBox.baseVal;
  if (!svg || !r || !r.width || !vb?.width) return;
  // Pixels per drawing unit as shown, at the screen's density (one size per drawing: the largest it shows in a list).
  const ppu = Math.min(r.width / vb.width, r.height / vb.height) * Math.min(3, devicePixelRatio || 1);
  const w = Math.min(720, Math.ceil(Number(im.getAttribute('width')) * ppu)), h = Math.min(720, Math.ceil(Number(im.getAttribute('height')) * ppu));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  // The <image> already holds the parsed drawing; until it has loaded, drawing it throws, so wait for its load once.
  try { g.drawImage(im, 0, 0, w, h); } catch {
    await new Promise<void>((ok, no) => { im.addEventListener('load', () => ok(), { once: true }); im.addEventListener('error', () => no(), { once: true }); setTimeout(no, 8000); });
    g.drawImage(im, 0, 0, w, h);
  }
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/webp', 0.92));
  if (!blob) return;
  void openStore().then((c) => c?.put(storeUrl(src), new Response(blob, { headers: { 'content-type': 'image/webp' } }))).catch(() => {});
  const url = URL.createObjectURL(blob);
  keep(src, url);
  // Decoded before it is shown, so the swap never flashes.
  const pre = new Image(); pre.src = url; await pre.decode().catch(() => {});
  im.setAttribute('href', url);
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].dataset.src === src) { queue[i].setAttribute('href', url); queue.splice(i, 1); }
}

// --- making the pictures -----------------------------------------------------------------------------------------
function flattenOne(svg: SVGSVGElement): void {
  if (svg.dataset.flat || svg.closest('[data-live]')) return;
  const vb = svg.viewBox?.baseVal;
  const inner = svg.innerHTML;
  if (!vb || !vb.width || !vb.height || !selfContained(inner)) return;
  const b = padded(vb.x, vb.y, vb.width, vb.height);
  svg.replaceChildren(imageOf(b, dataUrl(b, inner), svg.getAttribute('preserveAspectRatio')));
  svg.dataset.flat = '1';
}

/** Turns every drawing in `root` (or `root` itself) into a still picture; returns `root`. */
export function flattenSvg<T extends Node>(root: T): T {
  if (root instanceof SVGSVGElement) flattenOne(root);
  else if (root instanceof Element || root instanceof DocumentFragment) {
    // Outer drawings only: one nested in another is drawn with it.
    for (const s of [...root.querySelectorAll('svg')]) if (!s.parentElement?.closest('svg')) flattenOne(s as SVGSVGElement);
  }
  return root;
}

/** The same picture straight from markup (no parsing into elements): `<svg …>…</svg>` → an <svg> with the root's
 *  attributes and one <image> of the drawing. `null` when the markup is not one self-contained drawing. */
export function svgPictureFromMarkup(markup: string): SVGSVGElement | null {
  const m = /^\s*<svg\b([^>]*)>([^]*)<\/svg>\s*$/.exec(markup);
  if (!m) return null;
  const [, attrs, inner] = m;
  const vb = /viewBox="([^"]+)"/.exec(attrs)?.[1].trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb.some((x) => !Number.isFinite(x)) || !vb[2] || !vb[3] || !selfContained(inner)) return null;
  const svg = document.createElementNS(NS, 'svg');
  for (const a of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) if (a[1] !== 'xmlns' && !a[1].startsWith('xmlns:')) svg.setAttribute(a[1], a[2]);
  const b = padded(vb[0], vb[1], vb[2], vb[3]);
  svg.append(imageOf(b, dataUrl(b, inner), /preserveAspectRatio="([^"]+)"/.exec(attrs)?.[1] ?? null));
  svg.dataset.flat = '1';
  return svg;
}
