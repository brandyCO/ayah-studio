#!/usr/bin/env python3
"""Ayah times for mp3quran.net recordings that have none (Islam Sobhi) or wrong ones, made by forced
alignment of the audio with our own text (`align-ayat.py`), then held to the same checks as
`verify-mp3quran.py`: every cut in a pause (≥ 12 dB under the speech level, else null: ayat joined in one
breath), plausible pace per ayah, at most half of the cuts unchecked, every ayah clearly heard. Tested first on Alafasy's
everyayah files, whose ayah boundaries are known: all 86 boundaries of 6 surahs fell in the right gap.

Writes the verified surahs into public/data/mp3quran/{name}.json (same format; "aligned": true per surah;
"seek" for a variable-bitrate file: byte offsets of every 50th frame, so the app can still Range-fetch a span).
Long recordings are aligned in ~8 min windows (`align-ayat.py`); results identical to one pass where tested.

  python3 scripts/make-mp3quran-timings.py NAME FOLDER_URL [--surahs 1,112] [--max-min 200]
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
QUIET_DB = 12
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


SEEK_EVERY = 50  # frames (~1.3 s): a VBR file's seek table, so the app can Range-fetch any span exactly


def seek_table(path):
  """Byte offsets of every SEEK_EVERY-th audio frame (frame 0 = the first after a Xing/Info frame, as the app
  counts), stored as the first offset then differences."""
  b = open(path, 'rb').read()
  i = 0
  while b[i:i + 3] == b'ID3':
    i += 10 + ((b[i + 6] & 0x7f) << 21 | (b[i + 7] & 0x7f) << 14 | (b[i + 8] & 0x7f) << 7 | (b[i + 9] & 0x7f)) + (10 if b[i + 5] & 0x10 else 0)
  i = vf.sync(b, i)
  f = vf.frame(b, i)
  mono = (b[i + 3] >> 6) == 3
  side = (17 if mono else 32) if f['spf'] == 1152 else (9 if mono else 17)
  if b[i + 4 + side:i + 8 + side] in (b'Xing', b'Info'): i += f['len']
  offs, k = [], 0
  while i >= 0 and i + 4 <= len(b):
    f = vf.frame(b, i)
    if not f:
      i = vf.sync(b, i + 1); continue
    if k % SEEK_EVERY == 0: offs.append(i)
    i += f['len']; k += 1
  return dict(n=SEEK_EVERY, d=[offs[0]] + [y - x for x, y in zip(offs, offs[1:])])


def analyse(name, folder, s, text, max_min=1e9):
  """Align one surah's recording → raw results (ayah and word spans in s, confidence, cut points in ms, file
  size, seek table), or (None, reason). Nothing is judged here (see `judge`), so results can be kept and
  judged again without the audio."""
  url = '%s%03d.mp3' % (folder, s)
  path = os.path.join(CACHE, name, '%03d.mp3' % s)
  hd, why = vf.header(url)
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
  # Recited before ayah 1 (basmala, isti'adha, either, both or neither): heard, not assumed.
  ay, wd = al.align(x, text, al.opening(x, s, text[0], BASMALA, ISTIADHA))
  conf, lconf = al.LAST_CONF, al.LAST_LCONF
  db = envelope(x)
  speech = float(np.percentile(db, 90))
  n = len(ay)
  cuts = [quietest(db, speech, ay[0][0] - 1.5, ay[0][0] + 0.1)]
  for k in range(n - 1):
    cuts.append(quietest(db, speech, ay[k][1] - 0.1, ay[k + 1][0] + 0.1))
  last = quietest(db, speech, ay[-1][1] - 0.1, ay[-1][1] + 1.5)
  cuts.append(last if last is not None or ay[-1][1] + 1.5 < dur else round(dur * 1000))
  # Each ayah again on its own, following repeats: from its cut (or just before it starts, where the reciter
  # joined two ayat) to the next.
  fps, rep = al.SR / al.HOP, []
  for k in range(n):
    a = cuts[k] / 1000 if cuts[k] is not None else ay[k][0] - 0.3
    b = cuts[k + 1] / 1000 if cuts[k + 1] is not None else ay[k][1] + 0.3
    try:
      segs, c, lc, u = al.align_repeats(x, text[k], [], max(0, int(a * fps)), int(b * fps))
      rep.append(dict(conf=round(c, 3), lconf=round(lc, 3), w=rep_spans(segs, u)))
    except Exception as e:
      rep.append(dict(error=str(e)[:100]))
  raw = dict(size=size, ay=[[round(a * 1000), round(b * 1000)] for a, b in ay], conf=[round(c, 3) for c in conf], lconf=[round(c, 3) for c in lconf],
             w=word_spans(text, wd), c=cuts, r=rep)
  if not hd: raw['seek'] = seek_table(path)
  return raw, None


def word_spans(text, wd):
  """Per ayah [[word number (1-based, our words), startMs, endMs, letter confidence × 100, unexplained letters],
  ...]; words without letters have none."""
  out = []
  for a, ws in zip(text, wd):
    idx = [j + 1 for j, w in enumerate(al.words_of(a)) if al.letters(w)]
    out.append([[j, round(s * 1000), round(e * 1000), round(q * 100), u] for j, (s, e, q, u) in zip(idx, ws)])
  return out


def rep_spans(segs, unexp):
  """align_repeats() segments → [[word number (1-based, our words), startMs, endMs, unexplained letters], ...] in
  the order recited."""
  return [[o + 1, round(a * 1000), round(b * 1000), u] for (o, a, b), u in zip(segs, unexp)]


def judge(raw, text):
  """The checks → ([entry for the json, pace per ayah], note) or (None, reason)."""
  low = [k + 1 for k, c in enumerate(raw['conf']) if c < MIN_CONF]
  if low: return None, 'text not clearly heard in ayah %s' % low[:5]
  cuts = raw['c']
  fails = sum(c is None for c in cuts)
  # Times made by alignment are checked by their confidence, so a cut without a pause only means the reciter
  # joined those ayat (wasl): reels cannot start or end there. More than half joined → left out.
  if fails > len(cuts) // 2: return None, '%d of %d cuts not in a pause' % (fails, len(cuts))
  if any(a is not None and b is not None and b - a < 300 for a, b in zip(cuts, cuts[1:])):
    return None, 'pauses too close together'
  rates = [vf.letters(text[k]) / max(0.05, (b - a) / 1000) for k, (a, b) in enumerate(raw['ay'])]
  out = dict(size=raw['size'], c=cuts, aligned=True)
  if 'seek' in raw: out['seek'] = raw['seek']
  return [out, rates], ('%d cuts unchecked' % fails if fails else None)


def surah(name, folder, s, text, max_min):
  raw, why = analyse(name, folder, s, text, max_min)
  return judge(raw, text) if raw else (None, why)


def main():
  args = sys.argv[1:]
  surahs, max_min = list(range(1, 115)), 200
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
