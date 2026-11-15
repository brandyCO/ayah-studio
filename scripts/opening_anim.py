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
  python3 scripts/opening_anim.py --preview OUT.mp4   # a phone-screen video on the splash colour
  --version hello | wake | dua | flip | catch           # which animation (VERSIONS; default catch, owner pick 2026-11-14)"""
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
VB = (-30, -78, 260, 340)          # figure units shown
PX = 3.6                              # px per unit
FEET = (100, 251)
NECK = (100, 140)
BODY_W = 0.86                         # the robe a little narrower than in the app, like the app icon (owner 2026-11-15)
SHL = {-1: (100 - 34 * BODY_W, 160.0), 1: (100 + 34 * BODY_W, 160.0)}   # screen-left / screen-right shoulder
ARM = 52.0
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
    eyes, x0rest = cut(xp['x0'], 'fg-eyes')
    hp = xp['x-happy']
    cheeks_nose = hp[:hp.index('<path d="M75 106.5')]
    brow = hp.index('<path d="M111 106.5')
    brow = hp.index('/>', brow) + 2
    last = hp.rindex('<clipPath')               # the mouth's clip; the moustache sits between
    must, mouth = hp[brow:last], hp[last:]
    return dict(body=body, neck=neck, head=head, wow=xp['x-wow'], star=xp['x-star'], squint=hp,
                sleepy=xp['x-sleepy'], calm=xp['x-calm'], proud=xp['x-proud'], x0rest=x0rest,
                eyes=eyes, cheeks_nose=cheeks_nose, must=must, mouth=mouth)


def joy(P, blink, mouth_open):
    """Open eyes + big smile, with a blink (1 open … 0 shut) and the mouth opening (1 = drawn)."""
    by = max(0.06, blink)
    return (P['cheeks_nose'] +
            f'<g transform="translate(0 104) scale(1 {by:.3f}) translate(0 -104)">{P["eyes"]}</g>' + P['must'] +
            f'<g transform="translate(100 122) scale(1 {mouth_open:.3f}) translate(-100 -122)">{P["mouth"]}</g>')


def open_face(P, blink):
    """The plain face with blinkable eyes."""
    by = max(0.06, blink)
    return P['x0rest'] + f'<g transform="translate(0 104) scale(1 {by:.3f}) translate(0 -104)">{P["eyes"]}</g>'


def bez(p0, c, p2, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1])


def dbez(p0, c, p2, t):
    return (2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p2[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p2[1] - c[1]))


def unit(v):
    n = math.hypot(*v) or 1
    return (v[0] / n, v[1] / n)


def arm_svg(side, theta, bend, uid, wrist_turn=0.0, reach=1.0):
    """A soft sleeve tube from the shoulder along a quadratic curve, ending in a mitten hand.
    theta: degrees from straight down, positive = away from the body. bend: elbow offset (units)."""
    S = SHL[side]
    a = math.radians(theta)
    W = (S[0] + side * ARM * reach * math.sin(a), S[1] + ARM * reach * math.cos(a))
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
def mixv(a, b, u): return a + (b - a) * u


class Spring:
    def __init__(self, x=0.0, k=900.0, c=22.0):
        self.x, self.v, self.k, self.c = x, 0.0, k, c

    def step(self, target, dt):
        a = -self.k * (self.x - target) - self.c * self.v
        self.v += a * dt
        self.x += self.v * dt


def light_star(x, y, r, rot, glow=1.0):
    """The gold Light star: soft glow, four rounded points, a white heart."""
    out = ''
    if glow > 0:
        out += (f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r * 2.1:.2f}" fill="{GOLD}" opacity="{0.18 * glow:.3f}"/>'
                f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r * 1.35:.2f}" fill="#fff3b0" opacity="{0.28 * glow:.3f}"/>')
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.40
        a = math.radians(rot + i * 45)
        pts.append((x + rr * math.sin(a), y - rr * math.cos(a)))
    d = 'M' + 'L'.join(f'{p[0]:.2f} {p[1]:.2f}' for p in pts) + 'Z'
    out += (f'<path d="{d}" fill="#f5a623" stroke="#f5a623" stroke-width="{r * 0.22:.2f}" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="{GOLD}" transform="translate({x:.2f} {y:.2f}) scale(.8) translate({-x:.2f} {-y:.2f})"/>'
            f'<circle cx="{x - r * 0.12:.2f}" cy="{y - r * 0.14:.2f}" r="{r * 0.2:.2f}" fill="#fff" opacity=".9"/>')
    return out


class Hello:
    """Pops out of the ground surprised, arms up → lands (squash, dust) → smiles, blinks → crouches → leaps with star
    eyes, arms up → lands in gold sparkles → waves, head tilted, and holds that pose."""
    key, title = 'hello', 'Hello'
    dur = 2.25
    # (take-off, landing, height, big, gold sparkles on landing)
    hops = [(0.05, 0.37, 46.0, False, 0), (1.00, 1.44, 100.0, True, 7)]
    faces = [(0.0, 'wow'), (0.36, 'squint'), (0.60, 'joy'), (0.99, 'star'), (1.44, 'squint'), (1.60, 'joy')]
    blinks = (0.68, 2.02)
    arms0 = 128.0
    ring = (0.02, 0.40)
    pivot = (100, 190)

    def height(self, t):
        for a, b, h, _, _ in self.hops:
            if a <= t <= b:
                u = (t - a) / (b - a)
                return 4 * h * u * (1 - u)
        return 0.0

    def vel(self, t):
        e = 1e-3
        return (self.height(t + e) - self.height(t - e)) / (2 * e)

    def impulse(self, kind, big, sq, head, arms):
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

    kicks = ()   # extra impulses: (time, 'sq' | 'head', velocity)

    def pop(self, t):
        return 0.0 if t < 0.02 else ease_out_back(seg(t, 0.02, 0.24), 2.6)

    def arm_targets(self, t):
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

    def bend_min(self, t):
        return -99.0                              # elbows may bow inwards as the arm swings

    def reach(self, t):
        return 1.0, 1.0

    def bend_base(self, t, side):
        return 4.0 + (12.0 * smooth(seg(t, 1.45, 1.65)) if side == 1 else 0.0)

    def wrist(self, t, side):
        return 0.0

    def crouch(self, t):
        return -0.20 * smooth(seg(t, 0.74, 0.95)) * (t < 1.0)

    def head(self, t):
        return 0.0

    def tilt(self, t):
        if t >= 1.50:
            return -6.0 + 3.0 * math.sin(2 * math.pi * 3.1 * (t - 1.62)) * (1 - smooth(seg(t, 1.95, 2.18)))
        if 0.74 <= t < 1.0:
            return -3.0
        return 0.0

    def lean(self, t):
        return -3.0 if t >= 1.5 else (-2.0 if 0.74 <= t < 1.0 else 0.0)

    def spin(self, t):
        return 0.0

    def float(self, t):
        return 0.0

    def look(self, t):
        """Face offset (units) — the face turned towards something."""
        return 0.0, 0.0

    def mouth(self, t):
        if t < 1.6:
            return 1.0
        return 1.0 + 0.25 * math.sin(math.pi * seg(t, 1.6, 1.9)) + 0.1 * smooth(seg(t, 1.9, 2.1))

    def behind(self, t, c):
        return ''

    def inbody(self, t, c):
        return ''

    def front(self, t, c):
        return ''


class Wake(Hello):
    """Dozing, head nodding, z's floating up → a big slow stretch → groggy blinks → eyes pop open → a happy hop that
    lands in sparkles, arms open."""
    key, title = 'wake', 'Wake up'
    dur = 2.6
    hops = [(1.64, 1.98, 50.0, True, 7)]
    faces = [(0.0, 'sleepy'), (1.24, 'open'), (1.52, 'wow'), (1.98, 'squint'), (2.12, 'joy')]
    blinks = (1.32, 1.44, 2.45)
    arms0 = 8.0
    ring = None

    def pop(self, t):
        return 0.0 if t < 0.02 else ease_out_back(seg(t, 0.02, 0.34), 1.3)

    # nods off … settles after the stretch … snaps awake
    kicks = ((0.58, 'head', 55.0), (1.20, 'sq', -3.0), (1.20, 'head', 40.0), (1.52, 'head', -70.0))

    def arm_targets(self, t):
        if t < 0.78:
            return 8.0, 8.0
        if t < 1.20:
            a = 8.0 + 116.0 * ease_io(seg(t, 0.80, 1.10))
            return a, a
        if t < 1.52:
            return 14.0, 14.0
        if t < 1.64:
            return 36.0, 36.0
        if t < 1.98:
            return 118.0, 118.0
        return 70.0 + 4 * math.sin(2 * math.pi * 1.5 * (t - 1.98)), 70.0 + 4 * math.sin(2 * math.pi * 1.5 * (t - 1.98))

    def bend_base(self, t, side):
        return 6.0

    def crouch(self, t):
        if t < 0.78:
            return -0.03 + 0.03 * math.sin(2 * math.pi * 1.1 * t)
        if t < 1.20:
            return 0.12 * smooth(seg(t, 0.78, 1.05))
        if t < 1.52:
            return 0.0
        if t < 1.64:
            return -0.18 * smooth(seg(t, 1.52, 1.62))
        return 0.0

    def head(self, t):
        return 4.0 if t < 0.78 else (-3.0 if t < 1.2 else 0.0)

    def tilt(self, t):
        if t < 0.78:
            return 9.0 + 3.0 * math.sin(2 * math.pi * 0.9 * t)
        if t < 1.2:
            return -7.0
        if t < 1.52:
            return 3.0
        if t < 1.98:
            return 0.0
        return -5.0

    def lean(self, t):
        return 3.0 if t < 0.78 else (-2.0 if t >= 1.98 else 0.0)

    def mouth(self, t):
        return 1.0 if t < 2.12 else 1.0 + 0.2 * math.sin(math.pi * seg(t, 2.12, 2.4))

    def front(self, t, c):
        out = ''
        for j, t0 in enumerate((0.05, 0.32, 0.59)):
            u = seg(t, t0, t0 + 0.75)
            if 0 < u < 1 and t < 1.3:
                x = 150 + 18 * u + 6 * math.sin(6 * u + j)
                y = 60 - 70 * u
                k = 0.6 + 0.5 * u
                op = math.sin(math.pi * u) * (1 - seg(t, 1.0, 1.3))
                out += (f'<path d="M-6 -6H6L-6 6H6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" '
                        f'stroke-linejoin="round" opacity="{op:.3f}" '
                        f'transform="translate({x:.1f} {y:.1f}) scale({k:.3f}) rotate({-12 + 10 * u:.1f})"/>')
        return out


class Dua(Hello):
    """Rises softly smiling → eyes close, hands raised in du'a → a warm light gathers, motes rise from the hands →
    Ameen: the light blooms, a small happy hop, arms open in welcome."""
    key, title = 'dua', "Du'a"
    dur = 2.7
    hops = [(1.84, 2.10, 24.0, False, 7)]
    faces = [(0.0, 'joy'), (0.44, 'calm'), (1.80, 'joy')]
    blinks = (2.42,)
    arms0 = 10.0
    ring = None

    def pop(self, t):
        return 0.0 if t < 0.02 else ease_out_back(seg(t, 0.02, 0.36), 1.4)

    def arm_targets(self, t):
        if t < 0.34:
            return 10.0, 10.0
        if t < 1.66:
            return -35.0, -35.0
        if t < 1.84:
            return 18.0, 18.0
        if t < 2.10:
            return 40.0, 40.0
        return 62.0, 62.0

    def reach(self, t):
        r = 1.0 - 0.58 * smooth(seg(t, 0.36, 0.62)) * (1 - smooth(seg(t, 1.64, 1.82)))
        return r, r

    def bend_base(self, t, side):
        return mixv(4.0, -16.0, smooth(seg(t, 0.36, 0.62)) * (1 - smooth(seg(t, 1.64, 1.82))))

    def wrist(self, t, side):
        return side * self.WR * smooth(seg(t, 0.40, 0.62)) * (1 - smooth(seg(t, 1.64, 1.80)))

    WR = 30.0

    def crouch(self, t):
        if 0.5 < t < 1.7:
            return 0.02 * math.sin(2 * math.pi * 0.9 * (t - 0.5))
        if 1.70 <= t < 1.84:
            return -0.12 * smooth(seg(t, 1.70, 1.82))
        return 0.0

    def head(self, t):
        return 3.0 if 0.42 <= t < 1.70 else 0.0

    def tilt(self, t):
        return -5.0 if t >= 2.0 else 0.0

    def lean(self, t):
        return -2.0 if t >= 2.0 else 0.0

    def light(self, t):
        return smooth(seg(t, 0.62, 1.30))

    def behind(self, t, c):
        g = self.light(t)
        out = ''
        if g > 0:
            bloom = smooth(seg(t, 1.66, 1.86)) * (1 - seg(t, 1.86, 2.6))
            pulse = 1 + 0.05 * math.sin(2 * math.pi * 1.1 * t)
            op = g * (1 - 0.7 * seg(t, 2.05, 2.7)) * (0.75 + 0.5 * bloom)
            out += ('<defs><radialGradient id="dg"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".75"/>'
                    '<stop offset=".45" stop-color="#ffd34d" stop-opacity=".32"/>'
                    '<stop offset="1" stop-color="#ffd34d" stop-opacity="0"/></radialGradient></defs>'
                    f'<circle cx="100" cy="160" r="{122 * pulse * (0.8 + 0.2 * g + 0.15 * bloom):.1f}" fill="url(#dg)" '
                    f'opacity="{op:.3f}"/>')
        # motes rise from the hands behind the body and drift out past the shoulders
        hx, hy = c['map'](100, 178)
        for j in range(12):
            t0 = 0.62 + j * 0.085
            u = seg(t, t0, t0 + 0.95)
            if 0 < u < 1 and t < 1.95:
                sd = -1 if j % 2 else 1
                x = hx + sd * (14 + 62 * u + 6 * math.sin(4 * u + j)) + (j % 3 - 1) * 4
                y = hy - 20 - 150 * u + (j % 4) * 6
                r = 2.4 + (j % 3) * 1.1
                op = math.sin(math.pi * u) * (1 - seg(t, 1.70, 1.95))
                out += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="{GOLD}" opacity="{op:.3f}"/>'
        if 1.66 <= t < 2.35:
            u = seg(t, 1.66, 2.35)
            r = 50 + 110 * (1 - (1 - u) ** 3)
            out += (f'<circle cx="100" cy="160" r="{r:.1f}" fill="none" stroke="{GOLD}" '
                    f'stroke-width="{5 * (1 - u):.2f}" opacity="{0.8 * (1 - u):.3f}"/>')
        return out


class Flip(Hello):
    """Pops up → winds up, determined → a big leap with a full backflip, tucked, star eyes → lands in a burst of
    sparkles, arms up in a ta-da that bounces, then a proud grin."""
    key, title = 'flip', 'Backflip'
    dur = 2.35
    hops = [(0.05, 0.30, 30.0, False, 0), (0.62, 1.30, 112.0, True, 10)]
    faces = [(0.0, 'joy'), (0.38, 'proud'), (0.66, 'star'), (1.30, 'squint'), (1.48, 'joy')]
    blinks = (2.05,)
    pivot = (100, 172)

    def arm_targets(self, t):
        if t < 0.25:
            return 110.0, 110.0
        if t < 0.38:
            return 14.0, 14.0
        if t < 0.62:
            return 42.0, 42.0
        if t < 0.72:
            return 125.0, 125.0
        if t < 1.14:
            return 30.0, 30.0                         # tucked through the flip
        if t < 1.60:
            return 125.0, 125.0
        b = 6 * math.sin(2 * math.pi * 1.6 * (t - 1.6)) * (1 - seg(t, 1.6, 2.2))
        return 112.0 + b, 112.0 + b

    def crouch(self, t):
        if 0.38 <= t < 0.62:
            return -0.20 * smooth(seg(t, 0.38, 0.58))
        if 0.70 <= t < 1.14:
            return -0.10
        return 0.0

    def spin(self, t):
        return -360.0 * ease_io(seg(t, 0.70, 1.16))

    def tilt(self, t):
        if t >= 1.5:
            return -5.0
        return 0.0

    def lean(self, t):
        if 0.38 <= t < 0.62:
            return 3.0
        return -2.0 if t >= 1.5 else 0.0

    def mouth(self, t):
        return 1.0 + 0.2 * math.sin(math.pi * seg(t, 1.48, 1.8))

    def front(self, t, c):
        out = ''
        if 1.30 <= t < 1.75:
            u = seg(t, 1.30, 1.75)
            r = 40 + 75 * (1 - (1 - u) ** 3)
            out += (f'<ellipse cx="100" cy="251" rx="{r:.1f}" ry="{r * 0.24:.1f}" fill="none" stroke="#fff" '
                    f'stroke-width="{5 * (1 - u):.2f}" opacity="{0.7 * (1 - u):.3f}"/>')
        return out


class Catch(Hello):
    """Pops up → a gold Light star appears above, the character looks up at it, wide-eyed → crouches and leaps →
    catches it in both hands at the top of the jump → holds it, glowing → it bursts into light, arms thrown up in a
    cheer → lands in sparkles and holds the joy."""
    key, title = 'catch', 'Catch the Light'
    dur = 2.6
    hops = [(0.05, 0.33, 34.0, False, 0), (1.02, 1.52, 74.0, True, 9)]
    faces = [(0.0, 'joy'), (0.40, 'wow'), (1.24, 'squint'), (1.66, 'joy')]
    blinks = (2.3,)
    T_CATCH, T_BURST = 1.26, 1.60

    def impulse(self, kind, big, sq, head, arms):
        if kind == 'land' and big:            # landing with the star held: a softer landing
            sq.v -= 2.5
            head.v += 100.0
            for s in arms.values():
                s.v -= 60.0
        else:
            super().impulse(kind, big, sq, head, arms)

    def arm_targets(self, t):
        if t < 0.28:
            return 150.0, 150.0
        if t < 0.55:
            return 14.0, 14.0
        if t < 0.80:
            return 14.0, 132.0                          # right hand points up at it
        if t < 1.02:
            return 36.0, 36.0
        if t < 1.16:
            return 100.0, 100.0
        if t < self.T_BURST:
            return -42.0, -42.0                        # cupped round the star
        if t < 1.95:
            return 152.0, 152.0
        return 64.0, 64.0

    def bend_min(self, t):
        return 6.0 if t >= self.T_BURST else -99.0   # the cheer swings out to the sides, never across the face

    def reach(self, t):
        r = 1.0 - 0.53 * smooth(seg(t, 1.14, 1.26)) * (1 - smooth(seg(t, self.T_BURST, self.T_BURST + 0.08)))
        return r, r

    def bend_base(self, t, side):
        return mixv(4.0 + 10.0 * smooth(seg(t, self.T_BURST, self.T_BURST + 0.1)), -16.0, smooth(seg(t, 1.14, 1.26)) * (1 - smooth(seg(t, self.T_BURST, self.T_BURST + 0.08))))

    def crouch(self, t):
        if 0.80 <= t < 1.02:
            return -0.22 * smooth(seg(t, 0.80, 1.0))
        return 0.0

    def head(self, t):
        return -2.0 if 0.40 <= t < 1.2 else (2.0 if 1.26 <= t < 1.6 else 0.0)

    def tilt(self, t):
        if 0.40 <= t < 1.1:
            return 6.0
        if t >= 1.9:
            return -5.0
        return 0.0

    def lean(self, t):
        return -2.0 if t >= 1.9 else 0.0

    def look(self, t):
        u = smooth(seg(t, 0.38, 0.50)) * (1 - smooth(seg(t, 1.10, 1.24)))
        return 2.5 * u, -3.5 * u

    def mouth(self, t):
        return 1.0 + 0.25 * math.sin(math.pi * seg(t, 1.66, 2.0))

    def star_pos(self, t, c):
        p0 = (176.0, -36.0)
        if t < self.T_CATCH - 0.62:
            return p0[0] + 3 * math.sin(2 * math.pi * 1.4 * t), p0[1] + 4 * math.sin(2 * math.pi * 1.1 * t)
        end = c['map'](100, 180)
        u = seg(t, self.T_CATCH - 0.62, self.T_CATCH) ** 1.5
        cp = (196.0, 60.0)
        return bez(p0, cp, end, u)

    def front(self, t, c):
        if self.T_CATCH <= t < self.T_BURST:
            return self.held(t, c)
        if t < 0.30 or t >= self.T_CATCH:
            out = ''
            if self.T_BURST <= t < self.T_BURST + 0.7:
                u = seg(t, self.T_BURST, self.T_BURST + 0.7)
                x, y = c['map'](100, 180)
                for j in range(10):
                    a = math.radians(j * 36 + 8)
                    d = 30 + 92 * (1 - (1 - u) ** 2)
                    rr = 10 * math.sin(math.pi * u) * (1.0 if j % 2 else 0.7)
                    if rr > 0.3:
                        out += sparkle(x + math.cos(a) * d, y + math.sin(a) * d, rr, 50 * u + j * 15, 1.0)
            return out
        k = ease_out_back(seg(t, 0.30, 0.48), 2.0)
        x, y = self.star_pos(t, c)
        return light_star(x, y, 15 * k, 20 * math.sin(2 * math.pi * 0.8 * t) + 200 * seg(t, 0.64, 1.26),
                          0.8 + 0.2 * math.sin(2 * math.pi * 2 * t))

    def behind(self, t, c):
        if not (self.T_CATCH - 0.05 <= t < self.T_BURST + 0.6):
            return ''
        x, y = c['map'](100, 180)
        held = smooth(seg(t, self.T_CATCH - 0.05, self.T_BURST))
        fade = 1 - seg(t, self.T_BURST + 0.05, self.T_BURST + 0.6)
        r = 60 + 50 * held + 50 * seg(t, self.T_BURST, self.T_BURST + 0.6)
        ring = ''
        if self.T_BURST <= t < self.T_BURST + 0.7:
            u = seg(t, self.T_BURST, self.T_BURST + 0.7)
            rr = 40 + 80 * (1 - (1 - u) ** 3)
            ring = (f'<circle cx="{x:.1f}" cy="{y - 20:.1f}" r="{rr:.1f}" fill="none" stroke="{GOLD}" '
                    f'stroke-width="{6 * (1 - u):.2f}" opacity="{0.9 * (1 - u):.3f}"/>')
        return ring + ('<defs><radialGradient id="cg"><stop offset="0" stop-color="#fff3b0" stop-opacity=".8"/>'
                '<stop offset=".5" stop-color="#ffd34d" stop-opacity=".3"/>'
                '<stop offset="1" stop-color="#ffd34d" stop-opacity="0"/></radialGradient></defs>'
                f'<circle cx="{x:.1f}" cy="{y - 20:.1f}" r="{r:.1f}" fill="url(#cg)" opacity="{held * fade:.3f}"/>')

    def held(self, t, c):
        """The star held up in the cupped hands, in front of them, glowing brighter."""
        if not (self.T_CATCH <= t < self.T_BURST):
            return ''
        u = seg(t, self.T_CATCH, self.T_BURST)
        x, y = c['map'](100, 168 - 4 * smooth(u))
        r = 15 * (1 + 0.25 * smooth(u)) * (1 + 0.06 * math.sin(2 * math.pi * 6 * u))
        return light_star(x, y, r, 200 + 30 * u, 0.7 + 0.4 * u)


VERSIONS = {v.key: v for v in (Hello, Wake, Dua, Flip, Catch)}


def simulate(V):
    dt = 1 / 1200
    n = int(V.dur * FPS) + 1
    sq = Spring(0.0, k=520.0, c=13.0)        # squash: sy = 1 + sq + stretch
    head = Spring(0.0, k=700.0, c=16.0)      # head lag (units, + down)
    tilt = Spring(0.0, k=260.0, c=12.0)      # head tilt (deg)
    lean = Spring(0.0, k=160.0, c=11.0)      # body lean (deg)
    arms = {-1: Spring(10.0, k=420.0, c=17.0), 1: Spring(10.0, k=420.0, c=17.0)}
    for s in arms.values():
        s.x = V.arms0
    events = {}
    for a, b, _, big, _ in V.hops:
        events[a] = ('off', big)
        events[b] = ('land', big)
    done, kicked = set(), set()
    frames = []
    t = 0.0
    k = 0
    while k < n:
        for et, (kind, big) in events.items():
            if et not in done and t >= et:
                done.add(et)
                V.impulse(kind, big, sq, head, arms)
        for j, (kt, what, dv) in enumerate(V.kicks):
            if j not in kicked and t >= kt:
                kicked.add(j)
                (sq if what == 'sq' else head).v += dv
        sq.step(V.crouch(t), dt)
        head.step(V.head(t), dt)
        lt, rt = V.arm_targets(t)
        arms[-1].step(lt, dt)
        arms[1].step(rt, dt)
        tilt.step(V.tilt(t), dt)
        lean.step(V.lean(t), dt)
        if t >= k / FPS - 1e-9:
            frames.append(dict(t=t, sq=sq.x, head=head.x, tilt=tilt.x, lean=lean.x,
                               al=arms[-1].x, ar=arms[1].x, alv=arms[-1].v, arv=arms[1].v))
            k += 1
        t += dt
    return frames


def face_at(V, t):
    """[(face, weight)] with two-frame crossfades."""
    keys = V.faces
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


def blink_at(V, t):
    v = 1.0
    for bt in V.blinks:
        x = abs(t - bt) / 0.055
        if x < 1:
            v = min(v, x * x)
    return v


def frame(V, P, F, i):
    t = F['t']
    s = V.pop(t)
    h = V.height(t)
    v = V.vel(t)
    stretch = 0.16 * clamp(abs(v) / 420.0) if h > 0 else 0.0
    sy = max(0.6, 1 + F['sq'] + stretch)
    sx = sy ** -0.7
    fx, fy = FEET
    lean = F['lean']
    fl = V.float(t)
    spin = V.spin(t)
    root = (f'translate({fx} {fy - h - fl:.2f}) rotate({lean:.2f}) scale({s * sx:.4f} {s * sy:.4f}) '
            f'translate({-fx} {-fy})')
    if spin:
        root = f'rotate({spin:.2f} {V.pivot[0]} {V.pivot[1] - h - fl:.2f}) ' + root

    def to_screen(x, y):
        """A point of the figure → the frame (without spin)."""
        x, y = (x - fx) * s * sx, (y - fy) * s * sy
        a = math.radians(lean)
        x, y = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
        return x + fx, y + fy - h - fl

    c = dict(F=F, h=h, s=s, sx=sx, sy=sy, map=to_screen)
    hsx, hsy = sx ** -0.55, sy ** -0.55
    hl = clamp(F['head'], -5.0, 6.0)
    head_tf = (f'translate(0 {hl:.2f}) rotate({F["tilt"]:.2f} 100 140) '
               f'translate(100 140) scale({hsx:.4f} {hsy:.4f}) translate(-100 -140)')
    neck_tf = f'translate(0 {hl * 0.5:.2f})'
    faces = ''
    for f, w in face_at(V, t):
        if f == 'star':
            f = 'joy'                         # no star eyes on a grown man (owner 2026-11-14)
        if f == 'joy':
            g = joy(P, blink_at(V, t), V.mouth(t))
        elif f == 'open':
            g = open_face(P, blink_at(V, t))
        else:
            g = P[f]
        faces += f'<g opacity="{w:.3f}">{g}</g>'
    lx, ly = V.look(t)
    if lx or ly:
        faces = f'<g transform="translate({lx:.2f} {ly:.2f})">{faces}</g>'

    def bend(om, base):
        return max(V.bend_min(t), base + clamp(-om * 0.022, -15.0, 15.0))
    rl, rr = V.reach(t)
    arm_l = arm_svg(-1, min(F['al'], 156.0), bend(F['alv'], V.bend_base(t, -1)), f'l{i}', V.wrist(t, -1), rl)
    arm_r = arm_svg(1, min(F['ar'], 156.0), bend(F['arv'], V.bend_base(t, 1)), f'r{i}', V.wrist(t, 1), rr)
    sh_k = s * (1 - (h + fl) / 160)
    shadow = (f'<ellipse cx="{fx}" cy="{fy + 1}" rx="{58 * sh_k * sx:.2f}" ry="{8 * sh_k:.2f}" fill="#24135e" '
              f'opacity="{0.42 * clamp(sh_k):.3f}"/>')
    fx_layer = V.behind(t, c)
    if V.ring and V.ring[0] <= t < V.ring[1]:
        u = seg(t, *V.ring)
        r = 30 + 90 * (1 - (1 - u) ** 3)
        fx_layer += (f'<ellipse cx="{fx}" cy="{fy}" rx="{r:.1f}" ry="{r * 0.22:.1f}" fill="none" stroke="#fff" '
                     f'stroke-width="{4 * (1 - u):.2f}" opacity="{0.7 * (1 - u):.3f}"/>')
    for _, lt, _, big, cnt in V.hops:
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
            f'<g transform="{neck_tf}">{P["neck"]}</g><g transform="translate(100 0) scale({BODY_W} 1) translate(-100 0)">{P["body"]}</g>{V.inbody(t, c)}{arm_l}{arm_r}'
            f'<g transform="{head_tf}">{P["head"]}{faces}</g></g>')
    vx, vy, vw, vh = VB
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {vw} {vh}" width="{vw * PX}" '
            f'height="{vh * PX}">{shadow}{fx_layer}{body}{V.front(t, c)}</svg>')


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


def frames(key='hello'):
    V = VERSIONS[key]()
    P = load_parts(actor_svg())
    return [frame(V, P, f, i) for i, f in enumerate(simulate(V))]


def main():
    from PIL import Image
    key = sys.argv[sys.argv.index('--version') + 1] if '--version' in sys.argv else 'catch'
    with tempfile.TemporaryDirectory() as d:
        if '--preview' in sys.argv:
            out = sys.argv[sys.argv.index('--preview') + 1]
            render(frames(key), d, SPLASH_BG)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{d}/f%04d.png',
                            '-vf', 'tpad=stop_mode=clone:stop_duration=1,format=yuv420p', '-c:v', 'libx264',
                            '-crf', '18', out], check=True)
            return
        svgs = frames(key)
        render(svgs, d)
        ims = [Image.open(f'{d}/f{i:04d}.png').convert('RGBA') for i in range(len(svgs))]
        # 60 fps in whole milliseconds: 17, 17, 16, …
        dur = [17 if i % 3 != 2 else 16 for i in range(len(ims))]
        OUT.parent.mkdir(parents=True, exist_ok=True)
        ims[0].save(OUT, 'WEBP', save_all=True, append_images=ims[1:], duration=dur, loop=1, quality=60, method=6,
                    alpha_quality=70, minimize_size=True, allow_mixed=True)
        print(OUT, OUT.stat().st_size, 'bytes,', len(ims), 'frames')


if __name__ == '__main__':
    main()
