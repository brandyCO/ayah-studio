// Reciters with full-surah recordings and word timings on Quran.com (QDC audio API, ids below).
// Minshawi "Kids repeat" (168) is left out: its segments are unreliable. Each reciter also names
// an everyayah.com folder: per-ayah files without word timings, used when QDC fails (Ayah mode only).
// cdn.islamic.network sends no CORS headers, so it is not usable from the browser.
// Reciters marked `qdc: false` are popular on short video but have no word timings anywhere we can
// verify: their reels use everyayah only, so only Ayah mode is offered for them (rule 8). Their ids
// (1001+) are ours, not QDC's; they never reach the mushaf player or the Kids space (those need timings).
// Reciters with `mp3quran` play slices of mp3quran.net full-surah recordings, cut at the pauses that
// `scripts/verify-mp3quran.py` measured (public/data/mp3quran/{read}.json), only for the surahs whose
// ayah times it verified against the audio (Ayah mode only).

export interface Reciter {
  id: number; // QDC recitation id
  name: string; // shown in the on-screen credit
  short: string; // compact label (selection bar)
  style?: string; // Muallim / Mujawwad: part of the credit
  note?: string; // picker only
  everyayah?: string;
  qdc?: false; // no QDC recording or word timings: Ayah mode only
  /** mp3quran.net recitation (read id) and the surahs whose ayah times passed
   *  `scripts/verify-mp3quran.py` ("1-3,5"); only those surahs are offered. Ayah mode only. */
  mp3quran?: { read: number; surahs: string };
}

export const RECITERS: Reciter[] = [
  { id: 7, name: 'Mishary Rashid Alafasy', short: 'Alafasy', everyayah: 'Alafasy_128kbps' },
  { id: 173, name: 'Mishary Rashid Alafasy', short: 'Alafasy (2)', note: 'second recording', everyayah: 'Alafasy_128kbps' },
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
  { id: 1001, name: 'Maher Al-Muaiqly', short: 'Muaiqly', everyayah: 'MaherAlMuaiqly128kbps', qdc: false },
  { id: 1002, name: 'Nasser Al-Qatami', short: 'Qatami', everyayah: 'Nasser_Alqatami_128kbps', qdc: false },
  { id: 1003, name: "Sa'd Al-Ghamdi", short: 'Ghamdi', everyayah: 'Ghamadi_40kbps', qdc: false },
  { id: 1004, name: 'Ahmed Al-Ajamy', short: 'Ajamy', everyayah: 'ahmed_ibn_ali_al_ajamy_128kbps', qdc: false },
  { id: 1005, name: 'Fares Abbad', short: 'Abbad', everyayah: 'Fares_Abbad_64kbps', qdc: false },
  { id: 1006, name: 'Abdullah Al-Juhany', short: 'Juhany', everyayah: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps', qdc: false },
  // 2026-10-13: Hafs reciters on everyayah at >= 64 kbps with every surah's first and last ayah present
  // (checked). Warsh folders are left out: the bundled text is Hafs (rule 1).
  { id: 1007, name: 'Ali Al-Hudhaify', short: 'Hudhaify', everyayah: 'Hudhaify_128kbps', qdc: false },
  { id: 1008, name: 'Muhammad Ayyoub', short: 'Ayyoub', everyayah: 'Muhammad_Ayyoub_128kbps', qdc: false },
  { id: 1009, name: 'Muhammad Jibreel', short: 'Jibreel', everyayah: 'Muhammad_Jibreel_128kbps', qdc: false },
  { id: 1010, name: 'Salah Al-Budair', short: 'Budair', everyayah: 'Salah_Al_Budair_128kbps', qdc: false },
  { id: 1011, name: 'Khalid Al-Qahtani', short: 'Qahtani', everyayah: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps', qdc: false },
  { id: 1012, name: 'Salah Bukhatir', short: 'Bukhatir', everyayah: 'Salaah_AbdulRahman_Bukhatir_128kbps', qdc: false },
  { id: 1013, name: 'Abdullah Basfar', short: 'Basfar', everyayah: 'Abdullah_Basfar_192kbps', qdc: false },
  { id: 1014, name: 'Abdullah Al-Matroud', short: 'Matroud', everyayah: 'Abdullah_Matroud_128kbps', qdc: false },
  { id: 1015, name: 'Yaser Salamah', short: 'Salamah', everyayah: 'Yaser_Salamah_128kbps', qdc: false },
  { id: 1016, name: 'Mahmoud Khalil Al-Husary', short: 'Husary (Mujawwad)', style: 'Mujawwad', everyayah: 'Husary_128kbps_Mujawwad', qdc: false },
  { id: 1017, name: 'Mohamed Siddiq al-Minshawi', short: 'Minshawi (Mujawwad)', style: 'Mujawwad', everyayah: 'Minshawy_Mujawwad_192kbps', qdc: false },
  { id: 1018, name: 'Mohammad Al-Tablawi', short: 'Tablawi', everyayah: 'Mohammad_al_Tablaway_128kbps', qdc: false },
  { id: 1019, name: 'Ali Jaber', short: 'Ali Jaber', everyayah: 'Ali_Jaber_64kbps', qdc: false },
  { id: 1020, name: 'Muhsin Al-Qasim', short: 'Al-Qasim', everyayah: 'Muhsin_Al_Qasim_192kbps', qdc: false },
  { id: 1021, name: 'Ahmed Neana', short: 'Neana', everyayah: 'Ahmed_Neana_128kbps', qdc: false },
  { id: 1022, name: 'Akram Al-Alaqimy', short: 'Alaqimy', everyayah: 'Akram_AlAlaqimy_128kbps', qdc: false },
  { id: 1023, name: 'Ayman Sowaid', short: 'Sowaid', everyayah: 'Ayman_Sowaid_64kbps', qdc: false },
  { id: 1024, name: 'Aziz Alili', short: 'Alili', everyayah: 'aziz_alili_128kbps', qdc: false },
  { id: 1025, name: 'Sahl Yassin', short: 'Sahl Yassin', everyayah: 'Sahl_Yassin_128kbps', qdc: false },
  { id: 1026, name: 'Muhammad AbdulKareem', short: 'AbdulKareem', everyayah: 'Muhammad_AbdulKareem_128kbps', qdc: false },
  // mp3quran.net, verified surahs only (scripts/verify-mp3quran.py).
  { id: 1027, name: 'Ahmad Al-Nufais', short: 'Nufais', qdc: false, mp3quran: { read: 259, surahs: '3-6,8-13,18-19,22,24,26,28-33,35-36,38-44,46-51,54,56-67,72,74-86,88,90-91,93-114' } },
  { id: 1028, name: 'Idrees Abkar', short: 'Abkar', qdc: false, mp3quran: { read: 12, surahs: '1-2,12-14,22,27-31,34,39,41,45,47,51-52,54,56-64,66-67,78-102,104,109-111,114' } },
  { id: 1029, name: 'Raad Al-Kurdi', short: 'Al-Kurdi', qdc: false, mp3quran: { read: 221, surahs: '1-3,6,9,12-14,21-22,25,28-36,38-39,41,43,45-52,54,57-70,72,74,76,83-84,94,98-99,101,104-106,108-111,113' } },
  { id: 1030, name: 'Khalid Al-Jaleel', short: 'Al-Jaleel', qdc: false, mp3quran: { read: 20, surahs: '2,11,13,24,27,29,34,36-41,54-55,59,61-67,69,71-74,77-78,81,83-84,86,88-90,92-99,102-108,110-112,114' } },
  { id: 1031, name: 'Bandar Baleela', short: 'Baleela', qdc: false, mp3quran: { read: 217, surahs: '2-30,32-41,43-55,57-68,71,74-75,77-80,82-100,102-106,108-114' } },
  { id: 1032, name: 'Haitham Al-Dukhain', short: 'Al-Dukhain', qdc: false, mp3quran: { read: 273, surahs: '1-39,41-86,88-90,93-114' } },
  { id: 1033, name: 'Wadee Al-Yamani', short: 'Al-Yamani', qdc: false, mp3quran: { read: 219, surahs: '2-18,20-24,26-69,71-75,77-78,81,83,85-86,88-90,93-95,97-99,101-102,104-106,109,111-112,114' } },
  { id: 1034, name: 'Mansour Al-Salimi', short: 'Al-Salimi', qdc: false, mp3quran: { read: 245, surahs: '1-90,93-112,114' } },
  { id: 1035, name: 'Abdulrahman Al-Majed', short: 'Al-Majed', qdc: false, mp3quran: { read: 236, surahs: '2-52,54-68,70-95,97-112,114' } },
  { id: 1036, name: 'Ibrahim Al-Asiri', short: 'Al-Asiri', qdc: false, mp3quran: { read: 3, surahs: '2-3,5-6,8,12,16,21-22,24,26-32,34-35,37,39,41-42,44,47,67,87-88,93-94,98,103,110' } },
];

/** Reciters with QDC full-surah audio and word timings (the mushaf player, the Kids space). */
export const TIMED_RECITERS = RECITERS.filter((r) => r.qdc !== false);

export const DEFAULT_RECITER = 7;

const coverage = new Map<string, Set<number>>();
/** Whether the reciter has a usable recording of this surah (only mp3quran ones may not). */
export function covers(r: Reciter, surah: number): boolean {
  if (!r.mp3quran) return true;
  const key = r.mp3quran.surahs;
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

export const reciterPickerLabel = (r: Reciter) => [reciterCredit(r), r.note].filter(Boolean).join(' · ');

const pad3 = (n: number) => String(n).padStart(3, '0');

export const everyayahUrl = (r: Reciter, surah: number, ayah: number) =>
  `https://everyayah.com/data/${r.everyayah}/${pad3(surah)}${pad3(ayah)}.mp3`;
