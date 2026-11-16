# The iPhone app

Same web app as Android, wrapped by Capacitor 8 in `ios/` (Swift Package Manager, iPhone only, iOS 16.4+), built on
GitHub's macOS runners by `.github/workflows/ios.yml`, so no Mac is needed. The page runs at `capacitor://localhost`
(the proxy allows it).

## How it is built
- **Every change** (`simulator` job): web build → `npx cap sync ios` → `xcodebuild` for the simulator without
  signing → the app is started on a simulated iPhone and two screenshots are kept (artifact `iphone-screenshots`).
  The job fails if the app is no longer running after 30 s.
- **main / by hand** (`testflight` job): archive, signing with the App Store Connect API key (`-allowProvisioningUpdates`:
  Xcode creates the certificate, App ID and profile itself), upload to App Store Connect (`destination: upload`).
  Build number = run number + 100; version = `iosVersion` in package.json. Skipped with a notice until the secrets exist.

## What is native on the iPhone (`ios/App/App/*.swift`, registered in `AyahBridgeViewController.swift`)
| Plugin (JS name) | iPhone | Android counterpart |
|---|---|---|
| `AppIcon` | `setAlternateIconName`: themes + the 10 unlockable tiers (`Assets.xcassets/AppIcon-{id}`, listed in `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`); changed only when it differs (iOS shows a note each time) | `AppIcons.java` activity-aliases |
| `MediaScan` | copies a saved reel into Photos (add-only access); the file stays in Files → On My iPhone → Ayah Studio | gallery scan |
| `ExportService` | screen kept on + a background task (~30 s grace); the export page says to keep the app open | foreground service |
| `Speech` | `SFSpeechRecognizer` in Arabic (on-device when available), one utterance per pause, Android's events and error codes | `SpeechPlugin.java` |
| `Haptic` | `navigator.vibrate` → Taptic Engine (`src/iosHaptics.ts`) | built-in vibrate |

Background recitation: `UIBackgroundModes audio` + `AVAudioSession .playback` (AppDelegate) + the page's Media Session.
Not on the iPhone yet (hidden by `hasPlugin()` in `src/native.ts`): home-screen widgets and the lock-screen prayer line
(need a WidgetKit extension + App Group), the Play font pack (every page font ships in the app), the Android media
service. Local notifications: iOS keeps the 64 soonest, so prayer alerts are set 3 days ahead there (set again on
every start); prayer sounds `prayer_adhan.caf` (the adhan's first 29.5 s: iOS plays ≤ 30 s) and `prayer_chime.caf`.

Sign-in: **Sign in with Apple** (App Store guideline 4.8) natively, then Supabase `signInWithIdToken` (provider
`apple`, hashed nonce); Apple's name is saved to the account the first time. Google on the iPhone only when the repo
variable `GOOGLE_IOS_CLIENT_ID` is set (its reversed id becomes the URL scheme in the build).

Files kept by scripts (run again after changes):
- `python3 scripts/make-character-icons.py --ios`: app icons + launch picture
- `node scripts/make-ios-strings.mjs`: permission questions in every language (`scripts/i18n/ios-infoplist.json`)
- `ruby scripts/ios-project.rb` (gem `xcodeproj`): adds the Swift files, sounds, strings, settings and the shared scheme
  to `App.xcodeproj`

## Owner steps (once)
1. **Apple Developer Program** ($99/year): https://developer.apple.com/programs/enroll/ (Apple ID with two-factor
   sign-in; approval usually 1–2 days). Then https://developer.apple.com/account → Membership details → **Team ID**.
2. **App ID**: https://developer.apple.com/account/resources/identifiers/add/bundleId → App IDs → App → Description
   "Ayah Studio", Bundle ID **Explicit** `com.brandyco.ayahstudio`, tick **Sign In with Apple** → Continue → Register.
3. **App record**: https://appstoreconnect.apple.com/apps → **+** → New App → iOS, Name "Ayah Studio" (if taken: "Ayah
   Studio: Quran Reels"), language English, Bundle ID `com.brandyco.ayahstudio`, SKU `ayahstudio`, Full Access.
4. **API key**: https://appstoreconnect.apple.com/access/integrations/api → Team Keys → **+** → name "GitHub",
   access **Admin** → Generate → **Download** the .p8 file (only once possible). Note the **Key ID** and the
   **Issuer ID** shown above the list.
5. **GitHub** (https://github.com/brandyCO/ayah-studio/settings/secrets/actions):
   - Secrets: `APP_STORE_CONNECT_KEY` = the whole text of the .p8 file (open it in Notepad), `APP_STORE_CONNECT_KEY_ID`,
     `APP_STORE_CONNECT_ISSUER_ID`
   - Variables tab: `APPLE_TEAM_ID` = the Team ID
6. **Supabase**: https://supabase.com/dashboard/project/jposubjybzstfmnngews/auth/providers → **Apple** → Enable →
   Client IDs: `com.brandyco.ayahstudio` → Save (no secret key needed for sign-in inside the app).
7. Run it: https://github.com/brandyCO/ayah-studio/actions/workflows/ios.yml → Run workflow. ~20 min later the build is
   in App Store Connect → the app → **TestFlight**: add yourself to an Internal Testing group, install **TestFlight**
   from the App Store on the iPhone, open the invite.
8. Optional, Google sign-in on the iPhone: https://console.cloud.google.com/apis/credentials (project "Ayah Studio") →
   Create credentials → OAuth client ID → **iOS** → Bundle ID `com.brandyco.ayahstudio` → copy the client ID → GitHub
   variable `GOOGLE_IOS_CLIENT_ID`, and add it in Supabase → Google provider → Client IDs (after the web one,
   comma-separated).
9. Before submitting for review: screenshots (6.9" iPhone, 1320×2868), App Privacy answers (email + user ID for the
   account, crash data, anonymous usage: none used for tracking), privacy policy URL
   https://brandyco.github.io/ayah-studio/privacy.html, age rating, and a reviewer note that sign-in is optional.
