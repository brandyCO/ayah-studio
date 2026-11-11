// Ranks moments, full screen, played once when the Ranks tab opens (never over reading):
//   week     Monday's result of last week's league. The tier emblem of last week waits in the middle while
//            the place and points count in; then, moved up: it lifts away and the new emblem blooms in with
//            rays and sparks; moved down: it sinks softly and the new one settles in from above (no sparks,
//            no shame, a fresh-start line); stayed: a ring of light pulses out from it.
//   passed   "You passed Bilal ▲": a little ladder of the players you passed with you under them; your row
//            glides up past theirs, which step down, and the next one to catch is named.
// Calm: no sound, a light vibration on the beats. Reduced motion: the still end picture.
import { actor } from './actor';
import { circlePath, edge, mix, raisedLine, shine, starPath, two } from './flat';
import { rt, type RankKey } from '../i18n/ranks';
import { tierOf, type RankMoments, type Row, type Status } from '../together/ranks';
import { h } from './dom';
import { TIER_RING, avatar } from './rankAvatars';
import { bump, holdPage } from './juice';
import { sfx } from './sfx';
import { fpsStart } from '../fps';
import { sparks, type Sparks } from './sparks';
import './cel.css';
import './ranks.css';

const NS = 'http://www.w3.org/2000/svg';
const tierName = (n: number) => rt(`rk.tier.${tierOf(n)}` as RankKey);
const num = (n: number) => n.toLocaleString();
const vibrate = (p: number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

/** A tier's emblem (viewBox 100): lantern, eight-pointed star, crescent, dawn over the horizon, sun —
 *  flat two-tone like the characters, with a chunky edge under each piece. */
export function tierEmblem(tier: number): SVGSVGElement {
  const n = Math.max(0, Math.min(4, tier | 0));
  const c = TIER_RING[n];
  const sh = mix(c, .26), ed = mix(c, .55), li = mix(c, -.6);
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 100 100');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('rkm-emblem');
  const piece = (d: string, base = c, shade = sh, e = 4, dx = -4, dy = -4) => `${edge(d, ed, e)}${two(d, base, shade, dx, dy)}`;
  const ray = (a: number, r1: number, r2: number, cy: number, w: number) => {
    const x = Math.cos(a), y = Math.sin(a), px = -y * w, py = x * w;
    return `M${50 + x * r1 + px} ${cy + y * r1 + py}L${50 + x * r2} ${cy + y * r2}L${50 + x * r1 - px} ${cy + y * r1 - py}Z`;
  };
  const rays = (k: number, r1: number, r2: number, cy = 50, from = 0, to = 360, w = 5) => Array.from({ length: k }, (_, i) =>
    ray(((from + ((to - from) * (i + 0.5)) / k) * Math.PI) / 180, r1, r2, cy, w)).join('');
  const art = [
    // lantern: cap with a ring, a glass body with ribs and a warm flame, a foot
    `${raisedLine('M50 4V12', ed, 4, 'rgba(0,0,0,.25)')}<circle cx="50" cy="6" r="4" fill="none" stroke="${ed}" stroke-width="3"/>
     ${piece('M39 14H61L66 25H34Z', c, sh, 3, -2.5, -2.5)}
     ${piece('M33 26H67Q76 48 67 72H33Q24 48 33 26Z', '#fff2c4', '#f3c873', 3.5, -4, -3)}
     <path d="M50 36C57 44 58.5 50 58.5 54.5A8.5 8.5 0 0 1 41.5 54.5C41.5 50 43 44 50 36Z" fill="#ffb238"/>
     <path d="M50 44C54 49 54.5 52 54.5 55A4.5 4.5 0 0 1 45.5 55C45.5 52 46 49 50 44Z" fill="#fff8de"/>
     <path d="M41 27Q36 49 41 71M59 27Q64 49 59 71" fill="none" stroke="${sh}" stroke-width="3.4" stroke-linecap="round"/>
     ${piece('M36 72H64L60 84H40Z', c, sh, 3, -2.5, -2.5)}
     ${shine('M30.5 40Q29 49 31 60', 3, .6)}`,
    // star: the khatam, a lighter star inside
    `${piece(starPath(50, 50, 42, 31))}${two(starPath(50, 50, 24, 17.5), li, c, -2.5, -2.5)}
     ${shine('M22 32L30.5 27', 3.4, .55)}`,
    // moon: a crescent with a small star
    `${piece('M60 10A40 40 0 1 0 86 68A32 32 0 0 1 60 10Z', c, sh, 4, -5, -4)}
     ${shine('M30 26Q20 38 21 54', 3.6, .5)}
     ${edge(starPath(74, 34, 10, 4.2, 4), ed, 2)}${two(starPath(74, 34, 10, 4.2, 4), li, c, -1.5, -1.5)}`,
    // dawn: half a sun on the horizon, rays fanning up, water lines under it
    `${piece(rays(7, 33, 47, 64, 190, 350, 4.6), mix(c, -.25), c, 3, -1.5, -1.5)}
     ${piece('M21 64A29 29 0 0 1 79 64Z')}
     ${two('M33 64A17 17 0 0 1 67 64Z', li, mix(c, -.25), -2, -2)}
     ${raisedLine('M10 70H90', ed, 4.4, 'rgba(0,0,0,.25)', 1.4)}${raisedLine('M24 80H76M36 90H64', sh, 4, 'rgba(0,0,0,.2)', 1.2)}`,
    // sun: a full disc in a ring of rays
    `${piece(rays(12, 35, 48, 50, 0, 360, 5), mix(c, -.2), c, 3, -1.5, -1.5)}
     ${piece(circlePath(50, 50, 28))}${two(circlePath(50, 50, 16), li, mix(c, -.3), -2.5, -2.5)}
     ${shine('M30 42A21 21 0 0 1 40 31', 3.6, .55)}`,
  ][n];
  el.innerHTML = art;
  el.style.setProperty('--tc', c);
  return el;
}

interface Ctx { s: Status; players: Row[] }

/** Plays the waiting moments one after the other. Resolves when the last one is closed. */
export async function playRankMoments(m: RankMoments, ctx: Ctx): Promise<void> {
  if (m.week) await weekMoment(m.week, ctx);
  if (m.passed.length) await passedMoment(m.passed, ctx);
}

/** The shared full-screen frame: an overlay with a spark layer, the stage, text and a button. */
function frame(kind: string, label: string, stage: HTMLElement, text: HTMLElement, colors: string[], run: (o: { fx: () => Sparks | null; later: (ms: number, f: () => void) => void; burst: (n: number, p: number, dy?: number) => void }) => void): Promise<void> {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise((resolve) => {
    const frames = still ? null : fpsStart(`Ranks · ${kind}`);
    const ok = h('button', { class: 'cel-ok' }, rt('rk.continue'));
    const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
    const el = h('div', { class: `cel go rkm rkm-${kind}${still ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
      stage, canvas, text, ok);
    const timers: number[] = [];
    let fx: Sparks | null = null;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      frames?.();
      timers.forEach(clearTimeout);
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      holdPage(false);
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const opened = performance.now();
    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target !== ok && performance.now() - opened > (kind === 'passed' ? 900 : 2400)) close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    holdPage(true);
    ok.focus({ preventScroll: true });
    if (still) return;
    fx = sparks(canvas, colors);
    run({
      fx: () => fx,
      later: (ms, f) => { timers.push(window.setTimeout(f, ms)); },
      burst: (n, p, dy = 0) => {
        const b = stage.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        fx?.burst(b.left + b.width / 2 - cr.left, b.top + b.height / 2 - cr.top + dy, n, p);
      },
    });
  });
}

const rgbaOf = (hex: string, a = 1) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};

/** Monday's reveal: last week's league result. */
function weekMoment(w: NonNullable<RankMoments['week']>, { s }: Ctx): Promise<void> {
  const dir = w.tierNow > w.tier ? 'up' : w.tierNow < w.tier ? 'down' : 'stay';
  const from = tierEmblem(w.tier);
  from.classList.add('from');
  const to = tierEmblem(w.tierNow);
  to.classList.add('to');
  const rays = h('span', { class: 'rkm-rays', 'aria-hidden': 'true' });
  const ring = h('span', { class: 'rkm-ring', 'aria-hidden': 'true' });
  const arrow = h('span', { class: `rkm-arrow ${dir}`, 'aria-hidden': 'true' }, dir === 'down' ? '▼' : '▲');
  const stage = h('div', { class: `rkm-stage ${dir}`, style: `--tc:${TIER_RING[w.tierNow]};--tf:${TIER_RING[w.tier]}` },
    rays, ring, dir === 'stay' ? '' : from, to, dir === 'stay' ? '' : arrow);
  // The user's character watches the result beside the emblem: cheers going up, nods staying, sinks a little going down.
  const me = actor('rkm-actor', s.figure ?? null);
  if (me) stage.append(me.el);
  const place = h('b', {}, `#${w.place}`);
  const pts = h('b', {}, num(w.score));
  const title = rt(dir === 'up' ? 'rk.wkUp' : dir === 'down' ? 'rk.wkDown' : 'rk.wkStay', { tier: tierName(w.tierNow) });
  const sub = rt(dir === 'up' ? 'rk.wkSubUp' : dir === 'down' ? 'rk.wkSubDown' : w.tierNow >= 4 ? 'rk.wkSubTop' : 'rk.wkSubStay');
  const text = h('div', { class: 'cel-text rkm-text' },
    h('p', { class: 'cel-kicker' }, rt('rk.wkKicker')),
    h('div', { class: 'rkm-stats' },
      h('span', { class: 'rkm-stat' }, place, h('span', {}, rt('rk.wkOf', { of: w.size }))),
      h('span', { class: 'rkm-stat' }, pts, h('span', {}, rt('rk.wkPts')))),
    h('h2', {}, title),
    h('p', { class: 'cel-sub' }, sub),
    h('div', { class: 'rkm-me' }, avatar(s.private ? null : s.avatar, w.tierNow, 30, 0, s.figure), h('span', {}, s.name)));
  const c = TIER_RING[w.tierNow];
  return frame('week', title, stage, text, [rgbaOf(c), rgbaOf('#fff7e0'), rgbaOf(TIER_RING[w.tier])], ({ later, burst, fx }) => {
    // Count the place down to the real one and the points up while the old emblem waits.
    const t0 = performance.now() + 250;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / 900));
      const e = 1 - (1 - p) ** 3;
      pts.textContent = num(Math.round(w.score * e));
      place.textContent = `#${Math.max(w.place, Math.round(w.size - (w.size - w.place) * e))}`;
      if (p < 1 && document.body.contains(pts)) requestAnimationFrame(tick);
      else if (p >= 1) { bump(pts, 0.3); bump(place, 0.3); sfx.tick(); }
    };
    requestAnimationFrame(tick);
    vibrate([8]);
    later(1300, () => {
      stage.classList.add('go');
      if (dir === 'up') { burst(70, 1.05); sfx.open(); me?.cheer(2600); me?.face('star', 2600); later(350, () => { fx()?.motes(true); sfx.shimmer(); }); }
      else if (dir === 'stay') { burst(28, 0.6); sfx.pop(2); me?.nod(); me?.face('proud', 1800); later(300, () => me?.hop(0.4)); }
      else { vibrate([10]); me?.sink(); }
    });
  });
}

/** "You passed Bilal": your row glides up past theirs. */
function passedMoment(names: string[], { s, players }: Ctx): Promise<void> {
  const passed = names.slice(0, 3);
  const row = (r: Row | undefined, name: string, me: boolean) => h('div', { class: `rkm-row${me ? ' me' : ''}` },
    avatar(me ? (s.private ? null : s.avatar) : r?.private ? null : r?.avatar ?? 0, me ? s.tier : r?.tier ?? s.tier, 34, 0, me ? s.figure : r?.figure),
    h('span', { class: 'rkm-name' }, name, me ? h('span', { class: 'rk-you' }, rt('rk.you')) : ''),
    me ? h('span', { class: 'rkm-up', 'aria-hidden': 'true' }, '▲') : h('span', { class: 'rkm-down', 'aria-hidden': 'true' }, '▼'));
  const rows = passed.map((n) => row(players.find((p) => p.name === n), n, false));
  const mine = row(undefined, s.name, true);
  const ladder = h('div', { class: 'rkm-ladder', style: `--k:${passed.length}` }, ...rows, mine);
  // Both characters (yours and the first one you passed) stand under the ladder: yours cheers, theirs waves
  // back, a good race and no more. Only when both of you have made a character and theirs is not private.
  const rival = players.find((p) => p.name === passed[0]);
  const meA = s.private ? null : actor('rkm-duo-a', s.figure ?? null);
  const themA = meA && rival && !rival.private ? actor('rkm-duo-a', rival.figure ?? null) : null;
  const duo = meA && themA ? h('div', { class: 'rkm-duo' }, themA.el, meA.el) : '';
  const stage = h('div', { class: 'rkm-stage passed' }, ladder, duo);
  // Who is next to catch, and by how much.
  const i = players.findIndex((p) => p.me);
  const next = i > 0 ? players[i - 1] : null;
  const gap = next ? Math.max(0, next.score - players[i].score) : 0;
  const title = rt('rk.passed', { names: passed.join(', ') });
  const text = h('div', { class: 'cel-text rkm-text' },
    h('p', { class: 'cel-kicker' }, rt('rk.passKicker')),
    h('h2', {}, title),
    h('p', { class: 'cel-sub' }, next ? rt('rk.passNext', { name: next.name ?? rt('rk.private'), n: num(gap) }) : rt('rk.passTop')));
  const c = TIER_RING[s.tier];
  return frame('passed', title, stage, text, [rgbaOf(c), rgbaOf('#fff7e0')], ({ later, burst }) => {
    // Snappy (owner 2026-11-11, "a bit slow"): the glide starts almost at once and lands in about half a second.
    later(260, () => {
      stage.classList.add('go');
      sfx.whoosh();
      passed.forEach((_, k) => later(120 + k * 90, () => sfx.tick()));
    });
    later(260 + 480 + passed.length * 60, () => { burst(40, 0.7, -ladder.offsetHeight / 2 + 22); sfx.shimmer(); bump(mine, 0.12); if (duo) { meA!.cheer(); later(350, () => themA!.wave()); } });
  });
}
