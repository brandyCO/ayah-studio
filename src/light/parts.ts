// Building blocks shared by the light scenes: sky dome, star field, floating motes, cloud sea, moon
// and Noor (the companion light). Each takes a seed and is posed from time t only (no state carried
// between frames), so a scene renders the same frame for the same t on any device.
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, ColorManagement, CylinderGeometry, DoubleSide, Group,
  InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Points, ShaderMaterial, SphereGeometry, Sprite,
  SpriteMaterial, Vector2, Vector3, type Texture,
} from 'three';
import { NOISE_GLSL, rng } from './noise';

// Hex colours are used as written (see engine.ts); must be off before any Color is made.
ColorManagement.enabled = false;

export const col = (hex: string) => new Color(hex);

// --- textures (drawn once on a 2D canvas) ---
let glowTex: Texture | null = null;
/** A soft round glow: bright core, wide falloff. */
export function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

let crescentTex: Texture | null = null;
/** A soft-edged crescent (the night's moon). */
export function crescentTexture(): Texture {
  if (crescentTex) return crescentTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.filter = 'blur(1.5px)';
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(128, 128, 90, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.arc(166, 108, 84, 0, Math.PI * 2);
  x.fill();
  crescentTex = new CanvasTexture(c);
  return crescentTex;
}

export const glowSprite = (color: string, size: number, opacity: number) => {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), color: col(color), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1);
  return s;
};

// --- sky dome ---
export interface SkyColors { zenith: string; mid: string; horizon: string; glow: string }

export function skyDome(c: SkyColors, glowDir: Vector3) {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: col(c.zenith) }, uMid: { value: col(c.mid) }, uHorizon: { value: col(c.horizon) },
      uGlow: { value: col(c.glow) }, uGlowDir: { value: glowDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uMid, uHorizon, uGlow, uGlowDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(-0.01, 0.16, y));
        c = mix(c, uZenith, smoothstep(0.16, 0.65, y));
        float m = max(dot(d, uGlowDir), 0.0);
        c += uGlow * pow(m, 5.0) * (1.0 - smoothstep(0.0, 0.55, y)) * 0.55;
        c += uGlow * pow(m, 80.0) * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(900, 32, 16), mat);
  mesh.renderOrder = -10;
  return mesh;
}

// --- stars (one draw call) ---
/** Height (sin of elevation) of the star band's centre line at an azimuth offset from -z. */
export const bandY = (off: number) => 0.3 + 0.9 * off;

export function starField(seed: number, count: number, opts: { color?: string; minY?: number; radius?: number; spread?: number; band?: number; size?: number } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
  const R = opts.radius ?? 800, minY = opts.minY ?? 0.04;
  for (let i = 0; i < count; i++) {
    // Uniform on the upper sphere, denser towards the horizon (more sky depth); or, for a band,
    // around a diagonal line across the view (bandY).
    // Azimuth around -z (where the camera looks), ± spread radians.
    const off = (r() * 2 - 1) * (opts.spread ?? Math.PI), a = -Math.PI / 2 + off;
    const y = opts.band ? Math.min(0.97, Math.max(0.03, bandY(off) + (r() + r() + r() - 1.5) * opts.band)) : minY + (1 - minY) * Math.pow(r(), 1.4);
    const k = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * k * R, y * R, Math.sin(a) * k * R], i * 3);
    const big = r();
    size[i] = (1.2 + big * big * big * 3.2) * (opts.size ?? 1);
    phase[i] = r();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAlpha: { value: 1 }, uColor: { value: col(opts.color ?? '#fff6e6') }, uLow: { value: opts.band ? 0 : 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uPx, uAlpha, uLow;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.62 + 0.38 * sin(uTime * (0.25 + aPhase * 0.7) + aPhase * 40.0);
        float lowFade = mix(1.0, smoothstep(0.0, 0.18, normalize(position).y), uLow);
        vA = tw * uAlpha * lowFade * (0.45 + 0.55 * aPhase);
        gl_PointSize = aSize * uPx;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, a * a * vA);
      }`,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return {
    object: pts,
    setCount: (n: number) => geo.setDrawRange(0, Math.min(count, n)),
    update(t: number, px: number) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uPx.value = px;
    },
    material: mat,
  };
}

// --- motes: small warm lights drifting upwards, swelling with `breath` ---
export function moteField(seed: number, count: number, center: Vector3, half: Vector3, color = '#ffd58a') {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([center.x + (r() * 2 - 1) * half.x, center.y + (r() * 2 - 1) * half.y, center.z + (r() * 2 - 1) * half.z], i * 3);
    size[i] = 0.05 + r() * r() * 0.16;
    phase[i] = r();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBreath: { value: 0 }, uScale: { value: 400 }, uAlpha: { value: 1 },
      uMinY: { value: center.y - half.y }, uSpanY: { value: half.y * 2 }, uColor: { value: col(color) },
      // Optional wrap in depth around the camera, so a camera can fly through the field for ever.
      uCamZ: { value: 0 }, uSpanZ: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uBreath, uScale, uAlpha, uMinY, uSpanY, uCamZ, uSpanZ;
      varying float vA;
      void main() {
        float ph = aPhase * 6.2831;
        vec3 p = position + vec3(sin(uTime * 0.07 + ph) * 0.9, uTime * (0.025 + aPhase * 0.03) + sin(uTime * 0.05 + ph * 2.0) * 0.3, cos(uTime * 0.06 + ph * 1.5) * 0.9);
        float f = mod(p.y - uMinY, uSpanY) / uSpanY;
        p.y = uMinY + f * uSpanY;
        float fz = 1.0;
        if (uSpanZ > 0.0) {
          float zz = mod(p.z - uCamZ, uSpanZ) / uSpanZ; // 0 far … 1 at the camera
          p.z = uCamZ - uSpanZ + zz * uSpanZ;
          fz = smoothstep(0.0, 0.15, zz) * smoothstep(1.0, 0.9, zz);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float swell = 1.0 + uBreath * (0.35 + 0.5 * fract(aPhase * 13.7));
        gl_PointSize = aSize * swell * uScale / max(0.5, -mv.z);
        float edge = smoothstep(0.0, 0.12, f) * smoothstep(1.0, 0.85, f);
        vA = uAlpha * edge * fz * (0.35 + 0.65 * fract(aPhase * 7.31)) * (0.65 + 0.35 * uBreath) * (0.8 + 0.2 * sin(uTime * 0.9 + ph * 3.0));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, a * a * vA);
      }`,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return {
    object: pts,
    setCount: (n: number) => geo.setDrawRange(0, Math.min(count, n)),
    update(t: number, breath: number, scale: number, camZ?: number, spanZ = 0) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uBreath.value = breath;
      mat.uniforms.uScale.value = scale;
      mat.uniforms.uCamZ.value = camZ ?? 0;
      mat.uniforms.uSpanZ.value = spanZ;
    },
    material: mat,
  };
}

// --- cloud sea: an endless soft layer below the camera (fbm, lit towards the glow, fogged away) ---
export interface CloudColors { deep: string; mid: string; top: string; fog: string; glint: string; /** the sky dome's glow colour, so the far clouds meet the horizon without a seam */ skyGlow?: string }

export function cloudSea(c: CloudColors, glowDir: Vector3, opts: { y?: number; speed?: number; scale?: number } = {}) {
  const geo = new PlaneGeometry(1600, 1600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const g2 = new Vector2(glowDir.x, glowDir.z).normalize();
  const mat = new ShaderMaterial({
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new Vector3() }, uGlow: { value: g2 }, uSpeed: { value: opts.speed ?? 1 }, uScale: { value: opts.scale ?? 0.045 },
      uDeep: { value: col(c.deep) }, uMid: { value: col(c.mid) }, uTop: { value: col(c.top) }, uFog: { value: col(c.fog) }, uGlint: { value: col(c.glint) },
      uBreath: { value: 0 }, uSkyGlow: { value: col(c.skyGlow ?? '#000000') }, uGlow3: { value: glowDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime, uSpeed, uScale, uBreath;
      uniform vec3 uCam, uDeep, uMid, uTop, uFog, uGlint, uSkyGlow, uGlow3;
      uniform vec2 uGlow;
      varying vec3 vW;
      void main() {
        vec2 p = vW.xz * uScale + vec2(uTime * 0.004, uTime * 0.011) * uSpeed;
        float d = fbm(p);
        float d2 = fbm(p * 2.6 + vec2(-uTime * 0.007 * uSpeed, 3.1));
        float puff = smoothstep(0.32, 0.78, d * 0.72 + d2 * 0.38);
        vec3 c = mix(uDeep, uMid, smoothstep(0.18, 0.62, d));
        c = mix(c, uTop, puff);
        vec3 v = vW - uCam;
        float dist = length(v.xz);
        vec2 dir = v.xz / max(dist, 0.001);
        float glint = pow(max(dot(dir, uGlow), 0.0), 18.0);
        c += uGlint * glint * (0.25 + 0.6 * puff) * (0.55 + 0.1 * uBreath);
        vec3 fog = uFog + uSkyGlow * pow(max(dot(vec3(dir.x, 0.0, dir.y), uGlow3), 0.0), 5.0) * 0.55;
        c = mix(c, fog, smoothstep(10.0, 200.0, dist));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new Mesh(geo, mat);
  mesh.position.y = opts.y ?? 0;
  return {
    object: mesh,
    /** The plane follows the camera (the noise is in world space, so the clouds stay put). */
    update(t: number, cam: Vector3, breath = 0) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(cam);
      mat.uniforms.uBreath.value = breath;
      mesh.position.x = cam.x;
      mesh.position.z = cam.z;
    },
    material: mat,
  };
}

// --- the moon: a soft crescent with a wide glow ---
export function moon(dir: Vector3, dist = 760) {
  const g = new Group();
  const p = dir.clone().normalize().multiplyScalar(dist);
  const halo = glowSprite('#ffe9c4', 260, 0.32);
  const disc = new Sprite(new SpriteMaterial({ map: crescentTexture(), color: col('#fff1d6'), transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  disc.scale.set(46, 46, 1);
  disc.material.rotation = -0.5;
  halo.position.copy(p);
  disc.position.copy(p);
  g.add(halo, disc);
  return g;
}

// --- Noor: the companion light. No face, no body: a warm core, a halo and a short trail. ---
export function noor(seed = 7) {
  const r = rng(seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const g = new Group();
  const halo = glowSprite('#ffc977', 1.5, 0.32);
  const core = glowSprite('#fff4dc', 0.38, 1);
  const TRAIL = 14;
  const trail = Array.from({ length: TRAIL }, (_, i) => glowSprite('#ffd58a', 0.2 * (1 - i / TRAIL) + 0.05, 0.22 * (1 - i / TRAIL)));
  g.add(...trail, halo, core);
  /** Where Noor floats at time t (relative to its anchor): slow, looping, never fast. */
  const path = (t: number, out: Vector3) => out.set(
    Math.sin(t * 0.21 + ph[0]) * 0.55 + Math.sin(t * 0.09 + ph[1]) * 0.3,
    Math.sin(t * 0.33 + ph[1]) * 0.22 + Math.sin(t * 0.13) * 0.12,
    Math.cos(t * 0.17 + ph[2]) * 0.35,
  );
  const tmp = new Vector3();
  return {
    object: g,
    /** `glow` 0 rest … 1 bright (completion); `flicker` 0…1 follows the words while listening. */
    update(t: number, glow = 0, flicker = 0) {
      path(t, core.position);
      halo.position.copy(core.position);
      const breathe = 1 + 0.08 * Math.sin(t * 1.55);
      const k = breathe * (1 + glow * 0.6) * (1 + flicker * 0.18);
      core.scale.setScalar(0.38 * k);
      halo.scale.setScalar(1.5 * k * (1 + glow * 0.4));
      halo.material.opacity = 0.28 + 0.12 * flicker + 0.2 * glow;
      for (let i = 0; i < TRAIL; i++) trail[i].position.copy(path(t - (i + 1) * 0.16, tmp));
    },
  };
}

// --- lanterns lit from inside, rising slowly over still water, with their reflections ---
/** Paper lanterns as one instanced mesh (warm inner light, brighter low down) plus one glow sprite
 *  each. Positions are computed in the shaders from time (rise + sway), so no per-frame state.
 *  `mirror` draws the same field upside down under the water (y → -y), dimmer. */
export function lanternField(seed: number, count: number, opts: { area: Vector3; center: Vector3; rise?: number; mirror?: boolean }) {
  const r = rng(seed);
  const base = new Float32Array(count * 3), phase = new Float32Array(count), warm = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base.set([opts.center.x + (r() * 2 - 1) * opts.area.x, opts.center.y + (r() * 2 - 1) * opts.area.y, opts.center.z + (r() * 2 - 1) * opts.area.z], i * 3);
    phase[i] = r();
    warm[i] = r();
  }
  const minY = opts.center.y - opts.area.y, span = opts.area.y * 2;
  const mirror = opts.mirror ? -1 : 1;
  const common = /* glsl */ `
    uniform float uTime, uRise, uMinY, uSpan, uMirror;
    vec3 lanternPos(vec3 b, float ph) {
      float y = uMinY + mod(b.y - uMinY + uTime * uRise * (0.6 + ph * 0.8), uSpan);
      return vec3(b.x + sin(uTime * 0.11 + ph * 6.28) * 0.35, y, b.z + cos(uTime * 0.09 + ph * 9.0) * 0.35);
    }
    float lanternFade(float y) { float f = (y - uMinY) / uSpan; return smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.8, f); }`;
  const uniforms = () => ({
    uTime: { value: 0 }, uRise: { value: opts.rise ?? 0.12 }, uMinY: { value: minY }, uSpan: { value: span }, uMirror: { value: mirror },
    uScale: { value: 400 }, uAlpha: { value: opts.mirror ? 0.35 : 1 },
  });
  // Bodies: a short tapered cylinder per lantern.
  const body = new CylinderGeometry(0.16, 0.12, 0.34, 10, 1, true);
  const ig = new InstancedBufferGeometry();
  ig.index = body.index;
  ig.setAttribute('position', body.getAttribute('position'));
  ig.setAttribute('aBase', new InstancedBufferAttribute(base, 3));
  ig.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1));
  ig.setAttribute('aWarm', new InstancedBufferAttribute(warm, 1));
  ig.instanceCount = count;
  const bodyMat = new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: uniforms(),
    vertexShader: /* glsl */ `
      ${common}
      attribute vec3 aBase; attribute float aPhase; attribute float aWarm;
      varying float vY, vA, vWarm;
      void main() {
        vec3 c = lanternPos(aBase, aPhase);
        vY = position.y / 0.34 + 0.5;
        vWarm = aWarm;
        vA = lanternFade(c.y);
        vec3 p = c + position;
        p.y *= uMirror;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying float vY, vA, vWarm;
      void main() {
        vec3 hot = mix(vec3(1.0, 0.83, 0.52), vec3(1.0, 0.72, 0.42), vWarm);
        vec3 c = mix(hot * 1.1, vec3(0.85, 0.42, 0.22), smoothstep(0.1, 1.0, vY));
        gl_FragColor = vec4(c, (0.92 - 0.25 * vY) * vA * uAlpha);
      }`,
  });
  const bodies = new Mesh(ig, bodyMat);
  bodies.frustumCulled = false;
  // Glows: one point per lantern, perspective-sized.
  const gg = new BufferGeometry();
  gg.setAttribute('position', new BufferAttribute(base, 3));
  gg.setAttribute('aPhase', new BufferAttribute(phase, 1));
  const glowMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: uniforms(),
    vertexShader: /* glsl */ `
      ${common}
      attribute float aPhase;
      uniform float uScale;
      varying float vA;
      void main() {
        vec3 c = lanternPos(position, aPhase);
        vA = lanternFade(c.y) * (0.75 + 0.25 * sin(uTime * 1.3 + aPhase * 30.0));
        c.y *= uMirror;
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 1.5 * uScale / max(0.5, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(1.0, 0.74, 0.42, a * a * 0.55 * vA * uAlpha);
      }`,
  });
  const glows = new Points(gg, glowMat);
  glows.frustumCulled = false;
  const g = new Group();
  g.add(bodies, glows);
  return {
    object: g,
    setCount: (n: number) => { ig.instanceCount = Math.min(count, n); gg.setDrawRange(0, Math.min(count, n)); },
    update(t: number, scale: number) {
      for (const m of [bodyMat, glowMat]) m.uniforms.uTime.value = t;
      glowMat.uniforms.uScale.value = scale;
    },
  };
}

/** Still water: a dark plane with a faint moving sheen; transparent so reflections show through. */
export function water(c: { deep: string; sheen: string; fog: string }, glowDir: Vector3, opts: { opacity?: number } = {}) {
  const geo = new PlaneGeometry(1600, 1600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new Vector3() }, uDeep: { value: col(c.deep) }, uSheen: { value: col(c.sheen) }, uFog: { value: col(c.fog) },
      uGlow: { value: new Vector2(glowDir.x, glowDir.z).normalize() }, uOpacity: { value: opts.opacity ?? 0.72 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime, uOpacity;
      uniform vec3 uCam, uDeep, uSheen, uFog;
      uniform vec2 uGlow;
      varying vec3 vW;
      void main() {
        vec3 v = vW - uCam;
        float dist = length(v.xz);
        vec2 dir = v.xz / max(dist, 0.001);
        float rip = vnoise(vec2(vW.x * 0.6, vW.z * 2.4 + uTime * 0.25)) * 0.6 + vnoise(vec2(vW.x * 1.7 - uTime * 0.1, vW.z * 5.0)) * 0.4;
        float glint = pow(max(dot(dir, uGlow), 0.0), 30.0);
        vec3 c = uDeep + uSheen * (0.08 + 0.35 * glint) * rip;
        float f = smoothstep(6.0, 160.0, dist);
        c = mix(c, uFog, f);
        gl_FragColor = vec4(c, mix(uOpacity, 1.0, f));
      }`,
  });
  const mesh = new Mesh(geo, mat);
  return {
    object: mesh,
    update(t: number, cam: Vector3) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(cam);
      mesh.position.x = cam.x;
      mesh.position.z = cam.z;
    },
  };
}

// --- aurora: soft curtains of light (fbm streaks), in the app's rose / gold / violet ---
export function aurora(seed: number, colors: [string, string, string], strength = 1) {
  const r = rng(seed);
  const g = new Group();
  const mats: ShaderMaterial[] = [];
  for (let i = 0; i < 3; i++) {
    const geo = new PlaneGeometry(260, 70, 64, 1);
    // Bend the curtain along a gentle wave in depth.
    const pos = geo.getAttribute('position') as BufferAttribute;
    const ph = r() * 6.28;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 0.018 + ph) * 26);
    const mat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uTime: { value: 0 }, uSeed: { value: r() * 100 }, uA: { value: col(colors[0]) }, uB: { value: col(colors[1]) }, uC: { value: col(colors[2]) }, uK: { value: (0.75 - i * 0.18) * strength } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${NOISE_GLSL}
        uniform float uTime, uSeed, uK;
        uniform vec3 uA, uB, uC;
        varying vec2 vUv;
        void main() {
          float x = vUv.x * 7.0 + uSeed;
          float streak = fbm(vec2(x * 3.2 + uTime * 0.035, uTime * 0.02 + uSeed));
          float band = fbm(vec2(x * 0.6 - uTime * 0.012, uSeed * 0.3));
          float base = smoothstep(0.0, 0.16, vUv.y) * pow(1.0 - vUv.y, 1.6);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float a = base * edge * smoothstep(0.35, 0.85, band) * (0.35 + 0.9 * streak);
          vec3 c = mix(uA, uB, smoothstep(0.1, 0.55, vUv.y));
          c = mix(c, uC, smoothstep(0.55, 1.0, vUv.y));
          gl_FragColor = vec4(c, a * uK);
        }`,
    });
    mats.push(mat);
    const m = new Mesh(geo, mat);
    m.position.set((r() - 0.5) * 60, 34 + i * 6, -170 - i * 55);
    g.add(m);
  }
  return { object: g, update(t: number) { for (const m of mats) m.uniforms.uTime.value = t; } };
}

// --- light rays through mist: long soft beams from a light above, slowly swaying ---
let rayTex: Texture | null = null;
function rayTexture(): Texture {
  if (rayTex) return rayTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d')!;
  const across = x.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = across;
  x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = 'destination-in';
  const along = x.createLinearGradient(0, 0, 0, 256);
  along.addColorStop(0, 'rgba(0,0,0,0.9)');
  along.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  along.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = along;
  x.fillRect(0, 0, 64, 256);
  rayTex = new CanvasTexture(c);
  return rayTex;
}

export function rays(seed: number, count: number, origin: Vector3, color: string) {
  const r = rng(seed);
  const g = new Group();
  g.position.copy(origin);
  const beams: { m: Mesh; ph: number; a0: number; tilt: number; op: number }[] = [];
  for (let i = 0; i < count; i++) {
    const len = 60 + r() * 50, wid = 3 + r() * 9;
    const geo = new PlaneGeometry(wid, len);
    geo.translate(0, -len / 2, 0); // hangs from the light
    const mat = new MeshBasicMaterial({ map: rayTexture(), color: col(color), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const m = new Mesh(geo, mat);
    const b = { m, ph: r() * 6.28, a0: (r() - 0.5) * 0.9, tilt: (r() - 0.5) * 0.5, op: 0.06 + r() * 0.12 };
    beams.push(b);
    g.add(m);
  }
  return {
    object: g,
    update(t: number) {
      for (const b of beams) {
        b.m.rotation.set(b.tilt, 0, b.a0 + Math.sin(t * 0.05 + b.ph) * 0.05);
        (b.m.material as MeshBasicMaterial).opacity = b.op * (0.65 + 0.35 * Math.sin(t * 0.13 + b.ph * 2));
      }
    },
  };
}

/** A soft bank of mist at one depth (fbm, slowly drifting), facing the camera. */
export function mistLayer(seed: number, opts: { z: number; y: number; width: number; height: number; color: string; opacity: number; speed?: number }) {
  const geo = new PlaneGeometry(opts.width, opts.height);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed * 13.7 }, uC: { value: col(opts.color) }, uO: { value: opts.opacity }, uS: { value: opts.speed ?? 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime, uSeed, uO, uS;
      uniform vec3 uC;
      varying vec2 vUv;
      void main() {
        vec2 p = vec2(vUv.x * 4.0 + uTime * 0.012 * uS + uSeed, vUv.y * 1.6);
        float n = fbm(p);
        float shape = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        gl_FragColor = vec4(uC, smoothstep(0.3, 0.75, n) * shape * uO);
      }`,
  });
  const m = new Mesh(geo, mat);
  m.position.set(0, opts.y, opts.z);
  return { object: m, update(t: number) { mat.uniforms.uTime.value = t; } };
}
