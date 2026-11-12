// Week recap card (owner request 2026-11-09; shown from the player's Friday Maghrib, when their week ends): last week's league as a picture to share — the tier
// emblem, the place, the points and this device's own pages and listening. Drawn on a canvas (1080×1350,
// a 4:5 post / status size), shared as a PNG (Android share sheet, Web Share with files, else a download).
// No Quran text and no faces on it; only numbers the app checked itself.
import { rt, type RankKey } from '../i18n/ranks';
import { isNative, shareFile } from '../native';
import { lastWeekLocal, tierOf, type Status } from '../together/ranks';
import { TIER_RING } from './rankAvatars';
import { tierEmblem } from './rankMoment';
import { toast } from './dom';
import { myFigureCode } from './actor';
import { figureSvg, parse } from './figure';
import { lampOf } from '../data/shop';
import { streak } from '../data/journey';

const W = 1080, H = 1350;
const tierName = (n: number) => rt(`rk.tier.${tierOf(n)}` as RankKey);
const num = (n: number) => n.toLocaleString();

function svgImage(svg: SVGSVGElement, size: number): Promise<HTMLImageElement> {
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
}

/** The card for last week (needs `s.last`). */
export async function recapCanvas(s: Status): Promise<HTMLCanvasElement> {
  const last = s.last!;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  await document.fonts?.load('900 64px Nunito').catch(() => {});
  const ring = TIER_RING[Math.max(0, Math.min(4, s.tier))];
  // A night-violet sky, a glow in the tier's colour behind the emblem, a few stars.
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a2170'); bg.addColorStop(0.55, '#4a3cb8'); bg.addColorStop(1, '#6c5ce7');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 470, 20, W / 2, 470, 420);
  glow.addColorStop(0, `${ring}aa`); glow.addColorStop(1, `${ring}00`);
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#fff';
  for (let i = 0; i < 46; i++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.beginPath(); g.arc(rnd() * W, rnd() * 620, 1.5 + rnd() * 2.5, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;

  const font = (w: number, px: number) => `${w} ${px}px Nunito, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#e8e4ff';
  g.font = font(800, 40);
  g.fillText('Ayah Studio', W / 2, 96);
  g.fillStyle = '#fff';
  g.font = font(900, 64);
  g.fillText(rt('rk.recapTitle'), W / 2, 180);

  // With a character (owner 2026-11-12, "Friday shareable recap"): the character cheering, the league's emblem as a
  // badge at its side, and the lamp of Light under the title. Without one, the emblem alone as before.
  const fig = parse(myFigureCode() ?? '');
  const lamp = lampOf();
  if (lamp) {
    g.fillStyle = ['', '#f0b27f', '#eef2f6', '#ffe08a', '#bfeaff'][lamp];
    g.font = font(800, 34);
    g.fillText(`✦ ${rt(`rk.lamp${lamp}` as RankKey)}`, W / 2, 232);
  }
  const em = await svgImage(tierEmblem(last.tier), fig ? 250 : 300);
  let y0 = 0;
  if (fig) {
    const s = figureSvg(fig, { still: true, cheer: true }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="655" ');
    const im = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`; });
    g.drawImage(im, W / 2 - 340, 168, 500, 655);
    g.drawImage(em, W / 2 + 100, 470, 250, 250);
    y0 = 196;
  } else g.drawImage(em, W / 2 - 150, 250, 300, 300);
  g.fillStyle = '#fff';
  g.font = font(900, fig ? 110 : 120);
  g.fillText(`#${last.place}`, W / 2, 690 + y0);
  g.font = font(800, 44);
  g.fillStyle = '#e8e4ff';
  g.fillText(rt('rk.recapOf', { n: last.size, tier: tierName(last.tier) }), W / 2, 750 + y0);
  const moved = s.tier > last.tier ? rt('rk.recapUp', { tier: tierName(s.tier) }) : s.tier < last.tier ? rt('rk.recapFresh', { tier: tierName(s.tier) }) : rt('rk.recapStay', { tier: tierName(s.tier) });
  g.fillStyle = s.tier > last.tier ? '#b6f5a3' : '#fff';
  g.font = font(800, 42);
  g.fillText(`${s.tier > last.tier ? '▲ ' : ''}${moved}`, W / 2, 806 + y0);

  // Three tiles: points, pages, minutes.
  const mine = lastWeekLocal(s.weekStart);
  // (This device's numbers only when it has them: a card never shows "0 pages".)
  const days = streak().days;
  const tiles = ([[last.score, rt('rk.recapPts'), '#6c5ce7'], [mine.pages, rt('rk.recapPages'), '#12a594'], [mine.listen, rt('rk.recapMin'), '#2f7fd6'], [days, rt('rk.recapStreak'), '#f08a1c']] as [number, string, string][])
    .filter(([v], i) => i === 0 || v > 0).slice(0, 3);
  const tw = 296, gap = 30, x0 = (W - (tw * tiles.length + gap * (tiles.length - 1))) / 2, y = fig ? 1036 : 890;
  const th = fig ? 168 : 200;
  tiles.forEach(([n, label, col], i) => {
    const v = num(n);
    const x = x0 + i * (tw + gap);
    g.fillStyle = 'rgba(0,0,0,.18)';
    round(g, x, y + 10, tw, th, 36); g.fill();
    g.fillStyle = '#fff';
    round(g, x, y, tw, th, 36); g.fill();
    g.fillStyle = col;
    g.font = font(900, 72);
    g.fillText(v, x + tw / 2, y + th * 0.54);
    g.fillStyle = '#5b5a6e';
    g.font = font(800, 32);
    g.fillText(label, x + tw / 2, y + th * 0.79);
  });
  g.fillStyle = '#fff';
  g.font = font(800, 40);
  g.fillText(rt('rk.recapCta'), W / 2, fig ? 1262 : 1210);
  g.fillStyle = '#d9d4ff';
  g.font = font(700, 30);
  g.fillText(rt('rk.recapNote'), W / 2, fig ? 1312 : 1268);
  return c;
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Shares the card (with a line and the app link). */
export async function shareRecap(s: Status, link: string) {
  try {
    const c = await recapCanvas(s);
    const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no image'))), 'image/png'));
    const name = `ayah-studio-week-${s.weekStart}.png`;
    const text = `${rt('rk.recapText', { place: s.last!.place, tier: tierName(s.last!.tier) })} ${link}`;
    if (isNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      const { uri } = await Filesystem.writeFile({ directory: Directory.Cache, path: name, data });
      await shareFile(uri, rt('rk.recapShare'), text);
      return;
    }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    toast(rt('rk.recapSaved'));
  } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message); }
}
