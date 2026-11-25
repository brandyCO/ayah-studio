// Puts a Discord-style decoration round an avatar (owner decision 2026-11-24). The decoration is 1.5× the avatar.
// Each piece is one SVG picture the browser draws once; `live` lets the moving pieces move (CSS transform / opacity),
// otherwise they stay still (lists, old phones, reduced motion).
import './deco.css';
import { framePieces, pieceSvg, type Piece } from './frames';

const urls = new Map<string, string>();
function pieceUrl(key: string, p: Piece): string {
  let u = urls.get(key);
  if (!u) { u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSvg(p))}`; if (urls.size > 600) urls.clear(); urls.set(key, u); }
  return u;
}

/** `avatar` is the round avatar picture; `size` the avatar's diameter in px. */
export function decorated(avatar: HTMLElement, frame: number, tier: number, size: number, live = false): HTMLElement {
  const box = document.createElement('span');
  box.className = `dk${live ? ' live' : ''}`;
  const S = size * 1.5;
  box.style.width = box.style.height = `${S}px`;
  box.style.margin = `${-size / 4}px`;
  const pieces = framePieces(frame, tier);
  layPieces(box, pieces, `${frame}|${tier}`, 240, 240, avatar);
  return box;
}

/** An item drawn on its own (shop card, room, profile effect): pieces in a w × h box shown at `width` px. */
export function stage(pieces: Piece[], key: string, width: number, w = 240, h = 240, live = false, only?: Piece['z']): HTMLElement {
  const box = document.createElement('span');
  box.className = `dk${live ? ' live' : ''}`;
  box.style.width = `${width}px`;
  box.style.height = `${(width * h) / w}px`;
  layPieces(box, pieces, key, w, h, undefined, only);
  return box;
}

function layPieces(box: HTMLElement, pieces: Piece[], key: string, W: number, H: number, avatar?: HTMLElement, only?: Piece['z']) {
  const px = (n: number) => `${((n / W) * 100).toFixed(3)}%`, py = (n: number) => `${((n / H) * 100).toFixed(3)}%`;
  const add = (p: Piece, i: number) => {
    const [x, y, w, h] = p.box ?? [0, 0, W, H];
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.src = pieceUrl(`${key}|${i}`, { ...p, box: [x, y, w, h] });
    Object.assign(img.style, { left: px(x), top: py(y), width: px(w), height: py(h) });
    if (p.anim) {
      img.dataset.a = p.anim;
      if (p.delay) img.style.animationDelay = `-${p.delay}s`;
      const [ox, oy] = p.origin ?? [x + w / 2, y + h / 2];
      img.style.transformOrigin = `${(((ox - x) / w) * 100).toFixed(2)}% ${(((oy - y) / h) * 100).toFixed(2)}%`;
    }
    box.append(img);
  };
  if (only !== 'front') pieces.forEach((p, i) => { if (p.z === 'back') add(p, i); });
  if (avatar) {
    const av = document.createElement('span');
    av.className = 'dk-av';
    av.append(avatar);
    box.append(av);
  }
  if (only !== 'back') pieces.forEach((p, i) => { if (p.z === 'front') add(p, i); });
}
