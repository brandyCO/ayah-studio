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

/** A league's emblem (viewBox 100), the Sahaba's journey in order (owner decision 2026-11-12): Dar al-Arqam, Hijrah,
 *  Badr, Al-Khandaq, Fath Makkah — no Companion is ranked; a later league is only later in the story. Drawn
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
  const warm = (d: string) => two(d, '#fff2c4', '#f3c873', -2, -2);
  const art = [
    // Dar al-Arqam: the house where the first Muslims met, a lamp glowing in its arched door
    `${piece('M20 40H80V86H20Z')}${piece('M15 31H85V41H15Z', mix(c, -.2), c, 3, -2.5, -2.5)}
     ${raisedLine('M15 31V25M85 31V25M50 31V25', ed, 4, 'rgba(0,0,0,.22)')}
     <path d="M37 86V61A13 13 0 0 1 63 61V86Z" fill="${ed}"/>${warm('M40 86V62A10 10 0 0 1 60 62V86Z')}
     <path d="M50 66C54 70 55 73 55 75.5A5 5 0 0 1 45 75.5C45 73 46 70 50 66Z" fill="#ffb238"/>
     ${two('M67 50H76V59H67Z', '#fff2c4', '#f3c873', -1.5, -1.5)}${two('M24 50H33V59H24Z', '#fff2c4', '#f3c873', -1.5, -1.5)}
     ${raisedLine('M8 88H92', ed, 4.4, 'rgba(0,0,0,.25)', 1.4)}${shine('M24 44V56', 3, .45)}`,
    // Hijrah: a guiding star over the dunes, a path of footsteps between them
    `${edge(starPath(68, 24, 15, 5.5, 4), ed, 2)}${two(starPath(68, 24, 15, 5.5, 4), li, c, -1.5, -1.5)}
     ${two(circlePath(32, 22, 3), li, c, -1, -1)}${two(circlePath(86, 46, 2.4), li, c, -1, -1)}
     ${piece('M2 70Q28 46 58 66Q76 56 98 64V94H2Z', '#efcf94', '#d4a865', 3.5, -3, -3)}
     ${piece('M2 82Q40 66 70 80Q86 74 98 78V94H2Z', '#e2b673', '#c08a48', 3, -2.5, -2.5)}
     ${[[20, 88, 2.6], [34, 84, 2.4], [47, 82, 2.2], [59, 80, 2], [70, 76, 1.8], [79, 72, 1.6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#9a6a34" opacity=".75"/>`).join('')}
     ${shine('M14 64Q26 54 38 54', 3.2, .5)}`,
    // Badr: the well, a beam over it, a rope and a bucket, water catching the light
    `${raisedLine('M28 56V18M72 56V18', ed, 6, 'rgba(0,0,0,.25)', 1.4)}${raisedLine('M22 18H78', mix(c, .4), 6.5, 'rgba(0,0,0,.25)', 1.4)}
     ${raisedLine('M50 18V36', ed, 2.4, 'rgba(0,0,0,.2)')}${piece('M42 36H58L55.5 47H44.5Z', mix(c, .15), sh, 2.5, -1.5, -1.5)}
     ${piece('M20 56H80V82Q50 94 20 82Z')}
     ${edge('M20 56A30 9 0 0 1 80 56A30 9 0 0 1 20 56Z', ed, 2)}${two('M23 56A27 7 0 0 1 77 56A27 7 0 0 1 23 56Z', '#bfeaf0', '#5fb3c9', -2, -1.5)}
     ${raisedLine('M30 66H46M54 72H70M28 78H40', sh, 3, 'rgba(0,0,0,.15)')}${shine('M24 62V76', 3, .45)}`,
    // Al-Khandaq: the trench between two banks, a row of stakes, a crescent in the cold sky
    `${edge('M30 8A19 19 0 1 0 46 37A14.5 14.5 0 0 1 30 8Z', ed, 2)}${two('M30 8A19 19 0 1 0 46 37A14.5 14.5 0 0 1 30 8Z', li, c, -2, -2)}
     ${piece('M2 58H38L44 92H2Z', c, sh, 3.5, -3, -3)}${piece('M58 92L64 58H98V92Z', c, sh, 3.5, -3, -3)}
     ${two('M38 58H64L58 92H44Z', mix(c, .62), mix(c, .45), 2, 2)}
     ${[68, 76, 84, 92].map((x) => piece(`M${x - 3} 58V46L${x} 41L${x + 3} 46V58Z`, mix(c, .35), mix(c, .5), 2, -1, -1)).join('')}
     ${shine('M6 64H30', 3, .45)}`,
    // Fath Makkah: the Ka'bah in light, its gold band and door
    `${piece(rays(12, 36, 49, 52, 0, 360, 4.6), mix(c, -.2), c, 3, -1.5, -1.5)}
     ${edge('M26 40L40 30H78L64 40ZM64 40L78 30V76L64 86ZM26 40H64V86H26Z', 'rgba(0,0,0,.35)', 3)}
     <path d="M26 40L40 30H78L64 40Z" fill="#4a4a54"/><path d="M64 40L78 30V76L64 86Z" fill="#26262c"/><path d="M26 40H64V86H26Z" fill="#17171b"/>
     <path d="M26 49H64V55H26Z" fill="${c}"/><path d="M64 49L78 39V45L64 55Z" fill="${mix(c, .25)}"/>
     <path d="M48 64H58V86H48Z" fill="${c}"/><path d="M50 66H56V84H50Z" fill="${mix(c, .25)}"/>
     ${shine('M30 44H44', 2.4, .35)}`,
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
