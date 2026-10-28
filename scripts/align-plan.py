#!/usr/bin/env python3
"""The jobs of .github/workflows/align.yml: every reciter without word timings (everyayah / mp3quran in
src/data/reciters.ts), its 114 surahs split into SHARDS ranges of about equal length (by letters), as a
GitHub Actions matrix. `only`: comma-separated keys to limit the run (e.g. "1003,islam-sobhi"); `surahs`: one
job per reciter for just these surahs (e.g. "112-114", for a test run)."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARDS = 4

src = open(os.path.join(ROOT, 'src', 'data', 'reciters.ts')).read()
quran = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
size = [sum(len(a) for a in s) for s in quran]
only = set(filter(None, (sys.argv[1] if len(sys.argv) > 1 else '').split(',')))
fixed = sys.argv[2] if len(sys.argv) > 2 else ''

jobs = []
for line in src.splitlines():
  if 'qdc: false' not in line or not re.search(r'\{ id: \d+', line): continue
  rid = re.search(r'id: (\d+)', line).group(1)
  m = re.search(r"mp3quran: \{ read: '?([\w-]+)'?", line)
  if m:
    key = m.group(1)
    folder = json.load(open(os.path.join(ROOT, 'public', 'data', 'mp3quran', '%s.json' % key)))['folder']
    kind, source = 'mp3quran', folder
  else:
    kind, key, source = 'everyayah', rid, re.search(r"everyayah: '([^']+)'", line).group(1)
  if only and key not in only: continue
  if not only and "style: 'Mujawwad'" in line: continue  # not reliable yet (Abdul Basit test): Ayah mode only
  if fixed:
    jobs.append(dict(kind=kind, key=key, source=source, surahs=fixed)); continue
  # Contiguous surah ranges of about equal text.
  total, acc, start = sum(size), 0, 1
  for s in range(1, 115):
    acc += size[s - 1]
    if acc >= total * (len([j for j in jobs if j['key'] == key]) + 1) / SHARDS or s == 114:
      jobs.append(dict(kind=kind, key=key, source=source, surahs='%d-%d' % (start, s)))
      start = s + 1
print(json.dumps(jobs))
