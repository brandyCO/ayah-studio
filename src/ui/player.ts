// Listen while reading: plays the reciter's full-surah recording (Quran.com QDC) from any ayah and
// reports, from the word timings, which ayah and word are being recited, so the mushaf can highlight
// them and turn the page. Continues into the next surah. Lock-screen controls via Media Session.
import { qdcSurah } from '../data/qdc';
import type { SurahMeta } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel } from '../data/reciters';
import { h, toast } from './dom';
import { icon } from './icons';
import { reelReciter, setReelReciter } from './prefs';
import { t } from '../i18n';
import type { NightSource } from './night';

interface Verse {
  a: number;
  from: number; // ms
  to: number;
  words: [number, number, number][]; // [word position, start ms, end ms], valid segments only
}

export interface PlayerHooks {
  meta: SurahMeta[];
  /** The ayah (and word, when timed) being recited; null when stopped. */
  onPosition(pos: { s: number; a: number; w: number | null } | null): void;
  /** The bar was shown or hidden (the page makes room for it). */
  onShow(shown: boolean): void;
}

export function createPlayer(o: PlayerHooks) {
  const audio = new Audio();
  audio.preload = 'auto';
  let surah = 0;
  let verses: Verse[] = [];
  let loadedFor = ''; // reciter/surah of `verses` and the audio
  let shown = false;
  let raf = 0;
  let last = '';
  let cur: { s: number; a: number; w: number | null } | null = null;
  let req = 0;
  const listeners = new Set<(pos: { s: number; a: number; w: number | null } | null) => void>();
  const tell = (pos: typeof cur) => { o.onPosition(pos); for (const f of listeners) f(pos); };

  const reciter = () => reciterById(reelReciter(DEFAULT_RECITER));

  // --- bar ---
  const playBtn = h('button', { class: 'icon-btn pl-play', 'aria-label': 'Play', onclick: () => toggle() });
  const label = h('span', { class: 'pl-ref' });
  const who = h('button', { class: 'pl-reciter', onclick: () => pickReciter() });
  const bar = h('div', { class: 'player', role: 'region', 'aria-label': 'Recitation player' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous ayah', onclick: () => step(-1) }, icon('left', 20)),
    playBtn,
    h('button', { class: 'icon-btn', 'aria-label': 'Next ayah', onclick: () => step(1) }, icon('right', 20)),
    h('div', { class: 'pl-info' }, label, who),
    // Night listening (docs/light.md, L1): loaded only when opened.
    h('button', { class: 'icon-btn', 'aria-label': t('night.open'), title: t('night.open'), onclick: () => openNightView() }, icon('moon', 20)),
    h('button', { class: 'icon-btn', 'aria-label': 'Stop listening', onclick: () => stop() }, icon('close', 20)));

  // Starting or buffering: a spinner on the play button and "Loading…" (the recording streams).
  let loading = false;
  let pending: { s: number; a: number } | null = null;
  function paint() {
    const playing = !audio.paused;
    playBtn.replaceChildren(loading ? h('span', { class: 'spinner' }) : icon(playing ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', loading ? 'Loading' : playing ? 'Pause' : 'Play');
    const at = loading && pending ? pending : cur;
    label.textContent = at ? `${o.meta[at.s - 1].en} · ${at.s}:${at.a}${loading ? ' · loading…' : ''}` : surah ? o.meta[surah - 1].en : '';
    who.textContent = `${reciter().short} ▾`;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      if (cur) navigator.mediaSession.metadata = new MediaMetadata({ title: label.textContent, artist: reciter().name, album: 'Ayah Studio' });
    }
  }

  function show(on: boolean) {
    if (shown === on) return;
    shown = on;
    bar.classList.toggle('show', on);
    o.onShow(on);
  }

  async function load(s: number): Promise<boolean> {
    const r = reciter();
    const key = `${r.id}/${s}`;
    if (key === loadedFor) return true;
    const id = ++req;
    const q = await qdcSurah(r.id, s);
    if (id !== req) return false;
    verses = [...q.timings.values()].map((v) => ({
      a: Number(v.verse_key.split(':')[1]),
      from: v.timestamp_from,
      to: v.timestamp_to,
      words: (v.segments ?? []).filter((x): x is [number, number, number] =>
        Array.isArray(x) && x.length >= 3 && x.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))) as [number, number, number][],
    })).sort((x, y) => x.from - y.from);
    surah = s;
    loadedFor = key;
    audio.src = q.audioUrl;
    return true;
  }

  /** Play from the start of surah:ayah. */
  async function playFrom(s: number, a: number) {
    show(true);
    loading = true;
    pending = { s, a };
    paint();
    try {
      if (!(await load(s))) return;
      const v = verses.find((x) => x.a === a) ?? verses[0];
      if (!v) throw new Error('No timings for this surah');
      await seekTo(v.from / 1000);
      await audio.play();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast(navigator.onLine ? `Could not play the recitation: ${e instanceof Error ? e.message : e}` : 'Listening needs an internet connection');
    }
    loading = false;
    paint();
  }

  function seekTo(sec: number): Promise<void> {
    if (audio.readyState >= 1) {
      audio.currentTime = sec;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const ok = () => { audio.currentTime = sec; done(); resolve(); };
      const fail = () => { done(); reject(new Error('the audio could not be loaded')); };
      const done = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); };
      audio.addEventListener('loadedmetadata', ok);
      audio.addEventListener('error', fail);
    });
  }

  function toggle() {
    if (!surah) return;
    if (audio.paused) void audio.play().catch(() => toast('Could not play the recitation'));
    else audio.pause();
  }

  function step(d: number) {
    if (!cur) return;
    const i = verses.findIndex((v) => v.a === cur!.a) + d;
    if (i >= 0 && i < verses.length) void playFrom(cur.s, verses[i].a);
    else if (d > 0 && cur.s < 114) void playFrom(cur.s + 1, 1);
    else if (d < 0 && cur.s > 1) void playFrom(cur.s - 1, o.meta[cur.s - 2].ayahs);
  }

  function stop() {
    req++;
    loading = false;
    audio.pause();
    cancelAnimationFrame(raf);
    cur = null;
    last = '';
    tell(null);
    show(false);
  }

  /** Follows the recitation: the ayah whose span holds the time, and the word being recited. */
  function tick() {
    raf = requestAnimationFrame(tick);
    const t = audio.currentTime * 1000;
    let v: Verse | null = null;
    for (const x of verses) {
      if (x.from > t) break;
      v = x;
    }
    if (!v) return;
    let w: number | null = null;
    for (const [pos, st, en] of v.words) if (st <= t && t < en) w = pos;
    // Between two words, keep the last one recited.
    if (w === null && cur?.a === v.a && cur.s === surah) w = cur.w;
    const key = `${surah}:${v.a}:${w}`;
    if (key === last) return;
    last = key;
    cur = { s: surah, a: v.a, w };
    tell(cur);
    paint();
  }

  audio.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); paint(); });
  audio.addEventListener('pause', () => { cancelAnimationFrame(raf); loading = false; paint(); });
  audio.addEventListener('waiting', () => { loading = true; paint(); }); // buffering
  audio.addEventListener('playing', () => { loading = false; paint(); });
  audio.addEventListener('ended', () => {
    cancelAnimationFrame(raf);
    if (surah && surah < 114) void playFrom(surah + 1, 1);
    else stop();
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => toggle());
    navigator.mediaSession.setActionHandler('pause', () => toggle());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }

  function pickReciter() {
    const d = h('dialog', { class: 'sheet bottom' },
      h('div', { class: 'sheet-head' }, h('h2', {}, 'Reciter'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
      h('div', { class: 'menu' }, ...RECITERS.map((r) => h('button', {
        class: `menu-item${r.id === reciter().id ? ' on' : ''}`,
        onclick: () => {
          d.close();
          if (r.id === reciter().id) return;
          setReelReciter(r.id); // also the default for the next reel
          const at = cur;
          loadedFor = '';
          if (at) void playFrom(at.s, at.a);
          else paint();
        },
      }, reciterPickerLabel(r)))));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  }

  /** What Night listening reads: the recitation clock, the word timings and the controls. */
  const night: NightSource = {
    meta: o.meta,
    position: () => cur,
    ms: () => audio.currentTime * 1000,
    playing: () => !audio.paused,
    words: (s, a) => (s === surah ? verses.find((v) => v.a === a)?.words ?? null : null),
    toggle: () => toggle(),
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
  };
  function openNightView() {
    void import('./night').then((m) => m.openNight(night)).catch(() => toast(t('common.wrong')));
  }

  return {
    bar,
    playFrom,
    active: () => shown,
    toggle,
    position: () => cur,
    destroy() {
      stop();
      audio.removeAttribute('src');
      audio.load();
      if ('mediaSession' in navigator) for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) navigator.mediaSession.setActionHandler(a, null);
    },
  };
}
