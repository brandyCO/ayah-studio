// Light reel backgrounds (docs/light.md, L2): five calm scenes for the editor's scene picker. Each is
// a pure function of (t, seed) so the preview and the exported MP4 show the same frame for the same
// t. They only fill the background: the grade, the legibility scrim and the text are drawn on top by
// render(), exactly as for photos and videos.
import { Group, PerspectiveCamera, Scene, Vector3, type Object3D } from 'three';
import { rng } from '../noise';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { aurora, bandY, cloudSea, glowSprite, lanternField, mistLayer, moteField, rays, skyDome, starField, water } from '../parts';

export type LightId = 'dawn' | 'stars' | 'aurora' | 'lanterns' | 'rays';

interface Built {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Things that follow the camera (sky, stars: infinitely far). */
  far: Object3D[];
  pose(t: number, scale: number, px: number): void;
  counts?: (q: Quality) => void;
}

function wrap(b: Built): LightScene {
  let scale = 400, px = 1;
  return {
    scene: b.scene, camera: b.camera,
    update(t) {
      b.pose(t, scale, px);
      for (const o of b.far) o.position.copy(b.camera.position);
    },
    setQuality(q) { b.counts?.(q); },
    resize(h) {
      scale = h / (2 * Math.tan((b.camera.fov * Math.PI) / 360));
      px = Math.max(0.5, h / 1400); // proportional, so a smaller preview looks like the export
    },
    dispose() {
      b.scene.traverse((o) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
    },
  };
}

function base(fov = 55) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 9 / 16, 0.1, 2000);
  scene.add(camera);
  return { scene, camera };
}

/** Dawn cloud sea: rose and gold light rising behind a soft sea of clouds. */
export function dawnScene(seed = 1): LightScene {
  const { scene, camera } = base();
  const sun = new Vector3(0.15, 0.06, -1);
  const sky = skyDome({ zenith: '#1a2350', mid: '#6a5a8c', horizon: '#e8a898', glow: '#b8805a' }, sun);
  const stars = starField(seed, 300, { spread: 1, minY: 0.45 });
  stars.material.uniforms.uAlpha.value = 0.35;
  const clouds = cloudSea({ deep: '#4a3e6c', mid: '#8a7092', top: '#e8bfae', fog: '#e8a898', glint: '#ffd8a0', skyGlow: '#b8805a' }, sun, { scale: 0.05, speed: 1.6 });
  const motes = moteField(seed + 1, 90, new Vector3(0, 5, -12), new Vector3(9, 2.5, 8), '#ffe4b0');
  scene.add(sky, stars.object, clouds.object, motes.object);
  return wrap({
    scene, camera, far: [sky, stars.object],
    pose(t, scale, px) {
      camera.position.set(Math.sin(t * 0.03) * 1.2, 4.6 + Math.sin(t * 0.04) * 0.2, -t * 0.35);
      camera.rotation.set(0.05, Math.sin(t * 0.02) * 0.05, 0);
      stars.update(t, px);
      clouds.update(t, camera.position);
      motes.object.position.set(camera.position.x * 0.5, 0, camera.position.z);
      motes.update(t, 0.2, scale);
    },
  });
}

/** Starfield drift: a deep night sky slowly turning, with a faint band of stars across it. */
export function starsScene(seed = 1): LightScene {
  const { scene, camera } = base(60);
  const glow = new Vector3(0.3, 0.1, -1);
  const sky = skyDome({ zenith: '#04061a', mid: '#0c1238', horizon: '#1e1e48', glow: '#4d3a62' }, glow);
  const stars = starField(seed, 2600, { spread: 0.75, size: 1.2 });
  // The band: many small stars along a diagonal across the view, with faint glows in it.
  const band = starField(seed + 5, 3200, { spread: 0.75, band: 0.07, size: 0.75 });
  band.material.uniforms.uAlpha.value = 0.75;
  const nebula = new Group();
  const r = rng(seed + 9);
  for (let i = 0; i < 9; i++) {
    const off = (i / 8 - 0.5) * 1.2 + (r() - 0.5) * 0.1, y = bandY(off) + (r() - 0.5) * 0.05, k = Math.sqrt(1 - y * y);
    const g = glowSprite(i % 3 === 0 ? '#8a76d0' : i % 3 === 1 ? '#e79aa8' : '#b0a0e0', 140 + r() * 120, 0.09 + r() * 0.06);
    g.position.set(Math.cos(-Math.PI / 2 + off) * k * 780, y * 780, Math.sin(-Math.PI / 2 + off) * k * 780);
    nebula.add(g);
  }
  scene.add(sky, nebula, stars.object, band.object);
  return wrap({
    scene, camera, far: [sky, stars.object, band.object, nebula],
    pose(t, _scale, px) {
      camera.position.set(0, 2, 0);
      camera.rotation.set(0.42, Math.sin(t * 0.01) * 0.04, 0);
      // The whole sky turns very slowly about a tilted axis (≈ 1.4° per 10 s).
      stars.object.rotation.set(0.25, t * 0.0025, 0.1);
      band.object.rotation.set(0.25, t * 0.0025, 0.1);
      nebula.rotation.set(0.25, t * 0.0025, 0.1);
      stars.update(t, px);
      band.update(t, px);
    },
    counts(q) {
      stars.setCount(q === 'high' ? 2600 : q === 'medium' ? 1800 : 1000);
      band.setCount(q === 'high' ? 3000 : q === 'medium' ? 2000 : 1000);
    },
  });
}

/** Aurora: soft curtains of rose, gold and violet light over a dark, still sea. */
export function auroraScene(seed = 1): LightScene {
  const { scene, camera } = base();
  const glow = new Vector3(-0.2, 0.15, -1);
  const sky = skyDome({ zenith: '#04071c', mid: '#0d1336', horizon: '#26254f', glow: '#6a4a6e' }, glow);
  const stars = starField(seed, 1400, { spread: 1.2 });
  const curtains = aurora(seed + 3, ['#ffcf8a', '#e79aa8', '#8a76d0'], 1.3);
  const sea = water({ deep: '#05081a', sheen: '#e79aa8', fog: '#2a2852' }, glow, { opacity: 0.86 });
  // The curtains' reflection: the same curtains mirrored under the water, dimmer.
  const refl = aurora(seed + 3, ['#a8865a', '#9a6670', '#5a4e8a'], 0.8);
  refl.object.scale.y = -1;
  scene.add(sky, stars.object, curtains.object, refl.object, sea.object);
  return wrap({
    scene, camera, far: [sky, stars.object],
    pose(t, _scale, px) {
      camera.position.set(Math.sin(t * 0.02) * 2, 3 + Math.sin(t * 0.03) * 0.1, 0);
      camera.rotation.set(0.17, Math.sin(t * 0.015) * 0.06, 0);
      stars.update(t, px);
      curtains.update(t);
      refl.update(t);
      sea.update(t, camera.position);
    },
  });
}

/** Lantern field: warm paper lanterns rising slowly over still water at dusk, mirrored in it. */
export function lanternsScene(seed = 1): LightScene {
  const { scene, camera } = base();
  const glow = new Vector3(0.1, 0.05, -1);
  const sky = skyDome({ zenith: '#0b1030', mid: '#1f2456', horizon: '#6a4a6e', glow: '#e8a6a0' }, glow);
  const stars = starField(seed, 700, { spread: 1, minY: 0.12 });
  const N = 140;
  const area = { area: new Vector3(26, 7, 30), center: new Vector3(0, 7.6, -36), rise: 0.14 };
  const field = lanternField(seed + 1, N, area);
  const refl = lanternField(seed + 1, N, { ...area, mirror: true });
  const sea = water({ deep: '#0a0d26', sheen: '#ffb85c', fog: '#4a3a62' }, glow, { opacity: 0.7 });
  scene.add(sky, stars.object, refl.object, sea.object, field.object);
  return wrap({
    scene, camera, far: [sky, stars.object],
    pose(t, scale, px) {
      camera.position.set(Math.sin(t * 0.025) * 1.5, 1.6 + Math.sin(t * 0.035) * 0.1, 4 - t * 0.05);
      camera.rotation.set(0.12, Math.sin(t * 0.018) * 0.05, 0);
      stars.update(t, px);
      field.update(t, scale);
      refl.update(t, scale);
      sea.update(t, camera.position);
    },
    counts(q) {
      const n = q === 'high' ? N : q === 'medium' ? 100 : 60;
      field.setCount(n);
      refl.setCount(n);
    },
  });
}

/** Light rays through mist: soft golden beams falling through layers of morning mist. */
export function raysScene(seed = 1): LightScene {
  const { scene, camera } = base();
  const light = new Vector3(-0.35, 0.5, -1);
  const sky = skyDome({ zenith: '#26334f', mid: '#6f7494', horizon: '#d9bc9c', glow: '#f2dcae' }, light);
  const beams = rays(seed, 14, new Vector3(-18, 58, -70), '#fff1c8');
  const layers = [
    mistLayer(seed + 1, { z: -120, y: 4, width: 420, height: 60, color: '#f2e2cc', opacity: 0.85, speed: 0.6 }),
    mistLayer(seed + 2, { z: -70, y: 0, width: 260, height: 40, color: '#d9c7bf', opacity: 0.75, speed: 0.9 }),
    mistLayer(seed + 3, { z: -36, y: -4, width: 150, height: 26, color: '#c4b1b8', opacity: 0.7, speed: 1.2 }),
  ];
  const motes = moteField(seed + 4, 120, new Vector3(-4, 6, -24), new Vector3(10, 6, 10), '#fff1c8');
  scene.add(sky, ...layers.map((l) => l.object), beams.object, motes.object);
  return wrap({
    scene, camera, far: [sky],
    pose(t, scale) {
      camera.position.set(Math.sin(t * 0.02) * 1.5, 3 + Math.sin(t * 0.03) * 0.2, 0);
      camera.rotation.set(0.14, Math.sin(t * 0.012) * 0.04, 0);
      beams.update(t);
      for (const l of layers) l.update(t);
      motes.update(t, 0.35, scale);
    },
    counts(q) { motes.setCount(q === 'low' ? 60 : 120); },
  });
}

export const LIGHT_SCENES: Record<LightId, (seed?: number) => LightScene> = {
  dawn: dawnScene, stars: starsScene, aurora: auroraScene, lanterns: lanternsScene, rays: raysScene,
};
