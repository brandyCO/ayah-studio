#!/usr/bin/env python3
"""Who is right where the timing audit moved an ayah's start: Quran.com or our aligner? A real start has quiet just
before it and the voice just after it. For a sample of moved ayat per reciter, the loudness contrast (dB, 0.25 s
after vs 0.25 s before) is measured at both starts on the recording itself.

  python3 scripts/qdc-fix-check.py OUT.json [per reciter, default 40]
"""
import json, os, random, subprocess, sys, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'public', 'data', 'qdc-fix')
W = 0.25


def get(url):
  with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'AyahStudio/1.0'}), timeout=60) as r: return r.read()


def contrast(x, t):
  a, b, c = int((t - W) * 16000), int(t * 16000), int((t + W) * 16000)
  if a < 0 or c > len(x): return None
  rms = lambda s: np.sqrt(np.mean(s ** 2)) + 1e-6
  return float(20 * np.log10(rms(x[b:c]) / rms(x[a:b])))


def main():
  out, per = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 40
  index = json.load(open(os.path.join(FIX, 'index.json')))
  rep = {}
  rnd = random.Random(7)
  for rid, ss in index.items():
    picks = []
    for s in map(int, ss.split(',')):
      d = json.load(open(os.path.join(FIX, rid, '%03d.json' % s)))
      if s >= 30: picks += [(s, int(a), v) for a, v in d.items() if 'f' in v]  # short files
    rnd.shuffle(picks); picks = sorted(picks[:per * 3], key=lambda p: p[0])  # grouped: one download per surah
    res, files = [], {}
    for s, a, v in picks:
      if len(res) >= per: break
      try:
        if s not in files:
          j = json.loads(get('https://api.qurancdn.com/api/qdc/audio/reciters/%s/audio_files?chapter=%d&segments=true' % (rid, s)))
          f = j['audio_files'][0]
          vt = {x['verse_key']: x for x in f['verse_timings']}
          path = '/tmp/fc.mp3'; open(path, 'wb').write(get(f['audio_url']))
          pcm = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout
          files = {s: (np.frombuffer(pcm, np.float32), vt)}
        x, vt = files[s]
        q = vt['%d:%d' % (s, a)]
        segs = [g for g in q.get('segments') or [] if isinstance(g, list) and len(g) >= 3]
        q0 = min((g[1] for g in segs), default=q['timestamp_from']) / 1000
        ours = v['f'] / 1000
        if abs(q0 - ours) < 0.3: continue
        cq, co = contrast(x, q0), contrast(x, ours)
        if cq is None or co is None: continue
        res.append({'s': s, 'a': a, 'qdc': q0, 'ours': ours, 'c_qdc': round(cq, 1), 'c_ours': round(co, 1)})
      except Exception as e:
        print(rid, s, a, e, flush=True)
    wins = sum(r['c_ours'] > r['c_qdc'] for r in res)
    rep[rid] = {'n': len(res), 'ours_better': wins, 'median_c_qdc': float(np.median([r['c_qdc'] for r in res])) if res else None,
                'median_c_ours': float(np.median([r['c_ours'] for r in res])) if res else None, 'items': res}
    print(rid, len(res), 'ours better', wins, rep[rid]['median_c_qdc'], rep[rid]['median_c_ours'], flush=True)
  json.dump(rep, open(out, 'w'), indent=1)


main()
