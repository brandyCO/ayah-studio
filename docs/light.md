# Noor — a companion for every Quran learner

Status: **plan, owner decisions recorded 2026-10-10 (§0) — nothing built.** Owner idea: one warm circle of light, with no
face and no expressions, that guides every user through the whole app, moves freely over the screen,
glows like a heartbeat, and is loved by children and adults alike.

This document expands the idea across every feature. It follows the same shape as `kids.md` and
`grow.md`: principles, the character, feature by feature, build phases, acceptance criteria, open
questions. Nothing here changes the non-negotiable rules in `CLAUDE.md`.

---

## 0. Owner decisions (2026-10-10) — these override anything below that disagrees

1. **Name: Noor.** It depicts **the Noor of Iman** — the light of faith that a believer must keep
   growing, tending and protecting. It is *not* the light of Allah or of the Quran and not an angel or
   spirit; it is the user's own small light of faith. (Scholar/imam read before release is still
   recommended; the flag stays off until then.)
2. **The user takes care of Noor.** Noor needs tending, like iman. Tending = doing the real thing
   the app is for (reading, listening, reciting, revising, dhikr/du'a moments, reflecting). See §2.2.
3. **Noor is not in the Studio.** No Noor in the editor, preview, export page or reels. The Studio
   stays as built. (Replaces §3.5; the "Light" background scene is dropped.)
4. **Noor is the brand character** — popular, trendy, shareable: the app's intro scene, icon/splash
   motif, stickers/wallpapers, and the ultimate guide, helper and friend across the rest of the app.
5. **Intro scene:** Noor glows out of the dark in real-looking 3D, moves smoothly, and transitions into
   the app (§3.1).
6. **Noor speaks to the user** through notifications: morning ayah, morning/afternoon/evening hadith,
   reminders, encouragement (§3.9).

Still open (recommendations stand): sound — none by default; colour — gold-white with emerald halo,
user can change; a hadith source (see §3.9: must be verified and credited, never generated).

### Remaining open questions
1. **Hadith source and collections** (§3.9). 2. **Sound:** none by default. 3. **Colour.**
4. **Does Noor ever dim fully?** Recommendation: it dims to a faint ember but never goes out or
   "dies", and recovers with one act of tending.

---

## 1. Principles

1. **A friend to tend, not a game.** Noor points, waits, brightens and needs care (§2.2), but there
   are no scores, leaderboards, streak numbers, badges or confetti, and it never nags, shames,
   interrupts a recitation or blocks a tap.
2. **Never touches the Quran.** It never covers Quran text, never sits between the reader and the
   page they are reading, and never draws on the video. Reading and reciting stay quiet by default.
3. **Alive but calm.** Slow springs, long easing, a heartbeat of about 60 bpm (a 1 s breath).
   Nothing bounces, shakes, spins or flashes. Same respect as the "calm effects only" rule.
4. **No face, no body.** Feeling is expressed only by brightness, size, halo, pulse speed, trail and
   how it moves. This is also why it works for every culture and age.
5. **Always optional.** Skip is always visible. ☰ → **Noor** has: Off / Guide only / Full; size;
   colour; heartbeat vibration. Reduced-motion makes it nearly still (fades, no travel).
6. **No new religious content.** Everything it says is app guidance we wrote (UI strings, translated
   like the rest of the UI). No AI-written religious content, no rulings, no du'a text of our own.
7. **Local first.** Its state (what it has shown you, its colour) lives on the device; it syncs as
   ordinary settings when signed in. No tracking, no extra network.
8. **Kids rules win.** Inside the Kids space Noor follows `kids.md`: no points, streaks, badges,
   confetti or sound effects, and it never dims for a child (care there is only "warming" it).
9. **Hadith and religious text are never generated.** Only verified, credited editions (§3.9).

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

### 2.2 Taking care of Noor (the iman model)
Noor's **radiance** is a single number from 0 to 1, shown only as light (never as a number).
- **Fuel — what feeds it:** reading pages, listening to recitation, finishing a revision, a reflection,
  a khatm juz, a dhikr/du'a moment Noor offers, making a reel to share the Quran. Each adds a little;
  more different kinds of acts in a day add a little more than repeating one.
- **Fading:** with no tending it slowly dims over days toward a **soft ember floor** — never dark,
  never dead, never gone. One act brings it back up. Away for a long time → the next open is a warm
  welcome, never a reproach.
- **Protect it:** a gentle "shield" idea for "protect it from evil": Noor has a halo that thins when
  neglected; short protective moments the user can choose (e.g. an adhkar/ayah of protection
  **from a verified source**, such as Ayat al-Kursi or the Mu'awwidhat read from the app's own
  verified Quran text) re-thicken it. Noor never says what is "evil" or issues rulings.
- **Growth:** over months Noor grows in size/brightness and unlocks purely cosmetic **auras** (gold,
  emerald, dawn, night). Cosmetics are earned by tending, never bought, never shared as a rank.
- **Wording:** all lines are encouragement ("I'm glowing — let's read together"), never guilt
  ("You abandoned me"). No push notifications whose content shames. No loss mechanics.
- **Local first:** radiance and growth are kept on the device and synced as settings when signed in.
- Kids space: no fading; only warming (see §3.11).

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

### 3.1 Intro scene and first-run guide (replaces the three-card tour, G3)
- **Intro scene (real 3D look):** black screen → a faint point → Noor swells into a luminous sphere with
  depth: volumetric halo, a soft specular core, light rays and drifting motes, parallax as the phone
  tilts (gyroscope, optional). It moves smoothly through space, then *carries the user into the
  app*: the sphere flies toward the camera and dissolves into the mushaf page / Home, with the page
  lit from Noor's colour. 4–6 s, skippable by a tap, no sound, plays on first launch (and from
  ☰ → Noor → Replay intro; optionally a short version on cold starts).
- Tech: WebGL (three.js or a tiny custom shader) with a canvas-2D fallback; short, so its cost is only
  at start (lazy-loaded chunk). Reduced motion → a still glow that fades in.
- **Guide:** after the intro Noor guides real controls instead of cards: ☰ ("Everything lives
  here"), long-press an ayah, the selection bar, ▶ listen, Together. Each step waits for the user to
  do it or "Next"; Skip always visible; resumable; "Show me around again" in ☰ → Noor.
- Existing users: shown once, skippable, never forced.

### 3.2 Help on demand ("Ask Noor")
Tap Noor → a short list of things that make sense *on this screen*: "How do I select several
ayat?", "Where is my bookmark?". Choosing one shows it by moving to the control (a guided pointer).
All answers are scripted UI help from a table (`src/light/help.ts`), no AI, no network.

### 3.3 Mushaf reading
- Quiet by default. It rests in the outer margin and does not pass over the text block.
- **Long-press an ayah** → Noor drifts to the margin by that ayah and brightens it softly (it
  becomes the selection mark's glow).
- **Margin marks** (bookmark, reflection, Khatm juz edge) are small steady lights — "sparks" of the
  same kind — and Noor visits them when you open the page ("You wrote here on …" pill).
- **Page turn**: Noor slides across with the page in your swipe direction, a hint of life.

### 3.4 Listening while reading (the best fit)
- The existing tinted ayah and lit word become **Noor's work**: while the reciter speaks, the
  Noor sits in the margin beside the current line and a soft glow follows the word (QDC word timings
  only; where timings are missing it simply glows on the ayah — never a guessed word, rule 8).
- It breathes with the recitation's loudness; on a pause it settles; at the end of an ayah a tiny
  rise. Reduced motion → plain static tint as today.

### 3.5 Reel editor — no Noor (owner, 2026-10-10)
The Studio is unchanged: Noor never appears in the editor, preview, export page or exported reel.
Making a reel counts as *tending* (fuel) and Noor reacts on the screens around it (the selection bar
and Drafts), not inside it. Noor stickers/wallpapers for sharing are separate assets (§3.15).

### 3.6 Drafts, Gifts and Walls
- **Drafts**: empty state is Noor resting in a glow, "Your reels will wait here."
- **Gift an ayah**: the sealed card *is* a small light; tapping releases it and it unfolds into the
  reel. The sender sees a faint spark when it was opened.
- **Ayah wall**: each guest entry is a lantern of light (already lanterns); the host's Noor drifts
  gently between them. Larger wall → more motes, same calm.
- **Khatm reel / Ramadan reel**: Noor only appears on the *app screens around* the reel.

### 3.7 Khatm circles and Family circles
- The ring of 30 is made of small lights: free = outline, taken = the member's colour, done = lit.
- When someone finishes a juz since you last looked, Noor carries a spark from their part into
  the ring ("Fatima finished Juz 7"), once. A completed khatm: all lights rise together in a slow,
  silent bloom — no confetti.
- Family circles: each child's 38 lanterns are tiny lights; a du'a note arrives as a light that settles
  by the child's name.

### 3.8 Memorisation lamps
- The lamps *are* Noor's relatives: page lamps in the grid are small lights; a dim one is "asking
  for a visit". Noor drifts to the dimmest page of the day ("These three would like a visit").
- A revision session (T5b): Noor shows only the page and the Reveal; "Revised today" gives a
  warm bloom on that page's lamp. "Needs work" simply dims it back, no judgement.

### 3.9 Noor's notifications, hadith, Ramadan, Ayah of the day
Noor is the voice of the app's reminders. Android local notifications first (the plugin and the
morning-ayah notification already exist, G2); web gets the Today card.
- **Morning ayah** (existing G2, now "from Noor"), **morning / afternoon / evening hadith**,
  **Maghrib** and Ramadan reminders, a gentle **"Noor misses reading with you"-style** line
  *phrased as an invitation* ("Let's read a little together"), never as shame.
- **Frequency and control:** user picks which (ayah, hadith morning/afternoon/evening, reading
  reminder, protection moment), the times, and a hard daily cap (default ≤ 3); quiet hours; "snooze
  today"; one-tap "less often". Nothing is sent when the app is already open or the user has just read.
- **Hadith — verified only (rule 1 spirit):** text comes from a published, credited collection bundled
  once with a script and verification (e.g. Sahih al-Bukhari / Sahih Muslim / the Forty Hadith of
  an-Nawawi from a source with a clear licence), Arabic + a credited English translation, shown with
  its reference (collection · number · narrator) and grading as given. Curated shortlist chosen from
  that data by criteria in a script (like `make-daily.mjs`); **no AI-written, paraphrased or
  "summarised" hadith ever**. Owner to confirm the source/licence (new open question).
- **Today card:** Noor's line for the day, the ayah, the hadith, today's portion in Ramadan.
- **Ramadan:** Noor rises with the crescent on the first night, takes an amber dusk state at Maghrib,
  and at Eid gathers your days into one glow ("Your Ramadan").
- Android home-screen widget (G2) shows Noor's glow with the ayah/hadith of the day.

### 3.10 Reflections
- Noor stays still and dim while you write (no distraction), brightens a little when you save.
- Old note dots: it visits one once per session, as already designed.

### 3.11 Kids space (Noor's closest home)
- Kids' version (Noor, the same character): bigger, slower, rounder halo, a friendlier heartbeat; speaks in short, simple lines
  (≤ 5 words), always with the child's name if the parent set it.
- **Lantern path**: Noor carries a flame to the lantern a child just learned and lights it; the
  next lantern breathes as today. No counts, no streaks.
- **Listen & repeat**: during "Your turn" the breathing ring is Noor, waiting at the child's
  pace; during the ayah it follows the lit word (word timings only).
- **Gentle care**: a child may tap and hold to "warm" it — it glows and settles. It never sulks,
  gets hungry or leaves. (Resolves question 3 for Kids.)
- Parent sheet: Noor on/off, size, quiet mode for tantrum-free bedtimes.

### 3.12 Recite & Compare (G6, on hold)
- When built: Noor *listens* while you record (breathes with your voice), then sits quietly
  between the Sheikh's waveform and yours. It never grades; it only shows the two tracks together.
  The warm "glad" is for finishing a recording, not for accuracy.

### 3.13 Settings, device check, account
- ☰ → **Noor**: Off / Guide only / Full; size S/M/L; colour gold/emerald/rose; heartbeat
  vibration (Android); "Show me around again"; "Reset what Noor has shown".
- Device check lists its frame cost and whether reduced motion is on.
- Account: setting syncs like other prefs; nothing else about Noor is stored in the cloud.

### 3.14 Accessibility, RTL, performance
- **Screen readers**: Noor is decorative (`aria-hidden`); every line it says is also in a polite
  live region and every guided control keeps its normal label. Tour steps are keyboard-reachable.
- **Reduced motion**: it fades between positions, no travel, no breathing scale (opacity only).
- **RTL**: positions mirror in the Arabic UI; the bubble flips; the mushaf strip keeps its own
  direction.
- **Performance**: one full-screen transparent canvas, `pointer-events: none` except Noor itself,
  ≤ 2 ms per frame, paused when the tab is hidden, the screen is off or the editor is exporting
  (export must never share the main thread with decorative animation). Capped at 30 fps on low-end
  devices; off automatically if frames drop.
- **Battery**: no timers while paused; resting state redraws at 15 fps.

### 3.15 Noor as a brand (popular, shareable, trendy)
- **Look:** a warm golden-white orb with an emerald→teal halo (the logo palette), 3D-lit with soft
  volumetric light; recognisable as a simple silhouette (one circle + halo) so it works as an icon.
- **Shareables:** wallpapers (phone and desktop), Noor stickers for chats (static and animated WebP,
  calm, no faces), an app-icon variant, a splash with Noor, social cover art. Share from ☰ → Noor.
  Optional "Noor aura" card: today's ayah on a Noor-lit card as a **still image for sharing**, text
  from verified data only, reference always present.
- **Naming and merch of identity:** Noor appears in the store listing, the app icon (L-brand phase),
  and the first screenshots. No toy/plush merch plans until the theological review is done.
- **Seasonal moods:** Ramadan crescent halo, Jumu'ah (Friday) golden, Eid — all cosmetic.
- **Community (optional, later):** Noor in family circles — each member's Noor is a small light in
  the ring; no ranks. Only if the owner wants it.

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
| **L1** Prototype + intro | Noor in 3D intro scene, then on the mushaf: breath, drift, follow finger, settings (Off/Guide/Full, size, colour), reduced motion | Owner approves how it looks and moves on the phone |
| **L2** Guide + notifications | First-run guide (real controls, skippable) and Noor's morning ayah / hadith (verified data + script) with controls and a daily cap | Fresh install is guided end to end in under 90 s, skip works at every step |
| **L3** Reading companion | Margin behaviour, selection glow, page-turn, **listening: Noor follows recited words (word timings only)** | Never overlaps the text block; falls back to ayah glow with no timings |
| **L4** Tending & radiance | Fuel from real acts, fading to ember, protection moments, growth/auras, welcome-back | Tested over simulated days; never dies; no shaming copy |
| **L5** Together | Khatm ring sparks, gifts, walls, family du'a lights | Calm, no confetti, reduced-motion tested |
| **L6** Memorisation & Ramadan | Lamp visits, dusk state, first-night entrance, Eid recap | Matches existing logic, no new streaks |
| **L7** Kids | Kids Noor, lantern lighting, "warm it", parent controls | Meets `kids.md` rules; Families checklist re-read |
| **L7b** Brand | Wallpapers, stickers, icon/splash, share cards | Assets reviewed for rule 4 (no figures) |
| **L8** Help & polish | "Ask Noor", help table, accessibility pass, widget glow | Passes screen-reader and RTL walkthrough |
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
