#!/usr/bin/env python3
"""Start times for listening where an mp3quran cut is unknown (null: no pause found, e.g. two ayat in one
breath). Reels still never start, end or change ayah there; but in Listen a tap on such an ayah should play
it from its first word, not skip it. The forced alignment (branch `align-results`, align2/{key}/{SSS}.json)
knows where each ayah's first word starts; kept only when the ayah was clearly heard (letter confidence
> -1.5), the recording is the one aligned (same size) and the start falls between the known cuts around it.

Writes `l` per surah into public/data/mp3quran/{key}.json: {ayah: ms} for ayat whose start cut is null.

  python3 scripts/make-listen-starts.py RESULTS_DIR   (a checkout of align-results)
"""
import glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = sys.argv[1]
LEAD = 120  # ms before the first word (its onset is a little late)

for path in sorted(glob.glob(os.path.join(ROOT, 'public', 'data', 'mp3quran', '*.json'))):
  key = os.path.basename(path)[:-5]
  d = json.load(open(path))
  added = 0
  for s, v in d['surahs'].items():
    v.pop('l', None)
    c = v['c']
    try: a = json.load(open(os.path.join(RES, 'align2', key, '%03d.json' % int(s))))
    except Exception: continue
    if 'ay' not in a or a.get('size') != v['size'] or len(a['ay']) != len(c) - 1: continue
    starts = {}
    for i in range(len(c) - 1):
      if c[i] is not None or a['lconf'][i] <= -1.5: continue
      t = a['ay'][i][0] - LEAD
      if i > 0: t = max(t, a['ay'][i - 1][1])  # never inside the previous ayah's last word
      lo = max([x for x in c[:i] if x is not None] + [0])
      hi = min([x for x in c[i + 1:] if x is not None] + [10 ** 9])
      if lo < t < hi: starts[str(i + 1)] = int(t)
    if starts: v['l'] = starts; added += len(starts)
  with open(path, 'w') as f: json.dump(d, f, separators=(',', ':'))
  print(key, added)
