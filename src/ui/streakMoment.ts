// The streak moment (Me tab): plays once a day, the first time Me is opened after a goal lit today's flame — never
// over reading, listening or the tasbih counter. Owner 2026-11-11, with Duolingo's streak animation as the reference
// for the feel (our own flame, colours and timing): yesterday's flame and number wait in grey; the flame melts into a
// puddle that fills with colour, leaps up as a little flame trailing swirling ribbons, dives back down and lands with a
// splash and a shockwave while the number rolls over to today's in colour; then the flame shoots up tall and springs
// back to its resting shape, "day streak" comes in, and this week's row fills today's day. All one canvas, flat solid
// shapes drawn every frame from a few numbers (width, height, lean, squash), so the shapes morph into one another.
// Theme colours (rewardPalette), sound and vibration (sfx). Reduced motion → the end picture, still.
import { t, type Key } from '../i18n';
import { h } from './dom';
import { holdPage } from './juice';
import { sfx } from './sfx';
import { mt, type MomentKey } from '../i18n/moments';
import { fpsStart } from '../fps';
import { isMilestone, milestoneScene } from './milestone';
import './cel.css';
import './streakMoment.css';

export type WeekState = 'lit' | 'frozen' | 'revived' | 'today' | 'missed' | 'future';
export interface WeekDay { day: string; state: WeekState; label: string }

const CHECK = 'M6.5 12.5l3.8 3.8 7.4-8.6';
/** A day's mark: a check in a theme-gradient circle (lit), a snowflake (frozen), or an empty ring. */
export function dayMark(state: WeekState, animate = false): HTMLElement {
  const el = h('span', { class: `me-pip-ic${animate ? ' stamp' : ''}` });
  if (state === 'lit' || state === 'revived') {
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CHECK}" pathLength="1" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else if (state === 'frozen') el.textContent = '❄';
  return el;
}

/** The flame's shape: base half-width `w`, tip height `h`, tip `lean`, left bump height `bump`, vertical squash `sq`. */
interface Shape { w: number; h: number; lean: number; bump: number; sq: number }
const REST: Shape = { w: 66, h: 196, lean: 12, bump: 44, sq: 1 };
const PUDDLE: Shape = { w: 84, h: 88, lean: 0, bump: 0, sq: 0.42 };

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (p: number) => 1 - (1 - clamp(p)) ** 3;
const easeIn = (p: number) => clamp(p) ** 2;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const mixShape = (a: Shape, b: Shape, p: number): Shape => ({ w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p), lean: lerp(a.lean, b.lean, p), bump: lerp(a.bump, b.bump, p), sq: lerp(a.sq, b.sq, p) });
/** A damped spring from `from` to `to`, `s` seconds after release. */
const spring = (from: number, to: number, s: number, f = 2.6, damp = 4.2) => to + (from - to) * Math.exp(-damp * s) * Math.cos(TAU * f * s);

/** Adds the flame outline (standing on (x, y), growing up) to the path. */
function flamePath(c: CanvasRenderingContext2D, x: number, y: number, s: Shape) {
  const { w, h: H, lean, bump } = s;
  const sy = s.sq;
  const P = (px: number, py: number) => [x + px, y + py * sy] as const;
  const T = P(lean, -H), R = P(w, -w * 0.95), B = P(0, 0), L = P(-w, -w * 0.95);
  const K = P(-w * 0.55 + lean * 0.25, -w * 0.95 - bump), N = P(-w * 0.12 + lean * 0.45, -w * 1.05 - bump * 0.35);
  c.moveTo(...T);
  c.bezierCurveTo(T[0] + w * 0.12, T[1] + (R[1] - T[1]) * 0.35, x + w, R[1] - (R[1] - T[1]) * 0.42, ...R);
  c.bezierCurveTo(x + w, y - w * 0.4 * sy, x + w * 0.56, y, ...B);
  c.bezierCurveTo(x - w * 0.56, y, x - w, y - w * 0.4 * sy, ...L);
  c.bezierCurveTo(x - w, L[1] - bump * 0.5 * sy, K[0] - w * 0.22, K[1] + bump * 0.25 * sy, ...K);
  c.bezierCurveTo(K[0] + w * 0.12, K[1] + bump * 0.35 * sy, N[0] - w * 0.06, N[1], ...N);
  c.bezierCurveTo(N[0] + w * 0.1, N[1] - (N[1] - T[1]) * 0.45, T[0] - w * 0.05, T[1] + (N[1] - T[1]) * 0.3, ...T);
  c.closePath();
}

/** A teardrop (round bottom at (x, y), tip `len` above, tilted by `ang`). */
function drop(c: CanvasRenderingContext2D, x: number, y: number, r: number, len: number, ang = 0) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.moveTo(0, -len);
  c.bezierCurveTo(r * 0.3, -len * 0.6, r, -r * 0.6, r, 0);
  c.arc(0, 0, r, 0, Math.PI);
  c.bezierCurveTo(-r, -r * 0.6, -r * 0.3, -len * 0.6, 0, -len);
  c.closePath();
  c.restore();
}

interface Bit { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; kind: 'comma' | 'ember' }

// Beats (ms from the start).
const B = { melt: 520, charge: 820, launch: 1080, apex: 1520, land: 1900, shoot: 1960, settle: 2180, label: 2650, week: 3000, fill: 3350, ok: 3700 };

/** Plays the moment; resolves when it is closed. */
export function streakMoment(days: number, week: WeekDay[], today: string): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = Math.max(0, days - 1);
  const oldNum = h('b', { class: 'sx-n old' }, String(from));
  const newNum = h('b', { class: 'sx-n new' }, String(days));
  const roll = h('span', { class: 'sx-roll' }, oldNum, newNum);
  const cv = h('canvas', { class: 'sx-cv', 'aria-hidden': 'true' });
  const label = h('span', { class: 'sx-label' }, t(days === 1 ? 'me.day' : 'me.days'));
  // This week: lit days joined by a bar, today's circle fills last.
  const pips = week.map((w) => {
    const isToday = w.day === today;
    const on = isToday || w.state === 'lit' || w.state === 'revived';
    return h('span', { class: `sx-pip ${isToday ? 'sx-now' : `sx-${w.state}`}${on && !isToday ? ' sx-on' : ''}` },
      h('span', { class: 'sx-d' }, w.label),
      h('span', { class: 'sx-c' }, isToday ? '' : dayMark(w.state)));
  });
  const row = h('div', { class: 'sx-week' }, ...pips);
  const ok = h('button', { class: 'cel-ok sx-ok' }, t('sm.continue'));
  const title = t((days === 1 ? 'sm.title1' : 'sm.title') as Key, { n: days });
  const sub = h('p', { class: 'sx-sub' }, isMilestone(days) ? mt(`sm.m${days}` as MomentKey) : t(days === 1 ? 'sm.sub1' : 'sm.sub'));
  const el = h('div', { class: `cel go sx${still ? ' done' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
  },
    h('div', { class: 'sx-stage' }, cv),
    h('div', { class: 'sx-count' }, roll, label),
    sub, row, ok);
  const scene = isMilestone(days) ? milestoneScene(days, still) : null;
  if (scene) { el.prepend(scene); el.classList.add('milestone'); }

  return new Promise((resolve) => {
    const frames = still ? null : fpsStart('Streak');
    let closed = false, raf = 0, t0 = 0, last = 0;
    const opened = performance.now();
    const close = () => {
      if (closed) return;
      closed = true;
      frames?.();
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      window.removeEventListener('resize', size);
      el.classList.add('out');
      holdPage(false);
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    ok.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    holdPage(true);
    ok.focus({ preventScroll: true });

    const c = cv.getContext('2d')!;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    let W = 0, Hh = 0, k = 1;
    const size = () => {
      const r = cv.getBoundingClientRect();
      W = r.width; Hh = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      k = Math.min(W / 300, Hh / 400); // drawing units: a 300 × 400 box, the flame standing at its bottom centre
    };
    size();
    window.addEventListener('resize', size);
    const css = getComputedStyle(el);
    const grey = css.getPropertyValue('--sx-grey').trim() || '#c9c9c9';
    const greyIn = css.getPropertyValue('--sx-grey2').trim() || '#e9e9e9';
    // Fire is fire: yellow rim, orange-red heart, a white-hot drop (the same in every theme).
    const col = { o: '#ffc21a', m: '#ff5a1f', c: '#fff6df' };

    // State drawn each frame.
    const bits: Bit[] = [];
    const trail: { x: number; y: number }[] = [];
    let skipped = false;
    const beats: { at: number; run: (skip: boolean) => void; done?: boolean }[] = [
      { at: B.melt, run: (s) => { if (!s) sfx.gather(B.launch - B.melt); } },
      { at: B.launch, run: (s) => { if (!s) { sfx.leap(); fling(0, -20, 6, 260); } } },
      { at: B.land, run: (s) => {
        el.classList.add('rolled');
        if (s) return;
        sfx.slam();
        fling(0, -6, 14, 420, true);
        roll.animate([{ scale: 1 }, { scale: 1.18, offset: 0.35 }, { scale: 0.96, offset: 0.7 }, { scale: 1 }], { duration: 520, easing: 'ease-out' });
      } },
      { at: B.shoot, run: (s) => { if (!s) sfx.ignite(1); } },
      { at: B.label, run: () => el.classList.add('labelled') },
      { at: B.week, run: () => el.classList.add('weeked') },
      { at: B.fill, run: (s) => { el.classList.add('filled'); pips.find((p) => p.classList.contains('sx-now'))?.querySelector('.sx-c')?.append(dayMark('lit', !s)); if (!s) sfx.pop(3); } },
      { at: B.ok, run: () => el.classList.add('done') },
    ];
    const skipToEnd = () => {
      if (skipped) return;
      skipped = true;
      for (const b of beats) if (!b.done) { b.done = true; b.run(true); }
      t0 = performance.now() - B.ok - 600;
    };
    el.addEventListener('click', (e) => {
      if (e.target === ok) return;
      if (el.classList.contains('done') && performance.now() - opened > 1200) close(); else skipToEnd();
    });

    /** Little flame commas thrown out from (x, y) (drawing units, from the flame's foot). */
    function fling(x: number, y: number, n: number, speed: number, flat = false) {
      for (let i = 0; i < n; i++) {
        const a = flat ? (i % 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.8 - (i % 2 ? -0.35 : 0.35) : -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const s = speed * (0.5 + Math.random() * 0.6);
        bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * (flat ? 0.5 : 1) - (flat ? 160 : 0), r: 5 + Math.random() * 6, life: 0, max: 0.55 + Math.random() * 0.4, kind: 'comma' });
      }
    }

    /** The head of the leap at time `tt` (drawing units). */
    const headAt = (tt: number) => {
      const u = clamp((tt - B.launch) / (B.land - B.launch));
      // Up on a widening spiral, then a dive straight down.
      const up = u < 0.55 ? ease(u / 0.55) : 1 - easeIn((u - 0.55) / 0.45);
      const y = -40 - 270 * up;
      const swirl = Math.sin(u * TAU * 1.6) * 74 * Math.sin(Math.PI * Math.min(1, u * 1.3));
      return { x: swirl, y, u };
    };

    const draw = (tt: number, dt: number) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(dpr * k, 0, 0, dpr * k, (dpr * W) / 2, dpr * (Hh - 12 * k));
      // Ground shadow.
      let s: Shape;
      let lit = 1; // 0 grey … 1 coloured
      let showFlame = true;
      if (tt < B.melt) { s = REST; lit = 0; }
      else if (tt < B.charge) { s = mixShape(REST, PUDDLE, easeIn((tt - B.melt) / (B.charge - B.melt))); lit = 0; }
      else if (tt < B.launch) {
        const p = (tt - B.charge) / (B.launch - B.charge);
        s = { ...PUDDLE, sq: PUDDLE.sq * (1 - 0.18 * Math.sin(p * Math.PI)), w: PUDDLE.w * (1 + 0.08 * Math.sin(p * Math.PI)) };
        lit = ease(p * 1.4);
      } else if (tt < B.land) { s = PUDDLE; showFlame = false; }
      else if (tt < B.shoot) { s = { w: 96, h: 80, lean: 0, bump: 0, sq: lerp(0.3, 0.5, (tt - B.land) / (B.shoot - B.land)) }; }
      else if (tt < B.settle) {
        const p = ease((tt - B.shoot) / (B.settle - B.shoot));
        s = { w: lerp(96, 50, p), h: lerp(40, 330, p), lean: lerp(0, -8, p), bump: lerp(0, 90, p), sq: lerp(0.5, 1, p) };
      } else {
        const sec = (tt - B.settle) / 1000;
        const fl = Math.sin(tt / 210) * 0.035 + Math.sin(tt / 83) * 0.015;
        s = { w: spring(50, REST.w, sec, 2.2, 4.4), h: spring(330, REST.h, sec, 2.4, 4) * (1 + fl), lean: spring(-8, REST.lean, sec, 1.6, 3) + Math.sin(tt / 340) * 5,
          bump: spring(90, REST.bump, sec, 2.8, 4) * (1 + Math.sin(tt / 170 + 1) * 0.08), sq: 1 };
      }
      const groundW = (showFlame ? s.w : 44) * (tt >= B.launch && tt < B.land ? 0.6 + 0.4 * Math.abs(headAt(tt).u * 2 - 1) : 1);
      c.fillStyle = 'rgba(0,0,0,.12)';
      c.beginPath(); c.ellipse(0, 4, groundW * 1.15, 9, 0, 0, TAU); c.fill();

      // Shockwave on landing: a half ring opening out.
      if (tt >= B.land && tt < B.land + 600) {
        const p = (tt - B.land) / 600;
        c.strokeStyle = col.o; c.globalAlpha = 1 - p; c.lineWidth = 16 * (1 - p) + 2;
        c.beginPath(); c.ellipse(0, -10, 50 + 140 * ease(p), 40 + 130 * ease(p), 0, Math.PI, TAU); c.stroke();
        c.globalAlpha = 1;
      }

      if (showFlame) {
        // Rim, then the deeper middle, then the white drop.
        c.fillStyle = lit < 1 ? grey : col.o;
        c.beginPath(); flamePath(c, 0, 0, s); c.fill();
        if (lit > 0 && lit < 1) { c.globalAlpha = lit; c.fillStyle = col.o; c.beginPath(); flamePath(c, 0, 0, s); c.fill(); c.globalAlpha = 1; }
        const inner = { w: s.w * 0.66, h: s.h * 0.68, lean: s.lean * 0.6, bump: s.bump * 0.55, sq: s.sq };
        c.globalAlpha = lit; c.fillStyle = col.m; c.beginPath(); flamePath(c, 0, -s.w * 0.06 * s.sq, inner); c.fill(); c.globalAlpha = 1;
        const dr = s.w * 0.24, dl = Math.max(dr * 1.6, s.h * 0.32);
        c.fillStyle = lit < 1 ? greyIn : col.c;
        c.beginPath(); drop(c, s.lean * 0.15, -dr * 1.15 * s.sq, dr, dl * s.sq); c.fill();
      }

      // The leap: a little flame trailing ribbons.
      if (tt >= B.launch && tt < B.land + 40) {
        const hd = headAt(tt);
        trail.push({ x: hd.x, y: hd.y });
        if (trail.length > 16) trail.shift();
        ribbon(trail, 22, col.o, 0);
        ribbon(trail, 12, col.m, 0);
        // A second ribbon spinning round the first.
        const ph = tt / 70;
        const twin = trail.map((p, i) => ({ x: p.x + Math.cos(ph - i * 0.5) * 40 * (i / trail.length), y: p.y + Math.sin(ph - i * 0.5) * 14 }));
        ribbon(twin, 10, col.o, 0);
        const ang = trail.length > 2 ? Math.atan2(hd.x - trail[trail.length - 3].x, -(hd.y - trail[trail.length - 3].y)) : 0;
        c.fillStyle = col.o; c.beginPath(); drop(c, hd.x, hd.y, 21, 52, ang); c.fill();
        c.fillStyle = col.m; c.beginPath(); drop(c, hd.x, hd.y + 3, 13, 30, ang); c.fill();
        c.fillStyle = col.c; c.beginPath(); drop(c, hd.x, hd.y + 5, 6, 14, ang); c.fill();
        if (Math.random() < dt * 22) bits.push({ x: hd.x, y: hd.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.3) * 160, r: 4 + Math.random() * 4, life: 0, max: 0.5, kind: 'comma' });
      } else trail.length = 0;

      // Embers rising off the flame while it burns.
      if (tt > B.settle && Math.random() < dt * 4) bits.push({ x: (Math.random() - 0.5) * 40, y: -REST.h * 0.8, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 50, r: 3 + Math.random() * 2.5, life: 0, max: 1.2, kind: 'ember' });

      let j = 0;
      for (const b of bits) {
        b.life += dt;
        if (b.life >= b.max) continue;
        b.vx *= 1 - 2 * dt; b.vy = b.vy * (1 - 2 * dt) + (b.kind === 'comma' ? 380 : -10) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const f = b.life / b.max, r = b.r * (f < 0.2 ? 0.5 + f * 2.5 : 1 - (f - 0.2) / 0.8);
        if (b.kind === 'ember') { c.fillStyle = col.o; c.globalAlpha = 1 - f; c.beginPath(); c.arc(b.x, b.y, r * 0.8, 0, TAU); c.fill(); c.globalAlpha = 1; }
        else { c.fillStyle = col.o; c.beginPath(); drop(c, b.x, b.y, Math.max(0.1, r), Math.max(0.2, r) * 2.4, Math.atan2(b.vx, -b.vy) + Math.PI); c.fill(); }
        bits[j++] = b;
      }
      bits.length = j;
    };

    /** A ribbon along the points (oldest first), widest at the head, tapering to nothing. */
    function ribbon(pts: { x: number; y: number }[], wd: number, color: string, _o: number) {
      if (pts.length < 3) return;
      const L: [number, number][] = [], R: [number, number][] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let nx = -(b.y - a.y), ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
        const ww = wd * (i / (pts.length - 1)) ** 1.3;
        L.push([pts[i].x + nx * ww, pts[i].y + ny * ww]); R.push([pts[i].x - nx * ww, pts[i].y - ny * ww]);
      }
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(...L[0]);
      for (const p of L) c.lineTo(...p);
      for (let i = R.length - 1; i >= 0; i--) c.lineTo(...R[i]);
      c.closePath();
      c.fill();
    }

    if (still) {
      for (const b of beats) { b.done = true; b.run(true); }
      draw(B.settle + 4000, 0);
      return;
    }
    const frame = (time: number) => {
      if (closed) return;
      if (!t0) t0 = time;
      const tt = time - t0;
      for (const b of beats) if (!b.done && tt >= b.at) { b.done = true; b.run(false); }
      draw(tt, Math.min(0.05, (time - (last || time)) / 1000));
      last = time;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}
