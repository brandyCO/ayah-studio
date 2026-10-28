// Reel editor, laid out like CapCut: ✕ / quality / Export on top; the preview; a control row (time,
// play, undo, redo, fullscreen); then a fixed bottom area with the timeline and the tool bar, where a
// tool's panel slides up in place (the preview never changes size). A tool opens its options, an
// option opens a panel, and a block selected in the timeline shows its own actions. Every edit is
// live in the preview, even while playing, and can be undone.
import { arrangeAudio, polishAudio } from '../data/audio';
import { loadWordMap, reference, surahMeta, surahTajweed, surahText, surahTranslation, surahWordMeanings } from '../data/quran';
import { covers, DEFAULT_RECITER, RECITERS, reciterById, reciterCredit, reciterFor, reciterPickerLabel, type Reciter } from '../data/reciters';
import { mp3quranRange, mp3quranSurah, UncheckedRange } from '../data/mp3quran';
import { draftHash, getDraft, newDraftId, saveDraft } from '../data/drafts';
import { loadLibrary } from '../data/library';
import { BACKGROUNDS, backgroundById, isBackground, libraryBackgrounds, disposeMedia, loadBackground, type BackgroundMedia, type Credit } from '../engine/backgrounds';
import { capabilities, describePath } from '../engine/capabilities';
import { TEXT_EFFECTS } from '../engine/effects';
import { exportVideo } from '../engine/export';
import { FORMATS, H, isFormat, setFrame, W, type Format } from '../engine/layout';
import { AR_SIZE_MAX, AR_SIZE_MEDIUM, AR_SIZE_MIN, clampArSize, nearestTextSize, type EnFont, type TitlePos, type TitleSize } from '../engine/layout';
import { applyMood, COLOURS, currentMood, GRADES, MOODS } from '../engine/moods';
import {
  applyLook, cleanDedication, DEDICATION_MAX, TAIL_MAX, type Look, frameStyle, lookOf, MAX_AYAT, newProject, pacing, PAUSES, restoreProject,
  type GapText, type Grade, type Project, type Scrim, type TextColors, type TextEffect, type TextMode, type TextPos, type TranslationMode,
} from '../engine/project';
import { arrangeReel, audioSpans, trimLimits, voiceOnset, voiceStart, type ReelPlan } from '../engine/recitation';
import { render, type RenderInfo } from '../engine/render';
import { IDENTITY, keyIndex, addKey, removeKey, type Layer } from '../engine/motion';
import { loadLogo } from '../data/logos';
import { markPanel, saveMark, savedMark } from './markPanel';
import { attachTouch, drawGuides, drawSelection } from './studioTouch';
import { breathOf } from '../engine/cinema';
import { parseTajweed, TAJWEED_LEGEND, type AyahTajweed } from '../engine/tajweed';
import { applyStyle, applyVibe, currentStyle, currentVibe, FOOTAGE, pacedMode, QUICK_MOTIONS, recommendVibe, STYLES, VIBES, type Vibe } from '../engine/styles';
import { downloadHit, searchStock, stockEnabled, stockId, stockSources, type StockHit } from '../data/stock';
import { recordReel, popularReciters } from '../data/popular';
import {
  CLIP_FITS, clipIn, MAX_SCENES, MIN_RATE, MIN_SCENE, prepareScenes, sceneSpans, SLOWMO, TRANSITIONS, videoTime,
  type Clip, type ClipFit, type SceneMode, type Transition,
} from '../engine/scenes';
import { buildTimeline, type Timeline } from '../engine/timeline';
import { displayWords, parseSpans, recitedSpan, wordMeanings } from '../engine/words';
import { ayahLength, planSeries } from '../engine/series';
import { qdcSurah } from '../data/qdc';
import { isNative, saveVideo, shareFile, type SavedFile } from '../native';
import { openDebugPanel } from './debug';
import { h, toast } from './dom';
import { lanternProgress } from './lanternProgress';
import { icon } from './icons';
import { createMediaPicker } from './mediaPicker';
import { reelLook, reelReciter, setReelLook, setReelReciter } from './prefs';
import { loadReel, type Reel } from './reelSource';
import { createSpine, type Selection } from './spine';
import { currentTranslation, setTranslation, translationInfo } from '../data/translations';
import { t as ui, tOr } from '../i18n';
import { translationList } from './translationPicker';

const MODES: { value: TextMode; label: string }[] = [
  { value: 'ayah', label: ui('ed.ayah') },
  { value: 'line', label: ui('ed.line') },
  { value: 'half', label: ui('ed.half-line') },
  { value: 'words', label: ui('ed.words') },
];

/** Text effects by kind, for the effect picker. */
const EFFECT_GROUPS: { label: string; items: TextEffect[] }[] = [
  { label: ui('ed.fx.motion'), items: ['fade', 'rise', 'descend', 'drift', 'still'] },
  { label: ui('ed.fx.focus'), items: ['blur-in', 'focus', 'mist', 'dissolve'] },
  { label: ui('ed.fx.light'), items: ['glow', 'sweep', 'bloom'] },
  { label: ui('ed.fx.reveal'), items: ['ink', 'lines'] },
  { label: ui('ed.fx.scale'), items: ['settle', 'zoom', 'push'] },
];
const TRANSITION_ICONS: Record<Transition, string> = {
  crossfade: '◐', blur: '◍', black: '●', white: '○', zoom: '⊕', leak: '☀', mist: '☁', parallax: '⇅', wipe: '⇠', iris: '◎', lightbloom: '✺', clouddrift: '☁', cut: '│',
};

/** An entry of a bar: opens a panel, flips a setting, or runs an action. */
interface Opt {
  id: string;
  icon: string | (() => Node);
  label: string;
  panel?: () => Node[];
  toggle?: { get: () => boolean; set: (v: boolean) => void };
  action?: () => void;
  disabled?: () => boolean;
}
interface Tool {
  id: string;
  icon: string;
  label: string;
  options: Opt[];
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** `draftId`: reopen a saved draft (its ayat range comes from the address, which may have changed). */
export async function showEditor(root: HTMLElement, n: number, from: number, to: number, draftId?: string): Promise<() => void> {
  const [s, allAr, allEn, allWbw, wordMap, , draft] = await Promise.all([surahMeta(n), surahText(n), surahTranslation(n, currentTranslation()), surahWordMeanings(n), loadWordMap(), loadLibrary(),
    draftId ? getDraft(draftId).catch(() => undefined) : undefined]);
  from = Math.max(1, Math.min(from || 1, s.ayahs));
  to = Math.max(from, Math.min(to || from, s.ayahs, from + MAX_AYAT - 1));
  const project = newProject(n, from, to, reciterFor(reelReciter(DEFAULT_RECITER), n).id);
  applyLook(project, reelLook(), isBackground);
  if (draft) restoreProject(project, draft.project, isBackground, (id) => RECITERS.some((r) => r.id === id && covers(r, n)));
  else try {
    project.mark = savedMark(); // the user's own watermark, as set up last time
    project.tightStart = localStorage.getItem('tightStart') !== '0';
    project.cinema = localStorage.getItem('cinema') !== '0';
    project.tajweed = localStorage.getItem('tajweed') === '1';
    const fm = localStorage.getItem('format');
    if (isFormat(fm) && fm !== '9:16') project.format = fm;
    const az = Number(localStorage.getItem('arSize'));
    if (az) project.arSize = clampArSize(az);
    const sm = Number(localStorage.getItem('slowmo'));
    project.slowmo = (SLOWMO as readonly number[]).includes(sm) ? sm : 1;
  } catch { /* private window: on */ }
  // Autosave: a reel becomes a draft at its first edit and is saved after every edit.
  const draftKey = draft?.id ?? draftId ?? newDraftId();
  const created = draft?.created ?? Date.now();
  let saveTimer = 0;
  const arabic = allAr.slice(from - 1, to);
  // The whole-ayah translation: the draft's own, else the one chosen in the reader.
  project.translation ??= currentTranslation();
  const englishBy = new Map<string, string[]>([[currentTranslation(), allEn.slice(from - 1, to)]]);
  let english = englishBy.get(project.translation) ?? englishBy.get(currentTranslation())!;
  // English meaning of each Arabic word on screen (synced translation).
  const meanings = arabic.map((text, i) =>
    wordMeanings(allWbw[from - 1 + i], parseSpans(wordMap[`${n}:${from + i}`]), displayWords(text).length));

  let alive = true;
  let tl: Timeline | null = null;
  let audio: AudioBuffer | null = null;
  let plan: ReelPlan | null = null;
  let base: Reel | null = null; // the recitation before edits (trims, pauses, cards)
  const measure = document.createElement('canvas').getContext('2d')!;
  let media: BackgroundMedia[] = []; // decoded background of each entry in project.scenes
  let mediaReady = false;
  let mediaVersion = 0; // bumped whenever the decoded scenes change
  let previewScale = 1; // preview resolution now (lowered only while playing on a slow device)
  let playScale = 1; // learned for this visit: used from the next Play on
  let frameGap = 0, gapCount = 0, lastFrameAt = 0;
  let exporting: AbortController | null = null;
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let stopAt = 0; // reel time where a short listen (playAround) pauses; 0: play on
  let t = 0;
  let startCtx = 0;
  let startT = 0;
  let dirty = true;
  let syncText = ui('ed.loadingTimings');
  let quality: 1920 | 1280 = 1920;
  let picking: keyof TextColors | null = null; // eyedropper: the next tap on the preview takes a colour
  let colourKey: keyof TextColors = 'ar'; // Style → Colours: which text's colour the panel sets
  let layerSel: Layer | null = null; // moved / scaled by touch on the preview: its actions are in the bar
  const drawn: RenderInfo = { text: null, textPose: IDENTITY, bgPose: IDENTITY, fitText: (p) => p, fitBg: (p) => p }; // the preview's last frame

  // --- DOM: preview and control row ---
  const canvas = h('canvas', { class: 'preview', width: 540, height: 960 });
  const pctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })!;
  const status = h('div', { class: 'stage-status' });
  const stage = h('div', { class: 'stage' }, canvas, status);
  let shownFormat = ''; // the format the stage is shaped for (fitStage)
  const playBtn = h('button', { class: 'ctl play', 'aria-label': ui('ed.play'), onclick: () => (playing ? pause() : void play().then(() => { if (playing) watch(true); })) }, icon('play', 26));
  const restartBtn = h('button', { class: 'ctl', 'aria-label': ui('ed.restart'), title: ui('ed.restart'), onclick: () => restart() }, icon('restart'));
  const timeLabel = h('span', { class: 'time', dir: 'ltr' }, '00:00 / 00:00');
  const undoBtn = h('button', { class: 'ctl', 'aria-label': ui('ed.undo'), disabled: true, onclick: () => undo() }, icon('undo'));
  const redoBtn = h('button', { class: 'ctl', 'aria-label': ui('ed.redo'), disabled: true, onclick: () => redo() }, icon('redo'));
  const fullBtn = h('button', { class: 'ctl', 'aria-label': ui('ed.fullScreen'), onclick: () => setFull(!studio.classList.contains('full')) }, icon('full'));
  const setPlayIcon = () => {
    if (!playing) watch(false);
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
    playBtn.setAttribute('aria-label', ui(playing ? 'ed.pause' : 'ed.play'));
  };
  // Watching: Play (the button) fades the tools away and the preview fills the screen; a tap on the
  // preview, Esc or the end of the reel brings them back (and pauses).
  let wasFull = false;
  let built = false; // the studio exists (pause() can run while the reel is still loading)
  function watch(on: boolean) {
    if (!built || on === studio.classList.contains('watching')) return;
    if (on) { wasFull = studio.classList.contains('full'); setFull(true); }
    studio.classList.toggle('watching', on);
    if (!on) setFull(wasFull);
  }
  stage.addEventListener('click', () => { if (studio.classList.contains('watching')) pause(); });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && studio.classList.contains('watching')) pause(); };
  document.addEventListener('keydown', onKey);
  function setFull(on: boolean) {
    studio.classList.toggle('full', on);
    fullBtn.replaceChildren(icon(on ? 'unfull' : 'full'));
  }

  // --- undo / redo: snapshots of the project, a change committed once edits pause briefly ---
  const history: string[] = [JSON.stringify(project)];
  let hIndex = 0;
  let commitTimer = 0;
  const updateUndo = () => {
    undoBtn.disabled = hIndex === 0 && JSON.stringify(project) === history[0];
    redoBtn.disabled = hIndex >= history.length - 1;
  };
  function commit() {
    clearTimeout(commitTimer);
    commitTimer = 0;
    const json = JSON.stringify(project);
    if (json !== history[hIndex]) {
      history.splice(hIndex + 1);
      history.push(json);
      if (history.length > 80) history.shift();
      hIndex = history.length - 1;
    }
    updateUndo();
  }
  // --- drafts ---
  /** A small picture of the preview for the drafts list. */
  function previewThumb(): Promise<Blob | undefined> {
    const c = document.createElement('canvas');
    c.width = 135;
    c.height = 240;
    // Other formats: the middle of the frame, cropped to the drafts list's 9:16 tile.
    const sw = Math.min(canvas.width, (canvas.height * 9) / 16), sh = Math.min(canvas.height, (canvas.width * 16) / 9);
    c.getContext('2d')!.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.75));
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveNow(), 800);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      const thumb = await previewThumb().catch(() => undefined);
      await saveDraft({ id: draftKey, project: structuredClone(project), created, updated: Date.now(), thumb });
      // Reloading (or coming back) reopens this draft.
      if (alive && location.hash.startsWith(`#/reel/${n}/`) && !location.hash.endsWith(`/${draftKey}`)) window.history.replaceState(null, '', draftHash(project, draftKey));
    } catch (e) {
      console.warn('Draft not saved', e);
    }
  }

  function restore(json: string) {
    const prev = project;
    const before = { reciter: prev.reciterId, scenes: JSON.stringify(prev.scenes) };
    const snap = JSON.parse(json) as Project;
    // Keys the snapshot lacks were unset then (JSON drops undefined): unset them again.
    for (const k of Object.keys(project) as (keyof Project)[]) if (!(k in snap)) delete project[k];
    Object.assign(project, snap);
    selection = null;
    layerSel = null;
    void loadLogo(project.mark?.logo).then(() => (dirty = true));
    option = null;
    setReelLook(lookOf(project));
    if (project.reciterId !== before.reciter) {
      setReelReciter(project.reciterId);
      void loadAudio();
    } else arrange();
    if (JSON.stringify(project.scenes) !== before.scenes) void loadScenes();
    refreshUI();
    updateUndo();
    scheduleSave();
    dirty = true;
  }
  function undo() {
    if (exporting) return;
    commit();
    if (hIndex === 0) return;
    hIndex--;
    restore(history[hIndex]);
  }
  function redo() {
    if (exporting || hIndex >= history.length - 1) return;
    hIndex++;
    restore(history[hIndex]);
  }

  /** After any change: remember the look, record it for undo, redraw the bar/panel and the preview. */
  const changed = (rerender = true) => {
    setReelLook(lookOf(project));
    clearTimeout(commitTimer);
    commitTimer = window.setTimeout(commit, 400);
    undoBtn.disabled = false;
    if (rerender) refreshUI();
    spine.invalidate();
    scheduleSave();
    dirty = true;
  };
  const chips = <T extends string>(items: { value: T; label: string }[], get: () => T | null, set: (v: T) => void, enabled: (v: T) => boolean = () => true) =>
    h('div', { class: 'chips' }, ...items.map((it) =>
      h('button', {
        class: `chip${get() === it.value ? ' on' : ''}`,
        disabled: !enabled(it.value),
        onclick: () => { if (get() !== it.value && !exporting) { set(it.value); changed(); } },
      }, it.label)));
  const row = (label: string, ...kids: Node[]) => h('div', { class: 'sub-row' }, h('span', { class: 'muted small' }, label), ...kids);
  const note = (text: string) => h('p', { class: 'muted small' }, text);
  const tile = (o: { on: boolean; label: string; art: Node; onclick: () => void; title?: string }) =>
    h('button', { class: `tile${o.on ? ' on' : ''}`, title: o.title ?? o.label, onclick: () => { if (!exporting) o.onclick(); } },
      h('span', { class: 'tile-art' }, o.art), h('span', { class: 'tile-label' }, o.label));
  const dot = (c: string) => h('span', { class: 'dot', style: `background:${c}` });

  // Text modes other than Ayah need word timings (rule 8: never guess sync).
  const wordTimed = () => !!plan?.wordTimed;
  const mode = (): TextMode => (wordTimed() ? project.textMode : 'ayah');

  // --- scenes: every structural edit works on an explicit list (Custom) with one entry per scene ---
  const scenesChanged = () => { rebuild(); void loadScenes(); };
  /** Each scene entry's video settings (`clips`) follow it through every edit: one per entry. */
  const fitClips = () => {
    // In place, so a reference taken earlier in the same statement stays the project's list.
    const c = (project.clips ??= []);
    while (c.length < project.scenes.length) c.push(null);
    c.length = project.scenes.length;
    for (let i = 0; i < c.length; i++) c[i] ??= null;
    return c;
  };
  function toCustom() {
    if (!tl || project.sceneMode === 'custom') return;
    const clips = fitClips();
    project.clips = tl.scenes.map((x) => clips[x.entry] ?? null);
    project.scenes = tl.scenes.map((x) => project.scenes[x.entry]);
    project.sceneLengths = tl.scenes.map((x) => x.end - x.start);
    project.sceneMode = project.scenes.length > 1 ? 'custom' : 'single';
  }
  function addScene(id: string) {
    if (project.scenes.length >= MAX_SCENES && project.sceneMode !== 'single') return toast(`Up to ${MAX_SCENES} scenes`);
    toCustom();
    const lens = project.sceneMode === 'custom' ? project.sceneLengths : [tl?.duration ?? 1];
    const sum = lens.reduce((a, b) => a + b, 0);
    fitClips().push(null);
    project.scenes.push(id);
    project.sceneLengths = [...lens, sum / lens.length]; // the new scene gets an equal share; the others shrink in proportion
    project.sceneMode = 'custom';
    selection = { kind: 'scene', index: project.scenes.length - 1 };
    tool = null;
    option = null;
    scenesChanged();
    changed();
  }
  function removeScene(i: number) {
    toCustom();
    if (project.scenes.length < 2) return;
    fitClips().splice(i, 1);
    project.scenes.splice(i, 1);
    project.sceneLengths.splice(i, 1);
    if (project.scenes.length === 1) project.sceneMode = 'single';
    selection = null;
    scenesChanged();
    changed();
  }
  function moveScene(i: number, j: number) {
    toCustom();
    if (j < 0 || j >= project.scenes.length || i === j) return;
    const [id] = project.scenes.splice(i, 1);
    const [len] = project.sceneLengths.splice(i, 1);
    const [clip] = fitClips().splice(i, 1);
    project.clips.splice(j, 0, clip);
    project.scenes.splice(j, 0, id);
    project.sceneLengths.splice(j, 0, len);
    selection = { kind: 'scene', index: j };
    scenesChanged();
    changed();
  }
  /** Split scene i at the playhead into two scenes of the same background (CapCut "Split"). */
  function splitScene(i: number) {
    if (!tl) return;
    const sc = tl.scenes[i];
    if (!sc || t - sc.start < MIN_SCENE || sc.end - t < MIN_SCENE) return toast(ui('ed.splitWhere', { s: MIN_SCENE }));
    if (project.scenes.length >= MAX_SCENES) return toast(`Up to ${MAX_SCENES} scenes`);
    // The second part continues the video from the frame at the playhead.
    const v = media[sc.entry]?.video;
    const clip = fitClips()[sc.entry];
    const second: Clip | null = v ? { in: videoTime(sceneSpans(tl.scenes, project.transition)[i], t, clip, v.duration, project.slowmo ?? 1), fit: clip?.fit ?? 'loop' } : clip;
    toCustom();
    if (project.sceneMode === 'single') {
      project.sceneLengths = [tl.duration];
    }
    fitClips().splice(i + 1, 0, second);
    project.scenes.splice(i + 1, 0, project.scenes[i]);
    project.sceneLengths.splice(i, 1, t - sc.start, sc.end - t);
    project.sceneMode = 'custom';
    selection = { kind: 'scene', index: i + 1 };
    scenesChanged();
    changed();
  }
  const sceneAtPlayhead = () => Math.max(0, tl?.scenes.findIndex((x) => t >= x.start && t < x.end) ?? 0);
  /** Background picker (presets, the device's library, Pixabay / Pexels): add a new scene (replace = null), or replace scene `replace`. */
  const picker = createMediaPicker({
    busy: () => !!exporting,
    libraryChanged: () => { void loadScenes(); spine.invalidate(); },
  });
  function bgPicker(replace: number | null): Node[] {
    return picker.panel({
      intro: replace !== null ? ui('ed.pickFor', { n: replace + 1 }) : ui('ed.pickAdd'),
      current: replace !== null ? project.scenes[tl?.scenes[replace]?.entry ?? replace] ?? null : null,
      multiple: replace === null,
      pick: (id) => {
        if (exporting || !alive) return;
        if (replace === null) return addScene(id);
        if (project.sceneMode === 'ayah' && project.scenes.length < (tl?.scenes.length ?? 0)) toCustom();
        const k = project.sceneMode === 'custom' || project.sceneMode === 'single' ? replace : tl?.scenes[replace]?.entry ?? replace;
        if (k >= project.scenes.length) return;
        project.scenes[k] = id;
        fitClips()[k] = null; // new media starts from its beginning
        scenesChanged();
        changed();
      },
    });
  }

  // --- fine-tune to the millisecond (silences around an ayah, a scene's length) ---
  /** A value in seconds with −100/−10/+10/+100 ms steps (hold to repeat) and a box to type it exactly.
   *  The nodes stay while the panel redraws, so a held button keeps repeating and the keyboard stays open. */
  function stepper(get: () => number, set: (v: number) => void, label: string) {
    const input = h('input', { class: 'tune-input', type: 'number', inputMode: 'decimal', step: '0.001', min: '0', 'aria-label': `${label} in seconds` });
    input.addEventListener('change', () => {
      const v = Number(input.value.replace(',', '.'));
      if (Number.isFinite(v) && !exporting) set(v);
      update();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    const btn = (d: number, text: string) => {
      const b = h('button', { class: 'chip tune-step', type: 'button', 'aria-label': `${d > 0 ? 'Longer' : 'Shorter'} by ${Math.abs(d * 1000)} ms` }, text);
      let timer = 0;
      const stop = () => { clearTimeout(timer); timer = 0; };
      const step = () => { if (!exporting) set(get() + d); };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        stop();
        let delay = 450;
        const go = () => { step(); timer = window.setTimeout(go, delay); delay = Math.max(50, delay * 0.75); };
        go();
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      b.addEventListener('click', (e) => { if ((e as MouseEvent).detail === 0) step(); }); // keyboard
      return b;
    };
    const update = () => { if (document.activeElement !== input) input.value = get().toFixed(3); };
    update();
    const node = h('div', { class: 'tune-row' }, btn(-0.1, '−100'), btn(-0.01, '−10'),
      h('label', { class: 'tune-value' }, input, h('span', {}, 's')), btn(0.01, '+10'), btn(0.1, '+100'));
    return { node, update };
  }
  let tuneCache: { key: string; nodes: Node[]; update: () => void } | null = null;
  function cachedTune(key: string, make: () => { nodes: Node[]; update: () => void }): Node[] {
    if (tuneCache?.key !== key) tuneCache = { key, ...make() };
    tuneCache.update();
    return tuneCache.nodes;
  }
  const listenBtn = (around: () => [number, number] | null) =>
    h('button', { class: 'chip', type: 'button', onclick: () => { const r = around(); if (r) playAround(r[0], r[1]); } }, '▶ Listen');

  /** Selected ayah → the silence before it and after it, to the millisecond. */
  function audioTune(i: number): Node[] {
    const count = base?.plan.ayat.length ?? 0;
    if (!base || i >= count) return [note(ui('ed.loading-the-recitation'))];
    const ref = (k: number) => `${n}:${ayahNo(k)}`;
    return cachedTune(`audio:${i}:${from}-${to}:${count}`, () => {
      const parts: { node: Node; update: () => void }[] = [];
      const section = (title: string, get: () => number, set: (v: number) => void, range: () => [number, number], around: () => [number, number] | null) => {
        const st = stepper(get, set, title);
        const hint = h('p', { class: 'muted small tune-hint' });
        parts.push({
          node: h('div', { class: 'tune' }, h('div', { class: 'tune-head' }, h('b', {}, title), listenBtn(around)), st.node, hint),
          update: () => {
            st.update();
            const [lo, hi] = range();
            hint.textContent = hi < 29 ? `From ${lo.toFixed(3)} s to ${hi.toFixed(3)} s.` : `At least ${lo.toFixed(3)} s, so no word is cut.`;
          },
        });
      };
      // The silence between the words of two ayat, in the edited reel's time.
      const gapAt = (k: number): [number, number] | null => (plan ? [plan.ayat[k - 1].last, plan.ayat[k].start] : null);
      if (i === 0) section(ui('ed.silence-at-the-start'), () => silenceBefore(0), (v) => setSilenceBefore(0, v), () => silenceBeforeRange(0), () => (plan ? [0, plan.ayat[0].start] : null));
      else section(ui('ed.silenceBetween', { a: ref(i - 1), b: ref(i) }), () => silenceBefore(i), (v) => setSilenceBefore(i, v), () => silenceBeforeRange(i), () => gapAt(i));
      if (i < count - 1) section(ui('ed.silenceBetween', { a: ref(i), b: ref(i + 1) }), () => silenceBefore(i + 1), (v) => setSilenceBefore(i + 1, v), () => silenceBeforeRange(i + 1), () => gapAt(i + 1));
      else section(ui('ed.silence-at-the-end'), silenceEnd, setSilenceEnd, silenceEndRange, () => (plan ? [plan.ayat[count - 1].last, plan.duration - (plan.outro ?? 0)] : null));
      return {
        nodes: [note(ui('ed.set-each-silence-to-the-millisecond-tap-')),
          ...parts.map((x) => x.node)],
        update: () => parts.forEach((x) => x.update()),
      };
    });
  }

  /** Selected scene → its exact length (the neighbour after it — or before the last one — gives way). */
  function sceneTune(i: number): Node[] {
    if (!tl || tl.scenes.length < 2) return [note(ui('ed.add-another-scene-to-change-lengths'))];
    return cachedTune(`scene:${i}:${tl.scenes.length}`, () => {
      const k = () => (i < (tl?.scenes.length ?? 0) - 1 ? i : i - 1); // the boundary that moves
      const len = () => { const sc = tl!.scenes[i]; return sc ? sc.end - sc.start : 0; };
      const set = (v: number) => {
        if (!tl) return;
        const bounds = tl.scenes.slice(1).map((x) => x.start);
        const b = k(), lo = (b ? bounds[b - 1] : 0) + MIN_SCENE, hi = (b + 1 < bounds.length ? bounds[b + 1] : tl.duration) - MIN_SCENE;
        const sc = tl.scenes[i];
        // Lengthen/shorten from the end (or, for the last scene, from its start).
        const at = b === i ? sc.start + v : sc.end - v;
        bounds[b] = ms(Math.min(Math.max(at, lo), hi));
        resizeScenes(bounds);
      };
      const st = stepper(len, set, ui('ed.scene-length'));
      const where = h('p', { class: 'muted small tune-hint' });
      return {
        nodes: [
          h('div', { class: 'tune' }, h('div', { class: 'tune-head' }, h('b', {}, ui('ed.sceneNLength', { n: i + 1 })),
            listenBtn(() => { const sc = tl?.scenes[k()]; return sc ? [sc.end, sc.end] : null; })), st.node, where),
          note(ui('ed.sceneMin', { s: MIN_SCENE })),
        ],
        update: () => {
          st.update();
          const sc = tl?.scenes[k()];
          where.textContent = sc ? `${i < (tl?.scenes.length ?? 0) - 1 ? 'Changes to the next scene' : 'Starts'} at ${sc.end.toFixed(3)} s.` : '';
        },
      };
    });
  }

  /** A scene's video: where it starts, and how a clip shorter than the scene fills it. */
  const secs = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;
  function videoPanel(i: number): Node[] {
    const sc = tl?.scenes[i];
    const v = sc && media[sc.entry]?.video;
    if (!tl || !sc || !v) return [note(ui('ed.this-scene-is-a-photo-or-a-colour-photos'))];
    const span = sceneSpans(tl.scenes, project.transition)[i];
    const D = v.duration, slot = span.to - span.from;
    const clip = (): Clip => fitClips()[sc.entry] ?? { in: 0, fit: 'loop' };
    const start = () => clipIn(clip(), D);
    const label = h('span', { class: 'clip-time' });
    const info = h('p', { class: 'muted small' });
    const show = () => {
      const avail = D - start();
      label.textContent = `${secs(start())} / ${secs(D)}`;
      info.textContent = avail >= slot
        ? `The scene uses ${slot.toFixed(1)} s of the clip, from ${secs(start())}.`
        : `From here the clip lasts ${avail.toFixed(1)} s, shorter than the scene (${slot.toFixed(1)} s): ` +
          (clip().fit === 'loop' ? 'it plays again from the start point.'
            : clip().fit === 'slow' ? `it plays at ${Math.round(Math.max(MIN_RATE, avail / slot) * 100)}% speed${avail / slot < MIN_RATE ? ', then loops' : ''}.`
              : 'it stops on its last frame.');
    };
    const slider = h('input', { class: 'clip-slider', type: 'range', min: '0', max: String(Math.max(0, D - 0.1).toFixed(1)), step: '0.1', value: String(start()) });
    slider.addEventListener('input', () => {
      if (exporting) return;
      pause();
      fitClips()[sc.entry] = { ...clip(), in: Number(slider.value) };
      t = Math.min(sc.end - 0.05, 2 * sc.start - span.from); // the scene, fully in view
      spine.reveal(t);
      show();
      changed(false); // keep the slider while dragging
    });
    slider.addEventListener('change', () => changed());
    show();
    const short = D - start() < slot;
    return [
      row(ui('ed.start-from'), label),
      slider,
      short ? row(ui('ed.clip-too-short'), chips<ClipFit>(CLIP_FITS.map((c) => ({ ...c, label: tOr(`clip.${c.value}`, c.label) })), () => clip().fit, (f) => { fitClips()[sc.entry] = { ...clip(), fit: f }; })) : null,
      info,
      project.sceneMode === 'ayah' && project.scenes.length < tl.scenes.length ? note(ui('ed.this-video-repeats-in-other-scenes-they-')) : null,
      note(ui('ed.background-videos-play-without-their-own')),
    ].filter(Boolean) as Node[];
  }

  function resizeScenes(bounds: number[]) {
    if (!tl || exporting) return;
    toCustom();
    const edges = [0, ...bounds, tl.duration];
    project.sceneLengths = edges.slice(1).map((e, i) => e - edges[i]);
    project.sceneMode = 'custom';
    rebuild();
    changed();
  }

  // --- audio: trims (silence only), pauses, whole ayat at the ends ---
  const ayahNo = (i: number) => from + i;
  function audioTrim(i: number) {
    if (!base) return null;
    const [maxHead, maxTail] = trimLimits(base.plan, i);
    const [head, tail] = project.trims[ayahNo(i)] ?? [0, 0];
    return {
      head: i === 0 && project.tightStart ? maxHead : Math.min(head, maxHead), tail: Math.min(tail, maxTail), maxHead, maxTail,
      gap: i > 0 ? Math.max(0, project.pause + (project.gaps[ayahNo(i)] ?? 0)) : 0,
    };
  }
  const ms = (x: number) => Math.round(x * 1000) / 1000; // edits are kept to the millisecond
  function trimAudio(i: number, head: number, tail: number) {
    if (i === 0 && project.tightStart && Math.abs(head - audioTrim(0)!.maxHead) > 0.0005) setTightStart(false); // set by hand from now on
    project.trims[ayahNo(i)] = [ms(head), ms(tail)];
    arrange();
    changed();
  }
  function setGap(i: number, gap: number) {
    project.gaps[ayahNo(i)] = ms(gap - project.pause);
    arrange();
    changed();
  }

  // Silences to the millisecond. The silence between two ayat = what is left after the previous
  // ayah's last word + the pause added between them + what is left before this ayah's first word.
  /** The recording's own silence around ayah i's words (before any trim): [before, after]. */
  function natural(i: number): [number, number] {
    const [a, b] = audioSpans(base!.plan)[i];
    const A = base!.plan.ayat[i];
    return [(i === 0 ? voiceStart(base!.plan) : A.start) - a, b - A.last];
  }
  /** Silence before ayah i's first word (from the previous ayah's last word; for the first ayah, from the start). */
  function silenceBefore(i: number) {
    const tr = audioTrim(i)!;
    if (i === 0) return natural(0)[0] - tr.head;
    return natural(i - 1)[1] - audioTrim(i - 1)!.tail + tr.gap + natural(i)[0] - tr.head;
  }
  const silenceEnd = () => { const k = base!.plan.ayat.length - 1; return natural(k)[1] - audioTrim(k)!.tail; };
  /** The shortest silence before ayah i (every word kept whole) and the longest. */
  function silenceBeforeRange(i: number): [number, number] {
    const tr = audioTrim(i)!;
    if (i === 0) return [natural(0)[0] - tr.maxHead, natural(0)[0]];
    return [natural(i - 1)[1] - audioTrim(i - 1)!.maxTail + natural(i)[0] - tr.maxHead, 30];
  }
  const silenceEndRange = (): [number, number] => { const k = base!.plan.ayat.length - 1; return [natural(k)[1] - audioTrim(k)!.maxTail, natural(k)[1]]; };
  /** Make the silence before ayah i exactly `v` seconds: trim the recording's silence (evenly from both
   *  sides of the cut) when shorter than it, add a pause when longer. */
  function setSilenceBefore(i: number, v: number) {
    const [lo, hi] = silenceBeforeRange(i);
    v = ms(Math.min(Math.max(v, lo), hi));
    const tr = audioTrim(i)!;
    if (i === 0) {
      setTightStart(false);
      project.trims[ayahNo(0)] = [ms(natural(0)[0] - v), ms(tr.tail)];
    } else {
      const prev = audioTrim(i - 1)!;
      const own = natural(i - 1)[1] + natural(i)[0];
      let head = 0, tail = 0;
      const cut = Math.max(0, own - v);
      tail = Math.min(prev.maxTail, cut / 2);
      head = Math.min(tr.maxHead, cut - tail);
      tail = Math.min(prev.maxTail, cut - head);
      project.trims[ayahNo(i - 1)] = [ms(prev.head), ms(tail)];
      project.trims[ayahNo(i)] = [ms(head), ms(tr.tail)];
      project.gaps[ayahNo(i)] = ms(Math.max(0, v - own) - project.pause);
    }
    arrange();
    changed();
  }
  function setSilenceEnd(v: number) {
    const k = base!.plan.ayat.length - 1;
    const [lo, hi] = silenceEndRange();
    project.trims[ayahNo(k)] = [ms(audioTrim(k)!.head), ms(natural(k)[1] - Math.min(Math.max(v, lo), hi))];
    arrange();
    changed();
  }
  /** Trim every silence to the minimum (start, end and between ayat), CapCut's "remove silences". */
  function removeSilences(only?: number) {
    if (!base) return;
    for (let i = 0; i < base.plan.ayat.length; i++) {
      if (only !== undefined && i !== only) continue;
      const [mh, mt] = trimLimits(base.plan, i);
      project.trims[ayahNo(i)] = [ms(mh), ms(mt)];
      if (only === undefined && i > 0) project.gaps[ayahNo(i)] = -project.pause;
    }
    if (only === undefined) project.pause = 0;
    arrange();
    changed();
    toast(ui('ed.silencesTrimmed'));
  }
  /** Start on the first word (only the reel's start); remembered on this device for the next reel. */
  function setTightStart(on: boolean) {
    project.tightStart = on;
    try { localStorage.setItem('tightStart', on ? '1' : '0'); } catch { /* private window */ }
  }
  /** Cinematic touches; remembered on this device for the next reel. */
  function setCinema(on: boolean) {
    project.cinema = on;
    try { localStorage.setItem('cinema', on ? '1' : '0'); } catch { /* private window */ }
  }
  /** Tajweed colours on the Arabic; remembered on this device for the next reel. */
  function setTajweed(on: boolean) {
    project.tajweed = on;
    try { localStorage.setItem('tajweed', on ? '1' : '0'); } catch { /* private window */ }
    rebuild();
    changed();
    if (on) previewText();
  }
  const tajweedRow = () => row(ui('ed.tajweed'), chips<'on' | 'off'>([{ value: 'off', label: ui('ed.off') }, { value: 'on', label: ui('qr.on') }],
    () => (project.tajweed ? 'on' : 'off'), (v) => setTajweed(v === 'on')));
  /** Learning reel: one word at a time with its meaning large under it (needs word timings, rule 8). */
  function setLearn(on: boolean) {
    project.learn = on;
    if (on) {
      project.textMode = 'words';
      project.wordsPerStep = 1;
      project.showTranslation = true;
      project.translationMode = 'words';
    }
    rebuild();
    changed();
    if (on) previewText();
  }
  const learning = () => !!project.learn && frameStyle(project).learn === true;
  const learnRow = () => [
    row(ui('ed.learn'), chips<'on' | 'off'>([{ value: 'off', label: ui('ed.off') }, { value: 'on', label: ui('qr.on') }],
      () => (learning() ? 'on' : 'off'), (v) => { if (v === 'on') { own('text'); own('tr'); } setLearn(v === 'on'); }, (v) => v === 'off' || wordTimed())),
    note(ui(wordTimed() ? 'ed.learn-note' : 'ed.learn-needs-timings')),
  ];
  const tajweedLegend = () => h('div', { class: 'tajweed-legend' }, ...TAJWEED_LEGEND.map((x) =>
    h('span', {}, h('i', { style: `background:${x.color}` }), ui(`tj.${x.group}` as 'tj.madd2'))));
  /** Slow motion for the background videos (never the recitation); remembered on this device. */
  function setSlowmo(v: number) {
    project.slowmo = v;
    try { localStorage.setItem('slowmo', String(v)); } catch { /* private window */ }
    changed();
  }
  /** Arabic text size: a slider from the smallest readable size to the largest (0–100 %). */
  const sizePct = (v: number) => Math.round(((v - AR_SIZE_MIN) / (AR_SIZE_MAX - AR_SIZE_MIN)) * 100);
  const sizeSlider = (): Node[] => {
    const cur = () => project.arSize ?? ({ s: 70, m: AR_SIZE_MEDIUM, l: 92 } as const)[project.textSize];
    const label = h('span', { class: 'clip-time' }, `${sizePct(cur())} %`);
    const slider = h('input', { class: 'clip-slider', type: 'range', min: String(AR_SIZE_MIN), max: String(AR_SIZE_MAX), step: '1', value: String(cur()), 'aria-label': ui('ed.text-size') });
    let raf = 0;
    const set = (save: boolean) => {
      if (exporting) return;
      const v = clampArSize(Number(slider.value));
      project.arSize = v;
      project.textSize = nearestTextSize(v); // what gifts (S / M / L only) get
      label.textContent = `${sizePct(v)} %`;
      if (save) try { localStorage.setItem('arSize', String(v)); } catch { /* private window */ }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { rebuild(); previewText(); });
      changed(false); // keep the slider while dragging
    };
    slider.addEventListener('input', () => set(false));
    slider.addEventListener('change', () => set(true));
    return [row(ui('ed.text-size'), label), slider, note(ui('ed.text-size-note', { m: sizePct(AR_SIZE_MEDIUM) }))];
  };
  /** Seconds the video keeps going after the recitation (silent; background, reference and marks go on). */
  const tailPanel = (): Node[] => {
    const fmt = (v: number) => (v ? `+${v.toFixed(1)} s` : ui('ed.off'));
    const label = h('span', { class: 'clip-time' }, fmt(project.tail ?? 0));
    const slider = h('input', { class: 'clip-slider', type: 'range', min: '0', max: String(TAIL_MAX), step: '0.5', value: String(project.tail ?? 0), 'aria-label': ui('ed.tail') });
    slider.addEventListener('input', () => { label.textContent = fmt(Number(slider.value)); });
    slider.addEventListener('change', () => {
      if (exporting) return;
      const v = Number(slider.value);
      if (v > 0) project.tail = v; else delete project.tail;
      arrange();
      changed(false);
      if (tl) { t = Math.max(0, tl.duration - Math.min(tl.duration, (project.tail ?? 0) + 1.5)); dirty = true; } // show the new ending
    });
    return [row(ui('ed.tail-after'), label), slider, note(ui('ed.tail-note'))];
  };
  /** Video format: 9:16 (default), square or 16:9; remembered on this device for the next reel. */
  function setFormat(f: Format) {
    project.format = f === '9:16' ? undefined : f;
    try { localStorage.setItem('format', f); } catch { /* private window */ }
    rebuild();
    changed();
    previewText();
  }
  const formatRow = () => [
    row(ui('ed.format'), chips<Format>([{ value: '9:16', label: ui('ed.format-916') }, { value: '1:1', label: ui('ed.format-11') }, { value: '16:9', label: ui('ed.format-169') }],
      () => project.format ?? '9:16', setFormat)),
    note(ui('ed.format-note')),
  ];
  const slowmoRow = () => row(ui('ed.slowmo'), chips<string>(SLOWMO.map((v) => ({ value: String(v), label: v === 1 ? ui('ed.off') : ui(v === 0.75 ? 'ed.slowmo-slow' : 'ed.slowmo-very') })),
    () => String(project.slowmo ?? 1), (v) => setSlowmo(Number(v))));
  const resetAudio = () => { project.gaps = {}; project.trims = {}; project.holds = {}; arrange(); changed(); };
  const hasAudioEdits = () => [project.gaps, project.trims, project.holds].some((x) => Object.keys(x).length > 0);
  /** Whole ayat only (rule 1): change the selection at either end; the look is kept. */
  const goRange = (a: number, b: number) => {
    // The draft follows to the new range (its edits and look are kept).
    project.from = a;
    project.to = b;
    void saveNow().finally(() => { location.hash = draftHash(project, draftKey); });
  };

  // --- panels ---
  const reciterButton = (r: Reciter, tag?: string) =>
    h('button', {
      class: `list-item${r.id === project.reciterId ? ' on' : ''}`,
      onclick: () => {
        if (exporting || r.id === project.reciterId) return;
        project.reciterId = r.id;
        setReelReciter(r.id);
        changed();
        void loadAudio();
      },
    }, h('span', {}, reciterPickerLabel(r), tag ? h('span', { class: 'pill' }, tag) : null,
      r.qdc === false ? h('span', { class: 'muted small block' }, ui('ed.reciter-ayah-only')) : null),
    r.id === project.reciterId ? icon('check', 18) : null);
  /** mp3quran reciters whose recording is not verified for this reel's ayat (filled when the picker opens). */
  const unchecked = new Set<number>();
  let rangesChecked = false;
  const offered = (r: Reciter) => covers(r, n) && !unchecked.has(r.id);
  const checkRanges = () => {
    if (rangesChecked) return;
    rangesChecked = true;
    for (const r of RECITERS) if (r.mp3quran && covers(r, n)) {
      void mp3quranRange(r, n, from, to).then((ok) => {
        if (ok || unchecked.has(r.id)) return;
        unchecked.add(r.id);
        if (option?.id === 'reciter') refreshUI();
      }, () => {});
    }
  };
  let popular: { id: number; trending: boolean }[] = [];
  void popularReciters().then((p) => { popular = p; if (option?.id === 'reciter') refreshUI(); }, () => {});
  /** Filters the list below it by name (there are ~40 reciters). */
  const reciterSearch = () => {
    const input = h('input', { class: 'search', type: 'search', placeholder: ui('ed.reciter-search'), 'aria-label': ui('ed.reciter-search') });
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const list = input.nextElementSibling;
      list?.querySelectorAll<HTMLElement>('button').forEach((b) => { b.hidden = !!q && !(b.textContent ?? '').toLowerCase().includes(q); });
    });
    return input;
  };
  const reciterPanel = () => {
    checkRanges();
    const top = popular.map((p) => ({ r: RECITERS.find((x) => x.id === p.id && offered(x)), trending: p.trending })).filter((x) => x.r).slice(0, 3);
    return [
      top.length ? h('p', { class: 'muted small' }, ui('ed.popular')) : null,
      top.length ? h('div', { class: 'list' }, ...top.map((x) => reciterButton(x.r!, x.trending ? ui('ed.trending') : undefined))) : null,
      top.length ? h('p', { class: 'muted small' }, ui('ed.all-reciters')) : null,
      reciterSearch(),
      h('div', { class: 'list reciter-list' }, ...RECITERS.filter(offered).map((r) => reciterButton(r))),
    ].filter(Boolean) as Node[];
  };

  /** One-tap styles: a finished look (background, mood, text mode, highlight, finishing touches). */
  // My styles: the user's own looks, saved on this device and reapplied in one tap.
  type MyStyle = { id: string; name: string; look: Look };
  const myStyles = (): MyStyle[] => { try { const v = JSON.parse(readPref('myStyles') ?? '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && x.look) : []; } catch { return []; } };
  const saveMyStyles = (list: MyStyle[]) => savePref('myStyles', JSON.stringify(list.slice(0, 8)));
  function myStylesRow(): Node {
    const list = myStyles();
    const mine = JSON.stringify(lookOf(project));
    return h('div', { class: 'tiles my-styles' },
      ...list.map((st) => {
        const b = backgroundById(st.look.scenes?.[0] ?? '');
        const bgCss = 'thumb' in b ? `background-image:url(${b.thumb})` : b.kind === 'color' ? `background:${b.color}` : '';
        return h('div', { class: 'my-style' },
          tile({
            on: JSON.stringify(st.look) === mine, label: st.name,
            art: h('span', { class: 'style-art', style: bgCss }, h('span', { class: `style-words${st.look.highlight ? ' lit' : ''}`, style: `--hl:${st.look.colors?.hl ?? '#f2c46b'}` }, h('i', {}), h('i', {}), h('i', {}))),
            onclick: () => {
              applyLook(project, structuredClone(st.look), isBackground);
              fitClips();
              arrange();
              void loadScenes();
              changed();
              previewText();
            },
          }),
          h('button', { class: 'mark-logo-x', 'aria-label': ui('ed.my-style-delete'), onclick: () => { saveMyStyles(myStyles().filter((x) => x.id !== st.id)); refreshUI(); } }, '✕'));
      }),
      list.length < 8 ? tile({
        on: false, label: ui('ed.my-style-save'), art: h('span', { class: 'glyph' }, '+'),
        onclick: () => {
          const all = myStyles();
          saveMyStyles([...all, { id: `s${Date.now().toString(36)}`, name: ui('ed.my-style-name', { n: all.length + 1 }), look: lookOf(project) }]);
          toast(ui('ed.my-style-saved'));
          refreshUI();
        },
      }) : h('span', {}));
  }
  const stylePanel = () => [
    row(ui('ed.my-styles'), h('span', {})),
    myStylesRow(),
    row(ui('ed.styles'), h('span', {})),
    h('div', { class: 'tiles' }, ...STYLES.map((st) => {
      const b = backgroundById(st.scene);
      const bgCss = 'thumb' in b ? `background-image:url(${b.thumb})` : b.kind === 'color' ? `background:${b.color}` : '';
      return tile({
        on: currentStyle(project) === st.id, label: tOr(`style.${st.id}`, st.label),
        art: h('span', { class: `style-art${st.grain ? ' grain' : ''}${st.vignette ? ' vignette' : ''}`, style: bgCss },
          h('span', { class: `style-words${st.highlight ? ' lit' : ''}`, style: `--hl:${st.hl}` }, h('i', {}), h('i', {}), h('i', {}))),
        onclick: () => {
          applyStyle(project, st);
          fitClips();
          arrange();
          void loadScenes();
          changed();
          previewText();
        },
      });
    })),
    note(ui('ed.styles-note')),
  ];

  // --- Quick reel: footage by preference → the recommended style first → text → layout → finish ---
  type QuickStep = 'footage' | 'style' | 'motion' | 'layout' | 'finish';
  /** Choices made in the Quick reel's Text and Layout steps: kept when a vibe or style is tapped. */
  type QuickOwn = 'text' | 'hl' | 'tr' | 'layout' | 'motion';
  const OWN_KEYS: Record<QuickOwn, readonly (keyof Project)[]> = {
    text: ['textMode', 'wordsPerStep'], hl: ['highlight'], tr: ['showTranslation', 'translationMode'],
    layout: ['titlePos', 'titleSize', 'surahName'], motion: ['textEffect'],
  };
  const MAX_QUICK_CLIPS = 4;
  const readPref = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const savePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
  const quick = {
    step: 'footage' as QuickStep,
    pref: readPref('quickFootage'),
    hits: [] as StockHit[],
    searching: false,
    error: '',
    loading: null as string | null, // a clip being downloaded
    pct: 0,
    clips: [] as string[], // the clips picked here, in tap order (kept when a style is applied)
    split: (readPref('quickSplit') === 'even' ? 'even' : 'ayah') as 'ayah' | 'even', // how several clips change
    styled: false, // a vibe or style was applied in the Quick reel
    auto: false, // ...by the recommendation (not by a tap)
    picked: null as string | null, // 'vibe:id' / 'style:id' last applied here
    tries: [] as string[], // project snapshots before each "Try another" (Previous goes back)
    // Text and layout choices made here (per device, so the next reel keeps them too)
    own: new Set(((readPref('quickOwn') ?? '').split(',')).filter((x): x is QuickOwn => x in OWN_KEYS)),
  };
  /** The user set this in the Quick reel: a later vibe or style leaves it as it is. */
  const own = (k: QuickOwn) => { quick.own.add(k); savePref('quickOwn', [...quick.own].join(',')); };
  /** The picked clips become the scenes: one plays throughout, several change per ayah or evenly. */
  const applyClips = () => {
    if (!quick.clips.length) return;
    project.scenes = [...quick.clips];
    project.clips = [];
    project.sceneLengths = [];
    project.sceneMode = quick.clips.length > 1 ? quick.split : 'single';
    fitClips();
  };
  /** Applies a vibe or style, keeping the footage picked here and the user's own text/layout choices. */
  const keepOwn = (fn: () => void) => {
    const was = structuredClone(project);
    fn();
    for (const k of quick.own) for (const f of OWN_KEYS[k]) (project as unknown as Record<string, unknown>)[f] = was[f];
    if (quick.own.has('hl')) project.colors.hl = was.colors.hl;
    applyClips();
  };
  /** The vibe for this moment: the footage picked in this reel, else the local hour. */
  const quickRecommendation = () => recommendVibe(quick.clips.length ? quick.pref : null, new Date().getHours());
  /** Words recited per second (from the word timings), null without them. */
  function recitedPace(): number | null {
    const A = (base?.plan ?? plan)?.ayat.filter((a) => a.seq?.length) ?? [];
    const words = A.reduce((n, a) => n + a.seq!.length, 0);
    const secs = A.reduce((n, a) => n + Math.max(0, a.last - a.start), 0);
    return words && secs > 0.5 ? words / secs : null;
  }
  const quickRefresh = () => { if (option?.id === 'quick') refreshUI(); };
  async function quickSearch(pref: string) {
    quick.pref = pref;
    savePref('quickFootage', pref);
    const f = FOOTAGE.find((x) => x.id === pref);
    if (!f || !stockEnabled()) return quickRefresh();
    quick.searching = true;
    quick.error = '';
    quick.hits = [];
    quickRefresh();
    try {
      const src = await stockSources();
      const r = await searchStock({ source: src.pixabay ? 'pixabay' : 'pexels', type: 'video', q: f.q, page: 1 });
      if (quick.pref === pref) quick.hits = r.hits.filter((x) => (x.duration ?? 0) >= 5).slice(0, 6);
    } catch (e) {
      quick.error = e instanceof Error ? e.message : String(e);
    }
    quick.searching = false;
    quickRefresh();
  }
  async function quickPick(hit: StockHit) {
    if (exporting || quick.loading) return;
    const at = quick.clips.indexOf(stockId(hit));
    if (at >= 0) { // tapped again: taken out (the last one stays, so there is always footage)
      if (quick.clips.length > 1) { quick.clips.splice(at, 1); applyClips(); scenesChanged(); changed(); }
      return quickRefresh();
    }
    if (quick.clips.length >= MAX_QUICK_CLIPS) return toast(ui('qr.max-clips', { n: MAX_QUICK_CLIPS }));
    quick.loading = stockId(hit);
    quick.pct = 0;
    quickRefresh();
    try {
      const id = await downloadHit(hit, (f) => { const p = Math.round(f * 100); if (p !== quick.pct) { quick.pct = p; quickRefresh(); } });
      if (!alive) return;
      if (!quick.clips.includes(id)) quick.clips.push(id);
      applyClips();
      scenesChanged();
      changed();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    quick.loading = null;
    quickRefresh();
  }
  /** "Try another": a different calm look (vibe + motion), footage and the user's own choices kept.
   *  Chosen from the looks only, never from what the ayah means. */
  function tryAnother(pickStyle: (id: string, fn: () => void) => void) {
    quick.tries.push(JSON.stringify(project));
    if (quick.tries.length > 20) quick.tries.shift();
    const cur = quick.picked?.startsWith('vibe:') ? quick.picked.slice(5) : currentVibe(project);
    const pool = VIBES.filter((v) => v.id !== cur);
    const v = pool[Math.floor(Math.random() * pool.length)];
    const fx = QUICK_MOTIONS[Math.floor(Math.random() * QUICK_MOTIONS.length)];
    pickStyle(`vibe:${v.id}`, () => { applyVibe(project, v, undefined, pacedMode(recitedPace())); project.textEffect = fx; });
  }
  const quickPanel = (): Node[] => {
    const steps: [QuickStep, string][] = [['footage', ui('qr.footage')], ['style', ui('qr.style')], ['motion', ui('qr.motion')], ['layout', ui('qr.layout')], ['finish', ui('qr.finish')]];
    const at = steps.findIndex(([v]) => v === quick.step);
    const go = (v: QuickStep) => {
      // The recommended vibe is applied the first time the Style step opens (any tap changes it).
      // It follows the footage until the user picks a vibe or style themselves.
      if (v === 'style' && (!quick.styled || quick.auto)) {
        quick.styled = true;
        quick.auto = true;
        const v = quickRecommendation().vibe;
        quick.picked = `vibe:${v.id}`;
        keepOwn(() => applyVibe(project, v, undefined, pacedMode(recitedPace())));
        fitClips(); arrange(); void loadScenes(); changed();
      }
      quick.step = v; quickRefresh(); panel.scrollTop = 0; panelBody.scrollTop = 0;
    };
    const nav = h('div', { class: 'quick-nav' },
      at > 0 ? h('button', { class: 'chip', onclick: () => go(steps[at - 1][0]) }, ui('common.back')) : h('span', {}),
      at < steps.length - 1 ? h('button', { class: 'chip on', onclick: () => go(steps[at + 1][0]) }, ui('qr.next')) : null);
    const head = h('div', { class: 'tabs quick-steps' }, ...steps.map(([v, l], i) =>
      h('button', { class: `tab${v === quick.step ? ' on' : ''}`, onclick: () => go(v) }, `${i + 1} ${l}`)));
    let body: (Node | null)[] = [];
    if (quick.step === 'footage') {
      const owned = new Set(libraryBackgrounds().map((b) => b.id));
      body = [
        note(ui('qr.footage-note')),
        h('div', { class: 'chips' }, ...FOOTAGE.map((f) => h('button', {
          class: `chip${quick.pref === f.id ? ' on' : ''}`, disabled: !!quick.loading,
          onclick: () => void quickSearch(f.id),
        }, tOr(`qr.f.${f.id}`, f.label)))),
        !stockEnabled() ? note(ui('qr.no-library')) : null,
        quick.error ? note(quick.error) : null,
        quick.searching ? note(ui('qr.searching')) : null,
        quick.hits.length ? h('div', { class: 'bg-grid' }, ...quick.hits.map((x) => {
          const id = stockId(x);
          const busy = quick.loading === id;
          const n = quick.clips.indexOf(id) + 1;
          return h('div', { class: `bg-cell${busy ? ' loading' : ''}` },
            h('button', {
              class: `bg-thumb${n ? ' on' : ''}`, style: `background-image:url("${x.thumb}")`,
              title: `${x.tags} · ${x.user}`, 'aria-pressed': n ? 'true' : 'false', onclick: () => void quickPick(x),
            }, h('span', {}, `▶ ${Math.round(x.duration ?? 0)} s`), n ? h('b', { class: 'bg-num' }, String(n)) : null),
            busy ? h('div', { class: 'bg-progress', role: 'progressbar', 'aria-valuenow': String(quick.pct) },
              h('span', { class: 'spinner' }), h('b', {}, `${quick.pct}%`), h('i', { style: `width:${quick.pct}%` })) : null,
            !busy && owned.has(id) ? h('div', { class: 'bg-tags' }, h('span', { class: 'bg-badge' }, ui('qr.saved'))) : null);
        })) : null,
        quick.clips.length > 1 ? row(ui('qr.clips-change'), chips<'ayah' | 'even'>([{ value: 'ayah', label: ui('qr.split-ayah') }, { value: 'even', label: ui('qr.split-even') }],
          () => quick.split, (v) => { quick.split = v; savePref('quickSplit', v); applyClips(); scenesChanged(); changed(); })) : null,
        quick.clips.length > 1 ? note(ui(quick.split === 'ayah' ? 'qr.split-note-ayah' : 'qr.split-note-even')) : null,
        quick.clips.length ? slowmoRow() : null,
        quick.clips.length ? note(ui('ed.slowmo-note')) : null,
        quick.hits.length ? note(ui('qr.footage-credit')) : null,
      ];
    } else if (quick.step === 'style') {
      const keep = quick.clips.length > 0;
      const rec = quickRecommendation();
      // What was applied here, unless the look was changed elsewhere since (then what it still matches)
      const now = quick.picked?.startsWith('vibe:') ? quick.picked.slice(5) : quick.picked ? null : currentVibe(project);
      const nowStyle = quick.picked?.startsWith('style:') ? quick.picked.slice(6) : null;
      const pickStyle = (id: string, fn: () => void) => { quick.styled = true; quick.auto = false; quick.picked = id; keepOwn(fn); fitClips(); arrange(); void loadScenes(); changed(); previewText(); };
      // With footage picked, each tile previews it in that vibe's colour grade.
      const own0 = keep ? (backgroundById(quick.clips[0]) as { thumb?: string }).thumb : undefined;
      const gradeOf = (v: Vibe) => v.grade ?? MOODS.find((m) => m.id === v.mood)?.set.grade ?? 'none';
      const vibeTile = (v: Vibe, recommended: boolean) => tile({
        on: now === v.id, label: recommended ? `${tOr(`vibe.${v.id}`, v.label)} · ${ui('qr.recommended')}` : tOr(`vibe.${v.id}`, v.label),
        art: h('span', { class: `style-art${v.grain ? ' grain' : ''}${v.vignette ? ' vignette' : ''}${recommended ? ' rec' : ''}${own0 ? ` tint-${gradeOf(v)}` : ''}`, style: `background-image:url(${own0 ?? (backgroundById(v.scene) as { thumb?: string }).thumb ?? ''})` },
          h('span', { class: `style-words${v.highlight ? ' lit' : ''}`, style: `--hl:${v.hl}` }, h('i', {}), h('i', {}), h('i', {}))),
        onclick: () => pickStyle(`vibe:${v.id}`, () => applyVibe(project, v, undefined, pacedMode(recitedPace()))),
      });
      body = [
        h('p', { class: 'quick-why' }, ui('qr.why', { when: ui(`qr.when-${rec.why}`, { footage: ui(`qr.f.${quick.pref ?? 'sky'}` as 'qr.f.sky').toLowerCase() }), feel: ui(`qr.feel-${rec.vibe.id}` as 'qr.feel-fajr') })),
        h('div', { class: 'chips quick-try' },
          h('button', { class: 'chip', onclick: () => tryAnother(pickStyle) }, icon('dice', 16), ui('qr.try')),
          quick.tries.length ? h('button', { class: 'chip', onclick: () => { const p = quick.tries.pop(); if (p) { const o = option; restore(p); option = o; quick.picked = null; changed(); } } }, icon('undo', 16), ui('qr.previous')) : null),
        h('div', { class: 'tiles' }, vibeTile(rec.vibe, true), ...VIBES.filter((v) => v !== rec.vibe).map((v) => vibeTile(v, false))),
        note(ui(keep ? 'qr.vibe-note-footage' : 'qr.vibe-note')),
        quick.own.size ? note(ui('qr.own-kept')) : null,
        h('p', { class: 'muted small' }, ui('qr.more-looks')),
        h('div', { class: 'tiles' }, ...STYLES.map((st) => tile({
          on: nowStyle ? nowStyle === st.id : !quick.picked && !now && currentStyle({ ...project, scenes: [keep ? st.scene : project.scenes[0]] }) === st.id, label: tOr(`style.${st.id}`, st.label),
          art: h('span', { class: `style-art${st.grain ? ' grain' : ''}${st.vignette ? ' vignette' : ''}`, style: `background-image:url(${(backgroundById(st.scene) as { thumb?: string }).thumb ?? ''})` },
            h('span', { class: `style-words${st.highlight ? ' lit' : ''}`, style: `--hl:${st.hl}` }, h('i', {}), h('i', {}), h('i', {}))),
          onclick: () => pickStyle(`style:${st.id}`, () => applyStyle(project, st)),
        }))),
      ];
    } else if (quick.step === 'motion') {
      const timed = wordTimed();
      const tr = project.showTranslation ? project.translationMode : 'off';
      body = [
        row(ui('qr.on-screen'), chips(MODES, mode, (v) => { own('text'); project.textMode = v; rebuild(); changed(); quickRefresh(); }, (v) => v === 'ayah' || timed)),
        mode() === 'words' ? row(ui('ed.per-step'), chips<'1' | '2' | '3'>([{ value: '1', label: ui('ed.1-word') }, { value: '2', label: ui('ed.2-words') }, { value: '3', label: ui('ed.3-words') }],
          () => String(project.wordsPerStep) as '1' | '2' | '3', (v) => { own('text'); project.wordsPerStep = Number(v) as 1 | 2 | 3; rebuild(); changed(); })) : null,
        timed ? null : note(ui('qr.modes-need-timings')),
        row(ui('ed.translation'), chips<'words' | 'ayah' | 'off'>([{ value: 'words', label: ui('ed.synced-to-the-words') }, { value: 'ayah', label: ui('ed.whole-ayah') }, { value: 'off', label: ui('ed.off') }],
          () => tr, (v) => {
            own('tr');
            project.showTranslation = v !== 'off';
            if (v !== 'off') project.translationMode = v;
            rebuild(); changed(); quickRefresh();
          })),
        h('p', { class: 'muted small' }, ui('qr.recited-word')),
        h('div', { class: 'colour-grid hl-grid' },
          h('button', {
            class: `swatch swatch-off${project.highlight ? '' : ' on'}`, 'aria-label': `${ui('qr.recited-word')}: ${ui('ed.off')}`,
            onclick: () => { own('hl'); project.highlight = false; changed(); quickRefresh(); },
          }, ui('ed.off')),
          ...HL_COLOURS.map((c) => h('button', {
            class: `swatch${project.highlight && project.colors.hl === c ? ' on' : ''}`, style: `background:${c}`, disabled: !timed,
            'aria-label': `${ui('qr.recited-word')}: ${c}`,
            onclick: () => { if (exporting || !timed) return; own('hl'); project.colors.hl = c; project.highlight = true; changed(); quickRefresh(); previewText(); },
          }))),
        timed ? null : note(ui('ed.highlight-needs-timings')),
        ...learnRow(),
        tajweedRow(),
        project.tajweed ? tajweedLegend() : null,
        h('p', { class: 'muted small' }, ui('qr.motion-label')),
        h('div', { class: 'tiles' }, ...QUICK_MOTIONS.map((fx) => tile({
          on: project.textEffect === fx, label: tOr(`fx.${fx}`, TEXT_EFFECTS.find((e) => e.value === fx)!.label),
          art: h('span', { class: `fx-sample fx-${fx}` }, 'آية'),
          onclick: () => { own('motion'); project.textEffect = fx; changed(false); quickRefresh(); previewText(); },
        }))),
        note(ui('qr.motion-note')),
        note(ui('qr.own-kept')),
      ];
    } else if (quick.step === 'layout') {
      body = [
        ...formatRow(),
        ...sizeSlider(),
        row(ui('qr.name-place'), chips<TitlePos>([{ value: 'top', label: ui('ed.top') }, { value: 'below', label: ui('ed.below-the-ayah') }, { value: 'bottom', label: ui('ed.bottom') }],
          () => project.titlePos, (v) => { own('layout'); project.titlePos = v; rebuild(); changed(); })),
        row(ui('qr.ar-name'), chips<'show' | 'hide'>([{ value: 'show', label: ui('ed.show') }, { value: 'hide', label: ui('ed.hide') }],
          () => (project.surahName ? 'show' : 'hide'), (v) => { own('layout'); project.surahName = v === 'show'; rebuild(); changed(); })),
        row(ui('ed.size'), chips<TitleSize>([{ value: 's', label: ui('ed.small') }, { value: 'm', label: ui('ed.medium') }, { value: 'l', label: ui('ed.large') }],
          () => project.titleSize, (v) => { own('layout'); project.titleSize = v; rebuild(); changed(); })),
        note(ui('qr.ref-stays')),
      ];
    } else {
      body = [
        row(ui('ed.cinema'), chips<'on' | 'off'>([{ value: 'on', label: ui('qr.on') }, { value: 'off', label: ui('ed.off') }],
          () => (project.cinema ? 'on' : 'off'), (v) => setCinema(v === 'on'))),
        note(ui('ed.cinema-note')),
        row(ui('ed.tight-start'), chips<'on' | 'off'>([{ value: 'on', label: ui('qr.on') }, { value: 'off', label: ui('ed.off') }],
          () => (project.tightStart ? 'on' : 'off'), (v) => { setTightStart(v === 'on'); arrange(); })),
        note(ui('ed.tight-note')),
        row(ui('qr.mark'), chips<'off' | 'on'>([{ value: 'off', label: ui('ed.off') }, { value: 'on', label: ui('qr.mark-small') }],
          () => (project.watermark ? 'on' : 'off'), (v) => { project.watermark = v === 'on'; rebuild(); })),
        h('button', { class: 'chip', onclick: () => openWatermark() }, project.mark?.kind && project.mark.kind !== 'off' ? ui('mk.edit-own') : ui('mk.add-own')),
        note(ui('qr.mark-note')),
        ...dedicationField(),
        ...seriesField(),
        h('button', { class: 'primary brand-btn quick-export', disabled: exportBtn.disabled, onclick: () => exportTapped() }, ui('ed.export')),
        note(ui('qr.finish-note')),
      ];
    }
    return [head, ...body.filter((x): x is Node => !!x), nav];
  };

  /** Layout → Watermark: Ayah Studio mark, the user's own text or logo, or none at all. */
  let markRaf = 0;
  function watermarkPanel(): Node[] {
    return markPanel({
      project,
      busy: () => !!exporting,
      duration: () => tl?.duration ?? 0,
      changed: (live) => {
        void loadLogo(project.mark?.logo).then(() => (dirty = true));
        cancelAnimationFrame(markRaf);
        markRaf = requestAnimationFrame(() => rebuild()); // the mark's strip moves the text area
        changed(!live);
      },
    });
  }
  function openWatermark() {
    tool = TOOLS.find((x) => x.id === 'layout')!;
    selection = null;
    layerSel = null;
    option = tool.options.find((o) => o.id === 'watermark')!;
    refreshUI();
  }

  /** A dedication in the user's own words on the closing card (which it turns on). */
  function dedicationField(): Node[] {
    const input = h('input', { class: 'search', type: 'text', maxlength: String(DEDICATION_MAX), placeholder: ui('ed.dedication-ph'), value: project.dedication ?? '', 'aria-label': ui('ed.dedication') });
    input.addEventListener('change', () => {
      if (exporting) return;
      const v = cleanDedication(input.value);
      input.value = v;
      if ((project.dedication ?? '') === v) return;
      project.dedication = v || undefined;
      if (v && !project.outro) { project.outro = true; arrange(); }
      changed(false);
      if (v && tl) { pause(); t = Math.max(0, tl.duration - 2); dirty = true; } // show it on the closing card
    });
    return [row(ui('ed.dedication'), h('span', {})), input, note(ui('ed.dedication-note'))];
  }

  /** Series mode: the passage from this reel's first ayah to a later one, split into reels of about the
   *  same length (never inside an ayah), saved as drafts "Part 1 of N"… with this reel's look. */
  const series = { until: 0, target: 60 }; // kept while the panel redraws
  function seriesField(): Node[] {
    const max = Math.min(s.ayahs, from + 199);
    series.until ||= Math.min(max, Math.max(to, from + 19));
    const until = h('input', { class: 'search series-until', type: 'number', min: String(from), max: String(max), value: String(series.until), 'aria-label': ui('ed.series-until') });
    let parts: [number, number][] = [];
    const info = h('p', { class: 'muted small' }, '…');
    const make = h('button', { class: 'chip', disabled: true, onclick: () => void makeSeries() }, ui('ed.series-make', { n: 0 }));
    const targetChips = h('div', { class: 'chips' });
    let seq = 0;
    async function plan() {
      const b = Math.max(from, Math.min(max, Math.round(Number(until.value)) || from));
      series.until = b;
      const my = ++seq;
      const r = reciterById(project.reciterId);
      const timings = await (r.mp3quran ? mp3quranSurah(r, n) : r.qdc === false ? Promise.reject() : qdcSurah(r.id, n)).then((x) => x.timings, () => null);
      if (my !== seq || !alive) return;
      const lengths: number[] = [];
      for (let a = from; a <= b; a++) {
        const v = timings?.get(`${n}:${a}`);
        lengths.push(ayahLength(v ? recitedSpan(v) : null, displayWords(allAr[a - 1]).length) + project.pause);
      }
      const card = (project.intro ? 3 : 0) + 3; // each part ends on the closing card
      parts = planSeries(from, lengths, Math.max(10, series.target - card), MAX_AYAT);
      const big = parts.length > 30;
      info.textContent = big ? ui('ed.series-too-many') : ui('ed.series-info', { n: parts.length, list: parts.slice(0, 4).map(([x, y]) => (x === y ? `${x}` : `${x}–${y}`)).join(', ') + (parts.length > 4 ? ', …' : '') });
      make.textContent = ui('ed.series-make', { n: parts.length });
      make.disabled = big || parts.length < 2;
    }
    const drawTargets = () => targetChips.replaceChildren(...['30', '60', '90'].map((v) => h('button', {
      class: `chip${String(series.target) === v ? ' on' : ''}`,
      onclick: () => { series.target = Number(v); drawTargets(); void plan(); },
    }, `~${v} s`)));
    drawTargets();
    until.addEventListener('change', () => void plan());
    void plan();
    async function makeSeries() {
      if (exporting || parts.length < 2) return;
      make.disabled = true;
      const thumb = await previewThumb().catch(() => undefined);
      const now = Date.now();
      const of = parts.length;
      try {
        for (let k = 0; k < of; k++) {
          const p = structuredClone(project);
          [p.from, p.to] = parts[k];
          p.series = { part: k + 1, of };
          p.outro = true;
          p.trims = {};
          p.gaps = {};
          p.holds = {};
          if (k === 0) Object.assign(project, structuredClone(p)); // this reel becomes part 1 (saved on leaving too)
          // Earlier parts first in the drafts list (newest first).
          await saveDraft({ id: k === 0 ? draftKey : newDraftId(), project: p, created: now, updated: now - k, thumb });
        }
      } catch (e) {
        console.warn('Series not saved', e);
        toast(ui('ed.series-failed'));
        make.disabled = false;
        return;
      }
      toast(ui('ed.series-made', { n: of }));
      location.hash = '#/drafts';
    }
    return [row(ui('ed.series'), h('span', {})), note(ui('ed.series-note')), row(ui('ed.series-until'), until), row(ui('ed.series-length'), targetChips), info, make];
  }

  const HL_COLOURS = ['#f2c46b', '#e8c77a', '#f2c98a', '#f8e7b9', '#ffffff', '#a9d6bd', '#7fbf9d', '#a7bde0', '#e9c3c9', '#c7a6d6', '#d9a0ab', '#c9a24a'];
  const highlightPanel = () => [
    chips<'on' | 'off'>([{ value: 'on', label: ui('ed.highlight-on') }, { value: 'off', label: ui('ed.off') }],
      () => (project.highlight ? 'on' : 'off'), (v) => { project.highlight = v === 'on'; if (project.highlight) previewText(); }, (v) => v === 'off' || wordTimed()),
    h('div', { class: 'colour-grid' }, ...HL_COLOURS.map((c) =>
      h('button', {
        class: `swatch${project.colors.hl === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': `${ui('ed.highlight')}: ${c}`,
        onclick: () => { if (!exporting) { project.colors.hl = c; project.highlight = true; changed(); previewText(); } },
      }))),
    note(wordTimed() ? ui('ed.highlight-note') : ui('ed.highlight-needs-timings')),
  ];

  const moodPanel = () => [
    h('div', { class: 'tiles' }, ...MOODS.map((m) => tile({
      on: currentMood(project) === m.id, label: tOr(`mood.${m.id}`, m.label),
      art: h('span', { class: `mood-art grade-${m.set.grade}` }, dot(m.set.colors.ar), dot(m.set.colors.en), dot(m.set.colors.title)),
      onclick: () => { applyMood(project, m); arrange(); changed(); previewText(); },
    }))),
    note(ui('ed.a-mood-sets-the-text-effect-transition-c')),
  ];

  const effectPanel = () => {
    const wrap = h('div', {});
    let group = Math.max(0, EFFECT_GROUPS.findIndex((g) => g.items.includes(project.textEffect)));
    const draw = () => wrap.replaceChildren(
      h('div', { class: 'tabs' }, ...EFFECT_GROUPS.map((g, i) =>
        h('button', { class: `tab${i === group ? ' on' : ''}`, onclick: () => { group = i; draw(); } }, g.label))),
      h('div', { class: 'tiles' }, ...EFFECT_GROUPS[group].items.map((fx) => tile({
        on: project.textEffect === fx, label: tOr(`fx.${fx}`, TEXT_EFFECTS.find((e) => e.value === fx)!.label),
        art: h('span', { class: `fx-sample fx-${fx}` }, 'آية'),
        onclick: () => { project.textEffect = fx; changed(false); draw(); previewText(); },
      }))));
    draw();
    return [wrap, note(ui('ed.calm-effects-only-ink-reveal-and-light-s'))];
  };

  const transitionPanel = () => [
    (tl?.scenes.length ?? 1) < 2 ? note(ui('ed.transitions-play-between-scenes-add-a-se')) : null,
    h('div', { class: 'tiles' }, ...TRANSITIONS.map((tr) => tile({
      on: project.transition === tr.value, label: tOr(`tr.${tr.value}`, tr.label), art: h('span', { class: 'glyph' }, TRANSITION_ICONS[tr.value]),
      onclick: () => { project.transition = tr.value; changed(); previewTransition(); },
    }))),
  ].filter(Boolean) as Node[];

  /** Colour grid (no hue/saturation picker) + eyedropper to take a colour from the video. */
  const colourPanel = (key: keyof TextColors, label: string) => () => [
    h('div', { class: 'colour-grid' },
      h('button', {
        class: `swatch eyedropper${picking === key ? ' on' : ''}`, 'aria-label': `${label}: ${ui('ed.pickFromVideo')}`, title: ui('ed.pickFromVideo'),
        onclick: () => { picking = picking === key ? null : key; refreshUI(); if (picking) toast(ui('ed.tapVideo')); },
      }, icon('eyedropper', 20)),
      ...COLOURS.map((c) => h('button', {
        class: `swatch${project.colors[key] === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': `${label}: ${c}`,
        onclick: () => { if (!exporting) { project.colors[key] = c; picking = null; changed(); } },
      }))),
    note(ui('ed.a-soft-shadow-keeps-the-text-readable-on')),
  ];

  const sceneLayoutPanel = () => {
    const k = project.scenes.length, na = to - from + 1;
    return [
      chips<SceneMode>([{ value: 'single', label: ui('ed.single') }, { value: 'ayah', label: ui('ed.per-ayah') }, { value: 'even', label: ui('ed.even-split') }, { value: 'custom', label: ui('ed.custom') }],
        () => project.sceneMode, (v) => {
          if (v !== 'single' && project.scenes.length < 2) {
            const i = BACKGROUNDS.findIndex((b) => b.id === project.scenes[0]);
            project.scenes.push(BACKGROUNDS[(i + 1) % BACKGROUNDS.length].id);
            fitClips();
          }
          if (v === 'custom' && project.sceneLengths.length !== project.scenes.length) project.sceneLengths = project.scenes.map(() => 1);
          project.sceneMode = v;
          scenesChanged();
        }),
      note(project.sceneMode === 'ayah'
        ? (na < 2 ? ui('ed.sc.oneAyah') : ui(k < na ? 'ed.sc.perAyahRepeat' : 'ed.sc.perAyah'))
        : project.sceneMode === 'even' ? ui('ed.sc.even')
          : project.sceneMode === 'custom' ? ui('ed.sc.custom')
            : ui('ed.sc.single')),
    ];
  };

  // --- tools (bottom bar) ---
  // Five tools, CapCut-style: what is touched most comes first in each.
  const TOOLS: Tool[] = [
    { id: 'styles', icon: 'sparkle', label: ui('ed.styles'), options: [
      { id: 'quick', icon: 'sparkle', label: ui('qr.title'), panel: quickPanel },
      { id: 'styles', icon: 'mood', label: ui('ed.styles'), panel: stylePanel },
      { id: 'mood', icon: 'mood', label: ui('ed.mood'), panel: moodPanel },
      { id: 'text-effect', icon: 'effects', label: ui('ed.text-effect'), panel: effectPanel },
      { id: 'transition', icon: 'transition', label: ui('ed.transition'), panel: transitionPanel },
      { id: 'colours', icon: 'colours', label: ui('ed.colours'), panel: () => {
        const parts: [keyof TextColors, string, string][] = [['ar', ui('ed.ayah'), 'Ayah'], ['en', ui('ed.translation'), 'Translation'], ['title', ui('ed.surah-name'), 'Surah name']];
        const cur = parts.find((x) => x[0] === colourKey)!;
        return [
          h('div', { class: 'tabs' }, ...parts.map(([k, label]) => h('button', { class: `tab${k === colourKey ? ' on' : ''}`, onclick: () => { colourKey = k; picking = null; refreshUI(); } },
            h('span', { class: 'dot', style: `background:${project.colors[k]};margin-inline-end:6px;vertical-align:-3px` }), label))),
          ...colourPanel(cur[0], cur[2])(),
        ];
      } },
    ] },
    { id: 'text', icon: 'text', label: ui('ed.text'), options: [
      { id: 'mode', icon: 'mode', label: ui('ed.text-mode'), panel: () => [
        chips(MODES, mode, (v) => { project.textMode = v; rebuild(); }, (v) => v === 'ayah' || wordTimed()),
        mode() === 'words' ? row(ui('ed.per-step'), chips<'1' | '2' | '3'>([{ value: '1', label: ui('ed.1-word') }, { value: '2', label: ui('ed.2-words') }, { value: '3', label: ui('ed.3-words') }],
          () => String(project.wordsPerStep) as '1' | '2' | '3', (v) => { project.wordsPerStep = Number(v) as 1 | 2 | 3; rebuild(); })) : null,
        note(syncText),
      ].filter(Boolean) as Node[] },
      { id: 'highlight', icon: 'highlight', label: ui('ed.highlight'), panel: highlightPanel },
      { id: 'learn', icon: 'mode', label: ui('ed.learn'), panel: learnRow },
      { id: 'tajweed', icon: 'colours', label: ui('ed.tajweed'), panel: () => [tajweedRow(), tajweedLegend(), note(ui('ed.tajweed-note'))] },
      { id: 'size', icon: 'size', label: ui('ed.size'), panel: sizeSlider },
      { id: 'position', icon: 'position', label: ui('ed.position'), panel: () => [chips<TextPos>([{ value: 'upper', label: ui('ed.higher') }, { value: 'center', label: ui('ed.centre') }, { value: 'lower', label: ui('ed.lower') }],
        () => project.textPos, (v) => { project.textPos = v; })] },
      { id: 'gap', icon: 'hold', label: ui('ed.between-ayat'), panel: () => [
        chips<GapText>([{ value: 'hold', label: ui('ed.keep-the-ayah') }, { value: 'clear', label: ui('ed.clear') }], () => project.gap, (v) => { project.gap = v; arrange(); }),
        note(ui('ed.what-the-text-does-in-the-pause-between-'))] },
      { id: 'mv-text', icon: 'move', label: ui('mv.tool'), action: () => selectLayer('text') },
      { id: 'tr-show', icon: 'translation', label: ui('ed.translation'), toggle: { get: () => project.showTranslation, set: (v) => { project.showTranslation = v; rebuild(); } } },
      { id: 'tr-sync', icon: 'sync', label: ui('ed.sync'), disabled: () => !project.showTranslation, panel: () => [
        chips<TranslationMode>([{ value: 'words', label: ui('ed.synced-to-the-words') }, { value: 'ayah', label: ui('ed.whole-ayah') }],
          () => project.translationMode, (v) => { project.translationMode = v; rebuild(); }),
        note(`Synced: word-by-word meanings (Quran.com, English) of the Arabic on screen. Whole ayah: ${translationInfo(project.translation).translator}.`)] },
      { id: 'tr-which', icon: 'translation', label: ui('tr.which'), disabled: () => !project.showTranslation, panel: () => [
        translationList(() => project.translation ?? currentTranslation(), (id) => {
          project.translation = id;
          if (project.translationMode === 'words') project.translationMode = 'ayah'; // the user wants this translation on screen
          setTranslation(id); // the reader follows, and the next reel starts with it
          rebuild();
          changed();
        })] },
      { id: 'tr-font', icon: 'font', label: ui('ed.font'), disabled: () => !project.showTranslation, panel: () => [
        chips<EnFont>([{ value: 'serif', label: ui('ed.serif') }, { value: 'sans', label: ui('ed.sans') }, { value: 'round', label: ui('ed.round') }], () => project.enFont, (v) => { project.enFont = v; rebuild(); })] },
    ] },
    { id: 'audio', icon: 'audio', label: ui('ed.audio'), options: [
      { id: 'reciter', icon: 'mic', label: ui('ed.reciter'), panel: reciterPanel },
      { id: 'silences', icon: 'silence', label: ui('ed.remove-silences'), action: () => removeSilences() },
      { id: 'pause', icon: 'gap', label: ui('ed.pauses'), panel: () => [
        row(ui('ed.between-all-ayat'), chips<string>(PAUSES.map((x) => ({ value: String(x), label: x ? `+${x} s` : ui('ed.natural') })), () => String(project.pause), (v) => { project.pause = Number(v); arrange(); })),
        note(ui('ed.for-one-ayah-tap-its-audio-in-the-timeli'))] },
      { id: 'tail', icon: 'gap', label: ui('ed.tail'), panel: tailPanel },
      { id: 'tight', icon: 'silence', label: ui('ed.tight-bar'), toggle: { get: () => !!project.tightStart, set: (v) => { setTightStart(v); arrange(); } } },
      { id: 'reset', icon: 'reset', label: ui('ed.reset-audio'), disabled: () => !hasAudioEdits(), action: resetAudio },
    ] },
    { id: 'scenes', icon: 'scenes', label: ui('ed.scenes'), options: [
      { id: 'add', icon: 'plus', label: ui('ed.add'), panel: () => bgPicker(null) },
      { id: 'change', icon: 'replace', label: ui('ed.change'), panel: () => bgPicker(sceneAtPlayhead()) },
      { id: 'layout', icon: 'layout', label: ui('ed.arrange'), panel: sceneLayoutPanel },
      { id: 'mv-bg', icon: 'move', label: ui('mv.tool'), action: () => selectLayer('bg') },
      { id: 'grade', icon: 'grade', label: ui('ed.grade'), panel: () => [h('div', { class: 'tiles' }, ...(Object.keys(GRADES) as Grade[]).map((g) => tile({
        on: project.grade === g, label: tOr(`grade.${g}`, GRADES[g].label), art: h('span', { class: `mood-art grade-${g}` }), onclick: () => { project.grade = g; changed(); },
      })))] },
      { id: 'scrim', icon: 'darken', label: ui('ed.darken'), panel: () => [chips<Scrim>([{ value: 'light', label: ui('ed.light') }, { value: 'normal', label: ui('ed.normal') }, { value: 'strong', label: ui('ed.strong') }],
        () => project.scrim, (v) => { project.scrim = v; }), note(ui('ed.darkens-the-background-behind-the-text-s'))] },
      { id: 'snap', icon: 'magnet', label: ui('ed.snap'), toggle: { get: () => project.sceneSnap, set: (v) => { project.sceneSnap = v; } } },
      { id: 'slowmo', icon: 'hold', label: ui('ed.slowmo'), panel: () => [slowmoRow(), note(ui('ed.slowmo-note'))] },
      { id: 'cinema', icon: 'sparkle', label: ui('ed.cinema'), toggle: { get: () => !!project.cinema, set: (v) => setCinema(v) } },
      { id: 'grain', icon: 'grain', label: ui('ed.grain'), toggle: { get: () => project.grain, set: (v) => { project.grain = v; } } },
      { id: 'vignette', icon: 'vignette', label: ui('ed.vignette'), toggle: { get: () => project.vignette, set: (v) => { project.vignette = v; } } },
    ] },
    { id: 'layout', icon: 'layout', label: ui('ed.layout'), options: [
      { id: 'format', icon: 'full', label: ui('ed.format'), panel: formatRow },
      { id: 'title', icon: 'text', label: ui('ed.surah-name'), panel: () => [
        row(ui('ed.place'), chips<TitlePos>([{ value: 'top', label: ui('ed.top') }, { value: 'below', label: ui('ed.below-the-ayah') }, { value: 'bottom', label: ui('ed.bottom') }],
          () => project.titlePos, (v) => { project.titlePos = v; rebuild(); })),
        row(ui('ed.size'), chips<TitleSize>([{ value: 's', label: ui('ed.small') }, { value: 'm', label: ui('ed.medium') }, { value: 'l', label: ui('ed.large') }],
          () => project.titleSize, (v) => { project.titleSize = v; rebuild(); })),
        row(ui('ed.surah-name'), chips<'show' | 'hide'>([{ value: 'show', label: ui('ed.show') }, { value: 'hide', label: ui('ed.hide') }],
          () => (project.surahName ? 'show' : 'hide'), (v) => { project.surahName = v === 'show'; rebuild(); })),
        note(ui('ed.the-reference-e-g-al-fatiha-1-1-always-s'))] },
      { id: 'intro', icon: 'card', label: ui('ed.intro-card'), toggle: { get: () => project.intro, set: (v) => { project.intro = v; arrange(); } } },
      { id: 'outro', icon: 'card', label: ui('ed.end-card'), toggle: { get: () => project.outro, set: (v) => { project.outro = v; arrange(); } } },
      { id: 'credit', icon: 'mic', label: ui('ed.reciter-name'), toggle: { get: () => project.credit, set: (v) => { project.credit = v; rebuild(); } } },
      { id: 'watermark', icon: 'watermark', label: ui('ed.watermark'), panel: watermarkPanel },
      { id: 'dedication', icon: 'card', label: ui('ed.dedication'), panel: dedicationField },
    ] },
  ];

  // --- moved by touch: the selected layer's actions (keyframes) ---
  function selectLayer(l: Layer | null) {
    layerSel = l;
    selection = null;
    tool = null;
    option = null;
    if (l && !moveHinted) { moveHinted = true; toast(ui('mv.hint')); }
    refreshUI();
    dirty = true;
  }
  const keyTimes = (l: Layer) => (project.motion?.[l]?.anim ? project.motion[l]!.keys.map((k) => k.t) : []);
  function layerOptions(l: Layer): Opt[] {
    const tr = project.motion?.[l];
    const on = keyIndex(tr, t) >= 0;
    const ks = keyTimes(l);
    const seek = (x: number | undefined) => { if (x === undefined) return; pause(); t = x; spine.reveal(x); dirty = true; refreshUI(); };
    const setTrack = (next: typeof tr) => {
      const m = { ...project.motion, [l]: next };
      if (!next) delete m[l];
      project.motion = m.text || m.bg ? m : undefined;
      changed();
    };
    return [
      { id: 'key', icon: 'keyframe', label: ui(on ? 'mv.key-remove' : 'mv.key-add'), action: () => setTrack(on && tr ? removeKey(tr, t) : addKey(tr, t)) },
      { id: 'key-prev', icon: 'prev', label: ui('mv.key-prev'), disabled: () => !ks.some((x) => x < t - 0.05), action: () => seek([...ks].reverse().find((x) => x < t - 0.05)) },
      { id: 'key-next', icon: 'next', label: ui('mv.key-next'), disabled: () => !ks.some((x) => x > t + 0.05), action: () => seek(ks.find((x) => x > t + 0.05)) },
      { id: 'mv-reset', icon: 'reset', label: ui('ed.reset'), disabled: () => !tr, action: () => setTrack(undefined) },
    ];
  }
  let shownOnKey = false; // the keyframe button follows the playhead
  let moveHinted = false; // the how-to toast, once per visit

  // --- block actions (when a block is selected in the timeline) ---
  function selectionOptions(sel: NonNullable<Selection>): Opt[] {
    const i = sel.index;
    if (sel.kind === 'scene') {
      const count = tl?.scenes.length ?? 1;
      return [
        { id: 'split', icon: 'split', label: ui('ed.split'), action: () => splitScene(i) },
        { id: 'length', icon: 'gap', label: ui('ed.length'), disabled: () => count < 2, panel: () => sceneTune(i) },
        { id: 'replace', icon: 'replace', label: ui('ed.replace'), panel: () => bgPicker(i) },
        { id: 'video', icon: 'clip', label: ui('ed.video'), disabled: () => !media[tl?.scenes[i]?.entry ?? -1]?.video, panel: () => videoPanel(i) },
        { id: 'left', icon: 'left', label: ui('ed.move-left'), disabled: () => i === 0, action: () => moveScene(i, i - 1) },
        { id: 'right', icon: 'right', label: ui('ed.move-right'), disabled: () => i >= count - 1, action: () => moveScene(i, i + 1) },
        { id: 'transition', icon: 'transition', label: ui('ed.transition'), panel: transitionPanel },
        { id: 'delete', icon: 'trash', label: ui('ed.delete'), disabled: () => count < 2, action: () => removeScene(i) },
      ];
    }
    const out: Opt[] = [
      { id: 'tune', icon: 'gap', label: ui('ed.fine-tune'), disabled: () => !base, panel: () => audioTune(i) },
      { id: 'silence', icon: 'silence', label: ui('ed.trim-silence'), action: () => removeSilences(i) },
    ];
    out.push({ id: 'audio-reset', icon: 'reset', label: ui('ed.reset'), disabled: () => project.gaps[ayahNo(i)] === undefined && project.trims[ayahNo(i)] === undefined,
      action: () => { delete project.gaps[ayahNo(i)]; delete project.trims[ayahNo(i)]; arrange(); changed(); } });
    const last = i === (tl?.ayat.length ?? 1) - 1;
    if (i === 0 && from > 1 && to - from + 1 < MAX_AYAT) out.push({ id: 'add-prev', icon: 'plus', label: ui('ed.addAyah', { ref: `${n}:${from - 1}` }), action: () => goRange(from - 1, to) });
    if (last && to < s.ayahs && to - from + 1 < MAX_AYAT) out.push({ id: 'add-next', icon: 'plus', label: ui('ed.addAyah', { ref: `${n}:${to + 1}` }), action: () => goRange(from, to + 1) });
    if ((i === 0 || last) && to > from) out.push({ id: 'remove', icon: 'trash', label: ui('ed.removeAyah', { ref: `${n}:${ayahNo(i)}` }), action: () => (i === 0 ? goRange(from + 1, to) : goRange(from, to - 1)) });
    return out;
  }

  // --- bars and panels ---
  let tool: Tool | null = null; // its options are in the bottom bar
  let option: Opt | null = null; // its panel is open
  let selection: Selection = null;
  const panelTitle = h('h2', {});
  const panelBody = h('div', { class: 'sheet-body panel' });
  // While a panel covers the timeline, a thin scrubber above it still moves the playhead, so a change
  // can be checked at any moment of the reel without closing the panel.
  const panelScrub = h('input', { class: 'panel-scrub', type: 'range', min: '0', max: '1', step: '0.01', value: '0', 'aria-label': ui('ed.scrub') });
  panelScrub.addEventListener('input', () => {
    if (!tl || exporting) return;
    if (playing) pause();
    t = Math.min(tl.duration, Math.max(0, Number(panelScrub.value)));
    spine.reveal(t);
    dirty = true;
  });
  const panel = h('section', { class: 'sheet', hidden: true },
    panelScrub,
    h('div', { class: 'sheet-head' }, panelTitle,
      h('button', { class: 'icon-btn sheet-close', 'aria-label': ui('common.done'), onclick: () => { picking = null; openOption(null); } }, icon('check'))),
    panelBody);
  const bar = h('nav', { class: 'toolbar', 'aria-label': ui('ed.tools') });

  const iconOf = (o: Opt) => (typeof o.icon === 'function' ? o.icon() : icon(o.icon));
  function barButton(o: Opt, onclick: () => void) {
    const on = o.toggle ? o.toggle.get() : option?.id === o.id;
    return h('button', {
      class: `tool${on ? ' on' : ''}${o.toggle ? ' toggle-tool' : ''}`, disabled: o.disabled?.() ?? false, onclick,
      'aria-pressed': o.toggle ? String(on) : undefined,
    }, h('span', { class: 'tool-icon' }, iconOf(o)), h('span', {}, o.label));
  }
  function runOption(o: Opt) {
    if (exporting) return;
    if (o.toggle) {
      o.toggle.set(!o.toggle.get());
      changed();
    } else if (o.action) {
      o.action();
      refreshUI();
    } else openOption(o);
  }
  function openTool(x: Tool | null) {
    tool = x;
    if (x) savePref('lastTool', x.id); // a draft reopens on the tool used last
    selection = null;
    layerSel = null;
    option = null;
    // A tool with a single panel opens it straight away (Reciter, Mood).
    if (x && x.options.length === 1 && x.options[0].panel) option = x.options[0];
    refreshUI();
  }
  function openOption(o: Opt | null) {
    option = o;
    if (!o && tool && tool.options.length === 1) tool = null;
    refreshUI();
  }
  function select(sel: Selection) {
    selection = sel;
    layerSel = null;
    tool = null;
    option = null;
    refreshUI();
  }
  const back = (label: string, onclick: () => void) =>
    h('button', { class: 'tool back', 'aria-label': ui('common.back'), onclick }, h('span', { class: 'tool-icon' }, icon('back')), h('span', {}, label));
  function refreshUI() {
    // Bottom bar: a moved layer's or a selected block's actions, a tool's options, or the tools.
    if (layerSel) {
      shownOnKey = keyIndex(project.motion?.[layerSel], t) >= 0;
      bar.replaceChildren(back(ui(layerSel === 'text' ? 'mv.text' : 'mv.bg'), () => selectLayer(null)),
        ...layerOptions(layerSel).map((o) => barButton(o, () => runOption(o))));
    } else if (selection) {
      bar.replaceChildren(back(ui(selection.kind === 'scene' ? 'ed.scene' : 'ed.audio'), () => select(null)),
        ...selectionOptions(selection).map((o) => barButton(o, () => runOption(o))));
    } else if (tool) {
      bar.replaceChildren(back(tool.label, () => openTool(null)), ...tool.options.map((o) => barButton(o, () => runOption(o))));
    } else {
      bar.replaceChildren(...TOOLS.map((x) => h('button', { class: 'tool', onclick: () => openTool(x) },
        h('span', { class: 'tool-icon' }, icon(x.icon)), h('span', {}, x.label))));
    }
    // Panel: slides up over the timeline and bar (the preview keeps its size).
    const content = option?.panel?.();
    panel.hidden = !content;
    if (content && tl) { panelScrub.max = String(tl.duration); panelScrub.value = String(t); }
    studio.classList.toggle('panel-open', !!content);
    panelTitle.textContent = option ? (option.id.startsWith('c-') ? ui('ed.colourOf', { what: option.label }) : option.label) : '';
    // Keep the same nodes in place (a focused search box would lose the phone keyboard).
    const next = content ?? [];
    if (next.length !== panelBody.childNodes.length || next.some((x, i) => panelBody.childNodes[i] !== x)) panelBody.replaceChildren(...next);
    canvas.classList.toggle('picking', !!picking);
    spine.invalidate();
  }

  /** Show an effect: play from the start of the text on screen (or the first). */
  function previewText() {
    if (!tl || playing) return;
    const evs = tl.ayat.flatMap((a) => a.events.filter((e) => e.start < a.end));
    const ev = evs.find((e) => t >= e.start && t < e.end) ?? evs.find((e) => e.start >= t) ?? evs[0];
    if (!ev) return;
    t = Math.max(0, ev.start - 0.05);
    spine.reveal(t);
    void play();
  }
  /** Show a transition: play across the nearest scene change. */
  function previewTransition() {
    if (!tl || playing || tl.scenes.length < 2) return;
    const cuts = tl.scenes.slice(1).map((x) => x.start);
    const c = cuts.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
    t = Math.max(0, c - 1.5);
    spine.reveal(t);
    void play();
  }

  const spine = createSpine({
    timeline: () => tl,
    plan: () => plan,
    time: () => t,
    playing: () => playing,
    scenes: () => project.scenes,
    transition: () => project.transition,
    snap: () => project.sceneSnap,
    selection: () => selection,
    select: (sel) => { if (!exporting) select(sel); },
    onScrubStart: () => pause(),
    seek: (x) => { t = x; dirty = true; },
    resizeScenes,
    moveScene: (a, b) => { if (!exporting) moveScene(a, b); },
    addScene: () => { if (!exporting) { tool = TOOLS.find((x) => x.id === 'scenes')!; selection = null; option = tool.options.find((o) => o.id === 'add')!; refreshUI(); } },
    audioTrim,
    trimAudio: (i, hd, tlv) => { if (!exporting) trimAudio(i, hd, tlv); },
    setGap: (i, g) => { if (!exporting) setGap(i, g); },
    keys: () => (layerSel ? keyTimes(layerSel) : []),
  });

  // Move and scale by touch on the preview (text block or background), keyframed when the layer has keys.
  const touch = attachTouch({
    canvas,
    project: () => project,
    time: () => t,
    info: () => drawn,
    enabled: () => !!tl && !exporting && !picking && !studio.classList.contains('watching') && !studio.classList.contains('premiere'),
    layer: () => layerSel,
    select: (l) => selectLayer(l),
    onStart: () => { if (playing) pause(); },
    live: () => { dirty = true; spine.refresh(); },
    done: () => changed(),
    hint: () => toast(ui('mv.bg-zoom')),
    markMove: (x, top, live) => {
      const m = project.mark;
      if (!m || exporting) return;
      const wasTop = m.pos === 'tl' || m.pos === 'tr';
      m.x = Math.round(x * 1000) / 1000;
      m.pos = top ? (x < 0.5 ? 'tl' : 'tr') : x < 0.34 ? 'bl' : x > 0.66 ? 'br' : 'bc';
      saveMark(m);
      if (top !== wasTop) rebuild(); // the mark's strip moved: the text area changes
      dirty = true;
      if (!live) changed(option?.id === 'watermark'); // refresh the panel's place chips
    },
  });

  // Eyedropper: a tap on the preview takes the colour under the finger.
  canvas.addEventListener('pointerdown', (e) => {
    if (!picking) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * canvas.width), y = Math.round(((e.clientY - r.top) / r.height) * canvas.height);
    const [R, G, B] = pctx.getImageData(x, y, 1, 1).data;
    project.colors[picking] = `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    picking = null;
    changed();
  });

  // Quality menu (top bar) and export page.
  const qualityLabel = h('span', {}, '1080P');
  const qualityMenu = h('div', { class: 'quality-menu', hidden: true });
  const drawQualityMenu = () => qualityMenu.replaceChildren(
    ...([[1920, '1080P', ui('ed.q1080')], [1280, '720P', ui('ed.q720')]] as const).map(([q, l, d]) =>
      h('button', { class: `menu-item${quality === q ? ' on' : ''}`, onclick: () => { quality = q; qualityLabel.textContent = l; qualityMenu.hidden = true; } },
        h('b', {}, l), h('span', { class: 'muted small' }, d))),
    h('button', { class: 'menu-item', onclick: () => { qualityMenu.hidden = true; openDebugPanel(); } }, h('b', {}, ui('list.deviceCheck')), h('span', { class: 'muted small' }, ui('ed.deviceCheckSub'))));
  const qualityBtn = h('button', { class: 'quality', onclick: () => { drawQualityMenu(); qualityMenu.hidden = !qualityMenu.hidden; } }, qualityLabel, icon('down', 16));
  const exportBtn = h('button', { class: 'primary brand-btn export-open', onclick: () => exportTapped() }, ui('ed.export'));
  // Premiere: the first Export of a version plays the whole reel full screen from the start, then
  // Export renders it (or Keep editing goes back). Once seen unchanged, Export goes straight on.
  let premiered = '';
  const premiereTitle = h('p', { class: 'premiere-title' }, ui('ed.premiere'));
  const premiereBar = h('div', { class: 'premiere-bar' },
    premiereTitle,
    h('div', { class: 'premiere-actions' },
      h('button', { class: 'chip', onclick: () => endPremiere() }, ui('ed.keep-editing')),
      h('button', { class: 'primary brand-btn', onclick: () => { premiered = JSON.stringify(project); endPremiere(); void doExport(); } }, ui('ed.export'))));
  function exportTapped() {
    if (exportBtn.disabled) return;
    if (premiered === JSON.stringify(project)) return void doExport();
    void startPremiere(ui('ed.premiere'));
  }
  async function startPremiere(title: string) {
    if (!audio || !tl || !mediaReady) return toast(ui('ed.stillLoading'));
    pause();
    t = 0;
    premiereTitle.textContent = title;
    studio.classList.add('premiere');
    await play();
    if (!playing || ac?.state !== 'running') { pause(); return; } // no sound allowed yet: the bar stays, Play starts it
    watch(true);
  }
  function endPremiere() {
    studio.classList.remove('premiere');
    pause();
  }
  const giftBtn = h('button', { class: 'ctl', 'aria-label': ui('ed.gift'), title: ui('ed.gift'), onclick: () => {
    pause();
    void import('./gift').then((m) => m.openGiftComposer(s, project.from, project.to, { look: lookOf(project), reciter: project.reciterId }));
  } }, icon('gift'));
  const exportPathLabel = h('p', { class: 'muted small' });
  const progressBar = lanternProgress(); // a lantern filling with light (docs/light.md, L5)
  const progressText = h('div', { class: 'export-pct' }, '0%');
  const cancelBtn = h('button', { class: 'chip', onclick: () => exporting?.abort() }, ui('common.cancel'));
  const progressRow = h('div', { class: 'export-progress' }, progressBar.el, progressText, note(ui('ed.keep-this-screen-open-while-the-video-is')), exportPathLabel, cancelBtn);
  const result = h('div', { class: 'export-result', hidden: true });
  const shareExtras = h('div', { class: 'share-extras' }); // trust line + caption, ready while the video is made
  const overlay = h('div', { class: 'export-overlay', hidden: true }, progressRow, result, shareExtras);

  const studio = h('div', { class: 'studio' },
    h('header', { class: 'studio-top' },
      h('a', { class: 'ctl', href: `#/s/${n}/${from}`, 'aria-label': ui('ed.close') }, icon('close')),
      h('div', { class: 'top-right' }, giftBtn, qualityBtn, exportBtn, qualityMenu)),
    h('div', { class: 'studio-stage' }, stage),
    h('div', { class: 'transport' }, timeLabel, h('div', { class: 'play-group' }, restartBtn, playBtn), h('div', { class: 'ctl-group' }, undoBtn, redoBtn, fullBtn)),
    h('div', { class: 'studio-bottom' }, spine.el, bar, panel),
    premiereBar,
    overlay);
  root.append(studio);
  built = true;
  // A new reel opens on the styles: one tap for a finished look, then Export.
  let firstReel = false; // the first reel on this device: it starts finished and plays by itself
  if (draft) tool = TOOLS.find((x) => x.id === readPref('lastTool')) ?? null;
  else {
    tool = TOOLS[0];
    option = tool.options[0];
    let keepLook = false;
    try { keepLook = sessionStorage.getItem('reelKeepLook') === '1'; sessionStorage.removeItem('reelKeepLook'); } catch { /* private window */ }
    if (keepLook) { quick.styled = true; quick.step = 'finish'; } // "Make another like this": the look as it was, ready to export
    else if (!readPref('studioSeen')) {
      savePref('studioSeen', '1');
      firstReel = true;
      const v = quickRecommendation().vibe;
      quick.styled = true;
      quick.auto = true;
      quick.picked = `vibe:${v.id}`;
      keepOwn(() => applyVibe(project, v));
      fitClips();
    }
  }
  refreshUI();

  capabilities().then(({ path }) => {
    exportPathLabel.textContent = path ? describePath(path) : '';
    if (!path) {
      exportBtn.disabled = true;
      exportBtn.title = ui('ed.noExport');
    }
  });

  // --- preview sizing ---
  // One canvas pixel per screen pixel (phones are often 2.6–3.5×), so the text is as sharp as the
  // screen allows; never more than the 1080 px of the export.
  // A page pinch-zoomed by the browser magnifies the canvas too: count that zoom in.
  const resize = () => {
    const zoom = Math.max(1, window.visualViewport?.scale ?? 1);
    setFrame(project.format);
    const w = Math.min(W, Math.round(canvas.getBoundingClientRect().width * (devicePixelRatio || 1) * zoom * previewScale)) || 540;
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
    pctx.setTransform(w / W, 0, 0, w / W, 0, 0);
    dirty = true;
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  fitStage();
  window.visualViewport?.addEventListener('resize', resize);

  // --- loading ---
  const setStatus = (msg: string) => {
    status.textContent = msg;
    status.hidden = !msg;
  };

  /** Apply the pacing (pause between ayat, cards) to the loaded recitation, then rebuild the text. */
  function arrange() {
    if (!base) return;
    const pc = pacing(project); // includes this reel's own pauses (gaps) and text holds
    const was = playing; // keep watching while editing
    pause();
    plan = arrangeReel(base.plan, pc);
    // Steady loudness + soft edges, the same for preview and export (polishAudio).
    audio = polishAudio(plan.pieces!.some((x) => x.from !== x.at) || pc.pause || pc.intro || pc.outro || pc.tail || pc.gaps.some(Boolean) ? arrangeAudio(base.audio, plan.pieces!, plan.duration) : base.audio);
    spine.setAudio(audio);
    rebuild();
    if (was) void play();
  }

  /** The preview takes the reel's format (also after undo / redo). */
  function fitStage() {
    const f = project.format ?? '9:16';
    if (f === shownFormat) return;
    shownFormat = f;
    const [fw, fh] = FORMATS[f];
    stage.style.setProperty('--fr', String(fh / fw));
    stage.style.aspectRatio = `${fw} / ${fh}`;
    resize();
  }
  function rebuild() {
    fitStage();
    if (!plan) return;
    const trId = project.translation ?? currentTranslation();
    if (englishBy.has(trId)) english = englishBy.get(trId)!;
    else {
      // Another translation (picked, or restored by undo): load it, then lay the text out again.
      void surahTranslation(n, trId).then((all) => { englishBy.set(trId, all.slice(from - 1, to)); if (alive) rebuild(); }, () => toast(ui('tr.failed')));
    }
    const info = translationInfo(trId);
    tl = buildTimeline(measure, {
      translation: { credit: info.translator, dir: info.dir },
      surah: s, reciter: reciterById(project.reciterId), plan, arabic, english,
      meanings, mode: mode(), wordsPerStep: project.wordsPerStep, translationMode: project.translationMode,
      style: frameStyle(project), sceneMode: project.sceneMode, sceneCount: project.scenes.length, sceneLengths: project.sceneLengths,
    });
    if (audio) tl.breath = breathOf(audio);
    if (project.tajweed) {
      if (tajweedData) tl.ayat.forEach((a, i) => { a.tajweed = tajweedData![i]; });
      else ensureTajweed();
    }
    spine.invalidate();
    if (t > tl.duration) t = 0;
    if (selection?.kind === 'scene' && selection.index >= tl.scenes.length) selection = null;
    dirty = true;
  }

  // Tajweed colours: the ranges for these ayat, loaded the first time they are switched on.
  let tajweedData: (AyahTajweed | null)[] | null = null;
  let tajweedLoading = false;
  function ensureTajweed() {
    if (tajweedData || tajweedLoading) return;
    tajweedLoading = true;
    surahTajweed(n).then((all) => {
      tajweedData = all.slice(from - 1, to).map(parseTajweed);
      if (alive) rebuild();
    }, () => { tajweedLoading = false; toast(ui('ed.tajweed-failed')); });
  }

  // Recitation per reciter (kept while the editor is open, so switching back is instant).
  const reels = new Map<number, Promise<Reel>>();
  let audioReq = 0;
  async function loadAudio() {
    const req = ++audioReq;
    pause();
    const r = reciterById(project.reciterId);
    // Drop the previous reel so its audio can never go out under this reciter's credit.
    plan = null;
    audio = null;
    spine.setAudio(null);
    base = null;
    tl = null;
    setStatus(ui('ed.loadingRecitation'));
    syncText = ui('ed.loadingTimings');
    try {
      if (!reels.has(r.id)) {
        const p = loadReel(r, n, from, arabic, wordMap, (msg) => { if (req === audioReq) setStatus(msg); });
        p.catch(() => reels.delete(r.id));
        reels.set(r.id, p);
        // Decoded audio is large: keep only the two most recent reciters.
        while (reels.size > 2) reels.delete(reels.keys().next().value!);
      }
      const reel = await reels.get(r.id)!;
      if (req !== audioReq || !alive) return;
      // Where the voice really starts (the start can be trimmed to MIN_LEAD before it).
      if (reel.plan.onset === undefined) reel.plan.onset = voiceOnset(reel.audio.getChannelData(0), reel.audio.sampleRate, reel.plan.ayat[0].start);
      base = reel;
      syncText = base.plan.wordTimed
        ? ui('ed.wordSynced')
        : ui(base.plan.source === 'everyayah' ? 'ed.noTimingsEveryayah' : base.plan.source === 'mp3quran' ? 'ed.noTimingsMp3quran' : 'ed.noTimings');
      arrange();
      refreshUI();
      setStatus(mediaReady ? '' : ui('ed.loadingBackground'));
    } catch (e) {
      if (req !== audioReq) return;
      if (e instanceof UncheckedRange) {
        // This reciter's recording is not verified for these ayat (joined or unchecked): use the default.
        unchecked.add(r.id);
        project.reciterId = DEFAULT_RECITER;
        toast(ui('ed.reciter-unchecked', { name: r.short }));
        changed();
        return loadAudio();
      }
      setStatus(navigator.onLine
        ? ui('ed.audioFailed', { msg: e instanceof Error ? e.message : String(e) })
        // Reels opened before keep their recitation on the device; this one was not downloaded yet.
        : ui('ed.offlineAudio'));
    }
  }

  // Decoded media per scene entry; an entry keeps its media when the list changes around it.
  let bgReq = 0;
  async function loadScenes() {
    const req = ++bgReq;
    const pool = [...media];
    const next = await Promise.all(project.scenes.map((id) => {
      const b = backgroundById(id); // a deleted library item resolves to a plain colour
      const k = pool.findIndex((m) => m.bg === b);
      if (k >= 0) return pool.splice(k, 1)[0];
      return loadBackground(b).catch((e) => {
        toast(ui('ed.bgFailed', { msg: e instanceof Error ? e.message : String(e) }));
        return { bg: backgroundById('charcoal') } as BackgroundMedia;
      });
    }));
    if (req !== bgReq || !alive) {
      for (const m of next) if (!media.includes(m)) disposeMedia(m);
      return;
    }
    for (const m of media) if (!next.includes(m)) disposeMedia(m);
    media = next;
    mediaVersion++;
    mediaReady = true;
    if (tl) setStatus('');
    dirty = true;
  }

  // Fonts must be ready before text is measured for layout.
  await Promise.all([
    document.fonts.load('80px "UthmanicHafs"', arabic[0]),
    document.fonts.load('54px "AmiriQuran"', s.ar),
    document.fonts.load('40px Nunito', 'Aa'),
  ]).catch(() => {});
  void loadAudio();
  void loadScenes();

  // --- playback (preview clock = audio clock) ---

  async function play() {
    if (!audio || !tl || !mediaReady || exporting) return;
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

  /** Back to the first frame (keeps playing if it was). */
  function restart() {
    const was = playing;
    pause();
    t = 0;
    spine.reveal(0);
    dirty = true;
    if (was) void play();
  }

  /** Play a moment around reel time a..b (e.g. a silence just edited), then stop. */
  function playAround(a: number, b: number) {
    if (!tl) return;
    pause();
    t = Math.max(0, a - 1.2);
    stopAt = Math.min(tl.duration, b + 1.2);
    void play();
  }

  function pause() {
    stopAt = 0;
    if (src) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      src = null;
    }
    if (playing && ac) t = startT + ac.currentTime - startCtx;
    playing = false;
    setPlayIcon();
    dirty = true;
  }


  let raf = 0;
  let preparedKey = '';
  // Slow phones: while playing, the preview drops to a lower resolution when frames come too slowly
  // (≥ 40 ms apart on average); paused, it is sharp again. The export is never affected.
  function setPreviewScale(k: number) {
    if (k === previewScale) return;
    previewScale = k;
    resize();
  }
  function pacePlayback(now: number) {
    if (!playing) { lastFrameAt = 0; gapCount = 0; frameGap = 0; if (previewScale !== 1) setPreviewScale(1); return; }
    if (previewScale !== playScale && gapCount === 0) setPreviewScale(playScale);
    if (lastFrameAt) {
      frameGap = frameGap ? frameGap * 0.92 + (now - lastFrameAt) * 0.08 : now - lastFrameAt;
      if (++gapCount > 45 && frameGap > 40 && playScale > 0.5) {
        playScale = playScale > 0.75 ? 0.75 : 0.5;
        setPreviewScale(playScale);
        gapCount = 1;
        frameGap = 0;
      }
    } else gapCount = 0;
    lastFrameAt = now;
  }
  function frame(now = performance.now()) {
    raf = requestAnimationFrame(frame);
    if (exporting || !tl || !mediaReady) return;
    pacePlayback(now);
    if (firstReel && audio) { firstReel = false; void startPremiere(ui('ed.first-reel')); }
    if (playing && ac) {
      t = startT + ac.currentTime - startCtx;
      if (t >= tl.duration) {
        pause();
        t = tl.duration;
      } else if (stopAt && t >= stopAt) pause();
      dirty = true;
    }
    // Fetch the video frames for t (two during a transition); they are drawn on the next tick.
    // Only when the picture can change: a paused preview stays idle (no redraw every frame).
    const key = `${t}|${mediaVersion}|${JSON.stringify(tl.scenes.map((x) => [x.start, x.entry]))}|${JSON.stringify(project.clips)}|${project.slowmo}`;
    if (playing || (key !== preparedKey && !media.some((m) => m.video?.isBusy))) {
      preparedKey = key;
      void prepareScenes(sceneSpans(tl.scenes, project.transition), t, media, project.clips, true, project.slowmo ?? 1)?.then((ch) => { if (ch) dirty = true; });
    }
    spine.frame();
    if (!dirty) return;
    dirty = false;
    render(pctx, t, project, tl, media, drawn);
    const guides = touch.guides();
    if (guides) drawGuides(pctx, guides.centred);
    if (layerSel && !studio.classList.contains('watching')) drawSelection(pctx, layerSel, drawn);
    if (layerSel && (keyIndex(project.motion?.[layerSel], t) >= 0) !== shownOnKey) refreshUI();
    timeLabel.textContent = `${clock(t)} / ${clock(tl.duration)}`;
    if (!panel.hidden) {
      panelScrub.max = String(tl.duration);
      if (document.activeElement !== panelScrub) panelScrub.value = String(t);
    }
  }
  raf = requestAnimationFrame(frame);

  // --- export ---
  let resultUrl = '';
  /** Creators of the stock media in this reel (Pixabay, Pexels), ready to paste into the post's caption. */
  function creditsBlock(): Node | null {
    const seen = new Map<string, Credit>();
    for (const id of project.scenes) {
      const b = backgroundById(id);
      if ((b.kind === 'image' || b.kind === 'video') && b.credit) seen.set(b.credit.url, b.credit);
    }
    if (!seen.size) return null;
    const list = [...seen.values()];
    const text = `Background${list.length > 1 ? 's' : ''}: ${list.map((c) => `${c.author} on ${c.source}`).join(', ')}`;
    return h('div', { class: 'export-credits' },
      h('p', { class: 'small' }, 'Background', list.length > 1 ? 's' : '', ' by ', ...list.flatMap((c, i) => [
        i ? ', ' : '', h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author), ` on ${c.source}`])),
      h('button', { class: 'chip', onclick: () => navigator.clipboard?.writeText(text).then(() => toast(ui('ed.creditsCopied')), () => toast(text)) }, ui('ed.copyCredits')));
  }
  /** What the reel promises: the exact text, and timing from the reciter's own words (or none guessed). */
  function trustLine(): Node {
    const r = reciterById(project.reciterId);
    return h('p', { class: 'trust-line' }, icon('check', 16),
      ui(wordTimed() ? 'ed.trust-timed' : 'ed.trust-ayah', { r: reciterCredit(r) }));
  }
  /** A caption ready to paste: dedication, reference, the whole-ayah translation (only when it fits whole;
   *  never cut, rule 1), reciter, background credits and a few calm hashtags. Editable before copying. */
  function captionText(): string {
    const r = reciterById(project.reciterId);
    const ref = reference(s, from, to);
    const lines: string[] = [];
    if (project.dedication) lines.push(project.dedication, '');
    lines.push(project.series ? `${ref} · ${ui('ed.series-part', { k: project.series.part, n: project.series.of })}` : ref);
    const tr = english.map((x, i) => `${x} (${n}:${from + i})`).join('\n');
    const by = translationInfo(project.translation ?? currentTranslation()).translator;
    if (tr.length <= 1400) lines.push('', tr, `— ${by}`);
    lines.push('', ui('ed.cap-recited', { r: reciterCredit(r) }));
    const credits = new Map<string, Credit>();
    for (const id of project.scenes) {
      const b = backgroundById(id);
      if ((b.kind === 'image' || b.kind === 'video') && b.credit) credits.set(b.credit.url, b.credit);
    }
    if (credits.size) lines.push(`${ui('ed.cap-background')}: ${[...credits.values()].map((c) => `${c.author} (${c.source})`).join(', ')}`);
    const tag = (x: string) => '#' + x.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '');
    lines.push('', ['#Quran', '#QuranRecitation', tag(s.en), tag(r.short ?? r.name)].filter((x) => x.length > 2).join(' '));
    return lines.join('\n');
  }
  function captionBlock(): Node {
    const box = h('textarea', { class: 'caption-text', rows: '7', 'aria-label': ui('ed.caption') });
    box.value = captionText();
    return h('div', { class: 'caption-box' },
      h('p', { class: 'small muted' }, ui('ed.caption-note')),
      box,
      h('button', { class: 'chip', onclick: () => navigator.clipboard?.writeText(box.value).then(() => toast(ui('ed.caption-copied')), () => { box.select(); }) }, ui('ed.caption-copy')));
  }
  /** The same look on the next ayat (or ayat picked in the reader). */
  function makeAnother(): Node {
    const len = to - from;
    const a = to + 1, b = Math.min(s.ayahs, to + 1 + len);
    const go = (hash: string) => { try { sessionStorage.setItem('reelKeepLook', '1'); } catch { /* private window */ } location.hash = hash; };
    return h('div', { class: 'make-another' },
      h('p', { class: 'small' }, ui('ed.another')),
      h('div', { class: 'chips' },
        a <= s.ayahs ? h('button', { class: 'chip on', onclick: () => go(`#/reel/${n}/${a}-${b}`) }, ui('ed.another-next', { ref: `${n}:${a}${b > a ? `–${b}` : ''}` })) : null,
        h('button', { class: 'chip', onclick: () => go(`#/s/${n}/${Math.min(s.ayahs, to + 1)}`) }, ui('ed.another-pick'))));
  }
  /** Android: a notification when the reel is ready while the app is in the background. */
  async function askToNotify() {
    if (!isNative()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const p = await LocalNotifications.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
    } catch { /* no plugin: fine */ }
  }
  async function notifyReady() {
    if (!isNative()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
      await LocalNotifications.schedule({ notifications: [{ id: 7300, title: ui('ed.ready-title'), body: reference(s, from, to), smallIcon: 'ic_stat_crescent' }] });
    } catch { /* fine */ }
  }
  /** Save / Share in the Android app: the file is written once, then shared by its URI. */
  function nativeActions(blob: Blob, name: string) {
    let saving: Promise<SavedFile> | null = null;
    const saveBtn = h('button', { class: 'primary' }, icon('save', 18), ui('ed.save'));
    const label = saveBtn.lastChild as Text;
    const save = () => {
      saving ??= saveVideo(blob, name, (f) => { label.data = ui('ed.saving', { p: Math.round(f * 100) }); }).then((r) => {
        label.data = ui('ed.saved');
        toast(ui('ed.savedTo', { where: r.where }));
        return r;
      }, (e) => {
        saving = null;
        label.data = ui('ed.save');
        throw e;
      });
      return saving;
    };
    const fail = (what: string) => (e: unknown) => toast(`${what}: ${e instanceof Error ? e.message : e}`);
    saveBtn.onclick = () => void save().catch(fail(ui('ed.saveFailed')));
    return h('div', { class: 'export-actions' }, saveBtn,
      h('button', {
        class: 'primary alt',
        onclick: () => void save().then((r) => shareFile(r.uri, ui('ed.shareTitle')).catch((e) => {
          if (!/cancel/i.test(String((e as Error)?.message ?? e))) fail(ui('ed.shareFailed'))(e);
        }), fail(ui('ed.saveFailed'))),
      }, icon('share', 18), ui('ed.share')));
  }
  async function doExport() {
    const { path } = await capabilities();
    if (!path || !tl || !audio || !mediaReady) {
      toast(path ? ui('ed.stillLoading') : ui('ed.exportUnsupported'));
      return;
    }
    pause();
    commit();
    await loadLogo(project.mark?.logo); // the user's logo is decoded before the first frame
    exporting = new AbortController();
    overlay.hidden = false;
    progressRow.hidden = false;
    result.hidden = true;
    shareExtras.replaceChildren(trustLine(), captionBlock());
    void askToNotify();
    const setProgress = (f: number) => {
      progressBar.set(f);
      progressText.textContent = `${Math.round(f * 100)}%`;
    };
    setProgress(0);
    const started = performance.now();
    try {
      const signal = exporting.signal;
      const run = (p: typeof path) => exportVideo({
        project: structuredClone(project), timeline: tl!, audio: audio!, media: [...media], path: p, height: quality, signal,
        onProgress: setProgress,
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
      progressRow.hidden = true;
      if (document.hidden) void notifyReady();
      void recordReel(project.reciterId, n, from, to);
      result.replaceChildren(
        h('video', { src: resultUrl, controls: true, playsInline: true, class: 'result-video', style: `aspect-ratio: ${W} / ${H}${W >= H ? '; width: min(360px, 86vw)' : ''}` }),
        h('p', { class: 'small' }, `✓ ${ui('ed.made', { s: secs, mb: (blob.size / 1e6).toFixed(1), q: quality === 1920 ? '1080P' : '720P' })}`),
        creditsBlock() ?? '',
        isNative() ? nativeActions(blob, name) : h('div', { class: 'export-actions' },
          h('a', { class: 'primary', href: resultUrl, download: name }, icon('save', 18), ui('ed.save')),
          canShare && h('button', { class: 'primary alt', onclick: () => navigator.share({ files: [file] }).catch(() => {}) }, icon('share', 18), ui('ed.share'))),
        makeAnother(),
        h('button', { class: 'chip done', onclick: () => { overlay.hidden = true; } }, ui('ed.backToEditing')),
      );
      result.hidden = false;
    } catch (e) {
      overlay.hidden = true;
      if ((e as Error).name !== 'AbortError' && !exporting.signal.aborted) {
        toast(ui('ed.exportFailed', { msg: e instanceof Error ? e.message : String(e) }));
        console.error(e);
      } else toast(ui('ed.exportCancelled'));
    } finally {
      exporting = null;
      dirty = true;
    }
  }

  return () => {
    if (saveTimer) void saveNow(); // an edit not yet saved
    alive = false;
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.visualViewport?.removeEventListener('resize', resize);
    spine.dispose();
    exporting?.abort();
    pause();
    void ac?.close();
    for (const m of media) disposeMedia(m);
    URL.revokeObjectURL(resultUrl);
  };
}
