"""The opening animation as a Lottie (owner pick 2026-11-15: "Lottie").

Same rig as scripts/opening_anim.py, but vector: the head, body and neck are drawn once and moved by keyframed
transforms (root, head, neck), and what changes shape every frame (arms, faces, sparkles, the star) is a vector layer
per frame. Writes android/app/src/main/res/raw/opening.json (lottie-android plays it in AppActivity).

  python3 scripts/opening_lottie.py [--version duo] [--out PATH]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import opening_anim as oa          # noqa: E402
from svg2lottie import convert, st  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'android/app/src/main/res/raw/opening.json'


def anim(vals):
    """Per-frame values → a linear keyframed property (or a static one when nothing changes)."""
    if all(v == vals[0] for v in vals):
        return st(vals[0])
    ks = []
    for i, v in enumerate(vals):
        if i and i < len(vals) - 1 and vals[i - 1] == v == vals[i + 1]:
            continue
        ks.append({'t': i, 's': v if isinstance(v, list) else [v],
                   'i': {'x': [1], 'y': [1]}, 'o': {'x': [0], 'y': [0]}})
    return {'a': 1, 'k': ks}


def r4(x):
    return round(x, 4)


def tf(seq):
    return {'o': st(100),
            'a': anim([[r4(t['a'][0]), r4(t['a'][1])] for t in seq]),
            'p': anim([[r4(t['p'][0]), r4(t['p'][1])] for t in seq]),
            's': anim([[r4(t['s'][0] * 100), r4(t['s'][1] * 100)] for t in seq]),
            'r': anim([r4(t['r']) for t in seq])}


STATIC = {'o': st(100), 'a': st([0, 0]), 'p': st([0, 0]), 's': st([100, 100]), 'r': st(0)}


def layer(ind, nm, ks, n, shapes=None, parent=None, ip=0, op=None):
    L = {'ddd': 0, 'ind': ind, 'ty': 4 if shapes is not None else 3, 'nm': nm, 'sr': 1, 'ks': ks, 'ao': 0,
         'ip': ip, 'op': n + 1 if op is None else op, 'st': 0, 'bm': 0}
    if shapes is not None:
        L['shapes'] = shapes
    if parent:
        L['parent'] = parent
    return L


def build(key='duo'):
    V = oa.VERSIONS[key]()
    P = oa.load_parts(oa.actor_svg())
    F = oa.simulate(V)
    parts = [oa.frame(V, P, f, i, parts=True) for i, f in enumerate(F)]
    n = len(parts)
    vx, vy, vw, vh = oa.VB
    W, H = round(vw * oa.PX), round(vh * oa.PX)
    ids = iter(range(1, 100000))
    VIEW, RT, HEAD = next(ids), next(ids), next(ids)
    layers = []

    def flip(slot, parent):
        """A vector layer per run of identical frames of this slot."""
        out, i = [], 0
        while i < n:
            j = i + 1
            while j < n and parts[j][slot] == parts[i][slot]:
                j += 1
            sh = convert(parts[i][slot]) if parts[i][slot] else []
            if sh:
                out.append(layer(next(ids), f'{slot} {i}', STATIC, n, sh, parent, ip=i, op=j if j < n else n + 1))
            i = j
        return out
    # top first: front, faces, head, arms, body, neck, under
    layers += flip('front', VIEW)
    LOOK = next(ids)
    names = sorted({f for p in parts for f in p['fw']})

    def op_of(name):
        return [round(p['fw'].get(name, 0.0) * 100, 2) for p in parts]

    def face_layer(nm, svg, opv, scale=None):
        """scale: (centre, part → (sx, sy)) keyed per frame."""
        ks = dict(STATIC, o=anim(opv))
        if scale:
            (ax, ay), fn = scale
            ks.update(a=st([ax, ay]), p=st([ax, ay]), s=anim([[r4(v * 100) for v in fn(p)] for p in parts]))
        return layer(next(ids), nm, ks, n, convert(svg), LOOK)
    eyes = (oa.EYE_C, lambda p: (p['pop'], p['blink'] * p['pop']))
    for nm in names:
        o = op_of(nm)
        if nm == 'joy':
            layers.append(face_layer('joy mouth', P['mouth'], o, (oa.MOUTH_C, lambda p: (p['mouth_w'], p['mouth_open']))))
            layers.append(face_layer('joy eyes', P['eyes'], o, eyes))
            layers.append(face_layer('joy', P['cheeks_nose'] + P['must'], o))
        elif nm == 'open':
            layers.append(face_layer('open eyes', P['eyes'], o, eyes))
            layers.append(face_layer('open', P['x0rest'], o))
        elif nm == 'wow':
            layers.append(face_layer(nm, P[nm], o, (oa.WOW_C, lambda p: (p['pop'], p['pop']))))
        else:
            layers.append(face_layer(nm, P[nm], o))
    layers.append(layer(LOOK, 'look', dict(STATIC, p=anim([[r4(p['look'][0]), r4(p['look'][1])] for p in parts])), n, None, HEAD))
    layers.append(layer(HEAD, 'head', tf([p['head'] for p in parts]), n, convert(P['head']), RT))
    layers += flip('mid', RT)
    layers.append(layer(next(ids), 'body', {'o': st(100), 'a': st([100, 0]), 'p': st([100, 0]),
                                            's': st([oa.BODY_W * 100, 100]), 'r': st(0)}, n, convert(P['body']), RT))
    layers.append(layer(next(ids), 'neck', tf([p['neck'] for p in parts]), n, convert(P['neck']), RT))
    layers += flip('under', VIEW)
    layers.append(layer(RT, 'root', tf([p['root'] for p in parts]), n, None, VIEW))
    layers.append(layer(VIEW, 'view', {'o': st(100), 'a': st([0, 0]), 'p': st([-vx * oa.PX, -vy * oa.PX]),
                                       's': st([oa.PX * 100, oa.PX * 100]), 'r': st(0)}, n))
    return {'v': '5.7.4', 'fr': oa.FPS, 'ip': 0, 'op': n, 'w': W, 'h': H, 'nm': f'opening-{key}', 'ddd': 0,
            'assets': [], 'layers': layers}


def main():
    key = sys.argv[sys.argv.index('--version') + 1] if '--version' in sys.argv else 'duo'
    out = Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else OUT
    data = build(key)
    out.write_text(json.dumps(data, separators=(',', ':')))
    print(out, out.stat().st_size, 'bytes,', data['op'], 'frames,', len(data['layers']), 'layers')


if __name__ == '__main__':
    main()
