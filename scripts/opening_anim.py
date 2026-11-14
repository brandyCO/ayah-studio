"""The opening animation (owner 2026-11-14: "make a motion animation that's premium"; the character, not the icon).

The user-facing default character is rigged and animated here, frame by frame: soft sleeve arms that bend along a
curve and trail their swing (rubber-hose overlap), mitten hands, squash and stretch round the feet, a head that lags,
tilts and squashes less than the body, blinks, a mouth that opens, faces that change in two frames. Arms, squash, head
and lean are springs driven by targets and impulses (take-off, landing), so overshoot and follow-through come out of the
physics. 2.25 s at 60 fps: pops out of the ground surprised with arms up → lands (squash, dust) → smiles, blinks →
crouches → leaps with star eyes, arms up → lands in gold sparkles → waves, head tilted, and holds that pose.

Each frame is SVG rendered by Chromium (transparent), then encoded as an animated WebP with alpha into
android/app/src/main/res/raw/opening.webp. AppActivity plays it with AnimatedImageDrawable (Android 9+), which decodes
and draws on its own threads, full screen on the splash colour, so the app starting up can't make it stutter.

  python3 scripts/opening_anim.py            # writes res/raw/opening.webp
  python3 scripts/opening_anim.py --preview OUT.mp4   # a phone-screen video on the splash colour"""
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'android' / 'app' / 'src' / 'main' / 'res' / 'raw' / 'opening.webp'
SPLASH_BG = '#5b3fbf'   # values/ic_launcher_background.xml splash_background

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


FPS = 60
DUR = 2.25
VB = (-30, -78, 260, 340)          # figure units shown
PX = 3.6                              # px per unit
FEET = (100, 251)
NECK = (100, 140)
SHL = {-1: (75.0, 164.0), 1: (125.0, 164.0)}   # screen-left / screen-right shoulder
ARM = 45.0
SLEEVE, SLEEVE_HI, CREASE = '#cfc6b4', '#f7f6f0', '#a19a8c'
SKIN, SKIN_SH = '#e0a676', '#bf7c4f'
GOLD = '#ffd34d'


# ------------------------------------------------------------------ art
def load_parts(svg):
    s = re.sub(r'<ellipse class="fg-shadow"[^>]*/>', '', svg)
    body = s[s.index('class="fg-bob">') + len('class="fg-bob">'):s.rindex('</g></g></svg>')]
    head, body = cut(body, 'fg-head')
    for c in ['fg-up', 'fg-wv', 'fg-arms']:
        _, body = cut(body, c)
    head = inner(head)
    xp = {}
    for x in ['x0', 'x-happy', 'x-wow', 'x-star', 'x-sleepy', 'x-calm', 'x-proud']:
        g, head = cut(head, f'fg-{x}')
        xp[x] = inner(g)
    i = head.index('<clipPath id="fg14">')
    neck, head = head[:i], head[i:]
    eyes, _ = cut(xp['x0'], 'fg-eyes')
    hp = xp['x-happy']
    cheeks_nose = hp[:hp.index('<path d="M75 106.5')]
    must = re.search(r'<path d="M86 117[^>]*/>', hp).group()
    mouth = hp[hp.index('<clipPath id="fg21">'):]
    return dict(body=body, neck=neck, head=head, wow=xp['x-wow'], star=xp['x-star'], squint=hp,
                eyes=eyes, cheeks_nose=cheeks_nose, must=must, mouth=mouth)


def joy(P, blink, mouth_open):
    """Open eyes + big smile, with a blink (1 open … 0 shut) and the mouth opening (1 = drawn)."""
    by = max(0.06, blink)
    return (P['cheeks_nose'] +
            f'<g transform="translate(0 104) scale(1 {by:.3f}) translate(0 -104)">{P["eyes"]}</g>' + P['must'] +
            f'<g transform="translate(100 122) scale(1 {mouth_open:.3f}) translate(-100 -122)">{P["mouth"]}</g>')


def bez(p0, c, p2, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1])


def dbez(p0, c, p2, t):
    return (2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p2[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p2[1] - c[1]))


def unit(v):
    n = math.hypot(*v) or 1
    return (v[0] / n, v[1] / n)


def arm_svg(side, theta, bend, uid, wrist_turn=0.0):
    """A soft sleeve tube from the shoulder along a quadratic curve, ending in a mitten hand.
    theta: degrees from straight down, positive = away from the body. bend: elbow offset (units)."""
    S = SHL[side]
    a = math.radians(theta)
    W = (S[0] + side * ARM * math.sin(a), S[1] + ARM * math.cos(a))
    d = unit((W[0] - S[0], W[1] - S[1]))
    nrm = (-d[1], d[0])
    mid = ((S[0] + W[0]) / 2, (S[1] + W[1]) / 2)
    C = (mid[0] + nrm[0] * bend * side, mid[1] + nrm[1] * bend * side)
    n = 18
    L, R = [], []
    for i in range(n + 1):
        t = i / n
        p = bez(S, C, W, t)
        tg = unit(dbez(S, C, W, t))
        nn = (-tg[1], tg[0])
        r = 11.0 + (9.2 - 11.0) * t
        L.append((p[0] + nn[0] * r, p[1] + nn[1] * r))
        R.append((p[0] - nn[0] * r, p[1] - nn[1] * r))
    f = lambda q: f'{q[0]:.2f} {q[1]:.2f}'
    path = 'M' + f(L[0]) + ''.join('L' + f(q) for q in L[1:])
    path += f'A9.2 9.2 0 0 0 {f(R[-1])}' + ''.join('L' + f(q) for q in reversed(R[:-1]))
    path += f'A11 11 0 0 0 {f(L[0])}Z'
    out = (f'<clipPath id="a{uid}"><path d="{path}"/></clipPath><path d="{path}" fill="{SLEEVE}"/>'
           f'<path d="{path}" fill="{SLEEVE_HI}" transform="translate(-3 -2.5)" clip-path="url(#a{uid})"/>')
    # cuff band and a crease on the shaded side
    cuff = [bez(S, C, W, t) for t in (0.80, 0.93)]
    tg = unit(dbez(S, C, W, 0.86)); nn = (-tg[1], tg[0])
    q = [(cuff[0][0] + nn[0] * 10, cuff[0][1] + nn[1] * 10), (cuff[1][0] + nn[0] * 9.4, cuff[1][1] + nn[1] * 9.4),
         (cuff[1][0] - nn[0] * 9.4, cuff[1][1] - nn[1] * 9.4), (cuff[0][0] - nn[0] * 10, cuff[0][1] - nn[1] * 10)]
    out += f'<path d="M{f(q[0])}L{f(q[1])}L{f(q[2])}L{f(q[3])}Z" fill="{SLEEVE}" opacity=".5" clip-path="url(#a{uid})"/>'
    # mitten: oriented along the forearm, thumb towards the body's front
    te = unit(dbez(S, C, W, 1.0))
    ang = math.degrees(math.atan2(te[1], te[0])) - 90 + wrist_turn
    hx, hy = W[0] + te[0] * 3.5, W[1] + te[1] * 3.5
    hand = (f'<ellipse cx="0" cy="0" rx="8.4" ry="9.8"/>')
    th = f'<ellipse cx="{-side * 7.2:.1f}" cy="-2.5" rx="3.6" ry="5" transform="rotate({-side * 25} {-side * 7.2:.1f} -2.5)"/>'
    out += (f'<g transform="translate({hx:.2f} {hy:.2f}) rotate({ang:.2f})">'
            f'<clipPath id="h{uid}">{hand}{th}</clipPath>'
            f'<g fill="{SKIN_SH}">{hand}{th}</g>'
            f'<g fill="{SKIN}" transform="rotate({-ang:.2f}) translate(-2.2 -2.2) rotate({ang:.2f})" clip-path="url(#h{uid})">{hand}{th}</g>'
            f'</g>')
    return out


def sparkle(x, y, r, rot, op):
    k = 0.32
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * k
        a = math.radians(rot + i * 45)
        pts.append(f'{x + rr * math.sin(a):.2f} {y - rr * math.cos(a):.2f}')
    return f'<path d="M{"L".join(pts)}Z" fill="{GOLD}" opacity="{op:.3f}"/>'


# ------------------------------------------------------------------ motion
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def seg(t, a, b): return clamp((t - a) / (b - a))
def ease_out_back(u, s=2.2): u -= 1; return 1 + u * u * ((s + 1) * u + s)
def smooth(u): return u * u * (3 - 2 * u)
def ease_io(u): return 0.5 - 0.5 * math.cos(math.pi * u)


HOPS = [(0.05, 0.37, 46.0), (1.00, 1.44, 100.0)]   # (take-off, landing, height)


def height(t):
    for a, b, h in HOPS:
        if a <= t <= b:
            u = (t - a) / (b - a)
            return 4 * h * u * (1 - u)
    return 0.0


def vel(t):
    e = 1e-3
    return (height(t + e) - height(t - e)) / (2 * e)


class Spring:
    def __init__(self, x=0.0, k=900.0, c=22.0):
        self.x, self.v, self.k, self.c = x, 0.0, k, c

    def step(self, target, dt):
        a = -self.k * (self.x - target) - self.c * self.v
        self.v += a * dt
        self.x += self.v * dt


def arm_targets(t):
    """(left θ, right θ) the arms reach for."""
    if t < 0.30:
        return 128.0, 128.0                       # ta-da on the way up
    if t < 0.74:
        return 14.0, 14.0                         # rest
    if t < 0.98:
        return 38.0, 38.0                         # wind up in the crouch
    if t < 1.40:
        return 114.0, 114.0                       # both up through the jump
    if t < 1.56:
        return 20.0, 118.0                        # landing: right already lifting
    w = t - 1.56
    amp = 20.0 * (1 - smooth(seg(t, 1.95, 2.18)))
    return 12.0, 122.0 + amp * math.sin(2 * math.pi * 3.1 * w)


def simulate():
    dt = 1 / 1200
    n = int(DUR * FPS) + 1
    sq = Spring(0.0, k=520.0, c=13.0)        # squash: sy = 1 + sq + stretch
    head = Spring(0.0, k=700.0, c=16.0)      # head lag (units, + down)
    tilt = Spring(0.0, k=260.0, c=12.0)      # head tilt (deg)
    lean = Spring(0.0, k=160.0, c=11.0)      # body lean (deg)
    arms = {-1: Spring(10.0, k=420.0, c=17.0), 1: Spring(10.0, k=420.0, c=17.0)}
    for s in arms.values():
        s.x = 128.0
    events = {a: 'off' for a, _, _ in HOPS}
    events.update({b: 'land' for _, b, _ in HOPS})
    done = set()
    frames = []
    t = 0.0
    k = 0
    while k < n:
        # impulses
        for et, kind in events.items():
            if et not in done and t >= et:
                done.add(et)
                big = et > 0.9
                if kind == 'off':
                    sq.v += 9.0 if big else 4.0
                    head.v += 70.0 if big else 30.0
                    for s in arms.values():
                        s.v += 120.0 if big else 0.0
                else:
                    sq.v -= 8.0 if big else 6.0
                    head.v += 150.0 if big else 110.0
                    for s in arms.values():
                        s.v -= 260.0 if big else 200.0
        crouch = -0.20 * smooth(seg(t, 0.74, 0.95)) * (t < 1.0)
        sq.step(crouch, dt)
        head.step(0.0, dt)
        lt, rt = arm_targets(t)
        arms[-1].step(lt, dt)
        arms[1].step(rt, dt)
        tilt_t = 0.0
        if t >= 1.50:
            tilt_t = -6.0 + 3.0 * math.sin(2 * math.pi * 3.1 * (t - 1.62)) * (1 - smooth(seg(t, 1.95, 2.18)))
        elif 0.74 <= t < 1.0:
            tilt_t = -3.0
        tilt.step(tilt_t, dt)
        lean_t = -3.0 if t >= 1.5 else (-2.0 if 0.74 <= t < 1.0 else 0.0)
        lean.step(lean_t, dt)
        if t >= k / FPS - 1e-9:
            frames.append(dict(t=t, sq=sq.x, head=head.x, tilt=tilt.x, lean=lean.x,
                               al=arms[-1].x, ar=arms[1].x, alv=arms[-1].v, arv=arms[1].v))
            k += 1
        t += dt
    return frames


def face_at(t):
    """[(face, weight)] with two-frame crossfades."""
    keys = [(0.0, 'wow'), (0.36, 'squint'), (0.60, 'joy'), (0.99, 'star'), (1.44, 'squint'), (1.60, 'joy')]
    cf = 2 / FPS
    cur = keys[0][1]
    for i, (kt, f) in enumerate(keys):
        if t >= kt:
            cur = f
            prev = keys[i - 1][1] if i else f
            if t < kt + cf and i:
                w = (t - kt) / cf
                return [(prev, 1 - w), (f, w)]
    return [(cur, 1.0)]


def blink_at(t):
    v = 1.0
    for bt in (0.68, 2.02):
        x = abs(t - bt) / 0.055
        if x < 1:
            v = min(v, x * x)
    return v


def mouth_at(t):
    if t < 1.6:
        return 1.0
    return 1.0 + 0.25 * math.sin(math.pi * seg(t, 1.6, 1.9)) + 0.1 * smooth(seg(t, 1.9, 2.1))


def frame(P, F, i):
    t = F['t']
    # pop-in scale
    s = 0.0 if t < 0.02 else ease_out_back(seg(t, 0.02, 0.24), 2.6)
    h = height(t)
    v = vel(t)
    stretch = 0.16 * clamp(abs(v) / 420.0) if h > 0 else 0.0
    sy = max(0.6, 1 + F['sq'] + stretch)
    sx = sy ** -0.7
    fx, fy = FEET
    lean = F['lean']
    root = (f'translate({fx} {fy - h:.2f}) rotate({lean:.2f}) scale({s * sx:.4f} {s * sy:.4f}) '
            f'translate({-fx} {-fy})')
    # head: less squash than the body, lag + tilt round the neck
    hsx, hsy = sx ** -0.55, sy ** -0.55
    hl = clamp(F['head'], -5.0, 6.0)
    head_tf = (f'translate(0 {hl:.2f}) rotate({F["tilt"]:.2f} 100 140) '
               f'translate(100 140) scale({hsx:.4f} {hsy:.4f}) translate(-100 -140)')
    neck_tf = f'translate(0 {hl * 0.5:.2f})'
    faces = ''
    for f, w in face_at(t):
        if f == 'joy':
            g = joy(P, blink_at(t), mouth_at(t))
        else:
            g = P[f]
        faces += f'<g opacity="{w:.3f}">{g}</g>'
    # arms: bend trails the swing; a soft elbow at rest
    def bend(theta, om, base=4.0):
        return base + clamp(-om * 0.022, -15.0, 15.0)
    turn_r = 0.0
    arm_l = arm_svg(-1, F['al'], bend(F['al'], F['alv']), f'l{i}')
    arm_r = arm_svg(1, F['ar'], bend(F['ar'], F['arv'], 4.0 + 12.0 * smooth(seg(t, 1.45, 1.65))), f'r{i}', turn_r)
    # shadow
    sh_k = s * (1 - h / 160)
    shadow = (f'<ellipse cx="{fx}" cy="{fy + 1}" rx="{58 * sh_k * sx:.2f}" ry="{8 * sh_k:.2f}" fill="#24135e" '
              f'opacity="{0.42 * clamp(sh_k):.3f}"/>')
    fx_layer = ''
    # pop ring
    if 0.02 <= t < 0.40:
        u = seg(t, 0.02, 0.40)
        r = 30 + 90 * (1 - (1 - u) ** 3)
        fx_layer += (f'<ellipse cx="{fx}" cy="{fy}" rx="{r:.1f}" ry="{r * 0.22:.1f}" fill="none" stroke="#fff" '
                     f'stroke-width="{4 * (1 - u):.2f}" opacity="{0.7 * (1 - u):.3f}"/>')
    # landing sparkles + dust
    for lt, cnt, big in ((0.37, 0, False), (1.44, 7, True)):
        if lt <= t < lt + 0.55:
            u = seg(t, lt, lt + 0.55)
            for j in range(2):
                sd = -1 if j == 0 else 1
                for m in range(3):
                    du = clamp(u * 1.6 - m * 0.12)
                    if 0 < du < 1:
                        x = fx + sd * (34 + 50 * (1 - (1 - du) ** 2) + m * 8)
                        y = fy - 4 - 10 * du - m * 3
                        fx_layer += (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{(7 - m * 1.6) * (1 - du * 0.6):.2f}" '
                                     f'fill="#fff" opacity="{0.55 * (1 - du):.3f}"/>')
            for j in range(cnt):
                a = math.radians(-150 + j * (120 / (cnt - 1)))
                du = clamp(u * 1.25 - (j % 3) * 0.05)
                dist = 70 + 70 * (1 - (1 - du) ** 3)
                x = fx + math.cos(a) * dist
                y = fy - 40 + math.sin(a) * dist * 0.9
                r = 9 * math.sin(math.pi * clamp(du)) * (1.0 if j % 2 else 0.7)
                if r > 0.3:
                    fx_layer += sparkle(x, y, r, 40 * du + j * 20, 1.0)
    body = (f'<g transform="{root}">'
            f'<g transform="{neck_tf}">{P["neck"]}</g>{P["body"]}{arm_l}{arm_r}'
            f'<g transform="{head_tf}">{P["head"]}{faces}</g></g>')
    vx, vy, vw, vh = VB
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {vw} {vh}" width="{vw * PX}" '
            f'height="{vh * PX}">{shadow}{fx_layer}{body}</svg>')


def render(frames_svg, outdir, bg=None):
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / 'frames.json').write_text(json.dumps(frames_svg))
    vw, vh = VB[2] * PX, VB[3] * PX
    js = f'''const {{ chromium }} = require('playwright'); const fs = require('fs');
(async () => {{ const fr = JSON.parse(fs.readFileSync('{outdir}/frames.json'));
const b = await chromium.launch(); const pg = await b.newPage({{ viewport: {{ width: {vw}, height: {vh} }} }});
await pg.setContent('<body style="margin:0;background:{bg or 'transparent'}"><div id=s></div></body>');
for (let i = 0; i < fr.length; i++) {{
  await pg.evaluate((s) => {{ document.getElementById('s').innerHTML = s; }}, fr[i]);
  await pg.screenshot({{ path: '{outdir}/f' + String(i).padStart(4, '0') + '.png', omitBackground: {str(bg is None).lower()} }}); }}
await b.close(); }})();'''
    (outdir / 'r.cjs').write_text(js)
    subprocess.run(['node', str(outdir / 'r.cjs')], check=True, cwd=str(ROOT))


def frames():
    P = load_parts(actor_svg())
    return [frame(P, f, i) for i, f in enumerate(simulate())]


def main():
    from PIL import Image
    with tempfile.TemporaryDirectory() as d:
        if '--preview' in sys.argv:
            out = sys.argv[sys.argv.index('--preview') + 1]
            render(frames(), d, SPLASH_BG)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{d}/f%04d.png',
                            '-vf', 'tpad=stop_mode=clone:stop_duration=1,format=yuv420p', '-c:v', 'libx264',
                            '-crf', '18', out], check=True)
            return
        svgs = frames()
        render(svgs, d)
        ims = [Image.open(f'{d}/f{i:04d}.png').convert('RGBA') for i in range(len(svgs))]
        # 60 fps in whole milliseconds: 17, 17, 16, …
        dur = [17 if i % 3 != 2 else 16 for i in range(len(ims))]
        OUT.parent.mkdir(parents=True, exist_ok=True)
        ims[0].save(OUT, 'WEBP', save_all=True, append_images=ims[1:], duration=dur, loop=1, quality=75, method=6,
                    alpha_quality=80, minimize_size=True, allow_mixed=True)
        print(OUT, OUT.stat().st_size, 'bytes,', len(ims), 'frames')


if __name__ == '__main__':
    main()
