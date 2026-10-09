# Ayah Studio — Kids space

Production plan for a calm space for children inside Ayah Studio: listening and repeating the
short surahs, hearing single words with their meaning, a lantern path through Juz 'Amma, a "my
first surah" keepsake reel, gentle kid-friendly reel moods and, later, encouragement from the
family. Written 2026-10-09 (owner-approved direction). Build it phase by phase (K1 … K6 below);
tick the boxes in CLAUDE.md → "Phase 5 — Kids space" as phases ship.

## Open questions (sensible defaults chosen; the owner can change them)

1. **Parent gate.** Default: a sum of two numbers between 11 and 19, typed into a number field
   (not multiple choice), a new sum after a wrong answer. Young children (the target, roughly 3–8)
   cannot pass it by chance; "hold for 3 s" alone is too easy for them. Change to a different
   challenge if the owner prefers.
2. **One child or several.** Default: one child profile (a name used on the keepsake card and in
   greetings). Siblings sharing a phone can come later (a profile picker on entry); the data model
   keeps the learned surahs under a profile id so this needs no migration.
3. **Which surahs.** Default: Al-Fatiha, then Juz 'Amma from An-Nas (114) back to An-Naba (78) —
   the order children usually learn them. 38 stops in all.
4. **Keepsake of a long surah.** A reel holds at most 10 ayat (`MAX_AYAT`). Default: surahs of up
   to 10 ayat get the whole surah; longer ones (An-Naba, 40 ayat, …) start with ayat 1–10 and the
   parent can move the range in the editor. The closing card still says the whole surah was
   memorised. A full-surah keepsake could later use the multi-segment engine (T8).
5. **Reciter for children.** Default: the reel reciter the parent last picked (Alafasy otherwise),
   changeable in the parent settings. Husary (Muallim, id 12) is offered first in the kids picker
   because its slow, clear teaching style suits repeating.
6. **Family encouragement (K6)** needs a parent account; the kids space itself never shows a
   sign-in. Whether grandparents can see which surahs a child has learned (default: yes, only
   members of that family circle) is the owner's call before K6.

---

## 1. Principles (apply to every phase)

1. **Calm, never competitive.** No points, scores, streaks, badges, stars, confetti, timers or
   leaderboards. A learned surah lights a lantern; that is the only reward. Copy is warm and short
   ("Well done", "Let's listen again"), never "You failed" or "Keep your streak".
2. **Few buttons, big targets.** Every control a child uses is ≥ 56 px, with an icon and a word.
   One main action per screen. Large Arabic text (≥ 34 px on a phone).
3. **The parent is in charge.** A parent switches the space on (☰ → Kids space). Leaving it,
   settings, sign-in, the editor, sharing and any link out of the app sit behind the **parent
   gate**. While the space is on, the app opens in it and every other address leads back to it.
4. **Offline and without an account.** Everything in K1–K5 works signed out and offline once the
   surah's recitation has been played once (or downloaded by the parent). No sign-in prompts, no
   social features, no network calls a child can trigger beyond fetching recitations.
5. **The religious-content rules still hold** (CLAUDE.md rules 1–8), and for children especially:
   - **No AI-written religious content**: no invented stories, tafsir, explanations or quizzes about
     meaning. Only bundled, verified data: the Quran text (`quran-uthmani.json`), Sahih International
     (`en-sahih.json`) and Quran.com's English word meanings (`en-wbw.json`).
   - The Arabic is always the bundled Unicode text in the KFGQPC Uthmanic Hafs font, never cut or
     re-typed; only respectful effects (fade, glow) on it (rules 1, 5, 7).
   - **Never guess sync** (rule 8): word highlighting and "tap a word" are offered only where the
     reciter's word timings exist for that ayah; otherwise the ayah still plays, without them.
   - **No music and no sound effects** anywhere (rule 3): no "ding" when a repeat ends or a lantern
     lights — a soft visual cue (a breathing ring, a slow glow) instead.
   - Child names are user text: ≤ 24 characters, drawn in the UI font, never in the Quran font or
     styled like the ayah.
   - Backgrounds: no people, faces or cartoon characters (rule 4).
6. **Children's privacy.** Nothing about the child leaves the device in K1–K5 (localStorage /
   IndexedDB only, not synced). K6 shares only a first name or nickname and learned surahs, only
   with the family circle the parent creates.

---

## 2. Architecture

```
src/data/kids.ts      settings (on/off, child name, reciter, speed, repeats, translation), learned
                      surahs, the surah list of the path (localStorage, this device only)
src/ui/kidsGate.ts    the parent gate (dialog; resolves true/false)
src/ui/kids.ts        #/kids home (lantern path), parent settings sheet, leaving the space
src/ui/kidsListen.ts  #/kids/{surah}: listen & repeat, tap a word
src/data/kidsAudio.ts whole-surah recitations kept for offline use (IndexedDB `audio` store)
src/together/family.ts + src/ui/family.ts   (K6) family circles and du'a notes
```

- **Routes:** `#/kids` (the lantern path) and `#/kids/{surah}` (listen & repeat). `main.ts`: while
  the space is on, the app opens on `#/kids` and any other address is replaced by `#/kids`
  (a gift or circle link opened in the space waits until the parent leaves it).
- **Recitation:** the reciter's QDC full-surah MP3 + timings (`qdcSurah()`, already kept in
  IndexedDB for offline use). The MP3 of a short surah is small (≈ 0.1–3 MB); the kids space keeps
  the whole file in IndexedDB the first time it plays, and the parent settings offer "Keep all
  short surahs for offline use" for the current reciter. Played from a blob URL in an
  `HTMLAudioElement` (`preservesPitch = true`, `playbackRate` 0.75 or 1).
- **Word timings:** `wordTimings()` from `src/engine/words.ts` (malformed and mislabelled segments
  handled, repetitions kept in `seq`) with `word-map.json` spans — the same engine as the reels,
  so the word lit is the word being recited.
- **No new server parts until K6.** K6 reuses the circles pattern of T2 (security-definer
  functions, RLS, pgTAP tests, deployed by the Database rules workflow after its tests pass).

---

## 3. Phases

### K1 — Kids space shell + parent gate
**Experience**
- ☰ → **Kids space** (mushaf menu, translation view menu and the surah list). The first time, a
  short setup sheet for the parent: the child's name (optional, ≤ 24 characters), then "Open the
  Kids space".
- The app now opens in the space: a calm full-screen sky (soft dawn colours in light mode, a deep
  night sky in dark mode) with a greeting ("Assalamu alaikum, Maryam") and the surahs to listen to.
- A small **parent** button (a lock icon, top corner) opens the parent gate; after it: the parent
  sheet — child's name, reciter, speed, repeats, translation on/off, learned surahs, offline
  download, and **Leave the Kids space**.
- The Android back button and the browser back stay inside the space.

**Build notes:** `src/data/kids.ts` (`kidsOn()`, `setKidsOn()`, `kidsSettings()`), the router guard in
`main.ts`, `src/ui/kidsGate.ts` (dialog with a sum; `aria-live` feedback; a new sum after a wrong
answer; Cancel). Own CSS block (`.kids-*`), tokens for the kids sky in light and dark.

**Done when:** the space can be switched on and only left through the gate; reloading the app (or
opening any other address) shows the space; the gate cannot be passed by tapping around; screens
look right at 390×820 in light and dark.

### K2 — Listen & repeat + tap a word
**Experience**
- A surah screen: one ayah at a time in large Arabic (KFGQPC), its reference (`Al-Ikhlas · 112:1`,
  rule 2), and optionally its Sahih International translation, small, below.
- **Listen**: the reciter reads the ayah; the word being recited lights up softly. Then **"Your
  turn"**: a soft ring breathes around the ayah for about the ayah's length + 1.5 s while the child
  repeats (nothing is recorded). With ×3, the ayah plays and pauses three times, then the next
  ayah. At the end: "Well done!" and two buttons — **Listen again** and **We learned it** (lights
  the lantern, K3).
- Controls (big): ◀ previous ayah · ▶ play/pause · next ayah ▶; chips for **Slow / Normal**
  (0.75× / 1×, pitch preserved) and **×1 / ×3**.
- **Tap a word** (when not playing, or it pauses): the reciter says just that word (its slice from
  the word timings), and its simple English meaning (Quran.com word-by-word) appears under it.
  Words without timing are not tappable for sound (rule 8); the meaning is still shown.
- If the recitation cannot load (offline, never played): a kind note, "This surah needs the
  internet the first time".

**Build notes:** `src/ui/kidsListen.ts`. Ayah span = QDC `timestamp_from/to`; playback stops at the
end of the ayah by a rAF check (and `timeupdate` as backup), then the pause, then the next round.
Word slice: `start[i]` → `end[i]` (+ 60 ms) from `wordTimings()`. Highlight from `seq`
(repetitions light the repeated word again). If QDC fails entirely, everyayah per-ayah files play
the ayah with no word features. Speed via `audio.playbackRate`, `preservesPitch = true`.

**Done when:** the lit word follows the recitation in Al-Fatiha and An-Naba for two reciters; ×3
repeats exactly three times; slow mode plays at 0.75× with the same pitch; tapping a word plays only
that word; a surah played once works offline.

### K3 — The lantern path (Juz 'Amma)
**Experience**
- The home of the space is a night-sky **path** winding down the screen with 38 lanterns: Al-Fatiha,
  then An-Nas, Al-Falaq, Al-Ikhlas … An-Naba. Each lantern carries the surah's name (English and
  Arabic) and its ayah count. Unlit lanterns are quiet outlines; a learned surah's lantern glows
  warmly (shape and fill differ too, never colour alone). The next unlit lantern breathes softly.
- Tap a lantern → its listen & repeat screen. "We learned it" there lights it: a slow glow blooms
  on the path when the child returns (no sound, no confetti).
- The parent sheet lists learned surahs and can unlight one (behind the gate).
- No counts, percentages or "x of 38".

**Build notes:** the path is an SVG (a smooth curve through the stops) with HTML lantern buttons
over it, drawn like the revision lamps' warm glow (`src/ui/lamps.ts`: radial gradient, ring for
"next"); `prefers-reduced-motion` → no breathing. Learned surahs in `src/data/kids.ts`
(`learned()`: surah → date). The view scrolls to the next lantern on open.

**Done when:** all 38 stops are reachable and readable at 390 px; lighting and unlighting persist
across reloads; the path stays smooth while scrolling on the owner's phone.

### K4 — "My first surah" keepsake reel
**Experience**
- A lit lantern's surah screen shows **Make a keepsake** (behind the parent gate, since it opens the
  editor). One tap → an editor draft of that surah (≤ 10 ayat, see open question 4) in a kid mood
  (K5; Dawn until K5 ships) with the closing card **"Maryam memorised Al-Ikhlas · 9 October 2026"**.
- The parent exports and saves/shares it from the normal editor (leaving the Kids space is not
  needed: the editor opens on top; ✕ returns to the space).

**Build notes:** like `newReel()` in `src/ui/ramadan.ts`: `newProject()` + the look + `project.closing =
{ title: '{name} memorised {surah}', names: ['{date}'] }` (UI font, inside the safe area — the
existing closing-card code). No name → "Memorised Al-Ikhlas". The router guard lets `#/reel/…`
through only right after the gate (a one-time pass in sessionStorage).

**Done when:** the draft opens with the right surah, the closing card shows the name and date in the
UI font inside the safe area, and the export matches the preview.

### K5 — Kid-friendly reel moods
**Experience**
- Three new built-in backgrounds, original and generated (`scripts/make-kid-backgrounds.py`, in the
  style of `make-backgrounds.py`): **Moon garden** (a big soft moon over pastel hills), **Desert
  dawn** (pastel dunes, a pale sun) and **Soft clouds** (a pastel sky with slow clouds, a seamless
  loop). No people, faces, animals with faces or cartoon characters.
- Two new moods: **Moonlit** and **Pastel**: pastel text colours, a gentle text effect (fade / rise),
  a soft transition, a light scrim and a new rounder translation font (**Nunito**, OFL, vendored in
  `public/fonts/`). The Arabic stays in KFGQPC with respectful effects only (rules 5–7).
- The keepsake reel uses the Pastel mood with the Moon garden background by default.

**Build notes:** backgrounds registered in `src/engine/backgrounds.ts`, credits in
`public/backgrounds/CREDITS.md`; `enFont: 'round'` added to the project type, `applyLook()` and
`strictLook()` / `valid_gift_look()` (a migration that accepts the new value), the font loaded by
the renderer before drawing like the other fonts.

**Done when:** the new moods render the same in preview and export, gifts and walls accept the new
font value (database test), and the backgrounds pass the visual rule (no figures).

### K6 — Family encouragement (needs an account on the parent's side)
**Experience**
- Outside the Kids space, a signed-in parent creates a **family circle** (☰ → Khatm circles → New →
  "Family: children learning short surahs") and adds children by first name (≤ 24 characters; no
  child accounts). Grandparents and relatives join with the invite link, like a Khatm circle.
- The ring shows the 38 short surahs; each child "takes" the surah they are learning; when a
  lantern lights on the parent's device (signed in), that child's surah fills in for everyone.
- Any member can leave a short **du'a note** for a child (≤ 140 characters, presets like "May Allah
  make the Quran the light of your heart"), optionally for a surah. In the Kids space, the next
  time that child lights a lantern (or opens the path, for notes without a surah), the note appears
  on a soft card: the words in the UI font, "— from Grandma". Notes are the members' own words,
  never presented as Quran or hadith.
- The Kids space still never asks to sign in; it syncs quietly only if the parent is signed in on
  this device.

**Build notes:** migration `supabase/migrations/2026101x_k6_family.sql`:
```
circles.kind          'khatm' (default) | 'family'
circle_children       (circle_id, id, name ≤ 24, added_by, created_at)          — ≤ 8 per circle
family_parts          (circle_id, child_id, surah ∈ {1, 78…114}, status learning|learned, at)
family_notes          (id, circle_id, child_id, surah null|{1, 78…114}, from_id, from_name ≤ 40,
                       text ≤ 140, created_at, seen_at)                          — 3 a day per author
```
RLS like T2: members read; nobody writes the tables directly; security-definer functions
`create_family_circle`, `add_child` / `rename_child` / `remove_child` (the member who added the
child, or the owner), `set_child_surah` (same), `leave_note` (any member), `delete_note` (author or
the child's adder), `mark_note_seen`; anonymous sessions cannot join family circles. pgTAP tests in
`supabase/tests/family.test.sql` (members only, caps, lengths, surah range, no anon). Deployed by the
Database rules workflow after its tests pass on main.

**Done when:** two accounts see the same family ring update, a grandparent's note appears in the
Kids space on the parent's phone when the lantern lights, and non-members can read nothing.

---

## 4. Cross-cutting

- **Look:** the space has its own sky palette (CSS tokens `--kids-*`) in light (dawn: pale blue,
  peach) and dark (indigo night, warm lantern gold); the brand gradient stays out of it.
- **Motion:** slow fades and glows only; `prefers-reduced-motion` → fades only.
- **Accessibility:** large targets, labels on every control, screen-reader text for lanterns
  ("Al-Ikhlas, learned").
- **Offline:** the service worker already caches the app shell and data; kids recitations are kept
  in IndexedDB (`src/data/kidsAudio.ts`).
- **Testing:** Playwright screenshots at 390×820, light and dark, for each phase; `npm run build`;
  pgTAP for K6.

---

## 5. Pre-launch checklist for the owner (Google Play Families policy)

Presenting the app as suitable for children brings Google Play's **Families policy** into play. The
code here does not change any store settings; before publishing with the Kids space, the owner
should:

- [ ] In Play Console → App content → **Target audience and content**, decide the age groups. If
      any group under 13 is selected, the app must meet the Families policy (Designed for Families
      requirements) — including for its adult features.
- [ ] Confirm: **no ads** and no ad SDKs (true today); no analytics or crash reporting that sends
      device identifiers from children (none today; Crashlytics, if added later, must respect this).
- [ ] Review the third-party SDKs against the Families policy (Supabase client, Capacitor plugins,
      Google sign-in via `@capgo/capacitor-social-login`) and the data they send.
- [ ] Update the **privacy policy** (`public/privacy.html`) with a section on children: what the
      Kids space stores (on the device only in K1–K5; first names and learned surahs in a family
      circle in K6), and that no child account exists.
- [ ] Fill the **Data safety** form accordingly.
- [ ] Keep the **parent gate** in front of sign-in, links out of the app, sharing and settings.
- [ ] Consider a "mixed audience" setup (adults + children) and whether a neutral age screen is
      needed before the account features; get advice if unsure — this plan is not legal advice.
