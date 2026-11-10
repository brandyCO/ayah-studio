# Speed of the Quran harakat model (ONNX, 4-bit) on this machine's CPU, 1 / 2 / 4 threads:
# seconds of compute per second of recitation. Run by .github/workflows/bench-harakat.yml on an ARM runner.
import json, sys, time, urllib.request, subprocess, os
import numpy as np, onnxruntime as ort
M = 'https://huggingface.co/mostafanewir70/quran-recitation-ctc-onnx/resolve/main/'
if not os.path.exists('m.onnx'):
    urllib.request.urlretrieve(M + 'onnx/model_q4.onnx', 'm.onnx'); urllib.request.urlretrieve(M + 'vocab.json', 'v.json')
voc = {v: k for k, v in json.load(open('v.json')).items()}
clips = []
for name in ['001002', '002255']:
    u = f'https://everyayah.com/data/Alafasy_128kbps/{name}.mp3'
    urllib.request.urlretrieve(u, name + '.mp3')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', name + '.mp3', '-ac', '1', '-ar', '16000', '-f', 'f32le', name + '.f32'], check=True)
    a = np.fromfile(name + '.f32', dtype=np.float32)
    clips.append((name, a))
print('cpu:', open('/proc/cpuinfo').read().count('processor'), 'cores;', subprocess.run(['lscpu'], capture_output=True, text=True).stdout.split('Model name:')[-1].split('\n')[0].strip())
for th in [1, 2, 4]:
    so = ort.SessionOptions(); so.intra_op_num_threads = th; so.inter_op_num_threads = 1
    s = ort.InferenceSession('m.onnx', so)
    for name, a in clips:
        for win in [10, 20]:
            seg = a[: 16000 * win] if len(a) >= 16000 * win else a
            x = ((seg - seg.mean()) / (seg.std() + 1e-7))[None, :].astype(np.float32)
            s.run(None, {'input_values': x[:, :16000]})  # warm-up
            t = time.time(); lg = s.run(None, {'input_values': x})[0][0]; dt = time.time() - t
            ids = lg.argmax(-1); out = ''; prev = -1
            for i in ids:
                if i != prev and i != 0: out += voc[i]
                prev = i
            print(f'threads {th}  {name} {len(seg)/16000:5.1f}s audio  {dt:6.2f}s compute  x{dt/(len(seg)/16000):.2f} of real time  | {out.replace("|", " ")[:60]}', flush=True)
