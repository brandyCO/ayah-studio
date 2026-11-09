// Reciters with full-surah recordings and word timings on Quran.com (QDC audio API, ids below).
// Minshawi "Kids repeat" (168) is left out: its segments are unreliable. Each reciter also names
// an everyayah.com folder: per-ayah files without word timings, used when QDC fails (Ayah mode only).
// cdn.islamic.network sends no CORS headers, so it is not usable from the browser.
// Reciters marked `qdc: false` are popular on short video but have no word timings anywhere we can
// verify: their reels use everyayah only, so only Ayah mode is offered for them (rule 8). Their ids
// (1001+) are ours, not QDC's. The mushaf player plays every reciter (src/ui/player.ts); the Kids space
// keeps to TIMED_RECITERS (it needs Quran.com's timings).
// Reciters with `mp3quran` play slices of mp3quran.net full-surah recordings, cut at the pauses that
// `scripts/verify-mp3quran.py` measured (public/data/mp3quran/{read}.json), only for the surahs whose
// ayah times it verified against the audio (Ayah mode only). A recording with no ayah times at all (or
// a surah whose times were wrong) can get them from `scripts/make-mp3quran-timings.py`: forced alignment
// of the audio with our own text, then the same pause and pace checks (its file is named, not numbered).

export interface Reciter {
  id: number; // QDC recitation id
  name: string; // shown in the on-screen credit
  short: string; // compact label (selection bar)
  style?: string; // Muallim / Mujawwad: part of the credit
  /** Picker label of this recording among the reciter's others (same `name`); default: the style, else Murattal. */
  recording?: string;
  note?: string; // picker only
  everyayah?: string;
  qdc?: false; // no QDC recording or word timings: Ayah mode only
  /** mp3quran.net recitation (read id, or the name of an aligned recording) and the surahs whose ayah
   *  times passed the checks ("1-3,5"); only those surahs are offered. Ayah mode only. */
  mp3quran?: { read: number | string; surahs: string };
  /** Surahs ("1-3,5") with word times made by alignment and checked (scripts/make-word-timings.py), in
   *  public/data/words/{wordsKey(r)}/{SSS}.json; ayat that passed the checks only. */
  words?: string;
}

export const RECITERS: Reciter[] = [
  { id: 7, name: 'Mishary Rashid Alafasy', short: 'Alafasy', everyayah: 'Alafasy_128kbps' },
  { id: 173, name: 'Mishary Rashid Alafasy', short: 'Alafasy (2)', note: 'second recording', recording: 'Murattal 2', everyayah: 'Alafasy_128kbps' },
  { id: 3, name: 'Abdur-Rahman as-Sudais', short: 'Sudais', everyayah: 'Abdurrahmaan_As-Sudais_192kbps' },
  { id: 10, name: "Sa'ud ash-Shuraim", short: 'Shuraim', everyayah: 'Saood_ash-Shuraym_128kbps' },
  { id: 6, name: 'Mahmoud Khalil Al-Husary', short: 'Husary', everyayah: 'Husary_128kbps' },
  { id: 12, name: 'Mahmoud Khalil Al-Husary', short: 'Husary (Muallim)', style: 'Muallim', everyayah: 'Husary_Muallim_128kbps' },
  { id: 2, name: 'AbdulBaset AbdulSamad', short: 'AbdulBaset', everyayah: 'Abdul_Basit_Murattal_192kbps' },
  { id: 1, name: 'AbdulBaset AbdulSamad', short: 'AbdulBaset (Mujawwad)', style: 'Mujawwad', everyayah: 'Abdul_Basit_Mujawwad_128kbps' },
  { id: 9, name: 'Mohamed Siddiq al-Minshawi', short: 'Minshawi', everyayah: 'Minshawy_Murattal_128kbps' },
  { id: 4, name: 'Abu Bakr al-Shatri', short: 'Shatri', everyayah: 'Abu_Bakr_Ash-Shaatree_128kbps' },
  { id: 5, name: 'Hani ar-Rifai', short: 'Rifai', everyayah: 'Hani_Rifai_192kbps' },
  { id: 97, name: 'Yasser Ad-Dossari', short: 'Dossari', everyayah: 'Yasser_Ad-Dussary_128kbps' },
  { id: 161, name: 'Khalifa Al-Tunaiji', short: 'Tunaiji', everyayah: 'khalefa_al_tunaiji_64kbps' },
  { id: 1001, name: 'Maher Al-Muaiqly', short: 'Muaiqly', everyayah: 'MaherAlMuaiqly128kbps', qdc: false, words: '1-114' },
  { id: 1002, name: 'Nasser Al-Qatami', short: 'Qatami', everyayah: 'Nasser_Alqatami_128kbps', qdc: false, words: '1-114' },
  { id: 1003, name: "Sa'd Al-Ghamdi", short: 'Ghamdi', everyayah: 'Ghamadi_40kbps', qdc: false, words: '1-114' },
  { id: 1004, name: 'Ahmed Al-Ajamy', short: 'Ajamy', everyayah: 'ahmed_ibn_ali_al_ajamy_128kbps', qdc: false, words: '1-114' },
  { id: 1005, name: 'Fares Abbad', short: 'Abbad', everyayah: 'Fares_Abbad_64kbps', qdc: false, words: '1-114' },
  { id: 1006, name: 'Abdullah Al-Juhany', short: 'Juhany', everyayah: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps', qdc: false },
  // 2026-10-13: Hafs reciters on everyayah at >= 64 kbps with every surah's first and last ayah present
  // (checked). Warsh folders are left out: the bundled text is Hafs (rule 1).
  { id: 1007, name: 'Ali Al-Hudhaify', short: 'Hudhaify', everyayah: 'Hudhaify_128kbps', qdc: false, words: '1-114' },
  { id: 1008, name: 'Muhammad Ayyoub', short: 'Ayyoub', everyayah: 'Muhammad_Ayyoub_128kbps', qdc: false, words: '1-114' },
  { id: 1009, name: 'Muhammad Jibreel', short: 'Jibreel', everyayah: 'Muhammad_Jibreel_128kbps', qdc: false, words: '1-114' },
  { id: 1010, name: 'Salah Al-Budair', short: 'Budair', everyayah: 'Salah_Al_Budair_128kbps', qdc: false, words: '1-114' },
  { id: 1011, name: 'Khalid Al-Qahtani', short: 'Qahtani', everyayah: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps', qdc: false, words: '1-114' },
  { id: 1012, name: 'Salah Bukhatir', short: 'Bukhatir', everyayah: 'Salaah_AbdulRahman_Bukhatir_128kbps', qdc: false, words: '1-114' },
  { id: 1013, name: 'Abdullah Basfar', short: 'Basfar', everyayah: 'Abdullah_Basfar_192kbps', qdc: false, words: '1-114' },
  { id: 1014, name: 'Abdullah Al-Matroud', short: 'Matroud', everyayah: 'Abdullah_Matroud_128kbps', qdc: false, words: '1-114' },
  { id: 1015, name: 'Yaser Salamah', short: 'Salamah', everyayah: 'Yaser_Salamah_128kbps', qdc: false, words: '1-114' },
  { id: 1016, name: 'Mahmoud Khalil Al-Husary', short: 'Husary (Mujawwad)', style: 'Mujawwad', everyayah: 'Husary_128kbps_Mujawwad', qdc: false, words: '1-114' },
  { id: 1017, name: 'Mohamed Siddiq al-Minshawi', short: 'Minshawi (Mujawwad)', style: 'Mujawwad', everyayah: 'Minshawy_Mujawwad_192kbps', qdc: false, words: '1-114' },
  { id: 1018, name: 'Mohammad Al-Tablawi', short: 'Tablawi', everyayah: 'Mohammad_al_Tablaway_128kbps', qdc: false, words: '1-114' },
  { id: 1019, name: 'Ali Jaber', short: 'Ali Jaber', everyayah: 'Ali_Jaber_64kbps', qdc: false, words: '1-114' },
  { id: 1020, name: 'Muhsin Al-Qasim', short: 'Al-Qasim', everyayah: 'Muhsin_Al_Qasim_192kbps', qdc: false, words: '1-114' },
  { id: 1021, name: 'Ahmed Neana', short: 'Neana', everyayah: 'Ahmed_Neana_128kbps', qdc: false, words: '1-114' },
  { id: 1022, name: 'Akram Al-Alaqimy', short: 'Alaqimy', everyayah: 'Akram_AlAlaqimy_128kbps', qdc: false, words: '1-114' },
  { id: 1023, name: 'Ayman Sowaid', short: 'Sowaid', everyayah: 'Ayman_Sowaid_64kbps', qdc: false, words: '1-6,8-114' },
  { id: 1024, name: 'Aziz Alili', short: 'Alili', everyayah: 'aziz_alili_128kbps', qdc: false, words: '1-114' },
  { id: 1025, name: 'Sahl Yassin', short: 'Sahl Yassin', everyayah: 'Sahl_Yassin_128kbps', qdc: false, words: '1-114' },
  { id: 1026, name: 'Muhammad AbdulKareem', short: 'AbdulKareem', everyayah: 'Muhammad_AbdulKareem_128kbps', qdc: false, words: '1-114' },
  // mp3quran.net, verified surahs only (scripts/verify-mp3quran.py).
  { id: 1027, name: 'Ahmad Al-Nufais', short: 'Nufais', qdc: false, mp3quran: { read: 259, surahs: '1-67,69-114' }, words: '1-67,69-114' },
  { id: 1028, name: 'Idrees Abkar', short: 'Abkar', qdc: false, mp3quran: { read: 12, surahs: '1-20,22-25,27-31,33-35,38-114' }, words: '1-20,22-25,27-31,33-35,38-114' },
  { id: 1029, name: 'Raad Al-Kurdi', short: 'Al-Kurdi', qdc: false, mp3quran: { read: 221, surahs: '1-111,113-114' }, words: '1-111,113-114' },
  { id: 1030, name: 'Khalid Al-Jaleel', short: 'Al-Jaleel', qdc: false, mp3quran: { read: 20, surahs: '1-13,16-114' }, words: '1-13,16-114' },
  { id: 1031, name: 'Bandar Baleela', short: 'Baleela', qdc: false, mp3quran: { read: 217, surahs: '1-114' }, words: '1-114' },
  { id: 1032, name: 'Haitham Al-Dukhain', short: 'Al-Dukhain', qdc: false, mp3quran: { read: 273, surahs: '1-114' }, words: '1-114' },
  { id: 1033, name: 'Wadee Al-Yamani', short: 'Al-Yamani', qdc: false, mp3quran: { read: 219, surahs: '1-114' }, words: '1-114' },
  { id: 1034, name: 'Mansour Al-Salimi', short: 'Al-Salimi', qdc: false, mp3quran: { read: 245, surahs: '1-114' }, words: '1-114' },
  { id: 1035, name: 'Abdulrahman Al-Majed', short: 'Al-Majed', qdc: false, mp3quran: { read: 236, surahs: '1-114' }, words: '1-114' },
  { id: 1036, name: 'Ibrahim Al-Asiri', short: 'Al-Asiri', qdc: false, mp3quran: { read: 3, surahs: '1-10,12-13,15-106,108-114' }, words: '1-10,12-13,15-106,108-114' },
  // mp3quran.net without ayah times: made by alignment and checked (scripts/make-mp3quran-timings.py).
  { id: 1037, name: 'Islam Sobhi', short: 'Islam Sobhi', qdc: false, mp3quran: { read: 'islam-sobhi', surahs: '1-36,38,41-44,46-64,66-114' }, words: '1-36,38,41-44,46-64,66-114' },
  // Second recordings of reciters above (owner request 2026-11-02), mp3quran.net, told apart from ours by
  // comparing their sound; shown as Recording chips under the reciter's name. Ayah times verified (Sudais,
  // Budair, Basfar, Muaiqly Mujawwad) or made by alignment (the rest); surahs filled in once checked.
  { id: 1038, name: 'Abdur-Rahman as-Sudais', short: 'Sudais (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 54, surahs: '1-85,87-90,92-103,105-114' }, words: '1-85,87-90,92-103,105-114' },
  { id: 1039, name: 'Salah Al-Budair', short: 'Budair (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 43, surahs: '1-8,11-16,18-20,22-24,26-51,55-64,66-68,70-77,82-83,85-114' }, words: '1-8,11-16,18-20,22-24,26-51,55-64,66-68,70-77,82-83,85-114' },
  { id: 1040, name: 'Abdullah Basfar', short: 'Basfar (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 60, surahs: '1-114' }, words: '1-114' },
  { id: 1041, name: 'Yaser Salamah', short: 'Salamah (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 152, surahs: '1-114' }, words: '1-114' },
  { id: 1042, name: 'Maher Al-Muaiqly', short: 'Muaiqly (Mujawwad)', style: 'Mujawwad', qdc: false, mp3quran: { read: 133, surahs: '1-114' }, words: '1-114' },
  { id: 1043, name: 'Maher Al-Muaiqly', short: 'Muaiqly (Muallim)', style: 'Muallim', qdc: false, mp3quran: { read: 103, surahs: '1,103,108,110' }, words: '1' },
  { id: 1044, name: 'Mohamed Siddiq al-Minshawi', short: 'Minshawi (Muallim)', style: 'Muallim', qdc: false, mp3quran: { read: 114, surahs: '1-2,8,10-12,19-23,38-39,41-51' }, words: '1-2,8,10-12,19-23,38-39,41-51' },
  { id: 1045, name: 'Mohammad Al-Tablawi', short: 'Tablawi (Mujawwad)', style: 'Mujawwad', qdc: false, mp3quran: { read: 10912, surahs: '1-2,8-12,19-24,38-46' }, words: '1-2,8-12,19-24,38-46' },
  { id: 1046, name: 'Muhammad Ayyoub', short: 'Ayyoub (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 320, surahs: '1-114' }, words: '1-114' },
  // Second recordings on everyayah.com (per-ayah files), told apart from ours the same way.
  { id: 1047, name: 'Ahmed Al-Ajamy', short: 'Ajamy (2)', recording: 'Murattal 2', everyayah: 'Ahmed_ibn_Ali_al-Ajamy_64kbps_QuranExplorer.Com', qdc: false, words: '1-114' },
  { id: 1048, name: 'Ahmed Al-Ajamy', short: 'Ajamy (3)', recording: 'Murattal 3', everyayah: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', qdc: false, words: '1-114' },
  { id: 1049, name: 'Ali Al-Hudhaify', short: 'Hudhaify (2)', recording: 'Murattal 2', everyayah: 'Hudhaify_32kbps', qdc: false, words: '1-114' },
  // More mp3quran.net recordings (batch 1 of scripts/new-recordings.json, owner request 2026-11-02): ayah cuts and
  // words by alignment; copies of recordings already listed were left out (same ayah lengths in Ya-Sin).
  { id: 1051, name: 'Ibrahim Al-Akhdar', short: 'Al-Akhdar', qdc: false, mp3quran: { read: 'ibrahim-akhdar', surahs: '1-114' }, words: '1-114' },
  { id: 1052, name: 'Majed Al-Enezi', short: 'Al-Enezi', qdc: false, mp3quran: { read: 'majed-anazi', surahs: '1,3-12,15-114' }, words: '1,3-12,15-114' },
  { id: 1053, name: 'Maher Al-Muaiqly', short: 'Muaiqly (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 'maher-muaiqly', surahs: '1-30,33,35-37,40-45,49-59,62-114' }, words: '1-30,33,35-37,40-45,49-59,62-114' },
  { id: 1054, name: 'Mohammed Al-Barrak', short: 'Al-Barrak', qdc: false, mp3quran: { read: 'muhammad-barrak', surahs: '1,12,14,36-37,44-45,50-57,67-114' }, words: '1,12,14,36-37,44-45,50-57,67-114' },
  { id: 1055, name: 'Mohammed Al-Luhaidan', short: 'Al-Luhaidan', qdc: false, mp3quran: { read: 'muhammad-luhaidan', surahs: '1-114' }, words: '1-114' },
  { id: 1056, name: 'Mohammed Al-Muhaisni', short: 'Al-Muhaisni', qdc: false, mp3quran: { read: 'muhammad-muhaisni', surahs: '2-29,31-64,66-70,72,74-77,79-80,82,85-86,88-89,94-95,97-98,100-114' }, words: '2-29,31-64,66-70,72,74-77,79-80,82,85-86,88-89,94-95,97-98,100-114' },
  { id: 1057, name: 'Alhusayni Al-Azazi', short: 'Al-Azazi (Muallim)', style: 'Muallim', qdc: false, mp3quran: { read: 'husayni-azazi', surahs: '58-114' }, words: '58-114' },
  { id: 1058, name: 'Mohammad Saleh Alim Shah', short: 'Alim Shah', qdc: false, mp3quran: { read: 'muhammad-shah', surahs: '1-114' }, words: '1-114' },
  { id: 1059, name: 'Mohamed Siddiq al-Minshawi', short: 'Minshawi (1967)', recording: '1967', qdc: false, mp3quran: { read: 'muhammad-minshawi-r4', surahs: '1-15,17-22,25-33,36-114' }, words: '1-15,17-22,25-33,36-114' },
  { id: 1060, name: 'Mohamed Siddiq al-Minshawi', short: 'Minshawi (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 'muhammad-minshawi', surahs: '1-114' }, words: '1-114' },
  { id: 1061, name: 'Mahmoud Khalil Al-Husary', short: 'Husary (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 'mahmoud-husary', surahs: '1-114' }, words: '1-114' },
  { id: 1062, name: 'Mahmoud Ali Al-Banna', short: 'Al-Banna (Mujawwad)', style: 'Mujawwad', qdc: false, mp3quran: { read: 'mahmoud-banna-r2', surahs: '1-54,56-114' }, words: '1-54,56-114' },
  { id: 1063, name: 'Mahmoud Ali Al-Banna', short: 'Al-Banna', qdc: false, mp3quran: { read: 'mahmoud-banna', surahs: '1-114' }, words: '1-114' },
  { id: 1064, name: 'Mishary Rashid Alafasy', short: 'Alafasy (3)', recording: 'Murattal 3', qdc: false, mp3quran: { read: 'mishary-alafasy', surahs: '1-114' }, words: '1-114' },
  { id: 1065, name: 'Mustafa Ismail', short: 'Mustafa Ismail (Mujawwad)', style: 'Mujawwad', qdc: false, mp3quran: { read: 'mustafa-ismail-r2', surahs: '1-114' }, words: '1-114' },
  { id: 1066, name: 'Mustafa Ismail', short: 'Mustafa Ismail', qdc: false, mp3quran: { read: 'mustafa-ismail', surahs: '1-114' }, words: '1-114' },
  { id: 1067, name: 'Mustafa Al-Lahoni', short: 'Al-Lahoni', qdc: false, mp3quran: { read: 'mustafa-lahouni', surahs: '2-114' }, words: '2-114' },
  { id: 1068, name: 'Mustafa Raad Al-Azzawi', short: 'Al-Azzawi', qdc: false, mp3quran: { read: 'mustafa-azzawi', surahs: '1-114' }, words: '1-114' },
  { id: 1069, name: 'Muftah Al-Saltani', short: 'Al-Saltani', qdc: false, mp3quran: { read: 'muftah-saltani-r3', surahs: '1-114' }, words: '1-114' },
  { id: 1070, name: 'Alzain Mohammad Ahmad', short: 'Alzain Ahmad', qdc: false, mp3quran: { read: 'zain-ahmad', surahs: '1-86,88-114' }, words: '1-86,88-114' },
  { id: 1071, name: 'Abdulrahman Al-Suwayid', short: 'Al-Suwayid', qdc: false, mp3quran: { read: 'abdulrahman-suwayid', surahs: '1-9,11-114' }, words: '1-9,11-114' },
  { id: 1072, name: 'Abdulelah bin Aoun', short: 'Bin Aoun', qdc: false, mp3quran: { read: 'abdulelah-aoun', surahs: '1,6,18,22-24,42,44,60,62,97,103,105-106,108,110,112' }, words: '1,6,18,22-24,42,44,60,62,97,103,105-106,108,110,112' },
  { id: 1073, name: 'Ahmad Talib bin Humaid', short: 'Bin Humaid', qdc: false, mp3quran: { read: 'ahmad-humaid', surahs: '1-8,10-13,15,18-22,25-32,34-114' }, words: '1-8,10-13,15,18-22,25-32,34-114' },
  { id: 1074, name: 'Majed Al-Zamil', short: 'Al-Zamil', qdc: false, mp3quran: { read: 'majed-zamil', surahs: '1-114' }, words: '1-114' },
  { id: 1075, name: 'Maher Shakhashiro', short: 'Shakhashiro', qdc: false, mp3quran: { read: 'maher-shakhashiro', surahs: '2-114' }, words: '2-114' },
  { id: 1076, name: 'Alashri Omran', short: 'Omran', qdc: false, mp3quran: { read: 'ashri-omran', surahs: '1,3,5,8,11-17,19-21,23-64,66-75,77-114' }, words: '1,3,5,8,11-17,19-21,23-64,66-75,77-114' },
  { id: 1077, name: 'Mohammad Al-Monshed', short: 'Al-Monshed', qdc: false, mp3quran: { read: 'muhammad-monshed', surahs: '1-77,80-88,90-99,101-114' }, words: '1-77,80-88,90-99,101-114' },
  { id: 1078, name: 'Khalid Al-Mohanna', short: 'Al-Mohanna', qdc: false, mp3quran: { read: 'khalid-mohanna', surahs: '1-114' }, words: '1-114' },
  { id: 1079, name: 'Adel Al-Kalbani', short: 'Al-Kalbani', qdc: false, mp3quran: { read: 'adel-kalbani', surahs: '1-114' }, words: '1-114' },
  { id: 1080, name: 'Mousa Bilal', short: 'Mousa Bilal', qdc: false, mp3quran: { read: 'musa-bilal', surahs: '2-114' }, words: '2-114' },
  { id: 1081, name: 'Hussain Al-Sheikh', short: 'Al-Sheikh', qdc: false, mp3quran: { read: 'hussain-sheikh', surahs: '2,8,13-14,22,32,36,38,44-45,49-50,54-55,57,62-66,72-73,75-82,85,87,89-114' }, words: '2,8,13-14,22,32,36,38,44-45,49-50,54-55,57,62-66,72-73,75-82,85,87,89-114' },
  { id: 1082, name: 'Hatem Fareed Al-Waer', short: 'Al-Waer', qdc: false, mp3quran: { read: 'hatem-waer', surahs: '1-14,16-19,21-22,24-25,27-36,38-43,45-52,54,56-69,73,77,81-82,84,86,88-89,94,97-98,100,103,105-106,108,110-111,113-114' }, words: '1-14,16-19,21-22,24-25,27-36,38-43,45-52,54,56-69,73,77,81-82,84,86,88-89,94,97-98,100,103,105-106,108,110-111,113-114' },
  { id: 1083, name: 'Ibrahim Al-Jormy', short: 'Al-Jormy', qdc: false, mp3quran: { read: 'ibrahim-jormy', surahs: '1-114' }, words: '1-114' },
  { id: 1084, name: 'Mahmoud Al-Rifai', short: 'Mahmoud Al-Rifai', qdc: false, mp3quran: { read: 'mahmoud-rifai', surahs: '1-114' }, words: '1-114' },
  { id: 1085, name: 'Nasser Al-Obaid', short: 'Al-Obaid', qdc: false, mp3quran: { read: 'nasser-obaid', surahs: '3,7,10,13-15,19,21,25-27,32,35-41,67-77,103-104,106,108,110-111,113-114' }, words: '3,7,10,13-15,19,21,25-27,32,35-41,67-77,103-104,106,108,110-111,113-114' },
  { id: 1086, name: 'Tawfeeq As-Sayegh', short: 'As-Sayegh', qdc: false, mp3quran: { read: 'tawfeeq-sayegh', surahs: '2-114' }, words: '2-114' },
  { id: 1087, name: 'Ibrahim Al-Dosari', short: 'Ibrahim Al-Dosari', qdc: false, mp3quran: { read: 'ibrahim-dosari-r2', surahs: '1-114' }, words: '1-114' },
  { id: 1088, name: 'Jamal Shaker Abdullah', short: 'Jamal Abdullah', qdc: false, mp3quran: { read: 'jamal-abdullah', surahs: '1-114' }, words: '1-114' },
  { id: 1089, name: 'Jamaan Al-Osaimi', short: 'Al-Osaimi', qdc: false, mp3quran: { read: 'jamaan-osaimi', surahs: '2-100,102-114' }, words: '2-100,102-114' },
  { id: 1090, name: 'Hamad Al-Daghriri', short: 'Al-Daghriri', qdc: false, mp3quran: { read: 'hamad-daghriri', surahs: '1-2,12-13,19,21,23,27,29,31,36,38-61,63-114' }, words: '1-2,12-13,19,21,23,27,29,31,36,38-61,63-114' },
  { id: 1091, name: 'Yousef bin Noah Ahmad', short: 'Yousef Ahmad', qdc: false, mp3quran: { read: 'yousef-ahmad', surahs: '1-114' }, words: '1-114' },
  { id: 1092, name: 'Moeedh Al-Harthi', short: 'Al-Harthi', qdc: false, mp3quran: { read: 'moeedh-harthi', surahs: '1-114' }, words: '1-114' },
  { id: 1093, name: 'Mohammad Rashad Al-Shareef', short: 'Al-Shareef', qdc: false, mp3quran: { read: 'muhammad-shareef', surahs: '1-114' }, words: '1-114' },
  { id: 1094, name: 'Ibrahim Al-Jibreen', short: 'Al-Jibreen', qdc: false, mp3quran: { read: 'ibrahim-jibreen', surahs: '1-4,6,8,12-27,30-35,38-41,44-98,100-114' }, words: '1-4,6,8,12-27,30-35,38-41,44-98,100-114' },
  { id: 1095, name: 'Ahmed Al-Trabulsi', short: 'Al-Trabulsi', qdc: false, mp3quran: { read: 'ahmad-tarabulsi-r2', surahs: '1-114' }, words: '1-114' },
  { id: 1096, name: 'Abdullah Al-Kandari', short: 'Al-Kandari', qdc: false, mp3quran: { read: 'abdullah-kandari', surahs: '1-114' }, words: '1-114' },
  { id: 1097, name: 'Ahmed Amer', short: 'Ahmed Amer', qdc: false, mp3quran: { read: 'ahmad-amer', surahs: '1-114' }, words: '1-114' },
  { id: 1098, name: 'Ibrahim Al-Saadan', short: 'Al-Saadan', qdc: false, mp3quran: { read: 'ibrahim-saadan', surahs: '1,4-9,11-12,15-16,78-114' }, words: '1,4-9,11-12,15-16,78-114' },
  { id: 1099, name: 'Ahmad Al-Hudhaifi', short: 'Ahmad Al-Hudhaifi', qdc: false, mp3quran: { read: 'ahmad-hudhaifi', surahs: '1-32,34-36,38-39,41-45,47-114' }, words: '1-32,34-36,38-39,41-45,47-114' },
  { id: 1100, name: 'Mohammed Osman Khan', short: 'Osman Khan', qdc: false, mp3quran: { read: 'muhammad-khan', surahs: '1-114' }, words: '1-114' },
  { id: 1101, name: 'Khalid Al-Qahtani', short: 'Qahtani (2)', recording: 'Murattal 2', qdc: false, mp3quran: { read: 'khalid-qahtani', surahs: '1-114' }, words: '1-114' },
  { id: 1102, name: 'Abdullah Al-Qarafi', short: 'Al-Qarafi', qdc: false, mp3quran: { read: 'abdullah-qarafi', surahs: '1-114' }, words: '1-114' },
  { id: 1103, name: 'Abdulbadi Ghailan', short: 'Ghailan', qdc: false, mp3quran: { read: 'abdulbadi-ghailan', surahs: '1-114' }, words: '1-114' },
  // archive.org upload of Yasser Az-Zailai (the owner recognised his voice, 2026-11-03; every file voice-checked,
  // scripts/voice-check.py zailai): no published times, so ayah cuts and words come from alignment.
  { id: 1050, name: 'Yasser Az-Zailai', short: 'Az-Zailai', qdc: false, mp3quran: { read: 'ia-YasserAl-Zailai', surahs: '18-19,31,35-38,42,45-46,50,52-57,59,61-64,66-70,72-79,81-82,87-88,91-92,97' }, words: '18-19,31,35-38,42,45-46,50,52-57,59,61-64,66-70,72-79,81-82,87-88,91-92,97' },
];

/** Reciters with QDC full-surah audio and word timings (the mushaf player, the Kids space). */
export const TIMED_RECITERS = RECITERS.filter((r) => r.qdc !== false);

export const DEFAULT_RECITER = 7;

const coverage = new Map<string, Set<number>>();
/** Whether the reciter has a usable recording of this surah (only mp3quran ones may not). */
export function covers(r: Reciter, surah: number): boolean {
  if (!r.mp3quran) return true;
  return inRanges(r.mp3quran.surahs, surah);
}

/** Whether this surah has checked word times made by alignment for the reciter. */
export const hasAlignedWords = (r: Reciter, surah: number) => !!r.words && inRanges(r.words, surah);

/** Folder of the reciter's aligned word times: the mp3quran recording's key, else the reciter id. */
export const wordsKey = (r: Reciter) => String(r.mp3quran ? r.mp3quran.read : r.id);

function inRanges(key: string, surah: number): boolean {
  if (!coverage.has(key)) {
    const set = new Set<number>();
    for (const part of key.split(',')) {
      const [a, b = a] = part.split('-').map(Number);
      for (let k = a; k <= b; k++) set.add(k);
    }
    coverage.set(key, set);
  }
  return coverage.get(key)!.has(surah);
}

/** The reciter for a reel of this surah: the wanted one, or the default when it has no verified recording of it. */
export const reciterFor = (id: number, surah: number) => {
  const r = RECITERS.find((x) => x.id === id);
  return r && covers(r, surah) ? r : reciterById(DEFAULT_RECITER);
};

export const reciterById = (id: number) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];
/** The reciter, or the default when it has no word timings (for features that need them). */
export const timedReciterById = (id: number) => TIMED_RECITERS.find((r) => r.id === id) ?? TIMED_RECITERS[0];

/** Credit line: the name plus the style when one reciter has several recordings. */
export const reciterCredit = (r: Reciter) => (r.style ? `${r.name} (${r.style})` : r.name);

/** Label of one recording among a reciter's recordings (entries with the same name). */
export const recordingLabel = (r: Reciter) => r.recording ?? r.style ?? 'Murattal';

/** The list as one entry per reciter, each with its recordings, in the order they first appear. */
export function groupRecordings(list: Reciter[]): Reciter[][] {
  const by = new Map<string, Reciter[]>();
  for (const r of list) {
    const g = by.get(r.name);
    if (g) g.push(r);
    else by.set(r.name, [r]);
  }
  return [...by.values()];
}

export const reciterPickerLabel = (r: Reciter) => [reciterCredit(r), r.note].filter(Boolean).join(' · ');

const pad3 = (n: number) => String(n).padStart(3, '0');

export const everyayahUrl = (r: Reciter, surah: number, ayah: number) =>
  `https://everyayah.com/data/${r.everyayah}/${pad3(surah)}${pad3(ayah)}.mp3`;
