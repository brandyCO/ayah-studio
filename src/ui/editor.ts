// Reel editor: reciter, text mode (Ayah / Line / Half line / Words), translation on/off, background
// preset, text effect, live 9:16 preview with play/pause + scrubbing, and MP4 export.
import { ayahAudio, mixdown, sliceAudio } from '../data/audio';
import { qdcSurah } from '../data/qdc';
import { loadWordMap, reference, surahMeta, surahText, surahTranslation, surahWordMeanings } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel, type Reciter } from '../data/reciters';
import { BACKGROUNDS, backgroundById, loadBackground, type BackgroundMedia } from '../engine/backgrounds';
import { capabilities, describePath } from '../engine/capabilities';
import { exportVideo } from '../engine/export';
import { H, W } from '../engine/layout';
import type { TitlePos, TitleSize } from '../engine/layout';
import { frameStyle, MAX_AYAT, newProject, type TextEffect, type TextMode, type TranslationMode } from '../engine/project';
import { LEAD_IN, planClipReel, planQdcReel, type ReelPlan } from '../engine/recitation';
import { render } from '../engine/render';
import { buildTimeline, type Timeline } from '../engine/timeline';
import { displayWords, parseSpans, wordMeanings } from '../engine/words';
import { openDebugPanel } from './debug';
import { fmtTime, h, toast } from './dom';
import { reelReciter, setReelReciter } from './prefs';

interface Reel {
  plan: ReelPlan;
  audio: AudioBuffer;
}

const MODES: { value: TextMode; label: string }[] = [
  { value: 'ayah', label: 'Ayah' },
  { value: 'line', label: 'Line' },
  { value: 'half', label: 'Half line' },
  { value: 'words', label: 'Words' },
];

export async function showEditor(root: HTMLElement, n: number, from: number, to: number): Promise<() => void> {
  const [s, allAr, allEn, allWbw, wordMap] = await Promise.all([surahMeta(n), surahText(n), surahTranslation(n), surahWordMeanings(n), loadWordMap()]);
  from = Math.max(1, Math.min(from || 1, s.ayahs));
  to = Math.max(from, Math.min(to || from, s.ayahs, from + MAX_AYAT - 1));
  const project = newProject(n, from, to, reciterById(reelReciter(DEFAULT_RECITER)).id);
  const arabic = allAr.slice(from - 1, to);
  const english = allEn.slice(from - 1, to);
  // English meaning of each Arabic word on screen (synced translation).
  const meanings = arabic.map((text, i) =>
    wordMeanings(allWbw[from - 1 + i], parseSpans(wordMap[`${n}:${from + i}`]), displayWords(text).length));

  let alive = true;
  let tl: Timeline | null = null;
  let audio: AudioBuffer | null = null;
  let plan: ReelPlan | null = null;
  const measure = document.createElement('canvas').getContext('2d')!;
  let media: BackgroundMedia | null = null;
  let exporting: AbortController | null = null;
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let t = 0;
  let startCtx = 0;
  let startT = 0;
  let dirty = true;

  // --- DOM ---
  const canvas = h('canvas', { class: 'preview', width: 540, height: 960 });
  const pctx = canvas.getContext('2d', { alpha: false })!;
  const status = h('div', { class: 'stage-status' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Play', onclick: () => (playing ? pause() : play()) }, '▶');
  const scrub = h('input', { type: 'range', class: 'scrub', min: '0', max: '1', step: '0.01', value: '0', 'aria-label': 'Scrub' });
  const timeLabel = h('span', { class: 'time' }, '0:00 / 0:00');

  const chips = <T extends string>(items: { value: T; label: string }[], get: () => T, set: (v: T) => void, enabled: (v: T) => boolean = () => true) => {
    const wrap = h('div', { class: 'chips' }) as HTMLDivElement & { redraw(): void };
    const draw = () => wrap.replaceChildren(...items.map((it) =>
      h('button', {
        class: `chip${get() === it.value ? ' on' : ''}`,
        disabled: !enabled(it.value),
        onclick: () => { if (get() !== it.value && !exporting) { set(it.value); draw(); } },
      }, it.label)));
    wrap.redraw = draw;
    draw();
    return wrap;
  };
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const input = h('input', { type: 'checkbox', checked: get(), onchange: () => set(input.checked) });
    return h('label', { class: 'toggle' }, input, h('span', {}, label));
  };

  const bgGrid = h('div', { class: 'bg-grid' });
  const drawBgGrid = () => bgGrid.replaceChildren(...BACKGROUNDS.map((b) =>
    h('button', {
      class: `bg-thumb${project.backgroundId === b.id ? ' on' : ''}`,
      title: b.label,
      style: b.kind === 'color' ? `background:${b.color}` : `background-image:url("${b.thumb}")`,
      onclick: () => { if (!exporting && project.backgroundId !== b.id) { project.backgroundId = b.id; drawBgGrid(); void loadBg(); } },
    }, h('span', {}, b.kind === 'video' ? `▶ ${b.label}` : b.label))));
  drawBgGrid();

  let quality: 1920 | 1280 = 1920;
  const exportBtn = h('button', { class: 'primary wide', onclick: () => void doExport() }, '⬇ Export MP4');
  const exportPathLabel = h('p', { class: 'muted small' }, 'Checking export support…');
  const progressBar = h('progress', { max: 1, value: 0 });
  const progressText = h('span', { class: 'small' });
  const cancelBtn = h('button', { class: 'chip', onclick: () => exporting?.abort() }, 'Cancel');
  const progressRow = h('div', { class: 'progress-row', hidden: true }, progressBar, progressText, cancelBtn);
  const result = h('div', { class: 'result', hidden: true });

  // Text modes other than Ayah need word timings (rule 8: never guess sync).
  const wordTimed = () => !!plan?.wordTimed;
  const mode = (): TextMode => (wordTimed() ? project.textMode : 'ayah');
  const modeChips = chips(MODES, mode, (v) => { project.textMode = v; stepRow.hidden = v !== 'words'; rebuild(); }, (v) => v === 'ayah' || wordTimed());
  const stepChips = chips<'1' | '2' | '3'>([{ value: '1', label: '1 word' }, { value: '2', label: '2 words' }, { value: '3', label: '3 words' }],
    () => String(project.wordsPerStep) as '1' | '2' | '3', (v) => { project.wordsPerStep = Number(v) as 1 | 2 | 3; rebuild(); });
  const stepRow = h('div', { class: 'sub-row', hidden: project.textMode !== 'words' }, h('span', { class: 'muted small' }, 'Per step'), stepChips);
  const syncNote = h('p', { class: 'muted small' }, 'Loading word timings…');
  const trRow = h('div', { class: 'sub-row', hidden: !project.showTranslation },
    chips<TranslationMode>([{ value: 'words', label: 'Synced to the words' }, { value: 'ayah', label: 'Whole ayah' }],
      () => project.translationMode, (v) => { project.translationMode = v; rebuild(); }),
    h('span', { class: 'muted small' }, 'Synced: word-by-word meanings (Quran.com) of the Arabic on screen. Whole ayah: Sahih International.'));
  const reciterSelect = h('select', {
    class: 'select',
    'aria-label': 'Reciter',
    onchange: () => {
      if (exporting) return;
      project.reciterId = Number(reciterSelect.value);
      setReelReciter(project.reciterId);
      void loadAudio();
    },
  }, ...RECITERS.map((r) => h('option', { value: String(r.id), selected: r.id === project.reciterId }, reciterPickerLabel(r))));

  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: `#/s/${n}/${from}`, 'aria-label': 'Back to reading' }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, 'New reel'), h('p', { class: 'muted' }, reference(s, from, to))),
      h('button', { class: 'icon-btn', 'aria-label': 'Device check', onclick: openDebugPanel }, '⚙')),
    h('div', { class: 'editor' },
      h('div', { class: 'stage-col' },
        h('div', { class: 'stage' }, canvas, status),
        h('div', { class: 'transport' }, playBtn, scrub, timeLabel)),
      h('div', { class: 'panel' },
        h('section', {}, h('h3', {}, 'Reciter'), reciterSelect),
        h('section', {}, h('h3', {}, 'Text'), modeChips, stepRow, syncNote),
        h('section', {}, h('h3', {}, 'Background'), bgGrid),
        h('section', {}, h('h3', {}, 'Text effect'),
          chips<TextEffect>([{ value: 'rise', label: 'Gentle rise' }, { value: 'fade', label: 'Fade' }], () => project.textEffect, (v) => { project.textEffect = v; dirty = true; })),
        h('section', {}, h('h3', {}, 'Translation'),
          toggle('Show translation', () => project.showTranslation, (v) => { project.showTranslation = v; trRow.hidden = !v; rebuild(); }),
          trRow),
        h('section', {}, h('h3', {}, 'Surah name'),
          chips<TitlePos>([{ value: 'top', label: 'Top' }, { value: 'below', label: 'Below the ayah' }, { value: 'bottom', label: 'Bottom' }],
            () => project.titlePos, (v) => { project.titlePos = v; rebuild(); }),
          h('div', { class: 'sub-row' }, h('span', { class: 'muted small' }, 'Size'),
            chips<TitleSize>([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }],
              () => project.titleSize, (v) => { project.titleSize = v; rebuild(); }))),
        h('section', { class: 'toggles' },
          toggle('Reciter name', () => project.credit, (v) => { project.credit = v; rebuild(); }),
          toggle('App watermark', () => project.watermark, (v) => { project.watermark = v; rebuild(); })),
        h('section', {}, h('h3', {}, 'Export'),
          chips<'1920' | '1280'>([{ value: '1920', label: '1080p' }, { value: '1280', label: '720p (faster)' }],
            () => String(quality) as '1920' | '1280', (v) => { quality = Number(v) as 1920 | 1280; }),
          exportBtn, exportPathLabel, progressRow, result))),
  );

  capabilities().then(({ path }) => {
    exportPathLabel.textContent = path ? `Export: ${describePath(path)}` : 'This browser cannot export video (no WebCodecs). Try Chrome on Android or desktop.';
    if (path?.container === 'webm') exportBtn.textContent = '⬇ Export video (WebM)';
    if (!path) exportBtn.disabled = true;
  });

  // --- preview sizing ---
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.min(1080, Math.round(canvas.clientWidth * dpr)) || 540;
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
    pctx.setTransform(w / W, 0, 0, w / W, 0, 0);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // --- loading ---
  const setStatus = (msg: string) => {
    status.textContent = msg;
    status.hidden = !msg;
  };

  function rebuild() {
    if (!plan) return;
    tl = buildTimeline(measure, {
      surah: s, reciter: reciterById(project.reciterId), plan, arabic, english,
      meanings, mode: mode(), wordsPerStep: project.wordsPerStep, translationMode: project.translationMode,
      style: frameStyle(project),
    });
    scrub.max = String(tl.duration);
    if (t > tl.duration) t = 0;
    dirty = true;
  }

  // Recitation per reciter (kept while the editor is open, so switching back is instant).
  const reels = new Map<number, Promise<Reel>>();
  async function buildReel(r: Reciter, progress: (msg: string) => void): Promise<Reel> {
    try {
      const q = await qdcSurah(r.id, n);
      const p = planQdcReel(q.timings, n, from, arabic, wordMap);
      if (p) {
        progress('Loading recitation…');
        return { plan: p, audio: await sliceAudio(q.audioUrl, p.clip!, LEAD_IN, p.duration, q.duration) };
      }
      console.warn(`QDC has no timing for ${n}:${from}-${to} (reciter ${r.id}); using everyayah`);
    } catch (e) {
      console.warn(`QDC recitation failed (reciter ${r.id}); using everyayah`, e);
    }
    // Fallback: per-ayah files without word timings (Ayah mode only).
    let done = 0;
    progress(`Loading recitation… 0/${arabic.length}`);
    const clips = await Promise.all(arabic.map((_, i) => ayahAudio(r, n, from + i).then((b) => {
      progress(`Loading recitation… ${++done}/${arabic.length}`);
      return b;
    })));
    const p = planClipReel(from, clips.map((c) => c.duration));
    return { plan: p, audio: mixdown(clips, p.offsets!, p.duration) };
  }

  let audioReq = 0;
  async function loadAudio() {
    const req = ++audioReq;
    pause();
    const r = reciterById(project.reciterId);
    // Drop the previous reel so its audio can never go out under this reciter's credit.
    plan = null;
    audio = null;
    tl = null;
    setStatus('Loading recitation…');
    syncNote.textContent = 'Loading word timings…';
    try {
      if (!reels.has(r.id)) {
        const p = buildReel(r, (msg) => { if (req === audioReq) setStatus(msg); });
        p.catch(() => reels.delete(r.id));
        reels.set(r.id, p);
        // Decoded audio is large: keep only the two most recent reciters.
        while (reels.size > 2) reels.delete(reels.keys().next().value!);
      }
      const reel = await reels.get(r.id)!;
      if (req !== audioReq || !alive) return;
      plan = reel.plan;
      audio = reel.audio;
      syncNote.textContent = plan.wordTimed
        ? 'Text follows the reciter word by word.'
        : `Word timings are not available for this reciter here, so only Ayah mode is offered${plan.source === 'everyayah' ? ' (audio: everyayah.com)' : ''}.`;
      modeChips.redraw();
      stepRow.hidden = mode() !== 'words';
      rebuild();
      setStatus(media ? '' : 'Loading background…');
    } catch (e) {
      if (req === audioReq) setStatus(`${e instanceof Error ? e.message : e}. Check your connection and pick the reciter again.`);
    }
  }

  let bgReq = 0;
  async function loadBg() {
    const req = ++bgReq;
    try {
      const m = await loadBackground(backgroundById(project.backgroundId));
      if (req !== bgReq || !alive) return m.video?.dispose();
      media?.video?.dispose();
      media = m;
      if (tl) setStatus('');
      dirty = true;
    } catch (e) {
      toast(`Background failed to load: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Fonts must be ready before text is measured for layout.
  await Promise.all([
    document.fonts.load('80px "UthmanicHafs"', arabic[0]),
    document.fonts.load('54px "AmiriQuran"', s.ar),
  ]).catch(() => {});
  void loadAudio();
  void loadBg();

  // --- playback (preview clock = audio clock) ---

  async function play() {
    if (!audio || !tl || !media || exporting) return;
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
    playBtn.textContent = '❚❚';
    playBtn.setAttribute('aria-label', 'Pause');
  }

  function pause() {
    if (src) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      src = null;
    }
    if (playing && ac) t = startT + ac.currentTime - startCtx;
    playing = false;
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play');
    dirty = true;
  }

  scrub.addEventListener('input', () => {
    const wasPlaying = playing;
    if (wasPlaying) pause();
    t = Number(scrub.value);
    dirty = true;
    if (wasPlaying) void play();
  });

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (exporting || !tl || !media) return;
    if (playing && ac) {
      t = startT + ac.currentTime - startCtx;
      if (t >= tl.duration) {
        pause();
        t = tl.duration;
      }
      dirty = true;
    }
    if (media.video && !media.video.isBusy) {
      // Fetch the frame for t; the decoded frame is drawn on the next tick.
      void media.video.prepare(t).then(() => (dirty = true));
    }
    if (!dirty) return;
    dirty = false;
    render(pctx, t, project, tl, media);
    scrub.value = String(t);
    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(tl.duration)}`;
  }
  raf = requestAnimationFrame(frame);

  // --- export ---
  let resultUrl = '';
  async function doExport() {
    const { path } = await capabilities();
    if (!path || !tl || !audio || !media) {
      toast(path ? 'Still loading — try again in a moment' : 'Export is not supported in this browser');
      return;
    }
    pause();
    exporting = new AbortController();
    exportBtn.disabled = true;
    progressRow.hidden = false;
    result.hidden = true;
    const started = performance.now();
    try {
      const signal = exporting.signal;
      const run = (p: typeof path) => exportVideo({
        project: structuredClone(project), timeline: tl!, audio: audio!, media: media!, path: p, height: quality, signal,
        onProgress: (f) => {
          progressBar.value = f;
          progressText.textContent = `${Math.round(f * 100)}%`;
        },
      });
      // Some hardware encoders reject a config they claimed to support: retry once in software.
      const blob = await run(path).catch((e) => {
        if (!path.hardware || signal.aborted) throw e;
        console.warn('Hardware encode failed, retrying in software', e);
        return run({ ...path, hardware: false });
      });
      const ext = path.container;
      const name = `ayah-studio-${n}-${from}${to > from ? `-${to}` : ''}.${ext}`;
      URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      const file = new File([blob], name, { type: blob.type });
      const canShare = !!navigator.canShare?.({ files: [file] });
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      result.replaceChildren(
        h('p', { class: 'small' }, `✓ ${name} · ${(blob.size / 1e6).toFixed(1)} MB · made in ${secs}s`),
        h('video', { src: resultUrl, controls: true, playsInline: true, class: 'result-video' }),
        h('div', { class: 'row' },
          h('a', { class: 'primary', href: resultUrl, download: name }, 'Save video'),
          canShare && h('button', { class: 'chip', onclick: () => navigator.share({ files: [file] }).catch(() => {}) }, 'Share…')),
      );
      result.hidden = false;
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && !exporting.signal.aborted) {
        toast(`Export failed: ${e instanceof Error ? e.message : e}`);
        console.error(e);
      } else toast('Export cancelled');
    } finally {
      exporting = null;
      exportBtn.disabled = false;
      progressRow.hidden = true;
      dirty = true;
    }
  }

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    exporting?.abort();
    pause();
    void ac?.close();
    media?.video?.dispose();
    URL.revokeObjectURL(resultUrl);
  };
}
