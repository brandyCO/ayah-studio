// The room's pieces at the approved item-art level (docs/item-art.md), as drop-in versions of flat.ts `two` and `edge`:
// every shape gets a gradient body (lit top-left), its deep tone along the bottom-right, a rim light on the lit edge and
// a hue-matched outline. No blur filters: the room is one inline picture whose small animations rest after a while
// (room.ts), so it stays cheap to paint on slow phones.
import { mix } from './flat';

let uid = 0;
/** A shape in two tones, shaded: `base` lit from the top-left, `shade` along the bottom-right, a rim of light. */
export function two(d: string, base: string, shade: string, dx = -2, dy = -2): string {
  const n = ++uid, c = `rq${n}`, g = `rg${n}`;
  const lit = /^#[0-9a-f]{6}$/i.test(base) ? mix(base, -0.22) : base;
  return `<linearGradient id="${g}" x1="0" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="${lit}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="${/^#[0-9a-f]{6}$/i.test(base) ? mix(base, 0.12) : base}"/></linearGradient>`
    + `<clipPath id="${c}"><path d="${d}"/></clipPath><path d="${d}" fill="${shade}"/>`
    + `<g clip-path="url(#${c})"><path d="${d}" fill="url(#${g})" transform="translate(${dx} ${dy})"/>`
    + `<path d="${d}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" opacity=".4" transform="translate(1.1 1.1)"/></g>`;
}
/** The chunky edge under a shape, now also its outline in the same deep tone. */
export const edge = (d: string, c: string, dy = 3) =>
  `<path d="${d}" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round" transform="translate(0 ${dy})"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>`;
