// A milestone badge: an eight-pointed star medallion (two squares, the khatam) in its tier's metal,
// a dark inner disc with a line icon, a soft light passing over it once it is earned. Locked badges
// are drawn in grey. SVG + CSS only.
import type { BadgeIcon, BadgeTier } from '../data/badges';

let uid = 0;

const METALS: Record<BadgeTier, [string, string, string, string]> = {
  // dark edge, body, highlight, icon
  bronze: ['#6e3f1c', '#c9844a', '#f6d2a6', '#ffd9b0'],
  silver: ['#5d6873', '#bcc6cf', '#f7fafc', '#eef3f7'],
  gold: ['#7d5710', '#dcaa3c', '#fff1b8', '#ffe39a'],
  emerald: ['#033a29', '#0f8273', '#7ff0d2', '#a8f5e2'],
};

const ICONS: Record<BadgeIcon, string> = {
  flame: '<path d="M12 2.5c1.2 3.2 4.6 5.2 4.6 9.6a4.6 4.6 0 0 1-9.2 0c0-2.3 1.1-3.6 2.2-4.6.1 2 1 3.2 2.2 3.4-1-3.1-.2-5.8.2-8.4z"/>',
  page: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 11h6M9.5 14h6M9.5 17h4"/>',
  book: '<path d="M3.5 5.5c3-1.2 6-1.2 8.5.8 2.5-2 5.5-2 8.5-.8v13c-3-1.1-6-1.1-8.5.9-2.5-2-5.5-2-8.5-.9z"/><path d="M12 6.3v13"/>',
  mushaf: '<path d="M5 3.5h12.5a1.5 1.5 0 0 1 1.5 1.5v15.5H6.5A1.5 1.5 0 0 1 5 19z"/><path d="M12 7.5l1.3 2.2 2.2 1.3-2.2 1.3-1.3 2.2-1.3-2.2-2.2-1.3 2.2-1.3z"/>',
  juz: '<path d="M12 3.5l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  beads: '<path d="M12 16.2v2.3M10.4 21.2l1.6-2.7 1.6 2.7"/>' +
    Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + Math.PI / 2;
      return `<circle cx="${(12 + 6 * Math.cos(a)).toFixed(2)}" cy="${(9.6 + 6 * Math.sin(a)).toFixed(2)}" r="1.45" class="bd-fill"/>`;
    }).join(''),
  reel: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M10 9.2l5 2.8-5 2.8z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" class="bd-fill"/>',
  listen: '<path d="M4 14.5V12a8 8 0 0 1 16 0v2.5"/><rect x="3.5" y="14" width="4" height="6.5" rx="1.2"/><rect x="16.5" y="14" width="4" height="6.5" rx="1.2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.2C19.5 15.4 12 20 12 20z"/>',
};

function starPoints(R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push(`${(50 + rad * Math.cos(a)).toFixed(2)},${(50 + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const OUTER = starPoints(47, 36.2);
const INNER = starPoints(41, 31.6);

export function badgeArt(tier: BadgeTier, ic: BadgeIcon, earned: boolean, size = 72): HTMLElement {
  const id = `bd${++uid}`;
  const [edge, body, hi, icn] = METALS[tier];
  const el = document.createElement('span');
  el.className = `badge-art${earned ? ' earned' : ' locked'}`;
  el.style.width = el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%">
    <defs>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${body}"/><stop offset="1" stop-color="${edge}"/></linearGradient>
      <linearGradient id="${id}r" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${body}"/><stop offset="1" stop-color="${edge}"/></linearGradient>
      <radialGradient id="${id}d" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${tier === 'emerald' ? '#0c3b30' : '#2a221c'}"/><stop offset="1" stop-color="${tier === 'emerald' ? '#04140f' : '#0e0b09'}"/></radialGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="${id}c"><polygon points="${OUTER}"/></clipPath>
    </defs>
    <polygon points="${OUTER}" fill="url(#${id}m)"/>
    <polygon points="${INNER}" fill="url(#${id}r)" opacity=".9"/>
    <circle cx="50" cy="50" r="27" fill="url(#${id}d)" stroke="${hi}" stroke-opacity=".7" stroke-width="1.4"/>
    <circle cx="50" cy="50" r="23.5" fill="none" stroke="${body}" stroke-opacity=".45" stroke-width=".8" stroke-dasharray="1.6 2.2"/>
    <g transform="translate(34 34) scale(1.333)" fill="none" stroke="${icn}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="--bd-ic:${icn}">${ICONS[ic]}</g>
    ${earned ? `<g clip-path="url(#${id}c)"><rect class="bd-shine" x="-60" y="-10" width="40" height="120" fill="url(#${id}s)" transform="rotate(20 50 50)"/></g>` : ''}
  </svg>`;
  return el;
}
