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
import { rt } from '../i18n/ranks';
import { badgeArt } from './badge';
import { trophy } from './rankAvatars';
import { h, haptic } from './dom';
import { sfx } from './sfx';
import './room.css';

type Sky = 'dawn' | 'day' | 'dusk' | 'night';
const skyOf = (hr: number): Sky => (hr >= 5 && hr < 8 ? 'dawn' : hr >= 8 && hr < 16 ? 'day' : hr >= 16 && hr < 19 ? 'dusk' : 'night');
const SKY: Record<Sky, [string, string]> = { dawn: ['#ffc7a8', '#f08aa0'], day: ['#9fd8ff', '#5aa9ec'], dusk: ['#ffb86b', '#d9607a'], night: ['#2b2f7a', '#141640'] };

/** The room's back: wall, window with this hour's sky, shelves, the flame frame, floor and rug (viewBox 320×200). */
function backSvg(sky: Sky, best: number, star: boolean): string {
  const night = sky === 'night';
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
  const flame = 'M142 28Q151 37 150 44Q149 51 142 52Q135 51 134 44Q134 39 138 35Q139 40 142 40Q144 34 142 28Z';
  return `<svg class="rm-back" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="rmsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s2}"/><stop offset="1" stop-color="${s1}"/></linearGradient>
      <radialGradient id="rmglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <rect width="320" height="146" fill="${wall}"/><rect y="132" width="320" height="14" fill="${wallSh}"/>
    ${[40, 120, 200, 280].map((x) => `<path d="M${x} 0V132" stroke="${wallSh}" stroke-width="10" opacity=".45"/>`).join('')}
    ${edge(win, night ? '#1c1838' : '#a8784a', 3)}${two(win, night ? '#8a6bb0' : '#e0b07a', night ? '#634a8a' : '#c08a52')}
    <path d="${glass}" fill="url(#rmsky)"/>${sun}
    <path d="M64 33V98M33 66H95" stroke="${night ? '#634a8a' : '#c08a52'}" stroke-width="3"/>
    ${shine('M38 92V58Q38 42 52 38', 2, .4)}
    ${edge(frame, night ? '#1c1838' : '#8f6236', 3)}${two(frame, '#e8b85e', '#c38f35', -1.5, -1.5)}<rect x="125" y="27" width="34" height="28" fill="#2a2150"/>
    ${two(flame, '#ffb03a', '#ff6a3d', -1, -1)}<text x="155" y="53" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" font-family="Nunito, system-ui, sans-serif">${best}</text>
    ${star ? `${edge(starPath(178, 30, 8, 3.6, 8), '#a8650e', 2)}${two(starPath(178, 30, 8, 3.6, 8), '#ffd25e', '#e09a1f', -1.5, -1.5)}` : ''}
    ${plank(70)}${plank(118)}
    ${two('M0 146H320V200H0Z', night ? '#5b4a7a' : '#c99a6a', night ? '#463a62' : '#b5875a', 0, -3)}
    ${[160, 176, 190].map((y) => `<path d="M0 ${y}H320" stroke="${mix(night ? '#463a62' : '#b5875a', 0.12)}" stroke-width="1.2" opacity=".6"/>`).join('')}
    ${edge('M40 168Q130 150 220 168Q130 192 40 168Z', '#7a2f3f', 3)}${two('M40 168Q130 150 220 168Q130 192 40 168Z', '#d9566a', '#b23d55')}
    <path d="M66 168Q130 156 194 168Q130 184 66 168Z" fill="none" stroke="#ffd27a" stroke-width="2" stroke-dasharray="5 4" opacity=".9"/>
    <path d="${starPath(130, 168, 8, 3.6, 8)}" fill="#ffd27a" opacity=".9"/>
    ${night ? '<ellipse cx="128" cy="166" rx="80" ry="34" fill="url(#rmglow)"/>' : ''}
  </svg>`;
}

/** The room card, or null without a character. `edit` opens the builder. */
export function roomCard(edit: () => void): HTMLElement | null {
  const code = myFigureCode();
  const f = parse(code);
  if (!f) return null;
  const sky = skyOf(new Date().getHours());
  const night = sky === 'night';
  const best = Math.max(streak().best, streak().days);
  const legendary = Object.entries(WARDROBE).some(([id, p]) => p.r === 'legendary' && ownsPiece(id));
  const scene = h('div', { class: `rm-scene sky-${sky}` });
  scene.innerHTML = backSvg(sky, best, legendary);
  // Top shelf: trophies (newest first, up to 5). Lower shelf: the best badges earned (up to 4).
  const wins = prizeWins().slice(0, 5);
  const top = h('div', { class: 'rm-shelf top' }, ...wins.map((w) => h('span', { class: `rm-cup p${w.place}`, title: `#${w.place} · ${w.week}` }, trophy(w.place, 30))));
  if (!wins.length) top.append(h('span', { class: 'rm-empty' }, rt('room.emptyCups')));
  const order = { emerald: 0, gold: 1, silver: 2, bronze: 3 } as const;
  const got = badgeStates().filter((b) => b.earned).sort((a, b) => order[a.def.tier] - order[b.def.tier]).slice(0, 4);
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
  const share = h('button', { class: 'chip', type: 'button', onclick: async () => {
    haptic(6);
    const m = await import('./charCard');
    void m.shareCharCard(code!);
  } }, rt('room.share'));
  const card = h('section', { class: 'me-card rm-card' },
    h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, rt('room.title')),
      h('div', { class: 'chips' }, h('button', { class: 'chip', type: 'button', onclick: () => edit() }, rt('room.edit')), share)),
    scene,
    h('p', { class: 'muted small' }, wins.length ? rt('room.sub', { n: wins.length }) : rt('room.subEmpty')));
  // Greet once when the room scrolls into view.
  if (a) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); setTimeout(() => (night ? a.nod() : a.wave()), 300); } }, { threshold: 0.6 });
    io.observe(scene);
  }
  return card;
}
