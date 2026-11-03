#!/usr/bin/env python3
"""Is a recording found elsewhere the same reciter as our checked one? Speaker embeddings (SpeechBrain
ECAPA, VoxCeleb) of 20 s windows from the first minutes of each file, averaged per file, compared by cosine.

2026-11-03: the owner heard that archive.org `islamsobhiquran` is Yasser Az-Zailai, not Islam Sobhi. So the
report also says whether every file of that upload is one voice (a whole Quran of Az-Zailai) and whether
the As-Saffat / Al-Jathiya / At-Talaq files of `islam-sobhi_202405` are Islam Sobhi.

The method is checked on the references themselves: each of the reciter's own files against his other
files must score above every other reciter's files, else the report says the test cannot tell.

  python3 scripts/voice-check.py OUT.json
"""
import json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

import numpy as np
import torch
from speechbrain.inference.speaker import EncoderClassifier

MP3 = 'https://cdn.mp3quran.net/audio/'
TARGETS = {s: 'https://archive.org/download/islamsobhiquran/%03d.mp3' % s for s in (37, 39, 40, 45, 65)}
# The same upload's copies of surahs we already have from mp3quran (should be him too).
SAME_ITEM = {s: 'https://archive.org/download/islamsobhiquran/%03d.mp3' % s for s in (36, 38, 41)}
SOBHI = {s: MP3 + 'islam-sobhi/r1/%03d.mp3' % s for s in (36, 38, 41, 44, 46, 67)}
OTHERS = ['muhammad-minshawi/r3', 'maher-muaiqly/r2', 'idrees-abkar/r1', 'yasser-salama/r1', 'khalid-jalil/r1',
          'bandar-baleela/r1', 'raad-kurdi/r1', 'abdulrahman-majed/r1', 'ahmad-nufais/r1', 'abdulrahman-sudais/r1',
          'abdullah-basfar/r1', 'salah-budair/r1', 'haitham-dukhain/r1', 'mansour-salimi/r1']
WIN, START, STOP = 20, 30, 230  # seconds

enc = EncoderClassifier.from_hparams('speechbrain/spkrec-ecapa-voxceleb', savedir=os.path.join(tempfile.gettempdir(), 'ecapa'))


def embed(url):
  req = urllib.request.Request(url, headers={'User-Agent': 'ayah-studio-voice-check', 'Range': 'bytes=0-5000000'})
  try:
    data = urllib.request.urlopen(req, timeout=120).read()
  except Exception as e:
    print('skip', url, e); return None
  with tempfile.NamedTemporaryFile(suffix='.mp3') as f:
    f.write(data); f.flush()
    pcm = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f.name, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         capture_output=True).stdout
  x = np.frombuffer(pcm, np.float32)
  vs, dur = [], len(x) / 16000
  first = START if dur >= START + WIN else 1  # short surahs: from the start
  spans = [(a, a + WIN) for a in range(first, int(min(STOP, dur)) - WIN + 1, WIN)] or ([(1, dur)] if dur > 6 else [])
  for a, b in spans:
    seg = x[int(a * 16000):int(b * 16000)]
    if np.sqrt(np.mean(seg ** 2)) < 0.005: continue  # silence
    with torch.no_grad():
      v = enc.encode_batch(torch.from_numpy(seg.copy())[None]).squeeze().numpy()
    vs.append(v / np.linalg.norm(v))
  if not vs: print('no speech', url); return None
  m = np.mean(vs, 0); print('ok', url, len(vs)); return m / np.linalg.norm(m)


def ia_files(item):
  meta = json.load(urllib.request.urlopen(urllib.request.Request(
    'https://archive.org/metadata/' + item, headers={'User-Agent': 'ayah-studio-voice-check'}), timeout=60))
  return [f['name'] for f in meta['files'] if f['name'].lower().endswith('.mp3') and f.get('source') == 'original']


def zailai(out):
  """Every file of archive.org YasserAl-Zailai against the As-Saffat the owner recognised as his (2026-11-03)."""
  ref = embed('https://archive.org/download/islamsobhiquran/037.mp3')
  oth = {o: embed(MP3 + o + '/037.mp3') for o in OTHERS + ['islam-sobhi/r1']}
  oth = {k: v for k, v in oth.items() if v is not None}
  rep = {'others_to_ref_max': max(float(ref @ v) for v in oth.values()), 'files': {}}
  for name in ia_files('YasserAl-Zailai'):
    v = embed('https://archive.org/download/YasserAl-Zailai/' + urllib.parse.quote(name))
    if v is None: continue
    best = max(oth.items(), key=lambda kv: float(v @ kv[1]))
    rep['files'][name] = {'zailai': float(v @ ref), 'closest_other': best[0], 'other': float(v @ best[1])}
  vals = [r['zailai'] - r['other'] for r in rep['files'].values()]
  rep['summary'] = {'files': len(vals), 'margin_min': min(vals), 'not_him': [n for n, r in rep['files'].items() if r['other'] >= r['zailai']]}
  json.dump(rep, open(out, 'w'), indent=1); print(json.dumps(rep['summary'], indent=1))


def main():
  out = sys.argv[1]
  if sys.argv[2:] == ['zailai']: return zailai(out)
  sob = {s: embed(u) for s, u in SOBHI.items()}
  sob = {s: v for s, v in sob.items() if v is not None}
  oth = {}
  for o in OTHERS:
    for s in (37, 36):
      v = embed(MP3 + o + '/%03d.mp3' % s)
      if v is not None: oth['%s/%d' % (o, s)] = v; break
  cos = lambda a, b: float(a @ b)
  # Calibration: each Sobhi file against his other files vs against every other reciter.
  own = [np.mean([cos(v, w) for t, w in sob.items() if t != s]) for s, v in sob.items()]
  cross = [cos(v, w) for v in sob.values() for w in oth.values()]
  rep = {'own_min': float(min(own)), 'own_mean': float(np.mean(own)), 'others_max': float(max(cross)),
         'others_mean': float(np.mean(cross)), 'separable': bool(min(own) > max(cross)), 'targets': {}, 'same_item': {}}
  for name, urls in (('targets', TARGETS), ('same_item', SAME_ITEM)):
    for s, u in urls.items():
      v = embed(u)
      if v is None: rep[name][s] = None; continue
      to_sobhi = float(np.mean([cos(v, w) for w in sob.values()]))
      best = max(oth.items(), key=lambda kv: cos(v, kv[1]))
      rep[name][s] = {'sobhi': to_sobhi, 'closest_other': best[0], 'other': cos(v, best[1]),
                      'verdict': 'Islam Sobhi' if to_sobhi >= rep['own_min'] - 0.02 and to_sobhi > cos(v, best[1]) + 0.1
                      else 'not him' if cos(v, best[1]) > to_sobhi else 'unclear'}
  # The whole upload: one voice? (each file against the centroid of the others)
  item = {}
  for name in ia_files('islamsobhiquran'):
    v = embed('https://archive.org/download/islamsobhiquran/' + urllib.parse.quote(name))
    if v is not None: item[name] = v
  if item:
    c = np.mean(list(item.values()), 0)
    rep['item'] = {n: {'item': float(v @ ((c * len(item) - v) / np.linalg.norm(c * len(item) - v))),
                       'sobhi': float(np.mean([cos(v, w) for w in sob.values()])),
                       'other': float(max(cos(v, w) for w in oth.values()))} for n, v in sorted(item.items())}
    vals = [r['item'] for r in rep['item'].values()]
    rep['item_summary'] = {'files': len(item), 'min': float(min(vals)), 'mean': float(np.mean(vals)),
                           'outliers': [n for n, r in rep['item'].items() if r['item'] < rep['own_min'] - 0.05]}
  # Another upload named after Islam Sobhi: his voice?
  rep['sobhi_202405'] = {}
  for name in ia_files('islam-sobhi_202405'):
    if not re.match(r'0(37|39|40|45|65) ', name): continue
    v = embed('https://archive.org/download/islam-sobhi_202405/' + urllib.parse.quote(name))
    if v is None: continue
    best = max(oth.items(), key=lambda kv: cos(v, kv[1]))
    rep['sobhi_202405'][name] = {'sobhi': float(np.mean([cos(v, w) for w in sob.values()])),
                                 'closest_other': best[0], 'other': cos(v, best[1])}
  json.dump(rep, open(out, 'w'), indent=1); print(json.dumps(rep, indent=1))


main()
