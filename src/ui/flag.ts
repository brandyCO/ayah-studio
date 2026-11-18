// Country flags on profiles (owner decision 2026-11-18): a flag the player picks themselves, never taken from a location.
// Drawn from bundled pictures (public/flags, flag-icons, MIT) so they look the same on every phone; emoji flags do not
// show on Windows. Country names come from the phone (Intl.DisplayNames) in the interface language, so all 30
// languages work without translating ~250 names. The list is ISO 3166-1 (the server checks the same list).
import { h, haptic, toast } from './dom';
import { locale } from '../i18n';

export const COUNTRIES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR '
  + 'CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU '
  + 'ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ '
  + 'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI '
  + 'SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
const OK = new Set(COUNTRIES);
export const isCountry = (c: string | null | undefined): c is string => !!c && OK.has(c);

let names: Intl.DisplayNames | null | undefined;
/** The country's name in the interface language (the code itself where the phone has no names). */
export function countryName(code: string): string {
  if (names === undefined) { try { names = new Intl.DisplayNames(locale() ?? 'en', { type: 'region' }); } catch { names = null; } }
  try { return names?.of(code) ?? code; } catch { return code; }
}

/** A small flag picture (4:3, rounded), or '' when there is none. `size` is its height in px. */
export function flagImg(code: string | null | undefined, size = 14): HTMLElement | '' {
  if (!isCountry(code)) return '';
  const name = countryName(code);
  return h('img', { class: 'flag-img', src: `flags/${code.toLowerCase()}.svg`, alt: name, title: name, width: Math.round(size * 4 / 3), height: size,
    loading: 'lazy', decoding: 'async', draggable: false });
}

/** The phone's own region, offered first in the picker (never set without the player picking it). */
export function phoneRegion(): string | null {
  for (const l of navigator.languages ?? [navigator.language]) {
    const m = /-([A-Za-z]{2})\b/.exec(l ?? '');
    if (m && isCountry(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The flag picker: a search box, the phone's region first, then every country by name; "Don't show a flag" on top.
 *  `labels` are the interface lines (from the friends strings); `save` gets the code picked (empty = none). */
export function pickFlag(current: string, labels: { title: string; sub: string; none: string; search: string },
  save: (code: string) => Promise<void>): void {
  const all = COUNTRIES.map((c) => ({ c, n: countryName(c) })).sort((a, b) => a.n.localeCompare(b.n, locale()));
  const region = phoneRegion();
  const list = h('div', { class: 'flag-list', role: 'listbox', 'aria-label': labels.title });
  const search: HTMLInputElement = h('input', { class: 'flag-search', type: 'search', placeholder: labels.search, 'aria-label': labels.search, autocomplete: 'off' });
  const close = () => d.close();
  const d: HTMLDialogElement = h('dialog', { class: 'sheet bottom flag-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, labels.title), h('button', { class: 'icon-btn', 'aria-label': '✕', onclick: close }, '✕')),
    h('p', { class: 'muted small' }, labels.sub), search, list);
  const choose = (code: string) => {
    haptic(10);
    for (const b of list.querySelectorAll('.flag-row')) b.classList.toggle('on', (b as HTMLElement).dataset.c === code);
    void save(code).then(close, (e) => toast((e as Error).message));
  };
  const row = (code: string, name: string) => h('button', { class: `flag-row${code === current ? ' on' : ''}`, role: 'option', 'aria-selected': String(code === current), 'data-c': code, onclick: () => choose(code) },
    code ? flagImg(code, 18) : h('span', { class: 'flag-none', 'aria-hidden': 'true' }), h('span', {}, name), code === current ? h('span', { class: 'flag-tick', 'aria-hidden': 'true' }, '✓') : '');
  const paint = () => {
    const q = fold(search.value.trim());
    const hits = q ? all.filter((x) => fold(x.n).includes(q) || x.c.toLowerCase() === q) : all;
    const first = !q && region ? all.find((x) => x.c === region) : undefined;
    list.replaceChildren(...(q ? [] : [row('', labels.none)]), ...(first ? [row(first.c, first.n)] : []),
      ...hits.filter((x) => x !== first).map((x) => row(x.c, x.n)));
  };
  search.addEventListener('input', paint);
  paint();
  d.addEventListener('close', () => d.remove());
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
}
