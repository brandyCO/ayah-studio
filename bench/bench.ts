// Studio render bench: ms per frame of render() for each touch / text effect / transition.
// Run: npx vite --port 5199, open /bench/?w=720 (driven by scripts/studio-bench.mjs).
import { render } from '../src/engine/render';
import { buildTimeline } from '../src/engine/timeline';
import { newProject, frameStyle, type Project } from '../src/engine/project';
import { planClipReel } from '../src/engine/recitation';
import { loadBackground, backgroundById } from '../src/engine/backgrounds';
import { reciterById } from '../src/data/reciters';
import { loadMeta, surahText, surahTranslation } from '../src/data/quran';
import { TOUCHES } from '../src/engine/touches';
import { TEXT_EFFECTS } from '../src/engine/effects';
import { TRANSITIONS } from '../src/engine/scenes';
import { W } from '../src/engine/layout';

const q = new URLSearchParams(location.search);
const width = Number(q.get('w') ?? 720);
const frames = Number(q.get('n') ?? 60);
const out = document.getElementById('o')!;

async function main() {
  await document.fonts.load('80px UthmanicHafs');
  const meta = await loadMeta();
  const s = meta[1];
  const from = 255, to = 256;
  const ar = (await surahText(2)).slice(from - 1, to);
  const en = (await surahTranslation(2, 'en-sahih').catch(() => [] as string[])).slice(from - 1, to);
  const c = document.getElementById('c') as HTMLCanvasElement;
  c.width = width; c.height = Math.round(width * 16 / 9);
  const ctx = c.getContext('2d')!;
  const base = newProject(2, from, to, 7);
  const make = (p: Project, scenes: string[]) => {
    const plan = planClipReel(from, [12, 10]);
    const tl = buildTimeline(ctx, {
      surah: s, reciter: reciterById(p.reciterId), plan, arabic: ar, english: en.length ? en : ar.map(() => 'Allah — there is no deity except Him'),
      meanings: ar.map(() => []), mode: 'ayah', wordsPerStep: 2, translationMode: 'ayah', style: frameStyle(p),
      sceneMode: scenes.length > 1 ? 'even' : 'single', sceneCount: scenes.length, sceneLengths: [],
    });
    return tl;
  };
  const media = new Map<string, Awaited<ReturnType<typeof loadBackground>>>();
  for (const id of ['mist', 'night', 'dunes']) media.set(id, await loadBackground(backgroundById(id)!));

  async function run(label: string, mut: (p: Project) => void, t0 = 2, scenes = ['mist']) {
    const p: Project = { ...structuredClone(base), mode: undefined } as unknown as Project;
    p.textMode = 'ayah'; p.translationMode = 'ayah'; p.scenes = scenes; p.cinema = false;
    mut(p);
    const tl = make(p, p.scenes);
    const m = p.scenes.map((id) => media.get(id));
    const k = c.width / W;
    // warm up
    for (let i = 0; i < 5; i++) { ctx.setTransform(k, 0, 0, k, 0, 0); render(ctx, t0 + i / 30, p, tl, m); }
    const ts: number[] = [];
    for (let i = 0; i < frames; i++) {
      const a = performance.now();
      ctx.setTransform(k, 0, 0, k, 0, 0);
      render(ctx, t0 + i / 30, p, tl, m);
      ctx.getImageData(0, 0, 1, 1); // wait for the GPU like a presented frame would
      ts.push(performance.now() - a);
      await new Promise((r) => setTimeout(r, 0));
    }
    ts.sort((x, y) => x - y);
    const avg = ts.reduce((x, y) => x + y, 0) / ts.length;
    return { label, avg: +avg.toFixed(1), p90: +ts[Math.floor(ts.length * 0.9)].toFixed(1) };
  }
  const rows = [];
  rows.push(await run('baseline (mist video, rise)', () => {}));
  rows.push(await run('baseline image', () => {}, 2, ['night']));
  rows.push(await run('cinematic', (p) => { p.cinema = true; }));
  rows.push(await run('grain+vignette', (p) => { p.grain = true; p.vignette = true; }));
  for (const tch of TOUCHES) rows.push(await run(`touch:${tch}`, (p) => { p.touches = [tch]; }));
  rows.push(await run('touch:4 (ripple,caustics,bloom,mist)', (p) => { p.touches = ['ripple', 'caustics', 'bloom', 'mist']; }));
  for (const fx of TEXT_EFFECTS) rows.push(await run(`text:${fx.value} (entering)`, (p) => { p.textEffect = fx.value; }, 0.45));
  for (const tr of TRANSITIONS) rows.push(await run(`transition:${tr.value}`, (p) => { p.transition = tr.value; }, 11.1, ['mist', 'night']));
  out.textContent = JSON.stringify(rows);
  (window as unknown as { benchDone: unknown }).benchDone = rows;
}
main().catch((e) => { out.textContent = 'ERR ' + (e?.stack ?? e); (window as unknown as { benchDone: unknown }).benchDone = String(e); });
