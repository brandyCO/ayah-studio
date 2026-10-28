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
# Model input pieces with context on both sides. Short on purpose: given a long stretch the model leaves out
# words the reciter repeats (its training text has no repeats), so the repeat sounds like silence to it; in
# 6 s pieces it hears every word (e.g. Alafasy 78:40, words 5–10 read twice).
CHUNK, CTX = int(float(os.environ.get('ALIGN_CHUNK', 6)) * SR), int(float(os.environ.get('ALIGN_CTX', 1)) * SR)

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


STAR_COST = float(os.environ.get('STAR_COST', 1.0))


def _align_em(em, ayat, preamble):
  """One forced alignment over these frames → (ayah spans, word spans, total score, confidence per ayah),
  in seconds from the first frame."""
  T = em.shape[0]
  blank = VOCAB['<pad>']
  sep = VOCAB['|']
  # Star column: matches any audio a little worse than the best letter (absorbs isti'adha, takbir, endings).
  star = (em.max(1).values - STAR_COST)[:, None]
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
  tok_at = [None] * len(path)
  for t, tok in enumerate(path):
    if tok == blank: prev = blank; continue
    if tok != prev or k < 0:
      k += 1; spans.append([t, t])
    else:
      spans[-1][1] = t
    prev = tok
    tok_at[t] = k
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
  # Letter confidence per ayah: mean log-probability on the frames where the path is on one of its letters
  # (blanks excluded: a CTC model gives blanks almost everywhere, so they hide letters forced onto the wrong
  # audio). Clearly recited ≈ −0.1 … −0.5.
  lc, lw = {}, {}
  for t, tok in enumerate(path):
    if tok == blank: continue
    who = owner[tok_at[t]] if tok_at[t] is not None else None
    if who and who[0] != 'pre':
      lc.setdefault(who[0], []).append(float(sc[t])); lw.setdefault(who, []).append(float(sc[t]))
  lconf = [sum(lc.get(i, [0])) / max(1, len(lc.get(i, []))) for i in range(len(ayat))]
  # Speech the text does not explain: letters the model hears (runs of one letter as its best guess) on frames
  # where the path is on a blank, inside a word's span or in the gap after it. A pause has none and a long
  # madd is one letter held; the reciter going back to repeat words leaves many (blanks absorb them cheaply).
  best = em.argmax(1).tolist()
  heard = [b != blank and b != sep and path[t] == blank for t, b in enumerate(best)]
  starts = [t for t in range(len(best)) if heard[t] and (t == 0 or not heard[t - 1] or best[t - 1] != best[t])]
  import bisect
  def unexplained(a, b):
    return bisect.bisect_left(starts, b) - bisect.bisect_left(starts, a)
  # The same per word, kept as third (letter confidence) and fourth (unexplained letters in its span and the
  # gap after it) values of each word span.
  for i, a in enumerate(ayat):
    k = 0
    ks = [(i, j) for j in range(len(words_of(a))) if (i, j) in ws]
    for n, key in enumerate(ks):
      v = lw.get(key, [0]); words[i][k].append(sum(v) / len(v))
      nxt = ws[ks[n + 1]][0] if n + 1 < len(ks) else ws[key][1] + 1
      words[i][k].append(unexplained(ws[key][0], nxt)); k += 1
  return spans_a, words, float(sc.sum()), conf, lconf


JUMP = float(os.environ.get('JUMP', 8.0))  # cost (nats) of going back to repeat words
MAXBACK = 12  # words a repeat may go back


def align_repeats(x, ayah, preamble=(), f0=0, f1=None):
  """One ayah (an everyayah file, or one ayah's stretch of a surah file) aligned allowing the reciter to go back
  and recite words again: a CTC Viterbi whose path may jump from the end of a word to the start of the same or
  an earlier word (≤ MAXBACK back) at a cost of JUMP. Without it a repeat is absorbed by blanks and stretches one
  word over it. Returns (segments [[word index 0-based, start s, end s], ...] in time order — repeated words
  appear again —, confidence, letter confidence, unexplained letters per segment). `f0`, `f1`: frames of x to
  use (one ayah of a surah recording); times stay in seconds from the start of x."""
  global LAST_EM, _EM_OF
  if globals().get('_EM_OF') is not x: LAST_EM, _EM_OF = emissions(x), x
  em = LAST_EM[f0:f1].numpy().astype(np.float64)
  T = em.shape[0]
  blank, sep = VOCAB['<pad>'], VOCAB['|']
  star = em.max(1) - STAR_COST
  em2 = np.concatenate([em, star[:, None]], 1)
  S = em.shape[1]
  tokens, owner = [S], [None]
  def add_word(w, who):
    ls = letters(w)
    if not ls: return
    if len(tokens) > 1 and owner[-1] is not None: tokens.append(sep); owner.append(None)
    for c in ls: tokens.append(VOCAB[c]); owner.append(who)
  for p in preamble:
    for w in p.split(' '): add_word(w, -1)
  for j, w in enumerate(words_of(ayah)): add_word(w, j)
  tokens.append(S); owner.append(None)
  L = len(tokens); N = 2 * L + 1
  ext = np.full(N, blank); ext[1::2] = tokens
  own = [None] * N
  for i in range(L): own[2 * i + 1] = owner[i]
  allow2 = np.zeros(N, bool)
  for s in range(3, N, 2): allow2[s] = ext[s] != ext[s - 2]
  wids = sorted({o for o in owner if o is not None and o >= 0})
  first = np.array([min(2 * i + 1 for i in range(L) if owner[i] == j) for j in wids])
  last = np.array([max(2 * i + 1 for i in range(L) if owner[i] == j) for j in wids])
  n = len(wids)
  jk = np.arange(n)
  ok = (jk[None, :] >= jk[:, None]) & (jk[None, :] - jk[:, None] < MAXBACK)  # [target k, source j]
  NEG = -1e18
  alpha = np.full(N, NEG); alpha[0] = em2[0, ext[0]]; alpha[1] = em2[0, ext[1]]
  bp = np.zeros((T, N), np.int32)
  idx = np.arange(N)
  for t in range(1, T):
    c1 = np.concatenate([[NEG], alpha[:-1]]); c2 = np.concatenate([[NEG, NEG], alpha[:-2]]); c2[~allow2] = NEG
    stack = np.stack([alpha, c1, c2]); arg = stack.argmax(0); best = stack.max(0)
    src = idx - arg
    # back-jumps: from a word's last letter (or the blank after it) to the blank before an earlier word
    a1, a2 = alpha[last], alpha[last + 1]
    js = np.maximum(a1, a2); jsrc = np.where(a1 >= a2, last, last + 1)
    m = np.where(ok, js[None, :], NEG); bj = m.argmax(1); bv = m.max(1) - JUMP
    tgt = first - 1
    better = bv > best[tgt]
    best[tgt[better]] = bv[better]; src[tgt[better]] = jsrc[bj[better]]
    alpha = best + em2[t, ext]
    bp[t] = src
  s = N - 1 if alpha[N - 1] >= alpha[N - 2] else N - 2
  path = [0] * T
  for t in range(T - 1, -1, -1):
    path[t] = s; s = bp[t, s]
  # visits: a new one at every change of word or jump back (state index going down)
  segs, cur, sc_all, lsc = [], None, [], []
  for t in range(T):
    st = path[t]; o = own[st]
    sc = em2[t, ext[st]]
    if t and st < path[t - 1]: cur = None
    if o is not None and o >= 0:
      lsc.append(sc)
      if cur is None or cur[0] != o:
        cur = [o, t, t + 1]; segs.append(cur)
      else: cur[2] = t + 1
    if o is not None and o >= 0 or (segs and segs[0][1] <= t): sc_all.append(sc)
  sec = HOP / SR
  t0, t1 = segs[0][1], segs[-1][2]
  conf = float(np.mean([em2[t, ext[path[t]]] for t in range(t0, t1)]))
  lconf = float(np.mean(lsc)) if lsc else -99.0
  best_tok = em.argmax(1)
  heard = [b != blank and b != sep and ext[path[t]] == blank for t, b in enumerate(best_tok)]
  starts = [t for t in range(T) if heard[t] and (t == 0 or not heard[t - 1] or best_tok[t - 1] != best_tok[t])]
  import bisect
  unexp = []
  for k, (o, a, b) in enumerate(segs):
    nxt = segs[k + 1][1] if k + 1 < len(segs) else b
    unexp.append(bisect.bisect_left(starts, nxt) - bisect.bisect_left(starts, a))
  return [[o, (a + f0) * sec, (b + f0) * sec] for o, a, b in segs], conf, lconf, unexp


WINDOW = 480  # seconds: longer recordings are aligned window by window


def align(x, ayat, preamble=()):
  """Audio → (per ayah [start, end] seconds, per ayah per word [start, end]); also sets LAST_SCORE, LAST_CONF.
  `preamble`: texts recited before the first ayah (the basmala); free audio (a star) is allowed at both ends.
  A long recording is aligned in windows of ~8 min: each takes the ayat that should fit in ~70 % of it (at the
  surah's own pace), keeps all but the last, and the next window starts just after the last one kept."""
  global LAST_EM, _EM_OF, LAST_SCORE, LAST_CONF, LAST_LCONF
  if globals().get('_EM_OF') is not x: LAST_EM, _EM_OF = emissions(x), x  # same audio again: reuse
  em = LAST_EM
  T, fps = em.shape[0], SR / HOP
  if T <= WINDOW * fps * 1.3:
    ay, wd, LAST_SCORE, LAST_CONF, LAST_LCONF = _align_em(em, ayat, preamble)
    return ay, wd
  size = [sum(len(letters(w)) for w in words_of(a)) for a in ayat]
  rate = sum(size) / (T / fps)  # letters per second of recording, pauses included
  ay, wd, conf, lconf, score = [], [], [], [], 0.0
  i, f0, pre = 0, 0, list(preamble)
  while i < len(ayat):
    last = T - f0 <= WINDOW * fps * 1.3
    if last: j, f1 = len(ayat), T
    else:
      j, budget = i, 0.7 * WINDOW * rate
      while j < len(ayat) and (j < i + 2 or budget >= size[j]): budget -= size[j]; j += 1
      f1 = f0 + int(WINDOW * fps)
    a, w, sc, c, lc = _align_em(em[f0:f1], ayat[i:j], pre)
    keep = j - i if last or j == len(ayat) else max(1, j - i - 1)
    off = f0 / fps
    ay += [[s + off, e + off] for s, e in a[:keep]]
    wd += [[[s + off, e + off, *r] for s, e, *r in ws] for ws in w[:keep]]
    conf += c[:keep]; lconf += lc[:keep]; score += sc
    i += keep; pre = []
    f0 = int((ay[-1][1] - 0.1) * fps)  # just before the end of the last ayah kept: the star takes the rest
  LAST_SCORE, LAST_CONF, LAST_LCONF = score, conf, lconf
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
                    'words': [[[round(x * 1000), round(y * 1000)] for x, y, *_ in w] for w in wd]}))
