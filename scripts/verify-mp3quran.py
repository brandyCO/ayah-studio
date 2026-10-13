#!/usr/bin/env python3
"""Verify mp3quran.net ayah timings against the audio itself, surah by surah, and keep only what passes.

mp3quran.net has full-surah MP3s with ayah start/end times for ~115 recitations, but the times are
sometimes wrong (shifted labels, a whole surah off by a minute, times past the end of the file). A
reciter from there is offered only for the surahs that pass every check below, in Ayah mode only
(no word timings: rule 8). Per surah:

  1. the file is constant-bitrate MPEG audio (the app Range-fetches the selected ayat by byte offset);
  2. the timings list ayat 1..n of the surah, in order, each start < end, the last end inside the file;
  3. every ayah boundary lies in a pause: around the end of ayah k and the start of ayah k+1 (and
     before ayah 1 / after the last ayah) the audio drops ≥ 12 dB below the surah's speech level
     within 0.45 s before / 0.25 s after; the audio is decoded only around the boundaries (Range requests), not whole;
  4. no ayah is implausibly fast or slow for this reciter (letters per second against their median),
     which catches labels shifted by an ayah that still land in pauses.

Writes public/data/mp3quran/{read}.json — {read, folder, surahs: {n: {size, c: [ms, ...]}}} for the
verified surahs only — and prints a report. `c` holds the n + 1 cut points: the quietest moment of the
pause before ayah 1, between each two ayat and after the last, measured in the audio, so a reel slices
the recording in silence and never clips a voice the timings mark a little late. A boundary without a
pause (ayat joined in one breath, or a wrong time) is null: a reel may not start or end there. A surah
with more than a tenth of its boundaries unchecked (at least 2) is left out. `size` lets the app
notice a replaced file.

Usage: python3 scripts/verify-mp3quran.py [--surahs 1,112] 259 12 221 ...   (needs ffmpeg; network to mp3quran.net)
"""
import json, os, re, ssl, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from array import array
import math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data', 'mp3quran')
API = 'https://www.mp3quran.net/api/v3'
SR_OUT = 8000
HOP = 400  # 50 ms RMS frames at 8 kHz
# How far a boundary may sit from a pause: the text may change up to 0.45 s after the voice starts
# (these timings tend to mark a start a little late), never more than 0.25 s before it.
LATE, EARLY = 0.45, 0.25
TAIL = 1.5  # after the last ayah's end
QUIET_DB = 12  # below the surah's speech level (90th percentile)

ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or None)


def get(url, rng=None, tries=4):
  for k in range(tries):
    try:
      req = urllib.request.Request(url, headers={'User-Agent': 'ayah-studio-verify'})
      if rng: req.add_header('Range', 'bytes=%d-%d' % rng)
      with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
        return r.read(), r.headers
    except Exception:
      if k == tries - 1: raise
      time.sleep(2 ** k)


def api(path):
  return json.loads(get(API + path)[0])


# ---- MP3 frames -------------------------------------------------------------------------------
BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
SRS = [44100, 48000, 32000]


def frame(b, i):
  if i + 4 > len(b) or b[i] != 0xff or (b[i + 1] & 0xe0) != 0xe0: return None
  ver = (b[i + 1] >> 3) & 3
  if ver == 1 or ((b[i + 1] >> 1) & 3) != 1: return None
  bri, sri = b[i + 2] >> 4, (b[i + 2] >> 2) & 3
  if bri in (0, 15) or sri == 3: return None
  m1 = ver == 3
  sr = SRS[sri] // (1 if m1 else 2 if ver == 2 else 4)
  br = (BR1 if m1 else BR2)[bri] * 1000
  spf = 1152 if m1 else 576
  return dict(len=spf // 8 * br // sr + ((b[i + 2] >> 1) & 1), spf=spf, sr=sr, br=br)


def sync(b, i):
  while i + 4 <= len(b):
    f = frame(b, i)
    if f:
      g = frame(b, i + f['len'])
      if g and g['sr'] == f['sr']: return i
    i += 1
  return -1


def header(url):
  """Audio start, bitrate, frame size and file size of a CBR file, or (None, reason)."""
  b, h = get(url, (0, 65535))
  size = int(h['Content-Range'].split('/')[-1])
  start = 0
  if b[:3] == b'ID3':
    start = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9])
    if start + 8192 > len(b): b, _ = get(url, (start, start + 65535)); base = start
    else: b = b[start:]; base = start
  else: base = 0
  i = sync(b, 0)
  if i < 0: return None, 'no MPEG frames'
  f = frame(b, i)
  first = b[i:i + f['len']]
  if b'Xing' in first or b'VBRI' in first: return None, 'VBR'
  if b'Info' in first: i += f['len']  # LAME's CBR info frame holds no audio
  brs, j = set(), i
  for _ in range(150):
    g = frame(b, j)
    if not g: break
    brs.add(g['br']); j += g['len']
  if brs != {f['br']}: return None, 'mixed bitrates %s' % sorted(brs)
  return dict(start=base + i, br=f['br'], sr=f['sr'], spf=f['spf'], size=size,
              dur=(size - base - i) * 8 / f['br']), None


def decode(data):
  p = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', 'pipe:0', '-ac', '1', '-ar', str(SR_OUT), '-f', 's16le', 'pipe:1'],
                     input=data, capture_output=True)
  a = array('h'); a.frombytes(p.stdout[:len(p.stdout) // 2 * 2])
  return a


def envelope(a):
  out = []
  for k in range(0, len(a) - HOP + 1, HOP):
    s = 0
    for v in a[k:k + HOP]: s += v * v
    out.append(10 * math.log10(s / HOP + 1e-9))
  return out


def window(url, hd, t0, t1):
  """dB envelope of the file between t0 and t1 seconds → (time of the first value, values)."""
  bps = hd['br'] / 8
  flen = hd['spf'] / hd['sr']
  a = max(0, int(hd['start'] + (t0 - 0.4) * bps))
  e = min(hd['size'] - 1, int(hd['start'] + t1 * bps) + 4000)
  b, _ = get(url, (a, e))
  i = sync(b, 0)
  if i < 0: return 0, []
  # Whole frames only; align the decoded audio by its end (the first frames may lack their reservoir).
  j, n = i, 0
  while True:
    f = frame(b, j)
    if not f or j + f['len'] > len(b): break
    j += f['len']; n += 1
  k0 = round((a + i - hd['start']) / (bps * flen))
  tend = (k0 + n) * flen
  pcm = decode(b[i:j])
  return tend - len(pcm) / SR_OUT, envelope(pcm)


LETTERS = re.compile('[ء-يٱ]')


def letters(s):
  return len(LETTERS.findall(s.split('\xa0')[0]))


def check_surah(read, folder, s, text):
  url = '%s%03d.mp3' % (folder, s)
  t = [x for x in api('/ayat_timing?surah=%d&read=%d' % (s, read)) if x['ayah']]
  n = len(text)
  if [x['ayah'] for x in t] != list(range(1, n + 1)): return None, 'ayah list', None
  st = [(x['start_time'] / 1000, x['end_time'] / 1000) for x in t]
  for k, (a, b) in enumerate(st):
    if not a < b: return None, 'ayah %d: start ≥ end' % (k + 1), None
    if k and a < st[k - 1][1] - 0.01: return None, 'ayah %d overlaps the previous one' % (k + 1), None
  hd, why = header(url)
  if not hd: return None, why, None
  if st[-1][1] > hd['dur'] + 0.2: return None, 'last ayah ends after the file (%.1f > %.1f s)' % (st[-1][1], hd['dur']), None
  rates = [letters(text[k]) / (b - a) for k, (a, b) in enumerate(st)]
  # Boundaries: before ayah 1, between ayat, after the last.
  spans = [(st[0][0], st[0][0])] + [(st[k][1], st[k + 1][0]) for k in range(n - 1)] + [(st[-1][1], st[-1][1])]
  # The last ayah may ring on a little past its end (or run to the end of the file).
  wins = [window(url, hd, a - LATE - 0.5, b + (TAIL if k == n else EARLY) + 0.5) for k, (a, b) in enumerate(spans)]
  allv = sorted(v for _, w in wins for v in w)
  if not allv: return None, 'no audio decoded', None
  speech = allv[int(len(allv) * 0.9)]
  fails, cuts = [], []
  for k, ((a, b), (w0, w)) in enumerate(zip(spans, wins)):
    lo, hi = a - LATE, b + (TAIL if k == n else EARLY)
    vals = [(v, w0 + (m + 0.5) * HOP / SR_OUT) for m, v in enumerate(w)]
    vals = [x for x in vals if lo <= x[1] <= hi]
    if vals and min(vals)[0] <= speech - QUIET_DB: cuts.append(round(min(vals)[1] * 1000))  # the quietest moment
    elif k == n and hi >= hd['dur']: cuts.append(int(hd['dur'] * 1000))  # the recording ends there
    else: fails.append(k); cuts.append(None)  # no pause: ayat joined in one breath, or a wrong time
  # A few joined ayat are normal; many mean the times are off for this surah.
  if len(fails) > max(1, len(spans) // 10):
    return None, '%d of %d boundaries not in a pause (first: %s)' % (len(fails), len(spans),
      'before ayah 1' if fails[0] == 0 else 'after ayah %d' % fails[0]), rates
  if any(a is not None and b is not None and b - a < 300 for a, b in zip(cuts, cuts[1:])):
    return None, 'pauses too close together', rates
  return dict(size=hd['size'], c=cuts), ('%d boundaries unchecked' % len(fails) if fails else None), rates


def main():
  reads = {r['id']: r for r in api('/ayat_timing/reads')}
  quran = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
  os.makedirs(OUT, exist_ok=True)
  args = sys.argv[1:]
  surahs = list(range(1, 115))
  if '--surahs' in args:
    k = args.index('--surahs'); surahs = [int(x) for x in args[k + 1].split(',')]; del args[k:k + 2]
  for read in map(int, args):
    r = reads[read]
    folder = r['folder_url']
    print('read %d %s (%s) %s' % (read, r['name'], r['rewaya'], folder), flush=True)
    with ThreadPoolExecutor(8) as ex:
      first = list(ex.map(lambda s: (s, check_surah(read, folder, s, quran[s - 1])), surahs))
    # Pace check against the reciter's median, over the surahs whose boundaries passed.
    rs = sorted(x for _, (ok, _, rates) in first if ok and rates for x in rates)
    med = rs[len(rs) // 2] if rs else None
    out, report = {}, []
    for s, (ok, why, rates) in first:
      if ok and med:
        odd = ['%d (%.1f×)' % (k + 1, x / med) for k, x in enumerate(rates) if letters(quran[s - 1][k]) >= 8 and not med / 3 <= x <= med * 2.2]
        if odd: ok, why = None, 'implausible pace in ayah %s' % ', '.join(odd[:5])
      if ok: out[str(s)] = ok
      if why: report.append('  %3d: %s%s' % (s, 'kept, ' if ok else '', why))
    print('  median pace %.1f letters/s; verified %d of %d surahs' % (med or 0, len(out), len(surahs)))
    print('\n'.join(report), flush=True)
    path = os.path.join(OUT, '%d.json' % read)
    old = json.load(open(path)) if os.path.exists(path) and len(surahs) < 114 else {'surahs': {}}
    for s in surahs: old['surahs'].pop(str(s), None)
    old['surahs'].update(out)
    old['surahs'] = dict(sorted(old['surahs'].items(), key=lambda kv: int(kv[0])))
    with open(path, 'w') as f:
      json.dump({'read': read, 'folder': folder, 'checked': time.strftime('%Y-%m-%d'), 'surahs': old['surahs']},
                f, separators=(',', ':'))


if __name__ == '__main__':
  main()
