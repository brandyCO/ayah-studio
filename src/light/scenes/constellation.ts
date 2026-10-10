// Khatm circle as a constellation (docs/light.md, L3): the 30 juz as stars on a ring that lies back
// in a night sky like a halo, turning slowly so the near juz pass in front — larger and brighter —
// while the far side recedes into the haze. Each star floats at its own height off the ring, lines
// join neighbouring lit stars in 3D, and the mist, dust and sky sit at their own depths. Opening the
// circle flies in: the ring starts edge-on and far, then settles into its tilt. A drag turns and
// tilts it (src/ui/constellation.ts). Free juz are faint, taken ones glow in the member's colour,
// finished ones are bright. On completion all lights drift into one point that blooms open.
// Pure in (t, input): the state only changes when the circle or the viewer's drag does.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Scene,
  Sprite, SpriteMaterial, Vector3, type Texture,
} from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { col, glowSprite, glowTexture, mistLayer, moteField, noor, skyDome, starField } from '../parts';
import { rng } from '../noise';

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
  /** The view opened at this scene time (for the fly-in and the sweep). */
  openedAt: number;
  /** The viewer's turn (radians, added to the slow spin) and tilt (radians the ring lies back). */
  spin: number;
  tilt: number;
  /** A juz with keyboard focus (0: none): ringed like the picked one. */
  focus: number;
}

export const RING_R = 3;
const FOV = 40;
const DIST = 12;
export const TILT = 1.0;
export const TILT_MIN = 0.45, TILT_MAX = 1.3;

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
const easeOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Where juz j sits on the ring, in the ring's own plane (juz 1 at the top, clockwise). */
export function ringPos(j: number, out = new Vector3()) {
  const a = ((j - 0.5) / 30) * Math.PI * 2 - Math.PI / 2;
  return out.set(RING_R * Math.cos(a), -RING_R * Math.sin(a), 0);
}

export function constellationScene(seed = 1): LightScene & { input: ConstellationInput; cores: Sprite[] } {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 2000);
  camera.position.set(0, 0, DIST);
  scene.add(camera);

  // The sky turned upwards so the view shows the high night, with mist far below and behind.
  const skyGroup = new Group();
  skyGroup.rotation.x = -0.6;
  const sky = skyDome({ zenith: '#04071c', mid: '#0d1336', horizon: '#2a2756', glow: '#6d4e78' }, new Vector3(0.2, 0.1, -1));
  const stars = starField(seed, 1600, { spread: 1.1 });
  skyGroup.add(sky, stars.object);
  const mistFar = mistLayer(seed + 3, { z: -22, y: -9, width: 90, height: 12, color: '#3a3570', opacity: 0.7, speed: 0.7 });
  const mistNear = mistLayer(seed + 8, { z: -6, y: -5.2, width: 40, height: 5, color: '#4a4380', opacity: 0.35, speed: 1.1 });
  const dust = moteField(seed + 4, 140, new Vector3(0, 0, -2), new Vector3(9, 6, 6), '#c9c3e6');
  scene.add(skyGroup, mistFar.object, mistNear.object, dust.object);

  // tilt (lies back) → spin (turns about its own axis) → the ring's stars.
  const tiltG = new Group();
  const ring = new Group();
  tiltG.add(ring);
  scene.add(tiltG);
  const r = rng(seed + 11);
  const lift = Array.from({ length: 31 }, () => (r() - 0.5) * 0.5); // each star's height off the ring
  const path = new Group();
  for (let j = 0; j < 150; j++) {
    const s = glowSprite('#c9c3e6', 0.08, 0.2);
    ringPos(1 + (j / 150) * 30, s.position);
    path.add(s);
  }
  ring.add(path);
  const cores: Sprite[] = [], halos: Sprite[] = [];
  for (let j = 1; j <= 30; j++) {
    const halo = glowSprite('#ffffff', 1, 0.4);
    const core = glowSprite('#fff6e6', 0.3, 1);
    halos.push(halo);
    cores.push(core);
    ring.add(halo, core);
  }
  const pickRing = new Sprite(new SpriteMaterial({ map: ringTexture(), color: col('#fff1d6'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  ring.add(pickRing);
  // Lines between neighbouring lit stars (taken or done), following each star's height.
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(30 * 2 * 3), 3));
  const lines = new LineSegments(lineGeo, new LineBasicMaterial({ color: col('#ffe2b0'), transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }));
  lines.frustumCulled = false;
  ring.add(lines);
  // A faint inner halo plane of light under the ring, and the completion bloom at its heart.
  const heart = glowSprite('#6d5a9a', 7.5, 0.16);
  tiltG.add(heart);
  const bloom = new Sprite(new SpriteMaterial({ map: glowTexture(), color: col('#ffe9c4'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  scene.add(bloom);

  const companion = noor(seed + 5);
  scene.add(companion.object);

  const input: ConstellationInput = { stars: [], celebrateAt: null, openedAt: 0, spin: 0, tilt: TILT, focus: 0 };
  let lastKey = '';
  let px = 1, scale = 400;
  const tmp = new Vector3();

  const starAt = (j: number, out: Vector3, gather = 0) => ringPos(j, out).multiplyScalar(1 - gather).setZ(lift[j] * (1 - gather));

  function relink() {
    const key = input.stars.map((s) => s.status[0]).join('');
    if (key === lastKey) return;
    lastKey = key;
    const pos = lineGeo.getAttribute('position') as BufferAttribute;
    let n = 0;
    const lit = (j: number) => input.stars[((j - 1 + 30) % 30)]?.status !== 'free';
    for (let j = 1; j <= 30; j++) {
      if (!lit(j) || !lit(j + 1)) continue;
      starAt(j, tmp);
      pos.setXYZ(n++, tmp.x, tmp.y, tmp.z);
      starAt(j === 30 ? 1 : j + 1, tmp);
      pos.setXYZ(n++, tmp.x, tmp.y, tmp.z);
    }
    lineGeo.setDrawRange(0, n);
    pos.needsUpdate = true;
  }

  return {
    scene, camera, input, cores,
    update(t) {
      relink();
      // Fly-in (3.2 s): from far and nearly edge-on, swinging round into the tilt.
      const fly = easeOut((t - input.openedAt) / 3.2);
      const tilt = Math.PI / 2 - 0.12 + (input.tilt - (Math.PI / 2 - 0.12)) * fly;
      const spin = t * 0.03 + input.spin - (1 - fly) * 0.9;
      tiltG.rotation.set(-tilt + Math.sin(t * 0.17) * 0.025, 0, Math.sin(t * 0.13) * 0.02);
      ring.rotation.z = -spin;
      camera.position.set(Math.sin(t * 0.05) * 0.25, Math.sin(t * 0.07) * 0.15 + (1 - fly) * -1.2, DIST * (1 + (1 - fly) * 0.9));
      camera.lookAt(0, 0, 0);
      // The far layers move against the turning ring at their own depths.
      skyGroup.rotation.y = Math.sin(t * 0.01) * 0.05 + spin * 0.04;
      skyGroup.rotation.x = -0.6 + (tilt - TILT) * 0.12;
      dust.object.rotation.y = spin * 0.18;
      mistNear.object.position.x = Math.sin(spin) * 2.5;
      mistFar.object.position.x = Math.sin(spin) * 1.2;
      dust.update(t, 0, scale);
      stars.update(t, px);
      mistFar.update(t);
      mistNear.update(t);

      // Completion: drift in (0–1.6 s), merge (1.6–2.2), bloom (2.2–3.4), stars return (3.4–4.4).
      const c = input.celebrateAt === null ? 99 : t - input.celebrateAt;
      const gather = c < 3.4 ? ease(c / 1.6) : 1 - ease((c - 3.4) / 1.0);
      const merged = clamp01((c - 1.4) / 0.8) * (c < 3.4 ? 1 : 0);
      const b = c >= 1.6 && c < 3.6 ? Math.sin(Math.PI * clamp01((c - 1.6) / 2)) : 0;
      bloom.scale.setScalar(0.5 + 6.5 * clamp01((c - 1.6) / 2));
      bloom.material.opacity = b * 0.9;
      path.visible = gather < 0.05;
      (lines.material as LineBasicMaterial).opacity = 0.32 * (1 - gather) ** 4;
      heart.material.opacity = 0.16 * fly * (1 - gather);

      let picked = -1;
      ring.updateMatrixWorld(true);
      for (let j = 1; j <= 30; j++) {
        const s = input.stars[j - 1];
        const core = cores[j - 1], halo = halos[j - 1];
        starAt(j, core.position, gather);
        core.position.z += Math.sin(t * 0.4 + j * 1.7) * 0.06; // each star breathes a little in height
        halo.position.copy(core.position);
        // Near stars (towards the viewer) a touch brighter; far ones dimmer, as in haze.
        tmp.copy(core.position).applyMatrix4(ring.matrixWorld);
        const near = clamp01((tmp.z + RING_R) / (2 * RING_R));
        const depthK = 0.55 + 0.45 * near;
        const status = s?.status ?? 'free';
        const tw = 0.9 + 0.1 * Math.sin(t * (0.6 + (j % 5) * 0.13) + j);
        const pulse = s?.mine ? 1 + 0.12 * Math.sin(t * 1.6) : 1;
        const sw = s?.sweep ? Math.max(0, 1 - Math.abs(t - input.openedAt - 2.6 - j * 0.04) / 0.9) : 0;
        const fade = (1 - merged) * (0.25 + 0.75 * fly);
        if (status === 'free') {
          core.scale.setScalar(0.16 * tw);
          core.material.color.set('#c9c3e6');
          core.material.opacity = 0.6 * fade * depthK;
          halo.material.opacity = 0;
        } else {
          const done = status === 'done';
          core.scale.setScalar((done ? 0.42 : 0.3) * tw * pulse * (1 + sw * 0.6));
          core.material.color.set(done ? '#fff6e6' : s.color);
          core.material.opacity = fade * (0.7 + 0.3 * depthK);
          halo.material.color.set(s.color);
          halo.scale.setScalar((done ? 1.5 : 1) * pulse * (1 + sw));
          halo.material.opacity = ((done ? 0.55 : 0.35) * fade + sw * 0.4) * depthK;
        }
        if (s?.picked) picked = j;
      }
      if (input.focus) picked = input.focus;
      if (picked > 0 && gather < 0.05) {
        pickRing.position.copy(cores[picked - 1].position);
        pickRing.scale.setScalar(0.9 + 0.05 * Math.sin(t * 2));
        pickRing.material.opacity = 0.75;
      } else pickRing.material.opacity = 0;
      // Noor drifts round the outside of the ring, slower than the spin, on the near side.
      const na = t * 0.045 + 2.2;
      companion.object.position.set(Math.cos(na) * (RING_R + 1.1), -0.9 + Math.sin(t * 0.2) * 0.25, 1.4 + Math.sin(na) * 1.2);
      companion.update(t, Math.max(b, 0), 0);
    },
    setQuality(q: Quality) {
      stars.setCount(q === 'high' ? 1600 : q === 'medium' ? 1100 : 600);
      dust.setCount(q === 'low' ? 60 : 140);
    },
    resize(h) {
      px = Math.max(0.8, h / 700);
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
