// Listen while reading: plays the reciter's recording from any ayah and reports, from the word timings,
// which ayah and word are being recited, so the mushaf can highlight them and turn the page. Continues
// into the next surah. Lock-screen controls via Media Session. Every reciter in the list can be heard:
// Quran.com reciters stream their full-surah file; mp3quran ones their checked surah file (cut points
// from public/data/mp3quran); everyayah ones play the per-ayah files one after another. Words are lit
// only where real timings exist (QDC, or aligned and checked: public/data/words; rule 8).
import { starButton } from './favourite';
import { favouritesFirst } from '../data/reciterDownload';
import { playableUrl } from '../data/keptAudio';
import { qdcSurah } from '../data/qdc';
import { mp3quranSurah } from '../data/mp3quran';
import { alignedWords } from '../data/alignedWords';
import { basmalaBefore, openingOf, type Basmala } from '../data/basmala';
import type { SurahMeta } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, covers, everyayahUrl, groupRecordings, reciterById, reciterPickerLabel, type Reciter } from '../data/reciters';
import { recordingChips } from './recordings';
import { h, toast } from './dom';
import { icon } from './icons';
import { reelReciter, setReelReciter } from './prefs';
import { t } from '../i18n';
import type { NightSource } from './night';
import { sampleButton, stopSample } from './voiceSample';
import { addListen } from '../data/journey';

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

// Ayat whose Quran.com word positions differ from our display words (public/data/word-map.json): aligned
// word times count display words, so they are not lit there rather than lit on the wrong word.
const SHIFTED = new Set(['2:181', '8:6', '13:37', '15:7', '27:20', '36:22', '37:130']);
const validSegs = (segs: unknown): [number, number, number][] => (Array.isArray(segs) ? segs : []).filter((x): x is [number, number, number] =>
  Array.isArray(x) && x.length >= 3 && x.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))).map((x) => [x[0], x[1], x[2]]);

export function createPlayer(o: PlayerHooks) {
  // Two elements: everyayah ayat play from alternate ones, the next one started just before the current one
  // ends, so the files join without a gap (as the original recording ran). Others use only `audio`.
  let audio = new Audio();
  audio.preload = 'auto';
  let ahead = new Audio();
  ahead.preload = 'auto';
  let aheadFor = 0; // the ayah loaded in `ahead`
  let surah = 0;
  let verses: Verse[] = [];
  let loadedFor = ''; // reciter/surah of `verses` and the audio
  let shown = false;
  let raf = 0;
  let last = '';
  let cur: { s: number; a: number; w: number | null } | null = null;
  let req = 0;
  // everyayah reciters: one file per ayah, played in turn (`perAyah`); `playing` = the ayah in the file.
  let perAyah = false;
  let using: Reciter | null = null; // the reciter actually loaded (the default where the chosen one has no recording)
  let playing = 0;
  const listeners = new Set<(pos: { s: number; a: number; w: number | null } | null) => void>();
  const tell = (pos: typeof cur) => { o.onPosition(pos); for (const f of listeners) f(pos); };

  const reciter = () => reciterById(reelReciter(DEFAULT_RECITER));
  /** The reciter for this surah: the chosen one, or the default when it has no checked recording of it. */
  function reciterIn(s: number): Reciter {
    const r = reciter();
    if (covers(r, s)) return r;
    const d = reciterById(DEFAULT_RECITER);
    toast(t('pl.notHere', { name: r.short, other: d.short }));
    return d;
  }

  // --- bar ---
  const playBtn = h('button', { class: 'icon-btn pl-play', 'aria-label': 'Play', onclick: () => toggle() });
  const label = h('span', { class: 'pl-ref' });
  const who = h('button', { class: 'pl-reciter', onclick: () => pickReciter() });
  const bar = h('div', { class: 'player', role: 'region', 'aria-label': 'Recitation player' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous ayah', onclick: () => step(-1) }, icon('left', 20)),
    playBtn,
    h('button', { class: 'icon-btn', 'aria-label': 'Next ayah', onclick: () => step(1) }, icon('right', 20)),
    h('div', { class: 'pl-info' }, label, who),
    // Turn what is playing into a reel (this reciter, the ayah being recited).
    h('button', { class: 'icon-btn', 'aria-label': t('pl.reel'), title: t('pl.reel'), onclick: () => makeReel() }, icon('create', 20)),
    // Night listening (docs/light.md, L1): loaded only when opened.
    h('button', { class: 'icon-btn', 'aria-label': t('night.open'), title: t('night.open'), onclick: () => openNightView() }, icon('moon', 20)),
    h('button', { class: 'icon-btn', 'aria-label': 'Stop listening', onclick: () => stop() }, icon('close', 20)));

  // Starting or buffering: a spinner on the play button and "Loading…" (the recording streams).
  let loading = false;
  let pending: { s: number; a: number } | null = null;
  function paint() {
    const playing = !audio.paused || (introOn && !intro.paused);
    playBtn.replaceChildren(loading ? h('span', { class: 'spinner' }) : icon(playing ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', loading ? 'Loading' : playing ? 'Pause' : 'Play');
    const at = loading && pending ? pending : cur;
    label.textContent = at ? `${o.meta[at.s - 1].en} · ${at.s}:${at.a}${loading ? ' · loading…' : ''}` : surah ? o.meta[surah - 1].en : '';
    who.textContent = `${(using ?? reciter()).short} ▾`;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      if (cur) navigator.mediaSession.metadata = new MediaMetadata({ title: label.textContent, artist: (using ?? reciter()).name, album: 'Ayah Studio' });
    }
  }

  function show(on: boolean) {
    if (shown === on) return;
    shown = on;
    bar.classList.toggle('show', on);
    o.onShow(on);
  }

  // Where the loaded recording recites its own Bismillah (lit in the mushaf) and where it starts (past a
  // spoken announcement in a few uploads), in seconds.
  let opening: { span: [number, number] | null; start: number } = { span: null, start: 0 };

  async function load(s: number): Promise<boolean> {
    const r = reciterIn(s);
    const key = `${r.id}/${s}`;
    if (key === loadedFor) return true;
    const id = ++req;
    let url = '';
    if (r.qdc !== false || r.mp3quran) {
      const q = r.qdc !== false ? await qdcSurah(r.id, s) : await mp3quranSurah(r, s, true);
      if (id !== req) return false;
      verses = [...q.timings.values()].map((v) => ({
        a: Number(v.verse_key.split(':')[1]),
        from: v.timestamp_from,
        to: v.timestamp_to,
        words: r.qdc === false && SHIFTED.has(v.verse_key) ? [] : validSegs(v.segments),
      })).sort((x, y) => x.from - y.from);
      url = q.audioUrl;
      opening = await openingOf(r, s).catch(() => ({ span: null, start: 0 }));
      if (id !== req) return false;
    } else {
      opening = { span: null, start: 0 };
      const words = await alignedWords(r, s);
      if (id !== req) return false;
      verses = Array.from({ length: o.meta[s - 1].ayahs }, (_, i) => ({
        a: i + 1, from: 0, to: 0, words: SHIFTED.has(`${s}:${i + 1}`) ? [] : validSegs(words[i + 1]),
      }));
    }
    const src = url ? await playableUrl(url) : ''; // a favourite's kept copy
    if (id !== req) return false;
    perAyah = !url;
    using = r;
    surah = s;
    loadedFor = key;
    if (src) audio.src = src;
    return true;
  }

  /** Play from the start of surah:ayah. */
  async function playFrom(s: number, a: number) {
    introDone?.(false); // a Bismillah still playing gives way
    show(true);
    loading = true;
    pending = { s, a };
    paint();
    try {
      if (!(await load(s))) return;
      const v = verses.find((x) => x.a === a) ?? verses[0];
      if (!v) throw new Error('No timings for this surah');
      // From the top of a surah: the very start of its recording, so the Bismillah (and an isti'adha) is
      // always heard, also where an ayah's start time is unknown (mp3quran cuts that are null). An ayah with
      // no known start plays from the nearest earlier ayah that has one, never from the surah's first timed ayah.
      let at = v.from;
      if (!perAyah && (a <= 1 || v.a !== a)) {
        const before = a <= 1 ? undefined : verses.filter((x) => x.a < a).pop();
        at = before ? before.from : opening.start * 1000;
      }
      if (perAyah) {
        playing = v.a;
        ahead.pause();
        audio.src = await playableUrl(everyayahUrl(using!, s, v.a));
        preload(v.a + 1);
      } else await seekTo(at / 1000);
      // A recording that starts straight at ayah 1: the reciter's own Bismillah first.
      if (a <= 1) {
        const mine = req;
        const b = await basmalaBefore(using!, s).catch(() => null);
        if (mine !== req) return;
        if (b && !(await playIntro(b))) return;
      }
      await audio.play();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast(navigator.onLine ? `Could not play the recitation: ${e instanceof Error ? e.message : e}` : 'Listening needs an internet connection');
    }
    loading = false;
    paint();
  }

  // The Bismillah played before a surah whose recording has none (data/basmala.ts).
  const intro = new Audio();
  intro.preload = 'auto';
  let introOn = false;
  let introDone: ((played: boolean) => void) | null = null;
  /** Plays the Bismillah; true when it finished, false when listening was stopped or moved on meanwhile. */
  async function playIntro(b: Basmala): Promise<boolean> {
    const mine = req;
    intro.src = await playableUrl(b.url);
    if (mine !== req) return false;
    await new Promise<void>((resolve, reject) => {
      if (intro.readyState >= 1) return resolve();
      intro.addEventListener('loadedmetadata', () => resolve(), { once: true });
      intro.addEventListener('error', () => reject(new Error('the audio could not be loaded')), { once: true });
    });
    intro.currentTime = b.from;
    const end = b.to;
    return new Promise<boolean>((resolve) => {
      const finish = (played: boolean) => {
        intro.removeEventListener('timeupdate', check);
        intro.removeEventListener('ended', ended);
        intro.pause();
        introOn = false;
        introDone = null;
        resolve(played && mine === req);
      };
      const check = () => { if (end !== null && intro.currentTime >= end) finish(true); };
      const ended = () => finish(true);
      intro.addEventListener('timeupdate', check);
      intro.addEventListener('ended', ended);
      introDone = finish;
      introOn = true;
      // Al-Fatiha's ayah 1 is the Bismillah; before any other surah it lights the Bismillah line (a = 0).
      if (surah === 1) { cur = { s: 1, a: 1, w: null }; last = '1:1:null'; tell(cur); }
      else { last = `${surah}:0`; o.onPosition({ s: surah, a: 0, w: null }); }
      loading = false;
      void intro.play().then(() => paint(), () => finish(true));
      paint();
    });
  }

  /** Load ayah `a` of the playing surah into the spare element. */
  function preload(a: number) {
    aheadFor = 0;
    if (!perAyah || !using || a > verses.length) return;
    const want = `${using.id}/${surah}/${a}`;
    aheadWant = want;
    void playableUrl(everyayahUrl(using, surah, a)).then((src) => {
      if (aheadWant !== want) return;
      ahead.src = src;
      ahead.load();
      aheadFor = a;
    });
  }
  let aheadWant = '';

  /** everyayah: start the next ayah's file 40 ms before this one ends (crossfaded by the overlap). */
  function switchOver() {
    if (!perAyah || aheadFor !== playing + 1 || ahead.readyState < 3) return false;
    if (!(audio.duration > 0) || audio.currentTime < audio.duration - 0.04) return false;
    const prev = audio;
    audio = ahead;
    ahead = prev;
    playing = aheadFor;
    aheadFor = 0;
    void audio.play().catch(() => toast('Could not play the recitation'));
    // The previous file plays out its last moment; then it takes the ayah after this one.
    prev.addEventListener('ended', () => preload(playing + 1), { once: true });
    return true;
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
    if (introOn) {
      if (intro.paused) void intro.play().catch(() => {});
      else intro.pause();
      paint();
      return;
    }
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
    introDone?.(false);
    loading = false;
    audio.pause();
    ahead.pause();
    aheadFor = 0;
    cancelAnimationFrame(raf);
    cur = null;
    last = '';
    tell(null);
    show(false);
  }

  /** Follows the recitation: the ayah whose span holds the time, and the word being recited. */
  function tick() {
    raf = requestAnimationFrame(tick);
    switchOver();
    const t = audio.currentTime * 1000;
    // The recording's own Bismillah: its line is lit in the mushaf (a = 0; not a position for other listeners).
    if (!perAyah && opening.span && surah !== 1 && t >= opening.span[0] * 1000 && t < opening.span[1] * 1000) {
      const k = `${surah}:0`;
      if (k !== last) { last = k; o.onPosition({ s: surah, a: 0, w: null }); }
      return;
    }
    let v: Verse | null = null;
    if (perAyah) v = verses[playing - 1] ?? null;
    else for (const x of verses) {
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

  /** Listen on both elements; only the one playing now counts. */
  const on = (type: string, f: () => void) => {
    for (const el of [audio, ahead]) el.addEventListener(type, (e) => { if (e.target === audio) f(); });
  };
  // Minutes listened (Me tab): recitation actually played, flushed every 30 s and on pause.
  let heard = 0;
  let lastT = -1;
  const flush = () => { if (heard >= 1) { addListen(heard); heard = 0; } };
  on('timeupdate', () => {
    const now = audio.currentTime;
    const dt = now - lastT;
    if (!audio.paused && lastT >= 0 && dt > 0 && dt < 2) heard += dt / (audio.playbackRate || 1);
    lastT = now;
    if (heard >= 30) flush();
  });
  on('seeking', () => { lastT = -1; });
  on('pause', () => { lastT = -1; flush(); });
  on('emptied', () => { lastT = -1; flush(); });
  on('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); paint(); });
  on('pause', () => { cancelAnimationFrame(raf); loading = false; paint(); });
  on('waiting', () => { loading = true; paint(); }); // buffering
  on('playing', () => { loading = false; paint(); });
  on('ended', () => {
    cancelAnimationFrame(raf);
    if (perAyah && surah && playing < verses.length) void playFrom(surah, playing + 1);
    else if (surah && surah < 114) void playFrom(surah + 1, 1);
    else stop();
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => toggle());
    navigator.mediaSession.setActionHandler('pause', () => toggle());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }

  function pickReciter() {
    const now = (using ?? reciter()).id;
    const choose = (r: Reciter) => {
      d.close();
      if (r.id === reciter().id) return;
      setReelReciter(r.id); // also the default for the next reel
      const at = cur;
      loadedFor = '';
      if (at) void playFrom(at.s, at.a);
      else paint();
    };
    // One row per reciter; a reciter with several recordings lists them as chips under the name.
    const groups = groupRecordings(favouritesFirst(RECITERS.filter((r) => !surah || covers(r, surah))));
    const d = h('dialog', { class: 'sheet bottom' },
      h('div', { class: 'sheet-head' }, h('h2', {}, 'Reciter'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
      h('div', { class: 'menu' }, ...groups.map((g) => {
        const r = g.find((x) => x.id === now) ?? g[0];
        return h('div', { class: 'rec-group' },
          h('button', { class: `menu-item${g.some((x) => x.id === now) ? ' on' : ''}`, onclick: () => choose(r) },
            h('span', {}, g.length > 1 ? r.name : reciterPickerLabel(r)), starButton(r, surah || null, () => { d.close(); pickReciter(); }), sampleButton(r)),
          recordingChips(g, now, choose));
      })));
    d.addEventListener('close', () => { stopSample(); d.remove(); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  }

  /** The ayah being recited (or about to be) as a new reel in this reciter's voice. */
  function makeReel() {
    const at = cur ?? pending;
    if (!at) return;
    audio.pause();
    location.hash = `#/reel/${at.s}/${at.a}-${at.a}`;
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
      for (const el of [audio, ahead]) { el.removeAttribute('src'); el.load(); }
      if ('mediaSession' in navigator) for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) navigator.mediaSession.setActionHandler(a, null);
    },
  };
}
