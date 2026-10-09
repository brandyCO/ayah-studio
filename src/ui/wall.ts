// Dua & ayah wall (docs/together.md T8).
//   ☰ → Ayah wall: the host's walls; Create (title, occasion; the reel look and reciter for the keepsake).
//   #/wall/{id}: the host's screen (a TV, laptop or tablet): a large QR code + 6-character code, and the
//     entries, each drifting in like a lantern and settling into a soft grid, the newest gently
//     pulsing. Tap an entry to hide it (or show it again). Close / reopen the wall.
//   #/w/{code}: a guest (no install; Google or — once enabled — anonymous): their name, 1–3 ayat
//     (surah + ayat, with suggestions for the occasion) and an optional short dua in their own words.
//   #/wall/{id}/reel[/{start}]: the keepsake reel — every visible entry's ayat with its own reference,
//     then a card with the guest's name and dua (UI fonts, attributed, never like the ayah), and the
//     wall's title and date at the end; ≤ 30 entries or ~10 minutes per reel, more → the next part.
import { reelTranslation } from '../data/translations';
import QRCode from 'qrcode';
import { account, onAccount } from '../cloud/auth';
import { loadMeta, reference, surahText, type SurahMeta } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel } from '../data/reciters';
import { BACKGROUNDS, backgroundById, loadBackground, type BackgroundMedia } from '../engine/backgrounds';
import { H, W } from '../engine/layout';
import { applyLook, frameStyle, lookOf, newProject, OUTRO, strictLook, type Project } from '../engine/project';
import { render } from '../engine/render';
import { prepareScenes, sceneSpans } from '../engine/scenes';
import { buildTimeline, type Timeline } from '../engine/timeline';
import { displayWords } from '../engine/words';
import {
  addEntry, createWall, deleteWall, DUA_MAX, ensureGuest, errorText, hideEntry, joinLink, loadWall, MAX_ENTRY_AYAT,
  myWalls, NAME_MAX, OCCASIONS, occasionLabel, previewWall, removeEntry, setWallOpen, TITLE_MAX, updateWall, validCode, watchWall,
  type Occasion, type Wall, type WallEntry, type WallPreview,
} from '../together/walls';
import { openAccount } from './account';
import { h, toast } from './dom';
import { giftLook } from './gift';
import { icon } from './icons';
import { reelLook, reelReciter } from './prefs';
import { loadSegments } from './reelSource';

const BUILT_IN = new Set(BACKGROUNDS.map((b) => b.id));
const builtIn = (id: string) => BUILT_IN.has(id);
const longDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
/** An entry's Arabic is shown on the host's screen only when short enough to read from across a room
 *  (never cut: rule 1); longer ones show their reference, and the full text plays in the reel. */
const LANTERN_WORDS = 28;

/** Ayat to start from, per occasion (the guest can pick any). [surah, from, to] */
const SUGGESTIONS: Record<Occasion, [number, number, number][]> = {
  wedding: [[30, 21, 21], [25, 74, 74], [4, 1, 1]],
  eid: [[2, 185, 185], [10, 58, 58], [94, 5, 6]],
  ramadan: [[2, 183, 183], [2, 186, 186], [97, 1, 3]],
  birth: [[3, 38, 38], [14, 40, 41], [25, 74, 74]],
  gathering: [[49, 13, 13], [3, 103, 103], [59, 10, 10]],
  memorial: [[2, 155, 157], [89, 27, 28], [3, 185, 185]],
  other: [[94, 5, 6], [2, 286, 286], [65, 3, 3]],
};

function sheet(cls: string, ...content: (Node | string | false)[]) {
  const d = h('dialog', { class: `sheet bottom ${cls}` }, ...content);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  const leave = () => d.close();
  window.addEventListener('hashchange', leave);
  d.addEventListener('close', () => window.removeEventListener('hashchange', leave));
  return d;
}
const head = (text: string, close: () => void) =>
  h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'));
const offline = (e: unknown) => (navigator.onLine ? errorText(e) : 'You are offline — try again when you are back online.');

/** The keepsake's look and reciter: the user's current reel look (built-in backgrounds only). */
function currentLook() {
  const p = newProject(1, 1, 1, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(p, reelLook(), () => true);
  return { look: giftLook(lookOf(p)), reciter: p.reciterId };
}

const occasionSelect = (value: Occasion) => h('select', { class: 'search', 'aria-label': 'Occasion' },
  ...OCCASIONS.map(([k, l]) => h('option', { value: k, selected: k === value }, l)));
const reciterSelect = (value: number) => h('select', { class: 'search', 'aria-label': 'Reciter' },
  ...RECITERS.map((r) => h('option', { value: String(r.id), selected: r.id === value }, reciterPickerLabel(r))));

// --- ☰ → Ayah wall ---
export function openWalls() {
  const body = h('div', { class: 'walls' });
  const d = sheet('walls-sheet', head('Ayah wall', () => d.close()), body);
  const off = onAccount(() => void draw());
  d.addEventListener('close', off);

  async function draw() {
    const intro = h('p', { class: 'muted small' }, 'For a wedding, Eid or a family gathering: guests scan a code with their phone and add an ayah, their name and a short dua. Your screen shows them as they arrive, and at the end it all becomes one keepsake reel.');
    if (!account()) {
      body.replaceChildren(intro, h('p', { class: 'small' }, 'Sign in with Google to host a wall — guests need no app.'),
        h('button', { class: 'primary', onclick: () => openAccount() }, 'Sign in with Google'));
      return;
    }
    body.replaceChildren(intro, h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    let list: Awaited<ReturnType<typeof myWalls>>;
    try {
      list = await myWalls();
    } catch (e) {
      body.replaceChildren(intro, h('p', { class: 'small' }, offline(e)));
      return;
    }
    body.replaceChildren(intro,
      h('button', { class: 'primary brand-btn', onclick: () => create() }, '＋ New wall'),
      ...(list.length ? [h('p', { class: 'circle-sub' }, 'Your walls'), h('div', { class: 'gift-list' }, ...list.map((w) =>
        h('a', { class: 'gift-row wall-row', href: `#/wall/${w.id}`, onclick: () => d.close() },
          h('b', {}, w.title),
          h('span', { class: 'muted small' }, `${occasionLabel(w.occasion)} · ${shortDate.format(new Date(w.created_at))} · ${w.entries} ${w.entries === 1 ? 'entry' : 'entries'}${w.status === 'closed' ? ' · closed' : ''}`))))] : []));
  }

  function create() {
    const src = currentLook();
    const title = h('input', { class: 'search', maxlength: TITLE_MAX, placeholder: 'Yusuf & Maryam’s wedding', 'aria-label': 'Title' });
    const occasion = occasionSelect('wedding');
    const reciter = reciterSelect(src.reciter);
    const btn = h('button', { class: 'primary brand-btn', type: 'submit' }, 'Open the wall');
    body.replaceChildren(h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
      e.preventDefault();
      if (!title.value.trim()) return toast('Please give the wall a title');
      btn.disabled = true;
      try {
        const w = await createWall(title.value, occasion.value as Occasion, src.look, Number(reciter.value));
        d.close();
        location.hash = `#/wall/${w.id}`;
      } catch (err) {
        toast(offline(err));
        btn.disabled = false;
      }
    } },
    h('label', {}, 'Title', title),
    h('label', {}, 'Occasion', occasion),
    h('label', {}, 'Reciter for the keepsake reel', reciter),
    h('p', { class: 'muted small' }, 'The keepsake reel uses your current reel look (built-in backgrounds only). Guests’ names and duas are seen only by you and in the reel you make.'),
    btn, h('button', { type: 'button', class: 'chip', onclick: () => void draw() }, 'Back')));
    title.focus();
  }
}

// --- #/wall/{id}: the host's screen ---
export async function showWallHost(root: HTMLElement, id: string): Promise<() => void> {
  const page = h('div', { class: 'wall-host' });
  root.append(page);
  const meta = await loadMeta();
  let alive = true;
  let stopWatch: (() => void) | null = null;
  let wall: Wall | null = null;
  let entries: WallEntry[] = [];
  const seen = new Set<string>();
  let first = true;
  let showHidden = false;
  let lastKey = '';
  const texts = new Map<string, string | null>(); // entry id → its Arabic (short ones), loaded once

  const message = (...nodes: (Node | string)[]) => page.replaceChildren(h('div', { class: 'wall-message' },
    ...nodes, h('a', { class: 'chip', href: '#/' }, 'Go to the app')));

  const offAccount = onAccount((a) => {
    if (!a) message(h('p', {}, 'Sign in with Google to open your wall.'), h('button', { class: 'primary', onclick: () => openAccount() }, 'Sign in with Google'));
    else void load();
  });

  async function load() {
    if (!alive || !account()) return;
    let got: Awaited<ReturnType<typeof loadWall>>;
    try {
      got = await loadWall(id);
    } catch (e) {
      if (!wall) message(h('p', {}, offline(e)));
      return;
    }
    if (!alive) return;
    if (!got) return message(h('p', {}, 'This wall is not there any more, or it belongs to another account.'));
    const key = JSON.stringify(got);
    if (key === lastKey) return; // nothing new (a quiet refresh)
    lastKey = key;
    wall = got.wall;
    entries = got.entries;
    await Promise.all(entries.filter((e) => !texts.has(e.id) || texts.get(`${e.id}:ref`) !== refKey(e)).map(async (e) => {
      const all = await surahText(e.surah);
      const ar = all.slice(e.ayah_from - 1, e.ayah_to);
      const words = ar.reduce((n, a) => n + displayWords(a).length, 0);
      texts.set(e.id, words <= LANTERN_WORDS ? ar.join(' ') : null);
      texts.set(`${e.id}:ref`, refKey(e));
    }));
    draw();
    stopWatch ??= await watchWall(id, () => void load());
  }
  const refKey = (e: WallEntry) => `${e.surah}:${e.ayah_from}-${e.ayah_to}`;

  let qrFor = '';
  const qr = h('div', { class: 'wall-qr', 'aria-hidden': 'true' });
  async function drawQr(url: string) {
    if (qrFor === url) return;
    qrFor = url;
    qr.innerHTML = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1612', light: '#ffffff' } });
  }

  function draw() {
    if (!wall) return;
    const w = wall;
    const url = joinLink(w.join_code);
    void drawQr(url);
    const visible = entries.filter((e) => !e.hidden);
    const hidden = entries.filter((e) => e.hidden);
    const newest = visible.reduce<WallEntry | null>((a, e) => (!a || e.updated_at > a.updated_at ? e : a), null);
    const lantern = (e: WallEntry) => {
      const s = meta[e.surah - 1];
      const ar = texts.get(e.id);
      const fresh = !first && !seen.has(e.id);
      const el = h('button', {
        class: `lantern${fresh ? ' arrive' : ''}${e === newest && entries.length > 1 ? ' newest' : ''}${e.hidden ? ' hidden-entry' : ''}`,
        onclick: () => entryMenu(e),
        'aria-label': `${e.name}: ${reference(s, e.ayah_from, e.ayah_to)}${e.hidden ? ' (hidden)' : ''}`,
      },
      h('span', { class: 'lantern-ref' }, reference(s, e.ayah_from, e.ayah_to)),
      ar ? h('span', { class: 'lantern-ar', dir: 'rtl', lang: 'ar' }, ar) : '',
      e.dua ? h('span', { class: 'lantern-dua' }, `“${e.dua}”`) : '',
      h('span', { class: 'lantern-name' }, `— ${e.name}`));
      return el;
    };
    page.replaceChildren(
      h('header', { class: 'wall-top' },
        h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back to the app' }, '‹'),
        h('div', { class: 'wall-title' }, h('h1', {}, w.title),
          h('p', {}, `${occasionLabel(w.occasion)} · ${longDate.format(new Date(w.created_at))} · ${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}${w.status === 'closed' ? ' · closed' : ''}`)),
        h('div', { class: 'wall-tools' },
          h('a', { class: `chip${visible.length ? '' : ' disabled'}`, href: visible.length ? `#/wall/${w.id}/reel` : undefined,
            onclick: (ev: Event) => { if (!visible.length) { ev.preventDefault(); toast('The keepsake reel is made from the entries — none yet'); } } }, '🎬 Keepsake reel'),
          h('button', { class: 'chip', onclick: () => void toggleOpen() }, w.status === 'open' ? 'Close the wall' : 'Reopen'),
          h('button', { class: 'icon-btn', 'aria-label': 'Full screen', onclick: () => fullScreen() }, icon('full', 20)),
          h('button', { class: 'icon-btn', 'aria-label': 'Wall settings', onclick: () => settings() }, '⋯'))),
      h('div', { class: 'wall-body' },
        h('aside', { class: `wall-join${w.status === 'closed' ? ' closed' : ''}` },
          ...(w.status === 'open'
            ? [qr, h('p', { class: 'wall-scan' }, 'Scan to add your ayah'), h('p', { class: 'wall-code' }, w.join_code),
              h('p', { class: 'wall-url' }, url.replace(/^https?:\/\//, ''))]
            : [h('p', { class: 'wall-scan' }, 'This wall is closed. Thank you all.')])),
        h('section', { class: 'wall-grid', 'aria-live': 'polite' },
          ...(visible.length ? visible.map(lantern) : [h('p', { class: 'wall-empty' }, 'The first ayah will appear here.')]),
          ...(hidden.length ? [h('div', { class: 'wall-hidden-row' },
            h('button', { class: 'link-btn', onclick: () => { showHidden = !showHidden; draw(); } }, `${showHidden ? 'Hide' : 'Show'} the ${hidden.length} hidden ${hidden.length === 1 ? 'entry' : 'entries'}`),
            ...(showHidden ? hidden.map(lantern) : []))] : []))));
    for (const e of entries) seen.add(e.id);
    first = false;
  }

  function entryMenu(e: WallEntry) {
    const d = sheet('wall-entry-sheet', head(e.name, () => d.close()),
      h('p', { class: 'muted small' }, e.hidden ? 'Hidden: not on the wall and never in the keepsake reel.' : 'Hiding takes it off the wall and out of the keepsake reel. You can show it again.'),
      h('button', { class: 'primary', onclick: async () => {
        d.close();
        try {
          await hideEntry(e.id, !e.hidden);
          await load();
        } catch (err) { toast(offline(err)); }
      } }, e.hidden ? 'Show it again' : 'Hide this entry'));
  }

  async function toggleOpen() {
    if (!wall) return;
    try {
      await setWallOpen(wall.id, wall.status !== 'open');
      await load();
    } catch (e) { toast(offline(e)); }
  }

  function settings() {
    if (!wall) return;
    const w = wall;
    const title = h('input', { class: 'search', maxlength: TITLE_MAX, value: w.title, 'aria-label': 'Title' });
    const occasion = occasionSelect(w.occasion);
    const reciter = reciterSelect(w.reciter);
    const useLook = h('input', { type: 'checkbox' });
    const d = sheet('wall-settings', head('Wall settings', () => d.close()),
      h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
        e.preventDefault();
        try {
          await updateWall(w.id, title.value, occasion.value as Occasion, useLook.checked ? currentLook().look : w.look, Number(reciter.value));
          d.close();
          await load();
        } catch (err) { toast(offline(err)); }
      } },
      h('label', {}, 'Title', title),
      h('label', {}, 'Occasion', occasion),
      h('label', {}, 'Reciter for the keepsake reel', reciter),
      h('label', { class: 'check-row' }, useLook, ' Use my current reel look'),
      h('button', { class: 'primary', type: 'submit' }, 'Save'),
      h('button', { type: 'button', class: 'chip danger', onclick: async () => {
        if (!confirm('Delete this wall and every entry on it? This cannot be undone.')) return;
        try {
          await deleteWall(w.id);
          d.close();
          location.hash = '#/';
        } catch (err) { toast(offline(err)); }
      } }, 'Delete the wall')));
  }

  function fullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here'));
  }

  // A TV screen stays on while the wall is open (where the browser allows it).
  let lock: WakeLockSentinel | null = null;
  const wake = () => { if (document.visibilityState === 'visible') navigator.wakeLock?.request('screen').then((l) => (lock = l), () => {}); };
  wake();
  document.addEventListener('visibilitychange', wake);
  // Live updates come through Realtime; a quiet refresh covers a dropped connection (venue Wi-Fi).
  const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);

  return () => {
    alive = false;
    clearInterval(poll);
    offAccount();
    stopWatch?.();
    document.removeEventListener('visibilitychange', wake);
    void lock?.release().catch(() => {});
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
}

// --- #/w/{code}: a guest adds their ayah ---
const PENDING = 'pendingWall';
interface PendingForm { code: string; name: string; dua: string; surah: number; from: number; to: number }

/** After a web Google sign-in (which returns without the hash), go back to the wall's page. */
export function resumePendingWall() {
  let p: PendingForm | null = null;
  try {
    p = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
  } catch {
    /* ignore */
  }
  if (!p || !validCode(p.code)) return;
  const code = p.code;
  onAccount((a) => {
    if (a && !location.hash.startsWith('#/w/')) location.hash = `#/w/${code}`;
  });
}

export async function showWallJoin(root: HTMLElement, rawCode: string): Promise<() => void> {
  const code = rawCode.toUpperCase();
  const body = h('div', { class: 'wall-join-page' });
  root.append(h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Home' }, '‹'),
    h('div', { class: 'brand' }, h('h1', {}, 'Ayah wall'), h('p', { class: 'muted' }, 'Ayah Studio'))), body);
  const fail = (msg: string) => body.replaceChildren(h('div', { class: 'gift-error' }, h('p', {}, msg), h('a', { class: 'chip', href: '#/' }, 'Go to the app')));
  if (!validCode(code)) {
    fail('This wall code is not valid. Check the code on the screen.');
    return () => {};
  }
  body.replaceChildren(h('p', { class: 'muted center' }, h('span', { class: 'spinner' }), ' Opening…'));
  const meta = await loadMeta();
  let alive = true;
  let info: WallPreview | null;
  try {
    info = await previewWall(code);
  } catch (e) {
    fail(offline(e));
    return () => {};
  }
  if (!info) {
    fail('There is no wall with this code. Check the code on the screen.');
    return () => {};
  }
  let pending: PendingForm | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
    if (pending?.code !== code) pending = null;
  } catch {
    /* ignore */
  }
  const wallInfo = info;

  function done(entry: NonNullable<WallPreview['entry']>) {
    const s = meta[entry.surah - 1];
    body.replaceChildren(
      h('div', { class: 'join-card wall-card' }, h('p', { class: 'muted small' }, occasionLabel(wallInfo.occasion)), h('h2', {}, wallInfo.title)),
      h('div', { class: 'wall-done' },
        h('div', { class: 'wall-lamp', 'aria-hidden': 'true' }),
        h('h3', {}, entry.hidden ? 'Your entry is not shown on the wall' : 'Your ayah is on the wall'),
        h('p', {}, h('b', {}, reference(s, entry.ayah_from, entry.ayah_to))),
        entry.dua ? h('p', { class: 'wall-own-dua' }, `“${entry.dua}”`, h('br'), h('span', { class: 'muted small' }, `— ${entry.name}`)) : h('p', { class: 'muted small' }, `— ${entry.name}`),
        h('div', { class: 'row center' },
          wallInfo.open ? h('button', { class: 'chip', onclick: () => form(entry) }, 'Change') : '',
          h('button', { class: 'chip', onclick: async () => {
            if (!confirm('Take your entry off the wall?')) return;
            try {
              await removeEntry(entry.id);
              wallInfo.entry = null;
              if (wallInfo.open) form(null); else fail('Your entry was removed. This wall is closed now.');
            } catch (e) { toast(offline(e)); }
          } }, 'Remove'),
          h('a', { class: 'chip', href: `#/s/${entry.surah}/${entry.ayah_from}` }, 'Read in the mushaf'))),
      h('p', { class: 'muted small center' }, 'Your name and dua are seen only by the host and in the keepsake reel they make.'));
  }

  function form(prev: WallPreview['entry'] | PendingForm | null) {
    const p = prev as Partial<PendingForm & { ayah_from: number; ayah_to: number }> | null;
    const startS = p?.surah ?? SUGGESTIONS[wallInfo.occasion][0][0];
    const startA = p?.ayah_from ?? p?.from ?? SUGGESTIONS[wallInfo.occasion][0][1];
    const startB = p?.ayah_to ?? p?.to ?? SUGGESTIONS[wallInfo.occasion][0][2];
    const name = h('input', { class: 'search', maxlength: NAME_MAX, value: p?.name ?? (account()?.name ?? '').split(' ')[0].slice(0, NAME_MAX), 'aria-label': 'Your name', autocomplete: 'given-name' });
    const surah = h('select', { class: 'search', 'aria-label': 'Surah' },
      ...meta.map((s) => h('option', { value: String(s.n), selected: s.n === startS }, `${s.n}. ${s.tr} · ${s.ar}`)));
    const from = h('select', { class: 'search', 'aria-label': 'From ayah' });
    const to = h('select', { class: 'search', 'aria-label': 'To ayah' });
    const preview = h('div', { class: 'wall-preview' });
    const dua = h('textarea', { class: 'search gift-msg', maxlength: DUA_MAX, rows: 2, placeholder: 'A short dua, in your own words (optional)', 'aria-label': 'Dua' });
    dua.value = p?.dua ?? '';
    const count = h('span', { class: 'muted small gift-count' }, `${dua.value.length}/${DUA_MAX}`);
    dua.addEventListener('input', () => (count.textContent = `${dua.value.length}/${DUA_MAX}`));
    const btn = h('button', { class: 'primary brand-btn', type: 'submit' }, prev && 'id' in prev ? 'Save my entry' : 'Add to the wall');
    const signInNote = h('div', { class: 'gift-signin', hidden: true });

    const sm = () => meta[Number(surah.value) - 1];
    const options = (sel: HTMLSelectElement, lo: number, hi: number, value: number) =>
      sel.replaceChildren(...Array.from({ length: hi - lo + 1 }, (_, i) => h('option', { value: String(lo + i), selected: lo + i === value }, String(lo + i))));
    let seq = 0;
    async function refresh(a: number, b: number) {
      const s = sm();
      a = Math.min(Math.max(1, a), s.ayahs);
      options(from, 1, s.ayahs, a);
      b = Math.min(Math.max(a, b), a + MAX_ENTRY_AYAT - 1, s.ayahs);
      options(to, a, Math.min(s.ayahs, a + MAX_ENTRY_AYAT - 1), b);
      const my = ++seq;
      const all = await surahText(s.n);
      if (my !== seq) return;
      preview.replaceChildren(h('p', { class: 'wall-preview-ref' }, reference(s, a, b)),
        h('p', { class: 'wall-preview-ar', dir: 'rtl', lang: 'ar' }, all.slice(a - 1, b).join(' ')));
    }
    surah.onchange = () => void refresh(1, 1);
    from.onchange = () => void refresh(Number(from.value), Number(from.value));
    to.onchange = () => void refresh(Number(from.value), Number(to.value));
    const suggest = h('div', { class: 'gift-presets' }, ...SUGGESTIONS[wallInfo.occasion].map(([s, a, b]) =>
      h('button', { type: 'button', class: 'chip', onclick: () => { surah.value = String(s); void refresh(a, b); } }, reference(meta[s - 1], a, b))));

    body.replaceChildren(
      h('div', { class: 'join-card wall-card' }, h('p', { class: 'muted small' }, occasionLabel(wallInfo.occasion)), h('h2', {}, wallInfo.title),
        h('p', { class: 'muted small' }, 'Add an ayah for the wall, with your name and — if you like — a short dua.')),
      h('form', { class: 'circle-form', onsubmit: (e: Event) => { e.preventDefault(); void send(); } },
        h('label', {}, 'Your name', name),
        h('label', {}, 'Surah', surah),
        h('div', { class: 'wall-range' }, h('label', {}, 'From ayah', from), h('label', {}, 'To ayah', to)),
        h('p', { class: 'muted small' }, 'Up to three ayat. Some to start from:'), suggest,
        preview,
        h('label', {}, h('span', { class: 'gift-label-row' }, 'Your dua', count), dua),
        h('p', { class: 'muted small' }, 'Shown as your own words, with your name — never as Quran.'),
        signInNote,
        btn));
    void refresh(startA, startB);

    async function send() {
      if (!name.value.trim()) return toast('Please write your name');
      const entry = { name: name.value, dua: dua.value, surah: Number(surah.value), from: Number(from.value), to: Number(to.value) };
      btn.disabled = true;
      try {
        const who = await ensureGuest();
        if (!who) {
          try {
            sessionStorage.setItem(PENDING, JSON.stringify({ code, ...entry }));
          } catch {
            /* ignore */
          }
          signInNote.hidden = false;
          signInNote.replaceChildren(h('p', { class: 'small' }, 'Sign in with Google to add your ayah — it takes a moment, and you come right back here.'),
            h('button', { type: 'button', class: 'chip', onclick: () => openAccount() }, 'Sign in with Google'));
          return;
        }
        await addEntry(code, entry);
        try {
          sessionStorage.removeItem(PENDING);
        } catch {
          /* ignore */
        }
        const fresh = await previewWall(code);
        if (!alive) return;
        if (fresh?.entry) {
          wallInfo.entry = fresh.entry;
          done(fresh.entry);
        }
      } catch (e) {
        toast(offline(e));
      } finally {
        btn.disabled = false;
      }
    }
  }

  if (info.entry) done(info.entry);
  else if (!info.open) fail(`“${info.title}” is closed — thank you for coming.`);
  else form(pending);
  // Signing in with Google from this page: show the own entry (if any) once signed in.
  const off = onAccount((a) => {
    if (!a || !alive || wallInfo.entry) return;
    void previewWall(code).then((x) => {
      if (alive && x?.entry) {
        wallInfo.entry = x.entry;
        done(x.entry);
      }
    }, () => {});
  });
  return () => {
    alive = false;
    off();
  };
}

// --- #/wall/{id}/reel[/{start}]: the keepsake reel ---
export async function showKeepsake(root: HTMLElement, id: string, start = 0): Promise<() => void> {
  const body = h('div', { class: 'gift-page keepsake' });
  root.append(h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: `#/wall/${id}`, 'aria-label': 'Back to the wall' }, '‹'),
    h('div', { class: 'brand' }, h('h1', {}, 'Keepsake reel'), h('p', { class: 'muted' }, 'Ayah wall'))), body);
  const fail = (msg: string) => body.replaceChildren(h('div', { class: 'gift-error' }, h('p', {}, msg), h('a', { class: 'chip', href: `#/wall/${id}` }, 'Back to the wall')));
  body.replaceChildren(h('p', { class: 'muted center' }, h('span', { class: 'spinner' }), ' Opening…'));
  if (!account()) {
    fail('Sign in with Google to make the keepsake reel of your wall.');
    await new Promise<void>((resolve) => {
      let off: (() => void) | null = null;
      off = onAccount((a) => { if (a) { off?.(); resolve(); } });
    });
  }
  let got: Awaited<ReturnType<typeof loadWall>>;
  try {
    got = await loadWall(id);
  } catch (e) {
    fail(offline(e));
    return () => {};
  }
  if (!got) {
    fail('This wall is not there any more.');
    return () => {};
  }
  const { wall } = got;
  // Hidden entries never appear in the reel; the order is the order they arrived.
  const all = got.entries.filter((e) => !e.hidden);
  const list = all.slice(start);
  if (!list.length || !strictLook(wall.look, builtIn) || !RECITERS.some((r) => r.id === wall.reciter)) {
    fail(list.length ? 'This wall’s look cannot be used.' : 'There are no entries for a reel yet.');
    return () => {};
  }
  const project: Project = newProject(list[0].surah, list[0].ayah_from, list[0].ayah_to, wall.reciter);
  applyLook(project, wall.look, builtIn);
  project.intro = false;
  project.outro = true;
  project.closing = { title: wall.title, names: [longDate.format(new Date(wall.created_at))] };
  const r = reciterById(project.reciterId);

  const canvas = h('canvas', { class: 'gift-canvas', width: 540, height: 960 });
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const status = h('div', { class: 'stage-status' }, 'Loading recitation…');
  const playBtn = h('button', { class: 'ctl play', 'aria-label': 'Play', disabled: true }, icon('play', 26));
  const scrub = h('input', { type: 'range', class: 'keepsake-scrub', min: 0, max: 1, step: 0.01, value: 0, 'aria-label': 'Position', disabled: true });
  const exportBtn = h('button', { class: 'primary brand-btn', disabled: true }, 'Export');
  const info = h('p', { class: 'muted small center' });
  const nextPart = h('div', { class: 'keepsake-next' });
  body.replaceChildren(h('div', { class: 'gift-stage' }, canvas, status), h('div', { class: 'gift-controls keepsake-controls' }, playBtn, scrub), exportBtn, info, nextPart,
    h('p', { class: 'muted small center' }, `Recited by ${reciterPickerLabel(r)} · hidden entries are never in the reel. Change the reciter or look in the wall’s settings (⋯).`));

  let alive = true;
  let tl: Timeline | null = null;
  let audio: AudioBuffer | null = null;
  let media: BackgroundMedia[] = [];
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let t = 0, startCtx = 0, startT = 0;
  let dirty = true;

  try {
    await document.fonts.load('80px "UthmanicHafs"', 'بِسْمِ').catch(() => {});
    const [reel, scenes] = await Promise.all([
      loadSegments(r, list.map((e) => ({ surah: e.surah, from: e.ayah_from, to: e.ayah_to, note: { name: e.name, dua: e.dua } })),
        { pause: project.pause, hold: project.gap === 'hold' }, OUTRO,
        (done, total) => { status.textContent = `Loading recitation… ${done}/${total}`; }, () => alive),
      Promise.all(project.scenes.map((sid) => loadBackground(backgroundById(sid)).catch(() => ({ bg: backgroundById('charcoal') }) as BackgroundMedia))),
    ]);
    if (!alive) return () => {};
    await Promise.all(reel.surahs.map((s: SurahMeta) => document.fonts.load('54px "AmiriQuran"', s.ar).catch(() => {})));
    audio = reel.audio;
    media = scenes;
    tl = buildTimeline(document.createElement('canvas').getContext('2d')!, {
      translation: reelTranslation(),
      surah: reel.surahs[0], reciter: r, plan: reel.plan, arabic: reel.arabic, english: reel.english, meanings: reel.meanings,
      mode: project.textMode, wordsPerStep: project.wordsPerStep, translationMode: project.translationMode,
      style: frameStyle(project), sceneMode: project.sceneMode, sceneCount: project.scenes.length, sceneLengths: project.sceneLengths,
      surahs: reel.surahs, notes: reel.notes,
    });
    status.hidden = true;
    playBtn.disabled = false;
    scrub.disabled = false;
    exportBtn.disabled = false;
    scrub.max = String(tl.duration);
    const end = start + reel.used;
    const mins = Math.floor(tl.duration / 60), secs = Math.round(tl.duration % 60);
    info.textContent = `${all.length > reel.used ? `Entries ${start + 1}–${end} of ${all.length}` : `${reel.used} ${reel.used === 1 ? 'entry' : 'entries'}`} · ${mins}:${String(secs).padStart(2, '0')}`;
    if (start > 0) nextPart.append(h('a', { class: 'chip', href: `#/wall/${id}/reel/${Math.max(0, start - 30)}` }, '‹ Earlier entries'));
    if (end < all.length) nextPart.append(h('a', { class: 'chip', href: `#/wall/${id}/reel/${end}` }, `Next part: entries ${end + 1}–${Math.min(all.length, end + 30)} ›`));
    dirty = true;
  } catch (e) {
    if (!alive) return () => {};
    console.error(e);
    status.textContent = navigator.onLine ? `The recitation could not be loaded: ${e instanceof Error ? e.message : e}` : 'You are offline — the recitation needs the internet.';
  }

  async function play() {
    if (!audio || !tl) return;
    ac ??= new AudioContext();
    await ac.resume();
    if (t >= tl.duration - 0.05) t = 0;
    src = ac.createBufferSource();
    src.buffer = audio;
    src.connect(ac.destination);
    src.start(0, t);
    startCtx = ac.currentTime;
    startT = t;
    playing = true;
    setPlayIcon();
  }
  function pause() {
    if (src) {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      src = null;
    }
    if (playing && ac) t = startT + ac.currentTime - startCtx;
    playing = false;
    setPlayIcon();
    dirty = true;
  }
  const setPlayIcon = () => {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };
  playBtn.onclick = () => (playing ? pause() : void play());
  scrub.oninput = () => {
    pause();
    t = Number(scrub.value);
    dirty = true;
  };
  exportBtn.onclick = async () => {
    if (!tl || !audio) return;
    pause();
    const { exportReel } = await import('./reelExport');
    await exportReel({ project, timeline: tl, audio, media, name: `ayah-wall-${wall.join_code.toLowerCase()}${start ? `-${start + 1}` : ''}` });
    dirty = true;
  };

  const resize = () => {
    const w = Math.min(1080, Math.round(canvas.getBoundingClientRect().width * (devicePixelRatio || 1))) || 540;
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
    ctx.setTransform(w / W, 0, 0, w / W, 0, 0);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!tl || document.querySelector('.export-overlay')) return;
    if (playing && ac) {
      t = startT + ac.currentTime - startCtx;
      if (t >= tl.duration) {
        pause();
        t = tl.duration;
      }
      scrub.value = String(t);
      dirty = true;
    }
    void prepareScenes(sceneSpans(tl.scenes, project.transition), t, media, project.clips, true)?.then(() => (dirty = true));
    if (!dirty) return;
    dirty = false;
    render(ctx, t, project, tl, media);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    pause();
    void ac?.close();
    for (const m of media) m.video?.dispose();
  };
}
