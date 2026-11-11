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
import { drawFire, themeFire, type Shape } from './flatFire';

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

const REST: Shape = { w: 66, h: 170, lean: 9, bump: 52, sq: 1 };
const PUDDLE: Shape = { w: 84, h: 88, lean: 0, bump: 0, sq: 0.42 };

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (p: number) => 1 - (1 - clamp(p)) ** 3;
const easeIn = (p: number) => clamp(p) ** 2;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const mixShape = (a: Shape, b: Shape, p: number): Shape => ({ w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p), lean: lerp(a.lean, b.lean, p), bump: lerp(a.bump, b.bump, p), sq: lerp(a.sq, b.sq, p) });
/** A damped spring from `from` to `to`, `s` seconds after release. */
const spring = (from: number, to: number, s: number, f = 2.6, damp = 4.2) => to + (from - to) * Math.exp(-damp * s) * Math.cos(TAU * f * s);

interface Bit { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; kind: 'comma' | 'ember' }

// Beats (ms from the start).
const B = { melt: 520, charge: 820, launch: 1080, apex: 1520, land: 1900, shoot: 1960, settle: 2180, label: 2650, week: 3000, fill: 3350, ok: 3700 };

/** Plays the moment; resolves when it is closed. */
export function streakMoment(days: number, week: WeekDay[], today: string, face = false): Promise<void> {
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
    // The theme's flame: light outer flame, deeper heart, a white drop.
    const FIRE = themeFire();
    const col = { o: FIRE.inBottom, m: FIRE.inTop, m2: FIRE.bottom, c: FIRE.core };

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
      c.fillStyle = tt < B.charge ? 'rgba(0,0,0,.1)' : FIRE.bottom;
      c.globalAlpha = tt < B.charge ? 1 : 0.3;
      c.beginPath(); c.ellipse(0, 4, groundW * 1.2, 10, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;

      // Shockwave on landing: a half ring opening out.
      if (tt >= B.land && tt < B.land + 600) {
        const p = (tt - B.land) / 600;
        c.strokeStyle = col.o; c.globalAlpha = 1 - p; c.lineWidth = 16 * (1 - p) + 2;
        c.beginPath(); c.ellipse(0, -10, 50 + 140 * ease(p), 40 + 130 * ease(p), 0, Math.PI, TAU); c.stroke();
        c.globalAlpha = 1;
      }

      if (showFlame) {
        // Grey while it waits, the colours coming in over it.
        drawFire(c, 0, 0, s, { rim: grey, top: greyIn, bottom: greyIn, inTop: grey, inBottom: grey, core: '#ffffff' });
        if (lit > 0) { c.globalAlpha = lit; drawFire(c, 0, 0, s, FIRE); c.globalAlpha = 1; }
        if (face && tt > B.settle + 150) drawFace(s, tt, clamp((tt - B.settle - 150) / 250));
      }

      // The leap: a little flame trailing ribbons.
      if (tt >= B.launch && tt < B.land + 40) {
        const hd = headAt(tt);
        trail.push({ x: hd.x, y: hd.y });
        if (trail.length > 16) trail.shift();
        ribbon(trail, 9, col.o, 0);
        // A second ribbon spinning round the first.
        const ph = tt / 70;
        const twin = trail.map((p, i) => ({ x: p.x + Math.cos(ph - i * 0.5) * 40 * (i / trail.length), y: p.y + Math.sin(ph - i * 0.5) * 14 }));
        ribbon(twin, 4, col.o, 0);
        const ang = trail.length > 2 ? Math.atan2(hd.x - trail[trail.length - 3].x, -(hd.y - trail[trail.length - 3].y)) : 0;
        c.save(); c.translate(hd.x, hd.y + 18); c.rotate(ang * 0.35);
        drawFire(c, 0, 0, { w: 15, h: 44, lean: 3, bump: 12, sq: 1 }, FIRE);
        c.restore();
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
        else { c.fillStyle = col.o; c.beginPath(); c.arc(b.x, b.y, Math.max(0.1, r) * 0.75, 0, TAU); c.fill(); }
        bits[j++] = b;
      }
      bits.length = j;
    };

    /** Two round eyes with a shine, rosy cheeks and a small smile on the flame's body; it blinks now and then. */
    function drawFace(sh: Shape, tt: number, a: number) {
      const cx = sh.lean * 0.12, cy = -sh.w * 1.3;
      const e = sh.w * 0.13, gap = sh.w * 0.34;
      const ph = tt % 3400, blink = ph < 130 ? Math.abs(ph - 65) / 65 : 1;
      c.globalAlpha = a;
      c.fillStyle = 'rgba(255, 120, 120, .45)';
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(cx + sx * gap * 1.35, cy + e * 1.7, e * 1.1, e * 0.65, 0, 0, TAU); c.fill(); }
      c.fillStyle = '#4a2410';
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(cx + sx * gap, cy, e, e * 1.3 * Math.max(0.12, blink), 0, 0, TAU); c.fill(); }
      if (blink > 0.6) { c.fillStyle = '#fff'; for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * gap + e * 0.32, cy - e * 0.45, e * 0.36, 0, TAU); c.fill(); } }
      c.strokeStyle = '#4a2410'; c.lineWidth = e * 0.55; c.lineCap = 'round';
      c.beginPath(); c.arc(cx, cy + e * 1.1, e * 0.85, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
      c.globalAlpha = 1;
    }

    /** A ribbon along the points (oldest first), widest at the head, tapering to nothing. */
    function ribbon(pts: { x: number; y: number }[], wd: number, color: string, _o: number) {
      // Short round-capped strokes, thickening towards the head: a smooth tapered ribbon.
      c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        c.lineWidth = wd * 2 * (i / (pts.length - 1)) ** 1.2;
        c.beginPath(); c.moveTo(pts[i - 1].x, pts[i - 1].y); c.lineTo(pts[i].x, pts[i].y); c.stroke();
      }
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
