"""One-off: generate the Ayah Studio logo, app icons and splash screens (original artwork).

The mark (owner pick "E", 2026-10-31): a soft light inside the end-of-ayah rosette (two rounded squares,
one turned 45°, drawn as a thin teal line, with a fine ring inside), on a deep night-green tile. No Quran
text in the logo. (Before: the "sound a", 2026-10-08.)

Writes resources/ (source SVGs + 1024 px icon + splash), public/icon.svg + public/icon-180.png (favicon /
home-screen icon) and the Android launcher icons (legacy, round, adaptive foreground/background,
monochrome) + splash PNGs under android/app/src/main/res.
Theme icons (`--themes`): for every other theme in src/ui/theme.ts (Theme colours) the same mark on that
theme's gradient — adaptive background `drawable/ic_bg_{id}.xml` (vector), `mipmap-anydpi-v26/ic_launcher_{id}`
+ `_round`, 192 px PNGs for Android 7, a shared foreground with white bars — and the manifest's
activity-aliases between the `theme icons` markers (AppIcons.java turns one on).
Run: python3 scripts/make-icons.py  (needs Pillow and Chromium: the Playwright Chromium in
/opt/pw-browsers or $CHROME; the wordmark uses the system font "Inter Display")
"""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
E0, E1 = '#05573d', '#22b3a0'   # emerald → teal (brand gradient)
N0, N1 = '#040c09', '#0b2019'   # icon tile: deep night green
LINE, RING, GLOW = '#3dd1ad', '#1f8f78', '#3dd1ad'
T0, T1 = '#34d399', '#5eead4'   # lighter pair for the name on dark
DARK = '#07130f'                # launch screen
WHITE = '#ffffff'


def chrome():
    if os.environ.get('CHROME'):
        return os.environ['CHROME']
    for p in sorted(Path('/opt/pw-browsers').glob('chromium-*/chrome-linux*/chrome'), reverse=True):
        return str(p)
    return shutil.which('chromium') or shutil.which('google-chrome') or 'chromium'


def mark(cx, cy, s, line=LINE, ring=RING, glow=True, mono=False):
    """Light in the ayah marker, centred on (cx, cy); s = the width of the marker's two squares.

    Two rounded squares (one turned 45°: the end-of-ayah rosette) drawn as a thin line, a fine ring inside,
    and a soft light at the centre with a white core. mono = one flat colour for Android's themed icons."""
    sw, rx, r = s * 0.055, s * 0.07, s * 0.33
    sq = (f'<rect x="{cx - s / 2:.2f}" y="{cy - s / 2:.2f}" width="{s:.2f}" height="{s:.2f}" rx="{rx:.2f}"'
          f' fill="none" stroke="{WHITE if mono else line}" stroke-width="{sw:.2f}" stroke-linejoin="round"')
    out = ''
    if glow and not mono:
        out += (f'<radialGradient id="lg" cx="{cx}" cy="{cy}" r="{s * 0.62:.2f}" gradientUnits="userSpaceOnUse">'
                f'<stop offset="0" stop-color="{GLOW}" stop-opacity=".95"/><stop offset=".22" stop-color="{GLOW}" stop-opacity=".55"/>'
                f'<stop offset=".6" stop-color="{GLOW}" stop-opacity=".12"/><stop offset="1" stop-color="{GLOW}" stop-opacity="0"/></radialGradient>'
                f'<radialGradient id="lc" cx="{cx}" cy="{cy}" r="{s * 0.11:.2f}" gradientUnits="userSpaceOnUse">'
                f'<stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".9"/>'
                f'<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
                f'<circle cx="{cx}" cy="{cy}" r="{s * 0.62:.2f}" fill="url(#lg)"/>')
    out += sq + '/>' + sq + f' transform="rotate(45 {cx} {cy})"/>'
    out += (f'<circle cx="{cx}" cy="{cy}" r="{r:.2f}" fill="none" stroke="{WHITE if mono else ring}"'
            f' stroke-width="{sw * (0.9 if mono else 0.55):.2f}"{"" if mono else " opacity=\".8\""}/>')
    if mono:
        out += f'<circle cx="{cx}" cy="{cy}" r="{s * 0.085:.2f}" fill="{WHITE}"/>'
    else:
        out += f'<circle cx="{cx}" cy="{cy}" r="{s * 0.11:.2f}" fill="url(#lc)"/>'
    return out


def tile(w, h, rx=0, circle=False):
    """Deep night green, a touch lighter in the middle (the light's room)."""
    defs = (f'<defs><radialGradient id="tg" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="{N1}"/>'
            f'<stop offset="1" stop-color="{N0}"/></radialGradient></defs>')
    if circle:
        shape = lambda f: f'<circle cx="{w / 2}" cy="{h / 2}" r="{w / 2}" fill="{f}"/>'
    else:
        shape = lambda f: f'<rect width="{w}" height="{h}" rx="{rx}" fill="{f}"/>'
    return defs + shape('url(#tg)')


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'


def icon_svg(rx=0, circle=False):
    """Full icon (tile + mark), 512 units."""
    return svg(512, 512, tile(512, 512, rx, circle) + mark(256, 256, 236))


def adaptive_fg(mono=False):
    """Adaptive-icon foreground, 108 dp canvas (432 units): the marker inside the 66 dp safe circle."""
    return svg(432, 432, mark(216, 216, 172, mono=mono))


def splash_svg(w, h):
    s = min(w, h)
    ts = s * (0.34 if h >= w else 0.30)          # icon tile size
    cy = h * (0.42 if h >= w else 0.40)
    x0, y0 = (w - ts) / 2, cy - ts / 2
    return svg(w, h,
        f'<defs><radialGradient id="glow" cx="50%" cy="{cy / h * 100:.1f}%" r="45%">'
        f'<stop offset="0" stop-color="{E1}" stop-opacity=".28"/><stop offset="1" stop-color="{E1}" stop-opacity="0"/></radialGradient>'
        f'<linearGradient id="name" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{T0}"/><stop offset="1" stop-color="{T1}"/></linearGradient>'
        f'<clipPath id="tc"><rect width="512" height="512" rx="115"/></clipPath></defs>'
        f'<rect width="{w}" height="{h}" fill="{DARK}"/><rect width="{w}" height="{h}" fill="url(#glow)"/>'
        f'<svg x="{x0:.1f}" y="{y0:.1f}" width="{ts:.1f}" height="{ts:.1f}" viewBox="0 0 512 512"><g clip-path="url(#tc)">'
        f'{tile(512, 512)}{mark(256, 256, 236)}</g></svg>'
        f'<text x="{w / 2}" y="{y0 + ts + ts * 0.36:.1f}" text-anchor="middle" font-family="Inter Display, Inter, sans-serif"'
        f' font-weight="700" letter-spacing="-0.02em" font-size="{ts * 0.21:.1f}" fill="url(#name)">ayah studio</text>')


def render(svg_text, w, h, out, transparent=False):
    """Render an SVG to a PNG of exactly w×h with headless Chromium."""
    with tempfile.TemporaryDirectory() as d:
        page = Path(d) / 'p.html'
        sized = svg_text.replace('<svg ', f'<svg style="display:block;width:{w}px;height:{h}px" ', 1)
        page.write_text(f'<!doctype html><html><body style="margin:0;background:transparent">{sized}</body></html>')
        shot = Path(d) / 's.png'
        # The window is taller than the page: headless Chromium's viewport is shorter than --window-size.
        cmd = [chrome(), '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
               '--force-device-scale-factor=1', f'--window-size={w},{h + 400}', f'--screenshot={shot}', page.as_uri()]
        if transparent:
            cmd.insert(2, '--default-background-color=00000000')
        subprocess.run(cmd, check=True, capture_output=True)
        img = Image.open(shot).convert('RGBA' if transparent else 'RGB').crop((0, 0, w, h))
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, optimize=True)


def downscale(src, out, size):
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.open(src).resize((size, size), Image.LANCZOS).save(out, optimize=True)


THEME_RE = r"id: '(\w+)', name: '([^']+)',[^\n]*?fill: \[([^\]]+)\], neon: \[([^\]]+)\]"


def themes():
    """(id, name, fill stops, neon stops) from src/ui/theme.ts, so the icons always match the app."""
    import re
    src = (ROOT / 'src' / 'ui' / 'theme.ts').read_text()
    cols = lambda t: re.findall(r"'(#[0-9a-f]{6})'", t)
    return [(m[0], m[1], cols(m[2]), cols(m[3])) for m in re.findall(THEME_RE, src)]


def theme_stops(fill, neon):
    """The tile gradient of a theme: its deep stops, then its first neon stop in the far corner; the mark's
    middle stays on the deep colours so the white "a" keeps its contrast."""
    stops = [(0, fill[0])] + ([(0.55, fill[-1])] if len(fill) > 1 else []) + [(1, neon[0])]
    return stops


def theme_tile(w, h, stops, rx=0, circle=False):
    st = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return tile(w, h, rx, circle).replace(
        f'<stop offset="0" stop-color="{E0}"/><stop offset="1" stop-color="{E1}"/>', st)


def vector_bg(stops):
    """Adaptive-icon background as a vector drawable (gradient + the soft highlight), 108 dp."""
    st = ''.join(f'<item android:offset="{o}" android:color="{c}"/>' for o, c in stops)
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-icons.py (theme icon background). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="0" android:startY="108" android:endX="108" android:endY="0">{st}</gradient>
        </aapt:attr>
    </path>
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="radial" android:centerX="23.76" android:centerY="12.96" android:gradientRadius="75.6">
                <item android:offset="0" android:color="#29FFFFFF"/><item android:offset="1" android:color="#00FFFFFF"/>
            </gradient>
        </aapt:attr>
    </path>
</vector>
'''


ADAPTIVE = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_bg_{id}"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground_w"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
'''

ALIAS = '''        <activity-alias
            android:name=".{name}"
            android:targetActivity=".AppActivity"
            android:icon="@mipmap/{icon}"
            android:roundIcon="@mipmap/{icon}_round"
            android:label="@string/title_activity_main"
            android:enabled="{enabled}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>
'''


def theme_icons():
    import re
    ts = themes()
    assert ts and ts[0][0] == 'emerald', 'theme.ts: Emerald must come first'
    with tempfile.TemporaryDirectory() as d:
        fg = Path(d) / 'fg.png'
        render(svg(432, 432, mark(216, 216, 104, bar='rgba(255,255,255,.78)')), 864, 864, fg, transparent=True)
        for dens, n in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
            downscale(fg, RES / f'mipmap-{dens}' / 'ic_launcher_foreground_w.png', round(108 * n))
        for tid, _, fill, neon in ts[1:]:
            stops = theme_stops(fill, neon)
            (RES / 'drawable' / f'ic_bg_{tid}.xml').write_text(vector_bg(stops))
            for suffix in ('', '_round'):
                (RES / 'mipmap-anydpi-v26' / f'ic_launcher_{tid}{suffix}.xml').write_text(ADAPTIVE.format(id=tid))
            # Android 7 (no adaptive icons): one 192 px PNG each, scaled by the system.
            body = lambda **k: theme_tile(512, 512, stops, **k) + mark(256, 256, 172, bar='rgba(255,255,255,.78)')
            for suffix, kw in (('', {'rx': 96}), ('_round', {'circle': True})):
                big = Path(d) / f'{tid}{suffix}.png'
                render(svg(512, 512, body(**kw)), 768, 768, big, transparent=True)
                downscale(big, RES / 'mipmap-xxxhdpi' / f'ic_launcher_{tid}{suffix}.png', 192)
    aliases = ALIAS.format(name='MainActivity', icon='ic_launcher', enabled='true')
    for tid, _, _, _ in ts[1:]:
        aliases += ALIAS.format(name='Icon' + tid.capitalize(), icon=f'ic_launcher_{tid}', enabled='false')
    man = ROOT / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
    text = man.read_text()
    start, end = '        <!-- theme icons (scripts/make-icons.py --themes) -->\n', '        <!-- /theme icons -->\n'
    assert start in text and end in text, 'AndroidManifest.xml: theme icon markers missing'
    text = re.sub(re.escape(start) + '.*?' + re.escape(end), lambda _: start + aliases + end, text, flags=re.S)
    man.write_text(text)
    print(f'{len(ts) - 1} theme icons')


def main():
    res = ROOT / 'resources'
    res.mkdir(exist_ok=True)
    (res / 'logo.svg').write_text(svg(512, 512, mark(256, 256, 300)) + '\n')
    (res / 'logo-dark.svg').write_text(svg(512, 512, mark(256, 256, 300, line=E0, ring=E1)) + '\n')
    (res / 'icon.svg').write_text(icon_svg() + '\n')
    (res / 'splash.svg').write_text(splash_svg(1284, 2778) + '\n')
    (ROOT / 'public' / 'icon.svg').write_text(icon_svg(rx=115) + '\n')

    render(icon_svg(), 1024, 1024, res / 'icon-1024.png')
    render(splash_svg(1284, 2778), 1284, 2778, res / 'splash.png')
    render(icon_svg(), 180, 180, ROOT / 'public' / 'icon-180.png')

    with tempfile.TemporaryDirectory() as d:
        big = {n: Path(d) / f'{n}.png' for n in ('square', 'round', 'fg', 'bg', 'mono')}
        render(icon_svg(rx=96), 768, 768, big['square'], transparent=True)
        render(icon_svg(circle=True), 768, 768, big['round'], transparent=True)
        render(adaptive_fg(), 864, 864, big['fg'], transparent=True)
        render(svg(432, 432, tile(432, 432)), 864, 864, big['bg'])
        render(adaptive_fg(mono=True), 864, 864, big['mono'], transparent=True)
        for dens, n in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
            folder = RES / f'mipmap-{dens}'
            downscale(big['square'], folder / 'ic_launcher.png', round(48 * n))
            downscale(big['round'], folder / 'ic_launcher_round.png', round(48 * n))
            downscale(big['fg'], folder / 'ic_launcher_foreground.png', round(108 * n))
            downscale(big['bg'], folder / 'ic_launcher_background.png', round(108 * n))
            downscale(big['mono'], folder / 'ic_launcher_monochrome.png', round(108 * n))

    # Splash PNGs for Android < 12 (12+ shows the launcher icon on @color/splash_background).
    for p in sorted(RES.glob('drawable*/splash.png')):
        w, h = Image.open(p).size
        render(splash_svg(w, h), w, h, p)
    print('done')


if __name__ == '__main__':
    import sys
    theme_icons() if '--themes' in sys.argv else main()
