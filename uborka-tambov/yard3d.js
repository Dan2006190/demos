/* 3D-двор: земля засыпана листвой (или снегом), воздуходув расчищает полосу — под ней чистая трава (или дорожка),
   листья разлетаются. Текстуры, небо и модели — Poly Haven (CC0). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export function startYard(box, onReady) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  box.append(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const SIZE = 22, GROUND = 66, REP = 15;                    // двор 22×22 м, земля шире, чтобы не было края

  // небо и свет
  new RGBELoader().load('assets/sky_autumn.hdr', t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = t; scene.background = t; scene.backgroundBlurriness = 0.35; scene.backgroundIntensity = 0.9;
  });
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-10, 16, 8); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  scene.add(sun, new THREE.HemisphereLight(0xdfeaff, 0x5a4a30, 0.6));

  // текстуры
  const tl = new THREE.TextureLoader();
  const T = (n, srgb) => { const t = tl.load('assets/' + n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(REP, REP); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const tex = {
    autumn: { top: T('dry_decay_leaves_Diffuse.jpg', 1), topN: T('dry_decay_leaves_nor_gl.jpg'), under: T('leafy_grass_Diffuse.jpg', 1), underN: T('leafy_grass_nor_gl.jpg') },
    winter: { top: T('snow_02_Diffuse.jpg', 1), topN: T('snow_02_nor_gl.jpg'), under: T('stone_pathway_02_Diffuse.jpg', 1), underN: T('stone_pathway_02_nor_gl.jpg') },
  };

  // маска расчищенного: 0 — засыпано, 1 — чисто
  const MS = 768, mc = document.createElement('canvas'); mc.width = mc.height = MS;
  const mx = mc.getContext('2d'); mx.fillStyle = '#000'; mx.fillRect(0, 0, MS, MS);
  const mask = new THREE.CanvasTexture(mc);

  const groundMat = new THREE.MeshStandardMaterial({ map: tex.autumn.top, normalMap: tex.autumn.topN, roughness: 0.95 });
  const U = { uUnder: { value: tex.autumn.under }, uMask: { value: mask }, uBright: { value: 1.0 } };
  groundMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform sampler2D uUnder; uniform sampler2D uMask; uniform float uBright;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float m = texture2D(uMask, vMapUv / 15.0).r;
       vec4 under = texture2D(uUnder, vMapUv) * uBright;
       diffuseColor.rgb = mix(diffuseColor.rgb, under.rgb, smoothstep(0.15, 0.85, m));`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // забор из досок
  const plank = new THREE.MeshStandardMaterial({ color: 0x6b5139, roughness: .85 });
  const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.5, 0.04), plank, 4 * 70);
  let fi = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
  for (const [side, rot] of [[0, 0], [1, Math.PI / 2], [2, Math.PI], [3, -Math.PI / 2]]) {
    for (let i = 0; i < 70; i++) {
      const t = -SIZE / 2 + 0.3 + i * 0.31, h = 1.35 + (i % 2) * 0.08;
      const p = side === 0 ? [t, h / 2, -SIZE / 2] : side === 1 ? [-SIZE / 2, h / 2, t] : side === 2 ? [t, h / 2, SIZE / 2] : [SIZE / 2, h / 2, t];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot); m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, h / 1.5, 1));
      if (side !== 2) fence.setMatrixAt(fi++, m4);
    }
  }
  fence.count = fi; fence.castShadow = fence.receiveShadow = true; scene.add(fence);
  for (const z of [-SIZE / 2 + 0.03]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 0.08, 0.05), plank); rail.position.set(0, 0.45, z - 0.04); rail.castShadow = true; scene.add(rail);
    const rail2 = rail.clone(); rail2.position.y = 1.15; scene.add(rail2);
  }

  // модели: мешки с листвой и пень
  const gl = new GLTFLoader(); const dr = new DRACOLoader(); dr.setDecoderPath('vendor/draco/'); gl.setDRACOLoader(dr);
  const props = new THREE.Group(); scene.add(props);
  gl.load('assets/trashbag.glb', g => {
    for (const [x, z, r, s] of [[7.5, -7.6, .3, 1], [8.4, -7.2, 1.2, .9], [7.9, -6.4, 2.4, 1.05]]) {
      const b = g.scene.clone(); b.position.set(x, 0, z); b.rotation.y = r; b.scale.setScalar(s * 1.1);
      b.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); props.add(b);
    }
  });
  gl.load('assets/tree_stump_01.glb', g => { const s = g.scene; s.position.set(-7, 0, -6); s.scale.setScalar(1.3); s.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); props.add(s); });

  // воздуходув
  const blower = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8862a, roughness: .45, metalness: .1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: .6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 6, 16), orange); body.rotation.z = Math.PI / 2; body.position.set(-0.2, 0.55, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 20, Math.PI), black); handle.position.set(-0.2, 0.78, 0);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 16), black); tube.rotation.z = Math.PI / 2 - 0.35; tube.position.set(0.42, 0.35, 0);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.16, 16), orange); nozzle.rotation.z = Math.PI / 2 - 0.35; nozzle.position.set(0.95, 0.15, 0);
  for (const m of [body, handle, tube, nozzle]) { m.castShadow = true; blower.add(m); }
  // струя воздуха
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide }));
  jet.rotation.z = Math.PI / 2; jet.position.set(2.6, 0.12, 0); blower.add(jet);
  blower.scale.setScalar(1.9); scene.add(blower);

  // разлетающиеся листья / снег
  const leafTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, '#f2b14a'); g.addColorStop(.6, '#c9561d'); g.addColorStop(1, '#7e2f12');
    x.fillStyle = g; x.beginPath(); x.moveTo(32, 2); x.bezierCurveTo(62, 20, 56, 52, 32, 62); x.bezierCurveTo(8, 52, 2, 20, 32, 2); x.fill();
    x.strokeStyle = 'rgba(80,30,10,.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 6); x.lineTo(32, 60); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const N = 420;
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: .4, side: THREE.DoubleSide, roughness: .8 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4, emissive: 0x9fb3c8, emissiveIntensity: .25 });
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22), leafMat, N);
  leaves.castShadow = true; scene.add(leaves);
  const P = Array.from({ length: N }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, tint: Math.random() }));
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) { leaves.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); leaves.setColorAt(i, col.setHSL(.06 + Math.random() * .06, .7, .45 + Math.random() * .2)); }

  // управление: воздуходув идёт за курсором по земле, иначе гуляет сам
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), target = new THREE.Vector3(-6, 0, 2), hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let manual = 0;
  box.addEventListener('pointermove', e => {
    const r = box.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, cam); if (ray.ray.intersectPlane(plane, hit)) { target.set(THREE.MathUtils.clamp(hit.x, -9.5, 8), 0, THREE.MathUtils.clamp(hit.z, -9, 9)); manual = 2.5; }
  });

  let season = 'autumn', cleaned = 0, resetT = 0, prevPos = new THREE.Vector3(-6, 0, 2);
  function setSeason(s) {
    season = s; const t = tex[s];
    groundMat.map = t.top; groundMat.normalMap = t.topN; U.uUnder.value = t.under; U.uBright.value = s === 'winter' ? 1.6 : 1.0; groundMat.needsUpdate = true;
    leaves.material = s === 'winter' ? snowMat : leafMat;
    mx.fillStyle = '#000'; mx.fillRect(0, 0, MS, MS); mask.needsUpdate = true;
    P.forEach(p => p.alive = false);
  }

  function stamp(x, z, dir) {
    // мазок расчистки впереди сопла
    const u = (x / GROUND + .5) * MS, v = (z / GROUND + .5) * MS;
    for (let k = 1; k <= 4; k++) {
      const cx = u + dir.x * k * 2, cy = v + dir.z * k * 2, rad = 2 + k * 1.2;
      const g = mx.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      mx.fillStyle = g; mx.beginPath(); mx.arc(cx, cy, rad, 0, 6.28); mx.fill();
    }
    mask.needsUpdate = true;
  }
  let spawnIdx = 0;
  function spawn(x, z, dir, n) {
    for (let i = 0; i < n; i++) {
      const p = P[spawnIdx = (spawnIdx + 1) % N];
      p.alive = true; p.life = 2.5 + Math.random() * 1.5;
      p.p.set(x + dir.x * (1 + Math.random() * 2) + (Math.random() - .5), .05, z + dir.z * (1 + Math.random() * 2) + (Math.random() - .5));
      p.v.set(dir.x * (4 + Math.random() * 5) + (Math.random() - .5) * 2, 1.5 + Math.random() * 3, dir.z * (4 + Math.random() * 5) + (Math.random() - .5) * 2);
      p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); p.w.set((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12);
    }
  }

  function resize() {
    const w = box.clientWidth, h = box.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h;
    const narrow = w / h < .9;
    cam.fov = narrow ? 55 : 38; cam.position.set(narrow ? 0 : 3, narrow ? 24 : 13, narrow ? 19 : 15); cam.lookAt(narrow ? 0 : 2.5, 0, narrow ? 3 : 0); cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let last = performance.now(), visible = true, frame = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(box);
  const dir = new THREE.Vector3(1, 0, 0);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
    if (box.clientWidth && renderer.domElement.width !== Math.round(box.clientWidth * renderer.getPixelRatio())) resize();
    if (!still) {
      if (manual > 0) manual -= dt;
      else target.set(Math.sin(t * .23) * 7.5, 0, Math.sin(t * .37 + 1) * 6.5);
      blower.position.lerp(target, Math.min(1, dt * 2.2));
      const mv = blower.position.clone().sub(prevPos); mv.y = 0;
      if (mv.lengthSq() > 1e-5) dir.lerp(mv.normalize(), Math.min(1, dt * 4)).normalize();
      prevPos.copy(blower.position);
      blower.rotation.y = Math.atan2(-dir.z, dir.x);
      blower.position.y = Math.abs(Math.sin(t * 7)) * .03;
      jet.material.opacity = .07 + Math.sin(t * 30) * .02;
      stamp(blower.position.x, blower.position.z, dir);
      if (frame++ % 2 === 0) spawn(blower.position.x, blower.position.z, dir, 3);
      // когда двор почти чистый — снова «засыпаем» (листья падают)
      resetT += dt;
      if (resetT > 26) { resetT = 0; mx.fillStyle = 'rgba(0,0,0,.25)'; mx.fillRect(0, 0, MS, MS); mask.needsUpdate = true; }
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (!p.alive) { leaves.setMatrixAt(i, mtx.makeScale(0, 0, 0)); continue; }
        p.life -= dt; p.v.y -= 6 * dt; p.v.multiplyScalar(1 - 1.4 * dt);
        p.p.addScaledVector(p.v, dt); if (p.p.y < .02) { p.p.y = .02; p.v.y *= -.2; p.v.x *= .7; p.v.z *= .7; }
        p.r.x += p.w.x * dt; p.r.y += p.w.y * dt; p.r.z += p.w.z * dt;
        if (p.life <= 0 || Math.abs(p.p.x) > SIZE / 2 || Math.abs(p.p.z) > SIZE / 2) p.alive = false;
        const sc = season === 'winter' ? .35 : 1;
        mtx.compose(p.p, qq.setFromEuler(p.r), ss.set(sc, sc, sc)); leaves.setMatrixAt(i, mtx);
      }
      leaves.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, cam);
  }
  requestAnimationFrame(loop);
  onReady && onReady();
  return { setSeason };
}
