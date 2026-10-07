// Recitation spine: the reel laid out along the recitation under a fixed centre playhead — scenes,
// ayat (with their text steps and the cards) and the recitation waveform. Drag (or fling) to scrub,
// tap a track to open its tool. It is not a free timeline: everything here follows the recitation.
import { backgroundById } from '../engine/backgrounds';
import { sceneSpans, type Transition } from '../engine/scenes';
import type { Timeline } from '../engine/timeline';
import { h } from './dom';

export type SpineTrack = 'scenes' | 'text';

export interface SpineOptions {
  timeline: () => Timeline | null;
  time: () => number;
  scenes: () => string[]; // background id per scene entry
  transition: () => Transition;
  onScrubStart: () => void;
  seek: (t: number) => void;
  onTap: (track: SpineTrack) => void;
}

const PPS = 48; // css px per second
const RULER = 16, SCENES = 36, TEXT = 28, WAVE = 26, GAP = 4;
const HEIGHT = RULER + SCENES + TEXT + WAVE + GAP * 4;

const thumbs = new Map<string, HTMLImageElement>();

export function createSpine(o: SpineOptions) {
  const canvas = h('canvas', { class: 'spine-canvas' });
  const el = h('div', { class: 'spine', role: 'slider', 'aria-label': 'Recitation timeline: drag to scrub' }, canvas);
  const ctx = canvas.getContext('2d')!;
  let peaks: Float32Array | null = null;
  let peakRate = 50;
  let dirty = true;

  const css = (name: string) => getComputedStyle(el).getPropertyValue(name).trim() || '#888';
  const thumb = (src: string) => {
    let img = thumbs.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => (dirty = true);
      img.src = src;
      thumbs.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(el.clientWidth * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.height = `${HEIGHT}px`;
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  /** Peak level per 1/50 s of the reel's audio, for the waveform. */
  function setAudio(buf: AudioBuffer | null) {
    peaks = null;
    dirty = true;
    if (!buf) return;
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.round(buf.sampleRate / 50));
    peakRate = buf.sampleRate / step;
    const out = new Float32Array(Math.ceil(data.length / step));
    for (let i = 0; i < out.length; i++) {
      let m = 0;
      const end = Math.min(data.length, (i + 1) * step);
      for (let k = i * step; k < end; k += 4) m = Math.max(m, Math.abs(data[k]));
      out[i] = m;
    }
    let top = 0;
    for (const v of out) top = Math.max(top, v);
    if (top > 0) for (let i = 0; i < out.length; i++) out[i] /= top;
    peaks = out;
  }

  function round(x: number, y: number, w: number, hh: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), hh, Math.min(r, w / 2));
  }

  function draw() {
    const tl = o.timeline();
    const dpr = canvas.width / Math.max(1, el.clientWidth);
    const Wc = el.clientWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Wc, HEIGHT);
    if (!tl) return;
    const t = o.time();
    const X = (s: number) => Wc / 2 + (s - t) * PPS;
    const accent = css('--accent'), text = css('--text'), muted = css('--muted'), line = css('--line'), card = css('--card');
    const dur = tl.duration;

    // Reel extent.
    ctx.fillStyle = card;
    round(X(0), RULER + GAP, X(dur) - X(0), HEIGHT - RULER - GAP * 2, 8);
    ctx.fill();

    // Ruler: a tick per second, a label every 5 s.
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const s0 = Math.max(0, Math.floor(t - Wc / 2 / PPS)), s1 = Math.min(Math.ceil(dur), Math.ceil(t + Wc / 2 / PPS));
    for (let s = s0; s <= s1; s++) {
      const x = X(s);
      if (s % 5 === 0) ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x, 2);
      else ctx.fillRect(x - 0.5, 8, 1, 4);
    }

    // Scenes, with their thumbnails and the transitions between them.
    let y = RULER + GAP;
    const spans = sceneSpans(tl.scenes, o.transition());
    const ids = o.scenes();
    for (const s of tl.scenes) {
      const x0 = X(s.start) + 1, x1 = X(s.end) - 1;
      if (x1 < 0 || x0 > Wc) continue;
      const b = backgroundById(ids[s.entry] ?? '');
      ctx.save();
      round(x0, y, x1 - x0, SCENES, 6);
      ctx.clip();
      ctx.fillStyle = b.kind === 'color' ? b.color : '#222';
      ctx.fillRect(x0, y, x1 - x0, SCENES);
      const img = b.kind !== 'color' ? thumb(b.thumb) : null;
      if (img) {
        const w = (SCENES * img.naturalWidth) / img.naturalHeight;
        for (let x = x0; x < x1; x += w) if (x + w > 0 && x < Wc) ctx.drawImage(img, x, y, w, SCENES);
      }
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(x0, y + SCENES - 14, x1 - x0, 14);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.entry + 1} · ${b.label}`, Math.max(x0, 0) + 5, y + SCENES - 12);
      ctx.restore();
    }
    for (const s of spans) {
      if (s.tOut <= 0) continue;
      const x = X(s.end);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + SCENES / 2 - 7);
      ctx.lineTo(x + 7, y + SCENES / 2);
      ctx.lineTo(x, y + SCENES / 2 + 7);
      ctx.lineTo(x - 7, y + SCENES / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Ayat (cards at either end), with a tick where each text step starts.
    y += SCENES + GAP;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const block = (a: number, b: number, label: string, fill: string, ink: string) => {
      const x0 = X(a) + 1, x1 = X(b) - 1;
      if (x1 < 0 || x0 > Wc || x1 <= x0) return;
      ctx.fillStyle = fill;
      round(x0, y, x1 - x0, TEXT, 6);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = ink;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(label, Math.max(x0, 0) + 6, y + TEXT / 2);
      ctx.restore();
    };
    if (tl.intro > 0) block(0, tl.intro, 'Intro card', line, text);
    if (tl.outro > 0) block(dur - tl.outro, dur, 'Closing card', line, text);
    for (const a of tl.ayat) {
      block(a.start, a.end, `${tl.surah.n}:${a.ayah}`, accent, '#fff');
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (const e of a.events.slice(1)) {
        const x = X(e.start);
        if (x > 0 && x < Wc && e.start < a.end) ctx.fillRect(x - 0.5, y + 5, 1, TEXT - 10);
      }
    }

    // Recitation waveform.
    y += TEXT + GAP;
    if (peaks) {
      ctx.fillStyle = muted;
      const mid = y + WAVE / 2;
      for (let x = 0; x < Wc; x += 2) {
        const s = t + (x - Wc / 2) / PPS;
        if (s < 0 || s > dur) continue;
        const v = peaks[Math.floor(s * peakRate)] ?? 0;
        const hh = Math.max(1, v * (WAVE - 2));
        ctx.fillRect(x, mid - hh / 2, 1.5, hh);
      }
    }

    // Playhead.
    ctx.fillStyle = text;
    ctx.fillRect(Wc / 2 - 1, 0, 2, HEIGHT);
    ctx.beginPath();
    ctx.moveTo(Wc / 2 - 5, 0);
    ctx.lineTo(Wc / 2 + 5, 0);
    ctx.lineTo(Wc / 2, 6);
    ctx.fill();
  }

  // --- scrubbing: drag, fling, wheel; tap opens a track's tool ---
  let drag: { x: number; y: number; t: number; moved: boolean; lastX: number; lastT: number; v: number } | null = null;
  let fling = 0;
  const clampT = (x: number) => Math.min(Math.max(0, x), o.timeline()?.duration ?? 0);
  el.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(fling);
    el.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.offsetY, t: o.time(), moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 6) return;
    if (!drag.moved) o.onScrubStart();
    drag.moved = true;
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT); // px per ms
    drag.lastX = e.clientX;
    drag.lastT = now;
    o.seek(clampT(drag.t - (e.clientX - drag.x) / PPS));
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      const y = d.y - RULER - GAP;
      if (y >= 0 && y < SCENES) o.onTap('scenes');
      else if (y >= SCENES + GAP && y < SCENES + GAP + TEXT) o.onTap('text');
      return;
    }
    // Fling: keep gliding, slowing down.
    let v = performance.now() - d.lastT < 80 ? d.v : 0;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      v *= Math.pow(0.995, now - last);
      if (Math.abs(v) < 0.02) return;
      o.seek(clampT(o.time() - (v * (now - last)) / PPS));
      last = now;
      fling = requestAnimationFrame(step);
    };
    fling = requestAnimationFrame(step);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    o.onScrubStart();
    o.seek(clampT(o.time() + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / PPS));
  }, { passive: false });

  return {
    el,
    setAudio,
    invalidate: () => (dirty = true),
    /** Redraw if something changed (call once per animation frame). */
    frame(force = false) {
      if (!dirty && !force) return;
      dirty = false;
      draw();
    },
    dispose: () => {
      ro.disconnect();
      cancelAnimationFrame(fling);
    },
  };
}
