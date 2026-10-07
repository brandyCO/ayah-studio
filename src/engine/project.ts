// Project state: plain, serializable JSON. Everything the renderer needs besides decoded media.

export type TextEffect = 'fade' | 'rise';
/** Ayah: whole ayah · Line: one screen line · Half: half a line · Words: 1–3 words per step. */
export type TextMode = 'ayah' | 'line' | 'half' | 'words';

export interface Project {
  version: 1;
  surah: number;
  from: number; // first ayah (inclusive)
  to: number; // last ayah (inclusive)
  reciterId: number; // QDC recitation id (src/data/reciters.ts)
  textMode: TextMode;
  wordsPerStep: 1 | 2 | 3;
  showTranslation: boolean;
  backgroundId: string;
  textEffect: TextEffect;
  watermark: boolean;
}

export const MAX_AYAT = 10;

export function newProject(surah: number, from: number, to: number, reciterId: number): Project {
  return {
    version: 1,
    surah,
    from,
    to,
    reciterId,
    textMode: 'line',
    wordsPerStep: 2,
    showTranslation: true,
    backgroundId: 'mist',
    textEffect: 'rise',
    watermark: true,
  };
}
