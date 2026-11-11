// ★ favourite reciters: the star in the reciter pickers, the "Download {name}?" sheet (how much to keep,
// with the size; owner decision 2026-10-31: ask each time) and the manage sheet (progress, more, remove).
import { allowMobileData, allSurahs, downloadProgress, estimateBytes, freeSpace, isFavourite, keptInfo, mobileDataAllowed, resumeDownloads, setFavourite, wantedSurahs } from '../data/reciterDownload';
import { loadMeta } from '../data/quran';
import { reciterCredit, type Reciter } from '../data/reciters';
import { surahName, t } from '../i18n';
import { h, haptic, toast } from './dom';

/** "about 2 h 10 min left" */
function timeLeft(sec: number): string {
  if (sec < 60) return t('fav.etaSoon');
  const m = Math.round(sec / 60);
  return m < 60 ? t('fav.etaMin', { m }) : t('fav.etaHour', { h: Math.floor(m / 60), m: m % 60 });
}

/** The status line of a favourite: kept, downloading now (with what is left and the time), or waiting. */
function statusText(r: Reciter, meta: { en: string }[] | null): string {
  const k = keptInfo(r.id);
  if (!k.wanted) return t('fav.none');
  if (k.kept === k.wanted) return t('fav.done', { n: k.kept, size: mb(k.bytes) });
  const head = t('fav.progress', { n: k.kept, of: k.wanted, size: mb(k.bytes) });
  if (k.paused) return `${head} · ${t('fav.paused')}`;
  const p = k.running ? downloadProgress(r.id) : null;
  if (p) {
    const now = meta ? t('fav.now', { s: meta[p.surah - 1]?.en ?? p.surah }) : t('fav.running');
    const left = p.left !== null ? ` · ${t('fav.left', { size: mb(p.left) })}` : '';
    return `${head} · ${now}${left}${p.eta !== null ? ` · ${timeLeft(p.eta)}` : ''}`;
  }
  return `${head} · ${t(k.running ? 'fav.running' : k.waiting ? 'fav.wifi' : 'fav.queued')}`;
}

const mb = (bytes: number) => (!bytes ? "0 MB" : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

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

/** "Download {name}?": how much to keep, each with its size. */
export function askDownload(r: Reciter, surah: number | null, onChange: () => void) {
  const all = allSurahs(r);
  const amma = all.filter((s) => s >= 78);
  const pick = async (surahs: number[]) => {
    await setFavourite(r.id, surahs);
    d.close();
    onChange();
    if (surahs.length) {
      // Show at once that it started (or what it waits for), with the progress and the time left.
      toast(t(keptInfo(r.id).waiting ? 'fav.startedWait' : 'fav.started', { name: r.short }));
      manageFavourite(r, surah, onChange);
    }
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
      h('button', { class: 'menu-item', onclick: () => void chooseJuz() }, t('fav.chooseJuz')),
      h('button', { class: 'menu-item', onclick: () => void choose() }, t('fav.choose')),
      h('button', { class: 'menu-item', onclick: () => void pick([]) }, t('fav.starOnly'))));
  const d = sheet(t('fav.title', { name: reciterCredit(r) }), body);

  /** Whole juz to tick (the surahs they take in: recordings come a surah at a time). */
  async function chooseJuz() {
    const div = await (await import('../data/search')).loadDivisions();
    const meta = await loadMeta();
    const has = new Set(all);
    const surahsOf = (j: number) => {
      const [s0] = div.juz[j - 1];
      const next = div.juz[j];
      const s1 = next ? (next[1] === 1 ? next[0] - 1 : next[0]) : 114;
      return Array.from({ length: s1 - s0 + 1 }, (_, i) => s0 + i).filter((x) => has.has(x));
    };
    const ticked = new Set<number>();
    const size = h('span', { class: 'muted small' });
    const go = h('button', { class: 'primary brand-btn', onclick: () => void pick([...new Set([...ticked].flatMap(surahsOf))]) }, t('fav.download')) as HTMLButtonElement;
    const sum = () => {
      const list = [...new Set([...ticked].flatMap(surahsOf))];
      go.disabled = !list.length;
      void estimateBytes(r, list).then((b) => { size.textContent = list.length ? t('fav.about', { size: mb(b) }) : ''; });
    };
    body.replaceChildren(
      h('div', { class: 'sheet-scroll fav-list' }, ...Array.from({ length: 30 }, (_, i) => i + 1).filter((j) => surahsOf(j).length).map((j) => {
        const ss = surahsOf(j);
        return h('label', { class: 'menu-item' },
          h('input', { type: 'checkbox', onchange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) ticked.add(j); else ticked.delete(j);
            sum();
          } }),
          h('span', {}, `${t('pl.juzN', { n: j })} · ${surahName(meta[ss[0] - 1])}${ss.length > 1 ? ` – ${surahName(meta[ss[ss.length - 1] - 1])}` : ''}`));
      })),
      h('div', { class: 'fav-go' }, size, go));
    sum();
  }

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
  const status = h('p', { 'aria-live': 'polite' });
  const fill = h('div', { class: 'fav-fill' });
  const bar = h('div', { class: 'fav-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
  const actions = h('div', { class: 'fav-actions' });
  let meta: { en: string }[] | null = null;
  void loadMeta().then((m) => { meta = m; paint(); });
  const paint = () => {
    const k = keptInfo(r.id);
    status.textContent = statusText(r, meta);
    const p = k.running ? downloadProgress(r.id) : null;
    // Share of the wanted surahs kept, moving on within the surah being downloaded (by bytes when known).
    let f = k.wanted ? k.kept / k.wanted : 0;
    if (p && p.left !== null && p.bytes > 0) f = Math.max(f, k.bytes / Math.max(1, k.bytes + p.left));
    bar.hidden = !k.wanted || k.kept === k.wanted;
    fill.style.width = `${Math.round(f * 1000) / 10}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    actions.replaceChildren(
      k.paused ? h('button', { class: 'chip', onclick: () => resumeDownloads() }, t('fav.resume')) : '',
      !k.paused && k.waiting && navigator.onLine && !mobileDataAllowed() && k.kept < k.wanted
        ? h('button', { class: 'chip', onclick: () => allowMobileData() }, t('fav.mobile')) : '');
  };
  paint();
  const timer = window.setInterval(paint, 1000); // the time left counts down between updates
  const d = sheet(reciterCredit(r),
    status, bar, actions,
    h('div', { class: 'menu' },
      h('button', { class: 'menu-item', onclick: () => { d.close(); askDownload(r, surah, onChange); } }, t('fav.more')),
      h('button', { class: 'menu-item danger', onclick: async () => { await setFavourite(r.id, null); d.close(); onChange(); } }, t('fav.remove'))));
  window.addEventListener('favourites-changed', paint);
  d.addEventListener('close', () => { window.removeEventListener('favourites-changed', paint); clearInterval(timer); });
}

/** Me → Settings: the favourites with what each keeps. */
export function favouritesSection(list: Reciter[], repaint: () => void): Node {
  return h('div', { class: 'menu' }, ...list.map((r) => {
    const k = keptInfo(r.id);
    return h('button', { class: 'menu-item fav-opt', onclick: () => manageFavourite(r, null, repaint) },
      h('span', {}, `★  ${reciterCredit(r)}`),
      h('span', { class: 'muted small' }, statusText(r, null)));
  }));
}
