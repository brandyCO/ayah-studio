#!/usr/bin/env python3
"""public/data/basmala.json from the runs on the branch align-results: openings/{key}/ (scripts/fix-openings.py
per mp3quran reciter: its basmala.json entry and re-timed words files) and qdc-open/qdc{id}.json
(scripts/qdc-openings.py); every everyayah reciter: "all" missing, its own 001001.mp3.

  python3 scripts/merge-openings.py RESULTS_DIR
"""
import glob, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
res = sys.argv[1]
OWN_IN_AYAH1 = {'1026'}
out = {}
rec = open(os.path.join(ROOT, 'src', 'data', 'reciters.ts')).read()
for line in rec.splitlines():
  m = re.search(r"\{ id: (\d+),", line)
  if m and 'qdc: false' in line and 'mp3quran:' not in line and 'everyayah:' in line:
    # 1026: its ayah-1 files already begin with the Bismillah (heard in surahs 2, 18, 36, 67, 112)
    out[m.group(1)] = {'missing': ''} if m.group(1) in OWN_IN_AYAH1 else {'missing': 'all', 'src': 'everyayah'}
for d in sorted(glob.glob(os.path.join(res, 'openings', '*'))):
  key = os.path.basename(d)
  b = json.load(open(os.path.join(d, 'basmala.json')))
  if key in b: out[key] = b[key]
  for f in glob.glob(os.path.join(d, '[0-9][0-9][0-9].json')):
    shutil.copy(f, os.path.join(ROOT, 'public', 'data', 'words', key, os.path.basename(f)))
def ranges(xs):
  xs, o = sorted(set(xs)), []
  for x in xs:
    if o and x == o[-1][1] + 1: o[-1][1] = x
    else: o.append([x, x])
  return ','.join(str(a) if a == b else '%d-%d' % (a, b) for a, b in o)
for f in sorted(glob.glob(os.path.join(res, 'qdc-open', 'qdc*.json'))):
  d = json.load(open(f))
  e = {'missing': ranges(d['missing']), 'spans': d['spans'], 'first': d['first']}
  best = max(d['spans'], key=lambda s: d['conf'][s][0], default=None)
  if best: e['src'] = {'surah': int(best), 'from': d['spans'][best][0], 'to': d['spans'][best][1]}
  out[os.path.basename(f)[:-5]] = e
json.dump(out, open(os.path.join(ROOT, 'public', 'data', 'basmala.json'), 'w'), separators=(',', ':'), sort_keys=True)
print(len(out), 'recordings')
