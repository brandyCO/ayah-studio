"""One-off: generate the default background set (original, procedurally generated artwork).

Calm abstract scenes only — no people, faces, text or symbols. Videos loop seamlessly because every
motion is periodic in the loop length. Run: python3 scripts/make-backgrounds.py  (needs numpy, Pillow, ffmpeg)
"""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'backgrounds'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def lerp_stops(t, stops):
    """t: array in [0,1]; stops: list of (pos, (r,g,b)). Returns (...,3) float array."""
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        f = ((t[m] - p0) / (p1 - p0))[:, None]
        out[m] = np.array(c0) * (1 - f) + np.array(c1) * f
    return out


def save_jpg(arr, name):
    arr = arr + rng.normal(0, 1.2, arr.shape)  # fine grain against banding
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(OUT / name, quality=88, optimize=True, progressive=True)


W, H = 1080, 1920
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

# 1) Desert dusk: sky gradient + layered dune silhouettes.
sky = lerp_stops(yy / H, [(0, (22, 26, 58)), (0.45, (86, 62, 104)), (0.68, (196, 128, 104)), (1, (236, 178, 120))])
img = sky
for i, (base, amp, freq, phase, col) in enumerate([
    (0.70, 0.035, 1.3, 0.4, (120, 72, 70)),
    (0.78, 0.040, 0.9, 2.1, (82, 48, 56)),
    (0.88, 0.030, 1.6, 4.0, (44, 28, 40)),
]):
    x = xx[0] / W
    ridge = (base + amp * np.sin(2 * np.pi * freq * x + phase) + 0.012 * np.sin(2 * np.pi * 3.7 * x + i)) * H
    mask = (yy > ridge[None, :]).astype(np.float32)
    mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
    shade = np.array(col, np.float32) * (1 - 0.25 * np.clip((yy - ridge[None, :]) / (0.2 * H), 0, 1))[..., None]
    img = img * (1 - mask) + shade * mask
save_jpg(img, 'dusk-dunes.jpg')

# 2) Night sky: deep gradient, soft glow band, seeded stars.
img = lerp_stops(yy / H, [(0, (6, 10, 28)), (0.6, (14, 24, 54)), (1, (28, 40, 72))])
band = np.exp(-(((xx - 0.35 * W) * 0.8 + (yy - 0.5 * H) * 0.45) / (0.16 * W)) ** 2)[..., None]
img = img + band * np.array([30, 34, 52], np.float32)
stars = np.zeros((H, W), np.float32)
n = 900
sx, sy = rng.integers(0, W, n), rng.integers(0, H, n)
stars[sy, sx] = rng.uniform(0.25, 1.0, n) ** 3 * 255
glow = np.asarray(Image.fromarray(np.clip(stars, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32)
img = img + (stars * 0.7 + glow * 2.2)[..., None] * np.array([1, 1, 1.05], np.float32)[None, None, :]
save_jpg(img, 'night-sky.jpg')


def encode(name, frames_fn, n, w, h, fps=30):
    p = subprocess.Popen([
        'ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(fps),
        '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
        '-g', str(fps), '-movflags', '+faststart', '-an', str(OUT / name)], stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(np.clip(frames_fn(i / n), 0, 255).astype(np.uint8).tobytes())
    p.stdin.close()
    p.wait()
    # VP9/WebM copy for browsers without an H.264 decoder (e.g. open-source Chromium builds).
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(OUT / name), '-c:v', 'libvpx-vp9', '-b:v', '0',
                    '-crf', '36', '-row-mt', '1', '-g', str(fps), '-pix_fmt', 'yuv420p', '-an',
                    str(OUT / name.replace('.mp4', '.webm'))], check=True)


VW, VH, N = 540, 960, 360  # 12 s at 30 fps
vy, vx = np.mgrid[0:VH, 0:VW].astype(np.float32)

# 3) Mist: slow drifting colour clouds over a deep teal gradient.
mist_base = lerp_stops(vy / VH, [(0, (8, 30, 40)), (0.5, (14, 46, 58)), (1, (10, 26, 44))])
blobs = [((0.3, 0.3), 0.18, 0.28, 1, 0.0, (40, 90, 100)), ((0.7, 0.55), 0.2, 0.32, 1, 1.7, (60, 70, 110)),
         ((0.45, 0.8), 0.16, 0.26, 2, 3.1, (30, 80, 80)), ((0.6, 0.15), 0.14, 0.22, 1, 4.4, (70, 90, 120))]
sm_y, sm_x = np.mgrid[0:VH // 4, 0:VW // 4].astype(np.float32) * 4


def mist(t):
    acc = np.zeros(sm_y.shape + (3,), np.float32)
    for (cx, cy), r, rad, k, ph, col in blobs:
        a = 2 * np.pi * k * t + ph
        px, py = (cx + r * 0.35 * np.cos(a)) * VW, (cy + r * 0.25 * np.sin(a)) * VH
        g = np.exp(-(((sm_x - px) ** 2 + (sm_y - py) ** 2) / (rad * VW) ** 2))
        acc += g[..., None] * np.array(col, np.float32) * (0.75 + 0.25 * np.sin(a * 2))
    up = np.asarray(Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8)).resize((VW, VH), Image.BICUBIC), np.float32)
    return mist_base + up * 0.9


encode('mist-loop.mp4', mist, N, VW, VH)

# 4) Light motes: soft points of light rising slowly over a dark gradient (each wraps an integer number of times).
motes_base = lerp_stops(vy / VH, [(0, (10, 12, 30)), (0.55, (24, 20, 46)), (1, (46, 30, 52))])
M = 46
m_x = rng.uniform(0, VW, M); m_y = rng.uniform(0, VH, M)
m_k = rng.integers(1, 3, M); m_r = rng.uniform(3, 11, M); m_a = rng.uniform(0.25, 0.9, M)
m_sw = rng.uniform(6, 22, M); m_ph = rng.uniform(0, 2 * np.pi, M)
col = np.array([255, 214, 160], np.float32)


def motes(t):
    img = motes_base.copy()
    for i in range(M):
        y = (m_y[i] - m_k[i] * (VH + 60) * t) % (VH + 60) - 30
        x = m_x[i] + m_sw[i] * np.sin(2 * np.pi * t + m_ph[i])
        R = int(m_r[i] * 4)
        x0, x1, y0, y1 = int(max(0, x - R)), int(min(VW, x + R)), int(max(0, y - R)), int(min(VH, y + R))
        if x0 >= x1 or y0 >= y1:
            continue
        gx, gy = vx[y0:y1, x0:x1], vy[y0:y1, x0:x1]
        tw = 0.8 + 0.2 * np.sin(2 * np.pi * 2 * t + m_ph[i])
        g = np.exp(-((gx - x) ** 2 + (gy - y) ** 2) / (2 * m_r[i] ** 2)) * m_a[i] * tw
        img[y0:y1, x0:x1] += g[..., None] * col * 0.8
    return img


encode('motes-loop.mp4', motes, N, VW, VH)
print('done')
