// Unlockable app icons (owner decision 2026-11-13): ten tiers of the main icon — the character inside the ayah marker —
// from Crystal to Pure light (src/data/iconTiers.ts), each won by XP level or sooner by Diamond badges, then
// worn on the home screen instead of the theme's icon (Android: activity-aliases .IconCrystal … .IconLight, switched
// like the theme icons — AppIcons.java; web: the tab icon). They replaced Rare Sapphire / Legendary Gold / Mythic
// Celestial (an old pick moves to the tier won the same way). The choice is localStorage `appIconPick` (follows the
// account). Art: scripts/make-character-icons.py.
import { badgeStates } from '../data/badges';
import { icon } from './icons';
import { ICON_TIERS, pickedTier, type IconTier } from '../data/iconTiers';
import { levelOf, myXp } from '../data/xp';
import { bt, type BadgeKey } from '../i18n/badges';
import { h, haptic, toast } from './dom';
import { refreshAppIcon, themeIconUrl } from './theme';
import { Capacitor } from '@capacitor/core';

export const APP_ICONS = ICON_TIERS;
export type AppIconId = IconTier;

/** How each tier is won (owner decision 2026-11-16): a level, or sooner `diamonds` Diamond badges. League wins no
 *  longer unlock icons. */
interface Rule { level: number; diamonds?: number }
export const RULES: Record<IconTier, Rule> = {
  crystal: { level: 5 },
  molten: { level: 10 },
  garden: { level: 15 },
  pearl: { level: 20 },
  borealis: { level: 25, diamonds: 2 },
  galaxy: { level: 30, diamonds: 3 },
  starlight: { level: 35, diamonds: 4 },
  prism: { level: 40, diamonds: 5 },
  gate: { level: 45, diamonds: 7 },
  light: { level: 50, diamonds: 10 },
};
/** Each tier's colour, for its glow in the lists. */
export const TIER_GLOW: Record<IconTier, string> = {
  crystal: '#8fd0ff', molten: '#ff8a1a', garden: '#4fe0a0', pearl: '#7fd8f0', borealis: '#5ff5e0',
  galaxy: '#c87bff', starlight: '#9fc8ff', prism: '#ff7ad9', gate: '#9f8bff', light: '#ffd36b',
};

const json = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };

/** Which icons are won. */
export function unlockedIcons(): Set<AppIconId> {
  const diamonds = badgeStates().filter((b) => b.earned && b.def.step >= 4).length;
  const level = levelOf(myXp());
  const out = new Set<AppIconId>();
  for (const id of ICON_TIERS) {
    const r = RULES[id];
    if (level >= r.level || (r.diamonds && diamonds >= r.diamonds)) out.add(id);
  }
  return out;
}
/** [your level, the tier's level], for a progress bar. */
export const levelNeed = (id: AppIconId): [number, number] => [Math.min(levelOf(myXp()), RULES[id].level), RULES[id].level];
/** Rarity in the shop: two rare, two epic, three legendary, three mythic. */
export const tierRarity = (id: AppIconId) => { const i = ICON_TIERS.indexOf(id); return i < 2 ? 'rare' : i < 4 ? 'epic' : i < 7 ? 'legendary' : 'mythic'; };

export const pickedIcon = (): AppIconId | '' => pickedTier();
function wear(id: AppIconId | '') {
  try { if (id) localStorage.setItem('appIconPick', id); else localStorage.removeItem('appIconPick'); } catch { /* ignore */ }
  refreshAppIcon();
  haptic();
  toast(Capacitor.isNativePlatform() ? bt('ic.set') : bt('ic.web'));
}

const SEEN = 'appIconsSeen';
const seen = (): string[] => { const v = json(SEEN); return Array.isArray(v) ? v : []; };
/** Icons won since the user last looked at them. */
export const newIcons = () => [...unlockedIcons()].filter((id) => !seen().includes(id));
const markSeen = () => { try { localStorage.setItem(SEEN, JSON.stringify([...unlockedIcons()])); } catch { /* ignore */ } };

const img = (id: AppIconId) => h('img', { class: 'aic-img', src: `${import.meta.env.BASE_URL}icons/app-${id}.webp`, alt: '', width: 72, height: 72, loading: 'lazy' });

/** The app icons card (Me → Stats, under the badges): the theme's icon and the ten tiers to win. */
export function iconCard(): HTMLElement {
  const box = h('section', { class: 'aic' });
  const paint = () => {
    const won = unlockedIcons(), pick = pickedIcon(), fresh = newIcons();
    const opt = (id: AppIconId | '', pic: Node, name: string, sub: string, open: boolean) => h('div', { class: `aic-opt${open ? '' : ' locked'}${pick === id ? ' on' : ''}${id && fresh.includes(id) ? ' fresh' : ''}${id ? ` r-tier${tierRarity(id) === 'mythic' ? ' r-myth' : ''}` : ''}`, style: id ? `--aic:${TIER_GLOW[id]}` : '' },
      h('span', { class: 'aic-pic' }, pic, open ? '' : h('i', { class: 'aic-lock', 'aria-hidden': 'true' }, icon('lock', 22))),
      h('span', { class: 'aic-txt' }, h('b', {}, name), h('span', { class: 'muted small' }, sub),
        id && !open ? h('span', { class: 'aic-bar', 'aria-label': bt('ic.level', { n: levelNeed(id)[0], m: levelNeed(id)[1] }) },
          h('i', { style: `width:${Math.round((levelNeed(id)[0] / levelNeed(id)[1]) * 100)}%` })) : ''),
      open ? h('button', { class: `chip${pick === id ? ' on' : ''}`, disabled: pick === id, onclick: () => { wear(id); paint(); } }, pick === id ? bt('ic.inUse') : bt('ic.use'))
        : h('span', { class: 'aic-state muted small' }, bt('ic.locked')));
    const themePic = h('img', { class: 'aic-img', src: themeIconUrl(), alt: '', width: 72, height: 72 });
    // Folded until tapped (owner, 2026-11-13: eleven icons spread under the badges); opened when one was just won.
    const wasOpen = box.querySelector('details')?.open;
    const now = pick ? img(pick) : h('img', { class: 'aic-img', src: themeIconUrl(), alt: '', width: 72, height: 72 });
    box.replaceChildren(h('details', { class: 'aic-fold', open: wasOpen ?? fresh.length > 0 },
      h('summary', {}, h('span', { class: 'aic-now' }, now),
        h('span', { class: 'aic-txt' }, h('b', { class: 'aic-title' }, bt('icons')), h('span', { class: 'muted small' }, `${won.size + 1} / ${APP_ICONS.length + 1}`)),
        h('span', { class: 'fold-chev', 'aria-hidden': 'true' }, icon('down', 18))),
      h('p', { class: 'muted small' }, bt('iconsSub')),
      opt('', themePic, bt('ic.theme'), bt('ic.themeSub'), true),
      ...APP_ICONS.map((id) => opt(id, img(id), bt(`ic.${id}` as BadgeKey), bt(`ic.${id}How` as BadgeKey), won.has(id)))));
    markSeen();
  };
  paint();
  return box;
}

/** On Me: a card when an icon was just won (until it is looked at). */
export function newIconCard(): HTMLElement | null {
  const fresh = newIcons();
  if (!fresh.length) return null;
  const id = fresh[fresh.length - 1];
  return h('a', { class: 'aic-new r-tier', style: `--aic:${TIER_GLOW[id]}`, href: '#/me/stats' }, img(id),
    h('span', { class: 'aic-txt' }, h('b', {}, bt('ic.new')), h('span', { class: 'small' }, bt('ic.newSub', { name: bt(`ic.${id}` as BadgeKey) }))),
    h('span', { class: 'aic-go', 'aria-hidden': 'true' }, '›'));
}
