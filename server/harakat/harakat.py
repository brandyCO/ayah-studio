# The harakat check (pure: numpy + onnxruntime, no web code). A recited part (16 kHz mono) is run through a
# Quran-trained CTC model (rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final, Apache-2.0, as the 4-bit ONNX
# export mostafanewir70/quran-recitation-ctc-onnx). Its own reading gives the heard text (letters only are
# used by the app to follow the words). For the words that were said, the audio is then lined up with their
# exact harakat (CTC Viterbi), and each haraka is checked against the other harakat at the same moment: a word
# is flagged when, for one of its harakat, the model is far more sure of another one (FLAG). Tested on 8 long
# ayat x 2 professional reciters with one haraka changed in the text: 97% caught, 1% of correct words flagged.
# The Quran text is only read, never changed.
import json, os, re, unicodedata
import numpy as np
from follow import follow, letter_forms

HERE = os.path.dirname(os.path.abspath(__file__))
FLAG = float(os.environ.get('HARAKAT_FLAG', '-6'))
WINDOW = 16000 * 20  # the model runs on at most 20 s at a time

V = json.load(open(os.path.join(HERE, 'vocab.json'), encoding='utf-8'))
VOC = {v: k for k, v in V.items()}
BLANK = V['<pad>']
SEP = V['|']
HK = [V[c] for c in 'َُِْ' + 'ًٌٍ']  # the harakat compared with each other (fatha, damma, kasra, sukun, tanween)
TANWEEN_OPEN = {'ٞ': 'ٌ', 'ٖ': 'ٍ', 'ٗ': 'ً'}  # the mushaf's open tanween = tanween


def model_form(w: str) -> str:
    """An Uthmani word in the model's own writing (its letters and harakat, in its order)."""
    for a, b in TANWEEN_OPEN.items():
        w = w.replace(a, b)
    w = w.replace('ۡ', 'ْ').replace('ٱ', 'ا')
    w = re.sub('[ۖ-ۭ۟۠ۢۥۦ٠-٩ـٓ]', '', w)
    w = unicodedata.normalize('NFC', w)
    w = re.sub('([ًٌٍَُِ])ّ', 'ّ\\1', w)  # the model writes the shadda before the haraka
    return ''.join(c for c in w if c in V)


class Model:
    def __init__(self, path=os.path.join(HERE, 'model.onnx'), threads=None):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads or int(os.environ.get('THREADS', '0')) or os.cpu_count() or 2
        so.inter_op_num_threads = 1
        self.s = ort.InferenceSession(path, so, providers=['CPUExecutionProvider'])
        self.name = self.s.get_inputs()[0].name

    def logp(self, a: np.ndarray) -> np.ndarray:
        """Frame-wise log-probabilities (T x V), 20 ms a frame."""
        out = []
        for i in range(0, len(a), WINDOW):
            c = a[i:i + WINDOW]
            if len(c) < 1600:
                continue
            c = ((c - c.mean()) / (c.std() + 1e-7)).astype(np.float32)
            lg = self.s.run(None, {self.name: c[None, :]})[0][0]
            lg = lg - lg.max(-1, keepdims=True)
            out.append(lg - np.log(np.exp(lg).sum(-1, keepdims=True)))
        return np.concatenate(out) if out else np.zeros((0, len(V)), dtype=np.float32)


def greedy(lp: np.ndarray) -> str:
    ids = lp.argmax(-1)
    out, prev = [], -1
    for i in ids:
        if i != prev and i != BLANK:
            out.append(VOC[int(i)])
        prev = i
    return ''.join(out).replace('|', ' ').strip()


FREE = float(os.environ.get('HARAKAT_FREE', '-1'))  # cost a frame of audio outside the words (log-prob)


def align(lp: np.ndarray, toks: list[int]):
    """CTC Viterbi path over the blank-interleaved tokens, with free audio allowed before and after them (a
    breath, a repeated word, the start of the next ayah). Returns (tokens with blanks, ext index per frame,
    -1 for free audio)."""
    ext = [BLANK]
    for t in toks:
        ext += [t, BLANK]
    ext = np.array(ext)
    L, T, NEG = len(ext), len(lp), -1e9
    if T < (L - 1) // 2:
        return ext, None
    S = L + 2  # 0: free before, 1..L: ext, L+1: free after
    em = np.empty((T, S), dtype=np.float64)
    em[:, 0] = FREE; em[:, S - 1] = FREE; em[:, 1:S - 1] = lp[:, ext]
    two = np.zeros(S, dtype=bool)  # may skip one state (s - 2 -> s)
    for st in range(2, S):
        if st == 2 or st == S - 1:
            two[st] = True
        elif st <= L:
            e = ext[st - 1]
            two[st] = e != BLANK and e != ext[st - 3]
    d = np.full(S, NEG); d[0] = em[0, 0]; d[1] = em[0, 1]; d[2] = em[0, 2]
    bp = np.zeros((T, S), dtype=np.int8)
    for t in range(1, T):
        c1 = np.r_[NEG, d[:-1]]
        c2 = np.where(two, np.r_[NEG, NEG, d[:-2]], NEG)
        stk = np.stack([d, c1, c2])
        k = stk.argmax(0)
        bp[t] = k
        d = stk.max(0) + em[t]
    s = int(np.argmax([d[S - 1], d[S - 2], d[S - 3]]))
    s = [S - 1, S - 2, S - 3][s]
    path = np.zeros(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s - 1 if 1 <= s <= L else -1
        s -= int(bp[t, s])
    return ext, path


def harakat_scores(lp: np.ndarray, words: list[str]) -> list[float | None]:
    """Per word: the weakest of its harakat (expected haraka minus the strongest other haraka, at its best
    moment). Below FLAG = said with another haraka. None: nothing to check (no harakat, or no audio)."""
    forms = [model_form(w) for w in words]
    toks, owner = [], []
    for wi, f in enumerate(forms):
        for c in f:
            toks.append(V[c]); owner.append(wi)
        if wi < len(forms) - 1:
            toks.append(SEP); owner.append(-1)
    if not toks or not len(lp):
        return [None] * len(words)
    ext, path = align(lp, toks)
    if path is None:
        return [None] * len(words)
    best = np.full(len(toks), -99.0)
    for t, st in enumerate(path):
        if st >= 0 and st % 2 == 1:
            j = (st - 1) // 2
            tk = int(ext[st])
            if tk not in HK:
                continue
            other = max(lp[t, o] for o in HK if o != tk)
            best[j] = max(best[j], lp[t, tk] - other)
    out: list[float | None] = [None] * len(words)
    for j, wi in enumerate(owner):
        if wi >= 0 and toks[j] in HK and best[j] > -99:
            out[wi] = float(best[j]) if out[wi] is None else min(out[wi], float(best[j]))
    return out


def check(model: Model, pcm16: bytes, words: list[str]) -> dict:
    """One recited part, `words` = the text from where the reciter is (as the app has it). Returns the heard
    text, the words said / skipped / said differently (as the app's own matching finds them) and, of the
    words said, those said with another haraka (`flags`). Indices are into `words`."""
    a = np.frombuffer(pcm16, dtype='<i2').astype(np.float32) / 32768.0
    lp = model.logp(a)
    heard = greedy(lp)
    keep = [i for i, w in enumerate(words) if letter_forms(w)[0]]
    r = follow([letter_forms(words[i]) for i in keep], 0, heard)
    said = [keep[i] for i in r['said']]
    # the audio is lined up with the words actually recited (said, or said differently), in order
    run = sorted(said + [keep[i] for i in r['wrong']])
    scores = dict(zip(run, harakat_scores(lp, [words[i] for i in run]))) if run else {}
    flags = [i for i in said if scores.get(i) is not None and scores[i] < FLAG]
    return {
        'heard': heard,
        'said': said, 'skipped': [keep[i] for i in r['skipped']], 'wrong': [keep[i] for i in r['wrong']],
        'flags': flags,
        'scores': {str(i): round(scores[i], 2) for i in said if scores.get(i) is not None},
        'seconds': round(len(a) / 16000, 2),
    }
