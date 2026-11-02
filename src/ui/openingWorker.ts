// Draws the opening off the main thread (src/ui/opening.ts), so the app starting up cannot make it stutter.
import { runOpening, type OpeningColours } from './openingArt';

self.onmessage = (e: MessageEvent<{ canvas: OffscreenCanvas; css: number; mark: number; dpr: number; colours: OpeningColours; start: number }>) => {
  const d = e.data;
  runOpening(d.canvas, d.css, d.mark, d.dpr, d.colours, d.start);
};
