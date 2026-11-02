#!/usr/bin/env python3
"""How each Quran.com (QDC) surah recording of one reciter opens, heard in the audio (GitHub's runners reach
download.quranicaudio.com; the cloud workspace cannot). For every surah but At-Tawbah: whether the Bismillah is
recited (read-back, as scripts/fix-openings.py), where (isti'adha + Bismillah + ayah 1 aligned up to ayah 2), and
where ayah 1's first word really starts — Quran.com's timings usually start ayah 1 at 0 ms, so its first word
would be lit during the Bismillah. Writes OUT_DIR/qdc{id}.json:
{"missing": [s...], "spans": {s: [fromMs, toMs]}, "first": {s: ms}, "conf": {s: [bism, ayah1]}, "heard": {s: text}}.
scripts/fix-openings.py --qdc DIR merges it into public/data/basmala.json.

  python3 scripts/qdc-openings.py RECITER_ID OUT_DIR
"""
import importlib.util, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sp = importlib.util.spec_from_file_location('fo', os.path.join(HERE, 'fix-openings.py'))
fo = importlib.util.module_from_spec(sp); sp.loader.exec_module(fo)
al, Q = fo.al, fo.Q


def get(url):
  with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'AyahStudio/1.0'}), timeout=60) as r:
    return json.loads(r.read())


def main():
  rid, out_dir = int(sys.argv[1]), sys.argv[2]
  al.model()
  res = {'missing': [], 'spans': {}, 'first': {}, 'conf': {}, 'heard': {}}
  for s in range(1, 115):
    if s == 9: continue
    try:
      d = None
      for host in ('api.qurancdn.com', 'api.quran.com'):
        try: d = get('https://%s/api/qdc/audio/reciters/%d/audio_files?chapter=%d&segments=true' % (host, rid, s)); break
        except Exception: pass
      f = d['audio_files'][0]
      vt = sorted(f['verse_timings'], key=lambda v: v['timestamp_from'])
      end = vt[1]['timestamp_from'] if len(vt) > 1 else vt[0]['timestamp_to']
      x = al.load(f['audio_url'], 0, max(22, end / 1000 + 0.3))
      al.LAST_EM, al._EM_OF = al.emissions(x), x
      heard = fo.norm(''.join(al.read_back(0, 22)))
      res['heard'][s] = heard[:90]
      first = vt[0]['segments'][0][1] if vt[0]['segments'] and len(vt[0]['segments'][0]) > 1 else vt[0]['timestamp_from']
      if not fo.has_bismillah(heard, s, first if first > 0 else None):
        res['missing'].append(s); print(rid, s, 'no Bismillah', flush=True); continue
      if s == 1: continue
      em = al.LAST_EM[:int(end / fo.HOP_MS)]
      pre = [fo.ISTI] if fo.isti(heard) else []
      sp_, _, _, _, lc = al._align_em(em, [fo.BISM, Q[s - 1][0]], pre)
      res['conf'][s] = [round(lc[0], 2), round(lc[1], 2)]
      if lc[0] > -3.5:
        res['spans'][s] = [round(sp_[0][0] * 1000), round(sp_[0][1] * 1000)]
        if lc[1] > -1: res['first'][s] = round(sp_[1][0] * 1000)
      print(rid, s, res['spans'].get(s), res['first'].get(s), res['conf'][s], flush=True)
    except Exception as e:
      print(rid, s, 'error', e, flush=True)
  os.makedirs(out_dir, exist_ok=True)
  json.dump(res, open(os.path.join(out_dir, 'qdc%d.json' % rid), 'w'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
  main()
