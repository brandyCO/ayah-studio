// One-off: tajweed colouring for the bundled text, from Quran.com's tajweed markup (API v4
// quran/verses/uthmani_tajweed). Run after fetch-data.mjs: `node scripts/fetch-tajweed.mjs`, then commit
// public/data/tajweed.json.
//
// Quran.com marks tajweed rules on its Uthmani text, a different encoding from our KFGQPC Hafs text.
// Our text stays authoritative and is never changed (rule 1): we only learn *which of our letters* a
// rule covers. Both texts are reduced to their letters (marks dropped, a few letter variants unified),
// aligned per ayah (longest common subsequence), and each marked letter is moved onto the matching
// letter of our text with the marks that follow it. An ayah whose letters do not align almost
// completely gets no colours at all (never guessed).
//
// Output: { rules: { code: name }, ayat: { "s:a": "w:start-end code,…" } } — word index (as split by
// displayWords), character range inside that word (end exclusive), rule code.
import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../public/data/', import.meta.url);
const text = JSON.parse(await readFile(new URL('quran-uthmani.json', DATA), 'utf8')).surahs;

const RULES = {
  ham_wasl: 'h', laam_shamsiyah: 'l', slnt: 's', silent: 's',
  madda_normal: 'n', madda_permissible: 'p', madda_obligatory: 'o', madda_necessary: 'x',
  qalaqah: 'q', ghunnah: 'u', ikhafa: 'k', ikhafa_shafawi: 'f', iqlab: 'i',
  idgham_ghunnah: 'g', idgham_wo_ghunnah: 'w', idgham_shafawi: 'a', idgham_mutajanisayn: 'j', idgham_mutaqaribayn: 'm',
};
const NAMES = Object.fromEntries(Object.entries(RULES).map(([k, v]) => [v, k]));

function assert(cond, msg) {
  if (!cond) throw new Error(`Verification failed: ${msg}`);
}
async function json(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// Letters (marks, tatweel, digits and spaces are not); variants that differ only by encoding are unified.
const LETTER = /[ء-غف-يٰ-ٲیۥۦ]/;
const canon = (c) => ({ 'ى': 'ي', 'ی': 'ي', 'ٲ': 'ٰ', 'ٱ': 'ا' }[c] ?? c);
const isLetter = (c) => LETTER.test(c);

/** Quran.com tajweed markup → characters with the rule (or null) each one carries. */
function parse(markup, key) {
  const chars = [];
  const re = /<tajweed class=([a-z_]+)>|<\/tajweed>|<span class=end>[^<]*<\/span>|([^<])/g;
  let rule = null, m;
  while ((m = re.exec(markup))) {
    if (m[1]) {
      assert(m[1] in RULES, `${key}: unknown rule ${m[1]}`);
      rule = RULES[m[1]];
    } else if (m[0] === '</tajweed>') rule = null;
    else if (m[2] !== undefined) chars.push([m[2], rule]);
  }
  return chars;
}

/** Longest common subsequence of two letter arrays: our index for each of theirs (or -1). */
function align(theirs, ours) {
  const n = theirs.length, k = ours.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(k + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) {
    dp[i][j] = theirs[i] === ours[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const map = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < k;) {
    if (theirs[i] === ours[j]) { map[i] = j; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return { map, common: dp[0][0] };
}

const ayat = {};
let total = 0, coloured = 0, skipped = [], spans = 0;
for (let s = 1; s <= 114; s++) {
  const d = await json(`https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=${s}`);
  assert(d.verses.length === text[s - 1].length, `surah ${s} has ${text[s - 1].length} ayat (got ${d.verses.length})`);
  for (const v of d.verses) {
    const [, a] = v.verse_key.split(':').map(Number);
    total++;
    const ourText = text[s - 1][a - 1];
    // Our words exactly as displayWords splits them (the ayah number stays with the last word).
    const words = ourText.split(' ').filter(Boolean);
    for (let i = words.length - 1; i > 0; i--) if (/^[٠-٩]+$/.test(words[i])) words.splice(i - 1, 2, `${words[i - 1]} ${words[i]}`);
    // Our letters: (word, char offset); a letter's cluster runs to the next letter or the word's end.
    const ourL = [];
    words.forEach((w, wi) => [...w].forEach((c, ci) => { if (isLetter(c)) ourL.push({ c: canon(c), w: wi, at: ci }); }));
    const clusterEnd = (k) => {
      const L = ourL[k], next = ourL[k + 1];
      if (next && next.w === L.w) return next.at;
      let e = L.at + 1;
      const w = [...words[L.w]];
      while (e < w.length && !isLetter(w[e]) && !/[\s ٠-٩]/.test(w[e])) e++;
      return e;
    };
    const chars = parse(v.text_uthmani_tajweed, v.verse_key);
    // Their letters with their rule. A rule run holding letters colours those letters (a vowel mark in
    // the run, as in "ِي", stays with its own letter, which is not coloured); a run of marks alone (a
    // maddah sign) colours the letter it sits on. Tatweel is ignored.
    const theirL = [];
    for (let i = 0; i < chars.length;) {
      const r = chars[i][1];
      let j = i;
      while (j < chars.length && chars[j][1] === r) j++;
      const run = chars.slice(i, j).filter(([c]) => c !== '\u0640');
      const hasLetter = run.some(([c]) => isLetter(c));
      for (const [c] of run) if (isLetter(c)) theirL.push({ c: canon(c), r });
      if (r && !hasLetter && run.some(([c]) => !/\s/.test(c)) && theirL.length) theirL[theirL.length - 1].r ??= r;
      i = j;
    }
    const { map, common } = align(theirL.map((x) => x.c), ourL.map((x) => x.c));
    const len = Math.max(theirL.length, ourL.length);
    if (len - common > Math.max(3, 0.03 * len)) {
      if (process.env.DEBUG && skipped.length < 4) console.log(v.verse_key, common, theirL.length, ourL.length, theirL.map((x) => x.c).join(""), "|", ourL.map((x) => x.c).join(""));
      skipped.push(v.verse_key); continue;
    }
    const out = [];
    theirL.forEach((x, i) => {
      if (!x.r || map[i] < 0) return;
      const k = map[i], L = ourL[k], end = clusterEnd(k);
      // A dagger alif has no width of its own: colour the letter it sits on with it.
      const start = L.c === '\u0670' && k > 0 && ourL[k - 1].w === L.w ? ourL[k - 1].at : L.at;
      const last = out[out.length - 1];
      // Neighbouring letters with the same rule in the same word make one span.
      if (last && last.w === L.w && last.r === x.r && last.end >= start) last.end = Math.max(last.end, end);
      else out.push({ w: L.w, start, end, r: x.r });
    });
    if (out.length) {
      ayat[v.verse_key] = out.map((x) => `${x.w}:${x.start}-${x.end}${x.r}`).join(',');
      spans += out.length;
    }
    coloured++;
  }
}
assert(total === 6236, `6236 ayat (got ${total})`);
if (process.env.DEBUG) console.log(skipped.join(" "));
assert(skipped.length < (process.env.DEBUG ? 9999 : 60), `too many ayat could not be aligned: ${skipped.length}`);
await writeFile(new URL('tajweed.json', DATA), JSON.stringify({
  source: 'Tajweed rules from Quran.com API v4 (quran/verses/uthmani_tajweed), moved letter-for-letter onto quran-uthmani.json words; the text itself is unchanged. Ayat that did not align are left uncoloured.',
  rules: NAMES,
  ayat,
}) + '\n');
console.log(`OK: ${coloured}/${total} ayat aligned (${spans} spans); left uncoloured: ${skipped.length}${skipped.length ? ` (${skipped.slice(0, 12).join(' ')}${skipped.length > 12 ? ' …' : ''})` : ''}`);
