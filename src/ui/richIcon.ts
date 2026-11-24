// Premium icons (owner request 2026-11-16: "actual premium icons" for friends' news and Me's next step):
// small objects in the reward art's flat two-tone style (src/ui/flat.ts), lit from the top left with a
// chunky edge underneath. The streak is the app's own flame in the chosen theme's colours.
import { shine, raisedLine, starPath, circlePath, svgOf } from './flat';
import { edge, two } from './roomHQ';
import { flame } from './flame';
import { icon } from './icons';
import './richIcon.css';

const P = (d: string, c: string, o = 1) => `<path d="${d}" fill="${c}"${o < 1 ? ` opacity="${o}"` : ''}/>`;

// Each drawing in a 48 × 48 box.
const ART: Record<string, () => string> = {
  // An open mushaf: green covers, cream pages with gold edges and a few lines.
  book: () => {
    const cover = 'M4 13Q4 10 7 10.5Q16 12 24 16Q32 12 41 10.5Q44 10 44 13V36Q44 39 41 38.5Q32 37.2 24 41Q16 37.2 7 38.5Q4 39 4 36Z';
    const left = 'M7.5 12.5Q16 13.5 23 17.5V37.5Q16 34.4 7.5 35.4Z', right = 'M40.5 12.5Q32 13.5 25 17.5V37.5Q32 34.4 40.5 35.4Z';
    return `${edge(cover, '#0b4f3c', 2.6)}${two(cover, '#1fa47b', '#127a5b', -2, -2)}
      ${two(left, '#fffaf0', '#efe2c4', -1.4, -1.4)}${two(right, '#fffaf0', '#e8d8b6', -1.4, -1.4)}
      <path d="M11 18.5Q16 19 20 21M11 23Q16 23.5 20 25.5M11 27.5Q16 28 20 30M28 21Q32 19 37 18.5M28 25.5Q32 23.5 37 23M28 30Q32 28 37 27.5" stroke="#c9b48a" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <path d="M24 17V40" stroke="#d9a520" stroke-width="1.6"/>${shine('M9 15Q14 15.2 18 16.6', 1.6, .6)}`;
  },
  // A gold eight-pointed star with a raised centre.
  star: () => {
    const s = starPath(24, 24, 20, 13, 8);
    return `${edge(s, '#a8700a', 2.6)}${two(s, '#ffd24a', '#f0a91c', -2.4, -2.4)}${P(circlePath(24, 24, 7.5), '#fff3c4')}${P(starPath(24, 24, 5.5, 2.4, 4), '#f0a91c')}${shine('M15 13.5L19 15.5', 2, .6)}`;
  },
  crescent: () => {
    const m = 'M30 6A19 19 0 1 0 42 33A15 15 0 1 1 30 6Z';
    return `${edge(m, '#9c6a0c', 2.6)}${two(m, '#ffd86b', '#f2ae2a', -2.4, -2.2)}${P(starPath(36, 15, 4.4, 1.7, 5), '#fff6d2')}${shine('M13 17Q11 24 14 30', 2.2, .55)}`;
  },
  sun: () => {
    const rays = starPath(24, 24, 22, 15, 12);
    return `${P(rays, '#ffcf4a')}${edge(circlePath(24, 24, 12), '#c27a06', 2.4)}${two(circlePath(24, 24, 12), '#ffd95e', '#f5a21b', -2, -2)}${shine('M17 19Q18.5 15.5 22 14.5', 2, .6)}`;
  },
  // A masbaha: a ring of beads, a tassel.
  beads: () => {
    const beads = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 - Math.PI / 2, x = 24 + Math.cos(a) * 14, y = 20 + Math.sin(a) * 14;
      return `${P(circlePath(x, y + 1.2, 3.4), '#3a2a7a')}${P(circlePath(x, y, 3.4), '#8b6ff0')}${P(circlePath(x - 1, y - 1, 1.1), '#d9ceff')}`;
    }).join('');
    return `${beads}${two('M21 34H27L28.5 44Q24 46 19.5 44Z', '#ffc83d', '#d99a12', -1.4, 0)}${P(circlePath(24, 34, 3.6), '#f59f00')}`;
  },
  sprout: () => {
    const l = 'M23 26Q10 27 7 15Q20 13 23 26Z', r = 'M25 22Q27 8 41 7Q41 21 25 22Z';
    const pot = 'M12 30H36L33 44H15Z';
    return `${raisedLine('M24 31Q24 24 24.5 20', '#3b8f1c', 3)}${two(l, '#7ad04a', '#4caf2a', -1.6, -1.6)}${two(r, '#8fe05a', '#4caf2a', -1.6, -1.6)}
      ${edge(pot, '#8a3f1c', 2.4)}${two(pot, '#e8814f', '#c45e2e', -2, -2)}<rect x="10.5" y="28" width="27" height="5" rx="2.5" fill="#f19a6a"/>${shine('M16 36V40', 2, .45)}`;
  },
  listen: () => {
    const band = 'M8 28V24A16 16 0 0 1 40 24V28';
    const cupL = 'M6 27Q6 25 8 25H13V41H8Q6 41 6 39Z', cupR = 'M42 27Q42 25 40 25H35V41H40Q42 41 42 39Z';
    return `<path d="${band}" stroke="#3a2a7a" stroke-width="5" fill="none" stroke-linecap="round" transform="translate(0 1.5)"/><path d="${band}" stroke="#6c5ce7" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${edge(cupL, '#3a2a7a', 2.2)}${two(cupL, '#8b7bff', '#5b4bd6', -1.6, -1.6)}${edge(cupR, '#3a2a7a', 2.2)}${two(cupR, '#8b7bff', '#5b4bd6', -1.6, -1.6)}
      ${P('M13 27H17V39H13Z', '#ff8fa8')}${P('M31 27H35V39H31Z', '#ff8fa8')}${shine('M12 15Q16 10 22 9', 2, .5)}`;
  },
  // A lantern with a warm light inside.
  lamp: () => {
    const body = 'M14 16H34L36 36Q36 39 33 39H15Q12 39 12 36Z';
    return `<path d="M24 3V9" stroke="#8a5a0c" stroke-width="2.4" stroke-linecap="round"/>${two('M17 9H31L33 16H15Z', '#ffc83d', '#d99a12', -1.4, -1.4)}
      ${P(circlePath(24, 27, 13), '#ffd77a', .35)}${edge(body, '#8a5a0c', 2.4)}${two(body, '#ffd24a', '#e0a020', -2, -2)}
      ${P('M18 19H30L31.5 34H16.5Z', '#fff4c8')}${P('M24 22Q28 27 24 32Q20 27 24 22Z', '#ff9a3c')}${two('M15 39H33L31 44H17Z', '#ffc83d', '#d99a12', -1.4, 0)}`;
  },
  film: () => {
    const card = 'M6 12Q6 9 9 9H39Q42 9 42 12V36Q42 39 39 39H9Q6 39 6 36Z';
    const holes = [13, 21, 29].map((y) => `${P(`M8.5 ${y}h4v4h-4z`, '#3a1408', .55)}${P(`M35.5 ${y}h4v4h-4z`, '#3a1408', .55)}`).join('');
    return `${edge(card, '#9c2f12', 2.6)}${two(card, '#ff7a55', '#e04f2a', -2, -2)}${holes}${two('M20 17L31 24L20 31Z', '#ffffff', '#ffd9cc', -1, -1)}${shine('M11 12H20', 2, .45)}`;
  },
  check: () => {
    const c = circlePath(24, 24, 19);
    return `${edge(c, '#1e7a12', 2.6)}${two(c, '#7ad04a', '#4caf2a', -2.4, -2.4)}${raisedLine('M15 24.5L21.5 31L33.5 18', '#fff', 4.6, 'rgba(30,90,16,.45)')}${shine('M12 17Q14 12 19 10', 2, .5)}`;
  },
  target: () =>
    `${edge(circlePath(24, 24, 19), '#8a1f2a', 2.6)}${two(circlePath(24, 24, 19), '#ff6b6b', '#d9404f', -2, -2)}${P(circlePath(24, 24, 13), '#fff')}${P(circlePath(24, 24, 8), '#ff6b6b')}${P(circlePath(24, 24, 3.4), '#fff')}${shine('M12 16Q14 11 19 9.5', 2, .5)}`,
  translation: () => `${ART.book()}<rect x="27" y="2" width="20" height="14" rx="5" fill="#12a594"/><path d="M31 9H43M31 12.5H39" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`,
};
ART.mushaf = ART.book;
ART.headphones = ART.listen;

/** A premium icon (`size` in px). The flame follows the theme; unknown names fall back to the line icon. */
export function richIcon(name: string, size = 28): HTMLElement {
  const el = document.createElement('span');
  el.className = `rich-ic ri-${name}`;
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = `${size}px`;
  if (name === 'flame') el.append(flame(2, size, true));
  else if (ART[name]) el.append(svgOf('0 0 48 48', ART[name](), size));
  else el.append(icon(name, Math.round(size * 0.7)));
  return el;
}

/** A level as a violet shield with its number (friends' news "Reached level n"). */
export function levelIcon(n: number, size = 28): HTMLElement {
  const sh = 'M24 3L41 9V24Q41 37 24 45Q7 37 7 24V9Z';
  const el = document.createElement('span');
  el.className = 'rich-ic ri-level';
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = `${size}px`;
  el.append(svgOf('0 0 48 48', `${edge(sh, '#2f2380', 2.6)}${two(sh, '#8b7bff', '#5b4bd6', -2.4, -2.2)}${P(starPath(24, 10.5, 4, 1.6, 5), '#ffd24a')}
    <text x="24" y="33" text-anchor="middle" font-size="${n > 9 ? 15 : 17}" font-weight="900" font-family="Nunito, system-ui, sans-serif" fill="#fff">${n}</text>${shine('M12 12L18 10', 2, .5)}`, size));
  return el;
}
