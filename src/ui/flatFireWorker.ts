// Draws the power-up's flying bits off the main thread (flatFire.ts / flatFireCore.ts): the page sends the commands
// and, once a frame, where each character stands; the canvases are drawn and shown here.
import { FireBits, type Aura, type FlatPalette } from './flatFireCore';

type Msg =
  | { t: 'init'; id: number; b: OffscreenCanvas; f: OffscreenCanvas; pal: FlatPalette; dpr: number; w: number; h: number }
  | { t: 'cmd'; id: number; c: { t: 'burst'; a: [number, number, number, number, boolean] } | { t: 'sparks'; a: [number, number, number, number] } | { t: 'ring'; a: [number, number, number] } | { t: 'swirl'; a: [number, number] } }
  | { t: 'frame'; id: number; dt: number; auras: Aura[] }
  | { t: 'resize'; id: number; w: number; h: number }
  | { t: 'stop'; id: number };

const all = new Map<number, FireBits>();
self.onmessage = (e: MessageEvent<Msg>) => {
  const d = e.data;
  if (d.t === 'init') { all.set(d.id, new FireBits(d.b, d.f, d.pal, d.dpr, d.w, d.h)); return; }
  const g = all.get(d.id);
  if (!g) return;
  if (d.t === 'frame') { g.step(d.dt); g.draw(d.auras); }
  else if (d.t === 'cmd') {
    const c = d.c;
    if (c.t === 'burst') g.burst(...c.a);
    else if (c.t === 'sparks') g.sparks(...c.a);
    else if (c.t === 'ring') g.ring(...c.a);
    else g.swirl(...c.a);
  }
  else if (d.t === 'resize') g.resize(d.w, d.h);
  else all.delete(d.id);
};
