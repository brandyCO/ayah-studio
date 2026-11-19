// GPU effects (owner request 2026-11-19, "smooth 60 fps on every phone"): the costly picture effects
// run as WebGL2 shaders, the way video editors do, instead of hundreds of Canvas 2D draw calls or
// per-frame `filter: blur()` (which iPhone Safari does not support at all, so blurs were missing there).
// Every effect is still a pure function of t, so the preview equals the export. Without WebGL2 (or
// after a lost context) each caller falls back to its Canvas 2D version.
type Src = HTMLCanvasElement | OffscreenCanvas;

interface Gpu {
  gl: WebGL2RenderingContext;
  canvas: Src;
  progs: Map<string, WebGLProgram>;
  tex: WebGLTexture;
  vao: WebGLVertexArrayObject;
  fbos: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }[];
}

let gpu: Gpu | null = null;
let failed = false;
/** Off for tests and for the Device check switch (localStorage `gpuFx` = 'off'). */
const disabled = () => { try { return localStorage.getItem('gpuFx') === 'off'; } catch { return false; } };

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG: Record<string, string> = {
  // The picture through slowly moving water: rows sway sideways, columns rise and fall (the same
  // waves as the Canvas 2D version, but smooth instead of in strips).
  ripple: `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform float t; uniform float amp; uniform vec2 frame; // amp in frame units
float wave(float p, float tt, float a, float b) { return sin(p * a + tt * 1.1) * 0.62 + sin(p * b - tt * 0.7 + 1.7) * 0.38; }
void main() {
  vec2 f = vec2(uv.x, 1.0 - uv.y) * frame; // frame units, y down
  float m = amp + 1.0;
  float dx = amp * wave(f.y, t, 0.021, 0.047);
  float dy = amp * 0.8 * wave(f.x, t * 0.9 + 3.0, 0.017, 0.039);
  vec2 s = vec2(m + dx, m + dy) + f * (frame - 2.0 * m) / frame;
  o = texture(src, vec2(s.x / frame.x, 1.0 - s.y / frame.y));
}`,
  // Moving water light (added light only): two drifting layers of the same 256 px tile as the Canvas 2D
  // version (two texture reads a pixel instead of a dozen waves, so weak graphics chips keep up).
  caustics: `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tile; uniform vec2 frame;
uniform vec4 l0; uniform vec4 l1; // per layer: offset x, y (frame units), scale, alpha
void main() {
  vec2 f = vec2(uv.x, 1.0 - uv.y) * frame;
  vec3 c = texture(tile, (f - l0.xy) / (256.0 * l0.z)).rgb * l0.w + texture(tile, (f - l1.xy) / (256.0 * l1.z)).rgb * l1.w;
  o = vec4(c, l0.w + l1.w);
}`,
  // Separable Gaussian blur (9 taps with linear sampling ≈ 17 taps), run at a reduced size.
  blur: `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir; // texel step along one axis
void main() {
  o = texture(src, uv) * 0.1964825501511404
    + (texture(src, uv + dir * 1.411764705882353) + texture(src, uv - dir * 1.411764705882353)) * 0.2969069646728344
    + (texture(src, uv + dir * 3.2941176470588234) + texture(src, uv - dir * 3.2941176470588234)) * 0.09447039785044732
    + (texture(src, uv + dir * 5.176470588235294) + texture(src, uv - dir * 5.176470588235294)) * 0.010381362401148057;
}`,
  // The finishing layers over the background in one pass (owner request 2026-11-19, "the whole picture
  // on the graphics chip"): water (ripple), colour grade, bloom, vignette, film grain, legibility scrim
  // and Cinematic's black, in the order and with the blend formulas Canvas 2D uses (W3C compositing),
  // so the picture matches the 2D path: up to ten full-screen canvas passes become one.
  finish: `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler2D noise; uniform vec2 frame;
uniform float rAmp; uniform float rT;
uniform vec4 g0; uniform int g0m; uniform vec4 g1; uniform int g1m;
uniform float bloomA;
uniform float vigA; uniform float vigR0; uniform float vigR1;
uniform float grainA; uniform vec2 grainO;
uniform float scrimK; uniform float darkK;
float wave(float p, float tt, float a, float b) { return sin(p * a + tt * 1.1) * 0.62 + sin(p * b - tt * 0.7 + 1.7) * 0.38; }
vec3 softLight(vec3 b, vec3 s) {
  vec3 d = mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25)));
  return mix(b + (2.0 * s - 1.0) * (d - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), step(s, vec3(0.5)));
}
vec3 layer(vec3 c, vec4 g, int m) {
  if (m == 1) return mix(c, g.rgb, g.a);
  if (m == 2) return mix(c, softLight(c, g.rgb), g.a);
  if (m == 3) return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), g.a);
  return c;
}
vec3 grade(vec3 c) { return layer(layer(c, g0, g0m), g1, g1m); }
float scrimAt(float u, float k) {
  float a0 = min(0.9, 0.45 * k), a1 = min(0.9, 0.05 * k), a2 = min(0.9, 0.25 * k), a3 = min(0.9, 0.5 * k);
  if (u < 0.16) return mix(a0, a1, u / 0.16);
  if (u < 0.3) return mix(a1, a2, (u - 0.16) / 0.14);
  if (u < 0.7) return a2;
  if (u < 0.86) return mix(a2, a1, (u - 0.7) / 0.16);
  return mix(a1, a3, (u - 0.86) / 0.14);
}
void main() {
  vec2 f = vec2(uv.x, 1.0 - uv.y) * frame; // frame units, y down
  vec2 s = uv;
  if (rAmp > 0.0) {
    float m = rAmp + 1.0;
    float dx = rAmp * wave(f.y, rT, 0.021, 0.047);
    float dy = rAmp * 0.8 * wave(f.x, rT * 0.9 + 3.0, 0.017, 0.039);
    vec2 q = vec2(m + dx, m + dy) + f * (frame - 2.0 * m) / frame;
    s = vec2(q.x / frame.x, 1.0 - q.y / frame.y);
  }
  vec3 c = grade(textureLod(src, s, 0.0).rgb);
  if (bloomA > 0.0) {
    vec3 b = grade(textureLod(src, s, 3.0).rgb);
    b = b * b * b;
    c = mix(c, c + b - c * b, bloomA);
  }
  if (vigA > 0.0) {
    float d = length(f - frame * 0.5);
    c *= 1.0 - vigA * clamp((d - vigR0) / (vigR1 - vigR0), 0.0, 1.0);
  }
  if (grainA > 0.0) {
    float n = texture(noise, (f - grainO) / 256.0).r;
    vec3 ov = mix(vec3(n) + (2.0 * c - 1.0) - vec3(n) * (2.0 * c - 1.0), 2.0 * c * n, step(c, vec3(0.5)));
    c = mix(c, ov, grainA);
  }
  if (scrimK > 0.0) c *= (1.0 - min(0.9, 0.22 * scrimK)) * (1.0 - scrimAt(f.y / frame.y, scrimK));
  c *= 1.0 - darkK;
  o = vec4(c, 1.0);
}`,
  copy: `#version 300 es
precision highp float;
in vec2 uv; out vec4 o; uniform sampler2D src;
void main() { o = texture(src, uv); }`,
};

function init(): Gpu | null {
  if (gpu) return gpu;
  if (failed || disabled()) return null;
  try {
    const canvas: Src = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('no webgl2');
    (canvas as HTMLCanvasElement).addEventListener?.('webglcontextlost', () => { gpu = null; failed = true; });
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = newTex(gl);
    gpu = { gl, canvas, progs: new Map(), tex, vao, fbos: [] };
    return gpu;
  } catch {
    failed = true;
    return null;
  }
}

function newTex(gl: WebGL2RenderingContext) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function prog(g: Gpu, name: string): WebGLProgram {
  let p = g.progs.get(name);
  if (p) return p;
  const { gl } = g;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG[name]));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  g.progs.set(name, p);
  return p;
}

/** Draws into the top-left w×h of the GPU canvas. The canvas only grows: resizing it reallocates its
 *  buffers (measured: ~40 ms a frame at 4× CPU slowdown when water and water light took turns). */
function size(g: Gpu, w: number, h: number) {
  const c = g.canvas;
  if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  g.gl.bindFramebuffer(g.gl.FRAMEBUFFER, null);
  g.gl.viewport(0, c.height - h, w, h); // GL counts rows from the bottom
}

function upload(g: Gpu, src: CanvasImageSource) {
  const { gl } = g;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // the finish pass may have set mipmaps
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // texture v = 1 at the top of the picture, as on the canvas
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
}

function run(g: Gpu, name: string, uniforms: Record<string, number | [number, number]>) {
  const { gl } = g;
  const p = prog(g, name);
  gl.useProgram(p);
  for (const [k, v] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(p, k);
    if (Array.isArray(v)) gl.uniform2f(loc, v[0], v[1]);
    else gl.uniform1f(loc, v);
  }
  gl.uniform1i(gl.getUniformLocation(p, 'src'), 0);
  gl.bindVertexArray(g.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Each phone picks the faster way for itself (owner request 2026-11-19, "fast on every phone"): handing the
// picture to the graphics chip and back has a fixed cost that is small on most phones and large on some,
// so the studio plays a moment each way and keeps the smoother one (editor.ts, `gpuTrial`). Both ways
// draw the same picture, so the choice is never visible. Asked again after 30 days.
const PICK = 'gpuPick';
let use: boolean | null = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(PICK) ?? 'null');
    if (v && typeof v.gpu === 'boolean' && Date.now() - v.at < 30 * 864e5) return v.gpu;
  } catch { /* storage blocked */ }
  return null;
})();
let trial: boolean | null = null;
/** Whether this phone has made its choice (or has no WebGL2, so there is nothing to choose). */
export const gpuPicked = () => use !== null || !init();
/** During a trial: force the graphics chip on (true) or off (false); null ends it. */
export function gpuTrial(on: boolean | null) { trial = on; }
export function gpuPick(gpu: boolean) {
  use = gpu;
  try { localStorage.setItem(PICK, JSON.stringify({ gpu, at: Date.now() })); } catch { /* storage blocked */ }
}
/** Device check: 'gpu', '2d', 'trying' or 'none'. */
export const gpuState = () => (!init() ? 'none' : use === null ? 'trying' : use ? 'gpu' : '2d');

/** Wraps a GPU step: any error turns the GPU path off for this visit (the 2D fallback takes over). */
function guarded<T>(fn: (g: Gpu) => T): T | null {
  if ((trial ?? use) === false) return null;
  const g = init();
  if (!g) return null;
  try {
    return fn(g);
  } catch (e) {
    console.warn('GPU effects off', e);
    failed = true;
    gpu = null;
    return null;
  }
}

/** Ripple (water) over everything drawn so far. Returns false when the caller must use its 2D version. */
export function gpuRipple(ctx: CanvasRenderingContext2D, t: number, ampUnits: number, frameW: number, frameH: number): boolean {
  const c = ctx.canvas;
  return guarded((g) => {
    size(g, c.width, c.height);
    upload(g, c);
    run(g, 'ripple', { t, amp: ampUnits, frame: [frameW, frameH] });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(g.canvas, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
    ctx.restore();
    return true;
  }) ?? false;
}

/** Water light (added light only), drawn at full size (two texture reads a pixel). `layers`: per
 *  layer [offset x, offset y, scale, alpha] as in the Canvas 2D version, `tile` its 256 px tile. */
export function gpuCaustics(ctx: CanvasRenderingContext2D, tile: CanvasImageSource, layers: [number, number, number, number][], frameW: number, frameH: number): boolean {
  const c = ctx.canvas;
  return guarded((g) => {
    const w = c.width, h = c.height;
    size(g, w, h);
    g.gl.activeTexture(g.gl.TEXTURE0);
    tileTex(g, tile);
    const p = prog(g, 'caustics');
    g.gl.useProgram(p);
    g.gl.uniform4f(g.gl.getUniformLocation(p, 'l0'), ...layers[0]);
    g.gl.uniform4f(g.gl.getUniformLocation(p, 'l1'), ...layers[1]);
    g.gl.uniform1i(g.gl.getUniformLocation(p, 'tile'), 0);
    run(g, 'caustics', { frame: [frameW, frameH] });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(g.canvas, 0, 0, w, h, 0, 0, c.width, c.height);
    ctx.restore();
    return true;
  }) ?? false;
}

/** A repeating texture made once from a small tile (water light, film grain), bound to the active unit. */
const tiles = new WeakMap<object, WebGLTexture>();
function tileTex(g: Gpu, img: CanvasImageSource) {
  const { gl } = g;
  let t = tiles.get(img);
  if (t) { gl.bindTexture(gl.TEXTURE_2D, t); return; }
  t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img as TexImageSource);
  tiles.set(img, t);
}

function fbo(g: Gpu, i: number, w: number, h: number) {
  const { gl } = g;
  let f = g.fbos[i];
  if (!f) {
    const tex = newTex(gl);
    const fb = gl.createFramebuffer()!;
    f = g.fbos[i] = { tex, fb, w: 0, h: 0 };
  }
  if (f.w !== w || f.h !== h) {
    gl.bindTexture(gl.TEXTURE_2D, f.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
    f.w = w; f.h = h;
  }
  return f;
}

/** A blurred copy of `src` (radius in source pixels) on the GPU canvas, or null (no WebGL2). The
 *  picture is shrunk first (a blur this soft loses nothing), blurred twice each way, then returned
 *  at the source size in the canvas's top-left corner (the rest is clear; the canvas may be larger)
 *  for the caller to draw at once at (0, 0). */
export function gpuBlurred(src: Src, radius: number): Src | null {
  if (radius < 0.5) return src;
  return guarded((g) => {
    const { gl } = g;
    const down = Math.max(1, Math.min(8, Math.floor(radius / 3)));
    const w = Math.max(4, Math.round(src.width / down)), h = Math.max(4, Math.round(src.height / down));
    const r = radius / down; // remaining radius at the reduced size
    upload(g, src);
    // One 17-tap pass covers ~±5 texels; repeat (and widen the step) for larger radii.
    const passes = Math.max(1, Math.min(4, Math.ceil(r / 5)));
    const step = Math.max(0.6, r / (5 * Math.sqrt(passes)));
    let from: WebGLTexture = g.tex;
    let k = 0;
    for (let i = 0; i < passes; i++) {
      for (const d of [[step / w, 0], [0, step / h]] as [number, number][]) {
        const f = fbo(g, k++ % 2, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, from);
        run(g, 'blur', { dir: d });
        from = f.tex;
      }
    }
    size(g, src.width, src.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    run(g, 'copy', {});
    return g.canvas;
  });
}

/** One grade layer for the finish pass: 1 source-over, 2 soft-light, 3 saturation (grey source). */
export interface FinishLayer { mode: 1 | 2 | 3; rgb: [number, number, number]; a: number }
export interface Finish {
  ripple?: { t: number; amp: number }; // amp in frame units
  grade?: FinishLayer[];
  bloom?: boolean;
  vignette?: { a: number; r0: number; r1: number }; // frame units
  grain?: { a: number; ox: number; oy: number; tile: CanvasImageSource };
  scrim?: number;
  dark?: number;
}
/** Applies `f` to everything drawn on `ctx` so far, in one shader pass. False: the caller draws it in 2D. */
export function gpuFinish(ctx: CanvasRenderingContext2D, f: Finish, frameW: number, frameH: number): boolean {
  const c = ctx.canvas;
  return guarded((g) => {
    const { gl } = g;
    size(g, c.width, c.height);
    upload(g, c);
    if (f.bloom) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    if (f.grain) {
      gl.activeTexture(gl.TEXTURE1);
      tileTex(g, f.grain.tile);
      gl.activeTexture(gl.TEXTURE0);
    }
    const p = prog(g, 'finish');
    gl.useProgram(p);
    const u = (k: string) => gl.getUniformLocation(p, k);
    gl.uniform1i(u('noise'), 1);
    gl.uniform1f(u('rAmp'), f.ripple?.amp ?? 0);
    gl.uniform1f(u('rT'), f.ripple?.t ?? 0);
    const l0 = f.grade?.[0], l1 = f.grade?.[1];
    gl.uniform4f(u('g0'), ...(l0 ? [...l0.rgb, l0.a] as [number, number, number, number] : [0, 0, 0, 0] as [number, number, number, number]));
    gl.uniform1i(u('g0m'), l0?.mode ?? 0);
    gl.uniform4f(u('g1'), ...(l1 ? [...l1.rgb, l1.a] as [number, number, number, number] : [0, 0, 0, 0] as [number, number, number, number]));
    gl.uniform1i(u('g1m'), l1?.mode ?? 0);
    gl.uniform1f(u('bloomA'), f.bloom ? 0.35 : 0);
    gl.uniform1f(u('vigA'), f.vignette?.a ?? 0);
    gl.uniform1f(u('vigR0'), f.vignette?.r0 ?? 0);
    gl.uniform1f(u('vigR1'), f.vignette?.r1 ?? 1);
    gl.uniform1f(u('grainA'), f.grain?.a ?? 0);
    gl.uniform2f(u('grainO'), f.grain?.ox ?? 0, f.grain?.oy ?? 0);
    gl.uniform1f(u('scrimK'), f.scrim ?? 0);
    gl.uniform1f(u('darkK'), f.dark ?? 0);
    run(g, 'finish', { frame: [frameW, frameH] });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(g.canvas, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
    ctx.restore();
    return true;
  }) ?? false;
}

/** Whether the GPU path is in use on this device (Device check). */
export const gpuActive = () => !!init();
