// Home sky (docs/light.md, L6): a night over a slow cloud sea that you fly through. Each juz is a
// thread of stars spiralling up out of the clouds — a juz's first page low, its last high — and the
// 30 threads stand along a gently winding avenue, juz 1 nearest, later juz further on. Pages read
// this month are lit stars (brighter when read recently, larger and warmer when returned to on
// several days); the rest are faint points; fine lines join neighbouring read pages. Khatm circles
// float above the avenue as tilted rings of 30 (free faint, taken in the member's colour, done
// bright). The camera travels along the avenue (`focus`, in juz) and swings round it (`yaw`), so
// near threads pass in front of far ones; opening the sky flies in from high above. Noor keeps the
// viewer company. Posed from (t, input) only.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Fog, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Points, Scene, ShaderMaterial,
  Vector3,
} from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { cloudSea, col, moteField, noor, skyDome, starField } from '../parts';
import { rng } from '../noise';

const FOV = 55;
export const JUZ_GAP = 8; // world units between juz threads along the avenue
const THREAD_LOW = 1.6, THREAD_HIGH = 11;
const CIRCLE_Y = 14, CIRCLE_R = 2.3;

export interface SkyStar { page: number; bright: number; size: number; warm: number }
export interface SkyCircle { id: string; at: number; stars: { status: 'free' | 'taken' | 'done'; color: string }[] }

export interface HomeSkyInput {
  /** Where the camera is along the avenue, in juz (1…30, fractional), and how far it swings round. */
  focus: number;
  yaw: number;
  /** Scene time the view opened (for the fly-in). */
  openedAt: number;
}

/** The avenue's centre line at juz position f. */
export const avenue = (f: number, out = new Vector3()) => out.set(Math.sin(f * 0.55) * 6, 0, -(f - 1) * JUZ_GAP);

/** World position of every page (index 1…604). */
export function pagePositions(juzOfPage: number[], seed = 5): Vector3[] {
  const r = rng(seed);
  const byJuz = new Map<number, number[]>();
  for (let p = 1; p < juzOfPage.length; p++) byJuz.set(juzOfPage[p], [...(byJuz.get(juzOfPage[p]) ?? []), p]);
  const out: Vector3[] = [new Vector3()];
  const c = new Vector3();
  for (const [j, pages] of byJuz) {
    avenue(j, c);
    // Threads stand to alternate sides of the avenue so the camera passes between them.
    c.x += (j % 2 ? 1 : -1) * 2.4;
    const n = pages.length;
    pages.forEach((p, k) => {
      const a = k * 0.85 + j * 1.3, rad = 0.85 + 0.35 * Math.sin(k * 0.7 + j);
      out[p] = new Vector3(
        c.x + Math.cos(a) * rad + (r() - 0.5) * 0.2,
        THREAD_LOW + (k / Math.max(1, n - 1)) * (THREAD_HIGH - THREAD_LOW) + (r() - 0.5) * 0.25,
        c.z + Math.sin(a) * rad + (r() - 0.5) * 0.2,
      );
    });
  }
  return out;
}

/** Centre of a circle's ring floating above the avenue at juz position `at`. */
export const circleCentre = (at: number, out = new Vector3()) => avenue(at, out).setY(CIRCLE_Y);

const POINT_VS = /* glsl */ `
  attribute float aSize, aAlpha, aPhase;
  attribute vec3 aColor;
  uniform float uTime, uScale;
  varying float vA, vDepth;
  varying vec3 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.85 + 0.15 * sin(uTime * (0.4 + aPhase * 0.6) + aPhase * 30.0);
    vA = aAlpha * tw;
    vC = aColor;
    vDepth = -mv.z;
    gl_PointSize = max(1.5, aSize * uScale / max(0.5, -mv.z));
  }`;
const POINT_FS = /* glsl */ `
  uniform float uNear, uFar;
  varying float vA, vDepth;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d);
    float haze = 1.0 - 0.85 * smoothstep(uNear, uFar, vDepth); // far stars fade into the haze
    gl_FragColor = vec4(vC, (core * 0.9 + halo * halo * 0.55) * vA * haze);
  }`;

/** One Points draw call with per-point colour, world size and alpha (perspective-sized, hazed). */
function pointSet(count: number) {
  const geo = new BufferGeometry();
  const attr = (name: string, n: number) => {
    const a = new BufferAttribute(new Float32Array(count * n), n);
    geo.setAttribute(name, a);
    return a;
  };
  const pos = attr('position', 3), color = attr('aColor', 3), size = attr('aSize', 1), alpha = attr('aAlpha', 1), phase = attr('aPhase', 1);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uNear: { value: 22 }, uFar: { value: 95 } },
    vertexShader: POINT_VS, fragmentShader: POINT_FS,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, geo, mat, pos, color, size, alpha, phase };
}

const easeOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);

export function homeSkyScene(positions: Vector3[], seed = 9): LightScene & {
  input: HomeSkyInput;
  setStars(stars: SkyStar[]): void;
  setCircles(circles: SkyCircle[]): void;
  /** World position of a circle's centre (index into the last setCircles). */
  circleAt(i: number, out: Vector3): Vector3;
} {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 2000);
  scene.add(camera);
  scene.fog = new Fog(col('#1a1c48'), 22, 95); // the thread lines fade too

  const glowDir = new Vector3(-0.35, 0.05, -1);
  const sky = skyDome({ zenith: '#04071c', mid: '#0f1540', horizon: '#3a3466', glow: '#b88a8e' }, glowDir);
  const dust = starField(seed, 1400, { spread: Math.PI, minY: 0.05, size: 0.8 });
  (dust.material.uniforms.uAlpha as { value: number }).value = 0.55;
  const sea = cloudSea({ deep: '#0b1030', mid: '#262b5a', top: '#6d6799', fog: '#3a3466', glint: '#e8a6a0', skyGlow: '#b88a8e' }, glowDir, { y: -1, speed: 0.6, scale: 0.035 });
  const far = new Group(); // the sky is "at infinity": it follows the camera
  far.add(sky, dust.object);
  scene.add(far, sea.object);

  // Every page: a faint point; read pages lit.
  const N = positions.length - 1;
  const pages = pointSet(N);
  const r = rng(seed + 2);
  for (let p = 1; p <= N; p++) {
    pages.pos.setXYZ(p - 1, positions[p].x, positions[p].y, positions[p].z);
    pages.phase.setX(p - 1, r());
  }
  scene.add(pages.pts);

  // Fine lines between neighbouring read pages of a juz.
  const threadGeo = new BufferGeometry();
  threadGeo.setAttribute('position', new BufferAttribute(new Float32Array(N * 6), 3));
  const thread = new LineSegments(threadGeo, new LineBasicMaterial({ color: col('#ffe2b0'), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }));
  thread.frustumCulled = false;
  scene.add(thread);

  // Circles (rebuilt when they change).
  let rings: ReturnType<typeof pointSet> | null = null;
  let circleSpots: number[] = [];

  const len = 30 * JUZ_GAP;
  const motes = moteField(seed + 4, 320, new Vector3(0, 5, -len / 2), new Vector3(10, 6, len / 2 + 10), '#ffd58a');
  scene.add(motes.object);
  const companion = noor(seed + 7);
  companion.object.position.set(0.7, -1.5, -5.5);
  companion.object.scale.setScalar(0.7);
  camera.add(companion.object);

  const input: HomeSkyInput = { focus: 1, yaw: 0, openedAt: 0 };
  let scale = 400;
  const a = new Vector3(), look = new Vector3();
  const faint = col('#c9c3e6'), white = col('#fff6e6'), gold = col('#ffd58a');
  const juzOf = (p: number) => Math.max(1, Math.min(30, Math.round(-positions[p].z / JUZ_GAP) + 1));

  return {
    scene, camera, input,
    circleAt: (i, out) => circleCentre(circleSpots[i] ?? 1, out),
    setStars(stars) {
      const lit = new Map(stars.map((s) => [s.page, s]));
      const c = faint.clone();
      for (let p = 1; p <= N; p++) {
        const s = lit.get(p);
        if (s) {
          c.copy(white).lerp(gold, s.warm * 0.7);
          pages.color.setXYZ(p - 1, c.r, c.g, c.b);
          pages.size.setX(p - 1, 0.55 * s.size);
          pages.alpha.setX(p - 1, s.bright);
        } else {
          pages.color.setXYZ(p - 1, faint.r, faint.g, faint.b);
          pages.size.setX(p - 1, 0.3);
          pages.alpha.setX(p - 1, 0.5);
        }
      }
      for (const x of [pages.color, pages.size, pages.alpha]) x.needsUpdate = true;
      const tp = threadGeo.getAttribute('position') as BufferAttribute;
      let n = 0;
      for (let p = 1; p < N; p++) {
        if (!lit.has(p) || !lit.has(p + 1) || juzOf(p) !== juzOf(p + 1)) continue;
        for (const q of [p, p + 1]) tp.setXYZ(n++, positions[q].x, positions[q].y, positions[q].z);
      }
      threadGeo.setDrawRange(0, n);
      tp.needsUpdate = true;
    },
    setCircles(circles) {
      if (rings) {
        scene.remove(rings.pts);
        rings.geo.dispose();
        rings.mat.dispose();
      }
      circleSpots = circles.map((ci) => ci.at);
      rings = circles.length ? pointSet(circles.length * 30) : null;
      if (!rings) return;
      const rr = rng(seed + 6);
      const c = faint.clone(), ctr = new Vector3();
      circles.forEach((ci, i) => {
        circleCentre(ci.at, ctr);
        for (let j = 1; j <= 30; j++) {
          const k = i * 30 + j - 1;
          const ang = ((j - 0.5) / 30) * Math.PI * 2 - Math.PI / 2;
          // The ring lies back (about 57°), towards the viewer coming along the avenue.
          const x = CIRCLE_R * Math.cos(ang), yy = -CIRCLE_R * Math.sin(ang);
          rings!.pos.setXYZ(k, ctr.x + x, ctr.y + yy * 0.55, ctr.z + yy * 0.84);
          rings!.phase.setX(k, rr());
          const s = ci.stars[j - 1];
          const st = s?.status ?? 'free';
          c.set(st === 'free' ? '#c9c3e6' : st === 'done' ? '#fff6e6' : s.color);
          rings!.color.setXYZ(k, c.r, c.g, c.b);
          rings!.size.setX(k, st === 'free' ? 0.28 : st === 'done' ? 0.7 : 0.55);
          rings!.alpha.setX(k, st === 'free' ? 0.35 : st === 'done' ? 1 : 0.85);
        }
      });
      scene.add(rings.pts);
    },
    update(t) {
      // Fly-in (3.5 s): from high and far back, down to the avenue.
      const fly = easeOut((t - input.openedAt) / 3.5);
      const f = input.focus;
      avenue(f + 0.6, look).setY(5.8 + (1 - fly) * 2);
      avenue(f - 1.8, a);
      // Behind the juz in focus, swung round the look point by `yaw`; a slow breathing sway.
      const yaw = input.yaw + Math.sin(t * 0.03) * 0.04;
      const dx = a.x - look.x, dz = a.z - look.z;
      const back = 1 + (1 - fly) * 1.6;
      camera.position.set(
        look.x + (dx * Math.cos(yaw) + dz * Math.sin(yaw)) * back + Math.sin(t * 0.05) * 0.3,
        7.2 + (1 - fly) * 16 + Math.sin(t * 0.07) * 0.2,
        look.z + (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) * back,
      );
      camera.lookAt(look);
      far.position.copy(camera.position);
      dust.update(t, 1.2);
      sea.update(t, camera.position);
      motes.update(t, 0, scale);
      for (const m of [pages.mat, rings?.mat]) {
        if (!m) continue;
        m.uniforms.uTime.value = t;
        m.uniforms.uScale.value = scale;
      }
      companion.update(t, 0, 0);
    },
    setQuality(q: Quality) {
      dust.setCount(q === 'high' ? 1400 : q === 'medium' ? 900 : 500);
      motes.setCount(q === 'low' ? 120 : 320);
    },
    resize(h) {
      scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
    },
  };
}
