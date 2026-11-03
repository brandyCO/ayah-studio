#!/usr/bin/env python3
"""Is a recording found elsewhere the same reciter as our checked one? Speaker embeddings (SpeechBrain
ECAPA, VoxCeleb) of 20 s windows from the first minutes of each file, averaged per file, compared by cosine.

The method is checked on the references themselves: each of the reciter's own files against his other
files must score above every other reciter's files, else the report says the test cannot tell.

  python3 scripts/voice-check.py OUT.json
"""
import json, os, subprocess, sys, tempfile, urllib.request

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
  vs = []
  for a in range(START, STOP, WIN):
    seg = x[a * 16000:(a + WIN) * 16000]
    if len(seg) < WIN * 16000 * 0.9: break
    if np.sqrt(np.mean(seg ** 2)) < 0.005: continue  # silence
    with torch.no_grad():
      v = enc.encode_batch(torch.from_numpy(seg.copy())[None]).squeeze().numpy()
    vs.append(v / np.linalg.norm(v))
  if not vs: print('no speech', url); return None
  m = np.mean(vs, 0); print('ok', url, len(vs)); return m / np.linalg.norm(m)


def main():
  out = sys.argv[1]
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
  rep = {'own_min': min(own), 'own_mean': float(np.mean(own)), 'others_max': max(cross),
         'others_mean': float(np.mean(cross)), 'separable': min(own) > max(cross), 'targets': {}, 'same_item': {}}
  for name, urls in (('targets', TARGETS), ('same_item', SAME_ITEM)):
    for s, u in urls.items():
      v = embed(u)
      if v is None: rep[name][s] = None; continue
      to_sobhi = float(np.mean([cos(v, w) for w in sob.values()]))
      best = max(oth.items(), key=lambda kv: cos(v, kv[1]))
      rep[name][s] = {'sobhi': to_sobhi, 'closest_other': best[0], 'other': cos(v, best[1]),
                      'verdict': 'Islam Sobhi' if to_sobhi >= rep['own_min'] - 0.02 and to_sobhi > cos(v, best[1]) + 0.1
                      else 'not him' if cos(v, best[1]) > to_sobhi else 'unclear'}
  json.dump(rep, open(out, 'w'), indent=1); print(json.dumps(rep, indent=1))


main()
