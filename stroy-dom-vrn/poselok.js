/* =====================================================================
   Посёлок в 3D (демо): вид сверху, нажатие на дом — пролёт камеры к нему.
   Дома, фактуры, деревья — всё строится кодом, моделей и картинок нет.
   Данные домов — window.HOUSES (из каталога index.html).
   three.js грузится через importmap и динамический import(), чтобы
   страница открывалась и двойным щелчком (file://).
   ===================================================================== */
(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const loader = $('#loader'), bar = $('#loader i');
  const step = p => { bar.style.width = Math.round(p * 100) + '%'; return new Promise(r => setTimeout(r, 0)); };
  let THREE, OrbitControls, Sky, mergeGeometries, mergeVertices, EffectComposer, RenderPass, GTAOPass, OutputPass;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ Sky } = await import('three/addons/objects/Sky.js'));
    ({ mergeGeometries, mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js'));
    ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
    ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
    ({ GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js'));
    ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
  } catch (e) {
    $('#loader p').textContent = 'Не удалось загрузить 3D — проверьте интернет и обновите страницу.';
    return;
  }
  const HOUSES = window.HOUSES || [];
  const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
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
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .62;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .5, 3000);

  const sky = new Sky(); sky.scale.setScalar(5000);
  const su = sky.material.uniforms;
  su.turbidity.value = 5.5; su.rayleigh.value = 1.4; su.mieCoefficient.value = .004; su.mieDirectionalG.value = .82;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 24), THREE.MathUtils.degToRad(215));
  su.sunPosition.value.copy(sun);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(5000); sky2.material.uniforms.sunPosition.value.copy(sun);
  Object.keys(su).forEach(k => { if (k !== 'sunPosition') sky2.material.uniforms[k].value = su[k].value; });
  envScene.add(sky2);
  scene.environment = pmrem.fromScene(envScene, 0, .1, 5000).texture;
  scene.environmentIntensity = .75;
  scene.fog = new THREE.Fog(0xc6d3dc, 260, 900);

  const dir = new THREE.DirectionalLight(0xfff0dc, 3.1);
  dir.position.copy(sun).multiplyScalar(260);
  dir.castShadow = true;
  const SM = LOW ? 1024 : MOBILE ? 2048 : 4096; dir.shadow.mapSize.set(SM, SM);
  const sc = dir.shadow.camera; sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 50; sc.far = 600;
  dir.shadow.bias = -.0004; dir.shadow.normalBias = .04;
  scene.add(dir, dir.target);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5d6b45, .45));

  /* ---------- материалы: размер фактуры в метрах для UV ---------- */
  function tex(canvas, srgb = true) {
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const M = {};
  function mat(name, opts, size) { const m = opts.isMaterial ? opts : new THREE.MeshStandardMaterial(opts); m.userData.size = size || [1, 1]; M[name] = m; return m; }
  const tile = relief(256, 256, (u, v) => { const w = .5 + .5 * Math.cos(2 * Math.PI * (u - .5)); return .6 * w * (.7 + .3 * Math.sin(Math.PI * v)) + .4 * Math.pow(1 - v, .8); }, .1, .35, .7, .3);
  const prof = relief(128, 4, u => u < .28 ? 1 : u < .4 ? 1 - (u - .28) / .12 : u < .88 ? 0 : (u - .88) / .12, .03, .25, .78, .22);
  const tileC = tex(tile.color), tileN = tex(tile.normal, false), profC = tex(prof.color), profN = tex(prof.normal, false);
  mat('roofGraphite', { color: 0x4a4e55, map: tileC, normalMap: tileN, roughness: .5, metalness: .35 }, [.35, .35]);
  mat('roofBrown', { color: 0x6e4433, map: tileC, normalMap: tileN, roughness: .55, metalness: .25 }, [.35, .35]);
  mat('roofGreen', { color: 0x46584a, map: tileC, normalMap: tileN, roughness: .55, metalness: .25 }, [.35, .35]);
  mat('flatRoof', { color: 0x6c6a66, map: tex(plaster('#8a8781', 7)), roughness: .95 }, [2, 2]);
  mat('plasterWhite', { map: tex(plaster('#efe9df', 1)), roughness: .92 }, [1.2, 1.2]);
  mat('plasterWarm', { map: tex(plaster('#e2cfb3', 2)), roughness: .92 }, [1.2, 1.2]);
  mat('plasterGrey', { map: tex(plaster('#c9c6c0', 3)), roughness: .92 }, [1.2, 1.2]);
  mat('brickRed', { map: tex(bricks(['#a65a41', '#b26a4c', '#94503a', '#bb7758'], '#cbc3b5', 41)), roughness: .88 }, [1.04, .9]);
  mat('brickSand', { map: tex(bricks(['#d8c39e', '#cdb58e', '#e0cda8', '#c4ab83'], '#efe8da', 43)), roughness: .88 }, [1.04, .9]);
  mat('sidingLight', { map: tex(siding('#e4ddcf', 31)), roughness: .7 }, [1, 1]);
  mat('sidingDark', { map: tex(siding('#5a6066', 32)), roughness: .7 }, [1, 1]);
  mat('woodFacade', { map: tex(wood('#9a6b45', 5)), roughness: .75 }, [1.2, 1.2]);
  mat('plinth', { map: tex(stones(['#7f7b73', '#6d6962', '#8d8980', '#5f5b55'], '#44413c', 52)), roughness: .9 }, [1.2, 1.2]);
  mat('frame', { color: 0x30333a, roughness: .45, metalness: .2 });
  mat('trim', { color: 0xf1eee8, roughness: .6 });
  mat('glass', { color: 0x8fa6b8, metalness: 1, roughness: .05, envMapIntensity: 1.3 });
  mat('door', { map: tex(wood('#5b3a25', 8)), roughness: .6 }, [1, 2.1]);
  mat('deck', { map: tex(wood('#8f6440', 9)), roughness: .8 }, [1.4, 1.4]);
  mat('garage', { map: tex(garageDoor()), roughness: .5, metalness: .2 }, [2.6, 2.3]);
  mat('fence', { color: 0x4c5157, map: profC, normalMap: profN, roughness: .45, metalness: .45 }, [.25, .25]);
  mat('post', { color: 0x2d3034, roughness: .5, metalness: .4 });
  mat('paving', { map: tex(bricks(['#8f8b85', '#9a968f', '#86827c', '#a29e96'], '#6a6660', 61)), roughness: .85 }, [.6, .5]);
  mat('concrete', { map: tex(plaster('#b8b4ac', 11)), roughness: .9 }, [1.5, 1.5]);
  mat('chimney', M.brickRed.clone(), [1.04, .9]); M.chimney.userData.size = [1.04, .9];
  const lawnT = tex(lawn('#6b8a45', 77)), lawnT2 = tex(lawn('#76964c', 78));
  const asphaltT = tex(asphalt());

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
    g.userData = { W: W + (h.garage ? 4.2 : 0), D: D + (h.terrace ? 3.2 : 0), H: top + 4, depth: D };
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: lawnT, roughness: 1 }));
  lawnT.repeat.set(2400 / 6, 2400 / 6); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const roads = new Kit();
  M.asphalt = new THREE.MeshStandardMaterial({ map: asphaltT, roughness: .92 }); M.asphalt.userData.size = [6, 6];
  M.mark = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: .8 }); M.mark.userData.size = [1, 1];
  M.plot = new THREE.MeshStandardMaterial({ map: lawnT2, roughness: 1 }); M.plot.userData.size = [6, 6];
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

  await step(.7);

  /* ---------- деревья ---------- */
  function crownGeo(seed, conifer) {
    const r = rng(seed); let g;
    if (conifer) {
      const parts = []; for (let i = 0; i < 5; i++) { const c = new THREE.ConeGeometry(2.3 - i * .4, 2.4, 14, 2); c.deleteAttribute('uv'); c.translate(0, 2 + i * 1.25, 0); parts.push(c); }
      g = mergeVertices(mergeGeometries(parts), .01);
    } else {
      const parts = []; for (let i = 0; i < 7; i++) { const s = new THREE.IcosahedronGeometry(1.3 + r() * 1.1, 3); s.deleteAttribute('uv'); s.translate((r() - .5) * 2.8, 3.8 + r() * 2.4, (r() - .5) * 2.8); parts.push(s); }
      g = mergeVertices(mergeGeometries(parts), .01);
    }
    const pos = g.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const n = (Math.sin(pos.getX(i) * 3.1 + seed) + Math.sin(pos.getY(i) * 2.7) + Math.sin(pos.getZ(i) * 3.3)) * .07 + (Math.sin(pos.getX(i) * 9 + pos.getZ(i) * 7) * .04);
      pos.setXYZ(i, pos.getX(i) * (1 + n), pos.getY(i) * (1 + n * .5), pos.getZ(i) * (1 + n));
      const l = .75 + (pos.getY(i) - 3) * .05 + n; col.push(l, l, l);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  }
  // лесополоса вокруг
  for (let i = 0; i < (MOBILE ? 420 : 700); i++) {
    const a = r0() * Math.PI * 2, rad = 150 + r0() * 160, x = Math.cos(a) * rad * 1.15, z = Math.sin(a) * rad * .8;
    trees.push([x, z, .9 + r0() * .7, r0() < .5]);
  }
  for (let i = 0; i < 40; i++) { const x = -140 + i * 7 + r0() * 2; if (Math.abs(x + 105) > 8 && Math.abs(x - 105) > 8) trees.push([x, (r0() < .5 ? 1 : -1) * (ROAD / 2 + 1.6 + PD + 3 + r0() * 6), .9 + r0() * .4, r0() < .6]); }
  const leaf = new THREE.MeshStandardMaterial({ color: 0x55783a, roughness: .9, vertexColors: true });
  const needle = new THREE.MeshStandardMaterial({ color: 0x2f4f2e, roughness: .9, vertexColors: true });
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  const trunkG = new THREE.CylinderGeometry(.16, .26, 4, 6); trunkG.translate(0, 2, 0);
  const sets = [[crownGeo(3, false), leaf, t => !t[3]], [crownGeo(5, true), needle, t => t[3]]];
  const dummy = new THREE.Object3D(), cc = new THREE.Color();
  const trunks = new THREE.InstancedMesh(trunkG, bark, trees.length); trunks.castShadow = true;
  trees.forEach((t, i) => { dummy.position.set(t[0], 0, t[1]); dummy.rotation.set(0, i, 0); dummy.scale.setScalar(t[2]); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
  world.add(trunks);
  sets.forEach(([geo, m, f]) => {
    const list = trees.filter(f), im = new THREE.InstancedMesh(geo, m, list.length); im.castShadow = true; im.receiveShadow = true;
    list.forEach((t, i) => { dummy.position.set(t[0], 0, t[1]); dummy.rotation.set(0, i * 1.7, 0); dummy.scale.setScalar(t[2]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, cc.setHSL(.24 + (i % 7) * .012, .45, .42 + (i % 5) * .03)); });
    world.add(im);
  });
  // фонари вдоль улицы
  const lampK = new Kit();
  for (let x = -135; x <= 135; x += 22) for (const s of [1, -1]) { const z = s * (ROAD / 2 + 1.1); lampK.box('post', .14, 5.2, .14, x + (s > 0 ? 0 : 11), 2.6, z); lampK.box('post', .9, .12, .22, x + (s > 0 ? 0 : 11), 5.15, z - s * .4); }
  lampK.build(world);

  await step(.85);

  /* ---------- камера, управление, эффекты ---------- */
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .07; controls.enablePan = false;
  const PORTRAIT = innerHeight > innerWidth;
  const AERIAL = { pos: PORTRAIT ? V(-80, 135, 165) : V(-70, 95, 125), target: V(0, 0, 0), min: 50, max: 260, polar: 1.2 };
  function setLimits(o) { controls.minDistance = o.min; controls.maxDistance = o.max; controls.maxPolarAngle = o.polar; }
  camera.position.set(-160, 230, 300); controls.target.copy(AERIAL.target); setLimits({ min: 10, max: 600, polar: 1.45 });
  controls.autoRotate = true; controls.autoRotateSpeed = .25;

  let composer = null;
  if (!MOBILE && !LOW) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const ao = new GTAOPass(scene, camera, innerWidth, innerHeight); ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.5, thickness: 1, scale: 1 }); ao.blendIntensity = .9;
      composer.addPass(ao); composer.addPass(new OutputPass());
    } catch (e) { composer = null; }
  }

  /* ---------- метки домов ---------- */
  const pinsBox = $('#pins');
  const pins = houses.map((h, i) => {
    const el = document.createElement('button'); el.className = 'pin'; el.type = 'button';
    el.innerHTML = `<b>${h.data.name}</b><span>от ${mln(h.data.price)}</span>`;
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
      el.style.transform = `translate(${(tmp.x * .5 + .5) * innerWidth}px,${(-tmp.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
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
    $('#c-specs').innerHTML = d.specs.map(s => `<span>${s}</span>`).join('');
    $('#c-price').textContent = 'от ' + mln(d.price);
    $('#c-calc').href = 'index.html#p' + i;
    $('#c-want').href = 'index.html#p' + i;
    card.classList.add('on'); $('#back').classList.add('on');
  }
  function closeCard() { card.classList.remove('on'); $('#back').classList.remove('on'); }
  // на узком экране карточка снизу: сдвигаем кадр вверх, чтобы дом был над ней
  let shift = 0, shiftTo = 0;
  function applyShift() { if (Math.abs(shift - shiftTo) < .001) return; shift += (shiftTo - shift) * .08; camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * shift, innerWidth, innerHeight); }
  $('#back').onclick = backToVillage;
  $('#c-prev').onclick = () => { if (!fly && current >= 0) flyTo((current + houses.length - 1) % houses.length); };
  $('#c-next').onclick = () => { if (!fly && current >= 0) flyTo((current + 1) % houses.length); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && mode === 'house') backToVillage(); });

  // нажатие по дому
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    ptr.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    if (hit && (mode === 'aerial' || (mode === 'house' && hit.object.userData.i !== current))) flyTo(hit.object.userData.i);
  });
  canvas.addEventListener('pointermove', e => {
    if (MOBILE || mode !== 'aerial') return;
    ptr.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    pins.forEach((p, i) => p.classList.toggle('hot', !!hit && hit.object.userData.i === i));
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
  });

  /* ---------- цикл ---------- */
  await step(1);
  loader.classList.add('off');
  startFly(AERIAL.pos.clone(), AERIAL.target.clone(), 3200, () => { mode = 'aerial'; setLimits(AERIAL); controls.autoRotate = true; $('#hint').classList.remove('off'); });
  const deep = /[?&]house=(\d+)/.exec(location.search);
  if (deep) { fly = null; camera.position.copy(AERIAL.pos); mode = 'aerial'; setLimits(AERIAL); flyTo(+deep[1] % houses.length); }

  function frame(now) {
    if (fly) {
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
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__village = { flyTo, backToVillage, get mode() { return mode; } };
})();
