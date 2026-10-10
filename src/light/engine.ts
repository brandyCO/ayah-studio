// LightStage: owns one WebGL renderer for one screen. Renders a LightScene (a pure function of time
// t + its seed) in a loop, pauses while the page is hidden, caps the device pixel ratio per quality
// step, and watches the frame time: too slow → one quality step down; at the lowest step →
// onFallback() (the screen switches to its flat 2D version). dispose() frees the GL context.
import { ColorManagement, LinearSRGBColorSpace, WebGLRenderer, type PerspectiveCamera, type Scene } from 'three';
import { QUALITIES, saveQuality, type Quality } from './support';

export interface LightScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Pose everything for time t (seconds). Must not depend on earlier calls (preview = export). */
  update(t: number): void;
  /** Fewer particles / no extras on lower steps. */
  setQuality(q: Quality): void;
  /** The drawing buffer changed (height in device pixels): point sizes follow it. */
  resize?(bufferHeight: number): void;
  dispose(): void;
}

/** Device pixel ratio cap per step. */
const DPR: Record<Quality, number> = { high: 1.5, medium: 1, low: 0.75, flat: 0.75 };

export interface StageOptions {
  quality: Quality;
  /** Time source in seconds (default: seconds since start). */
  clock?: () => number;
  /** The device could not keep up even at the lowest step. */
  onFallback?: () => void;
  /** Called before each frame (feed inputs such as the recitation's breath). */
  beforeFrame?: (t: number) => void;
}

export class LightStage {
  readonly renderer: WebGLRenderer;
  private raf = 0;
  private running = false;
  private disposed = false;
  private t0 = performance.now();
  private frames: number[] = [];
  private lastFrame = 0;
  private lastStep = performance.now();
  private ro: ResizeObserver;
  quality: Quality;

  constructor(readonly canvas: HTMLCanvasElement, readonly light: LightScene, private o: StageOptions) {
    this.quality = o.quality === 'flat' ? 'low' : o.quality;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
    // Colours are used exactly as written (hex in, hex out): no sRGB ↔ linear conversions.
    ColorManagement.enabled = false;
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x05081a, 1);
    light.setQuality(this.quality);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    document.addEventListener('visibilitychange', this.onVis);
    canvas.addEventListener('webglcontextlost', this.onLost);
  }

  private onVis = () => {
    if (document.hidden) this.pause();
    else this.start();
  };

  private onLost = (e: Event) => {
    e.preventDefault();
    this.pause();
    this.o.onFallback?.();
  };

  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR[this.quality]));
    this.renderer.setSize(w, h, false);
    this.light.camera.aspect = w / h;
    this.light.camera.updateProjectionMatrix();
    this.light.resize?.(this.canvas.height);
    if (!this.running) this.draw();
  }

  now() {
    return this.o.clock ? this.o.clock() : (performance.now() - this.t0) / 1000;
  }

  private draw() {
    if (this.disposed) return;
    const t = this.now();
    this.o.beforeFrame?.(t);
    this.light.update(t);
    this.renderer.render(this.light.scene, this.light.camera);
  }

  start() {
    if (this.running || this.disposed || document.hidden) return;
    this.running = true;
    this.lastFrame = 0;
    this.frames = [];
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.draw();
      this.watch(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Rolling frame time over ~3 s: > 40 ms → step down; < 18 ms for 12 s on medium → try high. */
  private watch(now: number) {
    if (this.lastFrame) this.frames.push(now - this.lastFrame);
    this.lastFrame = now;
    if (this.frames.length > 120) this.frames.shift();
    const since = now - this.lastStep;
    if (this.frames.length < 60 || since < 3000) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    const i = QUALITIES.indexOf(this.quality);
    if (avg > 40) {
      const next = QUALITIES[i + 1];
      if (next === 'flat') {
        saveQuality('low');
        this.pause();
        this.o.onFallback?.();
        return;
      }
      this.setQuality(next);
    } else if (avg < 18 && this.quality === 'medium' && since > 12000) {
      this.setQuality('high');
    }
  }

  setQuality(q: Quality) {
    if (q === 'flat') return;
    this.quality = q;
    saveQuality(q);
    this.lastStep = performance.now();
    this.frames = [];
    this.light.setQuality(q);
    this.resize();
  }

  dispose() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.light.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
