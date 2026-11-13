// The ten unlockable app icons (owner decision 2026-11-13): the main icon's character inside the ayah marker, each
// tier stranger and brighter than the last — Crystal … Pure light. Won by XP level (src/data/xp.ts) or, sooner, by
// badges and Ranks weeks (src/ui/appIcons.ts checks). They replaced Rare Sapphire / Legendary Gold / Mythic Celestial
// (2026-11-11): an old pick moves to the tier won the same way. Art: scripts/make-character-icons.py. This module is
// tiny on purpose: theme.ts (first load) reads the pick from it.

export const ICON_TIERS = ['crystal', 'molten', 'garden', 'pearl', 'borealis', 'galaxy', 'starlight', 'prism', 'gate', 'light'] as const;
export type IconTier = (typeof ICON_TIERS)[number];

/** Old unlockable icons → the tier that is won the same way. */
const LEGACY: Record<string, IconTier> = { sapphire: 'garden', legend: 'borealis', celestial: 'prism' };

/** The tier icon worn instead of the theme's ('' = the theme's own icon). */
export function pickedTier(): IconTier | '' {
  try {
    let v = localStorage.getItem('appIconPick') ?? '';
    if (LEGACY[v]) { v = LEGACY[v]; localStorage.setItem('appIconPick', v); }
    return (ICON_TIERS as readonly string[]).includes(v) ? v as IconTier : '';
  } catch { return ''; }
}
