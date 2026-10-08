"""One-off: generate the Ayah Studio logo, app icons and splash screens (original artwork).

The mark ("sound a"): a lowercase "a" followed by two fading sound bars (the recitation), white on an
emerald → teal gradient tile. The gradient is a brand moment only (icon, launch screen, name); no Quran
text in the logo.

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
E0, E1 = '#05573d', '#22b3a0'   # emerald → teal (icon tile)
T0, T1 = '#34d399', '#5eead4'   # lighter pair for the name on dark
DARK = '#07130f'                # launch screen
WHITE, BAR = '#ffffff', '#c8f7ec'


def chrome():
    if os.environ.get('CHROME'):
        return os.environ['CHROME']
    for p in sorted(Path('/opt/pw-browsers').glob('chromium-*/chrome-linux/chrome'), reverse=True):
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
    main()
