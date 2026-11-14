"""A small SVG → Android VectorDrawable converter for the drawings this repo makes (scripts/make-character-icons.py).

Off-the-shelf converters drop clip paths, which the character art uses for every highlight, so this handles exactly
the subset our SVGs use: <g>/<path>/<circle>/<ellipse>/<rect>, translate/scale/rotate transforms (one nested <group>
per step), inherited fill/stroke/stroke-width/linecap/linejoin, opacity folded into fillAlpha/strokeAlpha, clip-path
on a group or a shape (a <group> whose first child is the <clip-path>), and linear gradients in bounding-box units
(turned into the shape's own coordinates). `to_svg()` turns the result back into SVG so a render can be compared with
the original, pixel for pixel.
"""
import math
import re
import xml.etree.ElementTree as ET

SVGNS = '{http://www.w3.org/2000/svg}'
A = 'android:'
INHERIT = ('fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin')


def tag(e):
    return e.tag.replace(SVGNS, '')


def num(s, d=0.0):
    try:
        return float(s)
    except (TypeError, ValueError):
        return d


def f(x):
    s = f'{x:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def color(c, alpha=1.0):
    c = c.strip()
    if c.startswith('#') and len(c) == 4:
        c = '#' + ''.join(ch * 2 for ch in c[1:])
    named = {'white': '#ffffff', 'black': '#000000'}
    c = named.get(c, c)
    a = max(0, min(255, round(alpha * 255)))
    return f'#{a:02X}{c[1:].upper()}'


def ops(t):
    """Transform steps, outermost first."""
    out = []
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', t or ''):
        v = [num(x) for x in re.split(r'[\s,]+', args.strip()) if x]
        if name == 'translate':
            out.append(('t', v[0], v[1] if len(v) > 1 else 0))
        elif name == 'scale':
            out.append(('s', v[0], v[1] if len(v) > 1 else v[0]))
        elif name == 'rotate':
            if len(v) == 3:
                out += [('t', v[1], v[2]), ('r', v[0]), ('t', -v[1], -v[2])]
            else:
                out.append(('r', v[0]))
        else:
            raise ValueError('transform not handled: ' + name)
    return out


def group_attrs(op):
    if op[0] == 't':
        return {'translateX': f(op[1]), 'translateY': f(op[2])}
    if op[0] == 's':
        return {'scaleX': f(op[1]), 'scaleY': f(op[2])}
    return {'rotation': f(op[1])}


def ellipse_d(cx, cy, rx, ry):
    return (f'M{f(cx - rx)} {f(cy)}A{f(rx)} {f(ry)} 0 1 0 {f(cx + rx)} {f(cy)}'
            f'A{f(rx)} {f(ry)} 0 1 0 {f(cx - rx)} {f(cy)}Z')


def shape_d(e):
    t = tag(e)
    g = lambda k, d=0.0: num(e.get(k), d)
    if t == 'path':
        return e.get('d')
    if t == 'circle':
        return ellipse_d(g('cx'), g('cy'), g('r'), g('r'))
    if t == 'ellipse':
        return ellipse_d(g('cx'), g('cy'), g('rx'), g('ry'))
    if t == 'rect':
        x, y, w, h = g('x'), g('y'), g('width'), g('height')
        rx = num(e.get('rx'), num(e.get('ry'), 0))
        ry = num(e.get('ry'), rx)
        if rx <= 0:
            return f'M{f(x)} {f(y)}h{f(w)}v{f(h)}h{f(-w)}Z'
        rx, ry = min(rx, w / 2), min(ry, h / 2)
        return (f'M{f(x + rx)} {f(y)}H{f(x + w - rx)}A{f(rx)} {f(ry)} 0 0 1 {f(x + w)} {f(y + ry)}V{f(y + h - ry)}'
                f'A{f(rx)} {f(ry)} 0 0 1 {f(x + w - rx)} {f(y + h)}H{f(x + rx)}A{f(rx)} {f(ry)} 0 0 1 {f(x)} {f(y + h - ry)}'
                f'V{f(y + ry)}A{f(rx)} {f(ry)} 0 0 1 {f(x + rx)} {f(y)}Z')
    return None


def bbox(d):
    """Rough box of a path from its coordinates (control points included; enough for a gradient's span)."""
    xs, ys = [], []
    cx = cy = 0.0
    for cmd, args in re.findall(r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)', d):
        v = [num(x) for x in re.findall(r'-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', args)]
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'Z':
            continue
        if c == 'H':
            for x in v:
                cx = cx + x if rel else x; xs.append(cx); ys.append(cy)
            continue
        if c == 'V':
            for y in v:
                cy = cy + y if rel else y; xs.append(cx); ys.append(cy)
            continue
        step = {'M': 2, 'L': 2, 'T': 2, 'C': 6, 'S': 4, 'Q': 4, 'A': 7}[c]
        for i in range(0, len(v) - step + 1, step):
            seg = v[i:i + step]
            if c == 'A':
                pts = [seg[5:7]]
                rx, ry = seg[0], seg[1]
            else:
                pts = [seg[j:j + 2] for j in range(0, step, 2)]
                rx = ry = 0
            ox, oy = cx, cy
            for px, py in pts:
                ax, ay = (ox + px, oy + py) if rel else (px, py)
                xs.append(ax); ys.append(ay)
            cx, cy = xs[-1], ys[-1]
            if c == 'A':
                xs += [cx - 2 * rx, cx + 2 * rx]; ys += [cy - 2 * ry, cy + 2 * ry]
    return min(xs), min(ys), max(xs), max(ys)


class Conv:
    def __init__(self, root):
        self.root = root
        self.defs = {e.get('id'): e for e in root.iter() if e.get('id')}

    def gradient(self, ref, d, alpha):
        g = self.defs[ref]
        assert tag(g) == 'linearGradient', ref
        x0, y0, x1, y1 = bbox(d)
        w, h = x1 - x0, y1 - y0
        if g.get('gradientUnits') == 'userSpaceOnUse':
            sx, sy, ex, ey = (num(g.get(k)) for k in ('x1', 'y1', 'x2', 'y2'))
        else:
            gx = lambda k, dv: num(g.get(k), dv)
            sx, sy = x0 + gx('x1', 0) * w, y0 + gx('y1', 0) * h
            ex, ey = x0 + gx('x2', 1) * w, y0 + gx('y2', 0) * h
        items = ''
        for s in g:
            if tag(s) != 'stop':
                continue
            off = s.get('offset', '0')
            off = num(off[:-1]) / 100 if off.endswith('%') else num(off)
            items += (f'<item {A}offset="{f(off)}" '
                      f'{A}color="{color(s.get("stop-color", "#000"), num(s.get("stop-opacity"), 1) * alpha)}"/>')
        return (f'<gradient {A}type="linear" {A}startX="{f(sx)}" {A}startY="{f(sy)}" {A}endX="{f(ex)}" '
                f'{A}endY="{f(ey)}">{items}</gradient>')

    def paint(self, which, val, d, alpha):
        """(attribute xml, inner aapt xml) for a fill or stroke."""
        if not val or val == 'none':
            return '', ''
        m = re.match(r'url\(#([^)]+)\)', val)
        if m:
            return '', (f'<aapt:attr name="{A}{which}Color">{self.gradient(m[1], d, 1.0)}</aapt:attr>',
                        alpha)
        return f' {A}{which}Color="{color(val)}"' + (f' {A}{which}Alpha="{f(alpha)}"' if alpha < 1 else ''), ''

    def shape(self, e, st, alpha):
        d = shape_d(e)
        attrs, inner = f' {A}pathData="{d}"', ''
        fa, fi = self.paint('fill', st.get('fill', '#000'), d, alpha * num(e.get('fill-opacity'), 1))
        attrs += fa
        if fi:
            inner += fi[0]
            if fi[1] < 1:
                attrs += f' {A}fillAlpha="{f(fi[1])}"'
        sa, si = self.paint('stroke', st.get('stroke'), d, alpha * num(e.get('stroke-opacity'), 1))
        if sa or si:
            attrs += sa + f' {A}strokeWidth="{f(num(st.get("stroke-width"), 1))}"'
            if st.get('stroke-linecap'):
                attrs += f' {A}strokeLineCap="{st["stroke-linecap"]}"'
            if st.get('stroke-linejoin'):
                attrs += f' {A}strokeLineJoin="{st["stroke-linejoin"]}"'
            if si:
                inner += si[0]
        if e.get('fill-rule') == 'evenodd' or st.get('fill-rule') == 'evenodd':
            attrs += f' {A}fillType="evenOdd"'
        return f'<path{attrs}>{inner}</path>' if inner else f'<path{attrs}/>'

    def clip(self, ref):
        cp = self.defs[ref]
        ds = []
        for c in cp:
            assert not c.get('transform'), 'transformed clip shape'
            ds.append(shape_d(c))
        return f'<clip-path {A}pathData="{" ".join(ds)}"/>'

    def node(self, e, st, alpha):
        t = tag(e)
        if t in ('defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc'):
            return ''
        st = dict(st)
        for k in INHERIT:
            if e.get(k) is not None:
                st[k] = e.get(k)
        alpha *= num(e.get('opacity'), 1)
        if alpha <= 0:
            return ''
        if t in ('g', 'svg'):
            body = ''.join(self.node(c, st, alpha) for c in e)
        else:
            body = self.shape(e, st, alpha)
        m = re.match(r'url\(#([^)]+)\)', e.get('clip-path') or '')
        if m:
            body = f'<group>{self.clip(m[1])}{body}</group>'
        for op in reversed(ops(e.get('transform') if t != 'svg' else '')):
            ga = ''.join(f' {A}{k}="{v}"' for k, v in group_attrs(op).items())
            body = f'<group{ga}>{body}</group>'
        return body


def convert(svg_text, extra=''):
    """The SVG's drawing as VectorDrawable children (no <vector> wrapper)."""
    root = ET.fromstring(svg_text)
    return Conv(root).node(root, {'fill': '#000'}, 1.0)


# ---------------------------------------------------------------- back to SVG, to check a conversion by rendering it
def to_svg(vd_children, view):
    """VectorDrawable children → SVG with the same meaning (clip-path clips the siblings after it)."""
    x = ET.fromstring(f'<r xmlns:android="http://schemas.android.com/apk/res/android" '
                      f'xmlns:aapt="http://schemas.android.com/aapt">{vd_children}</r>')
    AN = '{http://schemas.android.com/apk/res/android}'
    n = [0]

    def attr(e, k, d=None):
        return e.get(AN + k, d)

    def argb(c):
        a = int(c[1:3], 16) / 255
        return '#' + c[3:], a

    def grad(g):
        n[0] += 1
        i = f'g{n[0]}'
        stops = ''
        for it in g:
            col, a = argb(it.get(AN + 'color'))
            stops += f'<stop offset="{it.get(AN + "offset")}" stop-color="{col}" stop-opacity="{f(a)}"/>'
        return i, (f'<linearGradient id="{i}" gradientUnits="userSpaceOnUse" x1="{attr(g, "startX")}" '
                   f'y1="{attr(g, "startY")}" x2="{attr(g, "endX")}" y2="{attr(g, "endY")}">{stops}</linearGradient>')

    def walk(e):
        out = ''
        kids = list(e)
        i = 0
        while i < len(kids):
            c = kids[i]
            t = c.tag.split('}')[-1]
            if t == 'clip-path':
                n[0] += 1
                cid = f'c{n[0]}'
                rest = ET.Element('r')
                for k in kids[i + 1:]:
                    rest.append(k)
                return out + (f'<clipPath id="{cid}"><path d="{attr(c, "pathData")}"/></clipPath>'
                              f'<g clip-path="url(#{cid})">{walk(rest)}</g>')
            if t == 'group':
                # a VectorDrawable group: scale, then rotate, about the pivot, then translate
                px, py = num(attr(c, 'pivotX'), 0), num(attr(c, 'pivotY'), 0)
                tx, ty = num(attr(c, 'translateX'), 0), num(attr(c, 'translateY'), 0)
                tr = (f'translate({f(tx + px)} {f(ty + py)}) rotate({f(num(attr(c, "rotation"), 0))}) '
                      f'scale({f(num(attr(c, "scaleX"), 1))} {f(num(attr(c, "scaleY"), 1))}) translate({f(-px)} {f(-py)})')
                out += f'<g transform="{tr}">{walk(c)}</g>' if tr else f'<g>{walk(c)}</g>'
            elif t == 'path':
                p = f'<path d="{attr(c, "pathData")}"'
                defs = ''
                fill, stroke = attr(c, 'fillColor'), attr(c, 'strokeColor')
                for a in c:
                    if a.tag.endswith('attr'):
                        gi, gd = grad(a[0])
                        defs += gd
                        if a.get('name') == 'android:fillColor':
                            fill = f'url(#{gi})'
                        else:
                            stroke = f'url(#{gi})'
                fa = num(attr(c, 'fillAlpha'), 1)
                sa = num(attr(c, 'strokeAlpha'), 1)
                if fill and fill.startswith('#'):
                    col, a = argb(fill); fill = col; fa *= a
                if stroke and stroke.startswith('#'):
                    col, a = argb(stroke); stroke = col; sa *= a
                p += f' fill="{fill or "none"}" fill-opacity="{f(fa)}"'
                if attr(c, 'fillType') == 'evenOdd':
                    p += ' fill-rule="evenodd"'
                if stroke:
                    p += (f' stroke="{stroke}" stroke-opacity="{f(sa)}" stroke-width="{attr(c, "strokeWidth", "0")}"'
                          f' stroke-linecap="{attr(c, "strokeLineCap", "butt")}"'
                          f' stroke-linejoin="{attr(c, "strokeLineJoin", "miter")}"')
                out += defs + p + '/>'
            i += 1
        return out

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="512" height="512">'
            f'{walk(x)}</svg>')
