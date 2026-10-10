# Ayah Studio — "Light": a calm world of light around the Quran

Production plan for real-time 3D (WebGL, three.js) scenes *around* the Quran: Night listening, light
reel backgrounds, the Khatm circle as a constellation, revision lamps as a lantern field, short
moments (gifts, the wall, Ramadan, export, the opening), a home sky and a 3D kids path, with
**Noor**, the app's small companion light. Written 2026-10-10 (owner request: "a calm, beautiful
world of light", inspired by the *mood* of thatgamecompany's *Sky: Children of the Light* — light,
giving, companionship, cloud seas, soft glow). Build it phase by phase (L1 … L7 below) and tick the
boxes in CLAUDE.md → "Phase 7 — Light" as phases ship.

Two sibling sessions work at the same time ("Kids space", docs/kids.md, and "Reach & daily",
docs/grow.md). All three coordinate through `main`: merge `origin/main` before opening and before
merging every PR; on conflicts keep both sides (CLAUDE.md and the ☰ menu in `src/ui/mushaf.ts` are
shared spots).

---

## 0. Open questions for the owner (work continues with the defaults shown)

1. **How much 3D on a mid-range phone?** *Default:* every scene starts at the "medium" quality step
   (≤ 1.5 device pixels per CSS pixel, ~2 000 particles, half-resolution glow) and steps down on its
   own when frames take too long; the flat 2D version is always one step away. *Report:* smoothness,
   heat and battery after 15 minutes of Night listening (checklist at the end of each phase).
2. **Night listening and the screen.** A dark, slow scene still keeps the screen on and the GPU
   busy. *Default:* the sleep timer dims to black and then stops the scene and the recitation;
   the lock screen keeps the existing Media Session controls (the scene pauses while the screen is
   off). *Decide:* whether a "screen off, keep reciting" mode is wanted later.
3. **Noor's name.** *Default:* "Noor" (نور, light) — a common word, not a character from Sky.

---

## 1. Art direction — "light, giving, calm"

| | |
|---|---|
| **Palette** | Night indigo `#0b1030` → deep blue `#1a2350` → dawn rose `#e8a6a0` → warm lantern gold `#ffd58a` / `#ffb85c`; cloud tops in pale lilac `#c9c3e6`; star white `#fff6e6` (never pure blue-white). The brand emerald → teal appears only where CLAUDE.md "Logo" / "App colours" allow it (the logo, `.brand-btn`, selected chips, progress) — never as a scene colour behind text |
| **Light** | Everything glows from inside: lanterns, stars, Noor. Glow is additive and soft (wide falloff, low peak); no lens flares, no hard rim lights |
| **Depth** | Exponential fog in the sky colour; far things fade into it rather than shrink to detail. Cloud seas below the camera, sky above |
| **Motion** | Slow and continuous: camera drifts ≤ 0.6 world units/s, rotations ≤ 2°/s; easing is sine or cubic in/out over 1.5–4 s. Nothing snaps, shakes or bounces |
| **Bloom** | A cheap glow (sprites with radial falloff + one half-resolution blur pass where the GPU allows), never a bright white-out |
| **Type** | Quran text and UI stay in the DOM / 2D canvas exactly as today, above the 3D layer (rule 1 below) |

### Noor — the companion
A small floating light (a warm core with a soft halo and a short, fading trail of motes). **No face,
no eyes, no body, no limbs, no wings.** It never speaks, has no sounds and never gives religious
rulings or advice. It shows feeling only through light:

| State | Light |
|---|---|
| Resting | gentle breathing (±8 % brightness over ~4 s), drifts near the viewer |
| Listening (recitation playing) | a soft flicker that follows the word timings |
| Completion (a surah, a juz, a Khatm, a lantern lit) | brighter and warmer for ~2 s, then settles |
| Away / paused | dims slowly; never sad, never "misses you" with guilt |

Noor never blocks text, never moves fast, and never asks for anything.

---

## 2. The rules (on top of CLAUDE.md rules 1–8)

1. **Quran text is never in the 3D scene.** It is never animated in 3D, tilted, distorted, textured
   onto objects or placed inside the scene. It is always flat, still, legible and in its proper font
   (KFGQPC in reels and Night listening, QCF on the mushaf), drawn on top as today.
2. **No figures.** Never depict prophets, companions, angels, the unseen (Paradise, Hell), or any
   human or animal figure; no re-enactment of events. "Stories" are the user's own journey and the
   Quran's structure (surahs, juz, pages) only.
3. **No music or sound effects** (rule 3). Recitation only; the 3D layer is silent.
4. **The mushaf page stays clean.** Big scenes are separate moments or backgrounds; on the page
   itself at most a tiny firefly in the margin.
5. **Slow, soft, dim. Everything skippable.** No fast camera moves, no flashing. Every moment can be
   tapped away. `prefers-reduced-motion`, battery saver (`navigator.getBattery()` low and not
   charging), devices without WebGL and devices that cannot hold the frame rate get a flat 2D
   fallback (gradient + a few still glows), never a broken screen.
6. **Inspired by Sky's mood, never copying it.** No artwork, characters, capes, spirits, names,
   places, UI or music from Sky; our shapes are lanterns, stars, clouds, water and light.
7. **No AI-written religious content.** Captions in moments are UI words or the user's own data;
   religious text comes only from the bundled, verified data.

---

## 3. Technical foundation

### three.js
- `three` pinned to an exact version (**0.186.1**, published 2026-09-24) in `package.json`.
- Loaded only with `import()` from screens that use it. `vite build` must show `three` in its own
  chunk; the entry chunk, the mushaf and the editor chunk must not grow by more than the small
  launcher code (record sizes in the PR).
- Only the core is imported (no `examples/jsm` post-processing): our own tiny shaders for glow,
  clouds and water keep the chunk small.

### Engine `src/light/`
```
src/light/support.ts   capability + preference checks without three (WebGL2, reduced motion,
                       battery, saved quality); safe to import anywhere
src/light/engine.ts    LightStage: renderer lifecycle — create on a canvas, render loop, pause when
                       the page is hidden, dispose on leave, devicePixelRatio cap 1.5, fps watchdog
                       (rolling frame time > 40 ms for 3 s → quality step down; at the lowest step
                       → `onFallback()` → 2D)
src/light/noise.ts     GLSL value-noise/fbm chunk shared by clouds, mist and aurora
src/light/parts.ts     building blocks: instanced star/mote field (one Points draw call), glow
                       sprite texture, cloud sea (fbm shader plane), water with lantern reflections,
                       lanterns lit from inside, Noor
src/light/scenes/*.ts  one module per scene: night (Night listening), dawn, stars, aurora,
                       lanterns, rays (reel backgrounds), constellation, lampField, home sky
src/light/flat.ts      the 2D fallback painter (canvas 2D gradient + glows) for every scene
```

**Determinism.** Every scene is a pure function of **time t (seconds) and a seed**: positions come
from a seeded PRNG at build time, and every animation reads `t` (no `Math.random()`, no accumulated
deltas). Interactive screens feed `t = performance.now()` time; reels feed the reel time. So preview
= export.

**Quality steps.** `high` (dpr ≤ 1.5, full particle count, glow pass), `medium` (dpr ≤ 1.0, 60 %
particles), `low` (dpr ≤ 0.75, 35 % particles, no glow pass) → `flat`. The chosen step is remembered
per device (`localStorage lightQuality`) so a slow phone starts low next time; Device check shows it
and can reset it.

**Reel backgrounds (L2).** A new background kind `light` (`id: 'light:dawn'`, …). Its media holds
a `LightReel` with an offscreen WebGL canvas at the reel's render size; `prepare(t)` renders the
frame for reel time t and `drawScene()` draws that canvas like a video frame, *before* the grade,
the scrim and the text layers, so the legibility scrim (rule 6) still sits over it and nothing ever
covers the text. Export uses the same `prepare(t)` per frame → the `VideoFrame` includes it.
Without WebGL the same id draws its 2D fallback (also deterministic). Gifts and walls accept the ids
once `valid_gift_look()` allows them (a migration + pgTAP checks).

**Night listening (L1).** Particles "breathe" with the recitation, driven by the **word timings**
(a soft swell at each word start, settling in pauses) rather than by reading the audio stream:
deterministic, and it avoids CORS limits on the cross-origin MP3.

**Testing.** Playwright with Chromium's software GL (`--use-angle=swiftshader
--enable-unsafe-swiftshader`) at 390×820 for screenshots; reel frames compared between preview
and export at the same t. Real-device frame rate, heat and battery are on the owner's checklist.

---

## 4. Features

### L1 — Light engine + Night listening
**Experience.** While listening (the player bar), a moon button opens **Night listening**: a
full-screen night sky over a slowly moving cloud sea, the camera drifting very slowly, Noor floating
nearby and flickering softly with the words. The current ayah sits flat in the middle in the KFGQPC
font, with its translation (the chosen translation) and the reference (`Al-Mulk · 67:3`), crossfading
per ayah. Long ayat are never cut or shrunk below a legible size (rule 1): they turn calm pages,
split only between words, and the page shown always holds the word being recited (from the word
timings; without them the pages are turned by a swipe, never guessed — rule 8). Motes swell softly at each word start and settle
in pauses. A sleep timer (off / 15 / 30 / 60 min) fades the screen to dark over the last minute,
then pauses the recitation. Tap once to show the controls (close, sleep timer, play/pause); they
hide after 4 s. Tap ✕ (or back) to return to the mushaf. Lock-screen controls keep working; the scene
pauses while the page is hidden.
**Acceptance.** Opens in < 1 s after three is cached; the mushaf chunk does not grow beyond the
launcher; text never moves in 3D; reduced motion / no WebGL → the flat version with the same text
and timer; leaving disposes the WebGL context (no leak after 10 open/close cycles).

### L2 — Light reel backgrounds + transitions
**Experience.** Scenes → Add/Change → **Light** tab: Dawn cloud sea, Starfield drift, Aurora,
Lantern field, Light rays through mist (animated tiles). Transitions "Light bloom" (a warm glow
swells over the cut) and "Drift through clouds" (a cloud layer passes over the cut). They preview
and export identically and keep the scrim.
**Acceptance.** A frame at t from the preview equals the exported frame at t (visual diff); the
scenes are ids in `project.scenes` (`light:dawn`, `light:stars`, `light:aurora`, `light:lanterns`,
`light:rays`); `applyLook()` / `strictLook()` / `valid_gift_look()` accept them.

### L3 — Khatm circle as a constellation
The 30 juz as stars on a slowly turning ring floating in 3D; free juz faint, taken ones in the
member's colour, done ones bright. On completion all lights drift together into one point that opens
into the date and the members' names (UI font). Tap a star → the same juz sheet as today. The SVG
ring stays as the fallback.

### L4 — Revision lamps as a lantern field
Memorised pages as lanterns over still water with soft reflections; dim (due) ones flicker gently;
"Revised today" makes the lantern rise a little and brighten; pinch / drag to glide across the juz.
The canvas grid stays as the fallback and is one tap away ("Grid").

### L5 — Moments
- Gift: sending → a light lifts off the composer; opening → a lantern blooms into the reel.
- Ayah wall: the lanterns rise over a night horizon (the host screen's background).
- Ramadan: the first-night crescent over the cloud sea; the Eid recap in the same sky.
- Export page: a lantern filling with light instead of the bar (the percentage stays as text).
- Opening: a single light sweep across the logo's sound bars (once per launch, ≤ 1.2 s, skipped
  with reduced motion).

### L6 — Home sky
☰ → **Sky** (and from the Today card): your pages read this month are stars, your circles are
constellations, Noor floats near you. Tap a star → that page. Leads into T9 (Your year) later.

### L7 — Kids path in 3D
With the Kids session through `main`: a 3D version of their lantern path (Noor flying between
floating surah constellations) reading the same data (`src/data/kids.ts`), the 2D path as the
fallback and the default when the device is slow.

---

## 5. Phases (in build order)

Each phase: branch → build → screenshots/frames at 390×820 → PR → Android APK (+ Database rules if
there is a migration) green → merge → tick CLAUDE.md with an "as built" note → phone checklist.

| Phase | Ships | Database |
|---|---|---|
| L1 | `three` + `src/light/` engine, Night listening | — |
| L2 | Light backgrounds + 2 transitions, gifts/walls allow-list | migration + pgTAP |
| L3 | Constellation circle | — |
| L4 | Lantern field | — |
| L5 | Moments | — |
| L6 | Home sky | — |
| L7 | 3D kids path | — |

## 6. What the owner needs to do
- Test each phase on the phone with its checklist; report smoothness, heat and battery.
- Decide §0.2 (screen-off listening) when convenient.
