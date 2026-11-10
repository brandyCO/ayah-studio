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

export interface Step { cursor: number; said: number[]; skipped: number[]; wrong: number[] }

const LOOK = 5;
/** Below this a word that was matched is taken as said differently (short words are too noisy to judge). */
const CLEAR = 0.75;
const need = (off: number, len: number) => (off === 0 ? (len <= 2 ? 0.5 : 0.6) : len < 3 ? 2 : 0.8);

/**
 * Follows the words heard (one utterance, as the recogniser has it so far) from `start`.
 * Returns where the reciter is now, the words said and the words passed over.
 */
export function follow(words: FollowWord[], start: number, heardText: string): Step {
  const heard = heardText.split(/\s+/).map((x) => letterForms(x)[0]).filter((x) => x.length > 0);
  const said: number[] = [], skipped: number[] = [], wrong: number[] = [];
  let c = start, j = 0, junk = 0; // junk: heard words since the last match that matched nothing
  let near = false; // a heard word since the last match was like the next word: passing it means it was said wrong

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
        if (sim >= need(off, len)) {
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
    if (!best) { j++; junk++; continue; } // not in the text here: a repeat, a stray word, or a word said wrong
    // words passed over: as many as there were unmatched heard words were said as something else
    for (let k = 0; k < best.off; k++) (k < junk || (k === 0 && near) ? wrong : skipped).push(c + k);
    const off = words[c + best.off].forms[0].length > 2 && best.sim < CLEAR;
    for (let k = 0; k < best.span; k++) (off ? wrong : said).push(c + best.off + k);
    junk = 0; near = false;
    c += best.off + best.span;
    j += best.take;
  }
  return { cursor: c, said, skipped, wrong };
}
