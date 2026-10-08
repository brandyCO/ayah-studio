// Reel editor, laid out like CapCut: ✕ / quality / Export on top; the preview; a control row (time,
// play, undo, redo, fullscreen); then a fixed bottom area with the timeline and the tool bar, where a
// tool's panel slides up in place (the preview never changes size). A tool opens its options, an
// option opens a panel, and a block selected in the timeline shows its own actions. Every edit is
// live in the preview, even while playing, and can be undone.
import { arrangeAudio, ayahAudio, mixdown, sliceAudio } from '../data/audio';
import { qdcSurah } from '../data/qdc';
import { loadWordMap, surahMeta, surahText, surahTranslation, surahWordMeanings } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel, type Reciter } from '../data/reciters';
import { draftHash, getDraft, newDraftId, saveDraft } from '../data/drafts';
import { loadLibrary } from '../data/library';
import { BACKGROUNDS, backgroundById, isBackground, loadBackground, type BackgroundMedia, type Credit } from '../engine/backgrounds';
import { capabilities, describePath } from '../engine/capabilities';
import { TEXT_EFFECTS } from '../engine/effects';
import { exportVideo } from '../engine/export';
import { H, W } from '../engine/layout';
import type { EnFont, TextSize, TitlePos, TitleSize } from '../engine/layout';
import { applyMood, COLOURS, currentMood, GRADES, MOODS } from '../engine/moods';
import {
  applyLook, frameStyle, lookOf, MAX_AYAT, newProject, pacing, PAUSES, restoreProject,
  type GapText, type Grade, type Project, type Scrim, type TextColors, type TextEffect, type TextMode, type TextPos, type TranslationMode,
} from '../engine/project';
import { arrangeReel, audioSpans, LEAD_IN, planClipReel, planQdcReel, trimLimits, voiceOnset, voiceStart, type ReelPlan } from '../engine/recitation';
import { render } from '../engine/render';
import {
  CLIP_FITS, clipIn, MAX_SCENES, MIN_RATE, MIN_SCENE, prepareScenes, sceneSpans, TRANSITIONS, videoTime,
  type Clip, type ClipFit, type SceneMode, type Transition,
} from '../engine/scenes';
import { buildTimeline, type Timeline } from '../engine/timeline';
import { displayWords, parseSpans, wordMeanings } from '../engine/words';
import { isNative, saveVideo, shareFile, type SavedFile } from '../native';
import { openDebugPanel } from './debug';
import { h, toast } from './dom';
import { icon } from './icons';
import { createMediaPicker } from './mediaPicker';
import { reelLook, reelReciter, setReelLook, setReelReciter } from './prefs';
import { createSpine, type Selection } from './spine';

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

/** Text effects by kind, for the effect picker. */
const EFFECT_GROUPS: { label: string; items: TextEffect[] }[] = [
  { label: 'Fade & motion', items: ['fade', 'rise', 'descend', 'drift', 'still'] },
  { label: 'Soft focus', items: ['blur-in', 'focus', 'mist', 'dissolve'] },
  { label: 'Light', items: ['glow', 'sweep', 'bloom'] },
  { label: 'Reveal', items: ['ink', 'lines'] },
  { label: 'Scale', items: ['settle', 'zoom', 'push'] },
];
const TRANSITION_ICONS: Record<Transition, string> = {
  crossfade: '◐', blur: '◍', black: '●', white: '○', zoom: '⊕', leak: '☀', mist: '☁', parallax: '⇅', wipe: '⇠', iris: '◎', cut: '│',
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
  const [s, allAr, allEn, allWbw, wordMap, , draft] = await Promise.all([surahMeta(n), surahText(n), surahTranslation(n), surahWordMeanings(n), loadWordMap(), loadLibrary(),
    draftId ? getDraft(draftId).catch(() => undefined) : undefined]);
  from = Math.max(1, Math.min(from || 1, s.ayahs));
  to = Math.max(from, Math.min(to || from, s.ayahs, from + MAX_AYAT - 1));
  const project = newProject(n, from, to, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(project, reelLook(), isBackground);
  if (draft) restoreProject(project, draft.project, isBackground, (id) => RECITERS.some((r) => r.id === id));
  // Autosave: a reel becomes a draft at its first edit and is saved after every edit.
  const draftKey = draft?.id ?? draftId ?? newDraftId();
  const created = draft?.created ?? Date.now();
  let saveTimer = 0;
  const arabic = allAr.slice(from - 1, to);
  const english = allEn.slice(from - 1, to);
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
  let exporting: AbortController | null = null;
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let stopAt = 0; // reel time where a short listen (playAround) pauses; 0: play on
  let t = 0;
  let startCtx = 0;
  let startT = 0;
  let dirty = true;
  let syncText = 'Loading word timings…';
  let quality: 1920 | 1280 = 1920;
  let picking: keyof TextColors | null = null; // eyedropper: the next tap on the preview takes a colour

  // --- DOM: preview and control row ---
  const canvas = h('canvas', { class: 'preview', width: 540, height: 960 });
  const pctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })!;
  const status = h('div', { class: 'stage-status' });
  const playBtn = h('button', { class: 'ctl play', 'aria-label': 'Play', onclick: () => (playing ? pause() : play()) }, icon('play', 26));
  const timeLabel = h('span', { class: 'time' }, '00:00 / 00:00');
  const undoBtn = h('button', { class: 'ctl', 'aria-label': 'Undo', disabled: true, onclick: () => undo() }, icon('undo'));
  const redoBtn = h('button', { class: 'ctl', 'aria-label': 'Redo', disabled: true, onclick: () => redo() }, icon('redo'));
  const fullBtn = h('button', { class: 'ctl', 'aria-label': 'Full screen', onclick: () => setFull(!studio.classList.contains('full')) }, icon('full'));
  const setPlayIcon = () => {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };
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
    c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
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
    Object.assign(project, JSON.parse(json) as Project);
    selection = null;
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
    if (!sc || t - sc.start < MIN_SCENE || sc.end - t < MIN_SCENE) return toast(`Move the playhead inside the scene (at least ${MIN_SCENE} s from its ends)`);
    if (project.scenes.length >= MAX_SCENES) return toast(`Up to ${MAX_SCENES} scenes`);
    // The second part continues the video from the frame at the playhead.
    const v = media[sc.entry]?.video;
    const clip = fitClips()[sc.entry];
    const second: Clip | null = v ? { in: videoTime(sceneSpans(tl.scenes, project.transition)[i], t, clip, v.duration), fit: clip?.fit ?? 'loop' } : clip;
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
      intro: replace !== null ? `Pick a background for scene ${replace + 1}.` : 'Tap a background to add it as a new scene at the end.',
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
    if (!base || i >= count) return [note('Loading the recitation…')];
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
      if (i === 0) section('Silence at the start', () => silenceBefore(0), (v) => setSilenceBefore(0, v), () => silenceBeforeRange(0), () => (plan ? [0, plan.ayat[0].start] : null));
      else section(`Silence between ${ref(i - 1)} and ${ref(i)}`, () => silenceBefore(i), (v) => setSilenceBefore(i, v), () => silenceBeforeRange(i), () => gapAt(i));
      if (i < count - 1) section(`Silence between ${ref(i)} and ${ref(i + 1)}`, () => silenceBefore(i + 1), (v) => setSilenceBefore(i + 1, v), () => silenceBeforeRange(i + 1), () => gapAt(i + 1));
      else section('Silence at the end', silenceEnd, setSilenceEnd, silenceEndRange, () => (plan ? [plan.ayat[count - 1].last, plan.duration - (plan.outro ?? 0)] : null));
      return {
        nodes: [note('Set each silence to the millisecond: tap or hold the steps, or type the seconds. The text moves with its words, and words are never cut.'),
          ...parts.map((x) => x.node)],
        update: () => parts.forEach((x) => x.update()),
      };
    });
  }

  /** Selected scene → its exact length (the neighbour after it — or before the last one — gives way). */
  function sceneTune(i: number): Node[] {
    if (!tl || tl.scenes.length < 2) return [note('Add another scene to change lengths.')];
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
      const st = stepper(len, set, 'Scene length');
      const where = h('p', { class: 'muted small tune-hint' });
      return {
        nodes: [
          h('div', { class: 'tune' }, h('div', { class: 'tune-head' }, h('b', {}, `Scene ${i + 1} length`),
            listenBtn(() => { const sc = tl?.scenes[k()]; return sc ? [sc.end, sc.end] : null; })), st.node, where),
          note(`At least ${MIN_SCENE} s per scene. Snap to pauses does not apply here.`),
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
    if (!tl || !sc || !v) return [note('This scene is a photo or a colour. Photos move slowly on their own.')];
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
      row('Start from', label),
      slider,
      short ? row('Clip too short', chips<ClipFit>(CLIP_FITS, () => clip().fit, (f) => { fitClips()[sc.entry] = { ...clip(), fit: f }; })) : null,
      info,
      project.sceneMode === 'ayah' && project.scenes.length < tl.scenes.length ? note('This video repeats in other scenes; they all use these settings.') : null,
      note('Background videos play without their own sound.'),
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
      head: Math.min(head, maxHead), tail: Math.min(tail, maxTail), maxHead, maxTail,
      gap: i > 0 ? Math.max(0, project.pause + (project.gaps[ayahNo(i)] ?? 0)) : 0,
    };
  }
  const ms = (x: number) => Math.round(x * 1000) / 1000; // edits are kept to the millisecond
  function trimAudio(i: number, head: number, tail: number) {
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
    toast('Silences trimmed — every word kept');
  }
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
  const reciterPanel = () => [h('div', { class: 'list' }, ...RECITERS.map((r) =>
    h('button', {
      class: `list-item${r.id === project.reciterId ? ' on' : ''}`,
      onclick: () => {
        if (exporting || r.id === project.reciterId) return;
        project.reciterId = r.id;
        setReelReciter(r.id);
        changed();
        void loadAudio();
      },
    }, h('span', {}, reciterPickerLabel(r)), r.id === project.reciterId ? icon('check', 18) : null)))];

  const moodPanel = () => [
    h('div', { class: 'tiles' }, ...MOODS.map((m) => tile({
      on: currentMood(project) === m.id, label: m.label,
      art: h('span', { class: `mood-art grade-${m.set.grade}` }, dot(m.set.colors.ar), dot(m.set.colors.en), dot(m.set.colors.title)),
      onclick: () => { applyMood(project, m); arrange(); changed(); previewText(); },
    }))),
    note('A mood sets the text effect, transition, colours, colour grade, darkening and pacing. Adjust anything after.'),
  ];

  const effectPanel = () => {
    const wrap = h('div', {});
    let group = Math.max(0, EFFECT_GROUPS.findIndex((g) => g.items.includes(project.textEffect)));
    const draw = () => wrap.replaceChildren(
      h('div', { class: 'tabs' }, ...EFFECT_GROUPS.map((g, i) =>
        h('button', { class: `tab${i === group ? ' on' : ''}`, onclick: () => { group = i; draw(); } }, g.label))),
      h('div', { class: 'tiles' }, ...EFFECT_GROUPS[group].items.map((fx) => tile({
        on: project.textEffect === fx, label: TEXT_EFFECTS.find((e) => e.value === fx)!.label,
        art: h('span', { class: `fx-sample fx-${fx}` }, 'آية'),
        onclick: () => { project.textEffect = fx; changed(false); draw(); previewText(); },
      }))));
    draw();
    return [wrap, note('Calm effects only. Ink reveal and light sweep move right to left on the Arabic.')];
  };

  const transitionPanel = () => [
    (tl?.scenes.length ?? 1) < 2 ? note('Transitions play between scenes: add a second scene (the + in the timeline) to see them.') : null,
    h('div', { class: 'tiles' }, ...TRANSITIONS.map((tr) => tile({
      on: project.transition === tr.value, label: tr.label, art: h('span', { class: 'glyph' }, TRANSITION_ICONS[tr.value]),
      onclick: () => { project.transition = tr.value; changed(); previewTransition(); },
    }))),
  ].filter(Boolean) as Node[];

  /** Colour grid (no hue/saturation picker) + eyedropper to take a colour from the video. */
  const colourPanel = (key: keyof TextColors, label: string) => () => [
    h('div', { class: 'colour-grid' },
      h('button', {
        class: `swatch eyedropper${picking === key ? ' on' : ''}`, 'aria-label': `${label}: pick a colour from the video`, title: 'Pick from the video',
        onclick: () => { picking = picking === key ? null : key; refreshUI(); if (picking) toast('Tap the video to pick a colour'); },
      }, icon('eyedropper', 20)),
      ...COLOURS.map((c) => h('button', {
        class: `swatch${project.colors[key] === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': `${label}: ${c}`,
        onclick: () => { if (!exporting) { project.colors[key] = c; picking = null; changed(); } },
      }))),
    note('A soft shadow keeps the text readable on any background.'),
  ];

  const sceneLayoutPanel = () => {
    const k = project.scenes.length, na = to - from + 1;
    return [
      chips<SceneMode>([{ value: 'single', label: 'Single' }, { value: 'ayah', label: 'Per ayah' }, { value: 'even', label: 'Even split' }, { value: 'custom', label: 'Custom' }],
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
        ? (na < 2 ? 'One ayah: use Even split or Custom for more than one scene.' : `Each ayah gets the next scene${k < na ? ' (the list repeats when there are fewer scenes than ayat)' : ''}; changes fall in the pause between ayat.`)
        : project.sceneMode === 'even' ? 'The scenes share the length of the reel equally.'
          : project.sceneMode === 'custom' ? 'Select a scene in the timeline: drag its edges to trim, drag it to reorder, or Split it at the playhead. Scenes always fill the reel (each at least 1 s).'
            : 'One background for the whole reel. Tap + in the timeline to add more scenes.'),
    ];
  };

  // --- tools (bottom bar) ---
  const TOOLS: Tool[] = [
    { id: 'reciter', icon: 'mic', label: 'Reciter', options: [{ id: 'reciter', icon: 'mic', label: 'Reciter', panel: reciterPanel }] },
    { id: 'audio', icon: 'audio', label: 'Audio', options: [
      { id: 'silences', icon: 'silence', label: 'Remove silences', action: () => removeSilences() },
      { id: 'pause', icon: 'gap', label: 'Pauses', panel: () => [
        row('Between all ayat', chips<string>(PAUSES.map((x) => ({ value: String(x), label: x ? `+${x} s` : 'Natural' })), () => String(project.pause), (v) => { project.pause = Number(v); arrange(); })),
        note('For one ayah: tap its audio in the timeline, then drag its edges to trim silence or drag it to add a pause. Words are never cut.')] },
      { id: 'reset', icon: 'reset', label: 'Reset audio', disabled: () => !hasAudioEdits(), action: resetAudio },
    ] },
    { id: 'mood', icon: 'mood', label: 'Mood', options: [{ id: 'mood', icon: 'mood', label: 'Mood', panel: moodPanel }] },
    { id: 'text', icon: 'text', label: 'Text', options: [
      { id: 'mode', icon: 'mode', label: 'Text mode', panel: () => [
        chips(MODES, mode, (v) => { project.textMode = v; rebuild(); }, (v) => v === 'ayah' || wordTimed()),
        mode() === 'words' ? row('Per step', chips<'1' | '2' | '3'>([{ value: '1', label: '1 word' }, { value: '2', label: '2 words' }, { value: '3', label: '3 words' }],
          () => String(project.wordsPerStep) as '1' | '2' | '3', (v) => { project.wordsPerStep = Number(v) as 1 | 2 | 3; rebuild(); })) : null,
        note(syncText),
      ].filter(Boolean) as Node[] },
      { id: 'size', icon: 'size', label: 'Size', panel: () => [chips<TextSize>([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }],
        () => project.textSize, (v) => { project.textSize = v; rebuild(); })] },
      { id: 'position', icon: 'position', label: 'Position', panel: () => [chips<TextPos>([{ value: 'upper', label: 'Higher' }, { value: 'center', label: 'Centre' }, { value: 'lower', label: 'Lower' }],
        () => project.textPos, (v) => { project.textPos = v; })] },
      { id: 'gap', icon: 'hold', label: 'Between ayat', panel: () => [
        chips<GapText>([{ value: 'hold', label: 'Keep the ayah' }, { value: 'clear', label: 'Clear' }], () => project.gap, (v) => { project.gap = v; arrange(); }),
        note('What the text does in the pause between ayat.')] },
    ] },
    { id: 'effects', icon: 'effects', label: 'Effects', options: [
      { id: 'text-effect', icon: 'effects', label: 'Text effect', panel: effectPanel },
      { id: 'transition', icon: 'transition', label: 'Transition', panel: transitionPanel },
    ] },
    { id: 'colours', icon: 'colours', label: 'Colours', options: [
      { id: 'c-ar', icon: () => dot(project.colors.ar), label: 'Ayah', panel: colourPanel('ar', 'Ayah') },
      { id: 'c-en', icon: () => dot(project.colors.en), label: 'Translation', panel: colourPanel('en', 'Translation') },
      { id: 'c-title', icon: () => dot(project.colors.title), label: 'Surah name', panel: colourPanel('title', 'Surah name') },
    ] },
    { id: 'scenes', icon: 'scenes', label: 'Scenes', options: [
      { id: 'add', icon: 'plus', label: 'Add', panel: () => bgPicker(null) },
      { id: 'change', icon: 'replace', label: 'Change', panel: () => bgPicker(sceneAtPlayhead()) },
      { id: 'layout', icon: 'layout', label: 'Arrange', panel: sceneLayoutPanel },
      { id: 'grade', icon: 'grade', label: 'Grade', panel: () => [h('div', { class: 'tiles' }, ...(Object.keys(GRADES) as Grade[]).map((g) => tile({
        on: project.grade === g, label: GRADES[g].label, art: h('span', { class: `mood-art grade-${g}` }), onclick: () => { project.grade = g; changed(); },
      })))] },
      { id: 'scrim', icon: 'darken', label: 'Darken', panel: () => [chips<Scrim>([{ value: 'light', label: 'Light' }, { value: 'normal', label: 'Normal' }, { value: 'strong', label: 'Strong' }],
        () => project.scrim, (v) => { project.scrim = v; }), note('Darkens the background behind the text so it stays readable.')] },
      { id: 'snap', icon: 'magnet', label: 'Snap', toggle: { get: () => project.sceneSnap, set: (v) => { project.sceneSnap = v; } } },
    ] },
    { id: 'translation', icon: 'translation', label: 'Translation', options: [
      { id: 'tr-show', icon: 'show', label: 'Show', toggle: { get: () => project.showTranslation, set: (v) => { project.showTranslation = v; rebuild(); } } },
      { id: 'tr-sync', icon: 'sync', label: 'Sync', disabled: () => !project.showTranslation, panel: () => [
        chips<TranslationMode>([{ value: 'words', label: 'Synced to the words' }, { value: 'ayah', label: 'Whole ayah' }],
          () => project.translationMode, (v) => { project.translationMode = v; rebuild(); }),
        note('Synced: word-by-word meanings (Quran.com) of the Arabic on screen. Whole ayah: Sahih International.')] },
      { id: 'tr-font', icon: 'font', label: 'Font', disabled: () => !project.showTranslation, panel: () => [
        chips<EnFont>([{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }], () => project.enFont, (v) => { project.enFont = v; rebuild(); })] },
    ] },
    { id: 'layout', icon: 'layout', label: 'Layout', options: [
      { id: 'title', icon: 'text', label: 'Surah name', panel: () => [
        row('Place', chips<TitlePos>([{ value: 'top', label: 'Top' }, { value: 'below', label: 'Below the ayah' }, { value: 'bottom', label: 'Bottom' }],
          () => project.titlePos, (v) => { project.titlePos = v; rebuild(); })),
        row('Size', chips<TitleSize>([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }],
          () => project.titleSize, (v) => { project.titleSize = v; rebuild(); })),
        row('Surah name', chips<'show' | 'hide'>([{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }],
          () => (project.surahName ? 'show' : 'hide'), (v) => { project.surahName = v === 'show'; rebuild(); })),
        note('The reference (e.g. Al-Fatiha · 1:1) always stays on screen.')] },
      { id: 'intro', icon: 'card', label: 'Intro card', toggle: { get: () => project.intro, set: (v) => { project.intro = v; arrange(); } } },
      { id: 'outro', icon: 'card', label: 'End card', toggle: { get: () => project.outro, set: (v) => { project.outro = v; arrange(); } } },
      { id: 'credit', icon: 'mic', label: 'Reciter name', toggle: { get: () => project.credit, set: (v) => { project.credit = v; rebuild(); } } },
      { id: 'watermark', icon: 'watermark', label: 'Watermark', toggle: { get: () => project.watermark, set: (v) => { project.watermark = v; rebuild(); } } },
    ] },
  ];

  // --- block actions (when a block is selected in the timeline) ---
  function selectionOptions(sel: NonNullable<Selection>): Opt[] {
    const i = sel.index;
    if (sel.kind === 'scene') {
      const count = tl?.scenes.length ?? 1;
      return [
        { id: 'split', icon: 'split', label: 'Split', action: () => splitScene(i) },
        { id: 'length', icon: 'gap', label: 'Length', disabled: () => count < 2, panel: () => sceneTune(i) },
        { id: 'replace', icon: 'replace', label: 'Replace', panel: () => bgPicker(i) },
        { id: 'video', icon: 'clip', label: 'Video', disabled: () => !media[tl?.scenes[i]?.entry ?? -1]?.video, panel: () => videoPanel(i) },
        { id: 'left', icon: 'left', label: 'Move left', disabled: () => i === 0, action: () => moveScene(i, i - 1) },
        { id: 'right', icon: 'right', label: 'Move right', disabled: () => i >= count - 1, action: () => moveScene(i, i + 1) },
        { id: 'transition', icon: 'transition', label: 'Transition', panel: transitionPanel },
        { id: 'delete', icon: 'trash', label: 'Delete', disabled: () => count < 2, action: () => removeScene(i) },
      ];
    }
    const out: Opt[] = [
      { id: 'tune', icon: 'gap', label: 'Fine-tune', disabled: () => !base, panel: () => audioTune(i) },
      { id: 'silence', icon: 'silence', label: 'Trim silence', action: () => removeSilences(i) },
    ];
    out.push({ id: 'audio-reset', icon: 'reset', label: 'Reset', disabled: () => project.gaps[ayahNo(i)] === undefined && project.trims[ayahNo(i)] === undefined,
      action: () => { delete project.gaps[ayahNo(i)]; delete project.trims[ayahNo(i)]; arrange(); changed(); } });
    const last = i === (tl?.ayat.length ?? 1) - 1;
    if (i === 0 && from > 1 && to - from + 1 < MAX_AYAT) out.push({ id: 'add-prev', icon: 'plus', label: `Add ${n}:${from - 1}`, action: () => goRange(from - 1, to) });
    if (last && to < s.ayahs && to - from + 1 < MAX_AYAT) out.push({ id: 'add-next', icon: 'plus', label: `Add ${n}:${to + 1}`, action: () => goRange(from, to + 1) });
    if ((i === 0 || last) && to > from) out.push({ id: 'remove', icon: 'trash', label: `Remove ${n}:${ayahNo(i)}`, action: () => (i === 0 ? goRange(from + 1, to) : goRange(from, to - 1)) });
    return out;
  }

  // --- bars and panels ---
  let tool: Tool | null = null; // its options are in the bottom bar
  let option: Opt | null = null; // its panel is open
  let selection: Selection = null;
  const panelTitle = h('h2', {});
  const panelBody = h('div', { class: 'sheet-body panel' });
  const panel = h('section', { class: 'sheet', hidden: true },
    h('div', { class: 'sheet-head' }, panelTitle,
      h('button', { class: 'icon-btn sheet-close', 'aria-label': 'Done', onclick: () => { picking = null; openOption(null); } }, icon('check'))),
    panelBody);
  const bar = h('nav', { class: 'toolbar', 'aria-label': 'Tools' });

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
    selection = null;
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
    tool = null;
    option = null;
    refreshUI();
  }
  const back = (label: string, onclick: () => void) =>
    h('button', { class: 'tool back', 'aria-label': 'Back', onclick }, h('span', { class: 'tool-icon' }, icon('back')), h('span', {}, label));
  function refreshUI() {
    // Bottom bar: a selected block's actions, a tool's options, or the tools.
    if (selection) {
      bar.replaceChildren(back(selection.kind === 'scene' ? 'Scene' : 'Audio', () => select(null)),
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
    studio.classList.toggle('panel-open', !!content);
    panelTitle.textContent = option ? (option.id.startsWith('c-') ? `Colour · ${option.label}` : option.label) : '';
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
    ...([[1920, '1080P', 'Best for Instagram, TikTok and Shorts'], [1280, '720P', 'Smaller file, faster export']] as const).map(([q, l, d]) =>
      h('button', { class: `menu-item${quality === q ? ' on' : ''}`, onclick: () => { quality = q; qualityLabel.textContent = l; qualityMenu.hidden = true; } },
        h('b', {}, l), h('span', { class: 'muted small' }, d))),
    h('button', { class: 'menu-item', onclick: () => { qualityMenu.hidden = true; openDebugPanel(); } }, h('b', {}, 'Device check'), h('span', { class: 'muted small' }, 'What this device can export')));
  const qualityBtn = h('button', { class: 'quality', onclick: () => { drawQualityMenu(); qualityMenu.hidden = !qualityMenu.hidden; } }, qualityLabel, icon('down', 16));
  const exportBtn = h('button', { class: 'primary export-open', onclick: () => void doExport() }, 'Export');
  const exportPathLabel = h('p', { class: 'muted small' });
  const progressBar = h('div', { class: 'export-bar' }, h('div', {}));
  const progressText = h('div', { class: 'export-pct' }, '0%');
  const cancelBtn = h('button', { class: 'chip', onclick: () => exporting?.abort() }, 'Cancel');
  const progressRow = h('div', { class: 'export-progress' }, progressText, progressBar, note('Keep this screen open while the video is made on your device.'), exportPathLabel, cancelBtn);
  const result = h('div', { class: 'export-result', hidden: true });
  const overlay = h('div', { class: 'export-overlay', hidden: true }, progressRow, result);

  const studio = h('div', { class: 'studio' },
    h('header', { class: 'studio-top' },
      h('a', { class: 'ctl', href: `#/s/${n}/${from}`, 'aria-label': 'Close the editor' }, icon('close')),
      h('div', { class: 'top-right' }, qualityBtn, exportBtn, qualityMenu)),
    h('div', { class: 'studio-stage' }, h('div', { class: 'stage' }, canvas, status)),
    h('div', { class: 'transport' }, timeLabel, playBtn, h('div', { class: 'ctl-group' }, undoBtn, redoBtn, fullBtn)),
    h('div', { class: 'studio-bottom' }, spine.el, bar, panel),
    overlay);
  root.append(studio);
  refreshUI();

  capabilities().then(({ path }) => {
    exportPathLabel.textContent = path ? describePath(path) : '';
    if (!path) {
      exportBtn.disabled = true;
      exportBtn.title = 'This browser cannot export video (no WebCodecs). Try Chrome on Android or desktop.';
    }
  });

  // --- preview sizing ---
  // One canvas pixel per screen pixel (phones are often 2.6–3.5×), so the text is as sharp as the
  // screen allows; never more than the 1080 px of the export.
  // A page pinch-zoomed by the browser magnifies the canvas too: count that zoom in.
  const resize = () => {
    const zoom = Math.max(1, window.visualViewport?.scale ?? 1);
    const w = Math.min(1080, Math.round(canvas.getBoundingClientRect().width * (devicePixelRatio || 1) * zoom)) || 540;
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
    pctx.setTransform(w / W, 0, 0, w / W, 0, 0);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
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
    audio = pc.pause || pc.intro || pc.outro || pc.gaps.some(Boolean) ? arrangeAudio(base.audio, plan.pieces!, plan.duration) : base.audio;
    spine.setAudio(audio);
    rebuild();
    if (was) void play();
  }

  function rebuild() {
    if (!plan) return;
    tl = buildTimeline(measure, {
      surah: s, reciter: reciterById(project.reciterId), plan, arabic, english,
      meanings, mode: mode(), wordsPerStep: project.wordsPerStep, translationMode: project.translationMode,
      style: frameStyle(project), sceneMode: project.sceneMode, sceneCount: project.scenes.length, sceneLengths: project.sceneLengths,
    });
    spine.invalidate();
    if (t > tl.duration) t = 0;
    if (selection?.kind === 'scene' && selection.index >= tl.scenes.length) selection = null;
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
    spine.setAudio(null);
    base = null;
    tl = null;
    setStatus('Loading recitation…');
    syncText = 'Loading word timings…';
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
      // Where the voice really starts (the start can be trimmed to MIN_LEAD before it).
      if (reel.plan.onset === undefined) reel.plan.onset = voiceOnset(reel.audio.getChannelData(0), reel.audio.sampleRate, reel.plan.ayat[0].start);
      base = reel;
      syncText = base.plan.wordTimed
        ? 'Text follows the reciter word by word.'
        : `Word timings are not available for this reciter here, so only Ayah mode is offered${base.plan.source === 'everyayah' ? ' (audio: everyayah.com)' : ''}.`;
      arrange();
      refreshUI();
      setStatus(mediaReady ? '' : 'Loading background…');
    } catch (e) {
      if (req !== audioReq) return;
      setStatus(navigator.onLine
        ? `${e instanceof Error ? e.message : e}. Check your connection and pick the reciter again.`
        // Reels opened before keep their recitation on the device; this one was not downloaded yet.
        : 'You are offline, and this recitation is not on your device yet. Connect once to download it; after that it works offline too.');
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
        toast(`Background failed to load: ${e instanceof Error ? e.message : e}`);
        return { bg: backgroundById('charcoal') } as BackgroundMedia;
      });
    }));
    if (req !== bgReq || !alive) {
      for (const m of next) if (!media.includes(m)) m.video?.dispose();
      return;
    }
    for (const m of media) if (!next.includes(m)) m.video?.dispose();
    media = next;
    mediaReady = true;
    if (tl) setStatus('');
    dirty = true;
  }

  // Fonts must be ready before text is measured for layout.
  await Promise.all([
    document.fonts.load('80px "UthmanicHafs"', arabic[0]),
    document.fonts.load('54px "AmiriQuran"', s.ar),
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
  function frame() {
    raf = requestAnimationFrame(frame);
    if (exporting || !tl || !mediaReady) return;
    if (playing && ac) {
      t = startT + ac.currentTime - startCtx;
      if (t >= tl.duration) {
        pause();
        t = tl.duration;
      } else if (stopAt && t >= stopAt) pause();
      dirty = true;
    }
    // Fetch the video frames for t (two during a transition); they are drawn on the next tick.
    void prepareScenes(sceneSpans(tl.scenes, project.transition), t, media, project.clips, true)?.then(() => (dirty = true));
    spine.frame();
    if (!dirty) return;
    dirty = false;
    render(pctx, t, project, tl, media);
    timeLabel.textContent = `${clock(t)} / ${clock(tl.duration)}`;
  }
  raf = requestAnimationFrame(frame);

  // --- export ---
  let resultUrl = '';
  /** Creators of the stock media in this reel (Pixabay, Pexels), ready to paste into the post's caption. */
  function creditsBlock(): Node | null {
    const seen = new Map<string, Credit>();
    for (const id of project.scenes) {
      const b = backgroundById(id);
      if (b.kind !== 'color' && b.credit) seen.set(b.credit.url, b.credit);
    }
    if (!seen.size) return null;
    const list = [...seen.values()];
    const text = `Background${list.length > 1 ? 's' : ''}: ${list.map((c) => `${c.author} on ${c.source}`).join(', ')}`;
    return h('div', { class: 'export-credits' },
      h('p', { class: 'small' }, 'Background', list.length > 1 ? 's' : '', ' by ', ...list.flatMap((c, i) => [
        i ? ', ' : '', h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author), ` on ${c.source}`])),
      h('button', { class: 'chip', onclick: () => navigator.clipboard?.writeText(text).then(() => toast('Credits copied'), () => toast(text)) }, 'Copy credits'));
  }
  /** Save / Share in the Android app: the file is written once, then shared by its URI. */
  function nativeActions(blob: Blob, name: string) {
    let saving: Promise<SavedFile> | null = null;
    const saveBtn = h('button', { class: 'primary' }, icon('save', 18), 'Save to device');
    const label = saveBtn.lastChild as Text;
    const save = () => {
      saving ??= saveVideo(blob, name, (f) => { label.data = `Saving… ${Math.round(f * 100)}%`; }).then((r) => {
        label.data = 'Saved';
        toast(`Saved to ${r.where}`);
        return r;
      }, (e) => {
        saving = null;
        label.data = 'Save to device';
        throw e;
      });
      return saving;
    };
    const fail = (what: string) => (e: unknown) => toast(`${what}: ${e instanceof Error ? e.message : e}`);
    saveBtn.onclick = () => void save().catch(fail('Could not save'));
    return h('div', { class: 'export-actions' }, saveBtn,
      h('button', {
        class: 'primary alt',
        onclick: () => void save().then((r) => shareFile(r.uri, 'Share your reel').catch((e) => {
          if (!/cancel/i.test(String((e as Error)?.message ?? e))) fail('Could not share')(e);
        }), fail('Could not save')),
      }, icon('share', 18), 'Share'));
  }
  async function doExport() {
    const { path } = await capabilities();
    if (!path || !tl || !audio || !mediaReady) {
      toast(path ? 'Still loading — try again in a moment' : 'Export is not supported in this browser');
      return;
    }
    pause();
    commit();
    exporting = new AbortController();
    overlay.hidden = false;
    progressRow.hidden = false;
    result.hidden = true;
    const setProgress = (f: number) => {
      (progressBar.firstChild as HTMLElement).style.width = `${Math.round(f * 100)}%`;
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
      result.replaceChildren(
        h('video', { src: resultUrl, controls: true, playsInline: true, class: 'result-video' }),
        h('p', { class: 'small' }, `✓ Made in ${secs} s · ${(blob.size / 1e6).toFixed(1)} MB · ${quality === 1920 ? '1080P' : '720P'}`),
        creditsBlock() ?? '',
        isNative() ? nativeActions(blob, name) : h('div', { class: 'export-actions' },
          h('a', { class: 'primary', href: resultUrl, download: name }, icon('save', 18), 'Save to device'),
          canShare && h('button', { class: 'primary alt', onclick: () => navigator.share({ files: [file] }).catch(() => {}) }, icon('share', 18), 'Share')),
        h('button', { class: 'chip done', onclick: () => { overlay.hidden = true; } }, 'Back to editing'),
      );
      result.hidden = false;
    } catch (e) {
      overlay.hidden = true;
      if ((e as Error).name !== 'AbortError' && !exporting.signal.aborted) {
        toast(`Export failed: ${e instanceof Error ? e.message : e}`);
        console.error(e);
      } else toast('Export cancelled');
    } finally {
      exporting = null;
      dirty = true;
    }
  }

  return () => {
    if (saveTimer) void saveNow(); // an edit not yet saved
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.visualViewport?.removeEventListener('resize', resize);
    spine.dispose();
    exporting?.abort();
    pause();
    void ac?.close();
    for (const m of media) m.video?.dispose();
    URL.revokeObjectURL(resultUrl);
  };
}
