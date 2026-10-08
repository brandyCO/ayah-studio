// Background picker: Presets · My media (uploads from the device, kept locally) · Free library
// (Pixabay / Pexels through the proxy: curated collections and search; a pick is downloaded into My
// media). The panel keeps its own state (tab, search, results) while the editor redraws it.
import { BACKGROUNDS, backgroundById, libraryBackgrounds, type Background } from '../engine/backgrounds';
import { deleteMedia, importFile, MAX_VIDEO_MB, storageUsed } from '../data/library';
import {
  downloadHit, searchStock, SOURCE_NAME, SOURCE_SITE, stockEnabled, stockId, stockSources, SUGGESTIONS,
  type StockHit, type StockSource, type StockSources,
} from '../data/stock';
import { h, toast } from './dom';
import { icon } from './icons';

type Tab = 'presets' | 'mine' | 'stock';
const MAX_DOWNLOADS = 4;

export interface PickerOptions {
  intro: string;
  current: string | null; // the background being replaced (highlighted)
  multiple: boolean; // files picked from the device each become a scene
  pick: (id: string) => void;
}

export function createMediaPicker(o: { busy: () => boolean; libraryChanged: () => void }) {
  let tab: Tab = 'presets';
  let opts: PickerOptions | null = null;
  let status = '';
  let working = false;
  let used: number | null = null;
  // Free library state
  let avail: StockSources | null = null;
  let source: StockSource = 'pixabay';
  let type: 'image' | 'video' = 'video';
  let query = '';
  let collection: string | null = null; // a curated collection instead of a typed search
  let hits: StockHit[] = [];
  let total = 0;
  let page = 0;
  let searching = false;
  let searchError = '';
  // Downloads run side by side, each shown on its own card (id → percent, null until known).
  const downloads = new Map<string, number | null>();
  // Picks waiting to be applied, in the order they were tapped.
  const jobs: { id: string; target: PickerOptions; state: 'busy' | 'done' | 'failed' }[] = [];

  // The search box is created once and never replaced, so the phone keyboard stays open while
  // results arrive and the panel redraws around it.
  const searchInput = h('input', { class: 'search-input', type: 'search', placeholder: 'Search calm scenes…', enterKeyHint: 'search' });
  searchInput.addEventListener('input', () => { query = searchInput.value; });
  const searchBtn = h('button', { class: 'chip on', type: 'submit' }, 'Search');
  const form = h('form', {
    class: 'search-row',
    onsubmit: (e: Event) => { e.preventDefault(); searchInput.blur(); if (query.trim()) { collection = null; void search(); } },
  }, searchInput, searchBtn);

  const wrap = h('div', { class: 'media-picker' });
  const fileInput = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (files.length) void addFiles(files);
  });

  const note = (text: string) => h('p', { class: 'muted small' }, text);
  const setStatus = (s: string) => { status = s; draw(); };
  const thumbStyle = (b: Background) => (b.kind === 'color' ? `background:${b.color}` : `background-image:url("${b.thumb}")`);
  const label = (b: Background) => (b.kind === 'video' ? `▶ ${b.label}` : b.label);

  function choose(id: string) {
    if (o.busy() || working || !opts) return;
    opts.pick(id);
  }

  async function addFiles(files: File[]) {
    if (!opts) return;
    const target = opts;
    working = true;
    const ids: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(files.length > 1 ? `Adding ${i + 1} of ${files.length}…` : 'Adding…');
      try {
        ids.push((await importFile(files[i])).id);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    }
    working = false;
    status = '';
    o.libraryChanged();
    void refreshUsage();
    for (const id of target.multiple ? ids : ids.slice(0, 1)) target.pick(id);
    draw();
  }

  async function remove(b: Background) {
    if (o.busy() || working) return;
    if (!confirm(`Remove “${b.label}” from this device? Scenes using it show a plain colour instead.`)) return;
    try {
      await deleteMedia(b.id);
    } catch (e) {
      toast(`Could not remove it: ${e instanceof Error ? e.message : e}`);
    }
    o.libraryChanged();
    void refreshUsage();
    draw();
  }

  async function refreshUsage() {
    used = await storageUsed();
    draw();
  }

  async function search(more = false) {
    if (!collection && !query.trim()) return;
    const want = more ? page + 1 : 1;
    const ask = { source, type, q: query, collection: collection ?? undefined, page: want };
    searching = true;
    searchError = '';
    if (!more) hits = [];
    draw();
    try {
      const r = await searchStock(ask);
      if (ask.source !== source || ask.type !== type || ask.q !== query || (ask.collection ?? null) !== collection) return; // changed meanwhile
      hits = more ? [...hits, ...r.hits] : r.hits;
      total = r.total;
      page = want;
    } catch (e) {
      searchError = e instanceof Error ? e.message : String(e);
    }
    searching = false;
    draw();
  }

  /** Opens the library tab: learns what the proxy offers, then shows the first collection. */
  async function openStock() {
    if (avail || !stockEnabled()) return;
    avail = await stockSources();
    if (!avail.pixabay && avail.pexels) source = 'pexels';
    if (!hits.length && !query && avail.collections.length) {
      collection = avail.collections[0].id;
      void search();
    }
    draw();
  }

  async function pickHit(hit: StockHit) {
    if (o.busy() || !opts) return;
    const id = stockId(hit);
    if (downloads.has(id)) return;
    if (downloads.size >= MAX_DOWNLOADS) return toast(`Up to ${MAX_DOWNLOADS} downloads at a time — wait for one to finish`);
    const job = { id, target: opts, state: 'busy' as 'busy' | 'done' | 'failed' };
    jobs.push(job);
    downloads.set(id, null);
    draw();
    try {
      await downloadHit(hit, (f) => {
        const pct = Math.round(f * 100);
        if (downloads.has(id) && downloads.get(id) !== pct) { downloads.set(id, pct); draw(); }
      });
      job.state = 'done';
      o.libraryChanged();
      void refreshUsage();
    } catch (e) {
      job.state = 'failed';
      toast(e instanceof Error ? e.message : String(e));
    }
    downloads.delete(id);
    settle();
    draw();
  }

  /** Applies finished picks in the order they were tapped: each adds a scene, or — when replacing
   *  one scene — only the last one tapped is used (the others stay in My media). */
  function settle() {
    while (jobs.length && jobs[0].state !== 'busy') {
      const j = jobs.shift()!;
      if (j.state !== 'done' || o.busy()) continue;
      if (j.target.multiple || !jobs.some((k) => k.target === j.target)) j.target.pick(j.id);
    }
  }

  const tile = (b: Background, extra?: Node | null) =>
    h('div', { class: 'bg-cell' },
      h('button', {
        class: `bg-thumb${opts?.current === b.id ? ' on' : ''}`, style: thumbStyle(b),
        title: b.kind !== 'color' && b.credit ? `${b.label} · by ${b.credit.author} on ${b.credit.source}` : b.label,
        onclick: () => choose(b.id),
      }, h('span', {}, label(b))),
      extra ?? null);

  function presets(): Node[] {
    return [h('div', { class: 'bg-grid' }, ...BACKGROUNDS.map((b) => tile(b)))];
  }

  function mine(): Node[] {
    const items = libraryBackgrounds();
    return [
      h('div', { class: 'bg-grid' },
        h('div', { class: 'bg-cell' },
          h('button', { class: 'bg-thumb bg-add', disabled: working, onclick: () => fileInput.click() },
            icon('plus', 26), h('span', {}, 'From device'))),
        ...items.map((b) => tile(b, h('div', { class: 'bg-tags' },
          b.kind !== 'color' && b.credit ? h('span', { class: 'bg-badge' }, b.credit.source) : null,
          h('button', { class: 'bg-del', 'aria-label': `Remove ${b.label}`, title: 'Remove from this device', onclick: () => void remove(b) }, '✕'))))),
      items.length ? null : note('Add your own photos and videos (calm scenes, no faces). They stay on this device and are never uploaded.'),
      note(`Videos play without their own sound: the recitation is the only audio. Videos up to ${MAX_VIDEO_MB} MB.${used ? ` Using ${used < 1e6 ? 'under 1' : (used / 1e6).toFixed(0)} MB on this device.` : ''}`),
    ].filter(Boolean) as Node[];
  }

  function stock(): Node[] {
    if (!stockEnabled()) {
      return [note('The free library is not set up in this build yet: it needs the small search proxy described in proxy/README.md.')];
    }
    if (!avail) return [note('Loading…')];
    const both = avail.pixabay && avail.pexels;
    const other: StockSource = source === 'pixabay' ? 'pexels' : 'pixabay';
    const switchTo = (v: StockSource) => { source = v; hits = []; page = 0; void search(); };
    // One row: library (when both are set up) · videos or photos.
    const choices = h('div', { class: 'chips stock-choices' },
      ...(both ? (['pixabay', 'pexels'] as const).map((v) =>
        h('button', { class: `chip${source === v ? ' on' : ''}`, onclick: () => { if (source !== v) switchTo(v); } }, SOURCE_NAME[v])) : []),
      both ? h('span', { class: 'chip-gap' }) : null,
      ...([['video', 'Videos'], ['image', 'Photos']] as const).map(([v, l]) =>
        h('button', { class: `chip${type === v ? ' on' : ''}`, onclick: () => { if (type !== v) { type = v; void search(); } } }, l)));
    if (document.activeElement !== searchInput) searchInput.value = query;
    searchBtn.disabled = searching;
    // Curated collections (from the proxy), or plain calm searches with an older proxy.
    const ideas = h('div', { class: 'chips ideas' }, ...(avail.collections.length
      ? avail.collections.map((c) => h('button', { class: `chip${collection === c.id ? ' on' : ''}`, onclick: () => { collection = c.id; query = ''; void search(); } }, c.label))
      : SUGGESTIONS.map((x) => h('button', { class: 'chip', onclick: () => { collection = null; query = x; void search(); } }, x))));
    const owned = new Set(libraryBackgrounds().map((b) => b.id));
    const name = SOURCE_NAME[source];
    const grid = hits.length ? h('div', { class: 'bg-grid' }, ...hits.map((x) => {
      const id = stockId(x);
      const dl = downloads.has(id) ? { pct: downloads.get(id) ?? null } : null;
      return h('div', { class: `bg-cell${dl ? ' loading' : ''}` },
        h('button', {
          class: `bg-thumb${opts?.current === id ? ' on' : ''}`, style: `background-image:url("${x.thumb}")`,
          title: `${x.tags} · by ${x.user} on ${name}`, onclick: () => void pickHit(x),
        }, h('span', {}, x.type === 'video' ? `▶ ${Math.round(x.duration ?? 0)} s` : x.user)),
        // Download progress on the card itself.
        dl ? h('div', { class: 'bg-progress', role: 'progressbar', 'aria-valuenow': String(dl.pct ?? 0) },
          h('span', { class: 'spinner' }), h('b', {}, dl.pct === null ? 'Saving…' : `${dl.pct}%`),
          h('i', { style: `width:${dl.pct ?? 0}%` })) : null,
        !dl && owned.has(id) ? h('div', { class: 'bg-tags' }, h('span', { class: 'bg-badge' }, 'Saved')) : null);
    })) : null;
    return [
      choices, form, ideas,
      searchError ? note(searchError) : null,
      searchError && both ? h('button', { class: 'chip more', onclick: () => switchTo(other) }, `Try ${SOURCE_NAME[other]}`) : null,
      searching && !hits.length ? note('Searching…') : null,
      !searching && page > 0 && !hits.length && !searchError ? note('Nothing found — try another word.') : null,
      grid,
      hits.length && hits.length < total ? h('button', { class: 'chip more', disabled: searching, onclick: () => void search(true) }, searching ? 'Loading…' : 'More') : null,
      h('p', { class: 'muted small' }, `${type === 'video' ? 'Videos' : 'Photos'} provided by `, h('a', { href: SOURCE_SITE[source], target: '_blank', rel: 'noopener' }, name),
        ' (free to use). A picked item is saved to My media; its creator is credited on the export page. Choose calm scenes without people.'),
    ].filter(Boolean) as Node[];
  }

  function draw() {
    if (!opts) return;
    const tabs: [Tab, string][] = [['presets', 'Presets'], ['mine', 'My media'], ['stock', 'Free library']];
    const nodes = [
      note(opts.intro),
      h('div', { class: 'tabs' }, ...tabs.map(([v, l]) =>
        h('button', { class: `tab${tab === v ? ' on' : ''}`, onclick: () => { tab = v; if (v === 'mine') void refreshUsage(); if (v === 'stock') void openStock(); draw(); } }, l))),
      status ? h('p', { class: 'picker-status small' }, status) : null,
      ...(tab === 'presets' ? presets() : tab === 'mine' ? mine() : stock()),
      fileInput,
    ].filter((x): x is Node => !!x);
    // Replace everything except the nodes kept between redraws (search form, file input), which
    // stay where they are: moving a focused input would close the phone keyboard.
    const keep = new Set(nodes);
    for (const c of [...wrap.childNodes]) if (!keep.has(c)) c.remove();
    let ref = wrap.firstChild;
    for (const n of nodes) {
      if (n === ref) ref = ref.nextSibling;
      else wrap.insertBefore(n, ref);
    }
  }

  return {
    /** The panel content for the editor (redrawn in place on every call). */
    panel(p: PickerOptions): Node[] {
      // A newly opened picker starts on the tab holding the background being replaced.
      if (p.intro !== opts?.intro && p.current && backgroundById(p.current).id === p.current) tab = p.current.includes(':') ? 'mine' : 'presets';
      opts = p;
      draw();
      return [wrap];
    },
  };
}
