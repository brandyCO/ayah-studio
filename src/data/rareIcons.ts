// Rare app icons (owner request 2026-11-09): beyond the 12 theme icons, icons sold for Light in the
// shop and icons that can only be won in Ranks (gold / silver / bronze for a week in the top 3, the
// Sun tier). The same light in the ayah marker, each on a scene of its own; Android launcher files and
// the web previews (public/icons/rare/{id}.svg) by scripts/make-icons.py --themes (RARE there).
// Kept light (no shop, no garden): theme.ts reads the chosen icon at start.
import { touchPref } from '../ui/prefs';

export type RareWin = 'p1' | 'p2' | 'p3' | 'sun';
export interface RareIcon { id: string; name: string; price?: number; win?: RareWin }

export const RARE_ICONS: RareIcon[] = [
  { id: 'pearl', name: 'Pearl moon', price: 300 },
  { id: 'rosedawn', name: 'Rose dawn', price: 400 },
  { id: 'starlit', name: 'Starlit', price: 500 },
  { id: 'borealis', name: 'Borealis', price: 650 },
  { id: 'lantern', name: 'Lantern glow', price: 800 },
  { id: 'champion', name: 'Gold laurel', win: 'p1' },
  { id: 'silver', name: 'Silver laurel', win: 'p2' },
  { id: 'bronze', name: 'Bronze laurel', win: 'p3' },
  { id: 'sun', name: 'Sun crown', win: 'sun' },
];

const KEY = 'appIcon';
export const rareIcon = (id: string | null | undefined) => RARE_ICONS.find((r) => r.id === id);
export const rareIconUrl = (id: string) => `${import.meta.env.BASE_URL}icons/rare/${id}.svg`;

/** The rare icon chosen for the app, or '' = the icon of the colour theme. */
export function chosenIcon(): string {
  try {
    const v = localStorage.getItem(KEY) ?? '';
    return rareIcon(v) ? v : '';
  } catch {
    return '';
  }
}

/** Chooses a rare icon ('' = follow the theme). Synced with the account like the theme. */
export function chooseIcon(id: string) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  touchPref(KEY);
  window.dispatchEvent(new Event('app-icon-changed'));
}
