// The one pure render function: draws the frame at time t. Used by the live preview and the
// exporter alike, so preview = export. All coordinates are in logical 1080×1920 units; the caller
// sets the canvas transform for the output size.
import type { BackgroundMedia } from './backgrounds';
import { AR_LINE, boxes, EN_LINE, FONT_AR, FONT_EN, FONT_NAME, FONT_UI, H, SAFE, W } from './layout';
import type { Project } from './project';
import { reciterCredit } from '../data/reciters';
import type { Timeline, TimedAyah, TimedText } from './timeline';

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

const itemAt = (items: TimedText[], t: number) => items.find((g) => t >= g.start && t < g.end) ?? null;

/** Opacity and entry progress of a timed item: in after its start, out before its end. */
function fade(g: { start: number; end: number }, t: number, enter: number, exit: number) {
  const d = Math.max(0.001, g.end - g.start);
  const pin = easeOut(clamp01((t - g.start) / Math.min(enter, d * 0.4)));
  const pout = clamp01((g.end - t) / Math.min(exit, d * 0.25));
  return { alpha: Math.min(pin, pout), pin };
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

  // Header: surah name + reference (always visible).
  ctx.direction = 'rtl';
  ctx.font = `54px ${FONT_NAME}`;
  ctx.fillText(tl.surah.ar, W / 2, SAFE.y0 + 70);
  ctx.direction = 'ltr';
  ctx.font = `500 36px ${FONT_UI}`;
  ctx.globalAlpha = 0.9;
  ctx.fillText(headerRef(tl, t), W / 2, SAFE.y0 + 150);
  ctx.globalAlpha = 1;

  // Ayah text: each group shows from its first word until the next group (word-timed).
  const ayah = ayahAt(tl, t);
  if (ayah) {
    const b = boxes(project.showTranslation);
    const g = itemAt(ayah.ar, t);
    const en = itemAt(ayah.en, t);
    const arH = (x: TimedText) => x.lines.length * x.size * AR_LINE;
    const enH = (x: TimedText) => x.lines.length * x.size * EN_LINE;
    let arTop = 0, enTop = 0;
    if (ayah.joint && g) {
      // Ayah mode: Arabic and translation are centred as one block (layout guarantees fit).
      const k = ayah.ar.indexOf(g);
      const pair = ayah.en[k];
      const total = arH(g) + (pair ? b.en.top - b.ar.bottom + enH(pair) : 0);
      arTop = (b.ar.top + (pair ? b.en.bottom : b.ar.bottom)) / 2 - total / 2;
      if (pair) enTop = arTop + total - enH(pair);
    } else {
      if (g) arTop = (b.ar.top + b.ar.bottom) / 2 - arH(g) / 2;
      if (en) enTop = (b.en.top + b.en.bottom) / 2 - enH(en) / 2;
    }
    let dy = 0;
    if (g) {
      const f = fade(g, t, ENTER, EXIT);
      if (project.textEffect === 'rise') dy = (1 - f.pin) * 36 * Math.min(1, (g.end - g.start) / 1.5);
      ctx.globalAlpha = f.alpha;
      ctx.direction = 'rtl';
      ctx.font = `${g.size}px ${FONT_AR}`;
      drawLines(ctx, g.lines, g.size, AR_LINE, arTop + dy);
    }
    if (en) {
      // The translation is calm: it fades with its page (the whole ayah unless it is long).
      const f = ayah.joint && g ? fade(g, t, ENTER, EXIT) : fade(en, t, EN_ENTER, EXIT);
      ctx.globalAlpha = f.alpha * 0.92;
      ctx.direction = 'ltr';
      ctx.font = `${en.size}px ${FONT_EN}`;
      drawLines(ctx, en.lines, en.size, EN_LINE, ayah.joint ? enTop + dy : enTop);
    }
    ctx.globalAlpha = 1;
  }

  // Footer: reciter credit + optional watermark.
  ctx.direction = 'ltr';
  ctx.font = `500 32px ${FONT_UI}`;
  ctx.globalAlpha = 0.92;
  ctx.fillText(`Recited by ${reciterCredit(tl.reciter)}`, W / 2, SAFE.y1 - (project.watermark ? 80 : 40));
  if (project.watermark) {
    ctx.font = `500 26px ${FONT_UI}`;
    ctx.globalAlpha = 0.6;
    ctx.fillText('Ayah Studio', W / 2, SAFE.y1 - 30);
  }
  ctx.restore();
}
