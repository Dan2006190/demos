# Источники

## 3D-модели домов — Sketchfab, лицензия CC BY 4.0

Лицензия: https://creativecommons.org/licenses/by/4.0/ — можно использовать в коммерческих проектах с указанием автора и пометкой об изменениях.

Изменения во всех моделях: удалены подложки (газоны, мощение участка), машины, деревья и вспомогательные линии; материалы переведены из specular-glossiness в metal-roughness; геометрия объединена и сжата (meshopt), текстуры уменьшены до 1–2K и пересжаты в WebP. Названия, площади и цены на сайте — пример и не относятся к проектам авторов.

| Файл | Модель | Автор | Где на сайте |
|---|---|---|---|
| models/05.glb | [«Ольга 11»](https://sketchfab.com/3d-models/11-dba1047381634016bb03da8d8227bef2) | [labarch](https://sketchfab.com/labarch) | «Терраса 150» |
| models/02.glb | [«Проект жилого дома 218 Вариант 1 (Реки)»](https://sketchfab.com/3d-models/218-1-b63d3ec1111e4e27b7fe219c957f9bed) | [labarch](https://sketchfab.com/labarch) | «Классика 218» |
| models/00.glb | [«Жилой дом_»](https://sketchfab.com/3d-models/fab830d71e6f4bc491c82d55a13e2582) | [labarch](https://sketchfab.com/labarch) | «Модерн 190» |
| models/14.glb | [«М ДОМ 1»](https://sketchfab.com/3d-models/1-22d30d75184b49559ed4b40b808d628d) | [Smart Wood](https://sketchfab.com/smwood) | «Сруб 110 с баней» |
| models/22.glb | [«Банный комплекс_1»](https://sketchfab.com/3d-models/1-f3c343f4e1914f8595133b888a46ea53) | [Smart Wood](https://sketchfab.com/smwood) | баня у «Сруба 110» |
| models/07.glb | [«Жилой дом_2»](https://sketchfab.com/3d-models/2-d4ffce6e98474ae4973db2d33f01bbc0) | [labarch](https://sketchfab.com/labarch) | «Усадьба 260» |
| models/12.glb | [«Типовой дом 4»](https://sketchfab.com/3d-models/4-4a8cb055b2e84ae19056fe864360bb49) | [labarch](https://sketchfab.com/labarch) | «Шале 180» |

Повторы этих же домов стоят на остальных участках посёлка.

## Рендер «псевдо-3D» (media/, renders/)

Кадры отрендерены в Blender из сцены сайта (blender/arden_render.py). В них, кроме домов выше, — деревья Poly Haven (CC0): fir_tree_01 (ели), tree_small_02 (деревья на участках).

## Рендер v2: машины — Sketchfab, лицензия CC BY 4.0

Машины на въездах участков в кадрах рендера (blender/arden_v2.py). Изменения: масштаб к настоящим размерам, у части моделей перекрашен кузов (тёмно-серый, чёрный, тёмно-синий).

| Модель | Автор |
|---|---|
| [2015 Hyundai Tucson](https://sketchfab.com/3d-models/2015-hyundai-tucson-7674a3bd168a451daf73fc0a33d39589) | [razor24](https://sketchfab.com/razor24) |
| [2021 Toyota RAV4 Hybrid](https://sketchfab.com/3d-models/2021-toyota-rav4-hybrid-de74fe4e98004c92b1103947597d1b53) | [tonielpro520](https://sketchfab.com/tonielpro520) |
| [2013 Toyota Land Cruiser Prado](https://sketchfab.com/3d-models/2013-toyota-land-cruiser-prado-8d2aa08e92da4c698ef922a71bae8729) | [Romanov13](https://sketchfab.com/Romanov13) |
| [CHERY TIGGO 7 PRO 2022](https://sketchfab.com/3d-models/chery-tiggo-7-pro-2022-128458f37a254a32aa65e98dfad56946) | [-garagista1753d1](https://sketchfab.com/-garagista1753d1) |
| [Hyundai Creta](https://sketchfab.com/3d-models/hyundai-creta-67645b6f549441a786e2b4050dc0268b) | [MattDoesBlender](https://sketchfab.com/MattDoesBlender) |
| [Lada Vesta](https://sketchfab.com/3d-models/lada-vesta-3c333139feb744ae9d36767c0e9cabfd) | [tiunov.se](https://sketchfab.com/tiunov.se) |

## Рендер v2: модели и фактуры Poly Haven (CC0)

Трава: grass_medium_01, grass_medium_02 (некошеная полоса и луг). Деревья: fir_tree_01, tree_small_02. Кусты и цветы: shrub_01–04, dandelion_01, periwinkle_plant, shrub_sorrel_01, weed_plant_02, nettle_plant, fern_02. Мебель и кадки: outdoor_table_chair_set_01, wooden_picnic_table, painted_wooden_bench, planter_box_01, planter_box_02, planter_pot_clay, potted_plant_01, potted_plant_02. Улица: water_manhole_cover. Фактуры: asphalt_02, asphalt_04, brushed_concrete_03, concrete_pavers_02, brick_pavement_02, bicolour_gravel, brown_planks_05, corrugated_iron_02, forest_floor, sparse_grass, leafy_grass, farm_soil, raked_dirt.

## Небо и фактуры — Poly Haven (polyhaven.com), лицензия CC0

Можно использовать в коммерческих проектах без указания автора.

- Небо: kloppenheim_06_puresky (HDRI, 2k)
- Фактуры (уменьшены и пересжаты): plastered_wall_04, red_brick_03, wood_plank_wall, grey_roof_01, square_concrete_pavers, clean_asphalt, leafy_grass, oak_wood_planks, corrugated_iron_02
- leaf_cluster.png и fir_cluster.png собраны из листьев island_tree_02 и веток fir_tree_01
