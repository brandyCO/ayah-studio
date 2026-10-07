// Per-ayah recitation audio. everyayah.com is the primary host because it serves CORS headers
// (needed to decode the audio in the browser); cdn.islamic.network does not send them, so it is
// only tried as a fallback.

export interface Reciter {
  id: string;
  name: string; // shown in the on-screen credit
  everyayah: string;
  islamicNetwork: string;
}

export const RECITERS: Reciter[] = [
  { id: 'alafasy', name: 'Mishary Rashid Alafasy', everyayah: 'Alafasy_128kbps', islamicNetwork: 'ar.alafasy' },
  { id: 'sudais', name: 'Abdul Rahman Al-Sudais', everyayah: 'Abdurrahmaan_As-Sudais_192kbps', islamicNetwork: 'ar.abdurrahmaansudais' },
  { id: 'husary', name: 'Mahmoud Khalil Al-Husary', everyayah: 'Husary_128kbps', islamicNetwork: 'ar.husary' },
];

export const reciterById = (id: string) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];

const pad3 = (n: number) => String(n).padStart(3, '0');

export function audioUrls(r: Reciter, surah: number, ayah: number, globalAyah: number): string[] {
  return [
    `https://everyayah.com/data/${r.everyayah}/${pad3(surah)}${pad3(ayah)}.mp3`,
    `https://cdn.islamic.network/quran/audio/128/${r.islamicNetwork}/${globalAyah}.mp3`,
  ];
}
