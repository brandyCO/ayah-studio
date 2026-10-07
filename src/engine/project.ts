// Project state: plain, serializable JSON. Everything the renderer needs besides decoded media.
import type { FrameStyle, TitlePos, TitleSize } from './layout';

export type TextEffect = 'fade' | 'rise';
/** Ayah: whole ayah · Line: one screen line · Half: half a line · Words: 1–3 words per step. */
export type TextMode = 'ayah' | 'line' | 'half' | 'words';
/** words: English meanings of exactly the Arabic words on screen · ayah: the whole ayah (Sahih International). */
export type TranslationMode = 'words' | 'ayah';

export interface Project {
  version: 1;
  surah: number;
  from: number; // first ayah (inclusive)
  to: number; // last ayah (inclusive)
  reciterId: number; // QDC recitation id (src/data/reciters.ts)
  textMode: TextMode;
  wordsPerStep: 1 | 2 | 3;
  showTranslation: boolean;
  translationMode: TranslationMode;
  titlePos: TitlePos;
  titleSize: TitleSize;
  backgroundId: string;
  textEffect: TextEffect;
  credit: boolean; // "Recited by …" (optional, off by default: owner decision)
  watermark: boolean;
}

export const frameStyle = (p: Project): FrameStyle => ({
  translation: p.showTranslation,
  titlePos: p.titlePos,
  titleSize: p.titleSize,
  credit: p.credit,
  watermark: p.watermark,
});

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
    translationMode: 'words',
    titlePos: 'top',
    titleSize: 'm',
    backgroundId: 'mist',
    textEffect: 'rise',
    credit: false,
    watermark: true,
  };
}
