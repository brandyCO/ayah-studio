// The character card (owner idea 2026-11-10): the user's character as a picture to share — 1080×1350 (a 4:5
// post / status size), on its own background colours, standing big and cheering, with the streak, the
// wardrobe pieces and trophies kept, and the app's name. No Quran text, no photos, no real faces.
import { BG, WARDROBE, bgDeco, figureSvg, parse } from './figure';
import { prizeWins } from '../data/garden';
import { streak } from '../data/journey';
import { ownsPiece } from '../data/wardrobe';
import { rt } from '../i18n/ranks';
import { isNative, shareFile, shareableLink } from '../native';
import { toast } from './dom';

const W = 1080, H = 1350;

function img(svg: string, w: number, h: number): Promise<HTMLImageElement> {
  const s = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
}
function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export async function charCanvas(code: string): Promise<HTMLCanvasElement> {
  const f = parse(code)!;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  await document.fonts?.load('900 64px Nunito').catch(() => {});
  const [b0, b1] = BG[f.bg];
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, b1); bg.addColorStop(1, b0);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // The background's own touches (aurora stars, sun rays…) drawn large behind the character.
  const deco = bgDeco(f.bg, 20, 20, 20);
  if (deco) g.drawImage(await img(`<svg viewBox="0 0 40 40">${deco}</svg>`, W, W), 0, 120, W, W);
  const glow = g.createRadialGradient(W / 2, 640, 40, W / 2, 640, 520);
  glow.addColorStop(0, 'rgba(255,255,255,.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const fig = figureSvg(f, { still: true, cheer: true });
  g.drawImage(await img(fig, 640, 838), (W - 640) / 2, 230, 640, 838);

  const font = (w: number, px: number) => `${w} ${px}px Nunito, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = font(800, 40);
  g.fillText('Ayah Studio', W / 2, 96);
  g.fillStyle = '#fff';
  g.font = font(900, 70);
  g.fillText(rt('cc.kicker'), W / 2, 180);

  const best = Math.max(streak().best, streak().days);
  const pieces = Object.keys(WARDROBE).filter((id) => ownsPiece(id)).length;
  const cups = prizeWins().length;
  const tiles = ([[best, rt('cc.streak', { n: best }), '#ff7a3d'], [pieces, rt('cc.pieces', { n: pieces }), '#7b5ce0'], [cups, rt('cc.cups', { n: cups }), '#d99a14']] as [number, string, string][])
    .filter(([v]) => v > 0);
  const tw = 300, gap = 24, x0 = (W - (tw * tiles.length + gap * (tiles.length - 1))) / 2, y = 1090;
  tiles.forEach(([, label, col], i) => {
    const x = x0 + i * (tw + gap);
    g.fillStyle = 'rgba(0,0,0,.18)'; round(g, x, y + 8, tw, 100, 30); g.fill();
    g.fillStyle = '#fff'; round(g, x, y, tw, 100, 30); g.fill();
    g.fillStyle = col; g.font = font(900, 34);
    g.fillText(label, x + tw / 2, y + 62, tw - 24);
  });
  g.fillStyle = '#fff';
  g.font = font(900, 42);
  g.fillText(rt('cc.cta'), W / 2, 1290);
  return c;
}

export async function shareCharCard(code: string) {
  try {
    const c = await charCanvas(code);
    const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no image'))), 'image/png'));
    const name = 'ayah-studio-character.png';
    const text = `${rt('cc.text')} ${shareableLink('#/ranks')}`;
    if (isNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      const { uri } = await Filesystem.writeFile({ directory: Directory.Cache, path: name, data });
      await shareFile(uri, rt('room.share'), text);
      return;
    }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    toast(rt('cc.saved'));
  } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message); }
}
