// Check the word-timed text modes against real Quran.com QDC timings: `node scripts/check-text-modes.mjs`
// (needs network for api.quran.com). Loads the real engine modules through Vite and measures text with
// a stub canvas (approximate glyph widths), then asserts for every reciter × selection × mode:
//   - every word appears exactly once, in order, and the groups join back to the exact ayah text
//   - group times only move forward (text never jumps backwards, also through repetitions)
//   - no group is shorter than 0.6 s unless merging would not fit; every group fits its box
//   - malformed segments are ignored and missing words interpolated (no word dropped)
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const load = (p) => server.ssrLoadModule(p);
const words = await load('/src/engine/words.ts');
const rec = await load('/src/engine/recitation.ts');
const { buildTimeline } = await load('/src/engine/timeline.ts');
const layout = await load('/src/engine/layout.ts');

const data = (f) => readFile(new URL(`../public/data/${f}`, import.meta.url), 'utf8').then(JSON.parse);
const [quran, en, meta, wordMap] = await Promise.all([data('quran-uthmani.json'), data('en-sahih.json'), data('meta.json'), data('word-map.json')]);

let failures = 0, checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// Stub 2D context: Arabic base letters ≈ 0.42 em (marks have no width), Latin ≈ 0.5 em, space 0.25 em.
const ctx = {
  font: '80px x',
  direction: 'rtl',
  measureText(text) {
    const size = Number(/(\d+)px/.exec(this.font)[1]);
    let w = 0;
    for (const ch of text) {
      if (ch === ' ' || ch === ' ') w += 0.25;
      else if (/[ً-ٰٟۖ-ۭ]/.test(ch)) w += 0;
      else w += /[؀-ۿ]/.test(ch) ? 0.42 : 0.5;
    }
    return { width: w * size };
  },
};

async function qdc(reciter, chapter) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`https://api.quran.com/api/qdc/audio/reciters/${reciter}/audio_files?chapter=${chapter}&segments=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const f = (await res.json()).audio_files[0];
      return new Map(f.verse_timings.map((v) => [v.verse_key, v]));
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

const RECITERS = [7, 173, 3, 10, 6, 12, 2, 1, 9, 4, 5, 97, 161];
const SELECTIONS = [[2, 255, 255], [2, 282, 282], [2, 1, 5], [2, 72, 72], [2, 181, 181], [1, 1, 7], [103, 1, 3], [112, 1, 4]];
const MODES = [['ayah', 1], ['line', 1], ['half', 1], ['words', 1], ['words', 2], ['words', 3]];
const surah = (n) => meta[n - 1];
const reciter = { id: 0, name: 'Test', short: 'Test', everyayah: '' };

const stats = { repeats: 0, malformed: 0, interpolated: 0, unmergedShort: 0, timelines: 0, groups: 0 };

function checkTimeline(tl, label, texts) {
  let lastPos = [-1, -1];
  tl.ayat.forEach((a, i) => {
    const text = texts[i];
    const dw = words.displayWords(text);
    // Every word exactly once, in order; joined back = the exact ayah text.
    const got = a.ar.flatMap((g) => words.displayWords(g.lines.join(' ')));
    assert(got.length === dw.length && got.every((w, k) => w === dw[k]), `${label} ${a.ayah}: words once, in order`);
    assert(a.ar.flatMap((g) => g.lines).join(' ') === text, `${label} ${a.ayah}: groups join to the exact ayah`);
    const box = layout.boxes(true);
    a.ar.forEach((g, k) => {
      stats.groups++;
      assert(Number.isFinite(g.start) && Number.isFinite(g.end), `${label} ${a.ayah}: finite times`);
      if (k > 0) assert(g.start >= a.ar[k - 1].start && Math.abs(a.ar[k - 1].end - g.start) < 1e-9, `${label} ${a.ayah}: groups follow each other`);
      assert(g.start >= a.start - 1e-9 && g.end <= a.end + 1e-9, `${label} ${a.ayah}: group inside its ayah`);
      assert(g.size >= 64, `${label} ${a.ayah}: legible size`);
      ctx.font = `${g.size}px x`;
      assert(g.lines.every((l) => ctx.measureText(l).width <= layout.TEXT_W + 1), `${label} ${a.ayah}: lines fit the width`);
      if (tl.mode !== 'ayah' && g.end - g.start < words.MIN_GROUP - 1e-9) {
        // Allowed only if merging with a neighbour would not fit.
        const nb = a.ar[k + 1] ?? a.ar[k - 1];
        const merged = nb ? (k + 1 < a.ar.length ? [...g.lines, ...nb.lines] : [...nb.lines, ...g.lines]) : null;
        const fits = merged && layout.fitArabic(ctx, words.displayWords(merged.join(' ')), layout.AR_SIZES[tl.mode], box.ar);
        assert(!fits, `${label} ${a.ayah}: short group ${(g.end - g.start).toFixed(2)} s could have merged`);
        stats.unmergedShort++;
      }
    });
    if (i > 0) assert(a.start >= tl.ayat[i - 1].end, `${label}: ayat do not overlap`);
  });
  // Never jumps backwards: sample the reel and require the (ayah, first word) shown to only increase.
  for (let t = 0; t < tl.duration; t += 0.02) {
    const ai = tl.ayat.findIndex((a) => t >= a.start && t < a.end);
    if (ai < 0) continue;
    const g = tl.ayat[ai].ar.findIndex((x) => t >= x.start && t < x.end);
    if (g < 0) continue;
    const pos = [ai, g];
    assert(pos[0] > lastPos[0] || (pos[0] === lastPos[0] && pos[1] >= lastPos[1]), `${label}: text jumped backwards at ${t.toFixed(2)} s`);
    lastPos = pos;
  }
}

const chapters = [...new Set(SELECTIONS.map(([s]) => s))];
for (const r of RECITERS) {
  const timings = new Map();
  for (const c of chapters) for (const [k, v] of await qdc(r, c)) timings.set(k, v);
  for (const [s, from, to] of SELECTIONS) {
    const texts = quran.surahs[s - 1].slice(from - 1, to);
    const plan = rec.planQdcReel(timings, s, from, texts, wordMap.map);
    if (!plan) {
      // Only allowed when QDC really has no timing for an ayah (the app then uses everyayah).
      const missing = texts.map((_, i) => `${s}:${from + i}`).filter((k) => !timings.get(k) || !words.recitedSpan(timings.get(k)));
      assert(missing.length > 0, `reciter ${r} ${s}:${from}-${to}: QDC plan`);
      console.log(`note: reciter ${r} has no timing for ${missing.join(', ')} → everyayah fallback`);
      continue;
    }
    if (!plan.wordTimed) console.log(`note: reciter ${r} ${s}:${from}-${to} has an ayah without word timings → Ayah mode only`);
    for (const a of plan.ayat) {
      if (!a.stats) continue;
      stats.repeats += a.stats.repeats;
      stats.malformed += a.stats.malformed;
      stats.interpolated += a.stats.interpolated;
      assert(a.wordStart.every(Number.isFinite), `reciter ${r} ${s}:${a.ayah}: every word timed`);
    }
    for (const [mode, n] of MODES) {
      for (const showTranslation of [true, false]) {
        const label = `reciter ${r} ${s}:${from}-${to} ${mode}${mode === 'words' ? n : ''}${showTranslation ? '+en' : ''}`;
        try {
          const tl = buildTimeline(ctx, { surah: surah(s), reciter, plan, arabic: texts, english: en.surahs[s - 1].slice(from - 1, to), mode, wordsPerStep: n, showTranslation });
          stats.timelines++;
          checkTimeline(tl, label, texts);
        } catch (e) {
          assert(false, `${label}: ${e.message}`);
        }
      }
    }
  }
}

// --- targeted edge cases ---
const sudais = new Map([...await qdc(3, 103)]);
{
  // Repetition: Sudais 103:3 reads words 1–5, then restarts from word 1 to the end.
  const v = sudais.get('103:3');
  const idx = words.validSegments(v.segments).map((x) => x[0]);
  assert(idx.indexOf(1, 1) > 0, 'Sudais 103:3 has a repetition');
  const wt = words.wordTimings(words.displayWords(quran.surahs[102][2]).length, v, null);
  assert(wt.stats.repeats > 0, 'repetition counted');
  const second6 = words.validSegments(v.segments).find((x) => x[0] === 6)[1] / 1000;
  assert(Math.abs(wt.start[5] - second6) < 1e-9, 'word 6 is timed after the repeat');
  const groups = words.timeGroups(layout.wordUnits(wt.start.length, 1), wt.start, wt.last);
  const g5 = groups.find((g) => g.first <= 4 && 4 <= g.last);
  assert(g5.end >= second6 - 1e-9, 'word 5 holds while the reciter repeats (no jump back)');
}
{
  // Malformed segments: [1], [2] (Alafasy 1:3) and [50, start] (Alafasy 2:255) are ignored.
  const alafasy = new Map([...await qdc(7, 1), ...await qdc(7, 2)]);
  const v13 = alafasy.get('1:3');
  assert(v13.segments.some((x) => x.length < 3), 'Alafasy 1:3 has malformed segments');
  const wt = words.wordTimings(2, v13, null);
  assert(wt && wt.stats.malformed > 0 && wt.start.every(Number.isFinite), 'Alafasy 1:3 timed despite malformed segments');
  const v255 = alafasy.get('2:255');
  const wt255 = words.wordTimings(words.displayWords(quran.surahs[1][254]).length, v255, null);
  assert(wt255.stats.malformed === 1 && wt255.stats.interpolated === 0, 'Alafasy 2:255: one malformed segment, nothing missing');
}
{
  // Missing word: drop word 3's segment and add junk; it is interpolated between words 2 and 4.
  const v = { verse_key: 'x', timestamp_from: 0, timestamp_to: 6000, segments: [[1, 100, 900], [2, 900, 2000], [3], [3, 2500, 2400], [405867], [4, 3000, 4000], [5, 4000, 5500]] };
  const wt = words.wordTimings(5, v, null);
  assert(wt.stats.interpolated === 1 && wt.start[2] >= 2.0 && wt.start[2] <= 3.0, 'missing word interpolated between neighbours');
  assert(words.wordTimings(3, { verse_key: 'y', timestamp_from: 0, timestamp_to: 1000, segments: [[1], [2, 5]] }, null) === null, 'no valid segment → no word timing (never guess sync)');
}
{
  // Word map: in 2:181 Quran.com word 3 covers our words 3–4 ("بَعۡدَ مَا"); they share one time.
  const v = (await qdc(7, 2)).get('2:181');
  const wt = words.wordTimings(words.displayWords(quran.surahs[1][180]).length, v, words.parseSpans(wordMap.map['2:181']));
  assert(wt.start[2] === wt.start[3], '2:181 grouped API word times both of our words');
}
{
  // Everyayah fallback plan: Ayah mode only, pages by word count.
  const plan = rec.planClipReel(282, [120]);
  const tl = buildTimeline(ctx, { surah: surah(2), reciter, plan, arabic: [quran.surahs[1][281]], english: [en.surahs[1][281]], mode: 'words', wordsPerStep: 1, showTranslation: true });
  assert(tl.ayat[0].joint && tl.ayat[0].ar.length > 1, 'fallback: Ayah mode, 2:282 paginated');
  checkTimeline(tl, 'fallback 2:282', [quran.surahs[1][281]]);
}

await server.close();
console.log(`${failures ? 'FAILED' : 'OK'}: ${checks} checks, ${failures} failures · ${stats.timelines} timelines, ${stats.groups} groups · segments: ${stats.repeats} repeats, ${stats.malformed} malformed, ${stats.interpolated} words interpolated · ${stats.unmergedShort} short groups that could not merge`);
process.exit(failures ? 1 : 0);
