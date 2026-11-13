// A level up (XP, 2026-11-11): the first time Ranks shows a higher level than this device last saw, the character
// powers up with the level as the number and, when the level brings a new look, what it now has (levelLook.ts).
import { levelOf, lookBand } from '../data/xp';
import { mt, type MomentKey } from '../i18n/moments';
import { myFigureCode } from './actor';
import { toast } from './dom';

const SEEN = 'rankLevelSeen';
let busy = false;
export async function maybeLevelUp(xp: number) {
  const level = levelOf(xp);
  let seen = 0;
  try { seen = Number(localStorage.getItem(SEEN)) || 0; localStorage.setItem(SEEN, String(Math.max(seen, level))); } catch { return; }
  // The first time (or an older level on this device): just remember it.
  if (!seen || level <= seen || busy) return;
  if (level >= 2) void import('../together/ranks').then((m) => m.sendFeats(['level', level])).catch(() => {}); // friends can say MashaAllah
  const band = lookBand(level), was = lookBand(seen);
  const sub = band > was ? mt(`lv.b${band}` as MomentKey) : mt('lv.sub');
  if (!myFigureCode() || document.querySelector('.cel')) { toast(`${mt('lv.up')} · ${level}`); return; }
  busy = true;
  try { await (await import('./powerUp')).powerUp(level, { custom: { kicker: mt('lv.up'), label: mt('lv.word'), sub, aura: 1 + Math.min(4, band) } }); } finally { busy = false; }
}
