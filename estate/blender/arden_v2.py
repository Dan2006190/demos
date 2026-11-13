"""
Арден v2: сцена без плоских заплаток. Подключается из arden_render.py после импорта village.glb.

  газон        — сканированная трава Poly Haven (grass_bermuda_01) инстансами через Geometry Nodes,
                 до ~400 пучков/м² у камеры, реже вдали (пучки крупнее), отсечение по кадру и расстоянию
                 каждый кадр; полосы покоса и тон — в материале; кислица (как клевер) и одуванчики пятнами;
                 у дорожек — подстриженная кромка; под травой — земля с рельефом
  некошеное    — grass_medium / сорняки у заборов, на луговой кромке, по обочинам; в лесу — папоротник
  заборы       — геометрия: профлист (настоящая волна), евроштакетник, деревянный штакетник; столбы, лаги,
                 ворота и калитка; высота 1,6–2,0 м по участкам
  дорога       — сетка с рельефом (displacement по карте asphalt_02), заплатки, стёртая разметка, бордюр,
                 тротуар из плитки с рельефом, люки; фонари — геометрия
  участки      — кусты, цветники, мебель и кадки, машины у ворот (Sketchfab CC BY), беседки и качели
Все размеры — метры; оси сайта (x, z) → Blender (x, −z).
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

ROAD, PW, PD = 7, 28, 32
XS = (-90, -60, -30, 0, 30, 60, 90)
NEAR, FAR = ROAD / 2 + 1.9, ROAD / 2 + 1.6 + PD - .3   # передний и задний забор от оси дороги
CARS = {  # Sketchfab, CC BY 4.0 — авторы в assets/CREDITS.md; цвет кузова: None — как есть
    '7674a3bd168a451daf73fc0a33d39589': ('Hyundai Tucson 2015', (.5, .51, .53)),                 # серебристый
    'de74fe4e98004c92b1103947597d1b53': ('Toyota RAV4 2021', None),
    '8d2aa08e92da4c698ef922a71bae8729': ('Toyota Land Cruiser Prado 2013', None),
    '128458f37a254a32aa65e98dfad56946': ('Chery Tiggo 7 Pro 2022', (.32, .33, .34)),      # тёмно-серый
    '67645b6f549441a786e2b4050dc0268b': ('Hyundai Creta', (.012, .012, .014)),          # чёрный
    '3c333139feb744ae9d36767c0e9cabfd': ('Lada Vesta', (.03, .05, .12)),                 # тёмно-синий
}


def P(x, z, h=0.0):
    """точка в осях сайта (x, z, высота) → Blender"""
    return Vector((x, -z, h))


class Scene2:
    def __init__(self, root, data, log, rnd_seed=2026, grass_scale=1.0):
        self.root, self.data, self.log = root, data, log
        self.R = random.Random(rnd_seed)
        self.grass_scale = grass_scale      # 1.0 — полная плотность; при нехватке видеопамяти меньше
        self.mats, self.protos, self.culled, self.base_density = {}, {}, [], {}
        self.extra_rects = []               # занятые прямоугольники (мебель, машины): без травы
        self.sc = bpy.context.scene
        self.col_protos = self.collection('Образцы (не рендерятся)')
        self.col_protos.hide_render = False
        self.col_new = self.collection('Арден v2')

    # ------------------------------------------------------------ служебное
    def collection(self, name):
        c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
        if c.name not in self.sc.collection.children:
            self.sc.collection.children.link(c)
        return c

    def obj(self, name, mesh, col=None):
        o = bpy.data.objects.new(name, mesh); (col or self.col_new).objects.link(o); return o

    def buildings(self, pad=0.0):
        for b in self.data.get('buildings', []):
            yield b['pos'][0], b['pos'][2], b['W'] / 2 + pad, b['D'] / 2 + pad

    def free(self, x, z, pad=.5):
        return all(abs(x - bx) > hw or abs(z - bz) > hd for bx, bz, hw, hd in self.buildings(pad))

    # ------------------------------------------------------------ материалы Poly Haven с рельефом
    def pbr(self, slug, scale=2.0, disp=0.0, tint=None, recolor=None):
        """материал из фактуры Poly Haven: цвет, нормали, шероховатость; disp — рельеф в материале (м)"""
        key = (slug, scale, disp, tint, recolor)
        if key in self.mats:
            return self.mats[key]
        from arden_assets import texture_path
        m = bpy.data.materials.new('%s' % slug); m.use_nodes = True
        nt, L = m.node_tree, m.node_tree.links
        b = nt.nodes['Principled BSDF']
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1 / scale, 1 / scale, 1 / scale)
        L.new(tc.outputs['Object'], mp.inputs['Vector'])
        def img(kind, color):
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(texture_path(self.root, slug, kind), check_existing=True)
            t.projection = 'BOX'; t.projection_blend = .2
            if not color: t.image.colorspace_settings.name = 'Non-Color'
            L.new(mp.outputs['Vector'], t.inputs['Vector']); return t
        col = img('Diffuse', True)
        if recolor:  # оттенок из recolor, рисунок и яркость — из фактуры (бурую траву делаем зелёной)
            bw = nt.nodes.new('ShaderNodeRGBToBW'); L.new(col.outputs['Color'], bw.inputs['Color'])
            k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 2.2; L.new(bw.outputs['Val'], k.inputs[0])
            mix = nt.nodes.new('ShaderNodeVectorMath'); mix.operation = 'SCALE'; mix.inputs[0].default_value = recolor
            L.new(k.outputs[0], mix.inputs['Scale']); L.new(mix.outputs['Vector'], b.inputs['Base Color'])
        elif tint:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
            L.new(col.outputs['Color'], mix.inputs['A']); mix.inputs['B'].default_value = (*tint, 1)
            L.new(mix.outputs['Result'], b.inputs['Base Color'])
        else:
            L.new(col.outputs['Color'], b.inputs['Base Color'])
        if recolor:  # травяная подложка: матовая, иначе на закатном солнце блестит соломой
            b.inputs['Roughness'].default_value = .92
            sp = b.inputs.get('Specular IOR Level')
            if sp: sp.default_value = .15
        else:
            L.new(img('Rough', False).outputs['Color'], b.inputs['Roughness'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); L.new(img('nor_gl', False).outputs['Color'], nm.inputs['Color'])
        L.new(nm.outputs['Normal'], b.inputs['Normal'])
        if disp:
            d = nt.nodes.new('ShaderNodeDisplacement'); d.inputs['Scale'].default_value = disp; d.inputs['Midlevel'].default_value = .5
            L.new(img('Displacement', False).outputs['Color'], d.inputs['Height'])
            L.new(d.outputs['Displacement'], nt.nodes['Material Output'].inputs['Displacement'])
            m.displacement_method = 'BOTH'
        self.mats[key] = m
        return m

    def simple(self, name, color, rough=.5, metal=0.0):
        if name in self.mats:
            return self.mats[name]
        m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        self.mats[name] = m; return m

    @staticmethod
    def adaptive(o):
        """настоящий рельеф из карты высот через адаптивное подразделение Cycles: дробится по размеру на экране
        (мелко вблизи, грубо вдали) — геометрия есть, а памяти уходит мало"""
        for m in list(o.modifiers):
            if m.type == 'SUBSURF': o.modifiers.remove(m)
        sub = o.modifiers.new('рельеф', 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = 0; sub.render_levels = 1
        o.cycles.use_adaptive_subdivision = True
        return o

    def displaced_grid(self, name, x0, z0, x1, z1, h, step, mat, slug, strength, mid=.5, tex_scale=2.0):
        """плоскость с настоящим рельефом из карты высот фактуры (адаптивное подразделение + смещение в материале)"""
        from arden_assets import texture_path
        mat = self.with_disp(mat, slug, strength, tex_scale)
        step = max(step * 8, 1.0)  # грубая сетка — дальше дробит Cycles
        nx, nz = max(1, int(abs(x1 - x0) / step)), max(1, int(abs(z1 - z0) / step))
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=nx, y_segments=nz, size=.5)
        for v in bm.verts:
            v.co = P(x0 + (v.co.x + .5) * (x1 - x0), z0 + (v.co.y + .5) * (z1 - z0), h)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        o = self.obj(name, me); o.data.materials.append(mat)
        return self.adaptive(o)

    def with_disp(self, mat, slug, strength, scale):
        """копия материала со смещением по карте высот (если в нём ещё нет рельефа)"""
        key = ('disp', mat.name, strength)
        if key in self.mats: return self.mats[key]
        if mat.node_tree.nodes['Material Output'].inputs['Displacement'].is_linked:
            self.mats[key] = mat; return mat
        from arden_assets import texture_path
        m = mat.copy(); m.name = mat.name + ' рельеф'; nt, L = m.node_tree, m.node_tree.links
        mp = next(n for n in nt.nodes if n.type == 'MAPPING')
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(texture_path(self.root, slug, 'Displacement'), check_existing=True)
        t.image.colorspace_settings.name = 'Non-Color'; t.projection = 'BOX'; L.new(mp.outputs['Vector'], t.inputs['Vector'])
        d = nt.nodes.new('ShaderNodeDisplacement'); d.inputs['Scale'].default_value = strength; d.inputs['Midlevel'].default_value = .5
        L.new(t.outputs['Color'], d.inputs['Height']); L.new(d.outputs['Displacement'], nt.nodes['Material Output'].inputs['Displacement'])
        m.displacement_method = 'BOTH'
        self.mats[key] = m; return m

    # ------------------------------------------------------------ образцы моделей
    def load(self, slug, path=None, keep=None, assembly=False):
        """модель glTF → образцы (по одному на вариант), основание в начале координат, скрыты от рендера.
        assembly — модель из деталей (машина, комплект мебели, кадка): центрируется целиком, детали на своих местах"""
        if slug in self.protos:
            return self.protos[slug]
        from arden_assets import fetch_model
        path = path or fetch_model(self.root, slug)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        bpy.context.view_layer.update()  # иначе у вложенных деталей устаревшие положения
        meshes = [o for o in new if o.type == 'MESH' and (not keep or any(o.name.startswith(k) for k in keep))]
        out = []
        from mathutils import Matrix
        mws = {o: o.matrix_world.copy() for o in meshes}      # сначала все мировые матрицы, потом изменения
        for o in new:
            o.animation_data_clear()
        for o in meshes:
            o.data = o.data.copy(); o.data.transform(mws[o])  # трансформация — в геометрию
        for o in meshes:
            o.parent = None
        for o in meshes:
            o.matrix_basis = Matrix.Identity(4)
        for o in [o for o in new if o not in meshes]:
            bpy.data.objects.remove(o, do_unlink=True)
        def bottom_center(objs):  # по вершинам: bound_box после transform() устаревает до обновления графа
            bb = [v.co for o in objs for v in o.data.vertices]
            lo, hi = Vector([min(v[i] for v in bb) for i in range(3)]), Vector([max(v[i] for v in bb) for i in range(3)])
            return Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
        T = bottom_center(meshes) if assembly else None
        for o in meshes:
            for c in o.users_collection: c.objects.unlink(o)
            self.col_protos.objects.link(o)
            o.data.transform(T if assembly else bottom_center([o]))
            o.hide_render = False; o.location = (0, 0, -1000)  # образец под землёй; копии берут его геометрию
            out.append(o)
        self.protos[slug] = out
        return out

    def group(self, slug, objs):
        """коллекция-образец из нескольких объектов (машина, комплект мебели) — для копий целиком"""
        c = bpy.data.collections.new('обр_' + slug)
        self.col_protos.children.link(c)
        for o in objs:
            for u in o.users_collection: u.objects.unlink(o)
            c.objects.link(o); o.location = (0, 0, 0)
        c.hide_render = False
        return c

    def place(self, col, x, z, rot=0.0, s=1.0, h=0.0):
        e = bpy.data.objects.new(col.name + '_копия', None); e.instance_type = 'COLLECTION'; e.instance_collection = col
        e.location = P(x, z, h); e.rotation_euler = (0, 0, rot); e.scale = (s, s, s); self.col_new.objects.link(e); return e

    # ------------------------------------------------------------ россыпь (Geometry Nodes)
    def scatter_tree(self, name):
        """группа узлов: точки по поверхности → отсечение по кадру/расстоянию/исключениям → случайный образец из коллекции"""
        ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
        I = ng.interface
        def sock(n, t, io='INPUT', v=None):
            s = I.new_socket(n, in_out=io, socket_type=t)
            if v is not None: s.default_value = v
            return s
        sock('Geometry', 'NodeSocketGeometry'); sock('Geometry', 'NodeSocketGeometry', 'OUTPUT')
        for n, t, v in (('Образцы', 'NodeSocketCollection', None), ('Исключения', 'NodeSocketObject', None),
                        ('Плотность', 'NodeSocketFloat', 100.0), ('Ближе', 'NodeSocketFloat', 12.0), ('Дальше', 'NodeSocketFloat', 400.0),
                        ('Мин доля', 'NodeSocketFloat', .1), ('Камера', 'NodeSocketVector', (0, 0, 0)), ('Взгляд', 'NodeSocketVector', (0, 1, 0)),
                        ('Кос угла', 'NodeSocketFloat', .6), ('Отступ', 'NodeSocketFloat', .12), ('Кромка', 'NodeSocketFloat', .5),
                        ('Масштаб', 'NodeSocketFloat', 1.0), ('Разброс', 'NodeSocketFloat', .3), ('Укрупнение', 'NodeSocketFloat', 2.5),
                        ('Пятна', 'NodeSocketFloat', 0.0), ('Сид', 'NodeSocketInt', 0)):
            sock(n, t, v=v)
        N, Lk = ng.nodes, ng.links
        gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
        def math(op, a, b=None, c=None):
            m = N.new('ShaderNodeMath'); m.operation = op
            for i, x in enumerate((a, b, c)):
                if x is None: continue
                if isinstance(x, (int, float)): m.inputs[i].default_value = x
                else: Lk.new(x, m.inputs[i])
            return m.outputs[0]
        def vmath(op, a, b=None):
            m = N.new('ShaderNodeVectorMath'); m.operation = op
            Lk.new(a, m.inputs[0])
            if b is not None: Lk.new(b, m.inputs[1])
            return m.outputs['Value'] if op in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE') else m.outputs['Vector']
        G = lambda n: gi.outputs[n]
        dist = N.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'RANDOM'
        Lk.new(G('Geometry'), dist.inputs['Mesh']); Lk.new(G('Плотность'), dist.inputs['Density']); Lk.new(G('Сид'), dist.inputs['Seed'])
        pos = N.new('GeometryNodeInputPosition').outputs[0]
        d = vmath('SUBTRACT', pos, G('Камера')); L = vmath('LENGTH', d)
        cosang = vmath('DOT_PRODUCT', vmath('NORMALIZE', d), G('Взгляд'))
        in_view = math('GREATER_THAN', cosang, G('Кос угла'))
        near_ok = math('LESS_THAN', L, G('Дальше'))
        # доля точек по расстоянию: у камеры все, дальше ∝ (Ближе/L)², но не меньше «Мин доля»
        frac = math('MAXIMUM', math('POWER', math('MINIMUM', math('DIVIDE', G('Ближе'), math('MAXIMUM', L, .01)), 1.0), 2.0), G('Мин доля'))
        rnd = N.new('FunctionNodeRandomValue'); rnd.data_type = 'BOOLEAN'; Lk.new(frac, rnd.inputs['Probability']); Lk.new(G('Сид'), rnd.inputs['Seed'])
        # исключения: дома, дорожки, клумбы, заборы — расстояние до их поверхности
        oi = N.new('GeometryNodeObjectInfo'); oi.transform_space = 'RELATIVE'; Lk.new(G('Исключения'), oi.inputs['Object'])
        prox = N.new('GeometryNodeProximity'); prox.target_element = 'FACES'
        Lk.new(oi.outputs['Geometry'], prox.inputs[0])
        pd = prox.outputs['Distance']
        clear = math('GREATER_THAN', pd, G('Отступ'))
        # пятна (клевер, одуванчики): маска по шуму
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .18
        Lk.new(pos, nz.inputs['Vector'])
        patch = math('GREATER_THAN', nz.outputs['Fac'], math('ADD', .45, math('MULTIPLY', G('Пятна'), .0)))
        use_patch = math('GREATER_THAN', G('Пятна'), .5)
        patch_ok = math('MAXIMUM', math('SUBTRACT', 1.0, use_patch), math('MULTIPLY', patch, use_patch))
        keep = math('MULTIPLY', math('MULTIPLY', math('MULTIPLY', in_view, near_ok), math('MULTIPLY', clear, patch_ok)), rnd.outputs[3])
        dele = N.new('GeometryNodeDeleteGeometry'); dele.domain = 'POINT'
        Lk.new(dist.outputs['Points'], dele.inputs['Geometry']); Lk.new(math('LESS_THAN', keep, .5), dele.inputs['Selection'])
        # масштаб: случайный, ниже у кромки дорожек, крупнее вдали (меньше пучков — та же заполненность)
        r2 = N.new('FunctionNodeRandomValue'); r2.data_type = 'FLOAT'; Lk.new(G('Сид'), r2.inputs['Seed'])
        sc0 = math('MULTIPLY_ADD', math('SUBTRACT', r2.outputs[1], .5), math('MULTIPLY', G('Разброс'), 2.0), 1.0)
        edge = math('MAXIMUM', math('MINIMUM', math('DIVIDE', math('SUBTRACT', pd, G('Отступ')), G('Кромка')), 1.0), .45)
        lod = math('MINIMUM', math('POWER', math('MAXIMUM', math('DIVIDE', L, G('Ближе')), 1.0), .5), G('Укрупнение'))
        scale = math('MULTIPLY', math('MULTIPLY', math('MULTIPLY', sc0, edge), lod), G('Масштаб'))
        r3 = N.new('FunctionNodeRandomValue'); r3.data_type = 'FLOAT'; r3.inputs['Max'].default_value = 6.283; Lk.new(G('Сид'), r3.inputs['Seed'])
        rot = N.new('ShaderNodeCombineXYZ'); Lk.new(r3.outputs[1], rot.inputs['Z'])
        ci = N.new('GeometryNodeCollectionInfo'); ci.transform_space = 'ORIGINAL'
        Lk.new(G('Образцы'), ci.inputs['Collection']); ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
        r4 = N.new('FunctionNodeRandomValue'); r4.data_type = 'INT'; r4.inputs['Max'].default_value = 99; Lk.new(G('Сид'), r4.inputs['Seed'])
        iop = N.new('GeometryNodeInstanceOnPoints')
        Lk.new(dele.outputs['Geometry'], iop.inputs['Points']); Lk.new(ci.outputs[0], iop.inputs['Instance'])
        iop.inputs['Pick Instance'].default_value = True; Lk.new(r4.outputs[2], iop.inputs['Instance Index'])
        Lk.new(rot.outputs[0], iop.inputs['Rotation']); Lk.new(scale, iop.inputs['Scale'])
        Lk.new(iop.outputs['Instances'], go.inputs[0])
        return ng

    def scatter(self, name, surface, protos, excl, **p):
        """россыпь по поверхности; p — входы группы (Плотность, Ближе, Масштаб…)"""
        ng = bpy.data.node_groups.get('россыпь') or self.scatter_tree('россыпь')
        col = bpy.data.collections.new('россыпь_' + name); self.col_protos.children.link(col)
        for o in protos:
            e = bpy.data.objects.new(o.name + '_в', o.data); col.objects.link(e)
        holder = self.obj(name, surface.data.copy()); holder.matrix_world = surface.matrix_world
        holder.data.materials.clear()
        m = holder.modifiers.new('россыпь', 'NODES'); m.node_group = ng
        ids = {it.name: it.identifier for it in ng.interface.items_tree if getattr(it, 'in_out', '') == 'INPUT'}
        m[ids['Образцы']] = col; m[ids['Исключения']] = excl; m[ids['Сид']] = self.R.randint(0, 9999)
        for k, v in p.items():
            m[ids[k]] = v * (self.grass_scale if k == 'Плотность' else 1)
        self.base_density[m.name + holder.name] = p.get('Плотность', 100.0)
        self.culled.append((m, ids))
        return holder

    def update_camera(self, cam_pos, cam_dir, cos_fov):
        """каждый кадр: положение и направление камеры — для отсечения травы вне кадра и вдали"""
        for m, ids in self.culled:
            m[ids['Камера']] = tuple(cam_pos); m[ids['Взгляд']] = tuple(cam_dir); m[ids['Кос угла']] = cos_fov
            m.node_group.interface_update(bpy.context) if hasattr(m.node_group, 'interface_update') else None
        for o in {m.id_data for m, _ in self.culled}:
            o.update_tag()

    def set_density(self, k):
        """плотность всей россыпи (трава, подлесок) — доля от исходной; для отката при нехватке видеопамяти"""
        self.grass_scale = k
        for m, ids in self.culled:
            m[ids['Плотность']] = self.base_density[m.name + m.id_data.name] * k
            m.id_data.update_tag()
        return k

    def enable_scatter(self, on):
        for m, _ in self.culled:
            m.show_viewport = on; m.show_render = on

    # ------------------------------------------------------------ находим плоские части сайта
    def classify(self):
        """плоские меши сайта по цвету и габаритам (имена Mesh_N от порядка выгрузки не зависят)"""
        def color(o):
            m = o.data.materials[0] if o.data.materials else None
            b = m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None
            if not b: return None
            src = b.inputs['Base Color'].links[0].from_node if b.inputs['Base Color'].is_linked else None
            c = next((i.default_value for i in (src.inputs if src and src.type == 'MIX' else [b.inputs['Base Color']]) if i.type == 'RGBA' and not i.is_linked), None)
            return tuple(c[:3]) if c else None
        near = lambda c, t: c and all(abs(a - b) < .03 for a, b in zip(c, t))
        found = {}
        for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Mesh_')]:
            bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
            sx, sy = max(v.x for v in bb) - min(v.x for v in bb), max(v.y for v in bb) - min(v.y for v in bb)
            zmin, zmax = min(v.z for v in bb), max(v.z for v in bb)
            c = color(o)
            if sx > 2000: found['ground'] = o
            elif sx > 800 and 600 < sy < 800: found['forest_floor'] = o
            elif near(c, (.434, .434, .434)) and sx > 290 and sy > 290: found['asphalt'] = o
            elif near(c, (.644, .617, .565)) and sx > 290 and sy < 12: found['sidewalk'] = o
            elif near(c, (.807, .791, .738)) and sx > 280 and sy < 1: found['marks'] = o
            elif near(c, (.332, .604, .138)) and sx > 200: found['lawn'] = o
            elif near(c, (.159, .178, .202)) and sx > 200 and zmax < 2.1: found['fence'] = o
            elif near(c, (.026, .03, .034)) and sx > 200 and zmax < 2.1 and sy < 12: found['fence_posts'] = o
            elif near(c, (.026, .03, .034)) and sx > 260 and zmax > 5: found['lamp_posts'] = o
            elif near(c, (1.0, .88, .672)) and sx > 260: found['glow'] = o
            elif near(c, (.026, .03, .034)) and sx > 50 and zmax < 2.7: found['ap_posts'] = o
            elif near(c, (.552, .578, .604)): found.setdefault('paving', []).append(o)
            elif c and near(c, (.044, .025, .016)): found.setdefault('soil', []).append(o)
        self.log('плоские части сайта: ' + ', '.join(k for k in found))
        return found

    @staticmethod
    def cut_faces(o, pred):
        """удалить грани меша по условию на центр грани (мировые координаты)"""
        bm = bmesh.new(); bm.from_mesh(o.data); mw = o.matrix_world
        bad = [f for f in bm.faces if pred(mw @ f.calc_center_median())]
        bmesh.ops.delete(bm, geom=bad, context='FACES'); bm.to_mesh(o.data); bm.free()
        return len(bad)

    # ------------------------------------------------------------ дорога
    def build_road(self, F):
        for k in ('asphalt', 'marks', 'sidewalk', 'lamp_posts'):
            if k in F: bpy.data.objects.remove(F[k], do_unlink=True)
        if 'glow' in F: self.cut_faces(F['glow'], lambda c: c.z > 4)  # плафоны старых фонарей
        asph = self.pbr('asphalt_02', 3.0)
        H = .03
        # основная улица и две поперечные: сетка 12 см + рельеф по карте высот асфальта (до 2 см)
        self.displaced_grid('Дорога', -150, -ROAD / 2, 150, ROAD / 2, H, .12, asph, 'asphalt_02', .02, tex_scale=3.0)
        for x in (-105, 105):
            self.displaced_grid('Дорога_поперечная', x - ROAD / 2, -150, x + ROAD / 2, -ROAD / 2, H, .2, asph, 'asphalt_02', .02, tex_scale=3.0)
            self.displaced_grid('Дорога_поперечная', x - ROAD / 2, ROAD / 2, x + ROAD / 2, 150, H, .2, asph, 'asphalt_02', .02, tex_scale=3.0)
        # заплатки: другой асфальт, чуть выше, с рельефом
        patch = self.pbr('asphalt_04', 2.5, tint=(.8, .8, .82))
        for i in range(26):
            x, z = self.R.uniform(-140, 140), self.R.uniform(-2.8, 2.8)
            w, d = self.R.uniform(1.2, 4.5), self.R.uniform(.8, 2.2)
            self.displaced_grid('Заплатка', x - w / 2, max(-3.4, z - d / 2), x + w / 2, min(3.4, z + d / 2), H + .006, .1, patch, 'asphalt_04', .008, tex_scale=2.5)
        # стёртая разметка: краска по маске шума поверх асфальта, тонкая геометрия
        paint = self.worn_paint()
        bm = bmesh.new()
        for x in range(-146, 146, 6):
            if abs(x + 105) > 6 and abs(x - 105) > 6:
                bmesh.ops.create_cube(bm, size=1, matrix=__import__('mathutils').Matrix.LocRotScale(P(x + 1.5, 0, H + .012), None, (3, .12, .004)))
        me = bpy.data.meshes.new('Разметка'); bm.to_mesh(me); bm.free(); o = self.obj('Разметка', me); o.data.materials.append(paint)
        # бордюр (15 см над дорогой, фаска) и тротуар из плитки с рельефом
        curb = self.pbr('brushed_concrete_03', 1.5, tint=(.85, .84, .82))
        for s in (1, -1):
            self.box_run('Бордюр', -150, s * (ROAD / 2 + .075), 150, s * (ROAD / 2 + .075), .15, .3, H - .15, curb, bevel=.02)
            self.displaced_grid('Тротуар', -150, s * (ROAD / 2 + .15) if s > 0 else -(ROAD / 2 + 1.6), 150,
                                s * (ROAD / 2 + 1.6) if s > 0 else -(ROAD / 2 + .15), H + .13, .1,
                                self.pbr('concrete_pavers_02', 1.2), 'concrete_pavers_02', .012, tex_scale=1.2)
        # люки и фонари
        mh = self.load('water_manhole_cover', assembly=True)
        for x in (-128, -66, -8, 52, 118):
            for o in mh:
                e = self.obj('Люк', o.data); e.location = P(x, self.R.choice((-1.6, 1.6)), H + .004)
        pole = self.simple('металл_фонарь', (.05, .055, .06), .45, .8)
        lamp_glass = self.simple('плафон', (1, .95, .85), .2); lamp_glass.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0
        for x in range(-135, 136, 22):
            for s in (1, -1):
                self.street_lamp(x + (0 if s > 0 else 11), s * (ROAD / 2 + 1.1), s, pole, lamp_glass)

    def worn_paint(self):
        if 'краска' in self.mats: return self.mats['краска']
        m = self.pbr('asphalt_02', 3.0)
        p = m.copy(); p.name = 'краска разметки'; nt, L = p.node_tree, p.node_tree.links
        b = nt.nodes['Principled BSDF']; base = b.inputs['Base Color'].links[0].from_socket
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 14; nz.inputs['Detail'].default_value = 8
        ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = .42; ramp.color_ramp.elements[1].position = .58
        L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        L.new(ramp.outputs['Color'], mix.inputs['Factor']); L.new(base, mix.inputs['A']); mix.inputs['B'].default_value = (.75, .74, .7, 1)
        L.new(mix.outputs['Result'], b.inputs['Base Color'])
        self.mats['краска'] = p; return p

    def box_run(self, name, x0, z0, x1, z1, w, h, y0, mat, bevel=0.0):
        """брусок вдоль отрезка (бордюр, лага забора)"""
        a, b_ = P(x0, z0), P(x1, z1); L = (b_ - a).length; ang = math.atan2(b_.y - a.y, b_.x - a.x)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1, matrix=__import__('mathutils').Matrix.LocRotScale(((a + b_) / 2) + Vector((0, 0, y0 + h / 2)),
                              __import__('mathutils').Euler((0, 0, ang)), (L, w, h)))
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        o = self.obj(name, me); o.data.materials.append(mat)
        if bevel:
            bv = o.modifiers.new('фаска', 'BEVEL'); bv.width = bevel; bv.segments = 2
        return o

    def street_lamp(self, x, z, side, pole_mat, glass):
        bm = bmesh.new(); M = __import__('mathutils').Matrix
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.09, radius2=.055, depth=5.4, matrix=M.Translation(P(x, z, 2.7)))
        arm = P(x, z - side * .45, 5.35)
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(arm, None, (.06, .9, .06)))
        me = bpy.data.meshes.new('Фонарь'); bm.to_mesh(me); bm.free(); o = self.obj('Фонарь', me); o.data.materials.append(pole_mat)
        o.modifiers.new('гладко', 'BEVEL').width = .01
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z - side * .85, 5.28), None, (.22, .5, .1)))
        me = bpy.data.meshes.new('Светильник'); bm.to_mesh(me); bm.free(); g = self.obj('Светильник', me); g.data.materials.append(pole_mat)
        g.modifiers.new('фаска', 'BEVEL').width = .03

    # ------------------------------------------------------------ заборы, ворота, калитки
    def build_fences(self, F):
        for k in ('fence', 'fence_posts'):
            if k in F: bpy.data.objects.remove(F[k], do_unlink=True)
        if 'ap_posts' in F:  # столбики ворот сайта (у переднего забора) — ставим свои
            self.cut_faces(F['ap_posts'], lambda c: abs(abs(c.y) - NEAR) < .25)
        kinds = ['proflist'] * 6 + ['shtaketnik'] * 5 + ['wood'] * 3
        self.R.shuffle(kinds)
        colors = [(.16, .19, .17), (.24, .22, .2), (.2, .21, .23), (.32, .17, .13), (.12, .16, .2)]
        for i, (px, side) in enumerate([(x, s) for x in XS for s in (1, -1)]):
            kind, h = kinds[i], self.R.choice((1.6, 1.8, 1.8, 2.0))
            col = self.R.choice(colors)
            mat = (self.pbr('corrugated_iron_02', 1.0, tint=tuple(c * 3 for c in col)) if kind == 'proflist' else
                   self.simple('штакетник_%d' % i, col, .45, .6) if kind == 'shtaketnik' else self.pbr('brown_planks_05', 1.5))
            fx1, fx2 = px - PW / 2 + .4, px + PW / 2 - .4
            near, far = side * NEAR, side * FAR
            segs = [((fx1, near), (fx1, far)), ((fx2, near), (fx2, far)), ((fx1, far), (fx2, far)),
                    ((fx1, near), (px - 4.1, near)), ((px + 4.1, near), (fx2, near)), ((px - 1.2, near), (px + .4, near))]
            for a, b_ in segs:
                self.fence_run(a, b_, h, kind, mat)
            # калитка (gate.x ± 0,7 у сайта) и распашные ворота на въезд
            self.gate((px - 2.6, near), (px - 1.2, near), h, kind, mat, wicket=True)
            self.gate((px + .4, near), (px + 4.1, near), h, kind, mat, wicket=False)
        self.log('заборы: профлист / евроштакетник / дерево, высота 1,6–2,0 м')

    def fence_run(self, a, b_, h, kind, mat):
        M = __import__('mathutils').Matrix
        A, B = P(*a), P(*b_); L = (B - A).length
        if L < .05: return
        u = (B - A).normalized(); ang = math.atan2(u.y, u.x); n = Vector((-u.y, u.x, 0))
        post_m = self.simple('столб', (.07, .075, .08), .5, .7)
        bm = bmesh.new()
        np_ = max(1, int(round(L / 2.5)))
        for k in range(np_ + 1):  # столбы 60×60 с заглушкой, лаги 40×20
            c = A + u * (L * k / np_)
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(c + Vector((0, 0, (h + .1) / 2)), None, (.06, .06, h + .1)))
        for y in (.3, h - .25):
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale((A + B) / 2 + n * .05 + Vector((0, 0, y)), __import__('mathutils').Euler((0, 0, ang)), (L, .02, .04)))
        me = bpy.data.meshes.new('Столбы'); bm.to_mesh(me); bm.free(); o = self.obj('Забор_каркас', me); o.data.materials.append(post_m)
        o.modifiers.new('фаска', 'BEVEL').width = .004
        self.infill(A + n * .07, u, n, L, h, kind, mat, 'Забор')

    def infill(self, A, u, n, L, h, kind, mat, name):
        """заполнение: профлист (волна С-20), евроштакетник (планки с зазором) или доска"""
        M = __import__('mathutils').Matrix
        ang = math.atan2(u.y, u.x)
        bm = bmesh.new()
        if kind == 'proflist':
            period, amp, k = .1375, .02, 0
            nseg = int(L / period * 4)
            prof = [0, 0, 1, 1]  # трапеция
            for row in (0.04, h - .02):
                pass
            verts = []
            for i in range(nseg + 1):
                t = L * i / nseg; off = amp * prof[i % 4]
                p0 = A + u * t + n * off
                verts.append((bm.verts.new(p0 + Vector((0, 0, .04))), bm.verts.new(p0 + Vector((0, 0, h - .02)))))
            for i in range(nseg):
                bm.faces.new((verts[i][0], verts[i + 1][0], verts[i + 1][1], verts[i][1]))
            me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = self.obj(name + '_профлист', me)
            o.data.materials.append(mat); o.modifiers.new('толщина', 'SOLIDIFY').thickness = .0006
            return o
        w, gap = (.11, .035) if kind == 'shtaketnik' else (.095, .045)
        cnt = int(L / (w + gap))
        for i in range(cnt):
            c = A + u * ((i + .5) * (w + gap) + (L - cnt * (w + gap)) / 2)
            hh = h - (.0 if kind == 'shtaketnik' else .05 * ((i % 2)))
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(c + Vector((0, 0, .05 + hh / 2)), __import__('mathutils').Euler((0, 0, ang)), (w, .012 if kind == 'shtaketnik' else .02, hh)))
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = self.obj(name + '_планки', me); o.data.materials.append(mat)
        return o

    def gate(self, a, b_, h, kind, mat, wicket):
        """ворота/калитка: рама из трубы, заполнение как у забора, петли, ручка"""
        M = __import__('mathutils').Matrix
        A, B = P(*a), P(*b_); L = (B - A).length; u = (B - A).normalized(); n = Vector((-u.y, u.x, 0)); ang = math.atan2(u.y, u.x)
        leaves = [(A, L)] if wicket else [(A, L / 2), (A + u * (L / 2), L / 2)]
        frame_m = self.simple('столб', (.07, .075, .08), .5, .7)
        bm = bmesh.new()
        for p in (A, B):  # столбы ворот 80×80
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(p + Vector((0, 0, (h + .15) / 2)), None, (.08, .08, h + .15)))
        for S, l in leaves:
            for y in (.08, h - .04):
                bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(S + u * (l / 2) + Vector((0, 0, y)), __import__('mathutils').Euler((0, 0, ang)), (l - .06, .04, .04)))
            for t in (.05, l - .05):
                bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(S + u * t + Vector((0, 0, h / 2 + .03)), None, (.04, .04, h - .1)))
            for y in (.3, h - .35):  # петли
                bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(S + u * .03 + n * .03 + Vector((0, 0, y)), None, (.03, .03, .1)))
        hd = (A + u * (L - .12)) - n * .05 + Vector((0, 0, 1.0))
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(hd, None, (.02, .02, .14)))
        me = bpy.data.meshes.new('Ворота'); bm.to_mesh(me); bm.free(); o = self.obj('Ворота' if not wicket else 'Калитка', me)
        o.data.materials.append(frame_m); o.modifiers.new('фаска', 'BEVEL').width = .004
        for S, l in leaves:
            self.infill(S + u * .06 + n * .02, u, n, l - .12, h - .12, kind, mat, 'Ворота_заполнение')

    # ------------------------------------------------------------ земля, газон, луг, лес
    def build_ground(self, F, forest_objs):
        excl = self.exclusions(F)
        lawn = F['lawn']
        # земля под травой: почва с рельефом (не плоская), трава сверху её закрывает
        # под травой — травяной слой с рельефом (издалека газон зелёный, а не земля)
        lawn.data.materials.clear(); lawn.data.materials.append(self.pbr('leafy_grass', 2.0, disp=.012, recolor=(.06, .24, .05)))
        self.adaptive(lawn)
        # газон: сканированная бермудская трава (разные пучки), до ~400 шт./м² у камеры
        lawn_p = [o for o in self.load('grass_bermuda_01') if 'dead' not in o.name]  # без сухих пучков
        self.lawn_material(lawn_p)
        self.scatter('Газон', lawn, lawn_p, excl, **{'Плотность': 400.0, 'Ближе': 14.0, 'Дальше': 420.0, 'Мин доля': .14,
                                                      'Масштаб': .55, 'Разброс': .25, 'Укрупнение': 4.5, 'Отступ': .1, 'Кромка': .45})
        # кислица (трилистник, как клевер) и одуванчики — пятнами
        self.scatter('Клевер', lawn, self.load('shrub_sorrel_01'), excl, **{'Плотность': 18.0, 'Ближе': 12.0, 'Дальше': 120.0, 'Мин доля': .02,
                                                                            'Масштаб': .6, 'Пятна': 1.0, 'Отступ': .25})
        self.scatter('Одуванчики', lawn, self.load('dandelion_01'), excl, **{'Плотность': 2.5, 'Ближе': 12.0, 'Дальше': 160.0, 'Мин доля': .05,
                                                                             'Масштаб': .8, 'Пятна': 1.0, 'Отступ': .3})
        # луг между участками и лесом, обочины поперечных дорог: высокая трава и сорняки на земле с рельефом
        ground = F['ground']
        meadow = self.displaced_grid('Луг', -112, -46, 112, 46, .005, .5, self.pbr('sparse_grass', 2.5, disp=.02, recolor=(.08, .2, .05)), 'sparse_grass', .05, tex_scale=2.5)
        self.cut_faces(meadow, lambda c: (abs(-c.y) < ROAD / 2 + 1.7) or any(abs(c.x - px) < PW / 2 - .3 and NEAR - .1 < abs(c.y) < FAR + .2 for px in XS))
        tall = self.load('grass_medium_01') + self.load('grass_medium_02')
        self.lawn_material(tall, green=(2.2, 5.0, 1.1), stripes=False)  # некошеная: зелень посуше, без полос
        weeds = self.load('weed_plant_02') + self.load('nettle_plant')
        self.scatter('Луг_трава', meadow, tall, excl, **{'Плотность': 14.0, 'Ближе': 20.0, 'Дальше': 450.0, 'Мин доля': .08, 'Масштаб': 1.0, 'Разброс': .35, 'Укрупнение': 2.0})
        self.scatter('Луг_сорняки', meadow, weeds, excl, **{'Плотность': 1.2, 'Ближе': 20.0, 'Дальше': 300.0, 'Мин доля': .1, 'Масштаб': 1.0, 'Пятна': 1.0})
        # у заборов изнутри — некошеная полоса
        strip = self.fence_strips()
        self.scatter('У_заборов', strip, tall, excl, **{'Плотность': 10.0, 'Ближе': 18.0, 'Дальше': 400.0, 'Мин доля': .1, 'Масштаб': .8, 'Отступ': .05})
        # лесная подстилка: рельеф + папоротник, кусты и высокая трава под елями
        ff = F['forest_floor']
        ff.data.materials.clear(); ff.data.materials.append(self.pbr('forest_floor', 3.0, disp=.04, tint=(.36, .42, .28)))  # под кронами — тёмная хвойная подстилка
        self.adaptive(ff)
        under = self.load('fern_02') + self.load('shrub_02') + tall
        self.scatter('Подлесок', ff, under, excl, **{'Плотность': .9, 'Ближе': 25.0, 'Дальше': 260.0, 'Мин доля': .08, 'Масштаб': 1.0, 'Разброс': .4})
        ground.data.materials.clear(); ground.data.materials.append(self.pbr('leafy_grass', 4.0, recolor=(.05, .09, .03)))  # далеко за лесом
        return excl

    # × яркость скана (~.021 лин.) → альбедо ≈ (.03, .12, .025): под оранжевым закатным солнцем (1; .6; .36) — живая зелень, не солома
    LAWN_GREEN = (1.45, 5.7, 1.2)

    def lawn_material(self, protos, green=None, stripes=True):
        """газон: тон каждого пучка свой, полосы покоса (через 1,2 м поперёк участка), пятна посветлее"""
        for m in {s for o in protos for s in o.data.materials if s}:
            nt, L = m.node_tree, m.node_tree.links
            b = nt.nodes.get('Principled BSDF')
            if not b or not b.inputs['Base Color'].is_linked: continue
            src = b.inputs['Base Color'].links[0].from_socket
            oi = nt.nodes.new('ShaderNodeObjectInfo'); geo = nt.nodes.new('ShaderNodeNewGeometry')
            sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sep.inputs['Vector'])
            stripe = nt.nodes.new('ShaderNodeMath'); stripe.operation = 'PINGPONG'; stripe.inputs[1].default_value = 1.2
            L.new(sep.outputs['X'], stripe.inputs[0])
            st = nt.nodes.new('ShaderNodeMapRange'); st.interpolation_type = 'STEPPED'; st.inputs['Steps'].default_value = 2
            st.inputs['From Max'].default_value = 1.2; st.inputs['To Min'].default_value = .82 if stripes else 1.0; st.inputs['To Max'].default_value = 1.12 if stripes else 1.0
            L.new(stripe.outputs[0], st.inputs['Value'])
            tone = nt.nodes.new('ShaderNodeMapRange'); tone.inputs['To Min'].default_value = .85; tone.inputs['To Max'].default_value = 1.15
            L.new(oi.outputs['Random'], tone.inputs['Value'])
            k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; L.new(st.outputs['Result'], k.inputs[0]); L.new(tone.outputs['Result'], k.inputs[1])
            # живая зелень: рисунок и яркость из скана, оттенок — газонный (сам скан оливковый, на закате выходит соломой)
            bw = nt.nodes.new('ShaderNodeRGBToBW'); L.new(src, bw.inputs['Color'])
            k2 = nt.nodes.new('ShaderNodeMath'); k2.operation = 'MULTIPLY'; L.new(bw.outputs['Val'], k2.inputs[0]); L.new(k.outputs[0], k2.inputs[1])
            sc = nt.nodes.new('ShaderNodeVectorMath'); sc.operation = 'SCALE'; sc.inputs[0].default_value = green or self.LAWN_GREEN
            L.new(k2.outputs[0], sc.inputs['Scale'])
            L.new(sc.outputs['Vector'], b.inputs['Base Color'])
            # травинки матовые: без белого блика на закатном солнце
            for l in list(b.inputs['Roughness'].links): L.remove(l)
            b.inputs['Roughness'].default_value = .75
            sp = b.inputs.get('Specular IOR Level')
            if sp: sp.default_value = .25

    def fence_strips(self):
        """полосы 60 см вдоль заборов изнутри участков — для некошеной травы"""
        bm = bmesh.new()
        def quad(x0, z0, x1, z1):
            vs = [bm.verts.new(P(x, z, .02)) for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]; bm.faces.new(vs)
        for px in XS:
            for s in (1, -1):
                n_, f_ = s * NEAR, s * FAR
                lo, hi = min(n_, f_), max(n_, f_)
                quad(px - PW / 2 + .45, lo, px - PW / 2 + 1.05, hi); quad(px + PW / 2 - 1.05, lo, px + PW / 2 - .45, hi)
                quad(px - PW / 2 + .45, f_ - s * .65, px + PW / 2 - .45, f_ - s * .05)
        me = bpy.data.meshes.new('Полосы у забора'); bm.to_mesh(me); bm.free()
        o = self.obj('Полосы у забора', me, self.col_protos); o.hide_render = True
        return o

    def exclusions(self, F):
        """куда траву не сажать: дома, дорожки, въезды, клумбы, настилы, мебель и машины (плоские прямоугольники)"""
        bm = bmesh.new()
        def rect(x, z, hw, hd, rot=0.0):
            c, s = math.cos(rot), math.sin(rot)
            vs = [bm.verts.new(P(x + dx * c - dz * s, z + dx * s + dz * c, .02)) for dx, dz in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
            bm.faces.new(vs)
        for x, z, hw, hd in self.buildings(.35):
            rect(x, z, hw, hd)
        for px in XS:  # въезд и дорожка к калитке
            for s in (1, -1):
                rect(px + 2.4, s * (NEAR + 4.6), 1.95, 4.7); rect(px - 1.9, s * (NEAR + 2.0), .75, 2.1)

        for r in self.extra_rects:
            rect(*r)
        me = bpy.data.meshes.new('Исключения'); bm.to_mesh(me); bm.free()
        ex = self.obj('Исключения', me, self.col_protos)
        for k in ('paving', 'soil'):
            for o in F.get(k, []):  # дорожки, мощение, клумбы сайта — копия их граней
                d = o.data.copy(); d.transform(o.matrix_world)
                bm2 = bmesh.new(); bm2.from_mesh(ex.data); bm2.from_mesh(d); bm2.to_mesh(ex.data); bm2.free()
        ex.hide_render = True
        return ex

    # ------------------------------------------------------------ участки: кусты, цветы, мебель, машины, беседки
    def build_plots(self, F):
        R = self.R
        shrubs = self.load('shrub_01') + self.load('shrub_03') + self.load('shrub_04')
        big = self.load('shrub_02')
        flowers = self.load('periwinkle_plant') + self.load('dandelion_01')
        table = self.group('стол', self.load('outdoor_table_chair_set_01', assembly=True))
        picnic = self.group('пикник', self.load('wooden_picnic_table'))
        bench = self.group('скамья', self.load('painted_wooden_bench'))
        planters = [self.group(s, self.load(s, assembly=True)) for s in ('planter_box_01', 'planter_box_02', 'potted_plant_01', 'potted_plant_02', 'planter_pot_clay')]
        cars = self.load_cars()
        n_cars = n_furn = n_shr = 0
        car_rects = []
        for px in XS:
            for s in (1, -1):
                fx1, fx2, n_, f_ = px - PW / 2 + .4, px + PW / 2 - .4, s * NEAR, s * FAR
                # кусты вдоль боковых и заднего заборов с промежутками, крупные — в углах
                for z in [n_ + s * t for t in range(4, int(PD) - 2, 3)]:
                    for x in (fx1 + .9, fx2 - .9):
                        if R.random() < .55 and self.free(x, z, .8):
                            self.inst(R.choice(shrubs), x, z, R.uniform(.8, 1.3)); n_shr += 1
                for x in (fx1 + 1.6, fx2 - 1.6):
                    if self.free(x, f_ - s * 1.6, 1.5):
                        self.inst(R.choice(big), x, f_ - s * 1.6, R.uniform(.6, .85)); n_shr += 1
                # дом: кусты у фундамента, кадки у входа, мебель сбоку
                for bx, bz, hw, hd in self.buildings():
                    if abs(bx - px) > PW / 2 or bz * s <= 0:
                        continue
                    front = bz - s * hd
                    for x in [bx - hw + t for t in [.8 + 1.4 * k for k in range(int(2 * hw / 1.4))]]:
                        if abs(x - bx) > 1.6 and R.random() < .6:
                            self.inst(R.choice(shrubs), x, front - s * .55, R.uniform(.5, .8)); n_shr += 1
                    for dx in (-1.3, 1.3):
                        self.place(R.choice(planters), bx + dx, front - s * .9, R.uniform(0, 6.28))
                    side_x = bx + (hw + 3.2) * (1 if (bx - px) < 0 else -1)
                    if abs(side_x - px) < PW / 2 - 2.5 and self.free(side_x, bz, 1.6):
                        self.place(R.choice((table, picnic)), side_x, bz, R.uniform(0, 6.28)); n_furn += 1
                        self.extra_rects.append((side_x, bz, 1.5, 1.5, 0))
                    if self.free(fx1 + 1.2, bz, .8):
                        self.place(bench, fx1 + 1.2, bz, math.pi / 2 * s)
                # цветник у калитки и на клумбах сайта
                for k in range(10):
                    x, z = px - 1.9 + R.choice((-1.6, 1.6)) + R.uniform(-.3, .3), n_ + s * R.uniform(1.0, 3.6)
                    self.inst(R.choice(flowers), x, z, R.uniform(.7, 1.1))
                # машина на въезде (не на каждом участке)
                # габарит ~4,9 × 2,0 м вдоль въезда: не задевает дом, забор (от 0,5 м) и другие машины
                if cars and R.random() < .72:
                    col, cx, cz = R.choice(cars), px + 2.4, n_ + s * R.uniform(2.9, 3.6)
                    hit = lambda rects, pad: any(abs(cx - bx) < hw + 1.0 + pad and abs(cz - bz) < hd + 2.45 + pad for bx, bz, hw, hd, *_ in rects)
                    if not hit(self.buildings(.3), 0) and not hit(car_rects, .3):
                        self.place(col, cx, cz, (0 if s > 0 else math.pi) + R.choice((0, math.pi)) + math.pi / 2)
                        car_rects.append((cx, cz, 1.0, 2.45)); self.extra_rects.append((cx, cz, 1.0, 2.45, 0))
                        n_cars += 1
                # беседка или качели в свободном заднем углу
                for cx in ((fx2 - 3.5), (fx1 + 3.5)):
                    cz = f_ - s * 3.5
                    if self.free(cx, cz, 2.5) and R.random() < .5:
                        (self.gazebo if R.random() < .5 else self.swing)(cx, cz, s)
                        self.extra_rects.append((cx, cz, 2.0, 2.0, 0)); break
        self.log('участки: кустов %d, мебели %d, машин %d' % (n_shr, n_furn, n_cars))

    def inst(self, proto, x, z, s=1.0, rot=None):
        e = self.obj(proto.name + '_к', proto.data); e.location = P(x, z, .02)
        e.rotation_euler = (0, 0, self.R.uniform(0, 6.283) if rot is None else rot); e.scale = (s, s, s)
        return e

    def load_cars(self):
        out = []
        cars_dir = os.path.join(self.root, 'assets', 'cars')
        for uid, (name, paint) in CARS.items():
            path = os.path.join(cars_dir, uid, 'scene.gltf')
            if not os.path.exists(path):
                self.log('нет машины', name); continue
            objs = self.load('car_' + uid, path, assembly=True)
            # общий размер: длина 4,4–4,9 м вдоль локальной оси X, низ габарита (колёса) — на земле, z = 0
            import mathutils
            def bounds():
                pts = [v.co for o in objs for v in o.data.vertices]  # геометрия уже в общих координатах сборки
                return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))
            lo, hi = bounds(); size = hi - lo
            rot = 0 if size.x >= size.y else math.pi / 2
            k = {'Toyota Land Cruiser Prado 2013': 4.78, 'Lada Vesta': 4.41}.get(name, 4.5) / max(size.x, size.y)
            T = mathutils.Matrix.Rotation(rot, 4, 'Z') @ mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
            for o in objs:
                o.data.transform(T); o.data.update()
            lo, hi = bounds(); size = hi - lo
            assert abs(lo.z) < 1e-3 and 4.3 < size.x < 5.0 and size.x > size.y, (name, lo, hi)
            self.log('машина %s: %.2f × %.2f × %.2f м' % (name, size.x, size.y, size.z))
            self.opaque(objs)
            if paint:  # спокойный цвет кузова: самый «крупный» окрашенный материал
                self.repaint(objs, paint)
            out.append(self.group('машина_' + uid[:6], objs))
        return out

    @staticmethod
    def opaque(objs):
        """кузов и детали — непрозрачные (в glTF бывает alpha BLEND/текстура альфы → в Cycles машина невидима, а тень есть);
        стёкла (по имени) не трогаем — их делает thin_glass()"""
        for m in {m for o in objs for m in o.data.materials if m}:
            if any(w in m.name.lower() for w in ('glass', 'window', 'стекл')) or not m.use_nodes: continue
            for b in [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']:
                for l in list(b.inputs['Alpha'].links): m.node_tree.links.remove(l)
                b.inputs['Alpha'].default_value = 1.0
                tr = b.inputs.get('Transmission Weight')
                if tr: tr.default_value = 0.0
            out = m.node_tree.nodes.get('Material Output')
            if out and out.inputs['Surface'].is_linked and out.inputs['Surface'].links[0].from_node.type == 'MIX_SHADER':
                mx = out.inputs['Surface'].links[0].from_node
                keep = next((i.links[0].from_socket for i in mx.inputs[1:] if i.is_linked and i.links[0].from_node.type != 'BSDF_TRANSPARENT'), None)
                if keep: m.node_tree.links.new(keep, out.inputs['Surface'])
            if hasattr(m, 'blend_method'): m.blend_method = 'OPAQUE'
            if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'

    @staticmethod
    def repaint(objs, rgb):
        area = {}
        for o in objs:
            for p in o.data.polygons:
                m = o.data.materials[p.material_index] if o.data.materials else None
                if m: area[m] = area.get(m, 0) + p.area
        def sat(m):
            b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
            if not b or b.inputs['Base Color'].is_linked: return 0
            c = b.inputs['Base Color'].default_value; return max(c[:3]) - min(c[:3])
        body = max(area, key=lambda m: area[m] * sat(m), default=None)  # кузов — крупный и окрашенный (красный, синий)
        if body and body.use_nodes:
            b = body.node_tree.nodes.get('Principled BSDF')
            if b:
                for l in list(b.inputs['Base Color'].links): body.node_tree.links.remove(l)
                b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Metallic'].default_value = .6; b.inputs['Roughness'].default_value = .28
                try: b.inputs['Coat Weight'].default_value = 1.0
                except KeyError: pass

    def gazebo(self, x, z, s):
        """беседка 3×3 м: столбы, обвязка, двускатная крыша из досок"""
        M = __import__('mathutils').Matrix
        wood = self.pbr('brown_planks_05', 1.5)
        bm = bmesh.new()
        for dx in (-1.4, 1.4):
            for dz in (-1.4, 1.4):
                bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x + dx, z + dz, 1.2), None, (.12, .12, 2.4)))
        for dz in (-1.4, 1.4):
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z + dz, 2.4), None, (3.1, .14, .14)))
        for dx in (-1.4, 1.4):
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x + dx, z, 2.4), None, (.14, 3.1, .14)))
        for sg in (-1, 1):  # скаты
            bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x + sg * .85, z, 2.95), __import__('mathutils').Euler((0, sg * .55, 0)), (2.0, 3.6, .05)))
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z, .45), None, (1.6, .7, .05)))  # стол
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z, .22), None, (.1, .1, .44)))
        me = bpy.data.meshes.new('Беседка'); bm.to_mesh(me); bm.free(); o = self.obj('Беседка', me); o.data.materials.append(wood)
        o.modifiers.new('фаска', 'BEVEL').width = .01

    def swing(self, x, z, s):
        """садовые качели: А-образная рама, перекладина, цепи, сиденье"""
        M = __import__('mathutils').Matrix
        wood = self.pbr('brown_planks_05', 1.5); metal = self.simple('цепь', (.4, .4, .42), .35, 1)
        bm = bmesh.new()
        for dx in (-1.1, 1.1):
            for sg in (-1, 1):
                bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x + dx, z + sg * .35, 1.05), __import__('mathutils').Euler((sg * .32, 0, 0)), (.1, .1, 2.2)))
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z, 2.1), None, (2.5, .12, .12)))
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z, .55), None, (1.3, .45, .05)))
        bmesh.ops.create_cube(bm, size=1, matrix=M.LocRotScale(P(x, z - .2, .8), __import__('mathutils').Euler((.25, 0, 0)), (1.3, .05, .45)))
        me = bpy.data.meshes.new('Качели'); bm.to_mesh(me); bm.free(); o = self.obj('Качели', me); o.data.materials.append(wood)
        bm = bmesh.new()
        for dx in (-.6, .6):
            bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=.012, radius2=.012, depth=1.5, matrix=M.Translation(P(x + dx, z, 1.32)))
        me = bpy.data.meshes.new('Цепи'); bm.to_mesh(me); bm.free(); c = self.obj('Качели_цепи', me); c.data.materials.append(metal)

    # ------------------------------------------------------------ лес, деревья на участках, стекло
    @staticmethod
    def solid_alpha(objs, cutoff=.3):
        """хвоя/листва с мягкой альфой → жёсткая альфа: кроны дают плотную тень"""
        for o in objs:
            for m in o.data.materials:
                if not m or not m.use_nodes or m.get('solid_alpha'): continue
                m['solid_alpha'] = True
                b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if not b or not b.inputs['Alpha'].is_linked: continue
                src = b.inputs['Alpha'].links[0].from_socket
                gt = m.node_tree.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = cutoff
                m.node_tree.links.new(src, gt.inputs[0]); m.node_tree.links.new(gt.outputs[0], b.inputs['Alpha'])

    def build_forest(self):
        """ближний лес — ели Poly Haven (fir_tree_01 a/b) и немного лиственных; дальний — карточки сайта.
        Деревья-карточки на участках → модели tree_small_02. Возвращает объекты леса (для «солнца леса»)."""
        R = self.R
        firs = self.load('fir_tree_01', keep=('fir_tree_01_a', 'fir_tree_01_b'))
        small = self.load('tree_small_02')
        self.solid_alpha(firs + small)
        kids = lambda n: list(bpy.data.objects[n].children) if n in bpy.data.objects else []
        # деревья на участках (карточки сайта) → модели на тех же местах
        plot = [(o.matrix_world.translation.copy(), o.matrix_world.to_scale().x) for o in kids('tree_leaf_decid') + kids('tree_leaf_conif')]
        for g in ('tree_leaf_decid', 'tree_core_decid', 'tree_leaf_conif', 'tree_core_conif', 'tree_trunk'):
            for o in kids(g): bpy.data.objects.remove(o, do_unlink=True)
        for loc, sc in plot:
            e = self.obj('Дерево_на_участке', R.choice(small).data); e.location = loc; e.scale = (2.0 * sc,) * 3; e.rotation_euler = (0, 0, R.uniform(0, 6.28))
        # ближний пояс: убираем карточки сайта, ставим ели плотно (кроны смыкаются)
        near_belt = lambda x, y: abs(x) < 175 and abs(y) < 105
        for g in ('far_leaf_decid', 'far_core_decid', 'far_leaf_conif', 'far_core_conif'):
            for o in kids(g):
                t = o.matrix_world.translation
                if near_belt(t.x, t.y): bpy.data.objects.remove(o, do_unlink=True)
        VX, VZ = 110, ROAD / 2 + 1.6 + PD + 4
        forest = []
        x = -175.0
        while x < 175:
            z = -105.0
            while z < 105:
                tx, tz = x + R.uniform(-1.9, 1.9), z + R.uniform(-1.9, 1.9)
                inside = abs(tx) < VX and abs(tz) < VZ
                road = abs(tz) < 7 or abs(abs(tx) - 105) < 6.5
                if not inside and not road:
                    if R.random() < .88:
                        e = self.obj('Ель', R.choice(firs).data); s = R.uniform(.8, 1.3)
                    else:
                        e = self.obj('Лиственное', R.choice(small).data); s = R.uniform(1.8, 2.4)
                    e.location = P(tx, tz, 0); e.rotation_euler = (0, 0, R.uniform(0, 6.283)); e.scale = (s, s, s)
                    forest.append(e)
                z += 4.4
            x += 4.4
        # дальний пояс — тоже ели (сверху карточки сайта видны крестами на голой земле): реже и крупнее,
        # до края лесной подстилки; карточки остаются только за ней, в дымке
        ff = next((o for o in bpy.data.objects if o.type == 'MESH' and o.dimensions.x > 800 and 600 < o.dimensions.y < 800), None)
        EX, EY = ((ff.dimensions.x / 2 - 8, ff.dimensions.y / 2 - 8) if ff else (400, 340))
        for g in ('far_leaf_decid', 'far_core_decid', 'far_leaf_conif', 'far_core_conif'):
            for o in kids(g):
                t = o.matrix_world.translation
                if abs(t.x) < EX and abs(t.y) < EY: bpy.data.objects.remove(o, do_unlink=True)
        n_far, x = 0, -EX
        while x < EX:
            z = -EY
            while z < EY:
                tx, tz = x + R.uniform(-2.6, 2.6), z + R.uniform(-2.6, 2.6)
                if not near_belt(tx, tz) and not abs(tz) < 7:
                    e = self.obj('Ель_даль', R.choice(firs).data); s = R.uniform(1.0, 1.45)
                    e.location = P(tx, tz, 0); e.rotation_euler = (0, 0, R.uniform(0, 6.283)); e.scale = (s, s, s)
                    forest.append(e); n_far += 1
                z += 5.6
            x += 5.6
        self.log('лес: дальний пояс %d елей (до %.0f × %.0f м)' % (n_far, 2 * EX, 2 * EY))
        for g in ('far_leaf_decid', 'far_core_decid', 'far_leaf_conif', 'far_core_conif'):
            forest += kids(g)
        forest += [o for o in bpy.data.objects if o.name.startswith('Подлесок')]
        if ff: forest.append(ff)
        self.firs = firs
        self.log('лес: деревьев в ближнем поясе %d, деревьев на участках %d' % (len([o for o in forest if o.name.startswith(('Ель', 'Лиственное'))]), len(plot)))
        return forest

    def simplify_forest(self):
        for p in getattr(self, 'firs', []):
            if 'упрощение' not in p.modifiers:
                d = p.modifiers.new('упрощение', 'DECIMATE'); d.ratio = .15
        # модификатор на образце не влияет на копии с общими данными — упрощаем сами данные
        for p in getattr(self, 'firs', []):
            dg = bpy.context.evaluated_depsgraph_get(); ev = p.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev); old = p.data
            for o in [o for o in bpy.data.objects if o.data == old]: o.data = me
            p.modifiers.clear()

    @staticmethod
    def thin_glass():
        """окна — тонкое стекло без преломления (быстрее и без искажений за стеклом)"""
        n = 0
        for m in bpy.data.materials:
            b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
            if not b or b.inputs['Alpha'].is_linked: continue
            tr = b.inputs.get('Transmission Weight') or b.inputs.get('Transmission')
            glassy = (tr and tr.default_value > .01) or b.inputs['Alpha'].default_value < .99 or any(w in m.name.lower() for w in ('glass', 'стекл', 'window'))
            if not glassy: continue
            if tr: tr.default_value = 1.0
            b.inputs['IOR'].default_value = 1.0; b.inputs['Roughness'].default_value = .03; b.inputs['Alpha'].default_value = 1.0
            for l in list(b.inputs['Base Color'].links): m.node_tree.links.remove(l)
            b.inputs['Base Color'].default_value = (.92, .95, 1.0, 1)
            if hasattr(m, 'blend_method'): m.blend_method = 'OPAQUE'
            n += 1
        return n

    # ------------------------------------------------------------ всё вместе
    def build(self):
        F = self.classify()
        for k in ('grass', 'flowers', 'bush'):  # трава, цветы и кусты-карточки сайта — заменяются моделями
            e = bpy.data.objects.get(k)
            if e:
                for o in list(e.children): bpy.data.objects.remove(o, do_unlink=True)
        self.build_road(F)
        self.build_fences(F)
        self.extra_rects = []
        self.build_plots(F)
        for o in F.get('paving', []):  # мощение дорожек и въездов — плитка с рельефом
            o.data.materials.clear(); o.data.materials.append(self.pbr('brick_pavement_02', 1.2, disp=.012))
            self.adaptive(o)
        for o in F.get('soil', []):
            o.data.materials.clear(); o.data.materials.append(self.pbr('raked_dirt', 1.0, disp=.02))
            self.adaptive(o)
        excl = self.build_ground(F, None)
        self.hide_protos()
        return excl

    def hide_protos(self):
        """образцы — только источник геометрии для копий: убираем их коллекцию из рендера (копии остаются)"""
        def find(lc):
            if lc.collection == self.col_protos: return lc
            for c in lc.children:
                r = find(c)
                if r: return r
        lc = find(bpy.context.view_layer.layer_collection)
        if lc: lc.exclude = True
