# Ayah Studio — project spec

A Quran companion app for Android and PC. The flagship feature is a **Shorts Studio** that
turns selected ayat + a chosen reciter into a 9:16 vertical video (TikTok / Reels / Shorts),
rendered on-device. Later features: Recite & Compare, Leitner flashcards, ayah reminders.

Owner: brandyCO (GitHub). Built mainly in Claude Code cloud sessions on a fixed credit budget —
see "Working conventions" at the bottom and follow them.

---

## Non-negotiable rules (religious content)

1. **Never alter Quran text.** Text comes only from the bundled, verified data file. No
   truncation, no ellipsis, no re-typing, no "cleaning" of diacritics. If an ayah is too long for
   the frame, split it across timed pages at word boundaries — never drop words.
2. **Always show the reference** on screen (e.g. `Al-Baqarah · 2:255`) and **credit the reciter**.
3. **No music and no sound effects** anywhere in exported videos. Recitation audio only.
4. Default background library: calm nature/abstract loops only, no people or faces.
5. Arabic text is drawn by the browser (canvas / DOM) with a proper Quran font — never by
   FFmpeg `drawtext`.
6. Framing: every text element stays inside the 5% title-safe area and is never covered by
   another element.

---

## Tech stack

| Layer | Choice |
|---|---|
| App | TypeScript + Vite, plain DOM/canvas (no heavy UI framework unless clearly needed) |
| Android (and iOS later) | Capacitor (`@capacitor/filesystem`, `@capacitor/share`, `@capacitor/local-notifications`) |
| Windows/macOS | Tauri (WebView2 on Windows = Chromium, so WebCodecs works); tray icon for reminders |
| Web test build | GitHub Pages, auto-deployed from `main` by `.github/workflows/pages.yml` |
| Video export | WebCodecs `VideoEncoder` (H.264) + `AudioEncoder` (AAC) → **Mediabunny** MP4 muxer |
| Fallbacks | Audio: `ffmpeg.wasm` for AAC only if `AudioEncoder` lacks AAC. Video: WebM (VP9) if H.264 unsupported |
| Storage | IndexedDB (web) / Capacitor Filesystem; no backend server |

`vite.config.ts` uses `base: './'` so the same build works on GitHub Pages, Capacitor and Tauri.

---

## Data sources

| Need | Source | Notes |
|---|---|---|
| Quran text (Uthmani) | Quran.com API v4 (`https://api.quran.com/api/v4/quran/verses/uthmani`) or Tanzil Uthmani | Fetch **once** with a script into `public/data/quran-uthmani.json`; verify 114 surahs / 6236 ayat and per-surah counts; commit the file. App never fetches text at runtime. Keep the source's license notice. |
| Surah metadata | `https://api.alquran.cloud/v1/meta` | Names (Arabic/English), ayah counts, global ayah offsets → bundle as `public/data/meta.json` |
| Translations | Quran.com API v4 translations / alquran.cloud editions | Start with one English translation (e.g. Sahih International), bundled per-surah or cached on first use |
| Recitation audio (per ayah) | `https://cdn.islamic.network/quran/audio/128/{edition}/{globalAyahNumber}.mp3` | Editions e.g. `ar.alafasy`, `ar.abdurrahmaansudais`, `ar.husary`. Verify the list via `https://api.alquran.cloud/v1/edition?format=audio&type=versebyverse` |
| Word timings (phase 3) | Quran.com / QUL segment data | Only for reciters that have it |
| Font | KFGQPC Uthmanic Script Hafs (King Fahd Complex), fallback Amiri Quran | Vendor the font files into `public/fonts/` with their license |
| Background loops | Pexels / Pixabay | Store a small curated set; record source URL + license per file in `public/backgrounds/CREDITS.md` |

`globalAyahNumber` = sum of ayah counts of previous surahs + ayah number (1..6236).

---

## Video engine (the core)

- **One pure render function** `render(ctx, t, project)` draws a frame for time `t` (seconds).
  Used for both live preview (`requestAnimationFrame`) and export (fixed-step loop). Preview
  must equal export.
- **Timeline from audio**: download each selected ayah's MP3, decode with Web Audio
  (`decodeAudioData`), concatenate (optional small gap, e.g. 0.25 s). Each ayah's start/end time =
  cumulative durations. The ayah's text is visible exactly during its audio. Long ayat are split
  into pages; page timing is proportional to word count (until word timings exist).
- **Export**: 1080×1920, 30 fps. Canvas → `VideoFrame` → `VideoEncoder`
  (`prefer-hardware`, try `avc1.640028`, `avc1.4d0028`, `avc1.42e028`). Mixed PCM →
  `AudioEncoder` AAC 128 kbps. Mux with Mediabunny to MP4. Show progress; allow cancel.
- **Background video loops**: decode frames with Mediabunny (frame-accurate), not by seeking a
  `<video>` element. Loop seamlessly; slight darken/blur under text for legibility.
- **Capability check on startup**: `VideoEncoder.isConfigSupported` / `AudioEncoder.isConfigSupported`;
  pick the best path and show it in a debug panel. 720p option for slow devices.
- **Save/share**: web → download; Android → Capacitor Filesystem + Share (save to gallery);
  Tauri → save dialog.

### Default layout (9:16)
Top: surah name + ayah reference · Center: Arabic (RTL, large, centered) · Below: translation
(smaller, optional) · Bottom: reciter credit + small app watermark (toggleable). All inside the 5%
title-safe area.

---

## Roadmap

### Phase 0 — proof of concept (web page, deploys to GitHub Pages)
Acceptance criteria:
- [ ] Pick surah, ayah range (max ~10 ayat), reciter (3 options), background (solid colors + 2 loops), translation on/off
- [ ] Live 9:16 preview with play/pause and scrubbing, text synced to recitation
- [ ] Export MP4 (H.264 + AAC) that plays in the phone gallery and uploads to Instagram/TikTok
- [ ] Capability panel showing what the device supports
- [ ] Tested by the owner on their Android phone in Chrome via the Pages link

### Phase 1 — Shorts Studio app
Capacitor Android build + Tauri Windows build (built in GitHub Actions, APK/installer as
artifacts). Full surah/ayah picker with search, more reciters, font size/position, background
library + user-supplied video/image, offline audio cache, save to gallery / share, settings.

### Phase 2 — practice
Recite & Compare (MediaRecorder; Sheikh vs Me A/B toggle; side-by-side waveforms; recordings
saved locally). Flashcards: 5 Leitner boxes, review intervals 1/2/4/8/16 days, a miss returns
the card to Box 1; progress stored locally.

### Phase 3 — polish
Ayah reminders (scheduled local notifications on Android; tray app on PC; interval setting;
tap opens the ayah). Word-by-word highlight. Animated text styles. Store listings.

---

## Repository layout (target)

```
public/data/        bundled Quran text, meta, translations (generated by scripts/, committed)
public/fonts/       Quran fonts + licenses
public/backgrounds/ curated loops + CREDITS.md
scripts/            one-off data fetch/verify scripts (node)
src/engine/         render(), timeline, export (encoders, muxer), audio
src/data/           quran text access, reciters, audio cache
src/ui/             screens and components
src/main.ts         entry
```

---

## Working conventions (cloud sessions on a credit budget)

- Read this file first; don't re-explore what it already states.
- Keep each session to one phase or feature. When a session's goal is done, stop.
- Prefer small, focused edits over rewriting whole files.
- Commit in small steps with clear messages; push to `main` (or a branch + PR if asked).
  Every push to `main` redeploys GitHub Pages — the owner tests on their phone from that link.
- Run `npm run build` before pushing; never push a broken build.
- The owner tests on a real Android phone; when asking for testing, give a short checklist.
- Update the Roadmap checkboxes in this file as items are completed.
