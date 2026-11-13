"""
Ассеты Poly Haven (CC0) для рендера Ардена v2: список и загрузчик.

Скачивает модели (glTF 1K) и фактуры (2K: цвет, нормали, шероховатость, рельеф) в scene/assets.
Безопасно перезапускается: готовые файлы (совпадает размер) пропускает, обрывы повторяет.
Запуск отдельно:  python arden_assets.py ПАПКА_СЦЕНЫ   (или из arden_render.py --what assets)
"""
import json
import os
import shutil
import sys
import time
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (render-script)'}  # без него Poly Haven отвечает 403

# модели: деревья, трава (сканы), кусты и цветы, мебель и кадки, улица
MODELS = [
    'fir_tree_01', 'tree_small_02',
    'grass_bermuda_01', 'grass_medium_01', 'grass_medium_02',          # газон и некошеная трава — сканированные
    'shrub_01', 'shrub_02', 'shrub_03', 'shrub_04',
    'dandelion_01', 'periwinkle_plant', 'shrub_sorrel_01', 'weed_plant_02', 'nettle_plant', 'fern_02',
    'outdoor_table_chair_set_01', 'wooden_picnic_table', 'painted_wooden_bench',
    'planter_box_01', 'planter_box_02', 'planter_pot_clay', 'potted_plant_01', 'potted_plant_02',
    'water_manhole_cover',
]
# фактуры с рельефом (displacement): дорога, бордюр, мощение, гравий, доски, профлист, земля
TEXTURES = [
    'asphalt_02', 'asphalt_04', 'brushed_concrete_03', 'concrete_pavers_02', 'brick_pavement_02',
    'bicolour_gravel', 'brown_planks_05', 'corrugated_iron_02', 'forest_floor', 'sparse_grass', 'leafy_grass', 'farm_soil', 'raked_dirt',
]
TEX_MAPS = {'Diffuse': 'jpg', 'nor_gl': 'jpg', 'Rough': 'jpg', 'Displacement': 'png'}
MODEL_RES, TEX_RES = '1k', '2k'


def log(*a):
    print('[assets]', *a, flush=True)


def get(url, tries=5):
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60)
        except Exception as e:  # сеть: повторяем с паузой
            if k == tries - 1:
                raise
            log('повтор (%s): %s' % (e, url)); time.sleep(3 * (k + 1))


def download(url, path, size=None):
    if os.path.exists(path) and (size is None or os.path.getsize(path) == size):
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for k in range(5):
        try:
            with get(url) as src, open(path + '.part', 'wb') as f:
                shutil.copyfileobj(src, f, 1 << 20)
            if size is None or os.path.getsize(path + '.part') == size:
                os.replace(path + '.part', path); return True
            log('размер не совпал, повтор:', os.path.basename(path))
        except Exception as e:
            log('ошибка (%s), повтор: %s' % (e, os.path.basename(path))); time.sleep(3 * (k + 1))
    raise RuntimeError('не скачался ' + url)


def model_path(root, slug):
    return os.path.join(root, 'assets', 'models', slug, '%s_%s.gltf' % (slug, MODEL_RES))


def texture_path(root, slug, kind):
    return os.path.join(root, 'assets', 'textures', slug, '%s_%s_%s.%s' % (slug, kind, TEX_RES, TEX_MAPS[kind]))


def fetch_model(root, slug):
    path = model_path(root, slug)
    # совместимость с v1: ели и дерево-акцент могли лежать в scene/trees
    old = os.path.join(root, 'trees', slug, '%s_%s.gltf' % (slug, MODEL_RES))
    if not os.path.exists(path) and os.path.exists(old):
        return old
    if os.path.exists(path + '.ok'):
        return path
    d = json.load(get('https://api.polyhaven.com/files/' + slug))['gltf'][MODEL_RES]['gltf']
    files = [(os.path.basename(d['url']), d)] + list(d['include'].items())
    n = sum(download(v['url'], os.path.join(os.path.dirname(path), rel), v['size']) for rel, v in files)
    open(path + '.ok', 'w').close()
    if n: log('модель %s: %d файлов, %.0f МБ' % (slug, n, sum(v['size'] for _, v in files) / 1e6))
    return path


def fetch_texture(root, slug):
    paths = {k: texture_path(root, slug, k) for k in TEX_MAPS}
    if all(os.path.exists(p) for p in paths.values()):
        return paths
    d = json.load(get('https://api.polyhaven.com/files/' + slug))
    for k, ext in TEX_MAPS.items():
        v = d[k][TEX_RES][ext]; download(v['url'], paths[k], v['size'])
    log('фактура', slug)
    return paths


def fetch_all(root):
    for s in MODELS:
        fetch_model(root, s)
    for s in TEXTURES:
        fetch_texture(root, s)
    log('все ассеты на месте:', os.path.join(root, 'assets'))


if __name__ == '__main__':
    fetch_all(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'scene'))
