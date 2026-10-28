// Moments (docs/light.md, L5): calm backdrops, each a pure function of t.
// crescent — Ramadan's first night: the sky filling with stars over the cloud sea, under the
// moment's crescent; eid — dawn over the clouds
// with lanterns drifting up.
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { cloudSea, glowSprite, lanternField, moteField, noor, skyDome, starField } from '../parts';

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

interface Parts {
  scene: Scene;
  camera: PerspectiveCamera;
  far: { position: Vector3 }[];
  pose(t: number, scale: number, px: number): void;
  counts?(q: Quality): void;
}

function wrap(p: Parts): LightScene {
  let scale = 400, px = 1;
  return {
    scene: p.scene, camera: p.camera,
    update(t) {
      p.pose(t, scale, px);
      for (const o of p.far) o.position.copy(p.camera.position);
    },
    setQuality(q) { p.counts?.(q); },
    resize(h) {
      scale = h / (2 * Math.tan((p.camera.fov * Math.PI) / 360));
      px = Math.max(0.8, h / 1100);
    },
    dispose() {
      p.scene.traverse((o) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
    },
  };
}

function base() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 9 / 16, 0.1, 2000);
  scene.add(camera);
  return { scene, camera };
}

/** Night over a cloud sea (crescent). */
function nightSea(seed: number, glowDir: Vector3) {
  const { scene, camera } = base();
  const sky = skyDome({ zenith: '#060a22', mid: '#151c4c', horizon: '#3a3366', glow: '#a87f8c' }, glowDir);
  const stars = starField(seed, 1400, { spread: 1.1 });
  const clouds = cloudSea({ deep: '#0a0f2c', mid: '#232858', top: '#7a73a8', fog: '#3a3366', glint: '#e7c7a8', skyGlow: '#a87f8c' }, glowDir, { scale: 0.06 });
  scene.add(sky, stars.object, clouds.object);
  return { scene, camera, sky, stars, clouds };
}

/** Ramadan's first night: the night sky over the cloud sea slowly filling with stars, Noor nearby.
 *  The crescent itself is the moment's own (flat) crescent above the greeting, so it never sits
 *  behind the text; the sky glows softly where it hangs. */
export function crescentScene(seed = 1): LightScene {
  const dir = new Vector3(0.0, 0.5, -1);
  const n = nightSea(seed, dir);
  const companion = noor(seed + 3);
  companion.object.position.set(1.4, -1.6, -5);
  n.camera.add(companion.object);
  return wrap({
    scene: n.scene, camera: n.camera, far: [n.sky, n.stars.object],
    pose(t, _s, px) {
      n.camera.position.set(Math.sin(t * 0.02) * 0.8, 3.6, -t * 0.08);
      n.camera.rotation.set(0.12 + 0.04 * ease(clamp01(t / 5)), 0, 0);
      n.stars.update(t, px);
      n.stars.material.uniforms.uAlpha.value = 0.3 + 0.7 * ease(clamp01(t / 3));
      n.clouds.update(t, n.camera.position);
      companion.update(t, Math.max(0, 1 - Math.abs(t - 4.2) / 1.2), 0);
    },
  });
}

/** Eid: dawn over the cloud sea, a few lanterns drifting up into the light. */
export function eidScene(seed = 1): LightScene {
  const { scene, camera } = base();
  const sun = new Vector3(0.12, 0.05, -1);
  const sky = skyDome({ zenith: '#1a2350', mid: '#6a5a8c', horizon: '#e8a898', glow: '#b8805a' }, sun);
  const clouds = cloudSea({ deep: '#4a3e6c', mid: '#8a7092', top: '#e8bfae', fog: '#e8a898', glint: '#ffd8a0', skyGlow: '#b8805a' }, sun, { scale: 0.05, speed: 1.4 });
  const field = lanternField(seed + 4, 60, { area: new Vector3(14, 8, 14), center: new Vector3(0, 8, -24), rise: 0.3 });
  scene.add(sky, clouds.object, field.object);
  return wrap({
    scene, camera, far: [sky],
    pose(t, scale) {
      camera.position.set(Math.sin(t * 0.03) * 1, 4.4, -t * 0.25);
      camera.rotation.set(0.1, 0, 0);
      clouds.update(t, camera.position);
      field.object.position.z = camera.position.z;
      field.update(t, scale);
    },
  });
}

export const MOMENTS = { crescent: crescentScene, eid: eidScene };
export type MomentId = keyof typeof MOMENTS;
