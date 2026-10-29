#!/usr/bin/env python3
"""Turns the raw alignment results (branch `align-results`, align/{key}/{SSS}.json, made by
scripts/align-batch.py on GitHub Actions) into checked app data:

  public/data/words/{key}/{SSS}.json   {"a": {"ayah": [[displayWord, startMs, endMs], ...]}}
  public/data/mp3quran/{key}.json      ayah cuts for mp3quran surahs that had none verified (judge())
  src/data/reciters.ts                 `words: '…'` (and mp3quran `surahs`) per reciter

An ayah gets word times only when every check passes (rule 8: a reel with any other ayah stays in Ayah mode):
- the model clearly heard the ayah (confidence ≥ MIN_CONF over its frames, ≥ MIN_LCONF over its letters);
- every word with letters has a time, in reading order, inside the ayah (mp3quran: between its cuts);
- no word but the last lasts more than LONG ms (8 s) — the reciter repeating words (common, e.g. Alafasy
  78:40) would otherwise stretch one word over the repeat.
Checked against Quran.com's own word times for Alafasy (same recording, 8 surahs, 1655 words): median
difference 0.04 s, 90 % within 0.17 s once ayat with repetitions are left out.

  python3 scripts/make-word-timings.py RESULTS_DIR [key ...]
"""
import importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MIN_CONF, MIN_LCONF = -1.5, -3.0
LONG = float(os.environ.get('LONG', 8000))  # ms: no word but the last held longer
SUB = os.environ.get('ALIGN_SUB', 'align2')


def mod(name, file):
  sp = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
  m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


def display_words(text):
  """Python twin of displayWords() in src/engine/words.ts."""
  words = [w for w in text.split(' ') if w]
  i = len(words) - 1
  while i > 0:
    if re.fullmatch('[٠-٩]+', words[i]): words[i - 1:i + 1] = [words[i - 1] + ' ' + words[i]]
    i -= 1
  assert ' '.join(words) == text
  return words


def token_display(text):
  """Display word (1-based) of each token of align-ayat.words_of() (1-based)."""
  toks = text.rsplit('\xa0', 1)[0].replace('\xa0', ' ').split(' ')
  out, k = {}, 0
  for i, d in enumerate(display_words(text), 1):
    flat, joined = d.replace(' ', '').replace('\xa0', ''), ''
    while k < len(toks) and flat.startswith(joined + toks[k]):
      joined += toks[k]; k += 1; out[k] = i
  assert k == len(toks), text
  return out


def ranges(nums):
  nums, out, i = sorted(nums), [], 0
  while i < len(nums):
    j = i
    while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1: j += 1
    out.append(str(nums[i]) if i == j else '%d-%d' % (nums[i], nums[j])); i = j + 1
  return ','.join(out)


def ayah_words(text, words, conf, lconf, lo=None, hi=None):
  """Checked display-word times for one ayah, in the order recited (a repeated word is listed again), or None.
  `words`: align_repeats() segments [[word, startMs, endMs, unexplained letters], ...]."""
  if conf < MIN_CONF or lconf < MIN_LCONF: return None
  need = {j + 1 for j, w in enumerate(al.words_of(text)) if al.letters(w)}
  if {w[0] for w in words} != need: return None
  for a, b in zip(words, words[1:]):
    if b[1] < a[2] or not (b[0] == a[0] + 1 or b[0] <= a[0]): return None  # in time; next word or back (repeat)
  if any(w[2] - w[1] > LONG for w in words[:-1]): return None
  if lo is not None and (words[0][1] < lo or words[-1][2] > hi): return None
  td = token_display(text)
  out = []
  for j, s, e, *_ in words:
    d = td[j]
    if out and out[-1][0] == d and s >= out[-1][2]: out[-1][2] = e  # the next token of the same display word
    else: out.append([d, s, e])
  if {o[0] for o in out} != set(range(1, len(display_words(text)) + 1)): return None
  return out


def main():
  res_dir, only = sys.argv[1], set(sys.argv[2:])
  al.VOCAB = json.load(open(os.path.join(al.MODEL_DIR, 'vocab.json')))  # letters() only: no model needed
  quran = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
  rec_path = os.path.join(ROOT, 'src', 'data', 'reciters.ts')
  rec = open(rec_path).read()
  for key in sorted(os.listdir(os.path.join(res_dir, SUB))):
    if only and key not in only: continue
    line = next((l for l in rec.splitlines() if 'qdc: false' in l and re.search(r"(everyayah|mp3quran)", l) and
                 (re.search(r"\{ id: %s," % re.escape(key), l) and 'mp3quran' not in l or re.search(r"read: '?%s'?," % re.escape(key), l))), None)
    if not line or 'qdc: false' not in line: print(key, ': no such reciter'); continue
    if "style: 'Mujawwad'" in line: print(key, ': mujawwad, word times not reliable yet'); continue
    mp3 = 'mp3quran' in line
    files = sorted(f for f in os.listdir(os.path.join(res_dir, SUB, key)) if f.endswith('.json'))
    doc_path = os.path.join(ROOT, 'public', 'data', 'mp3quran', '%s.json' % key)
    doc = json.load(open(doc_path)) if mp3 else None
    aligned_only = mp3 and not key.isdigit()  # no published times at all: every cut is ours
    if aligned_only: doc['surahs'] = {}
    judged, rates = {}, []
    if mp3:  # cuts for surahs without verified ones (judge() as in make-mp3quran-timings.py)
      for f in files:
        s = int(f[:3]); raw = json.load(open(os.path.join(res_dir, SUB, key, f)))
        if 'error' in raw or (str(s) in doc['surahs'] and not doc['surahs'][str(s)].get('aligned')): continue
        r, why = mk.judge(raw, quran[s - 1])
        if r: judged[s] = r; rates += r[1]
      rs = sorted(rates); med = rs[len(rs) // 2] if rs else 0
      for s, (out, rr) in judged.items():
        for k, x in enumerate(rr):  # an implausible pace means a misplaced ayah: no reel starts or ends next to it
          if vf.letters(quran[s - 1][k]) >= 8 and not med / 3 <= x <= med * 2.2: out['c'][k] = out['c'][k + 1] = None
        if sum(c is None for c in out['c']) > len(out['c']) // 2: continue
        doc['surahs'][str(s)] = out
      doc['surahs'] = dict(sorted(doc['surahs'].items(), key=lambda kv: int(kv[0])))
      json.dump(doc, open(doc_path, 'w'), separators=(',', ':'))
    with_words, n_ok, n_all = [], 0, 0
    out_dir = os.path.join(ROOT, 'public', 'data', 'words', key)
    for f in files:
      s = int(f[:3]); raw = json.load(open(os.path.join(res_dir, SUB, key, f)))
      if 'error' in raw: continue
      text, got = quran[s - 1], {}
      if mp3:
        c = doc['surahs'].get(str(s), {}).get('c')
        if not c: continue
        for k in range(len(text)):
          n_all += 1
          if c[k] is None or c[k + 1] is None: continue
          r = raw['r'][k]
          if 'error' in r: continue
          w = ayah_words(text[k], r['w'], r['conf'], r['lconf'], c[k], c[k + 1])
          if w: got[str(k + 1)] = w
      else:
        for k, a in enumerate(raw['ayat']):
          n_all += 1
          if 'error' in a: continue
          w = ayah_words(text[k], a['w'], a['conf'], a['lconf'], 0, a['ms'])
          if w: got[str(k + 1)] = w
      n_ok += len(got)
      path = os.path.join(out_dir, f)
      if got:
        os.makedirs(out_dir, exist_ok=True)
        json.dump({'a': got}, open(path, 'w'), separators=(',', ':')); with_words.append(s)
      elif os.path.exists(path): os.remove(path)
    new = line
    new = re.sub(r", words: '[^']*'", '', new)
    if with_words: new = re.sub(r'\s*\},\s*$', ", words: '%s' }," % ranges(with_words), new)
    if mp3: new = re.sub(r"(mp3quran: \{ read: '?[\w-]+'?, surahs: ')[^']*'", lambda m: m.group(1) + ranges(map(int, doc['surahs'])) + "'", new)
    rec = rec.replace(line, new)
    print('%s: %d of %d ayat with word times, %d surahs%s' % (key, n_ok, n_all, len(with_words),
          ', %d surahs with cuts' % len(doc['surahs']) if mp3 else ''))
  open(rec_path, 'w').write(rec)


mk = mod('mk', 'make-mp3quran-timings.py')
al, vf = mk.al, mk.vf

if __name__ == '__main__':
  main()
