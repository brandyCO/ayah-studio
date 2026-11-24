// Shared drawing kit for the Discord-style decorations (owner decision 2026-11-24, "make everything discord style"):
// chunky illustrations with a dark outline, glossy gradients, a back layer behind the avatar and a front layer that
// spills over its edge. Everything is drawn in a 240 box with the avatar at (120, 120), radius 80.

export const OL = '#24123a'; // the chunky outline
export const f = (n: number) => (+n).toFixed(2);

/** Gradients and filters every piece may use (each piece is its own SVG image, so ids never clash). */
export const DEFS = `<defs>
<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b0"/><stop offset=".35" stop-color="#ffcc3d"/><stop offset=".75" stop-color="#f08c12"/><stop offset="1" stop-color="#b8560a"/></linearGradient>
<linearGradient id="gSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#dfe6f0"/><stop offset=".8" stop-color="#9aa8bc"/><stop offset="1" stop-color="#6a7890"/></linearGradient>
<linearGradient id="gBronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd2a8"/><stop offset=".4" stop-color="#e8955a"/><stop offset=".8" stop-color="#b05a28"/><stop offset="1" stop-color="#7a3814"/></linearGradient>
<linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8aa0"/><stop offset=".5" stop-color="#ff3d6b"/><stop offset="1" stop-color="#b3124a"/></linearGradient>
<linearGradient id="gRuby" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb0c0"/><stop offset=".4" stop-color="#ff2a55"/><stop offset="1" stop-color="#8a0a2a"/></linearGradient>
<linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ffff0"/><stop offset=".5" stop-color="#2fd9c4"/><stop offset="1" stop-color="#0a8a8f"/></linearGradient>
<linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8dcff"/><stop offset=".5" stop-color="#3d8bff"/><stop offset="1" stop-color="#1a3ab8"/></linearGradient>
<linearGradient id="gViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c2ff"/><stop offset=".5" stop-color="#9a6bff"/><stop offset="1" stop-color="#5a2ad0"/></linearGradient>
<linearGradient id="gNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a5cff"/><stop offset=".5" stop-color="#2e2a9a"/><stop offset="1" stop-color="#16124a"/></linearGradient>
<linearGradient id="gEmerald" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ff5c8"/><stop offset=".5" stop-color="#1fbf8f"/><stop offset="1" stop-color="#06664a"/></linearGradient>
<linearGradient id="gJade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8ffe6"/><stop offset=".45" stop-color="#4fd6a0"/><stop offset="1" stop-color="#16805a"/></linearGradient>
<linearGradient id="gPearl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f4ecff"/><stop offset="1" stop-color="#c9b8e0"/></linearGradient>
<linearGradient id="gRose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd0e0"/><stop offset=".5" stop-color="#ff6b9a"/><stop offset="1" stop-color="#c2265e"/></linearGradient>
<linearGradient id="gRoseGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0e6"/><stop offset=".45" stop-color="#f7b49a"/><stop offset="1" stop-color="#c46a58"/></linearGradient>
<linearGradient id="gGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".5" stop-color="#ffd24a"/><stop offset="1" stop-color="#ff8a1a"/></linearGradient>
<linearGradient id="gMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset=".45" stop-color="#ffe07a"/><stop offset="1" stop-color="#f2a01a"/></linearGradient>
<linearGradient id="gCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e6dcff"/><stop offset="1" stop-color="#a99af0"/></linearGradient>
<linearGradient id="gDawnCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6f0"/><stop offset=".6" stop-color="#ffd0c4"/><stop offset="1" stop-color="#f08aa0"/></linearGradient>
<linearGradient id="gLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff07a"/><stop offset=".5" stop-color="#2fbf5a"/><stop offset="1" stop-color="#0d7a3a"/></linearGradient>
<linearGradient id="gPetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe3ef"/></linearGradient>
<linearGradient id="gCrystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#d8f0ff"/><stop offset=".55" stop-color="#8fc4f0"/><stop offset=".75" stop-color="#f4fbff"/><stop offset="1" stop-color="#6aa0d8"/></linearGradient>
<linearGradient id="gPrism" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff6b9a"/><stop offset=".25" stop-color="#ffd36b"/><stop offset=".5" stop-color="#7cf0b4"/><stop offset=".75" stop-color="#6bc6ff"/><stop offset="1" stop-color="#b38bff"/></linearGradient>
<linearGradient id="gAurora" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4dffc3" stop-opacity="0"/><stop offset=".2" stop-color="#4dffc3"/><stop offset=".5" stop-color="#5ab8ff"/><stop offset=".8" stop-color="#c77dff"/><stop offset="1" stop-color="#c77dff" stop-opacity="0"/></linearGradient>
<radialGradient id="gGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3b0" stop-opacity=".95"/><stop offset=".45" stop-color="#ffb43c" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a1a" stop-opacity="0"/></radialGradient>
<linearGradient id="gKiswah" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5766"/><stop offset=".35" stop-color="#24222a"/><stop offset=".7" stop-color="#0c0b10"/><stop offset="1" stop-color="#2e2c36"/></linearGradient>
<linearGradient id="gCobalt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb4ff"/><stop offset=".5" stop-color="#2a55d6"/><stop offset="1" stop-color="#132a80"/></linearGradient>
<linearGradient id="gCoral" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc2a8"/><stop offset=".5" stop-color="#ff6a4a"/><stop offset="1" stop-color="#c2321e"/></linearGradient>
<linearGradient id="gGlaze" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef2f8"/><stop offset="1" stop-color="#b8c4d8"/></linearGradient>
<linearGradient id="gSunset" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36b"/><stop offset=".35" stop-color="#ff8a3d"/><stop offset=".7" stop-color="#d6457a"/><stop offset="1" stop-color="#5a2ad0"/></linearGradient>
<linearGradient id="gSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffb43c"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient>
<radialGradient id="gGlowV" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e6d8ff" stop-opacity=".9"/><stop offset=".5" stop-color="#9a6bff" stop-opacity=".35"/><stop offset="1" stop-color="#5a2ad0" stop-opacity="0"/></radialGradient>
<radialGradient id="gGlowB" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e0f2ff" stop-opacity=".95"/><stop offset=".5" stop-color="#5ab8ff" stop-opacity=".35"/><stop offset="1" stop-color="#1a3ab8" stop-opacity="0"/></radialGradient>
<radialGradient id="gGlowG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#d8ffe8" stop-opacity=".9"/><stop offset=".5" stop-color="#2fd98f" stop-opacity=".3"/><stop offset="1" stop-color="#06664a" stop-opacity="0"/></radialGradient>
<radialGradient id="gGlowR" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe0e8" stop-opacity=".9"/><stop offset=".5" stop-color="#ff3d6b" stop-opacity=".3"/><stop offset="1" stop-color="#8a0a2a" stop-opacity="0"/></radialGradient>
<filter id="sh" x="-.4" y="-.4" width="1.8" height="1.8"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#12061f" flood-opacity=".55"/></filter>
</defs>`;

export const star = (x: number, y: number, R: number, k = 4, inner = .4) => {
  const p: string[] = [];
  for (let i = 0; i < k * 2; i++) { const a = i * Math.PI / k - Math.PI / 2, d = i % 2 ? R * inner : R; p.push(`${f(x + d * Math.cos(a))} ${f(y + d * Math.sin(a))}`); }
  return `M${p.join('L')}Z`;
};
export const khatam = (x: number, y: number, R: number) => star(x, y, R, 8, .78);
export const at = (r: number, deg: number): [number, number] => { const a = (deg * Math.PI) / 180; return [120 + r * Math.cos(a), 120 + r * Math.sin(a)]; };

/** A chunky ring round the avatar: outline, glossy band, a light bevel on the top left. */
export const ring = (r: number, w: number, grad: string, light = '#fff') =>
  `<circle cx="120" cy="120" r="${r}" fill="none" stroke="${OL}" stroke-width="${w + 5}"/>
   <circle cx="120" cy="120" r="${r}" fill="none" stroke="url(#${grad})" stroke-width="${w}"/>
   <path d="M${f(at(r, 200)[0])} ${f(at(r, 200)[1])}A${r} ${r} 0 0 1 ${f(at(r, 250)[0])} ${f(at(r, 250)[1])}" fill="none" stroke="${light}" stroke-width="${w * .3}" stroke-linecap="round" opacity=".85"/>`;

/** A sparkle: four points and a white heart. */
export const sparkleD = (x: number, y: number, R: number, c = '#fff') => `<path d="${star(x, y, R, 4, .22)}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${f(R * .22)}" fill="#fff"/>`;

/** A cut gem in a gold setting. */
export const gem = (x: number, y: number, r: number, grad: string) =>
  `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="${OL}"/><circle cx="${x}" cy="${y}" r="${r + 1.6}" fill="url(#gGold)"/>
   <path d="${star(x, y, r, 4, .9)}" fill="url(#${grad})" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
   <path d="M${f(x - r * .45)} ${f(y - r * .2)}L${f(x - r * .1)} ${f(y - r * .55)}" stroke="#fff" stroke-width="${f(r * .3)}" stroke-linecap="round" opacity=".9"/>`;

/** A stained-glass fanous, hung from (0, -40) in its own coordinates. */
export const fanous = (glass: [string, string, string] = ['gRed', 'gGlass', 'gTeal']) => `
  <path d="M0 -40V-26" stroke="${OL}" stroke-width="3"/><path d="M0 -40V-26" stroke="#ffd45a" stroke-width="1.4"/>
  <path d="M-8 -26H8L15 -15H-15Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M-15 -15H15L18 -8V20L10 30H-10L-18 20V-8Z" fill="${OL}" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M-15.5 -8H-6V20H-11L-15.5 17Z" fill="url(#${glass[0]})"/><path d="M-5 -8H5V22H-5Z" fill="url(#${glass[1]})"/><path d="M6 -8H15.5V17L11 20H6Z" fill="url(#${glass[2]})"/>
  <path d="M0 -1c4 5 5.5 9 5.5 11.5a5.5 5.5 0 0 1 -11 0c0 -2.5 1.5 -6.5 5.5 -11.5z" fill="#fffbe6"/>
  <path d="M-17 -8H17M-17 21H17M-5.5 -8V21M5.5 -8V21" stroke="url(#gGold)" stroke-width="2.2"/>
  <path d="M-13 -5L-9 3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>
  <path d="M-10 30H10L5 37H-5Z" fill="url(#gGold)" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/>`;

export const cloud = (x: number, y: number, s: number, grad = 'gCloud') => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-40 10C-52 10 -54 -6 -42 -9C-44 -24 -24 -30 -16 -18C-12 -34 14 -34 16 -16C26 -26 44 -18 38 -4C52 -4 52 10 40 10Z" fill="url(#${grad})" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M-34 -6C-30 -14 -22 -16 -16 -12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;

export const leaf = (x: number, y: number, a: number, s = 1, grad = 'gLeaf', vein = '#d6ffc2') => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${s})">
  <path d="M0 0C6 -8 20 -9 26 0C20 9 6 8 0 0Z" fill="url(#${grad})" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/><path d="M3 0H22" stroke="${vein}" stroke-width="1.4" opacity=".8"/></g>`;

export const flower5 = (grad = 'gPetal') => `${[0, 1, 2, 3, 4].map((k) => `<path d="M0 0C-7 -6 -6 -18 0 -20C6 -18 7 -6 0 0Z" fill="url(#${grad})" stroke="${OL}" stroke-width="2" stroke-linejoin="round" transform="rotate(${k * 72})"/>`).join('')}
  <circle r="4" fill="url(#gGold)" stroke="${OL}" stroke-width="1.6"/><circle cx="-1.2" cy="-1.2" r="1.2" fill="#fff"/>`;

export const rose = () => `<circle r="14" fill="url(#gRose)" stroke="${OL}" stroke-width="2.4"/>
  <path d="M-8 -2C-6 -10 6 -11 8 -3C9 4 2 9 -3 6C-7 4 -6 -2 -1 -3C3 -4 4 1 1 2" fill="none" stroke="#8a1240" stroke-width="2" stroke-linecap="round"/>
  <path d="M-9 -7C-6 -11 -2 -12 1 -12" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
