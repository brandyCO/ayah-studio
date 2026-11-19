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
  // Moving water light (added light only): two drifting layers of bright thin lines where a sum of
  // waves crosses zero, as in the 256 px tile of the Canvas 2D version.
  caustics: `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform float t; uniform float amount; uniform vec2 frame;
const float PI2 = 6.2831853;
float lines(vec2 q) {
  float v = cos(PI2 * (1.0 * q.x + 2.0 * q.y) + 0.3) + cos(PI2 * (3.0 * q.x - 1.0 * q.y) + 1.9)
          + cos(PI2 * (2.0 * q.x + 3.0 * q.y) + 4.1) + cos(PI2 * (-2.0 * q.x + 1.0 * q.y) + 2.6)
          + cos(PI2 * (4.0 * q.x + 1.0 * q.y) + 5.2) + cos(PI2 * (1.0 * q.x - 4.0 * q.y) + 0.9);
  return exp(-v * v * 2.2);
}
void main() {
  vec2 f = vec2(uv.x, 1.0 - uv.y) * frame;
  float a = lines((f - vec2(t * 14.0, t * 9.0)) / (256.0 * 3.2)) * 0.06;
  float b = lines((f - vec2(t * -11.0, t * 7.0)) / (256.0 * 2.3)) * 0.045;
  float l = (a + b) * amount;
  o = vec4(vec3(205.0, 238.0, 255.0) / 255.0 * l, l);
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

/** Wraps a GPU step: any error turns the GPU path off for this visit (the 2D fallback takes over). */
function guarded<T>(fn: (g: Gpu) => T): T | null {
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

/** Water light (added light only), drawn at half size: it is soft, so nothing is lost. */
export function gpuCaustics(ctx: CanvasRenderingContext2D, t: number, amount: number, frameW: number, frameH: number): boolean {
  const c = ctx.canvas;
  return guarded((g) => {
    const w = Math.max(16, Math.round(c.width / 2)), h = Math.max(16, Math.round(c.height / 2));
    size(g, w, h);
    g.gl.clearColor(0, 0, 0, 0);
    g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    run(g, 'caustics', { t, amount, frame: [frameW, frameH] });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(g.canvas, 0, 0, w, h, 0, 0, c.width, c.height);
    ctx.restore();
    return true;
  }) ?? false;
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

/** Whether the GPU path is in use on this device (Device check). */
export const gpuActive = () => !!init();
