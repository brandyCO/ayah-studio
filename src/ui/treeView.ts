// #/learn/tree/S: a surah's tree up close, on its island under the night sky. Drawn live at the screen's full
// resolution on every frame (never a cached picture), so it stays sharp at any zoom: pinch, drag, the wheel or a
// double tap. "Full grown" previews what the tree becomes once the whole surah is held (a preview only).
import './learn.css';
import { stageOf, thirsty, tree, type Stage } from '../data/garden';
import { loadMeta } from '../data/quran';
import { surahName } from '../i18n';
import { lt } from '../i18n/learn';
import { h } from './dom';
import { drawIsland, drawTreeFrame, islandSky } from './gardenArt';
import { icon } from './icons';
import { lite } from './juice';

const W = 500, H = 625;

export async function showTreeView(root: HTMLElement, sArg: string): Promise<() => void> {
  const meta = await loadMeta();
  const s = Math.min(114, Math.max(1, Number(sArg) || 1));
  const m = meta[s - 1];
  const tr = tree(s);
  const real: Stage = tr ? stageOf(tr, m.ayahs) : 0;
  const dry = !!tr && thirsty(tr);
  let stage: Stage = real;
  root.classList.add('learn', 'tv');

  const canvas = h('canvas', { class: 'tv-canvas', role: 'img', 'aria-label': lt('learn.treeOf', { name: surahName(m) }) });
  const preview = h('button', { class: 'chip tv-preview', 'aria-pressed': 'false' }, lt('learn.tvFull'));
  preview.hidden = real === 4;
  preview.addEventListener('click', () => {
    stage = stage === 4 ? real : 4;
    preview.classList.toggle('on', stage === 4);
    preview.setAttribute('aria-pressed', String(stage === 4));
    note.textContent = stage === 4 && real !== 4 ? lt('learn.tvPreviewNote') : status();
    draw();
  });
  const status = () => (tr?.full ? (dry ? lt('learn.thirstyShort') : lt('learn.treeGrown')) : lt('learn.doneSub2', { n: tr?.learned ?? 0, of: m.ayahs }));
  const note = h('p', { class: 'tv-note' }, status());
  const go = h('a', { class: 'primary brand-btn', href: `#/learn/${s}` }, lt(tr?.full ? (dry ? 'learn.goWater' : 'learn.goRecite') : 'learn.continue'));
  root.append(
    canvas,
    h('header', { class: 'tv-top' },
      h('a', { class: 'icon-btn back-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('div', { class: 'tv-title' }, h('h1', {}, surahName(m)), h('span', { lang: 'ar', dir: 'rtl' }, m.ar)),
      h('button', { class: 'icon-btn', 'aria-label': lt('learn.fit'), onclick: () => { zoom = 1; px = py = 0; draw(); } }, '⤢')),
    h('div', { class: 'tv-card' }, note, h('div', { class: 'tv-row' }, preview, go), h('p', { class: 'tv-hint' }, lt('learn.tvHint'))));

  // view: zoom around the frame's centre, pan in screen pixels
  let zoom = 1, px = 0, py = 0;
  let cw = 0, ch = 0, dpr = 1;
  const ctx = canvas.getContext('2d')!;
  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(lite() ? 2 : 3, window.devicePixelRatio || 1);
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  const t0 = performance.now();
  function draw() {
    if (!cw) return;
    const t = reduce ? 0 : (performance.now() - t0) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, islandSky(s)); sky.addColorStop(0.75, islandSky(s)); sky.addColorStop(1, '#05080a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The island across the screen, its ground just above the card; the whole tree fitted above the ground.
    const card = root.querySelector<HTMLElement>('.tv-card');
    const gy = ch - (card ? card.offsetHeight : 160) - 40;
    const k1 = (cw / W) * 1.15;
    const k2 = Math.min((gy - 90) / 480, (cw * 0.96) / W);
    const view = (k: number) => {
      // zoom about the screen point (cw/2, gy*0.62), then pan
      const zx = cw / 2, zy = gy * 0.62;
      const x0 = cw / 2 - (W / 2) * k, y0 = gy - 520 * k;
      ctx.setTransform(dpr * k * zoom, 0, 0, dpr * k * zoom, dpr * (zx + (x0 - zx) * zoom + px), dpr * (zy + (y0 - zy) * zoom + py));
    };
    view(k1);
    drawIsland(ctx, s, t);
    view(k2);
    drawTreeFrame(ctx, s, stage, dry && stage === real, t);
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = 0, alive = true;
  const loop = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden || now - last < (lite() ? 66 : 33)) return;
    last = now;
    draw();
  };

  // gestures
  const pts = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, zoom0 = 1, lastTap = 0;
  const clampPan = () => {
    const lim = (zoom - 1) * Math.max(cw, ch) * 0.6 + 40;
    px = Math.max(-lim, Math.min(lim, px)); py = Math.max(-lim, Math.min(lim, py));
  };
  const zoomAt = (nz: number, cx: number, cy: number) => {
    nz = Math.max(1, Math.min(5, nz));
    const card = root.querySelector<HTMLElement>('.tv-card');
    const zy = (ch - (card ? card.offsetHeight : 160) - 40) * 0.62;
    const ox = cx - cw / 2 - px, oy = cy - zy - py;
    px -= ox * (nz / zoom - 1); py -= oy * (nz / zoom - 1);
    zoom = nz;
    if (zoom === 1) px = py = 0;
    clampPan(); draw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; }
    const now = performance.now();
    if (pts.size === 1 && now - lastTap < 300) zoomAt(zoom > 1.5 ? 1 : 2.6, e.offsetX, e.offsetY);
    lastTap = now;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) { px += e.offsetX - p.x; py += e.offsetY - p.y; clampPan(); }
    p.x = e.offsetX; p.y = e.offsetY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoomAt(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch0), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else draw();
  });
  const up = (e: PointerEvent) => pts.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });

  const ro = new ResizeObserver(() => { size(); draw(); });
  ro.observe(canvas);
  requestAnimationFrame(() => { size(); draw(); if (!reduce) raf = requestAnimationFrame(loop); });
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
}
