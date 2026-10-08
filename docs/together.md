# Ayah Studio — "Together": accounts, family and your journey

Production plan for everything that needs an account and a cloud database: the living mushaf,
Khatm circles, memorising with a partner, Gift an ayah, the dua & ayah wall, Your year with the
Quran, the reflections journal, Ramadan mode and the revision lamps. Written 2026-10-08 (owner
request). Build it phase by phase (T0 … T9 below), one phase per session, like the rest of
CLAUDE.md. Tick the boxes in CLAUDE.md → "Phase 4 — Together" as phases ship.

---

## 1. Principles (apply to every phase)

1. **The mushaf is the home.** New features appear *inside* the reading view (margin marks, page
   frame, the pull-down "Today" card) or as short full-screen moments — never as new tab bars.
2. **Calm, never competitive.** No points, badges, leaderboards, streak counters or confetti.
   Motion uses the reel's calm family (fade, glow, light sweep, slow drift). Copy is gentle:
   "Your lamps miss you", never "You broke your streak".
3. **Everything can end in a reel.** Khatm complete, a gift, the wall and the year recap all export
   through the existing engine (`render()` + `exportVideo()`), so preview = export.
4. **Private by default.** Reflections, reading history and revision data are visible only to their
   owner. Circles and partners see only what the user shares with them, and only while they are in
   them.
5. **Works offline, signed out first.** Every personal feature works without an account (IndexedDB)
   and syncs once the user signs in. Social features need an account and the network, and say so
   kindly when offline.
6. **The religious-content rules still hold** (CLAUDE.md rules 1–8). Added for this phase:
   - Quran text is never stored in or read from the cloud: documents hold references (`2:255`,
     page numbers, word ranges); text always comes from the bundled, verified data.
   - User text (names, duas, gift messages, reflections) is never drawn in the Quran font or styled
     like the ayah, is clearly attributed ("— from Aisha") and is length-limited.
   - Duas typed by users are shown as the user's own words, never presented as Quran.
   - No music or sound effects anywhere, including in moments and recaps (rule 3).

---

## 2. Architecture

### Services
| Need | Choice | Notes |
|---|---|---|
| Accounts | Firebase Authentication: Google sign-in; **anonymous** sign-in for wall guests and gift replies | Account linking upgrades an anonymous user to Google without losing data |
| Database | Cloud Firestore, web SDK with `persistentLocalCache` (IndexedDB, multi-tab) | Same JS SDK on the web, in the Capacitor WebView and in Tauri |
| Server logic | Cloud Functions (2nd gen, TypeScript, `functions/` folder) | Push fan-out, Khatm completion, account deletion, gift preview pages, daily digests |
| Push | Firebase Cloud Messaging (FCM): Android via `@capacitor-firebase/messaging`, web via service-worker push | Personal reminders (Ramadan portion, revision) use **local** notifications (`@capacitor/local-notifications`), no server |
| Abuse protection | Firebase App Check: Play Integrity (Android), reCAPTCHA Enterprise (web) | Enforced on Firestore and Functions after a monitoring week |
| Crash reports | Crashlytics (Android) via `@capacitor-firebase/crashlytics` | Optional, opt-in in Settings |
| Hosting for share links | GitHub Pages app routes now (`…/ayah-studio/#/gift/{id}`); a Firebase Hosting custom domain later (§8) | A custom domain enables Android App Links and rich link previews |
| Prayer times (Ramadan) | `adhan` (MIT, computed on the device) | Location is optional; a city picker or a manual time works without it |
| QR codes (wall) | `qrcode` (MIT) | Generated on the device |

**Plan and cost:** Cloud Functions need the **Blaze** (pay-as-you-go) plan. At family/friends scale
the free quotas cover it (Firestore 50k reads / 20k writes a day, Functions 2M calls a month, FCM
free). Set a **budget alert at $5** in Google Cloud Billing on day one. Firestore reads are the
main cost driver: every screen reads small documents, listeners are detached when a view closes,
and recaps are computed from daily summary documents (§3), never by scanning raw events.

**Library versions (checked on npm 2026-10-08):** `@capacitor-firebase/authentication` and
`@capacitor-firebase/messaging` 8.5.2 need `firebase` **^12.6** — pin `firebase@12` until those
plugins support 13 (`firebase` 13.0.0 is out). `@capacitor/local-notifications` 8.3.1, `adhan`
4.4.6, `qrcode` 1.5.4, `firebase-tools` 15.33.0, `@firebase/rules-unit-testing` (use the release
matching the pinned `firebase` major). Re-check at build time.

### Client modules (new)
```
src/cloud/firebase.ts   lazy init from VITE_FIREBASE_* (absent → every cloud feature hidden, app works as now)
src/cloud/auth.ts       Google sign-in (native plugin on Android, popup/redirect on the web), anonymous, link, sign out
src/cloud/sync.ts       local-first sync engine (IndexedDB ↔ Firestore) for personal collections
src/cloud/push.ts       FCM token registration per device, notification preferences, quiet hours
src/together/*.ts       one module per feature (circles, partners, gifts, walls, reflections, lamps, year, ramadan)
src/ui/today.ts         the pull-down "Today" card in the mushaf bar
src/ui/margin.ts        margin-mark layer drawn over mushaf pages
src/ui/moment.ts        full-screen calm "moment" player (story cards; reused by Khatm, gift, year)
functions/src/*.ts      Cloud Functions
firestore.rules, firestore.indexes.json, firebase.json
```
- Firebase is loaded with dynamic `import()` only after the user opts in or opens a share link, so
  the reading view and editor stay as fast as now.
- **Android sign-in:** Google blocks OAuth pages inside WebViews, so the app signs in natively with
  `@capacitor-firebase/authentication` (Credential Manager) and then signs the JS SDK in with the
  returned ID token (`skipNativeAuth: true` + `signInWithCredential`). Needs the APK's **SHA-1/SHA-256
  fingerprints** registered in Firebase, which needs the **fixed signing key** (prerequisite P1).
- **Web sign-in:** `signInWithPopup`, falling back to `signInWithRedirect` on mobile browsers.
  `brandyco.github.io` must be in Firebase Auth → Authorized domains.
- **Tauri (Windows):** sign in through the system browser with a loopback redirect (PKCE), then
  `signInWithCredential`. Built with the Tauri phase, not before.

### Sync engine (`src/cloud/sync.ts`)
- Personal collections (drafts, bookmarks, last read, settings, reflections, lamps, days) are
  written to IndexedDB first (as today) and mirrored to `users/{uid}/…` when signed in.
- Every document carries `updatedAt` (server timestamp) and `deviceId`; conflicts are resolved
  **last-writer-wins per document**. Reflections and drafts are small, so whole-document LWW is
  enough. A draft edited on two devices offline keeps the newest one and saves the older one as
  "(copy)" instead of dropping it.
- Deletes are tombstones (`deleted: true`, purged after 30 days) so other devices learn about them.
- **First sign-in migration:** everything local is uploaded once with a progress toast. If the
  account already has data (a second device), both sets are merged by id and nothing is deleted.
- Drafts sync their project JSON only. Thumbnails are regenerated on each device. Media from
  Pixabay/Pexels re-downloads by id; **own uploads never leave the device**. A draft opened on
  another device shows "Background is on your other device" with a plain colour in its place.
- Size guard: a Firestore document is at most 1 MiB; drafts are typically < 20 KB. Reject over
  500 KB with a clear message.

---

## 3. Data model (Firestore)

```
users/{uid}                          { name, photoUrl, createdAt, locale, settings{…}, consent{crash, analytics} }
users/{uid}/devices/{deviceId}       { fcmToken, platform, quietHours{from,to}, notify{circle,partner,gift,wall,ramadan}, updatedAt }
users/{uid}/drafts/{draftId}         { project (JSON), ref "2:255-257", reciter, updatedAt, deleted? }
users/{uid}/state/reading            { lastRead{surah,page}, bookmarks[{ref,page,at}], updatedAt }
users/{uid}/reflections/{id}         { ref "2:255", page, text ≤ 4000, createdAt, updatedAt, deleted? }
users/{uid}/lamps/{page}             { page, lastRevised, box 1-5, revisions, memorised: bool }
users/{uid}/days/{yyyy-mm-dd}        { pages[], minutesRead, ayatPlayed{"2:255":n}, reelsMade, revised[], khatmParts[] }
users/{uid}/plans/{planId}           { kind 'ramadan'|'khatm', year, start, end, target, portionPerDay, circleId? }

circles/{circleId}                   { name, ownerUid, memberUids[], members{uid:{name,color,joinedAt}},
                                       inviteCode, kind 'khatm', round, status 'open'|'complete', startedAt,
                                       dueDate?, completedAt?, closingRef? }
circles/{circleId}/parts/{1..30}     { juz, uid?, status 'free'|'taken'|'done', takenAt?, doneAt?, pagesDone[] }
circles/{circleId}/feed/{id}         { kind 'joined'|'took'|'done'|'complete', uid, juz?, at }   ← small, for the "Today" card

partnerships/{pid}                   { memberUids[2], members{…}, plan{pages[]|surahs[]}, createdAt, inviteCode }
partnerships/{pid}/progress/{uid}    { pages{page: lastRevised}, updatedAt }        ← only the plan's pages
partnerships/{pid}/nudges/{id}       { from, to, preset 'easy'|'thinking'|'proud', at }

gifts/{giftId}                       { fromUid, fromName, ref{surah,from,to}, reciter, look{…validated},
                                       message? ≤ 140, replyTo?, createdAt, opens }
walls/{wallId}                       { hostUid, title ≤ 60, occasion 'eid'|'wedding'|'aqiqah'|'other',
                                       joinCode, status 'open'|'closed', look{…}, createdAt }
walls/{wallId}/entries/{uid}         { name ≤ 40, dua? ≤ 140, ref{surah,from,to} (≤ 3 ayat), hidden?, at }
config/public                        { minAppVersion, collections, ramadanStart{year: date} }
```
- Ids for gifts and walls are random 20-character ids (unguessable); invite codes are 6 characters
  from an unambiguous alphabet, valid 14 days, regenerated by the owner.
- `ref` values are validated against `meta.json` ayah counts on the client and in Functions.
- Indexes: `circles` by `memberUids` (array-contains) + `status`; `partnerships` by `memberUids`;
  `users/{uid}/days` by id range (year recap).

### Security rules (outline; full file in `firestore.rules`, tested in CI)
- `users/{uid}/**`: read/write only by `request.auth.uid == uid`; field types and sizes checked
  (`text.size() <= 4000`, `project` map size, timestamps = `request.time`).
- `circles/{id}`: read by members; create by any signed-in user (who becomes owner and first
  member); join only through the `joinCircle` callable function (checks the invite code); members
  may update only their own entry in `members`.
- `circles/{id}/parts/{juz}`: members may take a `free` part (set `uid` to themselves), release
  their own, mark their own `done`; nobody edits another member's part except the owner, who can
  free a part. Completion of the circle is written only by a Function.
- `partnerships/**`: members only; `progress/{uid}` writable only by that uid; nudges rate-limited
  (one per pair per day, enforced by a document per day id).
- `gifts/{id}`: **get** by anyone (link holders, no listing — `list` is denied); create by
  signed-in or anonymous users with `fromUid == auth.uid`; immutable afterwards except the `opens`
  counter (via Function).
- `walls/{id}`: get by anyone with the id; `entries/{uid}`: create/update by that (anonymous or
  Google) uid while `status == 'open'`, one entry per uid; host can set `hidden` and close the wall.
- Everything else denied. App Check enforced on Firestore and callable Functions.

### Cloud Functions
| Function | Trigger | Job |
|---|---|---|
| `joinCircle`, `joinPartnership`, `joinWall` | callable | Check invite/join code, add member, return the id |
| `onPartDone` | Firestore `circles/{id}/parts/{juz}` update | Append to feed; if all 30 are done → set `status: complete`, `completedAt`, notify every member once |
| `digest` | scheduled, hourly | Per user in their local evening: one calm push summarising circle activity of the day ("Aisha and Omar finished their juz") — never one push per event |
| `onNudge` | Firestore create in `nudges` | Push to the partner (respecting quiet hours and preferences) |
| `giftPage` | HTTPS (custom domain phase) | Serves Open Graph tags (title, reference, image) for WhatsApp/iMessage previews, then redirects to the app route |
| `deleteAccount` | callable | Deletes `users/{uid}/**`, removes the user from circles/partnerships/walls (keeps finished Khatm history anonymised as "a member"), deletes gifts, then the Auth user |
| `exportData` | callable | Returns a JSON export of the user's data (privacy requirement) |

---

## 4. Features

Each feature lists the experience, then the build notes and acceptance criteria.

### T1 — The living mushaf (no account needed)
**Experience**
- **Margin marks** drawn by `src/ui/margin.ts` beside the line where an ayah starts: a small soft
  mark for a reflection, a thin gold edge on pages in your Khatm portion, a faint dot where your
  partner revised today, a lamp glyph on memorised pages. At most two marks per line; tapping one
  opens its sheet.
- **The page frame follows the day:** the page tint drifts with the local hour (dawn, day, Maghrib,
  night) on top of the existing day/night page themes, at most a 4 % tint change, applied as a CSS
  variable updated every 10 minutes. Off by default for Minimal readers (Settings → "Page follows
  the time of day").
- **Ramadan crescent:** a thin crescent in the page corner during Ramadan (dates from
  `config/public.ramadanStart`, offline fallback: computed Umm al-Qura calendar via
  `Intl.DateTimeFormat('en-u-ca-islamic-umalqura')`).
- **"Today" card** in the existing pull-down bar: one line per active thing — today's Ramadan
  portion, your Khatm juz progress, a partner's nudge, an unopened gift, lamps that are dimming. It
  is empty and hidden when there is nothing to say.

**Build notes:** a layer of absolutely positioned marks per `.mushaf-page`, positions from the
existing word elements (`data-p`). Respects `prefers-reduced-motion` (no glow animation). Marks
come from a single `marksForPage(page)` function that each feature registers into.

**Done when:** marks line up on all 604 pages at phone and desktop widths, page turns stay smooth
(no extra layout on swipe), and the bar shows the Today card only when it has content.

### T2 — Khatm circles
**Experience**
- ☰ → "Khatm circle" → Create: a name ("Family Ramadan Khatm"), optional due date. The owner gets a
  share link/QR. Joining is one tap from the link (sign-in if needed).
- **The ring:** 30 segments around the circle's name. Free segments are outlined; taken segments
  carry the member's initial and soft colour; finished ones are filled. A member taps a free
  segment to take that juz (or "Pick one for me").
- Reading your juz: the mushaf shows the gold page edge on your juz's pages; the Today card says
  "Juz 14 · 6 pages left". Pages count as read when the page stays open ≥ 20 s or is listened to
  with the player, and the member can also tick "I finished my juz" directly.
- When a member finishes, their segment fills with a slow light sweep, shown the next time others
  open the app (and in the evening digest push).
- **Khatm complete:** the full ring glows once, the members' names appear around it, the date
  below, and a button "Make the Khatm reel": a reel of the closing ayat the owner chose (default
  An-Nas, 114:1–6) with a closing card "Khatm complete · {circle name} · {date}" and the member
  names on the closing card (names are user text: drawn in the UI font, never the Quran font).
- "Start another round" keeps the members and clears the parts (round + 1).

**Build notes:** `src/together/circles.ts`, Firestore listeners only while the circle sheet or
Today card needs them. The ring is SVG (30 arcs), animated with CSS. The Khatm reel needs one
engine addition: a **closing card with extra lines** (names), within the 5 % safe area, wrapping
and shrinking to a legible minimum (rule 6).

**Done when:** two phones can create/join a circle, take and finish parts, see each other's
progress within seconds online and after reconnecting offline, completion triggers exactly once,
and the Khatm reel exports with names.

### T3 — Gift an ayah
**Experience**
- In the selection bar and the editor: "Gift". The sender picks the ayat (≤ 10), reciter and look
  (the current reel look), an optional message (≤ 140 characters, or a preset like "Thinking of you"),
  then shares the link (WhatsApp, etc.).
- The receiver opens the link in the app or on the web — **no install or account needed**. A sealed
  card shows "A gift from Aisha". Tapping opens it: the recitation starts and the ayah appears in the
  chosen look, word-synced, exactly like the preview. The message shows below the ayah in the UI
  font, attributed to the sender.
- At the end: "Reply with an ayah" (opens ayah selection; the reply links back via `replyTo`, so
  the two gifts form a thread), "Make it a reel" (opens the editor with that selection + look),
  "Read in the mushaf".

**Build notes:** route `#/gift/{id}` in the existing app; the player is the editor's preview
engine in read-only mode (`render()` + the existing audio pipeline), so no new renderer. The look is
validated with the same `applyLook()` checks as stored looks. Anonymous sign-in for replies from
people without an account. Link previews (title + reference, never Quran images that alter text)
come with the custom-domain step (§8).

**Done when:** a gift link opens on a phone that never had the app, plays in sync, the reply
thread works, and a forged gift document with an invalid reference or look is rejected by the
rules/validation and never renders.

### T4 — Reflections journal
**Experience**
- Long-press an ayah → "Reflect": a paper-like sheet slides up with the reference and the date;
  writing autosaves. The note gets a soft mark in the margin (T1).
- Returning to a page with an older note, its mark pulses once softly: "You wrote here on 12 Oct".
  Tap to read it or add to it (a note keeps dated paragraphs, so it becomes a conversation with
  your past self).
- ☰ → "Reflections": a search box and the notes grouped by surah; tapping one opens the mushaf on it.
- Optional, explicit: "Use as reel caption" copies the text for the social caption — never onto the
  video over the ayah.

**Build notes:** works signed out (IndexedDB store `reflections`, `db.ts` version bump) and syncs
when signed in. Search is local (all notes are small). Private: never shared, not even with
circles. Included in data export and account deletion.

**Done when:** notes survive offline edits on two devices (LWW + "(copy)" on conflict), search
finds words in notes, and the pulse appears once per visit.

### T5 — Revision lamps (memorisation garden)
**Experience**
- ☰ → "My memorisation" or pinch out in the mushaf: all 604 pages as a grid of small lamps (by
  juz, 20 per row). Unmemorised pages are quiet outlines; memorised pages glow, the light fading
  with time since the last revision (bright → warm → dim over the Leitner interval).
- Mark pages as memorised (one page, a surah, or a range). Tap a dim lamp → a short revision
  session on that page (the Phase 2 flashcards: hide/reveal words, listen and repeat); finishing it
  relights the lamp with a small warm bloom.
- The Today card mentions dimming lamps gently ("3 lamps are getting dim in Al-Mulk").

**Build notes:** depends on Phase 2 flashcards (5 Leitner boxes, intervals 1/2/4/8/16 days). Ship
T5a (lamps + manual "revised today") before flashcards if Phase 2 is not done; T5b connects the
flashcard sessions. Brightness = f(days since revision / interval of the page's box). Lamps are
drawn on one canvas (604 cells) for smooth zoom. Local reminder (local notification) for due
pages at the user's chosen time.

**Done when:** the grid renders in < 16 ms per frame on the owner's phone, brightness matches the
Leitner schedule, and the lamps sync across devices.

### T6 — Memorise with a partner
**Experience**
- From "My memorisation" → "Memorise with someone": pick a plan (a surah, a juz or a page range),
  share the invite link. Only the plan's pages are shared.
- On the lamp grid, the partner's lamps show as a second, softer light in each cell; where both
  have revised recently, the lights overlap. No percentages, no comparison text.
- **Nudge:** one tap sends a preset, kind message ("May Allah make it easy", "Thinking of you —
  Al-Mulk tonight?"); at most one nudge per day per pair. The partner's dot appears in the mushaf
  margin on pages they revised today.
- Either partner can leave; the other sees "The plan has ended" kindly, and shared progress is
  deleted.

**Build notes:** `partnerships` collection; `progress/{uid}` mirrors only plan pages from the
user's lamps (written by the client on revision). Push via `onNudge` (needs T0 push setup).

**Done when:** two accounts see each other's plan lamps update, nudges arrive as push (Android and
web) within a minute and respect quiet hours, and leaving removes shared data.

### T7 — Ramadan mode
**Experience**
- On the first night of Ramadan (or when switched on in Settings), a calm full-screen moment:
  crescent, "Ramadan Mubarak", and a plan choice — one Khatm, two, or "just keep me company" —
  alone or with a circle (creates/uses a T2 circle).
- Each day the plan gives today's portion (pages split evenly over the remaining days, re-balanced
  if a day is missed — no guilt text). The Today card and a **local** notification shortly before
  Maghrib ("Today's portion: Juz 14, pages 262–271") open the mushaf on the right page.
- Each evening a ready "today's ayah" reel template: an ayah from today's portion with the night
  mood; one tap opens the editor.
- The last ten nights: the reading theme deepens to the Night palette, and the Today card mentions
  the last ten nights gently.
- On Eid: "Your Ramadan" — a short moment (days read, Khatm(s) completed, the ayah you returned to
  most, played in your reciter's voice) that exports as a reel.

**Build notes:** Maghrib time from `adhan` with the user's location (asked only when they enable
the reminder) or a picked city / manual time. Local notifications are rescheduled daily by the app
(Android: `@capacitor/local-notifications`; web: only while the app is open or via FCM later).
Ramadan dates from `config/public` with the Umm al-Qura fallback; the user can shift by ±1 day for
local moon sighting.

**Done when:** the plan rebalances correctly after missed days, the reminder fires at the right
local time on Android, and the Eid recap exports.

### T8 — Dua & ayah wall
**Experience**
- ☰ → "Ayah wall" → Create: title ("Yusuf & Maryam's wedding", "Eid 1448 with family"), occasion,
  and a look. The host's screen (a TV, laptop or tablet) shows the wall with a large QR code and a
  6-character code.
- Guests scan the QR → the web app opens directly on the join page (no install, anonymous
  sign-in): their name, an ayah (≤ 3 ayat, picked with the normal surah list/search), an optional
  short dua in their own words. "Add to the wall".
- On the host's screen each new entry drifts in like a lantern and settles into a soft grid; the
  newest gently pulses. The host can hide an entry (moderation) and close the wall.
- **The keepsake reel:** one tap makes a slideshow reel: each guest's ayah with their own reference
  line (rule 2) and their name (and dua, if any) on a short card after it, in the wall's look;
  recitation by one reciter chosen by the host. The final card: the occasion title and date.

**Build notes:** the largest engine change in this plan — a **multi-segment reel**: a list of
segments, each with its own surah/ayat range, word timings, audio slice and reference line,
joined with the existing transitions and pauses. `planQdcReel()` already plans one range; it is
extended to plan N ranges and concatenate them on one timeline (`arrangeReel()`/`arrangeAudio()`
already shift ayat by offsets). Limit: 30 entries or 10 minutes per keepsake reel; more entries →
several reels. Guest text: max lengths enforced in rules, shown only to wall participants, never
indexed.

**Done when:** 10 phones can join one wall in a room within a minute, the host screen updates live,
hidden entries never appear in the reel, and the keepsake reel exports with correct references.

### T9 — Your year with the Quran
**Experience**
- Available from late December (Gregorian) and after Eid al-Adha (Hijri year end) — the user picks
  which calendar. A short tap-through moment, one calm card per screen:
  1. "This year you opened the mushaf on 211 days" — a quiet field of 365 dots, read days lit.
  2. "You read 1,904 pages" — pages turn softly behind the number.
  3. "The ayah you returned to most" — it plays, word-synced, in your reciter's voice.
  4. "With your family you completed 2 Khatms" — the circle ring(s) appear (if T2 used).
  5. "Pages you hold in your heart: 48" — the lamp grid glows (if T5 used).
  6. "Reels you made: 37" — a few thumbnails drift by (drafts on this device only).
  7. The mushaf mosaic: all 604 pages as tiny tiles, glowing where you read this year.
- "Save as reel" exports the whole recap as a 9:16 video (cards + the ayah segment) with your
  chosen look. Nothing is shared automatically.

**Build notes:** data from `users/{uid}/days/*` (one small document per active day; written by
the app when the day ends or on the next launch, so recaps never scan raw events). Signed out, the
same data comes from IndexedDB on this device. The recap cards are **story cards** in the engine
(full-frame cards with UI-font text and simple canvas drawings: dots, ring, mosaic), sharing the
moment player with T2/T3 (`src/ui/moment.ts`). The ayah card is a normal recitation segment
(reuses the T8 multi-segment work).

**Done when:** numbers match the day documents exactly, the recap renders in the preview and the
export identically, and a user with little activity sees a short, kind recap (cards with no data
are skipped, never "0").

---

## 5. Cross-cutting

- **Motion tokens:** `--ease-calm: cubic-bezier(.25,.1,.25,1)`, durations 400 ms (UI), 1.2 s
  (moments), 2.4 s (glows); `prefers-reduced-motion` → fades only.
- **Notifications:** off until the user enables each kind; quiet hours default 22:00–07:00; a
  maximum of one push a day per kind (digests, not streams). Every push opens the exact place it
  talks about.
- **Copy guide:** short, warm, never guilt; "we" never speaks for God; no religious rulings in UI
  copy.
- **Accessibility:** all moments have a "Skip" and screen-reader text; colour is never the only
  signal (rings and lamps also differ by shape/fill).
- **Localisation:** English first; strings collected in `src/i18n/en.ts` from T0 on so Arabic
  (RTL UI) can follow.
- **Privacy & store requirements:** privacy policy page (`public/privacy.html`) listing exactly
  what is stored; in-app **Delete account** and **Export my data** (T0); Google Play Data safety
  form filled from §3; no ads, no selling of data; minimum age per Play policy for social features.
- **Moderation:** user text only appears to people the author invited (circle, partner, wall,
  gift link holders); hosts/owners can hide entries; "Report" sends an email to the owner's address
  stored in `config/public`. Length limits everywhere.
- **Testing:** security-rules unit tests with the Firebase Emulator Suite in CI
  (`firebase emulators:exec "npm run test:rules"`); sync engine tests against the emulator; a
  Playwright smoke test for gift and wall pages on the web build; `npm run check` unchanged.
- **Monitoring:** Crashlytics (opt-in), Functions logs with error alerts by email, the $5 budget
  alert, and a weekly glance at Firestore usage.
- **Feature flags:** `config/public` enables each feature (and a minimum app version), so a phase
  can be turned off without a release.

---

## 6. Phases (in build order)

| Phase | Content | Depends on | Sessions (est.) |
|---|---|---|---|
| P1 | Prerequisites: fixed signing key (GitHub secret), owner creates the Firebase project (§7) | — | owner + ½ |
| **T0** | Firebase foundation: lazy init, Google + anonymous sign-in (web + Android), account sheet in ☰ (sign in/out, delete account, export data), sync of drafts / last read / bookmarks / settings, first-sign-in migration, App Check, rules + emulator tests in CI, privacy page, `config/public` flags | P1 | 2 |
| **T1** | Living mushaf: margin layer, time-of-day page tint, Ramadan crescent, Today card | — (no account) | 1 |
| **T4** | Reflections journal (local first, then synced) | T1 (marks), T0 (sync) | 1 |
| **T2** | Khatm circles + push foundation (FCM tokens, preferences, quiet hours, evening digest) + Khatm reel closing card | T0, T1 | 2 |
| **T3** | Gift an ayah (read-only player route, replies, anonymous sign-in) | T0 | 1–2 |
| **T5** | Revision lamps (T5a manual; T5b with Phase 2 flashcards) | T1, Phase 2 for T5b | 1–2 |
| **T6** | Memorise with a partner (plans, shared lamps, nudges) | T5, T2 push | 1 |
| **T7** | Ramadan mode (plan, Maghrib reminder, nightly template, Eid recap) | T1, T2 (optional circle), local notifications | 1–2 |
| **T8** | Multi-segment reels + Dua & ayah wall (host screen, QR join, keepsake reel) | T0, engine work | 2–3 |
| **T9** | Your year with the Quran (day summaries from T0 on, story cards, recap reel) | T8 (segments), T1–T5 data | 1–2 |
| T10 | Custom domain on Firebase Hosting: Android App Links, rich link previews (`giftPage`), Tauri sign-in | T3, Tauri phase | 1 |

**Day summaries start in T0** (writing `days/{date}`), so by the time T9 is built there is already
a year of data to recap.

---

## 7. What the owner needs to do (one time)

1. **Signing key first** (from the Android work): a fixed release/test key stored as a GitHub
   secret, so the APK fingerprints stay the same — Google sign-in on Android depends on it.
2. Create a Firebase project at console.firebase.google.com ("Ayah Studio"); upgrade to **Blaze**
   and set a **$5 budget alert** (Google Cloud console → Billing → Budgets).
3. Authentication → Sign-in method: enable **Google** and **Anonymous**; Settings → Authorized
   domains: add `brandyco.github.io`.
4. Firestore: create the database (production mode, a region near the users, e.g. `europe-west`).
5. Project settings → Add app → **Web**: copy the config values into GitHub repo **variables**
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` (these identify the project; access
   is controlled by the security rules and App Check).
6. Add app → **Android** with package `com.brandyco.ayahstudio` and the SHA-1 + SHA-256 of the
   signing key (the session prints them); download `google-services.json` and store it base64 as
   the repo **secret** `GOOGLE_SERVICES_JSON` (the workflow writes it into `android/app/`).
7. App Check: register Play Integrity (Android) and reCAPTCHA Enterprise (web).
8. A service account for deploys: store as the secret `FIREBASE_SERVICE_ACCOUNT`, so GitHub Actions
   deploys rules and Functions from `main`.

---

## 8. Later: custom domain

A domain (e.g. `ayahstudio.app`) on Firebase Hosting gives: short share links
(`ayahstudio.app/g/{id}`), link previews in WhatsApp/iMessage (`giftPage` Function), **Android App
Links** (links open the installed app directly; needs `/.well-known/assetlinks.json` on the
domain root, which GitHub Pages project sites cannot serve), and a clean home for the privacy
policy. Until then, links use the GitHub Pages address and the web app offers "Open in the app".
