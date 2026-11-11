// XP (owner decision 2026-11-11, "Light is money, XP is progress"): Ranks points are XP. This week's XP sets the league
// place; all the XP ever earned (the server's `total`) gives the character its level, which it visibly grows into
// (src/ui/levelLook.ts). Level L starts at 100 × (L − 1)² XP, up to level 50. Kept on this device as `rankXp` (from the
// last Ranks status) so Me can show it without asking the server.
import { lang } from '../i18n';

export const MAX_LEVEL = 50;
export const levelOf = (xp: number) => Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
/** XP at which level `l` starts. */
export const levelStart = (l: number) => 100 * (Math.max(1, l) - 1) ** 2;
/** How far into the current level (0–1), and the XP still needed for the next. */
export function levelProgress(xp: number): { level: number; p: number; need: number } {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) return { level, p: 1, need: 0 };
  const a = levelStart(level), b = levelStart(level + 1);
  return { level, p: (xp - a) / (b - a), need: b - xp };
}
/** The look band a level gives the character: 0 plain … 6 radiant (levelLook.ts). */
export const lookBand = (level: number) => level >= 50 ? 6 : level >= 40 ? 5 : level >= 30 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0;

export const myXp = (): number => { try { return Math.max(0, Number(localStorage.getItem('rankXp')) || 0); } catch { return 0; } };
export const setMyXp = (xp: number) => { try { localStorage.setItem('rankXp', String(Math.max(0, xp | 0))); } catch { /* ignore */ } };

/** "Lv 12" / "م 12" (short) or "Level 12" / "المستوى 12". */
export const levelLabel = (l: number, short = false) =>
  lang() === 'ar' ? (short ? `م ${l}` : `المستوى ${l}`) : short ? `Lv ${l}` : `Level ${l}`;
