// The one pure render function: draws the frame at time t. Used by the live preview and the
// exporter alike, so preview = export. All coordinates are in logical 1080×1920 units; the caller
// sets the canvas transform for the output size.
import type { BackgroundMedia } from './backgrounds';
import { AR_LINE, boxes, EN_LINE, FONT_AR, FONT_EN, FONT_NAME, FONT_UI, H, SAFE, W } from './layout';
import type { Project } from './project';
import type { Timeline, TimedPage } from './timeline';

const ENTER = 0.45;
const EXIT = 0.25;

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

function pageAt(tl: Timeline, t: number): { page: TimedPage; ref: string } | null {
  for (const a of tl.ayat) {
    if (t >= a.start && t < a.end) {
      const page = a.pages.find((p) => t >= p.start && t < p.end) ?? a.pages[a.pages.length - 1];
      return { page, ref: a.ref };
    }
  }
  return null;
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

  // Ayah text, visible exactly while its recitation plays.
  const cur = pageAt(tl, t);
  if (cur) {
    const { page } = cur;
    const pin = clamp01((t - page.start) / ENTER);
    const pout = clamp01((page.end - t) / EXIT);
    const alpha = Math.min(easeOut(pin), pout);
    const dy = project.textEffect === 'rise' ? (1 - easeOut(pin)) * 36 : 0;
    // Arabic and translation are centred as one group inside the text area (layout guarantees fit).
    const b = boxes(project.showTranslation);
    const arH = page.ar.lines.length * page.ar.size * AR_LINE;
    const enH = page.en ? page.en.lines.length * page.en.size * EN_LINE : 0;
    const total = arH + (page.en ? b.en.top - b.ar.bottom : 0) + enH;
    const top = (b.ar.top + (page.en ? b.en.bottom : b.ar.bottom)) / 2 - total / 2 + dy;
    ctx.globalAlpha = alpha;
    ctx.direction = 'rtl';
    ctx.font = `${page.ar.size}px ${FONT_AR}`;
    drawLines(ctx, page.ar.lines, page.ar.size, AR_LINE, top);
    if (page.en) {
      ctx.direction = 'ltr';
      ctx.font = `${page.en.size}px ${FONT_EN}`;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      drawLines(ctx, page.en.lines, page.en.size, EN_LINE, top + total - enH);
      ctx.fillStyle = '#fff';
    }
    ctx.globalAlpha = 1;
  }

  // Footer: reciter credit + optional watermark.
  ctx.direction = 'ltr';
  ctx.font = `500 32px ${FONT_UI}`;
  ctx.globalAlpha = 0.92;
  ctx.fillText(`Recited by ${tl.reciter.name}`, W / 2, SAFE.y1 - (project.watermark ? 80 : 40));
  if (project.watermark) {
    ctx.font = `500 26px ${FONT_UI}`;
    ctx.globalAlpha = 0.6;
    ctx.fillText('Ayah Studio', W / 2, SAFE.y1 - 30);
  }
  ctx.restore();
}
