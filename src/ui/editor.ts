// Reel editor, laid out like CapCut: the preview and the timeline (recitation spine) stay on screen;
// the bottom bar opens a tool's options, an option opens a compact panel, and selecting a block in
// the timeline shows that block's actions. Everything edits the live preview, even while playing.
import { arrangeAudio, ayahAudio, mixdown, sliceAudio } from '../data/audio';
import { qdcSurah } from '../data/qdc';
import { loadWordMap, reference, surahMeta, surahText, surahTranslation, surahWordMeanings } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel, type Reciter } from '../data/reciters';
import { BACKGROUNDS, backgroundById, loadBackground, type Background, type BackgroundMedia } from '../engine/backgrounds';
import { capabilities, describePath } from '../engine/capabilities';
import { TEXT_EFFECTS } from '../engine/effects';
import { exportVideo } from '../engine/export';
import { H, W } from '../engine/layout';
import type { EnFont, TextSize, TitlePos, TitleSize } from '../engine/layout';
import { applyMood, currentMood, GRADES, MOODS, PALETTE } from '../engine/moods';
import {
  applyLook, frameStyle, lookOf, MAX_AYAT, newProject, pacing, PAUSES,
  type GapText, type Grade, type Scrim, type TextColors, type TextEffect, type TextMode, type TextPos, type TranslationMode,
} from '../engine/project';
import { arrangeReel, LEAD_IN, planClipReel, planQdcReel, type ReelPlan } from '../engine/recitation';
import { render } from '../engine/render';
import { MAX_SCENES, prepareScenes, sceneSpans, TRANSITIONS, type SceneMode, type Transition } from '../engine/scenes';
import { buildTimeline, type Timeline } from '../engine/timeline';
import { displayWords, parseSpans, wordMeanings } from '../engine/words';
import { openDebugPanel } from './debug';
import { fmtTime, h, toast } from './dom';
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

export async function showEditor(root: HTMLElement, n: number, from: number, to: number): Promise<() => void> {
  const [s, allAr, allEn, allWbw, wordMap] = await Promise.all([surahMeta(n), surahText(n), surahTranslation(n), surahWordMeanings(n), loadWordMap()]);
  from = Math.max(1, Math.min(from || 1, s.ayahs));
  to = Math.max(from, Math.min(to || from, s.ayahs, from + MAX_AYAT - 1));
  const project = newProject(n, from, to, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(project, reelLook(), (id) => BACKGROUNDS.some((b) => b.id === id));
  const arabic = allAr.slice(from - 1, to);
  const english = allEn.slice(from - 1, to);
  // English meaning of each Arabic word on screen (synced translation).
  const meanings = arabic.map((text, i) =>
    wordMeanings(allWbw[from - 1 + i], parseSpans(wordMap[`${n}:${from + i}`]), displayWords(text).length));

  let alive = true;
  let tl: Timeline | null = null;
  let audio: AudioBuffer | null = null;
  let plan: ReelPlan | null = null;
  let base: Reel | null = null; // the recitation before pacing (pauses, cards)
  const measure = document.createElement('canvas').getContext('2d')!;
  let media: BackgroundMedia[] = []; // decoded background of each entry in project.scenes
  let mediaReady = false;
  let exporting: AbortController | null = null;
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let t = 0;
  let startCtx = 0;
  let startT = 0;
  let dirty = true;
  let syncText = 'Loading word timings…';

  // --- DOM ---
  const canvas = h('canvas', { class: 'preview', width: 540, height: 960 });
  const pctx = canvas.getContext('2d', { alpha: false })!;
  const status = h('div', { class: 'stage-status' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Play', onclick: () => (playing ? pause() : play()) }, '▶');
  const timeLabel = h('span', { class: 'time' }, '0:00 / 0:00');

  /** After any change: remember the look, redraw the open bar/panel and the preview. */
  const changed = (rerender = true) => {
    setReelLook(lookOf(project));
    if (rerender) refreshUI();
    spine.invalidate();
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
  const thumbStyle = (b: Background) => (b.kind === 'color' ? `background:${b.color}` : `background-image:url("${b.thumb}")`);
  const dot = (c: string) => h('span', { class: 'dot', style: `background:${c}` });

  // Text modes other than Ayah need word timings (rule 8: never guess sync).
  const wordTimed = () => !!plan?.wordTimed;
  const mode = (): TextMode => (wordTimed() ? project.textMode : 'ayah');

  // --- scenes: every structural edit works on an explicit list (Custom) with one entry per scene ---
  const scenesChanged = () => { rebuild(); void loadScenes(); };
  function toCustom() {
    if (!tl || project.sceneMode === 'custom') return;
    project.scenes = tl.scenes.map((x) => project.scenes[x.entry]);
    project.sceneLengths = tl.scenes.map((x) => x.end - x.start);
    project.sceneMode = project.scenes.length > 1 ? 'custom' : 'single';
  }
  function addScene(id: string) {
    if (project.scenes.length >= MAX_SCENES && project.sceneMode !== 'single') return toast(`Up to ${MAX_SCENES} scenes`);
    toCustom();
    const lens = project.sceneMode === 'custom' ? project.sceneLengths : [tl?.duration ?? 1];
    const sum = lens.reduce((a, b) => a + b, 0);
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
    project.scenes.splice(i, 1);
    project.sceneLengths.splice(i, 1);
    if (project.scenes.length === 1) project.sceneMode = 'single';
    selection = null;
    scenesChanged();
  }
  function moveScene(i: number, j: number) {
    toCustom();
    if (j < 0 || j >= project.scenes.length || i === j) return;
    const [id] = project.scenes.splice(i, 1);
    const [len] = project.sceneLengths.splice(i, 1);
    project.scenes.splice(j, 0, id);
    project.sceneLengths.splice(j, 0, len);
    selection = { kind: 'scene', index: j };
    scenesChanged();
  }
  /** Background picker: add a new scene (replace = null), or replace scene `replace`. */
  function bgPicker(replace: number | null): Node[] {
    const current = replace !== null ? project.scenes[tl?.scenes[replace]?.entry ?? replace] : null;
    return [
      note(replace !== null ? `Pick a background for scene ${replace + 1}.` : 'Tap a background to add it as a new scene at the end.'),
      h('div', { class: 'bg-grid' }, ...BACKGROUNDS.map((b) =>
        h('button', {
          class: `bg-thumb${current === b.id ? ' on' : ''}`, title: b.label, style: thumbStyle(b),
          onclick: () => {
            if (exporting) return;
            if (replace !== null) {
              if (project.sceneMode === 'ayah' && project.scenes.length < (tl?.scenes.length ?? 0)) toCustom();
              project.scenes[project.sceneMode === 'custom' || project.sceneMode === 'single' ? replace : tl!.scenes[replace].entry] = b.id;
            } else return addScene(b.id);
            changed();
            scenesChanged();
          },
        }, h('span', {}, b.kind === 'video' ? `▶ ${b.label}` : b.label)))),
    ];
  }

  const sceneAtPlayhead = () => Math.max(0, tl?.scenes.findIndex((x) => t >= x.start && t < x.end) ?? 0);

  // --- panels ---
  const reciterPanel = () => [h('div', { class: 'list' }, ...RECITERS.map((r) =>
    h('button', {
      class: `list-item${r.id === project.reciterId ? ' on' : ''}`,
      onclick: () => {
        if (exporting || r.id === project.reciterId) return;
        project.reciterId = r.id;
        setReelReciter(r.id);
        refreshUI();
        void loadAudio();
      },
    }, h('span', {}, reciterPickerLabel(r)), r.id === project.reciterId ? h('span', { class: 'check' }, '✓') : null)))];

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
    (tl?.scenes.length ?? 1) < 2 ? note('Transitions play between scenes: add a second scene (Scenes → Add) to see them.') : null,
    h('div', { class: 'tiles' }, ...TRANSITIONS.map((tr) => tile({
      on: project.transition === tr.value, label: tr.label, art: h('span', { class: 'glyph' }, TRANSITION_ICONS[tr.value]),
      onclick: () => { project.transition = tr.value; changed(); previewTransition(); },
    }))),
  ].filter(Boolean) as Node[];

  const colourPanel = (key: keyof TextColors, label: string) => () => {
    const set = (c: string, rerender: boolean) => { if (!exporting) { project.colors[key] = c.toLowerCase(); changed(rerender); } };
    const picker = h('input', { type: 'color', value: project.colors[key], 'aria-label': `${label}: custom colour`, oninput: () => set(picker.value, false) });
    return [
      h('div', { class: 'swatches big' },
        ...PALETTE.map((c) => h('button', {
          class: `swatch${project.colors[key] === c.color ? ' on' : ''}`, style: `background:${c.color}`, title: c.label,
          'aria-label': `${label}: ${c.label}`, onclick: () => set(c.color, true),
        })),
        h('label', { class: `swatch custom${PALETTE.some((x) => x.color === project.colors[key]) ? '' : ' on'}`, title: 'Custom colour' }, picker)),
      note('A soft shadow keeps the text readable on any background.'),
    ];
  };

  const sceneLayoutPanel = () => {
    const k = project.scenes.length, na = to - from + 1;
    return [
      chips<SceneMode>([{ value: 'single', label: 'Single' }, { value: 'ayah', label: 'Per ayah' }, { value: 'even', label: 'Even split' }, { value: 'custom', label: 'Custom' }],
        () => project.sceneMode, (v) => {
          if (v !== 'single' && project.scenes.length < 2) {
            const i = BACKGROUNDS.findIndex((b) => b.id === project.scenes[0]);
            project.scenes.push(BACKGROUNDS[(i + 1) % BACKGROUNDS.length].id);
          }
          if (v === 'custom' && project.sceneLengths.length !== project.scenes.length) project.sceneLengths = project.scenes.map(() => 1);
          project.sceneMode = v;
          scenesChanged();
        }),
      note(project.sceneMode === 'ayah'
        ? (na < 2 ? 'One ayah: use Even split or Custom for more than one scene.' : `Each ayah gets the next scene${k < na ? ' (the list repeats when there are fewer scenes than ayat)' : ''}; changes fall in the pause between ayat.`)
        : project.sceneMode === 'even' ? 'The scenes share the length of the reel equally.'
          : project.sceneMode === 'custom' ? 'Select a scene in the timeline and drag its edges to resize it, or drag it to reorder. Scenes always fill the reel exactly (each at least 1 s).'
            : 'One background for the whole reel. Tap + in the timeline to add more.'),
    ];
  };

  // Export panel (opened from the top bar).
  let quality: 1920 | 1280 = 1920;
  const exportBtn = h('button', { class: 'primary wide', onclick: () => void doExport() }, '⬇ Export MP4');
  const exportPathLabel = h('p', { class: 'muted small' }, 'Checking export support…');
  const progressBar = h('progress', { max: 1, value: 0 });
  const progressText = h('span', { class: 'small' });
  const cancelBtn = h('button', { class: 'chip', onclick: () => exporting?.abort() }, 'Cancel');
  const progressRow = h('div', { class: 'progress-row', hidden: true }, progressBar, progressText, cancelBtn);
  const result = h('div', { class: 'result', hidden: true });
  const exportPanel = () => [
    chips<'1920' | '1280'>([{ value: '1920', label: '1080p' }, { value: '1280', label: '720p (faster)' }],
      () => String(quality) as '1920' | '1280', (v) => { quality = Number(v) as 1920 | 1280; }),
    exportBtn, exportPathLabel, progressRow, result,
  ];

  // --- tools (bottom bar) ---
  const resetEdits = () => { project.gaps = {}; project.holds = {}; arrange(); changed(); };
  const hasEdits = () => Object.keys(project.gaps).length > 0 || Object.keys(project.holds).length > 0;
  const TOOLS: Tool[] = [
    { id: 'reciter', icon: '🎙', label: 'Reciter', options: [{ id: 'reciter', icon: '🎙', label: 'Reciter', panel: reciterPanel }] },
    { id: 'mood', icon: '✦', label: 'Mood', options: [{ id: 'mood', icon: '✦', label: 'Mood', panel: moodPanel }] },
    { id: 'text', icon: 'Aa', label: 'Text', options: [
      { id: 'mode', icon: '☰', label: 'Text mode', panel: () => [
        chips(MODES, mode, (v) => { project.textMode = v; rebuild(); }, (v) => v === 'ayah' || wordTimed()),
        mode() === 'words' ? row('Per step', chips<'1' | '2' | '3'>([{ value: '1', label: '1 word' }, { value: '2', label: '2 words' }, { value: '3', label: '3 words' }],
          () => String(project.wordsPerStep) as '1' | '2' | '3', (v) => { project.wordsPerStep = Number(v) as 1 | 2 | 3; rebuild(); })) : null,
        note(syncText),
      ].filter(Boolean) as Node[] },
      { id: 'size', icon: 'A⇕', label: 'Size', panel: () => [chips<TextSize>([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }],
        () => project.textSize, (v) => { project.textSize = v; rebuild(); })] },
      { id: 'position', icon: '⇳', label: 'Position', panel: () => [chips<TextPos>([{ value: 'upper', label: 'Higher' }, { value: 'center', label: 'Centre' }, { value: 'lower', label: 'Lower' }],
        () => project.textPos, (v) => { project.textPos = v; })] },
    ] },
    { id: 'effects', icon: '✧', label: 'Effects', options: [
      { id: 'text-effect', icon: '✧', label: 'Text effect', panel: effectPanel },
      { id: 'transition', icon: '◆', label: 'Transition', panel: transitionPanel },
    ] },
    { id: 'colours', icon: '🎨', label: 'Colours', options: [
      { id: 'c-ar', icon: () => dot(project.colors.ar), label: 'Ayah', panel: colourPanel('ar', 'Ayah') },
      { id: 'c-en', icon: () => dot(project.colors.en), label: 'Translation', panel: colourPanel('en', 'Translation') },
      { id: 'c-title', icon: () => dot(project.colors.title), label: 'Surah name', panel: colourPanel('title', 'Surah name') },
    ] },
    { id: 'scenes', icon: '▦', label: 'Scenes', options: [
      { id: 'change', icon: '⇄', label: 'Change', panel: () => bgPicker(sceneAtPlayhead()) },
      { id: 'add', icon: '+', label: 'Add', panel: () => bgPicker(null) },
      { id: 'layout', icon: '▦', label: 'Layout', panel: sceneLayoutPanel },
      { id: 'grade', icon: '◑', label: 'Grade', panel: () => [h('div', { class: 'tiles' }, ...(Object.keys(GRADES) as Grade[]).map((g) => tile({
        on: project.grade === g, label: GRADES[g].label, art: h('span', { class: `mood-art grade-${g}` }), onclick: () => { project.grade = g; changed(); },
      })))] },
      { id: 'scrim', icon: '◐', label: 'Darken', panel: () => [chips<Scrim>([{ value: 'light', label: 'Light' }, { value: 'normal', label: 'Normal' }, { value: 'strong', label: 'Strong' }],
        () => project.scrim, (v) => { project.scrim = v; }), note('Darkens the background behind the text so it stays readable.')] },
      { id: 'snap', icon: '🧲', label: 'Snap', toggle: { get: () => project.sceneSnap, set: (v) => { project.sceneSnap = v; } } },
    ] },
    { id: 'translation', icon: 'En', label: 'Translation', options: [
      { id: 'tr-show', icon: 'En', label: 'Show', toggle: { get: () => project.showTranslation, set: (v) => { project.showTranslation = v; rebuild(); } } },
      { id: 'tr-sync', icon: '⇄', label: 'Sync', disabled: () => !project.showTranslation, panel: () => [
        chips<TranslationMode>([{ value: 'words', label: 'Synced to the words' }, { value: 'ayah', label: 'Whole ayah' }],
          () => project.translationMode, (v) => { project.translationMode = v; rebuild(); }),
        note('Synced: word-by-word meanings (Quran.com) of the Arabic on screen. Whole ayah: Sahih International.')] },
      { id: 'tr-font', icon: 'Ff', label: 'Font', disabled: () => !project.showTranslation, panel: () => [
        chips<EnFont>([{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }], () => project.enFont, (v) => { project.enFont = v; rebuild(); })] },
    ] },
    { id: 'timing', icon: '⏱', label: 'Timing', options: [
      { id: 'pause', icon: '⏸', label: 'Pauses', panel: () => [
        row('Between all ayat', chips<string>(PAUSES.map((x) => ({ value: String(x), label: x ? `+${x} s` : 'Natural' })), () => String(project.pause), (v) => { project.pause = Number(v); arrange(); })),
        note('To change one pause, select an ayah\'s audio in the timeline and drag it left or right (only silence is ever cut).')] },
      { id: 'gap', icon: '⋯', label: 'Between ayat', panel: () => [
        chips<GapText>([{ value: 'hold', label: 'Keep the ayah' }, { value: 'clear', label: 'Clear' }], () => project.gap, (v) => { project.gap = v; arrange(); }),
        note('What the text does in the pause between ayat. To set one ayah, select its text in the timeline and drag its end.')] },
      { id: 'intro', icon: '⏮', label: 'Intro card', toggle: { get: () => project.intro, set: (v) => { project.intro = v; arrange(); } } },
      { id: 'outro', icon: '⏭', label: 'End card', toggle: { get: () => project.outro, set: (v) => { project.outro = v; arrange(); } } },
      { id: 'reset', icon: '↺', label: 'Reset edits', disabled: () => !hasEdits(), action: resetEdits },
    ] },
    { id: 'layout', icon: '⊞', label: 'Layout', options: [
      { id: 'title', icon: '۞', label: 'Surah name', panel: () => [
        row('Place', chips<TitlePos>([{ value: 'top', label: 'Top' }, { value: 'below', label: 'Below the ayah' }, { value: 'bottom', label: 'Bottom' }],
          () => project.titlePos, (v) => { project.titlePos = v; rebuild(); })),
        row('Size', chips<TitleSize>([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }],
          () => project.titleSize, (v) => { project.titleSize = v; rebuild(); }))] },
      { id: 'credit', icon: '🎙', label: 'Reciter name', toggle: { get: () => project.credit, set: (v) => { project.credit = v; rebuild(); } } },
      { id: 'watermark', icon: '©', label: 'Watermark', toggle: { get: () => project.watermark, set: (v) => { project.watermark = v; rebuild(); } } },
    ] },
  ];
  const EXPORT: Opt = { id: 'export', icon: '⬇', label: 'Export', panel: exportPanel };

  // --- block actions (when a block is selected in the timeline) ---
  const ayahNo = (i: number) => from + i;
  function selectionOptions(sel: NonNullable<Selection>): Opt[] {
    const i = sel.index;
    if (sel.kind === 'scene') {
      const count = tl?.scenes.length ?? 1;
      return [
        { id: 'replace', icon: '⇄', label: 'Replace', panel: () => bgPicker(i) },
        { id: 'left', icon: '◀', label: 'Move left', disabled: () => i === 0, action: () => moveScene(i, i - 1) },
        { id: 'right', icon: '▶', label: 'Move right', disabled: () => i >= count - 1, action: () => moveScene(i, i + 1) },
        { id: 'transition', icon: '◆', label: 'Transition', panel: transitionPanel },
        { id: 'delete', icon: '🗑', label: 'Delete', disabled: () => count < 2, action: () => removeScene(i) },
      ];
    }
    if (sel.kind === 'text') {
      return [
        { id: 'text-effect', icon: '✧', label: 'Effect', panel: effectPanel },
        { id: 'c-ar', icon: () => dot(project.colors.ar), label: 'Colour', panel: colourPanel('ar', 'Ayah') },
        { id: 'mode', icon: '☰', label: 'Text mode', panel: TOOLS[2].options[0].panel },
        { id: 'hold-reset', icon: '↺', label: 'Reset end', disabled: () => project.holds[ayahNo(i)] === undefined,
          action: () => { delete project.holds[ayahNo(i)]; arrange(); changed(); } },
      ];
    }
    const nudge = (d: number) => () => shiftAyah(i, d);
    const out: Opt[] = [];
    if (i > 0) {
      out.push({ id: 'less', icon: '⇤', label: 'Pause −0.5s', action: nudge(-0.5) },
        { id: 'more', icon: '⇥', label: 'Pause +0.5s', action: nudge(0.5) },
        { id: 'gap-reset', icon: '↺', label: 'Reset pause', disabled: () => project.gaps[ayahNo(i)] === undefined,
          action: () => { delete project.gaps[ayahNo(i)]; arrange(); changed(); } });
    }
    const last = i === (tl?.ayat.length ?? 1) - 1;
    if (i === 0 && from > 1 && to - from + 1 < MAX_AYAT) out.push({ id: 'add-prev', icon: '⊕', label: `Add ${n}:${from - 1}`, action: () => goRange(from - 1, to) });
    if (last && to < s.ayahs && to - from + 1 < MAX_AYAT) out.push({ id: 'add-next', icon: '⊕', label: `Add ${n}:${to + 1}`, action: () => goRange(from, to + 1) });
    if ((i === 0 || last) && to > from) out.push({ id: 'remove', icon: '✂', label: `Remove ${n}:${ayahNo(i)}`, action: () => (i === 0 ? goRange(from + 1, to) : goRange(from, to - 1)) });
    return out;
  }
  /** Whole ayat only (rule 1): change the selection at either end; the look is kept. */
  const goRange = (a: number, b: number) => { location.hash = `#/reel/${n}/${a}${b > a ? `-${b}` : ''}`; };
  /** Change the pause before ayah i by d seconds (the engine never cuts more than the reciter's silence). */
  function shiftAyah(i: number, d: number) {
    if (!base || !plan || i < 1) return;
    const now = plan.ayat[i].start - plan.ayat[i - 1].last;
    const natural = base.plan.ayat[i].start - base.plan.ayat[i - 1].last;
    project.gaps[ayahNo(i)] = Math.round((now + d - natural - project.pause) * 100) / 100;
    arrange();
    changed();
  }

  // --- bars and panels ---
  const wide = matchMedia('(min-width: 900px)');
  let tool: Tool | null = null; // its options are in the bottom bar
  let option: Opt | null = null; // its panel is open
  let selection: Selection = null;
  const panelTitle = h('h2', {});
  const panelBody = h('div', { class: 'sheet-body panel' });
  const panel = h('section', { class: 'sheet' },
    h('div', { class: 'sheet-head' }, panelTitle, h('button', { class: 'icon-btn sheet-close', 'aria-label': 'Done', onclick: () => openOption(null) }, '✓')),
    panelBody);
  const bar = h('nav', { class: 'toolbar', 'aria-label': 'Tools' });

  const iconOf = (o: Opt) => (typeof o.icon === 'function' ? o.icon() : o.icon);
  function barButton(o: Opt, onclick: () => void) {
    const on = o.toggle ? o.toggle.get() : option?.id === o.id;
    return h('button', {
      class: `tool${on ? ' on' : ''}${o.toggle ? ' toggle-tool' : ''}`, disabled: o.disabled?.() ?? false, onclick,
      'aria-pressed': o.toggle ? String(on) : undefined,
    }, h('span', { class: 'tool-icon', 'aria-hidden': 'true' }, iconOf(o)), h('span', {}, o.label));
  }
  function runOption(o: Opt) {
    if (exporting) return;
    if (o.toggle) {
      o.toggle.set(!o.toggle.get());
      changed();
    } else if (o.action) {
      o.action();
      refreshUI();
    } else openOption(option?.id === o.id && !wide.matches ? null : o);
  }
  function openTool(x: Tool | null) {
    tool = x;
    selection = null;
    option = null;
    // A tool with one panel opens it straight away; on wide screens the first panel shows too.
    const first = x?.options.find((o) => o.panel);
    if (x && first && (x.options.length === 1 || wide.matches)) option = first;
    refreshUI();
  }
  function openOption(o: Opt | null) {
    option = o;
    refreshUI();
  }
  function select(sel: Selection) {
    selection = sel;
    tool = null;
    option = null;
    refreshUI();
  }
  function refreshUI() {
    // Bottom bar: a selected block's actions, a tool's options, or the tools.
    if (selection) {
      const kind = selection.kind === 'scene' ? 'Scene' : selection.kind === 'text' ? 'Text' : 'Audio';
      bar.replaceChildren(
        h('button', { class: 'tool back', 'aria-label': 'Deselect', onclick: () => { select(null); spine.invalidate(); } },
          h('span', { class: 'tool-icon' }, '‹'), h('span', {}, kind)),
        ...selectionOptions(selection).map((o) => barButton(o, () => runOption(o))));
    } else if (tool) {
      bar.replaceChildren(
        h('button', { class: 'tool back', 'aria-label': 'Back to tools', onclick: () => openTool(null) },
          h('span', { class: 'tool-icon' }, '‹'), h('span', {}, tool.label)),
        ...tool.options.map((o) => barButton(o, () => runOption(o))));
    } else {
      bar.replaceChildren(...TOOLS.map((x) => h('button', { class: 'tool', onclick: () => openTool(x) },
        h('span', { class: 'tool-icon', 'aria-hidden': 'true' }, x.icon), h('span', {}, x.label))));
    }
    // Panel: the open option's controls (wide screens: a hint when none is open).
    const content = option?.panel?.();
    studio.classList.toggle('panel-open', !!content);
    panel.hidden = !content && !wide.matches;
    panelTitle.textContent = option ? (option.id.startsWith('c-') ? `Colour · ${option.label}` : option.label) : 'Ayah Studio';
    panelBody.replaceChildren(...(content ?? [note('Pick a tool below, or tap a block in the timeline to edit it.')]));
    spine.invalidate();
  }
  wide.addEventListener('change', refreshUI);

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
    resizeScenes: (bounds) => {
      if (!tl || exporting) return;
      toCustom();
      const edges = [0, ...bounds, tl.duration];
      project.sceneLengths = edges.slice(1).map((e, i) => e - edges[i]);
      project.sceneMode = 'custom';
      changed(false);
      rebuild();
    },
    moveScene: (a, b) => { if (!exporting) { moveScene(a, b); changed(); } },
    addScene: () => { if (!exporting) { tool = TOOLS.find((x) => x.id === 'scenes')!; selection = null; option = tool.options.find((o) => o.id === 'add')!; refreshUI(); } },
    setHold: (i, sec) => { if (!exporting) { project.holds[ayahNo(i)] = Math.round(sec * 100) / 100; arrange(); changed(); } },
    shiftAyah: (i, d) => { if (!exporting) shiftAyah(i, d); },
  });

  const studio = h('div', { class: 'studio' },
    h('header', { class: 'studio-top' },
      h('a', { class: 'icon-btn', href: `#/s/${n}/${from}`, 'aria-label': 'Back to reading' }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, 'New reel'), h('p', { class: 'muted' }, reference(s, from, to))),
      h('button', { class: 'icon-btn', 'aria-label': 'Device check', onclick: openDebugPanel }, '⚙'),
      h('button', { class: 'primary export-open', onclick: () => { selection = null; tool = null; openOption(EXPORT); } }, 'Export')),
    h('div', { class: 'studio-stage' }, h('div', { class: 'stage' }, canvas, status)),
    h('div', { class: 'transport' }, playBtn, timeLabel),
    spine.el,
    panel,
    bar);
  root.append(studio);
  refreshUI();

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
      base = reel;
      syncText = base.plan.wordTimed
        ? 'Text follows the reciter word by word.'
        : `Word timings are not available for this reciter here, so only Ayah mode is offered${base.plan.source === 'everyayah' ? ' (audio: everyayah.com)' : ''}.`;
      arrange();
      refreshUI();
      setStatus(mediaReady ? '' : 'Loading background…');
    } catch (e) {
      if (req === audioReq) setStatus(`${e instanceof Error ? e.message : e}. Check your connection and pick the reciter again.`);
    }
  }

  // Decoded media per scene entry; an entry keeps its media when the list changes around it.
  let bgReq = 0;
  async function loadScenes() {
    const req = ++bgReq;
    const pool = [...media];
    const next = await Promise.all(project.scenes.map((id) => {
      const k = pool.findIndex((m) => m.bg.id === id);
      if (k >= 0) return pool.splice(k, 1)[0];
      return loadBackground(backgroundById(id)).catch((e) => {
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


  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (exporting || !tl || !mediaReady) return;
    if (playing && ac) {
      t = startT + ac.currentTime - startCtx;
      if (t >= tl.duration) {
        pause();
        t = tl.duration;
      }
      dirty = true;
    }
    // Fetch the video frames for t (two during a transition); they are drawn on the next tick.
    void prepareScenes(sceneSpans(tl.scenes, project.transition), t, media, true)?.then(() => (dirty = true));
    spine.frame();
    if (!dirty) return;
    dirty = false;
    render(pctx, t, project, tl, media);
    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(tl.duration)}`;
  }
  raf = requestAnimationFrame(frame);

  // --- export ---
  let resultUrl = '';
  async function doExport() {
    const { path } = await capabilities();
    if (!path || !tl || !audio || !mediaReady) {
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
        project: structuredClone(project), timeline: tl!, audio: audio!, media: [...media], path: p, height: quality, signal,
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
    spine.dispose();
    exporting?.abort();
    pause();
    void ac?.close();
    for (const m of media) m.video?.dispose();
    URL.revokeObjectURL(resultUrl);
  };
}
