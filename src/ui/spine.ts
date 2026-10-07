// Recitation spine: the reel laid out from the left along the recitation — background scenes, the
// ayah text (with a tick per text step and the cards) and the recitation audio (waveform per ayah).
// Tap a block to select it; a selected block can be trimmed by its handles or dragged:
//   - scenes: drag an edge to resize (neighbours give way, min 1 s, optional snap to the reciter's
//     pauses), drag the block to reorder
//   - text: drag the end to set how long the ayah stays after its last word (its start is the first
//     recited word: rule 8, text never moves away from the recitation)
//   - audio: drag an ayah to lengthen or shorten the pause before it (only silence is ever cut)
// Drag the ruler to scrub, anywhere else to scroll; pinch, ctrl+wheel or −/+ to zoom.
import { backgroundById } from '../engine/backgrounds';
import { MIN_SILENCE, type ReelPlan } from '../engine/recitation';
import { MIN_SCENE, sceneSpans, snapPoints, type Transition } from '../engine/scenes';
import type { Timeline } from '../engine/timeline';
import { h } from './dom';

export type Selection = { kind: 'scene' | 'text' | 'audio'; index: number } | null;

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
  setHold: (index: number, seconds: number) => void;
  shiftAyah: (index: number, delta: number) => void;
}

const PAD = 14; // the reel starts this far from the left edge
const RULER = 22, SCENES = 44, TEXT = 30, AUDIO = 40, GAP = 5;
const Y_SC = RULER + GAP, Y_TX = Y_SC + SCENES + GAP, Y_AU = Y_TX + TEXT + GAP;
const HEIGHT = Y_AU + AUDIO + GAP;
const HANDLE = 12;

const thumbs = new Map<string, HTMLImageElement>();

type Hit =
  | { kind: 'ruler' }
  | { kind: 'scene' | 'text' | 'audio'; index: number; part: 'body' | 'start' | 'end' }
  | { kind: 'add' }
  | { kind: 'empty' };

type Drag =
  | { kind: 'scrub' }
  | { kind: 'pan'; left0: number }
  | { kind: 'scene-edge'; index: number; bounds: number[] } // index: boundary (between scene index and index+1)
  | { kind: 'scene-move'; index: number; dt: number }
  | { kind: 'text-end'; index: number; end: number }
  | { kind: 'audio-move'; index: number; delta: number };

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

  // --- geometry of the blocks (with the drag in progress applied) ---
  function sceneBounds(): number[] {
    if (drag?.kind === 'scene-edge') return drag.bounds;
    const tl = o.timeline()!;
    return tl.scenes.slice(1).map((s) => s.start);
  }
  /** Audio extent per ayah in reel time (from the arranged plan's pieces). */
  function audioBlocks(): [number, number][] {
    const p = o.plan();
    const tl = o.timeline()!;
    const out = p?.pieces ? p.pieces.map((x): [number, number] => [x.at, x.at + x.to - x.from])
      : tl.ayat.map((a, i): [number, number] => [i ? a.start - 0.2 : 0, i + 1 < tl.ayat.length ? tl.ayat[i + 1].start - 0.2 : tl.duration]);
    if (drag?.kind === 'audio-move') for (let i = drag.index; i < out.length; i++) out[i] = [out[i][0] + drag.delta, out[i][1] + drag.delta];
    return out;
  }
  function textEnd(i: number) {
    return drag?.kind === 'text-end' && drag.index === i ? drag.end : o.timeline()!.ayat[i].end;
  }

  function hit(x: number, y: number): Hit {
    const tl = o.timeline();
    if (!tl) return { kind: 'empty' };
    if (y < Y_SC - GAP / 2) return { kind: 'ruler' };
    const t = T(x);
    const sel = o.selection();
    const near = (s: number) => Math.abs(X(s) - x) <= HANDLE + 4;
    if (y < Y_TX - GAP / 2) {
      if (x >= X(tl.duration) + 6 && x <= X(tl.duration) + 6 + SCENES) return { kind: 'add' };
      const b = [0, ...sceneBounds(), tl.duration];
      if (sel?.kind === 'scene') {
        if (sel.index > 0 && near(b[sel.index])) return { kind: 'scene', index: sel.index, part: 'start' };
        if (sel.index < b.length - 2 && near(b[sel.index + 1])) return { kind: 'scene', index: sel.index, part: 'end' };
      }
      for (let i = 0; i + 1 < b.length; i++) if (t >= b[i] && t < b[i + 1]) return { kind: 'scene', index: i, part: 'body' };
      return { kind: 'empty' };
    }
    if (y < Y_AU - GAP / 2) {
      if (sel?.kind === 'text' && near(textEnd(sel.index))) return { kind: 'text', index: sel.index, part: 'end' };
      const i = tl.ayat.findIndex((a, k) => t >= a.start && t < textEnd(k));
      return i >= 0 ? { kind: 'text', index: i, part: 'body' } : { kind: 'empty' };
    }
    const blocks = audioBlocks();
    const i = blocks.findIndex(([a, b]) => t >= a && t < b);
    return i >= 0 ? { kind: 'audio', index: i, part: 'body' } : { kind: 'empty' };
  }

  function round(x: number, y: number, w: number, hh: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), hh, Math.min(r, Math.max(0, w) / 2));
  }
  function handles(x0: number, x1: number, y: number, hh: number, start: boolean, end: boolean) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    round(x0, y, x1 - x0, hh, 6);
    ctx.stroke();
    for (const [on, x] of [[start, x0], [end, x1 - HANDLE]] as [boolean, number][]) {
      if (!on) continue;
      ctx.fillStyle = '#fff';
      round(x, y, HANDLE, hh, 4);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.fillRect(x + HANDLE / 2 - 1, y + hh / 2 - 7, 2, 14);
    }
  }

  function draw() {
    const tl = o.timeline();
    const w = Wc();
    const dpr = canvas.width / Math.max(1, w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, HEIGHT);
    if (!tl) return;
    if (!pps) {
      // Fit the whole reel when it is short; otherwise ~40 px per second.
      pps = Math.min(90, Math.max(30, (w - PAD * 2 - 50) / tl.duration));
    }
    const t = o.time();
    const D = tl.duration;
    const accent = css('--accent'), text = css('--text'), muted = css('--muted'), line = css('--line');
    const sel = o.selection();

    // Ruler: a tick per second (or per 5 s when zoomed out), a label every 5 or 10 s.
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const step = pps < 14 ? 5 : 1, label = pps < 14 ? 30 : pps < 30 ? 10 : 5;
    const s0 = Math.max(0, Math.floor(T(0))), s1 = Math.min(Math.ceil(D), Math.ceil(T(w)));
    for (let s = s0 - (s0 % step); s <= s1; s += step) {
      const x = X(s);
      if (s % label === 0) {
        ctx.textAlign = s === 0 ? 'left' : 'center';
        ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x, 3);
        ctx.fillRect(x, 15, 1, 5);
      } else ctx.fillRect(x, 16, 1, 4);
    }

    ctx.textAlign = 'left';

    // Background scenes, with thumbnails, transition markers and a + to add one.
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
      round(x0, Y_SC, x1 - x0, SCENES, 6);
      ctx.clip();
      ctx.fillStyle = bg.kind === 'color' ? bg.color : '#222';
      ctx.fillRect(x0, Y_SC, x1 - x0, SCENES);
      const img = bg.kind !== 'color' ? thumb(bg.thumb) : null;
      if (img) {
        const tw = (SCENES * img.naturalWidth) / img.naturalHeight;
        for (let x = x0; x < x1; x += tw) if (x + tw > 0 && x < w) ctx.drawImage(img, x, Y_SC, tw, SCENES);
      }
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(x0, Y_SC + SCENES - 15, x1 - x0, 15);
      ctx.fillStyle = '#fff';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(`${bg.label} · ${(s.end - s.start).toFixed(1)}s`, Math.max(x0, 0) + 5 + (sel?.kind === 'scene' && sel.index === i ? HANDLE : 0), Y_SC + SCENES - 13);
      ctx.restore();
    });
    if (!moving) {
      for (const sp of sceneSpans(scenes, o.transition())) {
        if (sp.tOut <= 0) continue;
        const x = X(sp.end), y = Y_SC + 10;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.fill();
      }
    }
    if (sel?.kind === 'scene' && scenes[sel.index] && !moving) {
      const s = scenes[sel.index];
      handles(X(s.start) + 1, X(s.end) - 1, Y_SC, SCENES, sel.index > 0, sel.index < scenes.length - 1);
    }
    // + add a scene
    const ax = X(D) + 6;
    if (ax < w) {
      ctx.fillStyle = line;
      round(ax, Y_SC, SCENES, SCENES, 8);
      ctx.fill();
      ctx.fillStyle = text;
      ctx.font = '300 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', ax + SCENES / 2, Y_SC + SCENES / 2 + 1);
      ctx.textAlign = 'left';
    }

    // Ayah text (cards at either end), with a tick where each text step starts.
    ctx.textBaseline = 'middle';
    const block = (a: number, bEnd: number, label: string, fill: string, ink: string, y: number, hh: number) => {
      const x0 = X(a) + 1, x1 = X(bEnd) - 1;
      if (x1 < 0 || x0 > w || x1 <= x0) return false;
      ctx.fillStyle = fill;
      round(x0, y, x1 - x0, hh, 6);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = ink;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(label, Math.max(x0, 0) + 6, y + (hh < 34 ? hh / 2 : 10));
      ctx.restore();
      return true;
    };
    if (tl.intro > 0) block(0, tl.intro, 'Intro card', line, text, Y_TX, TEXT);
    if (tl.outro > 0) block(D - tl.outro, D, 'Closing card', line, text, Y_TX, TEXT);
    tl.ayat.forEach((a, i) => {
      const end = textEnd(i);
      if (!block(a.start, end, `${tl.surah.n}:${a.ayah}`, accent, '#fff', Y_TX, TEXT)) return;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (const e of a.events.slice(1)) {
        const x = X(e.start);
        if (x > 0 && x < w && e.start < end) ctx.fillRect(x - 0.5, Y_TX + 6, 1, TEXT - 12);
      }
      if (sel?.kind === 'text' && sel.index === i) handles(X(a.start) + 1, X(end) - 1, Y_TX, TEXT, false, true);
    });

    // Recitation audio: one block per ayah with its waveform.
    const ab = audioBlocks();
    ab.forEach(([a0, a1], i) => {
      const x0 = X(a0) + 1, x1 = X(a1) - 1;
      if (x1 < 0 || x0 > w || x1 <= x0) return;
      ctx.save();
      ctx.fillStyle = '#23463f';
      round(x0, Y_AU, x1 - x0, AUDIO, 6);
      ctx.fill();
      ctx.clip();
      if (peaks) {
        ctx.fillStyle = '#7fd8c2';
        const mid = Y_AU + AUDIO / 2 + 5;
        // The waveform of the committed audio, moved with the block while it is dragged.
        const off = drag?.kind === 'audio-move' && i >= drag.index ? drag.delta : 0;
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x += 2) {
          const s = T(x) - off;
          const v = peaks[Math.floor(s * peakRate)] ?? 0;
          const hh = Math.max(1, v * (AUDIO - 16));
          ctx.fillRect(x, mid - hh / 2, 1.5, hh);
        }
      }
      ctx.fillStyle = '#fff';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`♪ ${tl.surah.n}:${tl.ayat[i].ayah}`, Math.max(x0, 0) + 5, Y_AU + 3);
      ctx.restore();
      if (sel?.kind === 'audio' && sel.index === i) handles(x0, x1, Y_AU, AUDIO, false, false);
    });
    if (drag?.kind === 'audio-move') {
      const [a0] = ab[drag.index];
      ctx.fillStyle = text;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      const sgn = drag.delta >= 0 ? '+' : '−';
      ctx.fillText(`pause ${sgn}${Math.abs(drag.delta).toFixed(1)} s`, Math.max(4, X(a0) - 40), Y_AU - 1);
    }

    // Playhead.
    const px = X(t);
    if (px >= 0 && px <= w) {
      ctx.fillStyle = text;
      ctx.fillRect(px - 1, 0, 2, HEIGHT);
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px, 8);
      ctx.fill();
    }
  }

  // --- pointer handling ---
  const local = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function startDrag(hitAt: Hit): Drag {
    const tl = o.timeline()!;
    if (hitAt.kind === 'ruler') return { kind: 'scrub' };
    if (hitAt.kind === 'scene' && hitAt.part !== 'body') {
      return { kind: 'scene-edge', index: hitAt.part === 'start' ? hitAt.index - 1 : hitAt.index, bounds: tl.scenes.slice(1).map((s) => s.start) };
    }
    const sel = o.selection();
    const selected = hitAt.kind !== 'empty' && hitAt.kind !== 'add' && sel?.kind === hitAt.kind && sel.index === hitAt.index;
    if (hitAt.kind === 'scene' && selected && tl.scenes.length > 1) return { kind: 'scene-move', index: hitAt.index, dt: 0 };
    if (hitAt.kind === 'text' && hitAt.part === 'end') return { kind: 'text-end', index: hitAt.index, end: tl.ayat[hitAt.index].end };
    if (hitAt.kind === 'audio' && selected && hitAt.index > 0) return { kind: 'audio-move', index: hitAt.index, delta: 0 };
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
    drag.moved = true;
    const now = performance.now();
    drag.v = (p.x - drag.lastX) / Math.max(1, now - drag.lastT);
    drag.lastX = p.x;
    drag.lastT = now;
    const tl = o.timeline()!;
    const plan = o.plan();
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
          let best = Infinity;
          for (const s of snapPoints(plan.ayat)) if (s >= lo && s <= hi && Math.abs(s - v) < best) best = Math.abs(s - v), v = best * pps <= 14 ? s : v;
        }
        bs[k] = v;
        o.seek(v);
        break;
      }
      case 'scene-move':
        drag.dt = (p.x - drag.x0) / pps;
        break;
      case 'text-end': {
        const i = drag.index;
        const last = plan?.ayat[i]?.last ?? tl.ayat[i].start;
        const limit = i + 1 < tl.ayat.length ? tl.ayat[i + 1].start - 0.15 : tl.duration - tl.outro - 0.2;
        drag.end = Math.min(Math.max(tm, Math.min(last, limit)), limit);
        o.seek(Math.max(tl.ayat[i].start, drag.end - 0.05));
        break;
      }
      case 'audio-move': {
        // The pause before the ayah: down to MIN_SILENCE of silence on each side (only silence is
        // cut, never a word), up to 10 s more.
        const i = drag.index;
        const silence = plan ? plan.ayat[i].start - plan.ayat[i - 1].last : 0;
        drag.delta = Math.min(Math.max((p.x - drag.x0) / pps, -Math.max(0, silence - 2 * MIN_SILENCE)), 10);
        break;
      }
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
      const hAt = hit(d.x0, d.y0);
      if (hAt.kind === 'add') return o.addScene();
      if (hAt.kind === 'scene' || hAt.kind === 'text' || hAt.kind === 'audio') {
        const sel = o.selection();
        o.select(sel?.kind === hAt.kind && sel.index === hAt.index ? null : { kind: hAt.kind, index: hAt.index });
      } else if (hAt.kind === 'empty') o.select(null);
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
      case 'text-end': {
        const last = o.plan()?.ayat[d.index]?.last ?? tl.ayat[d.index].start;
        return o.setHold(d.index, Math.max(0, d.end - last));
      }
      case 'audio-move':
        if (Math.abs(d.delta) > 0.02) o.shiftAyah(d.index, d.delta);
        return;
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
        left = t - (Wc() / 3) / pps;
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
