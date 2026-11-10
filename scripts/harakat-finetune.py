#!/usr/bin/env python3
"""Fine-tunes the harakat model on the clips teachers labelled, for a free GPU (Kaggle or Colab: a T4 is
enough), then exports it the way the server uses it (ONNX, 4-bit weights) and checks it against the
current model on clips it did not train on.

  pip install torch transformers onnx onnx_ir onnxruntime
  python3 scripts/harakat-finetune.py CLIPS_DIR --out ft [--steps 1500]

Training data: clips labelled 'right' (by a teacher, or unflagged and not disputed), whose text is the
clip's words written as the model writes them (harakat included). A clip said wrong is not trained on
(what was said instead is not known); it is used only to check the result. 15 % of the clips (by id, so
the split is the same every run) are held out. The new model replaces server/harakat/model.onnx only by
hand, after its report is better: more wrong harakat caught at no more false alarms.
Base model: rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final (Apache-2.0)."""
import argparse, json, os, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'server', 'harakat'))
import harakat as H  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('clips')
ap.add_argument('--base', default='rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final')
ap.add_argument('--out', default='harakat-ft')
ap.add_argument('--steps', type=int, default=1500)
ap.add_argument('--lr', type=float, default=1e-5)
ap.add_argument('--batch', type=int, default=8)
ap.add_argument('--current', default=os.path.join(HERE, '..', 'server', 'harakat', 'model.onnx'))
args = ap.parse_args()

import torch  # noqa: E402
from transformers import Wav2Vec2ForCTC  # noqa: E402

rows = [json.loads(x) for x in open(os.path.join(args.clips, 'clips.jsonl'), encoding='utf-8')]


def label(c):
    if c.get('label') in ('right', 'wrong', 'unclear'):
        return c['label']
    if c['flagged']:
        return c['learner'] if c['learner'] in ('right', 'wrong') else None
    return 'right'


def audio(c):
    with wave.open(os.path.join(args.clips, 'wav', f"{c['id']}.wav")) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    return (a - a.mean()) / (a.std() + 1e-7)


def text_ids(words):
    ids = []
    for i, w in enumerate(words):
        ids += [H.V[ch] for ch in H.model_form(w)]
        if i < len(words) - 1:
            ids.append(H.SEP)
    return ids


held = [c for c in rows if c['id'] % 100 < 15 and label(c) in ('right', 'wrong')]
train = [c for c in rows if c['id'] % 100 >= 15 and label(c) == 'right']
print(f'{len(train)} clips to train on, {len(held)} held out')
if not train:
    sys.exit('no clips to train on yet')

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
model = Wav2Vec2ForCTC.from_pretrained(args.base, ctc_loss_reduction='mean', pad_token_id=H.BLANK).to(dev)
assert model.config.vocab_size == len(H.V), 'the base model must use server/harakat/vocab.json'
model.freeze_feature_encoder()
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.0)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 100) * max(0.0, 1 - s / args.steps))
rng = np.random.default_rng(0)
model.train()
for step in range(args.steps):
    batch = [train[i] for i in rng.choice(len(train), size=min(args.batch, len(train)), replace=False)]
    xs = [audio(c) for c in batch]
    # a little speed and loudness change, so the model learns the reciters' voices, not the clips
    xs = [np.interp(np.arange(0, len(x), r := rng.uniform(0.9, 1.1)), np.arange(len(x)), x).astype(np.float32) * rng.uniform(0.7, 1.3) for x in xs]
    n = max(len(x) for x in xs)
    x = torch.zeros(len(xs), n); mask = torch.zeros(len(xs), n, dtype=torch.long)
    for i, a in enumerate(xs):
        x[i, :len(a)] = torch.from_numpy(a); mask[i, :len(a)] = 1
    ys = [text_ids(c['words']) for c in batch]
    m = max(len(y) for y in ys)
    y = torch.full((len(ys), m), -100, dtype=torch.long)
    for i, t in enumerate(ys):
        y[i, :len(t)] = torch.tensor(t)
    loss = model(x.to(dev), attention_mask=mask.to(dev), labels=y.to(dev)).loss
    opt.zero_grad(); loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step(); sched.step()
    if step % 50 == 0 or step == args.steps - 1:
        print(f'step {step} loss {loss.item():.3f}', flush=True)

os.makedirs(args.out, exist_ok=True)
model.eval().cpu()
fp = os.path.join(args.out, 'model_fp32.onnx')
torch.onnx.export(model, (torch.zeros(1, 16000),), fp, input_names=['input_values'], output_names=['logits'],
                  dynamic_axes={'input_values': {1: 'n'}, 'logits': {1: 't'}}, opset_version=17, dynamo=False)
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer  # noqa: E402
import onnx  # noqa: E402
q = MatMulNBitsQuantizer(onnx.load(fp), bits=4, block_size=32, is_symmetric=True)
q.process()
q4 = os.path.join(args.out, 'model.onnx')
q.model.save_model_to_file(q4, use_external_data_format=False)
print('wrote', q4)


def report(path):
    """Held-out clips: wrong ones caught, right ones flagged, with the default threshold."""
    mm = H.Model(path)
    caught = wrong = false = right = 0
    for c in held:
        a = audio(c)
        lp = mm.logp(a)
        s = H.harakat_scores(lp, c['words'])[c['target']]
        if label(c) == 'wrong':
            wrong += 1; caught += s['flag']
        else:
            right += 1; false += s['flag']
    return f'caught {caught}/{wrong}, false alarms {false}/{right}'


if held:
    if os.path.exists(args.current):
        print('current model:', report(args.current))
    print('new model:    ', report(q4))
