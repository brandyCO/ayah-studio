// Ranks moments, full screen, played once when the Ranks tab opens (never over reading):
//   week     Monday's result of last week's league. The tier emblem of last week waits in the middle while
//            the place and points count in; then, moved up: it lifts away and the new emblem blooms in with
//            rays and sparks; moved down: it sinks softly and the new one settles in from above (no sparks,
//            no shame, a fresh-start line); stayed: a ring of light pulses out from it.
//   passed   "You passed Bilal ▲": a little ladder of the players you passed with you under them; your row
//            glides up past theirs, which step down, and the next one to catch is named.
// Calm: no sound, a light vibration on the beats. Reduced motion: the still end picture.
import { rt, type RankKey } from '../i18n/ranks';
import { tierOf, type RankMoments, type Row, type Status } from '../together/ranks';
import { h } from './dom';
import { TIER_RING, avatar } from './rankAvatars';
import { bump } from './juice';
import { sfx } from './sfx';
import { sparks, type Sparks } from './sparks';
import './cel.css';
import './ranks.css';

const NS = 'http://www.w3.org/2000/svg';
const tierName = (n: number) => rt(`rk.tier.${tierOf(n)}` as RankKey);
const num = (n: number) => n.toLocaleString();
const vibrate = (p: number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };
let uid = 0;

/** A tier's emblem (viewBox 100): lantern, eight-pointed star, crescent, dawn over the horizon, sun. */
export function tierEmblem(tier: number): SVGSVGElement {
  const n = Math.max(0, Math.min(4, tier | 0));
  const c = TIER_RING[n];
  const id = `rke${++uid}`;
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 100 100');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('rkm-emblem');
  const fill = `url(#${id}f)`;
  const rays = (k: number, r1: number, r2: number, cy = 50, from = 0, to = 360) => Array.from({ length: k }, (_, i) => {
    const a = ((from + ((to - from) * (i + 0.5)) / k) * Math.PI) / 180;
    return `<path d="M${50 + r1 * Math.cos(a)} ${cy + r1 * Math.sin(a)}L${50 + r2 * Math.cos(a)} ${cy + r2 * Math.sin(a)}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
  }).join('');
  const star = (cx: number, cy: number, R: number, r: number) => Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const d = i % 2 ? r : R;
    return `${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  const art = [
    // lantern: cap, ring, glass body with ribs, a flame inside
    `<path d="M50 8v8M40 16h20l4 8H36z" fill="${fill}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
     <path d="M34 26h32q8 18 0 46H34q-8-28 0-46z" fill="${fill}" stroke="${c}" stroke-width="2.4"/>
     <path d="M44 27q-3 22 0 44M56 27q3 22 0 44" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" fill="none"/>
     <path d="M50 38c6 7 7 12 7 16a7 7 0 0 1-14 0c0-4 1-9 7-16z" fill="#fff8de"/>
     <path d="M38 74h24l-3 8H41z" fill="${fill}" stroke="${c}" stroke-width="2"/>`,
    // star
    `<polygon points="${star(50, 50, 40, 30)}" fill="${fill}" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>
     <polygon points="${star(50, 50, 22, 16)}" fill="#fff" fill-opacity=".85"/>`,
    // moon: a crescent with a small star
    `<path d="M62 12a38 38 0 1 0 22 58A31 31 0 0 1 62 12z" fill="${fill}" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>
     <polygon points="${star(72, 36, 9, 4)}" fill="#fff"/>`,
    // dawn: half a sun on the horizon, rays fanning up
    `${rays(7, 32, 44, 66, 190, 350)}<path d="M22 66a28 28 0 0 1 56 0z" fill="${fill}" stroke="${c}" stroke-width="2.4"/>
     <path d="M10 66h80M24 76h52M36 86h28" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`,
    // sun: a full disc in a ring of rays
    `${rays(12, 34, 46)}<circle cx="50" cy="50" r="26" fill="${fill}" stroke="${c}" stroke-width="2.4"/>
     <circle cx="50" cy="50" r="15" fill="#fff" fill-opacity=".8"/>`,
  ][n];
  el.innerHTML = `<defs><linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".75"/></linearGradient></defs>${art}`;
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
      timers.forEach(clearTimeout);
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const opened = performance.now();
    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target !== ok && performance.now() - opened > 2400) close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
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
      if (dir === 'up') { burst(70, 1.05); sfx.open(); later(350, () => { fx()?.motes(true); sfx.shimmer(); }); }
      else if (dir === 'stay') { burst(28, 0.6); sfx.pop(2); }
      else vibrate([10]);
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
  const stage = h('div', { class: 'rkm-stage passed' }, ladder);
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
    later(700, () => {
      stage.classList.add('go');
      sfx.whoosh();
      passed.forEach((_, k) => later(260 + k * 140, () => sfx.tick()));
    });
    later(700 + 650 + passed.length * 140, () => { burst(40, 0.7, -ladder.offsetHeight / 2 + 22); sfx.shimmer(); bump(mine, 0.12); });
  });
}
