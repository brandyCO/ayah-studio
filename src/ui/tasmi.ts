// Tasmi' helpers for the lesson (src/ui/lesson.ts): the learner's own recording, kept on this device only
// (IndexedDB `recordings`, the latest one per range), and the similar ayat (mutashabihat) found in our own
// text by scripts/make-similar.mjs, shown side by side with the words that differ marked (colour only,
// the text never changed, rule 1).
import { tx } from '../data/db';
import { loadMeta, reference, surahText } from '../data/quran';
import { displayWords } from '../engine/words';
import { surahName, t } from '../i18n';
import { lt } from '../i18n/learn';
import { h } from './dom';

// --- recording ---

interface Rec { id: string; ref: string; blob: Blob; type: string; at: number }

export class Recorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  get on() { return !!this.mr && this.mr.state === 'recording'; }
  static get supported() { return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; }
  async start(): Promise<boolean> {
    if (this.on) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.chunks = [];
      this.mr = new MediaRecorder(this.stream);
      this.mr.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.mr.start(1000);
      return true;
    } catch { this.release(); return false; }
  }
  /** Stops and returns what was recorded (null when nothing was). */
  stop(): Promise<Blob | null> {
    const mr = this.mr;
    if (!mr || mr.state === 'inactive') { this.release(); return Promise.resolve(null); }
    return new Promise((resolve) => {
      mr.onstop = () => {
        const b = this.chunks.length ? new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' }) : null;
        this.release();
        resolve(b && b.size > 2000 ? b : null);
      };
      mr.stop();
    });
  }
  release() {
    this.stream?.getTracks().forEach((x) => x.stop());
    this.stream = null;
    this.mr = null;
  }
}

export const recKey = (s: number, a: number, b: number) => `tasmi:${s}:${a}-${b}`;
export async function keepRecording(id: string, blob: Blob) {
  try { await tx('recordings', 'readwrite', (st) => st.put({ id, ref: id, blob, type: blob.type, at: Date.now() } satisfies Rec)); } catch { /* storage full or blocked */ }
}
export async function recording(id: string): Promise<Blob | null> {
  try { const r = await tx<Rec | undefined>('recordings', 'readonly', (st) => st.get(id) as IDBRequest<Rec | undefined>); return r?.blob ?? null; } catch { return null; }
}

// --- similar ayat ---

let similarP: Promise<Record<string, string[]>> | null = null;
function similar(): Promise<Record<string, string[]>> {
  similarP ??= fetch(`${import.meta.env.BASE_URL}data/similar.json`).then((r) => (r.ok ? r.json() : {})).catch(() => { similarP = null; return {}; });
  return similarP;
}
/** The ayat in a..b of surah s that have similar ayat elsewhere. */
export async function similarIn(s: number, a: number, b: number): Promise<[number, string[]][]> {
  const d = await similar();
  const out: [number, string[]][] = [];
  for (let x = a; x <= b; x++) if (d[`${s}:${x}`]) out.push([x, d[`${s}:${x}`]]);
  return out;
}

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ ٠-٩]/g;
const fold = (w: string) => w.replace(MARKS, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ۥۦ]/g, '');
/** For each word of `a`, whether it is part of the longest common word sequence with `b`. */
function shared(a: string[], b: string[]): boolean[] {
  const fa = a.map(fold), fb = b.map(fold);
  const L = Array.from({ length: fa.length + 1 }, () => new Array<number>(fb.length + 1).fill(0));
  for (let i = fa.length - 1; i >= 0; i--) for (let j = fb.length - 1; j >= 0; j--) L[i][j] = fa[i] === fb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = new Array<boolean>(fa.length).fill(false);
  let i = 0, j = 0;
  while (i < fa.length && j < fb.length) {
    if (fa[i] === fb[j]) { out[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return out;
}
const marked = (ws: string[], same: boolean[]) => h('p', { class: 'ts-ayah', lang: 'ar', dir: 'rtl' },
  ...ws.flatMap((w, i) => [same[i] ? w : h('mark', { class: 'ts-diff' }, w), ' ']));

/** A sheet: each ayah of the range with its similar ayat, the differing words marked. */
export async function similarSheet(s: number, a: number, b: number) {
  const list = await similarIn(s, a, b);
  const meta = await loadMeta();
  const body = h('div', { class: 'ts-sim' }, h('p', { class: 'muted small' }, lt('learn.simLead')));
  const d = h('dialog', { class: 'sheet bottom learn-sheet ts-simsheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, lt('learn.simTitle')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    body);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  const mine = await surahText(s);
  for (const [x, others] of list) {
    const ws = displayWords(mine[x - 1]);
    const group = h('section', { class: 'ts-group' });
    for (const o of others) {
      const [s2, a2] = o.split(':').map(Number);
      const ws2 = displayWords((await surahText(s2))[a2 - 1]);
      group.append(h('div', { class: 'ts-pair' },
        h('div', { class: 'ts-side here' }, h('span', { class: 'ts-ref' }, reference(meta[s - 1], x)), marked(ws, shared(ws, ws2))),
        h('div', { class: 'ts-side' }, h('span', { class: 'ts-ref' }, `${surahName(meta[s2 - 1])} · ${o}`), marked(ws2, shared(ws2, ws)))));
    }
    body.append(group);
  }
}
