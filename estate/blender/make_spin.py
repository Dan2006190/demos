"""
Плавные ролики облёта для сайта — после make_media.py, из тех же кадров рендера (перерендер не нужен).

  посёлок: estate/media/village/orbit/spin-md.mp4 (1280) и spin-hd.mp4 (1920) — круг по кадрам рендера с досчётом до 18 кадров на шаг 2,5°
           (25 к/с ≈ 3,5°/с — скорость автовращения сайта); длинная группа кадров — играется подряд, по кругу
  дом:     только с --houses и только если облёты домов отрендерены с шагом 2,5°: при шаге 7,5° досчёт между
           близким домом и далёким лесом ломается (рваные трубы, мусор на крыше). Без ролика сайт показывает
           облёт дома настоящими кадрами рендера, без смешивания

В manifest.json (media) добавляется orbit.spin = {file, per, fps}: per — кадров ролика на один кадр облёта сайта.
Досчёт тот же, что в make_media.py (поток DIS, каждая точка с надёжной стороны), считается в 1920×1080.

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
ap.add_argument('--houses', action='store_true', help='ролики облёта домов (только если облёты домов отрендерены с шагом 2,5°)')
ARGS = ap.parse_args()
W, H, FPS = 1920, 1080, 25
SIZES_V = {'md': (1280, 27), 'hd': (1920, 27)}   # телефон и обычный экран / большой экран (~19 и ~50 МБ)
PER_V, PER_H = 18, 8          # кадров ролика на шаг рендера: посёлок 2,5° → 18 (25 к/с ≈ 3,5°/с, круг за 100 с), дом 7,5° → 8


def spin(paths, closed, per, dst, gop, crf):
    """paths — кадры рендера по порядку; между соседними per−1 досчитанных; closed — по кругу.
    dst — шаблон с {size}; crf — {размер: (ширина, crf)}: досчёт один раз в полном размере, кодируется во все размеры."""
    outs = {k: dst.replace('{size}', k) for k in crf}
    if not ARGS.force and all(os.path.exists(o) and os.path.getmtime(o) >= max(os.path.getmtime(p) for p in paths) for o in outs.values()):
        return None
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ffs = [subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', '%dx%d' % (W, H), '-r', str(FPS),
                             '-i', '-', '-an', '-vf', 'scale=%d:-2:flags=lanczos' % w, '-c:v', 'libx264', '-preset', 'slow', '-crf', str(q),
                             '-tune', 'film', '-pix_fmt', 'yuv420p', '-g', str(gop), '-keyint_min', str(gop), '-sc_threshold', '0',
                             '-movflags', '+faststart', outs[k]], stdin=subprocess.PIPE) for k, (w, q) in crf.items()]

    class _Tee:
        def __init__(self): self.stdin = self
        def write(self, b):
            for f in ffs: f.stdin.write(b)
        def close(self):
            for f in ffs: f.stdin.close()
        def wait(self):
            for f in ffs: f.wait()
        returncode = property(lambda self: max(f.returncode or 0 for f in ffs))
    ff = _Tee()
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
         os.path.join(DST, 'village', 'orbit', 'spin-{size}.mp4'), gop=FPS * 2, crf=SIZES_V)
m['village']['orbit']['spin'] = {'file': 'village/orbit/spin-{size}.mp4', 'per': PER_V / STEPS_V, 'fps': FPS}
old = os.path.join(DST, 'village', 'orbit', 'spin.mp4')
if os.path.exists(old): os.remove(old)  # прежний ролик одного размера (1280)
print('посёлок: ролик', 'без изменений' if r is None else '%d кадров, %.0f с' % (r, r / FPS),
      ', '.join('%s %.1f МБ' % (k, os.path.getsize(os.path.join(DST, 'village', 'orbit', 'spin-%s.mp4' % k)) / 1e6) for k in SIZES_V))
for h, sh in (zip(m['houses'], src_m['houses']) if ARGS.houses else []):  # при шаге 7,5° досчёт ломается (лес ↔ дом) — не делаем
    i, d = h['index'], 'houses/%02d' % h['index']
    first, last = SECTORS.get(i, (0, sh['orbit']['frames'] - 1))
    keep = sector(first, last, sh['orbit']['frames'])
    dst = os.path.join(DST, d, 'orbit', 'spin.mp4')
    r = spin([os.path.join(SRC, d, 'orbit', '%03d.webp' % k) for k in keep], False, PER_H, dst.replace('spin.mp4', 'spin-{size}.mp4'), gop=4, crf={'md': (1280, 24), 'hd': (1920, 22)})
    h['orbit']['spin'] = {'file': d + '/orbit/spin-{size}.mp4', 'per': PER_H / STEPS_H, 'fps': FPS}
    print('дом %d: ролик' % i, 'без изменений' if r is None else '%d кадров' % r)
with open(mpath, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
