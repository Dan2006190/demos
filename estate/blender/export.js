/* =====================================================================
   Выгрузка посёлка для Blender. Открыть сайт с ?export=1, дождаться
   посёлка и нажать кнопку внизу слева — скачаются три файла:
   village.glb  — вся сцена: дома, дороги, заборы, деревья, трава
                  (повторы — инстансами EXT_mesh_gpu_instancing),
   village.json — траектория вступления, ракурсы домов, солнце,
   sky_2k.hdr   — небо.
   Дальше — blender/arden_render.py (см. README.md).
   ===================================================================== */
export default function (ctx) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = 'Скачать сцену для Blender';
  btn.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99;padding:12px 18px;font:500 13px/1 system-ui,sans-serif;background:#111;color:#fff;border:0;cursor:pointer';
  document.body.appendChild(btn);
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Собираю сцену…';
    try {
      const r = await build(ctx);
      save(new Blob([r.glb], { type: 'model/gltf-binary' }), 'village.glb');
      save(new Blob([JSON.stringify(r.json)], { type: 'application/json' }), 'village.json');
      save(await (await fetch('assets/sky_2k.hdr')).blob(), 'sky_2k.hdr');
      btn.textContent = 'Готово: village.glb, village.json, sky_2k.hdr';
    } catch (e) { console.error(e); btn.textContent = 'Ошибка: ' + e.message; btn.disabled = false; }
  };
  window.__exportScene = () => build(ctx); // для автоматической выгрузки
}

const r3 = v => Math.round(v * 1000) / 1000;
const arr = v => v.toArray().map(r3);

// копия чисел из village.js (вступление и стартовый ракурс) — если там поменяются, поправить здесь
const INTRO = { pos: [-260, 470, 520], target: [120, 330, -260], dur: 8000 };
const AERIAL = { landscape: [-70, 95, 125], portrait: [-80, 135, 165], target: [0, 0, 0] };

async function build({ THREE, world, houses, camera, renderer, scene, sun, dir }) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  world.updateMatrixWorld(true);
  // непрозрачные фактуры — в JPEG (меньше файл), с прозрачностью — PNG
  world.traverse(o => {
    if (!o.isMesh) return;
    for (const mt of [].concat(o.material)) {
      const alpha = mt.transparent || mt.alphaTest > 0;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'])
        if (mt[key]) mt[key].userData.mimeType = alpha && key === 'map' ? 'image/png' : 'image/jpeg';
    }
  });
  // невидимые хитбоксы домов (по ним ловятся нажатия) в Blender не нужны
  const hidden = [];
  world.traverse(o => { if (o.isMesh && o.visible && [].concat(o.material).every(mt => mt.visible === false)) { o.visible = false; hidden.push(o); } });
  let glb;
  try { glb = await new GLTFExporter().parseAsync(world, { binary: true, maxTextureSize: 2048, onlyVisible: true }); }
  finally { hidden.forEach(o => { o.visible = true; }); }
  const json = {
    version: 2, units: 'three.js: Y вверх, метры',
    fov: camera.fov, // вертикальный угол камеры, градусы
    intro: { ...INTRO, ease: 'cubicInOut', targetLead: 1.15 },
    aerial: AERIAL,
    houses: houses.map(h => {
      const c = new THREE.Vector3(); h.g.getWorldPosition(c);
      return { name: h.data.name, pos: arr(c), side: h.side, W: r3(h.g.userData.W), D: r3(h.g.userData.D), H: r3(h.g.userData.H) };
    }),
    // все постройки посёлка (и повторы на остальных участках): чтобы деревья в Blender не встали в дом
    buildings: world.children.filter(o => o.isGroup && o.userData && o.userData.W).map(o => ({ pos: arr(o.position), W: r3(o.userData.W), D: r3(o.userData.D), rotY: r3(o.rotation.y) })),
    sun: { dir: sun.toArray(), color: dir.color.getHex(), intensity: dir.intensity },
    exposure: renderer.toneMappingExposure, envIntensity: scene.environmentIntensity, bgIntensity: scene.backgroundIntensity
  };
  return { glb, json };
}
