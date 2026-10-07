// Project state: plain, serializable JSON. Everything the renderer needs besides decoded media.

export type TextEffect = 'fade' | 'rise';

export interface Project {
  version: 1;
  surah: number;
  from: number; // first ayah (inclusive)
  to: number; // last ayah (inclusive)
  reciterId: string;
  showTranslation: boolean;
  backgroundId: string;
  textEffect: TextEffect;
  watermark: boolean;
}

export const MAX_AYAT = 10;

export function newProject(surah: number, from: number, to: number): Project {
  return {
    version: 1,
    surah,
    from,
    to,
    reciterId: 'alafasy',
    showTranslation: true,
    backgroundId: 'mist',
    textEffect: 'rise',
    watermark: true,
  };
}
