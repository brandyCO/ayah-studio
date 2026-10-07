// Check the word-timed text modes against real Quran.com QDC timings: `node scripts/check-text-modes.mjs`
// (needs network for api.quran.com). Loads the real engine modules through Vite and measures text with
// a stub canvas (approximate glyph widths), then asserts for every reciter × selection × mode ×
// translation (and title/credit/watermark layouts):
//   - every on-screen group is an exact run of whole words; every word is shown at least once
//   - the text follows the recitation: whenever a word is recited, the words on screen include it,
//     so a repeated word or phrase is shown again
//   - the synced translation is exactly the meanings of the Arabic words on screen
//   - no group is shorter than 0.6 s unless merging would not fit; everything fits its box, inside
//     the title-safe area, without overlapping the surah name, credit or watermark
//   - malformed segments are ignored and missing words interpolated (no word dropped)
//   - text sizes (Small/Large) and the sans translation font lay out within the same rules
//   - pacing (pause between ayat, intro/closing cards): cuts fall between words, every time moves
//     with its ayah, the text still follows the recitation and stays clear of the cards
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
const [quran, en, meta, wordMap, wbw] = await Promise.all([data('quran-uthmani.json'), data('en-sahih.json'), data('meta.json'), data('word-map.json'), data('en-wbw.json')]);

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
const STYLE = { titlePos: 'top', titleSize: 'm', credit: false, watermark: true };
const STYLES = [STYLE, { titlePos: 'below', titleSize: 'l', credit: true, watermark: true }, { titlePos: 'bottom', titleSize: 's', credit: true, watermark: false }, { titlePos: 'bottom', titleSize: 'l', credit: false, watermark: true },
  { ...STYLE, textSize: 'l', enFont: 'sans' }, { titlePos: 'below', titleSize: 'm', credit: false, watermark: true, textSize: 's' }];
const surah = (n) => meta[n - 1];
const reciter = { id: 0, name: 'Test', short: 'Test', everyayah: '' };
const norm = (x) => x.split(/\s+/).filter(Boolean).join(' ');

const stats = { repeats: 0, malformed: 0, interpolated: 0, unmergedShort: 0, timelines: 0, events: 0, shownAgain: 0 };

const meaningsOf = (s, from, texts) => texts.map((t, i) =>
  words.wordMeanings(wbw.surahs[s - 1][from - 1 + i], words.parseSpans(wordMap.map[`${s}:${from + i}`]), words.displayWords(t).length));

function build(s, from, texts, plan, mode, n, tr, style) {
  return buildTimeline(ctx, {
    surah: surah(s), reciter, plan, arabic: texts, english: en.surahs[s - 1].slice(from - 1, texts.length + from - 1),
    meanings: meaningsOf(s, from, texts), mode, wordsPerStep: n, translationMode: tr === 'ayah' ? 'ayah' : 'words',
    style: { ...style, translation: tr !== 'off' },
  });
}

function checkLayout(lay, style, label) {
  const z = layout.TITLE_SIZES[style.titleSize];
  const T = Math.round((z.name + z.ref) * 1.4);
  const title = [lay.title, lay.title + T];
  const S = layout.SAFE;
  assert(lay.ar.top >= S.y0 && lay.en.bottom <= S.y1 && title[0] >= S.y0 && title[1] <= S.y1, `${label}: inside the title-safe area`);
  for (const b of [lay.ar, lay.en]) if (b.bottom > b.top) assert(title[1] <= b.top || title[0] >= b.bottom, `${label}: surah name does not overlap the text`);
  assert(lay.ar.bottom <= lay.en.top || lay.en.bottom === lay.en.top, `${label}: Arabic above translation`);
  if (style.titlePos === 'below') assert(lay.title >= Math.max(lay.ar.bottom, lay.en.bottom) + 30, `${label}: room for the surah name under the translation`);
  for (const y of [lay.credit, lay.watermark]) if (y !== null) assert(y - 20 >= Math.max(lay.en.bottom, lay.ar.bottom, title[1]) && y + 20 <= S.y1, `${label}: footer clear of everything`);
}

function checkTimeline(tl, label, texts, plan, meanings, synced) {
  const lay = tl.layout;
  const fitsBox = (f, lh, box) => f.lines.length * f.size * lh <= box.bottom - box.top + 1e-6;
  tl.ayat.forEach((a, i) => {
    const dw = words.displayWords(texts[i]);
    const p = plan.ayat[i];
    const mode = p.seq ? tl.mode : 'ayah';
    const seen = new Array(dw.length).fill(false);
    a.events.forEach((e, k) => {
      stats.events++;
      for (let w = e.first; w <= e.last; w++) seen[w] = true;
      assert(e.ar.lines.join(' ') === dw.slice(e.first, e.last + 1).join(' '), `${label} ${a.ayah}: group is an exact run of words`);
      if (synced) assert(e.en && norm(e.en.lines.join(' ')) === norm(meanings[i].slice(e.first, e.last + 1).join(' ')), `${label} ${a.ayah}: translation = meanings of the words shown`);
      assert(Number.isFinite(e.start) && Number.isFinite(e.end), `${label} ${a.ayah}: finite times`);
      if (k > 0) assert(e.start >= a.events[k - 1].start && Math.abs(a.events[k - 1].end - e.start) < 1e-9, `${label} ${a.ayah}: events follow each other`);
      if (e.start < a.end) assert(e.start >= a.start - 1e-9, `${label} ${a.ayah}: event inside its ayah`);
      assert(e.ar.size >= 64 && fitsBox(e.ar, layout.AR_LINE, lay.ar), `${label} ${a.ayah}: Arabic fits, legible size`);
      if (e.en) assert(fitsBox(e.en, layout.EN_LINE, lay.en), `${label} ${a.ayah}: translation fits`);
      ctx.font = `${e.ar.size}px x`;
      assert(e.ar.lines.every((l) => ctx.measureText(l).width <= layout.TEXT_W + 1), `${label} ${a.ayah}: lines fit the width`);
      if (mode !== 'ayah' && e.end - e.start < words.MIN_GROUP - 1e-9 && e.start < a.end) {
        // Allowed only if no neighbour joins it into one run of words that fits.
        const joinable = [a.events[k - 1], a.events[k + 1]].some((nb) => {
          if (!nb || !(nb.first <= e.last + 1 && e.first <= nb.last + 1)) return false;
          const f = Math.min(nb.first, e.first), l = Math.max(nb.last, e.last);
          return layout.fitArabic(ctx, dw.slice(f, l + 1), lay.arSizes[mode], lay.ar) && (!synced || layout.fitEnglish(ctx, meanings[i].slice(f, l + 1).join(' '), lay.en, lay.enSizes, lay.enFont));
        });
        assert(!joinable, `${label} ${a.ayah}: short group ${(e.end - e.start).toFixed(2)} s could have merged`);
        stats.unmergedShort++;
        stats.shortest = Math.min(stats.shortest ?? Infinity, e.end - e.start);
        if (process.env.SHOW_SHORT) console.log(`short: ${label} ${a.ayah} ev ${k}: [${e.first}-${e.last}] ${(e.end - e.start).toFixed(2)} s · prev ${a.events[k - 1] ? `[${a.events[k - 1].first}-${a.events[k - 1].last}]` : "-"} next ${a.events[k + 1] ? `[${a.events[k + 1].first}-${a.events[k + 1].last}]` : "-"}`);
      }
    });
    assert(seen.every(Boolean), `${label} ${a.ayah}: every word shown`);
    // The text follows the recitation, repeats included.
    const seq = p.seq ?? [];
    seq.forEach(([w, st], k) => {
      if (k + 1 < seq.length && seq[k + 1][1] < st + 0.05) return; // overlapping/zero-length source timing
      const t = st + 0.02;
      if (st < a.start || t >= a.end) return;
      const e = a.events.find((x) => t >= x.start && t < x.end);
      assert(e && e.first <= w && w <= e.last, `${label} ${a.ayah}: word ${w + 1} recited at ${st.toFixed(2)} s is on screen`);
    });
    const firsts = new Set();
    for (const e of a.events) { const key = `${e.first}-${e.last}`; if (firsts.has(key)) stats.shownAgain++; firsts.add(key); }
    if (i > 0) assert(a.start >= tl.ayat[i - 1].end, `${label}: ayat do not overlap`);
  });
}

const PACINGS = [{ pause: 1, hold: true, intro: 3, outro: 3 }, { pause: 0.5, hold: false, intro: 0, outro: 3 }, { pause: 0, hold: true, intro: 3, outro: 0 }];

function checkPacing(base, pc, label, s, from, texts, meanings) {
  const plan = rec.arrangeReel(base, pc);
  const n = base.ayat.length;
  assert(Math.abs(plan.duration - (base.duration + pc.intro + pc.outro + (n - 1) * pc.pause)) < 1e-9, `${label}: length`);
  const P = plan.pieces;
  assert(P.length === n && P[0].from === 0 && P[n - 1].to === base.duration, `${label}: audio pieces cover the whole recitation`);
  P.forEach((x, i) => {
    assert(Math.abs(x.at - (x.from + pc.intro + i * pc.pause)) < 1e-9 && x.to >= x.from, `${label}: piece ${i} placed after its pause`);
    if (i + 1 < n) {
      assert(x.to === P[i + 1].from, `${label}: pieces are contiguous`);
      // The cut falls in the reciter's own pause: after this ayah's last word, before the next ayah.
      const a = base.ayat[i], b = base.ayat[i + 1];
      assert(x.to <= b.start + 1e-9 && (x.to >= a.last - 1e-9 || x.to === b.start), `${label}: cut ${i} between words`);
      if (a.seq) assert(a.seq.every(([, , e]) => e <= x.to + 1e-9 || x.to === b.start), `${label}: no word of ayah ${a.ayah} cut`);
    }
  });
  plan.ayat.forEach((a, i) => {
    const d = pc.intro + i * pc.pause, b = base.ayat[i];
    assert(Math.abs(a.start - b.start - d) < 1e-9 && Math.abs(a.last - b.last - d) < 1e-9, `${label}: ayah ${a.ayah} moved with its audio`);
    if (b.seq) assert(a.seq.every(([w, st, e], k) => w === b.seq[k][0] && Math.abs(st - b.seq[k][1] - d) < 1e-9 && Math.abs(e - b.seq[k][2] - d) < 1e-9), `${label}: words of ${a.ayah} moved with their audio`);
    if (pc.hold && i + 1 < n) assert(a.end >= plan.ayat[i + 1].start - 0.15 - 1e-9, `${label}: ayah ${a.ayah} held until the next`);
    assert(a.start >= pc.intro && a.end <= plan.duration - pc.outro - 0.2 + 1e-9, `${label}: ayah ${a.ayah} clear of the cards`);
  });
  for (const [mode, k] of [['line', 1], ['words', 2], ['ayah', 1]]) {
    const tl = build(s, from, texts, plan, mode, k, 'words', STYLE);
    assert(tl.intro === pc.intro && tl.outro === pc.outro, `${label}: cards on the timeline`);
    checkTimeline(tl, `${label} ${mode}`, texts, plan, meanings, true);
    for (const a of tl.ayat) for (const e of a.events) if (e.start < a.end) assert(e.start >= pc.intro && e.end <= plan.duration - pc.outro, `${label} ${mode}: text clear of the cards`);
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
    const meanings = meaningsOf(s, from, texts);
    for (const style of r === 7 ? STYLES : [STYLE]) {
      for (const [mode, n] of MODES) {
        for (const tr of ['words', 'ayah', 'off']) {
          const label = `reciter ${r} ${s}:${from}-${to} ${mode}${mode === 'words' ? n : ''} en:${tr} title:${style.titlePos}/${style.titleSize}${style.credit ? '+credit' : ''}${style.textSize ? ` size:${style.textSize}` : ''}`;
          try {
            const tl = build(s, from, texts, plan, mode, n, tr, style);
            stats.timelines++;
            checkLayout(tl.layout, style, label);
            checkTimeline(tl, label, texts, plan, meanings, tr === 'words');
          } catch (e) {
            assert(false, `${label}: ${e.message}`);
          }
        }
      }
    }
    for (const pc of PACINGS) checkPacing(plan, pc, `reciter ${r} ${s}:${from}-${to} pause:${pc.pause}${pc.hold ? ' hold' : ''}${pc.intro ? ' cards' : ''}`, s, from, texts, meanings);
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
  // Shown again: in Words mode (1 per step) word 1 is on screen twice, the second time after word 5.
  const ev = words.timeEvents(layout.wordUnits(wt.start.length, 1), wt.seq, wt.last, () => false);
  const w1 = ev.filter((e) => e.first === 0);
  assert(w1.length === 2 && w1[1].start > ev.find((e) => e.first === 4).start, 'repeated words are shown again');
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
  // Mislabelled indices (seen in the data) are dropped; real repetitions are kept.
  const seg = (ix) => ({ verse_key: 'z', timestamp_from: 0, timestamp_to: ix.length * 500, segments: ix.map((i, k) => [i, k * 500, k * 500 + 480]) });
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  const ahead = words.wordTimings(130, seg([...range(1, 34), 118, ...range(36, 130)]), null);
  assert(ahead.stats.malformed === 1 && ahead.stats.repeats === 0 && ahead.stats.interpolated === 1, 'jump-ahead mislabel dropped (2:282 pattern)');
  const back = words.wordTimings(50, seg([...range(1, 45), 22, 23, ...range(48, 50)]), null);
  assert(back.stats.malformed === 2 && back.stats.repeats === 0 && back.stats.interpolated === 2, 'jump-back mislabel dropped (2:213 pattern)');
  const real = words.wordTimings(9, seg([...range(1, 5), ...range(1, 9)]), null);
  assert(real.stats.malformed === 0 && real.stats.repeats === 4 && real.seq.length === 14, 'real repetition kept');
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
  const texts = [quran.surahs[1][281]];
  for (const tr of ['words', 'ayah']) {
    const tl = build(2, 282, texts, plan, 'words', 1, tr, STYLE);
    assert(tl.ayat[0].events.length > 1 && tl.ayat[0].events.every((e) => e.en), `fallback (${tr}): Ayah mode, 2:282 paginated with its translation`);
    checkTimeline(tl, `fallback 2:282 en:${tr}`, texts, plan, meaningsOf(2, 282, texts), tr === 'words');
  }
  const multi = rec.planClipReel(1, [4, 3.5, 5]);
  for (const pc of PACINGS) checkPacing(multi, pc, `fallback 1:1-3 pause:${pc.pause}`, 1, 1, quran.surahs[0].slice(0, 3), meaningsOf(1, 1, quran.surahs[0].slice(0, 3)));
}
{
  // Word meanings: 2:181 Quran.com word 3 ("after what") sits on our word 3; every meaning used once.
  const m = meaningsOf(2, 181, [quran.surahs[1][180]])[0];
  assert(m[2] === 'after what' && m[3] === '', '2:181 meaning of the grouped word');
  for (let s = 1; s <= 114; s++) {
    quran.surahs[s - 1].forEach((t, a) => {
      const m = meaningsOf(s, a + 1, [t])[0];
      assert(norm(m.join(' ')) === norm(wbw.surahs[s - 1][a].split('|').join(' ')), `${s}:${a + 1}: every word meaning used once, in order`);
    });
  }
}

await server.close();
console.log(`${failures ? 'FAILED' : 'OK'}: ${checks} checks, ${failures} failures · ${stats.timelines} timelines, ${stats.events} events (${stats.shownAgain} shown again for repeats) · segments: ${stats.repeats} repeats, ${stats.malformed} malformed, ${stats.interpolated} words interpolated · ${stats.unmergedShort} short groups that could not merge ${stats.shortest !== undefined ? ` (shortest ${stats.shortest.toFixed(2)} s)` : ''}`);
process.exit(failures ? 1 : 0);
