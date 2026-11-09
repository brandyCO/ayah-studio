#!/usr/bin/env python3
"""How close aligned word times are to Quran.com's for the same recording (e.g. everyayah
Abdul_Basit_Mujawwad_128kbps = Quran.com reciter 1): per ayah, each word's start measured from the ayah's
first word in both (per-ayah files and the full-surah file have different clocks). Only ayat our checks
(make-word-timings.ayah_words) pass; ayat Quran.com lists with repeats are left out (positions repeat).

  python3 scripts/compare-words.py RESULTS_DIR/KEY QDC_ID
"""
import importlib.util, json, os, sys, urllib.request

import types
for m in ('torch', 'torchaudio', 'transformers'):  # only the text helpers are used here
  try: __import__(m)
  except ImportError: sys.modules[m] = types.SimpleNamespace(Wav2Vec2ForCTC=None, inference_mode=lambda: (lambda f: f))
HERE = os.path.dirname(os.path.abspath(__file__))
sp = importlib.util.spec_from_file_location('mw', os.path.join(HERE, 'make-word-timings.py'))
mw = importlib.util.module_from_spec(sp); sp.loader.exec_module(mw)
mw.al.VOCAB = json.load(open(os.path.join(mw.al.MODEL_DIR, 'vocab.json')))  # the model's letters only
Q = json.load(open(os.path.join(os.path.dirname(HERE), 'public', 'data', 'quran-uthmani.json')))['surahs']


def main():
  d, rid = sys.argv[1], int(sys.argv[2])
  diffs, passed, total, rep = [], 0, 0, 0
  for f in sorted(os.listdir(d)):
    s = int(f[:3])
    res = json.load(open(os.path.join(d, f)))
    if 'ayat' not in res: continue
    q = json.loads(urllib.request.urlopen(urllib.request.Request('https://api.quran.com/api/qdc/audio/reciters/%d/audio_files?chapter=%d&segments=true' % (rid, s), headers={'User-Agent': 'AyahStudio/1.0'})).read())
    vt = {int(v['verse_key'].split(':')[1]): v for v in q['audio_files'][0]['verse_timings']}
    sd = []
    for a, r in enumerate(res['ayat'], 1):
      if 'w' not in r: continue
      total += 1
      ours = mw.ayah_words(Q[s - 1][a - 1], r['w'], r['conf'], r['lconf'])
      if not ours: continue
      passed += 1
      segs = [x for x in vt[a].get('segments') or [] if len(x) >= 3]
      if len({x[0] for x in segs}) != len(segs) or len({o[0] for o in ours}) != len(ours): rep += 1; continue
      qs = {x[0]: x[1] for x in segs}
      # display words ≈ Quran.com positions outside the 7 shifted ayat
      # The two clocks differ by one offset per ayah: the median of the differences (robust to one bad word).
      pairs = [(st, qs[w]) for w, st, _ in ours if w in qs]
      if len(pairs) < 2: continue
      offs = sorted(a - b for a, b in pairs)
      off = offs[len(offs) // 2]
      for a, b in pairs: sd.append(abs(a - b - off) / 1000)
    sd.sort(); diffs += sd
    if sd: print('surah %d: words %d median %.2f s, 90%% %.2f s' % (s, len(sd), sd[len(sd) // 2], sd[int(len(sd) * .9)]))
  diffs.sort()
  print('ayat %d, passed checks %d, with repeats %d; words %d: median %.2f s, 90%% within %.2f s, > 0.5 s: %.1f %%' % (
    total, passed, rep, len(diffs), diffs[len(diffs) // 2], diffs[int(len(diffs) * .9)], 100 * sum(x > .5 for x in diffs) / len(diffs)))


main()
