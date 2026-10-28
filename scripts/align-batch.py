#!/usr/bin/env python3
"""Word (and ayah) times for a reciter without them, for a range of surahs: forced alignment of the recording
with our own text (`align-ayat.py`). Writes raw results only — nothing is judged or shipped here; the checks
run afterwards on these files (`make-mp3quran-timings.py` `judge`, and the word checks), so they can change
without listening again. Run by .github/workflows/align.yml, one job per reciter and surah range.

  python3 scripts/align-batch.py everyayah KEY FOLDER 1-6 OUT   (per-ayah files on everyayah.com)
  python3 scripts/align-batch.py mp3quran KEY FOLDER_URL 1-6 OUT (full-surah files on mp3quran.net)

OUT/KEY/SSS.json, one per surah (a surah already there is skipped, so a job can be run again):
  everyayah: {"ayat": [{"conf", "lconf", "w": [[word, startMs, endMs, unexplained], ...], "ms": file length} | {"error"}]}
  mp3quran:  analyse()'s result ({"size", "ay", "conf", "lconf", "w", "c", "r", "seek"?}) or {"error"}
Times are ms in that file; word = 1-based position in our ayah text (words without letters have none). Words
are in the order recited: a word the reciter repeats is listed again (align-ayat.align_repeats).
"""
import importlib.util, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def mod(name, file):
  sp = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
  m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


mk = mod('mk', 'make-mp3quran-timings.py')
al, vf = mk.al, mk.vf


def surahs_of(spec):
  out = []
  for part in spec.split(','):
    a, _, b = part.partition('-'); out += range(int(a), int(b or a) + 1)
  return out


def everyayah(folder, s, text):
  ayat = []
  for a, ayah in enumerate(text, 1):
    url = 'https://everyayah.com/data/%s/%03d%03d.mp3' % (folder, s, a)
    path = os.path.join(mk.CACHE, 'everyayah', folder, '%03d%03d.mp3' % (s, a))
    try:
      if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data, _ = vf.get(url)
        open(path, 'wb').write(data)
      x = al.load(path)
      pre = al.opening(x, s, ayah, mk.BASMALA, mk.ISTIADHA) if a == 1 else []
      segs, conf, lconf, unexp = al.align_repeats(x, ayah, pre)
      ayat.append(dict(conf=round(conf, 3), lconf=round(lconf, 3), w=mk.rep_spans(segs, unexp), ms=round(len(x) / al.SR * 1000)))
    except Exception as e:
      ayat.append(dict(error=str(e)[:200]))
    finally:
      if os.path.exists(path) and not os.environ.get('KEEP_AUDIO'): os.remove(path)
  return dict(ayat=ayat)


def main():
  kind, key, source, spec, outdir = sys.argv[1:6]
  quran = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
  os.makedirs(os.path.join(outdir, key), exist_ok=True)
  al.model()
  stop = time.time() + float(os.environ.get('DEADLINE', 1e9))  # seconds: start no surah after this
  for s in surahs_of(spec):
    path = os.path.join(outdir, key, '%03d.json' % s)
    if os.path.exists(path): continue
    if time.time() > stop: print('deadline: stopping before surah %d' % s); break
    t = time.time()
    try:
      if kind == 'everyayah': res = everyayah(source, s, quran[s - 1])
      else:
        res, why = mk.analyse(key, source, s, quran[s - 1])
        if not res: res = dict(error=why)
        f = os.path.join(mk.CACHE, key, '%03d.mp3' % s)
        if os.path.exists(f) and not os.environ.get('KEEP_AUDIO'): os.remove(f)
    except Exception as e:
      res = dict(error=str(e)[:200])
    json.dump(res, open(path, 'w'), separators=(',', ':'))
    print('%s %3d: %s (%.0f s)' % (key, s, res.get('error', 'ok'), time.time() - t), flush=True)


if __name__ == '__main__':
  main()
