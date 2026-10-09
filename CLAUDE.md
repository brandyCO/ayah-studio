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
2. **Always show the reference** on screen (e.g. `Al-Baqarah · 2:255`). The Arabic surah name above it
   can be hidden (Layout → Surah name → Hide; owner decision 2026-10-08) — the reference line never.
   The reciter credit line is optional and off by default (owner decision).
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
| Storage | IndexedDB (web) / Capacitor Filesystem, local first; optional account sync with Supabase (Phase 4, `docs/together.md`) |

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
| Stock libraries (phase 1b) | Pixabay API + Pexels API (images + videos) | Repo is **public**: never commit the keys; call through a tiny proxy (Cloudflare Worker, free tier). Respect their API terms (attribution, caching). `images.pexels.com`, `videos.pexels.com` and `cdn.pixabay.com` send CORS headers (checked 2026-10-08). |
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
- (Phase 1a part 2) Pacing is applied after planning: `arrangeReel()` shifts each ayah (and its words)
  by intro + k × pause and `arrangeAudio()` moves the audio the same way, so text stays word-synced.
  Canvas `shadowBlur` and `filter: blur()` ignore the transform: effects scale them by `pxScale(ctx)`
  so preview = export at any size. `npm run check` also covers text sizes and pacing.
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
- [x] Page swiping like Tarteel (owner request): the page follows the finger (`.mushaf-view` window
      onto a `.mushaf-strip` holding the current page and its neighbours, the next page on the left),
      then settles on the next page (past 22 % of the width or a fling) or springs back; soft sheet
      shadows while moving; resistance at pages 1 and 604; arrow keys slide too. `selection.ts` reports
      horizontal pans (`onPan`, axis decided once) besides long-press selection. Smoothness pass: a swipe
      during a slide lands it at once and follows the new swipe (chained flips); a page whose font is
      still downloading slides in as a "Page N" placeholder (spinner) and fills in when ready; fonts
      load 3 pages ahead; the player shows a spinner + "loading…" while starting or buffering
- [x] Listen while reading (owner request): ☰ → "Listen from this page", ▶ in the selection bar, or —
      while listening — tap an ayah to play from it. `src/ui/player.ts` streams the reciter's QDC
      full-surah MP3 (seeking by the verse timings), tints the ayah being recited and colours the word
      (QDC word positions = `data-p` on the mushaf words, counted across page breaks by
      `loadMushaf()`: `segStart`, `wordPage`), turns the page with the recitation, continues into the
      next surah; bar: previous/next ayah, play/pause, reference, reciter (shared with the reel default),
      stop; Media Session lock-screen controls. Needs internet (the stream is not cached)
- [x] Launch (owner request): opening the app without an address of its own goes straight to the
      mushaf — Al-Fatiha the first time, afterwards the page the user left (`lastRead` in
      `src/ui/prefs.ts`, saved on every page turn); the surah list stays at `#/` (‹ or ☰ → All surahs)
- [x] Paper look in day mode (owner request): warm cream pages with a fine grain and faint mottling
      (an inline SVG noise tile, `--paper-grain`) and softly shaded sheet edges (`--paper-edge`), which
      move with the page while swiping; night mode stays plain dark
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
- [x] Timeline (`src/ui/spine.ts`, CapCut-style): starts at the left, white playhead (kept mid-screen
      while playing), "00:00 • 00:02" ruler, zoom (pinch, ctrl+wheel, −/+), drag the ruler to scrub,
      drag elsewhere to scroll; room under the tracks. Tracks: scenes (thumbnails, lengths, transition
      markers, white + to add) and recitation audio (waveform per ayah). No text track (owner request)
- [x] Block editing (owner request), within the rules: tap a block to select it →
      **scene**: drag edges to trim (neighbours give way, min 1 s, snap to the reciter's pauses),
      drag to reorder, Split at the playhead, replace/move/delete; **audio** (per ayah): drag its edges
      to trim silence at its start/end (`project.trims`; e.g. the silence at the start of the reel —
      never a word: ≥ 0.1 s kept before the voice at the reel's start — found in the audio itself by
      `voiceOnset()`, as the timings can be off by tenths of a second — 0.05 s at its end, 0.15 s between ayat), drag it to add a pause
      before it (`project.gaps`, ≥ 0), "Trim silence", add/remove a whole ayah at either end; Audio →
      "Remove silences" trims all of them at once. Not allowed: moving text away from its words
      (rule 8), reordering ayat or cutting audio inside an ayah (rule 1)
- [x] Millisecond editing (owner request): the timeline zooms to 3000 px/s (ruler in tenths of a
      second), the waveform has a peak every 2 ms, drags show ms ("silence before words 0.215 s") and
      a selected ayah shows where its words begin/end; trims, pauses and scene edges are kept to the
      ms. Selected ayah → **Fine-tune**: the silence before and after it (between two ayat = what is
      left after the previous ayah's last word + the added pause + what is left before the first
      word) set exactly with −100/−10/+10/+100 ms steps (hold to repeat) or typed seconds; shorter =
      the recording's silence trimmed evenly on both sides of the cut (never below the safe minimum,
      so no word is cut), longer = a pause added; ▶ Listen plays just around that silence.
      Selected scene → **Length** (same stepper; the next scene — or for the last scene the previous
      one — gives way, min 1 s)
- [x] Studio layout (owner request, CapCut-style): top bar ✕ · quality (1080P/720P, device check) ·
      Export (full-screen progress page, then Save/Share); control row: time · play · undo · redo ·
      full screen; a fixed bottom area (timeline + tool bar) where panels slide up in place, so the
      preview never changes size. Line icons. Tool → options → panel (Colours → Ayah / Translation /
      Surah name → a 36-colour grid + eyedropper from the video, no hue/saturation picker; Effects →
      Text effect in category tabs with animated tiles / Transition); a selected block shows its own
      actions. Picking an effect or transition plays it. Wide screens: panels open left of the preview. The
      preview canvas has one pixel per screen pixel (full device pixel ratio, ≤ 1080 px wide) so text
      is sharp on 2.6–3.5× phone screens (times the browser's pinch-zoom, which is blocked in the studio:
      `touch-action: pan-x pan-y`)
- [x] Undo/redo (snapshots of the project, every edit)
- [x] Scenes: Single / Per ayah / Even split / Custom, auto-rebalance to the exact length,
      snap-to-pauses, video loop/slow/hold + in-point, Ken Burns on images
      (Single / Per ayah / Even split / Custom fill the reel exactly — `src/engine/scenes.ts`; per-ayah
      changes in the pause between ayat; Ken Burns per scene; Custom: trimmed/reordered in the
      timeline, lengths kept as shares of the reel, snap to pauses. Video timing: `project.clips`
      (one per scene entry, kept in step with `scenes` by every edit; remembered with the look):
      in-point + fit for a clip shorter than its scene — loop from the in-point, slow down (≥ 25 %
      speed, then loops) or freeze on the last frame (`videoTime()`). Select a video scene → **Video**:
      "Start from" slider (the preview shows the frame) + fit chips; Split continues the clip from
      the frame at the playhead)
- [x] Full calm text-effect set: 17 effects in `src/engine/effects.ts` (ink reveal and light sweep
      run right-to-left on the Arabic, left-to-right on the English)
- [x] Scene transitions (11): crossfade, blur dissolve, dip to black/white, soft zoom-through, light
      leak, mist, slow parallax, soft wipe (right-to-left), soft iris, cut; centred on the scene change,
      never longer than half a scene; moods pick one
- [x] Moods presets (Serene, Dawn, Night, Gold, Dusk, Minimal: effect, colours, colour grade, scrim,
      translation font, pacing; shown as picked while unchanged); text size (S/M/L, never below the
      legible minimum) and position (higher/centre/lower); translation font (serif/sans); pause between
      ayat (+0.5/1/2 s, cut in the reciter's own pause) with keep/clear text in the gap; optional intro
      title card and closing reference card (3 s each). The look is remembered per device for the next
      reel and the selection-bar estimate includes the pacing. The Arabic font stays KFGQPC (rule 5).
- [x] Text colours (owner request): tap a colour swatch to set the colour of the Arabic ayah text,
      the translation and/or the surah name + reference, each separately (preset palette of calm
      colours + custom picker; keep the legibility scrim/shadow so text stays readable)
- [x] Project autosave (drafts list, like CapCut's projects): `src/data/drafts.ts` (IndexedDB store
      `drafts`: project JSON + preview thumbnail). A reel becomes a draft at its first edit and is saved
      ~0.8 s after every edit (and on leaving); its address becomes `#/reel/{s}/{a-b}/{draftId}` so a
      reload reopens it; adding/removing an ayah keeps the draft. `restoreProject()` validates stored
      data like `applyLook()`. Drafts screen `#/drafts` (`src/ui/drafts.ts`; links on the surah list
      and in the mushaf ☰ menu): thumbnail, reference, reciter, "edited … ago", ✕ delete
- [x] Hide surah name (owner request): `project.surahName` (remembered with the look); the layout
      shrinks the title block to the reference line, which always stays (rule 2)
- [ ] Export verified on the owner's phone (gallery playback + Instagram/TikTok upload)

### Phase 1b — media
- [x] Upload own videos/images (gallery / file picker): Scenes → Add/Change → **My media** → "From
      device" (several files → several scenes). Images are downscaled to what the 9:16 frame + Ken
      Burns needs (JPEG); videos are checked for decodability (≤ 250 MB) and play without their sound
      (rule 3). Remove (✕) → scenes using it show a plain colour
- [x] Local media cache: `src/data/library.ts`, IndexedDB `ayah-studio`/`media` (blob + 9:16 thumb +
      credit), registered as backgrounds with ids `u:…` / `px:image:…` / `px:video:…`; persists across
      reloads and in the remembered look; `navigator.storage.persist()` requested
- [x] Pixabay browser (**Pixabay** tab: Videos/Photos, search + calm suggestions, More, "from Pixabay"
      link): `src/data/pixabay.ts` → Cloudflare Worker `proxy/pixabay-worker.js` (key as secret,
      24 h cache, safesearch, vertical photos, origin allow-list, `/file` relay for files without
      CORS). A picked item is downloaded into My media (no hotlinking). Up to 4 downloads run at once,
      each with its progress on its own card; they become scenes in the order tapped (when replacing
      a scene, the last one tapped is used)
- [x] Attribution: creator + page kept per Pixabay item; shown on tiles and on the export page
      ("Background by X on Pixabay" + Copy credits for the caption)
- [x] Owner: deployed the worker and set the repo variable `PIXABAY_PROXY` (steps in `proxy/README.md`)
- [x] Scale-up (owner request): the worker now also serves **Pexels** (secret `PEXELS_KEY`, optional;
      portrait photos/videos, 1080×1920 file picked), curated calm **collections** (`/sources`; the
      library opens on the first one), a people filter on tags/descriptions (rule 4), per-visitor limits
      (30 uncached searches, 20 file relays a minute; optional `RATE_LIMITER` binding) and a cap per
      library (Pixabay 90/min, Pexels 180/h). App: `src/data/stock.ts` (was `pixabay.ts`); tab
      **Free library** with a Pixabay/Pexels switch and "Try the other library" when one is busy; ids
      `pe:image:…` / `pe:video:…`; credits name the source
- [x] Owner: pasted the updated worker into Cloudflare (2026-10-08)
- [ ] `PEXELS_KEY`: Pexels had paused new API keys (2026-10-08); add it when they reopen — the app shows
      Pixabay only until then, no code change needed
- [ ] Before a public launch: ask Pixabay (and Pexels) for higher limits (`proxy/README.md`)
- [ ] Tested by the owner on their phone (upload from gallery, Pixabay pick, export)

### Phase 1c — app packaging
Capacitor Android build + Tauri Windows build (GitHub Actions; APK/installer as artifacts);
save to gallery / share sheet; offline audio cache; settings.
- [x] Offline use on the web build (owner request, early): service worker `public/sw.js` (registered
      by `src/offline.ts` in production over http(s)): the page network-first (4 s, then the cached
      copy), hashed `assets/` cache-first (newest 80 kept), `data/` (versioned; older versions dropped),
      `fonts/` (QCF mushaf pages as visited), `backgrounds/` cache-first, Range requests for our own
      files answered from the cached whole file (background videos), QDC timings network-first.
      After the worker takes control, the data, fonts, editor and default backgrounds are loaded once
      in the background. Recitation audio: `src/data/audioCache.ts` keeps the exact MP3 byte ranges
      (and whole everyayah/VBR files) each reel downloaded in IndexedDB `audio` (newest 150), so reels
      opened before work offline. Shared DB module `src/data/db.ts` (version 4: media, drafts, audio, reflections,
      timings)
- [x] Android app (Capacitor 8): `capacitor.config.ts` (`com.brandyco.ayahstudio`, webDir `dist`,
      origin https://localhost), `android/` committed (copied web assets are git-ignored; `npx cap sync
      android` after `npm run build`). `.github/workflows/android.yml` (push to main, PRs, manual) builds
      the debug APK → artifact **ayah-studio-apk** (debug-signed, for sideloading; Play signing later).
      App icon + splash: see "Logo" below
- [x] Logo (owner-approved 2026-10-08, "sound a"): lowercase "a" + two fading sound bars (the
      recitation), white on an emerald → teal tile (`#05573d` → `#22b3a0`). The gradient is a brand
      moment only (icon, launch screen, the name, later Export / "Turn into reel" / selected chips /
      progress bars) — never on the mushaf page, the Arabic text, the reel or big backgrounds behind
      text. `scripts/make-icons.py` (Pillow + headless Chromium) writes `resources/` (SVG sources, 1024 px
      icon, splash), `public/icon.svg` + `icon-180.png` (favicon, linked in `index.html`) and the Android
      launcher icons (legacy, round, adaptive gradient background + foreground, Android 13 monochrome)
      and splash PNGs (dark `#07130f` + teal glow + icon + "ayah studio" in the gradient); Android 12+
      shows the launcher icon on `@color/splash_background`
- [x] App colours follow the logo (`src/styles.css` tokens): `--accent` `#0a6e55` (light) / `#3dd1ad`
      (dark); dark theme background `#07130f` (= the splash), studio `#070c0a`; `--brand-fill`
      (`#05573d` → `#0f8273`, deeper than the icon's teal so white text stays ≥ 4.5:1), `--brand-bar`,
      `--brand-text`, `--brand-glow`. Used only by `.brand-name` (app name), `.primary.brand-btn` (Export,
      "Turn into reel"), studio `.chip.on` / `.tab.on`, export + download bars and the empty Drafts glow;
      `theme-color` per colour scheme. The mushaf keeps its own `--paper` / `--ink`
- [x] Export in the app (`src/native.ts`, used when `Capacitor.isNativePlatform()`): Save writes the
      MP4 in 3 MB base64 chunks (`writeFile` + `appendFile`) to `Movies/Ayah Studio` (fallbacks
      `Documents/Ayah Studio`, then the app's own folder; a toast says where), then our native
      `MediaScanPlugin.java` adds it to the gallery. Share = `@capacitor/share` with the saved file's URI
      (saves first if needed). Storage permission only asked on Android ≤ 10 (manifest: maxSdkVersion)
- [x] Offline in the app: no service worker inside Capacitor (the app files are local); QDC timings
      kept in IndexedDB `timings` (network first, newest 60) by `src/data/qdc.ts`; audio as on the web
- [ ] Android app tested by the owner on their phone (not verifiable in the cloud container: no
      Android SDK/device; only the CI build is checked)
- [ ] Tauri Windows build; Play Store signing

### Phase 2 — practice
Recite & Compare (MediaRecorder; Sheikh vs Me A/B toggle; side-by-side waveforms; recordings
saved locally). Flashcards: 5 Leitner boxes, intervals 1/2/4/8/16 days, a miss returns the card
to Box 1; progress stored locally.

### Phase 3 — polish
Ayah reminders (scheduled local notifications on Android; tray app on PC; interval setting; tap
opens the ayah). Store listings.

### Phase 4 — Together (accounts, family, your journey; owner request 2026-10-08)
Full production plan: **`docs/together.md`** (principles, architecture, data model, row-level
security, server functions, each feature's experience + acceptance criteria, owner setup).
**Supabase** (owner decision 2026-10-08: Auth with Google, Postgres + RLS, Realtime, Edge
Functions; project `jposubjybzstfmnngews`, migrations in `supabase/migrations/`); Firebase only for
push (FCM, from T2). Everything personal works signed out and syncs when signed in; the mushaf is the
home (margin marks, Today card, calm moments), no scores/badges; Quran text never comes from the
cloud. Build in this order:
- [x] P1 Prerequisites: fixed signing key (GitHub secret); Supabase project; Google sign-in client (§7)
      (`android/app/build.gradle` signs with secrets `ANDROID_KEYSTORE_BASE64` +
      `ANDROID_KEYSTORE_PASSWORD`; versionCode = CI run number. Key generated 2026-10-08 and handed to
      the owner (SHA-1 B0:F6:CC:91:…:6E:13), never committed. Owner, 2026-10-08: both secrets set,
      Supabase project (Tokyo), Google OAuth web + Android clients created)
- [x] T0 Foundation: sign-in (web + Android native), account sheet (delete / export), sync of drafts,
      last read, bookmarks, settings; day summaries; rules + emulator tests in CI; privacy page
      (built 2026-10-08: migration `20261008180000_t0_user_docs.sql` applied — `profiles`, `user_docs`,
      RLS tested live; auth: site URL + redirects set, email sign-up off, anonymous off;
      `src/cloud/{config,supabase,auth,sync}.ts` + `src/ui/account.ts` (☰ → Account) +
      `public/privacy.html`; Android: `@capgo/capacitor-social-login`, Facebook SDK excluded.
      Google provider on (owner's OAuth web client `178803855692-hqbv…` in Google Cloud project
      "Ayah Studio"; secret only in Supabase; web sign-in checked to reach Google's page).
      RLS tests: `supabase/tests/*.test.sql` (pgTAP), run by `.github/workflows/supabase.yml` with the
      Supabase CLI against a local database (`supabase db start` + `supabase test db`, no token).
      Day summaries move to T9; the two-device sync test is on the owner's checklist)
- [x] T1 Living mushaf (`src/ui/living.ts`): 8 px page margins hold marks (`registerMarks()`, drawn
      by `paintMarks()` beside the line where an ayah starts, max 2 per line, tap → its sheet); first
      mark = **bookmarks** (`src/data/bookmarks.ts`, localStorage; 🔖 in the selection bar, ☰ →
      Bookmarks list); page tint follows the local hour (dawn rose, Maghrib amber, night indigo, ≤ 6 %,
      `--tod`/`--tod-amt`, ☰ toggle `timeTint`); Ramadan (Umm al-Qura via `Intl`) → crescent by the
      page number + Today line; Today card in the drop-down bar (`registerToday()`: Ramadan day,
      recent bookmark < 7 days, reel draft edited < 3 days), hidden when empty
- [x] T4 Reflections journal (`src/data/reflections.ts` + `src/ui/reflections.ts`): selection bar
      **✎ Reflect** (mushaf and translation view) → paper-like sheet with the reference, the ayah's
      translation and dated paragraphs (today's continues, earlier ones tap to edit; autosave; "Copy for
      caption" — never onto the video; delete). IndexedDB store `reflections` (`db.ts` version 4), one
      note per ayah; a soft dot in the margin (`registerMarks`); a page with an older note pulses its
      dot once per app session with a "You wrote here on …" pill (tap → the note); ☰ → Reflections:
      grouped by surah, search (accent/harakat-insensitive, match marked). Synced as `user_docs`
      kind `reflection` (id `s:a`), merged per paragraph (newest edit wins, removals as tombstones for
      120 days), so nothing written on two devices is lost; in Export my data and the privacy page
- [x] T2a Khatm circles (2026-10-08): migration `20261009000000_t2_circles.sql` — `circles`,
      `circle_members`, `circle_parts`; members read, nobody writes directly: `create_circle`,
      `join_circle` (8-char code), `take_part` (null = pick one), `set_part` (taken/done/free),
      `new_round` (owner), `update_circle`, `leave_circle` (owner → next member; last one out deletes),
      `delete_circle`, `circle_preview`; completion set once by a trigger; caps (10 owned, 20 joined,
      60 members); `delete_my_account()` leaves circles first; Realtime publication; 40 pgTAP checks.
      App: `src/together/circles.ts` (calls, device cache, live updates, pages read) +
      `src/ui/circles.ts`: ☰ → Khatm circles (list, create, join with a code), the SVG ring of 30
      (free outlined, taken in the member's colour + initial, done filled, light sweep for juz finished
      since you last looked, a glow when complete), take/read/finish/give back, invite (share sheet or
      copied link `#/join/{code}`; a web sign-in returns to the invitation), members, leave/delete.
      Mushaf: thin gold edge on your juz's pages, a page open ≥ 20 s counts as read (this device),
      Today card "Juz 14 · 6 pages left" and "Khatm complete". **Khatm reel**: editor draft of An-Nas
      (114:1–6) with `project.closing` (title + member names, UI font, under the reference on the
      closing card, shrinking to 24 px, then "and N more"). Deploy: `.github/workflows/supabase.yml`
      job `deploy` runs `supabase db push --db-url` through the session pooler on main (secrets
      `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`, added 2026-10-09; all migrations applied live)
- [ ] T2b Push foundation (evening digest of circle activity): waits on the owner's Firebase project
      (§7 step 4)
- [x] T3 Gift an ayah (2026-10-08): migration `20261010000000_t3_gifts.sql` — `gifts` (references,
      reciter, look, sender name ≤ 40, message ≤ 140, `reply_to`, opens); nobody reads or writes the
      table: `send_gift` (checks surah/ayah against `ayah_count()`, ≤ 10 ayat, `valid_reciter()`, the look
      with `valid_gift_look()` = `applyLook()`'s rules, built-in backgrounds only; 30 a day, anonymous
      sessions 5 and replies only), `get_gift(id)` (granted to `anon`: no account needed, counts opens
      by others, its author also gets the replies), `my_gifts()`, `delete_gift()`; 43 pgTAP checks.
      App: `src/together/gifts.ts` + `src/ui/gift.ts`: selection bar **🎁 Gift** (mushaf + translation
      view) and the editor's top bar (gift icon, the editor's look + reciter) → composer (reciter,
      message + presets, name; own media replaced by a built-in background) → link + Share/Copy.
      `#/gift/{id}`: sealed card "A gift from Aisha" → tap → the reel plays with the editor's engine
      (`render()`; recitation via `src/ui/reelSource.ts` `loadReel()`, now shared with the editor),
      message below in the UI font "— Aisha"; Reply with an ayah (pending reply in sessionStorage →
      select in the mushaf → 🎁 Gift → `reply_to`), Make it a reel (draft), Read in the mushaf. The client
      re-checks every gift (`strictLook()` in `project.ts`, reference, reciter) and never renders a forged
      one. ☰ → Gifts: received on this device (localStorage) + sent with opens and replies, delete.
      Replies without a Google account use `signInAnonymously()` — works once the owner turns on
      Anonymous sign-ins; until then the composer asks for Google sign-in. Shared links from the Android
      app point at the Pages site (`shareableLink()` in `src/native.ts`; circle invites too).
      In Export my data and the privacy page
- [x] T5a Revision lamps, manual (2026-10-08; before the Phase 2 flashcards): `src/data/lamps.ts`
      (localStorage `lamps`: per page box 1–5, last revised, memorised since; Leitner intervals
      1/2/4/8/16 days; "Revised today" = up a box, "Needs work" = box 1; light = 1 → 0.15 over two
      intervals, `due` past one) + `src/ui/lamps.ts`: ☰ → **My memorisation**: one canvas, a row per juz,
      outlines for pages not memorised, warm glowing lamps for memorised ones, a dim lamp with a ring
      when it would like a visit, the current page underlined; tap → the page (‹ ›, Open page, Revised
      today with a warm bloom, Needs work, Remove / Mark memorised); mark a surah, a juz or a page range.
      Today card: "3 lamps are getting dim in Al-Mulk" (opens the grid). Synced as one `user_docs`
      document (kind `lamp`, id `pages`), merged per page (newest change wins, removals as tombstones
      for 120 days); in Export my data and the privacy page. No local reminder yet (comes with the
      local-notifications plugin in T7/T5b)
- [ ] T5b Lamps + Phase 2 flashcards (a dim lamp opens a revision session)
- [ ] T6 Memorise with a partner (shared plan lamps, gentle nudges)
- [x] T7 Ramadan mode (2026-10-08): `src/data/ramadan.ts` (this device only: plan one/two Khatms or
      "just keep me company", pages read this Ramadan (a page open ≥ 20 s), today's portion = the pages
      left over the days left, fixed at the day's first look — a missed day just spreads out; days with
      reading; ayat returned to (listen/bookmark/reflect) for the recap; Umm al-Qura via `Intl` with a
      ±1 day moon-sighting shift; **preview** setting (night 1 / day 10 / night 27 / Eid) to try it out of
      season) + `src/ui/ramadan.ts`: first-night full-screen moment (crescent, Ramadan Mubarak, plan,
      or a Khatm circle; "Not now"); ☰ → **Ramadan** sheet (plan, today's portion + Open, pages read,
      circle, reminder, dates, preview); Today card: today's portion (opens the page), "Tonight's ayah"
      after 16:00 (an ayah from today's portion → reel draft in the Night mood), Eid → **Your Ramadan**
      (days, Khatms, the ayah returned to most in the Quran font + ▶ Listen (everyayah), "Make my Ramadan
      reel": that ayah, Gold mood, closing card "My Ramadan 1448 AH" + lines via `project.closing`;
      shown once by itself). Last ten nights: deeper night tint (`timeTint`, ≤ 6 %) + Today line.
      Android: `@capacitor/local-notifications` reminders before Maghrib for the rest of Ramadan
      (`adhan`, Umm al-Qura method, from the rounded location or the user's own time; 10–60 min before;
      rescheduled whenever the mushaf opens; small icon `ic_stat_crescent`; tap → `#/ramadan` → the next
      page of today's portion); web: Today card only
- [x] T8 Multi-segment reels + Dua & ayah wall (2026-10-08): engine `src/engine/segments.ts` —
      `joinSegments()` places N arranged one-range plans (each its own surah, word timings, audio slice,
      pause/hold; `PlannedAyah.surah`) one after another, each optionally followed by a **note card**
      (`TimedNote`: name + dua, `noteLength()` 3–8 s), then the closing card; `loadSegments()` in
      `src/ui/reelSource.ts` loads them three at a time and stops at 30 segments / ~600 s (the rest is
      the next part); audio joined with `mixdown()`. `Timeline` gained `ayat[].surah`, `notes`,
      `segmented`: `render()` shows each ayah's own surah name + reference (rule 2), fades the header
      under a note card (`drawNote()`: name, "chose Al-Furqaan · 25:74", the dua quoted in italics +
      "a dua in Bilal's own words" — UI fonts, never like the ayah), and a segmented closing card shows
      `project.closing` (title + date) large. Drafts/gifts/editor unchanged (one-range projects).
      Wall: migration `20261011000000_t8_walls.sql` — `walls` (title ≤ 80, occasion, 6-char
      `join_code`, open/closed, look = `valid_gift_look`, reciter) + `wall_entries` (one per user per
      wall: name ≤ 40, dua ≤ 140, ≤ 3 ayat checked by `ayah_count`, hidden); RLS: host reads their walls
      and all entries, a guest only their own; writes only via `create_wall` / `update_wall` /
      `set_wall_open` / `delete_wall` / `hide_wall_entry` / `add_wall_entry` (open walls < 30 days,
      300 entries, 20 a day, anonymous 5) / `remove_wall_entry`, `wall_preview(code)` (anon too);
      caps 5 open / 50 walls per host; Realtime on `wall_entries`; 42 pgTAP checks
      (`supabase/tests/walls.test.sql`). App: `src/together/walls.ts` + `src/ui/wall.ts`:
      ☰ → **Ayah wall** (list, create: title, occasion, reciter; the current reel look with built-in
      backgrounds via `giftLook()`); `#/wall/{id}` host screen (dark, QR via `qrcode` + big code + link,
      lanterns drift in and settle into a grid, newest glows; Arabic shown only when ≤ 28 words — never
      cut, longer ones show the reference; tap → hide / show again; close/reopen; ⋯ settings: title,
      occasion, reciter, use current look, delete; full screen; wake lock); `#/w/{code}` guest page
      (name, surah + from/to ≤ 3 with occasion suggestions and a live Arabic preview, dua ≤ 140 "shown as
      your own words"; `ensureGuest()` = Google or anonymous; without either: Google sign-in, the form
      kept in sessionStorage `pendingWall` and resumed; done → change / remove / read in the mushaf);
      `#/wall/{id}/reel[/{start}]` keepsake: visible entries in arrival order, preview + scrub +
      **Export** (`src/ui/reelExport.ts`, the editor's export page as a reusable overlay), "Next part"
      past 30 entries / ~10 min. In Export my data and the privacy page. Owner: paste the migration;
      turn on Anonymous sign-ins so guests need no Google account (done 2026-10-09). Guest (anonymous) sign-ins
      for walls and gift replies go through `signInGuest()` (`src/cloud/auth.ts`), which first runs a
      Cloudflare **Turnstile** check (`src/cloud/captcha.ts`, invisible unless a tap is needed) when the
      repo variable `TURNSTILE_SITE_KEY` is set (passed to the Pages + Android builds); Supabase checks
      the token once CAPTCHA protection is on (Attack protection → Turnstile + secret key). Google
      sign-in is not affected (Supabase skips the captcha for id-token / PKCE sign-ins). Set up and verified
      2026-10-09: repo variable `TURNSTILE_SITE_KEY` + secret key in Supabase; a guest sign-in without a
      token or with a fake one is refused, Google sign-in (web + id-token) unaffected, the check passed
      on the owner's phone
- [ ] T9 Your year with the Quran (story cards, recap reel)
- [ ] T10 Custom domain: App Links, link previews, Tauri sign-in

### Phase 5 — Kids space (owner-approved 2026-10-09)
Full plan: **`docs/kids.md`** (principles, open questions with the defaults chosen, each phase's
experience + build notes + acceptance criteria, Google Play Families pre-launch checklist). A calm
space for children a parent switches on (☰ → Kids space), left only through a parent gate; big
text, few buttons, offline, no account, no social features, no points/streaks/badges/confetti, no
sound effects; only bundled verified data (no AI-written religious content). Build in this order:
- [x] K1 Kids space shell + parent gate (2026-10-09): `src/data/kids.ts` (localStorage, this device
      only: `kidsOn`, settings, learned surahs, a one-time router pass), `src/ui/kidsGate.ts` (typed
      sum of two numbers 11–19, a new one after a wrong answer), `src/ui/kids.ts` (☰ → 🌙 Kids space
      in the mushaf menu, "Kids" chip on the surah list; first-time setup with the child's name;
      `#/kids` home with a greeting and the 38 surahs; lock button → gate → parent sheet: name,
      translation, Leave), `src/ui/kidsListen.ts` (`#/kids/{n}`: one ayah at a time, large KFGQPC,
      reference, translation). `main.ts`: while the space is on, the app opens on `#/kids` and every
      other address is replaced by it. Own sky palette (dawn / night) under `body[data-view="kids"]`
- [x] K2 Listen & repeat (0.75/1×, ×1/×3, word lit from the QDC timings) + tap a word (its slice +
      Quran.com word meaning; only where timings exist, rule 8) (2026-10-09): `src/ui/kidsListen.ts` —
      the ayah plays from the whole surah recording (span from the verse timings, rAF stop), the word
      lit from `wordTimings().seq`, then "Your turn" (a breathing ring for the ayah's length / speed +
      1.5 s), ×3 rounds, next ayah, "Well done!" → Listen again / We learned it. Speed via
      `playbackRate` with `preservesPitch`. Tap a word: `start..end + 60 ms` of that word, only for
      words covered by a real segment (others show the meaning only); meaning from `en-wbw.json`
      through `word-map.json`. Missing ayah timing → that ayah's everyayah file, no word features.
      `src/data/kidsAudio.ts`: the whole MP3 kept in IndexedDB `audio` (`{url}|all`, shared with
      reels) the first time; parent sheet: reciter (Husary Muallim first), "Keep all for offline use";
      QDC timings kept: 120 surahs (was 60)
- [x] K3 Juz 'Amma lantern path (Al-Fatiha + An-Nas → An-Naba; learned surahs light a lantern)
      (2026-10-09): `#/kids` is a dotted SVG path (a gentle wave, 112 px a stop) with 38 lantern
      buttons — outline when unlit, filled with a flame and a warm glow when learned, the next one
      ringed and breathing; "We learned it" lights it and the path blooms it once on return
      (sessionStorage `kidsBloom`) and scrolls to it; the parent sheet lists lit lanterns to put out.
      No counts or percentages; reduced motion → no breathing
- [x] K4 "My first surah" keepsake reel (`project.closing`: "{name} memorised {surah} · {date}")
      (2026-10-09): a learned surah's screen shows **Keepsake** → parent gate → `makeKeepsake()` in
      `src/ui/kids.ts`: an editor draft of the surah (≤ `MAX_AYAT`, from ayah 1) in the reel look +
      Dawn mood, `outro` on, closing card "Maryam memorised Al-Ikhlaas" + the date it was learned; a
      one-time router pass (`#/reel/`, sessionStorage) lets the editor open over the space, and its ✕
      returns to `#/kids`
- [ ] K5 Kid-friendly reel moods (generated pastel sky / moon / desert backgrounds, rounder
      translation font; Arabic stays KFGQPC)
- [ ] K6 Family encouragement (family circles with children's short surahs, du'a notes; RLS + pgTAP)
- [ ] Owner, before a store launch with the Kids space: the Families policy checklist in `docs/kids.md` §5

### Phase 6 — Reach & daily (owner-approved 2026-10-09)
Full plan: **`docs/grow.md`** (open questions for the owner at its top, principles, architecture,
each phase's experience + acceptance criteria). No AI-written religious content: translations and
tafsir only from published, credited editions; UI strings only are translated by us.
- [x] G1 Languages: i18n foundation (`src/i18n/`), Arabic interface (RTL), translations (Urdu,
      Indonesian, Turkish, French, …; `scripts/fetch-translations.mjs`) with a picker in the reader
      and the reel editor, translator credited on the closing card
      (built 2026-10-09: 14 more translations in 13 languages from the Tanzil collection via
      api.alquran.cloud, verified 6236 ayat each, stored unmodified in `public/data/tr/{id}.json`
      (licence note `public/data/tr/README.md`; list `src/data/translationList.ts`, generated);
      fetched only when picked, then offline. `src/data/translations.ts`: chosen translation = synced
      pref `translation`; ☰ → Translation (reader + mushaf sheet + reflections) and editor Translation →
      Which translation (`project.translation`, kept with the draft, not the look; picking one switches
      the reel to Whole ayah). Reels draw it in its own direction (Urdu RTL) and credit its translator on
      the closing card (`Timeline.translation`); gifts/walls use the viewer's translation. Word-by-word
      stays English. i18n: `t(key, vars)`, `tOr()` for engine names, `initI18n()` before the first
      route, ☰ → Language (device default; reloads), `<html lang dir>`; Arabic (`src/i18n/ar.ts`, Western
      digits) covers the mushaf, ☰ menu, bookmarks, Today card, selection bar, surah list, reader,
      account sheet and the whole reel editor + export page; CSS moved to logical properties; the mushaf
      strip, the reel canvas and the timeline keep their own direction. Still English in the Arabic
      UI: circles, gifts, wall, Ramadan, lamps, reflections, drafts, media picker, device check)
- [x] G2 Ayah of the day: curated list (`public/data/daily.json`), Today card + "Make today's reel",
      optional morning notification (Android), Android home-screen widget
      (built 2026-10-09: 147 references by `scripts/make-daily.mjs` (criteria in the script; refs checked,
      English copied unaltered, ≤ 60 words, seeded shuffle; pick = whole local days since 2026-01-01
      mod 147, `src/data/daily.ts`). Today card: "Today's ayah · ref" + the chosen translation, tap →
      the page, ▶ Listen, Make today's reel (`#/reel/s/a-b` → draft in the current look). Android:
      `src/ui/morning.ts` — ☰ → Morning ayah (off by default, time 06:00–21:59, the next 14 mornings,
      ids 2000–2013, whole translation as the body, tap → the ayah); `DailyAyahWidget.java` (4×2,
      resizable, system font, day/night colours, reads `public/data/daily.json` from the app assets,
      same pick in Java, 30-min refresh) + `DailyPlugin.java` (`store`: the chosen translation's texts
      for the list; `takeLaunchHash`: the address a widget tap opened, read at start and on resume).
      Widget and notification only verifiable on the phone)
- [ ] G3 First-run tour (Read the mushaf · Make a reel · Together), once, again from ☰
- [ ] G4 Tafsir beside the translation (Quran.com, cached ≤ 7 days, attributed) behind the `tafsir`
      flag until the owner confirms the licence (`docs/grow.md` §0)
- [ ] G5 Polish: faster first load (measured), "Export for WhatsApp Status" preset
- [ ] G6 Recite & Compare (Phase 2): record, Sheikh vs Me A/B, side-by-side waveforms, saved locally

---

## Repository layout (target)

```
docs/               feature plans (together.md, kids.md, grow.md)
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
