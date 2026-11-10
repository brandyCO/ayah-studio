#!/usr/bin/env python3
"""Sets the harakat check's threshold per haraka from the labelled clips (scripts/harakat-clips.py) and
writes server/harakat/thresholds.json.

  python3 scripts/harakat-tune.py CLIPS_DIR [--model server/harakat/model.onnx] [--false 0.015]

What a clip is: a teacher's label first ('right' / 'wrong'; 'unclear' is left out), else the learner's
own answer at the check for a flagged word ('right' = "I said it right", 'wrong' = left as missed), else
an unflagged word counts as said right. Each clip is scored again with the current model; for each haraka
the threshold is the highest one (most mistakes caught) that flags at most --false of the words said right,
and only when that haraka has ≥ 40 right and ≥ 10 wrong clips. Otherwise it keeps the default (FLAG)."""
import argparse, json, os, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'server', 'harakat'))
import harakat as H  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('clips')
ap.add_argument('--model', default=os.path.join(HERE, '..', 'server', 'harakat', 'model.onnx'))
ap.add_argument('--false', type=float, default=0.015)
ap.add_argument('--out', default=os.path.join(HERE, '..', 'server', 'harakat', 'thresholds.json'))
args = ap.parse_args()


def truth(c):
    if c.get('label') in ('right', 'wrong'):
        return c['label'], 'teacher'
    if c['flagged'] and c['learner'] in ('right', 'wrong'):
        return c['learner'], 'learner'
    if not c['flagged']:
        return 'right', 'unflagged'
    return None, None


def margins(m, path, words, target):
    """Each haraka of the target word: (haraka name, its margin)."""
    with wave.open(path) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    lp = m.logp(a)
    forms = [H.model_form(x) for x in words]
    toks, owner = [], []
    for wi, f in enumerate(forms):
        for ch in f:
            toks.append(H.V[ch]); owner.append(wi)
        if wi < len(forms) - 1:
            toks.append(H.SEP); owner.append(-1)
    ext, p = H.align(lp, toks)
    if p is None:
        return []
    best = {}
    for t, st in enumerate(p):
        if st >= 0 and st % 2 == 1:
            j = (st - 1) // 2
            tk = int(ext[st])
            if owner[j] == target and tk in H.HK:
                other = max(lp[t, o] for o in H.HK if o != tk)
                best[j] = max(best.get(j, -99.0), float(lp[t, tk] - other))
    return [(H.NAMES[toks[j]], v) for j, v in best.items()]


m = H.Model(args.model)
rows = [json.loads(x) for x in open(os.path.join(args.clips, 'clips.jsonl'), encoding='utf-8')]
right: dict[str, list[float]] = {}
wrong: dict[str, list[float]] = {}  # a wrong word's weakest haraka (the one most likely said wrong)
src = {}
for c in rows:
    t, how = truth(c)
    if not t:
        continue
    src[how] = src.get(how, 0) + 1
    ms = margins(m, os.path.join(args.clips, 'wav', f"{c['id']}.wav"), c['words'], c['target'])
    if not ms:
        continue
    if t == 'right':
        for name, v in ms:
            right.setdefault(name, []).append(v)
    else:
        name, v = min(ms, key=lambda x: x[1])
        wrong.setdefault(name, []).append(v)

print('clips used:', src)
out = {}
for name in H.NAMES.values():
    r = np.array(right.get(name, [])); w = np.array(wrong.get(name, []))
    if len(r) < 40 or len(w) < 10:
        print(f'{name:9s} right {len(r):4d} wrong {len(w):4d}  too few, keeps {H.FLAG}')
        continue
    best = None
    for thr in np.arange(-15, 8.01, 0.25):
        fa = float((r < thr).mean())
        if fa <= args.false:
            best = (float(thr), fa, float((w < thr).mean()))
    if best is None:
        print(f'{name:9s} no threshold keeps false alarms under {args.false:.1%}; keeps {H.FLAG}')
        continue
    out[name] = round(best[0], 2)
    print(f'{name:9s} right {len(r):4d} wrong {len(w):4d}  threshold {best[0]:6.2f}  false {best[1]:.1%}  caught {best[2]:.1%}')
json.dump(out, open(args.out, 'w'), indent=2)
print('wrote', args.out)
