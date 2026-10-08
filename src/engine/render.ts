// The one pure render function: draws the frame at time t. Used by the live preview and the
// exporter alike, so preview = export. All coordinates are in logical 1080×1920 units; the caller
// sets the canvas transform for the output size.
import type { BackgroundMedia } from './backgrounds';
import { drawText, setTextShadow } from './effects';
import { drawScenes, sceneSpans } from './scenes';
import { AR_LINE, EN_LINE, FONT_AR, FONT_EN, FONT_NAME, FONT_UI, H, TITLE_SIZES, titleBlock, W, type Fit } from './layout';
import { GRADES, SCRIM_STRENGTH } from './moods';
import type { Project } from './project';
import { reference } from '../data/quran';
import { reciterCredit } from '../data/reciters';
import type { Timeline, TimedAyah } from './timeline';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Where the text block sits in its free space (0 top … 1 bottom). */
const TEXT_POS = { upper: 0.2, center: 0.5, lower: 0.8 } as const;

function drawGrade(ctx: CanvasRenderingContext2D, grade: Project['grade']) {
  for (const [op, color] of GRADES[grade]?.layers ?? []) {
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawScrim(ctx: CanvasRenderingContext2D, k: number) {
  // Legibility scrim (always on, rule 6): overall darken plus deeper bands behind header, text and footer.
  const a = (x: number) => `rgba(0,0,0,${Math.min(0.9, x * k).toFixed(3)})`;
  ctx.fillStyle = a(0.22);
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a(0.45));
  g.addColorStop(0.16, a(0.05));
  g.addColorStop(0.3, a(0.25));
  g.addColorStop(0.7, a(0.25));
  g.addColorStop(0.86, a(0.05));
  g.addColorStop(1, a(0.5));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function ayahAt(tl: Timeline, t: number): TimedAyah | null {
  return tl.ayat.find((a) => t >= a.start && t < a.end) ?? null;
}

const itemAt = <T extends { start: number; end: number }>(items: T[], t: number) => items.find((g) => t >= g.start && t < g.end) ?? null;

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

/** Opacity of the intro card (fully shown on the first frame, gone before the recitation) or the closing card. */
function cardAt(tl: Timeline, t: number): { kind: 'intro' | 'outro'; alpha: number } | null {
  if (tl.intro > 0 && t < tl.intro) return { kind: 'intro', alpha: smooth(clamp01((tl.intro - 0.15 - t) / 0.7)) };
  const s = tl.duration - tl.outro;
  if (tl.outro > 0 && t >= s) return { kind: 'outro', alpha: easeOut(clamp01((t - s) / 0.9)) };
  return null;
}

/** Intro title card / closing reference card, centred in the frame. */
function drawCard(ctx: CanvasRenderingContext2D, kind: 'intro' | 'outro', alpha: number, project: Project, tl: Timeline) {
  const c = project.colors.title;
  const ref = reference(tl.surah, tl.ayat[0].ayah, tl.ayat[tl.ayat.length - 1].ayah);
  const intro = kind === 'intro';
  const cy = H * 0.46 + (intro ? 0 : (1 - alpha) * 16);
  setTextShadow(ctx, c);
  ctx.fillStyle = c;
  ctx.globalAlpha = alpha;
  ctx.direction = 'rtl';
  ctx.font = `${intro ? 104 : 84}px ${FONT_NAME}`;
  ctx.fillText(tl.surah.ar, W / 2, cy - (intro ? 80 : 70));
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillRect(W / 2 - 110, cy - 1, 220, 2);
  ctx.restore();
  ctx.direction = 'ltr';
  ctx.font = `500 ${intro ? 46 : 44}px ${FONT_UI}`;
  ctx.fillText(ref, W / 2, cy + 60);
  const notes: string[] = [];
  if (intro) notes.push(tl.surah.tr);
  if (project.credit) notes.push(`Recited by ${reciterCredit(tl.reciter)}`);
  if (!intro && project.showTranslation) notes.push(project.translationMode === 'words' ? 'Word meanings: Quran.com' : 'Translation: Sahih International');
  ctx.globalAlpha = alpha * 0.85;
  notes.forEach((x, i) => {
    ctx.font = i === 0 && intro ? `italic 36px ${FONT_EN}` : `500 32px ${FONT_UI}`;
    ctx.fillText(x, W / 2, cy + 125 + i * 54);
  });
  if (!intro && project.closing) drawClosing(ctx, project.closing, cy + 125 + notes.length * 54 + 40, alpha);
  ctx.globalAlpha = 1;
}

/** Words → lines no wider than `max` (a single over-long word gets its own line). */
function wrap(ctx: CanvasRenderingContext2D, words: string[], max: number, sep = ' '): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line}${sep}${w}` : w;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The closing card's extra lines (Khatm reel): a title and the members' names, inside the title-safe
 *  area (rule 6), getting smaller as needed but never below a legible 24 px. User text, UI font. */
function drawClosing(ctx: CanvasRenderingContext2D, c: NonNullable<Project['closing']>, top: number, alpha: number) {
  const max = W * 0.84;
  const bottom = H * 0.95 - 20;
  for (let size = 38; size >= 24; size -= 2) {
    ctx.font = `italic ${size + 4}px ${FONT_EN}`;
    const title = c.title ? wrap(ctx, c.title.split(' '), max) : [];
    ctx.font = `500 ${size}px ${FONT_UI}`;
    const lh = size * 1.45;
    const fits = (names: string[]) => top + (title.length + names.length) * lh + (title.length && names.length ? lh * 0.5 : 0) <= bottom;
    let names = wrap(ctx, c.names, max, '  ·  ');
    if (!fits(names) && size > 24) continue;
    // Still too many at the smallest size: as many names as fit, then "and N more".
    for (let n = c.names.length - 1; !fits(names) && n > 0; n--) names = wrap(ctx, [...c.names.slice(0, n), `and ${c.names.length - n} more`], max, '  ·  ');
    let y = top + lh / 2;
    ctx.globalAlpha = alpha;
    ctx.font = `italic ${size + 4}px ${FONT_EN}`;
    for (const l of title) { ctx.fillText(l, W / 2, y); y += lh; }
    if (title.length) y += lh * 0.5;
    ctx.globalAlpha = alpha * 0.9;
    ctx.font = `500 ${size}px ${FONT_UI}`;
    for (const l of names) { ctx.fillText(l, W / 2, y); y += lh; }
    return;
  }
}

/** `media[i]` is the decoded background of `project.scenes[i]` (missing while loading: black). */
export function render(ctx: CanvasRenderingContext2D, t: number, project: Project, tl: Timeline, media: (BackgroundMedia | undefined)[]) {
  ctx.save();
  drawScenes(ctx, t, sceneSpans(tl.scenes, project.transition), project.transition, media);
  drawGrade(ctx, project.grade);
  drawScrim(ctx, SCRIM_STRENGTH[project.scrim] ?? 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const colors = project.colors;
  const fx = project.textEffect;
  const k = TEXT_POS[project.textPos] ?? 0.5;

  const lay = tl.layout;
  const ayah = ayahAt(tl, t);
  const ev = ayah ? itemAt(ayah.events, t) : null;
  const page = ayah && !ev?.en ? itemAt(ayah.enPages, t) : null;
  const en: (Fit & { start: number; end: number }) | null = ev?.en ? { ...ev.en, start: ev.start, end: ev.end } : page;
  const arH = (x: Fit) => x.lines.length * x.size * AR_LINE;
  const enH = (x: Fit) => x.lines.length * x.size * EN_LINE;
  const place = (top: number, bottom: number, h: number) => top + (bottom - top - h) * k;

  // Where the text goes. "Below": Arabic, translation and surah name are one block, the name last;
  // between ayat it keeps the place of the text last (or next) shown, so it never jumps. Otherwise
  // text that belongs together (Arabic + its own translation) is placed as one block.
  let arTop = 0, enTop = 0, titleTop = lay.title;
  if (project.titlePos === 'below') {
    const ref = ev ? { ar: ev.ar, en } : nearestText(tl, t);
    const T = titleBlock(project.titleSize, project.surahName !== false);
    const hA = arH(ref.ar), hE = ref.en ? enH(ref.en) + 30 : 0;
    arTop = place(lay.text.top, lay.title + T, hA + hE + 30 + T);
    enTop = arTop + hA + 30;
    titleTop = arTop + hA + hE + 30;
  } else if (ev && ev.en) {
    arTop = place(lay.ar.top, lay.en.bottom, arH(ev.ar) + 30 + enH(ev.en));
    enTop = arTop + arH(ev.ar) + 30;
  } else {
    if (ev) arTop = place(lay.ar.top, lay.ar.bottom, arH(ev.ar));
    if (en) enTop = place(lay.en.top, lay.en.bottom, enH(en));
  }

  // Ayah text: each event shows from its first recited word until the next (word-timed).
  if (ev) {
    setTextShadow(ctx, colors.ar);
    drawText(ctx, fx, ev, t, { lines: ev.ar.lines, size: ev.ar.size, lh: AR_LINE, top: arTop, font: FONT_AR, dir: 'rtl', color: colors.ar, opacity: 1 });
  }
  if (en) {
    // Synced meanings move with their words; a whole-ayah translation turns pages on its own timing.
    setTextShadow(ctx, colors.en);
    drawText(ctx, fx, en, t, { lines: en.lines, size: en.size, lh: EN_LINE, top: enTop, font: lay.enFont, dir: 'ltr', color: colors.en, opacity: 0.92 });
  }

  // Intro / closing card; the surah name + reference make way for it (the card shows the reference).
  const card = cardAt(tl, t);
  if (card) drawCard(ctx, card.kind, card.alpha, project, tl);
  const under = 1 - (card?.alpha ?? 0);

  // Surah name (optional) + reference (always visible, rule 2) at the chosen place and size.
  const z = TITLE_SIZES[project.titleSize];
  const nameH = project.surahName !== false ? z.name * 1.4 : 0;
  setTextShadow(ctx, colors.title);
  ctx.fillStyle = colors.title;
  ctx.globalAlpha = under;
  if (nameH) {
    ctx.direction = 'rtl';
    ctx.font = `${z.name}px ${FONT_NAME}`;
    ctx.fillText(tl.surah.ar, W / 2, titleTop + z.name * 0.7);
  }
  ctx.direction = 'ltr';
  ctx.font = `500 ${z.ref}px ${FONT_UI}`;
  ctx.globalAlpha = 0.9 * under;
  ctx.fillText(headerRef(tl, t), W / 2, titleTop + nameH + z.ref * 0.7);

  // Footer: optional reciter credit and watermark.
  if (lay.credit !== null) {
    ctx.font = `500 32px ${FONT_UI}`;
    ctx.globalAlpha = 0.92 * under;
    ctx.fillText(`Recited by ${reciterCredit(tl.reciter)}`, W / 2, lay.credit);
  }
  if (lay.watermark !== null) {
    setTextShadow(ctx, '#ffffff');
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 26px ${FONT_UI}`;
    ctx.globalAlpha = 0.6;
    ctx.fillText('Ayah Studio', W / 2, lay.watermark);
  }
  ctx.restore();
}
