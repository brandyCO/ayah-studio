#!/usr/bin/env python3
"""Where did each seek in scripts/seek-check.cjs really land? The captured audio is matched (loudness envelope,
10 ms steps) against the whole file decoded from its start by ffmpeg (exact time), ±15 s around the target.

  python3 scripts/seek-check.py DIR    (writes DIR/result.json)
"""
import json, os, subprocess, sys, urllib.request

import numpy as np

d = sys.argv[1]
rep = json.load(open(os.path.join(d, 'report.json')))
files, res = {}, []


def env(a, k=160):
  a = np.abs(a); return a[:len(a) // k * k].reshape(-1, k).mean(1)


for r in rep:
  if not r.get('file'): res.append(dict(r, lag=None)); continue
  url = r['url']
  if url not in files:
    path = os.path.join(d, 'f%d.mp3' % len(files))
    urllib.request.urlretrieve(url, path)
    head = open(path, 'rb').read(300000)
    files[url] = dict(path=path, xing=head.find(b'Xing') >= 0, info=head.find(b'Info') >= 0, vbri=head.find(b'VBRI') >= 0)
  f = files[url]
  a0 = max(0, r['at'] - 15)
  ref = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f['path'], '-ss', str(a0), '-t', '35', '-ac', '1',
                                      '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)
  cap = np.fromfile(os.path.join(d, r['file']), np.float32)[1600:1600 + 3 * 16000]
  ec, er = env(cap), env(ref)
  if len(ec) < 100 or len(er) <= len(ec): res.append(dict(r, lag=None, **f)); continue
  cs = [np.corrcoef(ec, er[L:L + len(ec)])[0, 1] for L in range(len(er) - len(ec))]
  L = int(np.nanargmax(cs))
  real = a0 + L * 0.01 - 0.1  # file time the capture began at
  res.append(dict(r, real=real, off=real - (r['t0'] or r['at']), corr=float(cs[L]), **{k: v for k, v in f.items() if k != 'path'}))
  print(r['id'], '%.2f' % r['at'], 'said %.2f' % (r['t0'] or 0), 'real %.2f' % real, 'off %+.2f' % (real - (r['t0'] or r['at'])),
        'corr %.2f' % cs[L], 'xing' if f['xing'] else 'info' if f['info'] else 'vbri' if f['vbri'] else '-')
json.dump(res, open(os.path.join(d, 'result.json'), 'w'), indent=1)
