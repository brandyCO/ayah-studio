// The one pure render function: draws the frame at time t. Used by the live preview and the
// exporter alike, so preview = export. All coordinates are in logical 1080×1920 units; the caller
// sets the canvas transform for the output size.
import type { BackgroundMedia } from './backgrounds';
import { drawText, setTextShadow, type Highlight } from './effects';
import { drawScenes, sceneSpans } from './scenes';
import { tajweedLines } from './tajweed';
import { breathAt, darken, drift, shade, soften } from './cinema';
import { AR_LINE, AR_SIZE_MIN, EN_LINE, EN_MIN, FONT_AR, FONT_EN, FONT_NAME, FONT_UI, H, SAFE, setFrame, TITLE_SIZES, titleBlock, W, type Fit } from './layout';
import { knockedLogo, logoImage, markFx, markPose, markShown, MARK_FONT, type Mark } from './mark';
import { fitBgPose, fitTextPose, IDENTITY, poseAt, type Pose, type Rect } from './motion';
import { GRADES, SCRIM_STRENGTH } from './moods';
import type { Project } from './project';
import { reference } from '../data/quran';
import { reciterCredit } from '../data/reciters';
import type { TimedNote } from './segments';
import type { Timeline, TimedAyah, TimedEvent } from './timeline';

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

/** Vignette: the frame's edges darken softly (over the background, under the text). */
function drawVignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Film grain: a fixed noise tile moved to a new place 12 times a second (pure in t, so preview = export). */
let grainTile: HTMLCanvasElement | null = null;
function drawGrain(ctx: CanvasRenderingContext2D, t: number) {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 256;
    const g = grainTile.getContext('2d')!;
    const img = g.createImageData(256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const step = Math.floor(t * 12);
  const ox = -((step * 97) % 256), oy = -((step * 57) % 256);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.07;
  const pat = ctx.createPattern(grainTile, 'repeat')!;
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(-ox, -oy, W, H);
  ctx.restore();
}

/** The word being recited at t inside event ev, placed on its line (null between words or without timings: rule 8). */
function highlightAt(a: TimedAyah, ev: TimedEvent, t: number, color: string): Highlight | null {
  if (!a.seq || !ev.ar.counts) return null;
  let cur: [number, number, number] | null = null;
  for (const r of a.seq) {
    if (r[1] > t) break;
    cur = r;
  }
  // A word stays lit through a short breath after it, then goes out until the next word.
  if (!cur || cur[0] < ev.first || cur[0] > ev.last || (cur[2] > cur[1] && t > cur[2] + 0.35)) return null;
  let at = ev.first;
  for (let line = 0; line < ev.ar.counts.length; line++) {
    const n = ev.ar.counts[line];
    if (cur[0] < at + n) {
      return { line, before: a.words.slice(at, cur[0]).join(' '), word: a.words[cur[0]], color, alpha: Math.min(1, (t - cur[1]) / 0.12) };
    }
    at += n;
  }
  return null;
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

/** Ayah whose surah name + reference the header shows: the current one, or the nearest during lead-in/gaps/tail. */
function headerAyah(tl: Timeline, t: number): TimedAyah {
  let cur = tl.ayat[0];
  for (const a of tl.ayat) if (t >= a.start - 0.15) cur = a;
  return cur;
}

/** Multi-segment reels: the note card at t (a guest's name and dua) with its opacity. */
function noteAt(tl: Timeline, t: number): { note: TimedNote; alpha: number } | null {
  const n = tl.notes.find((x) => t >= x.start && t < x.end);
  return n ? { note: n, alpha: smooth(clamp01(Math.min((t - n.start) / 0.6, (n.end - t) / 0.6))) } : null;
}

/** A note card: the guest's name, the ayah they chose, and their dua as their own words — UI fonts,
 *  quoted and attributed, never like the ayah. */
function drawNote(ctx: CanvasRenderingContext2D, n: TimedNote, alpha: number, project: Project) {
  const c = project.colors.title;
  setTextShadow(ctx, c);
  ctx.fillStyle = c;
  ctx.direction = 'ltr';
  const max = W * 0.8;
  ctx.font = `italic 46px ${FONT_EN}`;
  const dua = n.dua ? wrap(ctx, `“${n.dua}”`.split(' '), max) : [];
  const h = 70 + 56 + (dua.length ? 60 + dua.length * 64 + 60 : 0);
  let y = H * 0.47 - h / 2 + (1 - alpha) * 12;
  ctx.globalAlpha = alpha;
  ctx.font = `600 64px ${FONT_UI}`;
  ctx.fillText(n.name, W / 2, y + 35, max);
  ctx.globalAlpha = alpha * 0.85;
  ctx.font = `500 34px ${FONT_UI}`;
  ctx.fillText(`chose ${n.ref}`, W / 2, y + 70 + 28, max);
  y += 126;
  if (dua.length) {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillRect(W / 2 - 80, y + 29, 160, 2);
    ctx.restore();
    y += 60;
    ctx.globalAlpha = alpha;
    ctx.font = `italic 46px ${FONT_EN}`;
    for (const l of dua) { ctx.fillText(l, W / 2, y + 32); y += 64; }
    ctx.globalAlpha = alpha * 0.75;
    ctx.font = `500 28px ${FONT_UI}`;
    ctx.fillText(`a dua in ${n.name}’s own words`, W / 2, y + 40, max);
  }
  ctx.globalAlpha = 1;
}

/** Opacity of the ending: its lines fade in once the ayah has left (the quiet time after the last word). */
function cardAt(tl: Timeline, t: number): { kind: 'outro'; alpha: number } | null {
  const s = tl.duration - tl.outro;
  if (tl.outro > 0 && t >= s) return { kind: 'outro', alpha: easeOut(clamp01((t - s) / 0.9)) };
  return null;
}

/** The ending's lines, centred over the background; the surah name + reference stay in their place
 *  (rule 2). Several surahs (a segmented reel): the reel's title (and date) instead. */
function drawCard(ctx: CanvasRenderingContext2D, alpha: number, project: Project, tl: Timeline) {
  const c = project.colors.title;
  if (tl.segmented) {
    setTextShadow(ctx, c);
    ctx.fillStyle = c;
    ctx.direction = 'ltr';
    const cl = project.closing;
    if (cl) {
      ctx.font = `italic 68px ${FONT_EN}`;
      const title = wrap(ctx, cl.title.split(' '), W * 0.8);
      const lh = 88;
      let y = H * 0.46 - ((title.length + cl.names.length * 0.7) * lh) / 2 + (1 - alpha) * 16;
      ctx.globalAlpha = alpha;
      for (const l of title) { ctx.fillText(l, W / 2, y + lh / 2); y += lh; }
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillRect(W / 2 - 90, y + 14, 180, 2);
      ctx.restore();
      y += 30;
      ctx.globalAlpha = alpha * 0.85;
      ctx.font = `500 38px ${FONT_UI}`;
      for (const n of cl.names) { ctx.fillText(n, W / 2, y + 30, W * 0.84); y += lh * 0.7; }
    }
    ctx.globalAlpha = 1;
    return;
  }
  const top = H * 0.4 + (1 - alpha) * 16;
  setTextShadow(ctx, c);
  ctx.fillStyle = c;
  ctx.direction = 'ltr';
  const notes: string[] = [];
  if (project.series) notes.push(`Part ${project.series.part} of ${project.series.of}`);
  if (project.showTranslation) notes.push(project.translationMode === 'words' ? 'Word meanings: Quran.com' : `Translation: ${tl.translation.credit}`);
  ctx.globalAlpha = alpha * 0.85;
  ctx.font = `500 32px ${FONT_UI}`;
  notes.forEach((x, i) => ctx.fillText(x, W / 2, top + i * 54));
  const closing = project.closing ?? (project.dedication ? { title: project.dedication, names: [] } : null);
  if (closing) drawClosing(ctx, closing, top + notes.length * 54 + 20, alpha);
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

/** What the preview needs to know about a drawn frame (for moving things by touch). */
export interface RenderInfo {
  text: Rect | null; // the text block as drawn (after its pose), frame units
  textPose: Pose;
  bgPose: Pose;
  /** The pose that would be drawn for a requested one (kept legible and inside the frame). */
  fitText: (p: Pose) => Pose;
  fitBg: (p: Pose) => Pose;
  /** The user's own mark as drawn (frame units), or null. */
  mark?: Rect | null;
}

/** The user's own watermark in its strip (the layout keeps it clear of the text: rule 6). Placed at a
 *  corner / the centre, or where it was dragged (`x`), always inside the title-safe width. Returns
 *  the drawn rectangle (for touch). */
function drawMark(ctx: CanvasRenderingContext2D, m: Mark, box: { y: number; h: number }, t: number, end: number): Rect | null {
  const fx = markFx(m, t, end);
  const pose = markPose(m, t);
  const k = pose?.s ?? 1; // keyframed size (≤ 1: the strip is sized for the largest)
  let w = 0, hh = box.h * k;
  let img: CanvasImageSource | null = null;
  const fontPx = Math.round(MARK_FONT * m.size * k);
  if (m.kind === 'logo') {
    const raw = logoImage(m.logo);
    if (!raw || !raw.width || !raw.height) return null;
    img = (m.knock && m.logo && knockedLogo(m.logo)) || raw;
    w = Math.min((hh * raw.width) / raw.height, W * 0.4);
    hh = (w * raw.height) / raw.width;
  } else {
    ctx.save();
    ctx.font = `600 ${fontPx}px ${FONT_UI}`;
    w = Math.min(ctx.measureText(m.text).width, W * 0.6);
    hh = fontPx * 1.3;
    ctx.restore();
  }
  const left = m.pos === 'tl' || m.pos === 'bl', mid = m.pos === 'bc';
  const cxAt = pose ? pose.x : m.x;
  let x0 = cxAt !== undefined ? SAFE.x0 + cxAt * (SAFE.x1 - SAFE.x0) - w / 2 : left ? SAFE.x0 + 8 : mid ? W / 2 - w / 2 : SAFE.x1 - 8 - w;
  x0 = Math.min(Math.max(x0, SAFE.x0), SAFE.x1 - w);
  const rect = { x0, y0: box.y + (box.h - hh) / 2, x1: x0 + w, y1: box.y + (box.h + hh) / 2 };
  if (fx.a <= 0.001) return rect;
  ctx.save();
  // Effects stay inside the mark's own strip and the safe width (rule 6).
  ctx.beginPath();
  ctx.rect(SAFE.x0, box.y - 4, SAFE.x1 - SAFE.x0, box.h + 8);
  ctx.clip();
  ctx.globalAlpha = m.opacity * fx.a;
  // Grows / shrinks from the side it sits against, so a larger moment still fits the safe width.
  const ox = rect.x0 <= SAFE.x0 + 12 ? rect.x0 : rect.x1 >= SAFE.x1 - 12 ? rect.x1 : (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  ctx.translate(ox + fx.dx, cy);
  ctx.scale(fx.s, fx.s);
  ctx.translate(-ox, -cy);
  if (img) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8 * Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.drawImage(img, rect.x0, rect.y0, w, hh);
  } else {
    setTextShadow(ctx, '#ffffff');
    ctx.fillStyle = '#ffffff';
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontPx}px ${FONT_UI}`;
    ctx.fillText(m.text, x0, cy, W * 0.6);
  }
  ctx.restore();
  return rect;
}

/** `media[i]` is the decoded background of `project.scenes[i]` (missing while loading: black). */
export function render(ctx: CanvasRenderingContext2D, t: number, project: Project, tl: Timeline, media: (BackgroundMedia | undefined)[], info?: RenderInfo) {
  setFrame(project.format);
  ctx.save();
  const cine = !!project.cinema;
  const spans = sceneSpans(tl.scenes, project.transition);
  // Moved / scaled by the user (always still covering the frame).
  const bgPose = project.motion?.bg ? fitBgPose(poseAt(project.motion.bg, t), W, H) : IDENTITY;
  const posed = bgPose !== IDENTITY;
  if (posed) {
    ctx.save();
    ctx.translate(W / 2 + bgPose.x, H / 2 + bgPose.y);
    ctx.scale(bgPose.s, bgPose.s);
    ctx.translate(-W / 2, -H / 2);
  }
  if (cine) {
    // The background drifts slowly closer over the whole reel.
    const z = drift(t, tl.duration);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    drawScenes(ctx, t, spans, project.transition, media);
    ctx.restore();
    // Depth: the background softens while an ayah is on screen.
    const a = ayahAt(tl, t);
    if (a) soften(ctx, Math.min(smooth(clamp01((t - a.start) / 0.8)), smooth(clamp01((a.end - t) / 0.8))));
  } else drawScenes(ctx, t, spans, project.transition, media);
  if (posed) ctx.restore();
  drawGrade(ctx, project.grade);
  if (project.vignette) drawVignette(ctx);
  if (project.grain) drawGrain(ctx, t);
  drawScrim(ctx, SCRIM_STRENGTH[project.scrim] ?? 1);
  // Open from black, settle back into it; the text and the reference are drawn after, unchanged.
  if (cine) darken(ctx, shade(t, tl.duration));

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

  // Moved / scaled by the user: the block (Arabic, translation, and the surah name when it sits below)
  // keeps inside the text area and never gets smaller than the legible minimum (rule 6).
  const T0 = titleBlock(project.titleSize, project.surahName !== false);
  let textPose = IDENTITY;
  let box: Rect | null = null;
  if (ev || en) {
    const below = project.titlePos === 'below';
    let y0 = ev ? arTop : enTop, y1 = en ? enTop + enH(en) : arTop + (ev ? arH(ev.ar) : 0);
    if (below) y1 = titleTop + T0;
    let w = 0;
    if (ev) {
      ctx.font = `${ev.ar.size}px ${FONT_AR}`;
      for (const l of ev.ar.lines) w = Math.max(w, ctx.measureText(l).width);
    }
    if (en) {
      ctx.font = `${en.size}px ${lay.enFont}`;
      for (const l of en.lines) w = Math.max(w, ctx.measureText(l).width);
    }
    if (!ev) y0 = enTop;
    box = { x0: W / 2 - w / 2 - 8, x1: W / 2 + w / 2 + 8, y0, y1 };
    const tr = project.motion?.text;
    const region = { x0: SAFE.x0, x1: SAFE.x1, y0: lay.text.top, y1: below ? lay.title + T0 : lay.text.bottom };
    const minS = Math.max(ev ? Math.min(1, AR_SIZE_MIN / ev.ar.size) : 0, en ? Math.min(1, EN_MIN / en.size) : 0, 0.01);
    const b = box;
    if (tr) textPose = fitTextPose(poseAt(tr, t), b, region, minS);
    if (info) info.fitText = (p) => fitTextPose(p, b, region, minS);
  }
  const tcx = W / 2, tcy = box ? (box.y0 + box.y1) / 2 : H / 2;
  const posedText = (draw: () => void) => {
    if (textPose === IDENTITY) return draw();
    ctx.save();
    ctx.translate(tcx + textPose.x, tcy + textPose.y);
    ctx.scale(textPose.s, textPose.s);
    ctx.translate(-tcx, -tcy);
    draw();
    ctx.restore();
  };
  if (info) {
    info.textPose = textPose;
    info.bgPose = bgPose;
    const fw = W, fh = H;
    info.fitBg = (p) => fitBgPose(p, fw, fh);
    if (!box) info.fitText = (p) => p;
    info.text = box && {
      x0: tcx + textPose.x + (box.x0 - tcx) * textPose.s, x1: tcx + textPose.x + (box.x1 - tcx) * textPose.s,
      y0: tcy + textPose.y + (box.y0 - tcy) * textPose.s, y1: tcy + textPose.y + (box.y1 - tcy) * textPose.s,
    };
  }

  posedText(() => {
  // Ayah text: each event shows from its first recited word until the next (word-timed).
  if (ev) {
    setTextShadow(ctx, colors.ar);
    const hl = project.highlight && ayah ? highlightAt(ayah, ev, t, colors.hl ?? '#f2c46b') : null;
    const tajweed = project.tajweed && ayah ? tajweedLines(ayah.words, ev.first, ev.ar.counts, ayah.tajweed) : null;
    drawText(ctx, fx, ev, t, { lines: ev.ar.lines, size: ev.ar.size, lh: AR_LINE, top: arTop, font: FONT_AR, dir: 'rtl', color: colors.ar, opacity: 1, hl, tajweed, breath: cine ? breathAt(tl.breath, t) : 0 });
  }
  if (en) {
    // Synced meanings move with their words; a whole-ayah translation turns pages on its own timing.
    setTextShadow(ctx, colors.en);
    // Synced meanings are English; a whole-ayah translation runs in its own direction (e.g. Urdu).
    const dir = project.translationMode === 'words' ? 'ltr' : tl.translation.dir;
    drawText(ctx, fx, en, t, { lines: en.lines, size: en.size, lh: EN_LINE, top: enTop, font: lay.enFont, dir, color: colors.en, opacity: 0.92 });
  }
  });

  // The ending's lines (after the last word); the surah name + reference stay (rule 2), except under a
  // segmented reel's title, which names its surahs itself.
  const card = cardAt(tl, t);
  if (card) drawCard(ctx, card.alpha, project, tl);
  const note = noteAt(tl, t);
  if (note) drawNote(ctx, note.note, note.alpha, project);
  const under = 1 - Math.max(tl.segmented ? card?.alpha ?? 0 : 0, note?.alpha ?? 0);
  const head = headerAyah(tl, t);

  // Surah name (optional) + reference (always visible, rule 2) at the chosen place and size.
  const z = TITLE_SIZES[project.titleSize];
  const nameH = project.surahName !== false ? z.name * 1.4 : 0;
  const drawTitle = () => {
    setTextShadow(ctx, colors.title);
    ctx.fillStyle = colors.title;
    ctx.globalAlpha = under;
    if (nameH) {
      ctx.direction = 'rtl';
      ctx.font = `${z.name}px ${FONT_NAME}`;
      ctx.fillText(head.surah.ar, W / 2, titleTop + z.name * 0.7);
    }
    ctx.direction = 'ltr';
    ctx.font = `500 ${z.ref}px ${FONT_UI}`;
    ctx.globalAlpha = 0.9 * under;
    ctx.fillText(head.ref, W / 2, titleTop + nameH + z.ref * 0.7);
  };
  // "Below": the name and reference belong to the text block and move with it.
  if (project.titlePos === 'below' && box) posedText(drawTitle);
  else drawTitle();

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
  const markRect = lay.mark && markShown(project.mark) ? drawMark(ctx, project.mark, lay.mark, t, tl.duration) : null;
  if (info) info.mark = markRect;
  ctx.restore();
}
