"""
Собирает пакет для рендера на чужом ПК: arden-v2.zip (папка arden: bat-файлы, скрипты, сцена, машины).
Blender — установленный (blender.org, 4.5 LTS) или папка blender рядом; ассеты Poly Haven скрипт докачивает сам.

  python3 estate/blender/build_package.py СЦЕНА ВЫХОД.zip [--full]
  --full — как для клуба: вложить все ассеты Poly Haven (~800 МБ), на месте ничего не скачивается;
           Blender portable кладётся в arden\blender (START.bat найдёт его сам)
  СЦЕНА — папка с village.glb, village.json, sky_2k.hdr и assets/cars (выгрузка сайта ?export=1 + машины Sketchfab)
"""
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
scene, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
FULL = '--full' in sys.argv[3:]
files = {}
for name in ('START.bat', 'START_3h.bat', 'pack.bat', 'INSTRUKCIYA.txt'):
    files['arden/' + name] = os.path.join(HERE, 'package', name)
for name in ('arden_render.py', 'arden_v2.py', 'arden_assets.py', 'sectors.json'):
    files['arden/' + name] = os.path.join(HERE, name)
for name in ('village.glb', 'village.json', 'sky_2k.hdr'):
    files['arden/scene/' + name] = os.path.join(scene, name)
cars = os.path.join(scene, 'assets', 'cars')
for dp, _, fs in os.walk(cars):
    for f in fs:
        p = os.path.join(dp, f)
        files['arden/scene/assets/cars/' + os.path.relpath(p, cars).replace(os.sep, '/')] = p
if FULL:  # только то, что берёт сцена (списки из arden_assets), с метками .ok — офлайн-проверка проходит без сети
    sys.path.insert(0, HERE)
    import arden_assets as AA
    roots = [os.path.join(scene, 'assets', 'models', m) for m in AA.MODELS] + [os.path.join(scene, 'assets', 'textures', t) for t in AA.TEXTURES]
    for r in roots:
        if not os.path.isdir(r):
            sys.exit('нет ассета (сначала скачайте: python3 estate/blender/arden_assets.py СЦЕНА): ' + r)
        for dp, _, fs in os.walk(r):
            for f in fs:
                if f.endswith('.part'): continue
                p = os.path.join(dp, f)
                files['arden/scene/' + os.path.relpath(p, scene).replace(os.sep, '/')] = p
missing = [p for p in files.values() if not os.path.exists(p)]
if missing:
    sys.exit('нет файлов: ' + ', '.join(missing))
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
    for arc, p in sorted(files.items()):
        # картинки и модели уже сжаты — кладём без повторного сжатия (быстрее, размер тот же)
        z.write(p, arc, compress_type=zipfile.ZIP_STORED if p.lower().endswith(('.jpg', '.png', '.bin', '.hdr', '.glb')) else zipfile.ZIP_DEFLATED)
print('пакет: %s, %d файлов, %.0f МБ' % (out, len(files), os.path.getsize(out) / 1e6))
