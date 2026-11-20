"""
«Агент 68» — кадры «псевдо-3D» для демо-сайта агентства недвижимости (Тамбов). Образец — Арден (estate/blender).

Сцены в браузере нет: каждый объект строится процедурно здесь, по параметрам ниже (размеры, этажи, цвета).
Внешние ассеты — только деревья и кусты Poly Haven (CC0), скачиваются сами.

  blender -b -P agent68_render.py -- --what test   --object 1 [--quality draft|final] [--cpu]
  blender -b -P agent68_render.py -- --what all    --object 1

--what   test      по 2 кадра каждого вида: время кадра и прогноз на всё
         orbit     облёт: 144 кадра через 2,5° (Cycles + шумодав)
         approach  подлёт: 84 кадра (3,5 с при 24 к/с), последний = кадр 0 облёта (EEVEE)
         mask      маска этажа: тот же путь камеры, этаж белый, всё остальное чёрное, без света (секунды на кадр)
         still     один черновой кадр облёта (--frame N), для сверки с фото
         manifest  manifest.json для сайта (метки объекта по кадрам облёта)
         all       облёт → подлёт → маска → manifest
Готовые кадры пропускаются: прерванный рендер продолжается той же командой.
Кадры — WebP трёх размеров sm/md/hd (640/1280/1920), как в Ардене: renders/obj1/orbit/{sm,md,hd}/000.webp …
"""
import argparse
import json
import math
import os
import random
import sys
import time

import bpy
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))

# ============================================================================ ОБЪЕКТЫ
# Все размеры в метрах. План: X — вдоль главного фасада (вправо), Y — от улицы вглубь (назад), Z — вверх.
OBJECTS = {
    1: dict(
        name='3-к квартира, ул. Чичерина, 64', floor=4,           # этаж квартиры — для маски
        floors=9, floor_h=3.0, plinth=0.6,                        # жилые этажи, высота этажа, цоколь
        # корпус — главный фасад на улицу (оранжевый), от цилиндра вправо; глубина = длина торца
        wing_a=dict(length=38.0, depth=16.0, cols=8),
        cyl=dict(d=11.0, extra_floors=1, glaze_posts=40),         # цилиндр на углу: диаметр, на этаж выше корпуса
        tower=dict(w=6.0, d=4.0, above_roof=6.5),                 # белая башня лестницы и лифта (выше цилиндра)
        cafe=dict(h=4.5, w=6.0, along_a=5.0),                    # кафе вдоль торца (фото 14): ширина от торца, огибает цилиндр, на главный фасад — 5 м
        colors=dict(
            brick_front=(0.92, 0.42, 0.035),  # жёлто-оранжевый кирпич главного фасада
            brick_back=(0.86, 0.84, 0.80),    # белый кирпич заднего фасада
            insert_back=(0.84, 0.52, 0.18),   # оранжевые вставки и пояса сзади
            pilaster=(0.90, 0.89, 0.86),      # белые пилястры
            band=(0.25, 0.13, 0.08),          # тёмно-коричневые пояса на перекрытиях
            cyl_band=(0.30, 0.17, 0.11),      # коричневый кирпич под лентой окон цилиндра
            cyl_top=(0.78, 0.78, 0.76),       # светло-серый верх цилиндра
            tower=(0.92, 0.91, 0.88),         # белая башня
            cafe=(0.20, 0.07, 0.07),          # бордово-коричневый павильон
            frame=(0.93, 0.93, 0.92),         # белые рамы
            roof=(0.42, 0.42, 0.42),
        ),
        neighbors=[  # окружение: высотки 14–16 этажей за кругом облёта (≥160 м от центра — камера не упирается в стену) (x, y, длина, глубина, этажей, поворот°, цвет)
            (167, 44, 34, 14, 16, 90, (0.80, 0.56, 0.24)),
            (64, 157, 48, 14, 14, 0, (0.78, 0.72, 0.60)),
            (-124, 90, 40, 14, 15, 90, (0.76, 0.52, 0.26)),
            (128, 116, 30, 14, 16, 0, (0.78, 0.70, 0.56)),
        ],
        # камера облёта: центр, радиус, высота, начальный азимут (0 — с улицы, спереди-слева, как фото 3)
        orbit=dict(center=(12.0, 6.0, 15.0), radius=108.0, height=22.0, start=212.0),
        # синий час: свет — процедурное небо (солнце на 2° под горизонтом за домом), в кадре — цветные облака HDRI
        sky=dict(hdri='nishita', rotate=47.0, strength=1.0, exposure=1.2,
                 backdrop='industrial_sunset_puresky', backdrop_rotate=101.0, backdrop_strength=1.0),
    ),
}

# ============================================================================ ПАРАМЕТРЫ ЗАПУСКА
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser(prog='agent68_render.py')
ap.add_argument('--what', default='test', choices=['test', 'orbit', 'approach', 'mask', 'still', 'manifest', 'all'])
ap.add_argument('--object', type=int, default=1)
ap.add_argument('--quality', default='final', choices=['draft', 'final'])
ap.add_argument('--cpu', action='store_true', help='без видеокарты (только для проверки)')
ap.add_argument('--frame', type=int, default=0, help='для --what still')
ap.add_argument('--sky', default='', help='проба неба: slug HDRI Poly Haven или nishita; :поворот, :сила, :экспозиция')
ap.add_argument('--view', default='orbit', choices=['orbit', 'street', 'side'], help='для --what still: street — с улицы, как фото фасада; side — на торец, как фото 14')
ap.add_argument('--out', default=os.path.join(HERE, 'renders'))
ap.add_argument('--assets', default=os.path.join(HERE, 'assets'), help='папка для деревьев Poly Haven')
ap.add_argument('--percent', type=int, default=0, help='масштаб разрешения, %% (для проверки)')
A = ap.parse_args(argv)
O = OBJECTS[A.object]
C = O['colors']
DRAFT = A.quality == 'draft'
W, H, FOV = 1920, 1080, 30.0   # длиннее фокус, чем у Ардена: дом крупно, без «дрона»
ORBIT_N, ORBIT_STEP = 144, 2.5
APPROACH_FPS, APPROACH_N = 24, 84
SIZES = {'sm': (640, 60), 'md': (1280, 74), 'hd': (1920, 72)}  # ширина, качество WebP (как в Ардене)
OUT = os.path.join(os.path.abspath(A.out), 'obj%d' % A.object)
os.makedirs(OUT, exist_ok=True)
STATUS = {'stage': '', 'done': 0, 'total': 0, 'times': []}
R = random.Random(68 + A.object)


def log(*a):
    print('[agent68]', *a, flush=True)


def write_status(extra=''):
    t = STATUS['times'][-20:]; avg = sum(t) / len(t) if t else 0
    lines = ['Агент 68 — объект %d (%s), %s' % (A.object, O['name'], time.strftime('%d.%m %H:%M')),
             'Сейчас: %s — %d из %d' % (STATUS['stage'], STATUS['done'], STATUS['total'])]
    if avg:
        lines.append('Кадр в среднем %.1f с, этапу осталось ≈ %.0f мин' % (avg, avg * (STATUS['total'] - STATUS['done']) / 60))
    if extra:
        lines.append(extra)
    with open(os.path.join(OUT, 'status.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


# ============================================================================ АССЕТЫ POLY HAVEN (CC0)
import urllib.request
UA = {'User-Agent': 'Mozilla/5.0 (render-script)'}  # без него Poly Haven отвечает 403


def ph_get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for k in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(dst + '.part', 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b)
            os.replace(dst + '.part', dst); return dst
        except Exception as e:
            log('повтор загрузки (%s): %s' % (e, url)); time.sleep(3 * (k + 1))
    raise RuntimeError('не скачалось: ' + url)


def ph_texture(slug, res='2k'):
    d = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + slug, headers=UA), timeout=60))
    out = {}
    for kind, ext in (('Diffuse', 'jpg'), ('nor_gl', 'jpg'), ('Rough', 'jpg')):
        out[kind] = ph_get(d[kind][res][ext]['url'], os.path.join(A.assets, 'textures', slug, '%s_%s_%s.%s' % (slug, kind, res, ext)))
    return out


def ph_hdri(slug, res):
    d = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + slug, headers=UA), timeout=60))
    return ph_get(d['hdri'][res]['hdr']['url'], os.path.join(A.assets, 'hdri', '%s_%s.hdr' % (slug, res)))


# ============================================================================ МАТЕРИАЛЫ
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
MATS = {}


def principled(name, color, rough=0.8, metal=0.0, spec=0.3, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1); b.inputs['Emission Strength'].default_value = emit[1]
    MATS[name] = m
    return m


def brick(name, color, scale=1.6):
    """кирпич: фото-фактура white_bricks (Poly Haven, CC0) — яркость и рельеф из фото, цвет — фасада;
    проекция «коробкой» по координатам объекта (стены любой ориентации без швов)"""
    if name in MATS:
        return MATS[name]
    m = principled(name, color, rough=0.85)
    try:
        T = BRICK_TEX
    except NameError:
        return m
    nt, L = m.node_tree, m.node_tree.links
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale,) * 3; L.new(tc.outputs['Object'], mp.inputs['Vector'])

    def img(path, color_space):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = color_space; t.projection = 'BOX'; t.projection_blend = 0.15
        L.new(mp.outputs['Vector'], t.inputs['Vector']); return t
    b = nt.nodes['Principled BSDF']
    bw = nt.nodes.new('ShaderNodeRGBToBW'); L.new(img(T['Diffuse'], 'sRGB').outputs['Color'], bw.inputs['Color'])
    soft = nt.nodes.new('ShaderNodeMix'); soft.data_type = 'FLOAT'; soft.inputs['Factor'].default_value = 0.72
    L.new(bw.outputs['Val'], soft.inputs['A']); soft.inputs['B'].default_value = BRICK_MEAN       # разброс фактуры ×0,28 — без «песка» издали
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 1.0 / BRICK_MEAN; L.new(soft.outputs['Result'], k.inputs[0])
    sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'; sc_.inputs[0].default_value = color
    L.new(k.outputs[0], sc_.inputs['Scale']); L.new(sc_.outputs['Vector'], b.inputs['Base Color'])
    L.new(img(T['Rough'], 'Non-Color').outputs['Color'], b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.8
    L.new(img(T['nor_gl'], 'Non-Color').outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


def glass(name='стекло', bright=1.0):
    """окно: отражение неба + свет комнаты за стеклом. lit (атрибут грани) — 0 тёмная комната, 0,3…1 — светится;
    оттенок от тёплого (лампы) до нейтрального (шторы) — по той же случайной величине"""
    if name in MATS:
        return MATS[name]
    m = principled(name, (0.015, 0.018, 0.022), rough=0.03, spec=1.0)
    nt, L = m.node_tree, m.node_tree.links; b = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = 'lit'
    tone = nt.nodes.new('ShaderNodeMath'); tone.operation = 'FRACT'
    t7 = nt.nodes.new('ShaderNodeMath'); t7.operation = 'MULTIPLY'; t7.inputs[1].default_value = 7.31
    L.new(at.outputs['Fac'], t7.inputs[0]); L.new(t7.outputs[0], tone.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); L.new(tone.outputs[0], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (1.0, 0.34, 0.09, 1); ramp.color_ramp.elements[1].color = (1.0, 0.55, 0.24, 1)
    L.new(ramp.outputs['Color'], b.inputs['Emission Color'])
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.6; L.new(at.outputs['Fac'], pw.inputs[0])
    # внутри окна: ярче к потолку (светильник), мягче к подоконнику — по высоте внутри этажа (3 м)
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sz = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sz.inputs[0])
    zf = nt.nodes.new('ShaderNodeMath'); zf.operation = 'WRAP'; zf.inputs[1].default_value = 0.0; zf.inputs[2].default_value = 3.0
    zs = nt.nodes.new('ShaderNodeMath'); zs.operation = 'SUBTRACT'; zs.inputs[1].default_value = 0.6
    L.new(sz.outputs['Z'], zs.inputs[0]); L.new(zs.outputs[0], zf.inputs[0])
    gr = nt.nodes.new('ShaderNodeMapRange'); L.new(zf.outputs[0], gr.inputs['Value'])
    gr.inputs['From Min'].default_value = 0.9; gr.inputs['From Max'].default_value = 2.8; gr.inputs['To Min'].default_value = 0.35; gr.inputs['To Max'].default_value = 1.3
    st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 2.6 * bright
    L.new(pw.outputs[0], st.inputs[0])
    st2 = nt.nodes.new('ShaderNodeMath'); st2.operation = 'MULTIPLY'; L.new(st.outputs[0], st2.inputs[0]); L.new(gr.outputs['Result'], st2.inputs[1])
    L.new(st2.outputs[0], b.inputs['Emission Strength'])
    return m


def lit_value(p_dark=0.45):
    return 0.0 if R.random() < p_dark else R.uniform(0.35, 1.0)


def windows_texture(name, wall, win=(0.05, 0.06, 0.08), cell=(3.2, 2.9), size=(1.5, 1.5)):
    """соседние высотки: окна — сетка по координатам стены (окно, где доли ячейки по x и z меньше size/cell)"""
    if name in MATS:
        return MATS[name]
    m = principled(name, wall, rough=0.85)
    nt, L = m.node_tree, m.node_tree.links
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ'); sn = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(geo.outputs['Position'], sp.inputs[0]); L.new(geo.outputs['Normal'], sn.inputs[0])
    ax = nt.nodes.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; L.new(sn.outputs['X'], ax.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'FLOAT'
    L.new(ax.outputs[0], mix.inputs['Factor']); L.new(sp.outputs['X'], mix.inputs['A']); L.new(sp.outputs['Y'], mix.inputs['B'])
    def cellmask(src, c, s_):
        d = nt.nodes.new('ShaderNodeMath'); d.operation = 'DIVIDE'; L.new(src, d.inputs[0]); d.inputs[1].default_value = c
        fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; L.new(d.outputs[0], fr.inputs[0])
        lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; L.new(fr.outputs[0], lt.inputs[0]); lt.inputs[1].default_value = s_ / c
        return lt.outputs[0]
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    L.new(cellmask(mix.outputs['Result'], cell[0], size[0]), mul.inputs[0]); L.new(cellmask(sp.outputs['Z'], cell[1], size[1]), mul.inputs[1])
    # цоколь без окон и верх-парапет: окна только выше 3 м
    up = nt.nodes.new('ShaderNodeMath'); up.operation = 'GREATER_THAN'; L.new(sp.outputs['Z'], up.inputs[0]); up.inputs[1].default_value = 3.0
    m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; L.new(mul.outputs[0], m2.inputs[0]); L.new(up.outputs[0], m2.inputs[1])
    # свет в окнах: шум по номеру ячейки окна (одно окно — одно значение), горит ~35 %
    def cellidx(src, c):
        d = nt.nodes.new('ShaderNodeMath'); d.operation = 'DIVIDE'; L.new(src, d.inputs[0]); d.inputs[1].default_value = c
        f = nt.nodes.new('ShaderNodeMath'); f.operation = 'FLOOR'; L.new(d.outputs[0], f.inputs[0]); return f.outputs[0]
    ci = nt.nodes.new('ShaderNodeCombineXYZ'); L.new(cellidx(mix.outputs['Result'], cell[0]), ci.inputs['X']); L.new(cellidx(sp.outputs['Z'], cell[1]), ci.inputs['Y'])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(ci.outputs[0], wn.inputs['Vector'])
    on = nt.nodes.new('ShaderNodeMath'); on.operation = 'GREATER_THAN'; L.new(wn.outputs['Value'], on.inputs[0]); on.inputs[1].default_value = 0.72
    em = nt.nodes.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; L.new(on.outputs[0], em.inputs[0]); L.new(m2.outputs[0], em.inputs[1])
    ems = nt.nodes.new('ShaderNodeMath'); ems.operation = 'MULTIPLY'; ems.inputs[1].default_value = 1.0; L.new(em.outputs[0], ems.inputs[0])
    bb = nt.nodes['Principled BSDF']; bb.inputs['Emission Color'].default_value = (1.0, 0.66, 0.38, 1); L.new(ems.outputs[0], bb.inputs['Emission Strength'])
    cm = nt.nodes.new('ShaderNodeMix'); cm.data_type = 'RGBA'; L.new(m2.outputs[0], cm.inputs['Factor'])
    cm.inputs['A'].default_value = (*wall, 1); cm.inputs['B'].default_value = (*win, 1)
    b = nt.nodes['Principled BSDF']; L.new(cm.outputs['Result'], b.inputs['Base Color'])
    rg = nt.nodes.new('ShaderNodeMapRange'); L.new(m2.outputs[0], rg.inputs['Value']); rg.inputs['To Min'].default_value = 0.85; rg.inputs['To Max'].default_value = 0.08
    L.new(rg.outputs['Result'], b.inputs['Roughness'])
    return m


# ============================================================================ ГЕОМЕТРИЯ
class Builder:
    """коробки и кольца собираются в один меш на материал — сотни окон без сотен объектов"""

    def __init__(self):
        self.bms = {}

    def bm(self, mat):
        if mat not in self.bms:
            self.bms[mat] = bmesh.new(); self.bms[mat].faces.layers.float.new('lit')
        return self.bms[mat]

    def box(self, mat, c, s, rz=0.0, lit=0.0):
        """коробка: центр c, размер s (x, y, z), поворот вокруг Z (рад); lit — свет комнаты за окном"""
        M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((*s, 1))
        b = self.bm(mat); res = bmesh.ops.create_cube(b, size=1.0, matrix=M)
        if lit:
            lay = b.faces.layers.float['lit']
            for f in {f for v in res['verts'] for f in v.link_faces}: f[lay] = lit

    def ring(self, mat, c, r_in, r_out, z0, z1, a0=0.0, a1=360.0, seg=72, lit=0.0):
        """кольцо (сектор) от r_in до r_out, высота z0..z1; углы в градусах"""
        b = self.bm(mat); n = max(3, int(seg * (a1 - a0) / 360)); full = abs(a1 - a0) >= 359.9
        nf0 = len(b.faces)
        rows = []
        for i in range(n + (0 if full else 1)):
            a = math.radians(a0 + (a1 - a0) * i / n)
            ca, sa = math.cos(a), math.sin(a)
            rows.append([b.verts.new((c[0] + r * ca, c[1] + r * sa, z)) for r, z in ((r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1))])
        k = len(rows)
        for i in range(k if full else k - 1):
            p, q = rows[i], rows[(i + 1) % k]
            for j in range(4):
                b.faces.new((p[j], q[j], q[(j + 1) % 4], p[(j + 1) % 4]))
        if not full:
            b.faces.new(rows[0][::-1]); b.faces.new(rows[-1])
        if lit:
            lay = b.faces.layers.float['lit']; b.faces.ensure_lookup_table()
            for f in list(b.faces)[nf0:]: f[lay] = lit

    def build(self, name, smooth=False):
        objs = []
        for mat, b in self.bms.items():
            me = bpy.data.meshes.new(name + '_' + mat.name); b.normal_update(); b.to_mesh(me); b.free()
            me.materials.append(mat)
            if smooth:
                for p in me.polygons: p.use_smooth = True
            o = bpy.data.objects.new(name + '_' + mat.name, me); sc.collection.objects.link(o); objs.append(o)
        self.bms = {}
        return objs


def curtain():
    """шторы и тюль: ткань, светится от комнаты (атрибут lit той же грани — тот же свет, что у окна)"""
    if 'штора' in MATS:
        return MATS['штора']
    m = principled('штора', (0.42, 0.38, 0.32), rough=0.95)
    nt, L = m.node_tree, m.node_tree.links; b = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = 'lit'
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 1.1; L.new(at.outputs['Fac'], k.inputs[0])
    b.inputs['Emission Color'].default_value = (1.0, 0.62, 0.34, 1); L.new(k.outputs[0], b.inputs['Emission Strength'])
    return m


def window(B, at, rz, u, wz, ww, wh, frame, lit=None, skin=0.22):
    """окно в проёме стены: рама, стекло с комнатой за ним, импост, шторы (случайно), отлив на уровне стены"""
    lit = lit_value() if lit is None else lit
    B.box(frame, at(u, 0.03, wz), (ww, 0.06, wh), rz)                                 # коробка рамы
    B.box(glass(), at(u, 0.07, wz), (ww - 0.2, 0.02, wh - 0.2), rz, lit=lit)           # стекло
    B.box(frame, at(u, 0.085, wz), (0.07, 0.03, wh - 0.2), rz)                         # импост
    r = R.random(); cw = curtain()
    if r < 0.42:                                                                       # шторы по краям
        s = R.uniform(0.18, 0.34) * ww
        for side in (-1, 1):
            B.box(cw, at(u + side * (ww - 0.2 - s) / 2, 0.06, wz), (s, 0.012, wh - 0.22), rz, lit=lit * 0.8)
    elif r < 0.55:                                                                     # тюль на половину окна
        B.box(cw, at(u - (ww - 0.2) / 4, 0.06, wz), ((ww - 0.2) / 2, 0.012, wh - 0.22), rz, lit=lit * 0.6)
    elif r < 0.62:                                                                     # жалюзи до середины
        B.box(cw, at(u, 0.06, wz + (wh - 0.2) / 4), (ww - 0.2, 0.012, (wh - 0.2) / 2), rz, lit=lit * 0.5)
    B.box(principled('подоконник', (0.85, 0.85, 0.83), rough=0.6), at(u, skin + 0.05, wz - wh / 2 - 0.03), (ww + 0.2, 0.2, 0.06), rz)  # отлив


def facade(B, x0, y0, length, rz, floors, fh, plinth, cols, style, z_top, wall=None, skin=0.22, win=(1.62, 1.62), band=None):
    """фасад вдоль линии от (x0, y0) длиной length под углом rz (рад; наружу — правая нормаль).
    Стена — «шкура» толщиной skin из простенков и перемычек: окна в настоящих проёмах с откосами.
    style: 'front' — оранжевый кирпич, белые пилястры между парами окон, коричневые пояса на перекрытиях;
           'back'  — белый кирпич, оранжевые вертикальные вставки и пояса;
           'panel' — соседний дом: стена wall, светлые пояса перекрытий, лоджии через колонку."""
    d = Vector((math.cos(rz), math.sin(rz), 0)); nrm = Vector((d.y, -d.x, 0))  # наружу — вправо от направления
    at = lambda u, off, z: Vector((x0, y0, 0)) + d * u + nrm * off + Vector((0, 0, z))
    step = length / cols
    ww, wh = win
    wall = wall or brick('кирпич_фасад', C['brick_front']) if style == 'front' else wall or brick('кирпич_сзади', C['brick_back'])
    fr = principled('рама', C['frame'], rough=0.4)
    band = band or principled('пояс', C['band'], rough=0.8)
    pil = principled('пилястра', C['pilaster'], rough=0.8)
    ins = brick('вставка_сзади', C['insert_back'])
    sk = lambda u0, u1, z0, z1: B.box(wall, at((u0 + u1) / 2, skin / 2, (z0 + z1) / 2), (u1 - u0, skin, z1 - z0), rz) if u1 > u0 and z1 > z0 else None
    for f in range(floors):
        z = plinth + f * fh
        wz = z + fh * 0.55
        zb, zt = wz - wh / 2, wz + wh / 2
        sk(-skin, length + skin, z, zb); sk(-skin, length + skin, zt, z + fh)      # перемычки под и над окнами
        loggia = style == 'panel' and f > 0
        for c in range(cols + 1):                                                     # простенки
            u0 = (c - 0.5) * step + ww / 2 if c > 0 else -skin
            u1 = (c + 0.5) * step - ww / 2 if c < cols else length + skin
            sk(u0, u1, zb, zt)
        # пояса перекрытий
        if style == 'panel':
            B.box(band, at(length / 2, skin + 0.06, z + 0.12), (length + 2 * skin + 0.1, 0.12, 0.24), rz)
        else:
            B.box(band if style == 'front' else ins, at(length / 2, skin + 0.06, z + 0.15), (length + 2 * skin + 0.12, 0.12, 0.3 if style == 'front' else 0.45), rz)
        if style == 'front':
            B.box(principled('пояс_светлый', (0.72, 0.71, 0.68), rough=0.85), at(length / 2, skin + 0.05, zb - 0.3), (length + 2 * skin + 0.1, 0.1, 0.4), rz)
        for c in range(cols):
            u = (c + 0.5) * step
            window(B, at, rz, u, wz, ww, wh, fr, skin=skin)
            if style == 'panel' and c % 3 == 1 and f > 0 and (f + c) % 2 == 0:       # остеклённая лоджия
                lw = min(step * 0.9, 3.0)
                B.box(band, at(u, skin + 0.6, z + 0.08), (lw, 1.2, 0.16), rz)
                B.box(wall, at(u, skin + 1.17, z + 0.55), (lw, 0.06, 0.9), rz)
                B.box(glass(), at(u, skin + 1.18, z + 1.0 + (fh - 1.1) / 2), (lw - 0.1, 0.03, fh - 1.2), rz, lit=lit_value(0.6) * 0.6)
                for sd in (-1, 1):
                    B.box(wall, at(u + sd * lw / 2, skin + 0.6, z + fh / 2), (0.1, 1.2, fh), rz)
            elif style != 'panel' and R.random() < 0.18:                               # кондиционер
                B.box(principled('кондиционер', (0.88, 0.88, 0.86), rough=0.5), at(u + 1.15, skin + 0.3, z + fh * 0.32), (0.8, 0.3, 0.55), rz)
    if style == 'panel':
        return
    h = z_top
    for c in range(0, cols + 1, 2):
        u = c * step
        if style == 'front':
            B.box(pil, at(u, skin + 0.09, h / 2), (0.55, 0.18, h), rz)
        else:
            B.box(ins, at(u, skin + 0.04, h / 2), (0.9, 0.08, h), rz)


def entrance(B, p, rz, w=1.5, door_h=2.3, canopy=(2.4, 1.5), z_can=2.75, steps=0.0, bright=0.9, lamp=True):
    """вход: портал, остеклённая дверь со светом тамбура, козырёк, ступени, светильник над дверью.
    p — точка на стене у земли, rz — направление стены (наружу — правая нормаль)"""
    d = Vector((math.cos(rz), math.sin(rz), 0)); nrm = Vector((d.y, -d.x, 0))
    at = lambda u, off, z: Vector(p) + d * u + nrm * off + Vector((0, 0, z))
    dark = principled('рама_тёмная', (0.12, 0.10, 0.10))
    conc = principled('козырёк', (0.55, 0.54, 0.52), rough=0.8)
    z0 = steps
    B.box(dark, at(0, 0.1, z0 + (door_h + 0.15) / 2), (w + 0.3, 0.2, door_h + 0.15), rz)          # портал
    B.box(glass('стекло_дверь', 0.8), at(0, 0.21, z0 + door_h / 2), (w - 0.1, 0.02, door_h - 0.1), rz, lit=bright)
    B.box(dark, at(0, 0.225, z0 + door_h / 2), (0.06, 0.02, door_h - 0.1), rz)
    B.box(dark, at(w * 0.3, 0.24, z0 + 1.05), (0.04, 0.05, 0.5), rz)                              # ручка
    B.box(conc, at(0, canopy[1] / 2, z_can + z0), (canopy[0], canopy[1], 0.16), rz)               # козырёк
    for sd in (-1, 1):                                                                               # тяги козырька
        B.box(dark, at(sd * (canopy[0] / 2 - 0.1), canopy[1] * 0.45, z_can + z0 + 0.5), (0.04, canopy[1] * 0.9, 0.04), rz)
    k = 0
    while steps > 0 and k * 0.15 < steps:                                                           # ступени
        B.box(conc, at(0, 0.6 + (int(steps / 0.15) - k) * 0.3 / 2, k * 0.15 + 0.075), (w + 1.0, 0.6 + (int(steps / 0.15) - k) * 0.3, 0.15), rz); k += 1
    if lamp:
        B.box(principled('плафон', (1, 1, 1), emit=((1.0, 0.75, 0.48), 12.0)), at(0, canopy[1] * 0.5, z_can + z0 - 0.1), (0.3, 0.3, 0.04), rz)
        lamp_light('свет_входа', tuple(at(0, canopy[1] * 0.5, z_can + z0 - 0.2)), 'POINT', 40.0, (1.0, 0.72, 0.45), 0.15)


def neighbor(B, i, x, y, L, D, nf, rot, col):
    """соседний дом: тёмный цоколь с магазинами, этажи с настоящими окнами, лоджии, пояса, подъезды, техника на крыше"""
    fh, base = 2.9, 3.2
    rz = math.radians(rot); c_, s_ = math.cos(rz), math.sin(rz)
    P = lambda u, v: (x + u * c_ - v * s_, y + u * s_ + v * c_)
    floors = nf - 1; h = base + floors * fh + 0.4
    wall = principled('стена_соседи_%d' % i, col, rough=0.85)
    B.box(wall, (x, y, h / 2), (L, D, h), rz)
    B.box(principled('кровля', C['roof']), (x, y, h + 0.5), (L + 0.6, D + 0.6, 1.0), rz)
    band = principled('пояс_соседи_%d' % i, tuple(min(1.0, c * 1.3 + 0.04) for c in col), rough=0.8)
    sides = ((-L / 2, -D / 2, 0.0, L), (L / 2, -D / 2, math.pi / 2, D), (L / 2, D / 2, math.pi, L), (-L / 2, D / 2, -math.pi / 2, D))
    for (u, v, a, ln) in sides:
        px, py = P(u, v)
        facade(B, px, py, ln, rz + a, floors, fh, base, max(2, round(ln / 3.2)), 'panel', h, wall=wall, skin=0.18, win=(1.45, 1.5), band=band)
    stone = principled('цоколь_соседи', (0.10, 0.095, 0.09), rough=0.7)
    B.box(stone, (x, y, base / 2), (L + 0.5, D + 0.5, base), rz)
    for u in (-L * 0.3, 0.0, L * 0.3):                                                     # магазины со стороны улицы
        px, py = P(u, -D / 2 - 0.26)
        B.box(glass('витрина_соседи', 0.35), (px, py, 1.5), (L * 0.22, 0.04, 1.9), rz, lit=lit_value(0.35))
    px, py = P(0, -D / 2 - 0.25); B.box(stone, (px, py - 0 * 0, 3.3), (L + 0.8, 1.2, 0.2), rz)  # козырёк над витринами
    for u in (-L * 0.3, L * 0.3):                                                          # подъезды во двор
        px, py = P(u, D / 2 + 0.25)
        entrance(B, (px, py, 0), rz + math.pi, lamp=R.random() < 0.7)
    unit = principled('крышная_техника', (0.35, 0.35, 0.36), rough=0.6, metal=0.3)
    for (u, v, sx, sy, sz) in ((-L * 0.3, 0, 3, 2.4, 2.2), (L * 0.15, -D * 0.2, 2, 2, 1.4), (L * 0.32, D * 0.15, 4, 2.5, 3.0)):
        B.box(unit, (*P(u, v), h + 1.0 + sz / 2), (sx, sy, sz), rz)


def build_object_1():
    """план по фото 12–14: корпус x 0..L, главный фасад y=0 (на улицу), торец x=0.
    Цилиндр — на углу главного фасада и торца; белая башня — на дальнем углу торца; между ними узкая оранжевая стена.
    Кафе — прямоугольный павильон вдоль всего торца, огибает цилиндр и чуть заходит на главный фасад."""
    o = O; fh, nf, pl = o['floor_h'], o['floors'], o['plinth']
    top = pl + nf * fh                               # верх жилых этажей
    a, cy, tw, cafe = o['wing_a'], o['cyl'], o['tower'], o['cafe']
    L, D = a['length'], a['depth']
    rC = cy['d'] / 2
    B = Builder()
    front = brick('кирпич_фасад', C['brick_front'])
    roof = principled('кровля', C['roof'])
    # --- корпус
    B.box(front, (L / 2, D / 2, top / 2), (L, D, top))
    B.box(roof, (L / 2, D / 2, top + 0.6), (L + 0.3, D + 0.3, 1.2))  # парапет
    facade(B, 0, 0, L, 0.0, nf, fh, pl, a['cols'], 'front', top)                    # главный фасад
    facade(B, L, D, L, math.pi, nf, fh, pl, a['cols'], 'back', top)                 # задний
    facade(B, L, 0, D, math.pi / 2, nf, fh, pl, 3, 'front', top)                    # дальний торец
    # ближний торец x=0: узкая оранжевая стена между башней и цилиндром
    wall = D - tw['w'] - rC
    if wall > 1.5:
        facade(B, 0, D - tw['w'], wall, -math.pi / 2, nf, fh, pl, max(1, round(wall / 4.5)), 'front', top)
    # подъезды во двор (задний фасад): в простенках между окнами, с крыльцом над цоколем
    stp = L / a['cols']
    for c in (1, 3, 5):
        entrance(B, (L - c * stp, D + 0.22, 0), math.pi, steps=0.45, z_can=2.55)
    # --- башня лестницы и лифта: белая, на дальнем углу торца, выступает из торца, выше цилиндра
    th = top + tw['above_roof']
    tx, ty = -tw['d'] / 2 + 1.5, D - tw['w'] / 2
    tm = principled('башня', C['tower'], rough=0.85)
    B.box(tm, (tx, ty, th / 2), (tw['d'], tw['w'], th))
    for f in range(nf + 1):  # колонка окон лестницы — на торец
        B.box(glass(), (tx - tw['d'] / 2 - 0.03, ty, pl + f * fh + fh * 0.6), (0.06, 0.9, 1.1), lit=0.0 if R.random() < .3 else 0.55)
    for k in range(3):  # вентрешётки наверху
        B.box(principled('решётка', (0.25, 0.25, 0.25)), (tx - tw['d'] / 2 - 0.03, ty - 1.5 + k * 1.5, th - 1.0), (0.06, 0.7, 0.6))
    # --- цилиндр на углу: ленты остекления по кругу, под ними коричневый пояс, верх светло-серый
    ch = top + cy['extra_floors'] * fh
    c0 = (0.0, 0.0)
    cb = brick('цилиндр_пояс', C['cyl_band'])
    B.ring(front, c0, 0, rC - 0.05, 0, pl, seg=96)
    for f in range(nf + cy['extra_floors']):
        z = pl + f * fh
        last = f >= nf
        B.ring(principled('цилиндр_верх', C['cyl_top']) if last else cb, c0, 0, rC, z, z + 1.0, seg=96)
        for q in range(6):  # шесть комнат по кругу: часть горит
            B.ring(glass('стекло_цилиндр', 0.55), c0, 0, rC - 0.12, z + 1.0, z + fh - 0.15, q * 60, q * 60 + 60, seg=96, lit=lit_value(0.4))
        B.ring(principled('рама', C['frame']), c0, 0, rC + 0.02, z + fh - 0.15, z + fh, seg=96)   # белый ригель над лентой
        n = cy['glaze_posts']
        for i in range(n):  # частые импосты
            ang = 2 * math.pi * i / n
            B.box(principled('рама', C['frame']), (c0[0] + (rC - 0.06) * math.cos(ang), c0[1] + (rC - 0.06) * math.sin(ang), z + 1.0 + (fh - 1.15) / 2),
                  (0.08, 0.14, fh - 1.15), ang)
    B.ring(principled('цилиндр_верх', C['cyl_top']), c0, 0, rC + 0.15, ch, ch + 0.9, seg=96)       # парапет
    # --- кафе: прямоугольник вдоль торца (x −w..0, y 0..D), четверть кольца вокруг цилиндра, короткий хвост вдоль главного фасада
    cm = principled('кафе', C['cafe'], rough=0.6)
    vit = glass('витраж', 0.4)
    dark = principled('рама_тёмная', (0.12, 0.10, 0.10))
    rail = principled('ограждение', (0.95, 0.95, 0.95), rough=0.4)
    deck = principled('настил', (0.30, 0.28, 0.26), rough=0.9)
    w, h, ext = cafe['w'], cafe['h'], cafe['along_a']
    R0, R1 = rC - 0.3, w
    gz0, gz1 = 0.4, h - 0.9
    # торцевая часть
    B.box(cm, (-w / 2, D / 2, h / 2), (w, D, h))
    B.box(cm, (-w / 2 - 0.1, D / 2, h - 0.3), (w + 0.2, D, 0.6))                        # фриз
    B.box(deck, (-w / 2, D / 2, h + 0.02), (w - 0.3, D, 0.04))
    B.box(vit, (-w - 0.02, D / 2 - 0.5, (gz0 + gz1) / 2), (0.05, D - 2.0, gz1 - gz0), lit=0.9)
    for k in range(int((D - 2) / 1.6) + 1):
        B.box(dark, (-w - 0.05, 0.5 + k * 1.6, (h - 0.5) / 2), (0.12, 0.12, h - 0.5))
    # угол вокруг цилиндра
    B.ring(cm, c0, R0, R1, 0, h - 0.6, 180, 270, seg=96)
    B.ring(cm, c0, R0, R1 + 0.1, h - 0.6, h, 180, 270, seg=96)
    B.ring(deck, c0, R0, R1 - 0.15, h, h + 0.04, 180, 270, seg=96)
    B.ring(vit, c0, R1 - 0.02, R1 + 0.03, gz0, gz1, 182, 268, seg=96, lit=0.9)
    for k in range(10):
        ang = math.radians(182 + k * 9.5)
        B.box(dark, (R1 * math.cos(ang), R1 * math.sin(ang), (h - 0.5) / 2), (0.12, 0.12, h - 0.5), ang)
    # хвост вдоль главного фасада
    if ext > 0:
        B.box(cm, (ext / 2, -w / 2, h / 2), (ext, w, h))
        B.box(cm, (ext / 2, -w / 2 - 0.1, h - 0.3), (ext, w + 0.2, 0.6))
        B.box(deck, (ext / 2, -w / 2, h + 0.02), (ext, w - 0.3, 0.04))
        B.box(vit, (ext / 2, -w - 0.02, (gz0 + gz1) / 2), (ext - 0.8, 0.05, gz1 - gz0), lit=0.9)
        B.box(cm, (ext + 0.15, -w / 2, h / 2), (0.3, w, h))                              # глухой край
    # вход в кафе с торца: портал, дверь, козырёк
    entrance(B, (-w - 0.03, D * 0.62, 0), -math.pi / 2, w=1.8, door_h=2.5, canopy=(3.2, 1.4), z_can=2.85, bright=1.0)
    # белое ограждение террасы по всему контуру
    rz = h + 1.08
    B.box(rail, (-w + 0.1, D / 2, rz), (0.08, D, 0.08))
    for k in range(int(D / 1.2) + 1):
        B.box(rail, (-w + 0.1, k * 1.2, h + 0.55), (0.05, 0.05, 1.1))
    B.ring(rail, c0, R1 - 0.15, R1 - 0.05, rz - 0.03, rz + 0.04, 180, 270, seg=96)
    for k in range(31):
        ang = math.radians(180 + k * 3)
        B.box(rail, ((R1 - 0.1) * math.cos(ang), (R1 - 0.1) * math.sin(ang), h + 0.55), (0.05, 0.05, 1.1), ang)
    if ext > 0:
        B.box(rail, (ext / 2, -w + 0.1, rz), (ext, 0.08, 0.08))
        for k in range(int(ext / 1.2) + 1):
            B.box(rail, (k * 1.2, -w + 0.1, h + 0.55), (0.05, 0.05, 1.1))
    # зонтики на террасе
    for k in range(4):
        ux, uy = -w / 2, 2.5 + k * (D - 7) / 3
        B.box(rail, (ux, uy, h + 1.1), (0.06, 0.06, 2.2))
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.4, depth=0.6, location=(ux, uy, h + 2.3))
        u = bpy.context.active_object; u.data.materials.append(principled('зонт', (0.92, 0.90, 0.85)))
    # крыша: выходы на кровлю, вентшахты, антенны
    rt = top + 1.2
    tech = principled('крышная_техника', (0.35, 0.35, 0.36), rough=0.6, metal=0.3)
    for (x, y, sx, sy, sz) in ((9, 9, 2.4, 2.4, 2.2), (19, 10, 1.6, 1.2, 1.4), (27, 8, 2.4, 2.4, 2.2), (34, 11, 3.0, 2.0, 1.6)):
        B.box(tech, (x, y, rt + sz / 2), (sx, sy, sz))
    for (x, y) in ((14, 4), (31, 4)):
        B.box(tech, (x, y, rt + 2.5), (0.08, 0.08, 5.0))
    objs = B.build('чичерина64')
    # вывеска кафе на фризе: на торец и на главный фасад
    sign('КАФЕ', (-w - 0.16, D / 2, h - 0.3), (math.pi / 2, 0, -math.pi / 2), 0.42)
    if ext > 0:
        sign('КАФЕ', (ext / 2, -w - 0.16, h - 0.3), (math.pi / 2, 0, 0), 0.42)
    # маска этажа: оболочка этажа квартиры чуть шире стен (корпус и цилиндр), только для --what mask
    f = o['floor'] - 1; z0, z1 = pl + f * fh, pl + (f + 1) * fh
    M = Builder()
    mk = principled('маска', (1, 1, 1))
    M.box(mk, (L / 2, D / 2, (z0 + z1) / 2), (L + 0.5, D + 0.5, z1 - z0))
    M.ring(mk, c0, 0, rC + 0.3, z0, z1, seg=96)
    mask = M.build('маска_этажа')
    for m in mask:
        m.hide_render = True
    center = Vector((L / 2 - 4, D / 2, top / 2))
    return objs, mask, center, ch


def photo_mat(name, slug, scale, tint=(1.0, 1.0, 1.0), rough=(0.4, 0.9), wet=0.0, box=False):
    """фото-фактура Poly Haven по координатам объекта (меши сцены — в мировых координатах).
    wet — доля мокрых пятен: в лужах темнее, гладко (отражают фонари и окна), без рельефа"""
    if name in MATS:
        return MATS[name]
    m = principled(name, tint, rough=rough[1])
    try:
        T = ph_texture(slug)
    except Exception as e:
        log('фактура %s не загрузилась (%s) — однотонно' % (slug, e)); return m
    nt, L = m.node_tree, m.node_tree.links
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale,) * 3; L.new(tc.outputs['Object'], mp.inputs['Vector'])

    def img(path, cs):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = cs
        if box: t.projection = 'BOX'; t.projection_blend = 0.2
        L.new(mp.outputs['Vector'], t.inputs['Vector']); return t
    col = nt.nodes.new('ShaderNodeMix'); col.data_type = 'RGBA'; col.blend_type = 'MULTIPLY'; col.inputs['Factor'].default_value = 1.0
    L.new(img(T['Diffuse'], 'sRGB').outputs['Color'], col.inputs['A']); col.inputs['B'].default_value = (*tint, 1)
    rr = nt.nodes.new('ShaderNodeMapRange'); L.new(img(T['Rough'], 'Non-Color').outputs['Color'], rr.inputs['Value'])
    rr.inputs['To Min'].default_value, rr.inputs['To Max'].default_value = rough
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
    L.new(img(T['nor_gl'], 'Non-Color').outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if wet <= 0:
        L.new(col.outputs['Result'], b.inputs['Base Color']); L.new(rr.outputs['Result'], b.inputs['Roughness']); return m
    # лужи: крупный шум по координатам → маска пятен
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.22; nz.inputs['Detail'].default_value = 6; nz.inputs['Roughness'].default_value = 0.6
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    pm = nt.nodes.new('ShaderNodeMapRange'); L.new(nz.outputs['Fac'], pm.inputs['Value'])
    pm.inputs['From Min'].default_value = 0.62 - 0.25 * wet; pm.inputs['From Max'].default_value = 0.70 - 0.25 * wet
    dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'; dk.inputs['B'].default_value = (0.5, 0.5, 0.52, 1)
    L.new(pm.outputs['Result'], dk.inputs['Factor']); L.new(col.outputs['Result'], dk.inputs['A']); L.new(dk.outputs['Result'], b.inputs['Base Color'])
    rm = nt.nodes.new('ShaderNodeMix'); rm.data_type = 'FLOAT'; L.new(pm.outputs['Result'], rm.inputs['Factor'])
    L.new(rr.outputs['Result'], rm.inputs['A']); rm.inputs['B'].default_value = 0.03; L.new(rm.outputs['Result'], b.inputs['Roughness'])
    ns = nt.nodes.new('ShaderNodeMath'); ns.operation = 'SUBTRACT'; ns.inputs[0].default_value = 1.0; L.new(pm.outputs['Result'], ns.inputs[1])
    L.new(ns.outputs[0], nm.inputs['Strength'])
    return m


def sign(text, loc, rot, size=0.75, color=(1.0, 0.86, 0.62), power=9.0):
    """светящаяся вывеска (объёмный текст → меш, чтобы маска его гасила)"""
    cu = bpy.data.curves.new('вывеска', 'FONT'); cu.body = text; cu.size = size; cu.extrude = 0.04
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = bpy.data.objects.new('вывеска', cu); sc.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    o.data.materials.append(principled('вывеска', (1, 1, 1), emit=(color, power)))
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.ops.object.convert(target='MESH')
    return o


def lamp_light(name, loc, kind='SPOT', power=900.0, color=(1.0, 0.70, 0.42), size=0.4, rot=(0, 0, 0), spot=math.radians(120)):
    ld = bpy.data.lights.new(name, kind); ld.energy = power; ld.color = color
    if kind == 'SPOT':
        ld.spot_size = spot; ld.spot_blend = 0.6; ld.shadow_soft_size = size
    elif kind == 'AREA':
        ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size
    else:
        ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot
    o.visible_camera = False
    return o


def environment(center):
    """мокрый асфальт, бордюры, плитка, газоны, фонари со светом, машины, деревья у тротуара, соседние дома с деталями"""
    B = Builder()
    grass = principled('газон', (0.035, 0.07, 0.02), rough=0.95)
    asph = photo_mat('асфальт', 'asphalt_02', 3.0, tint=(0.55, 0.55, 0.58), rough=(0.25, 0.6), wet=0.45)
    pav = photo_mat('плитка', 'concrete_pavers_02', 2.0, tint=(0.75, 0.73, 0.70), rough=(0.3, 0.7))
    curb = photo_mat('бордюр', 'brushed_concrete_03', 1.5, tint=(0.8, 0.8, 0.78), rough=(0.5, 0.9), box=True)
    mark = principled('разметка', (0.85, 0.85, 0.82), rough=0.5)
    B.box(grass, (20, 20, -0.05), (1400, 1400, 0.1))                # до дальнего города и за ним — без «парящих» домов
    # улицы: перед главным фасадом (вдоль X) и слева у торца с кафе (вдоль Y)
    B.box(asph, (20, -30, 0.01), (500, 14, 0.02))
    B.box(asph, (-40, 40, 0.01), (14, 500, 0.02))
    # тротуары и площадка у дома — плитка; бордюр вдоль дорог
    B.box(pav, (30, -20, 0.06), (180, 6, 0.12))                   # тротуар вдоль главного фасада
    B.box(pav, (-30, 40, 0.06), (6, 180, 0.12))                   # тротуар вдоль торца
    B.box(pav, (11.5, 1.0, 0.05), (77, 37, 0.1))                  # площадка вокруг дома: x −27..50, y −17,5..19,5
    B.box(asph, (22, 25.5, 0.04), (52, 12, 0.08))                  # двор: проезд и парковка за домом
    B.box(curb, (22, 31.55, 0.1), (52, 0.12, 0.2))
    B.box(grass, (28, -16.3, 0.12), (44, 1.6, 0.24))              # газон-полоса под живой изгородью
    B.box(curb, (28, -17.15, 0.15), (44, 0.12, 0.3))
    for (x0, x1, y0, y1) in ((-26, -12, -16, -8), (9, 48, -11.5, -7.5)):   # газоны с деревьями на площадке
        B.box(grass, ((x0 + x1) / 2, (y0 + y1) / 2, 0.13), (x1 - x0, y1 - y0, 0.26))
        B.box(curb, ((x0 + x1) / 2, y0, 0.15), (x1 - x0, 0.12, 0.3)); B.box(curb, ((x0 + x1) / 2, y1, 0.15), (x1 - x0, 0.12, 0.3))
    # дальний город: кольцо высоток со светом в окнах — горизонт не пустой
    far = principled('кровля', C['roof'])
    for k in range(22):
        a = 2 * math.pi * k / 22 + R.uniform(-0.08, 0.08); d = R.uniform(190, 320)
        fx, fy = 12 + d * math.sin(a), 6 + d * math.cos(a)
        nf_ = R.choice((9, 10, 12, 14, 16, 17)); h_ = nf_ * 2.9 + 0.6; L_ = R.uniform(24, 60); rz_ = a + R.choice((0, math.pi / 2))
        col_ = R.choice(((0.62, 0.58, 0.52), (0.70, 0.66, 0.60), (0.55, 0.50, 0.46), (0.66, 0.52, 0.40)))
        B.box(windows_texture('дальние_%d' % (k % 4), col_), (fx, fy, h_ / 2), (L_, 14, h_), rz_)
        B.box(far, (fx, fy, h_ + 0.4), (L_ + 0.2, 14.2, 0.8), rz_)
    B.box(curb, (30, -23.05, 0.08), (180, 0.25, 0.16)); B.box(curb, (-32.95, 40, 0.08), (0.25, 180, 0.16))
    for x in range(-6, 140, 12):                                  # разметка: прерывистая по оси
        B.box(mark, (x, -30, 0.025), (5, 0.15, 0.01))
    for y in range(-20, 140, 12):
        B.box(mark, (-40, y, 0.025), (0.15, 5, 0.01))
    for k in range(8):                                            # пешеходный переход у угла
        B.box(mark, (-19.0, -36.0 + k * 1.2 + 0.6, 0.025), (4.0, 0.6, 0.01))
    # соседние дома: межэтажные пояса, тёмный цоколь со светящимися витринами, техника на крыше
    for i, nb in enumerate(O['neighbors']):
        neighbor(B, i, *nb)
    # фонари: опора, консоль, светильник + настоящий свет вниз (пятна на мокром асфальте)
    pole = principled('опора', (0.10, 0.10, 0.11), rough=0.45, metal=0.7)
    lampm = principled('фонарь', (1, 1, 1), emit=((1.0, 0.72, 0.42), 30.0))
    lamps = [((x, -23.6), 0.0) for x in range(-24, 150, 18)] + [((-33.6, y), -math.pi / 2) for y in range(-6, 150, 18)] + [((x, 19.2), math.pi) for x in (6, 22, 38)]
    for (lx, ly), a in lamps:
        dx, dy = -math.sin(a), -math.cos(a)                      # к дороге
        B.box(pole, (lx, ly, 4.5), (0.2, 0.2, 9.0)); B.box(pole, (lx, ly, 0.4), (0.36, 0.36, 0.8))
        B.box(pole, (lx + dx * 0.9, ly + dy * 0.9, 8.95), (0.12 + abs(dx) * 1.7, 0.12 + abs(dy) * 1.7, 0.1))
        B.box(pole, (lx + dx * 1.7, ly + dy * 1.7, 8.9), (0.7 if dx else 0.45, 0.45 if dx else 0.7, 0.18))
        B.box(lampm, (lx + dx * 1.7, ly + dy * 1.7, 8.79), (0.55 if dx else 0.35, 0.35 if dx else 0.55, 0.04))
        lamp_light('свет_фонаря', (lx + dx * 1.7, ly + dy * 1.7, 8.7), power=1400.0)
    objs = B.build('окружение')
    # свет из кафе на площадку: витрины — излучающие поверхности, а пятно тёплого света на плитке даёт этот свет
    cf, D = O['cafe'], O['wing_a']['depth']
    lamp_light('свет_кафе_торец', (-cf['w'] - 0.4, D / 2, 2.0), 'AREA', 260.0, (1.0, 0.68, 0.40), (D - 2, 2.6), (0, math.pi / 2, 0))
    lamp_light('свет_кафе_фасад', (cf['along_a'] / 2, -cf['w'] - 0.4, 2.0), 'AREA', 90.0, (1.0, 0.68, 0.40), (cf['along_a'], 2.6), (-math.pi / 2, 0, 0))
    lamp_light('свет_кафе_угол', (-cf['w'] * 0.75 - 0.5, -cf['w'] * 0.75 - 0.5, 2.0), 'AREA', 90.0, (1.0, 0.68, 0.40), (5.0, 2.6), (-math.pi / 2, 0, -math.pi / 4))
    trees_and_cars()
    return objs


def trees_and_cars():
    """деревья и кусты Poly Haven (CC0) и машины Ардена (Sketchfab, CC BY 4.0 — авторы в estate/blender assets/CREDITS.md)"""
    sys.path.insert(0, os.path.join(HERE, '..', '..', 'estate', 'blender'))
    try:
        import arden_assets
        protos = []
        for slug in ('tree_small_02', 'shrub_02', 'shrub_04'):
            path = arden_assets.fetch_model(A.assets, slug)
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=path)
            new = [x for x in bpy.data.objects if x not in before]
            meshes = [x for x in new if x.type == 'MESH']
            bpy.context.view_layer.update()
            for x in meshes:
                x.data = x.data.copy(); x.data.transform(x.matrix_world); x.parent = None; x.matrix_basis = Matrix.Identity(4)
            for x in new:
                if x not in meshes: bpy.data.objects.remove(x)
            for x in meshes:
                x.hide_render = True; x.location = (0, 0, -500)
            protos.append((slug, meshes))

        def put(k, x, y, s, name):
            for m in protos[k][1]:
                e = bpy.data.objects.new(name, m.data); sc.collection.objects.link(e)
                e.location = (x, y, 0); e.scale = (s, s, s); e.rotation_euler = (0, 0, R.uniform(0, 6.28))
        spots = [(-44, -12), (-46, 10), (48, -14), (58, -12), (64, 6), (60, 30), (20, 44), (-42, 44), (-12, 50), (40, 46)]
        west = [(R.uniform(-120, -50), R.uniform(-70, 120)) for _ in range(28)]   # за улицей у торца — сквер (видно сбоку)
        for (x, y) in spots + west + [(R.uniform(-80, 140), R.uniform(-60, 120)) for _ in range(80)]:
            if -40 < x < 55 and -24 < y < 40:
                continue  # не на дом
            if abs(y + 30) < 8 or abs(x + 40) < 8:
                continue  # не на дорогу
            k = 0 if R.random() < .6 else R.choice((1, 2))
            put(k, x, y, R.uniform(1.6, 2.4) if k == 0 else R.uniform(1.0, 1.6), 'дерево')
        for (x, y) in ((-22, -13), (-16, -10.5), (12, -9.5), (20.5, -9.5), (29, -9.5), (37.5, -9.5), (46, -9.5)):  # деревья в газонах площадки
            put(0, x, y, R.uniform(1.15, 1.35), 'дерево_двор')
        for x in range(10, 47, 2):
            put(R.choice((1, 2)), x + R.uniform(-.4, .4), -8.3, R.uniform(0.9, 1.2), 'куст')
        for x in range(-15, 140, 18):  # деревья вдоль тротуара — между фонарями, не перед кафе
            if -20 < x < 12: continue
            put(0, x + 9, -21.2, R.uniform(1.3, 1.6), 'дерево_улица')
        for y in range(22, 150, 18):
            put(0, -31.2, y + 9, R.uniform(1.3, 1.6), 'дерево_улица')
        for x in range(-4, 50, 3):  # живая изгородь вдоль фасада
            if x < 6: continue  # перед кафе — открыто
            e = bpy.data.objects.new('изгородь', protos[1][1][0].data); sc.collection.objects.link(e)
            e.location = (x, -16.5, 0); e.scale = (1.3, 1.3, 1.0)
    except Exception as e:  # без интернета и ассетов — без деревьев, сцена всё равно рендерится
        log('деревья не загрузились:', e)
    try:
        import arden_v2
        S2 = arden_v2.Scene2(A.assets, {}, log)
        cars = S2.load_cars()
        if not cars:
            raise RuntimeError('нет папки assets/cars в ' + A.assets)
        col = bpy.data.collections.new('Машины'); sc.collection.children.link(col)

        def car(x, y, rot):
            e = bpy.data.objects.new('машина', None); e.instance_type = 'COLLECTION'; e.instance_collection = R.choice(cars)
            e.location = (x, y, 0.02); e.rotation_euler = (0, 0, rot); col.objects.link(e)
        x = -12.0
        while x < 140:   # вдоль главного фасада — у бордюра, с пропусками
            if R.random() < 0.7 and not (-24 < x < -14):
                car(x, -24.9, 0.0 if R.random() < .5 else math.pi)
            x += R.uniform(5.6, 7.5)
        y = -14.0
        while y < 140:   # у торца — у бордюра
            if R.random() < 0.6:
                car(-34.9, y, math.pi / 2 if R.random() < .5 else -math.pi / 2)
            y += R.uniform(5.6, 7.5)
        for x in range(2, 44, 3):  # двор: парковка перпендикулярно
            if R.random() < 0.6:
                car(x, 28.6, math.pi / 2 if R.random() < .5 else -math.pi / 2)
        for (cx, cy_, r) in ((30, -32.6, math.pi), (78, -27.2, 0.0), (-42.3, 30, math.pi / 2)):  # едут по улице
            car(cx, cy_, r)
        log('машины: %d' % len(col.objects))
    except Exception as e:
        log('машины не загрузились:', e)



# ============================================================================ СВЕТ, КАМЕРА, РЕНДЕР
def light():
    """небо и свет: HDRI Poly Haven (синий час, облака) — фон и освещение; тёплый горизонт за домом"""
    world = bpy.data.worlds.new('Небо'); sc.world = world; world.use_nodes = True
    wn, wl = world.node_tree.nodes, world.node_tree.links; bg = wn['Background']
    S = dict(O['sky'])
    if A.sky:  # --sky slug:поворот:сила:экспозиция
        parts = A.sky.split(':'); S['hdri'] = parts[0]
        if len(parts) > 1: S['rotate'] = float(parts[1])
        if len(parts) > 2: S['strength'] = float(parts[2])
        if len(parts) > 3: S['exposure'] = float(parts[3])
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'; sc.view_settings.exposure = S.get('exposure', 0.4)
    if S['hdri'] == 'nishita':  # синий час: солнце на 2° под горизонтом за домом — тёплая полоса, синее небо, фасад в тени
        sky = wn.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_disc = False
        sky.sun_elevation = math.radians(-2.0); sky.sun_rotation = math.radians(S['rotate']); sky.dust_density = 3.0; sky.air_density = 1.6
        wl.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = S['strength']
        if S.get('backdrop'):  # камера видит облака HDRI, а свет сцены — от процедурного неба
            try:
                path = ph_hdri(S['backdrop'], '2k' if DRAFT else '4k')
                env = wn.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(path)
                tc = wn.new('ShaderNodeTexCoord'); mp = wn.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.radians(S['backdrop_rotate']))
                wl.new(tc.outputs['Generated'], mp.inputs['Vector']); wl.new(mp.outputs['Vector'], env.inputs['Vector'])
                bg2 = wn.new('ShaderNodeBackground'); wl.new(env.outputs['Color'], bg2.inputs['Color']); bg2.inputs['Strength'].default_value = S['backdrop_strength']
                lp = wn.new('ShaderNodeLightPath'); mx = wn.new('ShaderNodeMixShader')
                wl.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac']); wl.new(bg.outputs['Background'], mx.inputs[1]); wl.new(bg2.outputs['Background'], mx.inputs[2])
                wl.new(mx.outputs['Shader'], wn['World Output'].inputs['Surface'])
            except Exception as e:
                log('облака HDRI не загрузились (%s) — фон процедурный' % e)
        return world
    try:
        path = ph_hdri(S['hdri'], '2k' if DRAFT else '4k')
        env = wn.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(path)
        tc = wn.new('ShaderNodeTexCoord'); mp = wn.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.radians(S['rotate']))
        wl.new(tc.outputs['Generated'], mp.inputs['Vector']); wl.new(mp.outputs['Vector'], env.inputs['Vector'])
        wl.new(env.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = S['strength']
    except Exception as e:  # без интернета — небо Nishita
        log('HDRI не загрузилось (%s), небо Nishita' % e)
        sky = wn.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_disc = False; sky.sun_elevation = math.radians(2)
        wl.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.3
    return world


def post():
    """кадр как в рекламе: свечение огней, лёгкая дымка у горизонта, тёплые света / холодные тени, виньетка"""
    sc.use_nodes = True; t = sc.node_tree; t.nodes.clear(); n, l = t.nodes, t.links
    rl = n.new('CompositorNodeRLayers'); out = n.new('CompositorNodeComposite')
    def put(node, name, v, kind=None):
        for i in node.inputs:
            if i.name == name and (kind is None or i.type == kind) and hasattr(i, 'default_value'):
                i.default_value = v; return
        if hasattr(node, name.lower()): setattr(node, name.lower(), v)
    sc.view_layers[0].use_pass_mist = True
    sc.world.mist_settings.start = 90; sc.world.mist_settings.depth = 520; sc.world.mist_settings.falloff = 'QUADRATIC'
    fog = n.new('CompositorNodeMixRGB'); fog.blend_type = 'MIX'
    l.new(rl.outputs['Mist'], fog.inputs[0]); l.new(rl.outputs['Image'], fog.inputs[1]); fog.inputs[2].default_value = (0.30, 0.33, 0.42, 1)
    fk = n.new('CompositorNodeMath'); fk.operation = 'MULTIPLY'; fk.inputs[1].default_value = 0.55
    l.new(rl.outputs['Mist'], fk.inputs[0]); l.new(fk.outputs[0], fog.inputs[0])
    gl = n.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'
    put(gl, 'Threshold', 1.0); put(gl, 'Strength', 0.35); put(gl, 'Size', 0.6)
    l.new(fog.outputs[0], gl.inputs['Image'])
    cb = n.new('CompositorNodeColorBalance')
    for name_, v in (('Lift', (0.97, 0.99, 1.04)), ('Gamma', (1.0, 1.0, 1.0)), ('Gain', (1.05, 1.0, 0.94))):
        if any(i.name == name_ for i in cb.inputs): put(cb, name_, (*v, 1), 'RGBA')
        else: setattr(cb, name_.lower(), v)
    l.new(gl.outputs['Image'], cb.inputs['Image'])
    em = n.new('CompositorNodeEllipseMask'); put(em, 'Size', (1.05, 0.62))
    bl = n.new('CompositorNodeBlur'); bl.filter_type = 'GAUSS'
    px = W * (A.percent or (50 if DRAFT else 100)) / 100 * .18
    if any(i.name == 'Size' for i in bl.inputs): bl.use_relative = False; put(bl, 'Size', (px, px))
    vg = n.new('CompositorNodeMapRange'); vg.inputs['To Min'].default_value = .72; vg.inputs['To Max'].default_value = 1.0
    l.new(em.outputs[0], bl.inputs[0]); l.new(bl.outputs[0], vg.inputs[0])
    mul = n.new('CompositorNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    l.new(cb.outputs[0], mul.inputs[1]); l.new(vg.outputs[0], mul.inputs[2]); l.new(mul.outputs[0], out.inputs[0])


def camera(center):
    cd = bpy.data.cameras.new('Камера'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(FOV); cd.clip_end = 3000
    cam = bpy.data.objects.new('Камера', cd); sc.collection.objects.link(cam); sc.camera = cam
    aim = bpy.data.objects.new('Цель', None); sc.collection.objects.link(aim)
    t = cam.constraints.new('TRACK_TO'); t.target = aim; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
    return cam, aim


def orbit_pose(k):
    ob = O['orbit']; c = Vector(ob['center'])
    a = math.radians(ob['start'] + k * ORBIT_STEP)
    return Vector((c.x + ob['radius'] * math.sin(a), c.y + ob['radius'] * math.cos(a), ob['height'])), c


def approach_pose(f):
    """подлёт: с высоты над городом — к кадру 0 облёта (последний кадр подлёта = кадр 0 облёта)"""
    p1, t1 = orbit_pose(0)
    d = (p1 - t1); d.z = 0; d.normalize()
    p0 = t1 + d * 320 + Vector((0, 0, 210)); t0 = t1 + Vector((0, 0, -10))
    s = f / (APPROACH_N - 1); e = s * s * (3 - 2 * s)
    return p0.lerp(p1, e), t0.lerp(t1, e)


def setup_engine(kind):
    r = sc.render
    r.resolution_x, r.resolution_y = W, H; r.resolution_percentage = A.percent or (50 if DRAFT else 100)
    r.film_transparent = False
    if kind == 'cycles':
        r.engine = 'CYCLES'; cy = sc.cycles
        if not A.cpu:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for dev in ('OPTIX', 'CUDA'):
                try:
                    prefs.compute_device_type = dev; prefs.get_devices()
                    if any(d.type == dev for d in prefs.devices):
                        for d in prefs.devices: d.use = d.type == dev
                        cy.device = 'GPU'; log('видеокарта:', dev); break
                except TypeError:
                    continue
        cy.samples = 32 if DRAFT else 128; cy.adaptive_threshold = 0.03 if DRAFT else 0.015
        cy.use_denoising = True; cy.max_bounces = 4 if DRAFT else 6; cy.caustics_reflective = cy.caustics_refractive = False
        r.use_persistent_data = True
    elif kind == 'eevee':
        r.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'SceneEEVEE') else 'BLENDER_EEVEE'
        sc.eevee.taa_render_samples = 16 if DRAFT else 48
    elif kind == 'mask':  # без света и отражений: Cycles, 1 выборка, только излучение — секунды на кадр
        r.engine = 'CYCLES'; cy = sc.cycles; cy.samples = 1; cy.use_denoising = False; cy.max_bounces = 0
        r.filter_size = 0.01
        sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0


def save_webp(tmp_png, folder, k):
    """PNG рендера → WebP sm/md/hd (как в Ардене)"""
    img = bpy.data.images.load(tmp_png)
    for size, (w, q) in SIZES.items():
        d = os.path.join(folder, size); os.makedirs(d, exist_ok=True)
        dst = os.path.join(d, '%03d.webp' % k)
        im = img.copy(); im.scale(w, round(w * img.size[1] / img.size[0]))
        im.filepath_raw = dst; im.file_format = 'WEBP'
        sc.render.image_settings.quality = q
        im.save_render(dst, scene=sc) if hasattr(im, 'save_render') else im.save()
        bpy.data.images.remove(im)
    bpy.data.images.remove(img); os.remove(tmp_png)


def shot(folder, k, pose):
    """кадр k: готовый (есть hd) — пропускаем; иначе рендер → WebP трёх размеров. Возвращает секунды или None"""
    if os.path.exists(os.path.join(folder, 'hd', '%03d.webp' % k)):
        return None
    cam.location, aim.location = pose
    tmp = os.path.join(folder, '_tmp_%03d.png' % k); os.makedirs(folder, exist_ok=True)
    sc.render.filepath = tmp; sc.render.image_settings.file_format = 'PNG'
    t = time.time(); bpy.ops.render.render(write_still=True); dt = time.time() - t
    save_webp(tmp, folder, k)
    return dt


def run(stage, folder, frames, pose_fn):
    STATUS.update(stage=stage, total=len(frames), done=sum(os.path.exists(os.path.join(folder, 'hd', '%03d.webp' % k)) for k in frames))
    for k in frames:
        dt = shot(folder, k, pose_fn(k))
        if dt is not None:
            STATUS['done'] += 1; STATUS['times'].append(dt); log('%s: кадр %d (%d/%d), %.1f с' % (stage, k, STATUS['done'], STATUS['total'], dt))
            write_status()


# ============================================================================ МАСКА
def mask_mode(on, objs, mask):
    """маска этажа: этаж — белое излучение, всё остальное — чёрное (holdout не нужен), без неба и света"""
    if on:
        sc.use_nodes = False
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
        blk = principled('чёрный', (0, 0, 0), emit=((0, 0, 0), 0))
        wht = bpy.data.materials.new('белый'); wht.use_nodes = True; nt = wht.node_tree; nt.nodes.clear()
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (1, 1, 1, 1); em.inputs[1].default_value = 1
        out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0])
        for o in sc.objects:
            if o.type == 'MESH':
                o.data.materials.clear(); o.data.materials.append(wht if o in mask else blk)
            if o.type == 'LIGHT':
                o.hide_render = True
        for m in mask:
            m.hide_render = False


# ============================================================================ ЗАПУСК
t0 = time.time()
try:
    BRICK_TEX = ph_texture('white_bricks')
    BRICK_MEAN = 0.26  # средняя линейная яркость white_bricks (замер) — перекраска даёт точный цвет фасада
except Exception as e:
    log('фактура кирпича не загрузилась (%s) — однотонный кирпич' % e)
objs, mask, center, top = build_object_1()
environment(center)
light()
post()
cam, aim = camera(center)
log('сцена собрана за %.0f с' % (time.time() - t0))

orbit_dir, appr_dir, mask_dir = (os.path.join(OUT, x) for x in ('orbit', 'approach', 'mask'))
if A.what == 'still':
    setup_engine('cycles')
    p, t = orbit_pose(A.frame)
    if A.view == 'street':  # с тротуара напротив, спереди-слева, как панорама Яндекса (фото 4–5)
        p, t = Vector((-22.0, -52.0, 1.7)), Vector((2.0, 0.0, 14.0))
    if A.view == 'side':    # на торец с цилиндром и башней (фото 14)
        p, t = Vector((-58.0, -14.0, 1.7)), Vector((0.0, 4.0, 15.0))
    cam.location, aim.location = p, t
    sc.render.filepath = os.path.join(OUT, 'still_%s_%03d.png' % (A.view, A.frame)); sc.render.image_settings.file_format = 'PNG'
    tt = time.time(); bpy.ops.render.render(write_still=True)
    log('черновой кадр %d: %.0f с → %s' % (A.frame, time.time() - tt, sc.render.filepath))
    raise SystemExit(0)
if A.what == 'test':
    res = []
    setup_engine('cycles'); run('тест: облёт', os.path.join(OUT, '_test', 'orbit'), [0, 36], orbit_pose); res.append(('облёт', ORBIT_N))
    setup_engine('cycles' if A.cpu else 'eevee'); run('тест: подлёт', os.path.join(OUT, '_test', 'approach'), [0, 60], approach_pose); res.append(('подлёт', APPROACH_N))
    mask_mode(True, objs, mask); setup_engine('mask'); run('тест: маска', os.path.join(OUT, '_test', 'mask'), [0, 36], orbit_pose); res.append(('маска', ORBIT_N))
    log('прогноз — см. status.txt'); raise SystemExit(0)
if A.what in ('orbit', 'all'):
    setup_engine('cycles'); run('облёт', orbit_dir, list(range(ORBIT_N)), orbit_pose)
if A.what in ('approach', 'all'):
    setup_engine('cycles' if A.cpu else 'eevee'); run('подлёт', appr_dir, list(range(APPROACH_N)), approach_pose)
if A.what in ('mask', 'all'):
    mask_mode(True, objs, mask); setup_engine('mask'); run('маска этажа', mask_dir, list(range(ORBIT_N)), orbit_pose)
log('готово:', OUT)
