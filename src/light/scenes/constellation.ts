// Khatm circle as a constellation (docs/light.md, L3): the 30 juz as stars on a ring floating in a
// night sky, facing the viewer with a gentle wobble (so the flat SVG ring above it still lines up
// for taps and keyboard). Free juz are faint, taken ones glow in the member's colour, finished ones
// are bright; lines join neighbouring lit stars. On completion all lights drift together into one
// point that blooms open. Pure in (t, state): the state only changes when the circle does.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Scene,
  Sprite, SpriteMaterial, Vector3, type Texture,
} from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { col, glowSprite, glowTexture, mistLayer, noor, skyDome, starField } from '../parts';

export interface StarState {
  juz: number;
  status: 'free' | 'taken' | 'done';
  color: string; // member colour ('' when free)
  mine: boolean;
  picked: boolean;
  /** Finished since you last looked: brightens once when the view opens. */
  sweep: boolean;
}

export interface ConstellationInput {
  stars: StarState[];
  /** Scene time the completion moment started (null: not playing). */
  celebrateAt: number | null;
  /** The view opened at this scene time (for the sweep). */
  openedAt: number;
}

/** Ring radius in world units and the camera distance that make it match the SVG ring (r 121 of 150). */
export const RING_R = 3;
const FOV = 40;
const DIST = RING_R / ((121 / 150) * Math.tan((FOV * Math.PI) / 360));

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

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Where juz j sits on the ring (matches the SVG: juz 1 at the top, clockwise). */
export function ringPos(j: number, out = new Vector3()) {
  const a = ((j - 0.5) / 30) * Math.PI * 2 - Math.PI / 2;
  return out.set(RING_R * Math.cos(a), -RING_R * Math.sin(a), 0);
}

export function constellationScene(seed = 1): LightScene & { input: ConstellationInput } {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 2000);
  camera.position.set(0, 0, DIST);
  scene.add(camera);

  // The sky turned upwards so the view shows the high night, with mist far below.
  const skyGroup = new Group();
  skyGroup.rotation.x = -0.6;
  const sky = skyDome({ zenith: '#04071c', mid: '#0d1336', horizon: '#2a2756', glow: '#6d4e78' }, new Vector3(0.2, 0.1, -1));
  const stars = starField(seed, 1600, { spread: 1.1 });
  skyGroup.add(sky, stars.object);
  const mist = mistLayer(seed + 3, { z: -14, y: -9, width: 60, height: 9, color: '#3a3570', opacity: 0.7, speed: 0.7 });
  scene.add(skyGroup, mist.object);

  // The ring: 30 stars (core + halo), a soft path through them, and a halo for the picked one.
  const ring = new Group();
  scene.add(ring);
  const path = new Group();
  for (let j = 0; j < 120; j++) {
    const s = glowSprite('#c9c3e6', 0.09, 0.22);
    ringPos(1 + (j / 120) * 30, s.position);
    path.add(s);
  }
  ring.add(path);
  const cores: Sprite[] = [], halos: Sprite[] = [];
  for (let j = 1; j <= 30; j++) {
    const halo = glowSprite('#ffffff', 1, 0.4);
    const core = glowSprite('#fff6e6', 0.3, 1);
    ringPos(j, halo.position);
    ringPos(j, core.position);
    halos.push(halo);
    cores.push(core);
    ring.add(halo, core);
  }
  const pickRing = new Sprite(new SpriteMaterial({ map: ringTexture(), color: col('#fff1d6'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  ring.add(pickRing);
  // Lines between neighbouring lit stars (taken or done).
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(30 * 2 * 3), 3));
  const lines = new LineSegments(lineGeo, new LineBasicMaterial({ color: col('#ffe2b0'), transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }));
  ring.add(lines);
  // The completion bloom.
  const bloom = new Sprite(new SpriteMaterial({ map: glowTexture(), color: col('#ffe9c4'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  ring.add(bloom);

  const companion = noor(seed + 5);
  companion.object.position.set(RING_R * 0.98, -RING_R * 0.92, 1);
  scene.add(companion.object);

  const input: ConstellationInput = { stars: [], celebrateAt: null, openedAt: 0 };
  let lastKey = '';
  let px = 1;
  const tmp = new Vector3();

  function relink() {
    const key = input.stars.map((s) => s.status[0]).join('');
    if (key === lastKey) return;
    lastKey = key;
    const pos = lineGeo.getAttribute('position') as BufferAttribute;
    let n = 0;
    const lit = (j: number) => input.stars[((j - 1 + 30) % 30)]?.status !== 'free';
    for (let j = 1; j <= 30; j++) {
      if (!lit(j) || !lit(j + 1)) continue;
      ringPos(j, tmp);
      pos.setXYZ(n++, tmp.x, tmp.y, tmp.z);
      ringPos(j === 30 ? 1 : j + 1, tmp);
      pos.setXYZ(n++, tmp.x, tmp.y, tmp.z);
    }
    lineGeo.setDrawRange(0, n);
    pos.needsUpdate = true;
  }

  return {
    scene, camera, input,
    update(t) {
      relink();
      // A gentle wobble (≤ 4°), never a spin: the SVG ring above stays aligned for taps.
      ring.rotation.set(Math.sin(t * 0.21) * 0.06, Math.sin(t * 0.17 + 1) * 0.07, 0);
      skyGroup.rotation.y = Math.sin(t * 0.01) * 0.05;
      stars.update(t, px);
      mist.update(t);

      // Completion: drift in (0–1.6 s), merge (1.6–2.2), bloom (2.2–3.4), stars return (3.4–4.4).
      const c = input.celebrateAt === null ? 99 : t - input.celebrateAt;
      const gather = c < 3.4 ? ease(c / 1.6) : 1 - ease((c - 3.4) / 1.0);
      const merged = clamp01((c - 1.4) / 0.8) * (c < 3.4 ? 1 : 0);
      const b = c >= 1.6 && c < 3.6 ? Math.sin(Math.PI * clamp01((c - 1.6) / 2)) : 0;
      bloom.scale.setScalar(0.5 + 5.5 * clamp01((c - 1.6) / 2));
      bloom.material.opacity = b * 0.9;
      path.visible = gather < 0.05;
      (lines.material as LineBasicMaterial).opacity = 0.32 * (1 - gather) ** 4;

      let picked = -1;
      for (let j = 1; j <= 30; j++) {
        const s = input.stars[j - 1];
        const core = cores[j - 1], halo = halos[j - 1];
        ringPos(j, tmp).multiplyScalar(1 - gather);
        const lift = Math.sin(t * 0.4 + j * 1.7) * 0.05; // each star floats a little in depth
        core.position.set(tmp.x, tmp.y, lift);
        halo.position.copy(core.position);
        const status = s?.status ?? 'free';
        const tw = 0.9 + 0.1 * Math.sin(t * (0.6 + (j % 5) * 0.13) + j);
        const pulse = s?.mine ? 1 + 0.12 * Math.sin(t * 1.6) : 1;
        const sw = s?.sweep ? Math.max(0, 1 - Math.abs(t - input.openedAt - 0.6 - j * 0.04) / 0.9) : 0;
        const fade = 1 - merged;
        if (status === 'free') {
          core.scale.setScalar(0.16 * tw);
          core.material.color.set('#c9c3e6');
          core.material.opacity = 0.55 * fade;
          halo.material.opacity = 0;
        } else {
          const done = status === 'done';
          core.scale.setScalar((done ? 0.42 : 0.3) * tw * pulse * (1 + sw * 0.6));
          core.material.color.set(done ? '#fff6e6' : s.color);
          core.material.opacity = fade;
          halo.material.color.set(s.color);
          halo.scale.setScalar((done ? 1.5 : 1) * pulse * (1 + sw));
          halo.material.opacity = (done ? 0.55 : 0.35) * fade + sw * 0.4;
        }
        if (s?.picked) picked = j;
      }
      if (picked > 0 && gather < 0.05) {
        pickRing.position.copy(cores[picked - 1].position);
        pickRing.scale.setScalar(0.9 + 0.05 * Math.sin(t * 2));
        pickRing.material.opacity = 0.75;
      } else pickRing.material.opacity = 0;
      companion.update(t, Math.max(b, 0), 0);
    },
    setQuality(q: Quality) {
      stars.setCount(q === 'high' ? 1600 : q === 'medium' ? 1100 : 600);
    },
    resize(h) {
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
