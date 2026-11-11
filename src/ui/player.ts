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
import { recordingChips, reciterSearchBox } from './recordings';
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
    // Listening from another screen (Me, tasbih…): back to the page being recited, words lit as it goes.
    h('button', { class: 'icon-btn pl-follow', 'aria-label': t('pl.follow'), title: t('pl.follow'), onclick: () => followAlong() }, icon('book', 20)),
    // More: a reel of what is playing, Night listening, and Report a problem (with what is playing right now).
    h('button', { class: 'icon-btn pl-more', 'aria-label': t('pl.more'), title: t('pl.more'), onclick: () => more() }, '⋯'),
    h('button', { class: 'icon-btn', 'aria-label': 'Stop listening', onclick: () => stop() }, icon('close', 20)));

  // Starting or buffering: a spinner on the play button and "Loading…" (the recording streams).
  let loading = false;
  let pending: { s: number; a: number } | null = null;
  function paint() {
    const playing = !audio.paused || (introOn && !intro.paused);
    // The user's character listens quietly while a recitation plays (src/ui/actor.ts).
    document.documentElement.classList.toggle('reciting', playing);
    playBtn.replaceChildren(loading ? h('span', { class: 'spinner' }) : icon(playing ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', loading ? 'Loading' : playing ? 'Pause' : 'Play');
    const at = loading && pending ? pending : cur;
    label.textContent = at ? `${o.meta[at.s - 1].en} · ${at.s}:${at.a}${loading ? ' · loading…' : ''}` : surah ? o.meta[surah - 1].en : '';
    who.textContent = `${(loading ? reciter() : using ?? reciter()).short} ▾`; // the new voice's name while it loads
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
  let opening: { span: [number, number] | null; start: number; first: number | null } = { span: null, start: 0, first: null };

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
      const op = await openingOf(r, s).catch(() => null);
      if (id !== req) return false;
      opening = op ?? { span: null, start: 0, first: null };
      // Ayah 1's first word starts after the Bismillah (Quran.com times it from 0)
      const v1 = verses.find((v) => v.a === 1);
      if (opening.first !== null && v1?.words.length) {
        const f = opening.first;
        v1.words = v1.words.map((w, i) => (i === 0 && w[1] < f && f < w[2] ? [w[0], f, w[2]] : w));
      }
    } else {
      opening = { span: null, start: 0, first: null };
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
  let calls = 0;
  async function playFrom(s: number, a: number) {
    const call = ++calls;
    introDone?.(false); // a Bismillah still playing gives way
    show(true);
    loading = true;
    pending = { s, a };
    paint();
    try {
      if (!(await load(s))) return;
      const mine = req;
      const stale = () => mine !== req || call !== calls; // another ayah or reciter was chosen meanwhile
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
        const src = await playableUrl(everyayahUrl(using!, s, v.a));
        if (stale()) return;
        audio.src = src;
        preload(v.a + 1);
      } else await seekTo(at / 1000);
      if (stale()) return;
      // A recording that starts straight at ayah 1: the reciter's own Bismillah first.
      if (a <= 1) {
        const b = await basmalaBefore(using!, s).catch(() => null);
        if (mine !== req) return;
        if (b && !(await playIntro(b))) return;
      }
      if (stale()) return;
      await audio.play();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (call !== calls) return; // a newer request owns the bar now
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
    document.documentElement.classList.remove('reciting');
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
    if (heard >= 15) flush();
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
    // A surah recited to its end: the character stands up happy (src/ui/actor.ts).
    if (surah && !(perAyah && playing < verses.length)) window.dispatchEvent(new CustomEvent('recitation-surah', { detail: surah }));
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

  const countCovered = (r: Reciter) => Array.from({ length: 114 }, (_, i) => i + 1).filter((x) => covers(r, x)).length;

  function pickReciter() {
    const now = (using ?? reciter()).id;
    const choose = (r: Reciter) => {
      d.close();
      // Compared with the voice actually loaded: picking it again after a failed switch tries again.
      if (r.id === using?.id && loadedFor) return;
      setReelReciter(r.id); // also the default for the next reel
      const at = cur;
      // The old voice stops at once and any load still running for it is dropped, so it can never go on
      // playing (or start again) while the new one loads.
      req++;
      introDone?.(false);
      audio.pause();
      ahead.pause();
      aheadFor = 0;
      aheadWant = '';
      loadedFor = '';
      if (at) void playFrom(at.s, at.a);
      else paint();
    };
    // One row per reciter; a reciter with several recordings lists them as chips under the name.
    const groups = groupRecordings(favouritesFirst(RECITERS.filter((r) => !surah || covers(r, surah))));
    const row = (g: Reciter[]) => {
      const r = g.find((x) => x.id === now) ?? g[0];
      return h('div', { class: 'rec-group' },
        h('button', { class: `menu-item${g.some((x) => x.id === now) ? ' on' : ''}`, onclick: () => choose(r) },
          h('span', {}, g.length > 1 ? r.name : reciterPickerLabel(r)), starButton(r, surah || null, () => { d.close(); pickReciter(); }), sampleButton(r)),
        recordingChips(g, now, choose));
    };
    // Reciters with no recording of this surah are still listed (below), so nobody seems missing:
    // a tap plays the next surah they have.
    const others = surah ? RECITERS.filter((r) => !covers(r, surah) && !groups.some((g) => g[0].name === r.name)) : [];
    const goTo = (r: Reciter) => {
      const n = Array.from({ length: 114 }, (_, i) => ((surah + i) % 114) + 1).find((x) => covers(r, x));
      if (!n) return;
      d.close();
      setReelReciter(r.id);
      req++; introDone?.(false); audio.pause(); ahead.pause(); aheadFor = 0; aheadWant = ''; loadedFor = '';
      toast(t('pl.other-surah', { r: r.short, s: o.meta[n - 1].en }));
      void playFrom(n, 1);
    };
    const list = h('div', { class: 'menu' }, ...groups.map(row),
      others.length ? h('p', { class: 'rec-others' }, t('pl.others')) : null,
      ...others.map((r) => h('div', { class: 'rec-group' },
        h('button', { class: 'menu-item off', onclick: () => goTo(r) },
          h('span', {}, reciterPickerLabel(r)), h('small', { class: 'rec-has' }, t('pl.has', { n: countCovered(r) }))), sampleButton(r))));
    const search = reciterSearchBox(list, t('ed.reciter-search'));
    const d = h('dialog', { class: 'sheet bottom reciter-sheet' },
      h('div', { class: 'sheet-head' }, h('h2', {}, 'Reciter'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
      search, list);
    d.addEventListener('close', () => { stopSample(); d.remove(); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  }

  /** ⋯: the less frequent actions, so the bar keeps room for the reference on small phones. */
  function more() {
    const away = document.body.classList.contains('listening-away');
    const item = (label: string, ic: string, f: () => void) => h('button', { class: 'menu-item', onclick: () => { d.close(); f(); } },
      h('span', { class: 'mi-ic' }, icon(ic, 20)), label);
    const d = h('dialog', { class: 'sheet bottom' },
      h('div', { class: 'sheet-head' }, h('h2', {}, label.textContent || t('pl.more')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      h('div', { class: 'menu' },
        away ? item(t('pl.follow'), 'book', followAlong) : null,
        item(t('pl.reel'), 'create', makeReel),
        item(t('night.open'), 'moon', openNightView),
        item(t('pl.report'), 'flag', report)));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  }

  /** The report sheet, with what is playing now. */
  function report() {
    const at = cur ?? pending;
    const r = using ?? reciter();
    const ms = Math.round((introOn ? intro.currentTime : audio.currentTime) * 1000);
    void import('./report').then((m) => m.openReport({
      r: r.id, rn: r.short, s: at?.s, a: at?.a, w: cur?.w ?? null, ms, intro: introOn, playing: !audio.paused,
      src: r.qdc !== false ? 'qdc' : r.mp3quran ? 'mp3quran' : 'everyayah', url: (introOn ? intro.src : audio.src).slice(0, 160),
    }, { listening: true, summary: at ? `${o.meta[at.s - 1].en} ${at.s}:${at.a} · ${r.short}` : r.short }));
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
    pause: () => { if (introOn) intro.pause(); audio.pause(); },
    stop,
    position: () => cur ?? pending,
    destroy() {
      stop();
      for (const el of [audio, ahead]) { el.removeAttribute('src'); el.load(); }
      if ('mediaSession' in navigator) for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) navigator.mediaSession.setActionHandler(a, null);
    },
  };
}

// One player for the whole app: the recitation carries on while the user goes to Me (claims, tasbih),
// the surah list or anywhere else; the mushaf attaches to it while it is open (page tracking and lit
// words), and elsewhere the bar sits above the tab bar with a button back to the page being recited.
type Player = ReturnType<typeof createPlayer>;
type PlayerView = Pick<PlayerHooks, 'onPosition' | 'onShow'>;
let shared: Player | null = null;
let view: PlayerView | null = null;
const markAway = () => document.body.classList.toggle('listening-away', !!shared?.active() && !view);

export function sharedPlayer(meta: SurahMeta[]): Player {
  if (!shared) {
    shared = createPlayer({
      meta,
      onPosition: (pos) => view?.onPosition(pos),
      onShow: (on) => { view?.onShow(on); markAway(); },
    });
    document.body.append(shared.bar);
  }
  return shared;
}

/** The mushaf follows the recitation while it is open; returns the detach. */
export function attachPlayer(v: PlayerView): () => void {
  view = v;
  markAway();
  return () => { if (view === v) { view = null; markAway(); } };
}

/** Once the attached view is built: what is playing now (the bar's room, the page, the lit ayah). */
export function replayPosition() {
  if (!view || !shared?.active()) return;
  view.onShow(true);
  const pos = shared.position();
  if (pos) view.onPosition({ s: pos.s, a: pos.a, w: null });
}

export const playerActive = () => !!shared?.active();

/** Open the page being recited (the mushaf then tracks it). */
export function followAlong() {
  const pos = shared?.position();
  if (!pos) return;
  try { sessionStorage.removeItem('tabIntent'); } catch { /* ignore */ }
  location.hash = `#/s/${pos.s}/${Math.max(1, pos.a)}`;
}

/** Screens with their own sound (the studio) pause it; the Kids space stops it. */
export function quietPlayer(stop = false) {
  if (!shared?.active()) return;
  if (stop) shared.stop(); else shared.pause();
}
