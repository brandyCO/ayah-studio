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


THEME_RE = (r"id: '(\w+)', name: '([^']+)', hue: (\d+), fill: \[([^\]]+)\], neon: \[([^\]]+)\],\s*"
            r"accentLight: '#\w+', accentDark: '(#\w+)'")


def themes():
    """(id, name, fill stops, neon stops) from src/ui/theme.ts, so the icons always match the app."""
    import re
    src = (ROOT / 'src' / 'ui' / 'theme.ts').read_text()
    cols = lambda t: re.findall(r"'(#[0-9a-f]{6})'", t)
    return [(m[0], m[1], cols(m[3]), cols(m[4]), int(m[2]), m[5]) for m in re.findall(THEME_RE, src)]


def hsl(h, sat, l):
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, sat / 100)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def theme_colors(t):
    """The icon of a theme: the same night tile (tinted to the theme's hue) and light in the ayah marker,
    drawn in the theme's night accent (line + glow) with its deep colour as the inner ring."""
    tid, _, fill, neon, hue, accent = t
    return {'n0': hsl(hue, 50, 3.1), 'n1': hsl(hue, 49, 8.4), 'line': accent, 'ring': fill[-1], 'glow': accent}


def theme_tile(w, h, c, rx=0, circle=False):
    return tile(w, h, rx, circle).replace(N1, c['n1']).replace(N0, c['n0'])


def theme_mark(cx, cy, s, c):
    return mark(cx, cy, s, line=c['line'], ring=c['ring']).replace(f'stop-color="{GLOW}"', f'stop-color="{c["glow"]}"')


def vector_bg(c):
    """Adaptive-icon background as a vector drawable: the night tile's radial gradient, 108 dp."""
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-icons.py (theme icon background). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="radial" android:centerX="54" android:centerY="49.68" android:gradientRadius="81"
                android:startColor="{c['n1']}" android:endColor="{c['n0']}"/>
        </aapt:attr>
    </path>
</vector>
'''


ADAPTIVE = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_bg_{id}"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground_{id}"/>
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
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
        </activity-alias>
'''


# Rare icons (owner request 2026-11-09, Ranks prizes and the Light shop): the same light in the ayah marker on
# a night tile of its own, with a calm scene behind it (no figures, no text). Ids must not clash with the
# themes; src/data/rareIcons.ts lists the same ids, prices and wins.
RARE = [
    ('pearl', {'n0': '#05061a', 'n1': '#191b42', 'line': '#ece8fb', 'ring': '#9c92d6', 'glow': '#d8d0ff'}),
    ('rosedawn', {'n0': '#12040c', 'n1': '#3b1328', 'line': '#f6bfa4', 'ring': '#c86f88', 'glow': '#ffc4a8'}),
    ('starlit', {'n0': '#02040f', 'n1': '#0b1636', 'line': '#d6e6ff', 'ring': '#5674c2', 'glow': '#a5c6ff'}),
    ('borealis', {'n0': '#01080a', 'n1': '#06212a', 'line': '#9cf8d6', 'ring': '#8466ff', 'glow': '#6ff2c4'}),
    ('lantern', {'n0': '#0f0602', 'n1': '#2f1805', 'line': '#ffc670', 'ring': '#b8691e', 'glow': '#ffb04a'}),
    ('champion', {'n0': '#0b0701', 'n1': '#2c1f04', 'line': '#ffd86e', 'ring': '#b98a12', 'glow': '#ffe08c'}),
    ('silver', {'n0': '#06070a', 'n1': '#1d2129', 'line': '#eef2f8', 'ring': '#8d97aa', 'glow': '#f0f5ff'}),
    ('bronze', {'n0': '#0b0503', 'n1': '#2b170c', 'line': '#eaa874', 'ring': '#9c5a33', 'glow': '#f3b580'}),
    ('sun', {'n0': '#120501', 'n1': '#3d1605', 'line': '#ffe9a8', 'ring': '#ff8a3d', 'glow': '#ffcf6a'}),
]


def _rand(seed):
    import random
    return random.Random(seed)


def _laurel(cx, cy, s, light, dark, sparkle=False):
    import math
    R, out = s * 0.76, ''
    out += (f'<linearGradient id="dl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{light}"/>'
            f'<stop offset="1" stop-color="{dark}"/></linearGradient>')
    for side in (-1, 1):
        pts = [(cx + side * R * math.sin(t), cy + R * math.cos(t)) for t in [0.2 + i * 0.05 for i in range(46)]]
        out += (f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{dark}"'
                f' stroke-width="{s * 0.014:.2f}" stroke-linecap="round" opacity=".9"/>')
        for k in range(9):
            t = 0.3 + k * 0.25
            px, py = cx + side * R * math.sin(t), cy + R * math.cos(t)
            grow = math.atan2(-math.sin(t), side * math.cos(t))      # along the branch, towards its tip
            size = 1 - k * 0.05
            ln = s * 0.15 * size
            for o, op in ((1, .95), (-1, .82)):                          # one leaf outside, one inside
                a = grow - o * side * math.radians(38)
                lx, ly = px + math.cos(a) * ln / 2, py + math.sin(a) * ln / 2
                out += (f'<ellipse cx="{lx:.1f}" cy="{ly:.1f}" rx="{ln / 2:.1f}" ry="{ln * 0.2:.1f}"'
                        f' transform="rotate({math.degrees(a):.1f} {lx:.1f} {ly:.1f})" fill="url(#dl)" opacity="{op}"/>')
    out += f'<circle cx="{cx}" cy="{cy + R * 1.0:.1f}" r="{s * 0.03:.1f}" fill="{light}"/>'
    if sparkle:
        y, r = cy - R * 1.02, s * 0.075
        out += (f'<path d="M{cx},{y - r} Q{cx},{y} {cx + r},{y} Q{cx},{y} {cx},{y + r} Q{cx},{y} {cx - r},{y} Q{cx},{y} {cx},{y - r}Z"'
                f' fill="{light}"/>')
    return out


def _rays(cx, cy, s, colour, n, r0, r1, alt, width, op):
    import math
    out = ''
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r1 if i % 2 == 0 else r1 * alt
        w = width / 2
        p = [(cx + r0 * math.cos(a - w), cy + r0 * math.sin(a - w)), (cx + rr * math.cos(a), cy + rr * math.sin(a)),
             (cx + r0 * math.cos(a + w), cy + r0 * math.sin(a + w))]
        out += f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in p)}" fill="{colour}" opacity="{op if i % 2 == 0 else op * .6:.2f}"/>'
    return out


def rare_decor(rid, cx, cy, s, W):
    """The scene behind the marker. (cx, cy) = the marker's centre, s = its size, W = the canvas."""
    import math
    soft = lambda i, c, op: (f'<radialGradient id="{i}"><stop offset="0" stop-color="{c}" stop-opacity="{op}"/>'
                             f'<stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>')
    if rid == 'pearl':
        out = soft('dw', '#ffffff', .10) + f'<circle cx="{cx}" cy="{cy}" r="{s * 1.25:.1f}" fill="url(#dw)"/>'
        for r, op in ((0.92, .32), (1.1, .14)):
            out += f'<circle cx="{cx}" cy="{cy}" r="{s * r:.1f}" fill="none" stroke="#e6e0ff" stroke-width="{s * 0.01:.2f}" opacity="{op}"/>'
        out += ('<radialGradient id="dp" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/>'
                '<stop offset=".55" stop-color="#e3dcfb"/><stop offset="1" stop-color="#9d92cf"/></radialGradient>')
        for i in range(16):
            a = i * math.pi / 8 + math.pi / 16
            out += (f'<circle cx="{cx + s * 0.92 * math.cos(a):.1f}" cy="{cy + s * 0.92 * math.sin(a):.1f}"'
                    f' r="{s * (0.03 if i % 2 else 0.021):.1f}" fill="url(#dp)"/>')
        return out
    if rid == 'rosedawn':
        y = cy + s * 0.86
        out = (f'<radialGradient id="dh" cx="{cx}" cy="{y}" r="{s * 1.2:.1f}" gradientUnits="userSpaceOnUse"'
               f' gradientTransform="translate(0 {y:.1f}) scale(1 .5) translate(0 {-y:.1f})">'
               '<stop offset="0" stop-color="#ffb08a" stop-opacity=".75"/><stop offset=".45" stop-color="#e0607a" stop-opacity=".35"/>'
               '<stop offset="1" stop-color="#e0607a" stop-opacity="0"/></radialGradient>'
               f'<rect x="0" y="{y - s * 0.6:.1f}" width="{W}" height="{W - y + s * 0.6:.1f}" fill="url(#dh)"/>'
               '<linearGradient id="dhl" x1="0" x2="1"><stop offset="0" stop-color="#ffd2bd" stop-opacity="0"/>'
               '<stop offset=".5" stop-color="#ffd2bd" stop-opacity=".7"/><stop offset="1" stop-color="#ffd2bd" stop-opacity="0"/></linearGradient>'
               f'<rect x="{cx - s * 1.1:.1f}" y="{y:.1f}" width="{s * 2.2:.1f}" height="{s * 0.012:.2f}" fill="url(#dhl)"/>')
        for i, r in enumerate((0.95, 1.12)):
            out += (f'<path d="M{cx - s * r:.1f},{y:.1f} A{s * r:.1f},{s * r:.1f} 0 0 1 {cx + s * r:.1f},{y:.1f}" fill="none"'
                    f' stroke="#ffc6b0" stroke-width="{s * 0.008:.2f}" opacity="{.22 - i * .09:.2f}"/>')
        rnd = _rand(7)
        for _ in range(9):
            x, yy = rnd.uniform(0.08, 0.92) * W, rnd.uniform(0.06, 0.3) * W
            out += f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="{W * rnd.uniform(.003, .006):.1f}" fill="#ffe3d6" opacity="{rnd.uniform(.4, .8):.2f}"/>'
        return out
    if rid == 'starlit':
        out = ('<linearGradient id="db" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7fa6ff" stop-opacity="0"/>'
               '<stop offset=".5" stop-color="#9db9ff" stop-opacity=".16"/><stop offset="1" stop-color="#7fa6ff" stop-opacity="0"/></linearGradient>'
               f'<rect x="{-W * .2:.1f}" y="{W * .38:.1f}" width="{W * 1.4:.1f}" height="{W * .24:.1f}" fill="url(#db)"'
               f' transform="rotate(-35 {W / 2} {W / 2})"/>')
        rnd = _rand(11)
        n = 0
        while n < 60:
            x, y = rnd.uniform(0, W), rnd.uniform(0, W)
            if math.hypot(x - cx, y - cy) < s * 0.62:
                continue
            n += 1
            out += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{W * rnd.uniform(.0025, .0075):.2f}" fill="#eaf2ff" opacity="{rnd.uniform(.35, .95):.2f}"/>'
        for fx, fy, fr in ((.2, .2, .03), (.82, .3, .022), (.74, .84, .026), (.16, .74, .018)):
            x, y, r = fx * W, fy * W, fr * W
            out += (f'<path d="M{x:.1f},{y - r:.1f} Q{x:.1f},{y:.1f} {x + r:.1f},{y:.1f} Q{x:.1f},{y:.1f} {x:.1f},{y + r:.1f}'
                    f' Q{x:.1f},{y:.1f} {x - r:.1f},{y:.1f} Q{x:.1f},{y:.1f} {x:.1f},{y - r:.1f}Z" fill="#f4f8ff"/>')
        return out
    if rid == 'borealis':
        out = f'<filter id="dbl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="{s * 0.03:.1f}"/></filter>'
        for i, (col, base, amp, ph, hgt, op) in enumerate((
                ('#5dffb6', 0.05, 0.05, 0.0, 0.42, .55), ('#3fe2d2', 0.12, 0.06, 1.7, 0.36, .4), ('#9b72ff', 0.0, 0.05, 3.1, 0.3, .45))):
            y0 = base * W
            top = [(x, y0 + amp * W * math.sin(x / W * 2 * math.pi * 1.2 + ph) + (x / W) * W * 0.12) for x in [j * W / 24 for j in range(25)]]
            bot = [(x, y + hgt * W) for x, y in reversed(top)]
            out += (f'<linearGradient id="da{i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{col}" stop-opacity="0"/>'
                    f'<stop offset=".45" stop-color="{col}" stop-opacity="{op}"/><stop offset="1" stop-color="{col}" stop-opacity="0"/></linearGradient>'
                    f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in top + bot)}" fill="url(#da{i})" filter="url(#dbl)"/>')
        rnd = _rand(5)
        for _ in range(18):
            x, y = rnd.uniform(0, W), rnd.uniform(0.5, 1) * W
            if math.hypot(x - cx, y - cy) < s * 0.62:
                continue
            out += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{W * rnd.uniform(.002, .005):.2f}" fill="#d8fff0" opacity="{rnd.uniform(.3, .7):.2f}"/>'
        return out
    if rid == 'lantern':
        out = (soft('dm', '#ffb44d', 1) + soft('dg', '#ff9a2e', .35)
               + f'<ellipse cx="{cx}" cy="{W:.1f}" rx="{W * 0.7:.1f}" ry="{W * 0.35:.1f}" fill="url(#dg)"/>')
        rnd = _rand(3)
        n = 0
        while n < 24:
            x, y = rnd.uniform(0.04, 0.96) * W, rnd.uniform(0.04, 0.96) * W
            if math.hypot(x - cx, y - cy) < s * 0.66:
                continue
            n += 1
            r = W * rnd.uniform(.008, .028) * (0.6 + 0.6 * y / W)
            out += (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r * 2.6:.1f}" fill="url(#dm)" opacity="{rnd.uniform(.25, .5):.2f}"/>'
                    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r * 0.45:.1f}" fill="#ffe2b0" opacity="{rnd.uniform(.6, .95):.2f}"/>')
        return out
    if rid == 'champion':
        return (soft('dw', '#ffd86e', .22) + f'<circle cx="{cx}" cy="{cy}" r="{s * 1.2:.1f}" fill="url(#dw)"/>'
                + _rays(cx, cy, s, '#ffd86e', 28, s * 0.55, s * 1.5, 0.7, 0.05, .16)
                + _laurel(cx, cy, s, '#ffe9a6', '#b8860b', sparkle=True))
    if rid == 'silver':
        return (soft('dw', '#e6edf8', .14) + f'<circle cx="{cx}" cy="{cy}" r="{s * 1.2:.1f}" fill="url(#dw)"/>'
                + _laurel(cx, cy, s, '#f6f9ff', '#7f899c'))
    if rid == 'bronze':
        return (soft('dw', '#f0a46a', .14) + f'<circle cx="{cx}" cy="{cy}" r="{s * 1.2:.1f}" fill="url(#dw)"/>'
                + _laurel(cx, cy, s, '#f7c294', '#8a4a26'))
    if rid == 'sun':
        return (soft('dw', '#ff9a3d', .4) + f'<circle cx="{cx}" cy="{cy}" r="{s * 1.3:.1f}" fill="url(#dw)"/>'
                + _rays(cx, cy, s, '#ffc35a', 32, s * 0.6, s * 1.6, 0.62, 0.075, .5)
                + f'<circle cx="{cx}" cy="{cy}" r="{s * 0.6:.1f}" fill="none" stroke="#ffd98a" stroke-width="{s * 0.012:.2f}" opacity=".55"/>')
    raise ValueError(rid)


def rare_icon_svg(rid, c, W, cx, s, rx=0, circle=False, mark_too=True):
    clip = (f'<circle cx="{W / 2}" cy="{W / 2}" r="{W / 2}"/>' if circle else f'<rect width="{W}" height="{W}" rx="{rx}"/>')
    body = (f'<defs><clipPath id="dc">{clip}</clipPath></defs><g clip-path="url(#dc)">{theme_tile(W, W, c)}'
            f'{rare_decor(rid, cx, cx, s, W)}{theme_mark(cx, cx, s, c) if mark_too else ""}</g>')
    return svg(W, W, body)


RARE_ADAPTIVE = ADAPTIVE.replace('@drawable/ic_bg_{id}', '@mipmap/ic_launcher_background_{id}')


def rare_icons(d):
    """Writes the rare icons' Android files and web previews (public/icons/rare/{id}.svg); returns their ids."""
    web = ROOT / 'public' / 'icons' / 'rare'
    web.mkdir(parents=True, exist_ok=True)
    for rid, c in RARE:
        (web / f'{rid}.svg').write_text(rare_icon_svg(rid, c, 512, 256, 236, rx=115) + '\n')
        for suffix in ('', '_round'):
            (RES / 'mipmap-anydpi-v26' / f'ic_launcher_{rid}{suffix}.xml').write_text(RARE_ADAPTIVE.format(id=rid))
        bg = Path(d) / f'{rid}-bg.png'
        render(rare_icon_svg(rid, c, 432, 216, 172, mark_too=False), 864, 864, bg)
        downscale(bg, RES / 'mipmap-xxxhdpi' / f'ic_launcher_background_{rid}.png', 432)
        fg = Path(d) / f'{rid}-fg.png'
        render(svg(432, 432, theme_mark(216, 216, 172, c)), 864, 864, fg, transparent=True)
        downscale(fg, RES / 'mipmap-xxxhdpi' / f'ic_launcher_foreground_{rid}.png', 432)
        for suffix, kw in (('', {'rx': 96}), ('_round', {'circle': True})):
            big = Path(d) / f'{rid}{suffix}.png'
            render(rare_icon_svg(rid, c, 512, 256, 236, **kw), 768, 768, big, transparent=True)
            downscale(big, RES / 'mipmap-xxxhdpi' / f'ic_launcher_{rid}{suffix}.png', 192)
    return [rid for rid, _ in RARE]


def theme_icons():
    import re
    ts = themes()
    assert ts and ts[0][0] == 'emerald', 'theme.ts: Emerald must come first'
    for old in RES.glob('mipmap-*/ic_launcher_foreground_w.png'):
        old.unlink()
    with tempfile.TemporaryDirectory() as d:
        for t in ts[1:]:
            tid, c = t[0], theme_colors(t)
            (RES / 'drawable' / f'ic_bg_{tid}.xml').write_text(vector_bg(c))
            for suffix in ('', '_round'):
                (RES / 'mipmap-anydpi-v26' / f'ic_launcher_{tid}{suffix}.xml').write_text(ADAPTIVE.format(id=tid))
            fg = Path(d) / f'{tid}-fg.png'
            render(svg(432, 432, theme_mark(216, 216, 172, c)), 864, 864, fg, transparent=True)
            downscale(fg, RES / 'mipmap-xxxhdpi' / f'ic_launcher_foreground_{tid}.png', 432)
            # Android 7 (no adaptive icons): one 192 px PNG each, scaled by the system.
            for suffix, kw in (('', {'rx': 96}), ('_round', {'circle': True})):
                big = Path(d) / f'{tid}{suffix}.png'
                render(svg(512, 512, theme_tile(512, 512, c, **kw) + theme_mark(256, 256, 236, c)), 768, 768, big, transparent=True)
                downscale(big, RES / 'mipmap-xxxhdpi' / f'ic_launcher_{tid}{suffix}.png', 192)
        rare = rare_icons(d)
    themed = {t[0] for t in ts}
    assert not themed & set(rare), 'a rare icon id clashes with a theme'
    aliases = ALIAS.format(name='MainActivity', icon='ic_launcher', enabled='true')
    for tid, *_ in ts[1:]:
        aliases += ALIAS.format(name='Icon' + tid.capitalize(), icon=f'ic_launcher_{tid}', enabled='false')
    for rid in rare:
        aliases += ALIAS.format(name='Icon' + rid.capitalize(), icon=f'ic_launcher_{rid}', enabled='false')
    man = ROOT / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
    text = man.read_text()
    start, end = '        <!-- theme icons (scripts/make-icons.py, themes mode) -->\n', '        <!-- /theme icons -->\n'
    assert start in text and end in text, 'AndroidManifest.xml: theme icon markers missing'
    text = re.sub(re.escape(start) + '.*?' + re.escape(end), lambda _: start + aliases + end, text, flags=re.S)
    man.write_text(text)
    print(f'{len(ts) - 1} theme icons, {len(rare)} rare icons')


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
