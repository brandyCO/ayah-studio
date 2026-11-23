// A gift's wrapping, drawn in code (owner request 2026-11-23): never a chest. What it is worth sets its size, paper,
// colours and how it opens (src/ui/giftOpen.ts); the sender's colour tints it. Each part is drawn on the same
// 200 × 200 box so the layers stack exactly. Small and dependency-free, so Me can show a waiting gift without loading
// the moment.
export type GiftTier = 0 | 1 | 2 | 3;
export const giftTier = (value: number): GiftTier => (value >= 200 ? 3 : value >= 100 ? 2 : value >= 50 ? 1 : 0);

/** The sender's colour: the same for a person every time (from their public id). */
export function hueOf(s: string): number {
  let x = 7;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x % 360;
}

// --- the art: each part on the same 200 × 200 box so the layers stack exactly ---
export const svg = (body: string) => `<svg viewBox="0 0 200 200" aria-hidden="true">${body}</svg>`;
export interface Pal { a: string; b: string; c: string; rib: string; ribB: string; trim?: string; gem?: string }
export function pal(t: GiftTier, hue: number): Pal {
  if (t === 0) return { a: '#cfa06a', b: '#b5854f', c: '#e3bd8a', rib: '#f4e7c9', ribB: '#d9c49a', trim: `hsl(${hue} 62% 48%)` };
  if (t === 1) return { a: `hsl(${hue} 68% 57%)`, b: `hsl(${hue} 60% 45%)`, c: `hsl(${hue} 85% 74%)`, rib: '#fff7e8', ribB: '#ead9b8' };
  if (t === 2) return { a: `hsl(${hue} 55% 40%)`, b: `hsl(${hue} 58% 29%)`, c: `hsl(${hue} 70% 62%)`, rib: '#f5dc9f', ribB: '#d6b064' };
  return { a: `hsl(${hue} 46% 23%)`, b: `hsl(${hue} 48% 15%)`, c: `hsl(${hue} 50% 34%)`, rib: '#f0cf72', ribB: '#c99a34', trim: '#ecc66a', gem: `hsl(${(hue + 180) % 360} 75% 58%)` };
}
/** The box's front, whole or one half (x0–x1), with its wrapping drawn on it. */
export function front(t: GiftTier, p: Pal, x0 = 34, x1 = 166): string {
  const w = x1 - x0;
  let s = `<rect x="${x0}" y="96" width="${w}" height="84" rx="${t === 0 ? 6 : 8}" fill="${p.a}"/>`;
  s += `<rect x="${x0}" y="164" width="${w}" height="16" rx="6" fill="${p.b}" opacity=".55"/>`;
  if (t === 0) s += `<path d="M${x0 + 8} 112l${w * 0.3} 10M${x1 - 10} 140l-${w * 0.25} 14M${x0 + 14} 160l${w * 0.4} -6" stroke="${p.b}" stroke-width="2" opacity=".6" fill="none"/>`;
  if (t === 1) for (let y = 108; y < 176; y += 16) for (let x = x0 + 10 + ((y / 16) % 2) * 8; x < x1 - 4; x += 16) s += `<circle cx="${x}" cy="${y}" r="3.2" fill="${p.c}"/>`;
  if (t === 2) s += `<path d="M${x0} 150L${x0 + w * 0.55} 96H${x0 + w * 0.75}L${x0} 172Z" fill="#fff" opacity=".22"/>`;
  if (t === 3) s += `<rect x="${x0 + 7}" y="103" width="${w - 14}" height="70" rx="5" fill="none" stroke="${p.trim}" stroke-width="2.2"/>`
    + `<path d="M${x0 + 7} 118q10-2 12-15M${x1 - 7} 118q-10-2-12-15M${x0 + 7} 158q10 2 12 15M${x1 - 7} 158q-10 2-12 15" stroke="${p.trim}" stroke-width="2" fill="none"/>`;
  // The ribbon (or twine) down the middle, where it falls inside this piece.
  const rx = Math.max(x0, 92), rx1 = Math.min(x1, 108);
  if (rx1 > rx) s += t === 0 ? `<rect x="${Math.max(x0, 98)}" y="96" width="${Math.max(0, Math.min(x1, 102) - Math.max(x0, 98))}" height="84" fill="${p.rib}"/>`
    : `<rect x="${rx}" y="96" width="${rx1 - rx}" height="84" fill="${p.rib}"/><rect x="${rx}" y="96" width="${Math.min(rx1 - rx, 4)}" height="84" fill="${p.ribB}"/>`;
  if (t === 0 && x0 <= 34 && x1 >= 166) s += `<rect x="34" y="136" width="132" height="4" fill="${p.rib}"/><circle cx="140" cy="160" r="10" fill="${p.trim}"/><circle cx="140" cy="160" r="5.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>`;
  if (t === 0 && x1 <= 100) s += `<rect x="${x0}" y="136" width="${w}" height="4" fill="${p.rib}"/>`;
  if (t === 0 && x0 >= 100) s += `<rect x="${x0}" y="136" width="${w}" height="4" fill="${p.rib}"/><circle cx="140" cy="160" r="10" fill="${p.trim}"/><circle cx="140" cy="160" r="5.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>`;
  return s;
}
export function lid(t: GiftTier, p: Pal): string {
  let s = `<rect x="26" y="74" width="148" height="28" rx="${t === 0 ? 5 : 7}" fill="${p.c}"/><rect x="26" y="92" width="148" height="10" rx="4" fill="${p.b}" opacity=".5"/>`;
  if (t === 1) for (let x = 36; x < 170; x += 16) s += `<circle cx="${x}" cy="84" r="3" fill="${p.a}"/>`;
  if (t === 2) s += `<path d="M40 74h30L52 102H30Z" fill="#fff" opacity=".25"/>`;
  if (t === 3) s += `<rect x="31" y="78" width="138" height="20" rx="4" fill="none" stroke="${p.trim}" stroke-width="2"/>`;
  s += t === 0 ? `<rect x="98" y="74" width="4" height="28" fill="${p.rib}"/>` : `<rect x="92" y="74" width="16" height="28" fill="${p.rib}"/><rect x="92" y="74" width="4" height="28" fill="${p.ribB}"/>`;
  return s;
}
export function bow(t: GiftTier, p: Pal): string {
  if (t === 0) return `<g fill="none" stroke="${p.rib}" stroke-width="4" stroke-linecap="round"><path d="M100 76c-14-18-30-10-22 0s22 0 22 0c14-18 30-10 22 0s-22 0-22 0"/><path d="M100 77l-10 16M100 77l12 15"/></g><circle cx="100" cy="76" r="4" fill="${p.ribB}"/>`;
  const k = t === 1 ? 1 : t === 2 ? 1.25 : 1.35;
  const lw = 30 * k, lh = 17 * k;
  let s = `<path d="M100 78l-${16 * k} ${26 * k}l${7 * k}-2l3 ${7 * k}zM100 78l${16 * k} ${26 * k}l-${7 * k}-2l-3 ${7 * k}z" fill="${p.ribB}"/>`;
  s += `<ellipse cx="${100 - lw * 0.62}" cy="${70 - lh * 0.4}" rx="${lw * 0.66}" ry="${lh * 0.72}" transform="rotate(-18 ${100 - lw * 0.62} ${70 - lh * 0.4})" fill="${p.rib}"/>`;
  s += `<ellipse cx="${100 + lw * 0.62}" cy="${70 - lh * 0.4}" rx="${lw * 0.66}" ry="${lh * 0.72}" transform="rotate(18 ${100 + lw * 0.62} ${70 - lh * 0.4})" fill="${p.rib}"/>`;
  s += `<ellipse cx="${100 - lw * 0.55}" cy="${70 - lh * 0.35}" rx="${lw * 0.3}" ry="${lh * 0.3}" fill="${p.ribB}" opacity=".7"/><ellipse cx="${100 + lw * 0.55}" cy="${70 - lh * 0.35}" rx="${lw * 0.3}" ry="${lh * 0.3}" fill="${p.ribB}" opacity=".7"/>`;
  s += `<rect x="${100 - 8 * k}" y="${70 - 8 * k}" width="${16 * k}" height="${15 * k}" rx="${5 * k}" fill="${p.rib}"/>`;
  if (t === 2) s += `<path d="M${100 - lw * 0.9} ${66 - lh * 0.6}q${lw * 0.3}-${lh * 0.5} ${lw * 0.6} 0" stroke="#fff" stroke-width="2.5" fill="none" opacity=".6"/>`;
  if (t === 3 && p.gem) s += `<path d="M100 ${62 - 2}l8 8-8 9-8-9z" fill="${p.gem}"/><path d="M100 60l4 6h-8z" fill="#fff" opacity=".6"/>`;
  return s;
}
/** What lies inside, seen once it opens: the box's own inside and its light. */
export const mouth = (p: Pal) => svg(`<rect x="34" y="90" width="132" height="18" rx="6" fill="${p.b}"/><rect x="40" y="93" width="120" height="12" rx="5" fill="#2a1a08" opacity=".55"/><ellipse cx="100" cy="99" rx="56" ry="7" fill="#fff3c4" opacity=".95"/>`);
export const inside = (p: Pal) => svg(`<rect x="34" y="96" width="132" height="84" rx="8" fill="${p.b}"/><rect x="40" y="100" width="120" height="74" rx="6" fill="#000" opacity=".25"/>`);

/** A waiting gift, small, as one picture (Me's gift card). */
export function giftThumb(value: number, seed: string): string {
  const t = giftTier(value), p = pal(t, hueOf(seed));
  return `<svg viewBox="20 24 160 162" aria-hidden="true">${front(t, p)}${lid(t, p)}${bow(t, p)}</svg>`;
}
