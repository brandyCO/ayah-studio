// Night listening: a night sky over a slow cloud sea, a crescent low on the horizon, warm motes that
// breathe with the recitation, and Noor floating nearby. Pure in (t, breath): see engine.ts.
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { cloudSea, moon, moteField, noor, skyDome, starField } from '../parts';

export interface NightInput {
  /** 0…1: a soft swell at each word start, settling in pauses. */
  breath: number;
  /** 0…1: Noor brightens on a completion (end of a surah). */
  glow: number;
}

const STARS = 1800, MOTES = 260;
const COUNT: Record<Quality, [number, number]> = { high: [STARS, MOTES], medium: [1100, 170], low: [600, 90], flat: [0, 0] };

export function nightScene(seed = 1): LightScene & { input: NightInput } {
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 9 / 16, 0.1, 2000);
  scene.add(camera);
  const moonDir = new Vector3(-0.24, 0.42, -1);

  const sky = skyDome({ zenith: '#060a22', mid: '#151c4c', horizon: '#3a3366', glow: '#a87f8c' }, moonDir);
  const stars = starField(seed, STARS, { spread: 1.0 });
  const lunar = moon(moonDir);
  const clouds = cloudSea({ deep: '#0a0f2c', mid: '#232858', top: '#7a73a8', fog: '#3a3366', glint: '#e7c7a8', skyGlow: '#a87f8c' }, moonDir, { scale: 0.06 });
  const motes = moteField(seed + 1, MOTES, new Vector3(0, 4.2, -11), new Vector3(9, 2.6, 9));
  const companion = noor(seed + 2);
  // Noor stays near the viewer, low and to the side: never over the text in the middle.
  companion.object.position.set(0.7, -1.3, -4.2);
  camera.add(companion.object);
  scene.add(sky, stars.object, lunar, clouds.object, motes.object);

  const input: NightInput = { breath: 0, glow: 0 };
  let scale = 400, px = 1;

  return {
    scene, camera, input,
    update(t) {
      // A slow drift: sway ≤ 1.4 units, yaw ≤ 3.5°, never a fast move.
      camera.position.set(Math.sin(t * 0.019) * 1.4, 4 + Math.sin(t * 0.031) * 0.15, -t * 0.12);
      camera.rotation.set(0.07 + Math.sin(t * 0.023) * 0.012, Math.sin(t * 0.011) * 0.06, 0);
      for (const o of [sky, stars.object, lunar]) o.position.copy(camera.position);
      stars.update(t, px);
      clouds.update(t, camera.position, input.breath);
      motes.object.position.z = camera.position.z;
      motes.object.position.x = camera.position.x * 0.6;
      motes.update(t, input.breath, scale);
      companion.update(t, input.glow, input.breath);
    },
    setQuality(q) {
      stars.setCount(COUNT[q][0]);
      motes.setCount(COUNT[q][1]);
    },
    resize(h) {
      scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
      px = Math.max(1, h / 1400);
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
