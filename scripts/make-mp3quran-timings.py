#!/usr/bin/env python3
"""Ayah times for mp3quran.net recordings that have none (Islam Sobhi) or wrong ones, made by forced
alignment of the audio with our own text (`align-ayat.py`), then held to the same checks as
`verify-mp3quran.py`: every cut in a pause (≥ 12 dB under the speech level, else null: ayat joined in one
breath), plausible pace per ayah, at most a tenth of the cuts unchecked. Tested first on Alafasy's
everyayah files, whose ayah boundaries are known: all 86 boundaries of 6 surahs fell in the right gap.

Writes the verified surahs into public/data/mp3quran/{name}.json (same format; "aligned": true per surah;
"vbr": seconds for a variable-bitrate file, which the app decodes whole, so only files ≤ 4 min).

  python3 scripts/make-mp3quran-timings.py NAME FOLDER_URL [--surahs 1,112] [--max-min 20]
"""
import importlib.util, json, math, os, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def mod(name, file):
  sp = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
  m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


al = mod('align', 'align-ayat.py')
vf = mod('verify', 'verify-mp3quran.py')
CACHE = os.environ.get('MP3_CACHE', os.path.join(ROOT, '.cache', 'mp3quran'))
QUIET_DB, VBR_MAX = 12, 240
MIN_CONF = -1.5  # mean log-probability over an ayah; clearly recited ayat score -0.3..-0.9
BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ'
ISTIADHA = 'أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيۡطَٰنِ ٱلرَّجِيمِ'


def envelope(x):
  n = len(x) // 800  # 50 ms at 16 kHz
  e = np.sqrt((x[:n * 800].reshape(n, 800) ** 2).mean(1) + 1e-12)
  return 20 * np.log10(e)


def quietest(db, speech, lo, hi):
  """(ms of the quietest 50 ms frame within lo..hi s, or None when nothing there is a pause)."""
  a, b = max(0, int(lo / 0.05)), min(len(db), int(math.ceil(hi / 0.05)))
  if b <= a: return None
  k = a + int(np.argmin(db[a:b]))
  return round((k + 0.5) * 50) if db[k] <= speech - QUIET_DB else None


def surah(name, folder, s, text, max_min):
  url = '%s%03d.mp3' % (folder, s)
  path = os.path.join(CACHE, name, '%03d.mp3' % s)
  hd, why = vf.header(url)
  vbr = None
  if not hd:
    if why != 'VBR': return None, why
    b, h = vf.get(url, (0, 0)); size = int(h['Content-Range'].split('/')[-1])
  else: size = hd['size']
  if hd and hd['dur'] > max_min * 60: return None, 'longer than %d min' % max_min
  if not os.path.exists(path) or os.path.getsize(path) != size:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data, _ = vf.get(url)
    open(path, 'wb').write(data)
  x = al.load(path)
  dur = len(x) / al.SR
  if not hd:
    if dur > VBR_MAX: return None, 'VBR and longer than 4 min'
    vbr = round(dur, 3)
  # With and without the isti'adha before the first ayah (some reciters say it): the better path wins.
  base = [] if s in (1, 9) else [BASMALA]
  best = None
  for pre in (base, [ISTIADHA] + base):
    ay, _ = al.align(x, text, pre)
    if best is None or al.LAST_SCORE > best[0]: best = (al.LAST_SCORE, ay, al.LAST_CONF)
  _, ay, conf = best
  low = [k + 1 for k, c in enumerate(conf) if c < MIN_CONF]
  if low: return None, 'text not clearly heard in ayah %s' % low[:5]
  db = envelope(x)
  speech = float(np.percentile(db, 90))
  n = len(ay)
  cuts = [quietest(db, speech, ay[0][0] - 1.5, ay[0][0] + 0.1)]
  for k in range(n - 1):
    cuts.append(quietest(db, speech, ay[k][1] - 0.1, ay[k + 1][0] + 0.1))
  last = quietest(db, speech, ay[-1][1] - 0.1, ay[-1][1] + 1.5)
  cuts.append(last if last is not None or ay[-1][1] + 1.5 < dur else round(dur * 1000))
  fails = sum(c is None for c in cuts)
  if fails > max(1, len(cuts) // 10): return None, '%d of %d cuts not in a pause' % (fails, len(cuts))
  if any(a is not None and b is not None and b - a < 300 for a, b in zip(cuts, cuts[1:])):
    return None, 'pauses too close together'
  rates = [vf.letters(text[k]) / max(0.05, b - a) for k, (a, b) in enumerate(ay)]
  out = dict(size=size, c=cuts, aligned=True)
  if vbr: out['vbr'] = vbr
  return [out, rates], ('%d cuts unchecked' % fails if fails else None)


def main():
  args = sys.argv[1:]
  surahs, max_min = list(range(1, 115)), 20
  if '--surahs' in args:
    k = args.index('--surahs'); surahs = [int(x) for x in args[k + 1].split(',')]; del args[k:k + 2]
  if '--max-min' in args:
    k = args.index('--max-min'); max_min = float(args[k + 1]); del args[k:k + 2]
  name, folder = args
  quran = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
  path = os.path.join(ROOT, 'public', 'data', 'mp3quran', '%s.json' % name)
  doc = json.load(open(path)) if os.path.exists(path) else {'read': name, 'folder': folder, 'surahs': {}}
  # Each surah's result is kept as it is made (CACHE/NAME/results.json), so a long run can be resumed.
  done_path = os.path.join(CACHE, name, 'results.json')
  os.makedirs(os.path.dirname(done_path), exist_ok=True)
  done = json.load(open(done_path)) if os.path.exists(done_path) else {}
  for s in surahs:
    if str(s) in done: continue
    t = time.time()
    try: res, why = surah(name, folder, s, quran[s - 1], max_min)
    except Exception as e: res, why = None, 'error: %s' % e
    print('  %3d: %s%s (%.0f s)' % (s, 'ok' if res else 'left out', ', ' + why if why else '', time.time() - t), flush=True)
    done[str(s)] = res
    json.dump(done, open(done_path, 'w'))
  results = {int(k): v for k, v in done.items() if v and int(k) in surahs}
  rs = sorted(r for _, rates in results.values() for r in rates)
  med = rs[len(rs) // 2] if rs else 0
  kept = 0
  for s, (out, rates) in results.items():
    odd = [k + 1 for k, r in enumerate(rates) if vf.letters(quran[s - 1][k]) >= 8 and not med / 3 <= r <= med * 2.2]
    if odd: print('  %3d: left out, implausible pace in ayah %s' % (s, odd[:5])); continue
    doc['surahs'][str(s)] = out; kept += 1
  doc['surahs'] = dict(sorted(doc['surahs'].items(), key=lambda kv: int(kv[0])))
  doc['checked'] = time.strftime('%Y-%m-%d')
  json.dump(doc, open(path, 'w'), separators=(',', ':'))
  print('%s: %d surahs aligned and verified now, %d in the file' % (name, kept, len(doc['surahs'])))


if __name__ == '__main__':
  main()
