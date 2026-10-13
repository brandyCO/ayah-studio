// Reciters with full-surah recordings and word timings on Quran.com (QDC audio API, ids below).
// Minshawi "Kids repeat" (168) is left out: its segments are unreliable. Each reciter also names
// an everyayah.com folder: per-ayah files without word timings, used when QDC fails (Ayah mode only).
// cdn.islamic.network sends no CORS headers, so it is not usable from the browser.
// Reciters marked `qdc: false` are popular on short video but have no word timings anywhere we can
// verify: their reels use everyayah only, so only Ayah mode is offered for them (rule 8). Their ids
// (1001+) are ours, not QDC's; they never reach the mushaf player or the Kids space (those need timings).

export interface Reciter {
  id: number; // QDC recitation id
  name: string; // shown in the on-screen credit
  short: string; // compact label (selection bar)
  style?: string; // Muallim / Mujawwad: part of the credit
  note?: string; // picker only
  everyayah: string;
  qdc?: false; // no QDC recording or word timings: Ayah mode only
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
];

/** Reciters with QDC full-surah audio and word timings (the mushaf player, the Kids space). */
export const TIMED_RECITERS = RECITERS.filter((r) => r.qdc !== false);

export const DEFAULT_RECITER = 7;

export const reciterById = (id: number) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];
/** The reciter, or the default when it has no word timings (for features that need them). */
export const timedReciterById = (id: number) => TIMED_RECITERS.find((r) => r.id === id) ?? TIMED_RECITERS[0];

/** Credit line: the name plus the style when one reciter has several recordings. */
export const reciterCredit = (r: Reciter) => (r.style ? `${r.name} (${r.style})` : r.name);

export const reciterPickerLabel = (r: Reciter) => [reciterCredit(r), r.note].filter(Boolean).join(' · ');

const pad3 = (n: number) => String(n).padStart(3, '0');

export const everyayahUrl = (r: Reciter, surah: number, ayah: number) =>
  `https://everyayah.com/data/${r.everyayah}/${pad3(surah)}${pad3(ayah)}.mp3`;
