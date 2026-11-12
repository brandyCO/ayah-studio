# The three unlockable launcher icons (Rare Sapphire, Legendary Gold, Mythic Celestial; drawn by
# scripts/make-unlockable-icons.py into resources/unlock-icons/) → Android mipmaps for their activity-aliases
# (adaptive background + foreground per density, a legacy square and round icon for Android 7) and the
# small web previews in public/icons/. Run: python3 scripts/make-unlock-mipmaps.py
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path('resources/unlock-icons')
RES = Path('android/app/src/main/res')
ICONS = {'sapphire': 'rare-sapphire', 'legend': 'legendary-gold', 'celestial': 'mythic-celestial'}
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

def rounded(im, radius):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius, fill=255)
    out = im.convert('RGBA'); out.putalpha(m); return out

def circle(im):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    out = im.convert('RGBA'); out.putalpha(m); return out

for id_, name in ICONS.items():
    full = Image.open(SRC / f'ayah-studio-{name}-1024.png').convert('RGB')
    bg = Image.open(SRC / f'ayah-studio-{name}-adaptive-bg-432.png').convert('RGBA')
    fg = Image.open(SRC / f'ayah-studio-{name}-adaptive-fg-432.png').convert('RGBA')
    for d, k in DENS.items():
        out = RES / f'mipmap-{d}'
        a = round(108 * k)
        bg.resize((a, a), Image.LANCZOS).save(out / f'ic_launcher_bg_{id_}.png', optimize=True)
        fg.resize((a, a), Image.LANCZOS).save(out / f'ic_launcher_foreground_{id_}.png', optimize=True)
        s = round(48 * k)
        sq = full.resize((s, s), Image.LANCZOS)
        rounded(sq, round(s * 0.18)).save(out / f'ic_launcher_{id_}.png', optimize=True)
        circle(sq).save(out / f'ic_launcher_{id_}_round.png', optimize=True)
    for suffix in ('', '_round'):
        (RES / 'mipmap-anydpi-v26' / f'ic_launcher_{id_}{suffix}.xml').write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            f'    <background android:drawable="@mipmap/ic_launcher_bg_{id_}"/>\n'
            f'    <foreground android:drawable="@mipmap/ic_launcher_foreground_{id_}"/>\n'
            '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
            '</adaptive-icon>\n')
    rounded(full.resize((256, 256), Image.LANCZOS), 46).save(f'public/icons/app-{id_}.webp', 'WEBP', quality=88)
    print('ok', id_)
