// Moments (docs/light.md, L5): short full-screen scenes and calm backdrops, each a pure function of
// t. lift — a gift's light lifts off the clouds and becomes a star; bloom — a lantern glows and
// blooms open into the reel; horizon — lanterns rising over a night horizon (the ayah wall);
// crescent — Ramadan's first night: the sky filling with stars over the cloud sea, under the
// moment's crescent; eid — dawn over the clouds
// with lanterns drifting up.
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { cloudSea, glowSprite, lanternField, moteField, noor, skyDome, starField, water } from '../parts';

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

/** Night over a cloud sea (shared by lift, bloom and crescent). */
function nightSea(seed: number, glowDir: Vector3) {
  const { scene, camera } = base();
  const sky = skyDome({ zenith: '#060a22', mid: '#151c4c', horizon: '#3a3366', glow: '#a87f8c' }, glowDir);
  const stars = starField(seed, 1400, { spread: 1.1 });
  const clouds = cloudSea({ deep: '#0a0f2c', mid: '#232858', top: '#7a73a8', fog: '#3a3366', glint: '#e7c7a8', skyGlow: '#a87f8c' }, glowDir, { scale: 0.06 });
  scene.add(sky, stars.object, clouds.object);
  return { scene, camera, sky, stars, clouds };
}

/** A gift sent: a warm light lifts off the clouds, rises with a trail and settles as a new star. */
export function liftScene(seed = 1): LightScene {
  const n = nightSea(seed, new Vector3(0.1, 0.12, -1));
  const light = new Group();
  const core = glowSprite('#fff4dc', 0.5, 1), halo = glowSprite('#ffc977', 2.4, 0.4);
  const trail = Array.from({ length: 18 }, (_, i) => glowSprite('#ffd58a', 0.3 * (1 - i / 18) + 0.06, 0.35 * (1 - i / 18)));
  light.add(...trail, halo, core);
  n.scene.add(light);
  const path = (t: number, out: Vector3) => {
    const k = ease(clamp01((t - 0.3) / 2.8));
    return out.set(Math.sin(k * 3.2) * 0.8 * (1 - k), -1.6 + k * 9, -9 - k * 6);
  };
  return wrap({
    scene: n.scene, camera: n.camera, far: [n.sky, n.stars.object],
    pose(t, _s, px) {
      n.camera.position.set(0, 3 + ease(clamp01(t / 4)) * 0.8, -ease(clamp01(t / 4)) * 2);
      n.camera.rotation.set(0.1 + ease(clamp01((t - 0.5) / 3)) * 0.18, 0, 0);
      n.stars.update(t, px);
      n.clouds.update(t, n.camera.position);
      path(t, core.position).add(n.camera.position);
      halo.position.copy(core.position);
      const arrive = clamp01((t - 2.9) / 0.8);
      core.scale.setScalar(0.5 * (1 - 0.6 * arrive) * (1 + 0.15 * Math.sin(t * 4)));
      halo.scale.setScalar(2.4 * (1 - 0.7 * arrive) + Math.sin(Math.PI * arrive) * 2);
      trail.forEach((s, i) => {
        path(t - (i + 1) * 0.06, s.position).add(n.camera.position);
        s.material.opacity = 0.35 * (1 - i / 18) * (1 - arrive);
      });
    },
  });
}

/** A gift opened: a lantern floats in, glows brighter and blooms open into light. */
export function bloomScene(seed = 1): LightScene {
  const n = nightSea(seed, new Vector3(-0.1, 0.12, -1));
  const lantern = glowSprite('#ffd58a', 1.2, 0.9), inner = glowSprite('#fff6e6', 0.4, 1), wide = glowSprite('#ffe9c4', 1, 0);
  const motes = moteField(seed + 2, 120, new Vector3(0, 3, -9), new Vector3(6, 2.5, 5), '#ffe4b0');
  n.scene.add(lantern, inner, wide, motes.object);
  return wrap({
    scene: n.scene, camera: n.camera, far: [n.sky, n.stars.object],
    pose(t, scale, px) {
      // The camera eases in towards the lantern as it blooms, so the light comes to you.
      const dolly = ease(clamp01(t / 3));
      n.camera.position.set(Math.sin(t * 0.4) * 0.15 * (1 - dolly), 3 + dolly * 0.6, -dolly * 3);
      n.camera.rotation.set(0.08 + dolly * 0.06, 0, 0);
      n.stars.update(t, px);
      n.clouds.update(t, n.camera.position);
      const rise = ease(clamp01(t / 1.4));
      const p = new Vector3(0, 3.2 + rise * 1.4 + Math.sin(t * 1.3) * 0.05, -7);
      lantern.position.copy(p);
      inner.position.copy(p);
      wide.position.copy(p).add(new Vector3(0, 0, 0.5));
      const g = clamp01((t - 1.2) / 1.0), b = ease(clamp01((t - 2.0) / 1.2));
      lantern.scale.setScalar(1.2 + g * 0.8);
      inner.scale.setScalar(0.4 + g * 0.5);
      wide.scale.setScalar(1 + b * 26);
      wide.material.opacity = b;
      motes.update(t, g, scale);
    },
  });
}

/** The ayah wall's backdrop: lanterns rising slowly over a night horizon and still water. */
export function horizonScene(seed = 1): LightScene {
  const { scene, camera } = base();
  const glowDir = new Vector3(0, 0.04, -1);
  const sky = skyDome({ zenith: '#04071c', mid: '#0f1440', horizon: '#3d2f5c', glow: '#c88a7a' }, glowDir);
  const stars = starField(seed, 1500, { spread: 1.3 });
  const area = { area: new Vector3(40, 9, 40), center: new Vector3(0, 9.5, -55), rise: 0.22 };
  const field = lanternField(seed + 1, 160, area);
  const refl = lanternField(seed + 1, 160, { ...area, mirror: true });
  const sea = water({ deep: '#05081c', sheen: '#ffb85c', fog: '#3d2f5c' }, glowDir, { opacity: 0.75 });
  scene.add(sky, stars.object, refl.object, sea.object, field.object);
  return wrap({
    scene, camera, far: [sky, stars.object],
    pose(t, scale, px) {
      camera.position.set(Math.sin(t * 0.01) * 2, 1.8, 0);
      camera.rotation.set(0.16, Math.sin(t * 0.008) * 0.04, 0);
      stars.update(t, px);
      field.update(t, scale);
      refl.update(t, scale);
      sea.update(t, camera.position);
    },
    counts(q) {
      const k = q === 'high' ? 160 : q === 'medium' ? 110 : 70;
      field.setCount(k);
      refl.setCount(k);
    },
  });
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

export const MOMENTS = { lift: liftScene, bloom: bloomScene, horizon: horizonScene, crescent: crescentScene, eid: eidScene };
export type MomentId = keyof typeof MOMENTS;
