// The one pure render function: draws the frame at time t. Used by the live preview and the
// exporter alike, so preview = export. All coordinates are in logical 1080×1920 units; the caller
// sets the canvas transform for the output size.
import type { BackgroundMedia } from './backgrounds';
import { AR_LINE, EN_LINE, FONT_AR, FONT_EN, FONT_NAME, FONT_UI, H, TITLE_SIZES, titleBlock, W, type Fit } from './layout';
import type { Project } from './project';
import { reciterCredit } from '../data/reciters';
import type { Timeline, TimedAyah } from './timeline';

const ENTER = 0.45; // text fades/rises in over this long (less for short groups)
const EXIT = 0.25;
const EN_ENTER = 0.6;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;

function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom = 1, panY = 0) {
  const s = Math.max(W / sw, H / sh) * zoom;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2 + panY, dw, dh);
}

function drawBackground(ctx: CanvasRenderingContext2D, t: number, tl: Timeline, media: BackgroundMedia) {
  const b = media.bg;
  ctx.fillStyle = b.kind === 'color' ? b.color : '#000';
  ctx.fillRect(0, 0, W, H);
  if (b.kind === 'image' && media.image) {
    // Gentle Ken Burns: slow zoom-in with a slight upward drift over the whole video.
    const p = clamp01(t / Math.max(tl.duration, 1));
    cover(ctx, media.image, media.image.width, media.image.height, 1.04 + 0.08 * p, -30 * p);
  } else if (b.kind === 'video' && media.video) {
    cover(ctx, media.video.canvas, media.video.canvas.width, media.video.canvas.height);
  } else if (b.kind === 'color') {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, H * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawScrim(ctx: CanvasRenderingContext2D) {
  // Legibility scrim: overall darken plus deeper bands behind header, text and footer.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.16, 'rgba(0,0,0,0.05)');
  g.addColorStop(0.3, 'rgba(0,0,0,0.25)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  g.addColorStop(0.86, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function ayahAt(tl: Timeline, t: number): TimedAyah | null {
  return tl.ayat.find((a) => t >= a.start && t < a.end) ?? null;
}

const itemAt = <T extends { start: number; end: number }>(items: T[], t: number) => items.find((g) => t >= g.start && t < g.end) ?? null;

/** Opacity and entry progress of a timed item: in after its start, out before its end. */
function fade(g: { start: number; end: number }, t: number, enter: number, exit: number) {
  const d = Math.max(0.001, g.end - g.start);
  const pin = easeOut(clamp01((t - g.start) / Math.min(enter, d * 0.4)));
  const pout = clamp01((g.end - t) / Math.min(exit, d * 0.25));
  return { alpha: Math.min(pin, pout), pin };
}

/** The text shown last before t (or the first text, before any), with its translation. */
function nearestText(tl: Timeline, t: number): { ar: Fit; en: Fit | null } {
  let best: { ar: Fit; en: Fit | null } | null = null;
  for (const a of tl.ayat) {
    for (const e of a.events) {
      if (best && e.start > t) return best;
      best = { ar: e.ar, en: e.en ?? itemAt(a.enPages, e.start) ?? a.enPages[0] ?? null };
    }
  }
  return best!;
}

/** Reference shown in the header: current ayah, or the nearest one during lead-in/gaps/tail. */
function headerRef(tl: Timeline, t: number): string {
  let ref = tl.ayat[0].ref;
  for (const a of tl.ayat) if (t >= a.start - 0.15) ref = a.ref;
  return ref;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], size: number, lh: number, top: number) {
  let y = top + (size * lh) / 2;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += size * lh;
  }
}

export function render(ctx: CanvasRenderingContext2D, t: number, project: Project, tl: Timeline, media: BackgroundMedia) {
  ctx.save();
  drawBackground(ctx, t, tl, media);
  drawScrim(ctx);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14;

  const lay = tl.layout;
  const ayah = ayahAt(tl, t);
  const ev = ayah ? itemAt(ayah.events, t) : null;
  const page = ayah && !ev?.en ? itemAt(ayah.enPages, t) : null;
  const en: (Fit & { start: number; end: number }) | null = ev?.en ? { ...ev.en, start: ev.start, end: ev.end } : page;
  const arH = (x: Fit) => x.lines.length * x.size * AR_LINE;
  const enH = (x: Fit) => x.lines.length * x.size * EN_LINE;

  // Where the text goes. "Below": Arabic, translation and surah name are one centred block, the name
  // last; between ayat it keeps the place of the text last (or next) shown, so it never jumps.
  // Otherwise text that belongs together (Arabic + its own translation) is centred as one block.
  let arTop = 0, enTop = 0, titleTop = lay.title;
  if (project.titlePos === 'below') {
    const ref = ev ? { ar: ev.ar, en } : nearestText(tl, t);
    const T = titleBlock(project.titleSize);
    const hA = arH(ref.ar), hE = ref.en ? enH(ref.en) + 30 : 0;
    arTop = (lay.text.top + lay.title + T) / 2 - (hA + hE + 30 + T) / 2;
    enTop = arTop + hA + 30;
    titleTop = arTop + hA + hE + 30;
  } else if (ev && ev.en) {
    const total = arH(ev.ar) + 30 + enH(ev.en);
    arTop = (lay.ar.top + lay.en.bottom) / 2 - total / 2;
    enTop = arTop + arH(ev.ar) + 30;
  } else {
    if (ev) arTop = (lay.ar.top + lay.ar.bottom) / 2 - arH(ev.ar) / 2;
    if (en) enTop = (lay.en.top + lay.en.bottom) / 2 - enH(en) / 2;
  }

  // Ayah text: each event shows from its first recited word until the next (word-timed).
  let dy = 0;
  if (ev) {
    const f = fade(ev, t, ENTER, EXIT);
    if (project.textEffect === 'rise') dy = (1 - f.pin) * 36 * Math.min(1, (ev.end - ev.start) / 1.5);
    ctx.globalAlpha = f.alpha;
    ctx.direction = 'rtl';
    ctx.font = `${ev.ar.size}px ${FONT_AR}`;
    drawLines(ctx, ev.ar.lines, ev.ar.size, AR_LINE, arTop + dy);
  }
  if (en) {
    // Synced meanings move with their words; a whole-ayah translation fades calmly with its page.
    const f = ev?.en ? fade(ev, t, ENTER, EXIT) : fade(en, t, EN_ENTER, EXIT);
    ctx.globalAlpha = f.alpha * 0.92;
    ctx.direction = 'ltr';
    ctx.font = `${en.size}px ${FONT_EN}`;
    drawLines(ctx, en.lines, en.size, EN_LINE, ev?.en ? enTop + dy : enTop);
  }
  ctx.globalAlpha = 1;

  // Surah name + reference (always visible, rule 2) at the chosen place and size.
  const z = TITLE_SIZES[project.titleSize];
  ctx.direction = 'rtl';
  ctx.font = `${z.name}px ${FONT_NAME}`;
  ctx.fillText(tl.surah.ar, W / 2, titleTop + z.name * 0.7);
  ctx.direction = 'ltr';
  ctx.font = `500 ${z.ref}px ${FONT_UI}`;
  ctx.globalAlpha = 0.9;
  ctx.fillText(headerRef(tl, t), W / 2, titleTop + z.name * 1.4 + z.ref * 0.7);

  // Footer: optional reciter credit and watermark.
  if (lay.credit !== null) {
    ctx.font = `500 32px ${FONT_UI}`;
    ctx.globalAlpha = 0.92;
    ctx.fillText(`Recited by ${reciterCredit(tl.reciter)}`, W / 2, lay.credit);
  }
  if (lay.watermark !== null) {
    ctx.font = `500 26px ${FONT_UI}`;
    ctx.globalAlpha = 0.6;
    ctx.fillText('Ayah Studio', W / 2, lay.watermark);
  }
  ctx.restore();
}
