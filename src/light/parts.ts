// Building blocks shared by the light scenes: sky dome, star field, floating motes, cloud sea, moon
// and Noor (the companion light). Each takes a seed and is posed from time t only (no state carried
// between frames), so a scene renders the same frame for the same t on any device.
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, ColorManagement, Group, Mesh, PlaneGeometry,
  Points, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector2, Vector3, type Texture,
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

const glowSprite = (color: string, size: number, opacity: number) => {
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
export function starField(seed: number, count: number, opts: { color?: string; minY?: number; radius?: number; spread?: number } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
  const R = opts.radius ?? 800, minY = opts.minY ?? 0.04;
  for (let i = 0; i < count; i++) {
    // Uniform on the upper sphere, denser towards the horizon (more sky depth).
    const y = minY + (1 - minY) * Math.pow(r(), 1.4);
    // Azimuth around -z (where the camera looks), ± spread radians.
    const a = -Math.PI / 2 + (r() * 2 - 1) * (opts.spread ?? Math.PI), k = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * k * R, y * R, Math.sin(a) * k * R], i * 3);
    const big = r();
    size[i] = 1.2 + big * big * big * 3.2;
    phase[i] = r();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAlpha: { value: 1 }, uColor: { value: col(opts.color ?? '#fff6e6') } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uPx, uAlpha;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.62 + 0.38 * sin(uTime * (0.25 + aPhase * 0.7) + aPhase * 40.0);
        float lowFade = smoothstep(0.0, 0.18, normalize(position).y);
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
    },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uBreath, uScale, uAlpha, uMinY, uSpanY;
      varying float vA;
      void main() {
        float ph = aPhase * 6.2831;
        vec3 p = position + vec3(sin(uTime * 0.07 + ph) * 0.9, uTime * (0.025 + aPhase * 0.03) + sin(uTime * 0.05 + ph * 2.0) * 0.3, cos(uTime * 0.06 + ph * 1.5) * 0.9);
        float f = mod(p.y - uMinY, uSpanY) / uSpanY;
        p.y = uMinY + f * uSpanY;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float swell = 1.0 + uBreath * (0.35 + 0.5 * fract(aPhase * 13.7));
        gl_PointSize = aSize * swell * uScale / max(0.5, -mv.z);
        float edge = smoothstep(0.0, 0.12, f) * smoothstep(1.0, 0.85, f);
        vA = uAlpha * edge * (0.35 + 0.65 * fract(aPhase * 7.31)) * (0.65 + 0.35 * uBreath) * (0.8 + 0.2 * sin(uTime * 0.9 + ph * 3.0));
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
    update(t: number, breath: number, scale: number) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uBreath.value = breath;
      mat.uniforms.uScale.value = scale;
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
