import importlib.util, sys, math, random
from pathlib import Path
from PIL import Image
spec = importlib.util.spec_from_file_location('mi', str(Path(__file__).resolve().parent / 'make-icons.py'))
mi = importlib.util.module_from_spec(spec); spec.loader.exec_module(mi)
OUT = Path(sys.argv[1]); C = 256

def ros(s, stroke, sw, rot=0, fill='none', extra=''):
    rx = s * 0.07
    r = lambda a: (f'<rect x="{C-s/2:.2f}" y="{C-s/2:.2f}" width="{s:.2f}" height="{s:.2f}" rx="{rx:.2f}" fill="{fill}" '
                   f'stroke="{stroke}" stroke-width="{sw:.2f}" stroke-linejoin="round" transform="rotate({a} {C} {C})" {extra}/>')
    return r(rot) + r(rot + 45)

def star_path(s, rot=0):
    """Outline of the 8-point rosette (union of the two squares) as one polygon."""
    pts = []
    R1 = s / 2 * math.sqrt(2); R2 = s / 2 / math.cos(math.radians(22.5))
    for i in range(16):
        a = math.radians(rot - 90 + i * 22.5 + (0 if i % 2 == 0 else 0))
        rr = R1 if i % 2 == 0 else s / 2 * 1.0824
        pts.append(f'{C + rr*math.cos(a):.2f},{C + rr*math.sin(a):.2f}')
    return 'M' + ' L'.join(pts) + 'Z'

def sparkle(x, y, r, col, op=1):
    return (f'<path d="M{x},{y-r} Q{x},{y} {x+r},{y} Q{x},{y} {x},{y+r} Q{x},{y} {x-r},{y} Q{x},{y} {x},{y-r}Z" '
            f'fill="{col}" opacity="{op}"/>')

def core(col, r=26, bloom=70, bloom_op=.9):
    return (f'<radialGradient id="cb" cx="{C}" cy="{C}" r="{bloom}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{col}" stop-opacity="{bloom_op}"/><stop offset=".45" stop-color="{col}" stop-opacity=".25"/>'
            f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>'
            f'<radialGradient id="cw" cx="{C}" cy="{C}" r="{r}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/>'
            f'<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
            f'<circle cx="{C}" cy="{C}" r="{bloom}" fill="url(#cb)"/><circle cx="{C}" cy="{C}" r="{r}" fill="url(#cw)"/>')

def flare(len_, w, col, op=.9, rot=0):
    return (f'<g transform="rotate({rot} {C} {C})" opacity="{op}">'
            f'<path d="M{C-len_},{C} Q{C},{C-w} {C+len_},{C} Q{C},{C+w} {C-len_},{C}Z" fill="{col}"/>'
            f'<path d="M{C},{C-len_} Q{C-w},{C} {C},{C+len_} Q{C+w},{C} {C},{C-len_}Z" fill="{col}"/></g>')

FILTERS = ('<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>'
           '<filter id="glow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>'
           '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>'
           '<filter id="neb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>')

S = 236; SW = S * 0.055

# ---------- RARE: Sapphire. Silver-blue double-line rosette over a faint girih lattice.
def rare():
    b = '<defs>' + FILTERS + (
        '<radialGradient id="bg" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="#11284a"/><stop offset=".6" stop-color="#081427"/><stop offset="1" stop-color="#030812"/></radialGradient>'
        '<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f9ff"/><stop offset=".35" stop-color="#8cc4ff"/>'
        '<stop offset=".55" stop-color="#e6f2ff"/><stop offset=".8" stop-color="#5d9cf0"/><stop offset="1" stop-color="#d8ecff"/></linearGradient>'
        '<radialGradient id="fade" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
        '<mask id="m"><rect width="512" height="512" fill="url(#fade)"/></mask>'
        '<pattern id="lat" width="64" height="64" patternUnits="userSpaceOnUse" x="0" y="0">'
        '<g fill="none" stroke="#8cc4ff" stroke-width="1.2">'
        '<rect x="16" y="16" width="32" height="32" rx="2"/><rect x="16" y="16" width="32" height="32" rx="2" transform="rotate(45 32 32)"/>'
        '<path d="M0,32 L9.4,32 M54.6,32 L64,32 M32,0 L32,9.4 M32,54.6 L32,64"/></g></pattern>'
        '<radialGradient id="halo" cx="256" cy="256" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6fb8ff" stop-opacity=".9"/>'
        '<stop offset=".3" stop-color="#4c8fff" stop-opacity=".4"/><stop offset="1" stop-color="#4c8fff" stop-opacity="0"/></radialGradient>'
        '</defs>')
    b += '<rect width="512" height="512" fill="url(#bg)"/>'
    b += '<g mask="url(#m)" opacity=".13"><rect width="512" height="512" fill="url(#lat)" transform="translate(-0 -0)"/></g>'
    b += '<!--FG-->'
    b += '<circle cx="256" cy="256" r="150" fill="url(#halo)"/>'
    # glow under the line
    b += f'<g filter="url(#glow)" opacity=".7">{ros(S, "#5fa8ff", SW*1.3)}</g>'
    b += ros(S, 'url(#silver)', SW)
    b += ros(S * 0.80, '#cfe6ff', SW * 0.22, extra='opacity=".55"')
    # tip gems
    R = S / 2 * math.sqrt(2) + SW * 0.2
    for i in range(8):
        a = math.radians(-90 + i * 45)
        x, y = C + (R + 20) * math.cos(a), C + (R + 20) * math.sin(a)
        b += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.2" fill="#dff0ff"/><circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="#8cc4ff" opacity=".18"/>'
    b += f'<circle cx="256" cy="256" r="{S*.33:.1f}" fill="none" stroke="#9fd0ff" stroke-width="3.6" opacity=".75"/>'
    for i in range(16):
        a = math.radians(i * 22.5)
        rr = S * .33 + 10
        b += f'<circle cx="{C+rr*math.cos(a):.1f}" cy="{C+rr*math.sin(a):.1f}" r="{2.2 if i%2 else 3.2}" fill="#cfe6ff" opacity=".8"/>'
    b += core('#9fd0ff', 27, 80)
    b += flare(46, 5, '#ffffff', .85, 45)
    for x, y, r in [(108, 112, 9), (402, 398, 7), (396, 120, 5), (120, 396, 4)]:
        b += sparkle(x, y, r, '#dff0ff', .85)
    return b

# ---------- LEGENDARY: Gold. Gilded rosette, emerald jewel inside, rays and a 16-point star crown.
def legendary():
    b = '<defs>' + FILTERS + (
        '<radialGradient id="bg" cx="50%" cy="46%" r="78%"><stop offset="0" stop-color="#14301f"/><stop offset=".55" stop-color="#071a11"/><stop offset="1" stop-color="#020704"/></radialGradient>'
        '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c2"/><stop offset=".22" stop-color="#f3c14a"/>'
        '<stop offset=".45" stop-color="#9a6510"/><stop offset=".6" stop-color="#ffe48f"/><stop offset=".8" stop-color="#c88a1c"/><stop offset="1" stop-color="#fff0b0"/></linearGradient>'
        '<linearGradient id="gold2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".5" stop-color="#b9801a"/><stop offset="1" stop-color="#ffe9a3"/></linearGradient>'
        '<radialGradient id="jewel" cx="256" cy="240" r="170" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4ff0c4"/><stop offset=".3" stop-color="#14a37c"/>'
        '<stop offset=".7" stop-color="#05503a"/><stop offset="1" stop-color="#022a1e"/></radialGradient>'
        '<radialGradient id="rayfade" cx="256" cy="256" r="256" gradientUnits="userSpaceOnUse"><stop offset=".2" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
        '<mask id="rm"><rect width="512" height="512" fill="url(#rayfade)"/></mask>'
        '<radialGradient id="warm" cx="256" cy="256" r="230" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd36b" stop-opacity=".45"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>'
        '</defs>')
    b += '<rect width="512" height="512" fill="url(#bg)"/><circle cx="256" cy="256" r="230" fill="url(#warm)"/>'
    # rays
    rays = ''
    for i in range(32):
        a0 = math.radians(i * 11.25 - 1.6 + 5.625); a1 = math.radians(i * 11.25 + 1.6 + 5.625)
        L = 380 if i % 2 == 0 else 300
        rays += f'<path d="M256,256 L{256+L*math.cos(a0):.1f},{256+L*math.sin(a0):.1f} L{256+L*math.cos(a1):.1f},{256+L*math.sin(a1):.1f}Z"/>'
    b += f'<g mask="url(#rm)" fill="#ffd56e" opacity=".22">{rays}</g>'
    b += '<!--FG-->'
    # crown: 16-point star behind
    b += ros(S * 1.18, '#e9b949', 2.4, rot=22.5, extra='opacity=".55"')
    # jewel fill (union polygon)
    b += f'<path d="{star_path(S)}" fill="url(#jewel)" stroke="none" stroke-linejoin="round" opacity=".92"/>'
    # facets lines
    for i in range(8):
        a = math.radians(-90 + i * 45); R = S / 2 * math.sqrt(2) - SW
        b += f'<line x1="256" y1="256" x2="{C+R*math.cos(a):.1f}" y2="{C+R*math.sin(a):.1f}" stroke="#8ff5d8" stroke-width="1.3" opacity=".22"/>'
    b += f'<g filter="url(#glow)" opacity=".75">{ros(S, "#ffc34d", SW*1.3)}</g>'
    b += ros(S, '#5a3a06', SW * 1.45)
    b += ros(S, 'url(#gold)', SW * 1.15)
    b += ros(S, '#fff6d0', SW * 0.18, extra='opacity=".7"')
    # inner ring gold
    b += f'<circle cx="256" cy="256" r="{S*.33:.1f}" fill="none" stroke="url(#gold2)" stroke-width="6"/>'
    b += f'<circle cx="256" cy="256" r="{S*.33-9:.1f}" fill="none" stroke="#ffe7a0" stroke-width="1.2" opacity=".6"/>'
    # tip pearls
    R = S / 2 * math.sqrt(2)
    for i in range(8):
        a = math.radians(-90 + i * 45)
        x, y = C + (R + 22) * math.cos(a), C + (R + 22) * math.sin(a)
        b += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="url(#gold)"/><circle cx="{x-1.6:.1f}" cy="{y-1.6:.1f}" r="1.8" fill="#fff"/>'
    b += core('#ffe08a', 30, 92, 1)
    b += flare(70, 6, '#fff7dc', .9)
    b += flare(40, 4, '#fff7dc', .6, 45)
    for x, y, r in [(96, 120, 12), (418, 404, 10), (410, 110, 7), (104, 410, 6), (300, 70, 4)]:
        b += sparkle(x, y, r, '#ffe9a8', .95)
    return b

# ---------- MYTHIC: Celestial. Iridescent rosettes in a nebula, Noor's crescent in orbit, a star born in the centre.
def mythic():
    random.seed(7)
    b = '<defs>' + FILTERS + (
        '<radialGradient id="bg" cx="50%" cy="48%" r="80%"><stop offset="0" stop-color="#22134f"/><stop offset=".5" stop-color="#0d0828"/><stop offset="1" stop-color="#04030d"/></radialGradient>'
        '<linearGradient id="iri" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7df9ff"/><stop offset=".2" stop-color="#8f7bff"/>'
        '<stop offset=".4" stop-color="#ff7ad9"/><stop offset=".6" stop-color="#ffd27a"/><stop offset=".8" stop-color="#6fffd2"/><stop offset="1" stop-color="#7df9ff"/></linearGradient>'
        '<linearGradient id="iri2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ad9"/><stop offset=".5" stop-color="#7df9ff"/><stop offset="1" stop-color="#b48cff"/></linearGradient>'
        '<radialGradient id="void" cx="256" cy="256" r="140" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2a1a6e" stop-opacity=".2"/><stop offset="1" stop-color="#05030f" stop-opacity=".85"/></radialGradient>'
        '<radialGradient id="aura" cx="256" cy="256" r="160" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9d8ff" stop-opacity=".95"/>'
        '<stop offset=".25" stop-color="#b48cff" stop-opacity=".55"/><stop offset=".6" stop-color="#6a4cff" stop-opacity=".15"/><stop offset="1" stop-color="#6a4cff" stop-opacity="0"/></radialGradient>'
        '</defs>')
    b += '<rect width="512" height="512" fill="url(#bg)"/>'
    # nebula
    b += ('<g filter="url(#neb)">'
          '<ellipse cx="140" cy="150" rx="140" ry="90" fill="#ff4fc4" opacity=".28"/>'
          '<ellipse cx="390" cy="370" rx="150" ry="100" fill="#2fe0ff" opacity=".22"/>'
          '<ellipse cx="380" cy="130" rx="110" ry="80" fill="#7b5cff" opacity=".35"/>'
          '<ellipse cx="120" cy="400" rx="110" ry="70" fill="#5a3dff" opacity=".3"/></g>')
    # stars
    for _ in range(90):
        x, y = random.uniform(0, 512), random.uniform(0, 512)
        if math.hypot(x - 256, y - 256) < 150: continue
        r = random.choice([.6, .8, 1, 1.2, 1.6])
        b += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="#fff" opacity="{random.uniform(.35, .95):.2f}"/>'
    b += '<!--FG-->'
    # outer rosette (large, faint, rotated)
    b += ros(S * 1.42, 'url(#iri2)', 2.2, rot=22.5, extra='opacity=".45"')
    b += f'<circle cx="256" cy="256" r="{S*.86:.1f}" fill="none" stroke="url(#iri2)" stroke-width="1.2" opacity=".35" stroke-dasharray="2 7"/>'
    # dark inner void + aura
    b += f'<path d="{star_path(S)}" fill="url(#void)"/>'
    b += '<circle cx="256" cy="256" r="160" fill="url(#aura)"/>'
    # main rosette iridescent w/ big glow
    b += f'<g filter="url(#glow2)" opacity=".9">{ros(S, "url(#iri)", SW*1.6)}</g>'
    b += ros(S, 'url(#iri)', SW * 1.05)
    b += ros(S, '#ffffff', SW * 0.2, extra='opacity=".75"')
    # inner rosette rotated 22.5
    b += ros(S * 0.56, 'url(#iri2)', SW * 0.45, rot=22.5, extra='opacity=".9"')
    # orbit (tilted ellipse) with crescent companion
    b += ('<g transform="rotate(-28 256 256)">'
          f'<ellipse cx="256" cy="256" rx="214" ry="70" fill="none" stroke="url(#iri)" stroke-width="2" opacity=".55"/>'
          '</g>')
    # crescent position on ellipse
    t = math.radians(-22); ex, ey = 214 * math.cos(t), 70 * math.sin(t); ang = math.radians(-28)
    mx, my = C + ex * math.cos(ang) - ey * math.sin(ang), C + ex * math.sin(ang) + ey * math.cos(ang)
    b += (f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="26" fill="#ffe7a8" opacity=".35" filter="url(#glow)"/>'
          f'<mask id="cr"><rect width="512" height="512" fill="#fff"/><circle cx="{mx+7:.1f}" cy="{my-5:.1f}" r="12.5" fill="#000"/></mask>'
          f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="14" fill="#fff3cf" mask="url(#cr)"/>')
    # star core
    b += core('#f2e6ff', 30, 100, 1)
    b += flare(112, 6, '#ffffff', .8)
    b += flare(62, 4.5, '#e9d8ff', .75, 45)
    b += f'<circle cx="256" cy="256" r="46" fill="none" stroke="#fff" stroke-width="1" opacity=".35"/>'
    for x, y, r, c in [(86, 96, 13, '#bff8ff'), (430, 420, 11, '#ffc6ef'), (424, 92, 7, '#fff'), (92, 424, 7, '#fff'), (470, 250, 4, '#fff')]:
        b += sparkle(x, y, r, c, .95)
    return b

SAFE = 0.66   # foreground scale on the 108 dp (432 unit) adaptive canvas: everything stays inside the visible mask
for name, fn in [('rare-sapphire', rare), ('legendary-gold', legendary), ('mythic-celestial', mythic)]:
    body = fn()
    full = mi.svg(512, 512, body.replace('<!--FG-->', ''))
    (OUT / f'ayah-studio-{name}.svg').write_text(full)
    head, fg = body.split('<!--FG-->', 1)
    defs = head[:head.index('</defs>') + 7]
    bg_svg = mi.svg(512, 512, head)
    fg_svg = mi.svg(432, 432, defs + f'<g transform="translate(216 216) scale({SAFE}) translate(-256 -256)">{fg}</g>')
    (OUT / f'ayah-studio-{name}-adaptive-bg.svg').write_text(bg_svg)
    (OUT / f'ayah-studio-{name}-adaptive-fg.svg').write_text(fg_svg)
    p = OUT / f'ayah-studio-{name}-1024.png'
    mi.render(full, 1024, 1024, p)
    Image.open(p).convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT / f'ayah-studio-{name}-512.png')
    mi.render(bg_svg, 432, 432, OUT / f'ayah-studio-{name}-adaptive-bg-432.png')
    mi.render(fg_svg, 432, 432, OUT / f'ayah-studio-{name}-adaptive-fg-432.png', transparent=True)
