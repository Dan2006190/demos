"""
Арден: кадры для сайта «псевдо-3D» (Blender 4.2+ / 5.x).

Что рендерит (подробно — README.md):
  village/orbit/000–071.webp   облёт посёлка, 72 кадра через 5°, Cycles 1920×1080
  village/intro.mp4            вступление сквозь облака, 10 с, Cycles; последний кадр = orbit/000
  houses/NN/approach.mp4       подлёт с круга облёта к дому, 3,5 с при 24 к/с, Cycles (EEVEE — по --eevee)
  houses/NN/orbit/000–047.webp облёт дома, 48 кадров через 7,5°, Cycles (EEVEE — по --eevee); кадр 000 = конец подлёта
  manifest.json                всё для сайта: экранные координаты домов на каждом кадре облёта,
                               какой кадр облёта ведёт к какому дому, размеры, fps

Сцена — из выгрузки сайта (?export=1): village.glb, village.json, sky_2k.hdr в одной папке.

  blender -b -P arden_render.py -- --scene ПАПКА --out ПАПКА --what test
  blender -b -P arden_render.py -- --scene ПАПКА --out ПАПКА --what all

--what     trees — скачать деревья Poly Haven (один раз, нужен интернет)
           test — по два кадра каждого вида, время и прогноз на всё (≈10–15 мин)
           orbit | houses | approach | intro | all (порядок all: orbit → houses → approach → intro)
           manifest — только manifest.json (секунды, без рендера)
--house    номер дома (1–6), если нужен один
--quality  final (по умолчанию) | draft (быстро, половинное разрешение)
Готовые кадры пропускаются: прерванный рендер продолжается той же командой.
"""
import argparse
import json
import math
import os
import shutil
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

# ---------------------------------------------------------------- параметры
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser(prog='arden_render.py')
ap.add_argument('--scene', default='scene', help='папка с village.glb, village.json, sky_2k.hdr')
ap.add_argument('--out', default='renders')
ap.add_argument('--what', default='test', choices=['test', 'trees', 'orbit', 'houses', 'approach', 'intro', 'all', 'manifest'])
ap.add_argument('--house', type=int, default=0)
ap.add_argument('--quality', default='final', choices=['final', 'draft'])
ap.add_argument('--percent', type=int, default=0, help='масштаб разрешения, %%')
ap.add_argument('--cpu', action='store_true', help='без видеокарты (только для проверки скрипта)')
ap.add_argument('--eevee', action='store_true', help='облёты и подлёты домов в EEVEE (быстрее, но в клубе упирался в процессор; ели упрощены)')
ap.add_argument('--no-eevee', action='store_true', help=argparse.SUPPRESS)  # старый флаг: теперь Cycles и так по умолчанию
ap.add_argument('--sky', default='sunset', choices=['sunset', 'hdri'], help='закат (физическое небо) или дневное небо сайта')
ap.add_argument('--sun-az', type=float, default=-95, help='азимут солнца, градусы от +X Blender против часовой (вид сверху)')
ap.add_argument('--sun-el', type=float, default=28, help='высота солнца над горизонтом, градусы')
ap.add_argument('--ev', type=float, default=.6, help='добавка экспозиции для заката, EV')
ap.add_argument('--decid', default='cards', choices=['cards', 'tree_small_02'], help='лиственные в лесу: карточки сайта или модель')
ap.add_argument('--save-blend', action='store_true', help='сохранить сцену в .blend для правок руками')
A = ap.parse_args(argv)

SCENE_DIR = os.path.abspath(A.scene)
OUT = os.path.abspath(A.out)
WORK = os.path.join(OUT, '_work')  # кадры PNG для роликов — на флешку не нужны
DATA = json.load(open(os.path.join(SCENE_DIR, 'village.json'), encoding='utf-8')) if A.what != 'trees' else {}
DRAFT = A.quality == 'draft'
V5 = bpy.app.version >= (5, 0, 0)
os.makedirs(OUT, exist_ok=True)

W, H = 1920, 1080
ORBIT_N, ORBIT_STEP = 72, 5.0          # облёт посёлка
HOUSE_N, HOUSE_STEP = 48, 7.5          # облёт дома
APPROACH_FPS, APPROACH_SEC = 24, 3.5   # подлёт: 84 кадра
INTRO_FPS, INTRO_SEC = 24, 10          # вступление: 241 кадр, последний = облёт посёлка, кадр 0
# выборки: адаптивные — где чисто, Cycles останавливается раньше потолка
SPP_ORBIT = (48, 16) if DRAFT else (192, 64)     # (потолок, минимум)
SPP_INTRO = (64, 32) if DRAFT else (256, 128)    # облака: не меньше 128
SPP_HOUSE = (32, 16) if DRAFT else (128, 32)     # облёт и подлёт дома в Cycles: кадры в движении
SPP_EEVEE = 16 if DRAFT else 64


def log(*a):
    print('[arden]', *a, flush=True)


def b(v):
    """three.js (Y вверх) → Blender (Z вверх), как у импортёра glTF."""
    return Vector((v[0], -v[2], v[1]))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, linear=True):
    rgb = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return [srgb_to_lin(c) for c in rgb] if linear else rgb


# ---------------------------------------------------------------- деревья Poly Haven (CC0)
TREES_DIR = os.path.join(SCENE_DIR, 'trees')


def fetch_tree(slug):
    """Модель с Poly Haven (glTF 1K) в scene/trees; скачивается один раз (нужен интернет)."""
    path = os.path.join(TREES_DIR, slug, slug + '_1k.gltf')
    if os.path.exists(path):
        return path
    import urllib.request
    get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (render-script)'}))
    d = json.load(get('https://api.polyhaven.com/files/' + slug))['gltf']['1k']['gltf']
    files = [(os.path.basename(d['url']), d)] + list(d['include'].items())
    log('скачиваю %s с Poly Haven (%.0f МБ)…' % (slug, sum(v['size'] for _, v in files) / 1e6))
    for rel, v in files:
        p = os.path.join(TREES_DIR, slug, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        if not os.path.exists(p) or os.path.getsize(p) != v['size']:
            with get(v['url']) as src, open(p + '.part', 'wb') as f:
                shutil.copyfileobj(src, f, 1 << 20)
            os.replace(p + '.part', p)
    return path


if A.what == 'trees':
    for slug in ('fir_tree_01', 'tree_small_02'):
        fetch_tree(slug)
    log('деревья скачаны в', TREES_DIR); raise SystemExit(0)

# ---------------------------------------------------------------- сцена
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
log('Blender', bpy.app.version_string, '— импорт сцены…')
t0 = time.time()
bpy.ops.import_scene.gltf(filepath=os.path.join(SCENE_DIR, 'village.glb'))
log('импорт за %.0f с, объектов: %d' % (time.time() - t0, len(bpy.data.objects)))

# деревья, кусты, трава и цветы приходят инстансами (EXT_mesh_gpu_instancing) — импортёр раскладывает их сам

# ---------------------------------------------------------------- лес
# ближний пояс: ели Poly Haven (fir_tree_01, варианты a и b) на местах хвойных и части лиственных;
# остальные лиственные карточки сайта и кусты — подлесок; дальний лес — карточки сайта (сверху не отличить).
# импортёр делает из каждого набора пустышку с именем набора, копии — её дети
import random
RND = random.Random(2026)


def kids(name):
    e = bpy.data.objects.get(name)
    return list(e.children) if e else []


def spot(o):
    t = o.matrix_world.translation
    return (round(t.x, 1), round(t.y, 1))


def import_proto(slug, keep):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=fetch_tree(slug))
    got = {}
    for o in [o for o in bpy.data.objects if o not in before]:
        k = next((k for k in keep if o.name.startswith(k)), None)
        if k and o.type == 'MESH':
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
            o.location = (0, 0, -500); o.hide_render = True; got[k] = o  # образец; копии берут его геометрию
            solid_alpha(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    return got


def solid_alpha(obj, cutoff=.3):
    """Листва/хвоя Poly Haven с мягкой альфой (BLEND): тени от крон почти пропадают.
    Делаем альфу жёсткой (порог) — крона даёт плотную тень в Cycles; в EEVEE — dithered + прозрачные тени."""
    for m in obj.data.materials:
        if not m or not m.use_nodes or m.get('solid_alpha'):
            continue
        m['solid_alpha'] = True  # материал общий у вариантов ели — правим один раз
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf or not bsdf.inputs['Alpha'].is_linked:
            continue
        src = bsdf.inputs['Alpha'].links[0].from_socket
        gt = m.node_tree.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = cutoff
        m.node_tree.links.new(src, gt.inputs[0]); m.node_tree.links.new(gt.outputs[0], bsdf.inputs['Alpha'])
        for k, v in (('surface_render_method', 'DITHERED'), ('use_transparent_shadow', True), ('blend_method', 'CLIP'), ('shadow_method', 'CLIP')):
            if hasattr(m, k):
                try:
                    setattr(m, k, v)
                except TypeError:
                    pass
        log('альфа с порогом:', m.name)


def instance_tree(proto):
    ng = bpy.data.node_groups.new('копии_' + proto.name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n, l = ng.nodes, ng.links
    gi, go = n.new('NodeGroupInput'), n.new('NodeGroupOutput')
    pts = n.new('GeometryNodeMeshToPoints')
    oi = n.new('GeometryNodeObjectInfo'); oi.transform_space = 'ORIGINAL'
    oi.inputs['Object'].default_value = proto; oi.inputs['As Instance'].default_value = True
    iop = n.new('GeometryNodeInstanceOnPoints')
    rot = n.new('GeometryNodeInputNamedAttribute'); rot.data_type = 'FLOAT_VECTOR'; rot.inputs['Name'].default_value = 'rot'
    scl = n.new('GeometryNodeInputNamedAttribute'); scl.data_type = 'FLOAT_VECTOR'; scl.inputs['Name'].default_value = 'scl'
    l.new(gi.outputs[0], pts.inputs['Mesh']); l.new(pts.outputs['Points'], iop.inputs['Points'])
    l.new(oi.outputs['Geometry'], iop.inputs['Instance'])
    l.new(rot.outputs['Attribute'], iop.inputs['Rotation']); l.new(scl.outputs['Attribute'], iop.inputs['Scale'])
    l.new(iop.outputs['Instances'], go.inputs[0])
    return ng


def scatter(name, proto, pts):
    """pts: [(положение, поворот по Z, масштаб)] → объект-облако точек с копиями образца."""
    me = bpy.data.meshes.new(name); me.from_pydata([p[0] for p in pts], [], [])
    for attr, vals in (('rot', [(0, 0, p[1]) for p in pts]), ('scl', [(p[2],) * 3 for p in pts])):
        me.attributes.new(attr, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', [c for v in vals for c in v])
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    ob.modifiers.new('копии', 'NODES').node_group = instance_tree(proto)
    log('%s: %d шт.' % (name, len(pts)))
    return ob


FIRS = import_proto('fir_tree_01', ['fir_tree_01_a', 'fir_tree_01_b'])
for p in FIRS.values():  # для EEVEE — упрощённая ель (включается на этапах EEVEE)
    d = p.modifiers.new('для_EEVEE', 'DECIMATE'); d.ratio = .03; d.show_render = d.show_viewport = False
conif, decid = kids('tree_leaf_conif'), kids('tree_leaf_decid')
to_fir = conif + [o for o in decid if RND.random() < .4]
gone = {spot(o) for o in to_fir}
fir_pts = {'fir_tree_01_a': [], 'fir_tree_01_b': []}
for o in to_fir:
    fir_pts[RND.choice(list(fir_pts))].append((o.matrix_world.translation.copy(), RND.uniform(0, 6.283), RND.uniform(.8, 1.3)))
for grp in ('tree_leaf_conif', 'tree_core_conif', 'tree_leaf_decid', 'tree_core_decid', 'tree_trunk'):
    for o in kids(grp):
        if spot(o) in gone:
            bpy.data.objects.remove(o, do_unlink=True)
for k, pts in fir_pts.items():
    scatter('ели_' + k[-1], FIRS[k], pts)
if A.decid == 'tree_small_02':  # лиственный подлесок моделью вместо карточек
    TS = import_proto('tree_small_02', ['tree_small_02'])['tree_small_02']
    left = kids('tree_leaf_decid')
    scatter('лиственные', TS, [(o.matrix_world.translation.copy(), RND.uniform(0, 6.283), 2 * o.matrix_world.to_scale().x) for o in left])
    for grp in ('tree_leaf_decid', 'tree_core_decid'):
        for o in kids(grp): bpy.data.objects.remove(o, do_unlink=True)
# сердцевина карточных деревьев на сайте почти чёрная — осветляем, чтобы лес не проваливался
for grp in ('tree_core_decid', 'far_core_decid', 'far_core_conif'):
    for o in kids(grp)[:1]:
        for m in o.data.materials:
            bsdf = m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None
            if bsdf: bsdf.inputs['Base Color'].default_value = (.05, .09, .03, 1)
# дальний лес — карточки сайта: крупнее, чтобы кроны смыкались, и тёмная подстилка между ними (сверху не светит «саванной»)
for g in ('far_leaf_decid', 'far_core_decid', 'far_leaf_conif', 'far_core_conif'):
    for o in kids(g):
        o.scale = [v * 1.5 for v in o.scale]
for o in bpy.data.objects:
    if o.type == 'MESH' and o.dimensions.x > 800 and 600 < o.dimensions.y < 800:  # лесная подстилка
        for m in o.data.materials:
            bsdf = m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None
            if bsdf:
                src = bsdf.inputs['Base Color'].links[0].from_node if bsdf.inputs['Base Color'].is_linked else None
                rgba = next((i for i in (src.inputs if src and src.type == 'MIX' else [bsdf.inputs['Base Color']]) if i.type == 'RGBA' and not i.is_linked), None)
                if rgba: rgba.default_value = (.025, .035, .015, 1)
# акценты на участках: tree_small_02 по одному в заднем углу участка, если там свободно
TS_ACC = import_proto('tree_small_02', ['tree_small_02'])['tree_small_02']
acc = []
for px in (-90, -60, -30, 0, 30, 60, 90):
    for side in (1, -1):
        for dx in RND.sample([-10.5, 10.5], 2):
            x, z = px + dx, side * 33.5
            if all(abs(x - bd['pos'][0]) > bd['W'] / 2 + 3 or abs(z - bd['pos'][2]) > bd['D'] / 2 + 3 for bd in DATA.get('buildings', [])):
                acc.append((b((x, 0, z)), RND.uniform(0, 6.283), RND.uniform(1.9, 2.4))); break
scatter('акценты_на_участках', TS_ACC, acc)
# ---------------------------------------------------------------- трава
# мелкие травинки сайта сверху дают крупу — убираем; вместо них два уровня:
#   крупные формы (видно с высоты, все этапы): куртины высокой травы у заборов, луговая кромка у леса, обочины;
#   густой газон из травинок, высокая трава, клевер и цветы — только на подлёте и облёте домов, у камеры.
for o in kids('grass'):
    bpy.data.objects.remove(o, do_unlink=True)
XS, PW, PD, ROAD = (-90, -60, -30, 0, 30, 60, 90), 28, 32, 7
NEAR, FAR = ROAD / 2 + 1.9, ROAD / 2 + 1.6 + PD - .3   # от оси дороги до переднего и заднего забора участка, м


def free(x, z, pad=.6):
    """Точка (оси сайта) не в доме и не на въезде/дорожке к воротам."""
    for bd in DATA.get('buildings', []):
        if abs(x - bd['pos'][0]) < bd['W'] / 2 + pad and abs(z - bd['pos'][2]) < bd['D'] / 2 + pad:
            return False
    for px in XS:
        if px - 3.2 < x < px + 4.6 and NEAR - .5 < abs(z) < NEAR + 9.5:  # ворота, дорожка, въезд
            return False
    return True


def mat(name, color, rough=.7, var=.15):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = rough
    oi = nt.nodes.new('ShaderNodeObjectInfo'); ramp = nt.nodes.new('ShaderNodeValToRGB')  # оттенок — у каждой копии свой
    ramp.color_ramp.elements[0].color = [c * (1 - var) for c in color[:3]] + [1]
    ramp.color_ramp.elements[1].color = [min(1, c * (1 + var)) for c in color[:3]] + [1]
    nt.links.new(oi.outputs['Random'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def blades_mesh(name, n, h, r, w, bend=.25, material=None):
    """Пучок травинок: n узких треугольников-лент с изгибом (по 2 треугольника на травинку)."""
    rnd = random.Random(hash(name) & 0xffff); V, F = [], []
    for i in range(n):
        a, d = rnd.uniform(0, 6.283), r * math.sqrt(rnd.random())
        x, y = math.cos(a) * d, math.sin(a) * d
        hh = h * rnd.uniform(.55, 1.0); tilt = rnd.uniform(0, 6.283); lean = bend * hh * rnd.uniform(.3, 1)
        ww = w * rnd.uniform(.7, 1.2); cx, cy = math.cos(a + 1.57) * ww, math.sin(a + 1.57) * ww
        mx, my = x + math.cos(tilt) * lean * .4, y + math.sin(tilt) * lean * .4
        k = len(V)
        V += [(x - cx, y - cy, 0), (x + cx, y + cy, 0), (mx + cx * .6, my + cy * .6, hh * .55), (mx - cx * .6, my - cy * .6, hh * .55),
              (x + math.cos(tilt) * lean, y + math.sin(tilt) * lean, hh)]
        F += [(k, k + 1, k + 2, k + 3), (k + 3, k + 2, k + 4)]
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F)
    if material: me.materials.append(material)
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.location = (0, 0, -500); ob.hide_render = True
    return ob


def blob_mesh(name, r, material):
    """Цветок/клевер: маленький приплюснутый шарик."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r)
    ob = bpy.context.active_object; ob.name = name; ob.scale.z = .6; ob.data.materials.append(material)
    ob.location = (0, 0, -500); ob.hide_render = True
    return ob


M_TALL = mat('трава_высокая', (.16, .2, .06), .75, .25)    # некошеная, с желтизной
M_LAWN = mat('травинки', (.07, .14, .03), .6, .2)
TALL = blades_mesh('куртина', 46, 1.0, .35, .025, .35, M_TALL)
TUFT = blades_mesh('пучок_газона', 18, .12, .09, .006, .2, M_LAWN)
CLOVER = blob_mesh('клевер', .05, mat('клевер', (.55, .55, .5), .6, .1))
FLOWER = blob_mesh('цветок', .035, mat('цветы', (.7, .55, .2), .5, .4))
P = lambda x, z, s: (b((x, 0, z)), RND.uniform(0, 6.283), s)   # точка в осях сайта → Blender

tall = []
for px in XS:
    for side in (1, -1):
        for t in range(0, 64):  # вдоль боковых заборов изнутри, через ~0.5 м
            zz = side * (NEAR + t * (FAR - NEAR) / 63)
            for xx in (px - PW / 2 + .9, px + PW / 2 - .9):
                x, z = xx + RND.uniform(-.5, .5) * (1 if xx < px else -1), zz
                if free(x, z): tall.append(P(x, z, RND.uniform(.6, 1.1)))
        for t in range(0, 54):  # вдоль заднего забора
            x, z = px - PW / 2 + 1 + t * (PW - 2) / 53, side * (FAR - .7 + RND.uniform(-.3, .3))
            if free(x, z): tall.append(P(x, z, RND.uniform(.6, 1.1)))
        for t in range(0, 40):  # обочина у переднего забора, кроме ворот и въезда
            x, z = px - PW / 2 + .5 + t * (PW - 1) / 39, side * (ROAD / 2 + 1.75)
            if free(x, z) and not (px - 3.2 < x < px + 4.6): tall.append(P(x, z, RND.uniform(.35, .6)))
for side in (1, -1):  # луговая кромка между участками и лесом, густая к лесу
    for i in range(4200):
        x, d = RND.uniform(-108, 108), RND.random() ** .6
        tall.append(P(x, side * (FAR + .8 + d * 6), RND.uniform(.7, 1.3)))
    for i in range(500):  # обочины дороги за посёлком
        x = RND.choice((-1, 1)) * RND.uniform(106, 160)
        tall.append(P(x, side * RND.uniform(5.2, 7.5), RND.uniform(.5, 1.0)))
scatter('высокая_трава', TALL, tall)


def lawn_points(cx, cz_sign, dens):
    """Газон одного участка: пучки травинок, клевер и цветы пятнами."""
    tufts, clover, flowers = [], [], []
    area = (PW - 2) * (FAR - NEAR)
    for i in range(int(area * dens)):
        x, z = cx + RND.uniform(-PW / 2 + 1, PW / 2 - 1), cz_sign * RND.uniform(NEAR + .3, FAR - .5)
        if not free(x, z, .3):
            continue
        tufts.append(P(x, z, RND.uniform(.8, 1.4)))
        patch = math.sin(x * .37 + z * .21) * math.cos(x * .19 - z * .33)  # клевер пятнами
        if patch > .55 and RND.random() < .25: clover.append(P(x, z, RND.uniform(.8, 1.3)))
        if RND.random() < .004: flowers.append(P(x, z, RND.uniform(.7, 1.2)))
    return tufts, clover, flowers


LAWN = []  # по участкам: включаются только у камеры на этапах домов


def build_lawn(houses_idx):
    """Густой газон на участках вокруг выбранных домов (сам участок и соседние)."""
    for o in LAWN:
        bpy.data.objects.remove(o, do_unlink=True)
    LAWN.clear(); done = set()
    for i in houses_idx:
        h = DATA['houses'][i]; side = 1 if h['pos'][2] > 0 else -1
        px0 = min(XS, key=lambda x: abs(x - h['pos'][0]))
        for px in (px0 - 30, px0, px0 + 30):
            for sd in (side, -side) if px == px0 else (side,):
                if px not in XS or (px, sd) in done:
                    continue
                done.add((px, sd)); t, c, f = lawn_points(px, sd, 22)
                LAWN.extend([scatter('газон_%d_%d' % (px, sd), TUFT, t), scatter('клевер_%d_%d' % (px, sd), CLOVER, c),
                             scatter('цветы_%d_%d' % (px, sd), FLOWER, f)])


def grass(on, houses_idx=()):
    if on:
        build_lawn(houses_idx)
    else:
        for o in LAWN:
            o.hide_render = True


# газон участков: полосы покоса и пятна тона в шейдере; зелень сайта приглушаем (была «неоновой»)
for m in bpy.data.materials:
    bsdf = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    if not bsdf or bsdf.inputs['Alpha'].is_linked or m.name.startswith(('трава', 'травинки', 'клевер', 'цветы')):
        continue
    c = bsdf.inputs['Base Color']
    src = c.links[0].from_socket if c.is_linked else None
    col = c.default_value
    if src and src.node.type == 'MIX':  # glTF: текстура × цвет-множитель в узле Mix
        col = next((i.default_value for i in src.node.inputs if i.type == 'RGBA' and not i.is_linked), None)
    elif src:
        col = None
    if col is None or not (col[1] > col[0] * 1.3 and col[1] > col[2] * 1.6):
        continue
    nt = m.node_tree
    hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = .75; hs.inputs['Value'].default_value = .95
    if src: nt.links.new(src, hs.inputs['Color'])
    else: hs.inputs['Color'].default_value = col
    out_sock = hs.outputs['Color']
    if abs(col[0] - .33) < .05 and abs(col[1] - .6) < .06:  # газон участков (0x9ccc68): покос и пятна
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
        stripe = nt.nodes.new('ShaderNodeMath'); stripe.operation = 'PINGPONG'; stripe.inputs[1].default_value = 2.5
        nt.links.new(sep.outputs['X'], stripe.inputs[0])
        st = nt.nodes.new('ShaderNodeMapRange'); st.inputs['From Max'].default_value = 2.5; st.inputs['To Min'].default_value = .86; st.inputs['To Max'].default_value = 1.1
        st.interpolation_type = 'STEPPED'; st.inputs['Steps'].default_value = 2
        nt.links.new(stripe.outputs[0], st.inputs['Value'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .06; nz.inputs['Detail'].default_value = 3
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeMapRange'); nm.inputs['To Min'].default_value = .8; nm.inputs['To Max'].default_value = 1.15
        nt.links.new(nz.outputs['Fac'], nm.inputs['Value'])
        k1 = nt.nodes.new('ShaderNodeMath'); k1.operation = 'MULTIPLY'; nt.links.new(st.outputs['Result'], k1.inputs[0]); nt.links.new(nm.outputs['Result'], k1.inputs[1])
        mix = nt.nodes.new('ShaderNodeVectorMath'); mix.operation = 'SCALE'
        nt.links.new(hs.outputs['Color'], mix.inputs[0]); nt.links.new(k1.outputs[0], mix.inputs['Scale'])
        out_sock = mix.outputs['Vector']
        log('газон участков: полосы покоса —', m.name)
    nt.links.new(out_sock, c)


def eevee_trees(on):
    for p in list(FIRS.values()):
        p.modifiers['для_EEVEE'].show_render = on

# ---------------------------------------------------------------- свет и небо
world = bpy.data.worlds.new('Небо'); sc.world = world; world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
wn.clear()
bg = wn.new('ShaderNodeBackground'); out = wn.new('ShaderNodeOutputWorld')
wl.new(bg.outputs['Background'], out.inputs['Surface'])
# направление НА солнце (откуда светит), оси Blender; азимут от +X против часовой, вид сверху
SUN_EL, SUN_AZ = math.radians(A.sun_el), math.radians(A.sun_az)
sun_vec = Vector((math.cos(SUN_EL) * math.cos(SUN_AZ), math.cos(SUN_EL) * math.sin(SUN_AZ), math.sin(SUN_EL)))
if A.sky == 'hdri':  # дневное небо сайта (Poly Haven kloppenheim_06_puresky), солнце — как на сайте
    env = wn.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(SCENE_DIR, 'sky_2k.hdr'))
    tc = wn.new('ShaderNodeTexCoord'); mp = wn.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value[2] = math.pi  # развёртка three.js сдвинута на полоборота
    wl.new(tc.outputs['Generated'], mp.inputs['Vector']); wl.new(mp.outputs['Vector'], env.inputs['Vector']); wl.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = (DATA['bgIntensity'] + DATA['envIntensity']) / 2
    S = DATA['sun']; sun_vec = b(S['dir']).normalized(); sun_energy, sun_color = S['intensity'], hex_rgb(S['color'])
    log('небо: HDRI', env.image.filepath, env.image.size[:])
else:  # закат: физическое небо Blender, солнце-лампа совмещена с его солнцем (диск выключен — светит лампа)
    sky = wn.new('ShaderNodeTexSky'); kinds = sky.bl_rna.properties['sky_type'].enum_items.keys()
    sky.sky_type = next(k for k in ('NISHITA', 'MULTIPLE_SCATTERING', 'SINGLE_SCATTERING') if k in kinds)
    sky.sun_disc = False; sky.sun_elevation = SUN_EL
    sky.sun_rotation = math.atan2(sun_vec.x, sun_vec.y)  # проверено кадром: 0 — солнце по +Y, 90° — по +X
    for k, v in (('altitude', 0), ('air_density', 1.0), ('dust_density', 2.5), ('ozone_density', 1.0)):
        if hasattr(sky, k): setattr(sky, k, v)
    # соотношение подобрано по замеру: тень ≈ на 45 % темнее освещённого газона и холоднее его; свет — тёплый
    wl.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = .08
    sun_energy, sun_color = 6.0, (1.0, .6, .36)
    log('небо: закат, тип %s, солнце %.0f° над горизонтом, азимут %.0f°' % (sky.sky_type, A.sun_el, A.sun_az))
sun_d = bpy.data.lights.new('Солнце', 'SUN'); sun_d.energy = sun_energy; sun_d.color = sun_color
sun_d.angle = math.radians(1.0)
sun = bpy.data.objects.new('Солнце', sun_d); sc.collection.objects.link(sun)
sun.rotation_euler = sun_vec.to_track_quat('Z', 'Y').to_euler()  # +Z лампы на солнце, луч идёт по −Z — от солнца

# Низкое солнце + ели 11–25 м = тени по 80–140 м, посёлок целиком в тени. Поэтому два солнца (light/shadow linking):
#   «Солнце» — посёлок: дома, участки, дорога; ели для него тень не отбрасывают (тени домов, заборов и деревьев на участках — есть);
#   «Солнце леса» — только лес и лесная подстилка, с полными тенями, чтобы лес был объёмным.
forest = [o for g in ('tree_leaf_decid', 'tree_core_decid', 'tree_trunk', 'far_leaf_decid', 'far_core_decid', 'far_leaf_conif', 'far_core_conif') for o in kids(g)]
forest += [o for o in bpy.data.objects if o.name.startswith(('ели_', 'лиственные'))]
forest += [o for o in bpy.data.objects if o.type == 'MESH' and o.dimensions.x > 800 and 600 < o.dimensions.y < 800]  # лесная подстилка
if hasattr(sun, 'light_linking'):
    f_in, f_ex = bpy.data.collections.new('лес'), bpy.data.collections.new('кроме_леса')
    for o in forest:
        f_in.objects.link(o); f_ex.objects.link(o)
    for co in f_ex.collection_objects:  # «всё, кроме леса»
        co.light_linking.link_state = 'EXCLUDE'
    sun.light_linking.receiver_collection = f_ex; sun.light_linking.blocker_collection = f_ex
    sun_f = bpy.data.objects.new('Солнце леса', sun_d.copy()); sc.collection.objects.link(sun_f)
    sun_f.data.color = (1.0, .82, .66); sun_f.data.energy = sun_d.energy * .8  # лес — глубокий зелёный, не оливковый
    sun_f.rotation_euler = sun.rotation_euler; sun_f.light_linking.receiver_collection = f_in
    log('свет: два солнца (посёлок / лес), объектов леса: %d' % len(forest))
else:
    log('ВНИМАНИЕ: нет light linking (Blender < 4.0) — лес будет затенять посёлок')

# ---------------------------------------------------------------- облака
# слой как на сайте: высота 200–290 м над посёлком, радиус ~620 м; к концу ролика тают
bpy.ops.mesh.primitive_cube_add()
cloud = bpy.context.active_object; cloud.name = 'Облака'
cloud.location = b((-40, 245, 60)); cloud.scale = (700, 700, 55)
cm = bpy.data.materials.new('Облака'); cm.use_nodes = True
cn, cl = cm.node_tree.nodes, cm.node_tree.links
cn.clear()
o_tc = cn.new('ShaderNodeTexCoord')
o_map = cn.new('ShaderNodeMapping'); o_map.inputs['Scale'].default_value = (700 / 110, 700 / 110, 55 / 45)
noise = cn.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.0
noise.inputs['Detail'].default_value = 3 if DRAFT else 8; noise.inputs['Roughness'].default_value = .55
cover = cn.new('ShaderNodeMapRange'); cover.inputs['From Min'].default_value = .44; cover.inputs['From Max'].default_value = .62
sep = cn.new('ShaderNodeSeparateXYZ')
habs = cn.new('ShaderNodeMath'); habs.operation = 'ABSOLUTE'
hgt = cn.new('ShaderNodeMapRange'); hgt.inputs['From Min'].default_value = .25; hgt.inputs['From Max'].default_value = 1
hgt.inputs['To Min'].default_value = 1; hgt.inputs['To Max'].default_value = 0
mul = cn.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
fade = cn.new('ShaderNodeValue'); fade.name = 'fade'; fade.outputs[0].default_value = 1
dens = cn.new('ShaderNodeMath'); dens.operation = 'MULTIPLY'
dk = cn.new('ShaderNodeMath'); dk.operation = 'MULTIPLY'; dk.inputs[1].default_value = .08
vol = cn.new('ShaderNodeVolumePrincipled'); vol.inputs['Color'].default_value = (1, .98, .96, 1)
vol.inputs['Anisotropy'].default_value = .45
vout = cn.new('ShaderNodeOutputMaterial')
cl.new(o_tc.outputs['Object'], o_map.inputs['Vector']); cl.new(o_map.outputs['Vector'], noise.inputs['Vector'])
cl.new(noise.outputs['Fac'], cover.inputs['Value'])
cl.new(o_tc.outputs['Object'], sep.inputs['Vector']); cl.new(sep.outputs['Z'], habs.inputs[0])
# клубящийся верх: где шум сильнее, облако выше и толще
lift = cn.new('ShaderNodeMath'); lift.operation = 'MULTIPLY_ADD'; lift.inputs[1].default_value = -1.3; lift.inputs[2].default_value = .55
top = cn.new('ShaderNodeMath'); top.operation = 'ADD'
cl.new(noise.outputs['Fac'], lift.inputs[0]); cl.new(habs.outputs[0], top.inputs[0]); cl.new(lift.outputs[0], top.inputs[1])
cl.new(top.outputs[0], hgt.inputs['Value'])
# круглый край слоя, без квадратных обрезов
rad = cn.new('ShaderNodeVectorMath'); rad.operation = 'LENGTH'
flat = cn.new('ShaderNodeVectorMath'); flat.operation = 'MULTIPLY'; flat.inputs[1].default_value = (1, 1, 0)
edge = cn.new('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = .55; edge.inputs['From Max'].default_value = .98
edge.inputs['To Min'].default_value = 1; edge.inputs['To Max'].default_value = 0
mul2 = cn.new('ShaderNodeMath'); mul2.operation = 'MULTIPLY'
cl.new(o_tc.outputs['Object'], flat.inputs[0]); cl.new(flat.outputs['Vector'], rad.inputs[0]); cl.new(rad.outputs['Value'], edge.inputs['Value'])
cl.new(cover.outputs['Result'], mul2.inputs[0]); cl.new(edge.outputs['Result'], mul2.inputs[1])
cl.new(mul2.outputs[0], mul.inputs[0]); cl.new(hgt.outputs['Result'], mul.inputs[1])
cl.new(mul.outputs[0], dens.inputs[0]); cl.new(fade.outputs[0], dens.inputs[1])
cl.new(dens.outputs[0], dk.inputs[0]); cl.new(dk.outputs[0], vol.inputs['Density'])
cl.new(vol.outputs['Volume'], vout.inputs['Volume'])
cloud.data.materials.append(cm)

# ---------------------------------------------------------------- камера
cam_d = bpy.data.cameras.new('Камера'); cam_d.sensor_fit = 'VERTICAL'; cam_d.angle_y = math.radians(DATA['fov'])
cam_d.clip_start = .5; cam_d.clip_end = 3000
cam = bpy.data.objects.new('Камера', cam_d); sc.collection.objects.link(cam); sc.camera = cam
aim = bpy.data.objects.new('Цель', None); sc.collection.objects.link(aim)
tr = cam.constraints.new('TRACK_TO'); tr.target = aim; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'


def look(pos, target):
    cam.location = b(pos); aim.location = b(target)


# ---------------------------------------------------------------- рендер
r = sc.render
cy = sc.cycles
if not A.cpu:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind; prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices: d.use = d.type == kind
                cy.device = 'GPU'; log('видеокарта:', kind, ', '.join(d.name for d in gpus)); break
        except TypeError:
            continue
    else:
        log('ВНИМАНИЕ: видеокарта не найдена, рендер на процессоре — будет очень долго')
cy.use_adaptive_sampling = True
cy.adaptive_threshold = .03 if DRAFT else .02  # с OptiX-шумодавом; на вступлении строже (см. stage_intro)
cy.use_denoising = True
try:
    cy.denoiser = 'OPTIX' if cy.device == 'GPU' else 'OPENIMAGEDENOISE'
except TypeError:
    pass
cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'  # шумодав с альбедо и нормалями
try:
    cy.denoising_prefilter = 'ACCURATE'
except (TypeError, AttributeError):
    pass
log('шумодав:', cy.denoiser, cy.denoising_input_passes)
cy.max_bounces = 4 if DRAFT else 6
cy.transparent_max_bounces = 12 if DRAFT else 16  # хвоя и листва — с прозрачностью
cy.volume_bounces = 0 if DRAFT else 1
cy.volume_step_rate = 4 if DRAFT else 1.0  # мельче шаг — больше выборок в облаках
cy.volume_max_steps = 256
cy.caustics_reflective = cy.caustics_refractive = False
cy.sample_clamp_direct = 0; cy.sample_clamp_indirect = 10  # срезает редкие яркие выборки (искры)
cy.blur_glossy = 1.0  # сглаживание бликов (filter glossy)
r.use_persistent_data = True
r.film_transparent = False

# цвет: ACES-подобная кривая сайта ≈ AgX, экспозиция как toneMappingExposure
vs = sc.view_settings
for vt in ('AgX', 'Filmic'):
    try:
        vs.view_transform = vt; break
    except TypeError:
        continue
try:
    vs.look = 'AgX - Base Contrast' if vs.view_transform == 'AgX' else 'Medium Contrast'
except TypeError:
    pass
vs.exposure = math.log2(DATA['exposure']) + .3 + (0 if A.sky == 'hdri' else A.ev)

# туман сайта (линейный, 300–1000 м, цвет #aab4c0): дымка по проходу mist, небо не трогаем
vl = sc.view_layers[0]; vl.use_pass_mist = True; vl.use_pass_z = True
world.mist_settings.start = 300; world.mist_settings.depth = 700; world.mist_settings.falloff = 'LINEAR'


def setup_fog():
    if V5:
        tree = bpy.data.node_groups.new('Туман', 'CompositorNodeTree'); sc.compositing_node_group = tree
        out_node = tree.nodes.new('NodeGroupOutput')
        tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    else:
        sc.use_nodes = True; tree = sc.node_tree; tree.nodes.clear()
        out_node = tree.nodes.new('CompositorNodeComposite')
    n, l = tree.nodes, tree.links
    rl = n.new('CompositorNodeRLayers')
    lt = n.new('ShaderNodeMath') if V5 else n.new('CompositorNodeMath')
    lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 1e5  # глубина неба — бесконечность
    mm = n.new('ShaderNodeMath') if V5 else n.new('CompositorNodeMath')
    mm.operation = 'MULTIPLY'
    fog = (*hex_rgb(0xaab4c0 if A.sky == 'hdri' else 0xa9b8c9), 1)  # голубоватая дымка вдали
    if V5:
        mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        l.new(mm.outputs[0], mix.inputs['Factor']); l.new(rl.outputs['Image'], mix.inputs['A']); mix.inputs['B'].default_value = fog
        res = mix.outputs['Result']
    else:
        mix = n.new('CompositorNodeMixRGB')
        l.new(mm.outputs[0], mix.inputs[0]); l.new(rl.outputs['Image'], mix.inputs[1]); mix.inputs[2].default_value = fog
        res = mix.outputs[0]
    l.new(rl.outputs['Depth'], lt.inputs[0]); l.new(rl.outputs['Mist'], mm.inputs[0]); l.new(lt.outputs[0], mm.inputs[1])
    l.new(res, out_node.inputs[0])


try:
    setup_fog()
except Exception as e:  # туман — не главное, без него тоже рендерим
    log('туман не настроен:', e)

if A.save_blend:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'arden.blend'))



def res(scale=100):
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, A.percent or (50 if DRAFT else scale)


# ---------------------------------------------------------------- движки
ENGINES = bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys()
EEVEE = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in ENGINES else 'BLENDER_EEVEE'


def use(engine, spp=SPP_ORBIT):
    """engine: 'CYCLES' или 'HOUSE' (дома: Cycles по умолчанию, EEVEE — только с --eevee)."""
    eevee = engine == 'HOUSE' and A.eevee and not A.no_eevee
    eevee_trees(eevee)  # упрощённые ели — только в EEVEE; в Cycles ели полноценные
    if engine == 'HOUSE' and not eevee:
        spp = SPP_HOUSE
    if eevee:
        r.engine = EEVEE
        e = sc.eevee
        e.taa_render_samples = SPP_EEVEE
        for k, v in (('use_raytracing', True), ('use_shadows', True), ('shadow_ray_count', 2), ('shadow_step_count', 8),
                     ('use_gtao', True), ('volumetric_end', 2000), ('use_motion_blur', False)):
            if hasattr(e, k):
                try:
                    setattr(e, k, v)
                except (TypeError, AttributeError):
                    pass
    else:
        r.engine = 'CYCLES'; cy.samples, cy.adaptive_min_samples = spp
        cy.adaptive_threshold = .03 if (DRAFT or engine == 'HOUSE') else .02


def shot(path, fmt='WEBP'):
    """Рендер текущего ракурса в файл; готовый файл не трогаем. Возвращает секунды или None."""
    if os.path.exists(path):
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = r.image_settings
    im.file_format = fmt; im.color_mode = 'RGB'
    if fmt == 'WEBP':
        im.quality = 88
    r.filepath = path
    bpy.context.view_layer.update()
    t = time.time()
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as e:
        if r.engine != 'CYCLES':
            log('EEVEE не запустился (%s) — дальше всё в Cycles' % e); A.eevee = False; use('HOUSE')
            bpy.ops.render.render(write_still=True)
        else:
            raise
    return time.time() - t


def progress(name, i, n, times):
    if times:
        avg = sum(times) / len(times)
        log('%s %d/%d: %.1f с, осталось ≈ %.0f мин' % (name, i + 1, n, times[-1], avg * (n - i - 1) / 60))


# ---------------------------------------------------------------- траектории
ease = lambda t: 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2
clamp = lambda v: max(0.0, min(1.0, v))
lerp = lambda a, c, t: [a[k] + (c[k] - a[k]) * t for k in range(3)]
I = DATA['intro']
CENTER = DATA['aerial']['target']
START = DATA['aerial']['landscape']  # стартовый ракурс сайта = кадр 0 облёта посёлка


def orbit_pose(k):
    """Кадр k облёта посёлка: поворот стартового ракурса вокруг центра (против часовой, если смотреть сверху)."""
    a = math.radians(k * ORBIT_STEP)
    dx, dz = START[0] - CENTER[0], START[2] - CENTER[2]
    return [CENTER[0] + dx * math.cos(a) + dz * math.sin(a), START[1], CENTER[2] - dx * math.sin(a) + dz * math.cos(a)], CENTER


def house_pose(h):
    """Ракурс дома — как houseView на сайте (village.js)."""
    c = h['pos']; size = max(h['W'], h['D'])
    dist = size * 1.75 + 6
    fz = -1 if h['side'] > 0 else 1
    pos = [c[0] + dist * .55, 4 + dist * .22, c[2] + fz * dist * .82]
    return pos, [c[0], h['H'] * .35, c[2]]


def house_orbit_pose(h, k):
    p0, tg = house_pose(h)
    a = math.radians(k * HOUSE_STEP)
    dx, dz = p0[0] - tg[0], p0[2] - tg[2]
    return [tg[0] + dx * math.cos(a) + dz * math.sin(a), p0[1], tg[2] - dx * math.sin(a) + dz * math.cos(a)], tg


def best_orbit_frame(h):
    """Кадр облёта, с которого фасад дома виден лучше всего: камера напротив фасада и поближе."""
    front = (0, -1) if h['side'] > 0 else (0, 1)
    best, score = 0, -9
    for k in range(ORBIT_N):
        p, _ = orbit_pose(k)
        vx, vz = p[0] - h['pos'][0], p[2] - h['pos'][2]
        d = math.hypot(vx, vz)
        s = (vx * front[0] + vz * front[1]) / d - d / 2000
        if s > score:
            best, score = k, s
    return best


APPROACH_N = round(APPROACH_SEC * APPROACH_FPS)  # 84


def approach_pose(h, f):
    """Подлёт: кадр 0 — ракурс на круге облёта, последний — ракурс дома; как пролёт на сайте (startFly)."""
    p0, t0 = orbit_pose(best_orbit_frame(h)); p1, t1 = house_pose(h)
    t = f / (APPROACH_N - 1); e = ease(t)
    arc = math.dist(p0, p1) * .12
    pos = lerp(p0, p1, e); pos[1] += math.sin(math.pi * e) * arc
    return pos, lerp(t0, t1, ease(clamp(t * 1.15)))


INTRO_N = INTRO_SEC * INTRO_FPS + 1  # 241: кадр 0 — над облаками, кадр 240 — облёт посёлка, кадр 0


def intro_pose(f):
    t = f / (INTRO_N - 1)
    return lerp(I['pos'], START, ease(t)), lerp(I['target'], CENTER, ease(clamp(t * I['targetLead'])))


# ---------------------------------------------------------------- manifest
def screen(point):
    v = world_to_camera_view(sc, cam, b(point))
    vis = 0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0
    return [round(v.x, 4), round(1 - v.y, 4), int(vis)]


def house_dir(i):
    return 'houses/%02d' % (i + 1)


def manifest():
    res(); houses = DATA['houses']; frames = []
    for k in range(ORBIT_N):
        look(*orbit_pose(k)); bpy.context.view_layer.update()
        frames.append([screen([h['pos'][0], h['H'] + 1, h['pos'][2]]) for h in houses])
    m = {
        'version': 1, 'width': W, 'height': H, 'fov': DATA['fov'],
        'note': 'Координаты меток: x, y — доля ширины/высоты кадра от левого верхнего угла; v — дом в кадре (1/0, загораживание не учитывается).',
        'village': {
            'orbit': {'frames': ORBIT_N, 'stepDeg': ORBIT_STEP, 'pattern': 'village/orbit/{000}.webp',
                      'direction': 'против часовой стрелки, если смотреть сверху', 'labels': frames},
            'intro': {'file': 'village/intro.mp4', 'fps': INTRO_FPS, 'seconds': INTRO_SEC, 'endsOnOrbitFrame': 0}
        },
        'houses': [{
            'index': i + 1, 'name': h['name'], 'orbitFrame': best_orbit_frame(h),
            'approach': {'file': house_dir(i) + '/approach.mp4', 'fps': APPROACH_FPS, 'frames': APPROACH_N,
                         'from': 'village/orbit/%03d.webp' % best_orbit_frame(h), 'to': house_dir(i) + '/orbit/000.webp'},
            'orbit': {'frames': HOUSE_N, 'stepDeg': HOUSE_STEP, 'pattern': house_dir(i) + '/orbit/{000}.webp'}
        } for i, h in enumerate(houses)]
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    log('manifest.json готов')


# ---------------------------------------------------------------- этапы
def selected_houses():
    hs = list(enumerate(DATA['houses']))
    return [hs[A.house - 1]] if A.house else hs


def clouds(on):
    cloud.hide_render = not on


def stage_orbit(only=None):
    use('CYCLES', SPP_ORBIT); cy.adaptive_threshold = .03 if DRAFT else .02; clouds(False); grass(False); r.use_motion_blur = False; res(); times = []
    for k in (only if only is not None else range(ORBIT_N)):
        look(*orbit_pose(k)); t = shot(os.path.join(OUT, 'village/orbit/%03d.webp' % k))
        if t: times.append(t); progress('облёт посёлка', k, ORBIT_N, times)
    return times


def stage_houses(only=None):
    use('HOUSE'); clouds(False); r.use_motion_blur = False; res(); times = []
    for i, h in selected_houses():
        grass(True, [i])  # густой газон — на участке дома и у соседей
        for k in (only if only is not None else range(HOUSE_N)):
            look(*house_orbit_pose(h, k)); t = shot(os.path.join(OUT, house_dir(i), 'orbit/%03d.webp' % k))
            if t: times.append(t); progress('дом %d, облёт' % (i + 1), k, HOUSE_N, times)
    return times


def stage_approach(only=None):
    use('HOUSE'); clouds(False); r.use_motion_blur = False; res(); times = []
    for i, h in selected_houses():
        grass(True, [i])
        folder = os.path.join(WORK, 'approach_%02d' % (i + 1))
        for f in (only if only is not None else range(APPROACH_N)):
            look(*approach_pose(h, f)); t = shot(os.path.join(folder, '%03d.png' % f), 'PNG')
            if t: times.append(t); progress('дом %d, подлёт' % (i + 1), f, APPROACH_N, times)
        if only is None:
            encode(folder, os.path.join(OUT, house_dir(i), 'approach.mp4'), APPROACH_FPS)
    return times


def stage_intro(only=None):
    use('CYCLES', SPP_INTRO); cy.adaptive_threshold = .03 if DRAFT else .015; clouds(True); grass(False); res(); times = []
    # облака тают, когда камера уже под ними (как на сайте), — к последнему кадру их нет
    fn = cm.node_tree.nodes['fade'].outputs[0]
    for t, v in ((0, 1), (.6, 1), (.82, 0), (1, 0)):
        fn.default_value = v; fn.keyframe_insert('default_value', frame=round(t * (INTRO_N - 1)))
    # ключи камеры на каждый кадр — для размытия в движении
    for f in range(INTRO_N):
        look(*intro_pose(f)); cam.keyframe_insert('location', frame=f); aim.keyframe_insert('location', frame=f)
    sc.frame_start, sc.frame_end = 0, INTRO_N - 1; r.fps = INTRO_FPS
    r.use_motion_blur = not DRAFT
    folder = os.path.join(WORK, 'intro')
    for f in (only if only is not None else range(INTRO_N)):
        sc.frame_set(f); t = shot(os.path.join(folder, '%03d.png' % f), 'PNG')
        if t: times.append(t); progress('вступление', f, INTRO_N, times)
    if only is None:
        encode(folder, os.path.join(OUT, 'village/intro.mp4'), INTRO_FPS)
        # стык: последний кадр вступления должен совпасть с кадром 0 облёта
        shutil.copyfile(os.path.join(folder, '%03d.png' % (INTRO_N - 1)), os.path.join(WORK, 'intro_last.png'))
    for o in (cam, aim):
        o.animation_data_clear()
    cm.node_tree.animation_data_clear(); fn.default_value = 1
    return times


def encode(folder, path, fps):
    """Кадры PNG → MP4 (H.264) средствами Blender; если не вышло — команда ffmpeg в лог."""
    files = sorted(f for f in os.listdir(folder) if f.endswith('.png'))
    try:
        enc = bpy.data.scenes.new('Монтаж'); enc.render.fps = fps
        enc.render.resolution_x, enc.render.resolution_y = r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100
        enc.render.resolution_percentage = 100
        enc.sequence_editor_create()
        strips = enc.sequence_editor.strips if hasattr(enc.sequence_editor, 'strips') else enc.sequence_editor.sequences
        st = strips.new_image('кадры', os.path.join(folder, files[0]), 1, 1)
        for f in files[1:]:
            st.elements.append(f)
        enc.frame_start, enc.frame_end = 1, len(files)
        enc.render.image_settings.file_format = 'FFMPEG'
        ff = enc.render.ffmpeg; ff.format = 'MPEG4'; ff.codec = 'H264'; ff.constant_rate_factor = 'HIGH'; ff.gopsize = 12
        enc.view_settings.view_transform = 'Standard'
        os.makedirs(os.path.dirname(path), exist_ok=True)
        enc.render.filepath = path
        with bpy.context.temp_override(scene=enc):
            bpy.ops.render.render(animation=True, scene=enc.name)
        bpy.data.scenes.remove(enc)
        log('видео:', path)
    except Exception as e:
        log('MP4 не собран (%s). Соберите: ffmpeg -framerate %d -i "%s/%%03d.png" -c:v libx264 -crf 18 -pix_fmt yuv420p "%s"' % (e, fps, folder, path))


# ---------------------------------------------------------------- запуск
if A.what in ('manifest', 'all', 'test'):
    manifest()
if A.what == 'test':
    # по кадру каждого вида (в папку _work/test), время и прогноз на всё
    keep_out = OUT; OUT = os.path.join(WORK, 'test'); WORK = os.path.join(OUT, '_work')
    A.house = A.house or 1
    est = {}
    for name, fn, frame, total in (('облёт посёлка (Cycles)', stage_orbit, [0], ORBIT_N),
                                   ('облёт дома (%s)' % ('EEVEE' if A.eevee else 'Cycles'), stage_houses, [0], HOUSE_N * 6),
                                   ('подлёт (%s)' % ('EEVEE' if A.eevee else 'Cycles'), stage_approach, [APPROACH_N // 2], APPROACH_N * 6),
                                   ('вступление (Cycles, облака)', stage_intro, [INTRO_N // 2], INTRO_N)):
        fn(frame)                 # первый кадр — с загрузкой сцены в видеокарту
        t = fn([frame[0] + 1])    # второй — чистое время кадра
        est[name] = (t[0] if t else 0, total)
    log('================ ПРОГНОЗ ================')
    tot = 0
    for name, (sec, n) in est.items():
        log('%-30s %5.1f с × %4d кадров ≈ %4.0f мин' % (name, sec, n, sec * n / 60)); tot += sec * n
    log('ВСЕГО ≈ %.0f мин (+ импорт сцены и сборка видео ≈ 5 мин)' % (tot / 60))
    log('кадры проверки: %s' % OUT)
if A.what in ('orbit', 'all'):
    stage_orbit()
if A.what in ('houses', 'all'):
    stage_houses()
if A.what in ('approach', 'all'):
    stage_approach()
if A.what in ('intro', 'all'):
    stage_intro()
log('готово:', OUT)
