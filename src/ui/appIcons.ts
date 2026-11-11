// Unlockable app icons (owner request 2026-11-11): Rare Sapphire, Legendary Gold and Mythic Celestial, won with
// badges and in Ranks, then worn on the home screen instead of the theme's icon (Android: activity-aliases
// .IconSapphire / .IconLegend / .IconCelestial, switched like the theme icons — AppIcons.java; web: the tab
// icon). The choice is localStorage `appIconPick` (follows the account). Art: resources/unlock-icons/.
import { badgeStates } from '../data/badges';
import { bt, type BadgeKey } from '../i18n/badges';
import { h, haptic, toast } from './dom';
import { refreshAppIcon, themeIconUrl } from './theme';
import { Capacitor } from '@capacitor/core';

export const APP_ICONS = ['sapphire', 'legend', 'celestial'] as const;
export type AppIconId = (typeof APP_ICONS)[number];

const json = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const prizes = (): { place: number | null; tier: number }[] => { const p = json('rankCache')?.v?.prizes; return Array.isArray(p) ? p : []; };

/** Which icons are won: by badges (any Platinum / any Diamond / five Diamonds) or by Ranks weeks. */
export function unlockedIcons(): Set<AppIconId> {
  const got = badgeStates().filter((b) => b.earned);
  const plat = got.some((b) => b.def.step >= 3), dia = got.filter((b) => b.def.step === 4).length;
  const p = prizes();
  const out = new Set<AppIconId>();
  if (plat || p.some((x) => x.place)) out.add('sapphire');
  if (dia >= 1 || p.some((x) => x.place === 1)) out.add('legend');
  if (dia >= 5 || p.some((x) => x.place === 1 && x.tier === 4)) out.add('celestial');
  return out;
}

export const pickedIcon = (): AppIconId | '' => { try { const v = localStorage.getItem('appIconPick'); return (APP_ICONS as readonly string[]).includes(v ?? '') ? v as AppIconId : ''; } catch { return ''; } };
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

/** The app icons card (Me → Stats, under the badges): the theme's icon and the three to win. */
export function iconCard(): HTMLElement {
  const box = h('section', { class: 'aic' });
  const paint = () => {
    const won = unlockedIcons(), pick = pickedIcon(), fresh = newIcons();
    const opt = (id: AppIconId | '', pic: Node, name: string, sub: string, open: boolean) => h('div', { class: `aic-opt${open ? '' : ' locked'}${pick === id ? ' on' : ''}${id && fresh.includes(id) ? ' fresh' : ''}${id ? ` r-${id}` : ''}` },
      h('span', { class: 'aic-pic' }, pic, open ? '' : h('i', { class: 'aic-lock', 'aria-hidden': 'true' }, '🔒')),
      h('span', { class: 'aic-txt' }, h('b', {}, name), h('span', { class: 'muted small' }, sub)),
      open ? h('button', { class: `chip${pick === id ? ' on' : ''}`, disabled: pick === id, onclick: () => { wear(id); paint(); } }, pick === id ? bt('ic.inUse') : bt('ic.use'))
        : h('span', { class: 'aic-state muted small' }, bt('ic.locked')));
    const themePic = h('img', { class: 'aic-img', src: themeIconUrl(), alt: '', width: 72, height: 72 });
    box.replaceChildren(
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, bt('icons'))),
      h('p', { class: 'muted small' }, bt('iconsSub')),
      opt('', themePic, bt('ic.theme'), bt('ic.themeSub'), true),
      ...APP_ICONS.map((id) => opt(id, img(id), bt(`ic.${id}` as BadgeKey), bt(`ic.${id}How` as BadgeKey), won.has(id))));
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
  return h('a', { class: `aic-new r-${id}`, href: '#/me/stats' }, img(id),
    h('span', { class: 'aic-txt' }, h('b', {}, bt('ic.new')), h('span', { class: 'small' }, bt('ic.newSub', { name: bt(`ic.${id}` as BadgeKey) }))),
    h('span', { class: 'aic-go', 'aria-hidden': 'true' }, '›'));
}
