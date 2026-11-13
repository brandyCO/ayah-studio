"""The character app icons (owner decision 2026-11-13): the main launcher icon is "B" — the user's builder
character (src/ui/figure.ts) cheering inside the white end-of-ayah marker, with the Light star, on a bright
gradient — and every Theme colour has the same icon on its own gradient. Ten unlockable tiers of it (Crystal …
Pure light, src/data/iconTiers.ts), won with levels, badges and Ranks weeks, replace Sapphire / Gold / Celestial.

Each icon is drawn as two parts: `back` (sky, rays, nebula, sparkles: full bleed) and `front` (marker, character,
star). Android adaptive layers: background = back on the 108 dp canvas (its 512 units = the 72 dp visible area,
the base fill carried on under the parallax margin); foreground = front at 0.92 so it stays inside the 66 dp safe
circle; one monochrome (marker outline + character + star) for Android 13 themed icons. Legacy 192 px square +
round icons for Android 7, web previews in public/icons/, public/icon.svg + icon-180.png (sunset B), and the
manifest's activity-aliases between the `theme icons` markers (AppIcons.java turns one on).

Run: python3 scripts/make-character-icons.py   (Pillow, Node ≥ 22 for the figures, Chromium like make-icons.py)
"""
import math
import random
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

import importlib.util
_spec = importlib.util.spec_from_file_location('make_icons', Path(__file__).resolve().parent / 'make-icons.py')
mi = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(mi)

ROOT, RES = mi.ROOT, mi.RES
FIG = Path(tempfile.mkdtemp(prefix='figs-'))
C = 256
MX, MY = 256, 244
K = 0.92           # foreground scale inside the 72 dp visible area (keeps it in the 66 dp circle)

# ---------------------------------------------------------------- shared drawing (cheerful style)
def grad_bg(top, bot, glow=None, gy=200):
    s = (f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
         f'<stop offset="1" stop-color="{bot}"/></linearGradient>'
         '<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>'
         '<filter id="bl4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter></defs>'
         f'<rect width="512" height="512" fill="url(#bg)"/>')
    if glow:
        s += (f'<radialGradient id="hg" cx="256" cy="{gy}" r="250" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{glow}" stop-opacity=".55"/>'
              f'<stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient><rect width="512" height="512" fill="url(#hg)"/>')
    return s

def rosette(s, cx=C, cy=C):
    h = s / 2; R1 = h * math.sqrt(2); R2 = h / math.cos(math.radians(22.5)); pts = []
    for i in range(16):
        a = math.radians(-90 + i * 22.5); rr = R1 if i % 2 == 0 else R2
        pts.append(f'{cx + rr*math.cos(a):.2f},{cy + rr*math.sin(a):.2f}')
    return 'M' + ' L'.join(pts) + 'Z'

def chunky(d, fill, edge, depth=14, round_=26):
    s = f'<path d="{d}" fill="{edge}" stroke="{edge}" stroke-width="{round_}" stroke-linejoin="round" transform="translate(0 {depth})"/>'
    return s + f'<path d="{d}" fill="{fill}" stroke="{fill}" stroke-width="{round_}" stroke-linejoin="round"/>'

STAR = 'M12 1.5c.9 5 2.6 7.6 9.5 10.5-6.9 2.9-8.6 5.5-9.5 10.5-.9-5-2.6-7.6-9.5-10.5C9.4 9.1 11.1 6.5 12 1.5z'
def lstar(x, y, r, fill, edge=None, depth=0, core=None, rot=0):
    k = r / 10.5; g = lambda f, dy=0: f'<g transform="translate({x} {y+dy}) rotate({rot}) scale({k:.4f}) translate(-12 -12)"><path d="{STAR}" fill="{f}" stroke="{f}" stroke-width="1.6" stroke-linejoin="round"/></g>'
    s = (g(edge, depth) if edge else '') + g(fill)
    if core: s += f'<circle cx="{x}" cy="{y}" r="{r*.17:.1f}" fill="{core}"/>'
    return s

def sparkle(x, y, r, col='#fff', op=1):
    return lstar(x, y, r, col).replace('<g ', f'<g opacity="{op}" ', 1)

def glossy_star_defs():
    return ('<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/>'
            '<stop offset=".55" stop-color="#ffc22e"/><stop offset="1" stop-color="#ff9f1a"/></linearGradient>')

L, RO = lstar, rosette
UID = [0]
def uid(p='u'): UID[0] += 1; return f'{p}{UID[0]}'

DEFS = ('<defs>' + glossy_star_defs() +
        '<filter id="b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>'
        '<filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>'
        '<filter id="b18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>'
        '<filter id="b40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>'
        '<filter id="neb" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="4" seed="7"/>'
        '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -.55"/></filter>'
        '</defs>')

FRONT = '<!--front-->'   # where the marker starts: everything before it is the background layer
BK0, BK1 = '<!--bk-->', '<!--/bk-->'   # parts drawn after the marker that still belong to the background

def fig(name, s=2.05, top=150, aura=None, ab=7, aop=1):
    t = (FIG / f'{name}.svg').read_text()
    inner = t[t.index('>') + 1:t.rindex('</svg>')]
    inner = re.sub(r'<ellipse class="fg-shadow"[^>]*/>', '', inner)
    inner = re.sub(r'id="(fg\w+)"', lambda m: f'id="{name}-{m[1]}"', inner)
    inner = re.sub(r'url\(#(fg\w+)\)', lambda m: f'url(#{name}-{m[1]})', inner)
    g = f'<g transform="translate({256 - 100*s:.1f} {top - 35*s:.1f}) scale({s})">{inner}</g>'
    if not aura: return g
    i = uid('a')
    f = (f'<defs><filter id="{i}" x="-30%" y="-30%" width="160%" height="160%"><feFlood flood-color="{aura}"/>'
         f'<feComposite in2="SourceAlpha" operator="in"/><feMorphology operator="dilate" radius="3"/><feGaussianBlur stdDeviation="{ab}"/></filter></defs>')
    return f + f'<g filter="url(#{i})" opacity="{aop}">{g}</g><g filter="url(#{i})" opacity="{aop*.8}">{g}</g>' + g

def lin(stops, x1=0, y1=0, x2=1, y2=1):
    i = uid('g')
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<defs><linearGradient id="{i}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient></defs>', f'url(#{i})'
def rad(stops, cx=256, cy=244, r=300):
    i = uid('r')
    s = ''.join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return f'<defs><radialGradient id="{i}" cx="{cx}" cy="{cy}" r="{r}" gradientUnits="userSpaceOnUse">{s}</radialGradient></defs>', f'url(#{i})'

def bg(stops, glow=None):
    d, f = lin(stops, 0, 0, 0, 1); s = d + f'<rect width="512" height="512" fill="{f}"/>'
    if glow:
        d2, f2 = rad([(0, glow, .7), (1, glow, 0)], 256, 230, 300); s += d2 + f'<rect width="512" height="512" fill="{f2}"/>'
    return s

def rays(n, col, op=.18, L_=420, w=3, cy=MY, rot=0):
    return ''.join(f'<path d="M{MX},{cy} L{MX+L_*math.cos(math.radians(a-w+rot)):.0f},{cy+L_*math.sin(math.radians(a-w+rot)):.0f} L{MX+L_*math.cos(math.radians(a+w+rot)):.0f},{cy+L_*math.sin(math.radians(a+w+rot)):.0f}Z" fill="{col}" opacity="{op}"/>' for a in range(0, 360, 360 // n))

def dots(n, seed, cols, rmin=.8, rmax=2.2, box=(0, 0, 512, 512), glow=False, op=(.4, 1)):
    random.seed(seed); s = ''
    for _ in range(n):
        x, y = random.uniform(box[0], box[2]), random.uniform(box[1], box[3]); r = random.uniform(rmin, rmax); c = random.choice(cols)
        if glow: s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r*3:.1f}" fill="{c}" opacity=".22"/>'
        s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{c}" opacity="{random.uniform(*op):.2f}"/>'
    return s

def spark(x, y, r, col='#fff', op=1): return sparkle(x, y, r, col, op)
def sparks(pts, col='#fff'): return BK0 + ''.join(spark(x, y, r, col, o) for x, y, r, o in pts) + BK1

def marker(fill, edge, inner, size=280, depth=16, glow=None, rim='#ffffff', rim_op=.8, inner_extra='', inner_edge=None, outer_line=None):
    s = FRONT
    if glow: s += f'<path d="{RO(size+40, MX, MY)}" fill="{glow}" filter="url(#b18)" opacity=".9"/>'
    d = RO(size, MX, MY)
    s += f'<path d="{d}" fill="{edge}" stroke="{edge}" stroke-width="34" stroke-linejoin="round" transform="translate(0 {depth})"/>'
    s += f'<path d="{d}" fill="{fill}" stroke="{fill}" stroke-width="34" stroke-linejoin="round"/>'
    if outer_line: s += f'<path d="{RO(size+30, MX, MY)}" fill="none" stroke="{outer_line}" stroke-width="2.5" stroke-linejoin="round" opacity=".8"/>'
    s += f'<path d="{RO(size-12, MX, MY)}" fill="none" stroke="{rim}" stroke-width="3" stroke-linejoin="round" opacity="{rim_op}"/>'
    di = RO(size-56, MX, MY); cid = uid('c')
    s += f'<defs><clipPath id="{cid}"><path d="{di}" stroke="#000" stroke-width="26" stroke-linejoin="round"/></clipPath></defs>'
    if inner_edge: s += f'<path d="{di}" fill="{inner_edge}" stroke="{inner_edge}" stroke-width="32" stroke-linejoin="round"/>'
    s += f'<path d="{di}" fill="{inner}" stroke="{inner}" stroke-width="26" stroke-linejoin="round"/>'
    if inner_extra: s += f'<g clip-path="url(#{cid})">{inner_extra}</g>'
    return s

def held_star(y=104, r=44, glow='#fff6c8'):
    return (f'<circle cx="256" cy="{y}" r="{r*1.5:.0f}" fill="{glow}" opacity=".9" filter="url(#b18)"/>' + L(256, y, r, 'url(#gold)', '#e07a00', 6)
            + f'<ellipse cx="{256-9}" cy="{y-20}" rx="6" ry="11" fill="#fff" opacity=".9" transform="rotate(35 247 {y-20})"/>')

# ---------------------------------------------------------------- the ten tiers (art approved 2026-11-13)
def corner_star(x=408, y=90, r=30, fill='url(#gold)', edge='#e07a00'): return L(x, y, r, fill, edge, 5)

# ------------------------------------------------------------------ tiers
def t1_crystal():
    b = bg([(0, '#bfeaff'), (.5, '#6fb8f0'), (1, '#2b5fb0')], '#ffffff')
    b += rays(12, '#ffffff', .12)
    # floating crystal shards
    for x, y, w, h, a in [(70, 120, 26, 70, -20), (440, 150, 22, 60, 25), (90, 380, 18, 48, 15), (430, 400, 24, 64, -15), (180, 40, 14, 36, 30), (350, 470, 16, 40, -30)]:
        g, f = lin([(0, '#ffffff'), (.5, '#bfe8ff'), (1, '#5aa8e8')])
        b += g + f'<path d="M{x},{y-h/2} L{x+w/2},{y} L{x},{y+h/2} L{x-w/2},{y}Z" fill="{f}" opacity=".85" transform="rotate({a} {x} {y})"/>'
        b += f'<path d="M{x},{y-h/2} L{x},{y+h/2}" stroke="#fff" stroke-width="1.5" opacity=".7" transform="rotate({a} {x} {y})"/>'
    g, f = lin([(0, '#ffffff'), (.3, '#cfeeff'), (.6, '#8fd0ff'), (1, '#e8f7ff')])
    gi, fi = lin([(0, '#f4fbff'), (1, '#cbe9ff')], 0, 0, 0, 1)
    facets = ''.join(f'<path d="M{MX},{MY} L{MX+200*math.cos(math.radians(a)):.0f},{MY+200*math.sin(math.radians(a)):.0f} L{MX+200*math.cos(math.radians(a+22.5)):.0f},{MY+200*math.sin(math.radians(a+22.5)):.0f}Z" fill="#fff" opacity="{.05 + .12*(i%2)}"/>' for i, a in enumerate(range(0, 360, 45)))
    b += g + gi + marker(f, '#4f8fd0', fi, glow='#ffffff', inner_extra=facets)
    b += fig('t_o11') + corner_star(408, 90, 30, '#ffffff', '#8fd0ff')
    return b + sparks([(96, 86, 18, 1), (440, 300, 12, .95), (60, 260, 9, .8)])

def t2_molten():
    b = bg([(0, '#4a1a06'), (.6, '#1c0702'), (1, '#0a0201')], '#ff7a1a')
    b += rays(18, '#ffb347', .14)
    # embers rising
    b += dots(60, 2, ['#ffb347', '#ff7a1a', '#ffd36b'], 1, 3.2, glow=True)
    g, f = lin([(0, '#fff3b0'), (.25, '#ffcc33'), (.5, '#ff8a00'), (.75, '#ffd24a'), (1, '#c25a00')])
    # molten drips under the marker
    drips = ''.join(f'<path d="M{x-10},{y} Q{x-10},{y+h} {x},{y+h+12} Q{x+10},{y+h} {x+10},{y}Z" fill="{f}"/>' for x, y, h in [(150, 360, 40), (205, 392, 66), (300, 392, 54), (360, 360, 34)])
    gi, fi = rad([(0, '#fff6c8', 1), (.6, '#ffc040', 1), (1, '#e07000', 1)], 256, 230, 150)
    pat = ''.join(f'<circle cx="{MX}" cy="{MY}" r="{r}" fill="none" stroke="#fff3c0" stroke-width="2" opacity=".5"/>' for r in (60, 90, 120))
    b += g + gi + marker(f, '#7a2a00', fi, glow='#ff8a1a', inner_extra=pat) + drips
    b += fig('t_o6') + held_star(104, 44, '#ffcf6b')
    return b + sparks([(90, 92, 18, 1), (430, 120, 14, 1), (70, 330, 10, .9)], '#ffe2a0')

def leaf(x, y, s, a, c1, c2):
    return (f'<g transform="translate({x} {y}) rotate({a}) scale({s})"><path d="M0,0 C14,-22 40,-24 58,0 C40,24 14,22 0,0Z" fill="{c1}"/>'
            f'<path d="M2,0 L54,0" stroke="{c2}" stroke-width="2"/></g>')

def t3_garden():
    b = bg([(0, '#bff58a'), (.5, '#3fbf6a'), (1, '#0b5a3a')], '#fffbd0')
    b += rays(14, '#fffbd0', .16, rot=8)
    g, f = lin([(0, '#7cf0b0'), (.4, '#17b37a'), (.8, '#0a7a52'), (1, '#4fe0a0')])
    gi, fi = rad([(0, '#f2ffe8', 1), (1, '#c4f5c8', 1)], 256, 230, 160)
    b += g + gi + marker(f, '#064a32', fi, glow='#c8ffb0', rim='#eaffd0')
    # vines with leaves and blossoms around the marker
    vine = 'M80,420 C60,320 120,250 100,170 C90,120 140,90 180,80'
    vine2 = 'M432,420 C452,320 392,250 412,170 C422,120 372,90 332,80'
    b += f'<path d="{vine}" fill="none" stroke="#2e8a3a" stroke-width="7" stroke-linecap="round"/><path d="{vine2}" fill="none" stroke="#2e8a3a" stroke-width="7" stroke-linecap="round"/>'
    for x, y, a in [(84, 360, -150), (110, 290, -20), (96, 210, -160), (130, 120, -40), (170, 84, 10)]:
        b += leaf(x, y, .9, a, '#58c12a', '#3a9a2a')
    for x, y, a in [(428, 360, -30), (402, 290, 200), (416, 210, -20), (382, 120, 220), (342, 84, 170)]:
        b += leaf(x, y, .9, a, '#58c12a', '#3a9a2a')
    for x, y in [(100, 250, ), (412, 250), (150, 98), (362, 98), (76, 400), (436, 400)]:
        b += ''.join(f'<circle cx="{x+9*math.cos(math.radians(k*72)):.1f}" cy="{y+9*math.sin(math.radians(k*72)):.1f}" r="7" fill="#ffb0c8"/>' for k in range(5)) + f'<circle cx="{x}" cy="{y}" r="5" fill="#ffd36b"/>'
    b += dots(30, 3, ['#fffbd0', '#ffffff'], 1, 2.5, glow=True)
    b += fig('t_o7') + held_star(104, 42, '#fffbd0')
    return b + sparks([(60, 70, 14, 1), (452, 70, 12, 1)])

def t4_ocean():
    b = bg([(0, '#9ff0ff'), (.45, '#1aa6d8'), (1, '#062a5c')], '#e0fbff')
    # caustic light bands
    b += ''.join(f'<path d="M{x},0 L{x+40},0 L{x+140},512 L{x+70},512Z" fill="#fff" opacity=".09"/>' for x in (-40, 90, 220, 350))
    # bubbles
    random.seed(4)
    for _ in range(22):
        x, y, r = random.uniform(30, 482), random.uniform(30, 500), random.uniform(3, 11)
        b += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="#fff" opacity=".12" stroke="#fff" stroke-width="1.5"/><circle cx="{x-r*.35:.0f}" cy="{y-r*.35:.0f}" r="{r*.25:.1f}" fill="#fff" opacity=".8"/>'
    g, f = lin([(0, '#ffffff'), (.25, '#f3e8ff'), (.5, '#d6f6ff'), (.75, '#ffe6f2'), (1, '#e6fbff')])  # mother of pearl
    gi, fi = rad([(0, '#e8fdff', 1), (1, '#7fd8f0', 1)], 256, 220, 170)
    waves = ''.join(f'<path d="M100,{y} Q150,{y-12} 200,{y} T300,{y} T400,{y}" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>' for y in (300, 330, 360))
    b += g + gi + marker(f, '#2a7aa8', fi, glow='#ffffff', inner_extra=waves)
    # pearls on the tips
    h = 140; R = h*math.sqrt(2) + 14
    for i in range(8):
        a = math.radians(-90 + i*45); x, y = MX + R*math.cos(a), MY + R*math.sin(a)
        gp, fp = rad([(0, '#ffffff', 1), (.6, '#f1e9ff', 1), (1, '#bfb2d8', 1)], x-4, y-4, 14)
        b += gp + f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{fp}"/>'
    b += fig('t_o10') + corner_star(408, 84, 30)
    return b + sparks([(90, 84, 16, 1), (444, 300, 11, .9)])

def aurora_layer(op=.8):
    return (f'<g filter="url(#b40)" opacity="{op}"><path d="M-60,170 C60,60 180,220 300,120 S520,40 580,110 L580,210 C460,150 360,280 230,200 S40,240 -60,260Z" fill="#33f0c4"/>'
            '<path d="M-60,70 C80,0 220,120 330,40 S500,-10 580,40 L580,120 C440,80 330,170 210,120 S50,130 -60,150Z" fill="#b45cff"/>'
            '<path d="M-60,300 C120,240 260,330 400,270 S560,250 580,280 L580,340 C440,320 300,380 160,330 S0,350 -60,360Z" fill="#3dd1ff" opacity=".7"/></g>')

def t5_aurora():
    b = bg([(0, '#0b1d3a'), (1, '#03060f')]) + aurora_layer() + dots(80, 5, ['#ffffff'], .6, 1.8)
    # snowy ground glow
    b += '<ellipse cx="256" cy="540" rx="340" ry="110" fill="#bff6ff" opacity=".35" filter="url(#b18)"/>'
    g, f = lin([(0, '#7df9e0'), (.35, '#3dd1ff'), (.65, '#b45cff'), (1, '#33f0c4')])
    inner = aurora_layer(.95) + dots(25, 55, ['#fff'], .6, 1.6, box=(100, 90, 412, 400))
    b += g + marker(f, '#1a2a6e', '#0b1d3a', glow='#5ff5e0', inner_extra=inner, outer_line='#bff6ff')
    b += fig('t_o8', aura='#5ff5e0') + held_star(104, 42, '#bff6ff')
    return b + sparks([(84, 80, 18, 1), (440, 110, 13, 1), (452, 330, 10, .9)], '#e6fffb')

def nebula(seedcol=('#ff4fc4', '#7b5cff', '#2fe0ff', '#ffb347')):
    a, bb, c, d = seedcol
    return (f'<g filter="url(#b40)"><ellipse cx="130" cy="140" rx="170" ry="110" fill="{a}" opacity=".55"/>'
            f'<ellipse cx="400" cy="380" rx="180" ry="120" fill="{c}" opacity=".45"/><ellipse cx="380" cy="120" rx="140" ry="100" fill="{bb}" opacity=".6"/>'
            f'<ellipse cx="140" cy="420" rx="140" ry="90" fill="{d}" opacity=".35"/></g>'
            '<rect width="512" height="512" filter="url(#neb)" opacity=".35"/>')

def galaxy(cx, cy, r, rot=-20):
    arms = ''
    for k in range(2):
        pts = []
        for i in range(60):
            t = i / 59; ang = math.radians(rot + k*180 + t*300); rr = r * t
            pts.append(f'{cx + rr*math.cos(ang):.1f},{cy + rr*math.sin(ang)*.45:.1f}')
        arms += f'<polyline points="{" ".join(pts)}" fill="none" stroke="#ffe6ff" stroke-width="{r*.12:.1f}" stroke-linecap="round" opacity=".55" filter="url(#b8)"/>'
        arms += f'<polyline points="{" ".join(pts)}" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>'
    return arms + f'<ellipse cx="{cx}" cy="{cy}" rx="{r*.25:.1f}" ry="{r*.14:.1f}" fill="#fff6e0" filter="url(#b8)"/><circle cx="{cx}" cy="{cy}" r="{r*.07:.1f}" fill="#fff"/>'

def t6_nebula():
    b = bg([(0, '#1a0b3d'), (1, '#05020f')]) + nebula() + dots(120, 6, ['#ffffff', '#ffe6ff', '#bff8ff'], .5, 2, glow=False)
    b += galaxy(96, 96, 70) + galaxy(430, 430, 60, 40)
    g, f = lin([(0, '#ff7ad9'), (.33, '#8f7bff'), (.66, '#2fe0ff'), (1, '#ffd27a')])
    inner = nebula(('#ff4fc4', '#5a3dff', '#2fe0ff', '#ffd27a')) + galaxy(256, 300, 120, 10) + dots(40, 66, ['#fff'], .6, 1.8, box=(100, 90, 412, 400))
    b += g + marker(f, '#2a0f6e', '#120a3a', glow='#c87bff', inner_extra=inner, outer_line='#ffd6f5')
    # planetary ring around the marker
    b += '<ellipse cx="256" cy="300" rx="236" ry="52" fill="none" stroke="#ffe6ff" stroke-width="5" opacity=".55" transform="rotate(-14 256 300)"/>'
    b += fig('t_o8', aura='#ff7ad9') + held_star(104, 44, '#ffd6f5')
    return b + sparks([(470, 200, 12, 1), (44, 300, 10, .9)], '#ffe6ff')

def t7_starlight():
    b = bg([(0, '#0a1440'), (.6, '#1b0f50'), (1, '#04030f')], '#6a8cff')
    # rivers of liquid starlight flowing around
    for k, (y0, col) in enumerate([(120, '#bfe9ff'), (380, '#ffe6a0'), (250, '#e6d8ff')]):
        d = f'M-40,{y0} C100,{y0-90} 200,{y0+90} 300,{y0} S480,{y0-80} 560,{y0}'
        b += f'<path d="{d}" fill="none" stroke="{col}" stroke-width="34" opacity=".35" filter="url(#b18)"/><path d="{d}" fill="none" stroke="{col}" stroke-width="6" opacity=".9" stroke-linecap="round"/>'
        b += f'<path d="{d}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="1 14" stroke-linecap="round" opacity=".95"/>'
    b += dots(90, 7, ['#fff', '#ffe6a0', '#bfe9ff'], .6, 2.4, glow=True)
    g, f = lin([(0, '#ffffff'), (.3, '#bfe9ff'), (.5, '#ffffff'), (.7, '#ffe6a0'), (1, '#ffffff')])
    gi, fi = rad([(0, '#ffffff', 1), (.5, '#cfe0ff', 1), (1, '#5a6cff', 1)], 256, 220, 170)
    swirl = ''.join(f'<circle cx="{MX}" cy="{MY}" r="{r}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2 10" opacity=".7"/>' for r in (50, 80, 110, 140))
    b += g + gi + marker(f, '#3a3aa8', fi, glow='#ffffff', inner_extra=swirl, outer_line='#ffffff')
    b += fig('t_o9', aura='#9fc8ff') + held_star(100, 48, '#ffffff')
    return b + sparks([(84, 70, 20, 1), (440, 70, 16, 1), (460, 330, 12, 1), (50, 330, 10, .9)])

def t8_prism():
    b = bg([(0, '#1a1a2e'), (1, '#05050d')])
    # one white beam enters, a spectrum fans out behind the marker
    cols = ['#ff3b5c', '#ff8a2a', '#ffe14a', '#4cff7a', '#2fd3ff', '#5a6cff', '#b45cff']
    for i, c in enumerate(cols):
        a0 = -150 + i*17; a1 = a0 + 15
        p = lambda a: f'{MX+520*math.cos(math.radians(a)):.0f},{MY+520*math.sin(math.radians(a)):.0f}'
        b += f'<path d="M{MX},{MY} L{p(a0)} L{p(a1)}Z" fill="{c}" opacity=".55"/>'
        b += f'<path d="M{MX},{MY} L{p(a0+180)} L{p(a1+180)}Z" fill="{c}" opacity=".35"/>'
    b += '<rect width="512" height="512" fill="#fff" opacity=".04"/>'
    b += dots(50, 8, cols, .8, 2.4, glow=True)
    g, f = lin([(0, '#ff8ad8'), (.17, '#ffd27a'), (.34, '#b6ff8a'), (.5, '#7df9ff'), (.67, '#8f7bff'), (.84, '#ff7ad9'), (1, '#ffffff')])
    gi, fi = rad([(0, '#ffffff', 1), (1, '#e8e6ff', 1)], 256, 220, 170)
    facets = ''.join(f'<path d="M{MX},{MY} L{MX+200*math.cos(math.radians(a)):.0f},{MY+200*math.sin(math.radians(a)):.0f} L{MX+200*math.cos(math.radians(a+22.5)):.0f},{MY+200*math.sin(math.radians(a+22.5)):.0f}Z" fill="{cols[i % 7]}" opacity=".18"/>' for i, a in enumerate(range(0, 360, 45)))
    b += g + gi + marker(f, '#4a2a8e', fi, glow='#ffffff', inner_extra=facets, outer_line='#ffffff')
    b += fig('t_o9', aura='#ffffff') + held_star(100, 48, '#ffffff')
    return b + sparks([(76, 76, 18, 1), (444, 410, 14, 1)])

def t9_gate():
    b = bg([(0, '#020214'), (1, '#000006')]) + nebula(('#3d1aff', '#ff4fc4', '#00e0ff', '#ffb347'))
    b += dots(140, 9, ['#fff', '#bff8ff', '#ffe6ff'], .4, 1.6)
    # a gate of rosettes receding into light (tunnel)
    for i in range(9, 0, -1):
        s = 60 + i*52; op = .25 + .07*(9-i); rot = i*7
        col = ['#7df9ff', '#b45cff', '#ff7ad9', '#ffd27a'][i % 4]
        b += f'<path d="{RO(s, MX, MY)}" fill="#0a0630" fill-opacity=".35" stroke="{col}" stroke-width="{2+i*.6:.1f}" stroke-linejoin="round" opacity="{min(1,op+.2):.2f}" transform="rotate({rot} {MX} {MY})"/>'
    b += f'<circle cx="{MX}" cy="{MY}" r="150" fill="#ffffff" opacity=".35" filter="url(#b40)"/>'
    g, f = lin([(0, '#ffffff'), (.3, '#7df9ff'), (.55, '#b45cff'), (.8, '#ffd27a'), (1, '#ffffff')])
    gi, fi = rad([(0, '#ffffff', 1), (.35, '#d8f6ff', 1), (.7, '#6a4cff', 1), (1, '#1a0b5e', 1)], 256, 240, 160)
    inner = ''.join(f'<path d="{RO(s, MX, MY)}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6" transform="rotate({s/4} {MX} {MY})"/>' for s in (60, 110, 160, 210))
    b += g + gi + marker(f, '#1a0b5e', fi, glow='#9f8bff', inner_extra=inner, outer_line='#ffffff')
    # light rising through the gate
    b += ''.join(f'<path d="M{x},512 L{x+6},512 L{x+3},{y}Z" fill="#fff" opacity=".5"/>' for x, y in [(150, 300), (200, 260), (320, 270), (360, 320), (256, 230)])
    b += fig('t_o6', aura='#b45cff') + held_star(98, 50, '#ffffff')
    return b + sparks([(70, 70, 20, 1), (446, 80, 16, 1), (456, 360, 13, 1), (56, 360, 11, 1)], '#e6fbff')

def t10_light():
    d, f = rad([(0, '#ffffff', 1), (.22, '#fff3c4', 1), (.42, '#ffb84a', 1), (.62, '#c2410c', 1), (.82, '#3a0f5e', 1), (1, '#0d0526', 1)], 256, 236, 380)
    b = d + f'<rect width="512" height="512" fill="{f}"/>'
    b += dots(70, 101, ['#fff'], .5, 1.4, box=(0, 0, 512, 512), op=(.3, .8))
    b += rays(48, '#fff6d0', .35, 560, 1.3) + rays(16, '#ffffff', .5, 560, 3.5, rot=11)
    # layered gold rosettes like a blooming flower of light
    for i, s in enumerate((520, 460, 400, 345)):
        b += f'<path d="{RO(s, MX, MY)}" fill="#ffd36b" fill-opacity="{.05+.03*i:.2f}" stroke="#ffe7a0" stroke-width="{3.5-i*.5}" stroke-linejoin="round" opacity=".95" transform="rotate({i*11.25+5.6} {MX} {MY})"/>'
    # pillar of light rising
    b += '<path d="M226,512 L286,512 L272,0 L240,0Z" fill="#ffffff" opacity=".45" filter="url(#b18)"/>'
    b += f'<circle cx="{MX}" cy="{MY}" r="170" fill="#ffffff" opacity=".85" filter="url(#b40)"/>'
    b += dots(80, 10, ['#fff6d0', '#ffd36b', '#ffffff'], 1, 3.4, glow=True)
    g, f = lin([(0, '#ffffff'), (.3, '#ffe7a0'), (.55, '#ffb200'), (.8, '#fff3c4'), (1, '#ffd36b')])
    gi, fi = rad([(0, '#ffffff', 1), (.7, '#fffbe8', 1), (1, '#ffe7a0', 1)], 256, 230, 170)
    b += g + gi + marker(f, '#a85a00', fi, glow='#ffffff', rim='#ffffff', outer_line='#fff3c4')
    b += fig('t_o9', aura='#ffd36b', ab=9)
    # the Light star, blazing, with a long flare
    b += '<circle cx="256" cy="94" r="110" fill="#ffffff" opacity=".7" filter="url(#b40)"/>'
    b += '<path d="M60,94 Q256,86 452,94 Q256,102 60,94Z" fill="#ffffff" opacity=".95"/><path d="M256,0 Q250,94 256,200 Q262,94 256,0Z" fill="#ffffff" opacity=".7"/>'
    b += held_star(94, 56, '#ffffff')
    return b + sparks([(70, 70, 24, 1), (446, 70, 24, 1), (466, 360, 18, 1), (46, 360, 18, 1), (140, 470, 12, 1), (372, 470, 12, 1)], '#fff6d0')



# ---------------------------------------------------------------- B: the main icon, one per theme
# (top, bottom, glow, marker edge, marker face). Emerald = the default theme = Marwan's sunset B.
THEME_B = {
    'emerald':     ('#4b36b8', '#ff7f57', '#ffb38a', '#b54a3a', '#fff3ec'),
    'aurora':      ('#2fe0c0', '#4b3bb8', '#b8fff0', '#2b2a8e', '#effffb'),
    'ultraviolet': ('#b06bff', '#5b0fc4', '#e6ccff', '#3e0a8a', '#f6efff'),
    'synthwave':   ('#ff4fa8', '#5a1fc2', '#ffc2e6', '#3e1590', '#fff0f8'),
    'sunset':      ('#ff3d77', '#ffb02e', '#ffd2a0', '#b3341f', '#fff4ea'),
    'ocean':       ('#3ec8ff', '#0b4dd6', '#c8f2ff', '#08389c', '#eefaff'),
    'gold':        ('#ffd45c', '#d9851a', '#fff2b0', '#8f5200', '#fffaf0'),
    'rose':        ('#ff8fd0', '#a63bc8', '#ffe0f2', '#7a1f8f', '#fff2fa'),
    'cyber':       ('#b6ff5c', '#00a67a', '#efffd0', '#06684c', '#f6fff0'),
    'nebula':      ('#3a1fb8', '#ff8a3d', '#ffb3d9', '#5a1a7a', '#fff3f6'),
    'ice':         ('#bff4ff', '#6a6cff', '#ffffff', '#3a3fae', '#f4f8ff'),
    'ember':       ('#ff6a3d', '#b80f2e', '#ffc0a0', '#7a0a1a', '#fff2ee'),
}

def b_icon(top, bot, glow, edge, face):
    b = grad_bg(top, bot, glow, 220) + FRONT
    b += chunky(rosette(272, 256, 244), '#ffffff', edge, 14, 34)
    b += f'<path d="{rosette(222, 256, 244)}" fill="{face}" stroke="{face}" stroke-width="26" stroke-linejoin="round"/>'
    b += fig('man', 2.05, 150)
    b += lstar(404, 92, 32, 'url(#gold)', '#e07a00', 6)
    return b + BK0 + sparkle(100, 90, 16, '#fff', 1) + sparkle(438, 300, 10, '#fff', .85) + BK1

def mono():
    """Android 13 themed icon: the marker's outline, the character and the Light star in one colour."""
    sil = (f'<defs><filter id="w" x="0" y="0" width="100%" height="100%"><feFlood flood-color="#fff"/>'
           f'<feComposite in2="SourceAlpha" operator="in"/></filter></defs>')
    body = (sil + f'<path d="{rosette(272, 256, 244)}" fill="none" stroke="#fff" stroke-width="20" stroke-linejoin="round"/>'
            + f'<g filter="url(#w)">{fig("man", 2.05, 150)}</g>' + lstar(404, 92, 32, '#fff'))
    return body

TIERS = [('crystal', t1_crystal), ('molten', t2_molten), ('garden', t3_garden), ('pearl', t4_ocean),
         ('borealis', t5_aurora), ('galaxy', t6_nebula), ('starlight', t7_starlight), ('prism', t8_prism),
         ('gate', t9_gate), ('light', t10_light)]


# ---------------------------------------------------------------- output
FIGS = '''import { figureSvg, DEFAULT, normalize } from %s;
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const w = (n: string, f: any) => writeFileSync(`${out}/${n}.svg`, figureSvg(normalize(f), { still: true, cheer: true }));
w('man', { ...DEFAULT, face: 1 });
for (const o of [6, 7, 8, 9, 10, 11]) w(`t_o${o}`, { ...DEFAULT, face: 1, outfit: o });
'''

def figures():
    ts = FIG / 'dump.ts'
    ts.write_text(FIGS % repr(str(ROOT / 'src' / 'ui' / 'figure.ts')))
    subprocess.run(['node', '--experimental-strip-types', '--no-warnings', str(ts), str(FIG)], check=True)

def split(art):
    """(back, front) of a drawing: back = before the marker + the sparkle groups after it."""
    i = art.index(FRONT)
    back, front = art[:i], art[i + len(FRONT):]
    for m in re.findall(re.escape(BK0) + '(.*?)' + re.escape(BK1), front, flags=re.S):
        back += m
    front = re.sub(re.escape(BK0) + '.*?' + re.escape(BK1), '', front, flags=re.S)
    return back, front

def defs_of(s):
    return ''.join(re.findall(r'<defs>.*?</defs>', s, flags=re.S))

def wide(body):
    """An SVG on the 108 dp adaptive canvas: the 512-unit drawing is the 72 dp visible middle."""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-128 -128 768 768" width="768" height="768">{body}</svg>'

def layers(art):
    back, front = split(art)
    base = re.search(r'<rect width="512" height="512" fill="([^"]+)"', back)[1]
    bgl = wide(DEFS + f'<rect x="-128" y="-128" width="768" height="768" fill="{base}"/>' + back)
    fgl = wide(DEFS + defs_of(back) + f'<g transform="translate(256 256) scale({K}) translate(-256 -256)">{front}</g>')
    return bgl, fgl

def save(img, out, size, rx=None, circle=False, fmt='WEBP'):
    out.parent.mkdir(parents=True, exist_ok=True)
    im = img.resize((size, size), Image.LANCZOS).convert('RGBA')
    if rx is not None or circle:
        m = Image.new('L', (size * 4, size * 4), 0)
        dr = ImageDraw.Draw(m)
        (dr.ellipse if circle else lambda b, fill: dr.rounded_rectangle(b, rx * 4, fill=fill))([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
        im.putalpha(m.resize((size, size), Image.LANCZOS))
    if fmt == 'WEBP':
        im.save(out, 'WEBP', quality=90, method=6)
    else:
        im.save(out, optimize=True)

def make(id_, art, tmp, dens, prefix='ic_launcher'):
    """Renders one icon: launcher layers (+ legacy square/round) and returns the full 1024 px picture."""
    UID[0] = 0
    full = tmp / f'{id_}.png'
    mi.render(mi.svg(512, 512, DEFS + art.replace(FRONT, '').replace(BK0, '').replace(BK1, '')), 1024, 1024, full)
    bgl, fgl = layers(art)
    bgp, fgp = tmp / f'{id_}-bg.png', tmp / f'{id_}-fg.png'
    mi.render(bgl, 864, 864, bgp)
    mi.render(fgl, 864, 864, fgp, transparent=True)
    big, b, f = Image.open(full), Image.open(bgp), Image.open(fgp)
    name = prefix if id_ == 'main' else f'{prefix}_{id_}'
    for d, k in dens.items():
        folder = RES / f'mipmap-{d}'
        save(b, folder / f'{name}_background.webp' if id_ == 'main' else folder / f'{prefix}_bg_{id_}.webp', round(108 * k))
        save(f, folder / f'{name}_foreground.webp' if id_ == 'main' else folder / f'{prefix}_foreground_{id_}.webp', round(108 * k))
        save(big, folder / f'{name}.webp', round(48 * k), rx=round(48 * k * 0.18))
        save(big, folder / f'{name}_round.webp', round(48 * k), circle=True)
    if id_ != 'main':
        for suffix in ('', '_round'):
            (RES / 'mipmap-anydpi-v26' / f'{name}{suffix}.xml').write_text(ADAPTIVE.format(id=id_))
    return big

ADAPTIVE = '''<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-character-icons.py -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_bg_{id}"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground_{id}"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
'''

DENS_ALL = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
DENS_TOP = {'xxxhdpi': 4}   # other icons: one size, scaled by the system (keeps the APK small)

def clean():
    """Removes the launcher pictures this script owns (old PNGs and vector backgrounds included)."""
    keep_ids = set(THEME_B) | {t for t, _ in TIERS}
    for p in RES.glob('mipmap-*/ic_launcher*'):
        if p.suffix in ('.png', '.webp'):
            p.unlink()
    for p in RES.glob('mipmap-anydpi-v26/ic_launcher_*.xml'):
        if not p.name.startswith('ic_launcher_round'):
            p.unlink()
    for p in RES.glob('drawable/ic_bg_*.xml'):
        p.unlink()
    for old in ('sapphire', 'legend', 'celestial'):
        (ROOT / 'public' / 'icons' / f'app-{old}.webp').unlink(missing_ok=True)
    return keep_ids

def manifest():
    aliases = mi.ALIAS.format(name='MainActivity', icon='ic_launcher', enabled='true')
    for tid in list(THEME_B)[1:]:
        aliases += mi.ALIAS.format(name='Icon' + tid.capitalize(), icon=f'ic_launcher_{tid}', enabled='false')
    aliases += '        <!-- Unlockable tiers (levels, badges, Ranks weeks; src/data/iconTiers.ts) -->\n'
    for tid, _ in TIERS:
        aliases += mi.ALIAS.format(name='Icon' + tid.capitalize(), icon=f'ic_launcher_{tid}', enabled='false')
    # The 2026-11-11 unlockables keep their alias names, now showing the tier won the same way: a phone that wore one
    # keeps a launcher entry after the update (Android remembers MainActivity as turned off) until the app moves it on.
    aliases += '        <!-- Old unlockable icons (Sapphire, Gold, Celestial), kept so their home-screen entries survive -->\n'
    for old, tid in (('Sapphire', 'garden'), ('Legend', 'borealis'), ('Celestial', 'prism')):
        aliases += mi.ALIAS.format(name='Icon' + old, icon=f'ic_launcher_{tid}', enabled='false')
    man = ROOT / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
    text = man.read_text()
    start, end = '        <!-- theme icons (scripts/make-icons.py, themes mode) -->\n', '        <!-- /theme icons -->\n'
    new_start = '        <!-- theme icons (scripts/make-character-icons.py) -->\n'
    if start not in text: start = new_start
    assert start in text and end in text, 'AndroidManifest.xml: theme icon markers missing'
    text = re.sub(re.escape(start) + '.*?' + re.escape(end), lambda _: new_start + aliases + end, text, flags=re.S)
    man.write_text(text)

def main():
    themes = [t[0] for t in mi.themes()]
    assert themes == list(THEME_B), f'THEME_B must list the themes of theme.ts in order: {themes}'
    figures()
    clean()
    pub = ROOT / 'public' / 'icons'
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        # main = the default theme's B, at every density (shortcuts and the splash use it too)
        big = make('main', b_icon(*THEME_B['emerald']), tmp, DENS_ALL)
        big.save(ROOT / 'resources' / 'icon-1024.png', optimize=True)
        save(big, ROOT / 'public' / 'icon-180.png', 180, fmt='PNG')
        save(big, pub / 'theme-emerald.webp', 128, rx=28)
        UID[0] = 0
        (ROOT / 'public' / 'icon.svg').write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><clipPath id="tile"><rect width="512" height="512" rx="115"/></clipPath>'
            f'<g clip-path="url(#tile)">{DEFS}{b_icon(*THEME_B["emerald"]).replace(FRONT, "").replace(BK0, "").replace(BK1, "")}</g></svg>\n')
        mono_p = tmp / 'mono.png'
        mi.render(wide(f'<g transform="translate(256 256) scale({K}) translate(-256 -256)">{mono()}</g>'), 864, 864, mono_p, transparent=True)
        for dn, k in DENS_ALL.items():
            save(Image.open(mono_p), RES / f'mipmap-{dn}' / 'ic_launcher_monochrome.webp', round(108 * k))
        for tid in list(THEME_B)[1:]:
            big = make(tid, b_icon(*THEME_B[tid]), tmp, DENS_TOP)
            save(big, pub / f'theme-{tid}.webp', 128, rx=28)
            print('theme', tid)
        for tid, fn in TIERS:
            big = make(tid, fn(), tmp, DENS_TOP)
            save(big, pub / f'app-{tid}.webp', 256, rx=46)
            print('tier', tid)
    manifest()
    print('done')


if __name__ == '__main__':
    main()
