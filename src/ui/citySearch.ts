// Prayer times by city name (front-end review F16): for when location is off or refused. Search by English or
// Arabic name; the city's centre is saved like a rounded location (never sent anywhere).
import { CITIES, type City } from '../data/cities';
import './picker.css';
import { prayerSettings, setPrayerSettings } from '../data/prayer';
import { lang, t } from '../i18n';
import { h, haptic, toast } from './dom';

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ًͯ-ْٰ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');

export function citySearch(): HTMLElement {
  const input = h('input', { class: 'search', type: 'search', placeholder: t('pr.cityPh'), 'aria-label': t('pr.city') }) as HTMLInputElement;
  const list = h('div', { class: 'menu city-list' });
  const name = (c: City) => (lang() === 'ar' ? c.ar : c.en);
  const pick = (c: City) => {
    setPrayerSettings({ ...prayerSettings(), lat: c.lat, lng: c.lng });
    haptic(10);
    toast(t('pr.citySet', { name: name(c) }));
  };
  const paint = () => {
    const q = fold(input.value.trim());
    if (!q) { list.replaceChildren(); return; }
    const hits = CITIES.filter((c) => fold(c.en).includes(q) || fold(c.ar).includes(q)).slice(0, 6);
    list.replaceChildren(...(hits.length ? hits.map((c) => h('button', { class: 'menu-item', type: 'button', onclick: () => pick(c) }, name(c)))
      : [h('p', { class: 'muted small' }, t('pr.cityNone'))]));
  };
  input.addEventListener('input', paint);
  return h('div', { class: 'city-search' }, h('b', { class: 'set-label' }, t('pr.city')), input, list);
}
