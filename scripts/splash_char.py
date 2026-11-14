"""The animated launch screen: the user-facing default character alone, alive for one second (owner 2026-11-14:
"animate the character, not the icon", Duolingo-style motion, premium, never laggy).

Android 12+ draws windowSplashScreenAnimatedIcon in the system's own process and runs an AnimatedVectorDrawable on the
render thread, so nothing the app does while starting can make it stutter. The character is cut into parts (body, arms
down, arms raised, the waving arm, the head with each expression) and every motion is a curve sampled every 20 ms into
keyframes (linear between them), so springs, squash and stretch play exactly as designed here and in the preview.

Beats (1 s): pops up out of the ground (wow face, stretch, spring settle) → crouches (anticipation) → leaps with both
arms up (star eyes, stretch on take-off, squash on landing, the head lagging behind) → waves (happy face, head tilt).
The drawable's own values are the last pose, so a still render (Android 11 and older) shows him waving.

Used by make-character-icons.py --splash; `python3 scripts/splash_char.py preview OUT.mp4` renders the preview video."""
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import svg_to_vd as sv  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
V = 600                 # viewport; Android shows the middle circle of radius V/3 (192 dp of the 288 dp canvas)
K = 1.3                 # figure units → viewport units
FEET = (100, 250)       # figure units: where the feet touch the ground
NECK = (100, 140)
SHOULDER = (140, 160)   # the waving arm's shoulder
MS = 1000
STEP = 20               # ms between sampled keyframes
SPLASH_BG = '#5b3fbf'

DUMP = '''import { figureSvg, DEFAULT, normalize } from %s;
process.stdout.write(figureSvg(normalize({ ...DEFAULT, face: 1 }), { still: true, actor: true }));
'''


def actor_svg():
    with tempfile.TemporaryDirectory() as d:
        ts = Path(d) / 'dump.ts'
        ts.write_text(DUMP % repr(str(ROOT / 'src' / 'ui' / 'figure.ts')))
        return subprocess.run(['node', '--experimental-strip-types', '--no-warnings', str(ts)],
                              check=True, capture_output=True, text=True).stdout


def cut(s, cls):
    """(the <g> with this class, s without it)."""
    i = re.search(r'class="(?:[^"]* )?' + re.escape(cls) + r'"', s).start()
    st = s.rindex('<g', 0, i)
    depth = 0
    for m in re.finditer(r'<g\b|</g>', s[st:]):
        depth += 1 if m.group() == '<g' else -1
        if depth == 0:
            e = st + m.end()
            return s[st:e], s[:st] + s[e:]
    raise ValueError(cls)


def inner(g):
    return g[g.index('>') + 1:g.rindex('</g>')]


def parts():
    s = actor_svg()
    s = re.sub(r'<ellipse class="fg-shadow"[^>]*/>', '', s)
    body = s[s.index('class="fg-bob">') + len('class="fg-bob">'):s.rindex('</g></g></svg>')]
    head, body = cut(body, 'fg-head')
    up, body = cut(body, 'fg-up')
    wv, body = cut(body, 'fg-wv')
    arms, body = cut(body, 'fg-arms')
    wave, wv = cut(wv, 'fg-wave-arm')
    head = inner(head)
    xps = {}
    for x in ['x0', 'x-happy', 'x-wow', 'x-star']:
        g, head = cut(head, f'fg-{x}')
        xps[x[2:] if x != 'x0' else 'base'] = inner(g)
    for x in ['x-sleepy', 'x-calm', 'x-proud']:
        _, head = cut(head, f'fg-{x}')
    defs = ''.join(re.findall(r'<defs>.*?</defs>', s, flags=re.S))
    conv = lambda body_: sv.convert(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 262">{defs}{body_}</svg>')
    return {'body': conv(body), 'arms': conv(inner(arms)), 'up': conv(inner(up)), 'wvdown': conv(inner(wv)),
            'wave': conv(inner(wave)), 'head': conv(head), **{f'f_{k}': conv(v) for k, v in xps.items()}}


# ---------------------------------------------------------------- motion (t in seconds, 0 … 1)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def seg(t, a, b): return clamp((t - a) / (b - a))
def out_cubic(u): return 1 - (1 - u) ** 3
def in_quad(u): return u * u
def out_quad(u): return 1 - (1 - u) ** 2
def smooth(u): return u * u * (3 - 2 * u)


def spring(t, t0, amp, freq=9.0, damp=7.0):
    """A kick of `amp` at t0 that rings out (0 before t0)."""
    if t < t0: return 0.0
    d = t - t0
    return amp * math.exp(-damp * d) * math.sin(2 * math.pi * freq * d) / max(1e-9, 1)


def pop(t):
    """0 → 1 with a springy overshoot over 0 … .3 s."""
    if t <= 0: return 0.0
    d = t
    return 1 - math.exp(-11 * d) * math.cos(2 * math.pi * 3.0 * d)


T_CROUCH, T_JUMP, T_APEX, T_LAND, T_WAVE = .30, .42, .53, .64, .70
JUMP_H = 50


def jump_y(t):
    if t < T_JUMP or t > T_LAND: return 0.0
    if t < T_APEX: return -JUMP_H * out_quad(seg(t, T_JUMP, T_APEX))
    return -JUMP_H * (1 - in_quad(seg(t, T_APEX, T_LAND)))


def squash(t):
    """(scaleX, scaleY) about the feet."""
    if t < .3:  # popping up: grows from nothing, stretched as it shoots up, then rings out
        g = clamp(pop(t), 0, 1.2)
        st = math.sin(math.pi * seg(t, 0, .16)) * .18 * (1 - seg(t, .1, .2))
        ring = spring(t, .14, .07, 6, 9)
        return g * (1 - st * .6 - ring), g * (1 + st + ring)
    sy = 1.0
    sy += spring(t, .14, .07, 6, 9) * -1  # the pop's tail
    c = seg(t, T_CROUCH, T_JUMP)          # anticipation: sink, wider
    sy -= .08 * smooth(min(1, c * 1.6)) * (1 - seg(t, T_JUMP - .02, T_JUMP + .03))
    sy += .13 * math.sin(math.pi * seg(t, T_JUMP - .01, T_APEX)) * (t < T_APEX)  # stretch on take-off
    sy += .05 * math.sin(math.pi * seg(t, T_APEX + .04, T_LAND)) * (t >= T_APEX)  # falling, a little long
    if t >= T_LAND: sy -= .17 * math.exp(-14 * (t - T_LAND)) * math.cos(2 * math.pi * 4.5 * (t - T_LAND))
    sx = 1 / math.sqrt(max(.5, sy))       # keep the volume
    return sx, sy


def lean(t):
    """The whole body's tilt (degrees, about the feet)."""
    r = -4 * math.sin(math.pi * seg(t, T_CROUCH, T_JUMP)) + 3 * math.sin(math.pi * seg(t, T_JUMP, T_LAND))
    return r + 3 * smooth(seg(t, T_WAVE, T_WAVE + .12))


def head_motion(t):
    """(translateY, rotation): the head lags behind the body (follow-through) and tilts into the wave."""
    vy = (jump_y(t + .01) - jump_y(t - .01)) / .02
    lag = clamp(vy * .02, -6, 6)
    dip = 2.5 * math.sin(math.pi * seg(t, T_CROUCH, T_JUMP + .02))
    land = 3 * math.exp(-12 * max(0, t - T_LAND)) * math.sin(math.pi * seg(t, T_LAND, T_LAND + .08)) if t >= T_LAND else 0
    rot = -6 * smooth(seg(t, T_WAVE, T_WAVE + .14)) + spring(t, T_LAND, 4, 4, 8) + spring(t, .12, -5, 3, 7)
    return lag + dip + land, rot


def wave_rot(t):
    """The waving arm swings about the shoulder, two waves, ending upright."""
    if t < T_WAVE: return 75.0
    u = t - T_WAVE
    rise = 75 * (1 - out_cubic(clamp(u / .09)))
    return rise + 22 * math.sin(2 * math.pi * u / .14) * (1 - smooth(clamp((u - .12) / .18)))


def up_rot(t):
    """Raised arms: a little shake of joy at the top of the jump."""
    return 6 * math.sin(2 * math.pi * (t - T_JUMP) / .12) * math.sin(math.pi * seg(t, T_JUMP, T_LAND + .02))


def shadow(t):
    sx, _ = squash(t)
    h = -jump_y(t) / JUMP_H
    g = clamp(pop(t), 0, 1.1) if t < .3 else 1
    return g * sx * (1 - .38 * h)


def vis(t):
    """Which arms and face show."""
    arms_up = (.04 <= t < .24) or (T_JUMP - .01 <= t < T_LAND + .03)
    waving = t >= T_WAVE - .01
    face = 'wow' if t < .24 else 'star' if T_JUMP - .01 <= t < T_LAND + .05 else 'happy'
    return {'up': arms_up, 'arms': not arms_up and not waving, 'wvdown': waving and not arms_up,
            'wave': waving and not arms_up, 'f_wow': face == 'wow', 'f_star': face == 'star', 'f_happy': face == 'happy'}


def pose(t):
    sx, sy = squash(t)
    hy, hr = head_motion(t)
    p = {'act': {'translateY': jump_y(t), 'scaleX': sx, 'scaleY': sy, 'rotation': lean(t)},
         'headm': {'translateY': hy, 'rotation': hr},
         'waver': {'rotation': wave_rot(t)},
         'upr': {'rotation': up_rot(t)},
         'shadow': {'scaleX': shadow(t), 'scaleY': shadow(t)}}
    for k, on in vis(t).items():
        p['v_' + k] = {'scaleX': 1.0 if on else 0.0}
    return p


PIVOT = {'act': FEET, 'headm': NECK, 'waver': SHOULDER, 'upr': (100, 160), 'shadow': FEET,
         **{f'v_{k}': (100, 150) for k in ['up', 'arms', 'wvdown', 'wave', 'f_wow', 'f_star', 'f_happy']}}


def drawing(p, values):
    def g(name, body):
        pv = PIVOT[name]
        a = ''.join(f' android:{k}="{v:.3f}"' for k, v in values.get(name, {}).items())
        return f'<group android:name="{name}" android:pivotX="{pv[0]}" android:pivotY="{pv[1]}"{a}>{body}</group>'
    head = g('headm', p['head'] + p['f_base'] + g('v_f_wow', p['f_wow']) + g('v_f_star', p['f_star'])
             + g('v_f_happy', p['f_happy']))
    act = g('act', p['body'] + g('v_arms', p['arms']) + head + g('v_up', g('upr', p['up']))
            + g('v_wvdown', p['wvdown']) + g('v_wave', g('waver', p['wave'])))
    shad = g('shadow', f'<path android:pathData="{sv.ellipse_d(100, 250, 60, 9)}" android:fillColor="#1d1640" '
                       f'android:fillAlpha=".3"/>')
    # the figure's feet 0.27 V below the centre: the jump and raised arms stay inside the visible circle
    ox, oy = V / 2 - FEET[0] * K, V / 2 + .30 * V - FEET[1] * K
    return (f'<group android:translateX="{ox:.2f}" android:translateY="{oy:.2f}" android:scaleX="{K}" android:scaleY="{K}">'
            f'{shad}{act}</group>')


def avd(p):
    end = pose(MS / 1000)
    times = list(range(0, MS + 1, STEP))
    poses = [pose(ms / 1000) for ms in times]
    targets = ''
    for name, props in end.items():
        holders = ''
        for prop in props:
            vals = [ps[name][prop] for ps in poses]
            if all(abs(v - vals[0]) < 1e-4 for v in vals): continue
            kf = ''
            prev = None
            for i, (ms, v) in enumerate(zip(times, vals)):
                toggle = name.startswith('v_')
                if toggle and prev is not None and v != prev:   # a step: hold the old value up to this instant
                    kf += f'<keyframe android:fraction="{max(0, ms - 1) / MS:.4f}" android:value="{prev:g}"/>'
                if not toggle or prev is None or v != prev or i == len(times) - 1:
                    kf += f'<keyframe android:fraction="{ms / MS:.4f}" android:value="{v:.3f}"/>'
                prev = v
            holders += f'<propertyValuesHolder android:propertyName="{prop}">{kf}</propertyValuesHolder>'
        if holders:
            targets += (f'<target android:name="{name}"><aapt:attr name="android:animation">'
                        f'<objectAnimator android:duration="{MS}" android:interpolator="@android:anim/linear_interpolator">'
                        f'{holders}</objectAnimator></aapt:attr></target>')
    return ('<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/splash_char.py (make-character-icons.py, '
            'splash mode) -->\n<animated-vector xmlns:android="http://schemas.android.com/apk/res/android" '
            'xmlns:aapt="http://schemas.android.com/aapt"><aapt:attr name="android:drawable">'
            f'<vector android:width="288dp" android:height="288dp" android:viewportWidth="{V}" '
            f'android:viewportHeight="{V}">{drawing(p, end)}</vector></aapt:attr>{targets}</animated-vector>\n')


def frame_svg(p, t):
    return sv.to_svg(drawing(p, pose(t)), f'0 0 {V} {V}')


def preview(out, fps=60, slow=1):
    """A phone-screen video: the violet launch screen, the animation twice with a pause, at `fps`."""
    p = parts()
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        run = [i / (fps * slow) for i in range(fps * slow + 1)]
        seq = [0.0] * 12 + run + [1.0] * 36 + [0.0] * 8 + run + [1.0] * 40
        uniq = sorted(set(seq))
        for i, t in enumerate(uniq):
            svg = frame_svg(p, t).replace('width="512" height="512"', 'width="420" height="420"')
            (d / f'h{i}.html').write_text(f'<!doctype html><body style="margin:0;background:{SPLASH_BG};display:grid;'
                                          f'place-items:center;height:960px">{svg}</body>')
        js = f'''const {{ chromium }} = require('playwright');
(async () => {{ const b = await chromium.launch(); const pg = await b.newPage({{ viewport: {{ width: 540, height: 960 }} }});
for (let i = 0; i < {len(uniq)}; i++) {{
  await pg.goto('file://{d}/h' + i + '.html');
  await pg.screenshot({{ path: '{d}/p' + String(i).padStart(4, '0') + '.png' }}); }}
await b.close(); }})();'''
        (d / 'r.cjs').write_text(js)
        subprocess.run(['node', str(d / 'r.cjs')], check=True)
        idx = {t: i for i, t in enumerate(uniq)}
        for n, t in enumerate(seq):
            (d / f'q{n:04d}.png').symlink_to(d / f'p{idx[t]:04d}.png')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', str(d / 'q%04d.png'),
                        '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', str(out)], check=True)


def circle_check(p):
    """Every frame stays inside the circle Android shows (radius V/3 round the centre), by rendering."""
    from PIL import Image
    worst = 0
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        ts = [ms / 1000 for ms in range(0, MS + 1, STEP)]
        for i, t in enumerate(ts):
            (d / f'f{i}.svg').write_text(frame_svg(p, t))
        js = f'''const {{ chromium }} = require('playwright');
(async () => {{ const b = await chromium.launch(); const pg = await b.newPage({{ viewport: {{ width: 300, height: 300 }} }});
for (let i = 0; i < {len(ts)}; i++) {{ await pg.goto('file://{d}/f' + i + '.svg');
  await pg.screenshot({{ path: '{d}/c' + i + '.png', omitBackground: true, clip: {{ x: 0, y: 0, width: 300, height: 300 }} }}); }}
await b.close(); }})();'''
        (d / 'r.cjs').write_text(js.replace('width="512" height="512"', ''))
        for i in range(len(ts)):
            f = d / f'f{i}.svg'
            f.write_text(f.read_text().replace('width="512" height="512"', 'width="300" height="300"'))
        subprocess.run(['node', str(d / 'r.cjs')], check=True)
        for i in range(len(ts)):
            im = Image.open(d / f'c{i}.png').convert('RGBA')
            a = im.split()[3].load()
            for y in range(0, 300, 2):
                for x in range(0, 300, 2):
                    if a[x, y] > 20:
                        worst = max(worst, math.hypot(x - 150, y - 150) / 100)
    return worst   # ≤ 1: inside the circle


if __name__ == '__main__':
    if sys.argv[1] == 'preview':
        preview(sys.argv[2], slow=int(sys.argv[3]) if len(sys.argv) > 3 else 1)
    elif sys.argv[1] == 'check':
        print('farthest pixel / circle radius:', round(circle_check(parts()), 3))
