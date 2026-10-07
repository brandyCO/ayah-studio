"""Check that every QCF V2 glyph in public/data/mushaf.json exists in its page's font.

Run after scripts/fetch-mushaf.mjs:  python3 scripts/verify-qcf-glyphs.py   (needs: pip install fonttools brotli)
A glyph missing from its page font would mean the page/glyph data is inconsistent.
"""
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
pages = json.loads((ROOT / 'public/data/mushaf.json').read_text())['pages']
bad = 0
glyphs = 0
for p, pg in enumerate(pages, 1):
    cmap = TTFont(ROOT / f'public/fonts/qcf-v2/p{p}.woff2').getBestCmap()
    for line in pg['lines']:
        if line[0] in ('h', 'b'):
            continue
        for s, a, codes in line:
            for ch in codes.replace(' ', ''):
                glyphs += 1
                if ord(ch) not in cmap:
                    bad += 1
                    print(f'page {p}: {s}:{a} glyph U+{ord(ch):04X} not in font')
if bad:
    sys.exit(f'{bad} missing glyphs')
print(f'OK: {glyphs} glyphs on 604 pages all present in their page fonts')
