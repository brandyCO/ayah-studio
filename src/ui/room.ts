// "Your room" on Me (owner idea 2026-11-10): a small room for the user's character, decorated with what they
// have won. The window shows the sky of this hour; trophies from Ranks weeks (#1 gold, #2 silver, #3 bronze)
// and the best badges stand on the shelves; a framed flame holds the best streak; the wardrobe's rarest piece
// hangs as a small star when it is legendary. The character sits on a cushion (reading by day, its lantern at
// night) and hops when tapped. Share sends the character card (charCard.ts). Drawn flat in the reward style.
import { actor, myFigureCode, type Actor } from './actor';
import { encode, normalize, parse, WARDROBE } from './figure';
import { circlePath, edge, mix, shine, starPath, two } from './flat';
import { badgeStates } from '../data/badges';
import { prizeWins } from '../data/garden';
import { streak } from '../data/journey';
import { ownsPiece } from '../data/wardrobe';
import { rt, type RankKey } from '../i18n/ranks';
import { badgeArt } from './badge';
import { trophy } from './rankAvatars';
import { SLOTS, readRoomCode, roomLook, type Slot } from '../data/roomItems';
import { hijri, seasonNow } from '../data/wardrobe';
import { floorArt, itemArt, rugArt, seasonArt, setGrow, specialArt, viewArt, wallArt, type Special } from './roomArt';
import { lite, reduced } from './juice';
import { h, haptic } from './dom';
import { sfx } from './sfx';
import './room.css';

type Sky = 'dawn' | 'day' | 'dusk' | 'night';
const skyOf = (hr: number): Sky => (hr >= 5 && hr < 8 ? 'dawn' : hr >= 8 && hr < 16 ? 'day' : hr >= 16 && hr < 19 ? 'dusk' : 'night');
const SKY: Record<Sky, [string, string]> = { dawn: ['#ffc7a8', '#f08aa0'], day: ['#9fd8ff', '#5aa9ec'], dusk: ['#ffb86b', '#d9607a'], night: ['#2b2f7a', '#141640'] };

/** The room's back: wall, window with this hour's sky, shelves, the flame frame, floor and rug (viewBox 320×200). */
export function backSvg(sky: Sky, best: number, star: boolean, look: Partial<Record<Slot, string>> = {}, season: string | null = null, still = false,
  more: { days?: number; special?: Special | null } = {}): string {
  const night = sky === 'night';
  const sea = seasonArt(season, night, still);
  const sp = specialArt(more.special ?? null, night, still);
  setGrow(more.days ?? best);
  const wall = night ? '#3b3466' : '#f3e2c7', wallSh = night ? '#2e2852' : '#e6cfac';
  const [s1, s2] = SKY[sky];
  const win = 'M26 104V52Q26 26 64 26Q102 26 102 52V104Z';
  const glass = 'M33 98V54Q33 33 64 33Q95 33 95 54V98Z';
  const sun = sky === 'night'
    ? `<path d="${circlePath(78, 52, 9)}" fill="#fff4c4"/><path d="${circlePath(82, 49, 8)}" fill="${s1}"/>
       ${[[44, 48], [56, 66], [86, 78], [48, 84]].map(([x, y]) => `<path d="${starPath(x, y, 2.4, 1, 4)}" fill="#fff" opacity=".85"/>`).join('')}`
    : sky === 'day'
      ? `<path d="${circlePath(80, 50, 9)}" fill="#fff6c9"/><path d="M40 80Q46 72 54 76Q60 70 68 76Q74 76 74 82H40Z" fill="#fff" opacity=".9"/>`
      : `<path d="${circlePath(64, 92, 13)}" fill="#fff1c4" opacity=".95"/><path d="M33 90H95" stroke="#fff" stroke-width="1.5" opacity=".4"/>`;
  const plank = (y: number) => `${edge(`M190 ${y}H306V${y + 7}H190Z`, night ? '#1c1838' : '#a8784a', 3)}${two(`M190 ${y}H306V${y + 7}H190Z`, night ? '#7a5a9c' : '#d9a36a', night ? '#5b4380' : '#b9834c', 0, -2)}`;
  const frame = 'M120 22H164V60H120Z';
  // The flame's frame grows with the best streak (streak milestones, 2026-11-11): wood, then bronze at 7 days,
  // silver at 30, gold with gems at 100, and a crescent on top at 365.
  const fm = best >= 100 ? ['#e8b85e', '#c38f35'] : best >= 30 ? ['#dfe6ee', '#a9b4c2'] : best >= 7 ? ['#d99a5b', '#a8652e'] : ['#b98a5a', '#8f6236'];
  const flame = 'M142 28Q151 37 150 44Q149 51 142 52Q135 51 134 44Q134 39 138 35Q139 40 142 40Q144 34 142 28Z';
  return `<svg class="rm-back" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="rmsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s2}"/><stop offset="1" stop-color="${s1}"/></linearGradient>
      <radialGradient id="rmglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <clipPath id="rmglass"><path d="${glass}"/></clipPath>
    <rect width="320" height="146" fill="${wall}"/><rect y="132" width="320" height="14" fill="${wallSh}"/>
    ${wallArt(look.wall, night)}
    ${edge(win, night ? '#1c1838' : '#a8784a', 3)}${two(win, night ? '#8a6bb0' : '#e0b07a', night ? '#634a8a' : '#c08a52')}
    <path d="${glass}" fill="url(#rmsky)"/>${sun}${viewArt(look.view, sky)}${sea.window}${sp.window}
    <path d="M64 33V98M33 66H95" stroke="${night ? '#634a8a' : '#c08a52'}" stroke-width="3"/>
    ${shine('M38 92V58Q38 42 52 38', 2, .4)}${look.curtain ? itemArt(look.curtain, 'curtain', night, still) : ''}
    ${edge(frame, night ? '#1c1838' : '#8f6236', 3)}${two(frame, fm[0], fm[1], -1.5, -1.5)}<rect x="125" y="27" width="34" height="28" fill="#2a2150"/>
    ${best >= 100 ? `${two(circlePath(120, 22, 2.6), '#ff6b7d', '#c32a43', -.6, -.6)}${two(circlePath(164, 22, 2.6), '#6fe0f5', '#1f9cc0', -.6, -.6)}${two(circlePath(120, 60, 2.6), '#6fe0f5', '#1f9cc0', -.6, -.6)}${two(circlePath(164, 60, 2.6), '#ff6b7d', '#c32a43', -.6, -.6)}` : ''}
    ${best >= 365 ? `${edge('M142 9Q133 13 134 20Q137 15 142 15Q147 15 150 20Q151 13 142 9Z', '#a8650e', 1.6)}${two('M142 9Q133 13 134 20Q137 15 142 15Q147 15 150 20Q151 13 142 9Z', '#ffe08a', '#e0a92f', -1, -1)}` : ''}
    ${two(flame, '#ffb03a', '#ff6a3d', -1, -1)}<text x="155" y="53" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" font-family="Nunito, system-ui, sans-serif">${best}</text>
    ${star ? `${edge(starPath(178, 30, 8, 3.6, 8), '#a8650e', 2)}${two(starPath(178, 30, 8, 3.6, 8), '#ffd25e', '#e09a1f', -1.5, -1.5)}` : ''}
    ${plank(70)}${plank(118)}
    ${two('M0 146H320V200H0Z', night ? '#5b4a7a' : '#c99a6a', night ? '#463a62' : '#b5875a', 0, -3)}
    ${look.floor ? floorArt(look.floor, night) : [160, 176, 190].map((y) => `<path d="M0 ${y}H320" stroke="${mix(night ? '#463a62' : '#b5875a', 0.12)}" stroke-width="1.2" opacity=".6"/>`).join('')}
    ${sp.room}${rugArt(look.rug, night)}
    ${look.seat ? itemArt(look.seat, 'seat', night, still) : ''}
    ${look.plant ? itemArt(look.plant, 'plant', night, still) : ''}${look.side ? itemArt(look.side, 'side', night, still) : ''}
    ${look.pet ? itemArt(look.pet, 'pet', night, still) : ''}
    ${look.hang ? itemArt(look.hang, 'hang', night, still) : ''}${sea.top}
  </svg>`;
}

/** Today's special touch (round 5): Jumu'ah on Fridays, the odd nights of Ramadan's last ten (an Islamic night begins
 *  at sunset, so the evening before counts), the day of Arafah (9 Dhul Hijjah). */
export function specialNow(now = new Date()): Special | null {
  const hr = now.getHours();
  const hj = hijri(now);
  if (hj?.month === 9) {
    const night = hr >= 18 ? hj.day + 1 : hr < 5 ? hj.day : 0;
    if (night >= 21 && night <= 29 && night % 2) return 'qadr';
  }
  if (hj?.month === 12 && hj.day === 9) return 'arafah';
  return now.getDay() === 5 ? 'jumuah' : null;
}

type Built = { scene: HTMLElement; draw: () => void; sit: string; code: string; night: boolean; cups: number };

/** The room itself (back, shelves, the character on its cushion), or null without a character. */
/** A friend's room seen on a visit (round 5): their character, their room code (roomItems.ts). */
export interface Visit { figure: string | null; room: string | null }
function buildScene(visit?: Visit): Built | null {
  const code = visit ? visit.figure : myFigureCode();
  const f = parse(code);
  if (!f) return null;
  const theirs = visit ? readRoomCode(visit.room) : null;
  const look = visit ? theirs?.look ?? {} : null;
  const sky = skyOf(new Date().getHours());
  const night = sky === 'night';
  const best = visit ? theirs?.best ?? 0 : Math.max(streak().best, streak().days);
  const legendary = !visit && Object.entries(WARDROBE).some(([id, p]) => p.r === 'legendary' && ownsPiece(id));
  const scene = h('div', { class: `rm-scene sky-${sky}` });
  const draw = () => {
    const html = backSvg(sky, best, legendary, look ?? roomLook(), seasonNow(), reduced() || lite(), { days: visit ? best : streak().days, special: specialNow() });
    const old = scene.querySelector('.rm-back');
    if (old) old.outerHTML = html; else scene.insertAdjacentHTML('afterbegin', html);
  };
  draw();
  // Top shelf: trophies (newest first, up to 5). Lower shelf: the best badges earned (up to 4).
  const wins = visit ? (theirs?.cups ?? []).map((place) => ({ place, week: '' })) : prizeWins().slice(0, 5);
  const top = h('div', { class: 'rm-shelf top' }, ...wins.map((w) => h('span', { class: `rm-cup p${w.place}`, title: w.week ? `#${w.place} · ${w.week}` : `#${w.place}` }, trophy(w.place, 30))));
  if (!wins.length && !visit) top.append(h('span', { class: 'rm-empty' }, rt('room.emptyCups')));
  const order = { emerald: 0, gold: 1, silver: 2, bronze: 3 } as const;
  const got = visit ? [] : badgeStates().filter((b) => b.earned).sort((a, b) => order[a.def.tier] - order[b.def.tier]).slice(0, 4);
  const low = h('div', { class: 'rm-shelf low' }, ...got.map((b) => badgeArt(b.def.tier, b.def.icon, true, 30)));
  // The character on its cushion: reading by day, its lantern at night.
  const sit = encode(normalize({ ...f, pose: 1, hold: night ? 5 : f.hold === 0 || f.hold === 1 ? 2 : f.hold }));
  const cushion = h('span', { class: 'rm-cushion', 'aria-hidden': 'true' });
  const a: Actor | null = actor('rm-actor', sit);
  if (a) {
    a.el.addEventListener('click', () => { haptic(6); sfx.tick(); a.hop(0.6); });
    scene.append(cushion, a.el);
  }
  scene.append(top, low);
  // Speed (round 3): the room's small animations (lantern glow, smoke, swaying plant, twinkling lights, the
  // character's idle loop) play for a while when it comes into view or is tapped, then rest, so a phone sitting
  // on Me does not keep repainting it.
  let restT = 0;
  const wake = () => {
    scene.classList.remove('rest');
    scene.querySelector<SVGSVGElement>('.rm-back')?.unpauseAnimations?.();
    clearTimeout(restT);
    restT = window.setTimeout(sleep, 14000);
  };
  const sleep = () => { scene.classList.add('rest'); scene.querySelector<SVGSVGElement>('.rm-back')?.pauseAnimations?.(); };
  new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) wake(); else { clearTimeout(restT); sleep(); } }).observe(scene);
  scene.addEventListener('pointerdown', wake);
  // Greet once when the room comes into view.
  if (a) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); setTimeout(() => (night ? a.nod() : a.wave()), 300); } }, { threshold: 0.6 });
    io.observe(scene);
  }
  return { scene, draw, sit, code: code!, night, cups: wins.length };
}

const shareChar = async (code: string) => {
  haptic(6);
  const m = await import('./charCard');
  void m.shareCharCard(code);
};

/** The room card, or null without a character. `edit` opens the builder. */
export function roomCard(edit: () => void): HTMLElement | null {
  const b = buildScene();
  if (!b) return null;
  return h('section', { class: 'me-card rm-card' },
    h('h2', { class: 'me-h' }, rt('room.title')),
    b.scene,
    h('div', { class: 'rm-btns' }, h('button', { class: 'primary brand-btn', type: 'button', onclick: async () => {
      haptic(6);
      (await import('./roomShop')).openRoomShop(b.draw, b.sit);
    } }, rt('room.decorate')), h('button', { class: 'chip', type: 'button', onclick: () => edit() }, rt('room.edit')),
    h('button', { class: 'chip', type: 'button', onclick: () => void shareChar(b.code) }, rt('room.share'))),
    h('p', { class: 'muted small' }, b.cups ? rt('room.sub', { n: b.cups }) : rt('room.subEmpty')));
}

/** #/me/room (owner request 2026-11-10): the whole screen is the room. A small back and the Light star float
 *  at the top; the room is wider than a phone, so it can be swiped sideways; the floor runs on into a dock with
 *  a button per place (showing what stands there now), Shop, Dress up and Share. Decorating opens as a low
 *  panel over the room, which changes behind it at once. */
export function roomScreen(edit: () => void, top: HTMLElement): HTMLElement | null {
  const b = buildScene();
  if (!b) return null;
  const room = h('div', { class: 'rm-room' }, b.scene);
  const stage = h('div', { class: 'rm-stage' }, room);
  const slots = h('div', { class: 'rm-slots' });
  const shop = (slot?: Slot) => void import('./roomShop').then((m) => {
    haptic(6);
    m.openRoomShop(() => { b.draw(); paintSlots(); }, b.sit, { slot, inRoom: true });
  });
  const paintSlots = () => void import('./roomShop').then((m) => {
    const look = roomLook();
    slots.replaceChildren(...SLOTS.map((s) => {
      const btn = h('button', { class: `rm-slot-b${look[s] ? ' set' : ''}`, type: 'button', onclick: () => shop(s) },
        h('span', { class: 'rm-slot-art', 'aria-hidden': 'true' }), h('span', { class: 'rm-slot-n' }, rt(`rs.${s}` as RankKey)));
      btn.querySelector('.rm-slot-art')!.innerHTML = m.tileArt(s, look[s] ?? null);
      return btn;
    }));
  });
  paintSlots();
  const el = h('div', { class: `rm-full${b.night ? ' night' : ''}` },
    top,
    stage,
    h('div', { class: 'rm-dock' },
      h('p', { class: 'rm-full-sub small' }, b.cups ? rt('room.sub', { n: b.cups }) : rt('room.subEmpty')),
      slots,
      h('div', { class: 'rm-dock-main' },
        h('button', { class: 'primary brand-btn rm-shop-b', type: 'button', onclick: () => shop() }, `✦ ${rt('rs.shop')}`),
        h('button', { class: 'chip', type: 'button', onclick: () => edit() }, rt('room.edit')),
        h('button', { class: 'chip', type: 'button', onclick: () => void shareChar(b.code) }, rt('room.share')))));
  // The room is wider than a phone: it opens at the window, then glides over to the character and the
  // shelves, which shows it can be swiped sideways.
  requestAnimationFrame(() => {
    const to = (stage.scrollWidth - stage.clientWidth) * 0.8;
    if (to <= 0) return;
    if (reduced()) { stage.scrollLeft = to; return; }
    setTimeout(() => stage.scrollTo({ left: to, behavior: 'smooth' }), 500);
  });
  return el;
}

/** A friend's room, view only (round 5): opened from their row on the boards. Their character sits in it and waves;
 *  a tap makes them hop. Nothing can be changed. */
export function openVisit(v: Visit & { name: string | null }) {
  const b = buildScene(v);
  if (!b) return;
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom rm-visit' },
    h('div', { class: 'sheet-head' }, h('h2', {}, rt('room.visit', { name: v.name ?? '' })), h('button', { class: 'icon-btn', 'aria-label': rt('room.close'), onclick: close }, '✕')),
    b.scene,
    h('p', { class: 'muted small' }, rt('room.visitSub')));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  haptic(6);
}
