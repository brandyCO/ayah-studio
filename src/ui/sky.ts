// Home sky (docs/light.md, L6): ☰ → Sky (and the Today card). A full-screen night where the pages
// read this month are stars on 30 threads (one per juz) rising out of a cloud sea along a winding
// avenue, the Khatm circles float above as rings and Noor keeps the viewer company. The sky opens
// with a fly-in down to the juz read most recently. Swipe up/down (wheel, ↑↓) to travel along the
// avenue, sideways (←→) to swing round it — soft, with a gentle glide after letting go. Tap a star
// → that page, a ring or its name → that circle. Calm text only: the month and how many pages lit
// up — no streaks, no comparison. three.js loads only here; reduced motion / no WebGL / a slow
// device → the flat picture (src/light/flatSky.ts), panned sideways.
import { loadMushaf } from '../data/mushaf';
import { monthReads } from '../data/readLog';
import { locale, t } from '../i18n';
import { flatProject, paintSkyFlat, type FlatCircle, type FlatStar } from '../light/flatSky';
import { circleSpot, CIRCLE_R as FLAT_CIRCLE_R, JUZ_STEP, LOOK_MAX, pageSpots, starLook, type Spot } from '../light/skyLayout';
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

const YAW_MAX = 0.75;
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
  const lit = new Set(reads.keys());
  // Open at the page read most recently this month (or the page the mushaf shows).
  let face = ctx.current, faceDay = -1;
  for (const [p, r] of reads) if (r.last > faceDay || (r.last === faceDay && p > face)) { face = p; faceDay = r.last; }
  const faceJuz = juzOfPage[face] ?? 1;

  // View state: 3D travels along the avenue (focus in juz) and swings round it (yaw); flat pans (look).
  const view = { focus: faceJuz, yaw: 0, look: clamp(spots[face]?.off ?? 0, -LOOK_MAX, LOOK_MAX) };
  const target = { ...view };
  let vel = { focus: 0, yaw: 0 };
  let dragging = false;

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
      spot: circleSpot(i, circles.length, view.look),
      at: clamp(faceJuz + 0.6 + (i - (circles.length - 1) / 2) * 2.2, 1, 30),
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
  window.setTimeout(() => hint.classList.add('gone'), 7000);

  // --- 3D, or the flat picture ---
  type Mod = typeof import('../light/scenes/homeSky');
  let stage: import('../light/engine').LightStage | null = null;
  let sc: ReturnType<Mod['homeSkyScene']> | null = null;
  let positions: import('three').Vector3[] = [];
  let V: import('three').Vector3 | null = null;
  const flatStars: FlatStar[] = [];
  const flatCircles: FlatCircle[] = skyCircles;
  for (let p = 1; p < spots.length; p++) {
    const s = stars.find((x) => x.page === p);
    flatStars.push({
      spot: spots[p], lit: !!s, bright: s?.bright ?? 0, size: s?.size ?? 1, warm: s?.warm ?? 0,
      next: s && lit.has(p + 1) && juzOfPage[p + 1] === juzOfPage[p] ? spots[p + 1] : undefined,
    });
  }
  let flatRaf = 0;
  const paintFlat = () => {
    cancelAnimationFrame(flatRaf);
    flatRaf = requestAnimationFrame(() => {
      view.look = target.look;
      paintSkyFlat(canvas, view.look, flatStars, flatCircles);
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

  /** Each frame (3D): the glide after letting go, then ease the view towards its target. */
  function glide() {
    if (!sc) return;
    if (!dragging) {
      target.focus = clamp(target.focus + vel.focus, 1, 30);
      target.yaw = clamp(target.yaw + vel.yaw, -YAW_MAX, YAW_MAX);
      vel = { focus: vel.focus * 0.92, yaw: vel.yaw * 0.9 };
    }
    const k = dragging ? 0.16 : 0.06;
    view.focus += (target.focus - view.focus) * k;
    view.yaw += (target.yaw - view.yaw) * k;
    sc.input.focus = view.focus;
    sc.input.yaw = view.yaw;
  }

  function bindPointer() {
    let start = { x: 0, y: 0, focus: 0, yaw: 0, look: 0, moved: false };
    let last = { x: 0, y: 0, at: 0 };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      dragging = true;
      vel = { focus: 0, yaw: 0 };
      start = { x: e.clientX, y: e.clientY, focus: target.focus, yaw: target.yaw, look: target.look, moved: false };
      last = { x: e.clientX, y: e.clientY, at: performance.now() };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 6) start.moved = true;
      const now = performance.now(), dt = Math.max(8, now - last.at);
      if (sc) {
        // Swipe up = onwards (later juz); sideways = swing round the avenue.
        target.focus = clamp(start.focus - dy / 110, 1, 30);
        target.yaw = clamp(start.yaw - dx * 0.0045, -YAW_MAX, YAW_MAX);
        vel = { focus: clamp((-(e.clientY - last.y) / 110) * (16 / dt), -0.06, 0.06), yaw: clamp(-(e.clientX - last.x) * 0.0045 * (16 / dt), -0.012, 0.012) };
      } else {
        const k = 0.95 / (canvas.clientHeight * 0.66);
        target.look = clamp(start.look - dx * k, -LOOK_MAX, LOOK_MAX);
        paintFlat();
      }
      last = { x: e.clientX, y: e.clientY, at: now };
    });
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - last.at > 80 || !sc) vel = { focus: 0, yaw: 0 };
      if (!start.moved) pickAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (sc) target.focus = clamp(target.focus + e.deltaY / 260, 1, 30);
      else {
        target.look = clamp(target.look + (e.deltaX || e.deltaY) * (0.95 / (canvas.clientHeight * 0.66)), -LOOK_MAX, LOOK_MAX);
        paintFlat();
      }
    }, { passive: false });
  }

  // --- where things are on screen (null: behind the viewer) ---
  const pt = { x: 0, y: 0 };
  function project(v: import('three').Vector3): { x: number; y: number } | null {
    const p = v.project(sc!.camera);
    if (p.z > 1) return null;
    pt.x = ((p.x + 1) / 2) * canvas.clientWidth;
    pt.y = ((1 - p.y) / 2) * canvas.clientHeight;
    return pt;
  }
  const pageScreen = (p: number) => (sc ? project(V!.copy(positions[p])) : flatProject(spots[p], view.look, canvas.clientWidth, canvas.clientHeight));
  function circleScreen(i: number, below: boolean) {
    const c = skyCircles[i];
    if (!sc) return flatProject({ off: c.spot.off, el: c.spot.el - (below ? FLAT_CIRCLE_R + 0.025 : 0) } as Spot, view.look, canvas.clientWidth, canvas.clientHeight);
    sc.circleAt(i, V!);
    if (below) V!.y -= 2.0;
    return project(V!);
  }

  let shownJuz = 0;
  function placeLabels() {
    if (sc) sc.camera.updateMatrixWorld();
    skyCircles.forEach((_, i) => {
      const p = circleScreen(i, true);
      const el = circleLabels[i];
      el.hidden = !p || p.x < -60 || p.x > canvas.clientWidth + 60 || p.y < 60 || p.y > canvas.clientHeight;
      if (p) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, 0)`;
    });
    const j = sc ? clamp(Math.round(view.focus), 1, 30) : clamp(Math.round(15.5 - view.look / JUZ_STEP), 1, 30);
    if (j !== shownJuz) { shownJuz = j; juzLabel.textContent = t('circ.juz', { n: j }); }
  }

  /** The star nearest to the tap (lit stars within 30 px first, then any page within 14 px), or a ring. */
  function pickAt(cx: number, cy: number) {
    const b = canvas.getBoundingClientRect();
    const x = cx - b.left, y = cy - b.top;
    if (sc) sc.camera.updateMatrixWorld();
    let best = 0, bestD = Infinity;
    for (let p = 1; p < spots.length; p++) {
      const s = pageScreen(p);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y) - (lit.has(p) ? 16 : 0);
      if (d < bestD && d < 14) { bestD = d; best = p; }
    }
    if (best) { close(); ctx.goToPage(best); return; }
    for (let i = 0; i < skyCircles.length; i++) {
      const s = circleScreen(i, false);
      if (!s) continue;
      const sx = s.x, sy = s.y;
      let rr = 60;
      if (sc) {
        sc.circleAt(i, V!);
        V!.x += 2.3;
        const e = project(V!);
        if (e) rr = Math.abs(e.x - sx) + 18;
      }
      if (Math.hypot(sx - x, sy - y) < rr) { close(); ctx.openCircle(skyCircles[i].id); return; }
    }
  }

  if (quality === 'flat') flat();
  else {
    try {
      const [{ LightStage }, mod, three] = await Promise.all([import('../light/engine'), import('../light/scenes/homeSky'), import('three')]);
      if (!root.isConnected) return;
      V = new three.Vector3();
      positions = mod.pagePositions(juzOfPage);
      sc = mod.homeSkyScene(positions);
      sc.setStars(stars);
      sc.setCircles(skyCircles);
      sc.input.focus = view.focus;
      const t0 = performance.now();
      stage = new LightStage(canvas, sc, {
        quality,
        clock: () => (performance.now() - t0) / 1000 + 20,
        beforeFrame: () => glide(),
        afterFrame: () => placeLabels(),
        onFallback: () => { console.warn('Home sky: too slow for 3D, flat version'); flat(); },
      });
      sc.input.openedAt = stage.now();
      bindPointer();
      stage.start();
    } catch (e) {
      console.warn('Home sky: flat version', e);
      flat();
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close();
    const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const f = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
    if (!d && !f) return;
    if (sc) {
      target.focus = clamp(target.focus + f, 1, 30);
      target.yaw = clamp(target.yaw + d * 0.2, -YAW_MAX, YAW_MAX);
    } else if (d) {
      target.look = clamp(target.look + d * JUZ_STEP, -LOOK_MAX, LOOK_MAX);
      paintFlat();
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
