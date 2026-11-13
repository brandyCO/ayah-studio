// My week with the Quran (front-end review item 7, owner go-ahead 2026-11-13): a 9:16 story card of the week that just
// ended at Friday Maghrib — the character cheering (or the flame), the week's pages, listening, adhkar and more, the
// seven days with the ones lit, the streak — shared as a PNG with the app link. Works signed out; only numbers the app
// counted itself; no Quran text, no faces but the user's own character. Content stays inside the story safe area
// (y 250–1650 of 1920). Me shows "Your week is ready" from Friday Maghrib through Sunday, once a week.
import { addDays, allDays, streak } from '../data/journey';
import { maghribOf, rankDay, rankWeek, weekTotals, type DayTotals } from '../data/rankDay';
import { fe, type FrontKey } from '../i18n/front';
import { locale } from '../i18n';
import { isNative, shareFile, shareableLink } from '../native';
import { myFigureCode } from './actor';
import { figureSvg, parse } from './figure';
import { drawFire } from './flatFireCore';
import { themeFire } from './flatFire';
import { toast } from './dom';

const W = 1080, H = 1920;
const parseKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

/** The week to show: on the Islamic Saturday and Sunday (from Friday Maghrib) the week that just ended, else this one so far. */
export function storyWeek(now = new Date()): { week: string; end: string; tot: DayTotals; ended: boolean } {
  const k = rankDay(now);
  const wd = parseKey(k).getDay();
  const ended = wd === 6 || wd === 0;
  const at = ended ? new Date(maghribOf(addDays(rankWeek(k), -1)).getTime() - 60_000) : now;
  const w = weekTotals(at);
  return { week: w.week, end: rankDay(at), tot: w.tot, ended };
}
const any = (t: DayTotals) => t.pages + t.listen + t.adhkar + t.surahs + t.lessons + t.dhikr > 0;
/** Me's card: from Friday Maghrib through Sunday, when the week had something in it, until shared or closed. */
export function storyDue(now = new Date()): boolean {
  const w = storyWeek(now);
  if (!w.ended || !any(w.tot)) return false;
  try { return localStorage.getItem('weekStorySeen') !== w.week; } catch { return false; }
}
export const storySeen = () => { try { localStorage.setItem('weekStorySeen', storyWeek().week); } catch { /* ignore */ } };

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const img = (svg: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });

export async function storyCanvas(now = new Date()): Promise<HTMLCanvasElement> {
  const w = storyWeek(now);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  await document.fonts?.load('900 64px Nunito').catch(() => {});
  const font = (wt: number, px: number) => `${wt} ${px}px Nunito, system-ui, sans-serif`;
  // Friday evening: night above, the last warm light low down.
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#12153d'); bg.addColorStop(0.42, '#3b2f86'); bg.addColorStop(0.78, '#a8568a'); bg.addColorStop(1, '#f4a06b');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) { g.globalAlpha = 0.2 + rnd() * 0.65; g.beginPath(); g.arc(rnd() * W, rnd() * 900, 1.4 + rnd() * 2.6, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  // A crescent, high on the right, clear of the title.
  const halo = g.createRadialGradient(900, 560, 30, 900, 560, 130);
  halo.addColorStop(0, 'rgba(255,225,160,.45)'); halo.addColorStop(1, 'rgba(255,225,160,0)');
  g.fillStyle = halo; g.fillRect(760, 420, 280, 280);
  g.save(); g.fillStyle = '#ffe9b0';
  g.beginPath(); g.rect(0, 0, W, H); g.arc(924, 540, 44, 0, Math.PI * 2); g.clip('evenodd');
  g.beginPath(); g.arc(900, 560, 50, 0, Math.PI * 2); g.fill(); g.restore();

  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = font(800, 38);
  g.fillText(fe('ws.brand'), W / 2, 300);
  g.fillStyle = '#fff'; g.font = font(900, 76);
  g.fillText(fe('ws.title'), W / 2, 390);
  const fmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = font(700, 36);
  g.fillText(`${fmt.format(parseKey(w.week))} – ${fmt.format(parseKey(w.end))}`, W / 2, 446);

  // The hero: the user's character cheering beside a flame with the streak, or the flame alone.
  const glow = g.createRadialGradient(W / 2, 740, 30, W / 2, 740, 400);
  glow.addColorStop(0, 'rgba(255,236,190,.55)'); glow.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = glow; g.fillRect(0, 340, W, 800);
  const days = streak().days;
  const fig = parse(myFigureCode() ?? '');
  const flameAt = (x: number, y: number, k: number) => {
    g.save(); g.translate(x, y); g.scale(k, k);
    drawFire(g, 0, 0, { w: 40, h: 104, lean: 5.5, bump: 31, sq: 1 }, themeFire(), 1);
    g.restore();
  };
  if (fig) {
    const s = figureSvg(fig, { still: true, cheer: true }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="523" ');
    g.drawImage(await img(s), W / 2 - 300, 470, 400, 523);
    if (days > 0) {
      flameAt(W / 2 + 210, 840, 2);
      g.fillStyle = '#fff'; g.font = font(900, 92); g.fillText(String(days), W / 2 + 210, 940);
      g.font = font(800, 32); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(fe('ws.streak'), W / 2 + 210, 984);
    }
  } else {
    flameAt(W / 2, 830, 3.2);
    if (days > 0) {
      g.fillStyle = '#fff'; g.font = font(900, 120); g.fillText(String(days), W / 2, 950);
      g.font = font(800, 36); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(fe('ws.streak'), W / 2, 994);
    }
  }

  // Up to four tiles, the biggest things of the week; never a 0.
  const t = w.tot;
  const tiles = ([[t.pages, 'ws.pages', '#12a594'], [Math.floor(t.listen / 60), 'ws.listen', '#2f7fd6'], [t.adhkar, 'ws.adhkar', '#6c5ce7'],
    [t.surahs, 'ws.surahs', '#0b8a7a'], [t.lessons, 'ws.lessons', '#4caf2a'], [t.dhikr, 'ws.dhikr', '#ff6b4a']] as [number, FrontKey, string][])
    .filter(([v]) => v > 0).slice(0, 4);
  const tw = 450, th = 170, gap = 24;
  const rows = Math.ceil(tiles.length / 2);
  const y0 = 1030;
  tiles.forEach(([n, key, col], i) => {
    const r = Math.floor(i / 2), inRow = Math.min(2, tiles.length - r * 2), ci = i % 2;
    const x = (W - (tw * inRow + gap * (inRow - 1))) / 2 + ci * (tw + gap), y = y0 + r * (th + gap);
    g.fillStyle = 'rgba(0,0,0,.2)'; round(g, x, y + 10, tw, th, 40); g.fill();
    g.fillStyle = '#fff'; round(g, x, y, tw, th, 40); g.fill();
    g.fillStyle = col; g.font = font(900, 80); g.fillText(n.toLocaleString(locale()), x + tw / 2, y + 94);
    g.fillStyle = '#55546a'; g.font = font(800, 33); g.fillText(fe(key), x + tw / 2, y + 142);
  });

  // The seven days, Saturday → Friday, lit ones in gold with a tick.
  const dy = y0 + rows * (th + gap) + 20;
  const all = allDays();
  const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const fri = parseKey(w.week).getDay() === 6 ? addDays(w.week, 6) : addDays(w.week, (5 - parseKey(w.week).getDay() + 7) % 7);
  for (let i = 0; i < 7; i++) {
    const k = addDays(fri, i - 6);
    const lit = !!all[k]?.f;
    const x = W / 2 + (i - 3) * 118;
    g.beginPath(); g.arc(x, dy + 44, 42, 0, Math.PI * 2);
    g.fillStyle = lit ? '#ffc94a' : 'rgba(255,255,255,.16)'; g.fill();
    if (lit) {
      g.strokeStyle = '#7a4a00'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x - 18, dy + 46); g.lineTo(x - 5, dy + 59); g.lineTo(x + 19, dy + 31); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = font(800, 30); g.fillText(dayFmt.format(parseKey(k)), x, dy + 124);
  }
  g.fillStyle = '#fff'; g.font = font(900, 44);
  g.fillText(fe('ws.cta'), W / 2, dy + 210);
  return c;
}

/** Shares the card (Android share sheet, Web Share with files, else a download and the text copied). */
export async function shareStory() {
  try {
    const c = await storyCanvas();
    const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no image'))), 'image/png'));
    const name = `ayah-studio-my-week-${storyWeek().week}.png`;
    const text = `${fe('ws.text')} ${shareableLink('#/')}`;
    storySeen();
    if (isNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      const { uri } = await Filesystem.writeFile({ directory: Directory.Cache, path: name, data });
      await shareFile(uri, fe('ws.share'), text);
      return;
    }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    toast(fe('ws.saved'));
  } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message); }
}
