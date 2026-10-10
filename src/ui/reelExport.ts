// Export page for reels made outside the editor (the wall's keepsake reel): the same full-screen
// progress page, encoder and Save/Share actions as the editor's Export, over a finished timeline.
import { capabilities } from '../engine/capabilities';
import type { BackgroundMedia } from '../engine/backgrounds';
import { exportVideo } from '../engine/export';
import type { Project } from '../engine/project';
import type { Timeline } from '../engine/timeline';
import { isNative, saveVideo, shareFile, type SavedFile } from '../native';
import { h, toast } from './dom';
import { lanternProgress } from './lanternProgress';
import { icon } from './icons';

export interface ExportJob {
  project: Project;
  timeline: Timeline;
  audio: AudioBuffer;
  media: BackgroundMedia[];
  name: string; // file name without extension
  height?: 1920 | 1280;
  /** Extra content on the result page (e.g. credits). */
  extra?: Node | null;
}

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

/** Runs the export with its own full-screen page; resolves when the page is closed. */
export async function exportReel(job: ExportJob): Promise<void> {
  const { path } = await capabilities();
  if (!path) return void toast('Export is not supported in this browser');
  const height = job.height ?? 1920;
  const ac = new AbortController();
  const bar = lanternProgress(); // a lantern filling with light (docs/light.md, L5)
  const pct = h('div', { class: 'export-pct' }, '0%');
  const progress = h('div', { class: 'export-progress' }, bar.el, pct,
    h('p', { class: 'muted small' }, 'Keep this screen open while the video is made on your device.'),
    h('button', { class: 'chip', onclick: () => ac.abort() }, 'Cancel'));
  const result = h('div', { class: 'export-result', hidden: true });
  const overlay = h('div', { class: 'export-overlay' }, progress, result);
  document.body.append(overlay);
  let url = '';
  const close = () => {
    overlay.remove();
    URL.revokeObjectURL(url);
    window.removeEventListener('hashchange', leave);
  };
  const leave = () => { ac.abort(); close(); };
  window.addEventListener('hashchange', leave);
  const setProgress = (f: number) => {
    bar.set(f);
    pct.textContent = `${Math.round(f * 100)}%`;
  };
  const started = performance.now();
  return new Promise<void>((resolve) => {
    const run = (p: typeof path) => exportVideo({
      project: structuredClone(job.project), timeline: job.timeline, audio: job.audio, media: [...job.media], path: p, height, signal: ac.signal,
      onProgress: setProgress,
    });
    // Some hardware encoders reject a config they claimed to support: retry once in software.
    run(path).catch((e) => {
      if (!path.hardware || ac.signal.aborted) throw e;
      console.warn('Hardware encode failed, retrying in software', e);
      return run({ ...path, hardware: false });
    }).then((blob) => {
      const name = `${job.name}.${path.container}`;
      url = URL.createObjectURL(blob);
      const file = new File([blob], name, { type: blob.type });
      const canShare = !!navigator.canShare?.({ files: [file] });
      progress.hidden = true;
      result.replaceChildren(
        h('video', { src: url, controls: true, playsInline: true, class: 'result-video' }),
        h('p', { class: 'small' }, `✓ Made in ${((performance.now() - started) / 1000).toFixed(1)} s · ${(blob.size / 1e6).toFixed(1)} MB · ${height === 1920 ? '1080P' : '720P'}`),
        job.extra ?? '',
        isNative() ? nativeActions(blob, name) : h('div', { class: 'export-actions' },
          h('a', { class: 'primary', href: url, download: name }, icon('save', 18), 'Save to device'),
          canShare && h('button', { class: 'primary alt', onclick: () => navigator.share({ files: [file] }).catch(() => {}) }, icon('share', 18), 'Share')),
        h('button', { class: 'chip done', onclick: () => { close(); resolve(); } }, 'Done'));
      result.hidden = false;
    }, (e) => {
      close();
      if ((e as Error).name !== 'AbortError' && !ac.signal.aborted) {
        toast(`Export failed: ${e instanceof Error ? e.message : e}`);
        console.error(e);
      } else toast('Export cancelled');
      resolve();
    });
  });
}
