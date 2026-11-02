// Learn tab (#/learn): the juz gardens. One garden per juz on a grid seen at an angle; each surah a
// tree grown by memorising it (src/data/garden.ts, lessons in src/ui/lesson.ts). Trees and
// decorations are dragged anywhere on the grid; the seed store sells rarer varieties and decorations
// for Light. Drawn on a canvas (src/ui/gardenArt.ts); the list under it carries the same trees for
// screen readers and small fingers.
import './learn.css';
import {
  CHUNK_SIZES, DECOS, VARIETIES, buyDeco, buyVariety, decos, dueAt, gridSize, lastJuz, nextChunk, ownsVariety, placeDeco, plant,
  setChunk, setLastJuz, setVariety, stageOf, storeDeco, surahJuz, thirsty, thirstyTrees, tree, trees, unplacedDecos, unplant, wallet,
  ayahPlaces, type ChunkSize, type Deco, type DecoKind, type Rarity, type Stage, type Tree,
} from '../data/garden';
import { loadMeta, type SurahMeta } from '../data/quran';
import { dir, lang, locale, surahName, t, } from '../i18n';
import { lt, type LearnKey } from '../i18n/learn';
import { liteMode } from '../lite';
import { h, haptic, toast } from './dom';
import { icon } from './icons';
import { tabBar } from './tabs';
import {
  cellAt, cellCenter, decoHeight, stageHeight, drawCellMark, drawDeco, drawGround, drawThirst, drawTree, rng, treeHeight, vignette, type Iso,
} from './gardenArt';

const DAY = 86_400_000;
type Item = { kind: 'tree'; t: Readonly<Tree> } | { kind: 'deco'; d: Readonly<Deco> };
type Held = { kind: 'seed'; s: number } | { kind: 'deco'; id: string; k: DecoKind };

const night = () => matchMedia('(prefers-color-scheme: dark)').matches;
const still = () => liteMode() || matchMedia('(prefers-reduced-motion: reduce)').matches;
const chunkLabel = (c: ChunkSize) => (c === 'half' ? lt('learn.chunkHalf') : c === 'page' ? lt('learn.chunkPage') : lt(c === 1 ? 'learn.chunk1' : 'learn.chunkN', { n: c }));
const rarityLabel = (r: Rarity) => lt(`learn.r.${r}` as LearnKey);
const varietyName = (v: number) => lt(`learn.v${v}` as LearnKey);
const decoName = (k: DecoKind) => lt(`learn.d.${k}` as LearnKey);
const fmtDate = (ms: number) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(ms);

/** A seed picked elsewhere (a lesson for an unplanted surah) waits in the tray when the garden opens. */
export function holdSeed(s: number) { try { sessionStorage.setItem('gardenTray', String(s)); } catch { /* ignore */ } }
/** After a lesson: the tree that grew plays its growing moment once. */
export function noteGrowth(s: number, from: Stage) { try { sessionStorage.setItem('gardenGrow', `${s}:${from}`); } catch { /* ignore */ } }

export async function showGarden(root: HTMLElement): Promise<() => void> {
  const [meta, juzOf, mushaf] = await Promise.all([loadMeta(), surahJuz(), import('../data/mushaf').then((x) => x.loadMushaf())]);
  const chunkOf = (tr: Readonly<Tree>, ayahs: number) => nextChunk(tr.learned, ayahs, tr.chunk, typeof tr.chunk === 'number' ? [] : ayahPlaces(mushaf, tr.s));
  root.classList.add('learn');
  const surahsOf = (j: number) => meta.filter((m) => juzOf[m.n - 1] === j);
  let juz = lastJuz();
  let held: Held | null = null;
  try {
    const s = Number(sessionStorage.getItem('gardenTray'));
    sessionStorage.removeItem('gardenTray');
    if (s >= 1 && s <= 114) { juz = juzOf[s - 1]; if (!tree(s) || tree(s)!.x < 0) held = { kind: 'seed', s }; }
  } catch { /* ignore */ }
  // A tree that just grew: from which stage (its growing moment plays once).
  let grow: { s: number; from: Stage; at: number; burst?: boolean } | null = null;
  try {
    const [s, from] = (sessionStorage.getItem('gardenGrow') ?? '').split(':').map(Number);
    sessionStorage.removeItem('gardenGrow');
    if (s >= 1 && s <= 114 && tree(s)) { grow = { s, from: from as Stage, at: 0 }; juz = juzOf[s - 1]; }
  } catch { /* ignore */ }

  // --- screen ---
  const walletBtn = h('button', { class: 'lt-chip learn-wallet', type: 'button', onclick: () => openStore('seeds') });
  const head = h('header', { class: 'learn-head' },
    h('div', {}, h('h1', {}, lt('learn.title')), h('p', { class: 'muted small' }, lt('learn.sub'))),
    walletBtn);
  const juzTitle = h('h2', {});
  const juzSub = h('p', { class: 'muted small' });
  const prevJ = h('button', { class: 'icon-btn', 'aria-label': lt('learn.prevJuz'), onclick: () => setJuz(juz - 1) }, icon(dir() === 'rtl' ? 'right' : 'left', 22));
  const nextJ = h('button', { class: 'icon-btn', 'aria-label': lt('learn.nextJuz'), onclick: () => setJuz(juz + 1) }, icon(dir() === 'rtl' ? 'left' : 'right', 22));
  const nav = h('div', { class: 'learn-nav' }, prevJ, h('div', { class: 'learn-nav-t' }, juzTitle, juzSub), nextJ);
  const canvas = h('canvas', { class: 'garden-canvas', role: 'img' });
  const storeBtn = h('button', { class: 'garden-store-btn', type: 'button', onclick: () => openStore('seeds') }, icon('sprout', 20), h('span', {}, lt('learn.store')));
  const tray = h('div', { class: 'garden-tray', hidden: true });
  const wrap = h('div', { class: 'garden-wrap' }, canvas, storeBtn, tray);
  const today = h('section', { class: 'learn-card learn-today' });
  const list = h('section', { class: 'learn-card learn-list' });
  const how = h('details', { class: 'learn-card learn-how' },
    h('summary', {}, lt('learn.howTitle')),
    h('ol', {}, ...(['learn.how1', 'learn.how2', 'learn.how3', 'learn.how4', 'learn.how5'] as LearnKey[]).map((k) => h('li', {}, lt(k)))));
  root.append(head, nav, wrap, today, list, how, tabBar('learn'));

  // --- the garden's geometry ---
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1, n = 8;
  let iso: Iso = { tw: 40, th: 20, ox: 0, oy: 0 };
  let zoom = 1, panX = 0, panY = 0;
  function layout() {
    n = gridSize(surahsOf(juz).length);
    W = wrap.clientWidth || 360;
    const tw = Math.min(96, W / (n + 0.6));
    const top = tw * 2.05;
    H = Math.round(top + n * tw / 2 + tw * 0.62 + 18);
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    iso = { tw, th: tw / 2, ox: W / 2, oy: top };
    clampPan();
    dirty = true;
  }
  const clampPan = () => {
    const mx = (W * (zoom - 1)) / 2, my = (H * (zoom - 1)) / 2;
    panX = Math.max(-mx, Math.min(mx, panX));
    panY = Math.max(-my, Math.min(my, panY));
  };
  /** Screen (CSS px in the canvas) → garden coordinates. */
  const toWorld = (x: number, y: number) => ({ x: (x - W / 2 - panX) / zoom + W / 2, y: (y - H / 2 - panY) / zoom + H / 2 });

  const items = (): Item[] => {
    const out: Item[] = [];
    for (const tr of trees()) if (tr.x >= 0 && juzOf[tr.s - 1] === juz) out.push({ kind: 'tree', t: tr });
    for (const d of decos(juz)) if (d.x >= 0) out.push({ kind: 'deco', d });
    return out;
  };
  const posOf = (it: Item) => (it.kind === 'tree' ? it.t : it.d);
  const keyOf = (it: Item) => (it.kind === 'tree' ? `t${it.t.s}` : `d${it.d.id}`);
  const occupied = (x: number, y: number, except?: string) => items().some((it) => keyOf(it) !== except && posOf(it).x === x && posOf(it).y === y);
  const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n;
  function freeCell(): { x: number; y: number } | null {
    // Spiral out from the middle: a new tree lands near the centre.
    const c = (n - 1) / 2;
    const cells: { x: number; y: number; d: number }[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push({ x, y, d: Math.hypot(x - c, y - c) + rng(x * 31 + y)() * 0.3 });
    cells.sort((a, b) => a.d - b.d);
    return cells.find((p) => !occupied(p.x, p.y)) ?? null;
  }
  const allFull = () => { const list = surahsOf(juz); return list.length > 0 && list.every((m) => !!tree(m.n)?.full && tree(m.n)!.x >= 0); };

  // --- drawing ---
  let dirty = true;
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  // x, y: the finger; ox, oy: where on the item it was taken (the item keeps that place under the finger).
  let drag: { it?: Item; held?: Held; x: number; y: number; ox?: number; oy?: number; cell: { x: number; y: number } | null } | null = null;
  const motes = Array.from({ length: 26 }, (_, i) => { const r = rng(i * 7 + 3); return { x: r(), y: r(), s: 0.4 + r() * 0.8, p: r() * 6 }; });
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; born: number }[] = [];

  function draw(now: number) {
    const time = still() ? 0 : (now - t0) / 1000;
    const isNight = night();
    const magic = allFull() ? 1 : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    drawGround(ctx, iso, n, isNight, magic, time);
    if (drag?.cell && inGrid(drag.cell.x, drag.cell.y)) {
      const ex = drag.it ? keyOf(drag.it) : undefined;
      drawCellMark(ctx, iso, drag.cell.x, drag.cell.y, !occupied(drag.cell.x, drag.cell.y, ex));
    }
    const list = items().filter((it) => !drag?.it || keyOf(it) !== keyOf(drag.it)).sort((a, b) => posOf(a).x + posOf(a).y - (posOf(b).x + posOf(b).y));
    const thirstyAt: { x: number; y: number }[] = [];
    let growing = false;
    for (const it of list) {
      const p = cellCenter(iso, posOf(it).x, posOf(it).y);
      if (it.kind === 'deco') { drawDeco(ctx, it.d.k, p.x, p.y, iso.tw, time, isNight); continue; }
      const m = meta[it.t.s - 1];
      let stage = stageOf(it.t, m.ayahs);
      let g = 1;
      if (grow && grow.s === it.t.s) {
        if (!grow.at) grow.at = now;
        const k = Math.min(1, (now - grow.at) / 1900);
        growing = k < 1;
        // The old stage shrinks into the new one, which springs up a little past its size.
        if (k < 0.35) { stage = grow.from; g = 1 - k / 0.35 * 0.5; }
        else { const e = (k - 0.35) / 0.65; g = 0.5 + 0.5 * (1 + Math.sin(e * Math.PI) * 0.12 * (1 - e)) * Math.min(1, e * 1.6); }
        if (k >= 0.35 && !grow.burst) { grow.burst = true; burst(p.x, p.y - iso.tw * 0.6); haptic(14); }
        if (k >= 1) grow = null;
      }
      drawTree(ctx, p.x, p.y, iso.tw, { s: it.t.s, v: it.t.v, stage, thirsty: thirsty(it.t), t: time, night: isNight, grow: g });
      if (thirsty(it.t)) thirstyAt.push({ x: p.x, y: p.y - iso.tw * (stageHeight(it.t.s, stage) + 0.25) });
    }
    for (const q of thirstyAt) drawThirst(ctx, q.x, q.y, iso.tw, time);
    // The thing being dragged, lifted under the finger.
    if (drag && (drag.it || drag.held)) {
      const w = toWorld(drag.x - (drag.ox ?? 0), drag.y - (drag.oy ?? 0));
      const cell = drag.cell && inGrid(drag.cell.x, drag.cell.y) ? cellCenter(iso, drag.cell.x, drag.cell.y) : w;
      const px = cell.x * 0.35 + w.x * 0.65, py = cell.y * 0.35 + w.y * 0.65;
      const it = drag.it, hd = drag.held;
      if (it?.kind === 'deco' || hd?.kind === 'deco') drawDeco(ctx, it?.kind === 'deco' ? it.d.k : (hd as { k: DecoKind }).k, px, py, iso.tw, time, isNight, true);
      else {
        const s = it?.kind === 'tree' ? it.t.s : (hd as { s: number }).s;
        const tr = tree(s);
        drawTree(ctx, px, py, iso.tw, { s, v: tr?.v ?? 0, stage: tr ? stageOf(tr, meta[s - 1].ayahs) : 0, thirsty: false, t: time, night: isNight, lifted: true });
      }
    }
    // Light: motes drifting up at night or over a finished juz; sparks when a tree grows.
    if (!still() && (isNight || magic)) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cnt = magic ? motes.length : 10;
      for (let i = 0; i < cnt; i++) {
        const m = motes[i];
        const y = ((m.y - time * 0.012 * m.s) % 1 + 1) % 1;
        const x = m.x + Math.sin(time * 0.4 + m.p) * 0.02;
        const a = Math.sin(y * Math.PI) * (0.5 + 0.5 * Math.sin(time * 1.3 + m.p));
        const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, 6 * m.s + 2);
        g.addColorStop(0, `rgba(255, 226, 150, ${0.75 * a})`);
        g.addColorStop(1, 'rgba(255, 226, 150, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x * W, y * H, 6 * m.s + 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (sparks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = (now - s.born) / 1000;
        if (age > s.life) { sparks.splice(i, 1); continue; }
        const x = s.x + s.vx * age, y = s.y + s.vy * age - 18 * age * age;
        ctx.fillStyle = `rgba(255, 230, 160, ${1 - age / s.life})`;
        ctx.beginPath(); ctx.arc(x, y, 2.2 * (1 - age / s.life) + 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    return growing || sparks.length > 0 || !!drag;
  }
  function burst(x: number, y: number) {
    if (still()) return;
    const now = performance.now();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const sp = 20 + Math.random() * 45;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 25, life: 0.9 + Math.random() * 0.7, born: now });
    }
  }
  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !canvas.isConnected) return;
    const animated = !still() && (night() || allFull() || items().length > 0);
    // About 30 frames a second while something moves; otherwise only when changed.
    if (!dirty && !(animated && now - last > 33)) return;
    last = now;
    const busy = draw(now);
    dirty = busy;
  }
  raf = requestAnimationFrame(loop);
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - W) > 1) layout(); });
  ro.observe(wrap);

  // --- touch: tap a tree, drag it anywhere, pinch to zoom ---
  const pts = new Map<number, { x: number; y: number }>();
  let press: { id: number; x: number; y: number; it: Item | null; moved: boolean; timer: number; lifted: boolean } | null = null;
  let pinch: { d: number; z: number; mx: number; my: number; px: number; py: number } | null = null;
  const local = (e: PointerEvent | { clientX: number; clientY: number }) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function hit(x: number, y: number): Item | null {
    const w = toWorld(x, y);
    const list = items().sort((a, b) => posOf(b).x + posOf(b).y - (posOf(a).x + posOf(a).y));
    for (const it of list) {
      const p = cellCenter(iso, posOf(it).x, posOf(it).y);
      const hgt = it.kind === 'deco' ? decoHeight(it.d.k) : stageHeight(it.t.s, stageOf(it.t, meta[it.t.s - 1].ayahs));
      const half = iso.tw * (it.kind === 'deco' ? 0.4 : 0.32);
      if (w.x > p.x - half && w.x < p.x + half && w.y > p.y - Math.max(hgt, 0.35) * iso.tw && w.y < p.y + iso.th * 0.5) return it;
    }
    return null;
  }
  const cellOf = (x: number, y: number) => { const w = toWorld(x, y); return cellAt(iso, w.x, w.y); };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 2) {
      cancelPress();
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, px: panX, py: panY };
      return;
    }
    const it = hit(p.x, p.y);
    press = { id: e.pointerId, x: p.x, y: p.y, it, moved: false, lifted: false, timer: 0 };
    // Hold to lift a tree or decoration (it can then be dragged anywhere).
    if (it) press.timer = window.setTimeout(() => { if (press && !press.moved) liftPress(); }, 320);
  });
  function liftPress() {
    if (!press?.it) return;
    press.lifted = true;
    haptic(12);
    const c = cellCenter(iso, posOf(press.it).x, posOf(press.it).y);
    const ox = press.x - ((c.x - W / 2) * zoom + W / 2 + panX), oy = press.y - ((c.y - H / 2) * zoom + H / 2 + panY);
    drag = { it: press.it, x: press.x, y: press.y, ox, oy, cell: cellOf(press.x - ox, press.y - oy) };
    dirty = true;
  }
  function cancelPress() { if (press) clearTimeout(press.timer); press = null; if (drag?.it) drag = null; dirty = true; }
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoom = Math.max(1, Math.min(2.4, pinch.z * (d / Math.max(1, pinch.d))));
      panX = pinch.px + ((a.x + b.x) / 2 - pinch.mx);
      panY = pinch.py + ((a.y + b.y) / 2 - pinch.my);
      clampPan();
      dirty = true;
      return;
    }
    if (!press || press.id !== e.pointerId) return;
    const dx = p.x - press.x, dy = p.y - press.y;
    if (!press.moved && Math.hypot(dx, dy) > 7) {
      press.moved = true;
      clearTimeout(press.timer);
      if (press.it && !press.lifted) liftPress();
    }
    if (drag?.it) {
      drag.x = p.x; drag.y = p.y;
      drag.cell = cellOf(p.x - (drag.ox ?? 0), p.y - (drag.oy ?? 0));
      dirty = true;
    } else if (press.moved && zoom > 1) {
      panX += e.movementX; panY += e.movementY;
      clampPan();
      dirty = true;
    }
  });
  const end = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinch = null; return; }
    if (!press || press.id !== e.pointerId) return;
    clearTimeout(press.timer);
    const p = local(e);
    if (drag?.it) {
      const c = cellOf(p.x - (drag.ox ?? 0), p.y - (drag.oy ?? 0));
      const key = keyOf(drag.it);
      if (e.type === 'pointerup' && inGrid(c.x, c.y) && !occupied(c.x, c.y, key)) {
        if (drag.it.kind === 'tree') plant(drag.it.t.s, c.x, c.y);
        else placeDeco(drag.it.d.id, juz, c.x, c.y);
        haptic(10);
      } else if (e.type === 'pointerup' && press.moved) toast(lt('learn.cellTaken'));
      if (!press.moved && press.lifted) openItem(drag.it); // held without moving: its card
      drag = null;
    } else if (!press.moved && e.type === 'pointerup') {
      if (press.it) openItem(press.it);
      else if (held) {
        const c = cellOf(p.x, p.y);
        if (inGrid(c.x, c.y) && !occupied(c.x, c.y)) placeHeld(c.x, c.y);
      }
    }
    press = null;
    dirty = true;
    paint();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', (e) => {
    const p = local(e);
    const z = zoom > 1.2 ? 1 : 1.8;
    panX = z === 1 ? 0 : (W / 2 - p.x) * (z - 1);
    panY = z === 1 ? 0 : (H / 2 - p.y) * (z - 1);
    zoom = z;
    clampPan();
    dirty = true;
  });
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom = Math.max(1, Math.min(2.4, zoom * Math.exp(-e.deltaY * 0.01)));
    clampPan();
    dirty = true;
  }, { passive: false });

  // --- the tray: a seed or decoration waiting to be planted ---
  function paintTray() {
    tray.hidden = !held;
    if (!held) return;
    const hd = held;
    const art = hd.kind === 'seed'
      ? vignette(56, (c, x, y, u) => drawTree(c, x, y, u, { s: hd.s, v: tree(hd.s)?.v ?? 0, stage: 0, thirsty: false, t: 0, night: night() }), night(), stageHeight(hd.s, 0))
      : vignette(56, (c, x, y, u) => drawDeco(c, hd.k, x, y, u, 0, night()), night(), decoHeight(hd.k));
    const grip = h('div', { class: 'tray-item', role: 'button', tabindex: '0', 'aria-label': lt('learn.trayAuto') }, art);
    grip.addEventListener('pointerdown', (e) => {
      grip.setPointerCapture(e.pointerId);
      const p = local(e);
      drag = { held: hd, x: p.x, y: p.y, cell: null };
      const startX = e.clientX, startY = e.clientY;
      let moved = false;
      const move = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) moved = true;
        const q = local(ev);
        drag = { held: hd, x: q.x, y: q.y, cell: cellOf(q.x, q.y) };
        dirty = true;
      };
      const up = (ev: PointerEvent) => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        const q = local(ev);
        const c = cellOf(q.x, q.y);
        drag = null;
        dirty = true;
        if (ev.type !== 'pointerup') return;
        if (!moved) { autoPlace(); return; } // a tap: the nearest free square to the middle
        if (inGrid(c.x, c.y) && !occupied(c.x, c.y)) placeHeld(c.x, c.y);
        else if (q.y >= 0 && q.y <= H) toast(lt('learn.cellTaken'));
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); autoPlace(); } });
    const name = hd.kind === 'seed' ? lt('learn.seedOf', { name: surahName(meta[hd.s - 1]) }) : decoName(hd.k);
    tray.replaceChildren(grip,
      h('div', { class: 'tray-txt' }, h('b', {}, name), h('span', { class: 'muted small' }, lt('learn.trayHint'))),
      h('button', { class: 'icon-btn', 'aria-label': t('common.cancel'), onclick: () => { held = null; paintTray(); } }, '✕'));
  }
  function autoPlace() {
    const c = freeCell();
    if (!c) { toast(lt('learn.gardenFull')); return; }
    placeHeld(c.x, c.y);
  }
  function placeHeld(x: number, y: number) {
    if (!held) return;
    if (held.kind === 'seed') {
      plant(held.s, x, y);
      grow = { s: held.s, from: 0, at: 0 };
      toast(lt('learn.planted', { name: surahName(meta[held.s - 1]) }));
    } else placeDeco(held.id, juz, x, y);
    const p = cellCenter(iso, x, y);
    burst(p.x, p.y - iso.th);
    haptic(16);
    held = null;
    paintTray();
    paint();
  }

  // --- below the garden: today's next steps and the trees of this juz ---
  const statusOf = (tr: Readonly<Tree>, m: SurahMeta): string => {
    if (thirsty(tr)) return lt('learn.stThirsty');
    if (tr.full) {
      const days = Math.max(1, Math.ceil((dueAt(tr)! - Date.now()) / DAY));
      return lt(days === 1 ? 'learn.stWatered1' : 'learn.stWatered', { n: days });
    }
    if (tr.learned >= m.ayahs) return lt('learn.stWhole');
    if (tr.learned === 0) return lt('learn.stSeed');
    return lt('learn.stGrowing', { n: tr.learned, of: m.ayahs });
  };
  const mini = (tr: Readonly<Tree>, size = 46) => vignette(size, (c, x, y, u) => drawTree(c, x, y, u, { s: tr.s, v: tr.v, stage: stageOf(tr, meta[tr.s - 1].ayahs), thirsty: thirsty(tr), t: 0, night: night() }), night(), stageHeight(tr.s, stageOf(tr, meta[tr.s - 1].ayahs)));

  function paint() {
    walletBtn.replaceChildren(h('span', { class: 'lt-chip-ic', 'aria-hidden': 'true' }), h('b', {}, new Intl.NumberFormat(locale()).format(wallet())));
    walletBtn.setAttribute('aria-label', lt('learn.walletAria', { n: wallet() }));
    const list = surahsOf(juz);
    const planted = list.filter((m) => (tree(m.n)?.x ?? -1) >= 0).length;
    juzTitle.textContent = lt('learn.juzN', { n: juz });
    juzSub.textContent = list.length
      ? `${surahName(list[0])}${list.length > 1 ? ` – ${surahName(list[list.length - 1])}` : ''} · ${lt('learn.plantedOf', { n: planted, of: list.length })}`
      : lt('learn.noSurahHere');
    prevJ.disabled = juz <= 1;
    nextJ.disabled = juz >= 30;
    wrap.classList.toggle('magic', allFull());
    canvas.setAttribute('aria-label', lt('learn.canvasAria', { n: juz, planted }));
    paintToday();
    paintList();
    dirty = true;
  }

  function paintToday() {
    const placed = trees().filter((x) => x.x >= 0);
    const dry = thirstyTrees();
    const growing = placed.filter((x) => !x.full).sort((a, b) => b.at - a.at);
    const row = (tr: Readonly<Tree>, label: string, sub: string, cls = '') =>
      h('a', { class: `learn-next ${cls}`, href: `#/learn/${tr.s}` }, mini(tr, 44),
        h('span', { class: 'learn-next-t' }, h('b', {}, label), h('span', { class: 'muted small' }, sub)), icon(dir() === 'rtl' ? 'left' : 'right', 18));
    const body: Node[] = [];
    if (dry.length) {
      body.push(h('h3', {}, lt(dry.length === 1 ? 'learn.thirsty1' : 'learn.thirstyN', { n: dry.length })));
      for (const tr of dry.slice(0, 3)) body.push(row(tr, lt('learn.waterName', { name: surahName(meta[tr.s - 1]) }), tr.full ? lt('learn.waterSub') : lt('learn.reviewSub', { n: tr.learned }), 'dry'));
    }
    const g = growing.find((x) => !dry.includes(x));
    if (g) {
      const m = meta[g.s - 1];
      const label = g.learned >= m.ayahs ? lt('learn.wholeName', { name: surahName(m) }) : lt('learn.continueName', { name: surahName(m) });
      let sub = lt('learn.stSeed');
      if (g.learned >= m.ayahs) sub = lt('learn.wholeSub');
      else {
        const c = chunkOf(g, m.ayahs);
        sub = c ? lt(c[0] === c[1] ? 'learn.ayahN' : 'learn.ayatNM', { a: c[0], b: c[1] }) : lt('learn.nextPart');
      }
      if (!dry.length) body.push(h('h3', {}, lt('learn.today')));
      body.push(row(g, label, sub));
    }
    if (!placed.length) {
      body.push(h('h3', {}, lt('learn.startTitle')), h('p', { class: 'muted' }, lt('learn.startSub')),
        h('button', { class: 'primary brand-btn', onclick: () => openStore('seeds') }, lt('learn.openStore')));
      how.open = true;
    } else if (!body.length) body.push(h('h3', {}, lt('learn.allWatered')), h('p', { class: 'muted small' }, lt('learn.allWateredSub')));
    today.replaceChildren(...body);
  }

  function paintList() {
    const here = surahsOf(juz).map((m) => ({ m, tr: tree(m.n) })).filter((x) => x.tr && x.tr.x >= 0) as { m: SurahMeta; tr: Readonly<Tree> }[];
    const shelf = unplacedDecos();
    if (!here.length && !shelf.length) { list.hidden = true; return; }
    list.hidden = false;
    list.replaceChildren(
      here.length ? h('h3', {}, lt('learn.treesHere')) : '',
      ...here.map(({ m, tr }) => h('button', { class: 'learn-row', onclick: () => openTree(m.n) }, mini(tr),
        h('span', { class: 'learn-row-t' }, h('b', {}, surahName(m)), h('span', { class: 'muted small' }, statusOf(tr, m))),
        lang() === 'ar' ? '' : h('span', { class: 'learn-row-ar', lang: 'ar' }, m.ar))),
      shelf.length ? h('h3', {}, lt('learn.toPlace')) : '',
      shelf.length ? h('div', { class: 'learn-shelf' }, ...shelf.map((d) => h('button', {
        class: 'learn-shelf-item', 'aria-label': decoName(d.k), onclick: () => { held = { kind: 'deco', id: d.id, k: d.k }; paintTray(); wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
      }, vignette(52, (c, x, y, u) => drawDeco(c, d.k, x, y, u, 0, night()), night(), decoHeight(d.k)), h('span', { class: 'small' }, decoName(d.k))))) : '');
  }

  function setJuz(j: number) {
    juz = Math.max(1, Math.min(30, j));
    setLastJuz(juz);
    zoom = 1; panX = panY = 0;
    layout();
    paint();
  }

  // --- sheets ---
  const sheet = (cls: string, title: string, ...content: (Node | string)[]) => {
    const d = h('dialog', { class: `sheet bottom learn-sheet ${cls}` },
      h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      ...content);
    d.addEventListener('close', () => { d.remove(); window.removeEventListener('hashchange', shut); });
    const shut = () => d.close();
    window.addEventListener('hashchange', shut);
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
    return d;
  };
  const openItem = (it: Item) => (it.kind === 'tree' ? openTree(it.t.s) : openDeco(it.d));

  async function openTree(s: number) {
    const tr = tree(s);
    if (!tr) return;
    const m = meta[s - 1];
    const stage = stageOf(tr, m.ayahs);
    const next = chunkOf(tr, m.ayahs);
    const action = thirsty(tr) && tr.full ? lt('learn.goWater') : thirsty(tr) ? lt('learn.goReview')
      : next ? lt(next[0] === next[1] ? 'learn.goAyah' : 'learn.goAyat', { a: next[0], b: next[1] })
        : tr.full ? lt('learn.goRecite') : lt('learn.goWhole');
    const pct = Math.round((tr.learned / m.ayahs) * 100);
    const chunks = h('div', { class: 'chips', role: 'group', 'aria-label': lt('learn.chunkLabel') }, ...CHUNK_SIZES.map((c) =>
      h('button', { class: `chip${tr.chunk === c ? ' on' : ''}`, 'aria-pressed': String(tr.chunk === c), onclick: () => { setChunk(s, c); d.close(); void openTree(s); } }, chunkLabel(c))));
    const kinds = h('div', { class: 'learn-varieties' }, ...VARIETIES.map((v) => {
      const own = ownsVariety(s, v.v);
      const art = vignette(64, (c, x, y, u) => drawTree(c, x, y, u, { s, v: v.v, stage: 4, thirsty: false, t: 0, night: night() }), night(), stageHeight(s, 4));
      return h('button', {
        class: `learn-variety r-${v.rarity}${tr.v === v.v ? ' on' : ''}${own ? '' : ' locked'}`, 'aria-pressed': String(tr.v === v.v),
        onclick: () => {
          if (own) { setVariety(s, v.v); d.close(); void openTree(s); return; }
          if (wallet() < v.price) { toast(lt('learn.needMore', { n: v.price - wallet() })); return; }
          if (!confirm(lt('learn.buyVariety', { name: varietyName(v.v), n: v.price }))) return;
          if (buyVariety(s, v.v)) { haptic(16); toast(lt('learn.bought')); d.close(); void openTree(s); }
        },
      }, art, h('span', { class: 'small' }, varietyName(v.v)), h('span', { class: 'learn-price' }, own ? (tr.v === v.v ? '✓' : rarityLabel(v.rarity)) : `✦ ${v.price}`));
    }));
    const d = sheet('learn-tree', surahName(m),
      h('div', { class: 'learn-tree-top' },
        vignette(128, (c, x, y, u) => drawTree(c, x, y, u, { s, v: tr.v, stage, thirsty: thirsty(tr), t: 0, night: night() }), night(), stageHeight(s, stage)),
        h('div', {},
          h('p', { class: 'learn-tree-ar', lang: 'ar' }, m.ar),
          h('p', { class: 'muted small' }, `${lt('learn.juzN', { n: juzOf[s - 1] })} · ${t('common.ayat', { n: m.ayahs })}`),
          h('div', { class: 'learn-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(m.ayahs), 'aria-valuenow': String(tr.learned) }, h('i', { style: `width:${pct}%` })),
          h('p', { class: 'small' }, tr.full ? lt('learn.fullSince', { date: fmtDate(tr.full) }) : lt('learn.learnedOf', { n: tr.learned, of: m.ayahs })),
          h('p', { class: `small learn-status${thirsty(tr) ? ' dry' : ''}` }, statusOf(tr, m)))),
      h('a', { class: 'primary brand-btn learn-go', href: `#/learn/${s}` }, action),
      h('h3', {}, lt('learn.chunkLabel')), chunks,
      h('h3', {}, lt('learn.kinds')), kinds,
      h('div', { class: 'learn-sheet-foot' },
        h('span', { class: 'muted small' }, lt('learn.dragHint')),
        h('button', { class: 'chip', onclick: () => { if (confirm(lt('learn.unplantAsk'))) { unplant(s); d.close(); paint(); } } }, lt('learn.unplant'))));
  }

  function openDeco(dc: Readonly<Deco>) {
    const def = DECOS.find((x) => x.k === dc.k)!;
    const d = sheet('learn-deco', decoName(dc.k),
      h('div', { class: 'learn-tree-top' }, vignette(120, (c, x, y, u) => drawDeco(c, dc.k, x, y, u, 0, night()), night(), decoHeight(dc.k)),
        h('div', {}, h('p', { class: `learn-rarity r-${def.rarity}` }, rarityLabel(def.rarity)), h('p', { class: 'muted small' }, lt(`learn.dd.${dc.k}` as LearnKey)), h('p', { class: 'muted small' }, lt('learn.dragHint')))),
      h('button', { class: 'chip', onclick: () => { storeDeco(dc.id); d.close(); paint(); } }, lt('learn.putAway')));
  }

  function openStore(tab: 'seeds' | 'decos') {
    const bal = h('p', { class: 'learn-bal' });
    const paintBal = () => bal.replaceChildren(h('span', { class: 'lt-chip-ic', 'aria-hidden': 'true' }), h('b', {}, lt('learn.balance', { n: wallet() })), h('span', { class: 'muted small' }, lt('learn.earnHow')));
    paintBal();
    const tabs = h('div', { class: 'tabs-row', role: 'tablist' });
    const body = h('div', { class: 'learn-store-body' });
    const pick = (s: number) => {
      const tr = tree(s);
      d.close();
      if (juzOf[s - 1] !== juz) setJuz(juzOf[s - 1]);
      if (tr && tr.x >= 0) { void openTree(s); return; }
      held = { kind: 'seed', s };
      paintTray();
      wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const seeds = () => {
      const out: Node[] = [];
      for (let j = 1; j <= 30; j++) {
        const list = surahsOf(j);
        const planted = list.filter((m) => (tree(m.n)?.x ?? -1) >= 0).length;
        const sec = h('details', { class: 'learn-juz' }, h('summary', {}, h('b', {}, lt('learn.juzN', { n: j })),
          h('span', { class: 'muted small' }, list.length ? lt('learn.plantedOf', { n: planted, of: list.length }) : lt('learn.noSurahHere'))));
        const fill = () => {
          if (sec.dataset.filled) return;
          sec.dataset.filled = '1';
          if (!list.length) {
            const inside = meta.filter((m) => juzOf[m.n - 1] < j).pop()!;
            sec.append(h('p', { class: 'muted small' }, lt('learn.insideSurah', { name: surahName(inside), n: juzOf[inside.n - 1] })));
            return;
          }
          sec.append(h('div', { class: 'learn-seeds' }, ...list.map((m) => {
            const tr = tree(m.n);
            const state = tr && tr.x >= 0 ? lt('learn.inGarden') : tr ? lt('learn.inStore') : lt('learn.free');
            return h('button', { class: `learn-seed${tr && tr.x >= 0 ? ' has' : ''}`, onclick: () => pick(m.n) },
              vignette(70, (c, x, y, u) => drawTree(c, x, y, u, { s: m.n, v: tr?.v ?? 0, stage: tr ? Math.max(2, stageOf(tr, m.ayahs)) as Stage : 4, thirsty: false, t: 0, night: night() }), night(), stageHeight(m.n, tr ? Math.max(2, stageOf(tr, m.ayahs)) as Stage : 4)),
              h('b', {}, surahName(m)), h('span', { class: 'learn-seed-ar', lang: 'ar' }, m.ar),
              h('span', { class: 'muted small' }, t('common.ayat', { n: m.ayahs })), h('span', { class: `learn-tag${tr ? '' : ' free'}` }, state));
          })));
        };
        sec.addEventListener('toggle', () => { if (sec.open) fill(); });
        if (j === juz) { sec.open = true; fill(); }
        out.push(sec);
      }
      return out;
    };
    const decoTab = () => {
      const shelf = unplacedDecos();
      return [
        shelf.length ? h('p', { class: 'small' }, lt('learn.toPlaceN', { n: shelf.length })) : '',
        h('div', { class: 'learn-decos' }, ...DECOS.map((x) => {
          const can = wallet() >= x.price;
          return h('div', { class: `learn-deco-card r-${x.rarity}` },
            vignette(84, (c, cx, cy, u) => drawDeco(c, x.k, cx, cy, u, 0, night()), night(), decoHeight(x.k)),
            h('b', {}, decoName(x.k)), h('span', { class: `learn-rarity r-${x.rarity}` }, rarityLabel(x.rarity)),
            h('button', {
              class: `chip${can ? ' on' : ''}`, disabled: !can, 'aria-label': lt('learn.buyAria', { name: decoName(x.k), n: x.price }),
              onclick: () => {
                const got = buyDeco(x.k);
                if (!got) return;
                haptic(16);
                d.close();
                held = { kind: 'deco', id: got.id, k: got.k };
                paint();
                paintTray();
                wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
              },
            }, can ? `✦ ${x.price}` : lt('learn.needN', { n: x.price - wallet() })));
        })),
      ];
    };
    const show = (which: 'seeds' | 'decos') => {
      tabs.replaceChildren(
        h('button', { class: `tab${which === 'seeds' ? ' on' : ''}`, role: 'tab', 'aria-selected': String(which === 'seeds'), onclick: () => show('seeds') }, lt('learn.seeds')),
        h('button', { class: `tab${which === 'decos' ? ' on' : ''}`, role: 'tab', 'aria-selected': String(which === 'decos'), onclick: () => show('decos') }, lt('learn.decos')));
      body.replaceChildren(...(which === 'seeds' ? [h('p', { class: 'muted small' }, lt('learn.seedsSub')), ...seeds()] : decoTab()));
    };
    show(tab);
    const d = sheet('learn-store', lt('learn.store'), bal, tabs, body);
  }

  const onChange = () => paint();
  window.addEventListener('garden-changed', onChange);
  window.addEventListener('journey-changed', onChange);
  layout();
  paint();
  paintTray();
  if (grow || held) requestAnimationFrame(() => wrap.scrollIntoView({ block: 'center' }));
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('garden-changed', onChange);
    window.removeEventListener('journey-changed', onChange);
  };
}
