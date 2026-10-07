# Ayah Studio — project spec

A Quran companion app for Android and PC. The flagship feature is a **Shorts Studio** that
turns selected ayat + a chosen reciter into a 9:16 vertical video (TikTok / Reels / Shorts),
rendered on-device. Later features: Recite & Compare, Leitner flashcards, ayah reminders.

Owner: brandyCO (GitHub). Built mainly in Claude Code cloud sessions on a fixed credit budget —
see "Working conventions" at the bottom and follow them.

---

## Core user flow
1. **Read**: open a surah in a clean reading view (Arabic + English translation).
2. **Select**: long-press an ayah to select it; press-and-drag (or long-press then tap another
   ayah) extends the selection across consecutive ayat. While selecting, show the estimated
   video length for the current reciter (e.g. "~42 s · Alafasy").
3. **Turn into reel**: a floating action opens the editor with the selection.
4. **Edit** (recitation-led editor, below): reciter, text mode, scenes, effects, mood.
5. **Export** the 9:16 MP4 and save/share.

---

## Design principle: the recitation *is* the timeline
There is **no general-purpose timeline**. The reciter + selected ayat fix the video length and
all text timing. The editor shows one fixed **recitation spine** (waveform with ayah and word
markers); everything else attaches to it.

### Text modes (exactly 4)
| Mode | What is on screen |
|---|---|
| **Ayah** | The whole ayah at once (wrapped to lines as needed) |
| **Line** | One screen line at a time (lines as laid out on the 9:16 canvas) |
| **Half line** | Half of a screen line, split at the nearest word boundary |
| **Words** | N words per step, user setting **1, 2 or 3** (fits slow vs fast reciters) |

**Timing rule (all modes):** every text group is timed from the reciter's **word timings**,
never from expected pauses: a group appears when its first word starts and leaves when its last
word ends (or when the next group starts). Reciters often read several phrases in one breath or
pause mid-phrase — the display follows the actual words either way.

Engine edge cases:
- **Repetitions**: some reciters repeat words/phrases. Segments may revisit earlier word
  indices — show the matching group again when its words are re-recited (owner decision after the
  Phase 1a test; the display always contains the word being recited).
- **Mislabelled indices** (common in the data): 1–3 segments that jump ahead over unrecited words and
  straight back (`34, 118, 36`), or 1–2 that jump back and are not continued from (`44, 45, 22, 23,
  48`), are dropped like malformed ones. A real repetition goes back and carries on in order.
- **Malformed segments**: some entries lack timings (e.g. `[1]` instead of `[1, start, end]`).
  Ignore them; interpolate between valid neighbours if a word has no valid segment.
- **Too-short groups** (< ~0.6 s): merge with the next group so text never flashes.
- **Too-long groups**: wrap onto more lines; never shrink text below a legible minimum.
- **Gaps between ayat**: hold the previous text with a gentle fade, or clear — per mood.
- **Translation**: user choice. *Synced to the words* (default): Quran.com's English word-by-word
  meanings of exactly the Arabic words on screen, moving with them. *Whole ayah*: Sahih
  International per ayah, calm, turning pages for long ayat.

### Scenes (backgrounds) fill the recitation exactly
| Mode | Behaviour |
|---|---|
| **Single** | One image or video for the whole video |
| **Per ayah** | One scene per ayah; changes land in the gap between ayat |
| **Even split** | N items share the length equally |
| **Custom** | Drag dividers to lengthen/shorten scenes (min 1 s) |

- Total scene length **always equals** the recitation length; adding/removing/resizing a scene
  rebalances the others automatically.
- Optional **snap to pauses**: scene changes snap to this reciter's real pauses (gaps in word
  timings), never mid-word.
- Video shorter than its slot: loop / slow down / hold last frame (user choice). Longer: user
  picks the in-point.
- Images get slow Ken Burns motion by default. Suggested default scene length 3–8 s.

### Calm effects only
- **Text effects (~15–20)**: fade, rise, soft blur-in, focus pull, glow breathe, light sweep,
  dissolve, gentle drift, scale settle, ink reveal (**right-to-left for Arabic**, left-to-right
  for English), and similar. Long durations, soft easing.
- **Scene transitions (~10–12)**: crossfade, blur dissolve, dip to black/white, soft
  zoom-through, light leak, mist, slow parallax. ~1–2 s, soft easing.
- **Moods**: one-tap presets (e.g. Serene, Dawn, Night, Minimal) bundling font, text effect,
  transition, colour grade, scrim and pacing. User can tweak after picking.
- Extras: adjustable pause between ayat, optional intro title card and closing reference card.

---

## Non-negotiable rules (religious content)

1. **Never alter Quran text.** Text comes only from verified data. No truncation, no ellipsis,
   no re-typing, no "cleaning" of diacritics. Splitting into lines/half lines/words happens only
   at word boundaries and never drops a word.
2. **Always show the reference** on screen (e.g. `Al-Baqarah · 2:255`). The reciter credit line is
   optional and off by default (owner decision).
3. **No music and no sound effects** anywhere in exported videos. Recitation audio only.
4. Default background library: calm nature/abstract media only, no people or faces.
5. Arabic text is drawn by the browser (canvas / DOM) with a proper Quran font — never by
   FFmpeg `drawtext`.
6. Framing: every text element stays inside the 5% title-safe area and is never covered by
   another element; keep a legibility scrim (darken/blur) under text by default.
7. **Respectful text effects only** on Quran text (see list above). Never bounce, shake,
   glitch, distort, spin or cartoon effects on the Arabic.
8. **Never guess sync.** If word timings are missing for a reciter/surah, only Ayah mode is
   offered for it.

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
The owner's PC and Android phone both report hardware H.264 + AAC support (verified 2026-10-07).

---

## Data sources (verified 2026-10-07; all send `Access-Control-Allow-Origin: *`)

| Need | Source | Notes |
|---|---|---|
| **Recitation audio + word timings** | `https://api.qurancdn.com/api/qdc/audio/reciters/{id}/audio_files?chapter={n}&segments=true` | Returns one **full-surah MP3** (`audio_url` on `download.quranicaudio.com`) plus `verse_timings[]`: `{verse_key, timestamp_from, timestamp_to, segments: [[wordIndex, startMs, endMs], ...]}`. `wordIndex` is 1-based within the ayah. |
| Reciter list | `https://api.qurancdn.com/api/qdc/audio/reciters?language=en` | 14 entries. **Exclude id 168** (Minshawi "Kids repeat": unreliable segments). All others had word timings for every ayah of Al-Baqarah. |
| Audio download | `download.quranicaudio.com` supports HTTP **Range** requests | For long surahs, fetch only the byte range covering the selected ayat (+ margin) instead of the whole file; decode with Web Audio and trim precisely by `timestamp_from/to`. |
| Quran words (Uthmani) | `https://api.quran.com/api/v4/verses/by_key/{s:a}?words=true&word_fields=text_uthmani` (or by chapter) | Word list per ayah that matches `wordIndex`; skip the end-of-ayah marker word. Verify text integrity against the full Uthmani text. |
| Full Uthmani text | Quran.com API v4 (`/quran/verses/uthmani`) or Tanzil | Bundle once into `public/data/quran-uthmani.json` with a script; verify 114 surahs / 6236 ayat. Keep the source's license notice. |
| Surah metadata | `https://api.alquran.cloud/v1/meta` | Names, ayah counts → `public/data/meta.json` |
| Translation | Quran.com API v4 translations (e.g. Sahih International) | Cached per surah on first use |
| Per-ayah audio (Ayah-mode fallback) | `https://everyayah.com/data/{folder}/{SSS}{AAA}.mp3` | No word timings. Used when QDC fails or has no timing for an ayah. `cdn.islamic.network` sends no CORS headers, so it is not usable from the browser. See `src/data/reciters.ts`. |
| Font | KFGQPC Uthmanic Script Hafs (King Fahd Complex), fallback Amiri Quran | Vendor into `public/fonts/` with license |
| Default backgrounds | Pexels / Pixabay | Small curated set; source + license per file in `public/backgrounds/CREDITS.md` |
| Pixabay library (phase 1b) | Pixabay API (images + videos) | Repo is **public**: never commit the key; call through a tiny proxy (Cloudflare Worker, free tier). Respect Pixabay API terms (attribution, caching). |
| User uploads | Device gallery / file picker | Kept local; never uploaded anywhere |

**As built (Phase 0):**
- Text is Quran.com v4 `qpc_hafs` (KFGQPC Uthmani Hafs, includes the end-of-ayah number glyph) — the
  encoding the KFGQPC font is made for. `scripts/fetch-data.mjs` writes `meta.json`,
  `quran-uthmani.json`, `en-sahih.json` and verifies counts.
- (Phase 1a) Reel audio is a slice of the QDC full-surah MP3: `src/data/mp3.ts` reads the MP3 header,
  Range-fetches only the frames covering the selection and aligns the decoded chunk exactly (CBR;
  verified in Chromium to one sample against a whole-file decode). VBR files are decoded whole when
  ≤ 4 min, otherwise the reel falls back to everyayah. api.quran.com serves the same QDC API as
  api.qurancdn.com and is tried second. everyayah.com is the fallback (Ayah mode only).
- (Phase 1a) `public/data/word-map.json` (by `scripts/fetch-word-map.mjs`) maps Quran.com word
  positions (QDC `wordIndex`) to our words, aligned letter-for-letter; only 7 ayat differ (2:181,
  8:6, 13:37, 15:7, 27:20, 36:22, 37:130). The same script writes `en-wbw.json`, Quran.com's English
  word-by-word meanings (one per word position) for the synced translation. `npm run check` (`scripts/check-text-modes.mjs`) checks the
  text modes against live QDC data for all 13 reciters. Known data gap: reciter 173 has no timing for
  1:1 (→ everyayah).
- AAC fallback is `@mediabunny/aac-encoder` (WASM, lazy-loaded) instead of ffmpeg.wasm.
- Default backgrounds are original, generated by `scripts/make-backgrounds.py` (Pexels/Pixabay were
  not reachable from the build container); loops ship as H.264 MP4 plus a VP9 WebM fallback.

---

## Video engine

- **One pure render function** `render(ctx, t, project)` draws the frame for time `t` (seconds).
  Used for live preview and export. Preview must equal export.
- Project state is plain JSON (reciter, ayat, text mode, scenes, effects, mood); undoable.
- **Export**: 1080×1920, 30 fps. Canvas → `VideoFrame` → `VideoEncoder` (`prefer-hardware`,
  try `avc1.640028`, `avc1.4d0028`, `avc1.42e028`). Trimmed recitation PCM → `AudioEncoder`
  AAC 128 kbps. Mux with Mediabunny to MP4. Progress + cancel. 720p option.
- **Background video**: decode frames with Mediabunny (frame-accurate), not by seeking a
  `<video>` element.
- **Capability check** at startup (`isConfigSupported`); results in a debug panel.
- **Save/share**: web → download; Android → Capacitor Filesystem + Share; Tauri → save dialog.

### Default layout (9:16)
Surah name + reference: Top (default), Below the ayah (under the translation, or under the Arabic
when translation is off; Arabic + translation + name are one centred block), or Bottom; size
Small / Medium / Large ·
Center: Arabic (RTL, large) · Below: translation (optional) · Bottom: optional reciter credit and
optional watermark. `frameLayout()` places everything inside the 5% title-safe area without overlaps.

---

## Roadmap

### Phase 0 — read → select → reel (web, deploys to GitHub Pages)
The real user flow end-to-end, kept simple (no timeline yet). Acceptance criteria:
- [x] Surah list (search by name/number) → reading view: Arabic (Quran font) + English translation, RTL correct, smooth on phone
- [x] Long-press selects an ayah; press-and-drag (or long-press then tap) extends to consecutive ayat; clear selection highlight; max ~10 ayat for now
- [x] "Turn into reel" floating button → simple editor screen
- [x] Editor: reciter (3 options), translation on/off, preset background (2 images + 2 video loops + solid colors), one default respectful text effect (fade/rise)
- [x] Live 9:16 preview with play/pause and scrubbing, text synced to recitation
- [ ] Export MP4 (H.264 + AAC) that plays in the phone gallery and uploads to Instagram/TikTok
- [x] Capability panel (moved from the starter page) available from a debug/settings menu
- [ ] Tested by the owner on their Android phone in Chrome via the Pages link

### Phase 0.5 — mushaf reading view (owner request after Phase 0 phone test)
Owner wants it to look and feel like Tarteel: a real full-screen mushaf page.
- [x] Opening a surah shows full-screen Madinah mushaf pages drawn with the King Fahd Complex QCF V2
      page fonts (`public/fonts/qcf-v2/p{n}.woff2`, loaded per page) from glyph codes in
      `public/data/mushaf.json` (604 pages × 15 lines, generated by `scripts/fetch-mushaf.mjs`, which
      verifies each word's text against the bundled text; `scripts/verify-qcf-glyphs.py` checks every
      glyph exists in its page font). Surah name frames (SuraNames font) and Bismillah calligraphy.
- [x] No arrows/title on the page: tap drops down a title bar with a ☰ menu (all surahs,
      translation view, go to page, device check); swipe or ←→ keys turn pages
- [x] Long-press / drag / tap-to-extend (also across pages) → bar with Translation + "Turn into reel"
- [x] Translation card view kept as a toggle (remembered per device)
- [ ] Tested by the owner on their phone
Note: the reading view uses QCF glyph fonts; the video renderer still draws the bundled Unicode text
with the KFGQPC Uthmanic Hafs font (rule 5).

### Phase 1a — recitation-led editor (replaces the earlier "timeline editor" idea)
- [x] Switch reel audio to Quran.com QDC full-surah audio + word timings (Range-fetch the selected
      ayat; 13 reciters, exclude id 168); keep everyayah as the Ayah-mode fallback
- [x] Text modes **Ayah, Line, Half line, Words (1/2/3)**, all timed from word timings, with the
      edge cases above (repetitions, malformed segments, short-group merge, long-group wrap)
- [x] Estimated reel length while selecting (selection bar, last-used reciter)
- [x] Owner feedback: repeats shown again; translation synced to the words on screen; surah name
      position (top / below the ayah / bottom) and size; reciter credit optional (off); watermark optional
- [ ] Recitation spine (waveform + ayah/word markers)
- [ ] Scenes: Single / Per ayah / Even split / Custom, auto-rebalance to the exact length,
      snap-to-pauses, video loop/slow/hold + in-point, Ken Burns on images
- [ ] Full calm text-effect set (~15-20, RTL-aware ink reveal) and scene transitions (~10-12)
- [ ] Moods presets; font/size/position/colours; pause between ayat; intro/outro cards
- [ ] Undo/redo; project autosave
- [ ] Export verified on the owner's phone (gallery playback + Instagram/TikTok upload)

### Phase 1b — media
Upload own videos/images (gallery / file picker); Pixabay library browser (search, preview, add
to scenes) through a key-holding proxy; attribution handling; local media cache.

### Phase 1c — app packaging
Capacitor Android build + Tauri Windows build (GitHub Actions; APK/installer as artifacts);
save to gallery / share sheet; offline audio cache; settings.

### Phase 2 — practice
Recite & Compare (MediaRecorder; Sheikh vs Me A/B toggle; side-by-side waveforms; recordings
saved locally). Flashcards: 5 Leitner boxes, intervals 1/2/4/8/16 days, a miss returns the card
to Box 1; progress stored locally.

### Phase 3 — polish
Ayah reminders (scheduled local notifications on Android; tray app on PC; interval setting; tap
opens the ayah). Store listings.

---

## Repository layout (target)

```
public/data/        bundled Quran text, meta (generated by scripts/, committed)
public/fonts/       Quran fonts + licenses
public/backgrounds/ curated media + CREDITS.md
scripts/            one-off data fetch/verify scripts (node)
src/engine/         render(), text grouping + timing, scenes, effects, export, audio
src/data/           quran text, reciters, timings, audio fetch/cache
src/ui/             reading view, selection, editor, panels
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
