#!/usr/bin/env python3
"""Forced alignment of a recitation with the bundled Quran text (CTC, Quran-trained wav2vec2).

Given a recording of one surah (or of a run of ayat) and our own text, finds when every word — and so every
ayah — is recited. The text is never changed: it is only reduced to its letters to look them up in the
model's alphabet. Used offline by scripts that make timings for recordings that have none or wrong ones;
every result still goes through the pause and pace checks of `verify-mp3quran.py` before it ships.

Model: rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final (Apache-2.0), downloaded to MODEL_DIR.

  python3 scripts/align-ayat.py AUDIO SURAH [FROM [TO]]   → prints JSON {ayat: [[startMs, endMs], ...], words: [...]}
"""
import json, os, subprocess, sys
import numpy as np
import torch, torchaudio
from transformers import Wav2Vec2ForCTC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.environ.get('ALIGN_MODEL', os.path.join(ROOT, '.cache', 'align-model'))
SR = 16000
HOP = 320  # samples per output frame (20 ms)
CHUNK, CTX = 30 * SR, 3 * SR  # model input pieces with context on both sides

_model = None


def model():
  global _model, VOCAB
  if _model is None:
    torch.set_num_threads(os.cpu_count() or 4)
    _model = Wav2Vec2ForCTC.from_pretrained(MODEL_DIR).eval()
    VOCAB = json.load(open(os.path.join(MODEL_DIR, 'vocab.json')))
  return _model


def load(path, t0=None, t1=None):
  cmd = ['ffmpeg', '-v', 'quiet']
  if t0 is not None: cmd += ['-ss', str(t0)]
  if t1 is not None: cmd += ['-to', str(t1)]
  cmd += ['-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', 'pipe:1']
  return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


@torch.inference_mode()
def emissions(x):
  """Log-probabilities per 20 ms frame for the whole signal (pieces with context, stitched)."""
  m = model()
  out = []
  n = len(x)
  for a in range(0, n, CHUNK):
    lo, hi = max(0, a - CTX), min(n, a + CHUNK + CTX)
    seg = torch.from_numpy(x[lo:hi].copy())
    seg = (seg - seg.mean()) / (seg.std() + 1e-7)
    lp = torch.log_softmax(m(seg[None]).logits[0], -1)
    f0 = (a - lo) // HOP
    f1 = f0 + (min(n, a + CHUNK) - a) // HOP
    out.append(lp[f0:min(f1, lp.shape[0])])
  return torch.cat(out)


# Letters only: marks, small letters and the end-of-ayah number are not in the model's alphabet.
FOLD = {'ٱ': 'ا', 'ٲ': 'أ', 'ٳ': 'إ', 'ی': 'ي', 'ۦ': '', 'ۥ': ''}


def letters(word):
  s = ''.join(FOLD.get(c, c) for c in word)
  return [c for c in s if c in VOCAB and 'ء' <= c <= 'ي']


def words_of(ayah):
  """Our ayah text → its words (the end-of-ayah number after the last no-break space is not a word; a
  rub' al-hizb sign before the ayah is kept as a word without letters)."""
  return ayah.rsplit('\xa0', 1)[0].replace('\xa0', ' ').split(' ')


def _align_em(em, ayat, preamble):
  """One forced alignment over these frames → (ayah spans, word spans, total score, confidence per ayah),
  in seconds from the first frame."""
  T = em.shape[0]
  blank = VOCAB['<pad>']
  sep = VOCAB['|']
  # Star column: matches any audio a little worse than the best letter (absorbs isti'adha, takbir, endings).
  star = (em[:, [i for i in range(em.shape[1]) if i != blank]].max(1).values - 2.0)[:, None]
  em2 = torch.cat([em, star], 1)
  S = em.shape[1]
  tokens, owner = [S], [None]  # owner: (ayah index, word index) of each token; None for star / separator
  def add_word(w, who):
    ls = letters(w)
    if not ls: return
    if len(tokens) > 1 and owner[-1] is not None: tokens.append(sep); owner.append(None)
    for c in ls: tokens.append(VOCAB[c]); owner.append(who)
  for p in preamble:
    for w in p.split(' '): add_word(w, ('pre', 0))
  for i, a in enumerate(ayat):
    for j, w in enumerate(words_of(a)): add_word(w, (i, j))
  tokens.append(S); owner.append(None)
  if len(tokens) * 1 > T: raise ValueError('audio too short for the text')
  path, sc = torchaudio.functional.forced_align(em2[None], torch.tensor([tokens], dtype=torch.int32), blank=blank)
  path, sc = path[0].tolist(), sc[0]
  # Frame spans per token (merging repeats), in token order.
  spans, k, prev = [], -1, blank
  for t, tok in enumerate(path):
    if tok == blank: prev = blank; continue
    if tok != prev or k < 0:
      k += 1; spans.append([t, t])
    else:
      spans[-1][1] = t
    prev = tok
  assert len(spans) == len(tokens), (len(spans), len(tokens))
  ws = {}
  for (a, b), who in zip(spans, owner):
    if who is None or who[0] == 'pre': continue
    s = ws.setdefault(who, [a, b]); s[0] = min(s[0], a); s[1] = max(s[1], b)
  sec = HOP / SR
  words = [[[ws[(i, j)][0] * sec, (ws[(i, j)][1] + 1) * sec] for j in range(len(words_of(a))) if (i, j) in ws]
           for i, a in enumerate(ayat)]
  spans_a = [[w[0][0], w[-1][1]] for w in words]
  # Confidence per ayah: mean log-probability of the path over the ayah's frames (≈ 0 = clearly heard).
  conf = [float(sc[int(a / sec):int(b / sec)].mean()) for a, b in spans_a]
  return spans_a, words, float(sc.sum()), conf


WINDOW = 480  # seconds: longer recordings are aligned window by window


def align(x, ayat, preamble=()):
  """Audio → (per ayah [start, end] seconds, per ayah per word [start, end]); also sets LAST_SCORE, LAST_CONF.
  `preamble`: texts recited before the first ayah (the basmala); free audio (a star) is allowed at both ends.
  A long recording is aligned in windows of ~8 min: each takes the ayat that should fit in ~70 % of it (at the
  surah's own pace), keeps all but the last, and the next window starts just after the last one kept."""
  global LAST_EM, _EM_OF, LAST_SCORE, LAST_CONF
  if globals().get('_EM_OF') is not x: LAST_EM, _EM_OF = emissions(x), x  # same audio again: reuse
  em = LAST_EM
  T, fps = em.shape[0], SR / HOP
  if T <= WINDOW * fps * 1.3:
    ay, wd, LAST_SCORE, LAST_CONF = _align_em(em, ayat, preamble)
    return ay, wd
  size = [sum(len(letters(w)) for w in words_of(a)) for a in ayat]
  rate = sum(size) / (T / fps)  # letters per second of recording, pauses included
  ay, wd, conf, score = [], [], [], 0.0
  i, f0, pre = 0, 0, list(preamble)
  while i < len(ayat):
    last = T - f0 <= WINDOW * fps * 1.3
    if last: j, f1 = len(ayat), T
    else:
      j, budget = i, 0.7 * WINDOW * rate
      while j < len(ayat) and (j < i + 2 or budget >= size[j]): budget -= size[j]; j += 1
      f1 = f0 + int(WINDOW * fps)
    a, w, sc, c = _align_em(em[f0:f1], ayat[i:j], pre)
    keep = j - i if last or j == len(ayat) else max(1, j - i - 1)
    off = f0 / fps
    ay += [[s + off, e + off] for s, e in a[:keep]]
    wd += [[[s + off, e + off] for s, e in ws] for ws in w[:keep]]
    conf += c[:keep]; score += sc
    i += keep; pre = []
    f0 = int((ay[-1][1] - 0.1) * fps)  # just before the end of the last ayah kept: the star takes the rest
  LAST_SCORE, LAST_CONF = score, conf
  return ay, wd


def opening(x, surah, first, basmala, istiadha):
  """What is recited before the first ayah, heard (greedy read-back of the first 25 s), not guessed from
  alignment scores: free audio and CTC blanks would let ayah 1's words hide inside a basmala they resemble.
  `first`: the first ayah's text (Al-Falaq / An-Nas begin with "qul a'udhu" themselves)."""
  global LAST_EM, _EM_OF
  if globals().get('_EM_OF') is not x: LAST_EM, _EM_OF = emissions(x), x
  heard = ''.join(read_back(0, 25)).replace('أ', 'ا').replace('إ', 'ا')
  own = ''.join(c for w in words_of(first)[:2] for c in letters(w)).replace('أ', 'ا').replace('إ', 'ا')
  pre = []
  k = heard.find('عوذ')
  if k >= 0 and not (own.endswith('عوذ') and heard.find(own) == k + 3 - len(own)): pre.append(istiadha)
  if surah not in (1, 9) and 'بسم' in heard[:60]: pre.append(basmala)
  return pre


def read_back(t0, t1):
  """Letters the model hears between t0 and t1 seconds of the last aligned audio (greedy, letters only)."""
  inv = {v: k for k, v in VOCAB.items()}
  ids = LAST_EM[max(0, int(t0 * SR / HOP)):int(t1 * SR / HOP)].argmax(1).tolist()
  out, prev = [], None
  for i in ids:
    if i != prev:
      c = inv.get(i, '')
      if '\u0621' <= c <= '\u064a': out.append(c)
    prev = i
  return out


def distance(a, b):
  """Levenshtein distance between two letter lists."""
  d = list(range(len(b) + 1))
  for i, x in enumerate(a, 1):
    p, d[0] = d[0], i
    for j, y in enumerate(b, 1):
      p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (x != y))
  return d[-1]


if __name__ == '__main__':
  audio, s = sys.argv[1], int(sys.argv[2])
  text = json.load(open(os.path.join(ROOT, 'public', 'data', 'quran-uthmani.json')))['surahs'][s - 1]
  a = int(sys.argv[3]) if len(sys.argv) > 3 else 1
  b = int(sys.argv[4]) if len(sys.argv) > 4 else len(text)
  model()
  pre = [] if s in (1, 9) or a != 1 else ['بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ']
  ay, wd = align(load(audio), text[a - 1:b], pre)
  print(json.dumps({'ayat': [[round(x * 1000), round(y * 1000)] for x, y in ay],
                    'words': [[[round(x * 1000), round(y * 1000)] for x, y in w] for w in wd]}))
