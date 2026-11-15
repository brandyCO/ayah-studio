"""SVG fragments → Lottie shapes (the subset our character art uses).

Supported: <g> (transform, opacity, clip-path), <path>, <circle>, <ellipse>, <rect>, <clipPath>, linear / radial
gradients (objectBoundingBox), fill / stroke / opacity / fill-opacity / stroke-width / stroke-linecap / -linejoin.
Unclipped shapes keep their exact curves (Lottie beziers, strokes as Lottie strokes). Clipped shapes are intersected
here with shapely (curves flattened finely, strokes widened to outlines), so the player needs no masks or mattes.
"""
import math
import re
import xml.etree.ElementTree as ET

from shapely.geometry import LinearRing, LineString, MultiPolygon, Polygon
from shapely.ops import unary_union
from shapely.validation import make_valid

FLAT = 0.7          # flattening step for clipped curves (figure units; 3.6 px each on the phone)


# ------------------------------------------------------------------ affine
def mat_mul(a, b):
    return (a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
            a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5])


ID = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def ap(m, p):
    return (m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5])


def parse_transform(s):
    m = ID
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', s or ''):
        v = [float(x) for x in re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?', args)]
        if name == 'translate':
            t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0.0)
        elif name == 'scale':
            t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == 'rotate':
            a = math.radians(v[0])
            c, s_ = math.cos(a), math.sin(a)
            t = (c, s_, -s_, c, 0, 0)
            if len(v) == 3:
                t = mat_mul(mat_mul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        elif name == 'matrix':
            t = tuple(v)
        else:
            raise ValueError(name)
        m = mat_mul(m, t)
    return m


def mscale(m):
    return math.sqrt(abs(m[0] * m[3] - m[1] * m[2]))


# ------------------------------------------------------------------ paths → cubic subpaths
NUM = r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?'


def arc_to_cubics(p0, rx, ry, phi, fa, fs, p1):
    """SVG arc → list of cubic segments (c1, c2, end)."""
    if rx == 0 or ry == 0:
        return [(p0, p1, p1)]
    rx, ry = abs(rx), abs(ry)
    cp, sp = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1, y1 = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    den = rx * rx * y1 * y1 + ry * ry * x1 * x1
    co = math.sqrt(max(0.0, num / den)) * (-1 if fa == fs else 1)
    cx1, cy1 = co * rx * y1 / ry, -co * ry * x1 / rx
    cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2
    cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2

    def ang(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    n = max(1, math.ceil(abs(dt) / (math.pi / 2) - 1e-9))
    d = dt / n
    k = 4 / 3 * math.tan(d / 4)
    out = []
    for j in range(n):
        a1, a2 = t1 + j * d, t1 + (j + 1) * d

        def pt(a):
            x, y = rx * math.cos(a), ry * math.sin(a)
            return (cp * x - sp * y + cx, sp * x + cp * y + cy)

        def dv(a):
            x, y = -rx * math.sin(a), ry * math.cos(a)
            return (cp * x - sp * y, sp * x + cp * y)
        q1, q2 = pt(a1), pt(a2)
        d1, d2 = dv(a1), dv(a2)
        out.append(((q1[0] + k * d1[0], q1[1] + k * d1[1]), (q2[0] - k * d2[0], q2[1] - k * d2[1]), q2))
    return out


def parse_d(d):
    """→ list of subpaths: (start, [(c1, c2, p), ...], closed)."""
    toks = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|' + NUM, d)
    subs, segs = [], []
    cur = start = (0.0, 0.0)
    last_c = last_q = None
    cmd = None
    i = 0

    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v

    def flush(closed):
        nonlocal segs
        if segs:
            subs.append((start, segs, closed))
        segs = []
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                if segs and (abs(cur[0] - start[0]) > 1e-6 or abs(cur[1] - start[1]) > 1e-6):
                    segs.append((cur, start, start))
                flush(True)
                cur = start
                last_c = last_q = None
                continue
        rel = cmd.islower()
        C = cmd.upper()
        ox, oy = cur if rel else (0.0, 0.0)
        if C == 'M':
            flush(False)
            cur = start = (num() + ox, num() + oy)
            cmd = 'l' if rel else 'L'
            last_c = last_q = None
            continue
        if C == 'L':
            p = (num() + ox, num() + oy); segs.append((cur, p, p)); cur = p; last_c = last_q = None
        elif C == 'H':
            p = (num() + (cur[0] if rel else 0.0), cur[1]); segs.append((cur, p, p)); cur = p; last_c = last_q = None
        elif C == 'V':
            p = (cur[0], num() + (cur[1] if rel else 0.0)); segs.append((cur, p, p)); cur = p; last_c = last_q = None
        elif C == 'C':
            c1 = (num() + ox, num() + oy); c2 = (num() + ox, num() + oy); p = (num() + ox, num() + oy)
            segs.append((c1, c2, p)); cur = p; last_c = c2; last_q = None
        elif C == 'S':
            c1 = (2 * cur[0] - last_c[0], 2 * cur[1] - last_c[1]) if last_c else cur
            c2 = (num() + ox, num() + oy); p = (num() + ox, num() + oy)
            segs.append((c1, c2, p)); cur = p; last_c = c2; last_q = None
        elif C in 'QT':
            if C == 'Q':
                q = (num() + ox, num() + oy)
            else:
                q = (2 * cur[0] - last_q[0], 2 * cur[1] - last_q[1]) if last_q else cur
            p = (num() + ox, num() + oy)
            c1 = (cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1]))
            c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
            segs.append((c1, c2, p)); cur = p; last_q = q; last_c = None
        elif C == 'A':
            rx, ry, phi, fa, fs = num(), num(), num(), num(), num()
            p = (num() + ox, num() + oy)
            segs += arc_to_cubics(cur, rx, ry, phi, int(fa), int(fs), p); cur = p; last_c = last_q = None
        else:
            raise ValueError(cmd)
    flush(False)
    return subs


def ellipse_subs(cx, cy, rx, ry):
    k = 0.5522847498
    P = [(cx + rx, cy), (cx, cy + ry), (cx - rx, cy), (cx, cy - ry)]
    T = [(0, ry), (-rx, 0), (0, -ry), (rx, 0)]
    segs = []
    for j in range(4):
        a, b = P[j], P[(j + 1) % 4]
        ta, tb = T[j], T[(j + 1) % 4]
        segs.append(((a[0] + k * ta[0], a[1] + k * ta[1]), (b[0] - k * tb[0], b[1] - k * tb[1]), b))
    return [(P[0], segs, True)]


def rect_subs(x, y, w, h):
    pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    segs = [(pts[(j + 1) % 4], pts[(j + 1) % 4], pts[(j + 1) % 4]) for j in range(4)]
    return [(pts[0], segs, True)]


def tf_subs(subs, m):
    return [(ap(m, s0), [(ap(m, a), ap(m, b), ap(m, c)) for a, b, c in segs], cl) for s0, segs, cl in subs]


def flatten(sub):
    s0, segs, cl = sub
    pts = [s0]
    p = s0
    for c1, c2, q in segs:
        L = math.dist(p, c1) + math.dist(c1, c2) + math.dist(c2, q)
        n = max(1, math.ceil(L / FLAT)) if (c1 != p or c2 != q) else 1
        for j in range(1, n + 1):
            t = j / n
            u = 1 - t
            pts.append((u ** 3 * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * q[0],
                        u ** 3 * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * q[1]))
        p = q
    return pts, cl


def fill_geom(subs):
    g = None
    for sub in subs:
        pts, _ = flatten(sub)
        if len(pts) < 3:
            continue
        poly = make_valid(Polygon(pts))
        g = poly if g is None else g.symmetric_difference(poly)
    return g


def stroke_geom(subs, w, cap, join):
    caps = {'round': 'round', 'square': 'square'}.get(cap, 'flat')
    joins = {'round': 'round', 'bevel': 'bevel'}.get(join, 'mitre')
    parts = []
    for sub in subs:
        pts, cl = flatten(sub)
        if len(pts) < 2:
            continue
        line = LinearRing(pts) if cl and len(pts) > 3 else LineString(pts)
        parts.append(line.buffer(w / 2, cap_style=caps, join_style=joins, quad_segs=6))
    return unary_union(parts) if parts else None


# ------------------------------------------------------------------ Lottie output
def st(v):
    return {'a': 0, 'k': v}


def color(c):
    c = c.strip()
    named = {'white': '#ffffff', 'black': '#000000'}
    c = named.get(c, c)
    if c.startswith('#') and len(c) == 4:
        c = '#' + ''.join(ch * 2 for ch in c[1:])
    return [int(c[1:3], 16) / 255, int(c[3:5], 16) / 255, int(c[5:7], 16) / 255, 1]


def r3(x):
    return round(x, 3)


def sh_bez(sub):
    s0, segs, cl = sub
    v, ii, oo = [s0], [(0, 0)], []
    p = s0
    for c1, c2, q in segs:
        oo.append((c1[0] - p[0], c1[1] - p[1]))
        v.append(q)
        ii.append((c2[0] - q[0], c2[1] - q[1]))
        p = q
    oo.append((0, 0))
    if cl and len(v) > 1 and math.dist(v[0], v[-1]) < 1e-6:
        ii[0] = ii[-1]
        v, ii, oo = v[:-1], ii[:-1], oo[:-1]
    return {'ty': 'sh', 'ks': st({'c': cl, 'v': [[r3(x), r3(y)] for x, y in v],
                                  'i': [[r3(x), r3(y)] for x, y in ii], 'o': [[r3(x), r3(y)] for x, y in oo]})}


def sh_ring(coords):
    pts = list(coords)[:-1]
    z = [[0, 0]] * len(pts)
    return {'ty': 'sh', 'ks': st({'c': True, 'v': [[r3(x), r3(y)] for x, y in pts], 'i': z, 'o': z})}


def geom_shapes(g):
    if g is None or g.is_empty:
        return []
    polys = [g] if isinstance(g, Polygon) else [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]
    if not polys and hasattr(g, 'geoms'):
        for gg in g.geoms:
            polys += geom_polys(gg)
    out = []
    for p in polys:
        p = p.simplify(0.12)
        if p.is_empty or p.area < 0.02:
            continue
        for q in ([p] if isinstance(p, Polygon) else list(p.geoms)):
            out.append(sh_ring(q.exterior.coords))
            out += [sh_ring(r.coords) for r in q.interiors]
    return out


def geom_polys(g):
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for gg in getattr(g, 'geoms', []) for p in geom_polys(gg)]


TR = {'ty': 'tr', 'p': st([0, 0]), 'a': st([0, 0]), 's': st([100, 100]), 'r': st(0), 'o': st(100),
      'sk': st(0), 'sa': st(0)}


def group(items, name=''):
    return {'ty': 'gr', 'nm': name, 'it': items + [dict(TR)]}


def bbox_of(subs):
    xs = [p[0] for s0, segs, _ in subs for p in [s0] + [q for seg in segs for q in seg]]
    ys = [p[1] for s0, segs, _ in subs for p in [s0] + [q for seg in segs for q in seg]]
    return min(xs), min(ys), max(xs), max(ys)


def grad_fill(gr, bb, op):
    x0, y0, x1, y1 = bb
    w, h = x1 - x0, y1 - y0
    stops = gr['stops']
    cols, alph = [], []
    for o, c, a in stops:
        cc = color(c)
        cols += [o, cc[0], cc[1], cc[2]]
        alph += [o, a]
    if gr['kind'] == 'linear':
        s = [x0 + gr['x1'] * w, y0 + gr['y1'] * h]
        e = [x0 + gr['x2'] * w, y0 + gr['y2'] * h]
        t = 1
    else:
        cx, cy, r = x0 + gr['cx'] * w, y0 + gr['cy'] * h, gr['r'] * w
        s, e, t = [cx, cy], [cx + r, cy], 2
    return {'ty': 'gf', 'o': st(op * 100), 'r': 1, 't': t, 's': st([r3(s[0]), r3(s[1])]),
            'e': st([r3(e[0]), r3(e[1])]), 'g': {'p': len(stops), 'k': st(cols + alph)}}


def convert(svg, base=ID):
    """An SVG fragment (no <svg> wrapper needed) → list of Lottie shape groups, top-most first."""
    root = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + svg + '</svg>')
    for el in root.iter():
        el.tag = el.tag.split('}')[-1]
    ids = {el.get('id'): el for el in root.iter() if el.get('id')}
    grads = {}
    for gid, el in ids.items():
        if el.tag in ('linearGradient', 'radialGradient'):
            stops = [(float(s.get('offset', 0)), s.get('stop-color', '#000'), float(s.get('stop-opacity', 1)))
                     for s in el if s.tag == 'stop']
            if el.tag == 'linearGradient':
                grads[gid] = dict(kind='linear', stops=stops, x1=float(el.get('x1', 0)), y1=float(el.get('y1', 0)),
                                  x2=float(el.get('x2', 1)), y2=float(el.get('y2', 0)))
            else:
                grads[gid] = dict(kind='radial', stops=stops, cx=float(el.get('cx', .5)), cy=float(el.get('cy', .5)),
                                  r=float(el.get('r', .5)))
    out = []                                  # paint order (bottom first)

    def geom_of(el, m):
        tag = el.tag
        if tag == 'path':
            subs = parse_d(el.get('d', ''))
        elif tag == 'circle':
            r = float(el.get('r'))
            subs = ellipse_subs(float(el.get('cx', 0)), float(el.get('cy', 0)), r, r)
        elif tag == 'ellipse':
            subs = ellipse_subs(float(el.get('cx', 0)), float(el.get('cy', 0)), float(el.get('rx')), float(el.get('ry')))
        elif tag == 'rect':
            subs = rect_subs(float(el.get('x', 0)), float(el.get('y', 0)), float(el.get('width')), float(el.get('height')))
        else:
            return None
        return tf_subs(subs, m)

    def clip_geom(ref, m):
        cid = re.match(r'url\(#([^)]+)\)', ref).group(1)
        cp = ids[cid]
        parts = []
        for ch in cp.iter():
            if ch is cp:
                continue
            subs = geom_of(ch, mat_mul(m, parse_transform(ch.get('transform'))))
            if subs:
                g = fill_geom(subs)
                if g is not None:
                    parts.append(g)
        return unary_union(parts)

    INH = ('fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity')

    def walk(el, m, op, clip, sty=None):
        sty = dict(sty or {})
        sty.update({k: el.get(k) for k in INH if el.get(k) is not None})
        if el.tag in ('defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop'):
            return
        m = mat_mul(m, parse_transform(el.get('transform')))
        op = op * float(el.get('opacity', 1))
        if op <= 0.002:
            return
        if el.get('clip-path'):
            cg = clip_geom(el.get('clip-path'), m)
            clip = cg if clip is None else clip.intersection(cg)
        if el.tag in ('g', 'svg'):
            for ch in el:
                walk(ch, m, op, clip, sty)
            return
        subs = geom_of(el, m)
        if not subs:
            return
        fill = sty.get('fill', '#000')
        stroke = sty.get('stroke')
        sw = float(sty.get('stroke-width', 1)) * mscale(m)
        fop = op * float(sty.get('fill-opacity', 1))
        if fill and fill != 'none':
            gm = re.match(r'url\(#([^)]+)\)', fill)
            paint = grad_fill(grads[gm.group(1)], bbox_of(subs), fop) if gm else \
                {'ty': 'fl', 'c': st(color(fill)), 'o': st(r3(fop * 100)), 'r': 1}
            if clip is None:
                out.append(group([sh_bez(s) for s in subs] + [paint]))
            else:
                g = fill_geom(subs)
                g = g.intersection(clip) if g is not None else None
                sh = geom_shapes(g)
                if sh:
                    out.append(group(sh + [dict(paint, r=2)]))
        if stroke and stroke != 'none' and sw > 0:
            cap, join = sty.get('stroke-linecap', 'butt'), sty.get('stroke-linejoin', 'miter')
            if clip is None:
                out.append(group([sh_bez(s) for s in subs] + [{
                    'ty': 'st', 'c': st(color(stroke)), 'o': st(r3(op * float(sty.get('stroke-opacity', 1)) * 100)),
                    'w': st(r3(sw)), 'lc': {'butt': 1, 'round': 2, 'square': 3}[cap],
                    'lj': {'miter': 1, 'round': 2, 'bevel': 3}[join], 'ml': 4}]))
            else:
                g = stroke_geom(subs, sw, cap, join)
                g = g.intersection(clip) if g is not None else None
                sh = geom_shapes(g)
                if sh:
                    out.append(group(sh + [{'ty': 'fl', 'c': st(color(stroke)), 'o': st(r3(op * 100)), 'r': 2}]))
    walk(root, base, 1.0, None)
    return out[::-1]
