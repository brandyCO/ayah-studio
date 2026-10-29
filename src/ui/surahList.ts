// The surah list (#/) and search (#/search): browse by surah, juz or hizb quarter, or type to find a
// surah, a reference ("2:255", "juz 5", "hizb 3", "page 50") or words in the Arabic or the translation.
import { loadMeta, surahText, surahTranslation, type SurahMeta } from '../data/quran';
import { loadMushaf, type Mushaf } from '../data/mushaf';
import {
  divisionOf, isArabic, loadDivisions, matchSurahs, MIN_QUERY, parseJump, searchArabic, searchTranslation,
  type AyahHit, type Jump,
} from '../data/search';
import { currentTranslation, translationInfo } from '../data/translations';
import { tabBar } from './tabs';
import { h, skeletonRows } from './dom';
import { lastRead } from './prefs';
import { addSearch, clearRecentPages, clearSearches, recentPages, recentSearches } from '../data/history';
import { locale, surahName, t } from '../i18n';

function ago(at: number) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return t('dr.justNow');
  if (s < 3600) return t('dr.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('dr.hAgo', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('dr.dAgo', { n: Math.floor(s / 86400) });
  return new Date(at).toLocaleDateString(locale());
}

type Tab = 'surahs' | 'juz' | 'quarters';
const TABS: Tab[] = ['surahs', 'juz', 'quarters'];
const PAGE = 30; // ayah results shown at a time
const QUARTER = ['', '¼', '½', '¾'];

let lastQuery = '';

function savedTab(): Tab {
  try {
    const v = localStorage.getItem('navTab') as Tab | null;
    return v && TABS.includes(v) ? v : 'surahs';
  } catch {
    return 'surahs';
  }
}
function saveTab(v: Tab) {
  try { localStorage.setItem('navTab', v); } catch { /* ignore */ }
}

const ayahHash = (s: number, a: number) => `#/s/${s}/${a}`;

/** The first ayah printed on a mushaf page. */
function firstAyahOf(mushaf: Mushaf, page: number): [number, number] {
  for (const line of mushaf.pages[page - 1].lines) {
    if (line[0] !== 'h' && line[0] !== 'b') {
      const seg = (line as [number, number, string][])[0];
      return [seg[0], seg[1]];
    }
  }
  const head = mushaf.pages[page - 1].lines[0] as ['h' | 'b', number];
  return [head[1], 1];
}

export async function showSurahList(root: HTMLElement, focus = false): Promise<() => void> {
  const meta = await loadMeta();
  if (focus) lastQuery = ''; // 🔍 starts a fresh search (recent searches are one tap away)
  const ref = (s: number, a: number) => `${surahName(meta[s - 1])} · ${s}:${a}`;
  let tab = savedTab();
  let timer = 0;
  let searchId = 0;
  let alive = true;

  // Opening anything from the results remembers the search.
  const body = h('div', {
    class: 'nav-body',
    onclick: (e: Event) => { if (search.value.trim() && (e.target as Element).closest('a, .nav-jump')) addSearch(search.value); },
  });
  const recent = h('div', { class: 'nav-recent' });
  function showRecent() {
    const qs = recentSearches();
    const ps = recentPages();
    recent.replaceChildren(...[
      qs.length > 0 && h('section', {},
        h('div', { class: 'nav-recent-head' },
          h('h2', { class: 'nav-group-title' }, t('hist.searches')),
          h('button', { class: 'linkish', type: 'button', onclick: () => { clearSearches(); showRecent(); } }, t('hist.clear'))),
        h('div', { class: 'nav-chips' }, ...qs.map((q) => h('button', {
          class: 'chip', type: 'button', dir: 'auto',
          onclick: () => { search.value = lastQuery = q; fill(); },
        }, q)))),
      ps.length > 0 && h('section', {},
        h('div', { class: 'nav-recent-head' },
          h('h2', { class: 'nav-group-title' }, t('hist.pages')),
          h('button', { class: 'linkish', type: 'button', onclick: () => { clearRecentPages(); showRecent(); } }, t('hist.clear'))),
        h('div', { class: 'nav-pages' }, ...ps.map((p) => h('a', { class: 'nav-page', href: ayahHash(p.s, p.a) },
          h('strong', {}, t('common.page', { n: p.page })),
          h('span', {}, ref(p.s, p.a)),
          h('span', { class: 'muted' }, ago(p.at)))))),
    ].filter((x): x is HTMLElement => !!x));
  }
  const search = h('input', {
    type: 'search', class: 'search', placeholder: t('list.search'), value: lastQuery,
    autocomplete: 'off', enterkeyhint: 'search', 'aria-label': t('mushaf.search'),
    oninput: () => {
      lastQuery = search.value;
      clearTimeout(timer);
      // References and names show at once; a word search waits for a pause in typing.
      timer = window.setTimeout(fill, search.value.trim().length > 2 ? 220 : 0);
    },
  });
  const form = h('form', {
    class: 'search-wrap', role: 'search',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const j = parseJump(meta, search.value);
      addSearch(search.value);
      if (j) void jumpTo(j);
      else search.blur(); // closes the phone keyboard so the results show
    },
  }, search);

  const tabBtns = TABS.map((k) => h('button', {
    class: 'tab', type: 'button', role: 'tab',
    onclick: () => { tab = k; saveTab(k); fill(); },
  }, t(`nav.${k}`)));
  const tabs = h('div', { class: 'tabs nav-tabs', role: 'tablist' }, ...tabBtns);

  // Where the reader is now (the page the app reopens on), to mark its juz / quarter.
  const here = (() => {
    const m = /^#\/s\/(\d+)(?:\/(\d+))?/.exec(lastRead());
    return m ? { s: Number(m[1]), a: Number(m[2] ?? 1) } : null;
  })();

  async function jumpTo(j: Jump) {
    if (j.kind === 'ayah') location.hash = ayahHash(j.s, j.a);
    else if (j.kind === 'page') {
      const [s, a] = firstAyahOf(await loadMushaf(), j.n);
      location.hash = ayahHash(s, a);
    } else {
      const d = await loadDivisions();
      const [s, a] = j.kind === 'juz' ? d.juz[j.n - 1] : d.quarters[(j.n - 1) * 4];
      location.hash = ayahHash(s, a);
    }
  }

  const surahRow = (s: SurahMeta) =>
    h('li', {},
      h('a', { href: `#/s/${s.n}`, class: 'surah-row' },
        h('span', { class: 'surah-num' }, String(s.n)),
        h('span', { class: 'surah-names' },
          h('strong', {}, s.en),
          h('span', { class: 'muted' }, t('list.surahInfo', { tr: s.tr, n: s.ayahs }))),
        h('span', { class: 'surah-ar', lang: 'ar', dir: 'rtl' }, s.ar)));

  /** A row that opens surah:ayah: badge, title, "Al-Baqara · 2:142 · Page 22". */
  const divRow = (badge: string, title: string, [s, a]: [number, number], mushaf: Mushaf, isHere: boolean) =>
    h('li', {},
      h('a', { href: ayahHash(s, a), class: `surah-row${isHere ? ' here' : ''}`, 'aria-current': isHere ? 'location' : null },
        h('span', { class: 'surah-num' }, badge),
        h('span', { class: 'surah-names' },
          h('strong', {}, title),
          h('span', { class: 'muted' }, t('nav.startsAt', { ref: ref(s, a), page: mushaf.pageOf(s, a) }))),
        isHere && h('span', { class: 'nav-here' }, t('nav.here'))));

  async function showDivisions(which: 'juz' | 'quarters') {
    const id = searchId;
    body.replaceChildren(skeletonRows(6));
    const [d, mushaf] = await Promise.all([loadDivisions(), loadMushaf()]);
    if (id !== searchId || !alive) return;
    const at = here ? divisionOf(d, here.s, here.a) : null;
    if (which === 'juz') {
      body.replaceChildren(h('ol', { class: 'surah-list' },
        ...d.juz.map((start, i) => divRow(String(i + 1), t('nav.juzN', { n: i + 1 }), start, mushaf, at?.juz === i + 1))));
    } else {
      // 8 quarters a juz: the hizb's start, then ¼, ½, ¾ of it.
      const groups = d.juz.map((_, j) => h('section', { class: 'nav-group' },
        h('h2', { class: 'nav-group-title' }, t('nav.juzN', { n: j + 1 })),
        h('ol', { class: 'surah-list' }, ...d.quarters.slice(j * 8, j * 8 + 8).map((start, k) => {
          const qi = j * 8 + k; // 0-based quarter
          const hizb = Math.floor(qi / 4) + 1;
          const part = qi % 4;
          return divRow(part ? QUARTER[part] : String(hizb),
            part ? t('nav.quarterOf', { q: QUARTER[part], n: hizb }) : t('nav.hizbN', { n: hizb }),
            start, mushaf, at?.quarter === qi + 1);
        }))));
      body.replaceChildren(...groups);
    }
    body.querySelector('.here')?.scrollIntoView({ block: 'center' });
  }

  /** One result: reference, the whole ayah (matched words marked) and its translation. */
  function resultRow(hit: AyahHit, arabic: string, tr: string, trInfo: { lang: string; dir: string }) {
    const ar = hit.words
      ? arabic.split(' ').flatMap((w, i) => [i ? ' ' : '', hit.words!.has(i) ? h('mark', {}, w) : w])
      : [arabic];
    const en = hit.range
      ? [tr.slice(0, hit.range[0]), h('mark', {}, tr.slice(hit.range[0], hit.range[1])), tr.slice(hit.range[1])]
      : [tr];
    return h('li', {},
      h('a', { href: ayahHash(hit.s, hit.a), class: 'hit' },
        h('span', { class: 'hit-ref' }, ref(hit.s, hit.a)),
        h('span', { class: 'hit-ar', lang: 'ar', dir: 'rtl' }, ...ar),
        h('span', { class: 'hit-tr', lang: trInfo.lang, dir: trInfo.dir }, ...en)));
  }

  async function showSearch(q: string) {
    const id = ++searchId;
    const out: (Node | false)[] = [];
    const j = parseJump(meta, q);
    if (j) {
      const label = j.kind === 'ayah' ? t('search.goAyah', { ref: ref(j.s, j.a) })
        : j.kind === 'juz' ? t('search.goJuz', { n: j.n })
        : j.kind === 'hizb' ? t('search.goHizb', { n: j.n }) : t('search.goPage', { n: j.n });
      out.push(h('button', { class: 'menu-item nav-jump', type: 'button', onclick: () => void jumpTo(j) }, `→  ${label}`));
    }
    const surahs = j?.kind === 'ayah' ? [] : matchSurahs(meta, q);
    if (surahs.length) {
      out.push(h('h2', { class: 'nav-group-title' }, t('search.surahs')), h('ol', { class: 'surah-list' }, ...surahs.slice(0, 12).map(surahRow)));
    }
    const status = h('p', { class: 'muted nav-status' });
    const list = h('ol', { class: 'hits' });
    out.push(status, list);
    body.replaceChildren(...out.filter((x): x is Node => !!x));
    if (j) { status.remove(); return; }

    const arabic = isArabic(q);
    if (!arabic && q.length < 3) {
      if (!surahs.length) status.textContent = /^\d+$/.test(q) ? t('search.none', { q }) : t('search.short');
      else status.remove();
      return;
    }
    status.textContent = t('search.searching');
    const skel = skeletonRows(4);
    list.append(skel);
    const info = translationInfo(currentTranslation());
    let hits: AyahHit[];
    try {
      hits = arabic ? await searchArabic(q) : (await searchTranslation(q, info.id)).hits;
    } catch (e) {
      skel.remove();
      if (id === searchId) status.textContent = e instanceof Error ? e.message : String(e);
      return;
    }
    skel.remove();
    if (id !== searchId || !alive) return;
    if (!hits.length) {
      status.textContent = arabic && q.replace(/\s/g, '').length < MIN_QUERY ? '' : t('search.none', { q });
      if (surahs.length && !hits.length) status.remove();
      return;
    }
    status.textContent = hits.length === 1 ? t('search.count1', { q }) : t('search.count', { n: hits.length, q });
    let shown = 0;
    const more = h('button', { class: 'chip nav-more', type: 'button', onclick: () => void showMore() }, t('search.more'));
    async function showMore() {
      const part = hits.slice(shown, shown + PAGE);
      const need = [...new Set(part.map((x) => x.s))];
      const [ar, tr] = await Promise.all([
        Promise.all(need.map((s) => surahText(s))),
        Promise.all(need.map((s) => surahTranslation(s, info.id))),
      ]);
      if (id !== searchId || !alive) return;
      list.append(...part.map((x) => {
        const k = need.indexOf(x.s);
        return resultRow(x, ar[k][x.a - 1], tr[k][x.a - 1], info);
      }));
      shown += part.length;
      if (shown < hits.length) list.after(more);
      else more.remove();
    }
    await showMore();
  }

  function fill() {
    const q = search.value.trim();
    tabs.hidden = !!q;
    recent.hidden = !!q;
    if (!q) showRecent();
    tabBtns.forEach((b, i) => { b.classList.toggle('on', TABS[i] === tab); b.setAttribute('aria-selected', String(TABS[i] === tab)); });
    if (q) return void showSearch(q);
    searchId++;
    if (tab === 'surahs') body.replaceChildren(h('ol', { class: 'surah-list' }, ...meta.map(surahRow)));
    else void showDivisions(tab).catch((e) => body.replaceChildren(h('p', { class: 'muted empty' }, e instanceof Error ? e.message : String(e))));
  }
  fill();

  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', { class: 'brand-name' }, 'Ayah Studio'), h('p', { class: 'muted' }, t('list.tagline'))),
      h('button', { class: 'chip', onclick: () => void import('./kids').then((m) => m.openKidsSpace()) }, t('list.kids')),
      h('a', { class: 'icon-btn', href: '#/me/settings', 'aria-label': t('me.settings'), title: t('me.settings') }, '⚙')),
    form,
    recent,
    tabs,
    body,
    tabBar('read'),
  );
  if (focus) requestAnimationFrame(() => search.focus());
  return () => { alive = false; clearTimeout(timer); };
}

