// Kids space, one surah (docs/kids.md K2): listen & repeat, and tap a word to hear it.
// One ayah at a time in large Arabic (the bundled text in the KFGQPC font, split only at its spaces),
// its reference (rule 2) and, if the parent left it on, its Sahih International translation.
// - Listen: the reciter reads the ayah (0.75× or 1×, pitch preserved) and the word being recited
//   lights up (QDC word timings through the reels' engine, `wordTimings()`); then "Your turn": a soft
//   ring breathes for the ayah's length + 1.5 s while the child repeats. ×3 = three rounds per ayah.
// - Tap a word: just that word's slice of the recording, with its Quran.com English meaning below.
//   Only words with a real timing segment can be heard (rule 8: never guess sync).
// No sound effects: the end of a turn and of the surah are shown, never heard (rule 3).
import { isKidsSurah, kidsSettings, learned, setKidsSettings, setLearned } from '../data/kids';
import { kidsRecitation } from '../data/kidsAudio';
import { loadMeta, loadWordMap, reference, surahText, surahTranslation, surahWordMeanings } from '../data/quran';
import { everyayahUrl, reciterById } from '../data/reciters';
import { displayWords, parseSpans, validSegments, wordTimings, type WordTiming } from '../engine/words';
import { h } from './dom';
import { icon } from './icons';
import { bloomNext, kidsReciter, parentButton } from './kids';

/** Where an ayah's recitation is: a span of the surah recording, or its own everyayah file (no word timings). */
interface AyahAudio {
  src: string;
  from: number; // seconds
  to: number; // seconds (Infinity: the file's end)
  words: WordTiming | null;
  heard: boolean[]; // per display word: has a real timing segment (can be played alone)
}

type State = 'idle' | 'loading' | 'playing' | 'turn' | 'word' | 'done';
const TURN_EXTRA = 1.5; // seconds added to the ayah's length for the child's turn

export async function showKidsSurah(root: HTMLElement, n: number): Promise<() => void> {
  if (!isKidsSurah(n)) {
    location.replace('#/kids');
    return () => {};
  }
  const [meta, arabic, english, meanings, wordMap] = await Promise.all([
    loadMeta(), surahText(n), surahTranslation(n), surahWordMeanings(n).catch(() => [] as string[]), loadWordMap().catch(() => ({} as Record<string, string>)),
  ]);
  const s = meta[n - 1];
  const reciter = reciterById(kidsReciter());
  root.classList.add('kids', 'kids-surah');

  const words = arabic.map((t) => displayWords(t));
  let ayah = 1;
  let round = 1;
  let state: State = 'idle';
  let audios: AyahAudio[] | null = null;
  let blobUrl = '';
  let loadErr = '';
  let raf = 0;
  let timer = 0;
  let stopAt = Infinity;
  let alive = true;

  const audio = new Audio();
  audio.preload = 'auto';
  (audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;

  // --- screen ---
  const wordEls: HTMLElement[] = [];
  const ar = h('p', { class: 'kids-ar', lang: 'ar', dir: 'rtl' });
  const ref = h('p', { class: 'kids-ref' });
  const en = h('p', { class: 'kids-en' });
  const meaning = h('p', { class: 'kids-meaning', 'aria-live': 'polite' });
  const status = h('p', { class: 'kids-status', 'aria-live': 'polite' });
  const stage = h('main', { class: 'kids-stage' }, h('div', { class: 'kids-ayah' }, ar), ref, meaning, en, status);
  const playBtn = h('button', { class: 'kids-btn main', 'aria-label': 'Listen', onclick: () => (state === 'idle' || state === 'done' || state === 'word' ? start() : stop()) });
  const prev = h('button', { class: 'kids-btn', 'aria-label': 'Previous ayah', onclick: () => goAyah(ayah - 1) }, icon('left', 28));
  const next = h('button', { class: 'kids-btn', 'aria-label': 'Next ayah', onclick: () => goAyah(ayah + 1) }, icon('right', 28));
  const speedBtn = h('button', { class: 'kids-chip', onclick: () => { setKidsSettings({ speed: kidsSettings().speed === 1 ? 0.75 : 1 }); paintChips(); } });
  const repBtn = h('button', { class: 'kids-chip', onclick: () => { setKidsSettings({ repeats: kidsSettings().repeats === 1 ? 3 : 1 }); paintChips(); } });
  const done = h('section', { class: 'kids-done', hidden: true });

  function paintChips() {
    const k = kidsSettings();
    speedBtn.textContent = k.speed === 1 ? 'Normal speed' : 'Slow';
    speedBtn.setAttribute('aria-label', `Speed: ${k.speed === 1 ? 'normal' : 'slow'} (tap to change)`);
    repBtn.textContent = k.repeats === 1 ? 'Once' : '3 times';
    repBtn.setAttribute('aria-label', `Each ayah ${k.repeats === 1 ? 'once' : 'three times'} (tap to change)`);
  }

  function paint() {
    playBtn.replaceChildren(state === 'loading' ? h('span', { class: 'spinner' })
      : icon(state === 'playing' || state === 'turn' ? 'pause' : 'play', 34));
    playBtn.setAttribute('aria-label', state === 'playing' || state === 'turn' ? 'Pause' : 'Listen');
    stage.classList.toggle('turn', state === 'turn');
    const reps = kidsSettings().repeats;
    status.textContent = state === 'turn' ? 'Your turn' : state === 'playing' && reps > 1 ? `Listen · ${round} of ${reps}` : state === 'playing' ? 'Listen' : loadErr;
    prev.disabled = ayah === 1;
    next.disabled = ayah === s.ayahs;
  }

  function showAyah(a: number) {
    ayah = Math.min(s.ayahs, Math.max(1, a));
    wordEls.length = 0;
    const heard = audios?.[ayah - 1]?.heard;
    ar.replaceChildren(...words[ayah - 1].flatMap((w, i) => {
      const el = h('span', { class: `kids-word${heard?.[i] ? ' tap' : ''}`, onclick: () => tapWord(i) }, w);
      if (heard?.[i]) {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `Hear this word${meaningOf(ayah, i) ? `: ${meaningOf(ayah, i)}` : ''}`);
      }
      wordEls.push(el);
      return [i ? ' ' : '', el];
    }));
    ref.textContent = reference(s, ayah);
    en.textContent = english[ayah - 1];
    en.hidden = !kidsSettings().translation;
    meaning.textContent = '';
    paint();
  }

  /** Quran.com word meanings of the API positions inside display word i ("a|b|…" per position). */
  function meaningOf(a: number, i: number): string {
    const list = (meanings[a - 1] ?? '').split('|');
    const spans = parseSpans(wordMap[`${n}:${a}`]);
    if (!spans) return list[i] ?? '';
    return spans.map(([f, l], p) => (i >= f && i <= l ? list[p] : '')).filter(Boolean).join(' ');
  }

  function lightWord(i: number | null) {
    wordEls.forEach((el, k) => el.classList.toggle('on', k === i));
  }

  // --- recitation ---
  async function ensureAudio(): Promise<boolean> {
    if (audios) return true;
    state = 'loading';
    loadErr = '';
    paint();
    try {
      const r = await kidsRecitation(reciter.id, n);
      if (!alive) return false;
      blobUrl = r.src;
      audios = words.map((ws, i) => {
        const v = r.qdc.timings.get(`${n}:${i + 1}`);
        if (!v || !(v.timestamp_to > v.timestamp_from)) return everyayah(i + 1);
        const spans = parseSpans(wordMap[`${n}:${i + 1}`]);
        const wt = wordTimings(ws.length, v, spans);
        const heard = new Array(ws.length).fill(false);
        for (const [p] of validSegments(v.segments, spans ? spans.length : ws.length)) {
          const [f, l] = spans ? spans[p - 1] : [p - 1, p - 1];
          for (let w = f; w <= l; w++) heard[w] = true;
        }
        if (ws.length === 1 && wt) heard[0] = true; // one-word ayah: the ayah's own timing
        return { src: blobUrl, from: v.timestamp_from / 1000, to: v.timestamp_to / 1000, words: wt, heard: wt ? heard : heard.fill(false) };
      });
    } catch (e) {
      console.warn('Kids recitation (QDC) failed, using per-ayah files', e);
      if (!alive) return false;
      if (!navigator.onLine) {
        loadErr = 'This surah needs the internet the first time.';
        state = 'idle';
        paint();
        return false;
      }
      audios = words.map((_, i) => everyayah(i + 1));
    }
    state = 'idle';
    showAyah(ayah); // tappable words now known
    return true;
  }
  const everyayah = (a: number): AyahAudio => ({ src: everyayahUrl(reciter, n, a), from: 0, to: Infinity, words: null, heard: words[a - 1].map(() => false) });

  async function seek(src: string, t: number) {
    if (audio.src !== src) {
      audio.src = src;
      await new Promise<void>((resolve, reject) => {
        const ok = () => { off(); resolve(); };
        const bad = () => { off(); reject(new Error('The recitation could not be loaded')); };
        const off = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', bad); };
        audio.addEventListener('loadedmetadata', ok);
        audio.addEventListener('error', bad);
      });
    }
    audio.currentTime = t;
  }

  async function playSpan(x: AyahAudio, from: number, to: number, rate: number) {
    await seek(x.src, from);
    audio.playbackRate = rate;
    stopAt = to;
    await audio.play();
  }

  function cancel() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    stopAt = Infinity;
    audio.pause();
    lightWord(null);
  }

  async function start() {
    done.hidden = true;
    stage.hidden = false;
    if (!(await ensureAudio())) return;
    if (state === 'done') goAyah(1, true);
    round = 1;
    void playAyah();
  }

  function stop() {
    cancel();
    state = 'idle';
    paint();
  }

  async function playAyah() {
    const x = audios![ayah - 1];
    cancel();
    state = 'playing';
    meaning.textContent = '';
    paint();
    try {
      await playSpan(x, x.from, x.to, kidsSettings().speed);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      loadErr = navigator.onLine ? 'The recitation could not be played.' : 'This surah needs the internet the first time.';
      state = 'idle';
      paint();
      return;
    }
    raf = requestAnimationFrame(follow);
  }

  /** Follows the recitation: lights the word being recited; at the ayah's end, the child's turn. */
  function follow() {
    raf = requestAnimationFrame(follow);
    const x = audios![ayah - 1];
    const t = audio.currentTime;
    if (state === 'playing' && x.words) {
      let w: number | null = null;
      for (const [i, a, b] of x.words.seq) if (a <= t && t < b) w = i;
      if (w !== null) lightWord(w);
    }
    if (t >= stopAt || audio.ended) ended();
  }

  function ended() {
    cancelAnimationFrame(raf);
    audio.pause();
    stopAt = Infinity;
    if (state === 'word') {
      state = 'idle';
      lightWordSoon();
      paint();
      return;
    }
    if (state !== 'playing') return;
    lightWord(null);
    const x = audios![ayah - 1];
    const len = (Number.isFinite(x.to) ? x.to - x.from : audio.duration || 4) / kidsSettings().speed;
    state = 'turn';
    paint();
    timer = window.setTimeout(afterTurn, (len + TURN_EXTRA) * 1000);
  }
  let fade = 0;
  function lightWordSoon() {
    clearTimeout(fade);
    fade = window.setTimeout(() => { if (state === 'idle') lightWord(null); }, 900);
  }

  function afterTurn() {
    if (round < kidsSettings().repeats) {
      round++;
      void playAyah();
    } else if (ayah < s.ayahs) {
      round = 1;
      goAyah(ayah + 1, true);
      void playAyah();
    } else finish();
  }
  audio.addEventListener('ended', () => { if (state === 'playing' || state === 'word') ended(); });

  function goAyah(a: number, keepPlaying = false) {
    if (!keepPlaying) {
      cancel();
      if (state !== 'loading') state = 'idle';
    }
    showAyah(a);
  }

  async function tapWord(i: number) {
    if (!(await ensureAudio())) return;
    const x = audios![ayah - 1];
    const m = meaningOf(ayah, i);
    cancel();
    meaning.replaceChildren(...(m ? [h('span', { class: 'kids-meaning-ar', lang: 'ar', dir: 'rtl' }, words[ayah - 1][i]), ' ', h('span', {}, m)] : []));
    if (!x.words || !x.heard[i]) {
      state = 'idle';
      paint();
      return; // rule 8: no timing of its own → its meaning only
    }
    state = 'word';
    paint();
    lightWord(i);
    try {
      await playSpan(x, x.words.start[i], x.words.end[i] + 0.06, kidsSettings().speed);
      raf = requestAnimationFrame(follow);
    } catch {
      state = 'idle';
      paint();
    }
  }

  // --- the end of the surah ---
  function finish() {
    cancel();
    state = 'done';
    paint();
    const isLit = !!learned()[n];
    done.replaceChildren(
      h('div', { class: 'kids-done-glow', 'aria-hidden': 'true' }),
      h('h2', {}, 'Well done!'),
      h('p', {}, isLit ? `You listened to ${s.en} again.` : `You listened to all of ${s.en}.`),
      h('div', { class: 'kids-done-actions' },
        h('button', { class: 'kids-btn', onclick: () => start() }, 'Listen again'),
        !isLit && h('button', { class: 'kids-btn lamp', onclick: () => { setLearned(n, true); bloomNext(n); location.hash = '#/kids'; } }, 'We learned it')));
    done.hidden = false;
    stage.hidden = true;
  }

  paintChips();
  showAyah(1);
  root.append(
    h('header', { class: 'kids-top' },
      h('a', { class: 'kids-back', href: '#/kids', 'aria-label': 'All surahs' }, icon('left', 26)),
      h('h1', { class: 'kids-title' }, s.en),
      parentButton()),
    stage, done,
    h('div', { class: 'kids-chips' }, speedBtn, repBtn),
    h('nav', { class: 'kids-controls' }, prev, playBtn, next),
    h('p', { class: 'kids-hint' }, 'Tap a word to hear it'));

  return () => {
    alive = false;
    cancel();
    clearTimeout(fade);
    audio.removeAttribute('src');
    audio.load();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
}
