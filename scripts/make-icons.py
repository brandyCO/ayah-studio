"""One-off: generate the Ayah Studio logo, app icons and splash screens (original artwork).

The mark (owner pick "E", 2026-10-31): a soft light inside the end-of-ayah rosette (two rounded squares,
one turned 45°, drawn as a thin teal line, with a fine ring inside), on a deep night-green tile. No Quran
text in the logo. (Before: the "sound a", 2026-10-08.)

Writes resources/ (source SVGs + 1024 px icon + splash), public/icon.svg + public/icon-180.png (favicon /
home-screen icon) and the Android launcher icons (legacy, round, adaptive foreground/background,
monochrome) + splash PNGs under android/app/src/main/res.
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
    for p in sorted(Path('/opt/pw-browsers').glob('chromium-*/chrome-linux/chrome'), reverse=True):
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
    main()
