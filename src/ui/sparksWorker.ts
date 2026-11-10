// Draws the reward moments' sparks off the main thread (src/ui/sparks.ts), so the chest, the character and the
// rest of the moment never wait for the particles: the page only sends where a burst starts.
import { engine, type Engine } from './sparksCore';

type Msg =
  | { t: 'init'; id: number; canvas: OffscreenCanvas; colors: string[]; lite: boolean; dpr: number; w: number; h: number }
  | { t: 'burst'; id: number; x: number; y: number; n: number; power?: number }
  | { t: 'motes'; id: number; on: boolean }
  | { t: 'resize'; id: number; w: number; h: number }
  | { t: 'stop'; id: number };

const all = new Map<number, Engine>();
self.onmessage = (e: MessageEvent<Msg>) => {
  const d = e.data;
  if (d.t === 'init') { all.set(d.id, engine(d.canvas, d.colors, d.lite, d.dpr, d.w, d.h)); return; }
  const g = all.get(d.id);
  if (!g) return;
  if (d.t === 'burst') g.burst(d.x, d.y, d.n, d.power);
  else if (d.t === 'motes') g.motes(d.on);
  else if (d.t === 'resize') g.resize(d.w, d.h);
  else { g.stop(); all.delete(d.id); }
};
