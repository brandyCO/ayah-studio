// Line icons for the editor (24×24, drawn with currentColor), in the spirit of CapCut's toolbar.
const P: Record<string, string> = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
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
  restart: '<path d="M6 5v14"/><path d="M19 5v14l-10-7z" fill="currentColor" stroke="none"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  clip: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M10.5 9.5v5l4-2.5z"/>',
  split: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5L20 18M8 16.5L20 6"/>',
  trash: '<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13"/>',
  replace: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  transition: '<path d="M4 6l8 6-8 6zM20 6l-8 6 8 6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.75" cy="10.75" r="6.25"/><path d="M15.25 15.25 19.5 19.5"/>', // same 15 × 15 box as listen
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
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  highlight: '<path d="M4 18h16"/><path d="M6 14h4M14 14h4"/><rect x="9.5" y="6" width="5" height="10" rx="1.5" fill="currentColor" stroke="none" opacity=".45"/><path d="M10 14h4"/>',
  grain: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h.01M12 9h.01M16 8h.01M9 12h.01M14 12h.01M8 16h.01M12 15h.01M16 16h.01" stroke-width="2.4"/>',
  vignette: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><ellipse cx="12" cy="12" rx="5.5" ry="4"/>',
  keyframe: '<path d="M12 4l6 8-6 8-6-8z"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  prev: '<path d="M15 6l-6 6 6 6M6 5v14"/>',
  next: '<path d="M9 6l6 6-6 6M18 5v14"/>',
  save: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
  listen: '<path d="M4 17v-4.5a8 8 0 0 1 16 0V17"/><path d="M4 13h2.5A1.5 1.5 0 0 1 8 14.5v3.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18zM20 13h-2.5a1.5 1.5 0 0 0-1.5 1.5v3.5a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5z"/>', // optically matched to search (closed cups weigh like the lens)
  create: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none"/>',
  sprout: '<path d="M12 21v-8.5"/><path d="M12 12.5C12 8 15 5.5 20 5.5c0 4.6-3 7-8 7z"/><path d="M12 15c0-3.6-2.6-6-7-6 0 3.7 2.6 6 7 6z"/><path d="M8 21h8"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="12" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h2.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3"/><path d="M12 13v3.5M8.5 20h7M10 16.5h4l.5 3.5h-5z"/>',
  me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-5.5 7-5.5s6.2 1.7 7 5.5"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6.1M17.6 13.6a6.2 6.2 0 0 1 3.6 5.9"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  bellOff: '<path d="M8.2 5.9A6 6 0 0 1 18 11v4M6 11v5.5L4.5 18H17"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0M3.5 3.5l17 17"/>',
  mosque: '<path d="M5 20.5V12a7 7 0 0 1 14 0v8.5"/><path d="M12 5V2.8M10.5 3.6h3"/><path d="M3 20.5h18M10 20.5v-4a2 2 0 0 1 4 0v4"/>',
  medal: '<path d="M8 3h3l1 4.5M16 3h-3l-1 4.5"/><circle cx="12" cy="14.5" r="6"/><path d="M12 11.5l.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3z"/>',
  library: '<path d="M4 4h3.5v16H4zM9.5 4H13v16H9.5z"/><path d="M15 5.2l3.3-.9 3.5 14.8-3.3.8z"/>',
  film: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M8 4v16M16 4v16M3.5 9H8M3.5 15H8M16 9h4.5M16 15h4.5"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  widget: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/>',
  voice: '<path d="M4 12a8 8 0 0 1 8-8h0a8 8 0 0 1 0 16H6.5L4 21.5z"/><path d="M9 10.5v3M12 9v6M15 10.5v3"/>',
  beads: '<circle cx="12" cy="4.5" r="1.7"/><circle cx="17.3" cy="6.7" r="1.7"/><circle cx="19.5" cy="12" r="1.7"/><circle cx="17.3" cy="17.3" r="1.7"/><circle cx="6.7" cy="6.7" r="1.7"/><circle cx="4.5" cy="12" r="1.7"/><circle cx="6.7" cy="17.3" r="1.7"/><path d="M12 19v2.5"/><circle cx="12" cy="19" r="1.4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C10 8.5 7 8 7 6a2 2 0 0 1 4-.5L12 8.5l1-3a2 2 0 0 1 4 .5c0 2-3 2.5-5 2.5"/>',
  shirt: '<path d="M8.5 3.5 4 6l1.5 4.5 2-.8V20.5h9V9.7l2 .8L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>',
  swords: '<path d="M14.5 3.5H20.5V9.5L9 21 6 21.5 3 18.5 3.5 15.5z" /><path d="M3.5 3.5h6l3 3M20.5 18.5l-3 3M17.5 15.5l3 3M6 9.5 3.5 7V3.5"/>',
  lamp: '<path d="M12 3c1.5 2 2.5 3.2 2.5 4.6a2.5 2.5 0 0 1-5 0C9.5 6.2 10.5 5 12 3z"/><path d="M4 13.5c2 3.5 5 5 8 5s6-1.5 8-5H4z"/><path d="M20 13.5c1 0 1.5-.8 1.5-1.8M9 21h6M12 18.5V21"/>',
  hands: '<path d="M11 20.5 7.5 17A4 4 0 0 1 6 14V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M9 11V4.5a1.5 1.5 0 0 1 2 1.4v14.6"/><path d="M13 20.5 16.5 17A4 4 0 0 0 18 14V6.5a1.5 1.5 0 0 0-3 0V11"/><path d="M15 11V4.5a1.5 1.5 0 0 0-2 1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  flame: '<path d="M12 21.5c-4 0-6.5-2.8-6.5-6.3 0-4.2 3.6-6.2 4.6-10.7 2.6 1.6 4.3 4 4.6 6.4.8-.7 1.3-1.9 1.4-3 1.6 1.7 2.4 4 2.4 6.3 0 4.1-2.5 7.3-6.5 7.3z"/>',
  snow: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2"/>',
  bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  crescent: '<path d="M15.5 3.8a8.5 8.5 0 1 0 4.7 12.7A7 7 0 0 1 15.5 3.8z"/>',
  puzzle: '<path d="M5 8.5h3.5a2 2 0 1 1 4 0H16v3.5a2 2 0 1 1 0 4V20H5v-3.5a2 2 0 1 0 0-4z"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  reply: '<path d="M10 6 4 12l6 6"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
  letters: '<path d="M3.5 18 8 6l4.5 12M5.2 13.5h5.6"/><path d="M15 10.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18 9.5V18"/>',
};

/** Parsed once per name and size, then cloned (the tool bar redraws often). */
const made = new Map<string, SVGSVGElement>();
export function icon(name: keyof typeof P | string, size = 22): SVGSVGElement {
  const key = `${name}|${size}`;
  let tpl = made.get(key);
  if (!tpl) made.set(key, (tpl = build(name, size)));
  return tpl.cloneNode(true) as SVGSVGElement;
}
function build(name: string, size: number): SVGSVGElement {
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
