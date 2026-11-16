// Voice follow-along in a tasmi' (pure: no DOM, runs in node too). What the phone's speech recogniser heard
// is matched, word by word, to the hidden words that come next. Both sides are reduced to bare letters
// (harakat, small marks, the ayah number and alif / hamza forms dropped; the dagger alif both dropped and
// written out), and a word counts as said when it is close enough to one of the next few words. Words passed
// over on the way are "skipped"; a word heard as something else (a different word in its place, or one only
// partly like it) is "wrong". The learner can untap either if the recogniser misheard. The Quran text
// itself is only read, never changed (rule 1).

/** The two bare-letter forms of a word: dagger alif dropped (العلمين) and written out (العالمين). */
export function letterForms(w: string): string[] {
  const base = (d: string) => w
    .replace(/ٰ/g, d)
    .replace(/[ٱأإآٲٳ]/g, 'ا')
    .replace(/[ىیۍ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ک/g, 'ك')
    .normalize('NFD')
    .replace(/[^ء-ي]/g, '') // letters only: marks, tatweel, small waw/yeh, spaces, numbers, ۞ ۩ go
    .replace(/ء/g, '');
  const a = base(''), b = base('ا');
  return a === b ? [a] : [a, b];
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
/** 0..1: how alike two bare-letter words are. */
export function likeness(forms: string[], heard: string): number {
  let best = 0;
  for (const f of forms) {
    if (!f.length || !heard.length) continue;
    best = Math.max(best, 1 - lev(f, heard) / Math.max(f.length, heard.length));
  }
  return best;
}

export interface FollowWord { key: string; forms: string[]; plain: string }
/** The words to follow, in reading order (words without letters are left out). */
export function followWords(list: { key: string; text: string }[]): FollowWord[] {
  return list.map(({ key, text }) => ({
    key, forms: letterForms(text),
    plain: usual(text.replace(/ٰ/g, 'ا').replace(/ٱ/g, 'ا').normalize('NFD').replace(/[^ء-ي]/g, '').normalize('NFC')),
  })).filter((w) => w.forms[0].length > 0);
}

// Words whose dagger alif is not written in everyday spelling (what a recogniser writes)
const USUAL: [RegExp, string][] = [
  [/ذالك/, 'ذلك'], [/هاذا/, 'هذا'], [/هاذه/, 'هذه'], [/هاذان/, 'هذان'], [/لاكن/, 'لكن'], [/الرحمان/, 'الرحمن'],
  [/^(.?)الاه/, '$1اله'], [/^(.?)إلاه/, '$1إله'], [/أولائك/, 'أولئك'], [/هاؤلاء/, 'هؤلاء'], [/هاكذا/, 'هكذا'], [/طاها/, 'طه'],
];
const usual = (w: string) => USUAL.reduce((x, [re, to]) => x.replace(re, to), w);

/** The coming words as plain phrases of 4 (and 2), for a recogniser that can be told what to expect. */
export function hintsFrom(words: FollowWord[], from: number, n = 24): string[] {
  const next = words.slice(from, from + n).map((w) => w.plain);
  const out: string[] = [];
  for (let i = 0; i < next.length; i += 2) out.push(next.slice(i, i + 4).join(' '));
  for (let i = 0; i < Math.min(next.length, 8); i++) out.push(next[i]);
  return out;
}

export interface Step {
  cursor: number; said: number[]; skipped: number[]; wrong: number[];
  /** Not heard clearly (said quietly, or one word the phone missed): shown, but never counted as a mistake. */
  unclear: number[];
  /** Words before the cursor said again clearly (the reciter went back after a breath). */
  again: number[];
}

const LOOK = 5;
/** How far back a repeat may start (a reciter out of breath goes back a few words, often to the ayah's start). */
const BACK = 12;
/** Below this a word that was matched is taken as heard only partly (short words are too noisy to judge). */
const CLEAR = 0.75;
const need = (off: number, len: number) => (off === 0 ? (len <= 2 ? 0.5 : 0.6) : len < 3 ? 2 : 0.8);
const fits = (w: FollowWord, h: string) => likeness(w.forms, h) >= need(0, w.forms[0].length);
/** A word said again is said clearly: a short word exactly, a longer one closely (near-rhymes are not repeats). */
const again1 = (w: FollowWord, h: string) => likeness(w.forms, h) >= (w.forms[0].length <= 2 ? 1 : CLEAR);

/**
 * Follows the words heard (one utterance, as the recogniser has it so far) from `start`.
 * Returns where the reciter is now, the words said and the words passed over. Going back to say words
 * again (out of breath, to start the phrase afresh) keeps the place: nothing is skipped or counted.
 * Only a clearly different word in a word's place is "wrong"; a word heard partly, or a single word the
 * phone did not catch between two it did, is "unclear".
 */
export function follow(words: FollowWord[], start: number, heardText: string): Step {
  const heard = heardText.split(/\s+/).map((x) => letterForms(x)[0]).filter((x) => x.length > 0);
  const said: number[] = [], skipped: number[] = [], wrong: number[] = [], unclear: number[] = [], again: number[] = [];
  let c = start, j = 0;
  let junk: string[] = []; // heard words since the last match that matched nothing
  let near = false; // a heard word since the last match was like the next word

  while (j < heard.length && c < words.length) {
    let best: { off: number; take: number; span: number; score: number; sim: number } | null = null;
    for (let off = 0; off < LOOK && c + off < words.length; off++) {
      const w = words[c + off];
      const len = w.forms[0].length;
      // one heard word = one word; two heard words = one written word (يا أيها → يٰٓأيها, و الله → والله)
      for (const take of [1, 2]) {
        if (j + take > heard.length) continue;
        const sim = likeness(w.forms, heard.slice(j, j + take).join(''));
        if (off === 0 && sim >= need(0, len)) near = true;
        // two heard words joined only to a word further on must be very close (else a short word passed is lost)
        if (sim >= need(off, len) && (take === 1 || off === 0 || sim >= 0.9)) {
          const score = sim - off * 0.08 - (take - 1) * 0.03;
          if (!best || score > best.score) best = { off, take, span: 1, score, sim };
        }
      }
      // one heard word = two written words (the recogniser joined them)
      if (c + off + 1 < words.length) {
        const two = words[c + off].forms.flatMap((a) => words[c + off + 1].forms.map((b) => a + b));
        const sim = likeness(two, heard[j]);
        if (sim >= need(off, 6) && sim > 0.75) {
          const score = sim - off * 0.08 - 0.03;
          if (!best || score > best.score) best = { off, take: 1, span: 2, score, sim };
        }
      }
    }
    // A repeat: the heard words go on like words already behind the cursor. `cont`: the repeat runs up to the
    // cursor and the next heard word is the cursor's own word (gone back, then on exactly where it was)
    let back: { k: number; m: number; cont: boolean } | null = null;
    for (let k = 1; k <= Math.min(BACK, c); k++) {
      let m = 0;
      while (m < k && j + m < heard.length && again1(words[c - k + m], heard[j + m])) m++;
      const cont = m === k && j + m < heard.length && again1(words[c], heard[j + m]);
      const ok = m >= 2 || (m === 1 && (cont || (words[c - k].forms[0].length >= 3 && (k === 1 || j + 1 === heard.length))));
      // going back and on from exactly where it was is the likeliest repeat; else the longest
      if (ok && (!back || (cont ? 100 : 0) + m > (back.cont ? 100 : 0) + back.m)) back = { k, m, cont };
    }
    if (back) {
      // how far the forward reading holds; the repeat wins when it explains more (a tie stays forward:
      // the text itself repeats, as in Ar-Rahman's refrain, and the cursor's own word is the likelier one)
      let mf = 0;
      if (best) {
        mf = 1;
        while (j + best.take + mf - 1 < heard.length && c + best.off + best.span + mf - 1 < words.length
          && mf < BACK && fits(words[c + best.off + best.span + mf - 1], heard[j + best.take + mf - 1])) mf++;
      }
      const wins = !best || (back.cont
        ? !(best.off === 0 && best.take === 1 && mf > back.m + 1)
        : best.off === 0 ? back.m > mf : back.m >= mf);
      if (wins) {
        for (let i = 0; i < back.m; i++) again.push(c - back.k + i);
        j += back.m; junk = []; near = false;
        continue;
      }
    }
    if (!best) { junk.push(heard[j]); j++; continue; } // not in the text here: a stray word or a word said differently
    // words passed over: a short word heard in its place was said (the look-ahead does not take short words);
    // a clearly different word heard in a word's place = wrong; a word heard only partly, or a single word the
    // phone missed between two it caught (said quietly) = unclear; a run passed over = skipped
    const left: number[] = [], pool = [...junk];
    for (let k = 0; k < best.off; k++) {
      const i = pool.findIndex((x) => fits(words[c + k], x));
      if (i >= 0) { said.push(c + k); pool.splice(i, 1); } else left.push(k);
    }
    left.forEach((k, n) => {
      const inPlace = n < pool.length ? pool[pool.length - Math.min(pool.length, left.length) + n] : undefined;
      if (inPlace !== undefined) (inPlace.length >= 3 && likeness(words[c + k].forms, inPlace) < 0.5 ? wrong : unclear).push(c + k);
      else if ((k === 0 && near) || (left.length === 1 && !pool.length)) unclear.push(c + k);
      else skipped.push(c + k);
    });
    const part = words[c + best.off].forms[0].length > 2 && best.sim < CLEAR;
    for (let k = 0; k < best.span; k++) (part ? unclear : said).push(c + best.off + k);
    junk = []; near = false;
    c += best.off + best.span;
    j += best.take;
  }
  return { cursor: c, said, skipped, wrong, unclear, again };
}
