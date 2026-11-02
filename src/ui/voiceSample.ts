// Hear a reciter before choosing: a ▶ beside each name plays the opening of Al-Fatiha (1:1) in that
// voice, from everyayah.com (per-ayah files, no account, cached by the browser); mp3quran recordings
// play the start of their first checked surah file (Al-Fatiha where checked). One sample at a time;
// it stops after 9 s, when another starts, or when the button is tapped again. Recitation only (rule 3).
import type { Reciter } from '../data/reciters';
import { mp3quranSample } from '../data/mp3quran';
import { icon } from './icons';
import { h } from './dom';
import { t } from '../i18n';

const MAX_MS = 9000;
let audio: HTMLAudioElement | null = null;
let current: { btn: HTMLElement; timer: number } | null = null;

export function stopSample() {
  if (!current) return;
  clearTimeout(current.timer);
  current.btn.classList.remove('playing', 'loading');
  current.btn.replaceChildren(icon('play', 16));
  current = null;
  audio?.pause();
}

function play(r: Reciter, btn: HTMLElement) {
  const again = current?.btn === btn;
  stopSample();
  if (again || (!r.everyayah && !r.mp3quran)) return;
  audio ??= new Audio();
  audio.preload = 'auto';
  btn.classList.add('loading');
  btn.replaceChildren(icon('pause', 16));
  const me = { btn, timer: window.setTimeout(stopSample, MAX_MS + 8000) };
  current = me;
  const a = audio;
  const start = (url: string | null) => {
    if (current !== me) return;
    if (!url) { stopSample(); return; }
    a.src = url;
    void a.play().catch(() => { if (current === me) stopSample(); });
  };
  if (r.everyayah) start(`https://everyayah.com/data/${r.everyayah}/001001.mp3`);
  else void mp3quranSample(r).then(start, () => start(null));
  audio.onplaying = () => {
    if (current !== me) return;
    btn.classList.remove('loading');
    btn.classList.add('playing');
    clearTimeout(me.timer);
    me.timer = window.setTimeout(stopSample, MAX_MS);
  };
  audio.onended = audio.onerror = () => { if (current === me) stopSample(); };
}

/** A small ▶ that plays a sample of `r`. Sits inside a row
 *  that is itself a button, so it is a span with button semantics and never selects the row. */
export function sampleButton(r: Reciter): HTMLElement | null {
  if (!r.everyayah && !r.mp3quran) return null;
  const btn: HTMLElement = h('span', {
    class: 'voice-sample', role: 'button', tabindex: '0', 'aria-label': t('voice.sample', { name: r.short }), title: t('voice.sample', { name: r.short }),
    onclick: (e: Event) => { e.stopPropagation(); e.preventDefault(); play(r, btn); },
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); play(r, btn); } },
  }, icon('play', 16));
  return btn;
}
