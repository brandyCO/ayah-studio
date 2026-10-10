// Home sky (docs/light.md, L6): a night sky over a slow cloud sea. Every mushaf page has its place
// in the sky (skyLayout.ts); pages read this month are lit stars — brighter when read recently,
// a little larger and warmer when returned to on several days — and faint points mark the rest.
// Neighbouring read pages of a juz are joined by a fine thread. Khatm circles hang above as small
// rings of 30 (free faint, taken in the member's colour, done bright). Noor floats near the viewer.
// Posed from (t, input) only: the view direction comes from the screen's drag state.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Points, Scene,
  ShaderMaterial, Vector3,
} from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { cloudSea, col, moteField, noor, skyDome, starField } from '../parts';
import { rng } from '../noise';
import { ringOffset, type Spot } from '../skyLayout';

export const SKY_R = 100;
const FOV = 60;

export interface SkyStar { page: number; bright: number; size: number; warm: number }
export interface SkyCircle { id: string; spot: Spot; stars: { status: 'free' | 'taken' | 'done'; color: string }[] }

export interface HomeSkyInput {
  /** View direction (radians): azimuth offset (positive = right) and elevation. */
  look: number;
  pitch: number;
}

/** World direction of a sky spot (unit vector). */
export function spotDir(s: Spot, out = new Vector3()) {
  const k = Math.cos(s.el);
  return out.set(Math.sin(s.off) * k, Math.sin(s.el), -Math.cos(s.off) * k);
}

const POINT_VS = /* glsl */ `
  attribute float aSize, aAlpha, aPhase;
  attribute vec3 aColor;
  uniform float uTime, uPx;
  varying float vA;
  varying vec3 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.85 + 0.15 * sin(uTime * (0.4 + aPhase * 0.6) + aPhase * 30.0);
    vA = aAlpha * tw;
    vC = aColor;
    gl_PointSize = aSize * uPx * (0.95 + 0.05 * tw);
  }`;
const POINT_FS = /* glsl */ `
  varying float vA;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vC, (core * 0.9 + halo * halo * 0.55) * vA);
  }`;

/** One Points draw call with per-point colour, size and alpha. */
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
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: POINT_VS, fragmentShader: POINT_FS,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, geo, mat, pos, color, size, alpha, phase };
}

export function homeSkyScene(spots: Spot[], seed = 9): LightScene & {
  input: HomeSkyInput;
  setStars(stars: SkyStar[]): void;
  setCircles(circles: SkyCircle[]): void;
} {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 2000);
  camera.position.set(0, 4, 0);
  scene.add(camera);

  const glowDir = new Vector3(-0.35, 0.05, -1);
  const sky = skyDome({ zenith: '#04071c', mid: '#0f1540', horizon: '#3a3466', glow: '#b88a8e' }, glowDir);
  const dust = starField(seed, 1400, { spread: Math.PI, minY: 0.05, size: 0.8 });
  (dust.material.uniforms.uAlpha as { value: number }).value = 0.55;
  const sea = cloudSea({ deep: '#0b1030', mid: '#262b5a', top: '#6d6799', fog: '#2c2a58', glint: '#e8a6a0', skyGlow: '#b88a8e' }, glowDir, { y: 0, speed: 0.6 });
  const near = new Group(); // follows the camera position (the sky is "at infinity")
  near.add(sky, dust.object);
  scene.add(near, sea.object);

  // Every page: a faint point; read pages lit.
  const N = spots.length - 1;
  const pages = pointSet(N);
  const r = rng(seed + 2);
  const d = new Vector3();
  for (let p = 1; p <= N; p++) {
    spotDir(spots[p], d).multiplyScalar(SKY_R);
    pages.pos.setXYZ(p - 1, d.x, d.y, d.z);
    pages.phase.setX(p - 1, r());
  }
  near.add(pages.pts);

  // Threads between neighbouring read pages of a juz.
  const threadGeo = new BufferGeometry();
  threadGeo.setAttribute('position', new BufferAttribute(new Float32Array(N * 6), 3));
  const thread = new LineSegments(threadGeo, new LineBasicMaterial({ color: col('#ffe2b0'), transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }));
  thread.frustumCulled = false;
  near.add(thread);

  // Circles (rebuilt when they change).
  let rings: ReturnType<typeof pointSet> | null = null;
  const ringGroup = new Group();
  near.add(ringGroup);

  const motes = moteField(seed + 4, 70, new Vector3(0, 4, -6), new Vector3(8, 3, 5), '#ffd58a');
  scene.add(motes.object);
  const companion = noor(seed + 7);
  companion.object.position.set(0.15, -1.25, -4.2);
  camera.add(companion.object);

  const input: HomeSkyInput = { look: 0, pitch: 0.3 };
  let px = 1, scale = 400;
  const target = new Vector3();
  const faint = col('#c9c3e6'), white = col('#fff6e6'), gold = col('#ffd58a');

  return {
    scene, camera, input,
    setStars(stars) {
      const lit = new Map(stars.map((s) => [s.page, s]));
      const c = faint.clone();
      for (let p = 1; p <= N; p++) {
        const s = lit.get(p);
        if (s) {
          c.copy(white).lerp(gold, s.warm * 0.7);
          pages.color.setXYZ(p - 1, c.r, c.g, c.b);
          pages.size.setX(p - 1, 13 * s.size);
          pages.alpha.setX(p - 1, s.bright);
        } else {
          pages.color.setXYZ(p - 1, faint.r, faint.g, faint.b);
          pages.size.setX(p - 1, 5.5);
          pages.alpha.setX(p - 1, 0.3);
        }
      }
      for (const a of [pages.color, pages.size, pages.alpha]) a.needsUpdate = true;
      const tp = threadGeo.getAttribute('position') as BufferAttribute;
      let n = 0;
      for (let p = 1; p < N; p++) {
        if (!lit.has(p) || !lit.has(p + 1)) continue;
        if (Math.abs(spots[p].off - spots[p + 1].off) > 0.1) continue; // a new juz
        for (const q of [p, p + 1]) tp.setXYZ(n++, pages.pos.getX(q - 1), pages.pos.getY(q - 1), pages.pos.getZ(q - 1));
      }
      threadGeo.setDrawRange(0, n);
      tp.needsUpdate = true;
    },
    setCircles(circles) {
      if (rings) {
        ringGroup.remove(rings.pts);
        rings.geo.dispose();
        rings.mat.dispose();
      }
      rings = circles.length ? pointSet(circles.length * 30) : null;
      if (!rings) return;
      const rr = rng(seed + 6);
      const c = faint.clone();
      circles.forEach((ci, i) => {
        for (let j = 1; j <= 30; j++) {
          const k = i * 30 + j - 1;
          const o = ringOffset(j);
          spotDir({ off: ci.spot.off + o.dx / Math.cos(ci.spot.el), el: ci.spot.el + o.dy }, d).multiplyScalar(SKY_R);
          rings!.pos.setXYZ(k, d.x, d.y, d.z);
          rings!.phase.setX(k, rr());
          const s = ci.stars[j - 1];
          const st = s?.status ?? 'free';
          c.set(st === 'free' ? '#c9c3e6' : st === 'done' ? '#fff6e6' : s.color);
          rings!.color.setXYZ(k, c.r, c.g, c.b);
          rings!.size.setX(k, st === 'free' ? 3.4 : st === 'done' ? 8.5 : 6.5);
          rings!.alpha.setX(k, st === 'free' ? 0.3 : st === 'done' ? 1 : 0.8);
        }
      });
      ringGroup.add(rings.pts);
    },
    update(t) {
      // A very slow drift around where the viewer looks (≪ 2°/s), never a jump.
      const look = input.look + Math.sin(t * 0.025) * 0.035;
      const pitch = input.pitch + Math.sin(t * 0.031 + 1) * 0.015;
      camera.position.set(Math.sin(t * 0.04) * 0.4, 4 + Math.sin(t * 0.05) * 0.15, Math.cos(t * 0.03) * 0.3);
      spotDir({ off: look, el: pitch }, target).add(camera.position);
      camera.lookAt(target);
      near.position.copy(camera.position);
      dust.update(t, px);
      sea.update(t, camera.position);
      motes.update(t, 0, scale);
      for (const m of [pages.mat, rings?.mat]) if (m) { m.uniforms.uTime.value = t; m.uniforms.uPx.value = px; }
      companion.update(t, 0, 0);
    },
    setQuality(q: Quality) {
      dust.setCount(q === 'high' ? 1400 : q === 'medium' ? 900 : 500);
      motes.setCount(q === 'low' ? 30 : 70);
    },
    resize(h) {
      px = Math.max(0.8, h / 800);
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
