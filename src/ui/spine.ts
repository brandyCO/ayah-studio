// The timeline (recitation spine), CapCut-style: it starts at the left, a white playhead moves along
// (and stays mid-screen while playing), with a scenes track and the recitation audio track (one block
// per ayah, with its waveform). Tap a block to select it, then:
//   - scene: drag an edge to trim (neighbours give way, min 1 s, optional snap to the reciter's
//     pauses), drag the block to reorder
//   - audio: drag an edge to trim silence from the start or end of the ayah (never a word), drag the
//     block to add a pause before it
// Drag the ruler to scrub, anywhere else to scroll; pinch, ctrl+wheel or −/+ to zoom — down to
// milliseconds (3000 px per second; the waveform has a peak every 2 ms; drag labels show ms).
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
  /** Keyframes of the layer being moved (reel seconds), shown as diamonds on the ruler. */
  keys?: () => number[];
}

const PAD = 16; // the reel starts this far from the left edge
const RULER = 24, SCENES = 52, AUDIO = 52, GAP = 8;
const Y_SC = RULER + 4, Y_AU = Y_SC + SCENES + GAP;
const TRACKS = Y_AU + AUDIO;
const HANDLE = 20; // wide grips, easy to catch with a thumb
const SNAP_PX = 8; // the playhead snaps to an ayah or word start this close

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
/** Ruler label: "00:03", or "00:03.2" between whole seconds when zoomed in. */
const rulerLabel = (s: number, every: number) => (every >= 1 ? mmss(s) : `${mmss(s)}.${String(Math.round((s % 1) * 10) % 10)}`);
const MAX_PPS = 3000;
const ms = (x: number) => Math.round(x * 1000) / 1000;

export function createSpine(o: SpineOptions) {
  const canvas = h('canvas', { class: 'spine-canvas' });
  const zoomOut = h('button', { class: 'spine-zoom', 'aria-label': 'Zoom out', onclick: () => zoom(1 / 1.5) }, '−');
  const zoomIn = h('button', { class: 'spine-zoom', 'aria-label': 'Zoom in', onclick: () => zoom(1.5) }, '+');
  const el = h('div', { class: 'spine', dir: 'ltr', role: 'group', 'aria-label': 'Timeline' }, canvas, h('div', { class: 'spine-zooms' }, zoomOut, zoomIn));
  const screen = canvas.getContext('2d')!;
  let ctx = screen; // the drawing helpers draw here: the screen, or the cached track layer
  // The tracks are drawn once into a layer three screens wide and copied in; playing, panning and
  // scrubbing then only move the copy and the playhead (redrawn when the tracks change or the view
  // leaves the layer).
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d')!;
  let layerLeft = 0, layerPps = 0, layerW = 0, layerDpr = 0, layerH = 0;
  let peaks: Float32Array | null = null;
  /** Max-pyramid of the peaks: level k holds the loudest of each 2^k peaks (fast when zoomed out). */
  let levels: Float32Array[] = [];
  let peakRate = 50;
  let dirty = true; // something to draw
  let tracksDirty = true; // the tracks themselves changed
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
    pps = Math.min(MAX_PPS, Math.max(8, pps * f));
    left = s - (at - PAD) / pps;
    clampLeft();
    dirty = true;
  }

  const thumb = (src: string) => {
    let img = thumbs.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => (dirty = tracksDirty = true);
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

  /** Peak level per 2 ms of the reel's audio, for the waveform (fine enough to trim to the millisecond). */
  function setAudio(buf: AudioBuffer | null) {
    peaks = null;
    levels = [];
    dirty = tracksDirty = true;
    if (!buf) return;
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.round(buf.sampleRate / 500));
    peakRate = buf.sampleRate / step;
    const out = new Float32Array(Math.ceil(data.length / step));
    for (let i = 0; i < out.length; i++) {
      let m = 0;
      const end = Math.min(data.length, (i + 1) * step);
      for (let k = i * step; k < end; k += 2) m = Math.max(m, Math.abs(data[k]));
      out[i] = m;
    }
    let top = 0;
    for (const v of out) top = Math.max(top, v);
    if (top > 0) for (let i = 0; i < out.length; i++) out[i] /= top;
    peaks = out;
    levels = [out];
    for (let lv = out; lv.length > 1;) {
      const up = new Float32Array(Math.ceil(lv.length / 2));
      for (let i = 0; i < up.length; i++) up[i] = Math.max(lv[2 * i], lv[2 * i + 1] ?? 0);
      levels.push(up);
      lv = up;
    }
  }
  /** The loudest peak in [k0, k1): a few reads from the pyramid instead of a scan. */
  function peakMax(k0: number, k1: number): number {
    if (!peaks) return 0;
    k0 = Math.max(0, k0);
    k1 = Math.min(k1, peaks.length);
    let v = 0, lv = 0;
    while (k0 < k1) {
      // Climb while the block at k0 is aligned and fits; read it; move on.
      while (lv + 1 < levels.length && k0 % (1 << (lv + 1)) === 0 && k0 + (1 << (lv + 1)) <= k1) lv++;
      while (lv > 0 && (k0 % (1 << lv) !== 0 || k0 + (1 << lv) > k1)) lv--;
      const x = levels[lv][k0 >> lv];
      if (x > v) v = x;
      k0 += 1 << lv;
    }
    return v;
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
    const near = (s: number) => Math.abs(X(s) - x) <= HANDLE + 10;
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
        if (Math.abs(X(bl.a) + HANDLE / 2 - x) <= HANDLE + 6) return { kind: 'audio', index: sel.index, part: 'start' };
        if (Math.abs(X(bl.b) - HANDLE / 2 - x) <= HANDLE + 6) return { kind: 'audio', index: sel.index, part: 'end' };
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
      ctx.fillRect(x + HANDLE / 2 - 3, y + hh / 2 - 9, 2, 18);
      ctx.fillRect(x + HANDLE / 2 + 1, y + hh / 2 - 9, 2, 18);
    }
  }

  /** The tracks (ruler, scenes, recitation) into the current target, `w` px wide from `left`. */
  function drawTracks(tl: Timeline, w: number) {
    const D = tl.duration;
    const sel = o.selection();

    // Ruler: "00:00" labels with dots between (CapCut).
    ctx.fillStyle = '#8b929b';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const every = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30].find((e) => e * pps >= 60) ?? 30;
    const dot = every / (pps * every >= 100 ? 4 : 2);
    const s0 = Math.max(0, Math.floor(T(0) / dot) * dot), s1 = Math.min(D + every, T(w));
    for (let s = s0; s <= s1 + 1e-9; s += dot) {
      const x = X(s);
      const r = Math.round(s / dot) * dot;
      if (Math.abs(r / every - Math.round(r / every)) < 1e-6) {
        ctx.textAlign = r === 0 ? 'left' : 'center';
        ctx.fillText(rulerLabel(r, every), x, RULER / 2);
      } else ctx.fillRect(x - 1, RULER / 2 - 1, 2, 2);
    }
    ctx.textAlign = 'left';

    // Background scenes: thumbnails, transition markers, and the white + to add one.
    const ids = o.scenes();
    const scenes = sceneRects(tl);
    const moving = drag?.kind === 'scene-move' ? drag : null;
    scenes.forEach((s, i) => {
      const { x0, x1 } = s;
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
      handles(s.x0, s.x1, Y_SC, SCENES, sel.index > 0, sel.index < scenes.length - 1);
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
    audioBlocks().forEach(({ a: a0, b: a1, off }, i) => {
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
        ctx.beginPath();
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x += 2) {
          // The loudest peak under these 2 px (many peaks when zoomed out, part of one when zoomed in).
          const k0 = Math.floor((T(x) - off) * peakRate), k1 = Math.max(k0 + 1, Math.floor((T(x + 2) - off) * peakRate));
          const v = peakMax(k0, k1);
          const hh = Math.max(1, v * (AUDIO - 18));
          ctx.rect(x, mid - hh / 2, 1.5, hh);
        }
        ctx.fill();
      }
      // Faint marks where each recited word starts (only with word timings; never guessed: rule 8).
      const seq = tl.ayat[i]?.seq;
      if (seq) {
        ctx.fillStyle = 'rgba(255,255,255,.32)';
        let lastX = -1e9;
        for (const r of seq) {
          const wx = X(r[1] + off);
          if (wx - lastX < 5 || wx < x0 || wx > x1) continue;
          ctx.fillRect(wx - 0.5, Y_AU + AUDIO - 9, 1, 6);
          lastX = wx;
        }
      }
      const ay = o.plan()?.ayat[i];
      if (ay && sel?.kind === 'audio' && sel.index === i) {
        // Where the words begin and end: trimming stops there (words are never cut).
        ctx.fillStyle = 'rgba(255, 214, 110, .9)';
        for (const at of [ay.start, ay.last]) ctx.fillRect(X(at + off) - 0.5, Y_AU + 16, 1, AUDIO - 18);
      }
      ctx.restore();
      if (sel?.kind === 'audio' && sel.index === i) handles(x0, x1, Y_AU, AUDIO, true, true);
    });
  }

  /** Scene blocks in px (with a drag in progress applied). */
  function sceneRects(tl: Timeline) {
    const b = [0, ...sceneBounds(), tl.duration];
    const moving = drag?.kind === 'scene-move' ? drag : null;
    return tl.scenes.map((s, i) => {
      const dx = moving?.index === i ? moving.dt * pps : 0;
      return { ...s, start: b[i], end: b[i + 1], x0: X(b[i]) + 1 + dx, x1: X(b[i + 1]) - 1 + dx };
    });
  }

  /** What moves with the view: sticky labels, the drag readout, keyframes and the playhead. */
  function drawOverlay(tl: Timeline, w: number) {
    const sel = o.selection();
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px system-ui, sans-serif';
    sceneRects(tl).forEach((s, i) => {
      if (s.x1 < 0 || s.x0 > w) return;
      // More decimals as you zoom in or drag an edge (to the millisecond).
      const label = `${(s.end - s.start).toFixed(drag?.kind === 'scene-edge' || pps >= 400 ? 3 : pps >= 60 ? 2 : 1)}s`;
      const lw = ctx.measureText(label).width + 8;
      const lx = Math.max(s.x0, 0) + 4 + (sel?.kind === 'scene' && sel.index === i ? HANDLE : 0);
      if (lx + lw > s.x1) return;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      round(lx, Y_SC + 4, lw, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx + 4, Y_SC + 12);
    });
    const blocks = audioBlocks();
    ctx.textBaseline = 'top';
    blocks.forEach(({ a: a0, b: a1 }, i) => {
      const x0 = X(a0) + 1, x1 = X(a1) - 1;
      if (x1 < 0 || x0 > w || x1 <= x0) return;
      const pad = sel?.kind === 'audio' && sel.index === i ? HANDLE : 0;
      const lx = Math.max(x0, 0) + 5 + pad;
      if (lx + 24 > x1) return;
      ctx.fillStyle = '#fff';
      ctx.fillText(`${tl.surah.n}:${tl.ayat[i].ayah}`, lx, Y_AU + 4);
    });
    if (drag && (drag.kind === 'audio-head' || drag.kind === 'audio-tail' || drag.kind === 'audio-move')) {
      const bl = blocks[drag.index];
      // The silence left before the first word / after the last word (or the added pause), in ms.
      const ay = o.plan()?.ayat[drag.index];
      const msg = drag.kind === 'audio-move' ? `pause ${drag.gap.toFixed(3)} s`
        : drag.kind === 'audio-head' ? `silence before words ${ay ? (ay.start - bl.a).toFixed(3) : '–'} s${drag.head >= drag.trim.maxHead - 1e-3 ? ' · first word' : ''}`
          : `silence after words ${ay ? (bl.b - ay.last).toFixed(3) : '–'} s${drag.tail >= drag.trim.maxTail - 1e-3 ? ' · last word' : ''}`;
      ctx.font = '600 11px system-ui, sans-serif';
      const mw = ctx.measureText(msg).width + 12;
      const mx = Math.min(Math.max(4, X(drag.kind === 'audio-tail' ? bl.b : bl.a) - mw / 2), w - mw - 4);
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      round(mx, Y_AU + AUDIO + 6, mw, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(msg, mx + 6, Y_AU + AUDIO + 10);
    }
    // Keyframes of the layer being moved: gold diamonds under the ruler.
    for (const k of o.keys?.() ?? []) {
      const x = X(k);
      if (x < -6 || x > w + 6) continue;
      ctx.fillStyle = '#f2c46b';
      ctx.beginPath();
      ctx.moveTo(x, RULER - 6);
      ctx.lineTo(x + 5, RULER - 1);
      ctx.lineTo(x, RULER + 4);
      ctx.lineTo(x - 5, RULER - 1);
      ctx.closePath();
      ctx.fill();
    }
    // Playhead.
    const px = X(o.time());
    if (px >= 0 && px <= w) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 1, 2, 2, TRACKS + 6);
    }
  }

  function draw() {
    const tl = o.timeline();
    const w = Wc();
    const dpr = canvas.width / Math.max(1, w);
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    screen.clearRect(0, 0, w, height);
    if (!tl) return;
    if (!pps) pps = Math.min(90, Math.max(30, (w - PAD * 2 - 60) / tl.duration)); // fit a short reel
    // Redraw the cached tracks only when they changed or the view left them.
    const span = w / pps;
    const inside = left >= layerLeft - 1e-9 && (left - layerLeft) * pps + w <= layerW * 3 + 0.5;
    if (tracksDirty || pps !== layerPps || w !== layerW || dpr !== layerDpr || height !== layerH || !inside) {
      tracksDirty = false;
      layerPps = pps;
      layerW = w;
      layerDpr = dpr;
      layerH = height;
      layerLeft = Math.max(0, left - span);
      const lw = Math.round(w * 3 * dpr), lh = Math.round(height * dpr);
      if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; }
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w * 3, height);
      const keep = left;
      left = layerLeft;
      ctx = lctx;
      try { drawTracks(tl, w * 3); } finally { ctx = screen; left = keep; }
    }
    const sx = Math.round((left - layerLeft) * pps * dpr);
    screen.setTransform(1, 0, 0, 1, 0, 0);
    screen.drawImage(layer, sx, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay(tl, w);
  }

  // --- snapping (CapCut-style, with a light tick on phones that vibrate) ---
  let snapped = NaN;
  const buzz = (at: number) => {
    if (at !== snapped && !Number.isNaN(at)) navigator.vibrate?.(8);
    snapped = at;
  };
  /** Scrub time snapped to the nearest ayah or word start within SNAP_PX. */
  function snapScrub(tm: number): number {
    const tl = o.timeline();
    if (!tl) return tm;
    let best = SNAP_PX / pps, to = NaN;
    const take = (x: number) => { const d = Math.abs(x - tm); if (d < best) { best = d; to = x; } };
    take(0);
    for (const a of tl.ayat) {
      take(a.start);
      // Word starts only once zoomed in enough that words are apart (else every spot would snap).
      if (pps >= 60) for (const r of a.seq ?? []) take(r[1]);
    }
    buzz(to);
    return Number.isNaN(to) ? tm : to;
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
      snapped = NaN;
      o.seek(snapScrub(Math.min(Math.max(0, T(p.x)), dur())));
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const s = T(pinch.mid);
      pps = Math.min(MAX_PPS, Math.max(8, pinch.pps0 * (Math.abs(a - b) / pinch.d0)));
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
        o.seek(snapScrub(tm));
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
          buzz(best < 14 / pps ? snapTo : NaN);
        }
        bs[k] = ms(v);
        o.seek(bs[k]);
        break;
      }
      case 'scene-move':
        drag.dt = dx;
        break;
      case 'audio-head':
        drag.head = ms(Math.min(Math.max(drag.trim.head + dx, 0), drag.trim.maxHead));
        break;
      case 'audio-tail':
        drag.tail = ms(Math.min(Math.max(drag.trim.tail - dx, 0), drag.trim.maxTail));
        break;
      case 'audio-move':
        drag.gap = ms(Math.min(Math.max(drag.trim.gap + dx, 0), 10));
        break;
    }
    dirty = true;
    if (drag.kind !== 'scrub' && drag.kind !== 'pan') tracksDirty = true;
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
    dirty = tracksDirty = true;
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
    invalidate: () => (dirty = tracksDirty = true),
    /** Redraw the playhead and markers only (the tracks are unchanged). */
    refresh: () => (dirty = true),
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
