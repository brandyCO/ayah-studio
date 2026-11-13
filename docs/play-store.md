# Google Play release

Everything needed to put Ayah Studio on Google Play. The text below is ready to paste into the Play Console.

## 1. Build the bundle

Go to Actions, open "Play Store release" and click Run workflow. Type the version (for example `1.0.0`).

- The run makes `app-release.aab`, signed with the app's own key (the repo secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`). Play uses that key as the **upload key**: in the Play Console, keep "Let Google manage and protect your app signing key" (Play App Signing).
- The version number is 20000 plus the run number. It always grows and is always higher than the test APKs.
- All 604 mushaf page fonts are inside the bundle, so every page reads offline from install. The bundle stays under Play's 200 MB limit, and the run checks this.
- Download the bundle from the run's page: Artifacts → `ayah-studio-<version>-aab`.

Google sign-in: Play re-signs the app with Google's key. In the Play Console, open Setup → App signing and copy the **SHA-1 of the app signing key**. In Google Cloud ("Ayah Studio" project → Credentials), add a second Android OAuth client with that SHA-1 and the package `com.brandyco.ayahstudio`. If you skip this, Google sign-in will not work in the store version. The test APK keeps working with the existing client.

## 2. Store listing

Images are in `store/`, made by `node scripts/store-screenshots.mjs` after `npm run build`:

- the app icon, `icon-512.png`
- the feature graphic, `en/feature-graphic.png` and `ar/feature-graphic.png` (1024 × 500)
- six phone screenshots per language, `en/` and `ar/` (1080 × 1920)

Settings:

- **App name:** Ayah Studio
- **Category:** Books & Reference (or Education)
- **Tags:** Quran, Islam, Education
- **Contains ads:** No
- **In-app purchases:** No. Light is earned in the app and is never sold.

### English (en-US)

**Short description** (80 characters max):
Read the mushaf, memorise with a path, and turn ayat into calm recitation reels.

**Full description:**

Ayah Studio is a calm companion for the Quran: read it, memorise it, and share it.

READ THE MUSHAF
• Full-screen Madinah mushaf pages in the King Fahd Complex fonts, offline from the first open
• Listen while you read, with the ayah and the word being recited lit on the page
• More than 90 reciters, search by surah, juz, page or word, bookmarks and reflections
• Translations in more than a dozen languages

MEMORISE WITH A PATH
• A step-by-step path through each surah: meaning first, listen, practise, then recite from memory
• Tasmi' on the real mushaf page, with "Follow my voice" to check where you stopped
• Reviews come back at the right time, and every surah you learn grows its own tree

TURN AN AYAH INTO A REEL
• Pick ayat and a reciter, and get a 9:16 video for Reels, TikTok, Shorts or WhatsApp Status
• Text timed to the reciter's words, calm effects, nature backgrounds, no music
• The Quran text is never changed, and the reference is always on screen

A DAILY HABIT, GENTLY
• Daily goals, a streak, and morning and evening adhkar from Hisn al-Muslim
• Prayer times, du'a moments through the day, and widgets for your home screen
• Weekly leagues with friends, measured by effort in the app and never as reward with Allah

PRIVATE BY DESIGN
• Works without an account. Sign in with Google only if you want your progress on every device
• No ads. Delete your account and everything with it from the app at any time

### Arabic (ar)

**Short description:**
اقرأ المصحف، واحفظ خطوة بخطوة، واصنع مقاطع تلاوة هادئة من الآيات.

**Full description:**

آية ستوديو رفيق هادئ مع القرآن: تقرؤه، وتحفظه، وتشاركه.

اقرأ المصحف
• صفحات مصحف المدينة كاملة بخطوط مجمع الملك فهد، تعمل دون إنترنت منذ أول فتح
• استمع وأنت تقرأ، مع إضاءة الآية والكلمة المتلوة على الصفحة
• أكثر من ٩٠ قارئًا، وبحث بالسورة والجزء والصفحة والكلمة، وعلامات وتدبّرات
• ترجمات بأكثر من اثنتي عشرة لغة

احفظ خطوة بخطوة
• مسار لكل سورة: المعنى أولًا، ثم الاستماع، ثم التمرين، ثم التسميع من الحفظ
• تسميع على صفحة المصحف نفسها، مع «تابع صوتي» ليعرف أين توقفت
• المراجعة تعود في وقتها، وكل سورة تحفظها تنبت شجرتها

اصنع من الآية مقطعًا
• اختر الآيات والقارئ، واحصل على فيديو عمودي لإنستغرام وتيك توك ويوتيوب وحالة واتساب
• نص متزامن مع كلمات القارئ، ومؤثرات هادئة، وخلفيات من الطبيعة، بلا موسيقى
• نص القرآن لا يُغيَّر أبدًا، والمرجع ظاهر دائمًا على الشاشة

عادة يومية بلطف
• أهداف يومية وسلسلة أيام، وأذكار الصباح والمساء من حصن المسلم
• مواقيت الصلاة، وأدعية اليوم، وأدوات للشاشة الرئيسية
• دوريات أسبوعية مع الأصدقاء تقيس الجهد في التطبيق، لا الأجر عند الله

خصوصيتك أولًا
• يعمل دون حساب، وتسجيل الدخول بجوجل اختياري لمزامنة تقدّمك
• بلا إعلانات، ويمكنك حذف حسابك وكل ما فيه من داخل التطبيق

## 3. App content (Policy → App content)

- **Privacy policy:** https://brandyco.github.io/ayah-studio/privacy.html
- **Ads:** No ads.
- **App access:** All features work without signing in, except Ranks, friends and sync. Choose "All or some functionality is restricted" and say that these need a Google account. Play's reviewers can sign in with any Google account, so no test login is needed.
- **Target audience:** 13–15, 16–17, 18 and over. Do not tick the under-13 groups. The Kids space is used by a parent on their own phone. Ticking a child age group would put the app under the Families policy (see `docs/kids.md` §5). When asked "Could your app unintentionally appeal to children?", answer No, and explain that the Kids space is behind a parent gate and is used together with a parent.
- **Content rating** (IARC questionnaire):
  - Category: Reference, News, or Educational
  - Violence, fear, sexuality, profanity, drugs, gambling: No to all
  - Users can interact or exchange information: **Yes**. Friends, boards and challenges show a first name and a drawn character; there is no chat. The only free text others can see is a name.
  - Shares the user's location with other users: No
  - Allows purchases of digital goods: No
  - Unrestricted internet access (a web browser): No
  - The expected result is Everyone / PEGI 3, possibly with "Users Interact".
- **Data safety:**
  - Encrypted in transit: Yes. Users can request deletion: Yes (in the app: Me → ⚙ → App → Account → Delete account).
  - Collected, all optional and only when signed in:
    - Name and email address (Google sign-in), for account management
    - App activity (reading progress, goals, Ranks), for app functionality
    - User-generated content (drafts, bookmarks, reflections), for app functionality
  - Audio:
    - Voice is sent only during "Follow my voice" with the harakat check on. It is processed in memory and not stored (mark it as processed ephemerally).
    - Short clips are kept only if "Help improve the harakat check" is turned on.
  - Device or other IDs: the app's random install id, sent with problem reports and Follow my voice beta counts, for analytics.
  - Crash logs: only once a Sentry DSN is set.
  - Not collected: location (prayer times are worked out on the phone), contacts, photos (your own media stays on the phone).
  - Shared with third parties: none. Google speech recognition runs on the phone, or in Chrome on the web.
- **Foreground services** (Policy → App content → Foreground service permissions):
  - `dataSync`: keeps a reel export and reciter downloads running when the user leaves the app.
  - `mediaPlayback`: plays the recitation with the screen off.
  - Play asks for a short video of each. Record one on the phone: start an export and leave the app, then start listening and lock the screen.
- **Health, financial, news, government:** Not applicable.

## 4. Release

1. Go to Testing → Internal testing → Create release, upload the `.aab`, add yourself as a tester, and install it from the link.
2. Check sign-in, a reel export, listening with the screen off, and the widgets.
3. Promote the release to Production. New personal developer accounts must first run a closed test with at least 12 testers for 14 days before Production opens.
