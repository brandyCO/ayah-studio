# Ayah Studio — "Reach & daily": languages, the ayah of the day, tafsir and polish

Production plan for the improvements that make Ayah Studio more appealing to adults who read
daily: more translations and an Arabic interface, a calm ayah of the day (Today card, morning
notification, Android home-screen widget), a short trusted tafsir beside the translation, a
first-run tour, faster first load, an "Export for WhatsApp Status" preset and, if time allows,
Phase 2 **Recite & Compare**. Written 2026-10-09 (owner-approved direction). Build it phase by
phase (G1 … G6 below) and tick the boxes in CLAUDE.md → "Phase 6 — Reach & daily" as phases ship.

A sibling session builds a Kids space at the same time; both coordinate through `main` (merge
`origin/main` before opening and before merging every PR; on conflicts keep both sides).

---

## 0. Open questions for the owner (work continues with the defaults shown)

1. **Translation licences — non-commercial.** The added translations come from the Tanzil
   collection (the same route as the bundled Saheeh International: `api.alquran.cloud`). Tanzil
   offers them **for non-commercial use**; other use needs the translator's / publisher's
   permission. Ayah Studio is free with no ads, so this fits. *Default:* bundle them with credits.
   *Decide before* any paid tier, ads or store pricing: then ask each publisher (or switch to
   QuranEnc.com editions, whose terms are "free use, unmodified, credit the source + version").
2. **Tafsir licence — unclear, so it ships behind a flag.** The only short English tafsir on
   Quran.com is *Ibn Kathir (Abridged)* (Darussalam's edition, copyrighted). Quran.com's API is
   covered by the **Quran Foundation Developer Terms**, which (as summarised publicly; the terms page
   is not reachable from the build container) allow showing content inside an app, require the
   edition to be credited, and limit caching to **one week** unless the content comes through their
   Content Sync APIs (OAuth client from the QF Developer Console). *Default:* built, cached ≤ 7 days,
   **off** (flag `tafsir` in `src/features.ts`; testers turn it on in ☰ → Device check). *Decide:*
   register an app in the Quran Foundation Developer Console and confirm Darussalam's abridged Ibn
   Kathir may be shown (then flip the flag); or choose another edition.
3. **Bundled Quran.com data and the one-week cache rule.** The same terms would also cover
   `en-wbw.json` (word-by-word meanings, bundled in Phase 1a from api.quran.com). The Uthmani text is
   the King Fahd Complex's and the QCF fonts have their own licence. *Default:* unchanged; raise it
   with Quran Foundation when registering (question 2).
4. **Arabic interface wording.** The Arabic UI strings are written by the build session (UI words
   only: "Export", "Bookmarks", "Settings"…; religious wording such as surah names comes from the
   bundled data, never invented). *Ask* a native speaker to read `src/i18n/ar.ts` once before a
   public launch.
5. **WhatsApp Status length.** WhatsApp has accepted 60 s status videos since 2024, but older
   versions and many people's habits are 30 s. *Default:* parts of **≤ 30 s** at 720p (and always
   under 16 MB); a later setting can offer 60 s.

---

## 1. Principles (apply to every phase)

1. **The mushaf is still the home.** The ayah of the day lives on the Today card, the tafsir in the
   translation sheet, the tour is three screens shown once. No new tab bars, no feeds.
2. **Calm, never competitive.** No streaks, counters or "you missed a day". The morning
   notification is off by default, at most one a day, never during quiet hours, and shows the whole
   translation of the ayah or only its reference — never a cut-off line.
3. **Only published words about the Quran.** Translations of the meaning come only from published
   translations; tafsir only from a named, published tafsir, shown in full for the ayah, never
   summarised, shortened or "simplified" by us (no AI-written religious content anywhere). UI strings
   may be translated by us; religious terms in them are avoided or taken from the data.
4. **Rules 1–8 of CLAUDE.md hold.** Never alter Quran text; always show the reference; no music; the
   Arabic is drawn in the KFGQPC font in reels and the QCF fonts in the mushaf — the widget and
   notification show the reference and translation only (system font), never the Arabic.
5. **Measure, then speed up.** Every performance change states the before/after numbers
   (bundle sizes from `vite build`, first contentful paint in Playwright with a throttled network).
6. **Works offline.** Chosen translations are cached once and stay offline; tafsir is cached per
   ayah within the licence's limit; the ayah of the day needs no network.

---

## 2. Architecture

| Need | Choice | Notes |
|---|---|---|
| UI strings | `src/i18n/index.ts` (`t(key, vars?)`, `lang()`, `setLang()`, `dir()`), one dictionary per language: `src/i18n/en.ts` (source of truth, typed keys), `src/i18n/ar.ts` (lazy-loaded), more later | Missing keys fall back to English. Language: ☰ → Settings → Language (device default if supported). `<html lang dir>` set at start |
| RTL layout | `dir="rtl"` on `<html>` for the Arabic UI; CSS uses logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`) | The mushaf strip, page swipe direction, the reel canvas and the timeline keep their own fixed directions (pages already turn right-to-left; the timeline is time, left → right in every language) |
| Translations | `public/data/tr/{id}.json` (`{source, name, lang, dir, surahs}`) from `scripts/fetch-translations.mjs`; `src/data/translations.ts` lists them and loads one on demand | `en-sahih.json` stays where it is (default, loaded at start); others are fetched only when picked, then kept by the service worker (data cache-first) and in the Capacitor app as local files |
| Ayah of the day | `src/data/daily.ts`: curated references in `public/data/daily.json` (+ English text copied unaltered from the bundled translation, for the widget); pick = deterministic by local date | Same pick in the app, the notification and the widget (Java port of the same function) |
| Morning notification | `@capacitor/local-notifications` (already used by Ramadan, `src/ui/ramadan.ts`), id range of its own, next 14 mornings scheduled whenever the app opens | Off by default; time setting; never inside 22:00–06:00 |
| Widget | `android/app/src/main/java/…/DailyAyahWidget.java` (AppWidgetProvider) + layout + `xml/daily_ayah_widget_info.xml`; tiny Capacitor plugin `DailyPlugin` writes the chosen translation's texts for the curated list into SharedPreferences | Tap → `#/ayah/{s}:{a}` deep link (opens the mushaf page with the ayah tinted) |
| Tafsir | `src/data/tafsir.ts`: `api.quran.com/api/v4/tafsirs/{id}/by_ayah/{key}`, IndexedDB store `tafsir` (≤ 7 days, newest 300) | Flag `tafsir` (§0.2) |
| Tour | `src/ui/tour.ts`, shown once (`prefs.tourSeen`), ☰ → "Tour" | Brand gradient only on the "Start" button (allowed: `.primary.brand-btn`) |
| WhatsApp preset | `src/engine/export.ts` gains a `parts` option: split the timeline at word gaps into ≤ 30 s parts, 720p, bitrate capped so each part < 16 MB | Each part shows its own reference |
| Recite & Compare | `src/ui/compare.ts` + `src/data/recordings.ts` (IndexedDB store `recordings`) | MediaRecorder (Opus/WebM or AAC/MP4, whichever the device has) |

**Database:** none of these phases needs a new table. The chosen translation and language join the
synced settings document (`setting/prefs`), so they follow the user to another device.

---

## 3. Features

Each feature lists the experience, then the build notes and acceptance criteria.

### G1 — Languages

**Experience**
- ☰ → **Translation** opens a calm list grouped by language, each with the translator's name
  ("Urdu · Fateh Muhammad Jalandhry"); the current one is ticked; a small download size shows for
  ones not yet on this device. The same picker sits in the reel editor (Translation tool → "Which
  translation"). The reader cards, the translation sheet in the mushaf, the reel and gifts use it.
- On the reel the translation is set in a font that covers its script (Noto Naskh Arabic for
  Urdu/Persian-script translations, the existing serif/sans for Latin scripts), right-to-left when
  the translation is. The **closing card credits the translator** ("Translation: Fateh Muhammad
  Jalandhry") the way Saheeh International is credited today.
- Synced word-by-word translation stays English (Quran.com provides other word-by-word languages,
  but without a clear licence). When a non-English translation is chosen, the reel's *Synced to the
  words* option shows English words with a note ("Word meanings: English"), or the user picks
  *Whole ayah*.
- ☰ → Settings → **Language**: English · العربية. The Arabic interface flips the layout to
  right-to-left: menus, sheets, the selection bar, the editor's panels and tool bar.

**Curated translations (first set; Tanzil collection via api.alquran.cloud, non-commercial):**
Saheeh International (bundled), Pickthall, Yusuf Ali (English) · Fateh Muhammad Jalandhry, Muhammad
Junagarhi (Urdu) · Indonesian Ministry of Religious Affairs (Indonesian) · Diyanet İşleri (Turkish)
· Muhammad Hamidullah (French) · Abdullah Muhammad Basmeih (Malay) · Muhiuddin Khan (Bengali) ·
Bubenheim & Elyas (German) · Julio Cortés (Spanish) · Elmir Kuliev (Russian) · Suhel Farooq Khan &
Saifur Rahman Nadwi (Hindi) · Ali Muhsin Al-Barwani (Swahili). Criteria: a widely used,
mainstream, complete translation per language, published by a known translator or institution,
available unmodified from the source. More can be added with one line in the fetch script.

**Build notes**
- `scripts/fetch-translations.mjs`: fetches each edition, verifies 114 surahs / 6236 ayat against
  `meta.json`, strips nothing (text stored exactly as published), writes `public/data/tr/{id}.json`
  with `source`, `translator`, `lang`, `dir`, `licence` and `public/data/translations.json` (the list
  with sizes). Licence note in `public/data/tr/README.md`.
- `src/data/quran.ts` keeps `translation(s, a)` but reads from the chosen edition; `en-sahih` stays the
  default and the fallback while another loads.
- i18n first pass: the strings people meet most — the mushaf bar and ☰ menu, the selection bar, the
  surah list, settings/account sheets, the Today card, the reel editor's top bar, tool bar and panel
  titles, the export page. Later passes move the remaining screens (circles, gifts, wall, Ramadan,
  lamps, reflections) a module at a time. Dates and numbers use `Intl` with the UI language.

**Done when:** any listed translation can be picked in the reader and the editor, shows offline after
its first use, appears on the reel in a font that covers its script and direction, and is credited on
the closing card; the Arabic interface shows the main screens right-to-left with nothing clipped or
overlapping at 390 px (Playwright screenshots, light and dark); `npm run check` unchanged.

### G2 — Ayah of the day

**Experience**
- The Today card gains one line: "Today's ayah · Ash-Sharh 94:5–6" with the translation beneath;
  tap → the mushaf page with the ayah tinted, and two quiet actions: **▶ Listen** and **Make
  today's reel** (an editor draft in the current look).
- Android: ☰ → Settings → **Morning ayah** (off by default): a time (default 07:30, never between
  22:00 and 06:00). The notification shows the reference and the translation; tap → the ayah.
- Android home-screen widget "Ayah of the day": the reference and the translation in the system
  font on a calm dark or light card (follows the system theme), the app's small logo; tap → the
  ayah. It changes after local midnight.

**The curated list (criteria):** short, well-known ayat (or a run of 2–3 consecutive ayat that form
one sentence) whose meaning stands on its own without the surrounding passage: remembrance, mercy,
hope, patience, gratitude, trust, duas from the Quran, and descriptions of Allah's names; no legal
rulings, no verses about punishment or battle out of context, no ayah that starts mid-sentence or
answers a question asked in the previous ayah; translation of the run ≤ 60 words (so the widget
never cuts it — the widget shows it whole, or only the reference if a font size makes it not fit).
147 entries (as built), so each comes back about every five months. Pick: day number since 2026-01-01 in
local time → an index into a fixed shuffle of the list (seeded, committed in `daily.json`), so every
device shows the same ayah on the same date.

**Build notes**
- `scripts/make-daily.mjs` validates every reference against `meta.json`, copies the English text
  unaltered from `en-sahih.json`, checks the word limit and writes `public/data/daily.json`.
- Notification: same plugin and permission flow as the Ramadan reminders (`ensurePermission()`
  pattern in `src/ui/ramadan.ts`), its own id range (2000–2099), reschedules 14 days ahead on app
  open and when the time/translation changes.
- Widget: Java `DailyAyahWidget` reads `assets/public/data/daily.json` (the web build copied in by
  `cap sync`), uses the translation texts the app stored in SharedPreferences (`DailyPlugin.store`)
  when present, else English; updates daily via `updatePeriodMillis` + an alarm-free midnight
  check on each update.

**Done when:** the same date gives the same ayah in the app, notification and widget; the
notification is off until turned on and fires once a morning; the APK builds in CI with the widget
(it cannot be placed on a home screen in the cloud container — phone test).

### G3 — First-run tour

**Experience:** on first launch, after the mushaf has loaded behind it, three calm full-screen
cards slide over a soft blur: **Read the mushaf** (swipe pages, long-press to select, listen) ·
**Make a reel** (select ayat → Turn into reel → export for Reels/Shorts) · **Together** (circles,
gifts, the ayah wall, all optional, private by default). Skip on every card; dots; "Start reading"
on the last. Shown once (`prefs.tourSeen`), ☰ → **Tour** shows it again. Simple line drawings in the
UI colour, the brand gradient only on the final button; respects `prefers-reduced-motion`.

**Done when:** first launch shows it once (not on deep links such as `#/gift/…` or `#/w/…`), Skip
and Start both land in the mushaf, it works RTL, and it never shows over the Ramadan first-night
moment (that one waits for the next start).

### G4 — Tafsir (behind the `tafsir` flag)

**Experience:** in the mushaf translation sheet and on the reader's translation cards a quiet
"Tafsir" link under the translation expands the explanation for that ayah: the edition's name
("Tafsir Ibn Kathir (abridged) · Darussalam, via Quran.com") above the text, the text exactly as
published (HTML sanitised to paragraphs, headings and emphasis), a link to the source. Where the
tafsir explains a group of ayat together, the sheet says so ("Explains 2:1–5").

**Build notes:** `src/data/tafsir.ts` (fetch per ayah on demand; IndexedDB store `tafsir`, entries
older than 7 days refetched or, offline, shown with "saved on …" until 7 days then dropped — §0.2);
text inserted via a whitelist sanitiser (no attributes but `href` on links to quran.com); never
edited, cut or summarised. Flag in `src/features.ts`; device-check toggle for testing.

**Done when:** with the flag on, tafsir opens for any ayah, shows its attribution, works offline for
ayat opened in the past week; with the flag off nothing about tafsir appears.

### G5 — Polish

- **Faster first load.** Measure first (bundle table from `vite build`; FCP/LCP with Playwright on
  "Slow 4G"). Known: the main chunk (≈ 99 kB) imports `src/ui/circles.ts` statically from the mushaf
  (Vite warns), the editor/export/aac chunks are already lazy. Candidates: lazy-load circles, gifts
  and wall UI from the mushaf; defer `en-wbw.json` and `word-map.json` until a reel needs them;
  `preload` the first QCF page font; keep `mushaf.json` lazy per page range if it dominates.
- **Export for WhatsApp Status.** On the export page: "WhatsApp Status" next to 1080P/720P → 720p,
  parts of ≤ 30 s split at the gaps between words (preferably between ayat), each part < 16 MB
  (bitrate capped), named "… part 1 of 3"; Save/Share all parts. Every part shows its own reference
  (rule 2); no word is ever cut.
- **Recite & Compare** (Phase 2, if time allows): from a selected ayah → "Recite": the sheikh's
  recitation plays, then the user records (MediaRecorder); two waveforms side by side with the ayah
  markers; A/B toggle (Sheikh / Me), play both from the same word; recordings saved locally
  (IndexedDB `recordings`), listed per ayah, deletable. No scoring, no "accuracy" numbers.

**Done when:** before/after load numbers are in the PR; a WhatsApp export of a 70 s reel gives three
parts under 30 s and 16 MB that play in the browser; Recite & Compare records, compares and keeps
recordings offline.

---

## 4. Phases (in build order)

| Phase | Content | Depends on |
|---|---|---|
| **G1** | i18n foundation (`src/i18n/`), Arabic UI + RTL for the main screens, translations bundle + picker (reader + editor), reel credit + script fonts | — |
| **G2** | Ayah of the day: list + Today card + Make today's reel; morning notification; Android widget | G1 (translation choice) |
| **G3** | First-run tour | G1 (strings) |
| **G4** | Tafsir behind a flag | — |
| **G5** | Faster first load; WhatsApp Status export | — |
| **G6** | Recite & Compare (Phase 2) | — |

Each phase: branch from `main` → build → Playwright screenshots at 390×820 (light, dark, Arabic RTL)
→ PR → Android APK (and Database rules if anything changes there) green → merge → tick CLAUDE.md
with an "as built" note → a short phone checklist for the owner.

---

## 5. What the owner needs to do

1. Decide §0.1–0.5 when convenient; nothing blocks the build.
2. (Tafsir) Register Ayah Studio in the Quran Foundation Developer Console and confirm the tafsir
   edition's terms; then the `tafsir` flag can be turned on.
3. (Arabic UI) Ask a native speaker to read `src/i18n/ar.ts`.
4. Phone tests: the widget and the morning notification can only be checked on the phone.
