"""
Арден v2: кадры для сайта «псевдо-3D» (Blender 4.5 LTS, Cycles, видеокарта NVIDIA).

Что рендерит (порядок = приоритет; прерванный рендер продолжается той же командой):
  1. village/orbit/000–143.webp   облёт посёлка, 144 кадра через 2,5° (между ними сайт досчитывает ещё по одному)
  2. houses/NN/orbit/KKK.webp     облёты домов — только кадры чистого сектора, через 7,5°
  3. houses/NN/approach.mp4       подлёт с круга облёта к дому, 3,5 с при 24 к/с
  4. village/intro.mp4            вступление сквозь облака, 8 с; последний кадр = облёт, кадр 0
  manifest.json                   метки домов на каждом кадре облёта, сектора, связь «кадр облёта → дом»
  status.txt                      ход работы: этап, кадры, время кадра, сколько осталось

Сцена: scene/village.glb + village.json + sky_2k.hdr (выгрузка сайта), scene/assets (Poly Haven, машины Sketchfab).

  blender -b -P arden_render.py -- --scene scene --out renders --what all [--mode night|3h]

--what   check   — видеокарта и ассеты (без рендера)
         assets  — докачать ассеты Poly Haven
         test    — по кадру каждого этапа, время и прогноз на всё
         orbit | houses | approach | intro | all | manifest
--mode   night (по умолчанию: 96 выборок)  |  3h (48 выборок, для короткого захода)
"""
import argparse
import json
import math
import os
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import arden_assets  # noqa: E402

# ---------------------------------------------------------------- параметры
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser(prog='arden_render.py')
ap.add_argument('--scene', default=os.path.join(HERE, 'scene'))
ap.add_argument('--out', default=os.path.join(HERE, 'renders'))
ap.add_argument('--what', default='all', choices=['check', 'assets', 'test', 'orbit', 'houses', 'approach', 'intro', 'all', 'manifest'])
ap.add_argument('--mode', default='night', choices=['night', '3h'])
ap.add_argument('--house', type=int, default=0, help='только один дом (1–6)')
ap.add_argument('--percent', type=int, default=0, help='масштаб разрешения, %% (для проверки)')
ap.add_argument('--cpu', action='store_true', help='без видеокарты (только для проверки скрипта)')
ap.add_argument('--frames', default='', help='только эти кадры, например 0,72 (для проверки)')
ap.add_argument('--save-blend', action='store_true')
ap.add_argument('--look', default='', help='проверочный кадр с любой точки: x,y,z,цель_x,цель_y,цель_z (координаты сайта) → _work/look.webp')
A = ap.parse_args(argv)

SCENE_DIR, OUT = os.path.abspath(A.scene), os.path.abspath(A.out)
WORK = os.path.join(OUT, '_work')
os.makedirs(WORK, exist_ok=True)
W, H = 1920, 1080
ORBIT_N, ORBIT_STEP = 144, 2.5          # облёт посёлка: 144 настоящих кадра (сайт досчитывает до 288)
HOUSE_N, HOUSE_STEP = 48, 7.5           # облёт дома: кадры чистого сектора (сайт досчитывает вдвое)
APPROACH_FPS, APPROACH_SEC = 24, 3.5    # подлёт: 84 кадра
INTRO_FPS, INTRO_SEC = 24, 8            # вступление: 193 кадра
FAST = A.mode == '3h'
SPP = (48, 16) if FAST else (96, 24)    # (потолок, минимум) адаптивной выборки + шумодав
SPP_INTRO = (32, 12) if FAST else (64, 16)  # облака: меньше выборок
# чистые сектора облёта дома (кадры через 7,5°): сзади камера уходит в ёлки — те кадры не считаем
with open(os.path.join(HERE, 'sectors.json'), encoding='utf-8') as f:
    SECTORS = {int(k): v for k, v in json.load(f).items() if not k.startswith('_')}

# относительная цена кадра этапа (замер: облёт = 1) и число кадров — для общего прогноза в status.txt
PLAN = {'1. облёт посёлка': (ORBIT_N, 1.0), '2. облёты домов': (172, .47),  # уточняется по sectors.json ниже
        '3. подлёты': (6 * round(APPROACH_FPS * APPROACH_SEC), .5), '4. вступление': (round(INTRO_FPS * INTRO_SEC) + 1, .8)}
COST = {k: c for k, (n, c) in PLAN.items()}
STATUS = {'stage': '', 'done': 0, 'total': 0, 'times': [], 'level': 0, 'notes': [], 'stages': {}}


def log(*a):
    print('[arden]', *a, flush=True)


def write_status(final=None):
    """status.txt — коротко и по-русски, чтобы утром было видно, что сделано"""
    s = STATUS; t = s['times'][-20:]
    avg = sum(t) / len(t) if t else 0
    lines = ['Арден v2 — рендер (%s)' % ('ночь' if not FAST else '3 часа'), 'Обновлено: ' + time.strftime('%d.%m %H:%M:%S'), '']
    if final:
        lines += [final, '']
    if s['stage'] and not final:
        lines += ['Сейчас: %s — кадр %d из %d' % (s['stage'], s['done'], s['total'])]
        if avg:
            lines += ['Кадр в среднем: %.0f с, этапу осталось ≈ %.0f мин' % (avg, avg * (s['total'] - s['done']) / 60)]
            if A.what == 'all' and s['stage'] in COST:  # всё остальное — по относительной цене кадра этапов
                unit = avg / COST[s['stage']]; left = 0
                for name, (n, c) in PLAN.items():
                    d = s['stages'].get(name, (0, n))[0]
                    left += max(0, s['stages'].get(name, (0, n))[1] - d) * c * unit
                lines += ['Всего осталось ≈ %.1f ч (готово примерно к %s)' % (left / 3600, time.strftime('%H:%M', time.localtime(time.time() + left)))]
    lines += ['', 'Этапы:']
    for name, (d, n) in s['stages'].items():
        lines.append('  %-22s %4d / %-4d %s' % (name, d, n, 'готово' if n and d >= n else ''))
    if s['level']:
        lines += ['', 'Экономия видеопамяти: ступень %d (меньше травы/фактур — так и задумано, если памяти не хватило)' % s['level']]
    if s['notes']:
        lines += ['', 'Заметки:'] + ['  ' + n for n in s['notes'][-8:]]
    with open(os.path.join(OUT, 'status.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def note(msg):
    log(msg); STATUS['notes'].append(time.strftime('%H:%M ') + msg); write_status()


def b(v):
    """three.js (Y вверх) → Blender (Z вверх)"""
    return Vector((v[0], -v[2], v[1]))


def hex_rgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c]


# ---------------------------------------------------------------- видеокарта и ассеты
def gpu_setup():
    if A.cpu:
        return None
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind; prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices: d.use = d.type == kind
                return kind, [d.name for d in gpus]
        except TypeError:
            continue
    return None


if A.what != 'manifest':
    arden_assets.fetch_all(SCENE_DIR)  # докачать недостающее (готовое пропускается)
if A.what == 'check':
    g = gpu_setup()
    log('видеокарта:', g or 'НЕ НАЙДЕНА'); log('сцена и ассеты на месте:', SCENE_DIR)
    raise SystemExit(0 if g or A.cpu else 2)
if A.what == 'assets':
    raise SystemExit(0)

# ---------------------------------------------------------------- сцена
DATA = json.load(open(os.path.join(SCENE_DIR, 'village.json'), encoding='utf-8'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
t0 = time.time()
bpy.ops.import_scene.gltf(filepath=os.path.join(SCENE_DIR, 'village.glb'))
log('импорт сцены за %.0f с' % (time.time() - t0))

import arden_v2  # noqa: E402
LEVEL_FILE = os.path.join(WORK, 'memory_level.txt')
LEVEL = int(open(LEVEL_FILE).read()) if os.path.exists(LEVEL_FILE) else 0
STATUS['level'] = LEVEL
S2 = arden_v2.Scene2(SCENE_DIR, DATA, log, grass_scale=(1.0, .6, .35, .2, .2)[min(LEVEL, 4)])
t0 = time.time()
S2.build()
FOREST = S2.build_forest()
if LEVEL >= 2:
    S2.simplify_forest()
S2.thin_glass()
log('сцена v2 собрана за %.0f с' % (time.time() - t0))

# ---------------------------------------------------------------- свет: закат, два солнца (посёлок / лес)
world = bpy.data.worlds.new('Небо'); sc.world = world; world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
wn.clear()
bg = wn.new('ShaderNodeBackground'); wout = wn.new('ShaderNodeOutputWorld'); wl.new(bg.outputs['Background'], wout.inputs['Surface'])
SUN_EL, SUN_AZ = math.radians(28), math.radians(-95)     # проверено в v1: кадр 0 — фасады в свету, тени не заливают участки
sun_vec = Vector((math.cos(SUN_EL) * math.cos(SUN_AZ), math.cos(SUN_EL) * math.sin(SUN_AZ), math.sin(SUN_EL)))
sky = wn.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_disc = False; sky.sun_elevation = SUN_EL
sky.sun_rotation = math.atan2(sun_vec.x, sun_vec.y); sky.dust_density = 2.5
wl.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = .08
sun_d = bpy.data.lights.new('Солнце', 'SUN'); sun_d.energy = 6.0; sun_d.color = (1.0, .6, .36); sun_d.angle = math.radians(1.0)
sun = bpy.data.objects.new('Солнце', sun_d); sc.collection.objects.link(sun)
sun.rotation_euler = sun_vec.to_track_quat('Z', 'Y').to_euler()
# ели 11–25 м при низком солнце залили бы посёлок тенью: посёлок и лес освещаются разными солнцами
f_in, f_ex = bpy.data.collections.new('лес'), bpy.data.collections.new('кроме_леса')
for o in FOREST:
    f_in.objects.link(o); f_ex.objects.link(o)
for co in f_ex.collection_objects:
    co.light_linking.link_state = 'EXCLUDE'
sun.light_linking.receiver_collection = f_ex; sun.light_linking.blocker_collection = f_ex
sun_f = bpy.data.objects.new('Солнце леса', sun_d.copy()); sc.collection.objects.link(sun_f)
sun_f.data.color = (1.0, .82, .66); sun_f.data.energy = 4.8; sun_f.rotation_euler = sun.rotation_euler
sun_f.light_linking.receiver_collection = f_in

# ---------------------------------------------------------------- облака (вступление)
bpy.ops.mesh.primitive_cube_add()
cloud = bpy.context.active_object; cloud.name = 'Облака'; cloud.location = b((-40, 245, 60)); cloud.scale = (700, 700, 55)
cm = bpy.data.materials.new('Облака'); cm.use_nodes = True; cn, cl = cm.node_tree.nodes, cm.node_tree.links; cn.clear()
o_tc = cn.new('ShaderNodeTexCoord'); o_map = cn.new('ShaderNodeMapping'); o_map.inputs['Scale'].default_value = (700 / 110, 700 / 110, 55 / 45)
noise = cn.new('ShaderNodeTexNoise'); noise.inputs['Detail'].default_value = 8; noise.inputs['Roughness'].default_value = .55
cover = cn.new('ShaderNodeMapRange'); cover.inputs['From Min'].default_value = .44; cover.inputs['From Max'].default_value = .62
sep = cn.new('ShaderNodeSeparateXYZ'); habs = cn.new('ShaderNodeMath'); habs.operation = 'ABSOLUTE'
hgt = cn.new('ShaderNodeMapRange'); hgt.inputs['From Min'].default_value = .25; hgt.inputs['To Min'].default_value = 1; hgt.inputs['To Max'].default_value = 0
lift = cn.new('ShaderNodeMath'); lift.operation = 'MULTIPLY_ADD'; lift.inputs[1].default_value = -1.3; lift.inputs[2].default_value = .55
top = cn.new('ShaderNodeMath'); top.operation = 'ADD'
rad = cn.new('ShaderNodeVectorMath'); rad.operation = 'LENGTH'; flat = cn.new('ShaderNodeVectorMath'); flat.operation = 'MULTIPLY'; flat.inputs[1].default_value = (1, 1, 0)
edge = cn.new('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = .55; edge.inputs['From Max'].default_value = .98; edge.inputs['To Min'].default_value = 1; edge.inputs['To Max'].default_value = 0
m1, m2, dens, dk = [cn.new('ShaderNodeMath') for _ in range(4)]
for m in (m1, m2, dens, dk): m.operation = 'MULTIPLY'
dk.inputs[1].default_value = .08
fade = cn.new('ShaderNodeValue'); fade.name = 'fade'; fade.outputs[0].default_value = 1
vol = cn.new('ShaderNodeVolumePrincipled'); vol.inputs['Color'].default_value = (1, .98, .96, 1); vol.inputs['Anisotropy'].default_value = .45
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

# ---------------------------------------------------------------- камера
cam_d = bpy.data.cameras.new('Камера'); cam_d.sensor_fit = 'VERTICAL'; cam_d.angle_y = math.radians(DATA['fov'])
cam_d.clip_start = .3; cam_d.clip_end = 3000
cam = bpy.data.objects.new('Камера', cam_d); sc.collection.objects.link(cam); sc.camera = cam
aim = bpy.data.objects.new('Цель', None); sc.collection.objects.link(aim)
tr = cam.constraints.new('TRACK_TO'); tr.target = aim; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
COS_FOV = math.cos(math.atan(math.tan(math.radians(DATA['fov'] / 2)) * math.hypot(16, 9) / 9) + math.radians(12))  # диагональ кадра + запас


def look(pos, target):
    cam.location = b(pos); aim.location = b(target)
    S2.update_camera(cam.location, (aim.location - cam.location).normalized(), COS_FOV)  # трава: только в кадре и поближе


# ---------------------------------------------------------------- рендер: Cycles на скорость
r, cy = sc.render, sc.cycles
r.engine = 'CYCLES'
g = gpu_setup()
if g:
    cy.device = 'GPU'; log('видеокарта:', g[0], ', '.join(g[1]))
elif not A.cpu:
    note('ВНИМАНИЕ: видеокарта не найдена — рендер на процессоре, будет очень долго')
cy.use_adaptive_sampling = True; cy.adaptive_threshold = .03 if FAST else .02
cy.use_denoising = True
cy.denoiser = 'OPTIX' if g and g[0] == 'OPTIX' else 'OPENIMAGEDENOISE'
cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
cy.max_bounces = 6; cy.diffuse_bounces = 3; cy.glossy_bounces = 3; cy.transmission_bounces = 4
cy.transparent_max_bounces = 16; cy.volume_bounces = 0
cy.caustics_reflective = cy.caustics_refractive = False
cy.sample_clamp_direct = 0; cy.sample_clamp_indirect = 10; cy.blur_glossy = 1.0
cy.volume_step_rate = 2.0; cy.volume_max_steps = 128
# рельеф дорог, мощения, земли — адаптивное подразделение: ~1,5 пикселя на грань вблизи, за кадром грубее
cy.feature_set = 'EXPERIMENTAL'; cy.dicing_rate = 1.5; cy.offscreen_dicing_scale = 8; cy.max_subdivisions = 10
cy.texture_limit_render = ('2048', '1024', '1024', '512', '512')[min(LEVEL, 4)]
r.use_persistent_data = LEVEL < 1
r.film_transparent = False
vs = sc.view_settings; vs.view_transform = 'AgX'; vs.look = 'AgX - Base Contrast'; vs.exposure = math.log2(DATA['exposure']) + .3 + .6
if LEVEL >= 4:
    cy.device = 'CPU'


def res(scale=100):
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, A.percent or scale


# ---------------------------------------------------------------- обработка кадра: дымка, свечение, цвет, виньетка
vl = sc.view_layers[0]; vl.use_pass_mist = True; vl.use_pass_z = True
world.mist_settings.start = 300; world.mist_settings.depth = 700; world.mist_settings.falloff = 'LINEAR'


def setup_post():
    sc.use_nodes = True; tree = sc.node_tree; tree.nodes.clear(); n, l = tree.nodes, tree.links
    rl = n.new('CompositorNodeRLayers'); out = n.new('CompositorNodeComposite')
    lt = n.new('CompositorNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 1e5
    mm = n.new('CompositorNodeMath'); mm.operation = 'MULTIPLY'
    l.new(rl.outputs['Depth'], lt.inputs[0]); l.new(rl.outputs['Mist'], mm.inputs[0]); l.new(lt.outputs[0], mm.inputs[1])
    fog = n.new('CompositorNodeMixRGB'); l.new(mm.outputs[0], fog.inputs[0]); l.new(rl.outputs['Image'], fog.inputs[1])
    fog.inputs[2].default_value = (*hex_rgb(0xa9b8c9), 1)
    img = fog.outputs[0]
    def put(node, name, value, attr=None, kind=None):
        """Blender 4.5: настройки узлов композитинга — входы (сокеты); в старых версиях — свойства узла"""
        sock = next((i for i in node.inputs if i.name == name and (kind is None or i.type == kind)), None)
        if sock is not None and hasattr(sock, 'default_value'):
            sock.default_value = value
        elif attr and hasattr(node, attr):
            setattr(node, attr, value)
    try:  # мягкое свечение светлых мест (слабое: только вокруг самых ярких бликов)
        gl = n.new('CompositorNodeGlare'); gl.glare_type = 'BLOOM'
        put(gl, 'Threshold', 1.2, 'threshold'); put(gl, 'Strength', .1); put(gl, 'Size', .5)
        if not any(i.name == 'Strength' for i in gl.inputs) and hasattr(gl, 'mix'): gl.mix = -.9
        l.new(img, gl.inputs[0]); img = gl.outputs[0]
    except Exception as e:
        log('свечение не настроено:', e)
    cb = n.new('CompositorNodeColorBalance')  # чуть теплее в светах, чуть холоднее в тенях
    for name, v in (('Lift', (.99, 1.0, 1.015)), ('Gamma', (1.0, 1.0, 1.0)), ('Gain', (1.025, 1.005, .975))):
        if any(i.name == name for i in cb.inputs): put(cb, name, (*v, 1), kind='RGBA')
        else: setattr(cb, name.lower(), v)
    l.new(img, cb.inputs['Image'] if 'Image' in cb.inputs else cb.inputs[1]); img = cb.outputs[0]
    # лёгкая виньетка: эллипс во весь кадр (размер — в долях ширины кадра), размытый, края ×0,8
    em = n.new('CompositorNodeEllipseMask')
    put(em, 'Size', (1.0, H / W), None); em.width, em.height = 1.0, H / W
    bl = n.new('CompositorNodeBlur'); bl.filter_type = 'GAUSS'
    px = W * (A.percent or 100) / 100 * .15
    if any(i.name == 'Size' for i in bl.inputs): bl.use_relative = False; put(bl, 'Size', (px, px))
    else: bl.use_relative = True; bl.factor_x = bl.factor_y = 15
    vg = n.new('CompositorNodeMapRange'); vg.inputs['To Min'].default_value = .8; vg.inputs['To Max'].default_value = 1.0
    l.new(em.outputs[0], bl.inputs[0]); l.new(bl.outputs[0], vg.inputs[0])
    mul = n.new('CompositorNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    l.new(img, mul.inputs[1]); l.new(vg.outputs[0], mul.inputs[2]); l.new(mul.outputs[0], out.inputs[0])


try:
    setup_post()
except Exception as e:
    note('обработка кадра (дымка/свечение/виньетка) не настроена: %s' % e)
if A.save_blend:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'arden_v2.blend'))


# ---------------------------------------------------------------- кадр: рендер с откатом при нехватке видеопамяти
def lower_memory():
    """следующая ступень экономии: меньше травы и фактуры, затем проще лес, затем процессор"""
    global LEVEL
    LEVEL += 1; open(LEVEL_FILE, 'w').write(str(LEVEL)); STATUS['level'] = LEVEL
    if LEVEL == 1:
        S2.set_density(.6); cy.texture_limit_render = '1024'; r.use_persistent_data = False
        note('не хватило видеопамяти: трава 60 %, фактуры до 1024, без persistent data')
    elif LEVEL == 2:
        S2.set_density(.35); S2.simplify_forest(); note('не хватило видеопамяти: трава 35 %, ели упрощены')
    elif LEVEL == 3:
        S2.set_density(.2); cy.texture_limit_render = '512'; note('не хватило видеопамяти: трава 20 %, фактуры 512')
    else:
        cy.device = 'CPU'; note('видеопамяти не хватает даже на минимуме — дальше рендер на процессоре (очень долго)')


def shot(path, fmt='WEBP'):
    """кадр в файл; готовый файл пропускаем. Возвращает секунды или None."""
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = r.image_settings; im.file_format = fmt; im.color_mode = 'RGB'
    if fmt == 'WEBP': im.quality = 92
    tmp = path + '.tmp.' + fmt.lower()  # пишем во временный файл: обрыв не оставит битый кадр
    r.filepath = tmp
    for attempt in range(6):
        bpy.context.view_layer.update()
        t = time.time(); ok = False
        try:
            ok = 'FINISHED' in bpy.ops.render.render(write_still=True)
        except RuntimeError as e:
            log('ошибка рендера:', e)
        if ok and os.path.exists(tmp) and os.path.getsize(tmp) > 1000:
            os.replace(tmp, path); return time.time() - t
        if LEVEL >= 4:
            raise RuntimeError('кадр не получился даже на процессоре: ' + path)
        lower_memory()
    raise RuntimeError('кадр не получился: ' + path)


def progress(stage, done, total, t):
    STATUS.update(stage=stage, done=done, total=total)
    if t: STATUS['times'].append(t)
    STATUS['stages'][stage] = (done, total)
    write_status()
    if t: log('%s: %d/%d, %.0f с' % (stage, done, total, t))


# ---------------------------------------------------------------- траектории (как в v1: manifest и стыки остаются валидными)
ease = lambda t: 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2
clamp = lambda v: max(0.0, min(1.0, v))
lerp = lambda a, c, t: [a[k] + (c[k] - a[k]) * t for k in range(3)]
I = DATA['intro']; CENTER = DATA['aerial']['target']; START = DATA['aerial']['landscape']


def orbit_pose(k, step=ORBIT_STEP):
    a = math.radians(k * step); dx, dz = START[0] - CENTER[0], START[2] - CENTER[2]
    return [CENTER[0] + dx * math.cos(a) + dz * math.sin(a), START[1], CENTER[2] - dx * math.sin(a) + dz * math.cos(a)], CENTER


def house_pose(h):
    c = h['pos']; size = max(h['W'], h['D']); dist = size * 1.75 + 6; fz = -1 if h['side'] > 0 else 1
    return [c[0] + dist * .55, 4 + dist * .22, c[2] + fz * dist * .82], [c[0], h['H'] * .35, c[2]]


def house_orbit_pose(h, k):
    p0, tg = house_pose(h); a = math.radians(k * HOUSE_STEP); dx, dz = p0[0] - tg[0], p0[2] - tg[2]
    return [tg[0] + dx * math.cos(a) + dz * math.sin(a), p0[1], tg[2] - dx * math.sin(a) + dz * math.cos(a)], tg


def best_orbit_frame(h):
    """как в v1: лучший из 72 ракурсов (через 5°) → номер кадра облёта v2 (через 2,5°)"""
    front = (0, -1) if h['side'] > 0 else (0, 1); best, score = 0, -9
    for k in range(72):
        p, _ = orbit_pose(k, 5.0); vx, vz = p[0] - h['pos'][0], p[2] - h['pos'][2]; d = math.hypot(vx, vz)
        s = (vx * front[0] + vz * front[1]) / d - d / 2000
        if s > score: best, score = k, s
    return best * 2


APPROACH_N = round(APPROACH_SEC * APPROACH_FPS)
INTRO_N = INTRO_SEC * INTRO_FPS + 1


def approach_pose(h, f):
    p0, t0_ = orbit_pose(best_orbit_frame(h)); p1, t1 = house_pose(h)
    t = f / (APPROACH_N - 1); e = ease(t); arc = math.dist(p0, p1) * .12
    pos = lerp(p0, p1, e); pos[1] += math.sin(math.pi * e) * arc
    return pos, lerp(t0_, t1, ease(clamp(t * 1.15)))


def intro_pose(f):
    t = f / (INTRO_N - 1)
    return lerp(I['pos'], START, ease(t)), lerp(I['target'], CENTER, ease(clamp(t * I['targetLead'])))


def sector(i):
    first, last = SECTORS[i]; out, k = [], first
    while True:
        out.append(k)
        if k == last: return out
        k = (k + 1) % HOUSE_N


PLAN['2. облёты домов'] = (sum(len(sector(i)) for i in SECTORS), .47)


# ---------------------------------------------------------------- manifest
def manifest():
    S2.enable_scatter(False)  # для меток трава не нужна — без неё быстрее
    res(); houses = DATA['houses']; frames = []
    for k in range(ORBIT_N):
        look(*orbit_pose(k)); bpy.context.view_layer.update()
        row = []
        for h in houses:
            v = world_to_camera_view(sc, cam, b([h['pos'][0], h['H'] + 1, h['pos'][2]]))
            row.append([round(v.x, 4), round(1 - v.y, 4), int(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)])
        frames.append(row)
    m = {'version': 2, 'width': W, 'height': H, 'fov': DATA['fov'],
         'village': {'orbit': {'frames': ORBIT_N, 'stepDeg': ORBIT_STEP, 'pattern': 'village/orbit/{000}.webp', 'labels': frames},
                     'intro': {'file': 'village/intro.mp4', 'fps': INTRO_FPS, 'seconds': INTRO_SEC, 'endsOnOrbitFrame': 0}},
         'houses': [{'index': i + 1, 'name': h['name'], 'orbitFrame': best_orbit_frame(h),
                     'approach': {'file': 'houses/%02d/approach.mp4' % (i + 1), 'fps': APPROACH_FPS, 'frames': APPROACH_N},
                     'orbit': {'frames': HOUSE_N, 'stepDeg': HOUSE_STEP, 'pattern': 'houses/%02d/orbit/{000}.webp' % (i + 1),
                               'sector': sector(i + 1)}} for i, h in enumerate(houses)]}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False)
    S2.enable_scatter(True)
    log('manifest.json готов')


# ---------------------------------------------------------------- этапы
def houses_sel():
    hs = list(enumerate(DATA['houses']))
    return [hs[A.house - 1]] if A.house else hs


def only(default):
    return [int(x) for x in A.frames.split(',')] if A.frames else list(default)


def stage_orbit():
    cy.samples, cy.adaptive_min_samples = SPP; cloud.hide_render = True; r.use_motion_blur = False; res()
    ks = only(range(ORBIT_N)); name = '1. облёт посёлка'
    done = sum(os.path.exists(os.path.join(OUT, 'village/orbit/%03d.webp' % k)) for k in ks)
    for k in ks:
        look(*orbit_pose(k)); t = shot(os.path.join(OUT, 'village/orbit/%03d.webp' % k))
        if t: done += 1
        progress(name, done, len(ks), t)


def stage_houses():
    cy.samples, cy.adaptive_min_samples = SPP; cloud.hide_render = True; r.use_motion_blur = False; res()
    jobs = [(i, h, k) for i, h in houses_sel() for k in only(sector(i + 1))]
    name = '2. облёты домов'
    done = sum(os.path.exists(os.path.join(OUT, 'houses/%02d/orbit/%03d.webp' % (i + 1, k))) for i, h, k in jobs)
    for i, h, k in jobs:
        look(*house_orbit_pose(h, k)); t = shot(os.path.join(OUT, 'houses/%02d/orbit/%03d.webp' % (i + 1, k)))
        if t: done += 1
        progress(name, done, len(jobs), t)


def stage_approach():
    cy.samples, cy.adaptive_min_samples = SPP; cloud.hide_render = True; r.use_motion_blur = False; res()
    name = '3. подлёты'; hs = houses_sel(); total = len(hs) * APPROACH_N
    done = sum(len([f for f in os.listdir(os.path.join(WORK, 'approach_%02d' % (i + 1))) if f.endswith('.png')])
               for i, _ in hs if os.path.isdir(os.path.join(WORK, 'approach_%02d' % (i + 1))))
    for i, h in hs:
        folder = os.path.join(WORK, 'approach_%02d' % (i + 1))
        for f in only(range(APPROACH_N)):
            look(*approach_pose(h, f)); t = shot(os.path.join(folder, '%03d.png' % f), 'PNG')
            if t: done += 1
            progress(name, done, total, t)
        mp4 = os.path.join(OUT, 'houses/%02d/approach.mp4' % (i + 1))
        if not A.frames and not os.path.exists(mp4):
            encode(folder, mp4, APPROACH_FPS)


def stage_intro():
    cy.samples, cy.adaptive_min_samples = SPP_INTRO; cloud.hide_render = False; res()
    fn = cm.node_tree.nodes['fade'].outputs[0]
    for t, v in ((0, 1), (.6, 1), (.82, 0), (1, 0)):  # облака тают, когда камера уже под ними
        fn.default_value = v; fn.keyframe_insert('default_value', frame=round(t * (INTRO_N - 1)))
    for f in range(INTRO_N):
        p, tg = intro_pose(f); cam.location = b(p); aim.location = b(tg)
        cam.keyframe_insert('location', frame=f); aim.keyframe_insert('location', frame=f)
    sc.frame_start, sc.frame_end = 0, INTRO_N - 1; r.fps = INTRO_FPS; r.use_motion_blur = True
    folder = os.path.join(WORK, 'intro'); name = '4. вступление'
    done = len([f for f in os.listdir(folder) if f.endswith('.png')]) if os.path.isdir(folder) else 0
    for f in only(range(INTRO_N)):
        sc.frame_set(f); look(*intro_pose(f)); t = shot(os.path.join(folder, '%03d.png' % f), 'PNG')
        if t: done += 1
        progress(name, done, INTRO_N, t)
    mp4 = os.path.join(OUT, 'village/intro.mp4')
    if not A.frames and not os.path.exists(mp4):
        encode(folder, mp4, INTRO_FPS)
    cloud.hide_render = True


def encode(folder, path, fps):
    """кадры PNG → MP4 (H.264) средствами Blender"""
    files = sorted(f for f in os.listdir(folder) if f.endswith('.png'))
    try:
        enc = bpy.data.scenes.new('Монтаж'); enc.render.fps = fps
        k = (A.percent or 100) / 100
        enc.render.resolution_x, enc.render.resolution_y, enc.render.resolution_percentage = int(W * k), int(H * k), 100
        enc.sequence_editor_create()
        strips = enc.sequence_editor.strips if hasattr(enc.sequence_editor, 'strips') else enc.sequence_editor.sequences
        st = strips.new_image('кадры', os.path.join(folder, files[0]), 1, 1)
        for f in files[1:]: st.elements.append(f)
        enc.frame_start, enc.frame_end = 1, len(files)
        enc.render.image_settings.file_format = 'FFMPEG'
        ff = enc.render.ffmpeg; ff.format = 'MPEG4'; ff.codec = 'H264'; ff.constant_rate_factor = 'HIGH'; ff.gopsize = 12
        enc.view_settings.view_transform = 'Standard'
        os.makedirs(os.path.dirname(path), exist_ok=True); enc.render.filepath = path
        with bpy.context.temp_override(scene=enc):
            bpy.ops.render.render(animation=True, scene=enc.name)
        bpy.data.scenes.remove(enc); log('видео:', path)
    except Exception as e:
        note('MP4 не собран (%s) — кадры в %s, соберём у себя' % (e, folder))


# ---------------------------------------------------------------- запуск
if A.look:
    v = [float(t) for t in A.look.split(',')]; cy.samples, cy.adaptive_min_samples = SPP; cloud.hide_render = True; r.use_motion_blur = False; res()
    look(v[:3], v[3:]); bpy.context.view_layer.update()
    for d in ((0, 0, -1), (aim.location - cam.location).normalized()):  # что под камерой и перед ней
        hit = sc.ray_cast(bpy.context.evaluated_depsgraph_get(), cam.location, Vector(d))
        mat = hit[4].material_slots[hit[3] and 0].material.name if hit[0] and hit[4].material_slots and hit[4].material_slots[0].material else ''
        log('луч', d, '→', hit[4].name if hit[0] else 'ничего', mat, '%.1f м' % ((hit[1] - cam.location).length if hit[0] else 0))
    if os.environ.get('ARDEN_PROBE'): raise SystemExit(0)
    log('проверочный кадр: %.0f с' % (shot(os.path.join(WORK, 'look.webp')) or 0)); raise SystemExit(0)
if A.what == 'test':
    # по одному кадру этапа (в _work/test), время → прогноз на всё
    T = os.path.join(WORK, 'test'); os.makedirs(T, exist_ok=True)
    jobs = (('облёт посёлка', orbit_pose(0), SPP, ORBIT_N, 'o.webp'),
            ('облёты домов', house_orbit_pose(DATA['houses'][0], 0), SPP, sum(len(sector(i)) for i in SECTORS), 'h.webp'),
            ('подлёты', approach_pose(DATA['houses'][0], 40), SPP, APPROACH_N * 6, 'a.png'),
            ('вступление', intro_pose(110), SPP_INTRO, INTRO_N, 'i.png'))
    est = []
    res()
    for name, pose, spp, n, fn in jobs:
        cy.samples, cy.adaptive_min_samples = spp; cloud.hide_render = name != 'вступление'
        look(*pose); p = os.path.join(T, fn)
        if os.path.exists(p): os.remove(p)
        sec = shot(p, 'PNG' if fn.endswith('png') else 'WEBP') or 0
        est.append((name, sec, n)); log('%s: %.0f с' % (name, sec))
    cloud.hide_render = True
    total = sum(s * k for _, s, k in est) / 3600
    note('ПРОГНОЗ (по одному кадру этапа; первый кадр — с загрузкой сцены, дальше обычно быстрее):')
    for n, s, k in est:
        note('  %-14s %4.0f с × %3d кадров ≈ %4.1f ч' % (n, s, k, s * k / 3600))
    note('  ВСЕГО ≈ %.1f ч' % total)
    raise SystemExit(0)
manifest()
for key, fn in (('orbit', stage_orbit), ('houses', stage_houses), ('approach', stage_approach), ('intro', stage_intro)):
    if A.what in (key, 'all'):
        fn()
write_status(final='ГОТОВО. Запустите pack.bat и пришлите получившийся zip.' if A.what == 'all' else None)
log('готово:', OUT)
