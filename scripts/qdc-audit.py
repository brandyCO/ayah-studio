#!/usr/bin/env python3
"""Check Quran.com's (QDC) ayah and word times against the audio, every ayah of every surah of one reciter
(GitHub's runners reach download.quranicaudio.com; the cloud workspace cannot).

Quran.com's times are usually right, but some ayat start late (owner report 2026-11-02: Alafasy 37:113–114
played from the second word). Here each ayah is aligned on its own (scripts/align-ayat.py, free audio on both
sides) in a window around Quran.com's times; where its first word really starts more than LATE s before
Quran.com's start (or more than EARLY s after it), the ayah is written down with our own word times, so the app
can play and light it from its real start. Writes OUT_DIR/{id}/{SSS}.json per surah:
{"n": ayat checked, "fix": {a: {"from": ms, "to": ms, "words": [[pos, start, end], ...], "qdc": ms, "lc": conf,
 "med": median word-start difference s}}, "drift": {a: median s}, "skip": {a: reason}}
An ayah is also fixed when its words are off: the median word start more than WORD s from the one heard.

  python3 scripts/qdc-audit.py RECITER_ID OUT_DIR [SURAHS e.g. 1-37]
"""
import importlib.util, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('al', os.path.join(HERE, 'align-ayat.py'))
al = importlib.util.module_from_spec(spec); spec.loader.exec_module(al)
ROOT = os.path.dirname(HERE)
Q = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
SHIFTED = {'2:181', '8:6', '13:37', '15:7', '27:20', '36:22', '37:130'}  # QDC word positions ≠ our words
LATE = float(os.environ.get('LATE', 0.3))   # s: Quran.com starts this much after the first word → fix
EARLY = float(os.environ.get('EARLY', 1.2))  # s: Quran.com starts this much before it (inside the last ayah)
WORD = float(os.environ.get('WORD', 0.3))  # s: median word start off by this much → our word times instead
MIN_LC = -0.8  # letter confidence an ayah needs before its times are trusted over Quran.com's
SEC = al.HOP / al.SR


def get(url):
  with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'AyahStudio/1.0'}), timeout=60) as r:
    return json.loads(r.read())


def rng(spec):
  out = set()
  for part in (spec or '1-114').split(','):
    a, _, b = part.partition('-')
    out.update(range(int(a), int(b or a) + 1))
  return sorted(out)


def first_seg(v):
  segs = [s for s in v.get('segments') or [] if isinstance(s, list) and len(s) >= 3]
  return min((s[1] for s in segs), default=v['timestamp_from'])


def audit(rid, s, out_dir):
  path = os.path.join(out_dir, str(rid), '%03d.json' % s)
  if os.path.exists(path): return
  d = None
  for host in ('api.qurancdn.com', 'api.quran.com'):
    try: d = get('https://%s/api/qdc/audio/reciters/%d/audio_files?chapter=%d&segments=true' % (host, rid, s)); break
    except Exception: pass
  f = d['audio_files'][0]
  vt = sorted(f['verse_timings'], key=lambda v: v['timestamp_from'])
  x = al.load(f['audio_url'])
  em = al.emissions(x)
  T = em.shape[0]
  res = {'n': 0, 'fix': {}, 'skip': {}}
  for i, v in enumerate(vt):
    a = int(v['verse_key'].split(':')[1])
    if a < 1 or a > len(Q[s - 1]): continue
    q0 = first_seg(v) / 1000
    # Window: from 6 s before Quran.com's start (or the previous ayah's start) to 2 s after its end.
    lo = max(0.0, min(q0, v['timestamp_from'] / 1000) - 6)
    if i > 0: lo = max(lo, vt[i - 1]['timestamp_from'] / 1000)
    hi = min(T * SEC, v['timestamp_to'] / 1000 + 2)
    f0, f1 = int(lo / SEC), int(hi / SEC)
    try:
      spans, words, _, _, lc = al._align_em(em[f0:f1], [Q[s - 1][a - 1]], [])
    except Exception as e:
      res['skip'][a] = str(e)[:60]; continue
    res['n'] += 1
    if not words[0] or lc[0] < MIN_LC:
      res['skip'][a] = 'unclear %.2f' % lc[0]; continue
    ours = lo + words[0][0][0]
    # Word level: how far Quran.com's word starts are from the ones heard (same positions; not the 7 shifted ayat).
    key = '%d:%d' % (s, a)
    qs = {seg[0]: seg[1] / 1000 for seg in v.get('segments') or [] if isinstance(seg, list) and len(seg) >= 3}
    diffs = sorted(abs(qs[j + 1] - (lo + w[0])) for j, w in enumerate(words[0]) if j + 1 in qs) if key not in SHIFTED else []
    med = diffs[len(diffs) // 2] if diffs else 0.0
    res.setdefault('drift', {})[a] = round(med, 2)
    if q0 - ours > LATE or ours - q0 > EARLY or med > WORD:
      ws = [[j + 1, round((lo + w[0]) * 1000), round((lo + w[1]) * 1000)] for j, w in enumerate(words[0])]
      if len(ws) != len(al.words_of(Q[s - 1][a - 1])) or ('%d:%d' % (s, a)) in SHIFTED: ws = []
      res['fix'][a] = {'from': round(ours * 1000), 'to': round((lo + spans[0][1]) * 1000), 'words': ws,
                       'qdc': round(q0 * 1000), 'lc': round(lc[0], 2), 'med': round(med, 2)}
      print(rid, key, 'qdc %.2f ours %.2f (%+.2f s) words off %.2f s lc %.2f' % (q0, ours, q0 - ours, med, lc[0]), flush=True)
  os.makedirs(os.path.dirname(path), exist_ok=True)
  json.dump(res, open(path, 'w'), separators=(',', ':'))
  print(rid, s, 'checked', res['n'], 'fix', len(res['fix']), 'unclear', len(res['skip']), flush=True)


def main():
  rid, out_dir = int(sys.argv[1]), sys.argv[2]
  al.model()
  for s in rng(sys.argv[3] if len(sys.argv) > 3 else ''):
    try: audit(rid, s, out_dir)
    except Exception as e: print(rid, s, 'error', e, flush=True)


if __name__ == '__main__':
  main()
