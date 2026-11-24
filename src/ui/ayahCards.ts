// Ayah of the day on Me (owner request 2026-11-24): one card, two sides. "Today's ayah" is the same for
// everyone (src/data/daily.ts) and can be shared; "My ayah" is picked from what this user memorises and reads
// (src/data/myAyah.ts), with a line saying why. Each side: the Arabic in the Quran font (whole, never cut),
// the chosen translation, the reference, and Listen · Read · Reel · Share. The side shown is remembered.
import { todaysAyah, type DailyItem } from '../data/daily';
import { myAyah, type MyAyah } from '../data/myAyah';
import { loadMeta, surahText, surahTranslation, type SurahMeta } from '../data/quran';
import { currentTranslation, translationInfo } from '../data/translations';
import { surahName, t, uiRef } from '../i18n';
import { dyt, type DailyKey } from '../i18n/daily';
import { h, haptic } from './dom';
import { icon } from './icons';
import { shareableLink } from '../native';
import './ayahCards.css';

type Side = 'today' | 'mine';
const PREF = 'ayahSide';
const side = (): Side => { try { return localStorage.getItem(PREF) === 'mine' ? 'mine' : 'today'; } catch { return 'today'; } };
const setSide = (s: Side) => { try { localStorage.setItem(PREF, s); } catch { /* ignore */ } };

interface Shown { s: number; from: number; to: number; ar: string; tr: string; ref: string; kicker: string; credit: string; trDir: string }

async function shown(meta: SurahMeta[], s: number, from: number, to: number, kicker: string): Promise<Shown> {
  const id = currentTranslation();
  const [ar, tr] = await Promise.all([surahText(s), surahTranslation(s, id)]);
  const info = translationInfo(id);
  const span = (list: string[]) => list.slice(from - 1, to).join(' ');
  return { s, from, to, ar: span(ar), tr: span(tr), ref: uiRef(meta[s - 1], from, to), kicker, credit: info.translator, trDir: info.dir };
}

export const whyLine = (meta: SurahMeta[], m: MyAyah) =>
  dyt(`dy.why.${m.why}` as DailyKey, { surah: surahName(meta[m.s - 1]) });

async function share(x: Shown) {
  const link = shareableLink(`#/s/${x.s}/${x.from}`);
  const text = `${x.ar}\n\n${x.tr}\n\n— ${x.ref} · ${x.credit}\n\n${dyt('dy.shareInvite')}`;
  const { share: send } = await import('./ranks');
  await send(dyt('dy.shareTitle'), text, link);
}

/** The card, filled in when the ayat are ready (empty and hidden until then). */
export function ayahCard(): HTMLElement {
  const card = h('section', { class: 'me-card ayc', hidden: true, 'aria-label': dyt('dy.title') });
  void (async () => {
    const [meta, today] = await Promise.all([loadMeta(), todaysAyah()]);
    const mine = await myAyah(new Date(), today as DailyItem);
    const sides: Record<Side, Shown> = {
      today: await shown(meta, today.s, today.from, today.to, dyt('dy.todaySub')),
      mine: await shown(meta, mine.s, mine.a, mine.a, whyLine(meta, mine)),
    };
    let cur = side();
    const body = h('div', { class: 'ayc-body' });
    const tabs = (['today', 'mine'] as const).map((k) => h('button', {
      class: 'ayc-tab', role: 'tab', type: 'button',
      onclick: () => { if (cur === k) return; haptic(); cur = k; setSide(k); paint(true); },
    }, dyt(k === 'today' ? 'dy.today' : 'dy.mine')));
    const paint = (move = false) => {
      tabs.forEach((b, i) => { const on = (i === 0) === (cur === 'today'); b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      card.classList.toggle('mine', cur === 'mine');
      const x = sides[cur];
      body.replaceChildren(
        h('p', { class: 'ayc-kicker' }, icon(cur === 'today' ? 'sparkle' : 'book', 16), h('span', {}, x.kicker)),
        h('p', { class: 'ayc-ar', lang: 'ar', dir: 'rtl' }, x.ar),
        h('p', { class: 'ayc-tr', dir: x.trDir }, x.tr),
        h('p', { class: 'ayc-ref' }, h('b', {}, x.ref), h('span', {}, ` · ${x.credit}`)),
        h('div', { class: 'ayc-acts' },
          h('button', { class: 'ayc-act', type: 'button', onclick: () => {
            haptic();
            try { sessionStorage.setItem('tabIntent', `play:${x.s}:${x.from}`); } catch { /* ignore */ }
            location.hash = `#/s/${x.s}/${x.from}`;
          } }, icon('play', 18), dyt('dy.listen')),
          h('a', { class: 'ayc-act', href: `#/s/${x.s}/${x.from}` }, icon('book', 18), dyt('dy.read')),
          h('a', { class: 'ayc-act', href: `#/reel/${x.s}/${x.from}-${x.to}` }, icon('film', 18), dyt('dy.reel')),
          h('button', { class: 'ayc-act', type: 'button', onclick: () => { haptic(); void share(x); } }, icon('share', 18), dyt('dy.share'))));
      if (move && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        body.animate([{ opacity: 0, translate: `${cur === 'mine' ? 14 : -14}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
      }
    };
    card.replaceChildren(
      h('div', { class: 'ayc-head' },
        h('h2', { class: 'me-h' }, dyt('dy.title')),
        h('div', { class: 'ayc-tabs', role: 'tablist' }, ...tabs)),
      body);
    paint();
    card.hidden = false;
  })().catch((e) => console.warn('Ayah of the day', e));
  return card;
}

/** News (#/news): today's shared ayah, the one everyone reads today, with Share. */
export function todayAyahCard(): HTMLElement {
  const card = h('section', { class: 'me-card ayc ayc-news', hidden: true });
  void (async () => {
    const [meta, d] = await Promise.all([loadMeta(), todaysAyah()]);
    const x = await shown(meta, d.s, d.from, d.to, dyt('dy.todaySub'));
    card.replaceChildren(
      h('p', { class: 'ayc-kicker' }, icon('sparkle', 16), h('span', {}, dyt('dy.newsHead'))),
      h('p', { class: 'ayc-ar', lang: 'ar', dir: 'rtl' }, x.ar),
      h('p', { class: 'ayc-tr', dir: x.trDir }, x.tr),
      h('div', { class: 'ayc-foot' },
        h('p', { class: 'ayc-ref' }, h('b', {}, x.ref)),
        h('button', { class: 'ayc-share', type: 'button', onclick: () => { haptic(); void share(x); } }, icon('share', 18), dyt('dy.share'))));
    card.hidden = false;
  })().catch((e) => console.warn('Today\'s ayah', e));
  return card;
}

/** The Read bar's Today line for My ayah (mushaf.ts registers it; kept here so first load stays small). */
export async function myAyahToday(listen: (s: number, a: number) => void) {
  const [meta, d] = await Promise.all([loadMeta(), todaysAyah()]);
  const m = await myAyah(new Date(), d);
  return [{
    icon: 'book', text: `${dyt('dy.mine')} · ${uiRef(meta[m.s - 1], m.a)}`, href: `#/s/${m.s}/${m.a}`, inline: true,
    actions: [{ label: t('today.listen'), icon: 'play', onClick: () => listen(m.s, m.a) }],
  }];
}
