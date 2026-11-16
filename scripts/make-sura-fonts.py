#!/usr/bin/env python3
"""Splits public/fonts/SuraNames.woff2 into one tiny font per surah (optimization review round 2, item 7).

The mushaf page draws a surah's name frame by typing its number ("018") in the SuraNames font, whose ligature turns
the three digits into the calligraphed name. The whole font is 88 KB for 114 names; a page needs one or two. Each
`public/fonts/suras/s{NNN}.woff2` keeps only the digits and that one surah's ligature (~1.3 KB), loaded as the family
`sn{n}` by `loadSuraFont()` (src/data/mushaf.ts). The glyphs are copied unchanged. Needs: pip install fonttools brotli
"""
import os
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public/fonts/SuraNames.woff2')
OUT = os.path.join(ROOT, 'public/fonts/suras')
NAMES = 'zero one two three four five six seven eight nine'.split()

font = TTFont(SRC)
liga = {}
for lookup in font['GSUB'].table.LookupList.Lookup:
    for st in lookup.SubTable:
        if hasattr(st, 'ligatures'):
            for first, ligs in st.ligatures.items():
                for x in ligs:
                    liga[(first, *x.Component)] = x.LigGlyph

os.makedirs(OUT, exist_ok=True)
total = 0
for n in range(1, 115):
    glyph = liga[tuple(NAMES[int(c)] for c in f'{n:03d}')]
    o = subset.Options()
    o.layout_closure = False
    o.flavor = 'woff2'
    o.layout_features = ['*']
    o.name_IDs = ['*']
    o.notdef_outline = True
    s = subset.Subsetter(o)
    s.populate(glyphs=NAMES + [glyph, 'space'])
    f = TTFont(SRC)
    s.subset(f)
    path = os.path.join(OUT, f's{n:03d}.woff2')
    f.save(path)
    total += os.path.getsize(path)
print(f'114 fonts, {total / 1024:.0f} KB together')
