// Arabic for messages that reach the user in English from elsewhere: the server's error messages
// (Supabase functions raise them in English), the free-library proxy, and errors thrown by the data
// layer that end up in a toast. Loaded only with the Arabic interface (src/i18n/index.ts).

const exact: Record<string, string> = {
  // accounts and sign-in
  'Not signed in': 'لم تسجّل الدخول',
  'Sign in with Google first': 'سجّل الدخول بحساب Google أولًا',
  'Sign in with Google to join the ranks': 'سجّل الدخول بحساب Google لتنضم إلى الترتيب',
  'Sign in with Google to ask a friend': 'سجّل الدخول بحساب Google لتطلب من صديق',
  'Sign in with Google to relight a flame': 'سجّل الدخول بحساب Google لتعيد إشعال الشعلة',
  'Sign in with Google to send a gift': 'سجّل الدخول بحساب Google لترسل هدية',
  'Sign in to send a gift': 'سجّل الدخول لترسل هدية',
  'Sign in to use circles': 'سجّل الدخول لتستخدم الحلقات',
  'Sign in to add to the wall': 'سجّل الدخول لتضيف إلى الجدار',
  'Sign-in is not set up yet': 'تسجيل الدخول غير متاح بعد',
  'Google did not return a sign-in token': 'لم يُكمل Google تسجيل الدخول، حاول مرة أخرى',
  'Bad install id': 'تعذّر التعرّف على هذا الجهاز، أعد فتح التطبيق',
  'Too many synced items for this account': 'في هذا الحساب عناصر محفوظة أكثر من الحد المسموح',

  // ranks, boards, challenges, characters
  'A name is needed': 'اكتب اسمًا أولًا',
  'A title is needed': 'اكتب عنوانًا أولًا',
  'Not won yet': 'لم تفز بهذا بعد',
  'Not playing yet': 'لم تبدأ المنافسة بعد',
  'Read or listen once to join the ranks first': 'اقرأ أو استمع مرة واحدة لتنضم إلى الترتيب',
  'Not on this board': 'لست في هذه اللوحة',
  'You can be on 20 boards': 'يمكنك أن تكون في 20 لوحة على الأكثر',
  'You can make 10 boards': 'يمكنك إنشاء 10 لوحات على الأكثر',
  'This board is full (50 people)': 'هذه اللوحة ممتلئة (50 شخصًا)',
  'Only the board': 'هذا لصاحب اللوحة فقط',
  'No such character': 'هذه الشخصية غير موجودة',
  'No such avatar or frame': 'هذه الصورة أو الإطار غير موجود',
  'No such avatar': 'هذه الصورة غير موجودة',
  'No such room': 'هذه الغرفة غير موجودة',
  'No such measure': 'هذا المقياس غير موجود',
  'You have 10 challenges going': 'لديك 10 تحديات جارية بالفعل',
  'You can start 3 challenges a week': 'يمكنك بدء 3 تحديات في الأسبوع',
  'You can send 5 gestures a day': 'يمكنك إرسال 5 تحيات في اليوم',
  'Gestures are for a running challenge': 'التحيات تُرسل في تحدٍّ جارٍ فقط',
  'Unknown gesture': 'تحية غير معروفة',
  'This challenge is not yours': 'هذا التحدي ليس لك',
  'This challenge is not valid': 'رابط التحدي غير صالح',
  'This challenge has ended': 'انتهى هذا التحدي',
  'Someone took this challenge already': 'قبل شخص آخر هذا التحدي',
  'Send this link to a friend': 'أرسل هذا الرابط إلى صديق',
  'Not a goal': 'هذا ليس هدفًا',

  // pacts, relight, streaks
  'You are in 3 pacts already': 'أنت في 3 عهود بالفعل',
  'This pact is not valid': 'هذا العهد غير صالح',
  'This pact is full': 'هذا العهد مكتمل',
  'This pact has started without you': 'بدأ هذا العهد من دونك',
  'You can ask for a relight 3 times a week': 'يمكنك طلب إعادة الإشعال 3 مرات في الأسبوع',
  'This flame can no longer be relit': 'لم يعد بالإمكان إعادة إشعال هذه الشعلة',
  'Someone already relit this flame': 'أعاد صديق إشعال هذه الشعلة بالفعل',
  'A friend has to relight it, not you': 'يعيد إشعالها صديق لك، لا أنت',
  'A friend can relight a flame that went out up to 3 days ago': 'يستطيع الصديق إعادة إشعال شعلة انطفأت خلال آخر 3 أيام فقط',
  'That is a lot of relights for one day — please try again tomorrow': 'هذا كثير من إعادة الإشعال في يوم واحد، حاول غدًا',
  'Not a streak': 'لا توجد سلسلة أيام هنا',
  'Not a missed day': 'هذا ليس يومًا فائتًا',
  'This link is not valid': 'هذا الرابط غير صالح',

  // circles and family
  'You can be in up to 20 circles': 'يمكنك أن تكون في 20 حلقة على الأكثر',
  'You can have up to 10 circles': 'يمكنك إنشاء 10 حلقات على الأكثر',
  'This circle is full (60 members)': 'هذه الحلقة ممتلئة (60 عضوًا)',
  'Not in this circle': 'لست في هذه الحلقة',
  'Not in this family circle': 'لست في حلقة العائلة هذه',
  'Only the owner can change the circle': 'صاحب الحلقة وحده يستطيع تعديلها',
  'Only the owner can delete the circle': 'صاحب الحلقة وحده يستطيع حذفها',
  'Only the owner can start a new round, after the Khatm': 'صاحب الحلقة وحده يبدأ جولة جديدة بعد الختمة',
  'Only the parent who added this child (or the circle owner) can do this': 'يستطيع ذلك الوالد الذي أضاف الطفل أو صاحب الحلقة فقط',
  'A family circle can have up to 8 children': 'تتسع حلقة العائلة لـ 8 أطفال على الأكثر',
  'Not one of the short surahs': 'هذه ليست من السور القصيرة',
  'This invite is not valid': 'هذه الدعوة غير صالحة',
  'This invite link is not valid any more': 'رابط الدعوة لم يعد صالحًا',
  'This round is complete': 'اكتملت هذه الجولة',
  'This is not your juz, or the round is complete': 'هذا ليس جزأك، أو أن الجولة اكتملت',
  'Someone has just taken this juz': 'أخذ شخص آخر هذا الجزء للتو',
  'Every juz is taken': 'كل الأجزاء مأخوذة',
  'Unknown state': 'حالة غير معروفة',
  'Note not found': 'لم نجد الرسالة',
  'Note too long': 'الرسالة طويلة جدًا',
  'A note is 1 to 140 characters': 'الرسالة من حرف واحد إلى 140 حرفًا',
  'Up to 3 notes a day — thank you for your kindness': 'ثلاث رسائل في اليوم على الأكثر، جزاك الله خيرًا على لطفك',

  // the lamp wall
  'Write only a first name': 'اكتب الاسم الأول فقط',
  'You have lit 3 lamps today. Try again tomorrow.': 'أضأت 3 قناديل اليوم، حاول غدًا',
  'That lamp cannot be lit': 'تعذّر إضاءة هذا القنديل',
  'You have sent 3 gifts today. Try again tomorrow.': 'أرسلت 3 هدايا اليوم، حاول غدًا',
  'You can only send gifts to friends': 'يمكنك إرسال الهدايا إلى أصدقائك فقط',
  // gifts and walls (older links)
  'Not your gift': 'هذه الهدية ليست لك',
  'The gift you are replying to is not there any more': 'الهدية التي ترد عليها لم تعد موجودة',
  'The message can be up to 140 characters': 'الرسالة 140 حرفًا على الأكثر',
  'That is a lot of gifts for one day — please try again tomorrow': 'هذا كثير من الهدايا في يوم واحد، حاول غدًا',
  'Not your wall': 'هذا الجدار ليس لك',
  'Not your entry': 'هذه المشاركة ليست لك',
  'This wall is not there any more': 'هذا الجدار لم يعد موجودًا',
  'This wall is full': 'هذا الجدار ممتلئ',
  'This wall is closed': 'هذا الجدار مغلق',
  'You can have up to 5 open walls — close one first': 'يمكنك فتح 5 جدران على الأكثر، أغلق واحدًا أولًا',
  'You can keep up to 50 walls — delete an old one first': 'يمكنك الاحتفاظ بـ 50 جدارًا على الأكثر، احذف جدارًا قديمًا أولًا',
  'That is a lot of walls for one day — please try again tomorrow': 'هذا كثير من الجدران في يوم واحد، حاول غدًا',
  'The dua can be up to 140 characters': 'الدعاء 140 حرفًا على الأكثر',
  'Unknown occasion': 'مناسبة غير معروفة',
  'Choose one to three ayat': 'اختر من آية إلى ثلاث آيات',

  // checks shared by many functions
  'Unknown reciter': 'قارئ غير معروف',
  'Not a valid look': 'هذا المظهر غير صالح',
  'Not a valid selection': 'هذا الاختيار غير صالح',
  'Not a valid selection of ayat': 'هذا الاختيار من الآيات غير صالح',
  'Unknown kind': 'نوع غير معروف',
  'Bad context': 'تعذّر إرسال ذلك، حاول مرة أخرى',
  'bad words': 'تعذّر إرسال ذلك، حاول مرة أخرى',
  'bad target': 'تعذّر إرسال ذلك، حاول مرة أخرى',
  'no such clip': 'هذا المقطع غير موجود',
  'Teachers only': 'هذا للمعلّمين فقط',
  'That is enough clips for today, thank you': 'يكفي هذا من المقاطع اليوم، جزاك الله خيرًا',
  'Too many reports today': 'أرسلت بلاغات كثيرة اليوم، حاول غدًا',
  'Not a day that can be reported': 'لا يمكن الإبلاغ عن هذا اليوم',

  // listening, reels and media
  'Could not play the recitation': 'تعذّر تشغيل التلاوة',
  'Listening needs an internet connection': 'الاستماع يحتاج إلى اتصال بالإنترنت',
  'No timings for this surah': 'لا توجد توقيتات لهذه السورة',
  'No recording for this surah': 'لا يوجد تسجيل لهذه السورة',
  'A reel uses ayat from one surah': 'المقطع يضم آيات من سورة واحدة',
  'Recitation audio does not cover the selected ayat': 'تسجيل التلاوة لا يشمل كل الآيات المختارة',
  'This device cannot decode the background video': 'هذا الجهاز لا يستطيع تشغيل فيديو الخلفية',
  'This image could not be opened': 'تعذّر فتح هذه الصورة',
  'This file has no video this app can read': 'هذا الملف لا يحتوي على فيديو يستطيع التطبيق قراءته',
  'This device cannot play this video format': 'هذا الجهاز لا يشغّل صيغة الفيديو هذه',
  'This video has no frames': 'هذا الفيديو فارغ',
  'Too many searches — try again in a minute': 'بحثت كثيرًا، حاول بعد دقيقة',
  'Too many downloads — try again in a minute': 'نزّلت كثيرًا، حاول بعد دقيقة',
  'This link has expired — search again later': 'انتهت صلاحية هذا الرابط، ابحث مرة أخرى لاحقًا',
  'The free library is resting for a while — your own photos and the built-in scenes still work': 'المكتبة المجانية متوقفة قليلًا، وصورك والمشاهد الجاهزة تعمل كالمعتاد',
  'Search failed': 'تعذّر البحث، حاول مرة أخرى',
  'Could not load the tafsir': 'تعذّر تحميل التفسير',
  'Mushaf data is out of date — please reload the page': 'بيانات المصحف قديمة، أعد تحميل الصفحة',
  'paused': 'متوقف مؤقتًا',

  // the network itself
  'Failed to fetch': 'لا يوجد اتصال بالإنترنت',
  'Load failed': 'لا يوجد اتصال بالإنترنت',
  'NetworkError when attempting to fetch resource.': 'لا يوجد اتصال بالإنترنت',
  'Network request failed': 'لا يوجد اتصال بالإنترنت',
  'TypeError: Failed to fetch': 'لا يوجد اتصال بالإنترنت',
};

// Messages with a part that changes (a number, a name, a status).
const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Could not play the recitation: /, () => 'تعذّر تشغيل التلاوة'],
  [/^No verified recording of surah (\d+) for (.+)$/, (m) => `لا يوجد تسجيل موثّق للسورة ${m[1]} بصوت ${m[2]}`],
  [/^The recording of surah (\d+) changed since it was checked$/, (m) => `تغيّر تسجيل السورة ${m[1]} بعد مراجعته`],
  [/^Could not download (?:the )?recitation(?: audio)? \(HTTP \d+\)$/, () => 'تعذّر تنزيل التلاوة'],
  [/^Could not load .*\(HTTP \d+\)$/, () => 'تعذّر التحميل، تحقق من الاتصال بالإنترنت'],
  [/^Videos up to (\d+) MB, please$/, (m) => `الفيديو ${m[1]} ميغابايت على الأكثر`],
  [/^(.+): not an image or a video$/, (m) => `${m[1]}: ليس صورة ولا فيديو`],
  [/^Search failed \(\d+\)$/, () => 'تعذّر البحث، حاول مرة أخرى'],
  [/^Download failed \(\d+\)$/, () => 'تعذّر التنزيل، حاول مرة أخرى'],
  [/^(Pixabay|Pexels) is busy/, (m) => `${m[1]} مشغول الآن، جرّب مجموعة أو المكتبة الأخرى أو أعد المحاولة بعد قليل`],
  [/^(Pixabay|Pexels) is not set up$/, (m) => `${m[1]} غير متاح بعد`],
  [/^(?:The library|Pixabay|Pexels) answered \d+$/, () => 'المكتبة لا تستجيب الآن، حاول بعد قليل'],
  [/^Up to (\d+) scenes$/, (m) => `${m[1]} مشهدًا على الأكثر`],
  [/^Up to (\d+) downloads at a time/, (m) => `${m[1]} تنزيلات في وقت واحد على الأكثر، انتظر حتى ينتهي أحدها`],
  [/^HTTP \d+$/, () => 'تعذّر التحميل، تحقق من الاتصال بالإنترنت'],
  [/JWT expired|Invalid Refresh Token|refresh_token/i, () => 'انتهت جلسة الدخول، سجّل الدخول مرة أخرى'],
  [/rate limit|too many requests/i, () => 'طلبات كثيرة، حاول بعد قليل'],
  [/fetch|network|timeout|timed out/i, () => 'لا يوجد اتصال بالإنترنت، حاول مرة أخرى'],
];

/** The Arabic for an English message we know, else null. */
export function arMessage(msg: string): string | null {
  const s = msg.trim();
  if (exact[s]) return exact[s];
  for (const [re, f] of patterns) {
    const m = s.match(re);
    if (m) return f(m);
  }
  return null;
}

/** Said when a message from outside the app could not be put into Arabic. */
export const AR_GENERIC = 'تعذّر إتمام ذلك الآن، حاول مرة أخرى';
