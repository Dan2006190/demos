"""
Собирает пакет для рендера в клубе: agent68.zip (папка agent68: bat-файлы, скрипты, машины).
Blender 4.5 LTS и фактуры/деревья/небо Poly Haven пакет докачивает сам при первом запуске (TEST.bat / START.bat).

  python3 agent68/blender/build_package.py АССЕТЫ ВЫХОД.zip
  АССЕТЫ — папка с cars/ (машины Sketchfab, CC BY 4.0, как в Ардене: <uid>/scene.gltf …);
           остальное в ней (Poly Haven) не кладём — скачается само
"""
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ESTATE = os.path.join(HERE, '..', '..', 'estate')
assets, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
files = {}
for name in ('START.bat', 'TEST.bat', 'pack.bat', 'INSTRUKCIYA.txt', 'tools/run.ps1', 'tools/pack.ps1'):
    files['agent68/' + name] = os.path.join(HERE, 'package', name)
files['agent68/agent68_render.py'] = os.path.join(HERE, 'agent68_render.py')
for name in ('arden_v2.py', 'arden_assets.py'):          # загрузка машин и деревьев — общая с Арденом
    files['agent68/' + name] = os.path.join(ESTATE, 'blender', name)
files['agent68/assets/CREDITS.md'] = os.path.join(ESTATE, 'assets', 'CREDITS.md')   # авторы машин (CC BY)
cars = os.path.join(assets, 'cars')
for dp, _, fs in os.walk(cars):
    for f in fs:
        p = os.path.join(dp, f)
        files['agent68/assets/cars/' + os.path.relpath(p, cars).replace(os.sep, '/')] = p
missing = [p for p in files.values() if not os.path.exists(p)]
if missing:
    sys.exit('нет файлов: ' + ', '.join(missing))
if not any(k.startswith('agent68/assets/cars/') for k in files):
    sys.exit('нет машин в ' + cars)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for arc, p in sorted(files.items()):
        z.write(p, arc)
print('пакет: %s, %d файлов, %.0f МБ' % (out, len(files), os.path.getsize(out) / 1e6))
