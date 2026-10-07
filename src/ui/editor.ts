// Phase 0 editor: reciter, translation on/off, background preset, text effect, live 9:16 preview
// with play/pause + scrubbing, and MP4 export.
import { ayahAudio, mixdown } from '../data/audio';
import { globalAyahNumber, reference, surahMeta, surahText, surahTranslation } from '../data/quran';
import { RECITERS, reciterById } from '../data/reciters';
import { BACKGROUNDS, backgroundById, loadBackground, type BackgroundMedia } from '../engine/backgrounds';
import { capabilities, describePath } from '../engine/capabilities';
import { exportVideo } from '../engine/export';
import { H, W } from '../engine/layout';
import { MAX_AYAT, newProject, type TextEffect } from '../engine/project';
import { render } from '../engine/render';
import { audioOffsets, buildTimeline, type Timeline } from '../engine/timeline';
import { openDebugPanel } from './debug';
import { fmtTime, h, toast } from './dom';

export async function showEditor(root: HTMLElement, n: number, from: number, to: number): Promise<() => void> {
  const [s, allAr, allEn] = await Promise.all([surahMeta(n), surahText(n), surahTranslation(n)]);
  from = Math.max(1, Math.min(from || 1, s.ayahs));
  to = Math.max(from, Math.min(to || from, s.ayahs, from + MAX_AYAT - 1));
  const project = newProject(n, from, to);
  const arabic = allAr.slice(from - 1, to);
  const english = allEn.slice(from - 1, to);

  let alive = true;
  let tl: Timeline | null = null;
  let audio: AudioBuffer | null = null;
  let durations: number[] | null = null;
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

  const chips = <T extends string>(items: { value: T; label: string }[], get: () => T, set: (v: T) => void) => {
    const wrap = h('div', { class: 'chips' });
    const draw = () => wrap.replaceChildren(...items.map((it) =>
      h('button', { class: `chip${get() === it.value ? ' on' : ''}`, onclick: () => { if (get() !== it.value && !exporting) { set(it.value); draw(); } } }, it.label)));
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
        h('section', {}, h('h3', {}, 'Reciter'),
          chips(RECITERS.map((r) => ({ value: r.id, label: r.name })), () => project.reciterId, (v) => { project.reciterId = v; void loadAudio(); })),
        h('section', {}, h('h3', {}, 'Background'), bgGrid),
        h('section', {}, h('h3', {}, 'Text effect'),
          chips<TextEffect>([{ value: 'rise', label: 'Gentle rise' }, { value: 'fade', label: 'Fade' }], () => project.textEffect, (v) => { project.textEffect = v; dirty = true; })),
        h('section', { class: 'toggles' },
          toggle('Show translation', () => project.showTranslation, (v) => { project.showTranslation = v; rebuild(); }),
          toggle('App watermark', () => project.watermark, (v) => { project.watermark = v; dirty = true; })),
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
    if (!durations) return;
    tl = buildTimeline(s, reciterById(project.reciterId), from, arabic, english, durations, project.showTranslation);
    scrub.max = String(tl.duration);
    dirty = true;
  }

  let audioReq = 0;
  async function loadAudio() {
    const req = ++audioReq;
    pause();
    const r = reciterById(project.reciterId);
    let done = 0;
    setStatus(`Loading recitation… 0/${arabic.length}`);
    try {
      const clips = await Promise.all(arabic.map((_, i) =>
        ayahAudio(r, n, from + i, globalAyahNumber(s, from + i)).then((b) => {
          if (req === audioReq) setStatus(`Loading recitation… ${++done}/${arabic.length}`);
          return b;
        })));
      if (req !== audioReq || !alive) return;
      durations = clips.map((c) => c.duration);
      rebuild();
      audio = mixdown(clips, audioOffsets(tl!), tl!.duration);
      if (t > tl!.duration) t = 0;
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
