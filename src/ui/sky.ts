// Home sky (docs/light.md, L6): ☰ → Sky (and the Today card). A full-screen night sky where the
// pages read this month are stars, the Khatm circles hang as small rings and Noor floats near the
// viewer. Drag to look around (soft, with a gentle glide after letting go), tap a star → that page,
// tap a ring → that circle. Calm text only: the month and how many pages lit up — no streaks, no
// comparison. three.js loads only here; reduced motion / no WebGL / a slow device → the flat picture.
import { loadMushaf } from '../data/mushaf';
import { monthReads } from '../data/readLog';
import { locale, t } from '../i18n';
import { flatProject, paintSkyFlat, type FlatCircle, type FlatStar } from '../light/flatSky';
import { circleSpot, CIRCLE_R, JUZ_STEP, juzOff, LOOK_MAX, pageSpots, starLook, type Spot } from '../light/skyLayout';
import { lightQuality } from '../light/support';
import { cachedCircles, MEMBER_COLORS } from '../together/circles';
import { h } from './dom';
import { icon } from './icons';

export interface SkyContext {
  /** The page the mushaf shows (the sky opens over its juz when nothing was read yet). */
  current: number;
  goToPage(page: number): void;
  openCircle(id: string): void;
}

let open: (() => void) | null = null;

const PITCH_MIN = 0.05, PITCH_MAX = 0.75;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Pages read this month (for the Today card). */
export const skyCount = () => monthReads().size;

export async function openSky(ctx: SkyContext) {
  if (open) return;
  open = () => {};
  const [quality, mushaf] = await Promise.all([lightQuality(), loadMushaf()]);
  const juzOfPage = [0, ...mushaf.pages.map((p) => p.juz)];
  const spots = pageSpots(juzOfPage);
  const now = new Date();
  const reads = monthReads(now);
  const today = now.getDate();
  const stars = [...reads].map(([page, r]) => ({ page, ...starLook(r.days, r.last, today) }));
  // Open facing the page read most recently this month (or the page the mushaf shows).
  let face = ctx.current, faceDay = -1;
  for (const [p, r] of reads) if (r.last > faceDay || (r.last === faceDay && p > face)) { face = p; faceDay = r.last; }
  let look = clamp(spots[face]?.off ?? juzOff(1), -LOOK_MAX, LOOK_MAX);
  let pitch = 0.3;
  let target = { look, pitch };

  const circles = cachedCircles().filter((s) => s.circle.kind !== 'family').slice(0, 8);
  const skyCircles = circles.map((s, i) => {
    const color = (uid: string | null) => {
      const m = s.members.find((x) => x.user_id === uid);
      return m ? MEMBER_COLORS[m.color % MEMBER_COLORS.length] : '#c9c3e6';
    };
    const byJuz = new Map(s.parts.map((p) => [p.juz, p]));
    return {
      id: s.circle.id,
      name: s.circle.name,
      spot: circleSpot(i, circles.length, look),
      stars: Array.from({ length: 30 }, (_, j) => {
        const p = byJuz.get(j + 1);
        return { status: p?.status ?? 'free' as const, color: color(p?.user_id ?? null) };
      }),
    };
  });

  // --- the screen ---
  let canvas = h('canvas', { class: 'home-sky-canvas', 'aria-hidden': 'true' });
  const labels = h('div', { class: 'home-sky-labels' });
  const circleLabels = skyCircles.map((c) => {
    const el = h('button', { class: 'home-sky-ring-label', onclick: () => { close(); ctx.openCircle(c.id); } }, c.name);
    labels.append(el);
    return el;
  });
  const monthName = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(now);
  const n = reads.size;
  const juzLabel = h('div', { class: 'home-sky-juz' });
  const hint = h('div', { class: 'home-sky-hint' }, n ? t('sky.hint') : '');
  const root = h('div', { class: 'home-sky', role: 'dialog', 'aria-label': t('sky.title') },
    canvas, labels,
    h('div', { class: 'home-sky-head' },
      h('button', { class: 'icon-btn home-sky-btn', 'aria-label': t('sky.close'), onclick: () => close() }, icon('close', 22)),
      h('div', { class: 'home-sky-titles' },
        h('h2', { class: 'home-sky-title' }, t('sky.title')),
        h('p', { class: 'home-sky-month' }, monthName),
        h('p', { class: 'home-sky-count' }, n === 0 ? t('sky.empty') : n === 1 ? t('sky.count1') : t('sky.count', { n })))),
    h('div', { class: 'home-sky-foot' }, juzLabel, hint));
  document.body.append(root);
  document.body.classList.add('home-sky-open');
  window.setTimeout(() => hint.classList.add('gone'), 6000);

  // --- 3D, or the flat picture ---
  type Sc = ReturnType<typeof import('../light/scenes/homeSky').homeSkyScene>;
  let stage: import('../light/engine').LightStage | null = null;
  let sc: Sc | null = null;
  let spotDir: typeof import('../light/scenes/homeSky').spotDir | null = null;
  let SKY_R = 100;
  const flatStars: FlatStar[] = [];
  const flatCircles: FlatCircle[] = skyCircles;
  const lit = new Set(reads.keys());
  for (let p = 1; p < spots.length; p++) {
    const s = stars.find((x) => x.page === p);
    flatStars.push({
      spot: spots[p], lit: !!s, bright: s?.bright ?? 0, size: s?.size ?? 1, warm: s?.warm ?? 0,
      next: s && lit.has(p + 1) && juzOfPage[p + 1] === juzOfPage[p] ? spots[p + 1] : undefined,
    });
  }
  let flatRaf = 0;
  let vel = { look: 0, pitch: 0 };
  let dragging = false;
  const paintFlat = () => {
    cancelAnimationFrame(flatRaf);
    flatRaf = requestAnimationFrame(() => {
      look = target.look;
      paintSkyFlat(canvas, look, flatStars, flatCircles);
      placeLabels();
    });
  };
  const flat = () => {
    stage?.dispose();
    stage = null;
    sc = null;
    root.classList.add('is-flat');
    const c2 = h('canvas', { class: 'home-sky-canvas', 'aria-hidden': 'true' });
    canvas.replaceWith(c2);
    canvas = c2;
    bindPointer();
    paintFlat();
  };

  // --- looking around: drag (soft), a glide after letting go, wheel and arrow keys ---
  function glide() {
    if (!sc) return;
    if (!dragging) {
      target.look = clamp(target.look + vel.look, -LOOK_MAX, LOOK_MAX);
      target.pitch = clamp(target.pitch + vel.pitch, PITCH_MIN, PITCH_MAX);
      vel = { look: vel.look * 0.9, pitch: vel.pitch * 0.9 };
    }
    const k = dragging ? 0.22 : 0.08;
    look += (target.look - look) * k;
    pitch += (target.pitch - pitch) * k;
    sc.input.look = look;
    sc.input.pitch = pitch;
    placeLabels();
  }
  const radPerPx = () => (sc ? (2 * Math.atan(Math.tan((sc.camera.fov * Math.PI) / 360) * sc.camera.aspect)) / Math.max(1, canvas.clientWidth) : 0.95 / (canvas.clientHeight * 0.66));

  function bindPointer() {
    let start = { x: 0, y: 0, look: 0, pitch: 0, moved: false, at: 0 };
    let last = { x: 0, y: 0, at: 0 };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      dragging = true;
      vel = { look: 0, pitch: 0 };
      start = { x: e.clientX, y: e.clientY, look: target.look, pitch: target.pitch, moved: false, at: performance.now() };
      last = { x: e.clientX, y: e.clientY, at: start.at };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 6) start.moved = true;
      const k = radPerPx();
      target.look = clamp(start.look - dx * k, -LOOK_MAX, LOOK_MAX);
      target.pitch = clamp(start.pitch + dy * k, PITCH_MIN, PITCH_MAX);
      const now = performance.now(), dt = Math.max(8, now - last.at);
      // Per-frame glide speed from the last movement (≈ 16 ms a frame), kept gentle.
      vel = { look: clamp((-(e.clientX - last.x) * k * 16) / dt, -0.012, 0.012), pitch: clamp(((e.clientY - last.y) * k * 16) / dt, -0.008, 0.008) };
      last = { x: e.clientX, y: e.clientY, at: now };
      if (!sc) paintFlat();
    });
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - last.at > 80) vel = { look: 0, pitch: 0 };
      if (!sc) vel = { look: 0, pitch: 0 };
      if (!start.moved) pickAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      target.look = clamp(target.look + (e.deltaX || e.deltaY) * radPerPx(), -LOOK_MAX, LOOK_MAX);
      if (!sc) paintFlat();
    }, { passive: false });
  }

  // --- where a sky spot is on screen (null: behind the viewer) ---
  const v = { x: 0, y: 0 };
  function screenOf(s: Spot): { x: number; y: number } | null {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!sc || !spotDir) return flatProject(s, look, W, H);
    const d = spotDir(s).multiplyScalar(SKY_R).add(sc.camera.position).project(sc.camera);
    if (d.z > 1) return null;
    v.x = ((d.x + 1) / 2) * W;
    v.y = ((1 - d.y) / 2) * H;
    return v;
  }

  let shownJuz = 0;
  function placeLabels() {
    if (sc) sc.camera.updateMatrixWorld();
    skyCircles.forEach((c, i) => {
      const p = screenOf({ off: c.spot.off, el: c.spot.el - CIRCLE_R - 0.025 });
      const el = circleLabels[i];
      el.hidden = !p || p.x < -60 || p.x > canvas.clientWidth + 60;
      if (p) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, 0)`;
    });
    const j = clamp(Math.round(15.5 - look / JUZ_STEP), 1, 30);
    if (j !== shownJuz) { shownJuz = j; juzLabel.textContent = t('circ.juz', { n: j }); }
  }

  /** The star nearest to the tap (lit stars within 30 px first, then any page within 14 px), or a ring. */
  function pickAt(cx: number, cy: number) {
    const b = canvas.getBoundingClientRect();
    const x = cx - b.left, y = cy - b.top;
    if (sc) sc.camera.updateMatrixWorld();
    let best = 0, bestD = Infinity;
    for (let p = 1; p < spots.length; p++) {
      const s = screenOf(spots[p]);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y) - (lit.has(p) ? 16 : 0);
      if (d < bestD && d < 14) { bestD = d; best = p; }
    }
    if (best) { close(); ctx.goToPage(best); return; }
    for (const c of skyCircles) {
      const s = screenOf(c.spot);
      const edge = screenOf({ off: c.spot.off, el: c.spot.el + CIRCLE_R });
      if (!s || !edge) continue;
      const cxs = s.x, cys = s.y, rr = Math.abs(edge.y - cys) + 18;
      if (Math.hypot(cxs - x, cys - y) < rr) { close(); ctx.openCircle(c.id); return; }
    }
  }

  if (quality === 'flat') flat();
  else {
    try {
      const [{ LightStage }, mod] = await Promise.all([import('../light/engine'), import('../light/scenes/homeSky')]);
      if (!root.isConnected) return;
      sc = mod.homeSkyScene(spots);
      spotDir = mod.spotDir;
      SKY_R = mod.SKY_R;
      sc.setStars(stars);
      sc.setCircles(skyCircles);
      sc.input.look = look;
      sc.input.pitch = pitch;
      const t0 = performance.now();
      stage = new LightStage(canvas, sc, {
        quality,
        clock: () => (performance.now() - t0) / 1000 + 20,
        beforeFrame: () => glide(),
        onFallback: () => { console.warn('Home sky: too slow for 3D, flat version'); flat(); },
      });
      bindPointer();
      stage.start();
    } catch (e) {
      console.warn('Home sky: flat version', e);
      flat();
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      target.look = clamp(target.look + (e.key === 'ArrowLeft' ? -1 : 1) * JUZ_STEP, -LOOK_MAX, LOOK_MAX);
      if (!sc) paintFlat();
    }
  };
  const onResize = () => { if (!sc) paintFlat(); };
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  addEventListener('hashchange', close);

  function close() {
    if (!open) return;
    open = null;
    stage?.dispose();
    stage = null;
    sc = null;
    cancelAnimationFrame(flatRaf);
    removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    removeEventListener('hashchange', close);
    root.classList.add('out');
    document.body.classList.remove('home-sky-open');
    setTimeout(() => root.remove(), 600);
  }
  open = close;
}
