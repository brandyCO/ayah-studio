#!/usr/bin/env python3
"""Look on archive.org for single surahs of one reciter that our main source lacks
(e.g. Islam Sobhi 37, 39, 40, 45, 65: mp3quran.net redirects those files to another reciter).

  python3 scripts/find-surahs.py OUT.json "Islam Sobhi|Islam Sobhy|إسلام صبحي|اسلام صبحي" 37,39,40,45,65

Prints and writes every archive.org MP3 whose file name or title points at one of the surahs
(its number or its Arabic / English name) in an item that names the reciter. Candidates only:
the voice and the text are checked afterwards before anything goes into the app.
"""
import json, re, sys, urllib.parse, urllib.request

UA = {'User-Agent': 'AyahStudio-find/1.0 (github.com/brandyCO/ayah-studio)'}
NAMES = {
  37: ['الصافات', 'saffat', 'saaffaat', 'safat', 'saffaat'],
  39: ['الزمر', 'zumar', 'zomar'],
  40: ['غافر', 'ghafir', 'ghaafir', 'mumin', "mu'min", 'المؤمن'],
  45: ['الجاثية', 'jathiya', 'jathiyah', 'jaathiya', 'jasiya'],
  65: ['الطلاق', 'talaq', 'talaaq', 'talak'],
}


def get(url, timeout=60):
  with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
    return r.read()


def main():
  out, names, surahs = sys.argv[1], sys.argv[2].split('|'), [int(x) for x in sys.argv[3].split(',')]
  items = {}
  for n in names:
    for q in ['"%s"' % n, '"%s" AND mediatype:audio' % n]:
      try:
        res = json.loads(get('https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(
          {'q': q, 'fl[]': ['identifier', 'title'], 'rows': 300, 'output': 'json'}, doseq=True)))
      except Exception as e:
        print('search', n, e, file=sys.stderr)
        continue
      for d in res.get('response', {}).get('docs', []):
        items[d['identifier']] = d.get('title')
  print('items:', len(items))
  found = []
  for ident, title in sorted(items.items()):
    try:
      meta = json.loads(get('https://archive.org/metadata/%s' % urllib.parse.quote(ident)))
    except Exception as e:
      print('meta', ident, e, file=sys.stderr)
      continue
    for f in meta.get('files', []):
      name = f.get('name', '')
      if not name.lower().endswith('.mp3'):
        continue
      base = name.split('/')[-1]
      low = (base + ' ' + (f.get('title') or '')).lower()
      for s in surahs:
        num = re.search(r'(^|[^0-9])0*%d([^0-9]|$)' % s, base)
        by_name = any(k in low for k in NAMES.get(s, []))
        # an item with one file per surah numbers them; elsewhere a bare number is too loose
        if by_name or (num and sum(1 for g in meta.get('files', []) if g.get('name', '').lower().endswith('.mp3')) >= 20):
          found.append({'surah': s, 'item': ident, 'title': title, 'file': name, 'size': int(f.get('size') or 0),
                        'length': f.get('length'), 'url': 'https://archive.org/download/%s/%s' % (ident, urllib.parse.quote(name)),
                        'by': 'name' if by_name else 'number'})
  found.sort(key=lambda x: (x['surah'], x['item']))
  for x in found:
    print(x['surah'], x['by'], x['item'], '|', x['file'], '|', x['length'], x['size'], '|', (x['title'] or '')[:70])
  json.dump({'reciter': names[0], 'surahs': surahs, 'items': len(items), 'found': found}, open(out, 'w'), ensure_ascii=False, indent=1)


main()
