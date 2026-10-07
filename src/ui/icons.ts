// Line icons for the editor (24×24, drawn with currentColor), in the spirit of CapCut's toolbar.
const P: Record<string, string> = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  unfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  audio: '<path d="M3 12h1.5M6.5 9v6M10 5v14M13.5 8v8M17 10.5v3M20.5 12H21"/>',
  mood: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  effects: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6l-5.3 2.8 1.2-6-4.5-4.1 6-.7z"/>',
  colours: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.1-1-1.5-1-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  scenes: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-9 8"/>',
  translation: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  layout: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  split: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5L20 18M8 16.5L20 6"/>',
  trash: '<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13"/>',
  replace: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  transition: '<path d="M4 6l8 6-8 6zM20 6l-8 6 8 6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  magnet: '<path d="M6 4v7a6 6 0 0 0 12 0V4M6 8h4M14 8h4"/>',
  grade: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  darken: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  eyedropper: '<path d="M14.5 5.5l4 4M16.5 3.5l4 4-2.5 2.5-4-4z"/><path d="M14 8l-8.5 8.5L5 19l2.5-.5L16 10"/>',
  silence: '<path d="M7 4H4v16h3M17 4h3v16h-3M9.5 12h1M12 9v6M14.5 11v2"/>',
  gap: '<path d="M8 5v14M16 5v14M10.5 12h3"/>',
  card: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 9h6M9 13h6"/>',
  mode: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  size: '<path d="M3 7V5h9v2M7.5 5v14M14 11v-1.5h7V11M17.5 9.5V19"/>',
  position: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  show: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sync: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  font: '<path d="M4 19l5.5-14h1L16 19M6.5 14h7M17 19v-5.5a2.5 2.5 0 1 1 3 0V19"/>',
  watermark: '<circle cx="12" cy="12" r="9"/><path d="M15 9.6a3.6 3.6 0 1 0 0 4.8"/>',
  hold: '<path d="M4 12h12M13 8l4 4-4 4M20 5v14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  share: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v6h14v-6"/>',
  save: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
};

export function icon(name: keyof typeof P | string, size = 22): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = P[name] ?? P.plus;
  return svg;
}
