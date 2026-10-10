// Kids path in 3D (docs/light.md, L7): the Kids space's lantern path (src/ui/kids.ts) as paper
// lanterns floating over a soft cloud sea, winding away into the distance in the same gentle wave
// as the 2D path. The camera glides along the path (behind and a little above the lantern in
// focus, looking ahead), so lanterns further on recede in perspective and fade into the haze.
// Learned = lit from inside with a warm glow; the next one has a breathing ring; Noor rests beside
// the next lantern and, after a lantern was lit, flies slowly over to it. Dawn by day, night in dark
// mode. Bigger, softer, slower than the grown-up scenes. Posed from (t, input) only.
import {
  AdditiveBlending, BufferAttribute, LineBasicMaterial, LineSegments, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, DoubleSide, Fog, Group, LatheGeometry,
  Mesh, MeshBasicMaterial, NormalBlending, PerspectiveCamera, Points, PointsMaterial, Scene, Sprite, SpriteMaterial, Vector2, Vector3,
  type Texture,
} from 'three';
import { constellation, wave } from '../../data/kidsPath';
import type { LightScene } from '../engine';
import type { Quality } from '../support';
import { cloudSea, col, glowSprite, glowTexture, moteField, noor, skyDome, starField } from '../parts';

const FOV = 55;
const STEP = 3.2; // world units between lanterns along the path

export interface KidsPathInput {
  /** The lantern in focus (fractional index along the path). */
  focus: number;
  lit: boolean[];
  next: number; // index, -1 when all are lit
  /** A lantern just lit (index) and the scene time it blooms at (null: none). */
  bloom: number;
  bloomAt: number | null;
}

/** Lantern i's resting place: the 2D path's wave (sin(i·0.95)), stretched away from the viewer. */
export const lanternAt = (i: number, out = new Vector3()) => out.set(wave(i) * 1.15, 1.5 + Math.sin(i * 0.6) * 0.25, -i * STEP);

let ringTex: Texture | null = null;
function ringTexture(): Texture {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.strokeStyle = '#fff';
  x.lineWidth = 6;
  x.filter = 'blur(1.5px)';
  x.beginPath();
  x.arc(64, 64, 44, 0, Math.PI * 2);
  x.stroke();
  ringTex = new CanvasTexture(c);
  return ringTex;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function kidsPathScene(count: number, night: boolean, surahs: number[] = [], ayahs: number[] = [], seed = 21): LightScene & { input: KidsPathInput; lanterns: Group[] } {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 2000);
  scene.add(camera);
  const P = night
    ? {
      sky: { zenith: '#0b1230', mid: '#171a3d', horizon: '#3a2f58', glow: '#8a5f86' },
      sea: { deep: '#0b1030', mid: '#262b5a', top: '#6d6799', fog: '#2c2a58', glint: '#e8a6a0', skyGlow: '#8a5f86' },
      fog: '#2c2a58', paper: '#b7bddc', paperO: 0.4, cap: '#9a8cb4', mote: '#ffd58a', dots: '#eef0ff',
    }
    : {
      sky: { zenith: '#8fb2e2', mid: '#cdd8f0', horizon: '#f8e2cf', glow: '#ffd2a8' },
      sea: { deep: '#a9b4da', mid: '#ccd2ec', top: '#f4f2fa', fog: '#ecdcd6', glint: '#ffd2a8', skyGlow: '#ffd2a8' },
      fog: '#efe0d8', paper: '#8f99bb', paperO: 0.55, cap: '#b8946a', mote: '#ffcf86', dots: '#ffffff',
    };
  // Far lanterns fade into the haze (the sky and cloud sea have their own colours for it).
  scene.fog = new Fog(col(P.fog), 10, 34);

  const glowDir = new Vector3(0.25, 0.08, -1);
  const sky = skyDome(P.sky, glowDir);
  const stars = night ? starField(seed, 900, { spread: 1.3, minY: 0.06 }) : null;
  const far = new Group();
  far.add(sky);
  if (stars) far.add(stars.object);
  const sea = cloudSea(P.sea, glowDir, { y: -1.4, speed: 0.5, scale: 0.05 });
  scene.add(far, sea.object);

  // The path as soft dots between the lanterns.
  const pts = Array.from({ length: count }, (_, i) => lanternAt(i));
  const curve = new CatmullRomCurve3(pts.length > 1 ? pts : [new Vector3(), new Vector3(0, 0, -1)]);
  const dotPos: number[] = [];
  const v = new Vector3();
  const N = Math.max(2, (count - 1) * 14);
  for (let k = 0; k <= N; k++) {
    const near = ((k / N) * (count - 1)) % 1;
    if (near < 0.16 || near > 0.84) continue; // keep clear of the lanterns
    curve.getPoint(k / N, v);
    dotPos.push(v.x, v.y - 0.35, v.z);
  }
  const dotGeo = new BufferGeometry();
  dotGeo.setAttribute('position', new BufferAttribute(new Float32Array(dotPos), 3));
  const dotMat = new PointsMaterial({ color: col(P.dots), map: glowTexture(), size: 0.16, transparent: true, opacity: night ? 0.6 : 0.9, depthWrite: false, blending: night ? AdditiveBlending : NormalBlending });
  scene.add(new Points(dotGeo, dotMat));

  // Lanterns: a round paper body, thin caps, glow + flame when lit.
  const profile = Array.from({ length: 11 }, (_, i) => new Vector2(0.1 + 0.075 * Math.sin((Math.PI * i) / 10), -0.19 + (i / 10) * 0.38));
  const bodyGeo = new LatheGeometry(profile, 24);
  const capGeo = new CylinderGeometry(0.085, 0.085, 0.035, 16);
  const capMat = new MeshBasicMaterial({ color: col(P.cap), transparent: true, opacity: 0.9 });
  const lanterns = pts.map(() => {
    const g = new Group();
    const body = new Mesh(bodyGeo, new MeshBasicMaterial({ color: col(P.paper), transparent: true, opacity: P.paperO, depthWrite: false, side: DoubleSide }));
    const cap = capMat.clone();
    const top = new Mesh(capGeo, cap), bottom = new Mesh(capGeo, cap);
    top.position.y = 0.205;
    bottom.position.y = -0.205;
    const glow = glowSprite('#ffc977', 1.4, 0);
    const flame = glowSprite('#fff4dc', 0.24, 0);
    flame.position.set(0, -0.03, 0.06);
    g.add(glow, body, top, bottom, flame);
    g.scale.setScalar(1.25);
    scene.add(g);
    return { g, body, glow, flame, cap };
  });
  // A learned surah's constellation: one star per ayah, joined softly, beside its lantern on the side
  // away from its name (the same shape as the 2D path, src/data/kidsPath.ts). Built on first light.
  const STAR = 0.06; // world units between two stars
  const starColor = col(night ? '#fff3d6' : '#d6953a');
  const blend = night ? AdditiveBlending : NormalBlending;
  const consts: ({ g: Group; stars: Points; line: LineSegments | null; n: number } | null)[] = lanterns.map(() => null);
  const constAt = (i: number) => {
    if (consts[i] || !surahs[i] || !ayahs[i]) return consts[i];
    const c = constellation(surahs[i], ayahs[i]);
    const xyz = (q: { x: number; y: number }) => [q.x * STAR, -q.y * STAR, 0];
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(c.stars.flatMap(xyz)), 3));
    const g = new Group();
    const stars = new Points(geo, new PointsMaterial({ color: starColor, map: glowTexture(), size: 0.15, transparent: true, opacity: 0, depthWrite: false, blending: blend }));
    g.add(stars);
    let line: LineSegments | null = null;
    if (c.links.length) {
      // Link k joins star k + 1 to an earlier one, so the first n − 1 links belong to the first n stars.
      const lg = new BufferGeometry();
      lg.setAttribute('position', new BufferAttribute(new Float32Array(c.links.flatMap(([a, b]) => [...xyz(c.stars[a]), ...xyz(c.stars[b])])), 3));
      line = new LineSegments(lg, new LineBasicMaterial({ color: starColor, transparent: true, opacity: 0, depthWrite: false, blending: blend }));
      g.add(line);
    }
    scene.add(g);
    return (consts[i] = { g, stars, line, n: c.stars.length });
  };

  // On the light dawn sky additive light vanishes: there the ring and Noor are painted warm.
  const ring = new Sprite(new SpriteMaterial({ map: ringTexture(), color: col(night ? '#ffd58a' : '#e3a043'), transparent: true, opacity: 0, blending: night ? AdditiveBlending : NormalBlending, depthWrite: false }));
  scene.add(ring);
  const companion = noor(seed + 3);
  companion.object.scale.setScalar(0.8);
  if (!night) companion.object.traverse((o) => {
    if (!(o as Sprite).isSprite) return;
    const m = (o as Sprite).material;
    m.blending = NormalBlending;
    m.color.lerp(col('#f2a54a'), 0.5);
  });
  scene.add(companion.object);

  const len = Math.max(1, count - 1) * STEP;
  const motes = moteField(seed + 1, 260, new Vector3(0, 2.2, -len / 2), new Vector3(5, 1.6, len / 2 + 6), P.mote);
  scene.add(motes.object);

  const input: KidsPathInput = { focus: 0, lit: [], next: -1, bloom: -1, bloomAt: null };
  let scale = 400;
  const a = new Vector3(), b = new Vector3(), look = new Vector3();
  const at = (f: number, out: Vector3) => (count > 1 ? curve.getPoint(Math.min(1, Math.max(0, f / (count - 1))), out) : lanternAt(0, out));

  return {
    scene, camera, input, lanterns: lanterns.map((l) => l.g),
    update(t) {
      // Behind and above the lantern in focus, looking a little ahead; a slow breathing sway.
      const f = input.focus;
      at(f, a);
      at(f + 0.7, b);
      camera.position.set(a.x * 0.85 + Math.sin(t * 0.07) * 0.12, a.y + 1.5 + Math.sin(t * 0.09) * 0.06, a.z + 5.6);
      look.set(a.x * 0.85 + (b.x - a.x) * 0.3, a.y - 0.25, b.z);
      camera.lookAt(look);
      far.position.copy(camera.position);
      sea.update(t, camera.position);
      motes.update(t, 0, scale);
      stars?.update(t, 1.2);

      const bt = input.bloomAt === null ? 99 : t - input.bloomAt;
      for (let i = 0; i < lanterns.length; i++) {
        const L = lanterns[i];
        lanternAt(i, L.g.position);
        // A slow float and sway, never a bounce.
        L.g.position.y += Math.sin(t * 0.6 + i * 1.3) * 0.05;
        L.g.position.x += Math.sin(t * 0.3 + i * 0.7) * 0.04;
        L.g.rotation.z = Math.sin(t * 0.45 + i * 2.1) * 0.05;
        L.g.rotation.y = t * 0.08 + i;
        // Lanterns the camera has passed fade out softly (swipe back to see them again).
        const fade = Math.min(1, Math.max(0, (i - input.focus + 0.95) / 0.6));
        L.g.visible = fade > 0;
        L.cap.opacity = 0.9 * fade;
        const lit = !!input.lit[i];
        const bloom = i === input.bloom ? Math.sin(Math.PI * Math.min(1, Math.max(0, bt / 3))) : 0;
        L.body.material.color.set(lit ? '#ffc477' : P.paper);
        L.body.material.opacity = (lit ? 0.95 : P.paperO) * fade;
        const breathe = 0.9 + 0.1 * Math.sin(t * 1.1 + i);
        L.glow.material.opacity = (lit ? (night ? 0.6 : 0.5) * breathe + bloom * 0.45 : 0) * fade;
        L.glow.scale.setScalar(1.4 * (1 + bloom * 0.8));
        L.flame.material.opacity = (lit ? 0.95 : 0) * fade;
        L.flame.scale.setScalar(0.24 * (0.92 + 0.08 * Math.sin(t * 2.3 + i * 3)));
        const c = lit && fade > 0 ? constAt(i) : consts[i];
        if (c) {
          c.g.visible = lit && fade > 0;
          if (c.g.visible) {
            // Beside the lantern, away from the path's middle; the stars come out in ayah order on a bloom.
            c.g.position.set(L.g.position.x + Math.sign(wave(i) || 1) * 0.68, L.g.position.y + 0.18, L.g.position.z - 0.05);
            const shown = i === input.bloom && bt < 4 ? Math.ceil(c.n * ease((bt - 0.6) / 2.2)) : c.n;
            c.stars.geometry.setDrawRange(0, shown);
            c.line?.geometry.setDrawRange(0, Math.max(0, shown - 1) * 2);
            (c.stars.material as PointsMaterial).opacity = (night ? 0.95 : 0.85) * fade;
            if (c.line) (c.line.material as LineBasicMaterial).opacity = (night ? 0.3 : 0.4) * fade;
          }
        }
      }
      const n = input.next >= 0 ? lanterns[input.next] : null;
      if (n) {
        ring.position.copy(n.g.position);
        ring.scale.setScalar(1.05 + 0.07 * Math.sin(t * 1.3));
        ring.material.opacity = 0.6 + 0.2 * Math.sin(t * 1.3);
      } else ring.material.opacity = 0;

      // Noor rests beside the next lantern (or the last lit one); after a bloom it glides over.
      const home = input.next >= 0 ? input.next : input.lit.lastIndexOf(true);
      if (home >= 0 && home < lanterns.length) {
        const side = lanternAt(home, b).x > 0 ? -1 : 1; // towards the middle of the path
        b.add(v.set(0.7 * side, 0.45, 0.4));
        if (input.bloom >= 0 && input.bloom < lanterns.length && bt < 5.5) {
          lanternAt(input.bloom, a).add(v.set(0, 0.45, 0.4));
          const k = ease((bt - 1.2) / 4);
          b.lerpVectors(a, b, k);
          b.y += Math.sin(Math.PI * k) * 0.6; // a gentle arc
        }
        companion.object.position.copy(b);
        companion.object.visible = true;
        companion.update(t, Math.max(0, 1 - Math.abs(bt - 1.5) / 1.5), 0);
      } else companion.object.visible = false;
    },
    setQuality(q: Quality) {
      stars?.setCount(q === 'high' ? 900 : q === 'medium' ? 600 : 300);
      motes.setCount(q === 'low' ? 120 : 260);
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
