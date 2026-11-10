# Which words of the text a recited part said: a port of src/engine/follow.ts (keep the two the same), so the
# server finds the same words as the app before checking their harakat. Bare letters only; the Quran text is
# only read, never changed.
import re, unicodedata


def _base(w: str, d: str) -> str:
    w = w.replace('ٰ', d)
    w = re.sub('[ٱأإآٲٳ]', 'ا', w)
    w = re.sub('[ىیۍ]', 'ي', w)
    w = w.replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي').replace('ک', 'ك')
    w = unicodedata.normalize('NFD', w)
    w = re.sub('[^ء-ي]', '', w)
    return w.replace('ء', '')


def letter_forms(w: str) -> list[str]:
    a, b = _base(w, ''), _base(w, 'ا')
    return [a] if a == b else [a, b]


def _lev(a: str, b: str) -> int:
    if a == b:
        return 0
    row = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev = row[0]; row[0] = i
        for j in range(1, len(b) + 1):
            cur = row[j]
            row[j] = min(row[j] + 1, row[j - 1] + 1, prev + (0 if a[i - 1] == b[j - 1] else 1))
            prev = cur
    return row[len(b)]


def likeness(forms: list[str], heard: str) -> float:
    best = 0.0
    for f in forms:
        if not f or not heard:
            continue
        best = max(best, 1 - _lev(f, heard) / max(len(f), len(heard)))
    return best


LOOK = 5
CLEAR = 0.75


def _need(off: int, n: int) -> float:
    return (0.5 if n <= 2 else 0.6) if off == 0 else (2 if n < 3 else 0.8)


def follow(forms: list[list[str]], start: int, heard_text: str) -> dict:
    """forms: each word's letter forms (words without letters left out, as followWords does)."""
    heard = [x for x in (letter_forms(t)[0] for t in heard_text.split()) if x]
    said, skipped, wrong = [], [], []
    c, j, junk, near = start, 0, 0, False
    while j < len(heard) and c < len(forms):
        best = None
        for off in range(LOOK):
            if c + off >= len(forms):
                break
            w = forms[c + off]
            n = len(w[0])
            for take in (1, 2):
                if j + take > len(heard):
                    continue
                sim = likeness(w, ''.join(heard[j:j + take]))
                if off == 0 and sim >= _need(0, n):
                    near = True
                if sim >= _need(off, n):
                    score = sim - off * 0.08 - (take - 1) * 0.03
                    if not best or score > best[3]:
                        best = (off, take, 1, score, sim)
            if c + off + 1 < len(forms):
                two = [a + b for a in forms[c + off] for b in forms[c + off + 1]]
                sim = likeness(two, heard[j])
                if sim >= _need(off, 6) and sim > 0.75:
                    score = sim - off * 0.08 - 0.03
                    if not best or score > best[3]:
                        best = (off, 1, 2, score, sim)
        if not best:
            j += 1; junk += 1
            continue
        off, take, span, _, sim = best
        for k in range(off):
            (wrong if k < junk or (k == 0 and near) else skipped).append(c + k)
        bad = len(forms[c + off][0]) > 2 and sim < CLEAR
        for k in range(span):
            (wrong if bad else said).append(c + off + k)
        junk, near = 0, False
        c += off + span
        j += take
    return {'cursor': c, 'said': said, 'skipped': skipped, 'wrong': wrong}
