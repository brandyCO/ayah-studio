// "New for your character" on Me (owner request 2026-11-10): pieces earned by a streak or a season wait in a chest;
// opening it gives them (the moment shows each one on the user's own character), then the builder is one tap away.
import { BG, WARDROBE, figureSvg, parse, wearing, bustMarkup, type Rarity } from './figure';
import { earnedPieces, grantPiece } from '../data/wardrobe';
import { rt, type RankKey } from '../i18n/ranks';
import { chest } from './chest';
import { h } from './dom';
import { myFigureCode } from './actor';

const WEIGHT: Record<Rarity, number> = { cute: 10, rare: 30, epic: 60, legendary: 120 };

/** A piece shown on the user's character (or the default one), in a disc. */
export function pieceArt(id: string, size = 60): HTMLElement {
  const s = h('span', { class: 'wd-piece', 'aria-hidden': 'true' });
  const f = wearing(parse(myFigureCode()), id);
  // A background or glasses read best on the bust; an outfit or something held needs the whole character.
  const slot = id.split(':')[0];
  s.innerHTML = slot === 'bg' || slot === 'glasses'
    ? `<svg viewBox="1 1 38 38" width="${size}" height="${size}">${bustMarkup(f, 18)}</svg>`
    : `<span style="display:grid;place-items:end center;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 35% 30%,${BG[f.bg][0]},${BG[f.bg][1]})">${figureSvg(f, { size: Math.round(size * 0.66), still: true })}</span>`;
  return s;
}

/** The waiting card, or null when nothing new was earned. */
export function wardrobeCard(onDone: () => void): HTMLElement | null {
  const ids = earnedPieces();
  if (!ids.length) return null;
  const best = ids.reduce((m, id) => Math.max(m, WEIGHT[WARDROBE[id].r]), 0);
  const open = async (from: HTMLElement) => {
    const loot = ids.map((id) => {
      const [slot, v] = id.split(':');
      return { kind: 'item' as const, art: pieceArt(id, 56), label: `${rt(`fb.${slot}.${v}` as RankKey)} · ${rt(`fb.r.${WARDROBE[id].r}` as RankKey)}`, rare: WARDROBE[id].r === 'epic' || WARDROBE[id].r === 'legendary' };
    });
    for (const id of ids) grantPiece(id);
    const { celebrate } = await import('./celebrate');
    await celebrate({ kind: 'chest', kicker: rt('fb.newKicker'), title: rt('fb.newTitle'), sub: rt(`fb.how.${WARDROBE[ids[0]].how}` as RankKey), loot }, from, best);
    card.remove();
    onDone();
  };
  const card: HTMLElement = h('section', { class: 'me-card wd-card' },
    chest(best, 'ready', rt('fb.newTitle'), (el) => void open(el)),
    h('div', { class: 'wd-txt' }, h('b', {}, rt('fb.newTitle')),
      h('p', { class: 'muted small' }, ids.length > 1 ? rt('fb.newSub', { n: ids.length }) : rt('fb.newSub1'))),
    h('span', { class: 'wd-peek' }, ...ids.slice(0, 3).map((id) => pieceArt(id, 40))));
  return card;
}
