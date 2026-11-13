"""
Рендер из клуба (estate/renders) → облегчённые файлы для сайта (estate/media).

  python3 estate/blender/make_media.py            # из корня репозитория
  python3 estate/blender/make_media.py --force    # пересобрать всё заново

Что делает:
  промежуточные → посёлок 72 → 288 по кругу (шаг 1,25°, поток DIS MEDIUM, 3 досчитанных между кадрами рендера);
                  дом — 1 досчитанный между кадрами рендера в чистом секторе (шаг 3,75°, как 48 → 96; поток DIS FAST —
                  на трубах и тонких деталях на фоне леса чище, чем MEDIUM); плеер в покое всегда встаёт на кадр рендера;
  кадры облётов → три размера WebP: sm 640 px (мгновенно при свайпе, экономный режим),
                  md 1280 px (телефоны, обычные экраны), hd 1920 px (большие экраны);
  облёт дома   → только кадры чистого сектора (SECTORS ниже): сзади камера уходит в ёлки;
  подлёты      → MP4 H.264 720p и 1080p + обратные копии (для «назад»), faststart, без звука;
  manifest.json → копия рендерного + размеры, сектора, файлы.

Нужны Pillow (с WebP), opencv-python-headless, numpy и ffmpeg.
"""
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # estate/
SRC, DST = os.path.join(ROOT, 'renders'), os.path.join(ROOT, 'media')
SIZES = {'sm': (640, 60), 'md': (1280, 74), 'hd': (1920, 72)}         # ширина, качество WebP
VIDEO = {'md': (1280, 26), 'hd': (1920, 24)}                          # ширина, CRF

# Чистые сектора облёта дома: (первый, последний) кадр по ходу свайпа, через кадр 0.
# Кадры вне сектора — камера в ёлках (проверено по контактным листам и доле листвы в кадре).
SECTORS = {1: (37, 20), 2: (37, 19), 3: (40, 19), 4: (29, 10), 5: (32, 8), 6: (30, 7)}

ap = argparse.ArgumentParser()
ap.add_argument('--force', action='store_true')
A = ap.parse_args()


def fresh(dst, src):
    return not A.force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)


STEPS_V, STEPS_H = 4, 2  # кадров на шаг рендера: посёлок — рендер + 3 досчитанных, дом — рендер + 1


def flow_pair(A, B, preset=cv2.DISOPTICAL_FLOW_PRESET_MEDIUM):
    ga, gb = cv2.cvtColor(A, cv2.COLOR_BGR2GRAY), cv2.cvtColor(B, cv2.COLOR_BGR2GRAY)
    d = cv2.DISOpticalFlow_create(preset)
    return d.calc(ga, gb, None), d.calc(gb, ga, None)


def warp(img, flow):
    h, w = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, gx + flow[..., 0], gy + flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def inside(flow, margin=1.0):
    h, w = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    x, y = gx + flow[..., 0], gy + flow[..., 1]
    return ((x >= -margin) & (x <= w - 1 + margin) & (y >= -margin) & (y <= h - 1 + margin)).astype(np.float32)


def inbetween(A, B, ts, preset=cv2.DISOPTICAL_FLOW_PRESET_MEDIUM):
    """Промежуточные кадры между A и B (доли ts): поток из промежуточного кадра к A и к B (как в Super SloMo),
    смешивание с весом по согласованности прямого и обратного потока (окклюзии берутся с той стороны, где видно).
    Подбор на «экзамене» (кадры 0 и 2 → настоящий 1): PSNR посёлок 21,2 / дом 18,2 против 16,5 / 15,4 у ближайшего кадра."""
    f01, f10 = flow_pair(A, B, preset)
    e0 = np.linalg.norm(f01 + warp(f10, f01), axis=2); e1 = np.linalg.norm(f10 + warp(f01, f10), axis=2)
    out = []
    for t in ts:
        ft0 = -(1 - t) * t * f01 + t * t * f10
        ft1 = (1 - t) * (1 - t) * f01 - t * (1 - t) * f10
        wa, wb = warp(A, ft0).astype(np.float32), warp(B, ft1).astype(np.float32)
        va, vb = (1 - t) / (1 + warp(e0, ft0)), t / (1 + warp(e1, ft1))
        # у краёв кадра при повороте входит новое: точка из-за края — не берём её с этой стороны (без полос)
        va, vb = va * inside(ft0), vb * inside(ft1)
        both = (va + vb) < 1e-4
        img = (wa * va[..., None] + wb * vb[..., None]) / ((va + vb)[..., None] + 1e-6)
        img[both] = (A if t < .5 else B)[both]
        out.append(img.clip(0, 255).astype(np.uint8))
    return out


def encode(bgr, dst_dir, name, sizes):
    im = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    for size, (w, q) in SIZES.items():
        if size not in sizes:
            continue
        dst = os.path.join(dst_dir, size, name + '.webp'); os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.resize((w, round(w * im.height / im.width)), Image.LANCZOS).save(dst, 'WEBP', quality=q, method=6)


def chain(src_dir, seq, dst_dir, closed, STEPS, preset, orig_sizes, mid_sizes):
    """Кадры seq (номера рендера по порядку) → цепочка 000, 001, … (STEPS кадров на шаг рендера);
    closed — круг (последний → первый). Размеры: у кадров рендера orig_sizes, у досчитанных mid_sizes."""
    pairs = len(seq) if closed else len(seq) - 1
    total, made = pairs * STEPS + (0 if closed else 1), 0
    src = lambda k: os.path.join(src_dir, '%03d.webp' % k)
    for j in range(pairs):
        names = ['%03d' % (j * STEPS + s) for s in range(STEPS)]
        if all(fresh(os.path.join(dst_dir, 'md', n + '.webp'), src(seq[j])) for n in names):
            continue
        A, B = cv2.imread(src(seq[j])), cv2.imread(src(seq[(j + 1) % len(seq)]))
        for s, (n, img) in enumerate(zip(names, [A] + inbetween(A, B, [s / STEPS for s in range(1, STEPS)], preset))):
            encode(img, dst_dir, n, orig_sizes if s == 0 else mid_sizes); made += 1
    if not closed:
        n = '%03d' % (total - 1)
        if not fresh(os.path.join(dst_dir, 'md', n + '.webp'), src(seq[-1])):
            encode(cv2.imread(src(seq[-1])), dst_dir, n, orig_sizes); made += 1
    return total, made


def video(src, dst_base):
    for size, (w, crf) in VIDEO.items():
        for rev in (False, True):
            dst = '%s-%s%s.mp4' % (dst_base, size, '-rev' if rev else '')
            if fresh(dst, src):
                continue
            vf = 'scale=%d:-2:flags=lanczos' % w + (',reverse' if rev else '')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'slow',
                            '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '12', dst], check=True)


def sector(first, last, n):
    """Кадры сектора по ходу свайпа: first, …, n−1, 0, …, last."""
    out, k = [], first
    while True:
        out.append(k)
        if k == last:
            return out
        k = (k + 1) % n


m = json.load(open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
vo = m['village']['orbit']
n0 = vo['frames']
STEPS = STEPS_V
total, made = chain(os.path.join(SRC, 'village', 'orbit'), list(range(n0)), os.path.join(DST, 'village', 'orbit'), True,
                    STEPS, cv2.DISOPTICAL_FLOW_PRESET_MEDIUM, ('sm', 'md', 'hd'), ('md', 'hd'))
# метки — на каждый кадр учетверённого круга (линейно между кадрами рендера)
L = vo['labels']
vo['labels'] = [[[round(a[0] + (b[0] - a[0]) * s / STEPS, 4), round(a[1] + (b[1] - a[1]) * s / STEPS, 4), int(a[2] or b[2])]
                 for a, b in zip(L[k], L[(k + 1) % n0])] for k in range(n0) for s in range(STEPS)]
vo.update({'frames': total, 'stepDeg': vo['stepDeg'] / STEPS, 'originalEvery': STEPS, 'midSizes': ['md', 'hd']})
print('облёт посёлка: %d кадров, новых %d' % (total, made))
for h in m['houses']:
    i, d = h['index'], 'houses/%02d' % h['index']
    first, last = SECTORS.get(i, (0, h['orbit']['frames'] - 1))
    keep = sector(first, last, h['orbit']['frames'])
    STEPS = STEPS_H
    total, made = chain(os.path.join(SRC, d, 'orbit'), keep, os.path.join(DST, d, 'orbit'), False,
                        STEPS, cv2.DISOPTICAL_FLOW_PRESET_FAST, ('sm', 'md', 'hd'), ('sm', 'md'))
    video(os.path.join(SRC, h['approach']['file']), os.path.join(DST, d, 'approach'))
    zero = keep.index(0) * STEPS
    h['orbit'].update({'frames': total, 'zero': zero, 'min': -zero, 'max': total - 1 - zero, 'stepDeg': h['orbit']['stepDeg'] / STEPS,
                       'originalEvery': STEPS, 'midSizes': ['sm', 'md'], 'renderFrames': keep, 'pattern': d + '/orbit/{size}/{000}.webp'})
    h['orbit'].pop('sector', None)
    h['orbitFrame'] *= STEPS_V  # номер кадра облёта посёлка, откуда начинается подлёт
    h['approach'].update({'file': d + '/approach-{size}.mp4', 'reverse': d + '/approach-{size}-rev.mp4'})
    print('дом %d: кадров %d (сектор %+d…%+d), новых %d' % (i, total, h['orbit']['min'], h['orbit']['max'], made))
vo['pattern'] = 'village/orbit/{size}/{000}.webp'
m['sizes'] = {k: v[0] for k, v in SIZES.items()}
m['videoSizes'] = {k: v[0] for k, v in VIDEO.items()}
m.pop('note', None)
m['labelsNote'] = 'labels[кадр][дом] = [x, y, видно]: доли ширины/высоты кадра от левого верхнего угла'
m['village'].pop('intro', None)  # вступление — живое 3D на сайте
with open(os.path.join(DST, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(DST) for f in fs)
print('estate/media: %.1f МБ' % (total / 1e6))
