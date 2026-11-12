/* =====================================================================
   Посёлок в 3D для шапки сайта: вступление сквозь облака, вид сверху,
   нажатие на дом — пролёт камеры. Дома строятся кодом по параметрам из
   window.SITE.houses (config.js); фактуры и небо — Poly Haven (CC0).
   События для страницы: village:phase {phase}, village:thumbs {images}.
   ===================================================================== */
(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const SITE = window.SITE || {};
  const hero = $('#hero'), A = SITE.assets || 'assets/';
  const vw = () => hero.clientWidth, vh = () => hero.clientHeight;
  const emit = (name, detail) => dispatchEvent(new CustomEvent('village:' + name, { detail }));
  const loader = $('#loader'), bar = $('#loader i');
  const step = p => { bar.style.width = Math.round(p * 100) + '%'; return new Promise(r => setTimeout(r, 0)); };
  let THREE, OrbitControls, RGBELoader, mergeGeometries, mergeVertices, EffectComposer, RenderPass, GTAOPass, OutputPass;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ RGBELoader } = await import('three/addons/loaders/RGBELoader.js'));
    ({ mergeGeometries, mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js'));
    ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
    ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
    ({ GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js'));
    ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
  } catch (e) {
    $('#loader p').textContent = 'Не удалось загрузить 3D — проверьте интернет и обновите страницу.';
    emit('phase', { phase: 'failed' });
    return;
  }
  const HOUSES = SITE.houses || [];
  const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
  const SEEN = (() => { try { return localStorage.getItem('estate-intro') === '1'; } catch (e) { return false; } })();
  const LOW = /[?&]q=low/.test(location.search); // слабые устройства: без AO, тени меньше
  const nf = new Intl.NumberFormat('ru-RU');
  const mln = n => (Math.round(n / 1e5) / 10).toString().replace('.', ',') + ' млн ₽';

  /* ---------- случайные числа ---------- */
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- фактуры на canvas ---------- */
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function grain(ctx, w, h, amp, seed) {
    const r = rng(seed), img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  function relief(w, h, f, amp, sizeM, base, gain) {
    const hm = new Float32Array(w * h); let mn = 1e9, mx = -1e9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = f((x + .5) / w, 1 - (y + .5) / h); hm[y * w + x] = v; mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    const color = cnv(w, h), normal = cnv(w, h), ic = color.getContext('2d').createImageData(w, h), inn = normal.getContext('2d').createImageData(w, h);
    const sx = amp / (2 * sizeM / w), sy = amp / (2 * sizeM / h), span = (mx - mn) || 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const hl = hm[y * w + (x - 1 + w) % w], hr = hm[y * w + (x + 1) % w], hu = hm[((y - 1 + h) % h) * w + x], hd = hm[((y + 1) % h) * w + x];
      const nx = -clamp((hr - hl) * sx, -3, 3), ny = clamp((hd - hu) * sy, -3, 3), il = 1 / Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
      inn.data[i] = (nx * il * .5 + .5) * 255; inn.data[i + 1] = (ny * il * .5 + .5) * 255; inn.data[i + 2] = (il * .5 + .5) * 255; inn.data[i + 3] = 255;
      const l = 255 * (base + gain * (hm[y * w + x] - mn) / span); ic.data[i] = ic.data[i + 1] = ic.data[i + 2] = l; ic.data[i + 3] = 255;
    }
    color.getContext('2d').putImageData(ic, 0, 0); normal.getContext('2d').putImageData(inn, 0, 0);
    return { color, normal };
  }
  function bricks(pal, mortar, seed) {
    const c = cnv(512, 512), x = c.getContext('2d'), rows = 12, rh = 512 / rows, bw = 128;
    x.fillStyle = mortar; x.fillRect(0, 0, 512, 512);
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let k = -1; k < 4; k++) {
        const r = rng(seed + row * 17 + ((k % 4) + 4) % 4);
        x.fillStyle = shade(pal[Math.floor(r() * pal.length)], (r() - .5) * .16);
        x.fillRect(k * bw + off + 2.5, row * rh + 2.5, bw - 5, rh - 5);
      }
    }
    grain(x, 512, 512, 12, seed); return c;
  }
  function plaster(hex, seed) {
    const c = cnv(256, 256), x = c.getContext('2d'); x.fillStyle = hex; x.fillRect(0, 0, 256, 256);
    const r = rng(seed);
    for (let i = 0; i < 40; i++) { const g = x.createRadialGradient(r() * 256, r() * 256, 0, r() * 256, r() * 256, 30 + r() * 60); g.addColorStop(0, 'rgba(0,0,0,.025)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
    grain(x, 256, 256, 9, seed); return c;
  }
  function siding(hex, seed) {
    const c = cnv(256, 256), x = c.getContext('2d'), n = 5, bh = 256 / n;
    for (let i = 0; i < n; i++) {
      const y = i * bh, g = x.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, shade(hex, .06)); g.addColorStop(1, shade(hex, -.1)); x.fillStyle = g; x.fillRect(0, y, 256, bh);
      x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, y + bh - 4, 256, 4); x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(0, y, 256, 2);
    }
    grain(x, 256, 256, 5, seed); return c;
  }
  function stones(pal, mortar, seed) {
    const c = cnv(512, 512), x = c.getContext('2d'), r = rng(seed); let y = 0;
    x.fillStyle = mortar; x.fillRect(0, 0, 512, 512);
    [72, 96, 64, 88, 104, 88].forEach(h => {
      const off = r() * 512; let s = 0;
      while (s < 512) { let w = 90 + r() * 100; if (512 - s - w < 70) w = 512 - s; const col = shade(pal[Math.floor(r() * pal.length)], (r() - .5) * .2); for (let dx = -512; dx <= 0; dx += 512) { x.fillStyle = col; x.fillRect(s + off + dx + 3, y + 3, w - 6, h - 6); } s += w; }
      y += h;
    });
    grain(x, 512, 512, 16, seed + 1); return c;
  }
  function lawn(base, seed) {
    const c = cnv(512, 512), x = c.getContext('2d'), r = rng(seed);
    x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 30; i++) {
      const cx = r() * 512, cy = r() * 512, rad = 40 + r() * 100, dark = r() < .5;
      for (let dx = -512; dx <= 512; dx += 512) for (let dy = -512; dy <= 512; dy += 512) {
        const g = x.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, rad);
        g.addColorStop(0, dark ? 'rgba(52,84,34,.3)' : 'rgba(150,176,90,.26)'); g.addColorStop(1, 'rgba(100,140,70,0)');
        x.fillStyle = g; x.fillRect(cx + dx - rad, cy + dy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 9000; i++) { x.fillStyle = r() < .5 ? 'rgba(38,66,24,.3)' : 'rgba(170,196,110,.25)'; x.fillRect(r() * 512, r() * 512, 1, 2 + r() * 4); }
    return c;
  }
  function asphalt() {
    const c = cnv(512, 512), x = c.getContext('2d'), r = rng(9);
    x.fillStyle = '#4a4c4e'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) { const v = 40 + r() * 70; x.fillStyle = `rgba(${v},${v},${v + 3},.5)`; x.fillRect(r() * 512, r() * 512, 1.4, 1.4); }
    for (let i = 0; i < 14; i++) { const g = x.createRadialGradient(r() * 512, r() * 512, 0, r() * 512, r() * 512, 60 + r() * 90); g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); }
    return c;
  }
  function wood(hex, seed) {
    const c = cnv(256, 256), x = c.getContext('2d'), r = rng(seed), n = 8, bw = 256 / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = shade(hex, (r() - .5) * .18); x.fillRect(i * bw, 0, bw, 256);
      for (let k = 0; k < 18; k++) { x.strokeStyle = 'rgba(40,22,10,.18)'; x.lineWidth = 1; x.beginPath(); const xx = i * bw + r() * bw; x.moveTo(xx, 0); x.bezierCurveTo(xx + 3, 80, xx - 3, 170, xx + 1, 256); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(i * bw, 0, 2, 256);
    }
    return c;
  }
  function garageDoor() {
    const c = cnv(256, 256), x = c.getContext('2d');
    x.fillStyle = '#d9d8d3'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { const y = i * 32, g = x.createLinearGradient(0, y, 0, y + 32); g.addColorStop(0, '#e6e5e0'); g.addColorStop(1, '#bdbcb6'); x.fillStyle = g; x.fillRect(0, y + 1, 256, 30); }
    grain(x, 256, 256, 6, 5); return c;
  }

  await step(.08);

  /* ---------- рендер, сцена, небо ---------- */
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(LOW ? 1 : Math.min(devicePixelRatio, MOBILE ? 1.6 : 1.75));
  renderer.setSize(vw(), vh(), false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, vw() / vh(), .5, 3000);

  // Небо — HDRI Poly Haven (CC0). Солнце в нём: азимут ≈48°, высота ≈14°.
  const manager = new THREE.LoadingManager();
  let assetsDone = false, onAssets = null;
  manager.onProgress = (u, done, total) => { step(.1 + .5 * done / total); };
  manager.onLoad = () => { assetsDone = true; onAssets && onAssets(); };
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const hdr = await new RGBELoader().loadAsync(A + 'sky_2k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = hdr; scene.backgroundIntensity = .9;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
  } catch (e) { // открыто файлом без сервера — небо однотонное
    scene.background = new THREE.Color(0x9fb8d2);
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  }
  scene.environmentIntensity = .8;
  scene.fog = new THREE.Fog(0xaab4c0, 300, 1000);
  const SUN_AZ = THREE.MathUtils.degToRad(48), SUN_EL = THREE.MathUtils.degToRad(26);
  const sun = new THREE.Vector3(Math.cos(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), Math.sin(SUN_AZ) * Math.cos(SUN_EL));

  const dir = new THREE.DirectionalLight(0xffe7c8, 3.4);
  dir.position.copy(sun).multiplyScalar(260);
  dir.castShadow = true;
  const SM = LOW ? 1024 : MOBILE ? 2048 : 4096; dir.shadow.mapSize.set(SM, SM);
  const sc = dir.shadow.camera; sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 50; sc.far = 600;
  dir.shadow.bias = -.0004; dir.shadow.normalBias = .04;
  scene.add(dir, dir.target);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5d6b45, .25));

  /* ---------- материалы: размер фактуры в метрах для UV ---------- */
  function tex(canvas, srgb = true) {
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const M = {};
  function mat(name, opts, size) { const m = opts.isMaterial ? opts : new THREE.MeshStandardMaterial(opts); m.userData.size = size || [1, 1]; M[name] = m; return m; }
  const TL = new THREE.TextureLoader(manager);
  const photo = (name, srgb = true) => { const t = TL.load(A + name + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const P = n => ({ map: photo(n + '_diff'), normalMap: photo(n + '_nor', false) });
  const plasterP = P('plastered_wall_04'), brickP = P('red_brick_03'), roofP = P('grey_roof_01'), woodP = P('wood_plank_wall');
  const oakP = P('oak_wood_planks'), paveP = P('square_concrete_pavers'), asphP = P('clean_asphalt'), grassP = P('leafy_grass'), ironP = P('corrugated_iron_02');
  const prof = relief(128, 4, u => u < .28 ? 1 : u < .4 ? 1 - (u - .28) / .12 : u < .88 ? 0 : (u - .88) / .12, .03, .25, .78, .22);
  const profN = tex(prof.normal, false);
  mat('roofGraphite', { color: 0x6a6e76, ...roofP, roughness: .75, normalScale: new THREE.Vector2(1.2, 1.2) }, [2.4, 2.4]);
  mat('roofBrown', { color: 0xa0705a, ...roofP, roughness: .75, normalScale: new THREE.Vector2(1.2, 1.2) }, [2.4, 2.4]);
  mat('roofGreen', { color: 0x75907a, ...roofP, roughness: .75, normalScale: new THREE.Vector2(1.2, 1.2) }, [2.4, 2.4]);
  mat('flatRoof', { color: 0x75736e, ...P('clean_asphalt'), roughness: .95 }, [4, 4]);
  mat('plasterWhite', { color: 0xfffcf6, ...plasterP, roughness: .92 }, [2.2, 2.2]);
  mat('plasterWarm', { color: 0xf2dcc0, ...plasterP, roughness: .92 }, [2.2, 2.2]);
  mat('plasterGrey', { color: 0xc9c7c3, ...plasterP, roughness: .92 }, [2.2, 2.2]);
  mat('brickRed', { ...brickP, roughness: .9 }, [.95, .95]);
  mat('brickSand', { map: tex(bricks(['#d8c39e', '#cdb58e', '#e0cda8', '#c4ab83'], '#efe8da', 43)), normalMap: brickP.normalMap, roughness: .88 }, [1.04, .9]);
  mat('sidingLight', { color: 0xe9dccb, ...woodP, roughness: .7 }, [1.3, 1.3]);
  mat('sidingDark', { color: 0x9a9a9a, ...woodP, roughness: .7 }, [1.3, 1.3]);
  mat('woodFacade', { ...woodP, roughness: .7 }, [1.3, 1.3]);
  mat('plinth', { map: tex(stones(['#7f7b73', '#6d6962', '#8d8980', '#5f5b55'], '#44413c', 52)), roughness: .9 }, [1.2, 1.2]);
  mat('frame', { color: 0x30333a, roughness: .45, metalness: .2 });
  mat('trim', { color: 0xf1eee8, roughness: .6 });
  mat('glass', { color: 0x9fb2c2, metalness: 1, roughness: .04, envMapIntensity: 1.2 });
  mat('door', { color: 0x8a6a52, ...oakP, roughness: .55 }, [1.2, 2.4]);
  mat('deck', { ...oakP, roughness: .75 }, [1.8, 1.8]);
  mat('garage', { map: tex(garageDoor()), roughness: .5, metalness: .2 }, [2.6, 2.3]);
  mat('fence', { color: 0x6f757c, ...ironP, roughness: .45, metalness: .5 }, [2.4, 2.4]);
  mat('post', { color: 0x2d3034, roughness: .5, metalness: .4 });
  mat('paving', { color: 0xc4c8cc, ...paveP, roughness: .85 }, [2.4, 2.4]);
  mat('concrete', { color: 0xd2cec6, ...plasterP, roughness: .9 }, [2, 2]);
  mat('chimney', M.brickRed.clone(), [.95, .95]); M.chimney.userData.size = [.95, .95];
  const lawnMacro = tex(lawn('#8a8a8a', 77));
  function gravel(seed) {
    const c = cnv(512, 512), x = c.getContext('2d'), r = rng(seed);
    x.fillStyle = '#9a948a'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5200; i++) {
      const px = r() * 512, py = r() * 512, rad = 2 + r() * 5, v = 120 + r() * 100;
      x.fillStyle = `rgb(${v},${v - 6},${v - 14})`; x.beginPath(); x.ellipse(px, py, rad, rad * (.6 + r() * .4), r() * 3, 0, 7); x.fill();
      x.fillStyle = 'rgba(0,0,0,.22)'; x.beginPath(); x.ellipse(px + 1, py + 1.5, rad, rad * .5, 0, 0, 3.2); x.fill();
    }
    return c;
  }
  mat('gravel', { map: tex(gravel(5)), roughness: .95 }, [1.6, 1.6]);
  mat('soil', { color: 0x3b2c22, roughness: 1 });
  mat('curb', { color: 0x55585c, roughness: .8 });
  mat('glow', new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc77a, emissiveIntensity: 2.2 }));

  /* ---------- геометрия с UV в метрах ---------- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Выпуклый многоугольник: UV по осям грани (u — первое ребро), в метрах / размер фактуры.
  function poly(pts, size, flip) {
    if (flip) pts = pts.slice().reverse();
    const u = pts[1].clone().sub(pts[0]).normalize(), n = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize(), v = n.clone().cross(u);
    const pos = [], uv = [], nor = [];
    for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) {
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      const d = p.clone().sub(pts[0]); uv.push(d.dot(u) / size[0], d.dot(v) / size[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  // Брус с UV в метрах.
  function box(w, h, d, size, x = 0, y = 0, z = 0, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / size[0], uv.getY(i) * dims[f][1] / size[1]); }
    if (ry) g.rotateY(ry);
    g.translate(x, y, z); return g;
  }
  // Корзины геометрии по материалам → один меш на материал.
  class Kit {
    constructor() { this.b = {}; }
    add(name, g) { (this.b[name] = this.b[name] || []).push(g); }
    box(name, w, h, d, x, y, z, ry) { this.add(name, box(w, h, d, M[name].userData.size, x, y, z, ry)); }
    poly(name, pts, flip) { this.add(name, poly(pts, M[name].userData.size, flip)); }
    build(group, shadows = true) {
      for (const [name, gs] of Object.entries(this.b)) {
        const g = mergeGeometries(gs.map(x => x.index ? x.toNonIndexed() : x), false);
        const m = new THREE.Mesh(g, M[name]); m.castShadow = shadows && name !== 'glass'; m.receiveShadow = true; group.add(m);
      }
      return group;
    }
  }

  /* ---------- дом из параметров каталога ---------- */
  const WALLS = { 0: ['plasterWhite', 'plasterWarm', 'plasterGrey'], 1: ['brickRed', 'brickSand'], 2: ['sidingLight', 'sidingDark', 'woodFacade'] };
  function makeHouse(h, seed) {
    const r = rng(seed), k = new Kit(), g = new THREE.Group();
    const W = h.w, D = h.d || Math.max(8, Math.round(h.area / (h.floors >= 2 ? 2 : h.floors === 1.5 ? 1.6 : 1) / h.w));
    const wallM = h.wall || WALLS[h.mat || 0][Math.floor(r() * WALLS[h.mat || 0].length)];
    const roofM = h.roofM || ['roofGraphite', 'roofBrown', 'roofGreen'][Math.floor(r() * 3)];
    const P = .6, FH = 3.1, floors = h.floors >= 2 ? 2 : 1, knee = h.floors === 1.5 ? 1.3 : 0;
    const WH = floors * FH + knee, top = P + WH;
    // цоколь и стены
    k.box('plinth', W + .16, P, D + .16, 0, P / 2, 0);
    const walls = [[V(-W / 2, P, D / 2), V(W / 2, P, D / 2)], [V(W / 2, P, D / 2), V(W / 2, P, -D / 2)], [V(W / 2, P, -D / 2), V(-W / 2, P, -D / 2)], [V(-W / 2, P, -D / 2), V(-W / 2, P, D / 2)]];
    walls.forEach(([a, b]) => k.poly(wallM, [a, b, V(b.x, top, b.z), V(a.x, top, a.z)]));
    if (floors === 2) { k.box('trim', W + .1, .18, D + .1, 0, P + FH, 0); }
    // окна и дверь
    const n0 = Math.max(1, Math.floor(W / 3.4)), doorX = -W / 2 + (Math.min(n0 - 1, Math.floor((W * .68) / (W / n0))) + .5) * W / n0;
    walls.forEach(([a, b], wi) => {
      const len = a.distanceTo(b), dirv = b.clone().sub(a).normalize(), out = V(-dirv.z, 0, dirv.x);
      const n = Math.max(1, Math.floor(len / 3.4));
      for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
        const t = (i + .5) / n, c = a.clone().lerp(b, t);
        const isDoor = wi === 0 && f === 0 && Math.abs(c.x - doorX) < .01;
        const ww = isDoor ? 1.1 : (h.big && wi === 0 && f === 0 ? 2.2 : 1.45), wh = isDoor ? 2.25 : (h.big && wi === 0 && f === 0 ? 2.3 : 1.5);
        const y0 = P + f * FH + (isDoor ? .02 : .85);
        opening(k, c, dirv, out, ww, wh, y0, isDoor);
      }
    });
    // крыльцо и козырёк
    k.box('concrete', 2.4, P, 1.4, doorX, P / 2 - .02, D / 2 + .7);
    k.box(roofM, 2.2, .12, 1.5, doorX, P + 2.75, D / 2 + .7);
    // кровля
    const O = .55;
    if (h.roof === 'flat') {
      k.box('flatRoof', W + .3, .25, D + .3, 0, top + .12, 0);
      k.box('trim', W + .5, .5, .18, 0, top + .3, D / 2 + .2); k.box('trim', W + .5, .5, .18, 0, top + .3, -D / 2 - .2);
      k.box('trim', .18, .5, D + .5, W / 2 + .2, top + .3, 0); k.box('trim', .18, .5, D + .5, -W / 2 - .2, top + .3, 0);
    } else {
      const pitch = h.floors === 1.5 ? .78 : .5, rh = (D / 2 + O) * Math.tan(pitch) * (h.roof === 'hip' ? .9 : 1);
      const y = top - .05, x1 = -W / 2 - O, x2 = W / 2 + O, z1 = -D / 2 - O, z2 = D / 2 + O, ry = y + rh;
      if (h.roof === 'hip') {
        const rx = Math.max(0, W / 2 - D / 2);
        k.poly(roofM, [V(x1, y, z2), V(x2, y, z2), V(rx, ry, 0), V(-rx, ry, 0)]);
        k.poly(roofM, [V(x2, y, z1), V(x1, y, z1), V(-rx, ry, 0), V(rx, ry, 0)]);
        k.poly(roofM, [V(x2, y, z2), V(x2, y, z1), V(rx, ry, 0)]);
        k.poly(roofM, [V(x1, y, z1), V(x1, y, z2), V(-rx, ry, 0)]);
        // нижняя сторона свеса — для теней
        k.poly('trim', [V(x1, y, z1), V(x2, y, z1), V(x2, y, z2), V(x1, y, z2)]);
      } else {
        k.poly(roofM, [V(x1, y, z2), V(x2, y, z2), V(x2, ry, 0), V(x1, ry, 0)]);
        k.poly(roofM, [V(x2, y, z1), V(x1, y, z1), V(x1, ry, 0), V(x2, ry, 0)]);
        k.poly('trim', [V(x1, y, z1), V(x2, y, z1), V(x2, y, z2), V(x1, y, z2)]);
        const ge = y + rh * O / (D / 2 + O), gp = ry - .02;
        // фронтоны: пятиугольник от верха стены до конька
        for (const sx of [-1, 1]) {
          const xx = sx * W / 2;
          const pts = [V(xx, top, D / 2), V(xx, top, -D / 2), V(xx, ge, -D / 2), V(xx, gp, 0), V(xx, ge, D / 2)];
          k.poly(wallM, sx > 0 ? pts : [pts[1], pts[0], pts[4], pts[3], pts[2]]);
          // торцевые доски по скатам
          const xe = sx * (W / 2 + O), bt = .28;
          for (const zs of [1, -1]) {
            const e = V(xe, y, zs * (D / 2 + O)), t = V(xe, ry, 0), q = [e, t, V(xe, ry - bt, 0), V(xe, y - bt, e.z)];
            const sign = sx * zs; k.poly('trim', sign > 0 ? [q[3], q[2], q[1], q[0]] : q);
          }
          if (h.floors === 1.5) opening(k, V(xx, 0, 0), V(0, 0, -sx), V(sx, 0, 0), 1.6, 1.7, top + .5, false);
          else opening(k, V(xx, 0, 0), V(0, 0, -sx), V(sx, 0, 0), .7, .7, top + (gp - top) * .3, false);
        }
        k.box('frame', W + 2 * O, .14, .3, 0, ry + .02, 0);
      }
      // труба
      k.box('chimney', .7, rh + 1.2, .7, -W * .22, y + rh * .55 + .4, -D * .12);
      k.box('frame', .9, .12, .9, -W * .22, y + rh * 1.08 + 1, -D * .12);
    }
    // терраса
    if (h.terrace) {
      const tw = Math.min(5, W * .45), td = 3.2, tx = -W / 2 + tw / 2;
      k.box('deck', tw, .25, td, tx, P - .12, D / 2 + td / 2);
      for (const px of [tx - tw / 2 + .15, tx + tw / 2 - .15]) k.box('trim', .16, 2.7, .16, px, P + 1.35, D / 2 + td - .15);
      k.box(roofM, tw + .3, .15, td + .3, tx, P + 2.78, D / 2 + td / 2);
    }
    // гараж
    if (h.garage) {
      const gw = 4.2, gd = Math.min(7, D), gx = W / 2 + gw / 2, gz = D / 2 - gd / 2;
      k.box('plinth', gw, .3, gd, gx, .15, gz);
      k.box(wallM, gw, 2.9, gd, gx, .3 + 1.45, gz);
      k.box('flatRoof', gw + .4, .25, gd + .4, gx, 3.3, gz);
      k.add('garage', poly([V(gx - 1.3, .3, D / 2 + .02), V(gx + 1.3, .3, D / 2 + .02), V(gx + 1.3, 2.6, D / 2 + .02), V(gx - 1.3, 2.6, D / 2 + .02)], M.garage.userData.size));
    }
    k.build(g);
    g.userData = { W: W + (h.garage ? 4.2 : 0), D: D + (h.terrace ? 3.2 : 0), H: top + 4, depth: D, door: V(doorX, 0, D / 2 + 1.45) };
    return g;
  }
  function opening(k, c, dirv, out, ww, wh, y0, isDoor) {
    const fr = .09, dep = .12, ry = Math.atan2(dirv.x, dirv.z) - Math.PI / 2;
    const at = (dx, dy, dz) => c.clone().add(dirv.clone().multiplyScalar(dx)).add(out.clone().multiplyScalar(dz)).setY(y0 + dy);
    const add = (name, w, h, d, p) => k.box(name, w, h, d, p.x, p.y, p.z, ry);
    // откос (тёмная ниша) + рама + стекло/дверь + подоконник
    add('frame', ww + 2 * fr, fr, dep, at(0, wh + fr / 2, .03));
    add('frame', ww + 2 * fr, fr, dep, at(0, -fr / 2, .03));
    add('frame', fr, wh, dep, at(-ww / 2 - fr / 2, wh / 2, .03));
    add('frame', fr, wh, dep, at(ww / 2 + fr / 2, wh / 2, .03));
    if (isDoor) { add('door', ww, wh, .06, at(0, wh / 2, .02)); return; }
    add('glass', ww, wh, .02, at(0, wh / 2, .012));
    if (ww > 1) add('frame', .06, wh, .05, at(0, wh / 2, .03));
    add('trim', ww + .35, .06, .28, at(0, -.12, .12));
  }

  await step(.3);

  /* ---------- земля, дороги, участки ---------- */
  const world = new THREE.Group(); scene.add(world);
  // газон: фотофактура 3 м + крупные пятна (вторая развёртка через aoMap), чтобы не было видно повтора
  const gg = new THREE.PlaneGeometry(2400, 2400), guv = gg.attributes.uv;
  const uv1 = new Float32Array(guv.count * 2); for (let i = 0; i < guv.count; i++) { uv1[i * 2] = guv.getX(i) * 2400 / 60; uv1[i * 2 + 1] = guv.getY(i) * 2400 / 60; guv.setXY(i, guv.getX(i) * 2400 / 3, guv.getY(i) * 2400 / 3); }
  gg.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  lawnMacro.channel = 1; lawnMacro.colorSpace = THREE.NoColorSpace;
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x8fbf5e, ...grassP, roughness: 1, aoMap: lawnMacro, aoMapIntensity: .7 });
  const ground = new THREE.Mesh(gg, grassMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const roads = new Kit();
  M.asphalt = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, ...asphP, roughness: .9 }); M.asphalt.userData.size = [4, 4];
  M.mark = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: .8 }); M.mark.userData.size = [1, 1];
  M.plot = new THREE.MeshStandardMaterial({ color: 0x9ccc68, ...grassP, roughness: 1 }); M.plot.userData.size = [2.6, 2.6];
  const ROAD = 7, PW = 28, PD = 32, XS = [-90, -60, -30, 0, 30, 60, 90];
  const flat = (name, x1, z1, x2, z2, y) => roads.poly(name, [V(x1, y, z2), V(x2, y, z2), V(x2, y, z1), V(x1, y, z1)]);
  flat('asphalt', -150, -ROAD / 2, 150, ROAD / 2, .03);
  flat('asphalt', -ROAD / 2 + 105, -150, ROAD / 2 + 105, 150, .028);
  flat('asphalt', -ROAD / 2 - 105, -150, ROAD / 2 - 105, 150, .028);
  for (let x = -146; x < 146; x += 6) if (Math.abs(x + 105) > 6 && Math.abs(x - 105) > 6) flat('mark', x, -.07, x + 3, .07, .04);
  flat('concrete', -150, ROAD / 2, 150, ROAD / 2 + 1.6, .07);
  flat('concrete', -150, -ROAD / 2 - 1.6, 150, -ROAD / 2, .07);
  roads.build(world, false);

  const plots = [];
  XS.forEach((x, i) => [1, -1].forEach(side => plots.push({ x, side, z: side * (ROAD / 2 + 1.6 + PD / 2) })));
  // главные дома — по центру улицы, по три с каждой стороны
  const mainSlots = [[-30, 1], [0, 1], [30, 1], [-30, -1], [0, -1], [30, -1]];
  const fence = new Kit();
  const trees = [];
  const r0 = rng(2026);
  const houses = [];
  for (const p of plots) {
    const fx1 = p.x - PW / 2 + .4, fx2 = p.x + PW / 2 - .4, near = p.side * (ROAD / 2 + 1.9), far = p.side * (ROAD / 2 + 1.6 + PD - .3);
    // забор: профлист по трём сторонам, спереди — с воротами
    const fh = 1.8, fy = fh / 2 + .05;
    fence.box('fence', .04, fh, PD - 2.2, fx1, fy, (near + far) / 2);
    fence.box('fence', .04, fh, PD - 2.2, fx2, fy, (near + far) / 2);
    fence.box('fence', PW - .8, fh, .04, p.x, fy, far);
    fence.box('fence', PW / 2 - 4.5, fh, .04, fx1 + (PW / 2 - 4.5) / 2, fy, near);
    fence.box('fence', PW / 2 - 4.5, fh, .04, fx2 - (PW / 2 - 4.5) / 2, fy, near);
    for (const px of [fx1, fx2, p.x - 4.1, p.x + 4.1]) fence.box('post', .12, 2, .12, px, 1, near);
    for (let t = 0; t < 4; t++) trees.push([p.x + (r0() - .5) * (PW - 6), p.z + p.side * (PD / 2 - 3 - r0() * 3), .8 + r0() * .5, r0() < .35]);
  }
  // газон участков и въезды
  const plotKit = new Kit();
  for (const p of plots) {
    const near = p.side * (ROAD / 2 + 1.9), far = p.side * (ROAD / 2 + 1.6 + PD - .3);
    plotKit.poly('plot', [V(p.x - PW / 2 + .4, .02, Math.max(near, far)), V(p.x + PW / 2 - .4, .02, Math.max(near, far)), V(p.x + PW / 2 - .4, .02, Math.min(near, far)), V(p.x - PW / 2 + .4, .02, Math.min(near, far))]);
    plotKit.poly('paving', [V(p.x + .6, .06, Math.max(near, near + p.side * 9)), V(p.x + 4.2, .06, Math.max(near, near + p.side * 9)), V(p.x + 4.2, .06, Math.min(near, near + p.side * 9)), V(p.x + .6, .06, Math.min(near, near + p.side * 9))]);
  }
  plotKit.build(world, false);
  fence.build(world);

  await step(.5);

  // дома
  const hits = [];
  const extraTypes = [
    { w: 10, floors: 1, roof: 'gable', area: 100, mat: 2 }, { w: 9, floors: 2, roof: 'hip', area: 160, mat: 0 },
    { w: 11, floors: 1, roof: 'hip', area: 120, mat: 1 }, { w: 8, floors: 1.5, roof: 'gable', area: 120, mat: 2 },
    { w: 12, floors: 1, roof: 'flat', area: 140, mat: 0 }, { w: 10, floors: 2, roof: 'gable', area: 180, mat: 1 }];
  let ei = 0;
  for (const p of plots) {
    const mi = mainSlots.findIndex(s => s[0] === p.x && s[1] === p.side);
    if (mi < 0 && r0() < .18) continue; // пара пустых участков — «ещё продаются»
    const data = mi >= 0 ? HOUSES[mi] : extraTypes[ei++ % extraTypes.length];
    if (!data) continue;
    const g = makeHouse(data, 100 + plots.indexOf(p) * 7);
    const setback = 9 + g.userData.depth / 2;
    g.position.set(p.x - (data.garage ? 2 : 0), 0, p.side * (ROAD / 2 + 1.6 + setback));
    g.rotation.y = p.side > 0 ? Math.PI : 0;
    world.add(g);
    if (mi >= 0) {
      const hb = new THREE.Mesh(new THREE.BoxGeometry(g.userData.W + 2, g.userData.H + 2, g.userData.D + 2), new THREE.MeshBasicMaterial({ visible: false }));
      hb.position.set(0, g.userData.H / 2, 0); g.add(hb); hb.userData.i = mi; hits.push(hb);
      houses[mi] = { g, data, side: p.side };
    }
  }

  /* ---------- подходы к домам: у каждого свой ---------- */
  const keep = []; // где траву не сажать: прямоугольники и полосы дорожек
  houses.forEach(h => keep.push({ box: new THREE.Box3().setFromObject(h.g).expandByScalar(.6) }));
  const ap = new Kit(), flowers = [], bollards = [];
  function strip(name, pts, w, y) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a).normalize(), n = V(-d.z, 0, d.x).multiplyScalar(w / 2);
      const q = [a.clone().add(n).setY(y), b.clone().add(n).setY(y), b.clone().sub(n).setY(y), a.clone().sub(n).setY(y)];
      // нормаль вверх: при необходимости разворачиваем порядок
      const up = q[1].clone().sub(q[0]).cross(q[2].clone().sub(q[0])).y > 0;
      ap.poly(name, up ? q : q.slice().reverse());
    }
    keep.push({ path: pts, w: w + .3 });
  }
  const bez = (a, c, b, n = 18) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return a.clone().multiplyScalar((1 - t) ** 2).add(c.clone().multiplyScalar(2 * t * (1 - t))).add(b.clone().multiplyScalar(t * t)); });
  const plotOf = h => plots.find(p => Math.abs(p.x - h.g.position.x) < 6 && Math.sign(p.side) === h.side);
  function approach(h, style) {
    const p = plotOf(h); if (!p) return;
    const near = p.side * (ROAD / 2 + 1.9), door = h.g.localToWorld(h.g.userData.door.clone()).setY(0);
    const gate = V(p.x - 1.9, 0, near), mid = V(gate.x, 0, door.z - p.side * 1.2);
    ap.box('post', .12, 1.9, .12, gate.x - .7, .95, near); ap.box('post', .12, 1.9, .12, gate.x + .7, .95, near);
    if (style === 0) { // плиты-шаги по газону
      const pts = [gate, mid, door]; let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), d = b.clone().sub(a).normalize(), ry = Math.atan2(d.x, d.z);
        for (; acc < L; acc += .78) { const c = a.clone().lerp(b, acc / L); ap.box('paving', .62, .06, .46, c.x, .05, c.z, ry); }
        acc -= L;
      }
      keep.push({ path: pts, w: .9 });
    } else if (style === 1) { // гравий с бордюром
      const pts = [gate, mid, door]; strip('gravel', pts, 1.5, .045);
      for (const sgn of [-1, 1]) for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], d = b.clone().sub(a).normalize(), n = V(-d.z, 0, d.x).multiplyScalar(sgn * .8), L = a.distanceTo(b);
        const c = a.clone().add(b).multiplyScalar(.5).add(n); ap.box('curb', .08, .12, L, c.x, .06, c.z, Math.atan2(d.x, d.z));
      }
    } else if (style === 2) { // мощёная площадка и навес для машины
      const x0 = p.x + .6, x1 = p.x + 4.2, z0 = near, z1 = near + p.side * 9;
      strip('paving', [gate, V(gate.x, 0, door.z), door], 1.6, .05);
      const cz = (z0 + z1) / 2 + p.side * 1.5;
      for (const [dx, dz] of [[-1.7, -2.6], [1.7, -2.6], [-1.7, 2.6], [1.7, 2.6]]) ap.box('post', .14, 2.6, .14, (x0 + x1) / 2 + dx, 1.3, cz + dz);
      ap.box('frame', 4.2, .14, 6, (x0 + x1) / 2, 2.66, cz);
    } else if (style === 3) { // изогнутая дорожка с фонариками
      const pts = bez(gate, V(gate.x - p.side * 0 - 5, 0, (gate.z + door.z) / 2), door);
      strip('paving', pts, 1.3, .05);
      for (let i = 2; i < pts.length - 1; i += 4) for (const sgn of [-1, 1]) {
        const d = pts[i + 1].clone().sub(pts[i]).normalize(), c = pts[i].clone().add(V(-d.z, 0, d.x).multiplyScalar(sgn * 1.05));
        bollards.push(c);
      }
    } else if (style === 4) { // деревянный настил
      const pts = [gate, mid, door]; strip('deck', pts, 1.3, .12);
    } else { // дорожка и цветники по бокам
      const pts = [gate, V(gate.x, 0, door.z - p.side * 1.2), V(door.x, 0, door.z - p.side * 1.2), door]; strip('paving', pts, 1.5, .05);
      for (const sgn of [-1, 1]) {
        const bx = gate.x + sgn * 1.55, z0 = near + p.side * 1, z1 = door.z - p.side * 2.2, len = Math.abs(z1 - z0);
        ap.box('soil', .9, .1, len, bx, .05, (z0 + z1) / 2); keep.push({ box: new THREE.Box3(V(bx - .6, -1, Math.min(z0, z1)), V(bx + .6, 2, Math.max(z0, z1))) });
        for (let k = 0; k < len * 9; k++) flowers.push([bx + (r0() - .5) * .75, z0 + (z1 - z0) * r0()]);
      }
    }
  }
  houses.forEach((h, i) => approach(h, (SITE.approaches || [0, 1, 2, 3, 4, 5])[i % 6]));
  for (const b of bollards) { ap.box('post', .12, .7, .12, b.x, .35, b.z); ap.box('glow', .16, .1, .16, b.x, .74, b.z); }
  for (let x = -135; x <= 135; x += 22) for (const sd of [1, -1]) ap.box('glow', .5, .06, .16, x + (sd > 0 ? 0 : 11), 5.08, sd * (ROAD / 2 + 1.1) - sd * .6);
  ap.build(world);
  if (flowers.length) {
    const fm = new THREE.MeshStandardMaterial({ roughness: .7 }), fi = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08, 1), fm, flowers.length);
    const fc = [0xe8a0b8, 0xf4f0e8, 0xb48ad8, 0xf0c64a, 0xd8507a], dm = new THREE.Object3D(), cl = new THREE.Color();
    flowers.forEach((f, i) => { dm.position.set(f[0], .2 + r0() * .15, f[1]); dm.scale.setScalar(.7 + r0() * .8); dm.updateMatrix(); fi.setMatrixAt(i, dm.matrix); fi.setColorAt(i, cl.set(fc[i % fc.length])); });
    world.add(fi);
  }

  /* ---------- трава: пучки травинок с ветром (только на участках) ---------- */
  const wind = { value: 0 };
  {
    const r = rng(42), pos = [], col = [], nor = [];
    for (let b = 0; b < 14; b++) {
      const a = r() * Math.PI * 2, ox = Math.cos(a) * r() * .22, oz = Math.sin(a) * r() * .22, hgt = .1 + r() * .16, w = .012 + r() * .012, lean = (r() - .5) * .12;
      const dx = Math.cos(a + 1.57) * w, dz = Math.sin(a + 1.57) * w;
      pos.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox + Math.cos(a) * lean, hgt, oz + Math.sin(a) * lean);
      const t = .85 + r() * .3; col.push(.2 * t, .3 * t, .1 * t, .2 * t, .3 * t, .1 * t, .46 * t, .6 * t, .24 * t);
      for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 });
    gm.onBeforeCompile = sh => {
      sh.uniforms.uTime = wind;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0., 0., 0., 1.);
        float hh = position.y * position.y * 14.;
        transformed.x += sin(uTime * 1.7 + wp.x * .35 + wp.z * .21) * .07 * hh;
        transformed.z += cos(uTime * 1.3 + wp.z * .3 + wp.x * .1) * .05 * hh;`);
    };
    const inKeep = (x, z) => keep.some(k => {
      if (k.box) return x > k.box.min.x && x < k.box.max.x && z > k.box.min.z && z < k.box.max.z;
      for (let i = 0; i < k.path.length - 1; i++) {
        const a = k.path[i], b = k.path[i + 1], abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
        if (Math.hypot(x - a.x - abx * t, z - a.z - abz * t) < k.w / 2) return true;
      }
      return false;
    });
    const spots = [], per = LOW ? .9 : MOBILE ? .45 : .2;
    for (const p of plots) {
      const near = p.side * (ROAD / 2 + 2.2), far = p.side * (ROAD / 2 + 1.6 + PD - .8), z0 = Math.min(near, far), z1 = Math.max(near, far);
      const main = Math.abs(p.x) <= 30, n = Math.round((PW - 1.5) * (z1 - z0) / (main ? per : per * 2.5));
      for (let i = 0; i < n; i++) {
        const x = p.x - PW / 2 + .8 + r0() * (PW - 1.6), z = z0 + r0() * (z1 - z0);
        if (x > p.x + .4 && x < p.x + 4.4 && Math.abs(z - near) < 9.4) continue; // въезд
        if (!inKeep(x, z)) spots.push([x, z]);
      }
    }
    const gi = new THREE.InstancedMesh(bg, gm, spots.length), dm = new THREE.Object3D(), cl = new THREE.Color();
    spots.forEach((sp, i) => { dm.position.set(sp[0], .02, sp[1]); dm.rotation.set(0, r0() * 6.3, 0); dm.scale.setScalar(.8 + r0() * .6); dm.updateMatrix(); gi.setMatrixAt(i, dm.matrix); gi.setColorAt(i, cl.setHSL(.24 + r0() * .05, .5, .5 + r0() * .2)); });
    gi.receiveShadow = true; world.add(gi);
  }

  await step(.7);

  /* ---------- деревья: «пучки» фотолиствы (собраны из атласов Poly Haven) ---------- */
  const leafT = TL.load(A + 'leaf_cluster.png'), firT = TL.load(A + 'fir_cluster.png');
  [leafT, firT].forEach(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; });
  await new Promise(res => { if (assetsDone) res(); else onAssets = res; });
  // крона из карточек: нормали смотрят от центра кроны — объём без резких граней
  function cards(n, seed, place) {
    const r = rng(seed), pos = [], nor = [], uv = [], col = [];
    for (let i = 0; i < n; i++) {
      const c = place(r, i), sz = c.s, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rx, c.ry, c.rz));
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      const shade = c.l;
      for (const [x, y] of corners) {
        const v = new THREE.Vector3(x * sz / 2, y * sz / 2, 0).applyQuaternion(q).add(c.p);
        pos.push(v.x, v.y, v.z);
        const nn = v.clone().sub(c.o).normalize(); nor.push(nn.x, nn.y, nn.z);
        uv.push((x + 1) / 2, (y + 1) / 2); col.push(shade, shade, shade);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  const decid = cards(MOBILE ? 70 : 110, 3, (r) => {
    const o = V(0, 5.6, 0), t = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), rr = .55 + .45 * Math.cbrt(r());
    const d = V(Math.sin(ph) * Math.cos(t), Math.cos(ph) * .85, Math.sin(ph) * Math.sin(t));
    return { o, p: o.clone().add(d.clone().multiply(V(2.9, 2.5, 2.9)).multiplyScalar(rr)), s: 1.9 + r() * .9, rx: r() * 6.3, ry: r() * 6.3, rz: r() * 6.3, l: .55 + .45 * (d.y * .5 + .5) * rr };
  });
  const conif = cards(MOBILE ? 60 : 90, 5, (r, i) => {
    const h = r(), y = 1.4 + h * 9.5, rad = (1 - h) * 2.6 + .3, t = r() * Math.PI * 2, o = V(0, y + .8, 0);
    const p = V(Math.cos(t) * rad * (.6 + .4 * r()), y, Math.sin(t) * rad * (.6 + .4 * r()));
    return { o, p, s: 1.3 + (1 - h) * 1.2, rx: -1.25 + r() * .5, ry: -t + Math.PI / 2, rz: r() * .6 - .3, l: .5 + .5 * h };
  });
  const leafM = new THREE.MeshStandardMaterial({ map: leafT, alphaTest: .45, side: THREE.DoubleSide, roughness: .85, vertexColors: true });
  const firM = new THREE.MeshStandardMaterial({ map: firT, alphaTest: .4, side: THREE.DoubleSide, roughness: .9, vertexColors: true });
  // тёмная сердцевина закрывает просветы
  const coreD = new THREE.IcosahedronGeometry(2.2, 2); coreD.scale(1.05, .9, 1.05); coreD.translate(0, 5.5, 0);
  const coreC = new THREE.ConeGeometry(1.9, 9, 10); coreC.translate(0, 6.2, 0);
  const coreM = new THREE.MeshStandardMaterial({ color: 0x24361c, roughness: 1 });
  // лесополоса вокруг
  for (let i = 0; i < (MOBILE ? 320 : 600); i++) {
    const a = r0() * Math.PI * 2, rad = 150 + r0() * 160, x = Math.cos(a) * rad * 1.15, z = Math.sin(a) * rad * .8;
    trees.push([x, z, .9 + r0() * .7, r0() < .5]);
  }
  for (let i = 0; i < 40; i++) { const x = -140 + i * 7 + r0() * 2; if (Math.abs(x + 105) > 8 && Math.abs(x - 105) > 8) trees.push([x, (r0() < .5 ? 1 : -1) * (ROAD / 2 + 1.6 + PD + 3 + r0() * 6), .9 + r0() * .4, r0() < .6]); }
  const bark = new THREE.MeshStandardMaterial({ color: 0x4e3f33, roughness: 1 });
  const trunkG = new THREE.CylinderGeometry(.14, .28, 5, 7); trunkG.translate(0, 2.5, 0);
  const dummy = new THREE.Object3D(), cc = new THREE.Color();
  const trunks = new THREE.InstancedMesh(trunkG, bark, trees.length); trunks.castShadow = true;
  trees.forEach((t, i) => { dummy.position.set(t[0], 0, t[1]); dummy.rotation.set(0, i, 0); dummy.scale.setScalar(t[2]); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
  world.add(trunks);
  [[decid, leafM, coreD, t => !t[3], [.22, .27]], [conif, firM, coreC, t => t[3], [.3, .34]]].forEach(([geo, m, core, f, hue]) => {
    const list = trees.filter(f), im = new THREE.InstancedMesh(geo, m, list.length), ic = new THREE.InstancedMesh(core, coreM, list.length);
    im.castShadow = ic.castShadow = true; im.receiveShadow = true;
    list.forEach((t, i) => {
      dummy.position.set(t[0], 0, t[1]); dummy.rotation.set(0, i * 1.7, 0); dummy.scale.set(t[2], t[2] * (.9 + (i % 5) * .05), t[2]); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); ic.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, cc.setHSL(0, 0, 1).lerp(new THREE.Color().setHSL(hue[0] + (i % 7) / 7 * (hue[1] - hue[0]), .35, .55), .25));
    });
    world.add(im, ic);
  });
  // кусты вдоль заборов участков
  const bushG = cards(26, 11, r => { const o = V(0, .7, 0), t = r() * 6.3, ph = Math.acos(r()), d = V(Math.sin(ph) * Math.cos(t), Math.cos(ph), Math.sin(ph) * Math.sin(t)); return { o, p: o.clone().add(d.multiply(V(1.1, .8, 1.1))), s: 1 + r() * .5, rx: r() * 6.3, ry: r() * 6.3, rz: r() * 6.3, l: .6 + .4 * d.y }; });
  const bushes = [];
  for (const p of plots) for (let k = 0; k < 7; k++) { const far = p.side * (ROAD / 2 + 1.6 + PD - 1.4); bushes.push([p.x - PW / 2 + 2 + k * (PW - 4) / 6 + (r0() - .5), far, .8 + r0() * .6]); }
  const bi = new THREE.InstancedMesh(bushG, leafM, bushes.length); bi.castShadow = true;
  bushes.forEach((b, i) => { dummy.position.set(b[0], 0, b[1]); dummy.rotation.set(0, i, 0); dummy.scale.setScalar(b[2]); dummy.updateMatrix(); bi.setMatrixAt(i, dummy.matrix); });
  world.add(bi);
  // фонари вдоль улицы
  const lampK = new Kit();
  for (let x = -135; x <= 135; x += 22) for (const s of [1, -1]) { const z = s * (ROAD / 2 + 1.1); lampK.box('post', .14, 5.2, .14, x + (s > 0 ? 0 : 11), 2.6, z); lampK.box('post', .9, .12, .22, x + (s > 0 ? 0 : 11), 5.15, z - s * .4); }
  const lampG = new THREE.Group(); world.add(lampG); lampK.build(lampG);

  /* ---------- облака вступления ---------- */
  const clouds = new THREE.Group(); scene.add(clouds);
  if (!SEEN) {
    const c = cnv(256, 256), x = c.getContext('2d'), r = rng(8);
    for (let i = 0; i < 46; i++) {
      const px = 128 + (r() - .5) * 130, py = 140 + (r() - .5) * 70, rad = 26 + r() * 52, g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    }
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace;
    const cr = rng(31);
    for (let i = 0; i < (MOBILE ? 140 : 220); i++) {
      const a = cr() * Math.PI * 2, rad = Math.sqrt(cr()) * 620, y = 200 + cr() * 90;
      const m = new THREE.SpriteMaterial({ map: ct, color: new THREE.Color().setHSL(.08, .35, .82 + (y - 210) / 110 * .16), transparent: true, depthWrite: false, fog: false, opacity: .95 });
      const sp = new THREE.Sprite(m); sp.position.set(Math.cos(a) * rad - 40, y, Math.sin(a) * rad + 60); sp.scale.setScalar(110 + cr() * 140); sp.userData.o = .95;
      clouds.add(sp);
    }
  }

  await step(.85);

  /* ---------- камера, управление, эффекты ---------- */
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .07; controls.enablePan = false; controls.enableZoom = false;
  canvas.style.touchAction = 'pan-y'; // вертикальный свайп листает страницу, горизонтальный крутит посёлок
  const PORTRAIT = vh() > vw();
  const AERIAL = { pos: PORTRAIT ? V(-80, 135, 165) : V(-70, 95, 125), target: V(0, 0, 0), min: 50, max: 260, polar: 1.2 };
  function setLimits(o) { controls.minDistance = o.min; controls.maxDistance = o.max; controls.maxPolarAngle = o.polar; }
  camera.position.set(-160, 230, 300); controls.target.copy(AERIAL.target); setLimits({ min: 10, max: 600, polar: 1.45 });
  controls.autoRotate = true; controls.autoRotateSpeed = .25;

  let composer = null;
  if (!MOBILE && !LOW) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const ao = new GTAOPass(scene, camera, vw(), vh()); ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.5, thickness: 1, scale: 1 }); ao.blendIntensity = .9;
      composer.addPass(ao); composer.addPass(new OutputPass());
    } catch (e) { composer = null; }
  }

  /* ---------- метки домов ---------- */
  const pinsBox = $('#pins');
  const pins = houses.map((h, i) => {
    const el = document.createElement('button'); el.className = 'pin'; el.type = 'button';
    el.innerHTML = `<b>${h.data.name}</b><span>от ${mln(h.data.price)}</span>`;
    el.setAttribute('aria-label', h.data.name + ', показать дом');
    el.onclick = e => { e.stopPropagation(); flyTo(i); };
    pinsBox.appendChild(el); return el;
  });
  const tmp = new THREE.Vector3();
  function updatePins() {
    houses.forEach((h, i) => {
      const el = pins[i];
      if (mode !== 'aerial') { el.classList.remove('on'); return; }
      tmp.set(0, h.g.userData.H + 1, 0); h.g.localToWorld(tmp); tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      el.classList.toggle('on', vis);
      el.style.transform = `translate(${(tmp.x * .5 + .5) * vw()}px,${(-tmp.y * .5 + .5) * vh()}px) translate(-50%,-100%)`;
    });
  }

  /* ---------- пролёт камеры ---------- */
  let mode = 'intro', fly = null, current = -1;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function startFly(pos, target, dur, done) {
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur, done, arc: camera.position.distanceTo(pos) * .12 };
    controls.enabled = false; controls.autoRotate = false;
  }
  function houseView(i) {
    const h = houses[i], c = new THREE.Vector3(); h.g.getWorldPosition(c);
    const target = c.clone().setY(h.g.userData.H * .35);
    const dist = Math.max(h.g.userData.W, h.g.userData.D) * (PORTRAIT ? 2.9 : 1.75) + 6;
    const front = V(0, 0, h.side > 0 ? -1 : 1), sideV = V(1, 0, 0);
    const pos = c.clone().add(front.multiplyScalar(dist * .82)).add(sideV.multiplyScalar(dist * .55)).setY(4 + dist * .22);
    return { pos, target, min: Math.max(h.g.userData.W, h.g.userData.D) * .9, max: 70, polar: 1.48 };
  }
  function flyTo(i) {
    if (fly) return;
    current = i; mode = 'flying'; $('#hint').classList.add('off'); closeCard();
    const v = houseView(i);
    startFly(v.pos, v.target, 2300, () => { mode = 'house'; setLimits(v); controls.autoRotate = true; controls.autoRotateSpeed = .6; openCard(i); });
  }
  function backToVillage() {
    if (fly) return;
    closeCard(); mode = 'flying';
    startFly(AERIAL.pos.clone(), AERIAL.target.clone(), 2100, () => { mode = 'aerial'; current = -1; setLimits(AERIAL); controls.autoRotate = true; controls.autoRotateSpeed = .25; $('#hint').classList.remove('off'); });
  }
  const card = $('#card');
  function openCard(i) {
    const d = houses[i].data;
    $('#c-name').textContent = d.name;
    const cl = $('#c-lead'); if (cl) cl.textContent = d.lead || '';
    $('#c-specs').innerHTML = d.specs.map(s => `<span>${s}</span>`).join('');
    $('#c-price').textContent = 'от ' + mln(d.price);
    $('#c-calc').dataset.i = i; $('#c-want').dataset.i = i;
    emit('house', { i });
    card.classList.add('on'); $('#back').classList.add('on');
  }
  function closeCard() { card.classList.remove('on'); $('#back').classList.remove('on'); emit('house', { i: -1 }); }
  // на узком экране карточка снизу: сдвигаем кадр вверх, чтобы дом был над ней
  let shift = 0, shiftTo = 0;
  function applyShift() { if (Math.abs(shift - shiftTo) < .001) return; shift += (shiftTo - shift) * .08; camera.setViewOffset(vw(), vh(), 0, vh() * shift, vw(), vh()); }
  $('#back').onclick = backToVillage;
  $('#c-prev').onclick = () => { if (!fly && current >= 0) flyTo((current + houses.length - 1) % houses.length); };
  $('#c-next').onclick = () => { if (!fly && current >= 0) flyTo((current + 1) % houses.length); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && mode === 'house') backToVillage(); });

  // нажатие по дому
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    { const rc = canvas.getBoundingClientRect(); ptr.set((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1); } ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    if (hit && (mode === 'aerial' || (mode === 'house' && hit.object.userData.i !== current))) flyTo(hit.object.userData.i);
  });
  canvas.addEventListener('pointermove', e => {
    if (MOBILE || mode !== 'aerial') return;
    { const rc = canvas.getBoundingClientRect(); ptr.set((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1); } ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    pins.forEach((p, i) => p.classList.toggle('hot', !!hit && hit.object.userData.i === i));
  });

  function fit() {
    camera.aspect = vw() / vh(); camera.updateProjectionMatrix(); renderer.setSize(vw(), vh(), false);
    if (composer) composer.setSize(vw(), vh());
  }
  new ResizeObserver(fit).observe(hero);
  // шапку не видно — не рисуем, страница листается легко
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(hero);

  /* ---------- рендеры домов для каталога (тем же движком) ---------- */
  function thumbs() {
    const out = [], tw = MOBILE ? 720 : 1080, th = Math.round(tw / 1.45), save = camera.position.clone();
    clouds.visible = false; lampG.visible = false; renderer.setSize(tw, th, false); camera.aspect = tw / th; camera.clearViewOffset(); camera.updateProjectionMatrix();
    houses.forEach((h, i) => {
      const c = new THREE.Vector3(); h.g.getWorldPosition(c);
      const size = Math.max(h.g.userData.W, h.g.userData.D), front = V(0, 0, h.side > 0 ? -1 : 1);
      camera.position.copy(c).add(front.multiplyScalar(size * 1.7 + 8)).add(V(size * .95, 0, 0)).setY(2.6 + size * .14);
      camera.lookAt(c.clone().setY(h.g.userData.H * .42));
      renderer.render(scene, camera);
      out[i] = canvas.toDataURL('image/jpeg', .86);
    });
    // сцены для секций сайта: против солнца над посёлком и улица на уровне глаз
    const sw = MOBILE ? 1280 : 1920, sh = Math.round(sw * 9 / 16), scenes = {};
    renderer.setSize(sw, sh, false); camera.aspect = sw / sh; camera.updateProjectionMatrix();
    const shot = (name, pos, look) => { camera.position.copy(pos); camera.lookAt(look); renderer.render(scene, camera); scenes[name] = canvas.toDataURL('image/jpeg', .84); };
    shot('wide', V(-95, 26, -72), V(15, 2, 32));
    shot('street', V(-62, 1.7, 1.2), V(40, 2.6, -1.5));
    out.scenes = scenes;
    clouds.visible = true; lampG.visible = true; camera.position.copy(save); fit();
    return out;
  }

  /* ---------- цикл ---------- */
  await step(.95);
  { const t = thumbs(); emit('thumbs', { images: t, scenes: t.scenes }); }
  await step(1);
  loader.classList.add('off');
  const ready = () => {
    mode = 'aerial'; setLimits(AERIAL); controls.autoRotate = true; $('#hint').classList.remove('off');
    clouds.children.forEach(c => c.userData.fade = true);
    try { localStorage.setItem('estate-intro', '1'); } catch (e) { }
    emit('phase', { phase: 'ready' });
  };
  if (SEEN) {
    camera.position.set(-110, 190, 250);
    emit('phase', { phase: 'short' });
    startFly(AERIAL.pos.clone(), AERIAL.target.clone(), 2600, ready);
  } else {
    // над облаками → сквозь них → посёлок
    camera.position.set(-260, 470, 520); controls.target.set(120, 330, -260); camera.lookAt(controls.target);
    emit('phase', { phase: 'intro' });
    startFly(AERIAL.pos.clone(), AERIAL.target.clone(), MOBILE ? 7000 : 8000, ready);
    fly.arc = 0; fly.intro = true;
    hero.addEventListener('pointerdown', () => { if (fly && fly.intro) fly.start -= fly.dur * .5; }, { once: true });
  }

  const camPos = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    wind.value = now / 1000;
    if (clouds.children.length) {
      camera.getWorldPosition(camPos);
      clouds.children.forEach(c => {
        if (c.userData.fade) c.userData.o = Math.max(0, c.userData.o - .012);
        const d = c.position.distanceTo(camPos); c.material.opacity = c.userData.o * Math.min(1, Math.max(0, (d - 25) / 90));
      });
      if (clouds.children.every(c => c.userData.o <= 0)) { clouds.children.forEach(c => c.material.dispose()); clouds.clear(); }
    }
    if (fly) {
      if (fly.intro) { const t = (now - fly.start) / fly.dur; if (t > .42 && !fly.mid) { fly.mid = true; emit('phase', { phase: 'clouds' }); } }
      const t = clamp((now - fly.start) / fly.dur, 0, 1), e = ease(t);
      camera.position.lerpVectors(fly.p0, fly.p1, e).y += Math.sin(Math.PI * e) * fly.arc;
      controls.target.lerpVectors(fly.t0, fly.t1, ease(clamp(t * 1.15, 0, 1)));
      camera.lookAt(controls.target);
      if (t >= 1) { const d = fly.done; fly = null; controls.enabled = true; d && d(); }
      shiftTo = PORTRAIT && mode !== 'aerial' && current >= 0 ? .2 : 0;
    } else controls.update();
    if (!fly) shiftTo = PORTRAIT && mode === 'house' ? .2 : 0;
    applyShift();
    updatePins();
    composer ? composer.render() : renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__village = { flyTo, backToVillage, get mode() { return mode; }, count: houses.length };
  emit('phase', { phase: 'api' });
})();
