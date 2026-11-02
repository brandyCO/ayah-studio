#!/usr/bin/env python3
"""Is an archive.org upload the same recording as one we already checked? Compares each file's size (and, where
the sizes differ, its length) with our mp3quran recording's files: the same bytes = the same recording, so the
same voice. Used to vouch for the surahs mp3quran.net lacks (Islam Sobhi 37, 39, 40, 45, 65).

  python3 scripts/compare-ia.py OUT.json public/data/mp3quran/islam-sobhi.json ITEM[/PREFIX] ...
"""
import json, re, sys, urllib.parse, urllib.request

UA = {'User-Agent': 'AyahStudio-compare/1.0 (github.com/brandyCO/ayah-studio)'}


def get(url):
  with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
    return r.read()


def main():
  out, ours = sys.argv[1], json.load(open(sys.argv[2]))
  sizes = {int(k): v['size'] for k, v in ours['surahs'].items()}
  report = []
  for spec in sys.argv[3:]:
    item, _, prefix = spec.partition('/')
    try: meta = json.loads(get('https://archive.org/metadata/%s' % urllib.parse.quote(item)))
    except Exception as e:
      report.append({'item': spec, 'error': str(e)[:120]}); continue
    files = {}
    for f in meta.get('files', []):
      name = f.get('name', '')
      if not name.lower().endswith('.mp3') or (prefix and not name.startswith(prefix + '/')): continue
      m = re.match(r'0*(\d{1,3})\D', name.split('/')[-1] + ' ')
      if m and 1 <= int(m.group(1)) <= 114: files.setdefault(int(m.group(1)), (name, int(f.get('size') or 0), f.get('length')))
    same = [s for s, (_, size, _) in files.items() if sizes.get(s) == size]
    differ = [s for s, (_, size, _) in files.items() if s in sizes and sizes[s] != size]
    report.append({'item': spec, 'files': len(files), 'compared': len(same) + len(differ), 'same': sorted(same),
                   'differ': sorted(differ), 'targets': {s: files[s] for s in (37, 39, 40, 45, 65) if s in files}})
    print(spec, 'files', len(files), 'same bytes', len(same), 'different', len(differ), differ[:20])
  json.dump(report, open(out, 'w'), ensure_ascii=False, indent=1)


main()
