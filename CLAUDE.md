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
3. **No music and no sound effects** anywhere in exported videos. Recitation audio, plus (owner decision
   2026-10-29) an optional calm nature sound (rain, wind, waves…) quietly underneath, always far below the
   reciter. Never music, never instruments or voices.
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
      load 3 pages ahead and are freed again more than 6 pages away (`releasePageFonts()`); the player shows a spinner + "loading…" while starting or buffering
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
- [x] Search + juz / quarter navigation (owner request 2026-10-28): the surah list (`#/`, and `#/search`
      with the box focused; 🔍 in the mushaf's drop-down bar) has tabs **Surahs / Juz / Hizb & quarters**
      (240 quarters grouped by juz: Hizb n, ¼ ½ ¾; start reference + page; the reader's current juz /
      quarter marked) and one search box: references ("2:255", "baqara 255", "juz 5", "جزء 5", "hizb 3",
      "page 50"; Enter opens), surah names (English or Arabic) and words — Arabic folded to letters (harakat,
      alif/hamza forms, ة/ه, ى/ي; dagger alif both dropped and written out, so الرحمن and الكتاب both match the
      Uthmani spelling; whole words marked, never split) or the chosen translation (≥ 3 letters). Results show
      the whole ayah + translation, 30 at a time (`src/data/search.ts`, `src/ui/surahList.ts`).
      `public/data/divisions.json` by `scripts/fetch-divisions.mjs`: juz + quarter starts from Quran.com,
      checked against alquran.cloud (one known difference: quarter 106 at 15:49, as in Quran.com) and the ۞
      marks in our own text
      History (owner request): with an empty box, **Recent searches** (chips, the last 10 searches acted on —
      a result opened or Enter) and **Recently read** (cards: the last 12 mushaf pages stayed on ≥ 3 s, page,
      reference, when), each with Clear; this device only (`src/data/history.ts`, localStorage
      `searchHistory` / `recentPages`). 🔍 opens a fresh search; ‹ back to `#/` keeps the last one
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
- [x] Studio styles + popular reciters (owner request 2026-10-13, "head to it instead of CapCut"):
      **word highlight** (`project.highlight`, colour `colors.hl`): the word being recited is drawn again
      over its place in the highlight colour with a soft glow (`highlightAt()` in `render.ts`, line
      word counts `Fit.counts`; only with word timings, rule 8; colour change only, rule 7); finishing
      touches `grain` (fixed noise tile, moved 12×/s, pure in t) and `vignette`, over the background
      only. **Styles** (`src/engine/styles.ts`, 7 one-tap looks: mood + background + text mode +
      highlight + touches; first tool, opened by itself on a new reel; moving tiles). **Reciters**
      without word timings (everyayah only, Ayah mode; `qdc: false`, ids 1001–1006: Muaiqly, Qatami,
      Ghamdi, Ajamy, Abbad, Juhany; never in the mushaf player or Kids space: `TIMED_RECITERS`).
      **Popular this week** (`src/data/popular.ts`): an exported reel adds an anonymous daily count
      per reciter and ayah range (migration `20261015000000_studio_styles_popular.sql`: `reel_counts`,
      no user id, read only through `popular_this_week()`, shown once ≥ 20 reels in 7 days; pgTAP
      `studio_popular.test.sql`); the owner's weekly pick in `public/data/trending.json` (reciter id
      and/or ayah, marked "Trending"); reciter picker "Popular this week" row + Today card line
      "Popular this week · ref" → Make this reel. Watermark off by default. Islam Sobhi (and Raad Al Kurdi until the mp3quran check below):
      no verified source with CORS (not on everyayah or QDC), so not added. 2026-10-13: 20 more everyayah
      reciters (ids 1007–1026: Hudhaify, Ayyoub, Jibreel, Budair, Qahtani, Bukhatir, Basfar, Matroud, Salamah,
      Husary + Minshawi Mujawwad, Tablawi, Ali Jaber, Muhsin Al-Qasim, Neana, Alaqimy, Sowaid, Alili, Sahl
      Yassin, AbdulKareem; Hafs, ≥ 64 kbps, first + last ayah of every surah checked; Warsh folders left
      out, the text is Hafs); migration `20261016000000_more_reciters.sql` (`valid_reciter()`); a search box
      in the reciter picker. **mp3quran.net reciters** (owner request, "Yes, verify"): 10 Hafs voices (ids 1027–1036:
      Nufais, Abkar, Raad Al-Kurdi, Al-Jaleel, Baleela, Al-Dukhain, Al-Yamani, Al-Salimi, Al-Majed, Al-Asiri),
      Ayah mode only. Their ayah times are often wrong, so `scripts/verify-mp3quran.py` (ffmpeg) checks each
      surah against the audio: CBR file, ayat 1..n in order inside the file, every boundary in a pause
      (≥ 12 dB under the speech level, 0.45 s before / 0.25 s after; decoded from Range windows only), and a
      plausible pace per ayah (letters/s against the reciter's median; catches shifted labels). It writes
      `public/data/mp3quran/{read}.json` (file size + the quietest moment of each pause = the cut points,
      null where there is no pause; a surah with > 10 % unchecked boundaries is left out) and the verified
      surahs go into `reciters.ts` (`mp3quran.surahs`, 33–111 surahs each; Nufais 88: not 1 (shifted labels)
      or 2 (VBR)). `src/data/mp3quran.ts` builds ayah timings from the cuts, refuses a file whose size
      changed, and `UncheckedRange` for ayat touching a null cut → the editor (and gift player) switch to the
      default reciter with a toast; the picker hides a reciter for surahs/ayat it is not verified for
      (`covers()`, `mp3quranRange()`), new reels fall back by `reciterFor()`. Migration
      `20261017000000_mp3quran_reciters.sql` (`valid_reciter()`: 1001–1036). **Islam Sobhi** (id 1037,
      owner request "cant we make ayah times"): mp3quran.net has his recording but no ayah times, so we make
      them by forced alignment (`scripts/align-ayat.py`: CTC with the Quran-trained wav2vec2
      `rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final`, Apache-2.0, run offline; our own text only
      reduced to letters; free audio allowed at both ends; with and without the isti'adha, the better path
      wins). Checked first on Alafasy's everyayah files (known boundaries): 86 of 86 in the right gap.
      `scripts/make-mp3quran-timings.py NAME FOLDER` then cuts at the quietest moment in each aligned gap
      and applies the verifier's rules (pause ≥ 12 dB under speech or null, ≤ 10 % null, pace) plus a
      confidence check (mean log-probability per ayah ≥ −1.5); `public/data/mp3quran/islam-sobhi.json`
      (`aligned: true`; `vbr: s` for a variable-bitrate file ≤ 4 min, decoded whole: `fileDuration`).
      55 surahs so far (45 and 65 removed: mp3quran redirects surahs it lacks — 37, 39, 40, 45, 65 — to Minshawi; `get()` and the app now refuse a redirected file); still to do: surahs > 20 min (align in pieces), longer VBR files (byte offsets per
      ayah), and the 18 that failed (mostly ayat joined without a pause in Juz 'Amma; ayah 1 unclear in
      99–108). Migration `20261018000000_islam_sobhi.sql` (`valid_reciter()`: 1001–1037). **Word times for every reciter** (owner request
      2026-10-13, "all modes for all reciters"): the same aligner gives each word's time. `.github/workflows/align.yml`
      (manual; `scripts/align-plan.py`: the 37 reciters without QDC timings × 4 surah ranges, 18 jobs at a time on
      GitHub's free runners) runs `scripts/align-batch.py` and pushes raw results to the branch `align-results`
      (`align/{key}/{SSS}.json`: ayah + word spans, confidence, cuts, VBR seek table). `scripts/make-word-timings.py
      RESULTS` checks them and writes `public/data/words/{key}/{SSS}.json` (display-word times per ayah, only ayat
      that pass: heard clearly, every word timed in order, no word but the last > 3 s and no silence > 2.5 s
      inside the ayah — repetitions would stretch a word), the mp3quran cuts and `words: '…'` in `reciters.ts`.
      Checked against Quran.com's word times for Alafasy (same recording, 8 surahs): median 0.04 s, 90 % within
      0.17 s. App: `src/data/alignedWords.ts`; mp3quran timings get `segments`; everyayah reels plan words per
      ayah file (`planClipReel(…, words)`); a reel is word-timed only when every ayah has words (rule 8).
      Aligner details: free audio (star) costs 1 nat a frame (stray audio before ayah 1 is no longer taken for
      it); what precedes ayah 1 (basmala / isti'adha) is heard by a read-back (`opening()`), not chosen by score;
      long files in 8-min windows (identical results); VBR files: `seek` table (byte offset of every 50th frame)
      → `decodeMp3Span(…, seek)` Range-fetches exactly (lag 0 against a whole-file decode in Chromium)
      Shipped 2026-10-29 (second run, `align2/`): 23 everyayah reciters with words for 6011–6232 ayat each (all
      114 surahs; Juhany 1006 left out: 902 ayat passed), mp3quran Nufais, Abkar, Al-Kurdi, Al-Jaleel, Baleela
      (3562–4750 ayat; more surahs verified by the aligned cuts). The Android build leaves `data/words` out
      of the APK; the app fetches a surah's file from the Pages site on first use (Cache Storage `words`)
      **Listen tab plays every reciter** (owner request 2026-10-29): `src/ui/player.ts` — Quran.com reciters as
      before; mp3quran ones stream their checked surah file (cuts as ayah times); everyayah ones play the per-ayah
      files from two alternating elements, the next started 40 ms before the current one ends (no gap); words lit
      from the aligned times (not in the 7 word-map ayat); a surah a reciter has no checked recording of plays in
      the default voice with a toast; the picker lists the reciters that cover the surah; a reel button in the bar
      opens the ayah being recited in the studio. **Natural joins** (owner, same day: "the echo is cut"): reels of
      per-ayah files are joined directly (`GAP` −0.04 s, crossfaded in `mixdown()`; was 0.25 s of silence), and
      where a piece meets added silence its echo fades out over the quiet after the last word (≤ 0.9 s, quadratic)
      and comes in over ≤ 0.12 s (`AudioPiece.fadeIn/fadeOut`); continuous pieces get no fade
      **No added pause by default** (owner decision 2026-10-29): every mood and vibe has `pause: 0`; a look
      remembered from before loses its pause once (`pauseReset`); users add one under Audio → Pauses
- [x] Quick reel (owner request 2026-10-13): editor → Styles → **Quick reel** (opens by itself on a new
      reel), four steps: **Footage** (Sky, Sea, Rain, Mountains, Forest, Desert, Night, Light; remembered in
      localStorage `quickFootage`; 6 vertical Pixabay clips ≥ 5 s through the proxy, downloaded only when
      tapped, becomes the single scene) → **Style**: five **vibes** (`VIBES` in `src/engine/styles.ts`:
      Tahajjud, Fajr, After rain, Golden hour, Stillness — mood + scene + highlight + effect + pauses),
      the recommended one first with a line saying why ("Recommended for tonight: slow and quiet…"):
      `recommendVibe()` = the footage picked in this reel (Night → Tahajjud, Sky/Light → Fajr,
      Rain/Sea/Forest → After rain, Desert/Mountains → Golden hour), else the local hour (20–4 Tahajjud,
      4–8 Fajr, 16–20 Golden hour, else After rain); text mode from the reciter's pace (`pacedMode()`:
      > 1.7 words/s → Line, else Ayah). Applied by itself when the step opens and follows the footage until
      the user taps a vibe; the others and "More looks" (the 7 styles) are one tap away; footage kept.
      Never chosen from an ayah's meaning (no interpretation of the Quran) → **Text** (on screen: Ayah /
      Line / Half line / Words 1–3, timed modes only with word timings; translation synced / whole ayah /
      off; recited word Off or 12 colours; motion Fade, Rise, Ink reveal, Glow) → **Layout** (surah name +
      reference Top / Under the ayah / Bottom, Arabic name Show / Hide, size; the reference always stays)
      → **Finish** (Cinematic, Start on the first word, Ayah Studio mark Off / Small, Export). Footage: up
      to 4 clips, numbered in tap order (tap again to take one out), changing **with each ayah** or
      **evenly** (`quickSplit`). Text/Layout choices are kept when a vibe or style is tapped afterwards
      (`keepOwn()`; per device `quickOwn`). **Slow motion** (Off / Slow 0.75× / Very slow 0.5×; `project.slowmo`, per device
      pref `slowmo`, not in the look): background videos only, in `videoTime(…, speed)`; also Scenes → Slow
      motion. The recitation is never slowed.
      **Quran text size slider** (owner decision 2026-10-13: 52–92 px for a whole ayah on the 1080 px frame,
      Medium 80 = 70 %; `project.arSize`, per device pref `arSize`, not in the look — `textSize` follows the
      nearest S/M/L for gifts): Quick reel → Layout and Text → Size. The legible floor is now 52 px when the
      user picks it (else long text still shrinks to 64 px); bigger settings keep Medium's steps, so a long
      ayah is never smaller than at Medium
- [x] Studio love pass (owner request 2026-10-13): **⏮ back to the start** beside Play; **premiere** —
      the first Export of a version plays the whole reel full screen from the start with a bar (Keep
      editing / Export), unchanged since → Export goes straight on; **first reel** — the first reel on a
      device starts with the recommended vibe and plays as a premiere by itself (pref `studioSeen`);
      **polished sound** — `polishAudio()` (`src/data/audio.ts`): speech brought to ≈ −18 dBFS RMS (gain
      0.25–8×, peaks ≤ −1 dBFS), 30 ms fade in / 350 ms fade out, preview = export, nothing added (rule 3);
      **export page** while the video is made: a trust line ("Quran text exact … words synced to {reciter}"
      or "whole ayat … no timing guessed") and an editable **caption** (dedication, reference, the whole-ayah
      translation only when it fits whole (≤ 1400 chars; never cut), translator, reciter, background
      credits, #Quran #QuranRecitation #Surah #Reciter) + Copy; Android: a local notification "Your reel
      is ready" when it finishes in the background; **Make another like this** (result page: Next ayat /
      Choose other ayat; sessionStorage `reelKeepLook` → the new reel keeps the look and opens on Finish);
      **dedication** (`project.dedication` ≤ 60 chars, user text in the UI font on the closing card under
      the reference via `drawClosing`, turns the card on; Quick reel → Finish and Layout → Dedication);
      Quick reel → Style: **Try another** (a random other vibe + motion, own choices and footage kept;
      Previous goes back) and, with footage picked, vibe tiles show **their own clip** tinted by each
      vibe's grade
- [x] Tajweed colours (owner request 2026-10-13): `public/data/tajweed.json` by `scripts/fetch-tajweed.mjs`
      — Quran.com's tajweed markup (API v4 `quran/verses/uthmani_tajweed`, Uthmani encoding) moved onto our
      own KFGQPC words: both texts reduced to letters (marks dropped, ى/ی→ي, ٲ→ٰ, ٱ→ا), aligned per ayah
      (LCS; an ayah missing more than max(3, 3 %) letters would get no colours — all 6236 aligned), a rule on
      marks only colours the letter it sits on, a dagger alif colours its carrier. `src/engine/tajweed.ts`:
      9 legend groups (madd 6 / 4–5 / 2·4·6 / 2, ghunnah·ikhfa·idgham, iqlab, qalqalah, idgham without
      ghunnah, silent), `tajweedLines()`; `drawText` draws each coloured word again over its place, clipped to
      the range (measured with a ZWJ after the prefix so letters keep their joined forms) — colour only,
      never the text (rules 1, 7); the recited-word highlight stays on top. `project.tajweed` (per device
      pref `tajweed`, not in the look); Quick reel → Text and Text → Tajweed colours with a legend.
      `npm run check` verifies every range sits inside its word. (Second pass, 2026-10-13:) the studio preview's
      height is also capped by the width (`.studio .stage`), so full-screen play on tall phones no longer
      stretches it
- [x] Learning reels (owner request 2026-10-13): `project.learn` — Words mode, 1 word a step, the synced
      Quran.com word meaning drawn large under it (`frameStyle().learn`: text area split 50/50, meanings
      72 → 32 px). Only with word timings (rule 8); Quick reel → Text and Text → Learning reel
- [x] Series mode (owner request 2026-10-13): Quick reel → Finish → **Make a series**: "Up to ayah" (≤ 200
      ayat) + each part ~30/60/90 s → `planSeries()` (`src/engine/series.ts`, greedy, whole ayat only, ≤
      `MAX_AYAT`, lengths from the reciter's QDC timings, else ~0.55 s a word) → one draft per part with this
      reel's look, `project.series {part, of}` and the closing card on (this reel becomes part 1; ≤ 30 parts),
      then `#/drafts`. "Part k of N" on the intro/closing card, in the caption and in the drafts list
- [x] Formats (owner request 2026-10-13): `project.format` 9:16 (default) / 1:1 (1080×1080) / 16:9
      (1920×1080); per-device pref `format`, not in the look (gifts stay 9:16). `W`, `H`, `SAFE`, `TEXT_W` in
      `layout.ts` are live bindings set by `setFrame()`, which `frameLayout()` and `render()` call with the
      reel's format, so every layout and drawing follows it (text width capped at 1400 on 16:9). Export keeps
      the short side (1080 / 720). Quick reel → Layout and Layout → Format; the preview stage takes the
      format's shape. `npm run check` covers square and wide layouts
- [x] Start on the first word (owner request 2026-10-13, "only at the beginning of the reel"):
      `project.tightStart` (new reels on; per-device pref `tightStart`; drafts from before stay off):
      `pacing()` trims the first ayah's opening silence to the safe minimum (`trimLimits`: `MIN_LEAD`
      before the voice found by `voiceOnset()`); the pauses between ayat are untouched. Switch in Quick
      reel → Finish and Audio → Start on voice; trimming the start by hand turns it off. The editor now
      rearranges the audio whenever any piece moves (trims alone used to leave it unarranged)
- [x] Cinematic (owner request 2026-10-13, "premium, emotional"): `project.cinema` (new reels on;
      per-device pref `cinema`; not in the look, so gifts are unchanged), `src/engine/cinema.ts`, all pure
      in t: **breath** — the Arabic's halo swells with the reciter's loudness (`breathOf(audio)`: 50 Hz
      RMS, scaled to a full voice, smoothed both ways; set on `Timeline.breath` by the editor; light
      only, rule 7); **open/close** — the background rises out of black (1.4 s) and settles to 85 % black
      over the last 1.6 s, drawn under the text and the reference (rule 2); **drift** — the background
      scales 1 → 1.07 over the reel; **depth** — a 1/10-size copy of the background laid over it while
      an ayah is on screen. Switch in Quick reel → Finish and Scenes → Cinematic. **Watching** (the premiere before
      an export): the tools fade away (full-screen preview, transport hidden); a tap on the preview, Esc or
      the end pauses and brings them back. Play while editing stays in place, like CapCut (owner, 2026-10-29)
- [x] Own watermark, move by touch, faster studio (owner request 2026-10-28): **Layout → Watermark**
      (`src/ui/markPanel.ts`, `src/engine/mark.ts`): the small Ayah Studio mark on/off, the user's own
      mark — text (≤ 40 chars, UI font) or a logo (PNG/WebP/SVG/JPEG, scaled to ≤ 480 px, kept on this device
      in localStorage `markLogos`, `src/data/logos.ts`) — top left/right or bottom left/centre/right, size
      50–200 %, opacity 20–100 %, and **Remove all watermarks**. `project.mark` (per device pref `myMark`,
      not in the look, so gifts never carry it); `frameLayout()` keeps a strip for it at the top or the
      bottom, so it never covers the text, the reference, the credit or the Ayah Studio mark (rule 6;
      `npm run check`). Quick reel → Finish links to it. **Move** (`src/engine/motion.ts`,
      `src/ui/studioTouch.ts`): Move tool → Text / Background, or a tap on the preview; drag to move,
      pinch or the mouse wheel to scale. `project.motion {text?, bg?}`: one pose for the whole reel, or
      keyframes (Add keyframe at the playhead; later moves set the key at the playhead; previous/next;
      gold diamonds on the timeline ruler; eased with smoothstep). The renderer keeps the text block
      inside the text area and never below the legible minimum (52 px Arabic, 32 px translation) — moved
      and scaled only, never rotated (rule 7); the name + reference move with it when they sit below the
      ayah; the background is kept covering the frame (scale 1–3×). Speed: a paused preview on a video
      background no longer redraws every frame (`VideoLoop.prepare()` reports a changed picture; idle
      CPU ≈ 935 → 27 ms per 3 s in Chromium); the timeline draws its tracks into a cached layer three
      screens wide (playing, panning and scrubbing copy it; waveform via a max-pyramid); icons are parsed
      once and cloned; draft and reel-look syncing wait 20 s after the last studio edit
      Second pass (owner "yes", 2026-10-28): **5 tools** (Styles · Text · Audio · Scenes · Layout; Colours
      is one option with Ayah / Translation / Surah name tabs; Move text sits in Text, Move background in
      Scenes; a draft reopens on the last tool used, pref `lastTool`); a **scrubber** on top of every panel
      (look through the reel while adjusting); timeline for thumbs: 52 px tracks, 20 px grip handles,
      the playhead snaps to ayah starts (and word starts when zoomed in) with a light vibration, faint
      word marks on the audio; preview: **corner handles** resize, the safe area and centre line show while
      dragging (the text snaps to the centre); a tap never plays/pauses (owner: a tap means edit);
      **My styles** (Styles → "Save this look", ≤ 8, localStorage `myStyles`, applied with `applyLook()`);
      slow phones: while playing, the preview drops to 75 % then 50 % resolution when frames come
      ≥ 40 ms apart, sharp again when paused (export unchanged). Third pass (owner "yes"): the export decodes the next
      background frame while the current one encodes; `VideoLoop` copies only the last frame at or before
      t (60 fps clips skip a copy); Cinematic depth (`soften()`) enlarges its 1/10 copy to 1/4 smoothly
      before stretching it (max 5/255 pixel difference, about half the cost). Headless Chromium, 11.8 s
      reel on Mist: export 21.0 → ~14.5 s, playback ~40 → ~55 fps. Fourth pass (owner request 2026-10-28):
      a tap anywhere on the timeline moves the playhead there (snapped) as well as selecting the block;
      the logo: **Remove black** (`mark.knock`, `knockedLogo()`: alpha = brightest channel, colours
      divided by it, made once per logo), **drag on the preview** (`mark.x`, centre across the safe width;
      top/bottom from `pos`, so it stays in its strip and never covers the text, rule 6), **Show from /
      Until** (`mark.from` / `mark.to`, 0.3 s fades); **Audio → Ending**: `project.tail` 0–10 s
      (`TAIL_MAX`) after the recitation, before the closing card — silent (rule 3), background, reference
      and marks continue (`Pacing.tail`, `arrangeReel`)
- [x] No intro/end cards (owner decision 2026-10-29, "the user elongates the start and end"): the 3 s title
      card and closing reference card are gone; **Audio → Start & end**: `project.lead` (quiet before the
      first word) and `project.tail` (after the last word), 0–10 s each, silent (rule 3); also by dragging
      the first audio block (lead) or the end of the timeline (tail, white line + "end +x s"). The reference
      header stays on screen throughout (rule 2). Old drafts/looks: `dropCards()` turns an intro into ≥ 3 s
      lead and an outro into ≥ 3 s tail. Lines that need an ending (dedication, series "Part k of N",
      Kids keepsake, Ramadan recap, translation credit) are drawn over the ending (`hasEnding()`,
      `giveEnding()` makes the tail ≥ `OUTRO`)
- [x] Logo effects (owner request 2026-10-29): Layout → Watermark → **Comes in / Goes out**: None, Fade,
      Scale in, Zoom, Slide, each 0.2–3 s (`mark.fxIn/fxOut/lenIn/lenOut`, `markFx()`; without `from` / `to`
      an effect plays at the reel's start / end; picking one plays it). **Keyframes** (`mark.anim`, a
      motion `Track`: x across the safe width 0–1, size 30–100 % of Size): add/remove at the playhead,
      ‹ ›, Clear, "Size here"; dragging an animated mark sets a key; gold diamonds on the ruler while
      the panel is open. Everything is drawn clipped to the mark's strip and the safe width (rule 6);
      scaling grows from the side the mark sits against. Keyframes stay with the reel (not the device pref)
- [x] Cover frame + My styles pass (owner request 2026-10-29): Layout → **Cover** — "Use this frame" sets
      `project.cover` (reel seconds; Go to cover / Use the first frame); the export draws that frame first,
      embeds it as the MP4's cover art (Mediabunny `setMetadataTags`, `coverFront`; not in WebM) and the
      result page offers **Save cover image** (JPEG, for apps that ask for a cover). **My styles** now also
      keep Cinematic, Tajweed colours, the Arabic size and slow motion (`extra`), and can be renamed (✎)
- [x] Studio optimisation pass (owner request 2026-10-29, "optimise the whole studio"): every tool has at most
      six options, related settings share one panel. **Look**: Quick reel · Looks (tabs My styles / Styles /
      Mood) · Colours. **Text**: Mode (+ words per step, Learning reel) · Effect · Highlight · Tajweed · Size &
      place (slider, position, Move) · Translation (on/off, sync, font, which one). **Audio**: Reciter · Remove
      silences · Pauses (+ text between ayat) · Start & end (+ Start on voice) · Reset. **Scenes**: Add ·
      Change · Arrange (mode, snap, slow motion, Move) · Transition · Adjust · Touches. **Layout**: Format ·
      Names (surah name, reference, reciter name) · Watermark · Cover · Dedication. A selected scene: Split ·
      Length · Replace · Adjust (brightness −1…+1 and blur 0…1 for this scene, `Clip.b` / `Clip.blur`, plus
      the video controls) · Order · Delete. Look cards (styles, moods, vibes, grades) are smaller (5 a row).
      **Sliders** instead of steps (`project.amounts`, 0–1, reset by a mood or style): Darken (none → almost
      black; ⅓ = Normal; `darkK()`), grade strength, grain, vignette. **Touches** (`project.touches`, ≤ 4,
      `src/engine/touches.ts`, pure in t, animated tiles): Water (background seen through moving water, rows
      and columns shifted, before the scrim), Water light (caustics, light only, over the frame), Floating
      light, Bokeh, Glow, Light leak, Mist, Rain, Snow; plus Cinematic, Grain, Vignette. Nothing moves or
      bends the Quran text (rule 7)

- [x] Echo + nature sounds (owner request 2026-10-29): Audio → **Sound**, tabs **Echo** (`project.echo`,
      `addEcho()` in `src/data/audio.ts`: Off / Room / Hall / Masjid / Mountain + Amount, Space, Tail, Repeats
      sliders; the reciter's own voice only) and **Nature** (`project.ambience`, `src/data/ambience.ts`: Rain,
      Distant storm, Campfire, Waves, Wind, Stream, made from seeded noise — no files, preview = export;
      Volume slider: −44 … −28 dBFS RMS under a voice polished to ≈ −18, 1.5 s fades). Both in the look.
      The waveform and Cinematic breath follow the voice alone

- [x] Logo + landscape pass (owner request 2026-10-29): the user's logo is decoded when the editor opens
      (it used to load only with the Watermark panel or an export, so the preview often showed no logo and
      its effects seemed not to work); **Remove black** keeps the logo solid (`knockBlack()`: near-black
      pixels and darkish ones touching them or the border become clear, the anti-aliased rim is un-mixed
      from black; was alpha = brightness, which made dark parts see-through); the small **Ayah Studio mark**
      can be dragged along its line too (`project.wmX`; the mark nearest the finger is taken);
      **Frame: Fill / Show whole** (`Clip.whole`; Scenes → Arrange for all scenes, a scene's Adjust for one):
      landscape videos and photos shown complete over a soft copy of themselves that fills the frame
      (`containSoft()`: shrunk to 1/40 and stretched back, pure). Pixabay videos already include landscape

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

### Speed pass (owner request 2026-10-28)
- [x] Launch: no encoder check at startup (it blocked ~1 s), the last page's font fetched before the
      layout (`lastPage` in localStorage), reflections read after the first page → reopen ~0.5 s at 4× CPU
      throttle (was ~2 s). Offline warm-up once per app version (`warmedUp`); QDC timings reused for 3 days
- [x] Caches: recitation audio ≤ 300 MB (least recently used first), SW page fonts ≤ 200, timings ≤ 120,
      Android font cache ≤ 200; thumbnails as WebP (built-in, library, drafts)
- [x] Old-phone mode (`src/lite.ts`, `html.lite`: no paper grain / glass blur / launch sweep, studio
      preview starts at 75 %; Auto by memory ≤ 3 GB, ≤ 4 cores or Data Saver; Device check: Auto/On/Off)
- [x] Performance timings (`src/perf.ts`, this device only, Device check)
- [ ] Error reports (`src/errors.ts`, Sentry, lazy-loaded): off until the owner sets the repo variable
      `SENTRY_DSN`; then mention it on the privacy page

### Scale readiness (owner request 2026-10-31: "ready to hold 100,000 users at once", free plans for now)
Plan: Claude Doc "Ayah Studio: ready for 100,000 users at once" (hosting → Cloudflare Pages + R2, Supabase
Pro and a load test come later, when the owner decides to pay).
- [x] Edge proxy (`proxy/pixabay-worker.js`): searches cached per data center and worldwide (KV `STOCK_KV`),
      collections + Quick reel footage built daily (Cron Trigger), one worldwide call budget per library
      (Durable Object `Budget`; `PIXABAY_PER_MIN` / `PEXELS_PER_HOUR`), fair limits per app install (`i`,
      = sync's `deviceId`) and 10× looser per address; `/popular` (cached 10 min) and `POST /reel` (rate-limited)
      in front of Supabase; `/config` remote switches from the variable `FLAGS` (`stock`, `popular`,
      `mushafDownload`, `syncMinutes`). Deployed by `.github/workflows/proxy.yml` (secrets
      `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); all optional bindings, works on the free plan
- [x] App: `src/net.ts` (`EDGE`, `installId()`, `jitter()`, `remoteConfig()` kept 1 h); library pages kept on the
      phone 24 h (localStorage `stockPages`, 16); popular + reel counter through the proxy; sync after a return
      at most every `syncMinutes` (1) with a random delay, 30 s → 15 min back-off after failures; the whole-mushaf
      download starts 4 s–3 min after launch and rests 5–15 min when pages fail; Sentry samples 25 % of errors
      (`VITE_SENTRY_RATE`)
- [x] Reel counter split into 16 shards (`20261031000000_scale_reel_counts.sql`, pgTAP `scale_reel_counts.test.sql`)
- [ ] Owner: Cloudflare API token + account id as repo secrets, run "Deploy edge proxy"; `SENTRY_DSN`
- [ ] Later (paid / bigger steps): Workers Paid, Cloudflare Pages + R2 hosting (+ domain), Supabase Pro, k6 load test

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
- [x] Theme colours (owner request 2026-10-28): ☰ → Theme colours — 12 brand gradients with a neon glow
      (`src/ui/theme.ts`: Emerald (default), Aurora, Ultraviolet, Synthwave, Neon Sunset, Deep Ocean,
      Royal Gold, Rose Quartz, Cyber Lime, Nebula, Arctic Ice, Ember). Each sets the brand tokens, the
      accent, a `--brand-shadow` glow and a night background tinted to its hue (dark mode + studio);
      deep `fill` stops keep white text ≥ 4.5:1. Synced pref `brandTheme`. Same limits as the logo
      gradient: never on the mushaf page, the Arabic text or the reel; the Kids space keeps its palette
- [x] Export in the app (`src/native.ts`, used when `Capacitor.isNativePlatform()`): Save writes the
      MP4 in 3 MB base64 chunks (`writeFile` + `appendFile`) to `Movies/Ayah Studio` (fallbacks
      `Documents/Ayah Studio`, then the app's own folder; a toast says where), then our native
      `MediaScanPlugin.java` adds it to the gallery. Share = `@capacitor/share` with the saved file's URI
      (saves first if needed). Storage permission only asked on Android ≤ 10 (manifest: maxSdkVersion)
- [x] Background export in the app (owner request 2026-10-28): `ExportService.java` (foreground service,
      type `dataSync`, partial wake lock ≤ 60 min, silent progress notification with Cancel) +
      `ExportServicePlugin.java`, started by `exportGuard()` (`src/native.ts`) for the whole export; the
      WebView renderer stays important while hidden (`setRendererPriorityPolicy`). The video is still made
      by the web code; the service only keeps the app running when the user leaves it or the screen goes off
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
- [x] ~~T2a Khatm circles~~ — **removed by the owner on 2026-10-28** (the ring, juz sheets, gold page edge, Today lines, Khatm reel, Ramadan's "with a circle" links, `src/ui/constellation.ts`; ☰ → **Family circles** now lists only family circles (K6), which keep the shared circle code, invite links and `#/join/{code}`; the database is untouched). As built (2026-10-08): migration `20261009000000_t2_circles.sql` — `circles`,
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
- [x] ~~T3 Gift an ayah~~ — **removed by the owner on 2026-10-28** (the composer, `#/gift/…`, ☰ → Gifts, the 🎁 buttons in the selection bar and the editor, `src/ui/gift.ts`, `src/together/gifts.ts` and the lift/bloom moments are gone; the `gifts` table and its functions stay untouched and stay in Export my data, with gifts received on this device). As built (2026-10-08): migration `20261010000000_t3_gifts.sql` — `gifts` (references,
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
- [x] ~~T5a Revision lamps~~ — **removed by the owner on 2026-10-28** (☰ → My memorisation, the Today card line, sync of the `lamp` document, `src/data/lamps.ts`, `src/ui/lamps.ts`; existing local and synced lamps stay in Export my data). As built (2026-10-08; before the Phase 2 flashcards): `src/data/lamps.ts`
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
- [x] T8 Multi-segment reels + Dua & ayah wall — **the wall was removed by the owner on 2026-10-11**
      (`src/ui/wall.ts`, `src/together/walls.ts`, `src/ui/reelExport.ts`, `loadSegments()`, the
      `#/w/…` and `#/wall/…` routes, ☰ → Ayah wall, its styles and `wall.*` strings are gone; the
      database tables `walls` / `wall_entries` and their functions stay untouched (existing entries remain
      in Export my data; no drop migration without the owner's go-ahead); the multi-segment engine
      (`src/engine/segments.ts`, note cards in `render()`) stays for T9). As built before the removal:
      (2026-10-08): engine `src/engine/segments.ts` —
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
      sign-in is not affected (Supabase skips the captcha for id-token / PKCE sign-ins). (2026-10-28: guest sign-in and the
      Turnstile check were removed with walls and gifts — `signInGuest()`, `captcha.ts`, `TURNSTILE_SITE_KEY`.) Set up and verified
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
- [x] K5 Kid-friendly reel moods (generated pastel sky / moon / desert backgrounds, rounder
      translation font; Arabic stays KFGQPC) (2026-10-09): `scripts/make-kid-backgrounds.py` →
      **Moon garden** (`kid-moon`), **Desert dawn** (`kid-dunes`), **Soft clouds** loop (`kid-clouds`,
      MP4 + WebM), no figures; moods **Moonlit** and **Pastel** (fade/rise, crossfade/white, strong
      scrim, `enFont: 'round'`); **Nunito** 600 (OFL, `public/fonts/Nunito-*.woff2`, latin + latin-ext)
      as the "Round" translation font (editor Text → font; loaded before drawing in the editor, gifts
      and walls). Keepsake = Pastel + Moon garden. Migration `20261012000000_k5_kid_looks.sql`:
      `valid_gift_look()` accepts `round` and the three backgrounds (pgTAP `kid_looks.test.sql`)
- [x] K6 Family encouragement (family circles with children's short surahs, du'a notes; RLS + pgTAP)
      (2026-10-09): migration `20261013000000_k6_family.sql` — `circles.kind` ('khatm' | 'family'),
      `circle_children` (first name ≤ 24, `added_by`; ≤ 8 a circle), `family_parts` (child × surah 1 /
      78–114: learning | learned), `family_notes` (≤ 140, author's circle name, optional surah, `seen_at`);
      members read, writes only via `create_family_circle`, `add_child` / `rename_child` /
      `remove_child` / `set_child_surah` (the child's adder or the owner), `leave_note` (any member, 3 a
      day), `delete_note`, `mark_note_seen`; no anonymous sessions; joining uses the circle invite
      link; 36 pgTAP checks (`family.test.sql`). App: `src/together/family.ts` + `src/ui/family.ts`:
      ☰ → Khatm circles → "+ Family circle (children)"; the family sheet lists each child with 38 small
      lanterns (lit / ringed), "Learning now", recent notes, "Leave a du'a note" (presets, ≤ 140,
      optionally "when {surah} is learned"), Learning… (parent: learning / learned / clear, rename,
      remove), invite, leave/delete. Kids space → For grown-ups → **Family circle**: link this device
      to a child you added (only when signed in; otherwise a note to sign in outside the space). Then
      lit lanterns are reported once each (`kidsFamilyPushed`, retried later offline), a put-out
      lantern is cleared, and unseen notes (no surah, or for a lit surah) appear on the path as a soft
      card "A du'a for Maryam … — from Grandma" → **Ameen** marks it seen. In Export my data and the
      privacy page. Push for notes waits on T2b
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
      strip, the reel canvas and the timeline keep their own direction. 2026-10-10: the Kids space
      (incl. parent gate, keepsake card title), family circles, Khatm circles, gifts (+ message presets),
      ayah wall (+ occasions), Ramadan (+ reminders), memorisation lamps, reflections and drafts are now
      in Arabic too (keys `kids.*`, `gate.*`, `fam.*`, `circ.*`, `gift.*`, `wall.*`, `ram.*`, `lamp.*`,
      `rf.*`, `dr.*`; module-level date formats built on use so they follow the language). Still
      English in the Arabic UI: the media picker and device check, and the small labels the reel
      engine draws on note/closing cards ("Word meanings: Quran.com", "a dua in X's own words"))
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
- [x] G3 First-run tour (Read the mushaf · Make a reel · Together), once, again from ☰
      (built 2026-10-09: `src/ui/tour.ts` — three cards over a soft blur with line drawings, dots,
      Skip/Back/Next, swipe and arrow keys (RTL-aware), "Start reading" in the brand gradient;
      `tourSeen` in localStorage (leaving the mushaf for another screen counts as skipping); shown by the mushaf on first launch, not to people who used the app
      before (`mushafHint` set) and never together with the Ramadan moment (that waits a start);
      ☰ → Tour)
- [x] G4 Tafsir beside the translation (Quran.com, cached ≤ 7 days, attributed) behind the `tafsir`
      flag until the owner confirms the licence (`docs/grow.md` §0)
      (built 2026-10-09, **off**: `src/features.ts` (`feature('tafsir')`, default false; testers: Device
      check → "Tafsir beside the translation"). `src/data/tafsir.ts`: Ibn Kathir (abridged, id 169) per
      ayah from api.quran.com (qurancdn second), IndexedDB store `tafsir` (`db.ts` version 5, which also
      adds `recordings` for G6), refetched after 7 days, offline copy only within the week, newest 300;
      `tafsirView()` keeps the text unchanged and reduces the markup to safe elements, Arabic quotes in
      the Quran font. `src/ui/tafsir.ts`: "Tafsir ▾" under each ayah in the mushaf translation sheet and
      the translation view — name + "Darussalam, via Quran.com", "Explains 94:1–8 together" for grouped
      passages, link to Quran.com. The UI font stack ends with AmiriQuran so Quranic marks in surah
      names show in the Arabic interface. To ship: owner decision, then flip the default)
- [x] G5a Faster first load (measured)
      (2026-10-09, Playwright, 1.6 Mbps / 150 ms, mushaf page 1: FCP ≈ 1.55 s, page ready ≈ 2.2 s,
      19 requests / 623 KB (was 22 / 670 KB on the G4 branch). The circles screens, tour, tafsir data
      and translation picker load on first use (`import()`); the Arabic-mark fallback face `QuranMarks`
      (index.html, `unicode-range` over the Arabic blocks) is fetched only when the system font cannot
      draw a cluster, so English starts no longer download AmiriQuran. The rest of first load is the
      page's QCF font, SuraNames and `mushaf.json` (≈ 81 KB gzip), all needed for the first page)
- [ ] G5b "Export for WhatsApp Status" preset (720p, parts ≤ 30 s cut between ayat/word groups,
      < 16 MB) — postponed by the owner (2026-10-09)
- [x] G7 Friendliness pass (owner request 2026-10-28): bottom tab bar `src/ui/tabs.ts` — **Read · Listen ·
      Create · Me** (always on the surah list and drafts; on the mushaf it comes up with the title bar, so the
      page stays clean; hidden under the selection bar; the player sits above it). Listen = play from this
      page (or pause); Me = the ☰ menu, now grouped (Reading / Your Quran / Together / Settings); Create = a
      sheet (Choose ayat → the long-press hint, Today's ayah reel, Continue your last reel, All drafts). From
      another screen Listen/Me/Choose ayat open the last page read first (sessionStorage `tabIntent`).
      Export size remembered per device (`exportQuality`); `haptic()` on tab taps (Android: VIBRATE
      permission). **Smaller APK** (owner decision 2026-10-28): the CI build leaves out the mushaf page fonts
      except p1–p3; the app fetches the others from the Pages site on first view and keeps them in Cache
      Storage `qcf-v2` (`pageFontSource()` in `src/data/mushaf.ts`), so a page opened once reads offline
      **Whole mushaf on the device** (owner request 2026-10-29, "no loading pages while swiping"):
      `src/data/mushafDownload.ts` downloads all 604 page fonts (~95 MB) in the background after the first page
      shows — two at a time while idle, nearest to the page being read first, Wi‑Fi / wired only (Network
      Information API; phones without it wait), paused while hidden or offline, `mushafKept` when done. No cap on
      kept page fonts any more (app cache; service worker `MAX_PAGE_FONTS` 700). The reader loads fonts 10 pages
      ahead / 6 back (was 3 / 2) and keeps ±12 in memory
- [ ] G6 Recite & Compare (Phase 2): record, Sheikh vs Me A/B, side-by-side waveforms, saved locally — on hold (owner, 2026-10-09; the `recordings` store already exists in `db.ts` v5)

### Phase 7 — Light (owner request 2026-10-10)
Full plan: **`docs/light.md`** (art direction "light, giving, calm", Noor, rules, engine, each
phase's experience + acceptance criteria). Real-time 3D (three.js, pinned, lazy-loaded) scenes
*around* the Quran, never on it, inspired by the mood of *Sky: Children of the Light* (never its
artwork, characters, names or music). **Noor** = the app's companion: a small floating light, no
face/eyes/body, feeling shown only by light, no sounds, never guilts or gives rulings. Rules: Quran
text is never in the 3D scene (always flat, still, KFGQPC / QCF, drawn on top); no figures (prophets,
companions, angels, the unseen, people, animals); no music/sfx; the mushaf page stays clean; slow,
soft, dim, skippable, with a flat 2D fallback (reduced motion, battery saver, no WebGL, slow GPU);
no AI-written religious content. Every scene is a pure function of (t, seed), so preview = export.
- [x] L1 Light engine (`src/light/`) + Night listening (2026-10-28, owner: keep the app light — the 3D engine and
      three.js are removed; Night listening always uses the still 2D sky (`light/flat.ts`) with a soft halo
      round Noor that breathes with the word timings; Device check → Light scenes is gone) (full-screen night sky over a cloud sea from
      the player; the ayah flat in the middle; motes breathe with the word timings; sleep timer)
      (built 2026-10-10: `three` 0.186.1 (exact), only via `import()` — its chunks (~134 KB gzip) load
      when Night listening opens in 3D; entry +1.9 KB, editor unchanged. `src/light/support.ts`
      (no three: WebGL, reduced motion, battery < 20 % not charging, saved step `lightQuality`),
      `engine.ts` `LightStage` (colours used as written, dpr cap 1.5/1/0.75 per step high/medium/low,
      pause while hidden, context-loss → flat, fps watchdog: mean frame > 40 ms over ~3 s → step
      down, lowest → `onFallback`; < 18 ms for 12 s on medium → high), `noise.ts` (seeded PRNG + GLSL
      fbm), `parts.ts` (sky dome, star field, motes, fbm cloud sea that meets the horizon glow,
      crescent, Noor: core + halo + short trail, no figure), `scenes/night.ts` (pure in t + breath),
      `flat.ts` (2D still version). `src/ui/night.ts`: moon button in the player bar → full-screen;
      the ayah in KFGQPC (DOM, flat, never in the scene) with the chosen translation + reference,
      crossfading per ayah; long ayat paged between words (27 px minimum), the page holding the
      recited word (word-map aware; swipe to turn by hand), the translation fades/scrolls along;
      breath = a swell at each word start from the QDC timings; Noor brightens when a surah ends;
      tap → controls (✕, play/pause, sleep Off/15/30/60: fades to black over the last minute, then
      pauses and releases the wake lock); Esc/back closes; Device check → Light scenes: step + Reset)
- [x] ~~L2 Light reel backgrounds~~ — **removed by the owner on 2026-10-28** (the Light tab, `src/light/reel.ts`, `flatReel.ts`, `scenes/reel.ts`, the thumbnails; drafts/styles/vibes that used one now use a preset: dawn → Soft clouds, stars/aurora → Night, lanterns/rays → Light; the 2D transitions Light bloom and Drift through clouds stay). As built: light reel backgrounds + transitions
      Light bloom, Drift through clouds; gifts/walls allow-list (migration + pgTAP)
      (built 2026-10-10: background kind `light` in `src/engine/backgrounds.ts` (`LIGHT_BACKGROUNDS`,
      `BUILT_IN_BACKGROUNDS` = presets + light, used by gifts/walls; `disposeMedia()`); `loadBackground()`
      lazy-loads `src/light/reel.ts` (`LightReel`: one shared WebGL renderer, `frame(t, w, h)`), and
      `drawScene()` copies the frame in before the grade, scrim and text; `lightRes.cap` = 720 px wide in
      the preview, 1080 while exporting (`export.ts`). Scenes in `src/light/scenes/reel.ts`: Dawn cloud
      sea (rose/gold sky over the fbm cloud sea), Starfield drift (sky turning ≈ 1.4°/10 s, a diagonal
      star band with faint rose/violet glows), Aurora (fbm curtains in gold/rose/violet over still water
      with their reflection), Lantern field (140 instanced paper lanterns lit from inside, rising over
      water, mirrored under it), Light rays (beams through three mist layers, motes). New parts:
      `lanternField`, `water`, `aurora`, `rays`, `mistLayer`. Same t → same pixels (checked for all five).
      No WebGL → `src/light/flatReel.ts` (2D, pure in t). Scene picker → **Light** tab (thumbnails by
      `scripts/make-light-thumbs.mjs`, slowly drifting tiles). Transitions `lightbloom` (warm glow swells
      over the change) and `clouddrift` (soft clouds rise past the view), 2D in `drawScenes()`.
      Migration `20261014100000_l2_light_looks.sql` (`valid_gift_look()` accepts the 5 ids + 2
      transitions; pgTAP `light_looks.test.sql`, 9 checks). The service worker warm-up also fetches the
      three.js chunks and the light thumbnails)
- [x] ~~L3 Khatm circle as a constellation~~ — **removed with the Khatm circles on 2026-10-28**. As built
      (built 2026-10-10: `src/light/scenes/constellation.ts` — the 30 juz as stars on a ring floating
      in a night sky (sky turned upwards, star field, mist below, Noor at the lower right), facing the
      viewer with a ≤ 4° wobble and each star drifting a little in depth; free = faint lilac points on a
      dotted path, taken = the member's colour with a halo, done = bright warm-white core in the member's
      halo, yours pulses, the picked one has a soft ring, juz finished since you last looked brighten
      once in turn, lines join neighbouring lit stars. Completion: all lights drift into one point
      (1.6 s), it brightens, blooms open (Noor brightens with it) and the stars return; the centre (date)
      and the names fade in after the bloom. Camera distance set so each star projects exactly onto
      the SVG segment's centre (checked), so the SVG ring stays on top, transparent, for taps, keyboard
      focus, aria labels and the labels (moved inside the ring). `src/ui/constellation.ts` mounts it
      (lazy three.js); flat quality, no WebGL, or the fps watchdog falling back → the SVG ring as before)
      Depth pass (2026-10-10, owner: "make it premium"): the ring now lies back in the sky like a halo
      (tilt ≈ 57°), turning slowly so the near juz pass in front, larger and brighter, and the far side
      dims in the haze; each star floats at its own height, lines follow in 3D; opening flies in from
      far and edge-on (3.2 s); a sideways drag turns it with a soft glide (mouse also tilts). The SVG
      ring stays in the page (invisible) for keyboard focus and screen readers — focusing a juz rings its
      star — while the canvas takes the taps (nearest star ≤ 34 px → the same juz sheet) and DOM labels
      (numbers / initials) follow their stars, scaled by depth (`src/ui/constellation.ts`, `afterFrame`)
      Full screen (owner request 2026-10-11): a circle opens as a full-screen night view
      (`dialog.circle-full`: ✕ + name in a sticky top bar, the 3D ring ~64 % of the screen height edge to
      edge, the juz actions, members and invite below on soft glass cards; the flat SVG ring large on the
      same night background), no longer a bottom sheet
- [x] ~~L4 Revision lamps as a lantern field~~ — **removed by the owner on 2026-10-11** ("people need to
      be reminded to revise, not to search for a surah or juz"): `src/light/scenes/lampField.ts`,
      `src/ui/lampField.ts`, the Grid / Lanterns chip and `lampsView` are gone; ☰ → My memorisation is
      the canvas grid as before, with the Today card reminder ("3 lamps are getting dim in …"). Proper
      revision reminders belong to T5b (a dim lamp opens a revision session; local notifications)
- [x] L5 Moments — **3D parts removed by the owner on 2026-10-28** (gift lift/bloom, the Ramadan crescent and Eid backdrops: `src/ui/moment.ts`, `scenes/moments.ts`; the Ramadan moments are plain 2D dialogs; the export lantern and the opening sweep stay). As built: gift lift-off / lantern bloom, wall lanterns over a night horizon, Ramadan crescent
      over the cloud sea + Eid recap, export lantern, opening light sweep over the logo
      (built 2026-10-10: `src/light/scenes/moments.ts` (pure in t) + `src/ui/moment.ts`: `playMoment()`
      (full-screen or inline, tap/back skips, flat → a short CSS glow) and `lightBackdrop()` (a 3D scene
      behind a screen's content). **lift** — a gift sent: a warm light lifts off the cloud sea with a
      trail and settles as a new star while the camera tilts and rises after it ("Your gift is on its
      way", in the composer dialog); **bloom** — a gift opened: over the stage a lantern rises, glows
      and blooms open while the camera eases in towards it, during the recitation load; **horizon** —
      the ayah wall host: 160 lanterns rising over a night horizon and still water behind the wall
      (`.wall-sky`); **crescent** — Ramadan's first-night moment: the sky fills with stars over the cloud
      sea under the moment's own crescent (no 3D moon behind the text), Noor nearby; **eid** — the Eid
      recap: dawn over the cloud sea with lanterns drifting up. Export (editor + wall keepsake): a paper
      lantern (`src/ui/lanternProgress.ts`) fills with light and glows as it fills, the % beside it.
      Opening (`src/ui/opening.ts`): on a launch (no address of its own) one band of light sweeps across
      the logo on the splash colour, ≤ 1.2 s, the app loading underneath; tap ends it; reduced motion →
      none. (The wall's **horizon** backdrop was removed with the wall, 2026-10-11.) Camera moves added to the still scenes: Starfield drift floats forward through fine dust
      (`moteField` gained a depth wrap) while looking slowly across the band; the constellation keeps
      its camera still (taps) but its motes, mist and sky shift against the ring's wobble at their own
      depths)
- [x] ~~L6 Home sky~~ — **removed by the owner on 2026-10-28** (☰ → Sky, the Today line, `src/ui/sky.ts`, `src/light/scenes/homeSky.ts`, `flatSky.ts`, `skyLayout.ts`; the reading log `src/data/readLog.ts` stays for T9). As built
      (built 2026-10-10: `src/data/readLog.ts` — a local reading log (localStorage `readLog`, day →
      pages, this device only, ~13 months kept for T9); the mushaf's 20 s read timer now always runs and
      logs the page (circle portions and Ramadan as before). `src/light/skyLayout.ts` (no three): every
      page has a fixed place — each juz a thread of stars climbing the sky, juz 1 on the right, a juz's
      first page low; circles as small rings of 30 above. `src/light/scenes/homeSky.ts`: night sky over
      a slow cloud sea, read pages lit (brighter when read recently, larger and warmer when returned to
      on several days), the rest faint points, fine threads between neighbouring read pages, circle
      rings (free faint, taken in the member's colour, done bright), motes, Noor near the viewer (a
      camera child); camera drifts very slowly around where you look. `src/ui/sky.ts`: ☰ → **Sky** and
      the Today line "Your sky · N stars this month" (only when > 0) → full screen; month + "N pages read
      this month" (no streaks, no comparison); drag to look (eased, short gentle glide), wheel / ←→;
      tap = nearest lit star ≤ 30 px (any page ≤ 14 px) → that page, a ring or its name → the circle;
      "Juz N" of the view. Flat (`src/light/flatSky.ts`): the same stars, threads and rings as a still
      2D picture, redrawn only when panned; fps watchdog → flat. Family circles are not shown)
      Depth pass (2026-10-10): the sky became a place to fly through — each juz a spiral thread of
      stars rising out of the cloud sea, 30 threads standing to alternate sides of a winding avenue
      (`pagePositions()`), stars sized by distance and fading into haze, circle rings tilted above the
      avenue; the sky opens with a fly-in from high above down to the juz read most recently; swipe
      up/down (wheel, ↑↓) travels along the avenue, sideways swings round it, with a soft glide; labels
      for circles follow their rings. `cloudSea()` (shared) now dissolves its far edge into the sky dome
      (no hard horizon line in any scene). Flat version unchanged (the 2D dome picture)
- [x] ~~L7 Kids path in 3D~~ — **removed by the owner on 2026-10-28** ("keep it 2D, light performance"): the Kids space always shows the 2D lantern path with Noor and the constellations (L7b); `src/ui/kidsSky.ts`, `src/light/scenes/kidsPath.ts` and the "Lanterns in 3D" switch are gone. As built
      (built 2026-10-10: `src/light/scenes/kidsPath.ts` — the 38 surah lanterns (round paper, thin caps)
      float over a soft cloud sea and wind away into the distance in the 2D path's own wave
      (`lanternAt(i)`), soft dots between them, haze (fog) far off, motes; dawn palette by day, night
      with stars in dark mode. Learned = lit from inside with a warm glow and flame; next = a breathing
      ring; lanterns the camera has passed fade out. The camera glides along the path behind and above
      the lantern in focus, looking ahead. Noor rests beside the next lantern; when a lantern was just
      lit (`kidsBloom`) it blooms, Noor arcs over to the next one and the camera follows. On the light
      dawn sky the ring and Noor are painted warm (additive light would vanish). `src/ui/kidsSky.ts`
      mounts it over the Kids home: the 2D path's own stops (links + surah names) are placed every frame
      on their lantern's projection and scaled by distance (labels hidden when far), so taps, keyboard
      focus and screen readers work as before; swipe up/down or the wheel glides along the path (soft
      glide after letting go; a swipe never opens a lantern), focusing a stop glides to it.
      `LightStage` gained `afterFrame`. Parent sheet → Show → **Lanterns in 3D** (`kidsSettings().sky3d`,
      on by default). Flat quality (reduced motion, battery saver, no WebGL), the switch off, or the
      fps watchdog → the 2D path, unchanged)
- [x] L7b Kids path data + Noor in 2D + surah constellations (2026-10-10): `src/data/kidsPath.ts`
      (no drawing, no three) holds the path for both versions — order (`KIDS_SURAHS`), `kidsPathState()`
      (lit / next / just-lit bloom / focus), the wave (`wave()`, `pathPoint()`), `bloomNext()` /
      `takeBloom()` and `constellation(surah, ayahs)`: one star per ayah, ayah 1 in the middle, a
      loosened sunflower spread, each star joined to the nearest earlier one (seeded per surah). 2D path
      (`showKids()`): the same layout as before; a learned lantern has its constellation (SVG) up and
      away from its name, whose stars come out in ayah order when it blooms; **Noor** (`src/ui/kidsNoor.ts`,
      CSS only: warm core + soft halo + a 4-light trail shown only while gliding; no face/body; silent)
      rests beside the next lantern (above the last lit one when all are lit) and, after "We learned it",
      brightens beside the lit lantern and glides over to the next (3.2 s). Listen & repeat: Noor in the
      corner of the controls row (never near the Arabic) — breathing at rest, a soft swell on each word
      start from the timings while the reciter plays, warmer and slower on "Your turn", brighter ~2 s on
      "Well done" and on "We learned it" (the path opens 1.4 s later). Reduced motion: no breathing,
      swells or star stagger; a glide becomes a fade out and in. 3D path: the same constellations as
      glow points + soft lines beside each lit lantern (`kidsPathScene(count, night, surahs, ayahs)`,
      built on first light, drawn star by star on a bloom); the 2D Noor and SVG stars are hidden there
      Fix (2026-10-11, owner: stuck on the last ayah): a surah's last timing runs past the end of its
      recording (e.g. An-Nas 40.91 s of 40.0 s), and the phone never reported the end, so listen &
      repeat waited for ever. Now the last ayah stops 0.8 s after its last word, and a playhead that
      stops moving within 1 s of the last word (or for 4 s anywhere in the kept recording) also ends it

### Phase 8 — Me tab: streaks, goals, dhikr, widgets (owner request 2026-10-28)
Owner decisions: a daily streak with a living flame (a day is lit by meeting one daily goal — owner decision 2026-10-28; at first by opening the app), a free streak
freeze each week, a friend can relight a lost streak; honest page counting (a page counts only after
it has been on screen for the reading time, default 1½ min, owner-confirmed; read-aloud check later);
stats for week / month / all time; daily goals incl. dhikr (tasbih, istighfar, tahleel, hawqala,
morning adhkar from a published source, never written by us); milestone badges; My library; widgets
(streak, tasbih, daily ayah, prayer times; prayer times on the lock screen). No reading calendar, no
duas/reflections section in Me.
- [x] M1 Me screen `#/me` (`src/ui/me.ts`, the Me tab now opens it; ☰ still opens the menu, and
      Me → Settings and more opens it on the mushaf): flame (`src/ui/flame.ts`, SVG + CSS, tiers at 7 / 30
      days, out = ember + smoke, still with reduced motion / old-phone mode), this week's days, weeks in a
      row (≥ 3 lit days), freeze (one a calendar week from Monday, used by itself for a missed day; if the
      missed days cannot all be covered the flame goes out and `lost` is kept 2 days for a friend's
      relight), best. `src/data/journey.ts` (localStorage `journey`, this device): `recordOpen()` (main.ts,
      on start and when the app comes back; not in the Kids space), `countPage()` (ayat starting on the
      page; a surah is finished when all its pages were counted since its last finish, within 60 days),
      `addListen()` (player: recitation actually played), `reelMade()` (export), `stats()`. The mushaf's
      read timer counts visible seconds only: `pageSeconds()` (1 / 1½ / 2 / 3 / 4 min, set in Me) logs the
      page (`readLog`, now also used for the stats); Ramadan's portion keeps its 20 s
      Second pass (owner request 2026-10-28): the flame is a bold streak icon (rounded flame with a curl,
      inner flame, core, glossy highlight; gentle sway) on the Me card and the streak widget; the card is
      compact (76 px flame beside the count); "Your week" folded into the stats (this week's tiles show ▲/▼
      against last week); badges show 4 (earned, then the closest) + "All n of 20"; the settings (reading
      time per page, prayer location / method / Asr / lock screen, dhikr reminders, then the app menu) moved
      to `#/me/settings` (⚙ in Me's top bar). **What lights the flame** (owner decision 2026-10-28, "any one
      goal met"): a day is lit (`DayRec.f`, `lightFlame()`) when one of the day's goals is met or one page was
      counted (`anyGoalMet()`; with no goals set, opening the app does), checked by `rewards.ts` after the
      app was opened that day (not from the Kids space); missed days are settled once per day (`settle()`:
      freeze or the flame goes out); widget strings say "Meet a goal today to keep it"
      **Rewards** (owner request 2026-10-28): nothing pops up by itself; a met goal or a new badge waits on Me
      with a glowing **Claim** (`src/data/claims.ts`; `DayRec.cl`, `State.claimed`; a dot on the Me tab).
      Claim plays a moment (`src/ui/celebrate.ts`, SVG + CSS + a spark canvas `src/ui/sparks.ts`; the button
      becomes a seed of light that flies to the centre, gathers and bursts): **lantern** (a daily goal),
      **star window** (every goal), **rising flame** (streak badges), **rosette** (first surah, 10 surahs, a
      juz, 100 ayat memorised, 10,000 dhikr), **Khatm** (doubled rosette, halo, date), **medal** (the rest).
      Vibration on each beat, no sound; reduced motion → the still end picture. The first look at Me after
      the flame is lit, it *catches* on the card (flare, sparks, the count ticks on). **Goals engine**: a
      starting pace (Gentle / Steady / Devoted, `PACES`), at most one weekly suggestion (`goalTip()`: met on
      ≥ 5 of 7 days → a step up; ≤ 1 while the app was used ≥ 3 days → a step down; never automatic),
      **your own goals** (≤ 5: a name, once or ×2–20, every day or chosen weekdays; `DayRec.cu`) counting
      like any goal. **Sync** when signed in (`src/cloud/sync.ts`): each device's journey + reading log as
      its own `user_docs` row (`state` / `journey:{device}`), others kept in localStorage `journeyOthers`
      and read combined (`view()` in journey.ts: counts added, flags and lists joined, a freeze released
      when another device lit that day; `readLogAll()`); goals as `setting` / `goals`, the newest set wins.
      **Theme colours** (owner request 2026-10-28): the flame (tiers 1–3; the out ember too), completed goal
      rings, Claim buttons, the tab dot, the relight page and every reward moment (art, seed, sparks, rays)
      follow the chosen Theme colours gradient: `rewardPalette()` / `rewardCss()` in `theme.ts` (`--rw-*`);
      the Android widget flame keeps its fixed warm colours.
      **Streak moment** (owner request 2026-10-28, after a Duolingo reference): the flame is a chunky
      two-tone streak icon (main tip leaning right, a small bump on the left, a round inner drop; app and
      widget drawables); the week row shows a check in a theme-gradient circle for each lit day; the card's
      flame breathes; once a day, the first time Me is open after a goal lit the flame (and only while no
      sheet, tasbih or reward is open), `src/ui/streakMoment.ts` plays: the flame springs up from a burst,
      the count rolls from yesterday's number to today's, today's circle stamps in its check, Continue
      (pref `flameSeen`; reduced motion → the still end picture)
      **Light (Noor)** (owner decision 2026-10-28, "Light (Noor), private"): each claimed reward adds Light,
      stored per claim in `DayRec.n` (id → amount; the same claim on two devices counts once, merged by max):
      `lightFor()` in `goals.ts` (pages 10/page, memorise 15/ayah, reels 10, dhikr 5/10/20/40 for 33/100/300/1000,
      adhkar 15, own goals a fixed 10), `ALL_LIGHT` 20 for every goal met, `BADGE_LIGHT` 25/50/100/200 by tier.
      The moment shows "+N Light" counting up; under today's goals a strip with a lantern filling with this
      week's Light (against 7 × `dayLightMax()`) + today / week / month, tap → "Your Light" sheet (+ all time,
      a line that it is not a measure of reward); stats tile Light with ▲/▼. No leaderboard, never shared
      Speed: streak() and stats('all') are memoised per change, goals parsed once per change, rewards and
      the Me screen repaint at most once a frame, the streak card only when it changed
- [x] M2 Daily goals (`src/data/goals.ts`, localStorage `goals`; Me → Today's goals + Edit): pages read
      (counted pages), ayat memorised (+/− by the user), reels made, dhikr on the **tasbih counter**
      (`src/ui/tasbih.ts`: Subhan Allah, Alhamdulillah, Allahu Akbar, tahleel, istighfar, hawqala; targets
      33–1000; ring, vibration, Undo) and the morning adhkar as a "Mark done" (no adhkar text yet: it will
      come only from a published, cited collection). A day with every goal met is marked (`g`).
      **Your week** (this week since Monday vs last week). Stats also show juz finished, ayat memorised,
      dhikr. **Badges** (`src/data/badges.ts`, 20: streak 7/30/100/180/365, pages 1/100, surahs 1/10, a juz,
      Khatm = all 604 pages counted, memorised 10/100, dhikr 1k/10k, 10 h listening, reels 1/10, goal days
      7/30) drawn by `src/ui/badge.ts` (eight-pointed star medallion in bronze/silver/gold/emerald, line
      icon, a passing shine; grey with progress while locked; tap → goal + progress or date earned).
      `src/ui/rewards.ts` checks goals and badges on every journey change (toast, or the badge sheet in Me).
      **My library**: bookmarks, reels and drafts, the last pages read
- [x] M3 **Prayer times** (`src/data/prayer.ts`, `adhan`; Me → Prayer times): location rounded to 0.01°
      (never sent), method guessed from the time zone (12 methods, changeable), Asr Standard / Hanafi,
      next prayer + today's six. **Dhikr reminders** (Android; Me → goals: 06:30 / 09:00 / 13:00 / 17:00 /
      21:00, daily local notifications, ids 3000–3004 → `#/me`). **Android widgets** (`src/ui/widgets.ts` ⇄
      `WidgetsPlugin.java`, SharedPreferences `widgets`): `StreakWidget` (flame vector lit / low / out,
      days, this week, weeks; works out yesterday/today itself until the app opens), `TasbihWidget` (tap
      to count, ⟳ next dhikr, progress to the goal; counts kept natively until the app takes them into
      the journey on start/resume), `PrayerWidget` (next prayer + today's times, 14 days handed over);
      **lock screen**: an optional silent ongoing notification "Asr · 15:42" with a countdown
      (`Widgets.prayerTick()`, channel `prayer_next`, id 7400), moved on by an inexact alarm at each
      prayer (`PrayerAlarm`, also after boot / update / clock change). Manifest: coarse location, boot.
      The daily ayah widget is unchanged. Only verifiable on the phone (Java checked with javac against
      the Android 15 framework jar)
- [x] M4 Friend relight: migration `20261028000000_m4_relight.sql` (`relights`: 10-char code, owner's first
      name, streak, 1–3 missed days, 48 h; no table access; `ask_relight` (Google accounts only, 3 a
      week), `relight_preview` (anon too), `give_relight` (another Google account, once, 10 a day),
      `take_relights` (owner, once); pgTAP `relight.test.sql`). App: Me hero → "Ask a friend to relight it"
      (`src/together/relight.ts`: share sheet / copy link `#/relight/{code}`), friend's page
      `src/ui/relight.ts` (the ember catches; sign-in first, resumed after), the owner's app takes relights
      on start / resume / Me (`journey.revive()`: missed days → `revived`). Privacy page updated
- [x] M3c (owner request 2026-10-29): **location** via `@capacitor/geolocation` in the app (`src/data/location.ts`;
      the WebView's own geolocation failed although the permission was granted), clear messages for denied / off /
      timeout; the **☰ menu is gone** — its items live in Me → ⚙ (Reading, Prayer, Widgets, Reminders, Your Quran,
      App; mushaf-bound ones open the mushaf with an intent: bookmarks, reflections, ramadan, tour, `page:N`); the
      device check ⚙ on the surah list is now a Settings link (Device check stays in the studio's quality menu);
      a **Light chip** (`src/ui/lightChip.ts`) in the Me and studio top bars; **streak + tasbih widgets redrawn**
      in the theme colours (`WidgetArt.java`: night background, the app's flame, Mon–Sun checks, ring; data
      `theme`, `streak.hist`, `letters`); **prayer + daily ayah widgets** on the same themed night card (next prayer's
      column in a pill); **daily ayah in Arabic** (Me → ⚙ → Widgets → Today's ayah: Arabic / translation,
      `dailyWidgetLang()`): the app draws the next 21 days' ayat in its Quran font as PNGs (`arabicPicture()` in
      `morning.ts`) → `DailyPlugin.store` writes `files/daily/{key}.png`; without a picture the translation shows
      Prayer reminder sounds **Adhan (opening)** / **Full adhan** (`prayer_adhan_full.ogg`, channel `prayer_adhanFull`; swiping the notification stops it) (owner request 2026-10-29, default for new settings): the opening
      "Allahu Akbar, Allahu Akbar" (21 s, faded, `res/raw/prayer_adhan.ogg`, channel `prayer_adhan`; a copy in
      `public/sounds/` plays when the chip is tapped) cut from a recording the owner supplied and approved
- [ ] M5 Read-aloud page check (on-device speech recognition matched to the page; no audio kept)

---

## Repository layout (target)

```
docs/               feature plans (together.md, kids.md, grow.md, light.md)
public/data/        bundled Quran text, meta (generated by scripts/, committed)
public/fonts/       Quran fonts + licenses
public/backgrounds/ curated media + CREDITS.md
scripts/            one-off data fetch/verify scripts (node)
src/light/          three.js scenes (lazy-loaded), Noor, 2D fallbacks
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
