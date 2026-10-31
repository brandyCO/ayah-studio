// ★ favourite reciters: the star in the reciter pickers, the "Download {name}?" sheet (how much to keep,
// with the size; owner decision 2026-10-31: ask each time) and the manage sheet (progress, more, remove).
import { allSurahs, estimateBytes, freeSpace, isFavourite, keptInfo, setFavourite, wantedSurahs } from '../data/reciterDownload';
import { loadMeta } from '../data/quran';
import { reciterCredit, type Reciter } from '../data/reciters';
import { surahName, t } from '../i18n';
import { h, haptic } from './dom';

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

function sheet(title: string, ...body: Node[]) {
  const d = h('dialog', { class: 'sheet bottom fav-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    ...body);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  return d;
}

/** The ★ beside a reciter in a list (inside the row's button: a span, like the voice sample). */
export function starButton(r: Reciter, surah: number | null, onChange: () => void): HTMLElement {
  const on = isFavourite(r.id);
  const open = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    haptic();
    if (isFavourite(r.id)) manageFavourite(r, surah, onChange);
    else askDownload(r, surah, onChange);
  };
  return h('span', {
    class: `fav-star${on ? ' on' : ''}`, role: 'button', tabindex: '0', 'aria-pressed': String(on),
    'aria-label': t(on ? 'fav.manage' : 'fav.add', { name: r.short }), title: t(on ? 'fav.manage' : 'fav.add', { name: r.short }),
    onclick: open, onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') open(e); },
  }, on ? '★' : '☆');
}

/** "Download {name}?": how much to keep, each with its size. */
export function askDownload(r: Reciter, surah: number | null, onChange: () => void) {
  const all = allSurahs(r);
  const amma = all.filter((s) => s >= 78);
  const pick = async (surahs: number[]) => {
    await setFavourite(r.id, surahs);
    d.close();
    onChange();
  };
  const opt = (label: string, surahs: number[]) => {
    const size = h('span', { class: 'muted small' }, '…');
    void estimateBytes(r, surahs).then((b) => { size.textContent = t('fav.about', { size: mb(b) }); });
    return h('button', { class: 'menu-item fav-opt', onclick: () => void pick(surahs) }, h('span', {}, label), size);
  };
  const free = h('p', { class: 'muted small' });
  void freeSpace().then((b) => { if (b !== null) free.textContent = t('fav.free', { size: mb(b) }); });
  const body = h('div', {},
    h('p', { class: 'muted small' }, t('fav.help')),
    free,
    h('div', { class: 'menu' },
      opt(t('fav.whole'), all),
      amma.length ? opt(t('fav.amma'), amma) : '',
      surah && all.includes(surah) ? opt(t('fav.this'), [surah]) : '',
      h('button', { class: 'menu-item', onclick: () => void choose() }, t('fav.choose')),
      h('button', { class: 'menu-item', onclick: () => void pick([]) }, t('fav.starOnly'))));
  const d = sheet(t('fav.title', { name: reciterCredit(r) }), body);

  /** A list of the reciter's surahs to tick. */
  async function choose() {
    const meta = await loadMeta();
    const ticked = new Set<number>(wantedSurahs(r.id));
    const size = h('span', { class: 'muted small' });
    const go = h('button', { class: 'primary brand-btn', onclick: () => void pick([...ticked]) }, t('fav.download')) as HTMLButtonElement;
    const sum = () => {
      go.disabled = !ticked.size;
      void estimateBytes(r, [...ticked]).then((b) => { size.textContent = ticked.size ? t('fav.about', { size: mb(b) }) : ''; });
    };
    body.replaceChildren(
      h('div', { class: 'sheet-scroll fav-list' }, ...all.map((s) => h('label', { class: 'menu-item' },
        h('input', { type: 'checkbox', checked: ticked.has(s), onchange: (e: Event) => {
          if ((e.target as HTMLInputElement).checked) ticked.add(s); else ticked.delete(s);
          sum();
        } }),
        h('span', {}, `${s}. ${surahName(meta[s - 1])}`)))),
      h('div', { class: 'fav-go' }, size, go));
    sum();
  }
}

/** A favourite's sheet: what is kept, download more, remove. */
export function manageFavourite(r: Reciter, surah: number | null, onChange: () => void) {
  const status = h('p', {});
  const paint = () => {
    const k = keptInfo(r.id);
    status.textContent = !k.wanted ? t('fav.none')
      : k.kept === k.wanted ? t('fav.done', { n: k.kept, size: mb(k.bytes) })
      : `${t('fav.progress', { n: k.kept, of: k.wanted, size: mb(k.bytes) })} · ${t(k.running ? 'fav.running' : k.waiting ? 'fav.wifi' : 'fav.queued')}`;
  };
  paint();
  const d = sheet(reciterCredit(r),
    status,
    h('div', { class: 'menu' },
      h('button', { class: 'menu-item', onclick: () => { d.close(); askDownload(r, surah, onChange); } }, t('fav.more')),
      h('button', { class: 'menu-item danger', onclick: async () => { await setFavourite(r.id, null); d.close(); onChange(); } }, t('fav.remove'))));
  window.addEventListener('favourites-changed', paint);
  d.addEventListener('close', () => window.removeEventListener('favourites-changed', paint));
}

/** Me → Settings: the favourites with what each keeps. */
export function favouritesSection(list: Reciter[], repaint: () => void): Node {
  return h('div', { class: 'menu' }, ...list.map((r) => {
    const k = keptInfo(r.id);
    return h('button', { class: 'menu-item fav-opt', onclick: () => manageFavourite(r, null, repaint) },
      h('span', {}, `★  ${reciterCredit(r)}`),
      h('span', { class: 'muted small' }, !k.wanted ? t('fav.none')
        : k.kept === k.wanted ? t('fav.done', { n: k.kept, size: mb(k.bytes) })
        : t('fav.progress', { n: k.kept, of: k.wanted, size: mb(k.bytes) })));
  }));
}
