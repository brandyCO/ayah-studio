# The Light — a companion for every Quran learner

Status: **idea, expanded 2026-10-10 — nothing built.** Owner idea: one warm circle of light, with no
face and no expressions, that guides every user through the whole app, moves freely over the screen,
glows like a heartbeat, and is loved by children and adults alike.

This document expands the idea across every feature. It follows the same shape as `kids.md` and
`grow.md`: principles, the character, feature by feature, build phases, acceptance criteria, open
questions. Nothing here changes the non-negotiable rules in `CLAUDE.md`.

---

## 0. Open questions for the owner (answer before L1)

1. **Name.** Working name "the Light". Options: keep it unnamed; "Noor/Nur" (light in Arabic);
   something small and humble such as "Qindil" (lantern) or "Shama'a" (candle). Recommendation:
   **not "Nur"** — see question 2. A lantern word fits the Kids lanterns already built.
2. **Theological care.** In Islam *Nur* is closely tied to Allah's own light (An-Nur 24:35) and to the
   Quran itself. A character that *is* "the light" could be read as representing something sacred.
   Recommendation: present it as a **small lantern-light that carries you to the Quran**, never as the
   light of guidance itself, never as an angel, spirit or divine presence, never worshipped or
   prayed to, and have a scholar or trusted imam read this document before release. Its words are
   about the app ("let's open the page"), never about faith.
3. **How much "take care of it".** Recommendation: the Light is **warmer when you come back and never
   sad when you don't**. No hunger, no streaks, no points, no sleeping because you left (consistent
   with `kids.md`). Confirm.
4. **Does the Light ever appear inside exported reels?** Recommendation: **never over text**; an
   optional generated "drifting light" *background scene* (calm abstract media, like the other
   defaults) is fine. Confirm.
5. **Sound and vibration.** Recommendation: **no sound at all**; optional soft heartbeat vibration on
   Android, off by default.
6. **Colour.** Gold-white core (warm, "close to the heart") with the brand emerald→teal as its halo,
   so it belongs to the logo. Let the user choose gold / emerald / rose in settings. Confirm.

---

## 1. Principles

1. **A guide, not a game.** It points, waits, and brightens. It never scores, nags, interrupts a
   recitation or blocks a tap.
2. **Never touches the Quran.** It never covers Quran text, never sits between the reader and the
   page they are reading, and never draws on the video. Reading and reciting stay quiet by default.
3. **Alive but calm.** Slow springs, long easing, a heartbeat of about 60 bpm (a 1 s breath).
   Nothing bounces, shakes, spins or flashes. Same respect as the "calm effects only" rule.
4. **No face, no body.** Feeling is expressed only by brightness, size, halo, pulse speed, trail and
   how it moves. This is also why it works for every culture and age.
5. **Always optional.** Skip is always visible. ☰ → **The Light** has: Off / Guide only / Full; size;
   colour; heartbeat vibration. Reduced-motion makes it nearly still (fades, no travel).
6. **No new religious content.** Everything it says is app guidance we wrote (UI strings, translated
   like the rest of the UI). No AI-written religious content, no rulings, no du'a text of our own.
7. **Local first.** Its state (what it has shown you, its colour) lives on the device; it syncs as
   ordinary settings when signed in. No tracking, no extra network.
8. **Kids rules win.** Inside the Kids space it follows `kids.md`: no points, streaks, badges,
   confetti or sound effects.

---

## 2. The character

### Anatomy (one canvas object)
- **Core**: soft white-gold disc. **Halo**: radial gradient in the brand colours. **Breath**: halo and
  core scale 1.00 ↔ 1.06 on a ~1 s heartbeat (two close pulses, "lub-dub", then rest).
- **Trail**: a very short, fading comet of motes when it travels fast; none when still.
- **Light cast**: it gently lights what it is beside (a soft radial brightening of the nearby
  control), never a hard spotlight.
- Size: 14–28 px core (user setting), halo up to ~3×.

### States (expressed only through light and motion)
| State | Looks like |
|---|---|
| **Resting** | Slow breath, tiny drift, hugs the edge of the screen |
| **Curious** | Leans toward your finger without touching it, halo slightly wider |
| **Guiding** | Travels to a control, settles beside it, brightens it, shows one line of text |
| **Listening** | During recitation: dims a little and breathes with the voice's loudness |
| **Following** | Moves with the word being recited (only where real word timings exist, rule 8) |
| **Welcoming** | When you return after days: a slow rise of warmth, then rest — no message of absence |
| **Glad** | A soft bloom (once) after finishing something: a khatm, a surah learned, an export |
| **Dusk** | At Maghrib and in Ramadan nights it takes an amber tone; at night it is lower and dimmer |

### How it moves
- A critically damped spring toward a target point, plus slow Perlin-style drift so it is never
  perfectly still ("free, no structure"); speed is capped so it never feels frantic.
- **No-go zones** it routes around: the Quran text block, the reel canvas, the keyboard, the title-safe
  edge during video. It can rest in page margins, the title bar, bars and empty areas, and may cross
  text only fast and dim while travelling (never pause on it).
- **Touch**: long-press-and-hold on it → it warms and you can drag it somewhere; a double tap sends it
  to rest; a tap asks "What can I help with?" (a small contextual hint list, §3.2).

### Speech
Max one short line (≤ 8 words) in a small calm bubble in the UI font — never Arabic Quran font,
never styled like an ayah. Lines are translated with the rest of the UI (Arabic UI included).

---

## 3. Feature by feature

### 3.1 First launch and the tour (replaces the three-card tour, G3)
- The Light is born on a dark screen as a faint point, grows to its glow, then the app fades up around
  it. Skip is visible from the first second ("Skip" in a corner, also swipe up).
- It guides *real* controls instead of cards: it goes to the ☰ menu ("Everything lives here"), to
  an ayah ("Hold an ayah to select it"), to the selection bar ("Turn it into a reel"), to ▶
  ("Listen while you read"), to Together. Each step waits for the user to actually do it, or "Next".
- Resume: leave mid-tour and it continues later; ☰ → The Light → "Show me around again".
- Existing users: shown the new tour once, skippable, never forced.

### 3.2 Help on demand ("Ask the Light")
Tap the Light → a short list of things that make sense *on this screen*: "How do I select several
ayat?", "Where is my bookmark?". Choosing one shows it by moving to the control (a guided pointer).
All answers are scripted UI help from a table (`src/light/help.ts`), no AI, no network.

### 3.3 Mushaf reading
- Quiet by default. It rests in the outer margin and does not pass over the text block.
- **Long-press an ayah** → the Light drifts to the margin by that ayah and brightens it softly (it
  becomes the selection mark's glow).
- **Margin marks** (bookmark, reflection, Khatm juz edge) are small steady lights — "sparks" of the
  same kind — and the Light visits them when you open the page ("You wrote here on …" pill).
- **Page turn**: the Light slides across with the page in your swipe direction, a hint of life.

### 3.4 Listening while reading (the best fit)
- The existing tinted ayah and lit word become **the Light's work**: while the reciter speaks, the
  Light sits in the margin beside the current line and a soft glow follows the word (QDC word timings
  only; where timings are missing it simply glows on the ayah — never a guessed word, rule 8).
- It breathes with the recitation's loudness; on a pause it settles; at the end of an ayah a tiny
  rise. Reduced motion → plain static tint as today.

### 3.5 Reel editor (Shorts Studio)
- **Never on the canvas/preview** and never in the export (rule 6). It lives in the tool area.
- Guides the first reel: reciter → text mode → scenes → mood → Export, one step at a time, skippable.
- Explains the *recitation-led* idea once ("The recitation sets the length; scenes fill it exactly").
- While exporting: it is the progress indicator beside the bar (brightens with percent), then a single
  **glad** bloom on Save, with the credits reminder ("Background by … on Pixabay").
- **Optional "Light" background scene** (generated, calm, abstract, no figures): a slow orb of light
  in the dark, as a media item beside the other defaults — for users who want the motif in a reel,
  behind the text with the legibility scrim, like any background.

### 3.6 Drafts, Gifts and Walls
- **Drafts**: empty state is the Light resting in a glow, "Your reels will wait here."
- **Gift an ayah**: the sealed card *is* a small light; tapping releases it and it unfolds into the
  reel. The sender sees a faint spark when it was opened.
- **Ayah wall**: each guest entry is a lantern of light (already lanterns); the host's Light drifts
  gently between them. Larger wall → more motes, same calm.
- **Khatm reel / Ramadan reel**: the Light only appears on the *app screens around* the reel.

### 3.7 Khatm circles and Family circles
- The ring of 30 is made of small lights: free = outline, taken = the member's colour, done = lit.
- When someone finishes a juz since you last looked, the Light carries a spark from their part into
  the ring ("Fatima finished Juz 7"), once. A completed khatm: all lights rise together in a slow,
  silent bloom — no confetti.
- Family circles: each child's 38 lanterns are tiny lights; a du'a note arrives as a light that settles
  by the child's name.

### 3.8 Memorisation lamps
- The lamps *are* the Light's relatives: page lamps in the grid are small lights; a dim one is "asking
  for a visit". The Light drifts to the dimmest page of the day ("These three would like a visit").
- A revision session (T5b): the Light shows only the page and the Reveal; "Revised today" gives a
  warm bloom on that page's lamp. "Needs work" simply dims it back, no judgement.

### 3.9 Ramadan, Ayah of the day, reminders
- First night: the Light rises with the crescent (the existing full-screen moment becomes its entrance).
- Morning notification and widget (G2): the Light is the widget icon's glow; the notification small
  icon stays the crescent/lantern glyph. Tapping opens the ayah and the Light waits beside it.
- Maghrib reminder: amber **dusk** state on the Today card; "Tonight's ayah" is where the Light
  settles.
- Eid recap ("Your Ramadan"): the Light gathers the days you read into one soft glow.

### 3.10 Reflections
- The Light stays still and dim while you write (no distraction), brightens a little when you save.
- Old note dots: it visits one once per session, as already designed.

### 3.11 Kids space (the Light's closest home)
- Kids' version: bigger, slower, rounder halo, a friendlier heartbeat; speaks in short, simple lines
  (≤ 5 words), always with the child's name if the parent set it.
- **Lantern path**: the Light carries a flame to the lantern a child just learned and lights it; the
  next lantern breathes as today. No counts, no streaks.
- **Listen & repeat**: during "Your turn" the breathing ring is the Light, waiting at the child's
  pace; during the ayah it follows the lit word (word timings only).
- **Gentle care**: a child may tap and hold to "warm" it — it glows and settles. It never sulks,
  gets hungry or leaves. (Resolves question 3 for Kids.)
- Parent sheet: Light on/off, size, quiet mode for tantrum-free bedtimes.

### 3.12 Recite & Compare (G6, on hold)
- When built: the Light *listens* while you record (breathes with your voice), then sits quietly
  between the Sheikh's waveform and yours. It never grades; it only shows the two tracks together.
  The warm "glad" is for finishing a recording, not for accuracy.

### 3.13 Settings, device check, account
- ☰ → **The Light**: Off / Guide only / Full; size S/M/L; colour gold/emerald/rose; heartbeat
  vibration (Android); "Show me around again"; "Reset what the Light has shown".
- Device check lists its frame cost and whether reduced motion is on.
- Account: setting syncs like other prefs; nothing else about the Light is stored in the cloud.

### 3.14 Accessibility, RTL, performance
- **Screen readers**: the Light is decorative (`aria-hidden`); every line it says is also in a polite
  live region and every guided control keeps its normal label. Tour steps are keyboard-reachable.
- **Reduced motion**: it fades between positions, no travel, no breathing scale (opacity only).
- **RTL**: positions mirror in the Arabic UI; the bubble flips; the mushaf strip keeps its own
  direction.
- **Performance**: one full-screen transparent canvas, `pointer-events: none` except the Light itself,
  ≤ 2 ms per frame, paused when the tab is hidden, the screen is off or the editor is exporting
  (export must never share the main thread with decorative animation). Capped at 30 fps on low-end
  devices; off automatically if frames drop.
- **Battery**: no timers while paused; resting state redraws at 15 fps.

---

## 4. Architecture

- `src/light/light.ts`: the single canvas overlay (singleton), spring/drift physics, states, no-go zone
  registry, `reducedMotion` handling.
- `src/light/api.ts`: tiny API the screens use:
  - `light.goTo(target: Element | Rect | Point, opts?: { say?: string; hold?: ms; anchor?: 'side' | 'above' | 'below' })`
  - `light.mood(state)` · `light.say(text)` · `light.bloom()` · `light.rest()`
  - `light.avoid(el)` / `light.release(el)` — register no-go areas (mushaf text block, reel canvas).
  - `light.follow(getPoint: () => Point | null)` — follow the recited word / progress.
- `src/light/tour.ts`: tour steps as data (`{ id, target selector, line key, wait-for event }`).
- `src/light/help.ts`: scripted help table per route.
- `src/i18n/*`: every line a key; Arabic provided with the interface.
- `src/data/prefs.ts`: `lightMode`, `lightSize`, `lightColor`, `lightSeen` (synced settings).
- No new network, no new dependency. Canvas 2D only.
- Tests: `scripts/check-light.mjs` in `npm run check` (physics never leaves the viewport, no-go zones
  respected, reduced-motion path, speech ≤ 8 words in every locale).

---

## 5. Build order

| Phase | What | Done when |
|---|---|---|
| **L1** Prototype | The Light on the mushaf: breath, drift, follow finger, settings (Off/Guide/Full, size, colour), reduced motion | Owner approves how it looks and moves on the phone |
| **L2** First-run guide | Replace the tour; real controls; skippable; resumable; "Show me around again" | Fresh install is guided end to end in under 90 s, skip works at every step |
| **L3** Reading companion | Margin behaviour, selection glow, page-turn, **listening: Light follows recited words (word timings only)** | Never overlaps the text block; falls back to ayah glow with no timings |
| **L4** Studio guide | Editor steps, export progress, Save bloom, "Light" background scene | Never visible in preview canvas or export |
| **L5** Together | Khatm ring sparks, gifts, walls, family du'a lights | Calm, no confetti, reduced-motion tested |
| **L6** Memorisation & Ramadan | Lamp visits, dusk state, first-night entrance, Eid recap | Matches existing logic, no new streaks |
| **L7** Kids | Kids Light, lantern lighting, "warm it", parent controls | Meets `kids.md` rules; Families checklist re-read |
| **L8** Help & polish | "Ask the Light", help table, accessibility pass, widget glow | Passes screen-reader and RTL walkthrough |
| **L9** Recite & Compare | With G6, if/when un-paused | — |

Each phase ships behind `feature('light')` (like `tafsir`) until the owner confirms question 2, then
the flag becomes default-on.

---

## 6. Acceptance checklist for the whole feature
- [ ] No face, eyes or mouth anywhere; feeling shown by light and motion only
- [ ] Never covers Quran text, never appears in an exported reel's frame, never makes a sound
- [ ] Off / Guide only / Full works; Skip is visible at every tour step
- [ ] Reduced motion tested; screen-reader and RTL walkthrough done
- [ ] No points, streaks, badges, confetti, guilt or "missed you" messages — anywhere, including Kids
- [ ] Every line it says is a translated UI string; no religious statements of our own
- [ ] ≤ 2 ms/frame on the owner's phone; paused during export
- [ ] Theological review done (question 2) before the flag becomes default
