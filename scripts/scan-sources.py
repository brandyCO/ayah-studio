#!/usr/bin/env python3
"""List the recordings on free sources — of the reciters we have (new recordings) and of reciters we do not
have yet — and look for more recordings of the reciters we have, on free sources this app may use, and tell apart
recordings we already have from new ones by their sound. Run by .github/workflows/align.yml (input scan = yes) (GitHub's
runners reach sites the cloud workspace cannot); writes OUT (JSON) for a person to review — nothing is added
to the app here.

Sources: quranicaudio.com (its qari list; full-surah files on download.quranicaudio.com) and archive.org
(items with full-surah MP3s whose title or creator names one of our reciters; its licence field kept).
Sound check: the loudness envelope (20 ms) of one ayah from a recording we have (everyayah's ayah file, or a
stretch of our mp3quran surah file) is slid along the candidate's surah file; a peak correlation ≥ 0.9 on both
test ayat means the same recording.

  python3 scripts/scan-sources.py OUT.json
"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'AyahStudio-scan/1.0 (github.com/brandyCO/ayah-studio)'}
TESTS = ((113, 3), (114, 2))


def get(url, timeout=60):
  with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
    return r.read()


def env(url):
  x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'quiet', '-t', '240', '-i', url, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'],
                                   capture_output=True, timeout=300).stdout, dtype=np.float32)
  h = 160; n = len(x) // h
  if n < 50: raise ValueError('no audio')
  return np.log10((x[:n * h].reshape(n, h) ** 2).mean(1) + 1e-7)


def slide(big, small):
  small = small[(small > small.max() - 3.5).argmax():][:150]
  k = len(small); sn = (small - small.mean()) / (small.std() + 1e-9); best = -1.0
  for i in range(0, max(1, len(big) - k)):
    w = big[i:i + k]
    if len(w) < k: break
    best = max(best, float(((w - w.mean()) / (w.std() + 1e-9) * sn).mean()))
  return round(best, 3)


# --- our recordings, by reciter name ---
src = open(os.path.join(ROOT, 'src', 'data', 'reciters.ts')).read()
ours = {}
for line in src.splitlines():
  m = re.search(r"\{ id: (\d+), name: (['\"])(.+?)\2", line)
  if not m: continue
  rid, name = int(m.group(1)), m.group(3)
  ea = re.search(r"everyayah: '([^']+)'", line)
  mq = re.search(r"mp3quran: \{ read: '?([\w-]+)'?", line)
  rec = {'id': rid}
  if ea: rec['everyayah'] = ea.group(1)
  if mq:
    p = os.path.join(ROOT, 'public', 'data', 'mp3quran', '%s.json' % mq.group(1))
    if os.path.exists(p): rec['mp3quran'] = json.load(open(p))['folder']
  ours.setdefault(name, []).append(rec)


def our_samples(name):
  """Per test ayah: [(our id, envelope of that ayah)]."""
  out = {t: [] for t in TESTS}
  for rec in ours[name]:
    for s, a in TESTS:
      try:
        if 'everyayah' in rec: e = env('https://everyayah.com/data/%s/%03d%03d.mp3' % (rec['everyayah'], s, a))
        elif 'mp3quran' in rec:
          big = env('%s%03d.mp3' % (rec['mp3quran'], s)); n = len(big); e = big[n // 3:n // 3 + 200]
        else: continue
        out[(s, a)].append((rec['id'], e))
      except Exception:
        pass
  return out


def words(name):
  return [w for w in re.split(r"[^a-z]+", name.lower().replace('abdur', 'abdul')) if len(w) > 2 and w not in ('abdul', 'abd', 'muhammad', 'mohamed', 'mohammad', 'ibn', 'bin')]


# --- candidates ---
cands = []
try:
  qaris = json.loads(get('https://quranicaudio.com/api/qaris'))
  for q in qaris:
    cands.append({'source': 'quranicaudio', 'title': q.get('name'), 'url': 'https://download.quranicaudio.com/quran/%s' % q.get('relative_path', ''),
                  'section': q.get('section_id'), 'licence': 'quranicaudio.com (free use)'})
except Exception as e:
  print('quranicaudio:', e, file=sys.stderr)

for name in ours:
  key = words(name)
  if not key: continue
  q = 'mediatype:audio AND (%s)' % ' AND '.join('(title:%s OR creator:%s)' % (w, w) for w in key[-2:])
  try:
    res = json.loads(get('https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(
      {'q': q, 'fl[]': ['identifier', 'title', 'licenseurl'], 'rows': 40, 'output': 'json'}, doseq=True)))
  except Exception as e:
    print('archive search', name, e, file=sys.stderr); continue
  for d in res.get('response', {}).get('docs', []):
    try:
      meta = json.loads(get('https://archive.org/metadata/%s' % d['identifier']))
    except Exception:
      continue
    files = {f['name']: f for f in meta.get('files', []) if f.get('name', '').lower().endswith('.mp3')}
    # a full-surah set: names ending in 113 / 114 (001.mp3 … 114.mp3 and the like)
    pick = {}
    for s in (113, 114):
      m = [f for f in files if re.search(r'(^|[^0-9])0*%d\.mp3$' % s, f.split('/')[-1])]
      if m: pick[s] = sorted(m, key=len)[0]
    if len(pick) == 2 and len(files) >= 100:
      cands.append({'source': 'archive.org', 'title': d.get('title'), 'item': d['identifier'], 'licence': d.get('licenseurl') or meta.get('metadata', {}).get('licenseurl'),
                    'files': {str(k): 'https://archive.org/download/%s/%s' % (d['identifier'], urllib.parse.quote(v)) for k, v in pick.items()},
                    'n_mp3': len(files), 'guess': name})

# --- compare ---
cache = {}
out = []
for c in cands:
  name = c.get('guess')
  if not name:
    t = (c['title'] or '').lower()
    name = next((n for n in ours if words(n) and all(w in t.replace('-', ' ') for w in words(n)[-1:])), None)
  if not name:  # a reciter we do not have yet: listed for review, not compared
    c['reciter'] = None
    out.append(c)
    continue
  c['reciter'] = name
  if name not in cache: cache[name] = our_samples(name)
  scores = {}
  for s, a in TESTS:
    url = c['files'][str(s)] if 'files' in c else '%s%03d.mp3' % (c['url'], s)
    try: big = env(url)
    except Exception as e:
      scores['err'] = str(e)[:80]; break
    for rid, e in cache[name][(s, a)]:
      scores.setdefault(str(rid), []).append(slide(big, e))
  c['scores'] = scores
  c['same_as'] = [rid for rid, v in scores.items() if rid != 'err' and len(v) == 2 and min(v) >= 0.9]
  out.append(c)
  print(json.dumps(c, ensure_ascii=False), flush=True)

json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
