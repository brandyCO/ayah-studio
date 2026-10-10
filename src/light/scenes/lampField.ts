// Revision lamps as a lantern field (docs/light.md, L4): every page of the mushaf is a paper lantern
// floating low over still water, one cluster per juz (juz 1 on the right, later juz to the left, as a
// mushaf's pages run). Memorised pages are lit from inside, dimmer as their interval passes; a lamp
// that would like a visit flickers softly; pages not memorised are unlit paper. "Revised today"
// makes a lantern rise a little and brighten, then settle. Everything below the water is the same
// field mirrored, dimmer. Posed from (t, state, camera input) only.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, PerspectiveCamera, Points, Scene, ShaderMaterial, Sprite, SpriteMaterial, Vector3, type Texture,
} from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { col, noor, skyDome, starField, water } from '../parts';
import { rng } from '../noise';

export const JUZ_SPACING = 9;
const COLS = 5;

export interface LampState {
  /** 0 = not memorised; otherwise 0.15…1 (how lit), as glow(l).light. */
  light: number;
  due: boolean;
}

export interface LampFieldInput {
  /** By page 1…604. */
  lamps: (LampState | undefined)[];
  /** Scene time each page last rose (revised), by page. */
  rose: Map<number, number>;
  selected: number;
  /** Camera centre along the shore (world x) and distance. */
  camX: number;
  dist: number;
}

/** World position of a page: its juz cluster, then right-to-left, front row first. */
export function lampLayout(juzOfPage: number[]): Vector3[] {
  const out: Vector3[] = [new Vector3()];
  const idx = new Array(31).fill(0);
  const r = rng(11);
  for (let p = 1; p < juzOfPage.length; p++) {
    const j = juzOfPage[p];
    const k = idx[j]++;
    const c = k % COLS, row = Math.floor(k / COLS);
    out[p] = new Vector3(
      juzX(j) + (COLS / 2 - 0.5 - c) * 1.25 + (r() - 0.5) * 0.3,
      0.75 + (r() - 0.5) * 0.35,
      -1.2 - row * 1.4 + (r() - 0.5) * 0.3,
    );
  }
  return out;
}
export const juzX = (j: number) => -(j - 1) * JUZ_SPACING;

let ringTex: Texture | null = null;
function ringTexture(): Texture {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.strokeStyle = '#fff';
  x.lineWidth = 5;
  x.filter = 'blur(1.5px)';
  x.beginPath();
  x.arc(64, 64, 44, 0, Math.PI * 2);
  x.stroke();
  ringTex = new CanvasTexture(c);
  return ringTex;
}

export function lampFieldScene(juzOfPage: number[], seed = 1): LightScene & { input: LampFieldInput; positions: Vector3[]; refresh(): void } {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 2000);
  scene.add(camera);
  const glowDir = new Vector3(0.2, 0.06, -1);
  const sky = skyDome({ zenith: '#060a24', mid: '#16194a', horizon: '#4a3a62', glow: '#e8a6a0' }, glowDir);
  const stars = starField(seed, 900, { spread: 1.2, minY: 0.1 });
  const sea = water({ deep: '#080b22', sheen: '#ffb85c', fog: '#3a2f58' }, glowDir, { opacity: 0.74 });
  scene.add(sky, stars.object);

  const positions = lampLayout(juzOfPage);
  const N = positions.length - 1;
  const pos = new Float32Array(N * 3), phase = new Float32Array(N), light = new Float32Array(N), due = new Float32Array(N), rise = new Float32Array(N);
  const r = rng(seed + 4);
  for (let i = 0; i < N; i++) {
    const p = positions[i + 1];
    pos.set([p.x, p.y, p.z], i * 3);
    phase[i] = r();
    rise[i] = -1e6;
  }
  const common = /* glsl */ `
    uniform float uTime, uMirror;
    attribute float aPhase, aLight, aDue, aRise;
    varying float vLight, vLit;
    vec3 lampAt(vec3 b) {
      float since = uTime - aRise;
      float up = since > 0.0 && since < 6.0 ? sin(3.14159 * min(1.0, since / 6.0)) * 0.55 : 0.0;
      return b + vec3(0.0, sin(uTime * 0.5 + aPhase * 6.28) * 0.06 + up, 0.0);
    }
    void lampLight() {
      float since = uTime - aRise;
      float boost = since > 0.0 && since < 6.0 ? sin(3.14159 * min(1.0, since / 6.0)) * 0.6 : 0.0;
      float flick = aDue > 0.5 ? 0.8 + 0.2 * sin(uTime * 6.3 + aPhase * 40.0) * sin(uTime * 2.7 + aPhase * 9.0) : 1.0;
      vLit = aLight > 0.0 ? 1.0 : 0.0;
      vLight = clamp((aLight + boost) * flick, 0.0, 1.4);
    }`;
  const attrs = (g: BufferGeometry | InstancedBufferGeometry, inst: boolean) => {
    const A = inst ? InstancedBufferAttribute : BufferAttribute;
    g.setAttribute(inst ? 'aBase' : 'position', new A(pos, 3));
    g.setAttribute('aPhase', new A(phase, 1));
    g.setAttribute('aLight', new A(light, 1));
    g.setAttribute('aDue', new A(due, 1));
    g.setAttribute('aRise', new A(rise, 1));
  };
  const geos: (BufferGeometry | InstancedBufferGeometry)[] = [];
  const mats: ShaderMaterial[] = [];

  function makeField(mirror: boolean) {
    const body = new CylinderGeometry(0.2, 0.15, 0.42, 10, 1, true);
    const ig = new InstancedBufferGeometry();
    ig.index = body.index;
    ig.setAttribute('position', body.getAttribute('position'));
    attrs(ig, true);
    ig.instanceCount = N;
    const bodyMat = new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide,
      uniforms: { uTime: { value: 0 }, uMirror: { value: mirror ? -1 : 1 }, uAlpha: { value: mirror ? 0.22 : 1 } },
      vertexShader: /* glsl */ `
        ${common}
        attribute vec3 aBase;
        varying float vY;
        void main() {
          lampLight();
          vY = position.y / 0.42 + 0.5;
          vec3 p = lampAt(aBase) + position;
          p.y *= uMirror;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying float vLight, vLit, vY;
        void main() {
          // Lit: warm paper glowing from inside, brightest low down. Unlit: pale paper in the dusk.
          vec3 lit = mix(vec3(1.0, 0.86, 0.58), vec3(0.9, 0.45, 0.22), smoothstep(0.1, 1.0, vY));
          vec3 c = mix(vec3(0.62, 0.56, 0.68), lit * (0.45 + 0.75 * vLight), vLit);
          float a = mix(0.5, 0.95 - 0.25 * vY, vLit);
          gl_FragColor = vec4(c, a * uAlpha);
        }`,
    });
    const bodies = new Mesh(ig, bodyMat);
    bodies.frustumCulled = false;
    const gg = new BufferGeometry();
    attrs(gg, false);
    const glowMat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMirror: { value: mirror ? -1 : 1 }, uAlpha: { value: mirror ? 0.3 : 1 }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        ${common}
        uniform float uScale;
        void main() {
          lampLight();
          vec3 p = lampAt(position);
          p.y *= uMirror;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vLit * (1.2 + 1.4 * vLight) * uScale / max(0.5, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying float vLight, vLit;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(1.0, 0.74, 0.42, a * a * 0.6 * vLight * vLit * uAlpha);
        }`,
    });
    const glows = new Points(gg, glowMat);
    glows.frustumCulled = false;
    geos.push(ig, gg);
    mats.push(bodyMat, glowMat);
    const g = new Group();
    g.add(bodies, glows);
    return g;
  }
  scene.add(makeField(true), sea.object, makeField(false));

  const pick = new Sprite(new SpriteMaterial({ map: ringTexture(), color: col('#fff1d6'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  pick.scale.setScalar(1.1);
  scene.add(pick);
  const companion = noor(seed + 7);
  scene.add(companion.object);

  const input: LampFieldInput = { lamps: [], rose: new Map(), selected: 1, camX: 0, dist: 5.5 };
  let scale = 400, px = 1;

  /** Copy the lamps' state into the attributes (call after a change). */
  function refresh() {
    for (let i = 0; i < N; i++) {
      const l = input.lamps[i + 1];
      light[i] = l ? Math.max(0.15, l.light) : 0;
      due[i] = l?.due ? 1 : 0;
      rise[i] = input.rose.get(i + 1) ?? -1e6;
    }
    for (const g of geos) for (const k of ['aLight', 'aDue', 'aRise']) (g.getAttribute(k) as BufferAttribute).needsUpdate = true;
  }

  return {
    scene, camera, input, positions, refresh,
    update(t) {
      const d = input.dist;
      camera.position.set(input.camX + Math.sin(t * 0.05) * 0.2, 0.9 + d * 0.16, 2 + d * 0.75);
      camera.lookAt(input.camX, 0.75, -2.4);
      for (const o of [sky, stars.object]) o.position.copy(camera.position);
      stars.update(t, px);
      sea.update(t, camera.position);
      for (const m of mats) m.uniforms.uTime.value = t;
      for (let i = 1; i < mats.length; i += 2) mats[i].uniforms.uScale.value = scale;
      const sp = positions[input.selected];
      if (sp) {
        const since = t - (input.rose.get(input.selected) ?? -1e6);
        const up = since > 0 && since < 6 ? Math.sin(Math.PI * Math.min(1, since / 6)) * 0.55 : 0;
        pick.position.set(sp.x, sp.y + up, sp.z);
        pick.material.opacity = 0.65 + 0.1 * Math.sin(t * 2);
      } else pick.material.opacity = 0;
      companion.object.position.set(input.camX - 3.2, 2.3, -1.5);
      companion.update(t, 0, 0);
    },
    setQuality(q: Quality) { stars.setCount(q === 'high' ? 900 : q === 'medium' ? 600 : 300); },
    resize(h) {
      scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
      px = Math.max(0.8, h / 700);
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
