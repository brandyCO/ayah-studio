"""One-off: generate the kid-friendly backgrounds (docs/kids.md K5; original, procedurally generated).

Soft pastel skies only — a moon over hills, pale dunes at dawn, slow clouds. No people, faces,
animals, characters, text or symbols (rule 4). The cloud loop is seamless: every motion is periodic in
the loop length. Run: python3 scripts/make-kid-backgrounds.py  (needs numpy, Pillow, ffmpeg)
"""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'backgrounds'
rng = np.random.default_rng(11)
W, H = 1080, 1920
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def lerp_stops(t, stops):
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        f = ((t[m] - p0) / (p1 - p0))[:, None]
        out[m] = np.array(c0) * (1 - f) + np.array(c1) * f
    return out


def save(arr, name):
    arr = arr + rng.normal(0, 1.2, arr.shape)  # fine grain against banding
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    im.save(OUT / name, quality=88, optimize=True, progressive=True)
    im.resize((216, 384), Image.LANCZOS).save(OUT / name.replace('.jpg', '-thumb.jpg'), quality=82, optimize=True)


def hills(img, layers, y=yy, x=xx, w=W, h=H, blur=2):
    for i, (base, amp, freq, phase, col) in enumerate(layers):
        xr = x[0] / w
        ridge = (base + amp * np.sin(2 * np.pi * freq * xr + phase) + 0.01 * np.sin(2 * np.pi * 3.1 * xr + i)) * h
        mask = (y > ridge[None, :]).astype(np.float32)
        mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)), np.float32)[..., None] / 255
        shade = np.array(col, np.float32) * (1 - 0.12 * np.clip((y - ridge[None, :]) / (0.2 * h), 0, 1))[..., None]
        img = img * (1 - mask) + shade * mask
    return img


def glow_disc(img, cx, cy, r, col, halo, strength):
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    disc = np.clip((r - d) / 3 + 0.5, 0, 1)[..., None]
    g = np.exp(-((d / halo) ** 2))[..., None] * strength
    img = img + g * np.array(col, np.float32)
    return img * (1 - disc) + np.array(col, np.float32) * disc


# 1) Moon garden: lavender night, a big soft moon, faint stars, rolling mint hills.
img = lerp_stops(yy / H, [(0, (92, 92, 150)), (0.42, (160, 148, 204)), (0.66, (232, 194, 206)), (1, (240, 210, 200))])
stars = np.zeros((H, W), np.float32)
n = 260
sx, sy = rng.integers(0, W, n), rng.integers(0, int(H * 0.5), n)
stars[sy, sx] = rng.uniform(0.3, 1.0, n) ** 2 * 200
img = img + np.asarray(Image.fromarray(stars.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.4)), np.float32)[..., None] * 1.6
img = glow_disc(img, 0.66 * W, 0.27 * H, 150, (255, 246, 222), 420, 0.35)
img = hills(img, [(0.70, 0.03, 0.8, 0.6, (172, 206, 190)), (0.77, 0.035, 1.2, 2.4, (138, 184, 170)), (0.86, 0.03, 0.7, 4.2, (108, 158, 150))], blur=3)
save(img, 'kid-moon.jpg')

# 2) Desert dawn: pale blue to peach sky, a soft pale sun, pastel dunes.
img = lerp_stops(yy / H, [(0, (176, 206, 234)), (0.38, (214, 216, 236)), (0.6, (250, 214, 196)), (1, (248, 200, 172))])
img = glow_disc(img, 0.32 * W, 0.58 * H, 95, (255, 240, 214), 240, 0.18)
img = hills(img, [(0.64, 0.04, 0.9, 1.2, (242, 204, 166)), (0.73, 0.045, 0.6, 3.0, (232, 184, 146)), (0.85, 0.035, 1.1, 5.0, (214, 160, 128))], blur=3)
save(img, 'kid-dunes.jpg')


# 3) Soft clouds: a pastel sky with clouds drifting slowly to the left (each wraps once per loop).
def encode(name, frames_fn, n, w, h, fps=30):
    p = subprocess.Popen([
        'ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(fps),
        '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
        '-g', str(fps), '-movflags', '+faststart', '-an', str(OUT / name)], stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(np.clip(frames_fn(i / n), 0, 255).astype(np.uint8).tobytes())
    p.stdin.close()
    p.wait()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(OUT / name), '-c:v', 'libvpx-vp9', '-b:v', '0',
                    '-crf', '36', '-row-mt', '1', '-g', str(fps), '-pix_fmt', 'yuv420p', '-an',
                    str(OUT / name.replace('.mp4', '.webm'))], check=True)


VW, VH, N = 540, 960, 360  # 12 s at 30 fps
vy, vx = np.mgrid[0:VH, 0:VW].astype(np.float32)
sky = lerp_stops(vy / VH, [(0, (150, 190, 232)), (0.5, (204, 210, 240)), (1, (246, 208, 214))])
sm_y, sm_x = np.mgrid[0:VH // 4, 0:VW // 4].astype(np.float32) * 4
C = 22
c_x = rng.uniform(0, VW, C); c_y = rng.uniform(0.08, 0.9, C) * VH
c_w = rng.uniform(90, 190, C); c_h = c_w * rng.uniform(0.32, 0.45, C); c_a = rng.uniform(0.55, 0.9, C)
puffs = [[(rng.uniform(-0.7, 0.7), rng.uniform(-0.25, 0.15), rng.uniform(0.45, 0.8)) for _ in range(5)] for _ in range(C)]
SPAN = VW + 400


def clouds(t):
    acc = np.zeros(sm_y.shape, np.float32)
    for i in range(C):
        cx = (c_x[i] - SPAN * t) % SPAN - 200
        for ox, oy, s in puffs[i]:
            px, py, r = cx + ox * c_w[i], c_y[i] + oy * c_h[i] * 2, c_h[i] * s * 1.6
            acc = np.maximum(acc, c_a[i] * np.exp(-(((sm_x - px) / (r * 1.4)) ** 2 + ((sm_y - py) / r) ** 2)))
    up = np.asarray(Image.fromarray(np.clip(acc * 255, 0, 255).astype(np.uint8)).resize((VW, VH), Image.BICUBIC), np.float32)[..., None] / 255
    return sky * (1 - up * 0.85) + np.array([255, 250, 250], np.float32) * up * 0.85


encode('kid-clouds-loop.mp4', clouds, N, VW, VH)
Image.fromarray(np.clip(clouds(0), 0, 255).astype(np.uint8)).resize((216, 384), Image.LANCZOS).save(OUT / 'kid-clouds-loop-thumb.jpg', quality=82)
print('done')
