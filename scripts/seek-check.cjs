// Does a seek in Chromium's <audio> land where currentTime says? (owner report 2026-11-03: tapping an ayah
// sometimes plays from its middle while the highlight starts at its first word.)
// For each Quran.com recording: open the surah file, seek to several ayah starts, record what actually plays
// (Web Audio), and save it with the times; scripts/seek-check.py compares it with the file decoded by ffmpeg.
//   node scripts/seek-check.cjs OUT_DIR [surah]
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2], surah = +(process.argv[3] || 18);
const IDS = [7, 173, 3, 10, 6, 12, 2, 9, 1, 4, 5, 97, 161];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const report = [];
  for (const id of IDS) {
    let j;
    try {
      j = await (await fetch(`https://api.qurancdn.com/api/qdc/audio/reciters/${id}/audio_files?chapter=${surah}&segments=true`)).json();
    } catch (e) { console.log(id, 'api', e.message); continue; }
    const f = j.audio_files?.[0];
    if (!f) { console.log(id, 'no file'); continue; }
    const vt = f.verse_timings;
    const picks = [0.25, 0.5, 0.75, 0.95].map((q) => vt[Math.floor(q * (vt.length - 1))].timestamp_from / 1000);
    const p = await b.newPage();
    await p.goto('https://example.com/');
    for (const at of picks) {
      const r = await p.evaluate(async ({ url, at }) => {
        const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = url; a.preload = 'auto';
        const ctx = new AudioContext({ sampleRate: 16000 });
        const src = ctx.createMediaElementSource(a);
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        const buf = []; let rec = false, t0 = null;
        sp.onaudioprocess = (e) => { if (!rec) return; if (t0 === null) t0 = a.currentTime; for (const v of e.inputBuffer.getChannelData(0)) buf.push(v); };
        src.connect(sp); sp.connect(ctx.destination);
        await new Promise((r, j) => { a.addEventListener('loadedmetadata', r, { once: true }); a.addEventListener('error', () => j(new Error('load')), { once: true }); });
        a.currentTime = at;
        await new Promise((r) => a.addEventListener('seeked', r, { once: true }));
        await ctx.resume(); await a.play(); rec = true;
        await new Promise((r) => setTimeout(r, 5000));
        a.pause(); ctx.close();
        return { t0, dur: a.duration, data: buf.slice(0, 16000 * 4) };
      }, { url: f.audio_url, at }).catch((e) => ({ error: e.message }));
      const name = `${id}-${Math.round(at)}`;
      if (r.data) fs.writeFileSync(`${out}/${name}.f32`, Buffer.from(new Float32Array(r.data).buffer));
      report.push({ id, url: f.audio_url, at, t0: r.t0, dur: r.dur, file: r.data ? `${name}.f32` : null, error: r.error });
      console.log(id, at.toFixed(2), '->', r.t0, r.error || '');
    }
    await p.close();
  }
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  await b.close();
})();
