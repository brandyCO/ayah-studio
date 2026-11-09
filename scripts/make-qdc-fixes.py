#!/usr/bin/env python3
"""Turn the timing audit of the Quran.com recordings (scripts/qdc-audit.py, `qdc-audit/{id}/{SSS}.json` on the
`align-results` branch) into the corrections the app applies (src/data/qdc.ts):

  public/data/qdc-fix/{id}/{SSS}.json   {ayah: {"f": from ms, "t": to ms, "w": [[pos, start, end], ...]}}
                                        or {"f", "t", "d": ms} = Quran.com's word times moved by d
  public/data/qdc-fix/index.json        {id: "19,25,37"}: the surahs that have a file

An ayah the audit heard clearly and found off gets its heard start, end and words. An ayah it could not hear
clearly keeps Quran.com's times, unless both neighbours were found moved by the same amount (within 0.15 s):
then that ayah is moved with them (its words keep their spacing).

  python3 scripts/make-qdc-fixes.py AUDIT_DIR
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data', 'qdc-fix')
SAME = 150  # ms
# Checked on the audio (scripts/qdc-fix-check.py, 40 moved ayat per reciter, 2026-11-09): where Quran.com starts an
# ayah too late (the "plays from the middle" bug) the heard start was right in 96 % of cases for every reciter but
# Shuraim (10). Where our start is earlier than Quran.com's, it was right only for these reciters (≥ 75 %):
EARLY_OK = {'1', '7', '9', '161'}
SKIP = {'10'}  # Shuraim: Quran.com was right in 37 of 40


def keep(rid, delta):
  """delta = heard start − Quran.com's start (ms)."""
  return rid not in SKIP and (delta > 0 or rid in EARLY_OK)


def main():
  src = sys.argv[1]
  index, total = {}, 0
  for rid in sorted(os.listdir(src), key=int):
    for name in sorted(os.listdir(os.path.join(src, rid))):
      d = json.load(open(os.path.join(src, rid, name)))
      fix = {int(a): v for a, v in d.get('fix', {}).items()}
      out = {}
      for a, v in fix.items():
        if not keep(rid, v['from'] - v['qdc']): continue
        e = {'f': v['from'], 't': v['to']}
        if v['words']: e['w'] = v['words']
        else: e['d'] = v['from'] - v['qdc']
        out[a] = e
      # Unclear ayat between two neighbours moved alike: move them too.
      for a in (int(x) for x in d.get('skip', {})):
        p, n = fix.get(a - 1), fix.get(a + 1)
        if not p or not n: continue
        dp, dn = p['from'] - p['qdc'], n['from'] - n['qdc']
        if abs(dp - dn) <= SAME and abs(dp) > 0 and keep(rid, dp): out[a] = {'d': round((dp + dn) / 2)}
      if not out: continue
      os.makedirs(os.path.join(OUT, rid), exist_ok=True)
      json.dump({str(a): out[a] for a in sorted(out)}, open(os.path.join(OUT, rid, name), 'w'), separators=(',', ':'))
      index.setdefault(rid, []).append(int(name[:3]))
      total += len(out)
  json.dump({k: ','.join(map(str, v)) for k, v in index.items()}, open(os.path.join(OUT, 'index.json'), 'w'), indent=0)
  print('reciters', len(index), 'surahs', sum(map(len, index.values())), 'ayat', total)


main()
