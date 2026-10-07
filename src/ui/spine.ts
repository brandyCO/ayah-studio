// The timeline (recitation spine), CapCut-style: it starts at the left, a white playhead moves along
// (and stays mid-screen while playing), with a scenes track and the recitation audio track (one block
// per ayah, with its waveform). Tap a block to select it, then:
//   - scene: drag an edge to trim (neighbours give way, min 1 s, optional snap to the reciter's
//     pauses), drag the block to reorder
//   - audio: drag an edge to trim silence from the start or end of the ayah (never a word), drag the
//     block to add a pause before it
// Drag the ruler to scrub, anywhere else to scroll; pinch, ctrl+wheel or −/+ to zoom.
import { backgroundById } from '../engine/backgrounds';
import type { ReelPlan } from '../engine/recitation';
import { MIN_SCENE, sceneSpans, snapPoints, type Transition } from '../engine/scenes';
import type { Timeline } from '../engine/timeline';
import { h } from './dom';

export type Selection = { kind: 'scene' | 'audio'; index: number } | null;

/** Trim state of one ayah's audio (seconds): what is trimmed now, the most allowed, the pause before it. */
export interface AudioTrim {
  head: number;
  tail: number;
  maxHead: number;
  maxTail: number;
  gap: number;
}

export interface SpineOptions {
  timeline: () => Timeline | null;
  plan: () => ReelPlan | null;
  time: () => number;
  playing: () => boolean;
  scenes: () => string[];
  transition: () => Transition;
  snap: () => boolean;
  selection: () => Selection;
  select: (s: Selection) => void;
  onScrubStart: () => void;
  seek: (t: number) => void;
  resizeScenes: (bounds: number[]) => void;
  moveScene: (from: number, to: number) => void;
  addScene: () => void;
  audioTrim: (i: number) => AudioTrim | null;
  trimAudio: (i: number, head: number, tail: number) => void;
  setGap: (i: number, gap: number) => void;
}

const PAD = 16; // the reel starts this far from the left edge
const RULER = 24, SCENES = 50, AUDIO = 46, GAP = 8;
const Y_SC = RULER + 4, Y_AU = Y_SC + SCENES + GAP;
const TRACKS = Y_AU + AUDIO;
const HANDLE = 14;

const thumbs = new Map<string, HTMLImageElement>();

type Hit =
  | { kind: 'ruler' }
  | { kind: 'scene' | 'audio'; index: number; part: 'body' | 'start' | 'end' }
  | { kind: 'add' }
  | { kind: 'empty' };

type Drag =
  | { kind: 'scrub' }
  | { kind: 'pan'; left0: number }
  | { kind: 'scene-edge'; index: number; bounds: number[] } // index: boundary between scene index and index+1
  | { kind: 'scene-move'; index: number; dt: number }
  | { kind: 'audio-head'; index: number; trim: AudioTrim; head: number }
  | { kind: 'audio-tail'; index: number; trim: AudioTrim; tail: number }
  | { kind: 'audio-move'; index: number; trim: AudioTrim; gap: number };

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createSpine(o: SpineOptions) {
  const canvas = h('canvas', { class: 'spine-canvas' });
  const zoomOut = h('button', { class: 'spine-zoom', 'aria-label': 'Zoom out', onclick: () => zoom(1 / 1.5) }, '−');
  const zoomIn = h('button', { class: 'spine-zoom', 'aria-label': 'Zoom in', onclick: () => zoom(1.5) }, '+');
  const el = h('div', { class: 'spine', role: 'group', 'aria-label': 'Timeline' }, canvas, h('div', { class: 'spine-zooms' }, zoomOut, zoomIn));
  const ctx = canvas.getContext('2d')!;
  let peaks: Float32Array | null = null;
  let peakRate = 50;
  let dirty = true;
  let pps = 0; // px per second (0: fit on first draw)
  let left = 0; // seconds at the left edge
  let drag: (Drag & { x0: number; y0: number; moved: boolean; lastX: number; lastT: number; v: number }) | null = null;
  const pointers = new Map<number, number>(); // pointerId → clientX (pinch)
  let pinch: { d0: number; pps0: number; mid: number } | null = null;
  let fling = 0;
  let height = TRACKS + 20;

  const Wc = () => el.clientWidth;
  const X = (s: number) => PAD + (s - left) * pps;
  const T = (x: number) => left + (x - PAD) / pps;
  const dur = () => o.timeline()?.duration ?? 0;
  const clampLeft = () => {
    const visible = (Wc() - PAD * 2) / pps;
    left = Math.min(Math.max(0, left), Math.max(0, dur() - visible * 0.5));
  };
  function zoom(f: number, at = Wc() / 2) {
    const s = T(at);
    pps = Math.min(240, Math.max(8, pps * f));
    left = s - (at - PAD) / pps;
    clampLeft();
    dirty = true;
  }

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
    height = Math.max(TRACKS + 12, el.clientHeight);
    canvas.width = Math.round(el.clientWidth * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
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

  // --- geometry (with the drag in progress applied) ---
  function sceneBounds(): number[] {
    if (drag?.kind === 'scene-edge') return drag.bounds;
    return o.timeline()!.scenes.slice(1).map((s) => s.start);
  }
  /** Audio block per ayah in reel time, and the waveform offset (reel time of the committed audio). */
  function audioBlocks(): { a: number; b: number; off: number }[] {
    const p = o.plan();
    const tl = o.timeline()!;
    const out = p?.pieces ? p.pieces.map((x) => ({ a: x.at, b: x.at + x.to - x.from, off: 0 }))
      : tl.ayat.map((x, i) => ({ a: i ? x.start - 0.2 : 0, b: i + 1 < tl.ayat.length ? tl.ayat[i + 1].start - 0.2 : tl.duration, off: 0 }));
    if (drag?.kind === 'audio-head') out[drag.index].a += drag.head - drag.trim.head;
    if (drag?.kind === 'audio-tail') out[drag.index].b -= drag.tail - drag.trim.tail;
    if (drag?.kind === 'audio-move') {
      const d = drag.gap - drag.trim.gap;
      for (let i = drag.index; i < out.length; i++) out[i] = { a: out[i].a + d, b: out[i].b + d, off: d };
    }
    return out;
  }

  function hit(x: number, y: number): Hit {
    const tl = o.timeline();
    if (!tl) return { kind: 'empty' };
    if (y < Y_SC - 2) return { kind: 'ruler' };
    const t = T(x);
    const sel = o.selection();
    const near = (s: number) => Math.abs(X(s) - x) <= HANDLE + 6;
    if (y < Y_SC + SCENES + GAP / 2) {
      if (x >= X(tl.duration) + 8 && x <= X(tl.duration) + 8 + SCENES) return { kind: 'add' };
      const b = [0, ...sceneBounds(), tl.duration];
      if (sel?.kind === 'scene') {
        if (sel.index > 0 && near(b[sel.index])) return { kind: 'scene', index: sel.index, part: 'start' };
        if (sel.index < b.length - 2 && near(b[sel.index + 1])) return { kind: 'scene', index: sel.index, part: 'end' };
      }
      for (let i = 0; i + 1 < b.length; i++) if (t >= b[i] && t < b[i + 1]) return { kind: 'scene', index: i, part: 'body' };
      return { kind: 'empty' };
    }
    if (y < Y_AU + AUDIO + GAP) {
      const blocks = audioBlocks();
      if (sel?.kind === 'audio' && blocks[sel.index]) {
        const bl = blocks[sel.index];
        if (Math.abs(X(bl.a) + HANDLE / 2 - x) <= HANDLE) return { kind: 'audio', index: sel.index, part: 'start' };
        if (Math.abs(X(bl.b) - HANDLE / 2 - x) <= HANDLE) return { kind: 'audio', index: sel.index, part: 'end' };
      }
      const i = blocks.findIndex((bl) => t >= bl.a && t < bl.b);
      return i >= 0 ? { kind: 'audio', index: i, part: 'body' } : { kind: 'empty' };
    }
    return { kind: 'empty' };
  }

  function round(x: number, y: number, w: number, hh: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), hh, Math.min(r, Math.max(0, w) / 2));
  }
  /** CapCut-style selection: white frame with grip handles at the ends. */
  function handles(x0: number, x1: number, y: number, hh: number, start: boolean, end: boolean) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    round(x0, y - 1, x1 - x0, hh + 2, 4);
    ctx.stroke();
    for (const [on, x] of [[start, x0], [end, x1 - HANDLE]] as [boolean, number][]) {
      if (!on) continue;
      ctx.fillStyle = '#fff';
      round(x, y - 1, HANDLE, hh + 2, 4);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(x + HANDLE / 2 - 1, y + hh / 2 - 8, 2, 16);
    }
  }

  function draw() {
    const tl = o.timeline();
    const w = Wc();
    const dpr = canvas.width / Math.max(1, w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    if (!tl) return;
    if (!pps) pps = Math.min(90, Math.max(30, (w - PAD * 2 - 60) / tl.duration)); // fit a short reel
    const t = o.time();
    const D = tl.duration;
    const sel = o.selection();

    // Ruler: "00:00" labels with dots between (CapCut).
    ctx.fillStyle = '#8b929b';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const every = pps >= 45 ? 2 : pps >= 20 ? 5 : pps >= 10 ? 10 : 30;
    const dot = every / (pps * every >= 100 ? 4 : 2);
    const s0 = Math.max(0, Math.floor(T(0) / dot) * dot), s1 = Math.min(D + every, T(w));
    for (let s = s0; s <= s1 + 1e-9; s += dot) {
      const x = X(s);
      const r = Math.round(s / dot) * dot;
      if (Math.abs(r / every - Math.round(r / every)) < 1e-6) {
        ctx.textAlign = r === 0 ? 'left' : 'center';
        ctx.fillText(mmss(r), x, RULER / 2);
      } else ctx.fillRect(x - 1, RULER / 2 - 1, 2, 2);
    }
    ctx.textAlign = 'left';

    // Background scenes: thumbnails, length, transition markers, and the white + to add one.
    const ids = o.scenes();
    const b = [0, ...sceneBounds(), D];
    const scenes = tl.scenes.map((s, i) => ({ ...s, start: b[i], end: b[i + 1] }));
    const moving = drag?.kind === 'scene-move' ? drag : null;
    scenes.forEach((s, i) => {
      let x0 = X(s.start) + 1, x1 = X(s.end) - 1;
      if (moving?.index === i) {
        x0 += moving.dt * pps;
        x1 += moving.dt * pps;
      }
      if (x1 < 0 || x0 > w) return;
      const bg = backgroundById(ids[s.entry] ?? '');
      ctx.save();
      if (moving?.index === i) ctx.globalAlpha = 0.85;
      round(x0, Y_SC, x1 - x0, SCENES, 4);
      ctx.clip();
      ctx.fillStyle = bg.kind === 'color' ? bg.color : '#222';
      ctx.fillRect(x0, Y_SC, x1 - x0, SCENES);
      const img = bg.kind !== 'color' ? thumb(bg.thumb) : null;
      if (img) {
        const tw = (SCENES * img.naturalWidth) / img.naturalHeight;
        for (let x = x0; x < x1; x += tw) if (x + tw > 0 && x < w) ctx.drawImage(img, x, Y_SC, tw, SCENES);
      }
      const label = `${(s.end - s.start).toFixed(1)}s`;
      ctx.font = '600 10px system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 8;
      const lx = Math.max(x0, 0) + 4 + (sel?.kind === 'scene' && sel.index === i ? HANDLE : 0);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      round(lx, Y_SC + 4, lw, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 4, Y_SC + 12);
      ctx.restore();
    });
    if (!moving && scenes.length > 1) {
      // Transition markers between scenes (white squares, as in CapCut).
      sceneSpans(scenes, o.transition()).forEach((sp, i) => {
        if (i === scenes.length - 1) return;
        const x = X(sp.end), y = Y_SC + SCENES / 2;
        if (x < -10 || x > w + 10) return;
        ctx.fillStyle = '#fff';
        round(x - 9, y - 9, 18, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 4);
        ctx.lineTo(x, y);
        ctx.lineTo(x - 5, y + 4);
        ctx.closePath();
        ctx.moveTo(x + 5, y - 4);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 5, y + 4);
        ctx.closePath();
        ctx.fill();
      });
    }
    if (sel?.kind === 'scene' && scenes[sel.index] && !moving) {
      const s = scenes[sel.index];
      handles(X(s.start) + 1, X(s.end) - 1, Y_SC, SCENES, sel.index > 0, sel.index < scenes.length - 1);
    }
    const ax = X(D) + 8;
    if (ax < w) {
      ctx.fillStyle = '#fff';
      round(ax, Y_SC + (SCENES - 34) / 2, 34, 34, 6);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(ax + 10, Y_SC + SCENES / 2 - 1, 14, 2);
      ctx.fillRect(ax + 16, Y_SC + SCENES / 2 - 7, 2, 14);
    }

    // Recitation audio: one block per ayah with its waveform.
    const blocks = audioBlocks();
    blocks.forEach(({ a: a0, b: a1, off }, i) => {
      const x0 = X(a0) + 1, x1 = X(a1) - 1;
      if (x1 < 0 || x0 > w || x1 <= x0) return;
      ctx.save();
      ctx.fillStyle = '#1d4a40';
      round(x0, Y_AU, x1 - x0, AUDIO, 4);
      ctx.fill();
      ctx.clip();
      if (peaks) {
        ctx.fillStyle = '#62d2b6';
        const mid = Y_AU + AUDIO / 2 + 6;
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x += 2) {
          const v = peaks[Math.floor((T(x) - off) * peakRate)] ?? 0;
          const hh = Math.max(1, v * (AUDIO - 18));
          ctx.fillRect(x, mid - hh / 2, 1.5, hh);
        }
      }
      ctx.fillStyle = '#fff';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const pad = sel?.kind === 'audio' && sel.index === i ? HANDLE : 0;
      ctx.fillText(`${tl.surah.n}:${tl.ayat[i].ayah}`, Math.max(x0, 0) + 5 + pad, Y_AU + 4);
      ctx.restore();
      if (sel?.kind === 'audio' && sel.index === i) handles(x0, x1, Y_AU, AUDIO, true, true);
    });
    if (drag && (drag.kind === 'audio-head' || drag.kind === 'audio-tail' || drag.kind === 'audio-move')) {
      const bl = blocks[drag.index];
      const msg = drag.kind === 'audio-move' ? `pause ${drag.gap.toFixed(1)} s`
        : drag.kind === 'audio-head' ? `start trimmed ${drag.head.toFixed(2)} s${drag.head >= drag.trim.maxHead - 1e-3 ? ' · first word' : ''}`
          : `end trimmed ${drag.tail.toFixed(2)} s${drag.tail >= drag.trim.maxTail - 1e-3 ? ' · last word' : ''}`;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const mw = ctx.measureText(msg).width + 12;
      const mx = Math.min(Math.max(4, X(drag.kind === 'audio-tail' ? bl.b : bl.a) - mw / 2), w - mw - 4);
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      round(mx, Y_AU + AUDIO + 6, mw, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(msg, mx + 6, Y_AU + AUDIO + 10);
    }

    // Playhead.
    const px = X(t);
    if (px >= 0 && px <= w) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 1, 2, 2, TRACKS + 6);
    }
  }

  // --- pointer handling ---
  const local = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function startDrag(at: Hit): Drag {
    const tl = o.timeline()!;
    if (at.kind === 'ruler') return { kind: 'scrub' };
    if (at.kind === 'scene' && at.part !== 'body') {
      return { kind: 'scene-edge', index: at.part === 'start' ? at.index - 1 : at.index, bounds: tl.scenes.slice(1).map((s) => s.start) };
    }
    const sel = o.selection();
    const selected = (at.kind === 'scene' || at.kind === 'audio') && sel?.kind === at.kind && sel.index === at.index;
    if (at.kind === 'scene' && selected && tl.scenes.length > 1) return { kind: 'scene-move', index: at.index, dt: 0 };
    if (at.kind === 'audio' && selected) {
      const trim = o.audioTrim(at.index);
      if (trim && at.part === 'start') return { kind: 'audio-head', index: at.index, trim, head: trim.head };
      if (trim && at.part === 'end') return { kind: 'audio-tail', index: at.index, trim, tail: trim.tail };
      if (trim && at.index > 0) return { kind: 'audio-move', index: at.index, trim, gap: trim.gap };
    }
    return { kind: 'pan', left0: left };
  }

  el.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.spine-zoom')) return;
    cancelAnimationFrame(fling);
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e.clientX);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.abs(a - b) || 1, pps0: pps, mid: (a + b) / 2 - el.getBoundingClientRect().left };
      drag = null;
      return;
    }
    const p = local(e);
    const d = startDrag(hit(p.x, p.y));
    drag = { ...d, x0: p.x, y0: p.y, moved: false, lastX: p.x, lastT: performance.now(), v: 0 };
    if (d.kind === 'scrub') {
      o.onScrubStart();
      o.seek(Math.min(Math.max(0, T(p.x)), dur()));
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const s = T(pinch.mid);
      pps = Math.min(240, Math.max(8, pinch.pps0 * (Math.abs(a - b) / pinch.d0)));
      left = s - (pinch.mid - PAD) / pps;
      clampLeft();
      dirty = true;
      return;
    }
    if (!drag) return;
    const p = local(e);
    if (!drag.moved && Math.abs(p.x - drag.x0) < 6) return;
    if (!drag.moved && drag.kind !== 'pan' && drag.kind !== 'scrub') o.onScrubStart();
    drag.moved = true;
    const now = performance.now();
    drag.v = (p.x - drag.lastX) / Math.max(1, now - drag.lastT);
    drag.lastX = p.x;
    drag.lastT = now;
    const tl = o.timeline()!;
    const plan = o.plan();
    const dx = (p.x - drag.x0) / pps;
    const tm = Math.min(Math.max(0, T(p.x)), tl.duration);
    switch (drag.kind) {
      case 'scrub':
        o.seek(tm);
        break;
      case 'pan':
        left = drag.left0 - (p.x - drag.x0) / pps;
        clampLeft();
        break;
      case 'scene-edge': {
        const k = drag.index, bs = drag.bounds;
        const lo = (k ? bs[k - 1] : 0) + MIN_SCENE, hi = (k + 1 < bs.length ? bs[k + 1] : tl.duration) - MIN_SCENE;
        let v = Math.min(Math.max(tm, lo), hi);
        if (o.snap() && plan) {
          // Snap to the nearest pause in the recitation within ~14 px.
          let best = 14 / pps, snapTo = v;
          for (const s of snapPoints(plan.ayat)) if (s >= lo && s <= hi && Math.abs(s - v) < best) [best, snapTo] = [Math.abs(s - v), s];
          v = snapTo;
        }
        bs[k] = v;
        o.seek(v);
        break;
      }
      case 'scene-move':
        drag.dt = dx;
        break;
      case 'audio-head':
        drag.head = Math.min(Math.max(drag.trim.head + dx, 0), drag.trim.maxHead);
        break;
      case 'audio-tail':
        drag.tail = Math.min(Math.max(drag.trim.tail - dx, 0), drag.trim.maxTail);
        break;
      case 'audio-move':
        drag.gap = Math.min(Math.max(drag.trim.gap + dx, 0), 10);
        break;
    }
    dirty = true;
  });

  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    dirty = true;
    const tl = o.timeline();
    if (!tl) return;
    if (!d.moved) {
      // Tap: select (or deselect) a block, add a scene, or seek on the ruler.
      const at = hit(d.x0, d.y0);
      if (at.kind === 'add') return o.addScene();
      if (at.kind === 'scene' || at.kind === 'audio') {
        const sel = o.selection();
        o.select(sel?.kind === at.kind && sel.index === at.index ? null : { kind: at.kind, index: at.index });
      } else if (at.kind === 'empty') o.select(null);
      return;
    }
    switch (d.kind) {
      case 'scene-edge':
        return o.resizeScenes(d.bounds);
      case 'scene-move': {
        const mid = (tl.scenes[d.index].start + tl.scenes[d.index].end) / 2 + d.dt;
        let to = tl.scenes.findIndex((s) => mid >= s.start && mid < s.end);
        if (to < 0) to = mid < 0 ? 0 : tl.scenes.length - 1;
        if (to !== d.index) o.moveScene(d.index, to);
        return;
      }
      case 'audio-head':
        return o.trimAudio(d.index, d.head, d.trim.tail);
      case 'audio-tail':
        return o.trimAudio(d.index, d.trim.head, d.tail);
      case 'audio-move':
        return o.setGap(d.index, d.gap);
      case 'pan': {
        // Fling: keep gliding, slowing down.
        let v = performance.now() - d.lastT < 80 ? d.v : 0;
        let last = performance.now();
        const stepFn = () => {
          const now = performance.now();
          v *= Math.pow(0.995, now - last);
          if (Math.abs(v) < 0.02) return;
          left -= (v * (now - last)) / pps;
          clampLeft();
          dirty = true;
          last = now;
          fling = requestAnimationFrame(stepFn);
        };
        fling = requestAnimationFrame(stepFn);
      }
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) return zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX);
    left += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / pps;
    clampLeft();
    dirty = true;
  }, { passive: false });

  let lastT = -1;
  return {
    el,
    setAudio,
    invalidate: () => (dirty = true),
    /** Redraw if something changed (call once per animation frame); follows the playhead while playing. */
    frame() {
      const t = o.time();
      if (t !== lastT) {
        lastT = t;
        dirty = true;
        if (o.playing() && pps) {
          // Start from the left; once the playhead passes the middle, keep it there.
          const w = Wc();
          if (X(t) > w / 2) left = t - (w / 2 - PAD) / pps;
          else if (X(t) < PAD) left = t;
          clampLeft();
        }
      }
      if (!dirty) return;
      dirty = false;
      draw();
    },
    /** Bring time t into view (after a seek from elsewhere). */
    reveal(t: number) {
      if (!pps) return;
      if (X(t) < PAD || X(t) > Wc() - PAD) {
        left = t - Wc() / 3 / pps;
        clampLeft();
        dirty = true;
      }
    },
    dispose: () => {
      ro.disconnect();
      cancelAnimationFrame(fling);
    },
  };
}
