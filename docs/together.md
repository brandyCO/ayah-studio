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

**Decision (owner, 2026-10-08): Supabase**, chosen over Firebase for a large user base with
relational data (circles, members, parts, plans, recaps) and the more useful free plan: no daily
request cap and server functions included without a card. Firebase is kept **only for push
notifications** (Firebase Cloud Messaging is how Android delivers push; free, no card).

### Services
| Need | Choice | Notes |
|---|---|---|
| Accounts | Supabase Auth: **Google** (web: OAuth + PKCE redirect; Android: native Credential Manager via `@capgo/capacitor-social-login`, then `signInWithIdToken` with a hashed nonce). **Anonymous** sign-in later for wall guests and gift replies (off until T3/T8) | Email/password sign-up is **off** |
| Database | Supabase Postgres, every table behind **row-level security**; schema in `supabase/migrations/*.sql` | Local-first: the app keeps its own copy (IndexedDB/localStorage) and syncs (`src/cloud/sync.ts`) |
| Live updates | Supabase Realtime, only while a circle/wall screen is open | Free plan: 200 concurrent connections |
| Server logic | Supabase **Edge Functions** (Deno, `supabase/functions/`) + `pg_cron` for schedules | Khatm completion, push fan-out, evening digest, gift link previews |
| Push | Firebase Cloud Messaging (HTTP v1) called from an Edge Function with a Firebase service account (stored as a Supabase secret); Android receives via `@capacitor-firebase/messaging` | Personal reminders (Ramadan portion, revision) use **local** notifications |
| Abuse protection | RLS + per-user row caps + CHECK size limits; Supabase rate limits on auth; hCaptcha/Turnstile on anonymous sign-in when it is turned on | |
| Hosting for share links | GitHub Pages app routes now; a custom domain later (§8) | |
| Prayer times (Ramadan) | `adhan` (MIT, on the device) | |
| QR codes (wall) | `qrcode` (MIT) | |

**Project (created 2026-10-08):** `jposubjybzstfmnngews`, region `ap-northeast-1`, Postgres 17,
free plan. Site URL `https://brandyco.github.io/ayah-studio/`; redirect allow-list: that site,
`http://localhost:5173/**`, `http://localhost:4173/**`, `https://localhost/**` (the Android app).
The publishable key and URL are in `src/cloud/config.ts` (public by design). The **secret /
service-role key never goes into the app or the repo.**

**Free plan limits to watch:** 500 MB database (drafts are the largest item: ~20 KB each; cap at
3000 synced items per user), 50k monthly active users, 500k Edge Function calls a month, 5 GB
egress, 200 Realtime connections; a project with no activity for 7 days is paused (any real use
keeps it awake). Next step: Pro, $25/month.

### Client modules
```
src/cloud/config.ts     project URL, publishable key, Google web client ID (public values)
src/cloud/supabase.ts   lazy client (loaded only for signed-in users or a returning sign-in)
src/cloud/auth.ts       Google sign-in (web redirect / Android native), sign out, delete account
src/cloud/sync.ts       local-first sync of bookmarks, settings and drafts (below)
src/ui/account.ts       ☰ → Account sheet (sign in, sync state, export, sign out, delete)
src/cloud/push.ts       (T2) FCM token per device, preferences, quiet hours
src/together/*.ts       (T2+) one module per feature
```

### Sync engine (`src/cloud/sync.ts`, as built in T0)
- Table `user_docs (user_id, kind, id, data jsonb, deleted, device_id, updated_at)`; the server
  sets `updated_at` on every write, so "changed since" never trusts device clocks.
- A round: **pull** rows written by other devices since the last pull → **merge** → **push** this
  device's documents whose content changed since they were last pushed. Runs after sign-in, at
  start, when the app comes back to the foreground or online, and 4 s after a local change.
- **Bookmarks** (`state/bookmarks`) and **settings** (`setting/prefs`: reader mode, reciter, reel
  look, page tint, last read) are one document each, merged **per entry, newest change wins**;
  removed bookmarks travel as dated tombstones (kept 120 days).
- **Drafts** (`draft/{id}`): project JSON only (no thumbnail, never own media); the most recently
  edited version wins; deletions travel as tombstones. A draft whose background was the user's own
  upload shows a plain colour on other devices.
- First sign-in uploads everything local; a second device merges both sets (nothing is deleted).
- Day summaries (`kind = 'day'`) start with T9's data collection; reflections and lamps reuse the
  same table and engine (`kind = 'reflection' | 'lamp'`).

---

## 3. Data model (Supabase Postgres)

T0 (live): `profiles` (id → auth.users, name, avatar_url) and `user_docs` (above) — migration
`supabase/migrations/20261008180000_t0_user_docs.sql`; `delete_my_account()` (security definer)
removes the auth user and, by cascade, all their rows. Tested 2026-10-08 against the live database
(as two users, an anonymous user and a signed-out visitor): own rows only, no writing as another
user, unknown kinds rejected, anonymous sessions cannot sync, delete removes everything.

Planned tables (one migration per phase):
```
devices        (user_id, device_id, fcm_token, platform, quiet_from, quiet_to, notify jsonb)          T2
circles        (id, name, owner_id, invite_code, round, status, due_date, completed_at, closing_ref)   T2
circle_members (circle_id, user_id, name, color, joined_at)                                           T2
circle_parts   (circle_id, round, juz 1..30, user_id, status free|taken|done, taken_at, done_at)        T2
circle_feed    (circle_id, kind, user_id, juz, at)                                                    T2
gifts          (id, from_id, from_name, surah, ayah_from, ayah_to, reciter, look jsonb, message ≤140,
                reply_to, created_at, opens)                                                          T3
partnerships   (id, invite_code, plan jsonb, created_at) + partners (pid, user_id) + partner_progress
                (pid, user_id, pages jsonb) + nudges (pid, from_id, to_id, preset, day)               T6
walls          (id, host_id, title, occasion, join_code, status, look jsonb) + wall_entries (wall_id,
                user_id, name ≤40, dua ≤140, surah, ayah_from, ayah_to ≤ 3 ayat, hidden)              T8
app_config     (key, value jsonb) — feature flags, Ramadan start dates                                T1+
```
- References only (surah/ayah numbers, validated against `meta.json` ayah counts by CHECK
  constraints or a function); never Quran text.
- RLS outline: personal tables `user_id = auth.uid()`; circles/partnerships readable by members
  (`exists (select 1 from circle_members …)`), joined only through a security-definer function that
  checks the invite code; members change only their own part; completion is set by a trigger, not
  by clients; gifts readable by id (no listing), insert by the author, otherwise immutable; wall
  entries one per user while the wall is open, host can hide.
- Every policy gets a test in `supabase/tests/` run in CI (pgTAP via the Supabase CLI) before
  deploying.

### Edge Functions and schedules
| Function | Trigger | Job |
|---|---|---|
| `notify` | database webhook on `circle_parts`, `nudges` inserts | Push to the right devices via FCM, respecting quiet hours and preferences |
| `digest` | `pg_cron`, hourly | One calm evening push per user summarising circle activity |
| `gift-page` | HTTPS (custom domain phase) | Open Graph preview for gift links, then redirect to the app |
| (none needed) | — | Khatm completion is a trigger in Postgres; delete account and export are done by the client with RLS + `delete_my_account()` |


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

**As built (2026-10-08):** bookmarks were added as the first mark (🔖 in the selection bar, ☰ →
Bookmarks), since T0 syncs them. The Today card also offers a recent bookmark and a waiting reel
draft.

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

**Build notes:** `src/together/circles.ts`, Realtime subscriptions only while the circle sheet or
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

**As built (2026-10-08):** one note per ayah (`user_docs` kind `reflection`, id `s:a`) whose
paragraphs merge one by one — the newest edit of each wins and removals travel as tombstones — so
two devices writing offline never conflict and no "(copy)" is needed. The pulse shows once per note
per app session (not for notes written today). "Reflect" is in the selection bar of both reading
views.

**Done when:** notes survive offline edits on two devices, search finds words in notes, and the
pulse appears once per visit.

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
- **Testing:** RLS policy tests (pgTAP, `supabase/tests/*.test.sql`) run in CI by
  `.github/workflows/supabase.yml` (`supabase db start` + `supabase test db`, a local database, no
  access token); each new migration adds its tests there; a
  Playwright smoke test for gift and wall pages on the web build; `npm run check` unchanged.
- **Monitoring:** Crashlytics (opt-in), Functions logs with error alerts by email, the $5 budget
  alert, and a weekly glance at Supabase usage (Reports).
- **Feature flags:** `config/public` enables each feature (and a minimum app version), so a phase
  can be turned off without a release.

---

## 6. Phases (in build order)

| Phase | Content | Depends on | Sessions (est.) |
|---|---|---|---|
| P1 | Prerequisites: fixed signing key (GitHub secret), Supabase project, Google sign-in client (§7) | — | owner + ½ |
| **T0** | Supabase foundation: lazy client, Google sign-in (web + Android), account sheet in ☰ (sign in/out, delete account, export data), sync of drafts / last read / bookmarks / settings, first-sign-in merge, RLS (tested), privacy page | P1 | 2 |
| **T1** | Living mushaf: margin layer, time-of-day page tint, Ramadan crescent, Today card | — (no account) | 1 |
| **T4** | Reflections journal (local first, then synced) | T1 (marks), T0 (sync) | 1 |
| **T2** | Khatm circles + push foundation (Firebase project for FCM only, device tokens, preferences, quiet hours, evening digest via Edge Function + pg_cron) + Khatm reel closing card | T0, T1 | 2 |
| **T3** | Gift an ayah (read-only player route, replies, anonymous sign-in) | T0 | 1–2 |
| **T5** | Revision lamps (T5a manual; T5b with Phase 2 flashcards) | T1, Phase 2 for T5b | 1–2 |
| **T6** | Memorise with a partner (plans, shared lamps, nudges) | T5, T2 push | 1 |
| **T7** | Ramadan mode (plan, Maghrib reminder, nightly template, Eid recap) | T1, T2 (optional circle), local notifications | 1–2 |
| **T8** | Multi-segment reels + Dua & ayah wall (host screen, QR join, keepsake reel) | T0, engine work | 2–3 |
| **T9** | Your year with the Quran (day summaries from T0 on, story cards, recap reel) | T8 (segments), T1–T5 data | 1–2 |
| T10 | Custom domain: Android App Links, rich link previews (`gift-page` Edge Function), Tauri sign-in | T3, Tauri phase | 1 |

**Day summaries start in T0** (writing `days/{date}`), so by the time T9 is built there is already
a year of data to recap.

---

## 7. What the owner needs to do (one time)

1. **Signing key** (done 2026-10-08 in code): add the GitHub secrets `ANDROID_KEYSTORE_BASE64` and
   `ANDROID_KEYSTORE_PASSWORD` from the file handed over, so APK fingerprints stay the same — Google
   sign-in on Android depends on it.
2. **Supabase** (done): project created; a personal access token was used by the setup session
   (delete it at supabase.com/dashboard/account/tokens when setup is finished).
3. **Google sign-in client** (Google Cloud console, the "Ayah Studio" project):
   - Google Auth Platform → **Branding / Get started**: app name "Ayah Studio", support email,
     audience **External**, contact email → Create; then **Audience → Publish app** (basic profile
     and email need no Google review).
   - **Clients → Create client → Web application** "Ayah Studio web": Authorized JavaScript origins
     `https://brandyco.github.io`; Authorized redirect URIs
     `https://jposubjybzstfmnngews.supabase.co/auth/v1/callback`. Send the **Client ID** and
     **Client secret** to the session (the secret goes into Supabase only, never into the repo).
   - **Clients → Create client → Android** "Ayah Studio Android": package `com.brandyco.ayahstudio`,
     SHA-1 `B0:F6:CC:91:59:C1:47:75:21:29:25:70:92:2F:8A:65:21:72:6E:13` (from the signing key).
4. (T2) Firebase project for push only: Android app with the same package + fingerprints,
   `google-services.json` as the repo secret `GOOGLE_SERVICES_JSON`, and a service-account key for
   FCM stored as a Supabase secret.


---

## 8. Later: custom domain

A domain (e.g. `ayahstudio.app`) gives: short share links
(`ayahstudio.app/g/{id}`), link previews in WhatsApp/iMessage (`gift-page` Edge Function), **Android App
Links** (links open the installed app directly; needs `/.well-known/assetlinks.json` on the
domain root, which GitHub Pages project sites cannot serve), and a clean home for the privacy
policy. Until then, links use the GitHub Pages address and the web app offers "Open in the app".
