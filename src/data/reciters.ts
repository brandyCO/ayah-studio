// Reciters with full-surah recordings and word timings on Quran.com (QDC audio API, ids below).
// Minshawi "Kids repeat" (168) is left out: its segments are unreliable. Each reciter also names
// an everyayah.com folder: per-ayah files without word timings, used when QDC fails (Ayah mode only).
// cdn.islamic.network sends no CORS headers, so it is not usable from the browser.

export interface Reciter {
  id: number; // QDC recitation id
  name: string; // shown in the on-screen credit
  short: string; // compact label (selection bar)
  style?: string; // Muallim / Mujawwad: part of the credit
  note?: string; // picker only
  everyayah: string;
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
];

export const DEFAULT_RECITER = 7;

export const reciterById = (id: number) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];

/** Credit line: the name plus the style when one reciter has several recordings. */
export const reciterCredit = (r: Reciter) => (r.style ? `${r.name} (${r.style})` : r.name);

export const reciterPickerLabel = (r: Reciter) => [reciterCredit(r), r.note].filter(Boolean).join(' · ');

const pad3 = (n: number) => String(n).padStart(3, '0');

export const everyayahUrl = (r: Reciter, surah: number, ayah: number) =>
  `https://everyayah.com/data/${r.everyayah}/${pad3(surah)}${pad3(ayah)}.mp3`;
