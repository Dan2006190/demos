"""
Рендер из клуба (estate/renders) → облегчённые файлы для сайта (estate/media).

  python3 estate/blender/make_media.py            # из корня репозитория
  python3 estate/blender/make_media.py --force    # пересобрать всё заново

Что делает:
  кадры облётов → три размера WebP: sm 640 px (мгновенно при свайпе, экономный режим),
                  md 1280 px (телефоны, обычные экраны), hd 1920 px (большие экраны);
  облёт дома   → только кадры чистого сектора (SECTORS ниже): сзади камера уходит в ёлки;
  подлёты      → MP4 H.264 720p и 1080p + обратные копии (для «назад»), faststart, без звука;
  manifest.json → копия рендерного + размеры, сектора, файлы.

Нужны Pillow (с WebP) и ffmpeg.
"""
import argparse
import json
import os
import subprocess
import sys

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


def frames(src_dir, names, dst_dir):
    done = 0
    for name in names:
        src = os.path.join(src_dir, name + '.webp')
        im = None
        for size, (w, q) in SIZES.items():
            dst = os.path.join(dst_dir, size, name + '.webp')
            if fresh(dst, src):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im = im or Image.open(src).convert('RGB')
            im.resize((w, round(w * im.height / im.width)), Image.LANCZOS).save(dst, 'WEBP', quality=q, method=6)
            done += 1
    return done


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
n = frames(os.path.join(SRC, 'village', 'orbit'), ['%03d' % k for k in range(vo['frames'])], os.path.join(DST, 'village', 'orbit'))
print('облёт посёлка: %d новых файлов' % n)
for h in m['houses']:
    i, d = h['index'], 'houses/%02d' % h['index']
    first, last = SECTORS.get(i, (0, h['orbit']['frames'] - 1))
    keep = sector(first, last, h['orbit']['frames'])
    n = frames(os.path.join(SRC, d, 'orbit'), ['%03d' % k for k in keep], os.path.join(DST, d, 'orbit'))
    video(os.path.join(SRC, h['approach']['file']), os.path.join(DST, d, 'approach'))
    h['orbit'].update({'sector': keep, 'min': -keep.index(0), 'max': len(keep) - 1 - keep.index(0), 'pattern': d + '/orbit/{size}/{000}.webp'})
    h['approach'].update({'file': d + '/approach-{size}.mp4', 'reverse': d + '/approach-{size}-rev.mp4'})
    print('дом %d: кадров %d (сектор %+d…%+d), новых файлов %d' % (i, len(keep), h['orbit']['min'], h['orbit']['max'], n))
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
