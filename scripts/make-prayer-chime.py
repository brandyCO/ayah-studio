# Writes the soft chime for prayer reminders (android/app/src/main/res/raw/prayer_chime.wav):
# two bell-like notes made from a few decaying partials, nothing recorded. Notification sound only;
# exported reels never carry any sound but the recitation (rule 3).
import wave
import numpy as np

RATE = 22050
def bell(freq, start, length, total):
    t = np.arange(int(length * RATE)) / RATE
    tone = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t * d)
               for m, a, d in [(1, 1.0, 2.2), (2.01, 0.35, 3.5), (3.0, 0.12, 5.0), (4.2, 0.05, 7.0)])
    attack = np.minimum(1, t / 0.012)
    out = np.zeros(total)
    i = int(start * RATE)
    out[i:i + len(t)] += (tone * attack)[: total - i]
    return out

total = int(2.6 * RATE)
mix = bell(659.25, 0.0, 2.6, total) * 0.8 + bell(493.88, 0.42, 2.18, total) * 0.7
mix = mix / np.abs(mix).max() * 0.6
fade = np.ones(total)
fade[-int(0.3 * RATE):] = np.linspace(1, 0, int(0.3 * RATE))
pcm = (mix * fade * 32767).astype('<i2')
with wave.open('android/app/src/main/res/raw/prayer_chime.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())
