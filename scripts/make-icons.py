"""One-off: generate the Ayah Studio logo, app icons and splash screens (original artwork).

The mark ("sound a"): a lowercase "a" followed by two fading sound bars (the recitation), white on an
emerald → teal gradient tile. The gradient is a brand moment only (icon, launch screen, name); no Quran
text in the logo.

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
E0, E1 = '#05573d', '#22b3a0'   # emerald → teal (icon tile)
T0, T1 = '#34d399', '#5eead4'   # lighter pair for the name on dark
DARK = '#07130f'                # launch screen
WHITE, BAR = '#ffffff', '#c8f7ec'


def chrome():
    if os.environ.get('CHROME'):
        return os.environ['CHROME']
    for p in sorted(Path('/opt/pw-browsers').glob('chromium-*/chrome-linux*/chrome'), reverse=True):
        return str(p)
    return shutil.which('chromium') or shutil.which('google-chrome') or 'chromium'


def mark(cx, cy, s, ink=WHITE, bar=BAR):
    """The "sound a", centred on (cx, cy); s = 176 gives a ~320-unit-wide mark."""
    k = s / 176
    R, sw = 92 * k, 34 * k                 # bowl radius, stroke width
    bx = cx - 48 * k                       # bowl centre (the bars sit to the right)
    sx = bx + R                            # stem centre line
    top, bot = cy - R - sw / 2, cy + R + sw / 2
    out = (f'<circle cx="{bx:.2f}" cy="{cy:.2f}" r="{R:.2f}" fill="none" stroke="{ink}" stroke-width="{sw:.2f}"/>'
           f'<rect x="{sx - sw / 2:.2f}" y="{top:.2f}" width="{sw:.2f}" height="{bot - top:.2f}" rx="{sw / 2:.2f}" fill="{ink}"/>')
    for i, hf in ((1, 0.62), (2, 0.34)):
        h, x, w = (bot - top) * hf, sx + i * sw * 1.55, sw * 0.76
        out += f'<rect x="{x - w / 2:.2f}" y="{cy - h / 2:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{w / 2:.2f}" fill="{bar}"/>'
    return out


def tile(w, h, rx=0, circle=False):
    """Emerald → teal gradient (bottom-left → top-right) with a soft highlight top-left."""
    defs = (f'<defs><linearGradient id="tg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{E0}"/>'
            f'<stop offset="1" stop-color="{E1}"/></linearGradient>'
            f'<radialGradient id="th" cx="22%" cy="12%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/>'
            f'<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>')
    if circle:
        shape = lambda f: f'<circle cx="{w / 2}" cy="{h / 2}" r="{w / 2}" fill="{f}"/>'
    else:
        shape = lambda f: f'<rect width="{w}" height="{h}" rx="{rx}" fill="{f}"/>'
    return defs + shape('url(#tg)') + shape('url(#th)')


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'


def icon_svg(rx=0, circle=False):
    """Full icon (tile + mark), 512 units."""
    return svg(512, 512, tile(512, 512, rx, circle) + mark(256, 256, 172))


def adaptive_fg(mono=False):
    """Adaptive-icon foreground, 108 dp canvas (432 units): the mark inside the 66 dp safe circle."""
    return svg(432, 432, mark(216, 216, 104, bar=WHITE if mono else BAR))


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
        f'{tile(512, 512)}{mark(256, 256, 172)}</g></svg>'
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
    (res / 'logo.svg').write_text(svg(512, 512, mark(256, 256, 240)) + '\n')
    (res / 'logo-dark.svg').write_text(svg(512, 512, mark(256, 256, 240, ink=E0, bar=E1)) + '\n')
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
