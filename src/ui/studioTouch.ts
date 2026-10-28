// Touch the preview to move and scale (CapCut-style): a finger on the text moves the text block, a
// finger elsewhere moves the background; two fingers (or the mouse wheel) scale. When the layer has
// keyframes, each move sets the keyframe at the playhead. The renderer keeps the text legible and
// inside the frame's text area (rule 6), so a drag can never push it out or under the reference.
import { H, SAFE, W } from '../engine/layout';
import { placed, type Layer, type Pose } from '../engine/motion';
import type { Project } from '../engine/project';
import type { RenderInfo } from '../engine/render';

export interface TouchOptions {
  canvas: HTMLCanvasElement;
  project: () => Project;
  time: () => number;
  info: () => RenderInfo;
  /** Touch editing is possible now (a reel is loaded; not exporting, watching or picking a colour). */
  enabled: () => boolean;
  layer: () => Layer | null;
  select: (l: Layer | null) => void;
  onStart: () => void; // pause playback
  live: () => void; // redraw while moving
  done: () => void; // a move finished: record it
  hint: (what: 'bg-zoom') => void; // the background fills the frame: zoom in before it can move
}

export function attachTouch(o: TouchOptions) {
  const c = o.canvas;
  const pts = new Map<number, { x: number; y: number }>();
  // corner: resizing by a corner handle (distance from the box's centre); move: one finger or a pinch.
  let g: { layer: Layer; pose: Pose; x: number; y: number; d: number; moved: boolean; corner?: { cx: number; cy: number; d0: number } } | null = null;
  let centred = false; // the text sits on the frame's vertical centre line (snapped)
  /** Frame units per CSS pixel (handles and snaps are sized for a thumb, not for the frame). */
  const unit = () => W / Math.max(1, c.getBoundingClientRect().width);
  const boxOf = (l: Layer) => (l === 'text' ? o.info().text : { x0: 0, y0: 0, x1: W, y1: H });
  /** A corner handle of the selected layer under the finger. */
  const cornerAt = (x: number, y: number) => {
    const l = o.layer();
    const b = l && boxOf(l);
    if (!l || !b) return null;
    const tol = 26 * unit();
    for (const [cx, cy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      if (Math.hypot(x - cx, y - cy) <= tol) {
        const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
        return { layer: l, cx: mx, cy: my, d0: Math.max(1, Math.hypot(x - mx, y - my)) };
      }
    }
    return null;
  };

  const frameXY = (e: PointerEvent | WheelEvent) => {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const layerAt = (x: number, y: number): Layer => {
    const b = o.info().text;
    return b && x >= b.x0 - 24 && x <= b.x1 + 24 && y >= b.y0 - 24 && y <= b.y1 + 24 ? 'text' : 'bg';
  };
  const shown = (l: Layer) => (l === 'text' ? o.info().textPose : o.info().bgPose);
  const centre = () => {
    const [a, b] = [...pts.values()];
    return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) } : { ...a, d: 0 };
  };
  /** Start (or restart, when a finger is added or lifted) from the pose on screen now. */
  const begin = (layer: Layer, moved: boolean) => {
    const m = centre();
    g = { layer, pose: { ...shown(layer) }, x: m.x, y: m.y, d: m.d, moved };
  };
  let bgHint = false;
  const apply = (layer: Layer, raw: Pose) => {
    // Keep what is drawn: the text legible and inside its area, the background covering the frame.
    // The text snaps to the frame's centre line (a light tick on phones that vibrate).
    const near = layer === 'text' && Math.abs(raw.x) < 14 * unit();
    if (near !== centred) { centred = near; if (near) navigator.vibrate?.(8); }
    const p = layer === 'text' ? o.info().fitText(near ? { ...raw, x: 0 } : raw) : o.info().fitBg(raw);
    if (layer === 'bg' && p.s < 1.001 && Math.hypot(raw.x, raw.y) > 40 && !bgHint) {
      bgHint = true;
      o.hint('bg-zoom');
    }
    const pr = o.project();
    pr.motion = { ...pr.motion, [layer]: placed(pr.motion?.[layer], o.time(), p) };
    o.live();
  };

  c.addEventListener('pointerdown', (e) => {
    if (!o.enabled()) return;
    const at = frameXY(e);
    pts.set(e.pointerId, at);
    c.setPointerCapture(e.pointerId);
    if (pts.size === 1) {
      const k = cornerAt(at.x, at.y);
      if (k) {
        begin(k.layer, false);
        g!.corner = { cx: k.cx, cy: k.cy, d0: k.d0 };
        return;
      }
      // A finger on the selected layer keeps it; otherwise the layer under the finger.
      const sel = o.layer();
      const under = layerAt(at.x, at.y);
      begin(sel === 'bg' && under === 'bg' ? 'bg' : under, false);
    } else if (g) begin(g.layer, g.moved);
  });
  c.addEventListener('pointermove', (e) => {
    if (!g || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, frameXY(e));
    const m = centre();
    const dx = m.x - g.x, dy = m.y - g.y;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 12 && pts.size < 2) return;
      g.moved = true;
      o.onStart();
      if (o.layer() !== g.layer) o.select(g.layer);
    }
    if (g.corner && pts.size === 1) {
      // Corner handle: scale about the box's centre by how far the finger is from it.
      const k = Math.hypot(m.x - g.corner.cx, m.y - g.corner.cy) / g.corner.d0;
      return apply(g.layer, { ...g.pose, s: g.pose.s * k });
    }
    const s = pts.size > 1 && g.d > 0 ? g.pose.s * (m.d / g.d) : g.pose.s;
    apply(g.layer, { x: g.pose.x + dx, y: g.pose.y + dy, s });
  });
  const end = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId) || !g) return;
    if (pts.size) return begin(g.layer, g.moved); // one finger left: carry on moving with it
    const was = g;
    g = null;
    centred = false;
    if (was.moved) o.done();
    else o.select(o.layer() === was.layer ? null : was.layer); // a tap selects (or lets go of) a layer
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  // Desktop: the wheel scales the selected layer (or the one under the pointer).
  let wheelTimer = 0;
  c.addEventListener('wheel', (e) => {
    if (!o.enabled()) return;
    e.preventDefault();
    const at = frameXY(e);
    const layer = o.layer() ?? layerAt(at.x, at.y);
    if (o.layer() !== layer) o.select(layer);
    o.onStart();
    const p = shown(layer);
    apply(layer, { ...p, s: p.s * (e.deltaY < 0 ? 1.04 : 1 / 1.04) });
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => o.done(), 300);
  }, { passive: false });

  return {
    /** While something is being moved: show the guides (safe area, centre line). */
    guides: () => (g?.moved ? { layer: g.layer, centred } : null),
  };
}

/** Guides while moving (preview only): the title-safe area the text keeps to, and the centre line. */
export function drawGuides(ctx: CanvasRenderingContext2D, centred: boolean) {
  const px = (devicePixelRatio || 1) / (Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1);
  ctx.save();
  ctx.lineWidth = 1 * px;
  ctx.setLineDash([6 * px, 6 * px]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(SAFE.x0, SAFE.y0, SAFE.x1 - SAFE.x0, SAFE.y1 - SAFE.y0);
  ctx.setLineDash([]);
  ctx.strokeStyle = centred ? 'rgba(242,196,107,0.95)' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = (centred ? 2 : 1) * px;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.restore();
}

/** The selection frame drawn over the preview only (never exported). */
export function drawSelection(ctx: CanvasRenderingContext2D, layer: Layer, info: RenderInfo) {
  const px = (devicePixelRatio || 1) / (Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1); // one CSS pixel
  const r = layer === 'text' ? info.text : { x0: 0, y0: 0, x1: W, y1: H };
  if (!r) return;
  const inset = layer === 'bg' ? 3 * px : 0;
  ctx.save();
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.setLineDash([6 * px, 4 * px]);
  ctx.strokeRect(r.x0 + inset, r.y0 + inset, r.x1 - r.x0 - 2 * inset, r.y1 - r.y0 - 2 * inset);
  ctx.setLineDash([]);
  // Corner handles (drag one to resize), a thumb's reach around each.
  ctx.fillStyle = '#fff';
  const k = 6 * px, pad = layer === 'bg' ? k + 3 * px : 0;
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
    ctx.beginPath();
    ctx.arc(x + (x === r.x0 ? pad : -pad), y + (y === r.y0 ? pad : -pad), k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
