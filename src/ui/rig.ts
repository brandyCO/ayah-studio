// The character's rig (owner 2026-11-15, "apply Duolingo-style animations of characters in the whole app"): the
// user's own character moves like the opening's — arms that swing from the shoulders and bend at the elbows, a body
// that squashes and settles, a head that follows through — and stays calm ("too much jumping"): small moves, one
// beat each. Every gesture is a set of targets that springs chase (overshoot, follow-through), simulated once and
// played as Web Animations keyframes on the HTML layers of `layer()` (actor.ts), so the compositor moves them
// without repainting. Reduced motion: nothing moves.
import { own, reduced } from './juice';

/** Channels a gesture drives. Arms: upper arm and forearm in degrees away from the body (0 = hanging at rest; the
 *  forearm is turned about the elbow on top of the upper arm). Body: squash (−0.1 = 10 % shorter), lift (view-box
 *  units up). Head: tilt (degrees, + towards the character's right = screen left) and dip (units down). */
type Ch = 'ual' | 'fal' | 'uar' | 'far' | 'sq' | 'lift' | 'tilt' | 'dip';
type Keys = [number, number][];
export type Gesture = 'wave' | 'cheer' | 'happy' | 'encourage' | 'proud' | 'hello';

// Spring stiffness and damping per channel: arms snappy with a little overshoot, the body soft, the head lagging.
const K: Record<Ch, [number, number]> = {
  ual: [260, 19], fal: [300, 18], uar: [260, 19], far: [300, 18], sq: [420, 17], lift: [300, 20], tilt: [140, 12], dip: [200, 15],
};

interface Script { dur: number; keys: Partial<Record<Ch, Keys>>; arms: boolean; face?: string }

/** Back-and-forth around `mid` for a wave: `n` swings of ±`amp` from `t0`, every `per` s. */
const swing = (t0: number, n: number, per: number, mid: number, amp: number): Keys =>
  Array.from({ length: n }, (_, i) => [t0 + i * per, mid + (i % 2 ? -amp : amp)] as [number, number]);

const SCRIPTS: Record<Gesture, () => Script> = {
  // One hand up, the forearm waving from the elbow; the head tips towards it.
  wave: () => ({
    dur: 2.3, arms: true, face: 'happy',
    keys: {
      uar: [[0, 0], [0.05, 98], [1.75, 0]],
      far: [[0, 0], [0.05, 48], ...swing(0.42, 6, 0.21, 48, 18), [1.68, 0]],
      ual: [[0, 0], [0.1, 6], [1.8, 0]],
      tilt: [[0, 0], [0.12, -5], [1.8, 0]],
      sq: [[0, 0], [0.04, -0.035], [0.16, 0.015], [0.3, 0]],
    },
  }),
  hello: () => SCRIPTS.wave(),
  // Both arms up and out in a V from the shoulders, a small lift (no jump), the head back a touch.
  cheer: () => ({
    dur: 2.1, arms: true, face: 'happy',
    keys: {
      ual: [[0, 0], [0.12, 132], [1.5, 0]],
      uar: [[0, 0], [0.12, 132], [1.5, 0]],
      fal: [[0, 0], [0.12, -4], [1.5, 0]],
      far: [[0, 0], [0.12, -4], [1.5, 0]],
      sq: [[0, -0.07], [0.12, 0.05], [0.4, 0], [1.5, -0.03], [1.7, 0]],
      lift: [[0, 0], [0.12, 5], [0.55, 0]],
      tilt: [[0, 0], [0.16, 3], [0.9, 0]],
      dip: [[0, 0], [0.12, -2], [0.6, 0]],
    },
  }),
  // A right answer: a quick bounce and a nod, the forearms coming up a little.
  happy: () => ({
    dur: 1.2, arms: true, face: 'happy',
    keys: {
      fal: [[0, 0], [0.04, 52], [0.6, 0]],
      far: [[0, 0], [0.04, 52], [0.6, 0]],
      ual: [[0, 0], [0.04, 14], [0.6, 0]],
      uar: [[0, 0], [0.04, 14], [0.6, 0]],
      sq: [[0, -0.06], [0.1, 0.04], [0.26, 0]],
      dip: [[0, 0], [0.18, 3], [0.36, -1], [0.5, 0]],
      tilt: [[0, 0], [0.1, -3], [0.5, 0]],
    },
  }),
  // A mistake: never sad. A calm tilt of the head, one open hand forward ("it's all right"), a soft nod.
  encourage: () => ({
    dur: 1.9, arms: true, face: 'calm',
    keys: {
      uar: [[0, 0], [0.1, 34], [1.3, 0]],
      far: [[0, 0], [0.14, 62], [1.3, 0]],
      tilt: [[0, 0], [0.12, 7], [1.35, 0]],
      dip: [[0, 0], [0.5, 2.5], [0.8, 0], [1.0, 2], [1.2, 0]],
      sq: [[0, 0], [0.1, -0.025], [0.4, 0]],
    },
  }),
  // Rank up: hands on the hips, chest up, chin up.
  proud: () => ({
    dur: 2.4, arms: true, face: 'proud',
    keys: {
      ual: [[0, 0], [0.08, 70], [1.75, 0]],
      uar: [[0, 0], [0.08, 70], [1.75, 0]],
      fal: [[0, 0], [0.08, -102], [1.75, 0]],
      far: [[0, 0], [0.08, -102], [1.75, 0]],
      sq: [[0, -0.05], [0.1, 0.035], [1.75, 0]],
      lift: [[0, 0], [0.1, 1.5], [1.75, 0]],
      dip: [[0, 0], [0.1, -1.5], [1.75, 0]],
      tilt: [[0, 0], [0.4, -3], [1.75, 0]],
    },
  }),
};

/** The target of a channel at time t: the last key at or before t. */
function target(keys: Keys | undefined, t: number): number {
  if (!keys) return 0;
  let v = 0;
  for (const [kt, kv] of keys) if (t >= kt) v = kv;
  return v;
}

const FPS = 30, DT = 1 / 240;
/** The springs chased through the script: one frame of every channel per 1/30 s. */
function simulate(s: Script): Record<Ch, number[]> {
  const chs = Object.keys(K) as Ch[];
  const x = Object.fromEntries(chs.map((c) => [c, 0])) as Record<Ch, number>;
  const v = { ...x };
  const out = Object.fromEntries(chs.map((c) => [c, [] as number[]])) as Record<Ch, number[]>;
  const n = Math.round(s.dur * FPS);
  let t = 0;
  for (let f = 0; f <= n; f++) {
    for (const c of chs) out[c].push(x[c]);
    const next = (f + 1) / FPS;
    while (t < next - 1e-9) {
      for (const c of chs) {
        const [k, d] = K[c];
        v[c] += (-k * (x[c] - target(s.keys[c], t)) - d * v[c]) * DT;
        x[c] += v[c] * DT;
      }
      t += DT;
    }
  }
  // Everything ends exactly at rest, so the drawn arms take over without a jump.
  for (const c of chs) out[c][n] = 0;
  return out;
}

const cache = new Map<Gesture, Record<Ch, number[]>>();
const playing = new WeakMap<Element, { anims: Animation[]; t: number }>();

type Frames = Record<'ual' | 'fal' | 'uar' | 'far' | 'mv' | 'hn' | 'sh', Keyframe[]>;
const framed = new Map<Gesture, Frames>();
/** A gesture's keyframes, written once (building ~500 of them in the tap that bursts a chest cost a slow phone ~40 ms). */
function frames(name: Gesture, F: Record<Ch, number[]>): Frames {
  let k = framed.get(name);
  if (k) return k;
  const n = F.sq.length;
  // Only the frames a straight line between neighbours would not give back (within a hair: a quarter degree, a few
  // thousandths of a scale): the compositor draws the in-betweens. A cheer went from ~470 keyframes to well under
  // half, and starting it no longer holds up the frame the chest bursts open in (2026-11-26).
  const kept = (series: [number[], number][]) => {
    const keep = new Set([0, n - 1]);
    const walk = (a: number, b: number) => {
      if (b - a < 2) return;
      let worst = -1, at = -1;
      for (let i = a + 1; i < b; i++) {
        const u = (i - a) / (b - a);
        for (const [v, tol] of series) {
          const d = Math.abs(v[i] - (v[a] + (v[b] - v[a]) * u)) / tol;
          if (d > worst) { worst = d; at = i; }
        }
      }
      if (worst > 1) { keep.add(at); walk(a, at); walk(at, b); }
    };
    walk(0, n - 1);
    return [...keep].sort((x, y) => x - y);
  };
  const fr = (f: (i: number) => Keyframe, series: [number[], number][]) => kept(series).map((i) => ({ ...f(i), offset: n > 1 ? i / (n - 1) : 0 }));
  const A = 0.25, L = 0.15, S = 0.004;
  const pct = (u: number, of: number) => `${(u / of * 100).toFixed(3)}%`;
  // Left arm (screen left) turns clockwise to swing out, the right one the other way.
  k = {
    ual: fr((i) => ({ transform: `rotate(${F.ual[i].toFixed(2)}deg)` }), [[F.ual, A]]),
    fal: fr((i) => ({ transform: `rotate(${F.fal[i].toFixed(2)}deg)` }), [[F.fal, A]]),
    uar: fr((i) => ({ transform: `rotate(${(-F.uar[i]).toFixed(2)}deg)` }), [[F.uar, A]]),
    far: fr((i) => ({ transform: `rotate(${(-F.far[i]).toFixed(2)}deg)` }), [[F.far, A]]),
    mv: fr((i) => {
      const sy = 1 + F.sq[i], sx = 1 / Math.sqrt(Math.max(0.5, sy));
      return { transform: `translateY(${pct(-F.lift[i], 262)}) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` };
    }, [[F.lift, L], [F.sq, S]]),
    hn: fr((i) => ({ rotate: `${(-F.tilt[i]).toFixed(2)}deg`, translate: `0 ${pct(F.dip[i] - F.lift[i] * 0.15, 262)}` }), [[F.tilt, A], [F.dip, L], [F.lift, L / 0.15]]),
    sh: fr((i) => ({ scale: `${(1 - F.lift[i] / 40).toFixed(3)}` }), [[F.lift, 0.04]]),
  };
  framed.set(name, k);
  return k;
}

/** Works a gesture out ahead of time (while nothing else is happening), so playing it later costs almost nothing. */
export function warmGesture(name: Gesture) {
  const F = cache.get(name) ?? simulate(SCRIPTS[name]());
  cache.set(name, F);
  frames(name, F);
}

/** Plays a gesture on a layered character (`root` holds `.fg-lay`). Returns its length in ms (0 when nothing moved). */
export function gesture(root: Element, name: Gesture, face?: (xp: string | null, ms: number) => void): number {
  const lay = root.querySelector('.fg-lay');
  if (!lay || reduced()) return 0;
  const s = SCRIPTS[name]();
  const F = cache.get(name) ?? simulate(s);
  cache.set(name, F);
  const ms = s.dur * 1000;
  stop(root);
  const q = (sel: string) => lay.querySelector<HTMLElement>(sel);
  const anims: Animation[] = [];
  // Each part takes over its own layer: a move left there (a hop, a nod) stops, so the layer keeps one motion
  // and the graphics chip runs it (motion engine pass 2026-11-19).
  const play = (el: HTMLElement | null, frames: Keyframe[]) => {
    if (el) { own(el); anims.push(el.animate(frames, { duration: ms, easing: 'linear' })); }
  };
  const k = frames(name, F);
  if (s.arms) {
    play(q('.fg-rua-l'), k.ual);
    play(q('.fg-rfa-l'), k.fal);
    play(q('.fg-rua-r'), k.uar);
    play(q('.fg-rfa-r'), k.far);
    lay.classList.add('rigging');
  }
  play(q('.fg-mv'), k.mv);
  // The head on its own layer inside its idle sway; a squashed body squashes the head less.
  play(q('.fg-hn'), k.hn);
  play(lay.querySelector<HTMLElement>(':scope > .fg-sh > i'), k.sh);
  if (s.face && face) face(s.face, ms * 0.85);
  const t = window.setTimeout(() => { lay.classList.remove('rigging'); playing.delete(root); }, ms);
  playing.set(root, { anims, t });
  return ms;
}

/** Stops a gesture at once (back to rest). */
export function stop(root: Element) {
  const p = playing.get(root);
  if (!p) return;
  for (const a of p.anims) a.cancel();
  clearTimeout(p.t);
  root.querySelector('.fg-lay')?.classList.remove('rigging');
  playing.delete(root);
}
