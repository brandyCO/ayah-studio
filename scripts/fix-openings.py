#!/usr/bin/env python3
"""How each full-surah recording opens, heard in the audio, so that every surah is listened to with its Bismillah
and the Bismillah line can light up while it is recited (public/data/basmala.json, read by src/data/basmala.ts):

- `missing`: surahs whose file has no Bismillah of its own (heard by a greedy read-back of the opening with the
  Quran-trained model of align-ayat.py; "all" for everyayah's per-ayah files, whose ayah 1 never holds it);
- `spans`: {surah: [fromMs, toMs]} where it is recited, found by aligning isti'adha (when heard) + Bismillah +
  ayah 1 over the audio up to ayah 2;
- `src`: where the same reciter says it in his own voice (the clearest span, or everyayah's 001001.mp3), played
  before a surah that lacks it;
- `skip`: {surah: ms} a spoken announcement before the recitation (a few uploads), skipped in Listen.

The same alignment checks ayah 1's start: where the word times put it more than 0.8 s away (an opening such as
الٓمٓ matched onto the end of the Bismillah), ayah 1 is timed again inside its aligned span and kept only when it
passes the checks of make-word-timings.py.

  python3 scripts/fix-openings.py RESULTS_DIR [key ...]   (RESULTS_DIR: a checkout of the branch align-results)
  AUDIT=opening.jsonl reuses earlier read-backs ({"k", "s", "heard"} per line).
"""
import importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def mod(name, file):
  sp = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
  m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


al = mod('al', 'align-ayat.py')
mw = mod('mw', 'make-word-timings.py')
ls = mod('ls', 'make-listen-starts.py')
mw.al = al  # one model
Q = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs']
BISM = Q[0][0]
ISTI = 'أعوذ بالله من الشيطان الرجيم'
HOP_MS = 20
ONLY_S = {int(x) for x in os.environ.get('SURAHS', '').split(',') if x}  # testing


def retime(x, s, a, lo, hi):
  """Word times of ayah s:a within x (seconds lo..hi), allowing repeats, judged like every other ayah."""
  segs, conf, lconf, unexp = al.align_repeats(x, Q[s - 1][a - 1], (), int(lo * 1000 / HOP_MS), int(hi * 1000 / HOP_MS))
  words = [[o + 1, round(b * 1000), round(e * 1000), u] for (o, b, e), u in zip(segs, unexp)]
  return mw.ayah_words(Q[s - 1][a - 1], words, conf, lconf, round(lo * 1000), round(hi * 1000))


MARKS = ('بس', 'بسم', 'بسن', 'بمل', 'رحيم', 'رحمن', 'لرحي', 'ممنل', 'منلرح')


def norm(t):
  return t.replace('ـ', '').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')


def isti(h):
  return 'عوذ' in h[:8] or 'عذ' in h[:4]


def has_bismillah(heard, s, start=None):
  """Read-back of a recording's opening → whether the Bismillah is recited (for Al-Fatiha: before Al-Hamd).
  `start`: aligned start (ms) of ayah 1; more than 2.5 s of audio before it, without an isti'adha, counts as
  present (something is recited there that the read-back missed)."""
  h = norm(heard)
  if s == 1:
    pre = h[:h.find('الحمد')] if 'الحمد' in h else h[:30]
    return any(m in pre for m in ('بس', 'سمل', 'رحيم', 'رحمن', 'لرح'))
  if start is not None and start > 2500 and not isti(h): return True
  k = h.find('شيط')
  if 0 <= k <= 30: h = h[k + 5:]
  elif isti(h): h = h[18:]
  region = h[:22]
  if 'سمل' in region[:12] or 'سمال' in region[:12]: return True
  # the surah's own opening words (ayat 1–3: a short first ayah such as حمٓ is followed by words like الرحمن)
  own = norm(''.join(c for a in Q[s - 1][:3] for c in a.rsplit('\xa0', 1)[0] if 'ء' <= c <= 'ي' or c == 'ٱ'))[:40]
  if region.startswith('ب') or (region[1:2] == 'ب' and region[:1] in 'ميرن'): return True
  return any(m in region and m not in own for m in MARKS)


def ranges(nums):
  return mw.ranges(sorted(set(nums)))


def expand(r):
  out = []
  for p in filter(None, r.split(',')):
    a, _, b = p.partition('-'); out += range(int(a), int(b or a) + 1)
  return out


def put_words(wdir, s, a, w):
  p = os.path.join(wdir, '%03d.json' % s)
  d = json.load(open(p)) if os.path.exists(p) else {'a': {}}
  d['a'][str(a)] = w
  d['a'] = dict(sorted(d['a'].items(), key=lambda kv: int(kv[0])))
  os.makedirs(wdir, exist_ok=True); json.dump(d, open(p, 'w'), separators=(',', ':'))


def main():
  res = sys.argv[1]
  only = set(sys.argv[2:])
  al.model()
  heard_of = {}
  if os.environ.get('AUDIT'):
    for l in open(os.environ['AUDIT']):
      r = json.loads(l)
      if r.get('heard') is not None: heard_of[(r['k'], r['s'])] = r['heard']
  rec_path = os.path.join(ROOT, 'src', 'data', 'reciters.ts')
  rec = open(rec_path).read()
  bpath = os.path.join(ROOT, 'public', 'data', 'basmala.json')
  out = json.load(open(bpath)) if os.path.exists(bpath) else {}
  # Recordings not in the app yet (scripts/new-recordings.json): their surahs and cuts from the alignment itself.
  newrec = {r['key']: r for r in json.load(open(os.path.join(HERE, 'new-recordings.json')))}
  lines = rec.splitlines() + ["{ id: 0, qdc: false, mp3quran: { read: '%s', surahs: '' } }" % k for k in newrec if k in only]
  for line in lines:
    m = re.search(r"\{ id: (\d+),", line)
    if not m or 'qdc: false' not in line: continue
    rid = m.group(1)
    mq = re.search(r"mp3quran: \{ read: '?([\w-]+)'?, surahs: '([^']*)'", line)
    key = mq.group(1) if mq else rid
    if only and key not in only: continue
    if not mq:
      out[key] = {'missing': 'all', 'src': 'everyayah'}
      continue
    wdir = os.path.join(ROOT, 'public', 'data', 'words', key)
    words_ok = os.path.isdir(wdir)
    if key in newrec:
      doc = {'folder': newrec[key]['folder'], 'surahs': {}}
      for f in sorted(os.listdir(os.path.join(res, 'align2', key))) if os.path.isdir(os.path.join(res, 'align2', key)) else []:
        r = json.load(open(os.path.join(res, 'align2', key, f)))
        if r.get('c') and not r.get('error'): doc['surahs'][str(int(f[:3]))] = {'c': r['c'], 'size': r.get('size')}
    else:
      doc = json.load(open(os.path.join(ROOT, 'public', 'data', 'mp3quran', '%s.json' % key)))
    prev = out.get(key, {})
    missing = [x for x in expand(prev.get('missing', '')) if x not in ONLY_S] if ONLY_S else []
    spans = {k_: v_ for k_, v_ in prev.get('spans', {}).items() if ONLY_S and int(k_) not in ONLY_S}
    skip = {k_: v_ for k_, v_ in prev.get('skip', {}).items() if ONLY_S and int(k_) not in ONLY_S}
    best = None
    for s_, v in sorted(doc['surahs'].items(), key=lambda kv: int(kv[0])):
      s = int(s_)
      if ONLY_S and s not in ONLY_S: continue
      if s == 9: continue
      try: raw = json.load(open(os.path.join(res, 'align2', key, '%03d.json' % s)))
      except Exception: raw = {}
      c = list(v['c'])
      st = ls.listen_starts(v, raw) if raw else {}
      c = [x if x is not None else st.get(str(i + 1)) for i, x in enumerate(c)]
      a1 = raw['ay'][0][0] if raw.get('ay') else None
      end = c[1] if len(c) > 1 and c[1] else (raw['ay'][1][0] if raw.get('ay') and len(raw['ay']) > 1 else None)
      url = '%s%03d.mp3' % (doc['folder'], s)
      heard = heard_of.get((key, s))
      x = None
      if heard is None:
        try: x = al.load(url, 0, max(22, (end or 0) / 1000 + 0.3))
        except Exception as e: print(key, s, 'load', e); continue
        al.LAST_EM, al._EM_OF = al.emissions(x), x
        heard = ''.join(al.read_back(0, 22))
      heard = norm(heard)
      if not has_bismillah(heard, s, a1):
        missing.append(s); continue
      if s == 1 or not end or len(c) < 2: continue
      announce = any(w in heard[:30] for w in ('حصري', 'موقع'))
      try:
        if x is None: x = al.load(url, 0, end / 1000 + 0.3)
        em = al.emissions(x)[:int(end / HOP_MS)]
        pre = [ISTI] if isti(heard) or announce else []
        sp, _, _, _, lc = al._align_em(em, [BISM, Q[s - 1][0]], pre)
      except Exception as e:
        print(key, s, 'align', e); continue
      if lc[0] > -3.5:
        b0, b1 = round(sp[0][0] * 1000), round(sp[0][1] * 1000)
        spans[s_] = [b0, b1]
        if announce: skip[s_] = max(0, b0 - 300)
        if best is None or lc[0] > best[0]: best = (lc[0], s)
        # ayah 1 placed on the Bismillah: time it again inside its own span
        if words_ok and lc[1] > -1:
          p = os.path.join(wdir, '%03d.json' % s)
          d = json.load(open(p)) if os.path.exists(p) else {'a': {}}
          w1 = d['a'].get('1')
          if not w1 or abs(w1[0][1] - sp[1][0] * 1000) > 800:
            w = retime(x, s, 1, max(sp[1][0] - 0.1, sp[0][1]), min(end / 1000, len(x) / al.SR))
            if w:
              put_words(wdir, s, 1, w); print(key, '%d:1 retimed' % s, w1 and w1[0][1], '→', w[0][1])
    e = {'missing': ranges(missing), 'spans': spans}
    if skip: e['skip'] = skip
    if best: e['src'] = {'surah': best[1], 'from': spans[str(best[1])][0], 'to': spans[str(best[1])][1]}
    elif prev.get('src'): e['src'] = prev['src']
    out[key] = e
    print(key, 'no Bismillah in', e['missing'] or 'none', '· own Bismillah from', best and best[1], flush=True)
    if words_ok:
      got = [int(f[:3]) for f in os.listdir(wdir) if f.endswith('.json')]
      new = re.sub(r", words: '[^']*'", '', line)
      new = re.sub(r'\s*\},\s*$', ", words: '%s' }," % ranges(got), new)
      rec = rec.replace(line, new)
    json.dump(out, open(bpath, 'w'), separators=(',', ':'), sort_keys=True)
    open(rec_path, 'w').write(rec)


if __name__ == '__main__':
  main()
