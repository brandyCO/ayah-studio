// The character for the opening (src/ui/opening.ts), loaded on its own so the first load stays small: the user's
// own character, or the one on the app icon (the builder's default with a face) before they have made one.
import { actor, myFigureCode } from './actor';
import { DEFAULT, encode, normalize } from './figure';

export function openingActor() {
  return actor('op-actor', myFigureCode() ?? encode(normalize({ ...DEFAULT, face: 1 })));
}
