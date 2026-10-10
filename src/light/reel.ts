// Light scenes as reel backgrounds (docs/light.md, L2). One WebGL renderer is shared by every light
// scene in the reel: drawScene() asks for the frame at time t, this renders it into the shared
// canvas and the caller copies it onto the 2D reel canvas right away (same task, so the drawing
// buffer is still valid). Pure in t, so preview and export show the same frame.
import { ColorManagement, LinearSRGBColorSpace, WebGLRenderer } from 'three';
import type { LightScene } from './engine';
import { LIGHT_SCENES, type LightId } from './scenes/reel';

let renderer: WebGLRenderer | null = null;

function shared(): WebGLRenderer {
  if (!renderer) {
    ColorManagement.enabled = false;
    renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer = null; });
  }
  return renderer;
}

export class LightReel {
  private sc: LightScene;
  private h = 0;

  constructor(readonly id: LightId, seed = 1) {
    this.sc = LIGHT_SCENES[id](seed);
    this.sc.setQuality('high');
  }

  /** The frame for reel time t at w×h pixels (the canvas is overwritten by the next call). */
  frame(t: number, w: number, h: number): HTMLCanvasElement {
    const r = shared();
    const c = r.domElement;
    if (c.width !== w || c.height !== h) r.setSize(w, h, false);
    if (this.h !== h || this.sc.camera.aspect !== w / h) {
      this.h = h;
      this.sc.camera.aspect = w / h;
      this.sc.camera.updateProjectionMatrix();
      this.sc.resize?.(h);
    }
    this.sc.update(t);
    r.render(this.sc.scene, this.sc.camera);
    return c;
  }

  dispose() {
    this.sc.dispose();
  }
}
