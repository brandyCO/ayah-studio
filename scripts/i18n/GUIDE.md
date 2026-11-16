# Translating the Ayah Studio interface

Ayah Studio is a Quran companion app (Android + web): a full-screen Madinah mushaf to read, recitation by
~90 reciters, a reel studio that turns ayat into 9:16 videos, a Learn tab (memorise surahs; trees grow in a
garden), daily goals with a streak "flame", a tasbih counter, morning/evening adhkar, prayer times, Ranks
(weekly leagues with friends), a shop where the in-app currency "Light" buys pieces for the user's own
character, chests and badges, a Kids space and a Ramadan season. The tone is warm, calm, short and
encouraging, like Duolingo, never preachy, never guilt-tripping. Users are Muslims of every age.

The English source is `scripts/i18n/en.json`, split into parts in `scripts/i18n/parts/NN-module.json`
(`{ "module": { "key": "English" } }`). The key names hint at the screen (`rk.` Ranks, `sh.` shop, `ed.`
studio editor, `learn.` Learn, `ak.`/`du.` adhkar and du'a, `kids.` Kids space, `ob.` onboarding…).

## Output
For each part write `scripts/i18n/work/{lang}/NN-module.json` with exactly the same module and keys, the
values translated. Then run `node scripts/i18n-merge.mjs {lang}` and fix every problem it lists until it
prints `ok`. Valid JSON only (escape `"` inside values as `\"`).

## Rules
1. Keep every `{placeholder}` exactly as written (you may move it). Never translate the word inside braces.
2. Plurals: where the language changes the noun with the number, use ICU plural syntax on that variable:
   `{n, plural, one {{n} аят} few {{n} аята} many {{n} аятов} other {{n} аята}}` (categories as CLDR defines
   them for your language; `other` is required). Languages without plural change (Chinese, Japanese, Korean,
   Indonesian, Malay, Turkish after numbers, Persian after numbers…) just write one form.
3. Keep unchanged: `Ayah Studio`, `XP`, `Google`, `WhatsApp`, `Instagram`, `TikTok`, `Pixabay`, `Pexels`,
   `Quran.com`, `Saheeh International`, `Hisn al-Muslim`, `Darussalam`, `MP4`, `HD`, emoji, symbols (`·`, `→`,
   `✦`, `❄`, `★`), references like `2:255`, and Western digits.
4. Allah stays "Allah" in every language (never a generic word for god such as Dios, Gott, Бог, 上帝; in
   Chinese use 真主 or 安拉 as Chinese Muslims write; in Japanese アッラー). Use the Islamic terms Muslims who
   speak your language actually use, spelled their way: ayah / ayat, surah, juz, hizb, mushaf, du'a, dhikr,
   adhkar, tasbih, tajweed, harakat, tafsir, Bismillah, Khatm, Jumu'ah (Friday), the prayers Fajr, Dhuhr,
   Asr, Maghrib, Isha, Suhoor, Iftar, Taraweeh, Laylat al-Qadr, Eid, MashaAllah, Alhamdulillah, SubhanAllah,
   InshaAllah, Ameen, Sahaba (Companions), the Prophet ﷺ. Example: Turkish ayet, sure, cüz, dua, zikir,
   tesbih, akşam namazı / Akşam; Indonesian ayat, surah, juz, doa, zikir; Urdu آیت، سورہ، پارہ، دعا، ذکر.
5. "Light" (capital L) is the app's only currency, drawn as a star. Translate it with your language's
   natural word for light, the same word everywhere, capitalised where the language capitalises
   (e.g. Lumière, Luz, Licht, Nur, Cahaya, نور, Свет, 光). "XP" is progress, never money.
6. The five league names follow the Sahaba's journey: Dar al-Arqam, Hijrah, Badr, Al-Khandaq, Fath Makkah:
   write them as Muslims in your language know these events (e.g. Turkish Darülerkam, Hicret, Bedir,
   Hendek, Mekke'nin Fethi).
7. Address the user the way friendly, modern apps in your language do (Duolingo's choice): French/Spanish/
   Portuguese/Italian `tu`, German/Dutch `du`/`je`, Turkish `sen`, Russian `ты`, Indonesian `kamu`, Malay
   `anda`/`kamu` as natural, Urdu/Hindi `آپ`/`आप`, Persian `تو` or `شما` as natural for a warm app, Bengali
   `তুমি` or `আপনি` as natural. Be consistent.
8. A phone screen: keep buttons and labels about as short as the English. Natural, idiomatic sentences,
   never word-for-word. Never add religious claims, rulings or wording that is not in the English.
9. The `msg` module: keys are English messages from the server; values are their translation. Keys that
   start with `@` are templates whose `{1}`, `{2}` are filled in.
10. The `engine` module: names of video effects, moods, transitions and colour themes in the reel studio.
11. RTL languages (Urdu, Persian, Pashto, Kurdish Sorani): write naturally; no direction marks needed.
12. Do not change any other file in the repository, and do not commit.
