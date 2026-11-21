"""
«Агент 68» — кадры «псевдо-3D» для демо-сайта агентства недвижимости (Тамбов). Образец — Арден (estate/blender).

Сцены в браузере нет: каждый объект строится процедурно здесь, по параметрам ниже (размеры, этажи, цвета).
Внешние ассеты: деревья, кусты, фактуры и небо Poly Haven (CC0) — скачиваются сами; машины Sketchfab (CC BY 4.0,
авторы — estate/assets/CREDITS.md) — в assets/cars, в пакет для клуба кладутся готовыми.

  blender -b -P agent68_render.py -- --what test   --object 1 [--quality draft|final] [--cpu]
  blender -b -P agent68_render.py -- --what all    --object 1

--what   test      по 2 кадра каждого вида: время кадра и прогноз на всё
         orbit     облёт: 144 кадра через 2,5° (Cycles + шумодав)
         intro     вступление сквозь облака (как в Ардене): 8 с, 193 кадра, последний = кадр 0 облёта → intro.mp4
         approach  подлёт: 84 кадра (3,5 с при 24 к/с), последний = кадр 0 облёта (Cycles 64 выборки — стык с облётом
                   без скачка света; --eevee — быстрее, но свет другой)
         mask      маска этажа: тот же путь камеры, этаж белый, всё остальное чёрное, без света (секунды на кадр)
         still     один кадр (--view orbit --frame N | street | side | hero), для сверки с фото
         stills    главные кадры в полном качестве: hero, street, side → stills/{sm,md,hd}/<вид>.webp и .png
         manifest  manifest.json для сайта: кадры, папки, точка квартиры на экране по кадрам облёта и подлёта
         all       облёт → подлёт → вступление → главные кадры → маска → manifest
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
        wing_a=dict(length=38.0, depth=16.0, cols=8, segments=4, bend=24.0),   # bend — изгиб в плане (°), дальний конец уходит от улицы
        cyl=dict(d=11.0, extra_floors=1, glaze_posts=38, loggia=1.3),   # круглые лоджии на углу: диаметр, глубина лоджии         # цилиндр на углу: диаметр, на этаж выше корпуса
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
            cyl_light=(0.74, 0.72, 0.68),     # светлый кирпич над окнами цилиндра (фото 15)
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
                 backdrop='evening_road_01_puresky', backdrop_rotate=101.0, backdrop_strength=1.0),   # слоистые облака (вариант 4)
    ),
}

# ============================================================================ ПАРАМЕТРЫ ЗАПУСКА
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser(prog='agent68_render.py')
ap.add_argument('--what', default='test', choices=['test', 'orbit', 'approach', 'intro', 'mask', 'still', 'stills', 'manifest', 'all'])
ap.add_argument('--object', type=int, default=1)
ap.add_argument('--quality', default='final', choices=['draft', 'final'])
ap.add_argument('--cpu', action='store_true', help='без видеокарты (только для проверки)')
ap.add_argument('--eevee', action='store_true', help='подлёт в EEVEE (быстрее, но свет чуть иной — на стыке с облётом заметен скачок)')
ap.add_argument('--frame', type=int, default=0, help='для --what still')
ap.add_argument('--sky', default='', help='проба неба: slug HDRI Poly Haven или nishita; :поворот, :сила, :экспозиция')
ap.add_argument('--view', default='orbit', choices=['orbit', 'street', 'side', 'hero', 'intro'], help='для --what still: street — с улицы, как фото фасада; side — на торец, как фото 14; hero — главный кадр')
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
INTRO_FPS, INTRO_SEC = 24, 8   # вступление сквозь облака, как в Ардене: 193 кадра, последний = кадр 0 облёта
INTRO_N = INTRO_FPS * INTRO_SEC + 1
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
    ramp.color_ramp.elements[0].color = (1.0, 0.34, 0.09, 1); ramp.color_ramp.elements[1].color = (0.62, 0.74, 1.0, 1)
    e_ = ramp.color_ramp.elements.new(0.86); e_.color = (1.0, 0.55, 0.24, 1)   # ~12 % окон — холодный свет (телевизор, LED)
    e_ = ramp.color_ramp.elements.new(0.88); e_.color = (0.62, 0.74, 1.0, 1)
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


def loggia_glass():
    """остекление лоджий: прозрачное (видно лоджию и стену дома за ней) + отражение неба по краям (Френель)"""
    if 'стекло_лоджии' in MATS:
        return MATS['стекло_лоджии']
    m = bpy.data.materials.new('стекло_лоджии'); m.use_nodes = True
    nt, L = m.node_tree, m.node_tree.links; nt.nodes.clear()
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.03
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.25
    k = nt.nodes.new('ShaderNodeMapRange'); L.new(lw.outputs['Fresnel'], k.inputs['Value']); k.inputs['To Min'].default_value = 0.12; k.inputs['To Max'].default_value = 0.9
    mx = nt.nodes.new('ShaderNodeMixShader'); L.new(k.outputs['Result'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial'); L.new(mx.outputs[0], out.inputs['Surface'])
    if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
    MATS['стекло_лоджии'] = m
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
    # --- корпус: изогнут в плане (спутник, фото 16) — N прямых секций, каждая повёрнута на bend/(N−1)° от предыдущей;
    # дальний конец уходит от улицы (bend > 0) — главный фасад выпуклый. Пилястры приходятся на изломы.
    N, bend = a.get('segments', 4), math.radians(a.get('bend', 0.0))
    dl = bend / (N - 1) if N > 1 else 0.0
    sl = L / N
    V, angs = [Vector((0, 0, 0))], []                       # вершины линии главного фасада и углы секций
    for k in range(N):
        t = k * dl; angs.append(t)
        V.append(V[-1] + Vector((math.cos(t), math.sin(t), 0)) * sl)
    nin = lambda t: Vector((-math.sin(t), math.cos(t), 0))  # внутрь корпуса (во двор)
    trim = D * math.tan(dl / 2)                              # на вогнутой задней стороне секции короче
    for k in range(N):
        t, d_ = angs[k], Vector((math.cos(angs[k]), math.sin(angs[k]), 0))
        mid = (V[k] + V[k + 1]) / 2 + nin(t) * (D / 2)
        B.box(front, (mid.x, mid.y, top / 2), (sl, D, top), t)
        B.box(roof, (mid.x, mid.y, top + 0.6), (sl + 0.3, D + 0.3, 1.2), t)                    # парапет
        facade(B, V[k].x, V[k].y, sl, t, nf, fh, pl, a['cols'] // N, 'front', top)             # главный фасад
        t0 = trim if k > 0 else 0.0; t1 = trim if k < N - 1 else 0.0
        e = V[k + 1] + nin(t) * D - d_ * t1                                                    # задний — в обратную сторону
        facade(B, e.x, e.y, sl - t0 - t1, t + math.pi, nf, fh, pl, a['cols'] // N, 'back', top)
        if k in (0, 1, 3):                                                                      # подъезды во двор
            q = e - d_ * ((sl - t0 - t1) / 2) + nin(t) * 0.22
            entrance(B, (q.x, q.y, 0), t + math.pi, steps=0.45, z_can=2.55)
    tN = angs[-1]
    facade(B, V[-1].x, V[-1].y, D, tN + math.pi / 2, nf, fh, pl, 3, 'front', top)              # дальний торец
    # ближний торец x=0: узкая оранжевая стена между башней и лоджиями
    wall = D - tw['w'] - rC
    if wall > 1.5:
        facade(B, 0, D - tw['w'], wall, -math.pi / 2, nf, fh, pl, max(1, round(wall / 4.5)), 'front', top)
    # --- башня лестницы и лифта: белая, на дальнем углу торца, выступает из торца, выше цилиндра
    th = top + tw['above_roof']
    tx, ty = -tw['d'] / 2 + 1.5, D - tw['w'] / 2
    tm = principled('башня', C['tower'], rough=0.85)
    B.box(tm, (tx, ty, th / 2), (tw['d'], tw['w'], th))
    for f in range(nf + 1):  # колонка окон лестницы — на торец
        B.box(glass(), (tx - tw['d'] / 2 - 0.03, ty, pl + f * fh + fh * 0.6), (0.06, 0.9, 1.1), lit=0.0 if R.random() < .3 else 0.55)
    for k in range(3):  # вентрешётки наверху
        B.box(principled('решётка', (0.25, 0.25, 0.25)), (tx - tw['d'] / 2 - 0.03, ty - 1.5 + k * 1.5, th - 1.0), (0.06, 0.7, 0.6))
    # --- круглые лоджии на углу (фото 13–15): коричневый кирпичный парапет → остекление лоджии в белых рамах →
    # светлый кирпич; за прозрачным стеклом — глубина лоджии и жёлтая стена дома с окном и балконной дверью
    ch = top + cy['extra_floors'] * fh
    c0 = (0.0, 0.0)
    cb = brick('цилиндр_пояс', C['cyl_band'])
    cl = brick('цилиндр_светлый', C['cyl_light'])
    fr = principled('рама', C['frame'], rough=0.4)
    lg = loggia_glass()
    rI = rC - cy.get('loggia', 1.3)                          # стена дома в глубине лоджии
    B.ring(front, c0, 0, rC - 0.05, 0, pl, seg=96)
    zb_, zw_ = 1.05, 1.55                                    # парапет и остекление (фото 13: коричневый пояс почти как остекление)
    n = cy['glaze_posts']
    for f in range(nf + cy['extra_floors']):
        z = pl + f * fh
        last = f >= nf
        B.ring(cl if last else cb, c0, 0, rC, z, z + zb_, seg=96)                               # парапет (и пол лоджии)
        B.ring(cl, c0, 0, rC, z + zb_ + zw_, z + fh, seg=96)                                    # над остеклением — светлый кирпич
        B.ring(lg, c0, rC - 0.14, rC - 0.12, z + zb_, z + zb_ + zw_, seg=96)                    # стекло лоджии (прозрачное)
        B.ring(front, c0, 0, rI, z + zb_, z + zb_ + zw_, seg=96)                                 # стена дома за лоджией
        for q in range(6):                                                                       # окно и балконная дверь в каждой комнате
            lv = lit_value(0.45)
            B.ring(glass(), c0, rI, rI + 0.03, z + zb_ + 0.1, z + zb_ + zw_ - 0.02, q * 60 + 8, q * 60 + 26, seg=96, lit=lv)
            B.ring(glass(), c0, rI, rI + 0.03, z + zb_ - 0.6, z + zb_ + zw_ - 0.02, q * 60 + 33, q * 60 + 44, seg=96, lit=lv * 0.8)
            B.ring(curtain(), c0, rI + 0.03, rI + 0.05, z + zb_ + 0.1, z + zb_ + zw_ - 0.02, q * 60 + 8, q * 60 + 12, seg=96, lit=lv * 0.8)
        B.ring(fr, c0, rC - 0.18, rC - 0.06, z + zb_, z + zb_ + 0.08, seg=96)                    # нижний и верхний профиль рамы
        B.ring(fr, c0, rC - 0.18, rC - 0.06, z + zb_ + zw_ - 0.08, z + zb_ + zw_, seg=96)
        B.ring(fr, c0, rC - 0.18, rC - 0.06, z + zb_ + zw_ * 0.68, z + zb_ + zw_ * 0.68 + 0.06, seg=96)  # фрамуги
        B.ring(principled('подоконник', (0.85, 0.85, 0.83), rough=0.6), c0, rC - 0.05, rC + 0.07, z + zb_ - 0.05, z + zb_, seg=96)  # отлив
        for i in range(n):  # белые импосты — створки ~0,9 м
            a_ = 2 * math.pi * i / n
            B.box(fr, (c0[0] + (rC - 0.12) * math.cos(a_), c0[1] + (rC - 0.12) * math.sin(a_), z + zb_ + zw_ / 2),
                  (0.11, 0.12, zw_), a_ + math.pi / 2)
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
    for k in range(N):
        mid = (V[k] + V[k + 1]) / 2 + nin(angs[k]) * (D / 2)
        M.box(mk, (mid.x, mid.y, (z0 + z1) / 2), (sl + 1.4, D + 1.4, z1 - z0), angs[k])   # шире пилястр и отливов
    M.ring(mk, c0, 0, rC + 0.4, z0, z1, seg=96)
    mask = M.build('маска_этажа')
    for m in mask:
        m.hide_render = True
    c_ = (V[0] + V[-1]) / 2 + nin(angs[N // 2]) * (D / 2)
    O['_anchor'] = (V[N // 2].x, V[N // 2].y)               # середина главного фасада — метка квартиры на сайте
    center = Vector((c_.x - 4, c_.y, top / 2))
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
    B.box(pav, (11.5, 5.25, 0.05), (77, 45.5, 0.1))               # площадка вокруг дома: x −27..50, y −17,5..28
    B.box(asph, (20, 34.5, 0.04), (56, 12, 0.08))                  # двор: проезд и парковка за домом
    B.box(curb, (20, 40.55, 0.1), (56, 0.12, 0.2))
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
    lamps = [((x, -23.6), 0.0) for x in range(-24, 150, 18)] + [((-33.6, y), -math.pi / 2) for y in range(-6, 150, 18)] + [((x, 28.2), math.pi) for x in (4, 20, 36)]
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
    for d_ in (os.path.join(HERE, '..', '..', 'estate', 'blender'), HERE):  # в репозитории — из Ардена; в пакете — рядом
        sys.path.insert(0, d_)
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
        for k in range(150):  # пояс деревьев за кругом облёта и у дальнего города: низ далёких домов не «висит» над пустой землёй
            a_ = R.uniform(0, 2 * math.pi); d_ = R.uniform(150, 215) if k < 100 else R.uniform(300, 340)
            put(0, 12 + d_ * math.sin(a_), 6 + d_ * math.cos(a_), R.uniform(1.9, 2.8), 'дерево_даль')
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
        # машины Ардена ищутся в <root>/assets/cars: в репозитории root = --assets, в пакете cars лежат прямо в assets/
        root = A.assets if os.path.isdir(os.path.join(A.assets, 'assets', 'cars')) else os.path.dirname(os.path.abspath(A.assets))
        S2 = arden_v2.Scene2(root, {}, log)
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
        for x in range(-4, 44, 3):  # двор: парковка перпендикулярно
            if R.random() < 0.6:
                car(x, 37.6, math.pi / 2 if R.random() < .5 else -math.pi / 2)
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


POST = {}


def post():
    """кадр как в рекламе: свечение огней, лёгкая дымка у горизонта, тёплые света / холодные тени, виньетка"""
    sc.use_nodes = True; t = sc.node_tree; t.nodes.clear(); n, l = t.nodes, t.links
    rl = n.new('CompositorNodeRLayers'); out = n.new('CompositorNodeComposite')
    def put(node, name, v, kind=None):
        for i in node.inputs:
            if i.name == name and (kind is None or i.type == kind) and hasattr(i, 'default_value'):
                i.default_value = v; return
        if hasattr(node, name.lower()): setattr(node, name.lower(), v)
    # дымка и маска неба — из второго слоя «дымка» без облаков, 16 выборок: Mist/Depth сквозь объём облаков шумят точками
    vl2 = sc.view_layers.get('дымка') or sc.view_layers.new('дымка')
    vl2.use_pass_mist = True; vl2.use_pass_z = True; vl2.samples = 16   # 16: сквозь стекло лоджий Mist усредняется без точек
    rl2 = n.new('CompositorNodeRLayers'); rl2.layer = 'дымка'
    sc.world.mist_settings.start = 90; sc.world.mist_settings.depth = 520; sc.world.mist_settings.falloff = 'QUADRATIC'
    fog = n.new('CompositorNodeMixRGB'); fog.blend_type = 'MIX'
    l.new(rl.outputs['Image'], fog.inputs[1]); fog.inputs[2].default_value = (0.30, 0.33, 0.42, 1)
    fk = n.new('CompositorNodeMath'); fk.operation = 'MULTIPLY'; fk.inputs[1].default_value = 0.55
    POST['fog'] = fk
    zo = rl2.outputs.get('Depth') or rl2.outputs.get('Z')
    geo = n.new('CompositorNodeMath'); geo.operation = 'LESS_THAN'; geo.inputs[1].default_value = 2500.0   # небо — без полной дымки: цвет HDRI не выбеляется
    l.new(zo, geo.inputs[0])
    geo2 = n.new('CompositorNodeMapRange'); geo2.inputs['To Min'].default_value = 0.45; geo2.inputs['To Max'].default_value = 1.0   # небу — половина дымки: горизонт без шва
    l.new(geo.outputs[0], geo2.inputs['Value'])
    fk2 = n.new('CompositorNodeMath'); fk2.operation = 'MULTIPLY'
    l.new(rl2.outputs['Mist'], fk.inputs[0]); l.new(fk.outputs[0], fk2.inputs[0]); l.new(geo2.outputs[0], fk2.inputs[1]); l.new(fk2.outputs[0], fog.inputs[0])
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
    l.new(cb.outputs[0], mul.inputs[1]); l.new(vg.outputs[0], mul.inputs[2])
    ld = n.new('CompositorNodeLensdist'); put(ld, 'Dispersion', 0.012); put(ld, 'Distortion', 0.0)   # хроматическая аберрация по краям, как у объектива
    l.new(mul.outputs[0], ld.inputs['Image']); l.new(ld.outputs['Image'], out.inputs[0])


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



def ease(t):
    t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


def intro_pose(f):
    """вступление: камера над слоем облаков, проходит сквозь него и выходит к кадру 0 облёта"""
    p1, t1 = orbit_pose(0)
    d = (p1 - t1); d.z = 0; d.normalize()
    p0 = t1 + d * 520 + Vector((0, 0, 330)); t0 = t1 + d * 120 + Vector((0, 0, -40))   # сверху, взгляд вниз-вперёд
    t = f / (INTRO_N - 1)
    return p0.lerp(p1, ease(t)), t0.lerp(t1, ease(min(1.0, t * 1.25)))


CLOUD = {}


def clouds():
    """слой облаков (объём, шум) на высоте 120–200 м — как во вступлении Ардена; плотность гаснет к концу пролёта"""
    if CLOUD:
        return CLOUD['obj']
    c = Vector(O['orbit']['center'])
    bpy.ops.mesh.primitive_cube_add()
    cloud = bpy.context.active_object; cloud.name = 'Облака'; cloud.location = (c.x, c.y, 160); cloud.scale = (700, 700, 40)
    cm = bpy.data.materials.new('Облака'); cm.use_nodes = True; cn, cl = cm.node_tree.nodes, cm.node_tree.links; cn.clear()
    o_tc = cn.new('ShaderNodeTexCoord'); o_map = cn.new('ShaderNodeMapping'); o_map.inputs['Scale'].default_value = (700 / 700, 700 / 700, 40 / 160)   # крупные облака ~150 м
    noise = cn.new('ShaderNodeTexNoise'); noise.inputs['Detail'].default_value = 5; noise.inputs['Roughness'].default_value = .5
    cover = cn.new('ShaderNodeMapRange'); cover.inputs['From Min'].default_value = .42; cover.inputs['From Max'].default_value = .68
    sep = cn.new('ShaderNodeSeparateXYZ'); habs = cn.new('ShaderNodeMath'); habs.operation = 'ABSOLUTE'
    hgt = cn.new('ShaderNodeMapRange'); hgt.inputs['From Min'].default_value = .25; hgt.inputs['To Min'].default_value = 1; hgt.inputs['To Max'].default_value = 0
    lift = cn.new('ShaderNodeMath'); lift.operation = 'MULTIPLY_ADD'; lift.inputs[1].default_value = -1.3; lift.inputs[2].default_value = .55
    top = cn.new('ShaderNodeMath'); top.operation = 'ADD'
    rad = cn.new('ShaderNodeVectorMath'); rad.operation = 'LENGTH'; flat = cn.new('ShaderNodeVectorMath'); flat.operation = 'MULTIPLY'; flat.inputs[1].default_value = (1, 1, 0)
    edge = cn.new('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = .55; edge.inputs['From Max'].default_value = .98; edge.inputs['To Min'].default_value = 1; edge.inputs['To Max'].default_value = 0
    m1, m2, dens, dk = [cn.new('ShaderNodeMath') for _ in range(4)]
    for m in (m1, m2, dens, dk): m.operation = 'MULTIPLY'
    dk.inputs[1].default_value = .14
    fade = cn.new('ShaderNodeValue'); fade.name = 'fade'; fade.outputs[0].default_value = 1
    vol = cn.new('ShaderNodeVolumePrincipled'); vol.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1); vol.inputs['Anisotropy'].default_value = .45
    vout = cn.new('ShaderNodeOutputMaterial')
    for a_, b_ in ((o_tc.outputs['Object'], o_map.inputs['Vector']), (o_map.outputs['Vector'], noise.inputs['Vector']), (noise.outputs['Fac'], cover.inputs['Value']),
                   (o_tc.outputs['Object'], sep.inputs['Vector']), (sep.outputs['Z'], habs.inputs[0]), (noise.outputs['Fac'], lift.inputs[0]),
                   (habs.outputs[0], top.inputs[0]), (lift.outputs[0], top.inputs[1]), (top.outputs[0], hgt.inputs['Value']),
                   (o_tc.outputs['Object'], flat.inputs[0]), (flat.outputs['Vector'], rad.inputs[0]), (rad.outputs['Value'], edge.inputs['Value']),
                   (cover.outputs['Result'], m2.inputs[0]), (edge.outputs['Result'], m2.inputs[1]), (m2.outputs[0], m1.inputs[0]), (hgt.outputs['Result'], m1.inputs[1]),
                   (m1.outputs[0], dens.inputs[0]), (fade.outputs[0], dens.inputs[1]), (dens.outputs[0], dk.inputs[0]), (dk.outputs[0], vol.inputs['Density']),
                   (vol.outputs['Volume'], vout.inputs['Volume'])):
        cl.new(a_, b_)
    cloud.data.materials.append(cm); cloud.hide_render = True
    cc = bpy.data.collections.new('Облака_слой'); sc.collection.children.link(cc)
    for u in list(cloud.users_collection): u.objects.unlink(cloud)
    cc.objects.link(cloud)
    if 'дымка' in sc.view_layers:
        sc.view_layers['дымка'].layer_collection.children['Облака_слой'].exclude = True
    # над облаками солнце ещё не село: тёплый низкий свет только на облака (light linking) — розово-золотые верхушки
    sd = bpy.data.lights.new('Солнце_облака', 'SUN'); sd.energy = 9.0; sd.color = (1.0, 0.66, 0.46); sd.angle = math.radians(2)
    sun = bpy.data.objects.new('Солнце_облака', sd); sc.collection.objects.link(sun)
    az = math.radians(O['sky']['rotate'])
    sun.rotation_euler = Euler((math.radians(86), 0, az), 'XYZ')
    rc = bpy.data.collections.new('облака_приёмник'); rc.objects.link(cloud)
    try:
        sun.light_linking.receiver_collection = rc
    except AttributeError:
        log('light linking недоступен — облака без закатного света')
    sun.hide_render = True
    CLOUD.update(obj=cloud, fade=fade.outputs[0], sun=sun)
    return cloud


def set_clouds(fade):
    """плотность облаков (0…1)"""
    CLOUD['fade'].default_value = fade


def intro_fade(f):
    """облака тают, пока камера выходит из-под них (как в Ардене): 1 до 52 % пути, 0 после 74 %"""
    t = f / (INTRO_N - 1)
    return 1.0 if t < .52 else 0.0 if t > .74 else 1 - (t - .52) / .22   # гаснут, пока камера выходит из слоя: без тёмной «тени» на городе


def encode(folder, path, fps):
    """кадры hd/*.webp → MP4 (H.264) средствами Blender — ffmpeg в клубе не нужен"""
    files = sorted(f for f in os.listdir(folder) if f.endswith('.webp'))
    enc = bpy.data.scenes.new('Монтаж'); enc.render.fps = fps
    enc.render.resolution_x, enc.render.resolution_y, enc.render.resolution_percentage = W, H, 100
    enc.sequence_editor_create()
    strips = enc.sequence_editor.strips if hasattr(enc.sequence_editor, 'strips') else enc.sequence_editor.sequences
    st = strips.new_image('кадры', os.path.join(folder, files[0]), 1, 1)
    for f in files[1:]: st.elements.append(f)
    enc.frame_start, enc.frame_end = 1, len(files)
    r = enc.render; r.image_settings.file_format = 'FFMPEG'; r.ffmpeg.format = 'MPEG4'; r.ffmpeg.codec = 'H264'
    r.ffmpeg.constant_rate_factor = 'HIGH'; r.ffmpeg.gopsize = 24; r.filepath = path; r.use_file_extension = False
    enc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(animation=True, scene=enc.name)
    bpy.data.scenes.remove(enc)
    log('ролик:', path)


def stage_intro():
    """вступление сквозь облака: 193 кадра WebP (продолжается с места остановки) → intro.mp4"""
    cloud = clouds(); cloud.hide_render = False; CLOUD['sun'].hide_render = False
    setup_engine('cycles')
    if not DRAFT:
        sc.cycles.samples = 64                     # облака в движении — 64 выборки + шумодав
    if hasattr(sc.cycles, 'volume_step_rate'): sc.cycles.volume_step_rate = 0.1; sc.cycles.volume_max_steps = 1024; sc.cycles.volume_bounces = 3   # облака светлые изнутри — многократное рассеяние
    folder = os.path.join(OUT, 'intro')
    STATUS.update(stage='вступление', total=INTRO_N, done=sum(os.path.exists(os.path.join(folder, 'hd', '%03d.webp' % k)) for k in range(INTRO_N)))
    for k in range(INTRO_N):
        set_clouds(intro_fade(k))
        dt = shot(folder, k, intro_pose(k))
        if dt is not None:
            STATUS['done'] += 1; STATUS['times'].append(dt); log('вступление: кадр %d (%d/%d), %.1f с' % (k, STATUS['done'], INTRO_N, dt)); write_status()
    cloud.hide_render = True; CLOUD['sun'].hide_render = True; set_clouds(0.0)
    mp4 = os.path.join(OUT, 'intro.mp4')
    if not os.path.exists(mp4) and all(os.path.exists(os.path.join(folder, 'hd', '%03d.webp' % k)) for k in range(INTRO_N)):
        try:
            encode(os.path.join(folder, 'hd'), mp4, INTRO_FPS)
        except Exception as e:
            log('ролик не собрался (%s) — кадры есть, соберу на своей стороне' % e)

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
        if 'дымка' in sc.view_layers: sc.view_layers['дымка'].use = False
        wn = sc.world.node_tree; bk = wn.nodes.new('ShaderNodeBackground'); bk.inputs['Strength'].default_value = 0
        wn.links.new(bk.outputs[0], wn.nodes['World Output'].inputs['Surface'])          # небо чёрное и для камеры (облака HDRI — тоже)
        blk = bpy.data.materials.new('чёрный'); blk.use_nodes = True; bn = blk.node_tree; bn.nodes.clear()   # только излучение 0: без бликов от белого этажа
        e0 = bn.nodes.new('ShaderNodeEmission'); e0.inputs[1].default_value = 0
        bn.links.new(e0.outputs[0], bn.nodes.new('ShaderNodeOutputMaterial').inputs[0])
        wht = bpy.data.materials.new('белый'); wht.use_nodes = True; nt = wht.node_tree; nt.nodes.clear()
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (1, 1, 1, 1); em.inputs[1].default_value = 1
        out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0])
        for o in sc.objects:
            if o.type == 'MESH':
                o.data.materials.clear(); o.data.materials.append(wht if o in mask else blk)
                for sl_ in o.material_slots: sl_.link = 'DATA'                      # материалы на объекте (glTF) — тоже чёрные
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
CINEMA = {}


def cinema(on, view=''):
    """для главных кадров: световые следы машин (длинная выдержка, только hero) и лёгкая дымка в воздухе (конусы фонарей)"""
    if 'haze' not in CINEMA:
        B = Builder()
        head = principled('след_фары', (1, 1, 1), emit=((1.0, 0.90, 0.75), 6.0))
        tail = principled('след_стопы', (1, 0, 0), emit=((1.0, 0.04, 0.015), 6.0))

        def lane(p0, p1, z, mat, gaps=0.45):
            p0, p1 = Vector(p0), Vector(p1); d = (p1 - p0); L_ = d.length; d.normalize(); n_ = Vector((-d.y, d.x, 0))
            t = 0.0
            while t < L_:
                ln = R.uniform(8, 40); ln = min(ln, L_ - t)
                if R.random() > gaps:
                    for side in (-0.72, 0.72):                       # две фары / два стопа
                        c_ = p0 + d * (t + ln / 2) + n_ * side
                        B.box(mat, (c_.x, c_.y, z + R.uniform(-0.04, 0.04)), (ln, 0.045, 0.045), math.atan2(d.y, d.x))
                t += ln + R.uniform(2, 12)
        for k_ in range(2):   # главная улица: ближняя полоса — стопы, дальняя — фары; по несколько машин на выдержку
            lane((-150, -32.2 - k_ * 0.25, 0), (170, -32.2 - k_ * 0.25, 0), 0.82, tail)
            lane((170, -27.6 + k_ * 0.25, 0), (-150, -27.6 + k_ * 0.25, 0), 0.66, head)
            lane((-42.3 + k_ * 0.25, -60, 0), (-42.3 + k_ * 0.25, 230, 0), 0.82, tail)
            lane((-37.7 - k_ * 0.25, 230, 0), (-37.7 - k_ * 0.25, -60, 0), 0.66, head)
        CINEMA['trails'] = B.build('световые_следы')
        vol = bpy.data.materials.new('дымка'); vol.use_nodes = True; vn = vol.node_tree; vn.nodes.clear()
        pv = vn.nodes.new('ShaderNodeVolumePrincipled'); pv.inputs['Density'].default_value = 0.00035; pv.inputs['Anisotropy'].default_value = 0.55
        pv.inputs['Color'].default_value = (0.85, 0.88, 1.0, 1)
        vn.links.new(pv.outputs[0], vn.nodes.new('ShaderNodeOutputMaterial').inputs['Volume'])
        H_ = Builder(); H_.box(vol, (12, 6, 9), (420, 420, 18)); CINEMA['haze'] = H_.build('дымка')   # дымка у земли: конусы фонарей, дом над ней чистый
    for o in CINEMA['trails']: o.hide_render = not (on and view == 'hero')
    for o in CINEMA['haze']: o.hide_render = True   # дымка объёмом выбеляет кадр и втрое дороже — выключена, оставлена для проб
    if hasattr(sc.cycles, 'volume_step_rate'): sc.cycles.volume_step_rate = 4.0; sc.cycles.volume_max_steps = 256


VIEWS = {  # постоянные ракурсы: камера, цель, вертикальный угол обзора (°)
    'street': ((-22.0, -52.0, 1.7), (2.0, 0.0, 14.0), FOV),      # с тротуара напротив, как панорама Яндекса (фото 4–5)
    'side':   ((-58.0, -14.0, 1.7), (0.0, 4.0, 15.0), FOV),      # на торец с лоджиями и башней (фото 14)
    'hero':   ((-46.0, -96.0, 4.0), (8.0, 2.0, 15.5), 21.0, 158.0, ('evening_road_01_puresky', 292.0, 0.10)),  # главный кадр: снизу, длинный фокус; облака HDRI развёрнуты — закат за домом
}


def sky_turn(deg=0.0, sky=None):
    """фон для камеры (свет сцены не меняется): поворот облаков на deg от обычного или своё небо sky = (slug HDRI, поворот°)"""
    S_ = O['sky']
    slug, rot, k = (tuple(sky) + (1.0,))[:3] if sky else (S_.get('backdrop'), S_.get('backdrop_rotate', S_['rotate']) + deg, 1.0)
    for nd in sc.world.node_tree.nodes:
        if nd.type == 'MAPPING':
            nd.inputs['Rotation'].default_value[2] = math.radians(rot)
        if nd.type == 'BACKGROUND' and nd.inputs['Color'].is_linked and nd.inputs['Color'].links[0].from_node.type == 'TEX_ENVIRONMENT':
            nd.inputs['Strength'].default_value = S_.get('backdrop_strength', 1.0) * k
        if nd.type == 'TEX_ENVIRONMENT' and slug:
            try:
                nd.image = bpy.data.images.load(ph_hdri(slug, '2k' if DRAFT else '4k'), check_existing=True)
            except Exception as e:
                log('небо %s не загрузилось (%s)' % (slug, e))


def view_pose(v):
    p, t, fov = VIEWS[v][:3]
    cam.data.angle_y = math.radians(fov)
    sky_turn(VIEWS[v][3] if len(VIEWS[v]) > 3 else 0.0, VIEWS[v][4] if len(VIEWS[v]) > 4 else None)
    return Vector(p), Vector(t)


if A.what == 'still':
    setup_engine('cycles')
    p, t = orbit_pose(A.frame) if A.view == 'orbit' else intro_pose(A.frame) if A.view == 'intro' else view_pose(A.view)
    cam.location, aim.location = p, t
    if A.view == 'intro':
        clouds().hide_render = False; CLOUD['sun'].hide_render = False; set_clouds(intro_fade(A.frame))
        if hasattr(sc.cycles, 'volume_step_rate'): sc.cycles.volume_step_rate = 0.1; sc.cycles.volume_max_steps = 1024; sc.cycles.volume_bounces = 3   # облака светлые изнутри — многократное рассеяние
    elif A.view != 'orbit':
        cinema(True, A.view)
    sc.render.filepath = os.path.join(OUT, 'still_%s_%03d.png' % (A.view, A.frame)); sc.render.image_settings.file_format = 'PNG'
    tt = time.time(); bpy.ops.render.render(write_still=True)
    log('кадр %s %d: %.0f с → %s' % (A.view, A.frame, time.time() - tt, sc.render.filepath))
    raise SystemExit(0)


def manifest():
    """manifest.json для сайта: кадры, размеры, папки и точка квартиры на экране по кадрам облёта и подлёта (доли кадра)"""
    f = O['floor'] - 1; zf = O['plinth'] + (f + 0.5) * O['floor_h']
    anchor = Vector((*O['_anchor'], zf))   # середина главного фасада на этаже квартиры

    def track(n, pose):
        out = []
        for k in range(n):
            cam.location, aim.location = pose(k); bpy.context.view_layer.update()
            v = world_to_camera_view(sc, cam, anchor)
            out.append([round(v.x, 4), round(1 - v.y, 4)] if v.z > 0 and 0 <= v.x <= 1 and 0 <= v.y <= 1 else None)
        return out
    cam.data.angle_y = math.radians(FOV)
    have = lambda d: os.path.isdir(os.path.join(OUT, d, 'hd'))
    m = {
        'object': A.object, 'name': O['name'], 'floor': O['floor'], 'floors': O['floors'],
        'sizes': {k: v[0] for k, v in SIZES.items()}, 'aspect': [W, H],
        'orbit': {'dir': 'orbit/{size}/%03d.webp', 'frames': ORBIT_N, 'step': ORBIT_STEP, 'start': O['orbit']['start'], 'ready': have('orbit'),
                  'label': track(ORBIT_N, orbit_pose)},
        'approach': {'dir': 'approach/{size}/%03d.webp', 'frames': APPROACH_N, 'fps': APPROACH_FPS, 'ends_at_orbit': 0, 'ready': have('approach'),
                     'label': track(APPROACH_N, approach_pose)},
        'mask': {'dir': 'mask/{size}/%03d.webp', 'frames': ORBIT_N, 'same_as': 'orbit', 'ready': have('mask')},
        'intro': {'dir': 'intro/{size}/%03d.webp', 'file': 'intro.mp4', 'frames': INTRO_N, 'fps': INTRO_FPS, 'ends_at_orbit': 0,
                  'clouds_until': 0.74, 'ready': os.path.exists(os.path.join(OUT, 'intro.mp4'))},
        'stills': {v: 'stills/{size}/%s.webp' % v for v in VIEWS},
        'quality': A.quality,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh_:
        json.dump(m, fh_, ensure_ascii=False, indent=1)
    log('manifest.json готов:', os.path.join(OUT, 'manifest.json'))


def stills():
    """постоянные ракурсы (главный кадр, с улицы, сбоку) в полном качестве → stills/{sm,md,hd}/<вид>.webp"""
    setup_engine('cycles')
    if not DRAFT:
        sc.cycles.samples = 512; sc.cycles.adaptive_threshold = 0.006   # главные кадры — без шума даже в лоджиях
    folder = os.path.join(OUT, 'stills')
    STATUS.update(stage='главные кадры', total=len(VIEWS), done=0)
    for v in VIEWS:
        if os.path.exists(os.path.join(folder, 'hd', v + '.webp')):
            STATUS['done'] += 1; continue
        cam.location, aim.location = view_pose(v); cinema(True, v)
        tmp = os.path.join(folder, '_tmp_%s.png' % v); os.makedirs(folder, exist_ok=True)
        sc.render.filepath = tmp; sc.render.image_settings.file_format = 'PNG'
        t = time.time(); bpy.ops.render.render(write_still=True); dt = time.time() - t
        sc.render.filepath = os.path.join(folder, v + '.png')
        import shutil; shutil.copy(tmp, os.path.join(folder, v + '.png'))   # PNG без потерь — для печати и соцсетей
        save_webp(tmp, folder, 0)
        for size in SIZES:
            os.replace(os.path.join(folder, size, '000.webp'), os.path.join(folder, size, v + '.webp'))
        STATUS['done'] += 1; STATUS['times'].append(dt); log('главный кадр %s: %.0f с' % (v, dt)); write_status()
    cam.data.angle_y = math.radians(FOV); sky_turn(0.0)
    if CINEMA: cinema(False)


if A.what == 'manifest':
    manifest(); raise SystemExit(0)
if A.what == 'stills':
    stills(); manifest(); raise SystemExit(0)
if A.what == 'test':
    import shutil
    tdir = os.path.join(OUT, '_test'); shutil.rmtree(tdir, ignore_errors=True)   # тест всегда считает заново
    plan = []
    for name, eng, frames, pose, n in (('облёт', 'cycles', [0, 36], orbit_pose, ORBIT_N),
                                        ('подлёт', 'eevee' if A.eevee and not A.cpu else 'cycles', [0, 60], approach_pose, APPROACH_N),
                                        ('вступление', 'cycles', [60, 140], intro_pose, INTRO_N),
                                        ('маска', 'mask', [0, 36], orbit_pose, ORBIT_N)):
        if name == 'маска':
            mask_mode(True, objs, mask)
        if name == 'вступление':
            clouds().hide_render = False; CLOUD['sun'].hide_render = False
        elif CLOUD:
            CLOUD['obj'].hide_render = True; CLOUD['sun'].hide_render = True; set_clouds(0.0)
        setup_engine(eng); STATUS['times'] = []
        if name in ('подлёт', 'вступление') and eng == 'cycles' and not DRAFT:
            sc.cycles.samples = 64
        if name == 'вступление':
            set_clouds(1.0)
        run('тест: ' + name, os.path.join(tdir, name), frames, pose)
        # первый кадр дольше (сборка сцены на видеокарте) — в прогноз берём второй
        plan.append((name, n, STATUS['times'][-1]))
    t_st = plan[0][2] * 4 * len(VIEWS) * (1 if DRAFT else 4)       # главные кадры: 512 выборок вместо 128
    total = sum(n * t for _, n, t in plan) + t_st
    lines = ['%-8s %3d кадров × %5.1f с = %5.0f мин' % (nm, n, t, n * t / 60) for nm, n, t in plan]
    lines.append('главные кадры (%d) ≈ %.0f мин' % (len(VIEWS), t_st / 60))
    lines.append('ВСЕГО ≈ %.1f ч (качество %s)' % (total / 3600, A.quality))
    for l_ in lines: log(l_)
    STATUS.update(stage='тест готов', done=0, total=0, times=[]); write_status('\n'.join(lines))
    raise SystemExit(0)
if A.what in ('orbit', 'all'):
    setup_engine('cycles'); run('облёт', orbit_dir, list(range(ORBIT_N)), orbit_pose)
if A.what in ('approach', 'all'):
    setup_engine('eevee' if A.eevee and not A.cpu else 'cycles')
    if sc.render.engine == 'CYCLES' and not DRAFT:
        sc.cycles.samples = 64                   # подлёт короткий и в движении — 64 выборки + шумодав, свет тот же, что в облёте
    run('подлёт', appr_dir, list(range(APPROACH_N)), approach_pose)
if A.what in ('intro', 'all'):
    stage_intro()
if A.what == 'all':
    stills()
if A.what in ('mask', 'all'):
    mask_mode(True, objs, mask); setup_engine('mask'); run('маска этажа', mask_dir, list(range(ORBIT_N)), orbit_pose)
if A.what == 'all':
    manifest()
log('готово:', OUT)
