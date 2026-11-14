"""
Плавные ролики облёта для сайта — после make_media.py, из тех же кадров рендера (перерендер не нужен).

  посёлок: estate/media/village/orbit/spin.mp4 — круг по кадрам рендера с досчётом до 24 кадров на шаг 2,5°
           (25 к/с ≈ скорость автовращения сайта); длинная группа кадров — играется подряд, по кругу
  дом:     estate/media/houses/NN/orbit/spin.mp4 — сектор с досчётом до 8 кадров на шаг 7,5° (~0,94°/кадр);
           ключевой кадр каждые 4 — сайт перематывает его пальцем без задержек

В manifest.json (media) добавляется orbit.spin = {file, per, fps}: per — кадров ролика на один кадр облёта сайта.
Досчёт тот же, что в make_media.py (поток DIS, каждая точка с надёжной стороны), считается в 1280×720.

  pip install pillow opencv-python-headless numpy   +   ffmpeg в PATH
  python3 estate/blender/make_spin.py [--force]
"""
import argparse
import json
import os
import subprocess

import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ns = {'__file__': os.path.join(HERE, 'make_media.py')}
_src = open(ns['__file__'], encoding='utf-8').read()
exec(compile(_src[:_src.index('\ndef encode')].replace('A = ap.parse_args()', 'A = ap.parse_args([])'), ns['__file__'], 'exec'), ns)
inbetween, SRC, DST, SECTORS, STEPS_V, STEPS_H = (ns[k] for k in ('inbetween', 'SRC', 'DST', 'SECTORS', 'STEPS_V', 'STEPS_H'))


def sector(first, last, n):
    """кадры сектора по ходу свайпа: first, …, n−1, 0, …, last (как в make_media.py)"""
    out, k = [], first
    while True:
        out.append(k)
        if k == last:
            return out
        k = (k + 1) % n

ap = argparse.ArgumentParser()
ap.add_argument('--force', action='store_true')
ARGS = ap.parse_args()
W, H, FPS = 1280, 720, 25
PER_V, PER_H = 24, 8          # кадров ролика на шаг рендера: посёлок 2,5° → 24, дом 7,5° → 8


def spin(paths, closed, per, dst, gop, crf):
    """paths — кадры рендера по порядку; между соседними per−1 досчитанных; closed — по кругу."""
    if not ARGS.force and os.path.exists(dst) and os.path.getmtime(dst) >= max(os.path.getmtime(p) for p in paths):
        return None
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', '%dx%d' % (W, H), '-r', str(FPS),
                           '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p',
                           '-g', str(gop), '-keyint_min', str(gop), '-sc_threshold', '0', '-movflags', '+faststart', dst],
                          stdin=subprocess.PIPE)
    load = lambda p: cv2.resize(cv2.imread(p), (W, H), interpolation=cv2.INTER_AREA)
    n, pairs, frames = len(paths), len(paths) if closed else len(paths) - 1, 0
    B = load(paths[0])
    for j in range(pairs):
        A, B = B, load(paths[(j + 1) % n])
        for img in [A] + inbetween(A, B, [s / per for s in range(1, per)], cv2.DISOPTICAL_FLOW_PRESET_MEDIUM):
            ff.stdin.write(img.tobytes()); frames += 1
    if not closed:
        ff.stdin.write(B.tobytes()); frames += 1
    ff.stdin.close(); ff.wait()
    if ff.returncode:
        raise SystemExit('ffmpeg: ошибка на ' + dst)
    return frames


mpath = os.path.join(DST, 'manifest.json')
m = json.load(open(mpath, encoding='utf-8'))
src_m = json.load(open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
n0 = src_m['village']['orbit']['frames']
r = spin([os.path.join(SRC, 'village', 'orbit', '%03d.webp' % k) for k in range(n0)], True, PER_V,
         os.path.join(DST, 'village', 'orbit', 'spin.mp4'), gop=FPS * 2, crf=27)
m['village']['orbit']['spin'] = {'file': 'village/orbit/spin.mp4', 'per': PER_V / STEPS_V, 'fps': FPS}
print('посёлок: ролик', 'без изменений' if r is None else '%d кадров, %.0f с' % (r, r / FPS),
      '%.1f МБ' % (os.path.getsize(os.path.join(DST, 'village', 'orbit', 'spin.mp4')) / 1e6))
for h, sh in zip(m['houses'], src_m['houses']):
    i, d = h['index'], 'houses/%02d' % h['index']
    first, last = SECTORS.get(i, (0, sh['orbit']['frames'] - 1))
    keep = sector(first, last, sh['orbit']['frames'])
    dst = os.path.join(DST, d, 'orbit', 'spin.mp4')
    r = spin([os.path.join(SRC, d, 'orbit', '%03d.webp' % k) for k in keep], False, PER_H, dst, gop=4, crf=28)
    h['orbit']['spin'] = {'file': d + '/orbit/spin.mp4', 'per': PER_H / STEPS_H, 'fps': FPS}
    print('дом %d: ролик' % i, 'без изменений' if r is None else '%d кадров' % r, '%.1f МБ' % (os.path.getsize(dst) / 1e6))
with open(mpath, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
